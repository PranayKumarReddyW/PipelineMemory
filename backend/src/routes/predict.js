/**
 * Predict API route — the core intelligence endpoint.
 *
 * POST /api/predict
 *
 * Memory layer (Hindsight-first):
 *   1. Builds a natural-language query describing the proposed change
 *   2. Uses Hindsight recall() to semantically retrieve similar past events
 *   3. Falls back to SQLite similarity engine if Hindsight is unavailable
 *
 * Response includes:
 *   - risk_score (0-100) and risk_level
 *   - factor breakdown (6 weighted dimensions)
 *   - similar incidents from Hindsight memory OR SQLite fallback
 *   - LLM/rule-based explanation citing real history
 *   - recommended actions
 *   - hindsight_powered flag indicating which memory backend was used
 */

import { Router } from 'express';
import { validatePrediction } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { computeRisk } from '../services/riskScorer.js';
import { findSimilarIncidents } from '../services/similarityEngine.js';
import { generateRiskExplanation, isLlmAvailable } from '../services/llmService.js';
import { recall, isHindsightAvailable } from '../services/hindsightService.js';
import { getDb } from '../db/schema.js';

const router = Router();

router.post('/', validatePrediction, asyncHandler(async (req, res) => {
  const change = {
    service: req.body.service,
    change_type: req.body.change_type,
    files_changed: req.body.files_changed || 0,
    lines_changed: req.body.lines_changed || 0,
    author: req.body.author || 'unknown',
    timestamp: req.body.timestamp || new Date().toISOString(),
  };

  /* ── 1. Risk score (always uses SQLite — fast, deterministic) ─── */
  const { risk_score, risk_level, factors, recommendations, matchingPatterns } = computeRisk(change);

  /* ── 2. Similar incidents: Hindsight semantic recall (preferred) ── */
  let similar_incidents = [];
  let hindsight_powered = false;

  if (isHindsightAvailable()) {
    /* Build a semantic query that describes the proposed change */
    const recallQuery = [
      `${change.change_type} change to ${change.service} service`,
      change.lines_changed > 0 ? `${change.lines_changed} lines changed` : '',
      change.author !== 'unknown' ? `deployed by ${change.author}` : '',
      `show me failures, incidents, and problems`,
    ].filter(Boolean).join(', ');

    const memories = await recall(recallQuery, 5);

    if (memories && memories.length > 0) {
      hindsight_powered = true;
      /* Parse recalled memories back into structured incident-like objects */
      similar_incidents = parseRecalledMemories(memories, change);
    }
  }

  /* Fallback: SQLite similarity engine if Hindsight unavailable or returned nothing */
  if (similar_incidents.length === 0) {
    const sqliteSimilar = findSimilarIncidents(change, 3);
    similar_incidents = sqliteSimilar.map(inc => ({
      deployment_id: inc.id,
      service: inc.service,
      change_type: inc.change_type,
      timestamp: inc.timestamp,
      status: inc.status,
      lines_changed: inc.lines_changed,
      incident_summary: inc.incident_summary || null,
      incident_severity: inc.incident_severity || null,
      failure_message: inc.failure_message || null,
      similarity_score: inc.similarity_score,
      source: 'sqlite',
    }));
  }

  /* ── 3. Explanation (LLM or rule-based) ─────────────────────────── */
  const explanation = await generateRiskExplanation({
    change,
    riskScore: risk_score,
    riskLevel: risk_level,
    factors,
    incidents: similar_incidents,
    patterns: matchingPatterns,
    recommendations,
  });

  res.json({
    risk_score,
    risk_level,
    factors,
    similar_incidents,
    explanation,
    recommendations,
    matching_patterns: matchingPatterns.map(p => ({
      description: p.pattern_description,
      risk_multiplier: p.risk_multiplier,
      evidence_count: p.evidence_count,
    })),
    hindsight_powered,
    llm_powered: isLlmAvailable(),
  });
}));

/**
 * Parse Hindsight recalled memory strings back into structured incident objects.
 * Hindsight returns raw memory strings — we extract the key facts from them.
 *
 * This is a best-effort parse; for demo/hackathon purposes the raw memory
 * strings are also included so the UI can display them directly.
 */
function parseRecalledMemories(memories, change) {
  const db = getDb();

  return memories.map((mem, idx) => {
    /* Try to extract deployment ID if present */
    const depMatch = mem.match(/(?:Deployment|deployment)\s*#?(\d+)/i);
    const deploymentId = depMatch ? Number(depMatch[1]) : null;

    /* Try to extract service name */
    const serviceMatch = mem.match(/to\s+(\w+)\s+service/i);
    const service = serviceMatch ? serviceMatch[1] : change.service;

    /* Try to extract change type */
    const typeMatch = mem.match(/(code|config|db_migration|dependency|infra)\s+change/i);
    const changeType = typeMatch ? typeMatch[1] : change.change_type;

    /* Determine status from memory content */
    let status = 'success';
    let severity = null;
    if (/failed|failure|error|incident|outage/i.test(mem)) {
      status = mem.includes('rolled back') ? 'rolled_back' : 'failed';
    }
    const sevMatch = mem.match(/severity:\s*(critical|high|medium|low)/i);
    if (sevMatch) severity = sevMatch[1].toLowerCase();

    /* Try to look up deployment record for richer data */
    let deployRecord = null;
    if (deploymentId) {
      deployRecord = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId);
    }

    return {
      deployment_id: deploymentId || `hindsight-${idx + 1}`,
      service: deployRecord?.service || service,
      change_type: deployRecord?.change_type || changeType,
      timestamp: deployRecord?.timestamp || null,
      status: deployRecord?.status || status,
      lines_changed: deployRecord?.lines_changed || 0,
      incident_summary: mem.length > 200 ? mem.slice(0, 200) + '…' : mem,
      incident_severity: severity,
      failure_message: null,
      similarity_score: Math.max(60, 95 - idx * 8), /* Hindsight returns ranked results */
      source: 'hindsight',
    };
  });
}

export default router;
