import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { BarChart3, Play, Settings, Database } from 'lucide-react';
import TasksPage from './pages/TasksPage';
import RunsPage from './pages/RunsPage';
import ResultsPage from './pages/ResultsPage';

// Dashboard placeholder - summarizes overall metrics
function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-stone-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6">
          <h3 className="text-sm font-medium text-stone-500 mb-1">Total Runs</h3>
          <p className="text-3xl font-semibold text-stone-900">0</p>
        </div>
        <div className="card p-6">
          <h3 className="text-sm font-medium text-stone-500 mb-1">Success Rate</h3>
          <p className="text-3xl font-semibold text-success-600">--</p>
        </div>
        <div className="card p-6">
          <h3 className="text-sm font-medium text-stone-500 mb-1">Avg Latency</h3>
          <p className="text-3xl font-semibold text-stone-900">-- ms</p>
        </div>
      </div>
      <div className="mt-6 card p-6">
        <p className="text-stone-500">
          Create tasks and runs to see metrics here. Visit <strong>Results</strong> after completing runs.
        </p>
      </div>
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
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
