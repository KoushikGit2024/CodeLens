import React from 'react';
import { Bookmark, Search, Edit3, Trash2, FolderHeart, CheckSquare } from 'lucide-react';
import { clsx } from 'clsx';

export default function BookmarksShowcase() {
  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
      
      {/* Header section */}
      <div className="flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto mb-8">
        <h1 className="flex items-center justify-center gap-4 text-4xl md:text-6xl font-light tracking-tight text-text">
          <Bookmark className="w-10 h-10 md:w-14 md:h-14 text-accent" strokeWidth={1.5} />
          <span>Saved <span className="font-semibold text-accent">Bookmarks</span></span>
        </h1>
        <p className="text-xl text-muted mt-6 leading-relaxed">
          Keep track of important files. Save critical files to your bookmarks, add custom notes, and easily search through them so you never lose your place.
        </p>
      </div>

      {/* Bento Grid Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        
        {/* Row 1: Save & Annotate (Col Span 7) */}
        <div className="md:col-span-7 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          
          <div className="relative z-10 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <FolderHeart className="w-6 h-6 text-accent" />
              <h3 className="text-2xl font-medium text-text">Save & Annotate</h3>
            </div>
            <p className="text-muted leading-relaxed mb-6 text-lg">
              Found a critical configuration file or a complex utility? Simply bookmark the file to add it to your personal reading list.
            </p>
            <p className="text-muted leading-relaxed">
              Once saved, you can add custom text notes to each bookmark, explaining why it's important or what you need to fix, ensuring you maintain your train of thought across sessions.
            </p>
          </div>
          
          {/* Mock UI Element: Bookmarks List */}
          <div className="relative z-10 mt-auto border border-border rounded-xl bg-surface p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3">
              {/* Bookmark Item */}
              <div className="flex items-start gap-3 bg-panel border border-border p-3 rounded-lg group hover:border-accent/50 transition-colors">
                <Bookmark className="w-5 h-5 text-accent mt-1 shrink-0" />
                <div className="flex flex-col flex-1">
                  <span className="text-sm font-mono text-text">src/utils/auth.js</span>
                  <div className="mt-2 text-xs text-muted bg-surface p-2 rounded border border-border flex items-center justify-between">
                    <span>Needs review before the next release.</span>
                    <Edit3 className="w-3.5 h-3.5 text-muted hover:text-text cursor-pointer" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 1: Search & Manage (Col Span 5) */}
        <div className="md:col-span-5 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 h-full flex flex-col">
            <CheckSquare className="w-6 h-6 text-accent mb-4" />
            <h3 className="text-2xl font-medium text-text mb-4">Search & Manage</h3>
            <p className="text-muted leading-relaxed mb-6">
              As your list of bookmarks grows, use the built-in search functionality to instantly filter your list by file path or by your custom notes.
            </p>
            <p className="text-muted leading-relaxed mb-8">
              Clean up easily by selecting multiple bookmarks and performing mass deletions, keeping your workspace perfectly organized.
            </p>

            <div className="mt-auto flex flex-col gap-3">
               <div className="border border-border bg-surface px-4 py-2 rounded-lg flex items-center gap-2">
                 <Search className="w-4 h-4 text-muted" />
                 <span className="text-sm text-muted">Search bookmarks...</span>
               </div>
               
               <div className="flex items-center justify-between mt-2">
                 <div className="flex items-center gap-2 text-xs text-muted">
                   <div className="w-3 h-3 border border-border rounded bg-accent" /> 3 Selected
                 </div>
                 <button className="text-xs flex items-center gap-1 text-red-400 hover:text-red-300">
                   <Trash2 className="w-3.5 h-3.5" /> Delete
                 </button>
               </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
