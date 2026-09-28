import React from 'react';
import { UploadCloud, FileJson, Search, Compass, Activity, BarChart } from 'lucide-react';
import { clsx } from 'clsx';

export default function DashboardShowcase() {
  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
      
      {/* Header section */}
      <div className="flex flex-col items-center text-center space-y-2 max-w-3xl mx-auto mb-8">
        <h1 className="flex items-center justify-center gap-4 text-4xl md:text-6xl font-light tracking-tight text-text">
          <Activity className="w-10 h-10 md:w-14 md:h-14 text-accent" strokeWidth={1.5} />
          <span>Repository <span className="font-semibold text-accent">Dashboard</span></span>
        </h1>
        <p className="text-xl text-muted mt-6 leading-relaxed">
          The command center for your codebase. Upload projects locally, generate AI executive summaries, and track your engineering health at a glance.
        </p>
      </div>

      {/* Bento Grid Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        
        {/* Row 1: Drag & Drop (Col Span 7) */}
        <div className="md:col-span-7 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <UploadCloud className="w-6 h-6 text-accent" />
              <h3 className="text-2xl font-medium text-text">Local-First Uploads</h3>
            </div>
            <p className="text-muted leading-relaxed mb-6 text-lg">
              CodeLens is built on privacy. The dashboard starts by allowing you to easily Drag & Drop a ZIP file of your codebase directly into the browser.
            </p>
            <p className="text-muted leading-relaxed">
              Every file is extracted locally using Web Workers. Your proprietary code never touches an external server for processing—it stays entirely within your machine's memory.
            </p>
          </div>
          
          <div className="relative z-10 mt-auto border-2 border-dashed border-border rounded-2xl bg-surface p-8 flex flex-col items-center justify-center gap-3 transition-colors group-hover:border-accent/50">
             <div className="p-3 bg-panel rounded-full border border-border">
               <FileJson className="w-8 h-8 text-accent" />
             </div>
             <span className="font-medium text-text">Drag & Drop ZIP Archive</span>
             <span className="text-xs text-muted">or click to browse local files</span>
          </div>
        </div>

        {/* Row 1: Unified Metrics (Col Span 5) */}
        <div className="md:col-span-5 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 h-full flex flex-col">
            <BarChart className="w-6 h-6 text-accent mb-4" />
            <h3 className="text-2xl font-medium text-text mb-4">Unified Metrics</h3>
            <p className="text-muted leading-relaxed mb-6">
              Once analyzed, the dashboard presents a high-level overview of your engineering health.
            </p>
            <p className="text-muted leading-relaxed mb-8">
              Instantly view critical statistics like total lines of code, cyclomatic complexity scores, detected structural clones, and potential dead code across your entire repository.
            </p>

            <div className="mt-auto grid grid-cols-2 gap-3">
               <div className="bg-surface border border-border p-4 rounded-xl flex flex-col gap-1">
                 <span className="text-xs text-muted">Total Files</span>
                 <span className="text-2xl font-semibold text-text">245</span>
               </div>
               <div className="bg-surface border border-border p-4 rounded-xl flex flex-col gap-1">
                 <span className="text-xs text-muted">Complexity</span>
                 <span className="text-2xl font-semibold text-accent">High</span>
               </div>
            </div>
          </div>
        </div>

        {/* Row 2: Executive Summary & Global Search (Col Span 12) */}
        <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6">
           
           <div className="group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col">
              <div className="relative z-10">
                <Compass className="w-6 h-6 text-accent mb-4" />
                <h3 className="text-2xl font-medium text-text mb-4">AI Executive Summary</h3>
                <p className="text-muted leading-relaxed mb-6">
                  Too busy to read the code? Click the Generate Executive Summary button. The integrated AI will synthesize the repository structure and provide a natural language breakdown of the architecture, tech stack, and overall health.
                </p>
              </div>
           </div>

           <div className="group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col">
              <div className="relative z-10 h-full flex flex-col">
                <Search className="w-6 h-6 text-accent mb-4" />
                <h3 className="text-2xl font-medium text-text mb-4">Global File Search</h3>
                <p className="text-muted leading-relaxed mb-6">
                  Press <kbd className="px-2 py-1 bg-surface rounded border border-border text-xs font-mono">⌘P</kbd> from anywhere in the application to summon the global file finder. Instantly search and navigate to any file path in the repository without clicking through directories.
                </p>
                
                <div className="mt-auto border border-border bg-surface p-3 rounded-xl flex items-center">
                  <Search className="w-5 h-5 text-muted mr-3" />
                  <span className="text-text/50 font-mono text-sm">Find files...</span>
                  <span className="ml-auto text-xs bg-panel border border-border px-2 py-1 rounded">⌘P</span>
                </div>
              </div>
           </div>

        </div>
      </div>
    </div>
  );
}
