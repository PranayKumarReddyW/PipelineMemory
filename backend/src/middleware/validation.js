/**
 * Input validation middleware for PipelineMemory API routes.
 *
 * Each validator returns an Express middleware that checks the request body
 * and sends 400 with a descriptive message on failure.
 */

const VALID_STATUSES = ['success', 'failed', 'rolled_back'];
const VALID_CHANGE_TYPES = ['code', 'config', 'db_migration', 'dependency', 'infra'];
const VALID_STAGES = ['build', 'test', 'deploy', 'migrate', 'release', 'pre-deploy', 'post-deploy'];
const VALID_SEVERITIES = ['low', 'med', 'high', 'critical'];

/**
 * Validates that required fields exist and have correct types/values.
 * @param {Array<{field: string, type: string, required?: boolean, enum?: string[]}>} rules
 */
export function validate(rules) {
  return (req, res, next) => {
    const errors = [];

    for (const rule of rules) {
      const value = req.body[rule.field];

      /* Check required fields */
      if (rule.required !== false && (value === undefined || value === null || value === '')) {
        errors.push(`"${rule.field}" is required`);
        continue;
      }

      /* Skip optional fields that aren't provided */
      if (value === undefined || value === null) continue;

      /* Type check */
      if (rule.type === 'string' && typeof value !== 'string') {
        errors.push(`"${rule.field}" must be a string`);
      } else if (rule.type === 'number' && typeof value !== 'number') {
        errors.push(`"${rule.field}" must be a number`);
      } else if (rule.type === 'integer' && (!Number.isInteger(value))) {
        errors.push(`"${rule.field}" must be an integer`);
      }

      /* Enum check */
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push(`"${rule.field}" must be one of: ${rule.enum.join(', ')}`);
      }

      /* Min/max for numbers */
      if (rule.min !== undefined && typeof value === 'number' && value < rule.min) {
        errors.push(`"${rule.field}" must be >= ${rule.min}`);
      }
      if (rule.max !== undefined && typeof value === 'number' && value > rule.max) {
        errors.push(`"${rule.field}" must be <= ${rule.max}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    next();
  };
}

/* Pre-built validators for each endpoint */

export const validateDeployment = validate([
  { field: 'service', type: 'string', required: true },
  { field: 'version', type: 'string', required: true },
  { field: 'author', type: 'string', required: true },
  { field: 'timestamp', type: 'string', required: false },
  { field: 'environment', type: 'string', required: false },
  { field: 'status', type: 'string', required: true, enum: VALID_STATUSES },
  { field: 'duration_sec', type: 'integer', required: false, min: 0 },
  { field: 'files_changed', type: 'integer', required: false, min: 0 },
  { field: 'lines_changed', type: 'integer', required: false, min: 0 },
  { field: 'change_type', type: 'string', required: true, enum: VALID_CHANGE_TYPES },
  { field: 'notes', type: 'string', required: false },
]);

export const validateBuildFailure = validate([
  { field: 'deployment_id', type: 'integer', required: true },
  { field: 'stage', type: 'string', required: true, enum: VALID_STAGES },
  { field: 'error_message', type: 'string', required: true },
  { field: 'root_cause', type: 'string', required: false },
  { field: 'fix_applied', type: 'string', required: false },
  { field: 'time_to_resolve_min', type: 'integer', required: false, min: 0 },
]);

export const validateInfraChange = validate([
  { field: 'resource', type: 'string', required: true },
  { field: 'change_description', type: 'string', required: true },
  { field: 'timestamp', type: 'string', required: true },
  { field: 'linked_deployment_id', type: 'integer', required: false },
]);

export const validateIncident = validate([
  { field: 'deployment_id', type: 'integer', required: true },
  { field: 'severity', type: 'string', required: true, enum: VALID_SEVERITIES },
  { field: 'downstream_services_affected', type: 'string', required: false },
  { field: 'summary', type: 'string', required: true },
  { field: 'resolved_at', type: 'string', required: false },
]);

export const validatePrediction = validate([
  { field: 'service', type: 'string', required: true },
  { field: 'change_type', type: 'string', required: true, enum: VALID_CHANGE_TYPES },
  { field: 'files_changed', type: 'integer', required: false, min: 0 },
  { field: 'lines_changed', type: 'integer', required: false, min: 0 },
  { field: 'author', type: 'string', required: false },
]);

export const validateAsk = validate([
  { field: 'question', type: 'string', required: true },
]);
