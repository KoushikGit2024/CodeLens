import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import mermaid from 'mermaid';
import { ChevronLeft, RefreshCw, AlertCircle, Loader2, File, Box } from 'lucide-react';
import { repositoryApi } from '../api';

// Initialize mermaid
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

export default function ArchitecturePage() {
  const { repoId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const mermaidRef = useRef(null);

  const loadArchitecture = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await repositoryApi.getArchitecture(repoId);
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArchitecture();
  }, [repoId]);

  useEffect(() => {
    if (data?.mermaid && mermaidRef.current) {
      // We must clear the innerHTML and unset the data-processed attribute 
      // so Mermaid knows it's fresh content to parse
      mermaidRef.current.innerHTML = data.mermaid;
      mermaidRef.current.removeAttribute('data-processed');
      
      // Tell mermaid to run over all nodes with class "mermaid"
      mermaid.run({
        nodes: [mermaidRef.current]
      }).catch((e) => console.error("Mermaid parsing error:", e));
    }
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3 bg-surface text-white">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
        <span className="text-muted text-sm">Analyzing architecture...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <AlertCircle className="w-6 h-6 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4 text-sm">{error}</p>
          <button onClick={() => navigate(-1)} className="text-sm text-accent hover:underline">
            ← Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-white">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="h-12 flex items-center px-4 border-b border-border bg-panel shrink-0 gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <span className="text-white font-medium">Architecture Intelligence</span>
        <button
          onClick={loadArchitecture}
          className="ml-auto flex items-center gap-1 text-muted hover:text-white transition-colors text-xs"
          title="Reload architecture"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reload
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Panel — Architecture Data ─────────────────────────────────── */}
        <aside className="w-72 border-r border-border bg-panel shrink-0 overflow-y-auto p-4 flex flex-col gap-6">
          <section>
            <p className="text-xs text-muted uppercase tracking-wider mb-3">Entry Points</p>
            {data?.model?.entryPoints?.length > 0 ? (
              <div className="flex flex-col gap-2">
                {data.model.entryPoints.map((ep, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <File className="w-4 h-4 text-accent shrink-0" />
                    <span className="text-xs font-mono truncate flex-1 text-white">{ep}</span>
                    <Link 
                      to={`/explore/${repoId}?path=${encodeURIComponent(ep)}`}
                      className="opacity-0 group-hover:opacity-100 text-xs text-accent hover:underline"
                    >
                      View
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted">No explicit entry points found.</span>
            )}
          </section>

          <section>
            <p className="text-xs text-muted uppercase tracking-wider mb-3">Detected Components</p>
            {data?.model?.components?.length > 0 ? (
              <div className="flex flex-col gap-4">
                {data.model.components.map((comp, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Box className="w-4 h-4 text-warning" />
                        {comp.name}
                      </span>
                      <span className="text-[10px] uppercase text-muted bg-surface px-1.5 py-0.5 rounded border border-border/50">
                        {comp.layer}
                      </span>
                    </div>
                    <div className="pl-6 border-l-2 border-border/30 ml-1.5 flex flex-col gap-1">
                      {comp.files.map((file, j) => (
                        <div key={j} className="flex items-center justify-between group">
                          <span className="text-[11px] text-muted font-mono truncate" title={file}>
                            {file.split('/').pop()}
                          </span>
                          <Link 
                            to={`/explore/${repoId}?path=${encodeURIComponent(file)}`}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-accent hover:underline ml-2"
                          >
                            View
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted">No components detected.</span>
            )}
          </section>
        </aside>

        {/* ── Main Canvas — Mermaid Diagram ──────────────────────────────────── */}
        <main className="flex-1 overflow-auto bg-[#0d1117] relative flex justify-center p-8">
          <div ref={mermaidRef} className="mermaid flex justify-center w-full max-w-4xl">
            {/* Mermaid renders here */}
          </div>
        </main>

        {/* ── Right Panel — AI Insights ──────────────────────────────────────── */}
        <aside className="w-80 border-l border-border bg-panel shrink-0 overflow-y-auto p-5 flex flex-col gap-4">
          <p className="text-xs text-muted uppercase tracking-wider mb-2">AI Architectural Insights</p>
          
          {data?.insights?.status === 'unavailable' || data?.insights?.status === 'error' ? (
            <div className="bg-surface/50 p-4 rounded border border-border/50">
              <p className="text-sm text-warning flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4" />
                {data.insights.status === 'unavailable' ? 'AI Unavailable' : 'AI Error'}
              </p>
              <p className="text-xs text-muted leading-relaxed">{data.insights.text}</p>
            </div>
          ) : (
            <div className="prose prose-invert prose-sm">
              {data?.insights?.text?.split('\n').map((line, idx) => {
                if (line.startsWith('**')) {
                  const boldText = line.match(/\*\*(.*?)\*\*/)?.[1];
                  return <h3 key={idx} className="text-white mt-5 mb-2 text-sm font-semibold border-b border-border/50 pb-1">{boldText}</h3>;
                }
                if (line.startsWith('- ')) {
                  return <li key={idx} className="text-muted text-xs ml-4 mb-1.5">{line.slice(2)}</li>;
                }
                if (line.trim() === '') return null;
                return <p key={idx} className="text-muted text-xs leading-relaxed mb-3">{line}</p>;
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
