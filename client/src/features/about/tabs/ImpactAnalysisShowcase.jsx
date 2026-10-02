import React from 'react';
import { Target, ShieldAlert, Share2, ArrowDown } from 'lucide-react';
import { clsx } from 'clsx';

export default function ImpactAnalysisShowcase() {
  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
      {/* Header section */}
      <div className="flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto mb-8">
        <h1 className="flex items-center justify-center gap-4 text-4xl md:text-6xl font-light tracking-tight text-text">
          <Target className="w-10 h-10 md:w-14 md:h-14 text-accent" strokeWidth={1.5} />
          <span>
            Impact <span className="font-semibold text-accent">Analysis</span>
          </span>
        </h1>
        <p className="text-xl text-muted mt-6 leading-relaxed">
          Calculate the exact blast radius of any code change. Visualize downstream propagation to see exactly what
          components rely on your target file before you modify it.
        </p>
      </div>

      {/* Bento Grid Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        {/* Row 1: Blast Radius & Dagre Layout (Col Span 7) */}
        <div className="md:col-span-7 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <ShieldAlert className="w-6 h-6 text-accent" />
              <h3 className="text-2xl font-medium text-text">Blast Radius Visualization</h3>
            </div>
            <p className="text-muted leading-relaxed mb-6 text-lg">
              Select any file in the repository to calculate its blast radius. CodeLens traverses the deterministic
              dependency tree to find every downstream dependent.
            </p>
            <p className="text-muted leading-relaxed">
              The results are beautifully rendered using a hierarchical directed graph (powered by dagre). The target
              file sits at the top, and arrows explicitly trace the propagation paths downwards, showing exactly how a
              change will ripple through your system.
            </p>
          </div>

          {/* Mock UI Element: Propagation Visual */}
          <div className="relative z-10 mt-auto border border-border rounded-xl bg-surface p-6 flex flex-col items-center gap-2 overflow-hidden">
            {/* Target Node */}
            <div className="px-4 py-2 bg-panel border border-accent text-accent rounded font-mono text-sm">
              Target: auth.js
            </div>

            <ArrowDown className="w-5 h-5 text-accent/50" />

            {/* 1st Degree */}
            <div className="flex items-center gap-4">
              <div className="px-3 py-1.5 bg-panel border border-border text-text rounded font-mono text-xs">
                login.js
              </div>
              <div className="px-3 py-1.5 bg-panel border border-border text-text rounded font-mono text-xs">
                session.js
              </div>
            </div>

            <div className="flex justify-around w-full max-w-[200px] px-8">
              <ArrowDown className="w-4 h-4 text-accent/30" />
              <ArrowDown className="w-4 h-4 text-accent/30" />
            </div>

            {/* 2nd Degree */}
            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-panel border border-border text-muted rounded font-mono text-[10px]">
                App.jsx
              </div>
              <div className="px-2 py-1 bg-panel border border-border text-muted rounded font-mono text-[10px]">
                Dashboard.jsx
              </div>
            </div>
          </div>
        </div>

        {/* Row 1: Export Diagrams (Col Span 5) */}
        <div className="md:col-span-5 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 h-full flex flex-col">
            <Share2 className="w-6 h-6 text-accent mb-4" />
            <h3 className="text-2xl font-medium text-text mb-4">Export Risk Diagram</h3>
            <p className="text-muted leading-relaxed mb-6">
              When proposing a major architectural change or updating a highly-coupled utility, you need to communicate
              the risk to your team.
            </p>
            <p className="text-muted leading-relaxed mb-8">
              CodeLens allows you to easily export the rendered blast radius graph as an image diagram, which you can
              attach directly to pull requests or Jira tickets.
            </p>

            <div className="mt-auto flex justify-center">
              <button className="px-6 py-3 rounded-xl bg-surface border border-border text-text font-medium flex items-center gap-2 hover:bg-panel transition-all">
                <Share2 className="w-4 h-4 text-accent" /> Export Diagram
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
