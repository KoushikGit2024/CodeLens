import React, { useState, useEffect, useCallback } from 'react';
import { useRepository } from '../../shared/context/RepositoryContext';
import { Clock, User, GitBranch, TerminalSquare, AlertCircle, RefreshCw, GitCommit, GitMerge, Cpu, Check } from 'lucide-react';
import * as persistenceStore from '../../services/analyzer/repository/persistence.store.js';
import { startAnalysis, onProgress, initWorker } from '../../services/analyzer/analyzer.client.js';

// ─── Git-Themed Animated Loader ──────────────────────────────────────────────
function GitLoader({ phase }) {
  const phases = [
    { key: 'hydrating',  label: 'Hydrating Git filesystem…',  icon: Cpu },
    { key: 'reading',    label: 'Reading commit history…',     icon: GitCommit },
    { key: 'diffing',    label: 'Diffing commit trees…',       icon: GitMerge },
    { key: 'finalizing', label: 'Computing churn scores…',     icon: GitBranch },
  ];

  const activeIndex = phase?.includes('Hydrating') ? 0
    : phase?.includes('Reading')   ? 1
    : phase?.includes('Diffing')   ? 2
    : 3;

  return (
    <div className="h-full flex flex-col items-center justify-center bg-surface p-8 gap-10">
      {/* Animated Git Graph */}
      <div className="relative flex flex-col items-center gap-0">
        {/* Pulsing main branch line */}
        <div className="w-0.5 h-16 bg-gradient-to-b from-accent/0 via-accent to-accent/0 animate-pulse" />
        <div className="relative w-3 h-3 rounded-full bg-accent ring-4 ring-accent/20 animate-ping absolute" style={{top: '50%', transform: 'translateY(-50%)'}}/>
        <div className="w-3 h-3 rounded-full bg-accent ring-4 ring-accent/20 z-10" />
        <div className="w-0.5 h-16 bg-gradient-to-b from-accent via-accent/40 to-accent/0" />
      </div>

      {/* Phase Steps */}
      <div className="w-full max-w-sm space-y-3">
        {phases.map((p, i) => {
          const Icon = p.icon;
          const isActive = i === activeIndex;
          const isDone = i < activeIndex;
          return (
            <div
              key={p.key}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-500 ${
                isActive
                  ? 'bg-accent/10 border-accent/40 shadow-[0_0_12px_rgba(var(--color-accent),.15)]'
                  : isDone
                  ? 'bg-panel border-border opacity-60'
                  : 'border-border/40 opacity-30'
              }`}
            >
              <div className={`p-1.5 rounded-lg ${isActive ? 'bg-accent/20' : 'bg-surface'}`}>
                <Icon className={`w-4 h-4 ${isActive ? 'text-accent animate-pulse' : isDone ? 'text-success' : 'text-muted'}`} />
              </div>
              <span className={`text-sm font-medium ${isActive ? 'text-text' : 'text-muted'}`}>
                {p.label}
              </span>
              {isActive && (
                <div className="ml-auto flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
              {isDone && (
                <div className="ml-auto w-4 h-4 rounded-full bg-success/20 flex items-center justify-center">
                  <Check className="w-3 h-3 text-success" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live detail */}
      {phase && (
        <p className="text-xs text-muted font-mono animate-pulse text-center max-w-xs truncate">
          {phase}
        </p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GitHistoryPage() {
  const { repoId } = useRepository();
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [gitPhase, setGitPhase] = useState(null);
  const [error, setError] = useState(null);

  const loadHistory = useCallback(async () => {
    if (!repoId) return;
    setLoading(true);
    setError(null);
    try {
      const meta = await persistenceStore.load(repoId);
      if (!meta?.analysis?.gitChurn?.commits?.length) {
        throw new Error('No Git history found. Click "Re-analyze Git History" to compute it from your uploaded repository.');
      }
      setCommits(meta.analysis.gitChurn.commits);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  // Load on mount
  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Listen for worker progress/complete events
  useEffect(() => {
    initWorker();
    const unsub = onProgress((msg) => {
      if (msg.repoId !== repoId) return;

      if (msg.phase === 'analyzing_git_churn' && msg.details) {
        setGitPhase(msg.details);
      }

      if (msg.type === 'COMPLETE') {
        setReanalyzing(false);
        setGitPhase(null);
        loadHistory();
      }

      if (msg.type === 'ERROR') {
        setReanalyzing(false);
        setGitPhase(null);
        setError('Analysis failed: ' + msg.error);
        setLoading(false);
      }
    });
    return unsub;
  }, [repoId, loadHistory]);

  const handleReanalyze = () => {
    setReanalyzing(true);
    setError(null);
    setGitPhase('Hydrating Git filesystem…');
    startAnalysis(repoId, {}).catch((err) => {
      setReanalyzing(false);
      setGitPhase(null);
      setError('Re-analysis failed: ' + err.message);
    });
  };

  // ── Reanalyzing loader ──
  if (reanalyzing) {
    return <GitLoader phase={gitPhase} />;
  }

  // ── Initial load spinner ──
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-surface p-8">
        <div className="max-w-md w-full bg-panel border border-danger/30 rounded-xl p-6 text-center shadow-lg">
          <AlertCircle className="w-12 h-12 text-danger mx-auto mb-4 opacity-80" />
          <h3 className="text-lg font-semibold text-text mb-2">History Unavailable</h3>
          <p className="text-muted text-sm leading-relaxed mb-5">{error}</p>
          <button
            onClick={handleReanalyze}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Re-analyze Git History
          </button>
        </div>
      </div>
    );
  }

  // ── Commit Timeline ──
  return (
    <div className="flex flex-col h-full bg-surface text-text overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-panel p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10 border border-accent/20">
              <GitBranch className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-text">Git History</h1>
              <p className="text-sm text-muted mt-0.5">
                {commits.length} commit{commits.length !== 1 ? 's' : ''} from the last 90 days
              </p>
            </div>
          </div>
          <button
            onClick={handleReanalyze}
            title="Re-analyze Git History"
            className="p-2 rounded-lg border border-border hover:border-accent/40 hover:text-accent transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {commits.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
              <TerminalSquare className="w-10 h-10 text-muted mx-auto mb-3 opacity-50" />
              <p className="text-muted font-medium">No commits found in this repository.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-border ml-4 space-y-6 pb-12">
              {commits.map((commit) => (
                <div key={commit.oid} className="relative pl-8">
                  {/* Timeline Dot */}
                  <div className="absolute w-4 h-4 bg-panel border-2 border-accent rounded-full -left-[9px] top-1.5 shadow-[0_0_8px_rgba(var(--color-accent),.3)]" />

                  {/* Commit Card */}
                  <div className="bg-panel border border-border rounded-xl p-4 shadow-sm hover:border-accent/40 hover:shadow-[0_0_16px_rgba(var(--color-accent),.08)] transition-all group">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h3 className="flex-1 text-[15px] font-medium text-text leading-snug break-words">
                        {commit.commit.message.trim()}
                      </h3>
                      <code className="shrink-0 text-[11px] px-2 py-1 bg-surface border border-border rounded text-muted group-hover:text-accent transition-colors">
                        {commit.oid.substring(0, 7)}
                      </code>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        <span className="font-medium text-text/80">{commit.commit.author.name}</span>
                        <span className="opacity-60">&lt;{commit.commit.author.email}&gt;</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(commit.commit.author.timestamp * 1000).toLocaleString()}
                      </span>
                      {commit.commit.parent?.length > 0 && (
                        <span className="flex items-center gap-1.5 font-mono opacity-50">
                          <GitCommit className="w-3.5 h-3.5" />
                          {commit.commit.parent[0].substring(0, 7)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
