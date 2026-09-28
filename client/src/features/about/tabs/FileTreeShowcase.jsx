import React from 'react';
import { FolderTree, FileSearch, Files, ChevronRight, ChevronDown, Bookmark } from 'lucide-react';
import { clsx } from 'clsx';

export default function FileTreeShowcase() {
  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
      
      {/* Header section */}
      <div className="flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto mb-8">
        <h1 className="flex items-center justify-center gap-4 text-4xl md:text-6xl font-light tracking-tight text-text">
          <FolderTree className="w-10 h-10 md:w-14 md:h-14 text-accent" strokeWidth={1.5} />
          <span>Semantic <span className="font-semibold text-accent">File Tree</span></span>
        </h1>
        <p className="text-xl text-muted mt-6 leading-relaxed">
          Navigate your repository effortlessly. A clean, responsive file explorer that supports instant filtering and highlights your personal bookmarks.
        </p>
      </div>

      {/* Bento Grid Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        
        {/* Row 1: Directory Navigation (Col Span 7) */}
        <div className="md:col-span-7 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          
          <div className="relative z-10 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Files className="w-6 h-6 text-accent" />
              <h3 className="text-2xl font-medium text-text">Directory Navigation</h3>
            </div>
            <p className="text-muted leading-relaxed mb-6 text-lg">
              The core of the CodeLens experience starts with an intuitive file tree. It perfectly mirrors your local workspace structure.
            </p>
            <p className="text-muted leading-relaxed">
              Folders dynamically expand and collapse, while icons are color-coded based on the file type extension. If you have any files saved to your Bookmarks, they are prominently badged directly inside the tree so you can spot them instantly.
            </p>
          </div>
          
          {/* Mock UI Element: File Tree */}
          <div className="relative z-10 mt-auto border border-border rounded-xl bg-surface p-4 flex flex-col gap-2 font-mono text-sm">
            <div className="flex items-center gap-2 text-text cursor-pointer hover:bg-panel p-1 rounded">
              <ChevronDown className="w-4 h-4 text-muted" />
              <FolderTree className="w-4 h-4 text-accent" /> src
            </div>
            <div className="flex flex-col ml-6 border-l border-border pl-2 space-y-1">
              <div className="flex items-center justify-between hover:bg-panel p-1.5 rounded cursor-pointer group">
                <div className="flex items-center gap-2 text-muted group-hover:text-text">
                  <Files className="w-4 h-4" /> App.jsx
                </div>
              </div>
              <div className="flex items-center justify-between hover:bg-panel p-1.5 rounded cursor-pointer">
                <div className="flex items-center gap-2 text-text">
                  <Files className="w-4 h-4 text-accent" /> utils.js
                </div>
                <Bookmark className="w-3.5 h-3.5 text-accent" />
              </div>
            </div>
          </div>
        </div>

        {/* Row 1: Search & Filter (Col Span 5) */}
        <div className="md:col-span-5 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 h-full flex flex-col">
            <FileSearch className="w-6 h-6 text-accent mb-4" />
            <h3 className="text-2xl font-medium text-text mb-4">Inline Search</h3>
            <p className="text-muted leading-relaxed mb-6">
              When dealing with massive monolithic repositories, scrolling through the file tree isn't viable.
            </p>
            <p className="text-muted leading-relaxed mb-8">
              An interactive search bar allows you to instantly filter directory structures down to specific file names, stripping away the noise and presenting only the files you need.
            </p>

            <div className="mt-auto border border-border bg-surface p-3 rounded-xl flex items-center gap-3">
               <FileSearch className="w-5 h-5 text-muted" />
               <span className="text-sm font-mono text-text/50">Filter tree...</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
