/**
 * SizeIndicator.jsx
 *
 * It receives the current and maximum payload sizes, then extracts a normalised
 * ratio, and then it applies an SVG ring that fills from green → yellow → red.
 */
import React from 'react';

const R = 9;
const CIRC = 2 * Math.PI * R;

export default function SizeIndicator({ current, max }) {
  const ratio = Math.min(current / max, 1);
  const dash = ratio * CIRC;
  const remaining = CIRC - dash;

  const color =
    ratio >= 0.95 ? '#ff7b72'  // red — over limit
    : ratio >= 0.80 ? '#e3b341' // yellow — approaching
    : '#3fb950';                 // green — safe

  const pct = Math.round(ratio * 100);

  return (
    <div className="relative flex items-center justify-center w-6 h-6 shrink-0" title={`${pct}% of context limit used (${current.toLocaleString()} / ${max.toLocaleString()} chars)`}>
      <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
        {/* Track */}
        <circle
          cx="12" cy="12" r={R}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="2.5"
        />
        {/* Fill */}
        <circle
          cx="12" cy="12" r={R}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={`${dash} ${remaining}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.3s ease, stroke 0.3s ease' }}
        />
      </svg>
      {ratio >= 0.80 && (
        <span
          className="absolute text-[7px] font-bold"
          style={{ color }}
        >
          {pct}
        </span>
      )}
    </div>
  );
}
