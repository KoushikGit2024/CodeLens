/**
 * GraphNodes.jsx
 *
 * It maps the incoming node properties, then extracts the custom aesthetic flags,
 * and then it applies them to render rich, interactive React Flow components.
 */
import React from 'react';
import { Handle, Position } from 'reactflow';
import { File, Package, AlertCircle } from 'lucide-react';
import { NODE_W, PKG_W } from './graphUtils';

/** Read a CSS variable from the document root as an rgb() string */
function cssVar(name) {
  return `rgb(${getComputedStyle(document.documentElement).getPropertyValue(name).trim()})`;
}

export const CustomNode = ({ data }) => {
  const isFile = data.nodeType === 'file' || data.nodeType === 'fileNode';
  const w = isFile ? NODE_W : PKG_W;

  const hasCritical = data.findingsCount?.critical > 0;
  const shadowGlow = hasCritical && !data.isFaded ? '0 0 12px rgba(224, 82, 82, 0.35)' : 'none';

  // Churn overlay support
  const churnScore = data.churnScore || 0;
  const compositeRisk = data.compositeRisk || 0;
  const showChurn = !!data.showChurn;
  const churnBorderThickness = showChurn && churnScore > 0 ? Math.max(2, Math.round((churnScore / 100) * 6)) : 0;
  const churnColor =
    compositeRisk >= 85 ? '#ef4444' : compositeRisk >= 70 ? '#f97316' : churnScore >= 30 ? '#eab308' : null;

  /**
   * It evaluates the component props, then extracts the short directory strings,
   * and then it applies the original clean layout aesthetics alongside the new risk badges.
   */
  const accentColor = cssVar('--color-accent');
  const borderColor = cssVar('--color-border');
  const panelColor = cssVar('--color-panel');
  const surfaceColor = cssVar('--color-surface');
  const textColor = cssVar('--color-text');
  const mutedColor = cssVar('--color-muted');
  const dangerColor = cssVar('--color-danger');

  const defaultBorder = data.isFocused
    ? `2px solid ${data.heatColor || accentColor}`
    : `1px solid ${data.heatColor || borderColor}${data.isFaded ? '18' : '55'}`;

  return (
    <div
      className="shadow-md rounded transition-all duration-150 relative"
      style={{
        opacity: data.isFaded ? 0.1 : 1,
        width: w,
        borderTop: defaultBorder,
        borderLeft: defaultBorder,
        borderRight: defaultBorder,
        borderBottom: showChurn && churnColor ? `${churnBorderThickness}px solid ${churnColor}` : defaultBorder,
        background: data.isFocused ? surfaceColor : panelColor,
        boxShadow: shadowGlow,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectable={false} />
      <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ overflow: 'hidden' }}>
        {isFile ? (
          <File className="w-3 h-3 shrink-0" style={{ color: data.heatColor || accentColor, minWidth: 12 }} />
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
              background: `${data.heatColor || accentColor}22`,
              color: data.heatColor || accentColor,
            }}
          >
            {data.degree}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />

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
          style={{
            position: 'absolute',
            top: -5,
            left: -5,
            fontSize: 10,
            lineHeight: 1,
            title: `Churn: ${churnScore}/100 | Composite Risk: ${compositeRisk}/100`,
          }}
          title={`Churn: ${churnScore}/100 | Composite Risk: ${compositeRisk}/100`}
        >
          {compositeRisk >= 85 ? '🔴' : '🟠'}
        </div>
      )}
    </div>
  );
};

export const GroupNode = ({ data }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      border: `1.5px solid ${data.color}44`,
      borderRadius: 12,
      background: `${data.color}08`,
    }}
  >
    <div
      className="absolute top-2 left-3 text-[10px] font-bold uppercase tracking-widest"
      style={{ color: `${data.color}bb` }}
    >
      {data.label}
    </div>
  </div>
);

export const SpringEdge = ({ id, sourceX, sourceY, targetX, targetY, style = {}, markerEnd, data }) => {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1) return null;

  const perpX = -dy / length;
  const perpY = dx / length;
  const coils = Math.max(2, Math.round(length / 50));

  // Force amplitude to 0 if straight lines are toggled, enabling smooth CSS transition of the path
  const amplitude = data?.isStraight ? 0 : Math.min(6, length / (coils * 3));

  const steps = coils * 16;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const envelope = Math.sin(t * Math.PI);
    const wave = Math.sin(t * coils * Math.PI * 2) * amplitude * envelope;
    pts.push(`${sourceX + t * dx + wave * perpX},${sourceY + t * dy + wave * perpY}`);
  }

  const pathD = `M ${pts.join(' L ')}`;

  // Remove the CSS transition on 'd' so edges don't lag behind nodes during force simulation
  const transitionStyle = { ...style, fill: 'none' };

  return (
    <>
      <path id={id} className="react-flow__edge-path" d={pathD} style={transitionStyle} markerEnd={markerEnd} />
      <path d={pathD} style={{ fill: 'none', stroke: 'transparent', strokeWidth: 12 }} />
    </>
  );
};

export const nodeTypes = { custom: CustomNode, group: GroupNode };
export const edgeTypes = { spring: SpringEdge };
