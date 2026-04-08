/**
 * API Service - HTTP client for EvalX backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Generic fetch wrapper with error handling.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(url, config);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// ============================================================
// Tasks API
// ============================================================

export const tasksApi = {
  /**
   * List all tasks.
   */
  list: () => request('/api/tasks'),

  /**
   * Get a single task by ID.
   */
  get: (id) => request(`/api/tasks/${id}`),

  /**
   * Create a new task.
   */
  create: (data) => request('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * Update a task.
   */
  update: (id, data) => request(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  /**
   * Delete a task.
   */
  delete: (id) => request(`/api/tasks/${id}`, {
    method: 'DELETE',
  }),
};

// ============================================================
// Runs API
// ============================================================

export const runsApi = {
  /**
   * List all runs.
   */
  list: () => request('/api/runs'),

  /**
   * Get a single run by ID.
   */
  get: (id) => request(`/api/runs/${id}`),

  /**
   * Create a new run.
   */
  create: (data) => request('/api/runs', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * Start a run (trigger fan-out).
   */
  start: (id) => request(`/api/runs/${id}/start`, {
    method: 'POST',
  }),

  /**
   * Get run progress.
   */
  progress: (id) => request(`/api/runs/${id}/progress`),

  /**
   * Get run results.
   */
  results: (id) => request(`/api/runs/${id}/results`),
};

// ============================================================
// Results API
// ============================================================

export const resultsApi = {
  /**
   * Get aggregated results for a run.
   */
  getByRun: (runId) => request(`/api/results/run/${runId}`),

  /**
   * Get results by model for comparison.
   */
  compareModels: (runId) => request(`/api/results/run/${runId}/compare`),
};

// ============================================================
// Prompts API
// ============================================================

export const promptsApi = {
  /**
   * List prompts, optionally filtered by task.
   */
  list: (taskId) => request(taskId ? `/api/prompts?task_id=${taskId}` : '/api/prompts'),

  /**
   * Get a single prompt by ID.
   */
  get: (id) => request(`/api/prompts/${id}`),

  /**
   * Create a new prompt variant.
   */
  create: (data) => request('/api/prompts', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * Delete a prompt.
   */
  delete: (id) => request(`/api/prompts/${id}`, {
    method: 'DELETE',
  }),
};

// ============================================================
// Stats API
// ============================================================

export const statsApi = {
  /**
   * Get dashboard statistics.
   */
  dashboard: () => request('/api/stats/dashboard'),
};
