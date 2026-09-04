import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ title, description, type = 'success', duration = 4000 }) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, description, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 w-80 p-4 rounded-lg shadow-xl border bg-[#161b22] text-white animate-in slide-in-from-bottom-5 fade-in duration-300
              ${toast.type === 'success' ? 'border-success/30' : toast.type === 'error' ? 'border-danger/30' : 'border-accent/30'}
            `}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-success" />}
              {toast.type === 'error' && <XCircle className="w-5 h-5 text-danger" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-accent" />}
            </div>
            <div className="flex-1 flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate">{toast.title}</span>
              {toast.description && <span className="text-xs text-muted mt-1">{toast.description}</span>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 text-muted hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
