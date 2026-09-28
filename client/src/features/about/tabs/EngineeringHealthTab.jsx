import React from 'react';
import { Activity, ShieldAlert, FileSearch, ArrowRight, LayoutTemplate } from 'lucide-react';
import { clsx } from 'clsx';

export default function EngineeringHealthTab() {
  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
      
      {/* Header section */}
      <div className="flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto mb-8">
        <h1 className="flex items-center justify-center gap-4 text-4xl md:text-6xl font-light tracking-tight text-text">
          <Activity className="w-10 h-10 md:w-14 md:h-14 text-accent" strokeWidth={1.5} />
          <span>Engineering <span className="font-semibold text-accent">Health</span></span>
        </h1>
        <p className="text-xl text-muted mt-6 leading-relaxed">
          The triage center for technical debt. Discover exactly where complexity, dead code, and structural clones are hiding across your repository.
        </p>
      </div>

      {/* Bento Grid Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        
        {/* Row 1: Complexity & Clones (Col Span 7) */}
        <div className="md:col-span-7 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          
          <div className="relative z-10 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <ShieldAlert className="w-6 h-6 text-accent" />
              <h3 className="text-2xl font-medium text-text">Debt Identification</h3>
            </div>
            <p className="text-muted leading-relaxed mb-6 text-lg">
              The health dashboard categorizes technical debt into actionable lists.
            </p>
            <p className="text-muted leading-relaxed mb-4">
              <strong>Cyclomatic Complexity:</strong> Files with deeply nested logic are flagged and scored, helping you identify refactoring targets.
            </p>
            <p className="text-muted leading-relaxed">
              <strong>Clone Detection:</strong> Structural code clones (copy-pasted logic) are grouped together so you can consolidate duplicated code into shared utilities.
            </p>
          </div>
          
          {/* Mock UI Element: Health List */}
          <div className="relative z-10 mt-auto border border-border rounded-xl bg-surface p-1">
             <div className="flex flex-col">
               <div className="flex justify-between p-3 border-b border-border hover:bg-panel transition-colors items-center">
                 <div className="text-sm text-text font-mono truncate flex items-center gap-2">
                   <LayoutTemplate className="w-4 h-4 text-accent" /> auth_controller.ts
                 </div>
                 <div className="px-2 py-1 bg-panel border border-border text-accent rounded text-xs font-bold">Complexity: 42</div>
               </div>
               <div className="flex justify-between p-3 hover:bg-panel transition-colors items-center">
                 <div className="text-sm text-text font-mono truncate flex items-center gap-2">
                   <FileSearch className="w-4 h-4 text-accent" /> payment_gateway.ts
                 </div>
                 <div className="px-2 py-1 bg-panel border border-border text-accent rounded text-xs font-bold">Clone Group</div>
               </div>
             </div>
          </div>
        </div>

        {/* Row 1: Dead Code & Navigation (Col Span 5) */}
        <div className="md:col-span-5 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 h-full flex flex-col">
            <Activity className="w-6 h-6 text-accent mb-4" />
            <h3 className="text-2xl font-medium text-text mb-4">Dead Code & Navigation</h3>
            <p className="text-muted leading-relaxed mb-6">
              Unused exports and unreachable code clutter your repository. The Health dashboard flags these dead files instantly.
            </p>
            <p className="text-muted leading-relaxed mb-8">
              Every identified debt item acts as a direct link. Click on any file in the report to instantly open it in the Source Explorer to begin refactoring.
            </p>

            <div className="mt-auto flex justify-center">
               <div className="px-6 py-3 rounded-xl bg-surface border border-border text-muted font-medium flex items-center gap-2">
                 <ArrowRight className="w-5 h-5 text-accent" /> Jump to Source Explorer
               </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
