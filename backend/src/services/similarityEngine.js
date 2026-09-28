/**
 * Similarity Engine — finds the most similar past deployments/incidents
 * to a proposed change.
 *
 * Similarity is computed as a weighted combination of:
 *   - Same service:      40 points
 *   - Same change_type:  25 points
 *   - Size closeness:    20 points (inverse distance in lines_changed)
 *   - Same day of week:  15 points
 */

import { getDb } from '../db/schema.js';

/**
 * Finds the N most similar past deployments to a proposed change.
 *
 * @param {Object} change    — { service, change_type, lines_changed, timestamp }
 * @param {number} limit     — max results (default 5)
 * @returns {Array} ranked list of similar deployments with similarity scores
 */
export function findSimilarDeployments(change, limit = 5) {
  const db = getDb();

  /* Pull all past deployments (or limit to last 200 for perf) */
  const deployments = db.prepare(`
    SELECT d.*,
           i.summary AS incident_summary,
           i.severity AS incident_severity,
           bf.error_message AS failure_message
    FROM deployments d
    LEFT JOIN incidents i ON i.deployment_id = d.id
    LEFT JOIN build_failures bf ON bf.deployment_id = d.id
    ORDER BY d.timestamp DESC
    LIMIT 200
  `).all();

  if (deployments.length === 0) return [];

  const proposedDay = change.timestamp
    ? new Date(change.timestamp).getDay()
    : new Date().getDay();

  const proposedSize = change.lines_changed || 0;

  /* Score each past deployment */
  const scored = deployments.map(dep => {
    let score = 0;

    /* Same service — strongest signal */
    if (dep.service === change.service) {
      score += 40;
    }

    /* Same change type */
    if (dep.change_type === change.change_type) {
      score += 25;
    }

    /* Size similarity (inverse distance, normalized to 0-20) */
    const sizeDiff = Math.abs((dep.lines_changed || 0) - proposedSize);
    const sizeScore = Math.max(0, 20 - (sizeDiff / 50)); // lose 1 point per 50 lines diff
    score += sizeScore;

    /* Same day of week */
    const depDay = new Date(dep.timestamp).getDay();
    if (depDay === proposedDay) {
      score += 15;
    }

    return { ...dep, similarity_score: Math.round(score * 10) / 10 };
  });

  /* Sort by similarity (desc) and return top N */
  scored.sort((a, b) => b.similarity_score - a.similarity_score);
  return scored.slice(0, limit);
}

/**
 * Finds the N most similar past incidents (failures and incidents only).
 *
 * @param {Object} change — { service, change_type, lines_changed }
 * @param {number} limit  — max results (default 3)
 * @returns {Array} similar incidents with context
 */
export function findSimilarIncidents(change, limit = 3) {
  const db = getDb();

  /* Only include deployments that had failures or incidents */
  const rows = db.prepare(`
    SELECT d.*,
           i.summary AS incident_summary,
           i.severity AS incident_severity,
           i.downstream_services_affected,
           bf.stage AS failure_stage,
           bf.error_message AS failure_message,
           bf.root_cause
    FROM deployments d
    LEFT JOIN incidents i ON i.deployment_id = d.id
    LEFT JOIN build_failures bf ON bf.deployment_id = d.id
    WHERE d.status != 'success'
    ORDER BY d.timestamp DESC
    LIMIT 100
  `).all();

  if (rows.length === 0) return [];

  const proposedSize = change.lines_changed || 0;

  const scored = rows.map(row => {
    let score = 0;

    if (row.service === change.service) score += 40;
    if (row.change_type === change.change_type) score += 30;

    const sizeDiff = Math.abs((row.lines_changed || 0) - proposedSize);
    score += Math.max(0, 20 - (sizeDiff / 50));

    /* Boost score if there was an actual incident (not just a build failure) */
    if (row.incident_summary) score += 10;

    return { ...row, similarity_score: Math.round(score * 10) / 10 };
  });

  scored.sort((a, b) => b.similarity_score - a.similarity_score);

  /* Deduplicate by deployment_id (joins can produce multiple rows) */
  const seen = new Set();
  const unique = [];
  for (const item of scored) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
    if (unique.length >= limit) break;
  }

  return unique;
}
