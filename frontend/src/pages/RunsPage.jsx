import { useState, useEffect } from 'react';
import { Plus, Play, CheckCircle, XCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { runsApi, tasksApi } from '../lib/api';
import { useMultiRunProgress } from '../hooks/useRunProgress';

/**
 * Runs Page - Create and monitor evaluation runs with real-time progress.
 */
export default function RunsPage() {
  const [runs, setRuns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Get IDs of active (running) runs for socket subscription
  const activeRunIds = runs
    .filter(r => r.status === 'running')
    .map(r => r.id);
  
  const { progressMap, isConnected } = useMultiRunProgress(activeRunIds);

  // Fetch runs and tasks on mount
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [runsData, tasksData] = await Promise.all([
        runsApi.list(),
        tasksApi.list(),
      ]);
      setRuns(runsData.runs || []);
      setTasks(tasksData.tasks || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunCreated(newRun) {
    setRuns([newRun, ...runs]);
    setShowCreateForm(false);
  }

  async function handleStartRun(runId) {
    try {
      await runsApi.start(runId);
      // Update run status locally
      setRuns(runs.map(r => 
        r.id === runId ? { ...r, status: 'running' } : r
      ));
    } catch (err) {
      alert('Failed to start run: ' + err.message);
    }
  }

  // Merge socket progress with run data
  const runsWithProgress = runs.map(run => ({
    ...run,
    progress: progressMap[run.id] || null,
  }));

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Evaluation Runs</h1>
          <p className="text-stone-500 mt-1">
            Run evaluations across multiple models with real-time progress.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {activeRunIds.length > 0 && (
            <span className={`flex items-center gap-2 text-sm ${isConnected ? 'text-success-600' : 'text-stone-400'}`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success-500' : 'bg-stone-300'}`} />
              {isConnected ? 'Live' : 'Connecting...'}
            </span>
          )}
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            New Run
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-error-50 border border-error-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="text-error-500" size={20} />
          <p className="text-error-700">{error}</p>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && tasks.length > 0 && (
        <CreateRunForm
          tasks={tasks}
          onSuccess={handleRunCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {showCreateForm && tasks.length === 0 && (
        <div className="card mb-6 p-6 text-center">
          <p className="text-stone-500">Create a task first before starting a run.</p>
          <a href="/tasks" className="text-accent-600 hover:underline mt-2 inline-block">
            Go to Tasks →
          </a>
        </div>
      )}

      {/* Runs list */}
      {loading ? (
        <div className="card p-8 text-center">
          <Loader2 className="mx-auto text-stone-400 animate-spin mb-2" size={24} />
          <p className="text-stone-500">Loading runs...</p>
        </div>
      ) : runsWithProgress.length === 0 ? (
        <div className="card p-8 text-center">
          <Play className="mx-auto text-stone-300 mb-4" size={48} />
          <p className="text-stone-500 mb-2">No evaluation runs yet</p>
          <p className="text-sm text-stone-400">
            Create a run to start evaluating your LLM outputs.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {runsWithProgress.map(run => (
            <RunCard
              key={run.id}
              run={run}
              onStart={() => handleStartRun(run.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Run card component with progress bar.
 */
function RunCard({ run, onStart }) {
  const progress = run.progress;
  const percentComplete = progress?.percentComplete || 0;
  const isActive = run.status === 'running';
  const isPending = run.status === 'pending';

  return (
    <div className="card">
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <StatusIcon status={run.status} />
            <div>
              <h3 className="font-medium text-stone-900">{run.name || `Run ${run.id.slice(0, 8)}`}</h3>
              <p className="text-sm text-stone-500">
                {run.task_name || 'Unknown task'} • {run.total_jobs || 0} jobs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={run.status} />
            {isPending && (
              <button onClick={onStart} className="btn-primary text-sm py-1.5">
                Start Run
              </button>
            )}
          </div>
        </div>

        {/* Progress bar (only for running/completed) */}
        {(isActive || run.status === 'completed' || run.status === 'failed') && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-stone-600">Progress</span>
              <span className="text-stone-900 font-medium">
                {progress ? `${progress.completed + progress.failed} / ${progress.total}` : `${run.completed_jobs || 0} / ${run.total_jobs || 0}`}
              </span>
            </div>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  run.status === 'failed' ? 'bg-error-500' :
                  run.status === 'completed' ? 'bg-success-500' :
                  'bg-accent-500'
                }`}
                style={{ width: `${progress?.percentComplete || percentComplete || (run.completed_jobs / run.total_jobs * 100) || 0}%` }}
              />
            </div>
            
            {/* Stats row */}
            {progress && (
              <div className="flex items-center gap-6 mt-3 text-sm">
                <span className="text-success-600">
                  ✓ {progress.completed} completed
                </span>
                <span className="text-error-600">
                  ✗ {progress.failed} failed
                </span>
                <span className="text-stone-500">
                  ◷ {progress.pending} pending
                </span>
              </div>
            )}
          </div>
        )}

        {/* Models list */}
        {run.models && run.models.length > 0 && (
          <div className="mt-4 pt-4 border-t border-stone-100">
            <p className="text-xs text-stone-500 mb-2">Models</p>
            <div className="flex flex-wrap gap-2">
              {run.models.map(model => (
                <span key={model} className="badge badge-neutral">
                  {model}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Status icon component.
 */
function StatusIcon({ status }) {
  const icons = {
    pending: <Clock size={20} className="text-stone-400" />,
    running: <Loader2 size={20} className="text-accent-500 animate-spin" />,
    completed: <CheckCircle size={20} className="text-success-500" />,
    failed: <XCircle size={20} className="text-error-500" />,
  };
  return icons[status] || icons.pending;
}

/**
 * Status badge component.
 */
function StatusBadge({ status }) {
  const badges = {
    pending: <span className="badge badge-neutral">Pending</span>,
    running: <span className="badge bg-accent-100 text-accent-700">Running</span>,
    completed: <span className="badge badge-success">Completed</span>,
    failed: <span className="badge badge-error">Failed</span>,
  };
  return badges[status] || badges.pending;
}

/**
 * Create run form.
 */
function CreateRunForm({ tasks, onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    task_id: tasks[0]?.id || '',
    name: '',
    models: ['llama-3.3-70b-versatile'],
    repetitions: 1,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Pre-defined model options (all free)
  const modelOptions = [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Groq)', provider: 'groq' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Groq)', provider: 'groq' },
    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Groq)', provider: 'groq' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'gemini' },
    { value: 'ollama/llama3', label: 'Llama 3 (Ollama Local)', provider: 'ollama' },
  ];

  function toggleModel(model) {
    const models = formData.models.includes(model)
      ? formData.models.filter(m => m !== model)
      : [...formData.models, model];
    setFormData({ ...formData, models });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (formData.models.length === 0) {
      setError('Select at least one model');
      return;
    }

    setSubmitting(true);
    try {
      const run = await runsApi.create({
        task_id: formData.task_id,
        name: formData.name || undefined,
        models: formData.models,
        repetitions: formData.repetitions,
      });
      onSuccess(run);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card mb-6">
      <div className="p-4 border-b border-stone-100">
        <h2 className="text-lg font-semibold text-stone-900">Create New Run</h2>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {error && (
          <div className="p-3 bg-error-50 border border-error-200 rounded-lg text-error-700 text-sm">
            {error}
          </div>
        )}

        {/* Task selection */}
        <div>
          <label className="label">Evaluation Task *</label>
          <select
            className="input"
            value={formData.task_id}
            onChange={(e) => setFormData({ ...formData, task_id: e.target.value })}
            required
          >
            {tasks.map(task => (
              <option key={task.id} value={task.id}>
                {task.name} ({task.item_count || 0} items)
              </option>
            ))}
          </select>
        </div>

        {/* Run name */}
        <div>
          <label className="label">Run Name (optional)</label>
          <input
            type="text"
            className="input"
            placeholder="e.g., Baseline comparison"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        {/* Model selection */}
        <div>
          <label className="label">Models to Evaluate *</label>
          <div className="grid grid-cols-2 gap-3">
            {modelOptions.map(model => (
              <label
                key={model.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  formData.models.includes(model.value)
                    ? 'border-accent-500 bg-accent-50'
                    : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={formData.models.includes(model.value)}
                  onChange={() => toggleModel(model.value)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                  formData.models.includes(model.value)
                    ? 'border-accent-500 bg-accent-500'
                    : 'border-stone-300'
                }`}>
                  {formData.models.includes(model.value) && (
                    <CheckCircle size={12} className="text-white" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-stone-900 text-sm">{model.label}</p>
                  <p className="text-xs text-stone-500">{model.provider}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Repetitions */}
        <div>
          <label className="label">Repetitions per item</label>
          <input
            type="number"
            className="input w-24"
            min={1}
            max={10}
            value={formData.repetitions}
            onChange={(e) => setFormData({ ...formData, repetitions: parseInt(e.target.value) || 1 })}
          />
          <p className="text-xs text-stone-500 mt-1">
            Run each input multiple times to measure consistency
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-stone-100">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Creating...' : 'Create Run'}
          </button>
        </div>
      </form>
    </div>
  );
}
