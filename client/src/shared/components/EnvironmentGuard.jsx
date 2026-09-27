import React, { useState, useEffect } from 'react';
import { AlertCircle, ExternalLink } from 'lucide-react';

export function EnvironmentGuard({ children }) {
  const [isIframe, setIsIframe] = useState(false);

  useEffect(() => {
    try {
      if (window.self !== window.top) {
        setIsIframe(true);
      }
    } catch (e) {
      // If we can't access window.top due to cross-origin policies, we are definitely in an iframe.
      setIsIframe(true);
    }
  }, []);

  if (isIframe) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-panel border border-border rounded-xl p-8 max-w-lg w-full shadow-2xl flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-danger/20 text-danger rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-text mb-3">Preview Mode Restricted</h2>
          <p className="text-muted leading-relaxed mb-8">
            CodeLens relies on advanced browser storage (IndexedDB) for local repository analysis. 
            Because you are viewing this inside an iframe or preview window, your browser has blocked 
            storage access for security reasons.
          </p>
          <button 
            onClick={() => window.open(window.location.href, '_blank')}
            className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-text rounded-lg font-medium transition-colors w-full justify-center"
          >
            <ExternalLink className="w-5 h-5" />
            Open in Full Browser Tab
          </button>
        </div>
      </div>
    );
  }

  return children;
}
