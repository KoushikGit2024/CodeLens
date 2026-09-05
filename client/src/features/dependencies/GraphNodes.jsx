import React from 'react';
import { Handle, Position } from 'reactflow';
import { File, Package } from 'lucide-react';
import { NODE_W, PKG_W } from './graphUtils';

export const CustomNode = ({ data }) => {
  const isFile = data.nodeType === 'file';
  const w = isFile ? NODE_W : PKG_W;
  return (
    <div
      className="shadow-md rounded transition-all duration-150"
      style={{
        opacity: data.isFaded ? 0.10 : 1,
        width: w,
        border: data.isFocused
          ? `2px solid ${data.heatColor || '#58a6ff'}`
          : `1px solid ${(data.heatColor || '#30363d')}${data.isFaded ? '18' : '55'}`,
        background: data.isFocused ? 'rgba(26, 39, 64, 0.9)' : 'rgba(22, 27, 34, 0.7)',
        boxShadow: data.isFocused ? `0 0 10px ${data.heatColor || '#58a6ff'}33` : 'none',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectable={false} />
      <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ overflow: 'hidden' }}>
        {isFile
          ? <File className="w-3 h-3 shrink-0" style={{ color: data.heatColor || '#58a6ff', minWidth: 12 }} />
          : <Package className="w-3 h-3 shrink-0 text-amber-400" style={{ minWidth: 12 }} />
        }
        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <div
            className="text-white font-semibold leading-tight"
            style={{ fontSize: 10, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
            title={data.label}
          >
            {data.label}
          </div>
          {isFile && data.shortDir && (
            <div
              className="leading-tight"
              style={{ fontSize: 9, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: data.dirColor || '#8b949e' }}
              title={data.dir}
            >
              {data.shortDir}
            </div>
          )}
        </div>
        {data.degree > 0 && (
          <span
            style={{
              fontSize: 9, fontWeight: 700, borderRadius: 99,
              padding: '0 4px', flexShrink: 0, lineHeight: '14px',
              background: `${data.heatColor || '#58a6ff'}22`,
              color: data.heatColor || '#58a6ff',
            }}
          >
            {data.degree}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />
      {data.isCycling && (
        <div 
          style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', background: '#ff7b72', boxShadow: '0 0 0 2px #161b22' }} 
          title="Involved in Cycle" 
        />
      )}
      {!data.isCycling && data.isIsolated && (
        <div 
          style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', background: '#8b949e', boxShadow: '0 0 0 2px #161b22' }} 
          title="Isolated File" 
        />
      )}
    </div>
  );
};

export const GroupNode = ({ data }) => (
  <div
    style={{
      width: '100%', height: '100%',
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

export const SpringEdge = ({ id, sourceX, sourceY, targetX, targetY, style = {}, markerEnd }) => {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1) return null;

  const perpX = -dy / length;
  const perpY =  dx / length;
  const coils = Math.max(2, Math.round(length / 50));
  const amplitude = Math.min(6, length / (coils * 3));

  const steps = coils * 16;
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
      <path id={id} className="react-flow__edge-path" d={pathD} style={{ ...style, fill: 'none' }} markerEnd={markerEnd} />
      <path d={pathD} style={{ fill: 'none', stroke: 'transparent', strokeWidth: 12 }} />
    </>
  );
};

export const nodeTypes = { custom: CustomNode, group: GroupNode };
export const edgeTypes = { spring: SpringEdge };