/**
 * Ask API route — natural-language chat with the pipeline agent.
 *
 * POST /api/ask  { question: string }
 *
 * Memory layer (Hindsight-first):
 *   1. Uses Hindsight reflect() — generates a grounded answer directly from
 *      the memory bank without needing to pass raw SQL rows to an LLM.
 *   2. Falls back to SQLite context + LLM/rule-based if Hindsight is unavailable.
 *
 * Hindsight's reflect() is the ideal operation here: it retrieves relevant
 * memories, synthesizes them, and returns a coherent answer — exactly what
 * a "pipeline memory agent" should do.
 */

import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { validateAsk } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { answerQuestion, isLlmAvailable, callLlm } from '../services/llmService.js';
import { reflect, recall, isHindsightAvailable, BANK_ID } from '../services/hindsightService.js';

const router = Router();

router.post('/', validateAsk, asyncHandler(async (req, res) => {
  const { question } = req.body;
  const db = getDb();

  let answer = null;
  let hindsight_powered = false;

  /* ── Strategy 1: Hindsight reflect() ─────────────────────────────────── */
  if (isHindsightAvailable()) {
    answer = await reflect(question);
    if (answer) {
      hindsight_powered = true;

      /* Augment with a quick stats footer so the answer is grounded */
      const stats = getQuickStats(db);
      answer = `${answer}\n\n---\n*Memory bank: \`${BANK_ID}\` · ${stats.total_deployments} deployments · ${stats.total_incidents} incidents · ${stats.patterns} learned patterns*`;
    }
  }

  /* ── Strategy 2: SQLite context + LLM/rule-based fallback ───────────── */
  if (!answer) {
    const deployments = db.prepare(`
      SELECT * FROM deployments ORDER BY timestamp DESC LIMIT 30
    `).all();

    const failures = db.prepare(`
      SELECT bf.*, d.service, d.timestamp AS deploy_timestamp
      FROM build_failures bf
      JOIN deployments d ON d.id = bf.deployment_id
      ORDER BY d.timestamp DESC LIMIT 20
    `).all();

    const incidents = db.prepare(`
      SELECT i.*, d.service, d.timestamp AS deploy_timestamp
      FROM incidents i
      JOIN deployments d ON d.id = i.deployment_id
      ORDER BY d.timestamp DESC LIMIT 20
    `).all();

    const patterns = db.prepare('SELECT * FROM learned_patterns ORDER BY risk_multiplier DESC').all();
    const stats = getQuickStats(db);

    answer = await answerQuestion(question, {
      deployments, failures, incidents, patterns, stats,
    });
  }

  /* ── Optional: Side-by-side comparison with a Stateless LLM ─────────── */
  let stateless_answer = null;
  if (req.body.compare) {
    if (isLlmAvailable()) {
      try {
        stateless_answer = await callLlm({
          system: 'You are a generic AI assistant without access to any internal repository, CI/CD history, deployment logs, or company database. Answer only with general generic advice.',
          userMessage: question,
          maxTokens: 300,
        });
      } catch {}
    }
    if (!stateless_answer) {
      stateless_answer = "As a generic AI without pipeline memory, I don't know your specific deployments, services, or error logs. Generally, deployments fail due to application bugs, incorrect configurations, network issues, or infrastructure capacity.";
    }
  }

  /* ── Response ──────────────────────────────────────────────────────── */
  const stats = getQuickStats(db);

  res.json({
    question,
    answer,
    stateless_answer,
    hindsight_powered,
    llm_powered: !hindsight_powered && isLlmAvailable(),
    context_size: {
      deployments: stats.total_deployments,
      failures: stats.total_failures,
      incidents: stats.total_incidents,
    },
  });
}));

function getQuickStats(db) {
  const total_deployments = db.prepare('SELECT COUNT(*) AS c FROM deployments').get().c;
  const total_failures = db.prepare("SELECT COUNT(*) AS c FROM deployments WHERE status != 'success'").get().c;
  const total_incidents = db.prepare('SELECT COUNT(*) AS c FROM incidents').get().c;
  const patterns = db.prepare('SELECT COUNT(*) AS c FROM learned_patterns').get().c;

  return { total_deployments, total_failures, total_incidents, patterns };
}

export default router;
