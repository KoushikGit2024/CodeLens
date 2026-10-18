import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  FileText,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { repositoryApi } from '../../shared/api';
import { useToast } from '../../shared/context/ToastContext';
import { useAIState } from '../../shared/context/AIContext';
import AiResponse from '../../shared/components/ai/AiResponse';
import ConfirmAiModal from '../../shared/components/ai/ConfirmAiModal';
import { repositoryStore } from '../../services/analyzer/repository/repository.store.js';
import { aiArtifactStore, buildCacheKey } from '../../services/storage/aiArtifact.store.js';
import { sanitizeAiError } from '../../shared/utils/aiError.js';

export default function ExplainFindingPanel({ isOpen, risk, repoId, onClose, onDraftAdr }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const { aiState } = useAIState();
  const { addToast } = useToast();

  // Load cached explanation when opening
  useEffect(() => {
    if (!isOpen || !risk) {
      setResult(null);
      setError(null);
      return;
    }

    let isMounted = true;
    async function checkCache() {
      try {
        const record = await repositoryStore.get(repoId).catch(() => null);
        const cacheKey = buildCacheKey(repoId, 'risk_explain', risk.id || risk.title || '');
        const cached = await aiArtifactStore.get(cacheKey, record?.analysisVersion);
        if (cached && isMounted) {
          setResult(cached);
        }
      } catch {
        // ignore cache read failure
      }
    }
    checkCache();

    return () => {
      isMounted = false;
    };
  }, [isOpen, risk?.id, repoId]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = e => {
      if (e.key === 'Escape' && !showConfirmModal && !showRegenerateModal) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showConfirmModal, showRegenerateModal]);

  const generate = useCallback(async () => {
    if (!risk) return;
    setLoading(true);
    setError(null);

    try {
      const res = await repositoryApi.getRisks(repoId, {
        generateAi: true,
        singleRisk: risk,
      });

      const insights = res.data?.insights;
      if (!insights) {
        throw new Error('AI provider returned an empty insight payload.');
      }

      setResult(insights);

      // Cache the result in IndexedDB
      try {
        const record = await repositoryStore.get(repoId).catch(() => null);
        const cacheKey = buildCacheKey(repoId, 'risk_explain', risk.id || risk.title || '');
        await aiArtifactStore.set(cacheKey, insights, {
          analysisVersion: record?.analysisVersion,
        });
      } catch {
        // ignore cache write error
      }

      addToast({
        title: 'Explanation Ready',
        description: 'AI finding explanation generated.',
        type: 'success',
      });
    } catch (err) {
      const sanitized = sanitizeAiError(err);
      setError(sanitized);
      addToast({
        title: sanitized.title || 'Explanation Failed',
        description: sanitized.message,
        type: sanitized.type === 'offline' ? 'warning' : 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [repoId, risk, addToast]);

  const handleRequestGenerate = () => {
    if (aiState.authState === 'unauthenticated') {
      addToast({
        title: 'Sign In Required',
        description: 'Please sign in to generate AI finding explanations.',
        type: 'warning',
      });
      return;
    }
    if (aiState.quotaStatus === 'exhausted') {
      addToast({
        title: 'Quota Exceeded',
        description: 'AI usage limit reached.',
        type: 'error',
      });
      return;
    }
    if (aiState.status === 'offline') {
      addToast({
        title: 'AI Offline',
        description: 'No AI provider configured. Deterministic metrics remain available offline.',
        type: 'warning',
      });
      return;
    }
    setShowConfirmModal(true);
  };

  if (!isOpen || !risk) return null;

  const content = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[110] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer Panel */}
      <div className="fixed inset-y-0 right-0 w-[640px] max-w-[92vw] bg-surface border-l border-border shadow-2xl z-[111] flex flex-col transform transition-transform duration-300 animate-in slide-in-from-right">
        {/* Header */}
        <div className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0 bg-panel">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text">AI Finding Explanation</h2>
              <p className="text-[11px] text-muted truncate max-w-[340px]">
                {risk.category} · {risk.severity} severity
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onDraftAdr && (
              <button
                onClick={() => onDraftAdr(risk)}
                title="Draft an Architecture Decision Record for this finding"
                className="px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 border border-accent/30 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Draft ADR</span>
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Close explanation panel"
              title="Close (Esc)"
              className="p-1.5 px-2.5 text-muted hover:text-text hover:bg-surface rounded-md border border-border/40 hover:border-border transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-5">
          {/* Finding Context Card */}
          <div className="p-4 rounded-xl bg-panel border border-border flex flex-col gap-2.5 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-semibold text-text leading-snug">{risk.title}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 shrink-0">
                {risk.severity}
              </span>
            </div>

            {risk.file && (
              <div className="text-[11px] font-mono text-muted truncate bg-surface/70 px-2 py-1 rounded border border-border/50">
                {risk.file}
              </div>
            )}

            <p className="text-xs text-muted/90 leading-relaxed">
              {typeof risk.description === 'string'
                ? risk.description
                : typeof risk.message === 'string'
                  ? risk.message
                  : 'No extended description provided.'}
            </p>

            {risk.evidence && (
              <div className="text-[11px] font-mono text-muted/80 bg-surface/40 p-2.5 rounded-lg border border-border/40">
                <span className="text-[10px] uppercase font-semibold text-muted block mb-1">Evidence:</span>
                {typeof risk.evidence === 'string' ? (
                  <span className="break-all">{risk.evidence}</span>
                ) : typeof risk.evidence === 'object' ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {Object.entries(risk.evidence).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-2 border-b border-border/20 py-0.5">
                        <span className="text-muted/70 capitalize">{k}:</span>
                        <span className="text-text font-semibold truncate">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span>{String(risk.evidence)}</span>
                )}
              </div>
            )}
          </div>

          {/* AI Content Area */}
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-panel/50 border border-border/70 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent mb-3 animate-spin">
                <Sparkles className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-medium text-text mb-1">Synthesizing Codebase Context</h4>
              <p className="text-xs text-muted max-w-xs leading-relaxed">
                Extracting structural AST facts, dependency relations, and generating architectural recommendations...
              </p>
            </div>
          ) : error ? (
            <div className="p-4 bg-danger/10 border border-danger/30 rounded-xl text-danger text-xs flex flex-col gap-2.5">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4" />
                <span>{error.title || 'Explanation Failed'}</span>
              </div>
              <p className="text-danger/90 leading-relaxed">{error.message}</p>
              <div className="pt-1">
                <button
                  onClick={handleRequestGenerate}
                  className="px-3 py-1.5 bg-danger/15 hover:bg-danger/25 border border-danger/30 text-danger rounded-md text-xs font-medium transition-colors cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : result ? (
            <div className="flex flex-col gap-4">
              <AiResponse
                repoId={repoId}
                chatId={`health-explain-${risk.id}`}
                data={{
                  summary: result.summary,
                  recommendations: result.recommendations,
                  inferences: result.observations,
                  risks: result.limitations ? [result.limitations] : [],
                }}
                title="AI Explanation & Mitigation"
              />

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-panel border border-border/70 mt-2">
                <span className="text-xs text-muted">Want fresh recommendations or new perspectives?</span>
                <button
                  onClick={() => setShowRegenerateModal(true)}
                  className="px-3 py-1.5 text-xs text-muted hover:text-text hover:bg-surface border border-border rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Regenerate</span>
                </button>
              </div>
            </div>
          ) : (
            /* Pre-generation Call-to-action */
            <div className="h-72 flex flex-col items-center justify-center text-center p-6 bg-panel/50 border border-border/70 rounded-xl">
              <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent mb-4 shadow-inner">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-text mb-1.5">Generate AI Root-Cause Analysis</h3>
              <p className="text-xs text-muted max-w-sm mb-6 leading-relaxed">
                CodeLens will analyze this finding against the codebase architecture and synthesize a structured
                explanation with root cause analysis and actionable remediation steps.
              </p>
              <button
                onClick={handleRequestGenerate}
                className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-medium transition-all shadow-md shadow-accent/20 flex items-center gap-2 group cursor-pointer"
              >
                <Sparkles className="w-4 h-4 transition-transform group-hover:scale-110" />
                <span>Explain Finding with AI</span>
              </button>
              <span className="text-[11px] text-muted/70 mt-2.5">⚡ Requires confirmation · Consumes ~500 tokens</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-border flex items-center justify-between shrink-0 bg-panel">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-surface border border-border hover:bg-surface/80 text-text rounded-md text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>

          {onDraftAdr && (
            <button
              onClick={() => onDraftAdr(risk)}
              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Draft Architecture Record (ADR)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmAiModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => {
          setShowConfirmModal(false);
          generate();
        }}
        title="Explain Finding with AI"
        subtitle={`${risk.category} · ${risk.title}`}
        description="CodeLens will extract the structural AST facts and context of this finding and request an AI explanation with root-cause insights and remediation options."
        findingContext={risk}
        tokenEstimate="~500 tokens"
        confirmText="Proceed to AI"
        loading={loading}
      />

      {/* Regenerate Confirmation Modal */}
      <ConfirmAiModal
        isOpen={showRegenerateModal}
        onClose={() => setShowRegenerateModal(false)}
        onConfirm={() => {
          setShowRegenerateModal(false);
          generate();
        }}
        title="Regenerate Finding Explanation"
        subtitle={`${risk.category} · ${risk.title}`}
        description="This will re-run the AI synthesis for this finding and overwrite your previous explanation with fresh recommendations."
        findingContext={risk}
        tokenEstimate="~500 tokens"
        confirmText="Proceed to AI"
        loading={loading}
      />
    </>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
