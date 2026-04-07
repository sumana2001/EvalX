/**
 * Tasks API Routes
 * 
 * Endpoints:
 *   POST   /api/tasks      - Create task with dataset items
 *   GET    /api/tasks      - List all tasks
 *   GET    /api/tasks/:id  - Get task with items
 *   DELETE /api/tasks/:id  - Delete task (cascades to items)
 */

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import { query, getClient } from '../lib/db.js';

const router = Router();

// ============================================================
// Validation Schemas (Zod)
// ============================================================

// JSON Schema validator (basic structure check)
const jsonSchemaSchema = z.object({
  type: z.string().optional(),
  properties: z.record(z.any()).optional(),
  required: z.array(z.string()).optional(),
}).passthrough(); // Allow additional JSON Schema keywords

// Single task item
const taskItemSchema = z.object({
  input: z.string().min(1, 'Input is required'),
  context: z.string().optional().nullable(),
  ground_truth: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

// Create task request body
const createTaskSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional().nullable(),
  prompt_template: z.string().min(1, 'Prompt template is required'),
  expected_schema: jsonSchemaSchema,
  items: z.array(taskItemSchema).min(1, 'At least one item is required'),
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

// ============================================================
// POST /api/tasks - Create task with items
// ============================================================
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = validateBody(createTaskSchema, req.body);

    // Use transaction to ensure atomicity
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Insert the task
      const taskResult = await client.query(
        `INSERT INTO evaluation_tasks (name, description, expected_schema)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, expected_schema, created_at`,
        [data.name, data.description || null, JSON.stringify(data.expected_schema)]
      );
      const task = taskResult.rows[0];

      // 2. Create a prompt variant from the template
      // Use task name + " Prompt" as the variant name
      const promptVariantResult = await client.query(
        `INSERT INTO prompt_variants (name, version, template, task_id)
         VALUES ($1, 1, $2, $3)
         RETURNING id, name, template`,
        [`${data.name} Prompt`, data.prompt_template, task.id]
      );
      const promptVariant = promptVariantResult.rows[0];

      // 3. Insert all items (batch insert for performance)
      // Build parameterized query for bulk insert
      const itemValues = [];
      const itemParams = [];
      let paramIndex = 1;

      for (const item of data.items) {
        itemValues.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        );
        itemParams.push(
          task.id,
          item.input,
          item.context || null,
          item.ground_truth || null,
          JSON.stringify(item.metadata || {})
        );
      }

      const insertItemsQuery = `
        INSERT INTO evaluation_task_items (task_id, input, context, ground_truth, metadata)
        VALUES ${itemValues.join(', ')}
        RETURNING id
      `;
      const itemsResult = await client.query(insertItemsQuery, itemParams);

      await client.query('COMMIT');

      // 4. Return response
      res.status(201).json({
        id: task.id,
        name: task.name,
        description: task.description,
        expected_schema: task.expected_schema,
        prompt_template: data.prompt_template,
        prompt_variant_id: promptVariant.id,
        item_count: itemsResult.rowCount,
        created_at: task.created_at,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// ============================================================
// GET /api/tasks - List all tasks
// ============================================================
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(`
      SELECT 
        t.id,
        t.name,
        t.description,
        t.created_at,
        t.updated_at,
        COUNT(DISTINCT ti.id)::int as item_count,
        (SELECT template FROM prompt_variants WHERE task_id = t.id LIMIT 1) as prompt_template
      FROM evaluation_tasks t
      LEFT JOIN evaluation_task_items ti ON ti.task_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);

    res.json({
      tasks: result.rows,
      count: result.rowCount,
    });
  })
);

// ============================================================
// GET /api/tasks/:id - Get task with items
// ============================================================
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new ValidationError('Invalid task ID format', { id });
    }

    // Fetch task
    const taskResult = await query(
      `SELECT id, name, description, expected_schema, created_at, updated_at
       FROM evaluation_tasks WHERE id = $1`,
      [id]
    );

    if (taskResult.rowCount === 0) {
      throw new NotFoundError('Task', id);
    }

    const task = taskResult.rows[0];

    // Fetch items (paginated in future, for now return all)
    const itemsResult = await query(
      `SELECT id, input, context, ground_truth, metadata, created_at
       FROM evaluation_task_items
       WHERE task_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    // Fetch prompt variants for this task
    const promptsResult = await query(
      `SELECT id, name, template, version, created_at
       FROM prompt_variants
       WHERE task_id = $1
       ORDER BY version ASC`,
      [id]
    );

    res.json({
      ...task,
      items: itemsResult.rows,
      item_count: itemsResult.rowCount,
      prompt_variants: promptsResult.rows,
    });
  })
);

// ============================================================
// DELETE /api/tasks/:id - Delete task (cascades to items)
// ============================================================
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new ValidationError('Invalid task ID format', { id });
    }

    const result = await query(
      `DELETE FROM evaluation_tasks WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Task', id);
    }

    res.status(204).send();
  })
);

export default router;
