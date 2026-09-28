/**
 * Impact Graph API route — service dependency and blast-radius analysis.
 *
 * GET /api/impact           — full service dependency graph with failure history
 * GET /api/impact/:service  — blast radius for a specific service
 */

import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { SERVICE_DEPENDENCIES } from '../services/riskScorer.js';

const router = Router();

/* GET /api/impact — full dependency graph with historical failure data */
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();

  /* Build node data for each service */
  const services = Object.keys(SERVICE_DEPENDENCIES);
  const nodes = [];

  for (const service of services) {
    const stats = db.prepare(`
      SELECT COUNT(*) AS total_deploys,
             SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
      FROM deployments WHERE service = ?
    `).get(service);

    const incidentCount = db.prepare(`
      SELECT COUNT(*) AS c FROM incidents i
      JOIN deployments d ON d.id = i.deployment_id
      WHERE d.service = ?
    `).get(service).c;

    nodes.push({
      id: service,
      total_deploys: stats.total_deploys,
      failures: stats.failures,
      failure_rate: stats.total_deploys > 0
        ? Math.round((stats.failures / stats.total_deploys) * 100)
        : 0,
      incident_count: incidentCount,
      dependencies: SERVICE_DEPENDENCIES[service] || [],
    });
  }

  /* Build edge data */
  const edges = [];
  for (const [source, targets] of Object.entries(SERVICE_DEPENDENCIES)) {
    for (const target of targets) {
      /* Count how many times this dependency path had cascading incidents */
      const cascadeCount = db.prepare(`
        SELECT COUNT(*) AS c FROM incidents i
        JOIN deployments d ON d.id = i.deployment_id
        WHERE d.service = ? AND i.downstream_services_affected LIKE ?
      `).get(source, `%${target}%`).c;

      edges.push({
        source,
        target,
        cascade_count: cascadeCount,
      });
    }
  }

  res.json({ nodes, edges });
}));

/* GET /api/impact/:service — blast radius for one service */
router.get('/:service', asyncHandler(async (req, res) => {
  const db = getDb();
  const { service } = req.params;

  if (!SERVICE_DEPENDENCIES[service]) {
    return res.status(404).json({ error: `Unknown service: ${service}` });
  }

  /* Direct downstream dependencies */
  const downstream = SERVICE_DEPENDENCIES[service];

  /* Services that depend on this one (upstream/consumers) */
  const upstream = [];
  for (const [svc, deps] of Object.entries(SERVICE_DEPENDENCIES)) {
    if (deps.includes(service)) upstream.push(svc);
  }

  /* Historical incidents from this service */
  const incidents = db.prepare(`
    SELECT i.*, d.change_type, d.timestamp AS deploy_timestamp
    FROM incidents i
    JOIN deployments d ON d.id = i.deployment_id
    WHERE d.service = ?
    ORDER BY d.timestamp DESC
    LIMIT 10
  `).all(service);

  /* Cascade incidents that affected downstream services */
  const cascadeIncidents = db.prepare(`
    SELECT i.*, d.service AS source_service, d.timestamp AS deploy_timestamp
    FROM incidents i
    JOIN deployments d ON d.id = i.deployment_id
    WHERE i.downstream_services_affected LIKE ?
    ORDER BY d.timestamp DESC
    LIMIT 10
  `).all(`%${service}%`);

  res.json({
    service,
    downstream,
    upstream,
    blast_radius: downstream.length + upstream.length,
    incidents,
    cascade_incidents: cascadeIncidents,
  });
}));

export default router;
