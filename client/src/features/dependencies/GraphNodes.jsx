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
          ? `2px solid ${data.heatColor || '#4D7EFF'}`
          : `1px solid ${(data.heatColor || '#1D2130')}${data.isFaded ? '18' : '55'}`,
        background: data.isFocused ? 'rgba(17, 23, 38, 0.95)' : 'rgba(17, 19, 24, 0.85)',
        boxShadow: 'none',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectable={false} />
      <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ overflow: 'hidden' }}>
        {isFile
          ? <File className="w-3 h-3 shrink-0" style={{ color: data.heatColor || '#4D7EFF', minWidth: 12 }} />
          : <Package className="w-3 h-3 shrink-0 text-amber-400" style={{ minWidth: 12 }} />
        }
        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <div
            style={{ fontSize: 10, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: '#CBD5E8', fontWeight: 600, lineHeight: '1.25' }}
            title={data.label}
          >
            {data.label}
          </div>
          {isFile && data.shortDir && (
            <div
              className="leading-tight"
              style={{ fontSize: 9, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: data.dirColor || '#6B7A99' }}
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
              background: `${data.heatColor || '#4D7EFF'}22`,
              color: data.heatColor || '#4D7EFF',
            }}
          >
            {data.degree}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />
      {data.isCycling && (
        <div 
          style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', background: '#e05252', boxShadow: '0 0 0 2px #0C0E14' }} 
          title="Involved in Cycle" 
        />
      )}
      {!data.isCycling && data.isIsolated && (
        <div 
          style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', background: '#6B7A99', boxShadow: '0 0 0 2px #0C0E14' }} 
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