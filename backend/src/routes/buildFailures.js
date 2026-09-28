/**
 * Build Failures API routes.
 *
 * POST /api/build-failures   — record a build failure linked to a deployment
 * GET  /api/build-failures   — list all build failures
 *
 * Each failure is retained in Hindsight so the agent can answer questions like
 * "Why did checkout fail last week?" with actual error context.
 */

import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { validateBuildFailure } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { recomputePatterns } from '../services/patternLearner.js';
import { retain, buildFailureMemory } from '../services/hindsightService.js';

const router = Router();

/* POST — record a new build failure */
router.post('/', validateBuildFailure, asyncHandler(async (req, res) => {
  const db = getDb();
  const { deployment_id, stage, error_message, root_cause, fix_applied, time_to_resolve_min } = req.body;

  /* Verify the deployment exists */
  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deployment_id);
  if (!deployment) {
    return res.status(404).json({ error: `Deployment #${deployment_id} not found` });
  }

  const result = db.prepare(`
    INSERT INTO build_failures (deployment_id, stage, error_message, root_cause, fix_applied, time_to_resolve_min)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(deployment_id, stage, error_message, root_cause || null, fix_applied || null, time_to_resolve_min || null);

  recomputePatterns();

  const failure = db.prepare('SELECT * FROM build_failures WHERE id = ?').get(result.lastInsertRowid);

  /* Retain failure memory in Hindsight (non-blocking) */
  retain(buildFailureMemory(failure, deployment)).catch(() => {});

  res.status(201).json({ message: 'Build failure recorded', failure });
}));

/* GET — list all build failures with optional deployment_id filter */
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { deployment_id, limit = 50 } = req.query;

  let sql = `
    SELECT bf.*, d.service, d.version, d.timestamp AS deploy_timestamp, d.change_type
    FROM build_failures bf
    JOIN deployments d ON d.id = bf.deployment_id
  `;
  const params = [];

  if (deployment_id) {
    sql += ' WHERE bf.deployment_id = ?';
    params.push(Number(deployment_id));
  }

  sql += ' ORDER BY d.timestamp DESC LIMIT ?';
  params.push(Number(limit));

  const failures = db.prepare(sql).all(...params);
  res.json({ failures });
}));

export default router;
