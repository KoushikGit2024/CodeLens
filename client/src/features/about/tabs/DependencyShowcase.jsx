import React from 'react';
import { GitMerge, Waypoints, CircleDashed, LayoutGrid, Zap, Layers, Filter } from 'lucide-react';
import { clsx } from 'clsx';

export default function DependencyShowcase() {
  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
      {/* Header section */}
      <div className="flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto mb-8">
        <h1 className="flex items-center justify-center gap-4 text-4xl md:text-6xl font-light tracking-tight text-text">
          <GitMerge className="w-10 h-10 md:w-14 md:h-14 text-accent" strokeWidth={1.5} />
          <span>
            Dependency <span className="font-semibold text-accent">Mapping</span>
          </span>
        </h1>
        <p className="text-xl text-muted mt-6 leading-relaxed">
          Untangle the spaghetti. An interactive visual map that exposes structural coupling, highlights circular
          imports, and features multiple algorithmic layouts.
        </p>
      </div>

      {/* Bento Grid Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        {/* Row 1: Interactive Canvas & Layouts (Col Span 7) */}
        <div className="md:col-span-7 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Waypoints className="w-6 h-6 text-accent" />
              <h3 className="text-2xl font-medium text-text">Algorithmic Layouts</h3>
            </div>
            <p className="text-muted leading-relaxed mb-6 text-sm md:text-base">
              The dependency viewer leverages React Flow to provide a highly interactive node-based canvas. Because
              every architecture is different, it offers three distinct algorithmic layouts:
            </p>
            <ul className="space-y-3 text-muted text-sm md:text-base mb-6">
              <li className="flex items-center gap-3">
                <LayoutGrid className="w-4 h-4 text-accent" /> <strong>Clustered:</strong> Groups files logically by
                their parent directories.
              </li>
              <li className="flex items-center gap-3">
                <Zap className="w-4 h-4 text-accent" /> <strong>Force:</strong> Uses d3-force physics for an organic
                layout.
              </li>
              <li className="flex items-center gap-3">
                <Layers className="w-4 h-4 text-accent" /> <strong>Flat:</strong> Standard left-to-right hierarchical
                representation.
              </li>
            </ul>
          </div>

          {/* Mock Edge Bundling Graphic */}
          <div className="relative z-10 mt-auto border border-border rounded-xl bg-surface h-48 flex items-center justify-center">
            <div className="relative w-full h-full flex items-center justify-center">
              <div className="absolute left-[20%] top-[30%] w-12 h-8 bg-panel border border-accent/50 rounded flex items-center justify-center text-[10px] text-text z-10">
                App.js
              </div>
              <div className="absolute left-[50%] top-[20%] w-12 h-8 bg-panel border border-accent/50 rounded flex items-center justify-center text-[10px] text-text z-10">
                Auth.js
              </div>
              <div className="absolute left-[50%] top-[60%] w-16 h-8 bg-panel border border-accent/50 rounded flex items-center justify-center text-[10px] text-text z-10">
                Utils.js
              </div>
              <div className="absolute right-[20%] top-[40%] w-12 h-8 bg-panel border border-accent/50 rounded flex items-center justify-center text-[10px] text-text z-10">
                API.js
              </div>

              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <path
                  d="M 35% 35% Q 40% 25% 45% 25%"
                  fill="none"
                  stroke="currentColor"
                  className="text-accent/40"
                  strokeWidth="2"
                />
                <path
                  d="M 35% 35% Q 40% 55% 45% 60%"
                  fill="none"
                  stroke="currentColor"
                  className="text-accent/40"
                  strokeWidth="2"
                />
                <path
                  d="M 55% 25% Q 70% 30% 75% 40%"
                  fill="none"
                  stroke="currentColor"
                  className="text-accent/40"
                  strokeWidth="2"
                />
                <path
                  d="M 60% 60% Q 70% 50% 75% 40%"
                  fill="none"
                  stroke="currentColor"
                  className="text-accent/40"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Row 1: External Packages & Circular Dependencies (Col Span 5) */}
        <div className="md:col-span-5 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 h-full flex flex-col">
            <CircleDashed className="w-6 h-6 text-accent mb-4" />
            <h3 className="text-2xl font-medium text-text mb-4">Circular Dependencies</h3>
            <p className="text-muted leading-relaxed mb-6">
              Circular dependencies can crash runtimes. The dependency graph automatically detects cyclic imports and
              flags them with visual warnings, making them easy to spot.
            </p>

            <div className="h-px w-full bg-border my-4" />

            <h3 className="text-xl font-medium text-text mb-4 flex items-center gap-2">
              <Filter className="w-5 h-5 text-accent" /> Package Filtering
            </h3>
            <p className="text-muted leading-relaxed mb-8">
              Toggle the visibility of external third-party packages to focus solely on your internal source code
              architecture, reducing visual noise.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
