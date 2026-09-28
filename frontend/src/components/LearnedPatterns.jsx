/**
 * Learned Patterns — table of auto-discovered deployment patterns
 * with evidence counts, risk multipliers, and change types.
 */

import { useEffect, useState } from 'react';
import { BrainCircuit, RefreshCcw, Loader2, Zap, TrendingUp } from 'lucide-react';
import { api } from '../hooks/useApi';

export default function LearnedPatterns() {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const fetchPatterns = () => {
    setLoading(true);
    api.get('/patterns')
      .then(data => setPatterns(data.patterns))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPatterns(); }, []);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const data = await api.post('/patterns/recompute', {});
      setPatterns(data.patterns);
    } catch (err) {
      console.error(err);
    } finally {
      setRecomputing(false);
    }
  };

  /* Color for risk multiplier */
  const multiplierColor = (m) => {
    if (m >= 2.0) return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (m >= 1.5) return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    if (m >= 1.2) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Learned Patterns</h1>
          <p className="text-sm text-gray-500 mt-1">
            {patterns.length} patterns discovered from deployment history
          </p>
        </div>
        <button
          onClick={handleRecompute}
          disabled={recomputing}
          className="btn-ghost"
        >
          {recomputing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCcw className="w-4 h-4" />
          )}
          Recompute
        </button>
      </div>

      {patterns.length === 0 ? (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
          <BrainCircuit className="w-12 h-12 text-gray-700 mb-4" />
          <h3 className="text-gray-400 font-medium">No patterns discovered yet</h3>
          <p className="text-sm text-gray-600 mt-1">
            The agent needs more deployment data to identify recurring patterns.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-900/40">
                <th className="text-left px-5 py-3">#</th>
                <th className="text-left px-5 py-3">Pattern</th>
                <th className="text-left px-5 py-3">Change Type</th>
                <th className="text-center px-5 py-3">Risk Multiplier</th>
                <th className="text-center px-5 py-3">Evidence</th>
                <th className="text-left px-5 py-3">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {patterns.map((p, i) => (
                <tr key={p.id} className="hover:bg-gray-800/20 transition-colors">
                  <td className="px-5 py-4 text-gray-600 text-xs">{i + 1}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-2">
                      <Zap className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-200 leading-snug">{p.pattern_description}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {p.change_type ? (
                      <span className="text-xs text-gray-400 bg-gray-800/50 px-2 py-0.5 rounded-md">
                        {p.change_type}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">all</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${multiplierColor(p.risk_multiplier)}`}>
                      <TrendingUp className="w-3 h-3" />
                      ×{p.risk_multiplier}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="text-gray-300 font-mono text-xs">{p.evidence_count}</span>
                    <span className="text-gray-600 text-xs"> events</span>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500">
                    {new Date(p.last_updated).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
