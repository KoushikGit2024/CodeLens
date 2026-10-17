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
    ? '0 0 0 2px rgb(var(--color-accent)), 0 0 18px rgb(var(--color-accent) / 0.65)'
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
  const defaultBorder = data.isFocused
    ? `2px solid ${accentColor}`
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
        borderLeft: defaultBorder,
        borderRight: defaultBorder,
        borderBottom: showChurn && churnColor ? `${churnBorderThickness}px solid ${churnColor}` : defaultBorder,
        background: data.isFocused ? surfaceColor : panelColor,
        boxShadow: shadowGlow,
        cursor: data.onSelect ? 'pointer' : 'default',
      }}
    >
      <Handle type="target" position={isHorizontal ? Position.Left : Position.Top} style={{ opacity: 0 }} isConnectable={false} />
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
              className="leading-tight"
              style={{
                fontSize: 9,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                color: data.dirColor || mutedColor,
              }}
              title={data.dir}
            >
              {data.shortDir}
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
      <Handle type="source" position={isHorizontal ? Position.Right : Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />

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

export const SpringEdge = React.memo(function SpringEdge({ id, sourceX, sourceY, targetX, targetY, style = {}, markerEnd, data }) {
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

export const nodeTypes = { custom: CustomNode, group: GroupNode };
export const edgeTypes = { spring: SpringEdge };
