/**
 * RiskGauge — animated semi-circular gauge for risk visualization.
 *
 * Uses SVG arcs with CSS transitions for a smooth fill animation.
 * Color transitions from green → yellow → orange → red based on score.
 */

export default function RiskGauge({ score = 0, level = 'Low', animate = true }) {
  /* Arc parameters for a semicircle */
  const radius = 80;
  const circumference = Math.PI * radius; // semicircle
  const offset = circumference - (score / 100) * circumference;

  /* Color based on score */
  const getColor = (s) => {
    if (s >= 70) return { stroke: '#ef4444', glow: 'rgba(239,68,68,0.3)', bg: 'rgba(239,68,68,0.08)' };
    if (s >= 40) return { stroke: '#f59e0b', glow: 'rgba(245,158,11,0.3)', bg: 'rgba(245,158,11,0.08)' };
    return { stroke: '#10b981', glow: 'rgba(16,185,129,0.3)', bg: 'rgba(16,185,129,0.08)' };
  };

  const color = getColor(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 200, height: 120 }}>
        <svg
          viewBox="0 0 200 120"
          className="w-full h-full"
          style={{ filter: `drop-shadow(0 0 12px ${color.glow})` }}
        >
          {/* Background arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={color.stroke}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animate ? offset : circumference}
            className="gauge-circle"
            style={{
              transition: animate ? 'stroke-dashoffset 1.2s ease-out, stroke 0.4s ease' : 'none',
            }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="text-4xl font-bold text-white tabular-nums">{score}</span>
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">/100</span>
        </div>
      </div>

      {/* Level badge */}
      <div
        className="mt-2 px-4 py-1 rounded-full text-sm font-semibold tracking-wide"
        style={{
          background: color.bg,
          color: color.stroke,
          border: `1px solid ${color.stroke}33`,
        }}
      >
        {level} Risk
      </div>
    </div>
  );
}
