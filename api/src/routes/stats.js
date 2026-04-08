/**
 * Stats API Routes - Dashboard statistics
 * 
 * Endpoints:
 *   GET /api/stats/dashboard - Get overall platform statistics
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { query } from '../lib/db.js';

const router = Router();

// ============================================================
// GET /api/stats/dashboard - Get dashboard statistics
// ============================================================
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    // Get run counts by status
    const runsResult = await query(`
      SELECT 
        COUNT(*)::int as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::int as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END)::int as failed,
        COUNT(CASE WHEN status = 'running' THEN 1 END)::int as running,
        COUNT(CASE WHEN status = 'pending' THEN 1 END)::int as pending
      FROM evaluation_runs
    `);

    // Get task count
    const tasksResult = await query(`
      SELECT COUNT(*)::int as total FROM evaluation_tasks
    `);

    // Get execution results stats
    const resultsResult = await query(`
      SELECT 
        COUNT(*)::int as total,
        AVG(latency_ms)::float as "avgLatencyMs",
        AVG(judge_score)::float as "avgJudgeScore"
      FROM execution_results
    `);

    // Get failure count
    const failuresResult = await query(`
      SELECT COUNT(*)::int as total FROM evaluation_failures
    `);

    // Get recent runs (last 5)
    const recentRunsResult = await query(`
      SELECT 
        r.id, r.name, r.status, r.total_jobs, r.completed_jobs, r.failed_jobs,
        r.created_at, t.name as task_name
      FROM evaluation_runs r
      JOIN evaluation_tasks t ON t.id = r.task_id
      ORDER BY r.created_at DESC
      LIMIT 5
    `);

    // Get model usage stats
    const modelStatsResult = await query(`
      SELECT 
        model,
        COUNT(*)::int as count,
        AVG(latency_ms)::float as "avgLatencyMs",
        AVG(judge_score)::float as "avgScore"
      FROM execution_results
      GROUP BY model
      ORDER BY count DESC
      LIMIT 5
    `);

    const runs = runsResult.rows[0];
    const results = resultsResult.rows[0];
    const failures = failuresResult.rows[0];

    const totalExecutions = (results?.total || 0) + (failures?.total || 0);
    const successRate = totalExecutions > 0 
      ? ((results?.total || 0) / totalExecutions * 100).toFixed(1)
      : null;

    res.json({
      runs: {
        total: runs?.total || 0,
        completed: runs?.completed || 0,
        failed: runs?.failed || 0,
        running: runs?.running || 0,
        pending: runs?.pending || 0,
      },
      tasks: {
        total: tasksResult.rows[0]?.total || 0,
      },
      executions: {
        total: totalExecutions,
        passed: results?.total || 0,
        failed: failures?.total || 0,
        successRate: successRate ? parseFloat(successRate) : null,
        avgLatencyMs: results?.avgLatencyMs || null,
        avgScore: results?.avgJudgeScore ? results.avgJudgeScore / 10 : null,
      },
      recentRuns: recentRunsResult.rows,
      modelStats: modelStatsResult.rows.map(m => ({
        ...m,
        avgScore: m.avgScore ? m.avgScore / 10 : null,
      })),
    });
  })
);

export default router;
