import React from 'react';
import { AlertTriangle, RefreshCw, Home, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      copied: false 
    };
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

  handleCopy = () => {
    const { error, errorInfo } = this.state;
    const errorText = `${error ? error.toString() : ''}\n\n${errorInfo?.componentStack || ''}`;
    
    navigator.clipboard.writeText(errorText).then(() => {
      this.setState({ copied: true });
      setTimeout(() => {
        this.setState({ copied: false });
      }, 2000);
    }).catch(err => {
      console.error("Failed to copy error details:", err);
    });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="flex-1 w-full min-h-screen overflow-y-auto flex flex-col items-center justify-center bg-surface p-6 text-white">
          <div className="bg-panel border border-danger/30 rounded-lg p-6 max-w-3xl w-full shadow-lg my-auto">
            <div className="flex items-center gap-3 text-danger mb-4">
              <AlertTriangle className="w-8 h-8" />
              <h2 className="text-xl font-semibold">Something went wrong</h2>
            </div>
            
            {/* Error Container with group-hover configuration */}
            <div className="relative group mb-6">
              <button
                onClick={this.handleCopy}
                className="absolute top-2 right-2 p-2 bg-panel border border-border rounded-md text-muted hover:text-white hover:border-accent opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 shadow-sm"
                title="Copy error details"
              >
                {this.state.copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>

              <div className="bg-surface/50 border border-border p-4 rounded overflow-auto max-h-[60vh] pt-8">
                <p className="text-sm font-mono text-danger/90 mb-2">
                  {this.state.error && this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <pre className="text-xs text-muted font-mono leading-relaxed mt-2 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
                  window.location.reload();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-surface rounded font-medium hover:bg-accent/90 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              
              <Link
                to={(() => {
                  const pathParts = window.location.pathname.split('/');
                  if (pathParts[1] === 'explore' && pathParts[2]) {
                    return `/explore/${pathParts[2]}`;
                  }
                  return '/';
                })()}
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
                  // We do not force reload here to allow client-side routing to recover state,
                  // unless it fails again, then the boundary will re-catch.
                }}
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-border text-white rounded hover:bg-white/5 transition-colors"
              >
                <Home className="w-4 h-4" />
                {window.location.pathname.startsWith('/explore/') ? 'Back to Overview' : 'Return Home'}
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}