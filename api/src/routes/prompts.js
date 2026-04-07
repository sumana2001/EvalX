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
import { NotFoundError } from '../lib/errors.js';
import { validateBody, validateUuid } from '../lib/validation.js';
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
  task_id: z.string().uuid('Invalid task_id format').optional().nullable(),
});

// ============================================================
// POST /api/prompts - Create prompt variant
// ============================================================
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = validateBody(createPromptSchema, req.body);

    const result = await query(
      `INSERT INTO prompt_variants (name, version, template, system_prompt, task_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, version, template, system_prompt, task_id, created_at`,
      [data.name, data.version, data.template, data.system_prompt || null, data.task_id || null]
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
    // Optional filter by task_id
    const { task_id } = req.query;
    
    let sql = `
      SELECT id, name, version, template, system_prompt, task_id, created_at
      FROM prompt_variants
    `;
    const params = [];
    
    if (task_id) {
      sql += ` WHERE task_id = $1`;
      params.push(task_id);
    }
    
    sql += ` ORDER BY name ASC, version DESC`;
    
    const result = await query(sql, params);

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
