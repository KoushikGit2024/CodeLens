import React from 'react';
import { ShieldAlert } from 'lucide-react';

export default function EngineeringHealthTab() {
  return (
    <div className="flex flex-col gap-12 w-full h-full pb-32">
      <div className="max-w-3xl">
        <h2 className="text-4xl font-extrabold text-text mb-6">Uncompromising Code Health</h2>
        <p className="text-lg text-muted leading-relaxed mb-8">
          Technical debt is invisible until it's too late. CodeLens exposes it with surgical precision. It calculates metrics entirely in the browser using Tree-sitter ASTs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-8 border border-border bg-panel rounded-2xl hover:border-accent transition-colors group">
          <div className="text-5xl font-black text-muted/20 mb-6 group-hover:text-accent/20 transition-colors">01</div>
          <h3 className="text-xl font-bold text-text mb-3">Dead Code Radar</h3>
          <p className="text-sm text-muted leading-relaxed">Runs graph traversals from entry points to find unreferenced files, allowing you to confidently delete abandoned modules.</p>
        </div>
        
        <div className="p-8 border border-border bg-panel rounded-2xl hover:border-accent transition-colors group">
          <div className="text-5xl font-black text-muted/20 mb-6 group-hover:text-accent/20 transition-colors">02</div>
          <h3 className="text-xl font-bold text-text mb-3">Complexity Hotspots</h3>
          <p className="text-sm text-muted leading-relaxed">Computes McCabe cyclomatic complexity instantly, flagging files that are mathematically too complex to maintain safely.</p>
        </div>

        <div className="p-8 border border-border bg-panel rounded-2xl hover:border-accent transition-colors group">
          <div className="text-5xl font-black text-muted/20 mb-6 group-hover:text-accent/20 transition-colors">03</div>
          <h3 className="text-xl font-bold text-text mb-3">Clone Detection</h3>
          <p className="text-sm text-muted leading-relaxed">Abstracts AST nodes to find structural clones across files, identifying massive copy-paste operations.</p>
        </div>
      </div>
    </div>
  );
}
