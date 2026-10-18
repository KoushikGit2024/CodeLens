/**
 * GraphNodes.jsx
 *
 * It maps the incoming node properties, then extracts the custom aesthetic flags,
 * and then it applies them to render rich, interactive React Flow components.
 */
import React, { useRef, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import { File, Package, AlertCircle, Flame } from 'lucide-react';
import { NODE_W, PKG_W } from './graphUtils';

/** Helper to blend any CSS color with alpha using CSS color-mix */
const alpha = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

export const CustomNode = React.memo(function CustomNode({ data }) {
  const isFile = data.nodeType === 'file' || data.nodeType === 'fileNode';
  const w = isFile ? NODE_W : PKG_W;

  const hasCritical = data.findingsCount?.critical > 0;
  const shadowGlow = data.isFocused
    ? '0 4px 12px rgba(0, 0, 0, 0.35)'
    : data.isSearchMatch
      ? '0 0 8px rgb(var(--color-accent) / 0.55)'
      : hasCritical && !data.isFaded
        ? '0 0 12px rgba(224, 82, 82, 0.35)'
        : 'none';

  // Churn overlay support
  const churnScore = data.churnScore || 0;
  const compositeRisk = data.compositeRisk || 0;
  const showChurn = !!data.showChurn;
  const churnBorderThickness = showChurn && churnScore > 0 ? Math.max(2, Math.round((churnScore / 100) * 6)) : 0;
  const churnColor =
    compositeRisk >= 85 ? '#ef4444' : compositeRisk >= 70 ? '#f97316' : churnScore >= 30 ? '#eab308' : null;

  const accentColor = 'rgb(var(--color-accent))';
  const borderColor = 'rgb(var(--color-border))';
  const panelColor = 'rgb(var(--color-panel))';
  const surfaceColor = 'rgb(var(--color-surface))';
  const textColor = 'rgb(var(--color-text))';
  const mutedColor = 'rgb(var(--color-muted))';
  const dangerColor = 'rgb(var(--color-danger))';

  const heat = data.heatColor || accentColor;
  const fileColor = heat;
  const isIslands = data.forceGrouping === 'islands';
  const defaultBorder = data.isFocused
    ? `2px solid ${fileColor}`
    : data.isSearchMatch
      ? `2px solid ${accentColor}`
      : `1px solid ${alpha(data.heatColor || borderColor, data.isFaded ? 10 : 33)}`;

  const isHorizontal = data.layout === 'dagre' || data.layout === 'flat';

  // Native pointer tracking — bypasses React Flow's drag-vs-click classification.
  // Active when data.onSelect is provided.
  const ptrDownRef = useRef(null);
  const lastSelectTimeRef = useRef(0);

  const handlePointerDown = useCallback(
    e => {
      if (!data.onSelect) return;
      ptrDownRef.current = { x: e.clientX, y: e.clientY };
    },
    [data.onSelect]
  );

  const handlePointerUp = useCallback(
    e => {
      if (!data.onSelect || !ptrDownRef.current) return;
      const dx = e.clientX - ptrDownRef.current.x;
      const dy = e.clientY - ptrDownRef.current.y;
      ptrDownRef.current = null;
      // If the pointer moved < 8px, it was a tap/click, not a drag
      if (Math.hypot(dx, dy) < 8) {
        lastSelectTimeRef.current = Date.now();
        e.stopPropagation();
        data.onSelect(data.nodeId);
      }
    },
    [data.onSelect, data.nodeId]
  );

  const handleClick = useCallback(
    e => {
      if (!data.onSelect) return;
      e.stopPropagation();
      if (Date.now() - lastSelectTimeRef.current < 150) return;
      data.onSelect(data.nodeId);
    },
    [data.onSelect, data.nodeId]
  );

  return (
    <div
      className="shadow-md rounded transition-all duration-150 relative"
      onPointerDown={data.onSelect ? handlePointerDown : undefined}
      onPointerUp={data.onSelect ? handlePointerUp : undefined}
      onClick={data.onSelect ? handleClick : undefined}
      style={{
        opacity: data.isFaded ? 0.15 : data.isSearchActive && !data.isSearchMatch ? 0.15 : 1,
        width: w,
        zIndex: data.isFocused ? 10 : 2,
        borderTop: defaultBorder,
        borderLeft: data.isFocused
          ? `3px solid ${fileColor}`
          : isIslands && data.dirColor
            ? `3px solid ${data.dirColor}`
            : defaultBorder,
        borderRight: defaultBorder,
        borderBottom: showChurn && churnColor ? `${churnBorderThickness}px solid ${churnColor}` : defaultBorder,
        background: data.isFocused ? surfaceColor : panelColor,
        boxShadow: shadowGlow,
        cursor: data.onSelect ? 'pointer' : 'default',
      }}
    >
      <Handle
        type="target"
        position={isHorizontal ? Position.Left : Position.Top}
        style={{ opacity: 0 }}
        isConnectable={false}
      />
      <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ overflow: 'hidden' }}>
        {isFile ? (
          <File className="w-3 h-3 shrink-0" style={{ color: heat, minWidth: 12 }} />
        ) : (
          <Package className="w-3 h-3 shrink-0 text-amber-400" style={{ minWidth: 12 }} />
        )}
        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              fontSize: 10,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              color: textColor,
              fontWeight: 600,
              lineHeight: '1.25',
            }}
            title={data.label}
          >
            {data.label}
          </div>
          {isFile && data.shortDir && (
            <div
              className="leading-tight flex items-center gap-1"
              style={{
                fontSize: 9,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                color: isIslands && data.dirColor ? data.dirColor : mutedColor,
              }}
              title={data.dir}
            >
              {isIslands && data.dirColor && (
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                  style={{ background: data.dirColor }}
                />
              )}
              <span className="truncate">{data.shortDir}</span>
            </div>
          )}
        </div>
        {data.degree > 0 && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 99,
              padding: '0 4px',
              flexShrink: 0,
              lineHeight: '14px',
              background: alpha(heat, 15),
              color: heat,
            }}
          >
            {data.degree}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={isHorizontal ? Position.Right : Position.Bottom}
        style={{ opacity: 0 }}
        isConnectable={false}
      />

      {hasCritical && !data.isCycling && (
        <div
          className="absolute -top-1.5 -right-1.5 bg-danger text-text rounded-full p-0.5 shadow-md border border-surface"
          title={`${data.findingsCount.critical} Critical Issues`}
        >
          <AlertCircle className="w-2.5 h-2.5" />
        </div>
      )}

      {data.isCycling && (
        <div
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: dangerColor,
            boxShadow: `0 0 0 2px ${surfaceColor}`,
          }}
          title="Involved in Cycle"
        />
      )}
      {!data.isCycling && data.isIsolated && (
        <div
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: mutedColor,
            boxShadow: `0 0 0 2px ${surfaceColor}`,
          }}
          title="Isolated File"
        />
      )}

      {/* Churn flame badge for high composite risk */}
      {showChurn && compositeRisk >= 70 && (
        <div
          className="absolute -top-1.5 -left-1.5 rounded-full p-0.5 shadow-md border border-surface bg-panel"
          title={`Churn: ${churnScore}/100 | Composite Risk: ${compositeRisk}/100`}
        >
          <Flame className={`w-2.5 h-2.5 ${compositeRisk >= 85 ? 'text-danger' : 'text-orange-500'}`} />
        </div>
      )}
    </div>
  );
});

export const GroupNode = React.memo(function GroupNode({ data }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        border: `1.5px solid ${alpha(data.color, 25)}`,
        borderRadius: 12,
        background: alpha(data.color, 4),
      }}
    >
      <div
        className="absolute top-2 left-3 text-[10px] font-bold uppercase tracking-widest"
        style={{ color: alpha(data.color, 75) }}
      >
        {data.label}
      </div>
    </div>
  );
});

export const SpringEdge = React.memo(function SpringEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  data,
}) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;

  const transitionStyle = { ...style, fill: 'none' };

  if (data?.isStraight) {
    const pathD = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
    return (
      <>
        <path id={id} className="react-flow__edge-path" d={pathD} style={transitionStyle} markerEnd={markerEnd} />
        <path d={pathD} style={{ fill: 'none', stroke: 'transparent', strokeWidth: 12 }} />
      </>
    );
  }

  const perpX = -dy / length;
  const perpY = dx / length;
  const coils = Math.max(2, Math.round(length / 60));
  const amplitude = Math.min(6, length / (coils * 3));
  const steps = coils * 8;
  const pts = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const envelope = Math.sin(t * Math.PI);
    const wave = Math.sin(t * coils * Math.PI * 2) * amplitude * envelope;
    pts.push(`${sourceX + t * dx + wave * perpX},${sourceY + t * dy + wave * perpY}`);
  }

  const pathD = `M ${pts.join(' L ')}`;

  return (
    <>
      <path id={id} className="react-flow__edge-path" d={pathD} style={transitionStyle} markerEnd={markerEnd} />
      <path d={pathD} style={{ fill: 'none', stroke: 'transparent', strokeWidth: 12 }} />
    </>
  );
});

export const DotNode = React.memo(function DotNode({ data }) {
  const [isHovered, setIsHovered] = React.useState(false);
  const degree = data.degree || 0;
  // Size dot based on connections (radius 6px to 18px)
  const r = Math.max(6, Math.min(18, Math.round(5 + Math.sqrt(degree) * 2.2)));
  const d = r * 2;

  const accentColor = 'rgb(var(--color-accent))';
  const isIslands = data.forceGrouping === 'islands';
  const fileColor = isIslands ? data.dirColor || data.heatColor || accentColor : data.heatColor || accentColor;
  const isFocused = data.isFocused;
  const isSearchMatch = data.isSearchMatch;
  const isFaded = data.isFaded || (data.isSearchActive && !isSearchMatch);
  const hasCritical = data.findingsCount?.critical > 0;

  // Show floating label only when hovered, selected, or search matched
  const showLabel = isHovered || isFocused || isSearchMatch;

  const ptrDownRef = useRef(null);
  const lastSelectTimeRef = useRef(0);

  const handlePointerDown = useCallback(
    e => {
      if (!data.onSelect) return;
      ptrDownRef.current = { x: e.clientX, y: e.clientY };
    },
    [data.onSelect]
  );

  const handlePointerUp = useCallback(
    e => {
      if (!data.onSelect || !ptrDownRef.current) return;
      const dx = e.clientX - ptrDownRef.current.x;
      const dy = e.clientY - ptrDownRef.current.y;
      ptrDownRef.current = null;
      if (Math.hypot(dx, dy) < 8) {
        lastSelectTimeRef.current = Date.now();
        e.stopPropagation();
        data.onSelect(data.nodeId);
      }
    },
    [data.onSelect, data.nodeId]
  );

  const handleClick = useCallback(
    e => {
      if (!data.onSelect) return;
      e.stopPropagation();
      if (Date.now() - lastSelectTimeRef.current < 150) return;
      data.onSelect(data.nodeId);
    },
    [data.onSelect, data.nodeId]
  );

  return (
    <div
      className="relative flex items-center justify-center transition-opacity duration-150"
      style={{
        width: d,
        height: d,
        opacity: isFaded ? 0.15 : 1,
        zIndex: isFocused ? 20 : isHovered ? 15 : isSearchMatch ? 10 : 2,
        cursor: data.onSelect ? 'pointer' : 'default',
      }}
      onPointerDown={data.onSelect ? handlePointerDown : undefined}
      onPointerUp={data.onSelect ? handlePointerUp : undefined}
      onClick={data.onSelect ? handleClick : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectable={false} />

      {/* Circle dot */}
      <div
        className="w-full h-full rounded-full transition-transform duration-150"
        style={{
          background: fileColor,
          border: isFocused ? `2px solid #ffffff` : `1.5px solid ${alpha(fileColor, 60)}`,
          boxShadow: isFocused
            ? `0 0 0 2px rgb(var(--color-surface)), 0 4px 12px rgba(0,0,0,0.4)`
            : isSearchMatch
              ? `0 0 0 2px rgb(var(--color-surface)), 0 0 8px ${accentColor}`
              : `0 2px 6px ${alpha(fileColor, 45)}`,
          transform: isHovered || isFocused ? 'scale(1.25)' : 'scale(1)',
        }}
      />

      {/* Connection number badge inside dot */}
      {degree > 0 && (
        <span
          className="absolute inset-0 flex items-center justify-center font-bold text-white select-none pointer-events-none leading-none"
          style={{
            fontSize: r >= 10 ? '9px' : r >= 8 ? '8px' : '7px',
            textShadow: '0 1px 2px rgba(0,0,0,0.85)',
          }}
        >
          {degree}
        </span>
      )}

      {/* Critical Indicator Dot */}
      {hasCritical && (
        <span
          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-danger border border-surface shadow-sm"
          title={`${data.findingsCount?.critical || 0} Critical Issues`}
        />
      )}

      {/* Label Pill (only on hover / focus / search match) */}
      {showLabel && (
        <div
          className={`absolute left-full ml-1.5 px-2 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none shadow-md backdrop-blur-sm z-30 flex items-center gap-1 border ${
            isFocused
              ? 'bg-panel border-accent text-text font-semibold'
              : isHovered
                ? 'bg-panel/95 border-border text-text font-medium'
                : 'bg-surface/85 border-border/50 text-muted font-normal text-[9px]'
          }`}
          style={{ transform: 'translateY(-50%)', top: '50%' }}
        >
          <span>{data.label}</span>
          {degree > 0 && (
            <span
              className="text-[8px] px-1 rounded-full font-mono font-bold"
              style={{ background: alpha(fileColor, 20), color: fileColor }}
            >
              {degree}
            </span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />
    </div>
  );
});

export const nodeTypes = { custom: CustomNode, dot: DotNode, group: GroupNode };
export const edgeTypes = { spring: SpringEdge };
