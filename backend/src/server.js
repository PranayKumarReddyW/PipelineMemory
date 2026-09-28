/**
 * PipelineMemory — Express API server entry point.
 *
 * Mounts all route modules, applies middleware, and starts
 * listening on the configured port.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getDb } from './db/schema.js';
import { errorHandler } from './middleware/errorHandler.js';
import { isHindsightAvailable, BANK_ID } from './services/hindsightService.js';
import { isLlmAvailable, getLlmProviderName } from './services/llmService.js';

/* Route modules */
import deploymentsRouter from './routes/deployments.js';
import buildFailuresRouter from './routes/buildFailures.js';
import infraChangesRouter from './routes/infraChanges.js';
import incidentsRouter from './routes/incidents.js';
import patternsRouter from './routes/patterns.js';
import predictRouter from './routes/predict.js';
import askRouter from './routes/ask.js';
import impactRouter from './routes/impact.js';
import statsRouter from './routes/stats.js';

const app = express();
const PORT = process.env.PORT || 3001;

/* ------------------------------------------------------------------ */
/*  Middleware                                                         */
/* ------------------------------------------------------------------ */
app.use(cors());
app.use(express.json({ limit: '1mb' }));

/* Request logger (concise) */
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
    }
  });
  next();
});

/* ------------------------------------------------------------------ */
/*  API Routes                                                         */
/* ------------------------------------------------------------------ */
app.use('/api/deployments', deploymentsRouter);
app.use('/api/build-failures', buildFailuresRouter);
app.use('/api/infra-changes', infraChangesRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/patterns', patternsRouter);
app.use('/api/predict', predictRouter);
app.use('/api/ask', askRouter);
app.use('/api/impact', impactRouter);
app.use('/api/stats', statsRouter);

/* Health check */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hindsight_configured: isHindsightAvailable(),
    hindsight_bank: BANK_ID,
    hindsight_url: process.env.HINDSIGHT_BASE_URL || null,
    llm_configured: isLlmAvailable(),
    llm_provider: getLlmProviderName(),
  });
});

/* ------------------------------------------------------------------ */
/*  Error handling                                                     */
/* ------------------------------------------------------------------ */
app.use(errorHandler);

/* ------------------------------------------------------------------ */
/*  Start server                                                       */
/* ------------------------------------------------------------------ */

/* Initialize DB on startup */
getDb();
console.log('📦 Database initialized');

app.listen(PORT, () => {
  console.log(`\n🚀 PipelineMemory backend running on http://localhost:${PORT}`);
  console.log(`   🧠 Hindsight: ${isHindsightAvailable() ? `✅ Connected → ${process.env.HINDSIGHT_BASE_URL} (bank: ${BANK_ID})` : '⚠️  Not configured — set HINDSIGHT_BASE_URL in backend/.env'}`);
  console.log(`   🤖 LLM: ${isLlmAvailable() ? `✅ ${getLlmProviderName()}` : '⚠️  No API key — using rule-based fallback'}`);
  console.log(`   API docs: http://localhost:${PORT}/api/health\n`);
});

export default app;
