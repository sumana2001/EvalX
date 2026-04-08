import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, FileJson, AlertCircle, Copy, Loader2 } from 'lucide-react';
import { tasksApi, promptsApi } from '../lib/api';

/**
 * Tasks Page - Create and manage evaluation tasks.
 */
export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Fetch tasks on mount
  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      setLoading(true);
      const data = await tasksApi.list();
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTaskCreated(newTask) {
    setTasks([newTask, ...tasks]);
    setShowCreateForm(false);
  }

  async function handleDeleteTask(taskId) {
    if (!confirm('Delete this task? This cannot be undone.')) return;
    
    try {
      await tasksApi.delete(taskId);
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (err) {
      alert('Failed to delete task: ' + err.message);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Evaluation Tasks</h1>
          <p className="text-stone-500 mt-1">
            Define datasets, prompts, and expected schemas for evaluation.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          New Task
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-error-50 border border-error-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="text-error-500" size={20} />
          <p className="text-error-700">{error}</p>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <CreateTaskForm
          onSuccess={handleTaskCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Tasks list */}
      {loading ? (
        <div className="card p-8 text-center">
          <p className="text-stone-500">Loading tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="card p-8 text-center">
          <FileJson className="mx-auto text-stone-300 mb-4" size={48} />
          <p className="text-stone-500 mb-2">No evaluation tasks yet</p>
          <p className="text-sm text-stone-400">
            Create your first task to define a dataset and prompts for evaluation.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onDelete={() => handleDeleteTask(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Task card component - displays a single task with prompt variants.
 */
function TaskCard({ task, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [taskDetails, setTaskDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showAddPrompt, setShowAddPrompt] = useState(false);

  // Fetch full task details when expanded
  async function handleExpand() {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    
    if (newExpanded && !taskDetails) {
      setLoading(true);
      try {
        const details = await tasksApi.get(task.id);
        setTaskDetails(details);
      } catch (err) {
        console.error('Failed to load task details:', err);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handlePromptCreated(newPrompt) {
    // Add to local state
    setTaskDetails(prev => ({
      ...prev,
      prompt_variants: [...(prev?.prompt_variants || []), newPrompt],
    }));
    setShowAddPrompt(false);
  }

  async function handleDeletePrompt(promptId) {
    if (!confirm('Delete this prompt variant?')) return;
    try {
      await promptsApi.delete(promptId);
      setTaskDetails(prev => ({
        ...prev,
        prompt_variants: prev.prompt_variants.filter(p => p.id !== promptId),
      }));
    } catch (err) {
      alert('Failed to delete prompt: ' + err.message);
    }
  }

  const promptVariants = taskDetails?.prompt_variants || [];

  return (
    <div className="card">
      {/* Header */}
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-stone-50 transition-colors"
        onClick={handleExpand}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown size={18} className="text-stone-400" />
          ) : (
            <ChevronRight size={18} className="text-stone-400" />
          )}
          <div>
            <h3 className="font-medium text-stone-900">{task.name}</h3>
            <p className="text-sm text-stone-500">{task.description || 'No description'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge badge-neutral">
            {task.item_count || 0} items
          </span>
          <span className="badge bg-accent-100 text-accent-700">
            {task.prompt_count ?? promptVariants.length ?? 0} prompts
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-error-500 transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-stone-100 mt-2 pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-stone-400" size={24} />
            </div>
          ) : (
            <>
              {/* Expected Schema */}
              <div className="mb-6">
                <h4 className="font-medium text-stone-700 mb-2">Expected Output Schema</h4>
                <pre className="bg-stone-50 p-3 rounded-lg text-stone-600 text-xs overflow-x-auto">
                  {taskDetails?.expected_schema 
                    ? JSON.stringify(taskDetails.expected_schema, null, 2) 
                    : task.expected_schema 
                      ? JSON.stringify(task.expected_schema, null, 2)
                      : 'N/A'}
                </pre>
              </div>

              {/* Prompt Variants */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-stone-700">Prompt Variants</h4>
                  <button
                    onClick={() => setShowAddPrompt(true)}
                    className="btn-ghost text-sm flex items-center gap-1"
                  >
                    <Plus size={16} />
                    Add Variant
                  </button>
                </div>

                {/* Add prompt form */}
                {showAddPrompt && (
                  <AddPromptForm
                    taskId={task.id}
                    taskName={task.name}
                    variantNumber={promptVariants.length + 1}
                    onSuccess={handlePromptCreated}
                    onCancel={() => setShowAddPrompt(false)}
                  />
                )}

                {/* Prompt list */}
                {promptVariants.length === 0 ? (
                  <p className="text-sm text-stone-400 py-4">
                    No prompt variants yet. Add one to start evaluating.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {promptVariants.map((prompt, idx) => (
                      <div 
                        key={prompt.id} 
                        className="bg-stone-50 p-3 rounded-lg border border-stone-200"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-stone-700">
                            {prompt.name || `Variant ${idx + 1}`}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-stone-400">v{prompt.version}</span>
                            {promptVariants.length > 1 && (
                              <button
                                onClick={() => handleDeletePrompt(prompt.id)}
                                className="p-1 hover:bg-stone-200 rounded text-stone-400 hover:text-error-500"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                        <pre className="text-xs text-stone-600 whitespace-pre-wrap font-mono">
                          {prompt.template}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Add prompt variant form (inline).
 */
function AddPromptForm({ taskId, taskName, variantNumber, onSuccess, onCancel }) {
  const [template, setTemplate] = useState('You are a helpful assistant.\n\n{{input}}');
  const [name, setName] = useState(`${taskName} Prompt V${variantNumber}`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!template.includes('{{input}}')) {
      setError('Template must contain {{input}} placeholder');
      return;
    }

    setSubmitting(true);
    try {
      const prompt = await promptsApi.create({
        name,
        template,
        task_id: taskId,
        version: variantNumber,
      });
      onSuccess(prompt);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-4 bg-accent-50 rounded-lg border border-accent-200">
      {error && (
        <p className="text-sm text-error-600 mb-3">{error}</p>
      )}
      <div className="mb-3">
        <label className="text-sm text-stone-600 mb-1 block">Variant Name</label>
        <input
          type="text"
          className="input text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="mb-3">
        <label className="text-sm text-stone-600 mb-1 block">
          Template <span className="text-stone-400">(use {'{{input}}'} and {'{{context}}'})</span>
        </label>
        <textarea
          className="input text-sm font-mono"
          rows={4}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          required
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost text-sm">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="btn-primary text-sm">
          {submitting ? 'Adding...' : 'Add Variant'}
        </button>
      </div>
    </form>
  );
}

/**
 * Create task form component.
 */
function CreateTaskForm({ onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prompt_template: 'You are a helpful assistant.\n\nContext: {{context}}\n\nQuestion: {{input}}\n\nAnswer:',
    expected_schema: '{\n  "type": "object",\n  "properties": {\n    "answer": { "type": "string" }\n  },\n  "required": ["answer"]\n}',
    items: [{ input: '', context: '', ground_truth: '' }],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function handleChange(field, value) {
    setFormData({ ...formData, [field]: value });
  }

  function handleItemChange(index, field, value) {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  }

  function addItem() {
    setFormData({
      ...formData,
      items: [...formData.items, { input: '', context: '', ground_truth: '' }],
    });
  }

  function removeItem(index) {
    if (formData.items.length === 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    
    // Parse schema JSON
    let schema;
    try {
      schema = JSON.parse(formData.expected_schema);
    } catch {
      setError('Invalid JSON in expected schema');
      return;
    }

    // Validate items
    const validItems = formData.items.filter(item => item.input.trim());
    if (validItems.length === 0) {
      setError('At least one dataset item with input is required');
      return;
    }

    setSubmitting(true);
    try {
      const task = await tasksApi.create({
        name: formData.name,
        description: formData.description,
        prompt_template: formData.prompt_template,
        expected_schema: schema,
        items: validItems,
      });
      onSuccess(task);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card mb-6">
      <div className="p-4 border-b border-stone-100">
        <h2 className="text-lg font-semibold text-stone-900">Create New Task</h2>
      </div>
      
      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {error && (
          <div className="p-3 bg-error-50 border border-error-200 rounded-lg text-error-700 text-sm">
            {error}
          </div>
        )}

        {/* Basic info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Task Name *</label>
            <input
              type="text"
              className="input"
              placeholder="e.g., QA Evaluation"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Description</label>
            <input
              type="text"
              className="input"
              placeholder="Optional description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
            />
          </div>
        </div>

        {/* Prompt template */}
        <div>
          <label className="label">
            Prompt Template
            <span className="text-stone-400 font-normal ml-2">
              Use {'{{input}}'} and {'{{context}}'} as placeholders
            </span>
          </label>
          <textarea
            className="input font-mono text-sm"
            rows={5}
            placeholder="Enter your prompt template..."
            value={formData.prompt_template}
            onChange={(e) => handleChange('prompt_template', e.target.value)}
          />
        </div>

        {/* Expected schema */}
        <div>
          <label className="label">Expected Output Schema (JSON)</label>
          <textarea
            className="input font-mono text-sm"
            rows={6}
            placeholder='{"type": "object", ...}'
            value={formData.expected_schema}
            onChange={(e) => handleChange('expected_schema', e.target.value)}
          />
        </div>

        {/* Dataset items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="label mb-0">Dataset Items</label>
            <button
              type="button"
              onClick={addItem}
              className="btn-ghost text-sm flex items-center gap-1"
            >
              <Plus size={16} />
              Add Item
            </button>
          </div>
          
          <div className="space-y-4">
            {formData.items.map((item, index) => (
              <div key={index} className="bg-stone-50 p-4 rounded-lg border border-stone-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-stone-600">Item {index + 1}</span>
                  {formData.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-stone-400 hover:text-error-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Input *</label>
                    <textarea
                      className="input text-sm"
                      rows={2}
                      placeholder="Question or input text"
                      value={item.input}
                      onChange={(e) => handleItemChange(index, 'input', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Context</label>
                    <textarea
                      className="input text-sm"
                      rows={2}
                      placeholder="Optional context"
                      value={item.context}
                      onChange={(e) => handleItemChange(index, 'context', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Ground Truth</label>
                    <textarea
                      className="input text-sm"
                      rows={2}
                      placeholder="Expected answer"
                      value={item.ground_truth}
                      onChange={(e) => handleItemChange(index, 'ground_truth', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
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
            {submitting ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
