/**
 * Seed script for PipelineMemory.
 *
 * Generates ~62 realistic deployments across 6 services over 90 days,
 * with carefully planted patterns that the pattern learner will discover:
 *
 *   1. Friday DB migrations have a ~40-50% failure rate
 *   2. Config changes to payments cascade into checkout incidents
 *   3. Deploys with >500 lines changed fail ~2× more often
 *   4. Gateway dependency updates cause build failures
 *   5. Auth is the most stable service
 *
 * Run: npm run seed (or node src/db/seed.js)
 */

import 'dotenv/config';
import { resetDatabase, getDb } from './schema.js';
import { recomputePatterns } from '../services/patternLearner.js';
import {
  bulkRetain, isHindsightAvailable,
  buildDeploymentMemory, buildFailureMemory,
  buildIncidentMemory, buildPatternMemory,
} from '../services/hindsightService.js';

/* ================================================================== */
/*  Deterministic PRNG for reproducible seed data                      */
/* ================================================================== */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */
const SERVICES = ['auth', 'payments', 'checkout', 'inventory', 'notifications', 'gateway'];
const CHANGE_TYPES = ['code', 'config', 'db_migration', 'dependency', 'infra'];
const AUTHORS = ['alice', 'bob', 'carol', 'dave', 'eve', 'frank'];
const ENVIRONMENTS = ['production', 'staging', 'production', 'production']; // weight toward prod

const NOW = new Date('2026-09-28T10:00:00+05:30');
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/* Error messages by stage */
const BUILD_ERRORS = {
  build: [
    'TypeScript compilation failed: Cannot find module \'@internal/payments-sdk\'',
    'Docker build failed: COPY failed — file not found in context',
    'npm ERR! peer dependency conflict: react@18.3 requires react-dom@^18.0',
    'Build timeout after 600s — possible circular dependency',
  ],
  test: [
    'FAIL src/handlers/payment.test.ts — Expected 200 but received 500',
    'Integration test timeout: Database connection pool exhausted',
    'Snapshot mismatch in CheckoutFlow component — 14 snapshots failed',
    'E2E test flaky: Element not found within 30s timeout',
  ],
  deploy: [
    'Kubernetes rollout failed: CrashLoopBackOff in pod payments-6f8b4-xz9kl',
    'Health check failed after 5 retries — port 3000 not responding',
    'Database migration failed: column "user_id" already exists',
    'Terraform apply error: Resource limit exceeded for RDS instances',
    'Helm release failed: values validation error in production overlay',
  ],
};

const ROOT_CAUSES = [
  'Missing environment variable in production config',
  'Database schema incompatible with previous version',
  'Race condition in connection pool initialization',
  'Stale Docker image cache from previous failed build',
  'Incorrect feature flag configuration',
  'Memory leak in event handler causing OOM',
  'SSL certificate expired on internal service mesh',
  'Incompatible Node.js version in production container',
];

const FIXES = [
  'Added missing env var to production secrets',
  'Rolled back migration and added backward-compatible column',
  'Increased connection pool timeout from 5s to 30s',
  'Cleared Docker layer cache and rebuilt from scratch',
  'Disabled feature flag and redeployed',
  'Fixed event listener cleanup in useEffect hook',
  'Renewed SSL cert and updated service mesh config',
  'Pinned Node.js to v20.9.0 in Dockerfile',
];

const INFRA_RESOURCES = [
  'RDS PostgreSQL cluster',
  'Redis ElastiCache',
  'API Gateway rate limits',
  'Kubernetes HPA config',
  'CloudFront distribution',
  'S3 bucket policy',
  'VPC security group',
  'ECS task definition',
];

/* ================================================================== */
/*  Deployment generator                                               */
/* ================================================================== */

function generateDeployments() {
  const deployments = [];

  /* Generate ~62 deployments spread over 90 days */
  const deploymentPlans = [
    /* --- Week 1-2: Establishing baseline --- */
    { day: 2,  service: 'gateway',       type: 'code',         lines: 120,  status: 'success' },
    { day: 3,  service: 'auth',          type: 'code',         lines: 85,   status: 'success' },
    { day: 5,  service: 'payments',      type: 'code',         lines: 200,  status: 'success' },
    { day: 7,  service: 'checkout',      type: 'code',         lines: 150,  status: 'success' },
    { day: 9,  service: 'inventory',     type: 'code',         lines: 90,   status: 'success' },
    { day: 10, service: 'notifications', type: 'code',         lines: 60,   status: 'success' },
    { day: 12, service: 'gateway',       type: 'dependency',   lines: 45,   status: 'success' },

    /* --- Week 3: First Friday DB migration failure (Pattern 1) --- */
    { day: 15, service: 'payments',      type: 'config',       lines: 30,   status: 'success' },
    { day: 17, service: 'auth',          type: 'code',         lines: 110,  status: 'success' },
    { day: 19, service: 'inventory',     type: 'db_migration', lines: 40,   status: 'failed',  isFriday: true }, // PATTERN 1: Friday DB migration fail
    { day: 20, service: 'gateway',       type: 'code',         lines: 180,  status: 'success' },

    /* --- Week 4: Payments config → checkout cascade (Pattern 2) --- */
    { day: 22, service: 'payments',      type: 'config',       lines: 25,   status: 'failed',  cascade: true },  // PATTERN 2
    { day: 23, service: 'checkout',      type: 'code',         lines: 100,  status: 'success' },
    { day: 25, service: 'auth',          type: 'code',         lines: 75,   status: 'success' },
    { day: 26, service: 'notifications', type: 'code',         lines: 40,   status: 'success' },

    /* --- Week 5: Large deploy failures (Pattern 3) --- */
    { day: 29, service: 'gateway',       type: 'code',         lines: 650,  status: 'failed',  bigDeploy: true },  // PATTERN 3
    { day: 30, service: 'payments',      type: 'code',         lines: 90,   status: 'success' },
    { day: 32, service: 'checkout',      type: 'db_migration', lines: 35,   status: 'success' }, // Tuesday, not Friday
    { day: 33, service: 'inventory',     type: 'code',         lines: 200,  status: 'success' },

    /* --- Week 6: More patterns --- */
    { day: 35, service: 'auth',          type: 'db_migration', lines: 55,   status: 'success' }, // Weekday DB migration OK
    { day: 37, service: 'payments',      type: 'config',       lines: 20,   status: 'failed',  cascade: true },  // PATTERN 2 again
    { day: 38, service: 'gateway',       type: 'dependency',   lines: 80,   status: 'failed' },  // Gateway dependency issue
    { day: 39, service: 'notifications', type: 'code',         lines: 50,   status: 'success' },

    /* --- Week 7: Friday patterns continue --- */
    { day: 40, service: 'checkout',      type: 'code',         lines: 170,  status: 'success' },
    { day: 42, service: 'payments',      type: 'db_migration', lines: 60,   status: 'failed',  isFriday: true }, // PATTERN 1
    { day: 43, service: 'auth',          type: 'code',         lines: 65,   status: 'success' },
    { day: 44, service: 'inventory',     type: 'config',       lines: 30,   status: 'success' },

    /* --- Week 8: Big deploys --- */
    { day: 46, service: 'checkout',      type: 'code',         lines: 550,  status: 'failed',  bigDeploy: true },  // PATTERN 3
    { day: 47, service: 'gateway',       type: 'infra',        lines: 100,  status: 'success' },
    { day: 49, service: 'payments',      type: 'code',         lines: 300,  status: 'success' },
    { day: 50, service: 'auth',          type: 'code',         lines: 45,   status: 'success' },

    /* --- Week 9: More cascades --- */
    { day: 52, service: 'payments',      type: 'config',       lines: 15,   status: 'failed',  cascade: true },  // PATTERN 2 third time
    { day: 53, service: 'notifications', type: 'dependency',   lines: 70,   status: 'success' },
    { day: 54, service: 'inventory',     type: 'code',         lines: 130,  status: 'success' },
    { day: 56, service: 'gateway',       type: 'code',         lines: 700,  status: 'failed',  bigDeploy: true }, // PATTERN 3

    /* --- Week 10: Friday DB migration pattern (success this time for ~40%) --- */
    { day: 57, service: 'checkout',      type: 'code',         lines: 80,   status: 'success' },
    { day: 59, service: 'auth',          type: 'config',       lines: 20,   status: 'success' },
    { day: 61, service: 'gateway',       type: 'db_migration', lines: 45,   status: 'success', isFriday: true }, // Friday but SUCCESS (40% = some pass)
    { day: 62, service: 'inventory',     type: 'code',         lines: 60,   status: 'success' },

    /* --- Week 11: Mixed results --- */
    { day: 64, service: 'payments',      type: 'code',         lines: 250,  status: 'success' },
    { day: 65, service: 'checkout',      type: 'dependency',   lines: 90,   status: 'success' },
    { day: 66, service: 'auth',          type: 'code',         lines: 35,   status: 'success' },
    { day: 67, service: 'gateway',       type: 'config',       lines: 40,   status: 'success' },
    { day: 68, service: 'notifications', type: 'code',         lines: 120,  status: 'success' },

    /* --- Week 12: Another Friday DB migration fail --- */
    { day: 70, service: 'payments',      type: 'code',         lines: 180,  status: 'success' },
    { day: 71, service: 'inventory',     type: 'db_migration', lines: 70,   status: 'failed',  isFriday: true }, // PATTERN 1
    { day: 72, service: 'checkout',      type: 'code',         lines: 95,   status: 'success' },
    { day: 73, service: 'auth',          type: 'code',         lines: 50,   status: 'success' },

    /* --- Week 13: Recent activity --- */
    { day: 75, service: 'gateway',       type: 'code',         lines: 600,  status: 'rolled_back', bigDeploy: true }, // PATTERN 3 rolled back
    { day: 76, service: 'payments',      type: 'config',       lines: 10,   status: 'success' }, // config but small, success
    { day: 78, service: 'checkout',      type: 'code',         lines: 140,  status: 'success' },
    { day: 79, service: 'notifications', type: 'infra',        lines: 85,   status: 'success' },
    { day: 80, service: 'inventory',     type: 'code',         lines: 110,  status: 'success' },
    { day: 82, service: 'auth',          type: 'dependency',   lines: 55,   status: 'success' },

    /* --- Last few days --- */
    { day: 84, service: 'gateway',       type: 'dependency',   lines: 100,  status: 'failed' },  // Gateway dep issue
    { day: 85, service: 'payments',      type: 'db_migration', lines: 50,   status: 'failed',  isFriday: true }, // PATTERN 1
    { day: 86, service: 'checkout',      type: 'code',         lines: 70,   status: 'success' },
    { day: 87, service: 'auth',          type: 'code',         lines: 40,   status: 'success' },
    { day: 88, service: 'inventory',     type: 'code',         lines: 160,  status: 'success' },
    { day: 89, service: 'gateway',       type: 'code',         lines: 200,  status: 'success' },
  ];

  for (const plan of deploymentPlans) {
    const timestamp = new Date(NOW.getTime() - (90 - plan.day) * 24 * 60 * 60 * 1000);

    /* If marked as Friday, ensure timestamp is actually a Friday */
    if (plan.isFriday) {
      const currentDay = timestamp.getDay();
      const daysUntilFriday = (5 - currentDay + 7) % 7;
      timestamp.setDate(timestamp.getDate() + daysUntilFriday);
      timestamp.setHours(15 + randInt(0, 3), randInt(0, 59)); // Friday afternoon
    } else {
      timestamp.setHours(9 + randInt(0, 8), randInt(0, 59));
    }

    const vMajor = randInt(1, 4);
    const vMinor = randInt(0, 20);
    const vPatch = randInt(0, 99);

    deployments.push({
      service: plan.service,
      version: `${vMajor}.${vMinor}.${vPatch}`,
      author: pick(AUTHORS),
      timestamp: timestamp.toISOString(),
      environment: pick(ENVIRONMENTS),
      status: plan.status,
      duration_sec: plan.status === 'success' ? randInt(30, 300) : randInt(60, 600),
      files_changed: Math.max(1, Math.round(plan.lines / randInt(8, 20))),
      lines_changed: plan.lines,
      change_type: plan.type,
      notes: generateNote(plan),
      _cascade: plan.cascade || false,
      _bigDeploy: plan.bigDeploy || false,
      _isFriday: plan.isFriday || false,
    });
  }

  return deployments;
}

function generateNote(plan) {
  const notes = {
    code: ['Refactored request handler', 'Added retry logic', 'Fixed memory leak in pool', 'Updated error handling', 'New API endpoint'],
    config: ['Updated rate limits', 'Changed connection pooling', 'Modified timeout values', 'Feature flag update', 'Updated CORS policy'],
    db_migration: ['Added index on user_id', 'New orders table partition', 'Altered column type for performance', 'Added cascading deletes', 'Schema normalization'],
    dependency: ['Upgraded axios to v1.7', 'Updated @prisma/client', 'Security patch for lodash', 'Bumped Node.js base image', 'Updated gRPC bindings'],
    infra: ['Scaled up replica count', 'Updated K8s resource limits', 'Modified auto-scaling policy', 'Changed load balancer config', 'Updated CDN cache rules'],
  };

  return pick(notes[plan.type] || notes.code);
}

/* ================================================================== */
/*  Main seed function                                                 */
/* ================================================================== */

async function seed() {
  console.log('🌱 Seeding PipelineMemory database...\n');

  /* Reset everything */
  resetDatabase();
  const db = getDb();

  const deployments = generateDeployments();

  /* Prepared statements for bulk insert */
  const insertDeploy = db.prepare(`
    INSERT INTO deployments (service, version, author, timestamp, environment, status, duration_sec, files_changed, lines_changed, change_type, notes)
    VALUES (@service, @version, @author, @timestamp, @environment, @status, @duration_sec, @files_changed, @lines_changed, @change_type, @notes)
  `);

  const insertFailure = db.prepare(`
    INSERT INTO build_failures (deployment_id, stage, error_message, root_cause, fix_applied, time_to_resolve_min)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertIncident = db.prepare(`
    INSERT INTO incidents (deployment_id, severity, downstream_services_affected, summary, resolved_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertInfra = db.prepare(`
    INSERT INTO infra_changes (resource, change_description, timestamp, linked_deployment_id)
    VALUES (?, ?, ?, ?)
  `);

  /* Use a transaction for speed */
  const insertAll = db.transaction(() => {
    let deployCount = 0;
    let failureCount = 0;
    let incidentCount = 0;
    let infraCount = 0;

    for (const dep of deployments) {
      const cascade = dep._cascade;
      const bigDeploy = dep._bigDeploy;
      const isFriday = dep._isFriday;

      /* Remove internal flags before insert */
      const cleanDep = { ...dep };
      delete cleanDep._cascade;
      delete cleanDep._bigDeploy;
      delete cleanDep._isFriday;

      const result = insertDeploy.run(cleanDep);
      const depId = result.lastInsertRowid;
      deployCount++;

      /* Create build failures for failed/rolled_back deployments */
      if (dep.status !== 'success') {
        const stage = pick(['build', 'test', 'deploy', 'deploy']); // weight toward deploy stage
        const errors = BUILD_ERRORS[stage];

        insertFailure.run(
          depId,
          stage,
          pick(errors),
          pick(ROOT_CAUSES),
          pick(FIXES),
          randInt(15, 180),
        );
        failureCount++;
      }

      /* Create incidents for cascade failures (Pattern 2) */
      if (cascade && dep.service === 'payments') {
        const severity = pick(['high', 'critical', 'high']);
        const resolvedAt = new Date(new Date(dep.timestamp).getTime() + randInt(30, 120) * 60 * 1000);

        insertIncident.run(
          depId,
          severity,
          JSON.stringify(['checkout']),
          `Config change to payments caused ${pick(['500 errors', 'timeout cascade', 'data sync failure', 'payment processing halt'])} in checkout service`,
          resolvedAt.toISOString(),
        );
        incidentCount++;
      }

      /* Create incidents for big deploy failures */
      if (bigDeploy && dep.status !== 'success') {
        const severity = pick(['med', 'high']);
        const resolvedAt = new Date(new Date(dep.timestamp).getTime() + randInt(30, 90) * 60 * 1000);

        insertIncident.run(
          depId,
          severity,
          JSON.stringify([]),
          `Large deployment (${dep.lines_changed} lines) to ${dep.service} caused ${pick(['partial outage', 'degraded performance', 'elevated error rates'])}`,
          resolvedAt.toISOString(),
        );
        incidentCount++;
      }

      /* Create incidents for Friday DB migration failures */
      if (isFriday && dep.status !== 'success') {
        const severity = pick(['med', 'high', 'high']);
        const resolvedAt = new Date(new Date(dep.timestamp).getTime() + randInt(45, 200) * 60 * 1000);

        insertIncident.run(
          depId,
          severity,
          JSON.stringify([]),
          `Friday DB migration on ${dep.service} failed — ${pick(['schema lock contention', 'migration timeout under Friday traffic', 'rollback required during peak hours'])}`,
          resolvedAt.toISOString(),
        );
        incidentCount++;
      }

      /* Create some infra changes linked to infra-type deployments */
      if (dep.change_type === 'infra' || (dep.change_type === 'config' && rand() > 0.5)) {
        insertInfra.run(
          pick(INFRA_RESOURCES),
          `${pick(['Updated', 'Modified', 'Scaled', 'Reconfigured'])} ${pick(['capacity', 'settings', 'access policy', 'network config'])} for ${dep.service}`,
          dep.timestamp,
          depId,
        );
        infraCount++;
      }

      /* Sprinkle some standalone infra changes */
      if (rand() > 0.85) {
        const infraTime = new Date(new Date(dep.timestamp).getTime() + randInt(-2, 2) * 24 * 60 * 60 * 1000);
        insertInfra.run(
          pick(INFRA_RESOURCES),
          `Routine ${pick(['maintenance', 'security patch', 'capacity review', 'cert rotation'])} on ${pick(SERVICES)} infrastructure`,
          infraTime.toISOString(),
          null,
        );
        infraCount++;
      }
    }

    return { deployCount, failureCount, incidentCount, infraCount };
  });

  const counts = insertAll();

  console.log(`   ✅ ${counts.deployCount} deployments`);
  console.log(`   ✅ ${counts.failureCount} build failures`);
  console.log(`   ✅ ${counts.incidentCount} incidents`);
  console.log(`   ✅ ${counts.infraCount} infra changes`);

  /* Run pattern learner to discover planted patterns */
  console.log('\n🧠 Running pattern learner...');
  const patternCount = recomputePatterns();
  console.log(`   ✅ ${patternCount} patterns discovered\n`);

  /* Print discovered patterns */
  const patterns = db.prepare('SELECT * FROM learned_patterns ORDER BY risk_multiplier DESC').all();
  console.log('\n📋 Discovered patterns:');
  for (const p of patterns) {
    console.log(`   • ${p.pattern_description} (×${p.risk_multiplier}, evidence: ${p.evidence_count})`);
  }

  /* ── Bulk retain into Hindsight memory bank ───────────────────── */
  if (isHindsightAvailable()) {
    console.log('\n🧠 Retaining seed data into Hindsight memory bank...');

    const deployments = db.prepare('SELECT * FROM deployments').all();
    const failures = db.prepare(`
      SELECT bf.*, d.service, d.version, d.timestamp, d.change_type, d.author
      FROM build_failures bf
      JOIN deployments d ON d.id = bf.deployment_id
    `).all();
    const incidents = db.prepare('SELECT * FROM incidents').all();
    const deployMap = {};
    for (const d of deployments) deployMap[d.id] = d;

    const memories = [
      ...deployments.map(d => buildDeploymentMemory(d)),
      ...failures.map(f => buildFailureMemory(f, deployMap[f.deployment_id])),
      ...incidents.map(i => buildIncidentMemory(i, deployMap[i.deployment_id])),
      ...patterns.map(p => buildPatternMemory(p)),
    ];

    await bulkRetain(memories);
    console.log(`   ✅ ${memories.length} memories retained in Hindsight`);
  } else {
    console.log('\n💡 Tip: Configure HINDSIGHT_BASE_URL in backend/.env for semantic memory.');
    console.log('   Sign up free at https://ui.hindsight.vectorize.io/signup');
  }

  console.log('\n🎉 Seed complete! Start the server with: npm run dev\n');
}

/* Run immediately */
seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
