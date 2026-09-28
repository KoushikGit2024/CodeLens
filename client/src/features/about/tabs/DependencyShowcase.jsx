import React from 'react';
import InteractiveMiniGraph from '../components/InteractiveMiniGraph';

const nodes = [
  { id: 'app', type: 'default', data: { label: 'Core System' }, position: { x: 250, y: 100 }, style: { background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '50%', width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: '12px' } },
  { id: 'router', type: 'default', data: { label: 'Data Layer' }, position: { x: 150, y: 250 }, style: { background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px' } },
  { id: 'store', type: 'default', data: { label: 'State Manager' }, position: { x: 350, y: 250 }, style: { background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px' } },
  { id: 'auth', type: 'default', data: { label: 'Security Module' }, position: { x: 250, y: 400 }, style: { background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px' } },
];

const edges = [
  { id: 'e1', source: 'app', target: 'router', animated: true, style: { stroke: '#8b5cf6', strokeWidth: 2 } },
  { id: 'e2', source: 'app', target: 'store', animated: true, style: { stroke: '#8b5cf6', strokeWidth: 2 } },
  { id: 'e3', source: 'router', target: 'auth', animated: false, style: { stroke: '#64748b' } },
  { id: 'e4', source: 'store', target: 'auth', animated: false, style: { stroke: '#64748b' } },
];

export default function DependencyShowcase() {
  return (
    <div className="flex flex-col gap-12 w-full h-full pb-32">
      <div className="max-w-3xl">
        <h2 className="text-4xl font-extrabold text-text mb-6">Physics-Based Dependencies</h2>
        <p className="text-lg text-muted leading-relaxed mb-8">
          Watch your codebase come alive. The dependency graph leverages real-time force-directed physics to organically cluster highly-coupled files. It exposes the hidden gravity between modules.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="p-6 bg-panel border border-border rounded-xl">
            <h4 className="font-bold text-text mb-2 text-lg">Circular Dependency Detection</h4>
            <p className="text-sm text-muted">Instantly spotlights architectural flaws where modules form inescapable loops.</p>
          </div>
          <div className="p-6 bg-panel border border-border rounded-xl">
            <h4 className="font-bold text-text mb-2 text-lg">Blast Radius Simulation</h4>
            <p className="text-sm text-muted">Select a core utility and watch the ripple effect cascade through downstream consumers.</p>
          </div>
        </div>
      </div>

      <div className="w-full h-[500px]">
        <InteractiveMiniGraph nodes={nodes} edges={edges} />
      </div>
    </div>
  );
}
