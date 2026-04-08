/**
 * Results API Routes
 * 
 * Endpoints:
 *   GET /api/results/run/:runId - Get aggregated results for a run
 *   GET /api/results/run/:runId/compare - Get model comparison data
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { NotFoundError } from '../lib/errors.js';
import { validateUuid } from '../lib/validation.js';
import { query } from '../lib/db.js';

const router = Router();

// ============================================================
// GET /api/results/run/:runId - Get aggregated results
// ============================================================
router.get(
  '/run/:runId',
  asyncHandler(async (req, res) => {
    const { runId } = req.params;
    validateUuid(runId, 'runId');

    // Verify run exists
    const runResult = await query(
      `SELECT id, name, status, total_jobs, completed_jobs, failed_jobs 
       FROM evaluation_runs WHERE id = $1`,
      [runId]
    );

    if (runResult.rowCount === 0) {
      throw new NotFoundError('Run', runId);
    }

    const run = runResult.rows[0];

    // Get summary statistics
    // Results in execution_results = successful, evaluation_failures = failed
    const successResult = await query(`
      SELECT 
        COUNT(*)::int as total,
        AVG(judge_score)::float as "avgJudgeScore",
        AVG(latency_ms)::float as "avgLatencyMs",
        AVG(completeness)::float as "avgCompleteness",
        AVG(faithfulness)::float as "avgFaithfulness"
      FROM execution_results
      WHERE run_id = $1
    `, [runId]);

    const failedResult = await query(`
      SELECT COUNT(*)::int as total FROM evaluation_failures WHERE run_id = $1
    `, [runId]);

    const successCount = successResult.rows[0]?.total || 0;
    const failedCount = failedResult.rows[0]?.total || 0;
    const avgJudgeScore = successResult.rows[0]?.avgJudgeScore;

    const summaryResult = {
      rows: [{
        total: successCount + failedCount,
        passed: successCount,
        failed: failedCount,
        avgScore: avgJudgeScore ? avgJudgeScore / 10 : 0,
        avgLatencyMs: successResult.rows[0]?.avgLatencyMs || 0,
        avgCompleteness: successResult.rows[0]?.avgCompleteness || 0,
        avgFaithfulness: successResult.rows[0]?.avgFaithfulness || 0,
      }]
    };

    const summary = summaryResult.rows[0] || {
      total: 0,
      passed: 0,
      failed: 0,
      avgScore: 0,
      avgLatencyMs: 0,
    };

    // Get results grouped by model
    const byModelResult = await query(`
      SELECT 
        model,
        COUNT(*)::int as count,
        AVG(judge_score)::float / 10 as "avgScore",
        AVG(latency_ms)::float as "avgLatencyMs",
        AVG(completeness)::float as "avgCompleteness",
        AVG(faithfulness)::float as "avgFaithfulness",
        AVG(context_relevance)::float as "avgContextRelevance",
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::float as "p95LatencyMs",
        COUNT(*)::int as passed,
        0::int as failed
      FROM execution_results
      WHERE run_id = $1
      GROUP BY model
      ORDER BY "avgScore" DESC NULLS LAST
    `, [runId]);

    // Get individual result items (limited)
    // All items in execution_results are successful executions
    const itemsResult = await query(`
      SELECT 
        er.id,
        er.model,
        er.raw_output,
        true as passed,
        er.judge_score as score,
        er.latency_ms as "latencyMs",
        er.completeness,
        er.faithfulness,
        er.context_relevance as "contextRelevance",
        ti.input,
        pv.name as "promptName"
      FROM execution_results er
      LEFT JOIN evaluation_task_items ti ON er.task_item_id = ti.id
      LEFT JOIN prompt_variants pv ON er.prompt_variant_id = pv.id
      WHERE er.run_id = $1
      ORDER BY er.executed_at DESC
      LIMIT 100
    `, [runId]);

    // Transform items - score is 1-10, normalize to 0-1
    const items = itemsResult.rows.map(item => ({
      ...item,
      score: item.score ? item.score / 10 : 0,
    }));

    // Get failed items from evaluation_failures table
    const failuresResult = await query(`
      SELECT 
        ef.id,
        ef.model,
        ef.failure_type as "failureType",
        ef.error_message as "errorMessage",
        ef.raw_output,
        ef.failed_at as "failedAt",
        ti.input,
        pv.name as "promptName"
      FROM evaluation_failures ef
      LEFT JOIN evaluation_task_items ti ON ef.task_item_id = ti.id
      LEFT JOIN prompt_variants pv ON ef.prompt_variant_id = pv.id
      WHERE ef.run_id = $1
      ORDER BY ef.failed_at DESC
      LIMIT 100
    `, [runId]);

    // Get results grouped by prompt variant
    const byPromptResult = await query(`
      SELECT 
        pv.name as "promptName",
        pv.id as "promptVariantId",
        COUNT(*)::int as count,
        AVG(er.judge_score)::float / 10 as "avgScore",
        AVG(er.latency_ms)::float as "avgLatencyMs",
        AVG(er.completeness)::float as "avgCompleteness",
        AVG(er.faithfulness)::float as "avgFaithfulness"
      FROM execution_results er
      LEFT JOIN prompt_variants pv ON er.prompt_variant_id = pv.id
      WHERE er.run_id = $1
      GROUP BY pv.id, pv.name
      ORDER BY "avgScore" DESC NULLS LAST
    `, [runId]);

    res.json({
      run: {
        id: run.id,
        name: run.name,
        status: run.status,
      },
      summary,
      byModel: byModelResult.rows,
      byPrompt: byPromptResult.rows,
      items,
      failures: failuresResult.rows,
    });
  })
);

// ============================================================
// GET /api/results/run/:runId/compare - Model comparison
// ============================================================
router.get(
  '/run/:runId/compare',
  asyncHandler(async (req, res) => {
    const { runId } = req.params;
    validateUuid(runId, 'runId');

    // Get detailed comparison by model and prompt
    const comparisonResult = await query(`
      SELECT 
        er.model,
        pv.name as "promptName",
        pv.id as "promptVariantId",
        COUNT(*)::int as count,
        AVG(er.judge_score)::float / 10 as "avgScore",
        AVG(er.latency_ms)::float as "avgLatencyMs",
        AVG(er.completeness)::float as "avgCompleteness",
        AVG(er.faithfulness)::float as "avgFaithfulness",
        COUNT(CASE WHEN er.schema_valid = true THEN 1 END)::int as passed,
        COUNT(CASE WHEN er.schema_valid = false THEN 1 END)::int as failed
      FROM execution_results er
      LEFT JOIN prompt_variants pv ON er.prompt_variant_id = pv.id
      WHERE er.run_id = $1
      GROUP BY er.model, pv.name, pv.id
      ORDER BY er.model, pv.name
    `, [runId]);

    res.json({
      runId,
      comparison: comparisonResult.rows,
    });
  })
);

export default router;
