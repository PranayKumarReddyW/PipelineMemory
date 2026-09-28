/**
 * Deployments API routes.
 *
 * POST /api/deployments   — ingest a new deployment event
 * GET  /api/deployments   — list deployments (with optional filters)
 * GET  /api/deployments/:id — get a single deployment with linked events
 *
 * Every new deployment is retained in Hindsight as a natural-language memory,
 * enabling semantic search and Q&A over the full pipeline history.
 */

import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { validateDeployment } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { recomputePatterns } from '../services/patternLearner.js';
import { retain, buildDeploymentMemory } from '../services/hindsightService.js';

const router = Router();

/* ------------------------------------------------------------------ */
/*  POST /api/deployments — ingest a new deployment                    */
/* ------------------------------------------------------------------ */
router.post('/', validateDeployment, asyncHandler(async (req, res) => {
  const db = getDb();
  const {
    service, version, author, timestamp, environment,
    status, duration_sec, files_changed, lines_changed, change_type, notes,
  } = req.body;

  const result = db.prepare(`
    INSERT INTO deployments (service, version, author, timestamp, environment, status, duration_sec, files_changed, lines_changed, change_type, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    service, version, author, timestamp || new Date().toISOString(),
    environment || 'production', status,
    duration_sec || null, files_changed || 0, lines_changed || 0,
    change_type, notes || null,
  );

  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(result.lastInsertRowid);

  /* Re-learn patterns + retain in Hindsight (both non-blocking for response time) */
  recomputePatterns();
  retain(buildDeploymentMemory(deployment)).catch(() => {});

  res.status(201).json({
    message: 'Deployment recorded',
    deployment,
  });
}));

/* ------------------------------------------------------------------ */
/*  GET /api/deployments — list with optional filters                  */
/* ------------------------------------------------------------------ */
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { service, status, change_type, limit = 50, offset = 0 } = req.query;

  let sql = 'SELECT * FROM deployments WHERE 1=1';
  const params = [];

  if (service) {
    sql += ' AND service = ?';
    params.push(service);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (change_type) {
    sql += ' AND change_type = ?';
    params.push(change_type);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const deployments = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) AS count FROM deployments').get().count;

  res.json({ deployments, total });
}));

/* ------------------------------------------------------------------ */
/*  GET /api/deployments/:id — single deployment + linked data         */
/* ------------------------------------------------------------------ */
router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  const failures = db.prepare('SELECT * FROM build_failures WHERE deployment_id = ?').all(id);
  const incidents = db.prepare('SELECT * FROM incidents WHERE deployment_id = ?').all(id);
  const infraChanges = db.prepare('SELECT * FROM infra_changes WHERE linked_deployment_id = ?').all(id);

  res.json({ deployment, failures, incidents, infraChanges });
}));

export default router;
