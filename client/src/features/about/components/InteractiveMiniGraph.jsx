import React from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

// Reusable mini-graph component specifically for the About tabs
export default function InteractiveMiniGraph({ nodes, edges, nodeTypes }) {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-border bg-panel shadow-inner relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(255, 255, 255, 0.05)" gap={16} />
        <Controls className="fill-muted" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
