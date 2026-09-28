import React, { useRef, useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { 
  LayoutDashboard, 
  Bot, 
  FileCode2, 
  FolderTree, 
  Bookmark, 
  Box, 
  GitMerge, 
  ShieldAlert, 
  Wrench, 
  Activity, 
  User 
} from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'assistant', label: 'AI Assistant', icon: Bot },
  { id: 'source', label: 'Source Explorer', icon: FileCode2 },
  { id: 'tree', label: 'File Tree', icon: FolderTree },
  { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  { id: 'architecture', label: 'Architecture', icon: Box },
  { id: 'dependencies', label: 'Dependencies', icon: GitMerge },
  { id: 'health', label: 'Health', icon: ShieldAlert },
  { id: 'refactoring', label: 'Refactoring', icon: Wrench },
  { id: 'impact', label: 'Impact', icon: Activity },
  { id: 'creator', label: 'Creator', icon: User },
];

/* ---------- Dial geometry (px) ---------- */
const SIZE = 200;
const C = SIZE / 2; // centre
const R = 56; // ring radius
const ICON_R = 74; // radius where the upright icons sit

// Dynamically calculate the step so any number of tabs perfectly fit a 288-degree arc
const TOTAL_DIAL_ARC = 288;
const START_ANGLE = 216; // Start at bottom-left, cross top, end at bottom-right
const STEP = TOTAL_DIAL_ARC / (TABS.length - 1);
const MAX_ANGLE = TOTAL_DIAL_ARC; // dial travel: first -> last tab
const CIRC = 2 * Math.PI * R;

const BLUE = '#3B82F6';
const BG = '#0A0C14';
const BORDER = '#1E2433';
const TRACK = '#2A3245';

const polar = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
};

export default function AboutPillNav({ activeTab, setActiveTab }) {
  const rootRef = useRef(null);
  const lastWheel = useRef(0);
  const [dragAngle, setDragAngle] = useState(null); // null = not dragging
  const [showCompletionAnim, setShowCompletionAnim] = useState(false);

  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.id === activeTab)
  );
  const dragging = dragAngle !== null;
  const angle = dragging ? dragAngle : activeIndex * STEP;
  const shownIndex = Math.round(angle / STEP);
  const Active = TABS[shownIndex].icon;

  useEffect(() => {
    if (shownIndex === TABS.length - 1) {
      setShowCompletionAnim(true);
      const timer = setTimeout(() => setShowCompletionAnim(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowCompletionAnim(false);
    }
  }, [shownIndex]);

  const goTo = (i) => {
    const next = Math.min(TABS.length - 1, Math.max(0, i));
    if (TABS[next].id !== activeTab) setActiveTab(TABS[next].id);
  };

  /* Pointer position -> dial angle, clamped to the dial's travel */
  const angleFromPointer = (e) => {
    const rect = rootRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    
    // Map absolute deg (0=top) to relative angle from START_ANGLE
    let relativeDeg = deg - START_ANGLE;
    if (relativeDeg < 0) relativeDeg += 360;
    
    if (relativeDeg > TOTAL_DIAL_ARC) {
      relativeDeg = relativeDeg > TOTAL_DIAL_ARC + (360 - TOTAL_DIAL_ARC) / 2 ? 0 : TOTAL_DIAL_ARC;
    }
    return relativeDeg;
  };

  const handleDown = (e) => {
    rootRef.current.setPointerCapture(e.pointerId);
    const a = angleFromPointer(e);
    setDragAngle(a);
    goTo(Math.round(a / STEP));
  };

  const handleMove = (e) => {
    if (!dragging) return;
    const a = angleFromPointer(e);
    setDragAngle(a);
    goTo(Math.round(a / STEP));
  };

  const handleUp = (e) => {
    if (!dragging) return;
    rootRef.current.releasePointerCapture?.(e.pointerId);
    setDragAngle(null); // knob snaps to the nearest detent
  };

  const handleWheel = (e) => {
    const now = Date.now();
    if (now - lastWheel.current < 140) return;
    lastWheel.current = now;
    goTo(activeIndex + (e.deltaY > 0 ? 1 : -1));
  };

  const handleKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') goTo(activeIndex + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') goTo(activeIndex - 1);
    else if (e.key === 'Home') goTo(0);
    else if (e.key === 'End') goTo(TABS.length - 1);
    else return;
    e.preventDefault();
  };

  const ticks = Array.from({ length: 60 }, (_, i) => i * 6);

  return (
    <div className="fixed bottom-6 right-6 z-50 origin-bottom-right scale-[0.6] sm:scale-[0.7] md:scale-[0.75] lg:scale-[0.8] xl:scale-[0.85] transition-transform duration-300 bg-transparent">
      <div
        ref={rootRef}
        role="slider"
        tabIndex={0}
        aria-label="About sections"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={TABS.length - 1}
        aria-valuenow={shownIndex}
        aria-valuetext={TABS[shownIndex].label}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onWheel={handleWheel}
        onKeyDown={handleKey}
        className={clsx(
          'relative select-none touch-none rounded-full outline-none focus:outline-none focus:ring-0 bg-transparent [-webkit-tap-highlight-color:transparent] transition-all duration-700',
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        style={{ width: SIZE, height: SIZE }}
      >
        {/* Glass disc */}
        <div
          className="absolute rounded-full border backdrop-blur-xl shadow-2xl transition-all duration-700"
          style={{
            inset: 6,
            clipPath: 'circle(50% at 50% 50%)',
            background: `rgba(var(--color-surface), 0.8)`,
            borderColor: showCompletionAnim ? `rgba(74,222,128, 0.8)` : `rgb(var(--color-border))`,
            boxShadow: showCompletionAnim 
              ? '0 0 40px rgba(74,222,128,0.3), inset 0 0 20px rgba(74,222,128,0.2)' 
              : '0 20px 50px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        />

        <svg
          className={clsx(
            "absolute inset-0 bg-transparent rounded-full transition-shadow duration-700",
            showCompletionAnim ? "shadow-[0_0_80px_rgba(74,222,128,0.4)]" : ""
          )}
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          aria-hidden="true"
        >
          {/* Outer dial rim line */}
          <circle
            cx={C}
            cy={C}
            r={SIZE / 2 - 8}
            fill="none"
            stroke="rgba(var(--color-text), 0.05)"
            strokeWidth="1"
          />

          {/* Fine dial ticks */}
          {ticks.map((t) => {
            const a = polar(t, R - 12);
            const b = polar(t, R - (t % STEP === 0 ? 6 : 9));
            return (
              <line
                key={t}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth={t % STEP === 0 ? 1.5 : 1}
              />
            );
          })}

          {/* Future commits: dashed track (now respects gap) */}
          <circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="2"
            strokeDasharray={`${(CIRC * TOTAL_DIAL_ARC) / 360} ${CIRC}`}
            strokeLinecap="round"
            transform={`rotate(${START_ANGLE - 90} ${C} ${C})`}
          />

          {/* History up to HEAD: solid blue arc */}
          <circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke={showCompletionAnim ? "#4ade80" : "rgb(var(--color-accent))"}
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${START_ANGLE - 90} ${C} ${C})`}
            strokeDasharray={`${(CIRC * (showCompletionAnim ? 360 : angle)) / 360} ${CIRC}`}
            style={{ transition: dragging ? 'none' : 'stroke-dasharray 600ms cubic-bezier(0.4, 0, 0.2, 1), stroke 500ms ease' }}
          />

          {/* Tab nodes (commits) */}
          {TABS.map((tab, i) => {
            const p = polar(START_ANGLE + i * STEP, R);
            const passed = i <= shownIndex || (showCompletionAnim && i > shownIndex);
            return (
              <circle
                key={tab.id}
                cx={p.x}
                cy={p.y}
                r="4.5"
                fill="rgb(var(--color-surface))"
                stroke={
                  passed 
                    ? (showCompletionAnim ? "#4ade80" : "rgb(var(--color-accent))") 
                    : "rgba(var(--color-muted), 0.5)"
                }
                strokeWidth="2"
                style={{ transition: 'stroke 500ms ease' }}
              />
            );
          })}

          {/* HEAD knob: the dial handle */}
          <g
            style={{
              transform: `rotate(${START_ANGLE + angle}deg)`,
              transformOrigin: `${C}px ${C}px`,
              transition: dragging ? 'none' : 'transform 320ms cubic-bezier(.3,1.3,.5,1)',
            }}
          >
            <circle
              cx={C}
              cy={C - R}
              r={dragging ? 16 : 14}
              fill="none"
              stroke={showCompletionAnim ? "#4ade80" : "rgb(var(--color-accent))"}
              strokeWidth="1"
              opacity="0.4"
              style={{ transition: 'r 150ms, stroke 500ms ease' }}
            />
            <circle cx={C} cy={C - R} r="8" fill={showCompletionAnim ? "#4ade80" : "rgb(var(--color-accent))"} style={{ transition: 'fill 500ms ease' }} />
            <circle cx={C} cy={C - R} r="2.5" fill="#fff" opacity="0.9" />
          </g>
        </svg>

        {/* Upright icons around the ring (never rotated) */}
        {TABS.map((tab, i) => {
          const Icon = tab.icon;
          const p = polar(START_ANGLE + i * STEP, ICON_R);
          const isActive = i === shownIndex;
          return (
            <div
              key={tab.id}
              aria-hidden="true"
              className={clsx(
                'pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-all duration-200',
                isActive ? 'scale-110 text-accent' : 'text-muted'
              )}
              style={{ left: p.x, top: p.y }}
            >
              <Icon className="h-[16px] w-[16px]" strokeWidth={isActive ? 2.25 : 1.75} />
            </div>
          );
        })}

        {/* Centre readout */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <span 
            className={clsx(
              "font-mono text-[10px] tracking-wide transition-all duration-500",
              showCompletionAnim 
                ? "text-green-400 opacity-100 scale-110 drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]" 
                : "text-accent opacity-80"
            )}
          >
            {showCompletionAnim ? "COMPLETE" : "HEAD"}
          </span>
          <div
            key={TABS[shownIndex].id}
            className="flex flex-col items-center gap-1.5"
            style={{ animation: 'dialFade 200ms ease-out' }}
          >
            <Active className="h-7 w-7 text-text" strokeWidth={1.75} />
            <span className="font-mono text-[12px] font-medium text-text">
              {TABS[shownIndex].label}
            </span>
          </div>
        </div>

        <style>{`@keyframes dialFade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}`}</style>
      </div>
    </div>
  );
}
