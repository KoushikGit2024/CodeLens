import React from 'react';
import { Network, Download, FileText, Share2, ZoomIn, Search } from 'lucide-react';
import { clsx } from 'clsx';

export default function ArchitectureShowcase() {
  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
      {/* Header section */}
      <div className="flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto mb-8">
        <h1 className="flex items-center justify-center gap-4 text-4xl md:text-6xl font-light tracking-tight text-text">
          <Network className="w-10 h-10 md:w-14 md:h-14 text-accent" strokeWidth={1.5} />
          <span>
            System <span className="font-semibold text-accent">Architecture</span>
          </span>
        </h1>
        <p className="text-xl text-muted mt-6 leading-relaxed">
          See the invisible forces binding your codebase together. A visual canvas that maps system boundaries using
          AI-generated Mermaid flowcharts, and exports diagrams instantly.
        </p>
      </div>

      {/* Bento Grid Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        {/* Row 1: AI Mermaid Flowcharts (Col Span 8) */}
        <div className="md:col-span-8 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 grid md:grid-cols-2 gap-8 h-full">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <FileText className="w-6 h-6 text-accent" />
                <h3 className="text-2xl font-medium text-text">AI Diagram Generation</h3>
              </div>
              <p className="text-muted leading-relaxed mb-6">
                Instead of manually drawing boxes and arrows, let the AI do it for you.
              </p>
              <p className="text-muted leading-relaxed mb-6 text-sm">
                CodeLens analyzes your repository context and synthesizes complex structural relationships into
                industry-standard Mermaid flowcharts, instantly rendering them into beautiful interactive diagrams.
              </p>
              <div className="flex flex-col gap-2 mt-4 text-sm text-text bg-surface border border-border p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <ZoomIn className="w-4 h-4 text-accent" /> <span className="font-medium">Scroll to Zoom & Pan</span>
                </div>
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-accent" />{' '}
                  <span className="font-medium">Interactive SVG Rendering</span>
                </div>
              </div>
            </div>

            {/* Mock Graph Element */}
            <div className="flex flex-col border-l border-border/50 pl-8 justify-center">
              <div className="w-full h-48 border border-border rounded-xl bg-surface overflow-hidden relative flex flex-col items-center justify-center">
                <div className="px-4 py-2 bg-panel border border-border rounded shadow-sm text-sm text-text font-mono z-10">
                  Client
                </div>
                <div className="h-6 w-px bg-accent my-1"></div>
                <div className="px-4 py-2 bg-panel border border-border rounded shadow-sm text-sm text-text font-mono z-10">
                  API Gateway
                </div>
                <div className="flex w-full justify-center gap-4 mt-2">
                  <div className="flex flex-col items-center">
                    <div className="h-6 w-px bg-accent mb-1 -rotate-[30deg] translate-x-3"></div>
                    <div className="px-3 py-1 bg-panel border border-border rounded text-xs text-muted">
                      Auth Service
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="h-6 w-px bg-accent mb-1 rotate-[30deg] -translate-x-3"></div>
                    <div className="px-3 py-1 bg-panel border border-border rounded text-xs text-muted">DB Schema</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 1: Exports (Col Span 4) */}
        <div className="md:col-span-4 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 h-full flex flex-col">
            <Share2 className="w-6 h-6 text-accent mb-4" />
            <h3 className="text-2xl font-medium text-text mb-4">Export Diagrams</h3>
            <p className="text-muted leading-relaxed mb-6">
              A beautiful graph isn't useful unless you can share it with your team.
            </p>
            <p className="text-muted leading-relaxed mb-6">
              Use the dedicated export buttons to instantly convert the rendered Mermaid graph into crisp,
              high-resolution PNG or scalable SVG diagrams.
            </p>

            <div className="mt-auto flex flex-col gap-3">
              <button className="w-full px-6 py-3 rounded-xl bg-surface border border-border text-text font-medium flex items-center justify-center gap-2 hover:bg-panel transition-all">
                <Download className="w-4 h-4 text-accent" /> Export SVG
              </button>
              <button className="w-full px-6 py-3 rounded-xl bg-surface border border-border text-text font-medium flex items-center justify-center gap-2 hover:bg-panel transition-all">
                <Download className="w-4 h-4 text-accent" /> Export PNG
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
