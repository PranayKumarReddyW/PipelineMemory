/**
 * Incidents API routes.
 *
 * POST /api/incidents   — record a production incident
 * GET  /api/incidents   — list incidents
 *
 * Incidents are the most high-signal memories for PipelineMemory — they
 * capture what actually broke in production and who was affected. Retaining
 * them in Hindsight allows the risk predictor to surface semantically similar
 * past incidents even if the exact service or change type differs.
 */

import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { validateIncident } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { recomputePatterns } from '../services/patternLearner.js';
import { retain, buildIncidentMemory } from '../services/hindsightService.js';

const router = Router();

/* POST — record a new incident */
router.post('/', validateIncident, asyncHandler(async (req, res) => {
  const db = getDb();
  const { deployment_id, severity, summary, downstream_services_affected, resolved_at } = req.body;

  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deployment_id);
  if (!deployment) {
    return res.status(404).json({ error: `Deployment #${deployment_id} not found` });
  }

  const result = db.prepare(`
    INSERT INTO incidents (deployment_id, severity, summary, downstream_services_affected, resolved_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    deployment_id, severity, summary,
    JSON.stringify(downstream_services_affected || []),
    resolved_at || null,
  );

  recomputePatterns();

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(result.lastInsertRowid);

  /* Retain incident memory in Hindsight (non-blocking) */
  retain(buildIncidentMemory(incident, deployment)).catch(() => {});

  res.status(201).json({ message: 'Incident recorded', incident });
}));

/* GET — list incidents with optional filters */
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { severity, deployment_id, limit = 50 } = req.query;

  let sql = `
    SELECT i.*, d.service, d.version, d.timestamp AS deploy_timestamp, d.change_type, d.author
    FROM incidents i
    JOIN deployments d ON d.id = i.deployment_id
    WHERE 1=1
  `;
  const params = [];

  if (severity) {
    sql += ' AND i.severity = ?';
    params.push(severity);
  }
  if (deployment_id) {
    sql += ' AND i.deployment_id = ?';
    params.push(Number(deployment_id));
  }

  sql += ' ORDER BY d.timestamp DESC LIMIT ?';
  params.push(Number(limit));

  const incidents = db.prepare(sql).all(...params);
  res.json({ incidents });
}));

export default router;
