/**
 * Service Dependency Graph — SVG-based interactive service topology
 * showing dependencies and blast radius with failure heat mapping.
 */

import { useEffect, useState } from 'react';
import { Network, AlertCircle, ArrowRight } from 'lucide-react';
import { api } from '../hooks/useApi';

/* Fixed node positions for a clean layout (centered in 800×450 viewBox) */
const NODE_POSITIONS = {
  gateway:       { x: 400, y: 60 },
  auth:          { x: 150, y: 180 },
  payments:      { x: 400, y: 180 },
  checkout:      { x: 650, y: 180 },
  inventory:     { x: 520, y: 330 },
  notifications: { x: 280, y: 330 },
};

export default function ServiceGraph() {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [serviceDetail, setServiceDetail] = useState(null);

  useEffect(() => {
    api.get('/impact')
      .then(setGraphData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleNodeClick = async (service) => {
    setSelectedNode(service);
    try {
      const detail = await api.get(`/impact/${service}`);
      setServiceDetail(detail);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-[500px] w-full rounded-xl" />
      </div>
    );
  }

  if (!graphData) return null;

  const { nodes, edges } = graphData;
  const nodeMap = {};
  for (const n of nodes) nodeMap[n.id] = n;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Service Dependency Graph</h1>
        <p className="text-sm text-gray-500 mt-1">
          Click a service to see its blast radius and incident history
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Graph SVG */}
        <div className="lg:col-span-2 glass-card p-4">
          <svg viewBox="0 0 800 420" className="w-full h-auto">
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="rgba(148,163,184,0.4)" />
              </marker>
              <marker id="arrowhead-hot" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="rgba(239,68,68,0.6)" />
              </marker>
              {/* Glow filter */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Edges */}
            {edges.map((edge, i) => {
              const from = NODE_POSITIONS[edge.source];
              const to = NODE_POSITIONS[edge.target];
              if (!from || !to) return null;

              const isHot = edge.cascade_count > 0;
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const offsetX = (dx / dist) * 38;
              const offsetY = (dy / dist) * 38;

              return (
                <g key={i}>
                  <line
                    x1={from.x + offsetX}
                    y1={from.y + offsetY}
                    x2={to.x - offsetX}
                    y2={to.y - offsetY}
                    stroke={isHot ? 'rgba(239,68,68,0.35)' : 'rgba(148,163,184,0.15)'}
                    strokeWidth={isHot ? 2.5 : 1.5}
                    strokeDasharray={isHot ? '' : '6 4'}
                    markerEnd={isHot ? 'url(#arrowhead-hot)' : 'url(#arrowhead)'}
                  />
                  {isHot && (
                    <text
                      x={(from.x + to.x) / 2 + 10}
                      y={(from.y + to.y) / 2 - 8}
                      fontSize="10"
                      fill="rgba(239,68,68,0.6)"
                      fontWeight="600"
                    >
                      {edge.cascade_count} cascade{edge.cascade_count > 1 ? 's' : ''}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const pos = NODE_POSITIONS[node.id];
              if (!pos) return null;

              const isSelected = selectedNode === node.id;
              const failRate = node.failure_rate;
              const nodeColor = failRate >= 40
                ? { fill: 'rgba(239,68,68,0.15)', stroke: '#ef4444', text: '#fca5a5' }
                : failRate >= 25
                  ? { fill: 'rgba(245,158,11,0.15)', stroke: '#f59e0b', text: '#fde68a' }
                  : { fill: 'rgba(16,185,129,0.12)', stroke: '#10b981', text: '#6ee7b7' };

              return (
                <g
                  key={node.id}
                  className="cursor-pointer"
                  onClick={() => handleNodeClick(node.id)}
                >
                  {/* Background glow for selected */}
                  {isSelected && (
                    <circle
                      cx={pos.x} cy={pos.y} r="50"
                      fill="none"
                      stroke={nodeColor.stroke}
                      strokeWidth="1.5"
                      opacity="0.3"
                      filter="url(#glow)"
                    />
                  )}
                  {/* Main circle */}
                  <circle
                    cx={pos.x} cy={pos.y} r="36"
                    fill={nodeColor.fill}
                    stroke={isSelected ? nodeColor.stroke : 'rgba(148,163,184,0.2)'}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                  {/* Service name */}
                  <text
                    x={pos.x} y={pos.y - 4}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="600"
                    fill={isSelected ? nodeColor.text : '#e5e7eb'}
                  >
                    {node.id}
                  </text>
                  {/* Stats */}
                  <text
                    x={pos.x} y={pos.y + 13}
                    textAnchor="middle"
                    fontSize="10"
                    fill="rgba(156,163,175,0.6)"
                  >
                    {failRate}% fail · {node.incident_count} inc
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/40 border border-emerald-500/30" />
              {'< 25% fail rate'}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/40 border border-amber-500/30" />
              25-40% fail rate
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/40 border border-red-500/30" />
              {'> 40% fail rate'}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-6 border-t-2 border-red-500/40" />
              Cascade path
            </span>
          </div>
        </div>

        {/* Detail panel */}
        <div className="glass-card p-5">
          {!serviceDetail ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <Network className="w-10 h-10 text-gray-700 mb-3" />
              <p className="text-sm text-gray-500">Select a service to see its blast radius</p>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-white">{serviceDetail.service}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Blast radius: {serviceDetail.blast_radius} services
                </p>
              </div>

              {/* Dependencies */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Downstream Dependencies
                </h3>
                {serviceDetail.downstream.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {serviceDetail.downstream.map(d => (
                      <span
                        key={d}
                        className="text-xs bg-pipeline-600/15 text-pipeline-400 px-2.5 py-1 rounded-lg border border-pipeline-500/20 cursor-pointer hover:bg-pipeline-600/25 transition-colors"
                        onClick={() => handleNodeClick(d)}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">No downstream dependencies</p>
                )}
              </div>

              {/* Upstream */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Upstream (depends on this)
                </h3>
                {serviceDetail.upstream.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {serviceDetail.upstream.map(u => (
                      <span
                        key={u}
                        className="text-xs bg-purple-600/15 text-purple-400 px-2.5 py-1 rounded-lg border border-purple-500/20 cursor-pointer hover:bg-purple-600/25 transition-colors"
                        onClick={() => handleNodeClick(u)}
                      >
                        {u}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">No upstream consumers</p>
                )}
              </div>

              {/* Recent incidents */}
              {serviceDetail.incidents.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Recent Incidents
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {serviceDetail.incidents.map((inc, i) => (
                      <div key={i} className="p-2.5 bg-gray-800/30 rounded-lg text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertCircle className="w-3 h-3 text-red-400" />
                          <span className={`badge badge-${inc.severity} text-[10px]`}>
                            {inc.severity}
                          </span>
                        </div>
                        <p className="text-gray-300 leading-snug">{inc.summary}</p>
                        <p className="text-gray-600 mt-1">
                          {new Date(inc.deploy_timestamp).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric',
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
