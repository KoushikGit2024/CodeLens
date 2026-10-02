import React from 'react';

export function Logo({ className = 'w-14 h-14', textClass = 'text-xl', showText = true }) {
  return (
    <div className="group flex items-center gap-2.5 cursor-pointer transition-transform duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5">
      <svg
        viewBox="-4 -4 72 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 ${className} overflow-visible`}
      >
        <g transform="translate(4 4)">
          {/* 1. outer scanner arc */}
          <path
            d="M43 7 C34 2.5 23.5 2.8 15.1 7.7 C5.8 13.1 0 23.1 0 32 C0 40.9 5.8 50.9 15.1 56.3 C23.5 61.2 34 61.5 43 57"
            className="stroke-accent transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-[29px_32px] group-hover:rotate-[130deg] group-hover:scale-[1.15] group-hover:stroke-text"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* 2. main lens ring */}
          <circle
            cx="29"
            cy="32"
            r="17"
            className="stroke-text transition-all duration-700 ease-out origin-[29px_32px] group-hover:scale-[1.08] group-hover:stroke-accent"
            strokeWidth="3.5"
          />

          {/* 3. mechanical handle */}
          <path
            d="M42 45L53 56"
            className="stroke-text transition-all duration-500 ease-in-out origin-[42px_45px] group-hover:rotate-[25deg] group-hover:stroke-accent"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* 4. left bracket */}
          <path
            d="M22 25L17 32L22 39"
            className="stroke-accent transition-all duration-500 delay-75 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-[19.5px_32px] group-hover:-translate-x-2 group-hover:scale-110 group-hover:stroke-text"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 5. right bracket */}
          <path
            d="M36 25L41 32L36 39"
            className="stroke-accent transition-all duration-500 delay-75 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-[38.5px_32px] group-hover:translate-x-2 group-hover:scale-110 group-hover:stroke-text"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 6. core slash */}
          <path
            d="M32 23L27 41"
            className="stroke-muted transition-all duration-[600ms] delay-100 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-[29.5px_32px] group-hover:rotate-180 group-hover:stroke-accent"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* 7. data line top */}
          <path
            d="M21 44H37"
            className="stroke-muted transition-all duration-300 ease-in origin-right group-hover:translate-x-4 group-hover:scale-x-50 group-hover:opacity-0"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* 8. data line bottom */}
          <path
            d="M21 48H32"
            className="stroke-muted transition-all duration-300 delay-75 ease-in origin-right group-hover:translate-x-4 group-hover:scale-x-50 group-hover:opacity-0"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
      </svg>

      {showText && (
        // 9. cinematic text
        <span
          className={`font-bold flex items-center transition-all duration-[600ms] ease-out group-hover:tracking-[0.03em] ${textClass}`}
        >
          <span className="text-text transition-colors duration-[600ms] group-hover:text-accent">Code</span>
          <span className="text-accent transition-colors duration-[600ms] group-hover:text-text">Lens</span>
        </span>
      )}
    </div>
  );
}
