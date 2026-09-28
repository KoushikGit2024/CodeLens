import React from 'react';
import { Github, Heart, User, Layers, Zap, Network } from 'lucide-react';

export default function CreatorProfile() {
  return (
    <div className="flex flex-col gap-12 w-full h-full pb-32 max-w-4xl mx-auto">
      <div className="relative rounded-3xl border border-border bg-panel overflow-hidden mt-12">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent"></div>
        
        <div className="relative p-12 lg:p-16 flex flex-col md:flex-row items-center gap-12">
          <div className="shrink-0 relative">
            <div className="w-40 h-40 rounded-full p-1 bg-gradient-to-br from-accent to-surface shadow-2xl">
              <div className="w-full h-full rounded-full bg-panel flex items-center justify-center border-4 border-panel overflow-hidden relative group">
                <img 
                  src="https://avatars.githubusercontent.com/u/186868030" 
                  alt="Koushik" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>
            </div>
            {/* <div className="absolute -bottom-3 -right-3 w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
              <Heart className="w-5 h-5 text-red-500 fill-red-500" />
            </div> */}
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-surface border border-border text-xs font-semibold text-muted uppercase tracking-wider mb-4">
              <User className="w-3.5 h-3.5" /> The Creator
            </div>
            <h2 className="text-4xl font-extrabold text-text mb-4">Koushik</h2>
            <p className="text-lg text-muted mb-6 leading-relaxed max-w-2xl">
              I built CodeLens out of a pure passion for software architecture and the challenge of understanding massive codebases. I wanted a tool that didn't just show code, but revealed its soul—the intricate dependencies, the hidden technical debt, and the beautiful structures that emerge from logic.
            </p>
            
            <div className="flex items-center justify-center md:justify-start gap-4">
              <a 
                href="https://github.com/KoushikGit2024" 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 bg-surface border border-border rounded-lg text-sm font-medium text-text hover:bg-accent hover:text-white hover:border-accent transition-all duration-300 shadow-sm hover:shadow-accent/20"
              >
                <Github className="w-4 h-4" /> Follow on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center pb-12 mt-12">
        <p className="text-sm font-medium text-muted/50 uppercase tracking-widest mb-4">Designed with Precision</p>
        <div className="flex items-center justify-center gap-4 text-xs text-muted/30">
          <div className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Static Analysis</div>
          <span className="mx-2">•</span> 
          <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Web Worker Acceleration</div>
          <span className="mx-2">•</span> 
          <div className="flex items-center gap-1.5"><Network className="w-3.5 h-3.5" /> Abstract Syntax Trees</div>
        </div>
      </div>
    </div>
  );
}
