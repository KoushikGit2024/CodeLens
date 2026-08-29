import React from 'react';

export function Logo({ className = "w-6 h-6", textClass = "text-xl", showText = true }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg 
        viewBox="-4 -4 72 72" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 ${className}`}
      >

        <g transform="translate(4 4)">
          {/* Outer C / analytical arc */}
          <path
            d="M43 7
               C34 2.5 23.5 2.8 15.1 7.7
               C5.8 13.1 0 23.1 0 32
               C0 40.9 5.8 50.9 15.1 56.3
               C23.5 61.2 34 61.5 43 57"
            stroke="#6366f1"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* Lens */}
          <circle
            cx="29"
            cy="32"
            r="17"
            stroke="#e2e8f0"
            strokeWidth="3.5"
          />

          {/* Lens handle */}
          <path
            d="M42 45L53 56"
            stroke="#e2e8f0"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Code brackets */}
          <path
            d="M22 25L17 32L22 39"
            stroke="#6366f1"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M36 25L41 32L36 39"
            stroke="#6366f1"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Code slash */}
          <path
            d="M32 23L27 41"
            stroke="#60a5fa"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          
          {/* Subtle Analysis lines inside lens */}
          <path
            d="M21 44H37"
            stroke="#475569"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M21 48H32"
            stroke="#475569"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
      </svg>

      {showText && (
        <span className={`font-bold tracking-tight flex items-center ${textClass}`}>
          <span className="text-white">Code</span>
          <span className="text-accent">Lens</span>
        </span>
      )}
    </div>
  );
}
