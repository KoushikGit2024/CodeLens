import React, { useState } from 'react';
import { Sparkles, CloudOff, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { useAIState } from './AIContext';

export default function AIStatusIndicator() {
  const { aiState } = useAIState();
  const [showPopover, setShowPopover] = useState(false);

  if (aiState === 'loading') return null;

  const getConfig = () => {
    switch (aiState) {
      case 'enhanced':
        return {
          label: 'AI Enhanced',
          icon: <Sparkles className="w-3.5 h-3.5" />,
          colorClass: 'text-accent border-accent/30 bg-accent/10',
          title: 'AI Enhanced',
          desc: 'CodeLens is fully operational with IBM watsonx integration.',
          available: [
            'Repository analysis', 'Dependency graph', 'Architecture', 
            'Engineering health', 'Refactoring analysis', 'Code viewer',
            'AI summaries', 'Natural-language Q&A', 'AI recommendations'
          ],
          unavailable: []
        };
      case 'offline':
        return {
          label: 'Offline Intelligence',
          icon: <CloudOff className="w-3.5 h-3.5" />,
          colorClass: 'text-muted border-border bg-panel',
          title: 'Offline Intelligence',
          desc: 'CodeLens is currently operating without IBM watsonx.',
          available: [
             'Repository analysis', 'Dependency graph', 'Architecture', 
            'Engineering health', 'Refactoring analysis', 'Documentation facts', 'Code viewer'
          ],
          unavailable: [
            'AI summaries', 'Natural-language Q&A', 'AI recommendations'
          ]
        };
      case 'unavailable':
        return {
          label: 'AI Unavailable',
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          colorClass: 'text-warning border-warning/30 bg-warning/10',
          title: 'AI Unavailable',
          desc: 'CodeLens is configured for AI, but IBM watsonx is temporarily failing or unreachable. Falling back to Offline Intelligence.',
          available: [
             'Repository analysis', 'Dependency graph', 'Architecture', 
            'Engineering health', 'Refactoring analysis', 'Code viewer'
          ],
          unavailable: [
            'AI summaries', 'Natural-language Q&A', 'AI recommendations'
          ]
        };
      case 'error':
        return {
          label: 'AI Error',
          icon: <AlertCircle className="w-3.5 h-3.5" />,
          colorClass: 'text-danger border-danger/30 bg-danger/10',
          title: 'API Error',
          desc: 'Could not fetch AI configuration status.',
          available: [],
          unavailable: []
        };
      default:
        return null;
    }
  };

  const config = getConfig();
  if (!config) return null;

  return (
    <div className="relative">
      <button 
        onClick={() => setShowPopover(!showPopover)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors hover:brightness-110 ${config.colorClass}`}
      >
        {config.icon}
        {config.label}
      </button>

      {showPopover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPopover(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 bg-panel border border-border rounded-lg shadow-xl z-50 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex justify-between items-start mb-2">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className={config.colorClass.split(' ')[0]}>{config.icon}</span>
                {config.title}
              </h4>
              <button onClick={() => setShowPopover(false)} className="text-muted hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-xs text-muted mb-4 leading-relaxed">
              {config.desc}
            </p>

            <div className="flex flex-col gap-3">
              {config.available.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted mb-1 block">Available locally</span>
                  <ul className="text-xs text-white/90 flex flex-col gap-1">
                    {config.available.map(item => (
                      <li key={item} className="flex items-center gap-1.5">
                        <span className="text-success text-[10px]">✓</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {config.unavailable.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted mb-1 block">AI-enhanced (Unavailable)</span>
                  <ul className="text-xs text-muted flex flex-col gap-1">
                    {config.unavailable.map(item => (
                      <li key={item} className="flex items-center gap-1.5">
                        <span className="text-[10px]">○</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-muted/80 text-center">
              Your deterministic analysis continues to work locally.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
