/**
 * Risk Predictor — form-driven risk assessment with animated results.
 *
 * Flow: Fill form → POST /api/predict → animated gauge + factor breakdown
 * + similar incidents + AI explanation + recommendations.
 */

import { useState } from 'react';
import {
  ShieldAlert, Zap, AlertTriangle, Clock,
  GitBranch, ArrowRight, Loader2, Lightbulb, History, Brain
} from 'lucide-react';
import { api } from '../hooks/useApi';
import RiskGauge from './RiskGauge';

const SERVICES = ['auth', 'payments', 'checkout', 'inventory', 'notifications', 'gateway'];
const CHANGE_TYPES = ['code', 'config', 'db_migration', 'dependency', 'infra'];

export default function RiskPredictor() {
  const [form, setForm] = useState({
    service: 'payments',
    change_type: 'config',
    files_changed: 5,
    lines_changed: 120,
    author: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.post('/predict', {
        ...form,
        files_changed: Number(form.files_changed) || 0,
        lines_changed: Number(form.lines_changed) || 0,
      });
      /* Small delay so the gauge animation feels intentional */
      setTimeout(() => setResult(data), 200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Risk Predictor</h1>
        <p className="text-sm text-gray-500 mt-1">
          Predict deployment risk before it hits production
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---- Input form ---- */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <ShieldAlert className="w-4 h-4 text-pipeline-400" />
            <h2 className="text-sm font-semibold text-gray-300">Proposed Change</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Service</label>
              <select
                value={form.service}
                onChange={(e) => updateField('service', e.target.value)}
                className="form-select"
              >
                {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Change Type</label>
              <select
                value={form.change_type}
                onChange={(e) => updateField('change_type', e.target.value)}
                className="form-select"
              >
                {CHANGE_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Files Changed</label>
                <input
                  type="number"
                  min="0"
                  value={form.files_changed}
                  onChange={(e) => updateField('files_changed', e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Lines Changed</label>
                <input
                  type="number"
                  min="0"
                  value={form.lines_changed}
                  onChange={(e) => updateField('lines_changed', e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div>
              <label className="form-label">Author (optional)</label>
              <input
                type="text"
                value={form.author}
                onChange={(e) => updateField('author', e.target.value)}
                placeholder="e.g. alice"
                className="form-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Predict Risk
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* ---- Results ---- */}
        <div className="lg:col-span-2 space-y-4">
          {!result && !loading && (
            <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
              <ShieldAlert className="w-12 h-12 text-gray-700 mb-4" />
              <h3 className="text-gray-400 font-medium">Submit a proposed change</h3>
              <p className="text-sm text-gray-600 mt-1">
                The agent will analyze historical patterns and predict risk
              </p>
            </div>
          )}

          {loading && (
            <div className="glass-card p-16 flex flex-col items-center justify-center">
              <Loader2 className="w-10 h-10 text-pipeline-400 animate-spin mb-4" />
              <p className="text-gray-400 text-sm">Analyzing deployment history...</p>
            </div>
          )}

          {result && (
            <div className="space-y-4 animate-fade-in">
              {/* Gauge + factors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Risk gauge */}
                <div className="glass-card p-6 flex items-center justify-center">
                  <RiskGauge score={result.risk_score} level={result.risk_level} />
                </div>

                {/* Factor breakdown */}
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-gray-300">Risk Factor Breakdown</h3>
                  </div>
                  <div className="space-y-3">
                    {result.factors
                      .sort((a, b) => (b.score * b.weight) - (a.score * a.weight))
                      .map((f, i) => (
                        <FactorBar key={i} factor={f} />
                      ))}
                  </div>
                </div>
              </div>

              {/* Similar incidents */}
              {result.similar_incidents.length > 0 && (
                <div className="glass-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-purple-400" />
                      <h3 className="text-sm font-semibold text-gray-300">Similar Past Incidents</h3>
                    </div>
                    {result.hindsight_powered ? (
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-pipeline-400 bg-pipeline-600/15 border border-pipeline-500/25 px-2.5 py-1 rounded-full">
                        <Brain className="w-3.5 h-3.5" />
                        Hindsight Semantic Recall
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-500">
                        SQLite similarity engine
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {result.similar_incidents.map((inc, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 bg-gray-800/30 rounded-xl text-sm"
                      >
                        <div className={`status-dot mt-1.5 status-dot-${inc.status}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-200">{inc.service}</span>
                            <span className="text-xs text-gray-500 bg-gray-800/40 px-2 py-0.5 rounded-md">
                              {inc.change_type}
                            </span>
                            <span className={`badge badge-${inc.status} text-[10px]`}>{inc.status}</span>
                            {inc.incident_severity && (
                              <span className={`badge badge-${inc.incident_severity} text-[10px]`}>
                                {inc.incident_severity}
                              </span>
                            )}
                          </div>
                          {inc.incident_summary && (
                            <p className="text-xs text-gray-400 mt-1">{inc.incident_summary}</p>
                          )}
                          {inc.failure_message && (
                            <p className="text-xs text-gray-500 mt-1 font-mono truncate">{inc.failure_message}</p>
                          )}
                          <p className="text-[10px] text-gray-600 mt-1">
                            Deploy #{inc.deployment_id} · {inc.lines_changed} lines ·{' '}
                            {new Date(inc.timestamp).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric',
                            })}
                            {' '}· Similarity: {inc.similarity_score}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Explanation */}
              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-pipeline-400" />
                  <h3 className="text-sm font-semibold text-gray-300">
                    AI Analysis
                    {!result.llm_powered && (
                      <span className="ml-2 text-[10px] text-gray-600 font-normal">(rule-based)</span>
                    )}
                  </h3>
                </div>
                <div className="prose-invert text-sm whitespace-pre-wrap leading-relaxed">
                  {result.explanation}
                </div>
              </div>

              {/* Recommendations */}
              {result.recommendations.length > 0 && (
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-gray-300">Recommended Actions</h3>
                  </div>
                  <ul className="space-y-2">
                    {result.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Factor breakdown bar ---- */
function FactorBar({ factor }) {
  const weighted = Math.round((factor.score * factor.weight) / 100);
  const barColor = factor.score >= 60 ? 'bg-red-500' : factor.score >= 30 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-400 font-medium">{factor.name}</span>
        <span className="text-gray-500">{factor.score} × {factor.weight}% = {weighted}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-700`}
          style={{ width: `${factor.score}%` }}
        />
      </div>
      <p className="text-[10px] text-gray-600 mt-0.5 truncate">{factor.detail}</p>
    </div>
  );
}
