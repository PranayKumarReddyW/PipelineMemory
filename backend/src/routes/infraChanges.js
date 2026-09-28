/**
 * Infrastructure Changes API routes.
 *
 * POST /api/infra-changes  — record an infra change (optionally linked to a deployment)
 * GET  /api/infra-changes  — list all infra changes
 */

import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { validateInfraChange } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/* POST — record a new infra change */
router.post('/', validateInfraChange, asyncHandler(async (req, res) => {
  const db = getDb();
  const { resource, change_description, timestamp, linked_deployment_id } = req.body;

  /* If linking to a deployment, verify it exists */
  if (linked_deployment_id) {
    const dep = db.prepare('SELECT id FROM deployments WHERE id = ?').get(linked_deployment_id);
    if (!dep) {
      return res.status(404).json({ error: `Deployment #${linked_deployment_id} not found` });
    }
  }

  const result = db.prepare(`
    INSERT INTO infra_changes (resource, change_description, timestamp, linked_deployment_id)
    VALUES (?, ?, ?, ?)
  `).run(resource, change_description, timestamp, linked_deployment_id || null);

  const infraChange = db.prepare('SELECT * FROM infra_changes WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json({ message: 'Infrastructure change recorded', infraChange });
}));

/* GET — list all infra changes */
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { limit = 50 } = req.query;

  const changes = db.prepare(`
    SELECT ic.*, d.service AS linked_service, d.version AS linked_version
    FROM infra_changes ic
    LEFT JOIN deployments d ON d.id = ic.linked_deployment_id
    ORDER BY ic.timestamp DESC
    LIMIT ?
  `).all(Number(limit));

  res.json({ changes });
}));

export default router;
