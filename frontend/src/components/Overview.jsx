/**
 * Overview — dashboard home with KPI cards, deployment chart, and recent activity.
 */

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import {
  CheckCircle2, XCircle, Clock, AlertTriangle,
  TrendingUp, Activity
} from 'lucide-react';
import { api } from '../hooks/useApi';

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/stats')
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!stats) return <EmptyState />;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Pipeline Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Real-time deployment intelligence across all services</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={CheckCircle2}
          iconColor="text-emerald-400"
          label="Success Rate"
          value={`${stats.success_rate}%`}
          sub={`${stats.success_count} of ${stats.total_deployments} deploys`}
          gradient="from-emerald-500/10 to-transparent"
        />
        <KpiCard
          icon={Clock}
          iconColor="text-pipeline-400"
          label="Mean Time to Resolve"
          value={`${stats.mttr}m`}
          sub="Average across all failures"
          gradient="from-pipeline-500/10 to-transparent"
        />
        <KpiCard
          icon={XCircle}
          iconColor="text-red-400"
          label="Failures This Week"
          value={stats.failures_this_week}
          sub={`${stats.total_incidents} total incidents`}
          gradient="from-red-500/10 to-transparent"
        />
        <KpiCard
          icon={AlertTriangle}
          iconColor="text-amber-400"
          label="Riskiest Service"
          value={stats.riskiest_service?.service || 'N/A'}
          sub={stats.riskiest_service ? `${stats.riskiest_service.failure_rate}% failure rate` : 'No data'}
          gradient="from-amber-500/10 to-transparent"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Deployment trend chart */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-300">Deployment Activity</h2>
              <p className="text-xs text-gray-500 mt-0.5">Last 30 days</p>
            </div>
            <Activity className="w-4 h-4 text-gray-600" />
          </div>
          {stats.deploys_per_day.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.deploys_per_day} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(17,24,39,0.95)',
                    border: '1px solid rgba(75,85,99,0.3)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  labelFormatter={(d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                />
                <Bar dataKey="successes" name="Success" stackId="a" radius={[0, 0, 0, 0]}>
                  {stats.deploys_per_day.map((_, i) => (
                    <Cell key={i} fill="rgba(16,185,129,0.7)" />
                  ))}
                </Bar>
                <Bar dataKey="failures" name="Failed" stackId="a" radius={[4, 4, 0, 0]}>
                  {stats.deploys_per_day.map((_, i) => (
                    <Cell key={i} fill="rgba(239,68,68,0.7)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-600 text-sm">
              No deployment data in the last 30 days
            </div>
          )}
        </div>

        {/* Service breakdown */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300">Services</h2>
            <TrendingUp className="w-4 h-4 text-gray-600" />
          </div>
          <div className="space-y-3">
            {stats.deploys_per_service.map((svc) => {
              const rate = svc.total > 0 ? Math.round((svc.successes / svc.total) * 100) : 0;
              return (
                <div key={svc.service}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-gray-300">{svc.service}</span>
                    <span className="text-gray-500">{svc.total} deploys · {rate}% ok</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${rate}%`,
                        background: rate >= 80
                          ? 'linear-gradient(90deg, #10b981, #34d399)'
                          : rate >= 60
                            ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                            : 'linear-gradient(90deg, #ef4444, #f87171)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent deployments */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Recent Deployments</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800/50">
                <th className="text-left pb-3 pr-4">Service</th>
                <th className="text-left pb-3 pr-4">Version</th>
                <th className="text-left pb-3 pr-4">Author</th>
                <th className="text-left pb-3 pr-4">Type</th>
                <th className="text-left pb-3 pr-4">Status</th>
                <th className="text-left pb-3 pr-4">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {stats.recent_deploys.map((d) => (
                <tr key={d.id} className="hover:bg-gray-800/20 transition-colors">
                  <td className="py-3 pr-4 font-medium text-gray-200">{d.service}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-gray-400">v{d.version}</td>
                  <td className="py-3 pr-4 text-gray-400">{d.author}</td>
                  <td className="py-3 pr-4">
                    <span className="text-xs text-gray-500 bg-gray-800/40 px-2 py-0.5 rounded-md">
                      {d.change_type}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`badge badge-${d.status}`}>{d.status}</span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-500">
                    {new Date(d.timestamp).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function KpiCard({ icon: Icon, iconColor, label, value, sub, gradient }) {
  return (
    <div className="kpi-card">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-2xl pointer-events-none`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-500 mt-1">{sub}</p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="skeleton h-7 w-48 mb-2" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-card p-5">
            <div className="skeleton h-3 w-20 mb-3" />
            <div className="skeleton h-7 w-16 mb-1" />
            <div className="skeleton h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="glass-card p-5">
        <div className="skeleton h-64 w-full" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-96 text-center">
      <Activity className="w-12 h-12 text-gray-700 mb-4" />
      <h2 className="text-lg font-semibold text-gray-400">No data yet</h2>
      <p className="text-sm text-gray-600 mt-1">
        Run <code className="text-pipeline-400 bg-gray-800 px-2 py-0.5 rounded">npm run seed</code> to populate demo data.
      </p>
    </div>
  );
}
