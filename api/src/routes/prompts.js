/**
 * Prompt Variants API Routes
 * 
 * Prompt templates with placeholders: {{input}}, {{context}}
 * 
 * Endpoints:
 *   POST   /api/prompts      - Create prompt variant
 *   GET    /api/prompts      - List all prompts
 *   GET    /api/prompts/:id  - Get single prompt
 *   DELETE /api/prompts/:id  - Delete prompt
 */

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import { query } from '../lib/db.js';

const router = Router();

// ============================================================
// Validation Schemas
// ============================================================

const createPromptSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  version: z.number().int().positive().optional().default(1),
  template: z
    .string()
    .min(1, 'Template is required')
    .refine(
      (t) => t.includes('{{input}}'),
      'Template must contain {{input}} placeholder'
    ),
  system_prompt: z.string().optional().nullable(),
});

// ============================================================
// Helper: Validate request body with Zod
// ============================================================
function validateBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ValidationError('Invalid request body', { errors });
  }
  return result.data;
}

// UUID validation helper
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(id, field = 'id') {
  if (!UUID_REGEX.test(id)) {
    throw new ValidationError(`Invalid ${field} format`, { [field]: id });
  }
}

// ============================================================
// POST /api/prompts - Create prompt variant
// ============================================================
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = validateBody(createPromptSchema, req.body);

    const result = await query(
      `INSERT INTO prompt_variants (name, version, template, system_prompt)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, version, template, system_prompt, created_at`,
      [data.name, data.version, data.template, data.system_prompt || null]
    );

    res.status(201).json(result.rows[0]);
  })
);

// ============================================================
// GET /api/prompts - List all prompts
// ============================================================
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(`
      SELECT id, name, version, template, system_prompt, created_at
      FROM prompt_variants
      ORDER BY name ASC, version DESC
    `);

    res.json({
      prompts: result.rows,
      count: result.rowCount,
    });
  })
);

// ============================================================
// GET /api/prompts/:id - Get single prompt
// ============================================================
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    validateUuid(id);

    const result = await query(
      `SELECT id, name, version, template, system_prompt, created_at
       FROM prompt_variants WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Prompt', id);
    }

    res.json(result.rows[0]);
  })
);

// ============================================================
// DELETE /api/prompts/:id - Delete prompt
// ============================================================
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    validateUuid(id);

    const result = await query(
      `DELETE FROM prompt_variants WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Prompt', id);
    }

    res.status(204).send();
  })
);

export default router;
