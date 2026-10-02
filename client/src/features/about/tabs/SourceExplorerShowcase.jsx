import React from 'react';
import { Search, Code2, Compass, FolderTree, FileCode2, ChevronRight, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

export default function SourceExplorerShowcase() {
  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
      {/* Header section */}
      <div className="flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto mb-8">
        <h1 className="flex items-center justify-center gap-4 text-4xl md:text-6xl font-light tracking-tight text-text">
          <Compass className="w-10 h-10 md:w-14 md:h-14 text-accent" strokeWidth={1.5} />
          <span>
            Source <span className="font-semibold text-accent">Explorer</span>
          </span>
        </h1>
        <p className="text-xl text-muted mt-6 leading-relaxed">
          A seamless code reading experience. Browse your repository directory structure and view files with rich syntax
          highlighting powered by a robust editor engine.
        </p>
      </div>

      {/* Bento Grid Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        {/* Row 1: File Tree (Col Span 4) */}
        <div className="md:col-span-4 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <FolderTree className="w-6 h-6 text-accent" />
              <h3 className="text-2xl font-medium text-text">Repository Tree</h3>
            </div>
            <p className="text-muted leading-relaxed mb-6 text-sm">
              Navigate your codebase easily. The sidebar features a collapsible file tree, allowing you to drill down
              into deeply nested directories and instantly switch between files.
            </p>
          </div>

          {/* Mock UI Element: File Tree */}
          <div className="relative z-10 mt-auto border border-border rounded-xl bg-surface p-4 flex flex-col gap-2 font-mono text-sm">
            <div className="flex items-center gap-2 text-text cursor-pointer hover:bg-panel p-1 rounded">
              <ChevronDown className="w-4 h-4 text-muted" />
              <FolderTree className="w-4 h-4 text-accent" /> src
            </div>
            <div className="flex flex-col ml-6 space-y-1 border-l border-border pl-2">
              <div className="flex items-center gap-2 text-muted hover:text-text cursor-pointer p-1 rounded hover:bg-panel">
                <FileCode2 className="w-4 h-4" /> App.jsx
              </div>
              <div className="flex items-center gap-2 text-text cursor-pointer p-1 rounded bg-panel border border-border">
                <FileCode2 className="w-4 h-4 text-accent" /> main.js
              </div>
            </div>
          </div>
        </div>

        {/* Row 1: Code Editor (Col Span 8) */}
        <div className="md:col-span-8 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 h-full flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <Code2 className="w-6 h-6 text-accent" />
              <h3 className="text-2xl font-medium text-text">Rich Syntax Highlighting</h3>
            </div>
            <p className="text-muted leading-relaxed mb-6">
              When you select a file, it opens in a professional-grade editor panel. Enjoy accurate syntax highlighting,
              line numbers, and code folding to make reading complex scripts effortless.
            </p>

            <div className="mt-auto border border-border rounded-xl bg-surface overflow-hidden font-mono text-xs md:text-sm">
              <div className="flex items-center gap-4 bg-panel px-4 py-2 border-b border-border text-muted">
                <span className="text-accent border-b border-accent pb-2 -mb-2">main.js</span>
              </div>
              <div className="p-4 flex">
                <div className="flex flex-col text-right pr-4 text-muted/50 select-none border-r border-border/50">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                </div>
                <div className="flex flex-col pl-4 text-muted">
                  <div>
                    <span className="text-accent">import</span> {'{'} init {'}'}{' '}
                    <span className="text-accent">from</span> <span className="text-text">'./app'</span>;
                  </div>
                  <div className="text-transparent">.</div>
                  <div>
                    <span className="text-accent">function</span> <span className="text-text">bootstrap</span>() {'{'}
                  </div>
                  <div>
                    {'  '}
                    <span className="text-text">init</span>();
                  </div>
                  <div>{'}'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
