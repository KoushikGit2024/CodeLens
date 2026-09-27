/**
 * AIStatusIndicator.jsx
 *
 * It monitors the global AI context, then extracts the provider connection status, 
 * and then it applies deterministic fallback UI configurations when offline.
 */
import React, { useState } from 'react';
import { Sparkles, CloudOff, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { useAIState } from '../../shared/context/AIContext';

export default function AIStatusIndicator() {
  const { effectiveState, retryConnection, aiState } = useAIState();
  const [showPopover, setShowPopover] = useState(false);

  if (effectiveState === 'loading') return null;

  const getConfig = () => {
    switch (effectiveState) {
      case 'enhanced':
        return {
          label: 'AI Enhanced',
          icon: <Sparkles className="w-3.5 h-3.5" />,
          colorClass: 'text-accent border-accent/30 bg-accent/10',
          title: 'AI Enhanced',
          desc: 'CodeLens is fully operational with an active AI provider.',
          available: [
            'Repository analysis', 'Dependency graph', 'Architecture', 
            'Engineering health', 'Refactoring analysis', 'Code viewer',
            'AI summaries', 'Natural-language Q&A', 'AI recommendations'
          ],
          unavailable: []
        };
      case 'unauthenticated':
        return {
          label: 'Sign in for AI',
          icon: <Sparkles className="w-3.5 h-3.5" />,
          colorClass: 'text-text border-accent bg-accent/20 hover:bg-accent/40 shadow-[0_0_8px_rgba(var(--color-accent),0.3)]',
          title: 'Sign In Required',
          desc: 'You must be signed in to access AI-enhanced features.',
          action: { label: 'Sign In', link: '/auth/signin' },
          available: ['Repository analysis', 'Dependency graph', 'Architecture', 'Engineering health', 'Code viewer'],
          unavailable: ['AI summaries', 'Natural-language Q&A', 'AI recommendations']
        };
      case 'quota_exhausted':
        return {
          label: 'Limit Reached',
          icon: <AlertCircle className="w-3.5 h-3.5" />,
          colorClass: 'text-danger border-danger/30 bg-danger/10',
          title: 'AI Quota Exhausted',
          desc: 'You have reached your AI usage limit for this billing period.',
          action: { label: 'View Usage', link: '/account' },
          available: ['Repository analysis', 'Dependency graph', 'Architecture', 'Engineering health', 'Code viewer'],
          unavailable: ['AI summaries', 'Natural-language Q&A', 'AI recommendations']
        };
      case 'offline':
        return {
          label: 'Offline Intelligence',
          icon: <CloudOff className="w-3.5 h-3.5" />,
          colorClass: 'text-muted border-border bg-panel',
          title: 'Offline Intelligence',
          desc: 'CodeLens is currently operating without an AI provider configured.',
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
          desc: 'CodeLens is configured for AI, but the provider is temporarily failing or unreachable. Falling back to Offline Intelligence.',
          action: { label: 'Retry Connection', onClick: retryConnection },
          available: [
             'Repository analysis', 'Dependency graph', 'Architecture', 
            'Engineering health', 'Refactoring analysis', 'Code viewer'
          ],
          unavailable: [
            'AI summaries', 'Natural-language Q&A', 'AI recommendations'
          ]
        };
      case 'connecting':
        return {
          label: 'Connecting...',
          icon: <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />,
          colorClass: 'text-warning border-warning/30 bg-warning/10 opacity-70',
          title: 'Connecting...',
          desc: 'Attempting to reconnect to AI provider...',
          available: [],
          unavailable: []
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

  /**
   * It tracks the user click event, then extracts the popover visibility boolean, 
   * and then it applies absolute positioning to render the status dropdown.
   */
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
              <h4 className="text-sm font-semibold text-text flex items-center gap-2">
                <span className={config.colorClass.split(' ')[0]}>{config.icon}</span>
                {config.title}
              </h4>
              <button onClick={() => setShowPopover(false)} className="text-muted hover:text-text">
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
                  <ul className="text-xs text-text/90 flex flex-col gap-1">
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

            {config.action && (
              <div className="mt-4 pt-3 border-t border-border/50">
                {config.action.link ? (
                  <a 
                    href={config.action.link}
                    className="w-full py-1.5 bg-accent hover:bg-accent-hover text-text rounded text-xs font-medium transition-colors text-center block"
                  >
                    {config.action.label}
                  </a>
                ) : (
                  <button 
                    onClick={() => {
                      config.action.onClick();
                      setShowPopover(false);
                    }}
                    className="w-full py-1.5 bg-surface hover:bg-surface-light border border-border text-text rounded text-xs font-medium transition-colors"
                  >
                    {config.action.label}
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-muted/80 text-center">
              Your deterministic analysis continues to work locally.
            </div>
          </div>
        </>
      )}
    </div>
  );
}