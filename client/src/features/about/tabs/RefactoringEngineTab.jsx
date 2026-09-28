import React from 'react';
import { Wrench } from 'lucide-react';

export default function RefactoringEngineTab() {
  return (
    <div className="flex flex-col gap-12 w-full h-full pb-32">
      <div className="max-w-3xl">
        <h2 className="text-4xl font-extrabold text-text mb-6">AI Refactoring Engine</h2>
        <p className="text-lg text-muted leading-relaxed mb-8">
          Coupled with deterministic AST analysis, the refactoring engine doesn't just guess—it acts with precision. It parses isolated fragments of code, identifies smell patterns, and generates solutions powered by IBM watsonx.
        </p>
      </div>

      <div className="relative p-8 rounded-2xl border border-border bg-panel overflow-hidden group">
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:16px_16px]"></div>
        
        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-12 items-center z-10">
          <div className="space-y-6">
            <div className="p-4 bg-surface border border-border rounded-lg border-l-4 border-l-warning">
              <h4 className="text-sm font-bold text-warning mb-1">Code Smell Detected</h4>
              <p className="text-xs text-muted">Function `executeCompute` has a cyclomatic complexity of 42. Consider extracting early returns.</p>
            </div>
            
            <div className="flex justify-center">
              <div className="h-8 w-0.5 bg-border"></div>
            </div>
            
            <div className="p-4 bg-surface border border-accent/30 rounded-lg border-l-4 border-l-accent">
              <h4 className="text-sm font-bold text-accent mb-1">AI Context Assembly</h4>
              <p className="text-xs text-muted">Injecting local graph nodes and exact AST slices to the prompt...</p>
            </div>
          </div>
          
          <div className="bg-[#1e1e1e] rounded-xl border border-border overflow-hidden p-4 font-mono text-sm shadow-xl">
            <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="ml-2 text-xs text-muted">SystemCore.js</span>
            </div>
            <pre className="text-gray-300">
              <span className="text-blue-400">export function</span> <span className="text-yellow-300">executeCompute</span>(data) {'{\n'}
              <span className="text-green-400">  // Refactored by AI</span>{'\n'}
              <span className="text-purple-400">  if</span> (!data) <span className="text-blue-400">return</span> [];{'\n'}
              {'\n'}
              <span className="text-blue-400">  return</span> data.<span className="text-yellow-300">map</span>(i {'=>'} i.value);{'\n'}
              {'}'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
