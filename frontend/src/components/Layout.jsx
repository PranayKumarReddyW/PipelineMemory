/**
 * Layout — sidebar navigation + main content area.
 *
 * Dark glass-morphism sidebar with animated nav items and
 * a gradient accent at the top.
 */

import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Clock, ShieldAlert, BrainCircuit,
  Network, MessageCircle, Database, Brain
} from 'lucide-react';
import { api } from '../hooks/useApi';

const NAV_ITEMS = [
  { to: '/',         label: 'Overview',     icon: LayoutDashboard },
  { to: '/timeline', label: 'Timeline',     icon: Clock },
  { to: '/predict',  label: 'Risk Predictor', icon: ShieldAlert },
  { to: '/patterns', label: 'Patterns',     icon: BrainCircuit },
  { to: '/graph',    label: 'Service Graph', icon: Network },
  { to: '/ask',      label: 'Ask Agent',    icon: MessageCircle },
];

export default function Layout({ children }) {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.get('/health')
      .then(setHealth)
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* ---- Sidebar ---- */}
      <aside className="w-64 flex-shrink-0 bg-gray-950/80 backdrop-blur-xl border-r border-gray-800/50 flex flex-col fixed h-full z-20">
        {/* Brand */}
        <div className="px-5 py-6 border-b border-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pipeline-500 to-purple-600 flex items-center justify-center shadow-lg shadow-pipeline-600/30">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">PipelineMemory</h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">DevOps Intelligence</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item-active' : ''}`
              }
            >
              <Icon className="w-[18px] h-[18px]" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3.5 border-t border-gray-800/50 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-gray-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow shadow-emerald-500/50 animate-pulse" />
              <span>Pipeline Agent</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">Active</span>
          </div>

          <div className="flex items-center justify-between text-[10px] px-2.5 py-1.5 rounded-lg bg-gray-900/60 border border-gray-800/60">
            <span className="flex items-center gap-1.5 text-pipeline-400 font-medium">
              <Brain className="w-3.5 h-3.5" />
              Hindsight
            </span>
            <span className="text-gray-400 font-mono text-[10px]">
              {health?.hindsight_bank || 'pipeline-memory'}
            </span>
          </div>
        </div>
      </aside>

      {/* ---- Main content ---- */}
      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-6 lg:p-8 max-w-[1440px] mx-auto page-enter">
          {children}
        </div>
      </main>
    </div>
  );
}
