/**
 * Risk Scorer — transparent, breakdown-style risk assessment.
 *
 * Computes a 0-100 risk score from six weighted factors:
 *   1. Historical failure rate (service + change_type)  — weight 25%
 *   2. Change size                                       — weight 20%
 *   3. Time-of-week risk                                 — weight 15%
 *   4. Recent failure streak                              — weight 15%
 *   5. Downstream dependency count                        — weight 15%
 *   6. Matching learned patterns                          — weight 10%
 *
 * Each factor is scored 0-100 independently, then the weighted sum
 * produces the final score. Full breakdown is returned for transparency.
 */

import { getDb } from '../db/schema.js';

/* Service dependency map — which services are affected when one fails */
const SERVICE_DEPENDENCIES = {
  gateway:       ['auth', 'payments', 'checkout'],
  checkout:      ['payments', 'inventory'],
  payments:      ['notifications'],
  inventory:     ['notifications'],
  auth:          [],
  notifications: [],
};

/* Factor weights (must sum to 100) */
const WEIGHTS = {
  historical_rate:  25,
  change_size:      20,
  time_of_week:     15,
  failure_streak:   15,
  downstream_deps:  15,
  pattern_match:    10,
};

/**
 * Computes a full risk assessment for a proposed change.
 *
 * @param {Object} change — { service, change_type, lines_changed, files_changed, author, timestamp }
 * @returns {Object} { risk_score, risk_level, factors, recommendations, matchingPatterns }
 */
export function computeRisk(change) {
  const db = getDb();
  const factors = [];

  /* --- Factor 1: Historical failure rate for this service + change_type --- */
  const histRate = computeHistoricalRate(db, change);
  factors.push(histRate);

  /* --- Factor 2: Change size risk --- */
  const sizeRisk = computeSizeRisk(change);
  factors.push(sizeRisk);

  /* --- Factor 3: Time-of-week risk --- */
  const timeRisk = computeTimeRisk(change);
  factors.push(timeRisk);

  /* --- Factor 4: Recent failure streak --- */
  const streak = computeStreakRisk(db, change);
  factors.push(streak);

  /* --- Factor 5: Downstream dependencies --- */
  const depsRisk = computeDependencyRisk(change);
  factors.push(depsRisk);

  /* --- Factor 6: Matching learned patterns --- */
  const patternResult = computePatternRisk(db, change);
  factors.push(patternResult.factor);

  /* Compute weighted score */
  let rawScore = 0;
  for (const f of factors) {
    rawScore += (f.score * f.weight) / 100;
  }
  const risk_score = Math.min(100, Math.max(0, Math.round(rawScore)));

  /* Determine level */
  let risk_level;
  if (risk_score >= 70) risk_level = 'High';
  else if (risk_score >= 40) risk_level = 'Medium';
  else risk_level = 'Low';

  /* Generate recommendations based on factors */
  const recommendations = generateRecommendations(change, factors, risk_level);

  return {
    risk_score,
    risk_level,
    factors,
    recommendations,
    matchingPatterns: patternResult.patterns,
  };
}

/* ================================================================== */
/*  Individual factor computations                                     */
/* ================================================================== */

function computeHistoricalRate(db, change) {
  const row = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
    FROM deployments
    WHERE service = ? AND change_type = ?
  `).get(change.service, change.change_type);

  const total = row.total || 0;
  const failures = row.failures || 0;
  const rate = total > 0 ? failures / total : 0;

  /* Score: directly map failure rate to 0-100 */
  const score = Math.round(rate * 100);

  return {
    name: 'Historical Failure Rate',
    weight: WEIGHTS.historical_rate,
    score,
    detail: total > 0
      ? `${change.change_type} changes to ${change.service}: ${failures}/${total} failed (${(rate * 100).toFixed(0)}%)`
      : `No prior ${change.change_type} deploys to ${change.service} — unknown risk`,
  };
}

function computeSizeRisk(change) {
  const lines = change.lines_changed || 0;

  let score;
  if (lines === 0) score = 10;       // unknown — slight risk
  else if (lines <= 50) score = 5;    // tiny change
  else if (lines <= 150) score = 15;  // small
  else if (lines <= 300) score = 35;  // medium
  else if (lines <= 500) score = 55;  // large
  else if (lines <= 1000) score = 75; // very large
  else score = 95;                     // massive

  return {
    name: 'Change Size',
    weight: WEIGHTS.change_size,
    score,
    detail: lines > 0
      ? `${lines} lines changed — ${score >= 55 ? 'large changes fail more often' : 'manageable scope'}`
      : 'Change size unknown — assuming moderate risk',
  };
}

function computeTimeRisk(change) {
  const timestamp = change.timestamp ? new Date(change.timestamp) : new Date();
  const day = timestamp.getDay();   // 0=Sun, 5=Fri, 6=Sat
  const hour = timestamp.getHours();

  let score = 10; // baseline

  /* Friday afternoon/evening — peak risk */
  if (day === 5) {
    score += 40;
    if (hour >= 14) score += 20; // Friday afternoon
  }

  /* Weekend deploys */
  if (day === 0 || day === 6) score += 25;

  /* Late night (10pm-6am) */
  if (hour >= 22 || hour < 6) score += 15;

  /* Thursday afternoon */
  if (day === 4 && hour >= 16) score += 10;

  score = Math.min(100, score);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return {
    name: 'Time-of-Week Risk',
    weight: WEIGHTS.time_of_week,
    score,
    detail: `${dayNames[day]} at ${hour}:00 — ${score >= 40 ? 'historically risky window' : 'normal deployment window'}`,
  };
}

function computeStreakRisk(db, change) {
  const recent = db.prepare(`
    SELECT status FROM deployments
    WHERE service = ?
    ORDER BY timestamp DESC
    LIMIT 5
  `).all(change.service);

  let streak = 0;
  for (const d of recent) {
    if (d.status !== 'success') streak++;
    else break;
  }

  const score = Math.min(100, streak * 30); // 30 points per consecutive failure

  return {
    name: 'Recent Failure Streak',
    weight: WEIGHTS.failure_streak,
    score,
    detail: streak > 0
      ? `${change.service} has ${streak} consecutive recent failure(s)`
      : `${change.service} — last deploy was successful`,
  };
}

function computeDependencyRisk(change) {
  const deps = SERVICE_DEPENDENCIES[change.service] || [];
  const depCount = deps.length;

  /* Also count services that depend ON this service (blast radius) */
  let reverseDeps = 0;
  for (const [svc, svcDeps] of Object.entries(SERVICE_DEPENDENCIES)) {
    if (svcDeps.includes(change.service)) reverseDeps++;
  }

  const totalImpact = depCount + reverseDeps;
  const score = Math.min(100, totalImpact * 20); // 20 points per affected service

  return {
    name: 'Downstream Dependencies',
    weight: WEIGHTS.downstream_deps,
    score,
    detail: totalImpact > 0
      ? `${change.service} affects ${depCount} downstream + ${reverseDeps} upstream services (blast radius: ${totalImpact})`
      : `${change.service} — isolated service with minimal blast radius`,
  };
}

function computePatternRisk(db, change) {
  const patterns = db.prepare('SELECT * FROM learned_patterns').all();

  /* Find patterns that match this change */
  const matching = patterns.filter(p => {
    const desc = p.pattern_description.toLowerCase();
    const matchesService = desc.includes(change.service);
    const matchesType = !p.change_type || p.change_type === change.change_type;
    const matchesGeneral = desc.includes(change.change_type);
    return (matchesService && matchesType) || (matchesService && matchesGeneral) || (matchesGeneral && matchesType);
  });

  /* Score based on max risk multiplier of matching patterns */
  let maxMultiplier = 1.0;
  for (const p of matching) {
    if (p.risk_multiplier > maxMultiplier) maxMultiplier = p.risk_multiplier;
  }

  const score = matching.length > 0
    ? Math.min(100, Math.round((maxMultiplier - 1) * 100))
    : 0;

  return {
    factor: {
      name: 'Pattern Matches',
      weight: WEIGHTS.pattern_match,
      score,
      detail: matching.length > 0
        ? `${matching.length} learned pattern(s) match — max risk multiplier ×${maxMultiplier}`
        : 'No learned patterns match this change',
    },
    patterns: matching,
  };
}

/* ================================================================== */
/*  Recommendation generator                                           */
/* ================================================================== */

function generateRecommendations(change, factors, riskLevel) {
  const recs = [];

  /* Always recommend based on risk level */
  if (riskLevel === 'High') {
    recs.push('Consider splitting this into smaller, incremental changes');
    recs.push('Ensure a rollback plan is documented and tested');
  }

  /* Change-type-specific recommendations */
  if (change.change_type === 'db_migration') {
    recs.push('Run the migration in dry-run mode first');
    recs.push('Ensure backward-compatible schema changes');
    recs.push('Have a rollback migration ready');
  }

  if (change.change_type === 'config') {
    recs.push('Use feature flags for gradual rollout');
    recs.push('Validate config changes in staging before production');
  }

  if (change.change_type === 'infra') {
    recs.push('Run infrastructure changes through a canary environment first');
  }

  /* Size-based */
  const sizeFactor = factors.find(f => f.name === 'Change Size');
  if (sizeFactor && sizeFactor.score >= 55) {
    recs.push('Large change — deploy during low-traffic hours with monitoring');
  }

  /* Time-based */
  const timeFactor = factors.find(f => f.name === 'Time-of-Week Risk');
  if (timeFactor && timeFactor.score >= 40) {
    recs.push('Consider deploying earlier in the week (Tue-Thu morning)');
  }

  /* Streak-based */
  const streakFactor = factors.find(f => f.name === 'Recent Failure Streak');
  if (streakFactor && streakFactor.score >= 30) {
    recs.push('This service has recent failures — do a thorough pre-deploy review');
  }

  /* Dependency-based */
  const depFactor = factors.find(f => f.name === 'Downstream Dependencies');
  if (depFactor && depFactor.score >= 40) {
    recs.push('High blast radius — use canary deploys and monitor downstream services');
  }

  /* Deduplicate and limit */
  return [...new Set(recs)].slice(0, 5);
}

/**
 * Exports the service dependency map for the impact graph endpoint.
 */
export { SERVICE_DEPENDENCIES };
