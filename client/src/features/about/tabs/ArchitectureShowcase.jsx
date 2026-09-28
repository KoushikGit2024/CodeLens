import React from 'react';
import InteractiveMiniGraph from '../components/InteractiveMiniGraph';

const nodes = [
  { id: 'module-a', type: 'default', data: { label: 'AuthService' }, position: { x: 100, y: 100 }, style: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px' } },
  { id: 'module-b', type: 'default', data: { label: 'UserRepository' }, position: { x: 100, y: 200 }, style: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px' } },
  { id: 'module-c', type: 'default', data: { label: 'PaymentGateway' }, position: { x: 300, y: 150 }, style: { background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px' } },
  { id: 'group-1', type: 'group', data: { label: 'Core Auth Domain' }, position: { x: 80, y: 50 }, style: { width: 140, height: 210, backgroundColor: 'rgba(37, 99, 235, 0.1)', border: '2px dashed #2563eb' } }
];

const edges = [
  { id: 'e1-2', source: 'module-a', target: 'module-b', animated: true, style: { stroke: '#3b82f6' } },
  { id: 'e1-3', source: 'module-a', target: 'module-c', animated: false, style: { stroke: '#64748b' } },
];

export default function ArchitectureShowcase() {
  return (
    <div className="flex flex-col gap-12 w-full h-full pb-32">
      <div className="max-w-3xl">
        <h2 className="text-4xl font-extrabold text-text mb-6">Macro-Architecture Map</h2>
        <p className="text-lg text-muted leading-relaxed mb-8">
          Navigating a new codebase is like landing in a foreign city without a map. CodeLens auto-detects structural boundaries, grouping thousands of files into distinct domains and bounded contexts.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="p-6 bg-panel border border-border rounded-xl">
            <h4 className="font-bold text-text mb-2 text-lg">Deterministic Clustering</h4>
            <p className="text-sm text-muted">Groups files based on folder structures and import affinities to form physical bounded contexts.</p>
          </div>
          <div className="p-6 bg-panel border border-border rounded-xl">
            <h4 className="font-bold text-text mb-2 text-lg">Infinite Canvas</h4>
            <p className="text-sm text-muted">Pan, zoom, and physically interact with the layout of your macro domains.</p>
          </div>
        </div>
      </div>

      <div className="w-full h-[500px]">
        <InteractiveMiniGraph nodes={nodes} edges={edges} />
      </div>
    </div>
  );
}
