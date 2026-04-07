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
          <h1 className="text-2xl font-semibold text-stone-900">Results</h1>
          <p className="text-stone-500 mt-1">
            Analyze evaluation metrics and compare model performance.
          </p>
        </div>

        {/* Run selector */}
        {runs.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-stone-600">Run:</label>
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
        <div className="mb-6 p-4 bg-error-50 border border-error-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="text-error-500" size={20} />
          <p className="text-error-700">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="card p-12 text-center">
          <Loader2 className="mx-auto text-stone-400 animate-spin mb-3" size={32} />
          <p className="text-stone-500">Loading results...</p>
        </div>
      )}

      {/* No runs available */}
      {!loading && runs.length === 0 && (
        <div className="card p-12 text-center">
          <TrendingUp className="mx-auto text-stone-300 mb-4" size={48} />
          <p className="text-stone-500 mb-2">No completed runs yet</p>
          <p className="text-sm text-stone-400">
            Results will appear here after evaluation runs complete.
          </p>
        </div>
      )}

      {/* Results content */}
      {!loading && results && (
        <div className="space-y-6">
          {/* Summary cards */}
          <SummaryCards results={results} />

          {/* Charts grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Model comparison */}
            <ModelComparisonChart results={results} />
            
            {/* Latency distribution */}
            <LatencyChart results={results} />
            
            {/* Metrics breakdown */}
            <MetricsRadarChart results={results} />
            
            {/* Success/Failure pie */}
            <SuccessRateChart results={results} />
          </div>

          {/* Detailed results table */}
          <ResultsTable results={results} />
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
          <div className="p-2 rounded-lg bg-accent-100">
            <TrendingUp size={20} className="text-accent-600" />
          </div>
          <div>
            <p className="text-sm text-stone-500">Avg Score</p>
            <p className="text-2xl font-semibold text-stone-900">
              {(summary?.avgScore * 10 || 0).toFixed(1)}/10
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-stone-100">
            <Clock size={20} className="text-stone-600" />
          </div>
          <div>
            <p className="text-sm text-stone-500">Avg Latency</p>
            <p className="text-2xl font-semibold text-stone-900">
              {summary?.avgLatencyMs?.toFixed(0) || 0} ms
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-success-100">
            <CheckCircle size={20} className="text-success-600" />
          </div>
          <div>
            <p className="text-sm text-stone-500">Passed</p>
            <p className="text-2xl font-semibold text-success-600">
              {summary?.passed || 0}
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-error-100">
            <XCircle size={20} className="text-error-600" />
          </div>
          <div>
            <p className="text-sm text-stone-500">Failed</p>
            <p className="text-2xl font-semibold text-error-600">
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
        <h3 className="font-medium text-stone-900 mb-4">Model Comparison</h3>
        <p className="text-stone-500 text-sm">No model data available</p>
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
      <h3 className="font-medium text-stone-900 mb-4">Model Comparison (Avg Score)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis type="number" domain={[0, 10]} stroke="#78716c" fontSize={12} />
          <YAxis type="category" dataKey="name" stroke="#78716c" fontSize={12} width={100} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e7e5e4',
              borderRadius: '8px',
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
        <h3 className="font-medium text-stone-900 mb-4">Latency Distribution</h3>
        <p className="text-stone-500 text-sm">No latency data available</p>
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
      <h3 className="font-medium text-stone-900 mb-4">Latency by Model (ms)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="name" stroke="#78716c" fontSize={12} />
          <YAxis stroke="#78716c" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e7e5e4',
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
        <h3 className="font-medium text-stone-900 mb-4">Metrics Breakdown</h3>
        <p className="text-stone-500 text-sm">No metrics data available</p>
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
      <h3 className="font-medium text-stone-900 mb-4">Metrics by Model</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="metric" stroke="#78716c" fontSize={11} />
          <YAxis domain={[0, 10]} stroke="#78716c" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e7e5e4',
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
      <h3 className="font-medium text-stone-900 mb-4">Success Rate</h3>
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
                backgroundColor: 'white',
                border: '1px solid #e7e5e4',
                borderRadius: '8px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="ml-4">
          <p className="text-3xl font-semibold text-stone-900">{successRate}%</p>
          <p className="text-sm text-stone-500">Success Rate</p>
          <div className="mt-3 space-y-1 text-sm">
            <p className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-success-500" />
              Passed: {data[0].value}
            </p>
            <p className="flex items-center gap-2">
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
function ResultsTable({ results }) {
  const { items } = results;
  const [expandedRow, setExpandedRow] = useState(null);
  
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-stone-100">
        <h3 className="font-medium text-stone-900">Detailed Results</h3>
        <p className="text-sm text-stone-500 mt-1">Click a row to see the full output</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-4 py-3 text-left text-stone-600 font-medium">Input</th>
              <th className="px-4 py-3 text-left text-stone-600 font-medium">Model</th>
              <th className="px-4 py-3 text-center text-stone-600 font-medium">Score</th>
              <th className="px-4 py-3 text-center text-stone-600 font-medium">Latency</th>
              <th className="px-4 py-3 text-center text-stone-600 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {items.slice(0, 20).map((item, i) => (
              <React.Fragment key={i}>
                <tr 
                  className="hover:bg-stone-50 cursor-pointer"
                  onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                >
                  <td className="px-4 py-3 text-stone-900 max-w-xs truncate">
                    {item.input?.slice(0, 50) || 'N/A'}{item.input?.length > 50 ? '...' : ''}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {item.model?.split('/').pop() || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-medium ${
                      item.score >= 0.7 ? 'text-success-600' :
                      item.score >= 0.5 ? 'text-warning-600' :
                      'text-error-600'
                    }`}>
                      {item.score ? (item.score * 10).toFixed(1) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-stone-600">
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
                  <tr className="bg-stone-50">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="space-y-3">
                        <div>
                          <span className="text-xs font-medium text-stone-500 uppercase">Full Input</span>
                          <p className="mt-1 text-stone-700 whitespace-pre-wrap">{item.input || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-stone-500 uppercase">Model Output</span>
                          <pre className="mt-1 text-stone-700 whitespace-pre-wrap bg-white p-3 rounded border border-stone-200 text-sm overflow-x-auto">
                            {item.raw_output || 'No output available'}
                          </pre>
                        </div>
                        {(item.completeness != null || item.faithfulness != null) && (
                          <div className="flex gap-6">
                            {item.completeness != null && (
                              <div>
                                <span className="text-xs font-medium text-stone-500">Completeness</span>
                                <p className="text-stone-700">{(item.completeness * 100).toFixed(0)}%</p>
                              </div>
                            )}
                            {item.faithfulness != null && (
                              <div>
                                <span className="text-xs font-medium text-stone-500">Faithfulness</span>
                                <p className="text-stone-700">{(item.faithfulness * 100).toFixed(0)}%</p>
                              </div>
                            )}
                            {item.contextRelevance != null && (
                              <div>
                                <span className="text-xs font-medium text-stone-500">Context Relevance</span>
                                <p className="text-stone-700">{(item.contextRelevance * 100).toFixed(0)}%</p>
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
        <div className="p-4 text-center border-t border-stone-100">
          <p className="text-sm text-stone-500">
            Showing 20 of {items.length} results
          </p>
        </div>
      )}
    </div>
  );
}
