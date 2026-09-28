/**
 * Hindsight Service — semantic agent memory for PipelineMemory.
 *
 * Hindsight (https://hindsight.vectorize.io) is a SotA agent memory system.
 * This service wraps its three core operations:
 *
 *   retain  — store a deployment event as a natural-language memory
 *   recall  — semantically search past memories for a query
 *   reflect — generate a grounded answer from memories (powers /api/ask)
 *
 * Configuration (in backend/.env):
 *   HINDSIGHT_BASE_URL  — https://api.hindsight.vectorize.io (Cloud) or http://localhost:8888 (self-hosted)
 *   HINDSIGHT_API_KEY   — required for Hindsight Cloud, optional for self-hosted
 *   HINDSIGHT_BANK_ID   — memory bank name (default: "pipeline-memory")
 *
 * When Hindsight is not configured, all operations gracefully return null /
 * empty results, and the system falls back to SQLite-based logic automatically.
 */

import { HindsightClient } from '@vectorize-io/hindsight-client';

/* ── Singleton client ───────────────────────────────────────────────────── */

let _client = null;

const BANK_ID = process.env.HINDSIGHT_BANK_ID || 'pipeline-memory';

/**
 * Returns the Hindsight client if configured, or null.
 * Connection errors are caught so the app still starts without Hindsight.
 */
function getClient() {
  if (_client) return _client;

  const baseUrl = process.env.HINDSIGHT_BASE_URL;
  if (!baseUrl) return null;

  try {
    const opts = { baseUrl };
    if (process.env.HINDSIGHT_API_KEY) {
      opts.apiKey = process.env.HINDSIGHT_API_KEY;
    }
    _client = new HindsightClient(opts);
    return _client;
  } catch (err) {
    console.warn('[Hindsight] Failed to initialise client:', err.message);
    return null;
  }
}

/**
 * Whether Hindsight is configured and available.
 */
export function isHindsightAvailable() {
  return !!process.env.HINDSIGHT_BASE_URL;
}

export { BANK_ID };

/* ── Memory content builders ────────────────────────────────────────────── */

/**
 * Converts a deployment record into a rich natural-language memory string.
 * This is what Hindsight stores and indexes for semantic search.
 */
export function buildDeploymentMemory(dep) {
  const date = new Date(dep.timestamp).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const time = new Date(dep.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  let mem = `Deployment #${dep.id}: ${dep.change_type} change to ${dep.service} service`;
  mem += ` by ${dep.author} on ${date} at ${time}.`;
  mem += ` Version ${dep.version}, environment: ${dep.environment}.`;
  mem += ` Status: ${dep.status}.`;
  mem += ` Changed ${dep.files_changed} files and ${dep.lines_changed} lines.`;
  if (dep.notes) mem += ` Notes: ${dep.notes}.`;
  if (dep.duration_sec) mem += ` Took ${dep.duration_sec} seconds.`;
  return mem;
}

/**
 * Converts a build failure into a memory string.
 */
export function buildFailureMemory(failure, dep) {
  let mem = `Build failure in deployment #${failure.deployment_id}`;
  if (dep) mem += ` (${dep.service} ${dep.change_type} by ${dep.author})`;
  mem += `: stage=${failure.stage}. Error: ${failure.error_message}.`;
  if (failure.root_cause) mem += ` Root cause: ${failure.root_cause}.`;
  if (failure.fix_applied) mem += ` Fix applied: ${failure.fix_applied}.`;
  if (failure.time_to_resolve_min) mem += ` Resolved in ${failure.time_to_resolve_min} minutes.`;
  return mem;
}

/**
 * Converts an incident into a memory string.
 */
export function buildIncidentMemory(incident, dep) {
  let affected = [];
  try { affected = JSON.parse(incident.downstream_services_affected); } catch {}

  let mem = `Production incident on deployment #${incident.deployment_id}`;
  if (dep) mem += ` (${dep.service} ${dep.change_type} by ${dep.author})`;
  mem += `. Severity: ${incident.severity}. ${incident.summary}.`;
  if (affected.length > 0) {
    mem += ` Downstream services affected: ${affected.join(', ')}.`;
  }
  if (incident.resolved_at) {
    const resolvedDate = new Date(incident.resolved_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    mem += ` Resolved at ${resolvedDate}.`;
  }
  return mem;
}

/**
 * Converts a learned pattern into a memory string.
 */
export function buildPatternMemory(pattern) {
  return `Learned pattern: ${pattern.pattern_description}. ` +
    `Risk multiplier: ×${pattern.risk_multiplier}. ` +
    `Observed ${pattern.evidence_count} times.`;
}

/* ── Core operations ────────────────────────────────────────────────────── */

/**
 * Retains a memory in Hindsight.
 * Non-blocking — errors are logged but not propagated (ingest must not fail
 * just because Hindsight is unreachable).
 *
 * @param {string} content — natural-language memory string
 */
export async function retain(content) {
  const client = getClient();
  if (!client) return null;

  try {
    await client.retain(BANK_ID, content);
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Hindsight] retained: ${content.slice(0, 80)}…`);
    }
    return true;
  } catch (err) {
    console.warn('[Hindsight] retain error (non-fatal):', err.message);
    return null;
  }
}

/**
 * Semantically searches Hindsight for memories relevant to a query.
 * Used by the predict endpoint to find similar past incidents.
 *
 * @param {string} query — natural-language search query
 * @param {number} limit — max results (Hindsight returns ranked results)
 * @returns {Array|null} array of memory strings, or null if unavailable
 */
export async function recall(query, limit = 5) {
  const client = getClient();
  if (!client) return null;

  try {
    const resp = await client.recall(BANK_ID, query);

    /* Hindsight returns RecallResponse: { results: Array<RecallResult> } or an array */
    const list = Array.isArray(resp) ? resp : (resp?.results || []);

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Hindsight] recall "${query.slice(0, 60)}…" → ${list.length} results`);
    }

    if (list.length === 0) return [];

    /* Normalise to plain strings (each RecallResult has .text, .content, or is string) */
    return list
      .slice(0, limit)
      .map(r => (typeof r === 'string' ? r : r.text || r.content || r.memory || JSON.stringify(r)));
  } catch (err) {
    console.warn('[Hindsight] recall error (non-fatal):', err.message);
    return null;
  }
}

/**
 * Generates a grounded natural-language answer from Hindsight memories.
 * Used by the /api/ask endpoint.
 *
 * @param {string} query — the user's question
 * @returns {string|null} answer string, or null if unavailable
 */
export async function reflect(query) {
  const client = getClient();
  if (!client) return null;

  try {
    const answer = await client.reflect(BANK_ID, query);

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Hindsight] reflect "${query.slice(0, 60)}…" → responded`);
    }

    /* reflect returns ReflectResponse { text: string } or a string */
    if (typeof answer === 'string') return answer;
    if (answer?.text) return answer.text;
    if (answer?.answer) return answer.answer;
    if (answer?.content) return answer.content;
    return String(answer);
  } catch (err) {
    console.warn('[Hindsight] reflect error (falling back to rule-based):', err.message);
    return null;
  }
}

/**
 * Bulk-retains multiple memories in parallel (used by seed script).
 *
 * @param {string[]} contents — array of memory strings
 */
export async function bulkRetain(contents) {
  const client = getClient();
  if (!client) {
    console.log('[Hindsight] Not configured — skipping bulk retain');
    return;
  }

  console.log(`[Hindsight] Bulk retaining ${contents.length} memories into bank "${BANK_ID}"...`);

  /* Use retainBatch if available on client */
  if (typeof client.retainBatch === 'function') {
    try {
      const items = contents.map(c => ({ content: c }));
      /* retain in batches of 25 */
      const BATCH_SIZE = 25;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        await client.retainBatch(BANK_ID, batch);
        process.stdout.write(`\r   [Hindsight] Retained ${Math.min(i + batch.length, items.length)}/${items.length}...`);
      }
      console.log(`\n[Hindsight] ✅ Bulk retain complete via retainBatch`);
      return;
    } catch (err) {
      console.warn('\n[Hindsight] retainBatch failed, falling back to individual retains:', err.message);
    }
  }

  /* Fallback: batch in groups of 10 */
  const BATCH_SIZE = 10;
  let retained = 0;

  for (let i = 0; i < contents.length; i += BATCH_SIZE) {
    const batch = contents.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(content => retain(content)));
    retained += batch.length;
    process.stdout.write(`\r   [Hindsight] Retained ${Math.min(retained, contents.length)}/${contents.length}...`);
  }

  console.log(`\n[Hindsight] ✅ Bulk retain complete`);
}
