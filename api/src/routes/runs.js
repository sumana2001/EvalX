/**
 * Evaluation Runs API Routes
 * 
 * A Run executes a Task's dataset against selected models and prompts.
 * Fan-out: total_jobs = items × prompts × models × repetitions
 * 
 * Endpoints:
 *   POST   /api/runs            - Create run (calculates permutations)
 *   GET    /api/runs            - List all runs
 *   GET    /api/runs/:id        - Get run details
 *   GET    /api/runs/:id/status - Get live status from Redis
 *   POST   /api/runs/:id/start  - Start the run (publishes to Kafka)
 *   DELETE /api/runs/:id        - Delete run
 */

import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { asyncHandler } from '../middleware/errorHandler.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';
import { validateBody, validateUuid } from '../lib/validation.js';
import { query, getClient } from '../lib/db.js';
import { initRunProgress, getRunProgress } from '../lib/redis.js';
import { sendBatch, TOPICS } from '../lib/kafka.js';

const router = Router();

// ============================================================
// Validation Schemas
// ============================================================

const createRunSchema = z.object({
  task_id: z.string().uuid('Invalid task_id format'),
  name: z.string().max(255).optional().nullable(),
  models: z
    .array(z.string().min(1))
    .min(1, 'At least one model is required'),
  prompt_variant_ids: z
    .array(z.string().uuid('Invalid prompt variant ID'))
    .optional(),  // Optional - will auto-select from task if not provided
  repetitions: z.number().int().min(1).max(100).optional().default(1),
});

// ============================================================
// POST /api/runs - Create a new evaluation run
// ============================================================
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = validateBody(createRunSchema, req.body);
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Verify task exists and get item count
      const taskResult = await client.query(
        `SELECT t.id, COUNT(ti.id)::int as item_count
         FROM evaluation_tasks t
         LEFT JOIN evaluation_task_items ti ON ti.task_id = t.id
         WHERE t.id = $1
         GROUP BY t.id`,
        [data.task_id]
      );

      if (taskResult.rowCount === 0) {
        throw new NotFoundError('Task', data.task_id);
      }

      const itemCount = taskResult.rows[0].item_count;
      if (itemCount === 0) {
        throw new ValidationError('Task has no items', { task_id: data.task_id });
      }

      // 2. Get prompt variant IDs - either from request or auto-fetch from task
      let promptVariantIds = data.prompt_variant_ids;
      
      if (!promptVariantIds || promptVariantIds.length === 0) {
        // Auto-fetch prompt variants linked to this task
        const taskPromptsResult = await client.query(
          `SELECT id FROM prompt_variants WHERE task_id = $1`,
          [data.task_id]
        );
        
        if (taskPromptsResult.rowCount === 0) {
          throw new ValidationError(
            'No prompt variants found for this task. Create the task with a prompt template first.',
            { task_id: data.task_id }
          );
        }
        
        promptVariantIds = taskPromptsResult.rows.map(r => r.id);
      } else {
        // Verify all provided prompt variants exist
        const promptResult = await client.query(
          `SELECT id FROM prompt_variants WHERE id = ANY($1)`,
          [promptVariantIds]
        );

        if (promptResult.rowCount !== promptVariantIds.length) {
          const foundIds = new Set(promptResult.rows.map((r) => r.id));
          const missingIds = promptVariantIds.filter((id) => !foundIds.has(id));
          throw new NotFoundError('Prompt variants', missingIds.join(', '));
        }
      }

      // 3. Calculate total jobs (the fan-out)
      const totalJobs =
        itemCount *
        promptVariantIds.length *
        data.models.length *
        data.repetitions;

      // 4. Create the run
      const runResult = await client.query(
        `INSERT INTO evaluation_runs 
           (task_id, name, status, models, repetitions, total_jobs)
         VALUES ($1, $2, 'pending', $3, $4, $5)
         RETURNING id, task_id, name, status, models, repetitions, 
                   total_jobs, completed_jobs, failed_jobs, created_at`,
        [
          data.task_id,
          data.name || `Run ${new Date().toISOString()}`,
          data.models,
          data.repetitions,
          totalJobs,
        ]
      );

      const run = runResult.rows[0];

      // 5. Link run to prompt variants (junction table)
      const junctionValues = promptVariantIds
        .map((_, i) => `($1, $${i + 2})`)
        .join(', ');

      await client.query(
        `INSERT INTO run_prompt_variants (run_id, prompt_variant_id)
         VALUES ${junctionValues}`,
        [run.id, ...promptVariantIds]
      );

      // 6. Initialize Redis progress counters
      await initRunProgress(run.id, totalJobs);

      await client.query('COMMIT');

      // 7. Return response with calculation breakdown
      res.status(201).json({
        ...run,
        prompt_variant_ids: promptVariantIds,
        calculation: {
          items: itemCount,
          prompts: promptVariantIds.length,
          models: data.models.length,
          repetitions: data.repetitions,
          total_jobs: totalJobs,
        },
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
// GET /api/runs - List all runs
// ============================================================
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(`
      SELECT 
        r.id,
        r.task_id,
        r.name,
        r.status,
        r.models,
        r.repetitions,
        r.total_jobs,
        r.completed_jobs,
        r.failed_jobs,
        r.started_at,
        r.completed_at,
        r.created_at,
        t.name as task_name
      FROM evaluation_runs r
      JOIN evaluation_tasks t ON t.id = r.task_id
      ORDER BY r.created_at DESC
    `);

    res.json({
      runs: result.rows,
      count: result.rowCount,
    });
  })
);

// ============================================================
// GET /api/runs/:id - Get run details with prompts
// ============================================================
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    validateUuid(id);

    // Get run
    const runResult = await query(
      `SELECT 
        r.id,
        r.task_id,
        r.name,
        r.status,
        r.models,
        r.repetitions,
        r.total_jobs,
        r.completed_jobs,
        r.failed_jobs,
        r.started_at,
        r.completed_at,
        r.created_at,
        t.name as task_name
      FROM evaluation_runs r
      JOIN evaluation_tasks t ON t.id = r.task_id
      WHERE r.id = $1`,
      [id]
    );

    if (runResult.rowCount === 0) {
      throw new NotFoundError('Run', id);
    }

    const run = runResult.rows[0];

    // Get linked prompt variants
    const promptsResult = await query(
      `SELECT p.id, p.name, p.version, p.template
       FROM prompt_variants p
       JOIN run_prompt_variants rpv ON rpv.prompt_variant_id = p.id
       WHERE rpv.run_id = $1`,
      [id]
    );

    res.json({
      ...run,
      prompt_variants: promptsResult.rows,
    });
  })
);

// ============================================================
// GET /api/runs/:id/status - Get live status from Redis
// ============================================================
router.get(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    validateUuid(id);

    // Get Redis progress (real-time)
    const redisProgress = await getRunProgress(id);

    // Get DB status (for status enum and timestamps)
    const dbResult = await query(
      `SELECT status, total_jobs, completed_jobs, failed_jobs, 
              started_at, completed_at
       FROM evaluation_runs WHERE id = $1`,
      [id]
    );

    if (dbResult.rowCount === 0) {
      throw new NotFoundError('Run', id);
    }

    const dbRun = dbResult.rows[0];

    // Merge Redis (live) with DB (persistent)
    const progress = redisProgress || {
      total: dbRun.total_jobs,
      completed: dbRun.completed_jobs,
      failed: dbRun.failed_jobs,
    };

    const percentComplete =
      progress.total > 0
        ? Math.round(((progress.completed + progress.failed) / progress.total) * 100)
        : 0;

    res.json({
      id,
      status: dbRun.status,
      total_jobs: progress.total,
      completed_jobs: progress.completed,
      failed_jobs: progress.failed,
      percent_complete: percentComplete,
      started_at: dbRun.started_at,
      completed_at: dbRun.completed_at,
      // Include elapsed time if running
      ...(dbRun.started_at &&
        !dbRun.completed_at && {
          elapsed_ms: Date.now() - new Date(dbRun.started_at).getTime(),
        }),
    });
  })
);

// ============================================================
// POST /api/runs/:id/start - Start the run (fan-out to Kafka)
// ============================================================
router.post(
  '/:id/start',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    validateUuid(id);

    // 1. Get run with task info and verify it's pending
    const runResult = await query(
      `SELECT 
        r.id, r.status, r.total_jobs, r.task_id, r.models, r.repetitions,
        t.expected_schema
       FROM evaluation_runs r
       JOIN evaluation_tasks t ON t.id = r.task_id
       WHERE r.id = $1`,
      [id]
    );

    if (runResult.rowCount === 0) {
      throw new NotFoundError('Run', id);
    }

    const run = runResult.rows[0];

    if (run.status !== 'pending') {
      throw new ConflictError(`Run is already ${run.status}`, {
        current_status: run.status,
      });
    }

    // 2. Get all task items
    const itemsResult = await query(
      `SELECT id, input, context, ground_truth
       FROM evaluation_task_items
       WHERE task_id = $1
       ORDER BY created_at ASC`,
      [run.task_id]
    );

    if (itemsResult.rowCount === 0) {
      throw new ValidationError('Task has no items', { task_id: run.task_id });
    }

    // 3. Get all prompt variants linked to this run
    const promptsResult = await query(
      `SELECT p.id, p.name, p.template, p.system_prompt
       FROM prompt_variants p
       JOIN run_prompt_variants rpv ON rpv.prompt_variant_id = p.id
       WHERE rpv.run_id = $1`,
      [id]
    );

    // 4. Generate all job permutations
    const jobs = [];
    const items = itemsResult.rows;
    const prompts = promptsResult.rows;
    const models = run.models;
    const repetitions = run.repetitions;

    for (const item of items) {
      for (const prompt of prompts) {
        for (const model of models) {
          for (let rep = 1; rep <= repetitions; rep++) {
            jobs.push({
              message: {
                job_id: randomUUID(),
                run_id: id,
                task_item: {
                  id: item.id,
                  input: item.input,
                  context: item.context,
                  ground_truth: item.ground_truth,
                },
                prompt_variant: {
                  id: prompt.id,
                  name: prompt.name,
                  template: prompt.template,
                  system_prompt: prompt.system_prompt,
                },
                model,
                repetition_index: rep,
                expected_schema: run.expected_schema,
              },
              // Use run_id as partition key for ordering within a run
              key: id,
            });
          }
        }
      }
    }

    // 5. Update status to running BEFORE sending to Kafka
    await query(
      `UPDATE evaluation_runs 
       SET status = 'running', started_at = NOW() 
       WHERE id = $1`,
      [id]
    );

    // 6. Send all jobs to Kafka in batches (to avoid memory issues)
    const BATCH_SIZE = 1000;
    let sentCount = 0;

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      const batch = jobs.slice(i, i + BATCH_SIZE);
      await sendBatch(TOPICS.EVALUATION_TASKS, batch);
      sentCount += batch.length;
    }

    console.log(`[Runs] Fan-out complete: ${sentCount} jobs sent to Kafka for run ${id}`);

    res.json({
      id,
      status: 'running',
      total_jobs: run.total_jobs,
      jobs_published: sentCount,
      breakdown: {
        items: items.length,
        prompts: prompts.length,
        models: models.length,
        repetitions,
      },
    });
  })
);

// ============================================================
// DELETE /api/runs/:id - Delete run
// ============================================================
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    validateUuid(id);

    const result = await query(
      `DELETE FROM evaluation_runs WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Run', id);
    }

    res.status(204).send();
  })
);

export default router;
