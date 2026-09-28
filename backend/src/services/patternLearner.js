/**
 * Pattern Learner — discovers recurring risk patterns from historical data.
 *
 * After each new event, this service queries the database to find
 * statistically significant correlations and stores them in the
 * learned_patterns table.
 *
 * Discovered pattern types:
 *   1. Service + change_type failure rates
 *   2. Day-of-week + change_type failure rates (e.g. "Friday DB migrations")
 *   3. Change-size failure correlations
 *   4. Cascade patterns (service A change → service B incident)
 *   5. Author-specific failure streaks
 */

import { getDb } from '../db/schema.js';

/* Minimum deployments needed before a pattern is considered significant */
const MIN_EVIDENCE = 3;
/* Minimum failure rate to flag as a pattern */
const MIN_FAILURE_RATE = 0.25;

/**
 * Runs all pattern discovery queries and upserts results into learned_patterns.
 * Call this after ingesting any new event.
 */
export function recomputePatterns() {
  const db = getDb();
  const now = new Date().toISOString();

  /* Clear existing patterns and recompute fresh */
  db.prepare('DELETE FROM learned_patterns').run();

  discoverServiceChangeTypePatterns(db, now);
  discoverDayOfWeekPatterns(db, now);
  discoverChangeSizePatterns(db, now);
  discoverCascadePatterns(db, now);
  discoverAuthorPatterns(db, now);
  discoverRecentStreakPatterns(db, now);

  const count = db.prepare('SELECT COUNT(*) AS c FROM learned_patterns').get().c;
  console.log(`[PatternLearner] Discovered ${count} patterns`);
  return count;
}

/* ================================================================== */
/*  Pattern discovery functions                                        */
/* ================================================================== */

/**
 * Pattern 1: "X changes to Y-service have a Z% failure rate"
 */
function discoverServiceChangeTypePatterns(db, now) {
  const rows = db.prepare(`
    SELECT service, change_type,
           COUNT(*) AS total,
           SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
    FROM deployments
    GROUP BY service, change_type
    HAVING total >= ?
  `).all(MIN_EVIDENCE);

  const insert = db.prepare(`
    INSERT INTO learned_patterns (pattern_description, change_type, risk_multiplier, evidence_count, last_updated)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    const rate = row.failures / row.total;
    if (rate >= MIN_FAILURE_RATE) {
      const pct = (rate * 100).toFixed(0);
      const desc = `${row.change_type} changes to ${row.service} have a ${pct}% failure rate`;
      const multiplier = Math.round((1 + rate) * 10) / 10; // 1.25 to 2.0
      insert.run(desc, row.change_type, multiplier, row.total, now);
    }
  }
}

/**
 * Pattern 2: "DB migrations on Friday have a X% failure rate"
 */
function discoverDayOfWeekPatterns(db, now) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const allDeploys = db.prepare(`
    SELECT timestamp, change_type, status FROM deployments
  `).all();

  /* Group by day + change_type */
  const buckets = {};
  for (const d of allDeploys) {
    const day = new Date(d.timestamp).getDay();
    const key = `${day}:${d.change_type}`;
    if (!buckets[key]) buckets[key] = { total: 0, failures: 0, day, change_type: d.change_type };
    buckets[key].total++;
    if (d.status !== 'success') buckets[key].failures++;
  }

  const insert = db.prepare(`
    INSERT INTO learned_patterns (pattern_description, change_type, risk_multiplier, evidence_count, last_updated)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const bucket of Object.values(buckets)) {
    if (bucket.total < MIN_EVIDENCE) continue;
    const rate = bucket.failures / bucket.total;
    if (rate >= MIN_FAILURE_RATE) {
      const pct = (rate * 100).toFixed(0);
      const dayName = dayNames[bucket.day];
      const desc = `${bucket.change_type} changes on ${dayName} have a ${pct}% failure rate`;
      const multiplier = Math.round((1 + rate) * 10) / 10;
      insert.run(desc, bucket.change_type, multiplier, bucket.total, now);
    }
  }
}

/**
 * Pattern 3: "Deploys with >500 lines changed fail X% more often"
 */
function discoverChangeSizePatterns(db, now) {
  const thresholds = [
    { label: '500', min: 500, max: Infinity },
    { label: '200', min: 200, max: 500 },
  ];

  const insert = db.prepare(`
    INSERT INTO learned_patterns (pattern_description, change_type, risk_multiplier, evidence_count, last_updated)
    VALUES (?, ?, ?, ?, ?)
  `);

  /* Compute baseline failure rate */
  const baseline = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
    FROM deployments
    WHERE lines_changed <= 100
  `).get();

  const baseRate = baseline.total > 0 ? baseline.failures / baseline.total : 0;

  for (const t of thresholds) {
    const row = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
      FROM deployments
      WHERE lines_changed > ? AND lines_changed <= ?
    `).get(t.min === 200 ? 200 : 500, t.max === Infinity ? 999999 : t.max);

    /* For >500 threshold */
    if (t.min === 500) {
      const bigRow = db.prepare(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
        FROM deployments
        WHERE lines_changed > 500
      `).get();

      if (bigRow.total >= MIN_EVIDENCE) {
        const rate = bigRow.failures / bigRow.total;
        if (rate > baseRate && rate >= MIN_FAILURE_RATE) {
          const multiplier = baseRate > 0 ? Math.round((rate / baseRate) * 10) / 10 : 2.0;
          const pct = (rate * 100).toFixed(0);
          const desc = `Deploys with >500 lines changed have a ${pct}% failure rate (${multiplier}× baseline)`;
          insert.run(desc, null, Math.min(multiplier, 3.0), bigRow.total, now);
        }
      }
    }
  }
}

/**
 * Pattern 4: "Config changes to X cascade into incidents on Y"
 */
function discoverCascadePatterns(db, now) {
  const rows = db.prepare(`
    SELECT d.service AS source_service,
           d.change_type,
           i.downstream_services_affected,
           COUNT(*) AS evidence
    FROM incidents i
    JOIN deployments d ON d.id = i.deployment_id
    WHERE i.downstream_services_affected != '[]'
    GROUP BY d.service, d.change_type, i.downstream_services_affected
    HAVING evidence >= 2
  `).all();

  const insert = db.prepare(`
    INSERT INTO learned_patterns (pattern_description, change_type, risk_multiplier, evidence_count, last_updated)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    let affected;
    try {
      affected = JSON.parse(row.downstream_services_affected);
    } catch {
      continue;
    }
    if (!Array.isArray(affected) || affected.length === 0) continue;

    const desc = `${row.change_type} changes to ${row.source_service} have caused incidents affecting ${affected.join(', ')}`;
    insert.run(desc, row.change_type, 1.8, row.evidence, now);
  }
}

/**
 * Pattern 5: "Author X has a higher failure rate on service Y"
 */
function discoverAuthorPatterns(db, now) {
  const rows = db.prepare(`
    SELECT author, service,
           COUNT(*) AS total,
           SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
    FROM deployments
    GROUP BY author, service
    HAVING total >= ?
  `).all(MIN_EVIDENCE);

  const insert = db.prepare(`
    INSERT INTO learned_patterns (pattern_description, change_type, risk_multiplier, evidence_count, last_updated)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    const rate = row.failures / row.total;
    if (rate >= 0.5 && row.total >= 3) {
      const pct = (rate * 100).toFixed(0);
      const desc = `${row.author}'s deployments to ${row.service} have a ${pct}% failure rate`;
      insert.run(desc, null, 1.5, row.total, now);
    }
  }
}

/**
 * Pattern 6: "Service X has had N consecutive failures recently"
 */
function discoverRecentStreakPatterns(db, now) {
  const services = db.prepare('SELECT DISTINCT service FROM deployments').all();

  const insert = db.prepare(`
    INSERT INTO learned_patterns (pattern_description, change_type, risk_multiplier, evidence_count, last_updated)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const { service } of services) {
    const recent = db.prepare(`
      SELECT status FROM deployments
      WHERE service = ?
      ORDER BY timestamp DESC
      LIMIT 5
    `).all(service);

    let streak = 0;
    for (const d of recent) {
      if (d.status !== 'success') streak++;
      else break;
    }

    if (streak >= 2) {
      const desc = `${service} has ${streak} consecutive recent failures — elevated risk`;
      insert.run(desc, null, 1.0 + (streak * 0.3), streak, now);
    }
  }
}

/**
 * Returns all currently discovered patterns.
 */
export function getPatterns() {
  const db = getDb();
  return db.prepare('SELECT * FROM learned_patterns ORDER BY risk_multiplier DESC').all();
}
