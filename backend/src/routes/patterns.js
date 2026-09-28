/**
 * Learned Patterns API routes.
 *
 * GET  /api/patterns        — list all discovered patterns
 * POST /api/patterns/recompute — force recomputation of patterns
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { recomputePatterns, getPatterns } from '../services/patternLearner.js';

const router = Router();

/* GET — list all learned patterns */
router.get('/', asyncHandler(async (req, res) => {
  const patterns = getPatterns();
  res.json({ patterns, count: patterns.length });
}));

/* POST — force recompute (useful after bulk data import) */
router.post('/recompute', asyncHandler(async (req, res) => {
  const count = recomputePatterns();
  const patterns = getPatterns();
  res.json({
    message: `Recomputed patterns — discovered ${count}`,
    patterns,
  });
}));

export default router;
