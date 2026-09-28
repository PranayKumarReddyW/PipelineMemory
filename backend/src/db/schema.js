/**
 * Database schema and connection manager for PipelineMemory.
 *
 * Uses better-sqlite3 for synchronous, fast, embedded SQL.
 * All tables use INTEGER PRIMARY KEY AUTOINCREMENT for simplicity.
 * Foreign keys are enforced via PRAGMA.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'pipeline_memory.db');
const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;

let db = null;

/**
 * Returns the singleton database instance, creating it + running
 * migrations on first call.
 */
export function getDb() {
  if (db) return db;

  /* Ensure the data directory exists */
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeSchema(db);
  return db;
}

/**
 * Creates all tables and indexes if they don't already exist.
 */
function initializeSchema(database) {
  database.exec(`
    ---------------------------------------------------------------
    -- 1. Deployments — every deploy attempt across all services
    ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS deployments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      service         TEXT    NOT NULL,
      version         TEXT    NOT NULL,
      author          TEXT    NOT NULL,
      timestamp       TEXT    NOT NULL,
      environment     TEXT    NOT NULL DEFAULT 'production',
      status          TEXT    NOT NULL CHECK(status IN ('success', 'failed', 'rolled_back')),
      duration_sec    INTEGER,
      files_changed   INTEGER DEFAULT 0,
      lines_changed   INTEGER DEFAULT 0,
      change_type     TEXT    NOT NULL CHECK(change_type IN ('code', 'config', 'db_migration', 'dependency', 'infra')),
      notes           TEXT
    );

    ---------------------------------------------------------------
    -- 2. Build failures — linked to a failed deployment
    ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS build_failures (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id       INTEGER NOT NULL,
      stage               TEXT    NOT NULL CHECK(stage IN ('build', 'test', 'deploy')),
      error_message       TEXT    NOT NULL,
      root_cause          TEXT,
      fix_applied         TEXT,
      time_to_resolve_min INTEGER,
      FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
    );

    ---------------------------------------------------------------
    -- 3. Infrastructure changes — optionally linked to a deployment
    ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS infra_changes (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      resource              TEXT NOT NULL,
      change_description    TEXT NOT NULL,
      timestamp             TEXT NOT NULL,
      linked_deployment_id  INTEGER,
      FOREIGN KEY (linked_deployment_id) REFERENCES deployments(id) ON DELETE SET NULL
    );

    ---------------------------------------------------------------
    -- 4. Incidents — production issues caused by a deployment
    ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS incidents (
      id                           INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id                INTEGER NOT NULL,
      severity                     TEXT    NOT NULL CHECK(severity IN ('low', 'med', 'high', 'critical')),
      downstream_services_affected TEXT    DEFAULT '[]',
      summary                      TEXT    NOT NULL,
      resolved_at                  TEXT,
      FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
    );

    ---------------------------------------------------------------
    -- 5. Learned patterns — auto-discovered from historical data
    ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS learned_patterns (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_description TEXT NOT NULL,
      change_type         TEXT,
      risk_multiplier     REAL    DEFAULT 1.0,
      evidence_count      INTEGER DEFAULT 0,
      last_updated        TEXT    NOT NULL
    );

    ---------------------------------------------------------------
    -- Indexes for common query patterns
    ---------------------------------------------------------------
    CREATE INDEX IF NOT EXISTS idx_dep_service    ON deployments(service);
    CREATE INDEX IF NOT EXISTS idx_dep_timestamp  ON deployments(timestamp);
    CREATE INDEX IF NOT EXISTS idx_dep_status     ON deployments(status);
    CREATE INDEX IF NOT EXISTS idx_dep_changetype ON deployments(change_type);
    CREATE INDEX IF NOT EXISTS idx_bf_depid       ON build_failures(deployment_id);
    CREATE INDEX IF NOT EXISTS idx_inc_depid      ON incidents(deployment_id);
    CREATE INDEX IF NOT EXISTS idx_ic_depid       ON infra_changes(linked_deployment_id);
  `);
}

/**
 * Drops all tables and recreates the schema (used by seed script).
 */
export function resetDatabase() {
  const database = getDb();
  database.exec(`
    DROP TABLE IF EXISTS learned_patterns;
    DROP TABLE IF EXISTS incidents;
    DROP TABLE IF EXISTS infra_changes;
    DROP TABLE IF EXISTS build_failures;
    DROP TABLE IF EXISTS deployments;
  `);
  initializeSchema(database);
}
