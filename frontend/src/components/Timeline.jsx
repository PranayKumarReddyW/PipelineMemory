/**
 * Timeline — chronological view of all deployment events, color-coded by status.
 *
 * Shows deployments, failures, and infra changes on a single timeline
 * with filtering controls.
 */

import { useEffect, useState } from 'react';
import {
  Rocket, XOctagon, RotateCcw, Server,
  Filter, ChevronDown
} from 'lucide-react';
import { api } from '../hooks/useApi';

const STATUS_CONFIG = {
  success:     { color: 'emerald', icon: Rocket,     label: 'Deployed' },
  failed:      { color: 'red',     icon: XOctagon,   label: 'Failed' },
  rolled_back: { color: 'amber',   icon: RotateCcw,  label: 'Rolled Back' },
};

export default function Timeline() {
  const [deployments, setDeployments] = useState([]);
  const [infraChanges, setInfraChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterService, setFilterService] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/deployments?limit=100'),
      api.get('/infra-changes?limit=50'),
    ])
      .then(([depData, infraData]) => {
        setDeployments(depData.deployments);
        setInfraChanges(infraData.changes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  /* Merge and sort events chronologically */
  const events = [
    ...deployments.map(d => ({ ...d, eventType: 'deployment', sortTime: d.timestamp })),
    ...infraChanges.map(ic => ({ ...ic, eventType: 'infra', sortTime: ic.timestamp })),
  ].sort((a, b) => new Date(b.sortTime) - new Date(a.sortTime));

  /* Apply filters */
  const filtered = events.filter(e => {
    if (filterService && e.service !== filterService && e.linked_service !== filterService) return false;
    if (filterStatus && e.eventType === 'deployment' && e.status !== filterStatus) return false;
    return true;
  });

  const services = [...new Set(deployments.map(d => d.service))].sort();

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-7 w-40" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="skeleton h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Event Timeline</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} events across {services.length} services
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={filterService}
              onChange={(e) => setFilterService(e.target.value)}
              className="form-select text-xs pr-8 py-2"
            >
              <option value="">All Services</option>
              {services.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="form-select text-xs pr-8 py-2"
            >
              <option value="">All Statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="rolled_back">Rolled Back</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Filter className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">No events match the current filters</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-gray-700/50 via-gray-800/30 to-transparent" />

          <div className="space-y-2">
            {filtered.map((event, i) => (
              <TimelineEvent key={`${event.eventType}-${event.id}-${i}`} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineEvent({ event }) {
  if (event.eventType === 'infra') {
    return (
      <div className="relative pl-14 animate-fade-in">
        {/* Dot */}
        <div className="absolute left-[18px] top-5 w-3 h-3 rounded-full bg-purple-500/60 border-2 border-gray-900 shadow shadow-purple-500/30 z-10" />

        <div className="glass-card p-4 hover:border-gray-700/50 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-medium text-purple-400 uppercase tracking-wider">Infra Change</span>
            <span className="text-xs text-gray-600 ml-auto">
              {new Date(event.timestamp).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
          <p className="text-sm text-gray-300">{event.change_description}</p>
          <p className="text-xs text-gray-500 mt-1">Resource: {event.resource}</p>
        </div>
      </div>
    );
  }

  const config = STATUS_CONFIG[event.status];
  const Icon = config.icon;
  const colorMap = {
    emerald: { dot: 'bg-emerald-400 shadow-emerald-500/30', text: 'text-emerald-400' },
    red:     { dot: 'bg-red-400 shadow-red-500/30',         text: 'text-red-400' },
    amber:   { dot: 'bg-amber-400 shadow-amber-500/30',     text: 'text-amber-400' },
  };
  const colors = colorMap[config.color];

  return (
    <div className="relative pl-14 animate-fade-in">
      {/* Status dot */}
      <div className={`absolute left-[18px] top-5 w-3 h-3 rounded-full ${colors.dot} border-2 border-gray-900 shadow z-10`} />

      <div className="glass-card p-4 hover:border-gray-700/50 transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 mb-2">
            <Icon className={`w-3.5 h-3.5 ${colors.text}`} />
            <span className={`text-xs font-medium ${colors.text} uppercase tracking-wider`}>
              {config.label}
            </span>
            <span className={`badge badge-${event.status} text-[10px]`}>{event.status}</span>
          </div>
          <span className="text-xs text-gray-600">
            {new Date(event.timestamp).toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="font-medium text-gray-200">{event.service}</span>
          <span className="font-mono text-xs text-gray-500">v{event.version}</span>
          <span className="text-xs text-gray-500">by {event.author}</span>
        </div>

        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span className="bg-gray-800/40 px-2 py-0.5 rounded-md">{event.change_type}</span>
          <span>{event.lines_changed} lines · {event.files_changed} files</span>
          {event.duration_sec && <span>{event.duration_sec}s</span>}
          {event.notes && <span className="text-gray-600 italic truncate max-w-xs">— {event.notes}</span>}
        </div>
      </div>
    </div>
  );
}
