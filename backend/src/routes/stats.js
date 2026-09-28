/**
 * Stats API route — overview KPIs for the dashboard.
 *
 * GET /api/stats — returns aggregate metrics across all deployments
 */

import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();

  /* Total deployments */
  const total = db.prepare('SELECT COUNT(*) AS c FROM deployments').get().c;

  /* Status breakdown */
  const statusBreakdown = db.prepare(`
    SELECT status, COUNT(*) AS count FROM deployments GROUP BY status
  `).all();

  const successCount = statusBreakdown.find(s => s.status === 'success')?.count || 0;
  const failedCount = statusBreakdown.find(s => s.status === 'failed')?.count || 0;
  const rolledBackCount = statusBreakdown.find(s => s.status === 'rolled_back')?.count || 0;

  const successRate = total > 0 ? Math.round((successCount / total) * 1000) / 10 : 0;

  /* Mean time to resolve */
  const mttrRow = db.prepare(`
    SELECT AVG(time_to_resolve_min) AS avg_ttr FROM build_failures WHERE time_to_resolve_min IS NOT NULL
  `).get();
  const mttr = mttrRow.avg_ttr ? Math.round(mttrRow.avg_ttr) : 0;

  /* Failures this week */
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const failuresThisWeek = db.prepare(`
    SELECT COUNT(*) AS c FROM deployments WHERE status != 'success' AND timestamp >= ?
  `).get(oneWeekAgo).c;

  /* Riskiest service (highest failure rate with >= 3 deploys) */
  const riskiestService = db.prepare(`
    SELECT service,
           COUNT(*) AS total,
           SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures,
           ROUND(CAST(SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100, 1) AS failure_rate
    FROM deployments
    GROUP BY service
    HAVING total >= 3
    ORDER BY failure_rate DESC
    LIMIT 1
  `).get();

  /* Deploys per service */
  const deploysPerService = db.prepare(`
    SELECT service, COUNT(*) AS total,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes,
           SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
    FROM deployments
    GROUP BY service
    ORDER BY total DESC
  `).all();

  /* Deploys per day (last 30 days) for chart */
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const deploysPerDay = db.prepare(`
    SELECT DATE(timestamp) AS date,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes,
           SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
    FROM deployments
    WHERE timestamp >= ?
    GROUP BY DATE(timestamp)
    ORDER BY date
  `).all(thirtyDaysAgo);

  /* Total incidents */
  const totalIncidents = db.prepare('SELECT COUNT(*) AS c FROM incidents').get().c;

  /* Incident severity breakdown */
  const incidentsBySeverity = db.prepare(`
    SELECT severity, COUNT(*) AS count FROM incidents GROUP BY severity
  `).all();

  /* Recent deployments */
  const recentDeploys = db.prepare(`
    SELECT * FROM deployments ORDER BY timestamp DESC LIMIT 5
  `).all();

  res.json({
    total_deployments: total,
    success_count: successCount,
    failed_count: failedCount,
    rolled_back_count: rolledBackCount,
    success_rate: successRate,
    mttr,
    failures_this_week: failuresThisWeek,
    riskiest_service: riskiestService || null,
    deploys_per_service: deploysPerService,
    deploys_per_day: deploysPerDay,
    total_incidents: totalIncidents,
    incidents_by_severity: incidentsBySeverity,
    recent_deploys: recentDeploys,
  });
}));

export default router;
