import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-surface p-6 text-white min-h-[400px]">
          <div className="bg-panel border border-danger/30 rounded-lg p-6 max-w-2xl w-full shadow-lg">
            <div className="flex items-center gap-3 text-danger mb-4">
              <AlertTriangle className="w-8 h-8" />
              <h2 className="text-xl font-semibold">Something went wrong</h2>
            </div>
            
            <div className="bg-surface/50 border border-border p-4 rounded mb-6 overflow-x-auto">
              <p className="text-sm font-mono text-danger/90 mb-2">
                {this.state.error && this.state.error.toString()}
              </p>
              {this.state.errorInfo && (
                <pre className="text-xs text-muted font-mono leading-relaxed mt-2 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null });
                  window.location.reload();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-surface rounded font-medium hover:bg-accent/90 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              
              <Link
                to="/"
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-border text-white rounded hover:bg-white/5 transition-colors"
              >
                <Home className="w-4 h-4" />
                Go to Home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
