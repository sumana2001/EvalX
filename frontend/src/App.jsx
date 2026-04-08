import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { BarChart3, Play, Settings, Database, TrendingUp, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import TasksPage from './pages/TasksPage';
import RunsPage from './pages/RunsPage';
import ResultsPage from './pages/ResultsPage';
import { statsApi } from './lib/api';

// Dashboard component - shows overall platform metrics
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await statsApi.dashboard();
        setStats(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="animate-spin text-stone-400" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-700">
          Failed to load dashboard: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-stone-900 mb-6">Dashboard</h1>
      
      {/* Key metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-100">
              <Play size={20} className="text-accent-600" />
            </div>
            <div>
              <p className="text-sm text-stone-500">Total Runs</p>
              <p className="text-2xl font-semibold text-stone-900">{stats?.runs?.total || 0}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success-100">
              <CheckCircle size={20} className="text-success-600" />
            </div>
            <div>
              <p className="text-sm text-stone-500">Success Rate</p>
              <p className="text-2xl font-semibold text-success-600">
                {stats?.executions?.successRate != null ? `${stats.executions.successRate}%` : '--'}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-stone-100">
              <Clock size={20} className="text-stone-600" />
            </div>
            <div>
              <p className="text-sm text-stone-500">Avg Latency</p>
              <p className="text-2xl font-semibold text-stone-900">
                {stats?.executions?.avgLatencyMs ? `${Math.round(stats.executions.avgLatencyMs)} ms` : '--'}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-100">
              <TrendingUp size={20} className="text-accent-600" />
            </div>
            <div>
              <p className="text-sm text-stone-500">Avg Score</p>
              <p className="text-2xl font-semibold text-stone-900">
                {stats?.executions?.avgScore != null ? `${(stats.executions.avgScore * 10).toFixed(1)}/10` : '--'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card p-4 text-center">
          <p className="text-sm text-stone-500">Tasks</p>
          <p className="text-xl font-semibold text-stone-900">{stats?.tasks?.total || 0}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-sm text-stone-500">Completed Runs</p>
          <p className="text-xl font-semibold text-success-600">{stats?.runs?.completed || 0}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-sm text-stone-500">Failed Runs</p>
          <p className="text-xl font-semibold text-error-600">{stats?.runs?.failed || 0}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-sm text-stone-500">Total Executions</p>
          <p className="text-xl font-semibold text-stone-900">{stats?.executions?.total || 0}</p>
        </div>
      </div>

      {/* Recent runs */}
      {stats?.recentRuns?.length > 0 && (
        <div className="card mb-8">
          <div className="p-4 border-b border-stone-100">
            <h3 className="font-medium text-stone-900">Recent Runs</h3>
          </div>
          <div className="divide-y divide-stone-100">
            {stats.recentRuns.map(run => (
              <div key={run.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-stone-900">{run.name || `Run ${run.id.slice(0, 8)}`}</p>
                  <p className="text-sm text-stone-500">{run.task_name}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-stone-500">
                    {run.completed_jobs + run.failed_jobs}/{run.total_jobs} jobs
                  </span>
                  <span className={`badge ${
                    run.status === 'completed' ? 'badge-success' :
                    run.status === 'failed' ? 'badge-error' :
                    run.status === 'running' ? 'bg-accent-100 text-accent-700' :
                    'badge-neutral'
                  }`}>
                    {run.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model stats */}
      {stats?.modelStats?.length > 0 && (
        <div className="card">
          <div className="p-4 border-b border-stone-100">
            <h3 className="font-medium text-stone-900">Model Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-4 py-3 text-left text-stone-600 font-medium">Model</th>
                  <th className="px-4 py-3 text-center text-stone-600 font-medium">Executions</th>
                  <th className="px-4 py-3 text-center text-stone-600 font-medium">Avg Score</th>
                  <th className="px-4 py-3 text-center text-stone-600 font-medium">Avg Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {stats.modelStats.map(model => (
                  <tr key={model.model}>
                    <td className="px-4 py-3 text-stone-900 font-medium">{model.model}</td>
                    <td className="px-4 py-3 text-center text-stone-600">{model.count}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-medium ${
                        model.avgScore >= 0.7 ? 'text-success-600' :
                        model.avgScore >= 0.5 ? 'text-warning-600' :
                        'text-error-600'
                      }`}>
                        {model.avgScore != null ? (model.avgScore * 10).toFixed(1) : '--'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-stone-600">
                      {model.avgLatencyMs ? `${Math.round(model.avgLatencyMs)} ms` : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {(!stats?.recentRuns?.length && !stats?.modelStats?.length) && (
        <div className="card p-8 text-center">
          <Database className="mx-auto text-stone-300 mb-4" size={48} />
          <p className="text-stone-500 mb-2">No data yet</p>
          <p className="text-sm text-stone-400">
            Create tasks and run evaluations to see metrics here.
          </p>
        </div>
      )}
    </div>
  );
}

// Navigation link component
function NavItem({ to, icon: Icon, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors duration-150 ${
          isActive
            ? 'bg-accent-100 text-accent-700 font-medium'
            : 'text-stone-600 hover:bg-stone-100'
        }`
      }
    >
      <Icon size={20} />
      <span>{children}</span>
    </NavLink>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-stone-200 flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-stone-200">
            <h1 className="text-xl font-semibold text-stone-900">
              Eval<span className="text-accent-600">X</span>
            </h1>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            <NavItem to="/" icon={BarChart3}>Dashboard</NavItem>
            <NavItem to="/tasks" icon={Database}>Tasks</NavItem>
            <NavItem to="/runs" icon={Play}>Runs</NavItem>
            <NavItem to="/results" icon={Settings}>Results</NavItem>
          </nav>
          
          {/* Footer */}
          <div className="p-4 border-t border-stone-200">
            <p className="text-xs text-stone-400">EvalX v1.0.0</p>
          </div>
        </aside>
        
        {/* Main content */}
        <main className="flex-1 bg-stone-50">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/results/:runId" element={<ResultsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
