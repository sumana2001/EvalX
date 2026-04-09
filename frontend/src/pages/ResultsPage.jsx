import React, { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { AlertCircle, Loader2, TrendingUp, Clock, CheckCircle, XCircle } from 'lucide-react';
import { runsApi, resultsApi } from '../lib/api';

// Warm color palette matching design system
const COLORS = {
  primary: '#d97706',   // amber-600
  success: '#16a34a',   // green-600
  error: '#dc2626',     // red-600
  stone: '#78716c',     // stone-500
  muted: '#a8a29e',     // stone-400
};

const MODEL_COLORS = [
  '#d97706', // amber
  '#0891b2', // cyan
  '#7c3aed', // violet
  '#059669', // emerald
  '#dc2626', // red
  '#2563eb', // blue
];

/**
 * Results Page - Visualize evaluation results with charts.
 */
export default function ResultsPage() {
  const [searchParams] = useSearchParams();
  const { runId: pathRunId } = useParams();
  const runIdParam = pathRunId || searchParams.get('run');

  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(runIdParam || '');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modelFilter, setModelFilter] = useState('all');

  // Fetch completed runs on mount
  useEffect(() => {
    loadRuns();
  }, []);

  // Fetch results when run selected
  useEffect(() => {
    if (selectedRunId) {
      loadResults(selectedRunId);
    }
  }, [selectedRunId]);

  async function loadRuns() {
    try {
      const data = await runsApi.list();
      const completedRuns = (data.runs || []).filter(
        r => r.status === 'completed' || r.status === 'failed'
      );
      setRuns(completedRuns);
      
      // Auto-select first run or URL param
      if (runIdParam && completedRuns.find(r => r.id === runIdParam)) {
        setSelectedRunId(runIdParam);
      } else if (completedRuns.length > 0 && !selectedRunId) {
        setSelectedRunId(completedRuns[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadResults(runId) {
    try {
      setLoading(true);
      setModelFilter('all'); // Reset filter when changing runs
      const data = await resultsApi.getByRun(runId);
      setResults(data);
    } catch (err) {
      setError(err.message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Results</h1>
          <p className="text-stone-500 dark:text-stone-400 mt-1">
            Analyze evaluation metrics and compare model performance.
          </p>
        </div>

        {/* Run selector */}
        {runs.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-stone-600 dark:text-stone-400">Run:</label>
            <select
              className="input w-64"
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
            >
              {runs.map(run => (
                <option key={run.id} value={run.id}>
                  {run.name || `Run ${run.id.slice(0, 8)}`} ({run.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-error-50 dark:bg-error-900/30 border border-error-200 dark:border-error-800 rounded-lg flex items-center gap-3">
          <AlertCircle className="text-error-500 dark:text-error-400" size={20} />
          <p className="text-error-700 dark:text-error-400">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="card p-12 text-center">
          <Loader2 className="mx-auto text-stone-400 dark:text-stone-500 animate-spin mb-3" size={32} />
          <p className="text-stone-500 dark:text-stone-400">Loading results...</p>
        </div>
      )}

      {/* No runs available */}
      {!loading && runs.length === 0 && (
        <div className="card p-12 text-center">
          <TrendingUp className="mx-auto text-stone-300 dark:text-stone-600 mb-4" size={48} />
          <p className="text-stone-500 dark:text-stone-400 mb-2">No completed runs yet</p>
          <p className="text-sm text-stone-400 dark:text-stone-500">
            Results will appear here after evaluation runs complete.
          </p>
        </div>
      )}

      {/* Results content */}
      {!loading && results && (
        <div className="space-y-6">
          {/* Summary cards */}
          <SummaryCards results={results} />

          {/* Failures summary - shows prominently if there are failures */}
          <FailuresSummary results={results} />

          {/* Charts grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Model comparison */}
            <ModelComparisonChart results={results} />
            
            {/* Prompt comparison */}
            <PromptComparisonChart results={results} />
            
            {/* Latency distribution */}
            <LatencyChart results={results} />
            
            {/* Success/Failure pie */}
            <SuccessRateChart results={results} />
          </div>

          {/* Model filter for detailed tables */}
          {results.byModel && results.byModel.length > 1 && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-stone-600 dark:text-stone-400">Filter by model:</label>
              <select
                className="input w-64"
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
              >
                <option value="all">All Models</option>
                {results.byModel.map(m => (
                  <option key={m.model} value={m.model}>{m.model}</option>
                ))}
              </select>
            </div>
          )}

          {/* Detailed results table */}
          <ResultsTable results={results} modelFilter={modelFilter} />

          {/* Failures table */}
          <FailuresTable results={results} modelFilter={modelFilter} />
        </div>
      )}
    </div>
  );
}

/**
 * Summary cards showing key metrics.
 */
function SummaryCards({ results }) {
  const { summary } = results;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-100 dark:bg-accent-900/30">
            <TrendingUp size={20} className="text-accent-600 dark:text-accent-400" />
          </div>
          <div>
            <p className="text-sm text-stone-500 dark:text-stone-400">Avg Score</p>
            <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
              {(summary?.avgScore * 10 || 0).toFixed(1)}/10
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-stone-100 dark:bg-stone-700">
            <Clock size={20} className="text-stone-600 dark:text-stone-400" />
          </div>
          <div>
            <p className="text-sm text-stone-500 dark:text-stone-400">Avg Latency</p>
            <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
              {summary?.avgLatencyMs?.toFixed(0) || 0} ms
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-success-100 dark:bg-success-900/30">
            <CheckCircle size={20} className="text-success-600 dark:text-success-400" />
          </div>
          <div>
            <p className="text-sm text-stone-500 dark:text-stone-400">Passed</p>
            <p className="text-2xl font-semibold text-success-600 dark:text-success-400">
              {summary?.passed || 0}
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-error-100 dark:bg-error-900/30">
            <XCircle size={20} className="text-error-600 dark:text-error-400" />
          </div>
          <div>
            <p className="text-sm text-stone-500 dark:text-stone-400">Failed</p>
            <p className="text-2xl font-semibold text-error-600 dark:text-error-400">
              {summary?.failed || 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Bar chart comparing models by average score.
 */
function ModelComparisonChart({ results }) {
  const { byModel } = results;
  
  if (!byModel || byModel.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="font-medium text-stone-900 dark:text-stone-100 mb-4">Model Comparison</h3>
        <p className="text-stone-500 dark:text-stone-400 text-sm">No model data available</p>
      </div>
    );
  }

  const data = byModel.map(m => ({
    name: m.model.split('/').pop(), // Shorten model names
    score: (m.avgScore * 10).toFixed(1),
    latency: m.avgLatencyMs,
  }));

  return (
    <div className="card p-6">
      <h3 className="font-medium text-stone-900 dark:text-stone-100 mb-4">Model Comparison (Avg Score)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#57534e" strokeOpacity={0.3} />
          <XAxis type="number" domain={[0, 10]} stroke="#78716c" fontSize={12} />
          <YAxis type="category" dataKey="name" stroke="#78716c" fontSize={12} width={100} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--tooltip-bg, white)',
              border: '1px solid #57534e',
              borderRadius: '8px',
              color: 'var(--tooltip-text, black)',
            }}
          />
          <Bar dataKey="score" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Line chart showing latency by model.
 */
function LatencyChart({ results }) {
  const { byModel } = results;
  
  if (!byModel || byModel.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="font-medium text-stone-900 dark:text-stone-100 mb-4">Latency Distribution</h3>
        <p className="text-stone-500 dark:text-stone-400 text-sm">No latency data available</p>
      </div>
    );
  }

  const data = byModel.map(m => ({
    name: m.model.split('/').pop(),
    latency: m.avgLatencyMs,
    p95: m.p95LatencyMs || m.avgLatencyMs * 1.5,
  }));

  return (
    <div className="card p-6">
      <h3 className="font-medium text-stone-900 dark:text-stone-100 mb-4">Latency by Model (ms)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#57534e" strokeOpacity={0.3} />
          <XAxis dataKey="name" stroke="#78716c" fontSize={12} />
          <YAxis stroke="#78716c" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--tooltip-bg, white)',
              border: '1px solid #57534e',
              borderRadius: '8px',
            }}
          />
          <Bar dataKey="latency" name="Avg Latency" fill={COLORS.stone} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Metrics breakdown as grouped bar chart.
 */
function MetricsRadarChart({ results }) {
  const { byModel } = results;
  
  if (!byModel || byModel.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="font-medium text-stone-900 dark:text-stone-100 mb-4">Metrics Breakdown</h3>
        <p className="text-stone-500 dark:text-stone-400 text-sm">No metrics data available</p>
      </div>
    );
  }

  // Prepare data for grouped bar chart
  const metrics = ['Completeness', 'Relevance', 'Faithfulness', 'Judge Score'];
  const data = metrics.map(metric => {
    const point = { metric };
    byModel.forEach((m, i) => {
      const shortName = m.model.split('/').pop().slice(0, 10);
      point[shortName] = (m[`avg${metric.replace(' ', '')}`] || m.avgScore || 0) * 10;
    });
    return point;
  });

  return (
    <div className="card p-6">
      <h3 className="font-medium text-stone-900 dark:text-stone-100 mb-4">Metrics by Model</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#57534e" strokeOpacity={0.3} />
          <XAxis dataKey="metric" stroke="#78716c" fontSize={11} />
          <YAxis domain={[0, 10]} stroke="#78716c" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--tooltip-bg, white)',
              border: '1px solid #57534e',
              borderRadius: '8px',
            }}
          />
          <Legend />
          {byModel.map((m, i) => (
            <Bar
              key={m.model}
              dataKey={m.model.split('/').pop().slice(0, 10)}
              fill={MODEL_COLORS[i % MODEL_COLORS.length]}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Pie chart showing pass/fail distribution.
 */
function SuccessRateChart({ results }) {
  const { summary } = results;
  
  const data = [
    { name: 'Passed', value: summary?.passed || 0 },
    { name: 'Failed', value: summary?.failed || 0 },
  ];

  const total = data[0].value + data[1].value;
  const successRate = total > 0 ? ((data[0].value / total) * 100).toFixed(1) : 0;

  return (
    <div className="card p-6">
      <h3 className="font-medium text-stone-900 dark:text-stone-100 mb-4">Success Rate</h3>
      <div className="flex items-center justify-center">
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              <Cell fill={COLORS.success} />
              <Cell fill={COLORS.error} />
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--tooltip-bg, white)',
                border: '1px solid #57534e',
                borderRadius: '8px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="ml-4">
          <p className="text-3xl font-semibold text-stone-900 dark:text-stone-100">{successRate}%</p>
          <p className="text-sm text-stone-500 dark:text-stone-400">Success Rate</p>
          <div className="mt-3 space-y-1 text-sm">
            <p className="flex items-center gap-2 text-stone-700 dark:text-stone-300">
              <span className="w-3 h-3 rounded-full bg-success-500" />
              Passed: {data[0].value}
            </p>
            <p className="flex items-center gap-2 text-stone-700 dark:text-stone-300">
              <span className="w-3 h-3 rounded-full bg-error-500" />
              Failed: {data[1].value}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Detailed results table with expandable rows.
 */
function ResultsTable({ results, modelFilter = 'all' }) {
  const { items } = results;
  const [expandedRow, setExpandedRow] = useState(null);
  
  // Filter items by model
  const filteredItems = modelFilter === 'all' 
    ? items 
    : items?.filter(item => item.model === modelFilter);
  
  if (!filteredItems || filteredItems.length === 0) {
    return null;
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-stone-100 dark:border-stone-700">
        <h3 className="font-medium text-stone-900 dark:text-stone-100">Detailed Results</h3>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
          Click a row to see the full output
          {modelFilter !== 'all' && ` • Filtered by: ${modelFilter}`}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 dark:bg-stone-800">
            <tr>
              <th className="px-4 py-3 text-left text-stone-600 dark:text-stone-300 font-medium">Input</th>
              <th className="px-4 py-3 text-left text-stone-600 dark:text-stone-300 font-medium">Model</th>
              <th className="px-4 py-3 text-center text-stone-600 dark:text-stone-300 font-medium">Score</th>
              <th className="px-4 py-3 text-center text-stone-600 dark:text-stone-300 font-medium">Latency</th>
              <th className="px-4 py-3 text-center text-stone-600 dark:text-stone-300 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
            {filteredItems.slice(0, 20).map((item, i) => (
              <React.Fragment key={i}>
                <tr 
                  className="hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer"
                  onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                >
                  <td className="px-4 py-3 text-stone-900 dark:text-stone-100 max-w-xs truncate">
                    {item.input?.slice(0, 50) || 'N/A'}{item.input?.length > 50 ? '...' : ''}
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                    {item.model?.split('/').pop() || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-medium ${
                      item.score >= 0.7 ? 'text-success-600 dark:text-success-400' :
                      item.score >= 0.5 ? 'text-warning-600 dark:text-warning-400' :
                      'text-error-600 dark:text-error-400'
                    }`}>
                      {item.score ? (item.score * 10).toFixed(1) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-stone-600 dark:text-stone-400">
                    {item.latencyMs || '—'} ms
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.passed ? (
                      <span className="badge badge-success">Pass</span>
                    ) : (
                      <span className="badge badge-error">Fail</span>
                    )}
                  </td>
                </tr>
                {expandedRow === i && (
                  <tr className="bg-stone-50 dark:bg-stone-800">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="space-y-3">
                        <div>
                          <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">Full Input</span>
                          <p className="mt-1 text-stone-700 dark:text-stone-300 whitespace-pre-wrap">{item.input || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">Model Output</span>
                          <pre className="mt-1 text-stone-700 dark:text-stone-300 whitespace-pre-wrap bg-white dark:bg-stone-900 p-3 rounded border border-stone-200 dark:border-stone-700 text-sm overflow-x-auto">
                            {item.raw_output || 'No output available'}
                          </pre>
                        </div>
                        {(item.completeness != null || item.faithfulness != null) && (
                          <div className="flex gap-6">
                            {item.completeness != null && (
                              <div>
                                <span className="text-xs font-medium text-stone-500 dark:text-stone-400">Completeness</span>
                                <p className="text-stone-700 dark:text-stone-300">{(item.completeness * 100).toFixed(0)}%</p>
                              </div>
                            )}
                            {item.faithfulness != null && (
                              <div>
                                <span className="text-xs font-medium text-stone-500 dark:text-stone-400">Faithfulness</span>
                                <p className="text-stone-700 dark:text-stone-300">{(item.faithfulness * 100).toFixed(0)}%</p>
                              </div>
                            )}
                            {item.contextRelevance != null && (
                              <div>
                                <span className="text-xs font-medium text-stone-500 dark:text-stone-400">Context Relevance</span>
                                <p className="text-stone-700 dark:text-stone-300">{(item.contextRelevance * 100).toFixed(0)}%</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > 20 && (
        <div className="p-4 text-center border-t border-stone-100 dark:border-stone-700">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Showing 20 of {items.length} results
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Prompt comparison chart - shows which prompt variant performed best.
 */
function PromptComparisonChart({ results }) {
  const { byPrompt } = results;
  
  if (!byPrompt || byPrompt.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="font-medium text-stone-900 dark:text-stone-100 mb-4">Prompt Comparison</h3>
        <p className="text-stone-500 dark:text-stone-400 text-sm">No prompt comparison data available</p>
      </div>
    );
  }

  const data = byPrompt.map((p, i) => ({
    name: p.promptName || `Prompt ${i + 1}`,
    score: p.avgScore ? (p.avgScore * 10).toFixed(1) : 0,
    count: p.count,
  }));

  return (
    <div className="card p-6">
      <h3 className="font-medium text-stone-900 dark:text-stone-100 mb-4">Prompt Comparison (Avg Score)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#57534e" strokeOpacity={0.3} />
          <XAxis type="number" domain={[0, 10]} stroke="#78716c" fontSize={12} />
          <YAxis type="category" dataKey="name" stroke="#78716c" fontSize={12} width={120} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--tooltip-bg, white)',
              border: '1px solid #57534e',
              borderRadius: '8px',
            }}
            formatter={(value) => [`${value}/10`, 'Avg Score']}
          />
          <Bar dataKey="score" fill="#0891b2" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 text-sm text-stone-500 dark:text-stone-400">
        {byPrompt.length > 1 && (
          <p>
            Best performing: <span className="font-medium text-stone-900 dark:text-stone-100">{data[0]?.name}</span> 
            {' '}with {data[0]?.score}/10 avg score
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Failures summary - shows breakdown of failure reasons.
 */
function FailuresSummary({ results }) {
  const { failures } = results;
  
  if (!failures || failures.length === 0) {
    return null;
  }

  // Group failures by type
  const byType = failures.reduce((acc, f) => {
    const type = f.failureType || 'Unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  // Group failures by model
  const byModel = failures.reduce((acc, f) => {
    const model = f.model?.split('/').pop() || 'Unknown';
    acc[model] = (acc[model] || 0) + 1;
    return acc;
  }, {});

  // Get a sample error message for context
  const sampleError = failures[0]?.errorMessage;

  return (
    <div className="card p-5 bg-error-50 dark:bg-error-900/20 border-error-200 dark:border-error-800">
      <div className="flex items-start gap-4">
        <div className="p-2 rounded-lg bg-error-100 dark:bg-error-900/30">
          <XCircle size={24} className="text-error-600 dark:text-error-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-error-900 dark:text-error-300">
            {failures.length} Execution{failures.length > 1 ? 's' : ''} Failed
          </h3>
          
          {/* Failure types breakdown */}
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(byType).map(([type, count]) => (
              <span key={type} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-error-100 dark:bg-error-900/40 text-error-700 dark:text-error-400">
                <span className="font-medium">{count}×</span> {type.replace(/_/g, ' ')}
              </span>
            ))}
          </div>

          {/* Models affected */}
          <p className="mt-2 text-sm text-error-700 dark:text-error-400">
            <span className="font-medium">Affected models:</span>{' '}
            {Object.entries(byModel).map(([model, count], i) => (
              <span key={model}>
                {i > 0 && ', '}
                {model} ({count})
              </span>
            ))}
          </p>

          {/* Sample error for context */}
          {sampleError && (
            <div className="mt-3 p-2 rounded bg-error-100 dark:bg-error-900/40">
              <p className="text-xs text-error-600 dark:text-error-400 font-mono">
                <span className="font-medium">Sample error:</span> {sampleError.slice(0, 200)}{sampleError.length > 200 ? '...' : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Failures table - shows failed executions with error messages.
 */
function FailuresTable({ results, modelFilter = 'all' }) {
  const { failures } = results;
  
  // Filter failures by model
  const filteredFailures = modelFilter === 'all'
    ? failures
    : failures?.filter(f => f.model === modelFilter);
  
  if (!filteredFailures || filteredFailures.length === 0) {
    return null;
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-stone-100 dark:border-stone-700">
        <h3 className="font-medium text-stone-900 dark:text-stone-100">Failed Executions Details</h3>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
          {filteredFailures.length} failures
          {modelFilter !== 'all' && ` • Filtered by: ${modelFilter}`}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 dark:bg-stone-800">
            <tr>
              <th className="px-4 py-3 text-left text-stone-600 dark:text-stone-300 font-medium">Input</th>
              <th className="px-4 py-3 text-left text-stone-600 dark:text-stone-300 font-medium">Model</th>
              <th className="px-4 py-3 text-left text-stone-600 dark:text-stone-300 font-medium">Failure Type</th>
              <th className="px-4 py-3 text-left text-stone-600 dark:text-stone-300 font-medium">Error Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
            {filteredFailures.slice(0, 20).map((failure, i) => (
              <tr key={i} className="hover:bg-stone-50 dark:hover:bg-stone-800">
                <td className="px-4 py-3 text-stone-900 dark:text-stone-100 max-w-xs truncate">
                  {failure.input?.slice(0, 40) || 'N/A'}{failure.input?.length > 40 ? '...' : ''}
                </td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                  {failure.model?.split('/').pop() || 'N/A'}
                </td>
                <td className="px-4 py-3">
                  <span className="badge badge-error">{failure.failureType || 'Unknown'}</span>
                </td>
                <td className="px-4 py-3 text-error-600 dark:text-error-400 text-xs max-w-md">
                  {failure.errorMessage?.slice(0, 100) || 'No error message'}
                  {failure.errorMessage?.length > 100 ? '...' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredFailures.length > 20 && (
        <div className="p-4 text-center border-t border-stone-100 dark:border-stone-700">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Showing 20 of {filteredFailures.length} failures
          </p>
        </div>
      )}
    </div>
  );
}
