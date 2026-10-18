/**
 * EngineeringHealthPage.jsx
 *
 * It initiates the structural risk view, then extracts specific deterministic flaws,
 * and then it applies them into visually categorized severity cards with grouped
 * discontinuous-block instances, clickable line references, and a persistent ignore system.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Loader2,
  RefreshCw,
  ShieldAlert,
  Copy,
  Ghost,
  ArrowRight,
  Sparkles,
  Download,
  EyeOff,
  RotateCcw,
  FileText,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Flame,
  GitCompare,
  Scale,
  BookOpen,
  AlertCircle,
} from 'lucide-react';
import { useRepository } from '../../shared/context/RepositoryContext';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import PageHeader from '../../shared/components/PageHeader';
import { useToast } from '../../shared/context/ToastContext';
import { useAIState } from '../../shared/context/AIContext';
import ADRPanel from './ADRPanel';
import ADRRegistryModal from './ADRRegistryModal';
import ExplainFindingPanel from './ExplainFindingPanel';
import { downloadEngineeringHealthReport } from './healthReport.generator';

import ConfirmAiModal from '../../shared/components/ai/ConfirmAiModal';
import OpenSourceButton from '../../shared/components/OpenSourceButton';
import { tryMakeSourceRef } from '../../shared/navigation/sourceRef';
import MetricInfoButton from '../../shared/components/MetricInfoButton';
import { sanitizeAiError } from '../../shared/utils/aiError.js';

// ── Severity helpers ──────────────────────────────────────────────────────────
const SEV_BADGE = {
  critical: 'bg-red-500/20 text-red-500 border border-red-500/30',
  high: 'bg-orange-500/20 text-orange-500 border border-orange-500/30',
  warning: 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30',
};
const SEV_SCORE = { critical: 10, high: 5, warning: 2 };

function severityBadge(sev) {
  return `px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest ${SEV_BADGE[sev] || ''}`;
}

// ── InstanceRow — renders one clickable block (function / clone sibling) ──────
function InstanceRow({ inst, isClone }) {
  // inst has: { name, kind, complexity, location: { startLine, endLine }, filePath? }
  const filePath = inst.filePath || null;
  const loc = inst.location;
  const ref =
    filePath || loc
      ? tryMakeSourceRef({
          filePath,
          startLine: loc?.startLine,
          endLine: loc?.endLine,
        })
      : null;

  return (
    <div className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
      <div className="flex-1 min-w-0">
        {ref ? (
          <OpenSourceButton ref={ref} variant="button" className="w-full justify-start truncate py-0.5 text-[11px]" />
        ) : (
          <span className="text-[11px] font-mono text-muted truncate block">{filePath || inst.name}</span>
        )}
      </div>
      {!isClone && inst.complexity != null && (
        <span className="shrink-0 text-[10px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded">
          CC {inst.complexity}
        </span>
      )}
      {loc && (
        <span className="shrink-0 text-[10px] text-muted font-mono">
          L{loc.startLine}
          {loc.endLine && loc.endLine !== loc.startLine ? `–${loc.endLine}` : ''}
        </span>
      )}
    </div>
  );
}

// ── RiskCard ──────────────────────────────────────────────────────────────────
const RiskCard = ({
  risk,
  repoId,
  navigate,
  onDraftAdr,
  onExplainAi,
  onIgnore,
  ignored = false,
  selected = false,
  onSelect,
  onSearchId,
}) => {
  const [expanded, setExpanded] = useState(false);

  const instances = risk.evidence?.instances || [];
  const isGrouped = instances.length > 1;
  const isClone = risk.title === 'Structural Code Clone';

  // Primary file ref — for single-instance or file-level risks
  const primaryRef =
    risk.file && !isGrouped
      ? tryMakeSourceRef({
          filePath: risk.file,
          startLine: risk.evidence?.location?.startLine,
          endLine: risk.evidence?.location?.endLine,
          meta: { category: risk.category, severity: risk.severity },
        })
      : risk.file
        ? tryMakeSourceRef({ filePath: risk.file })
        : null;

  return (
    <div
      className={`rounded-xl border flex flex-col overflow-hidden shadow-lg transition-all relative ${
        ignored ? 'border-border/40 bg-panel/50 opacity-60' : 'border-border bg-panel hover:border-accent/40'
      } ${selected ? 'ring-2 ring-accent border-transparent' : ''}`}
    >
      {onSelect && (
        <div
          className="absolute top-4 right-4 z-10 cursor-pointer"
          onClick={e => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <input type="checkbox" checked={selected} readOnly className="w-4 h-4 cursor-pointer accent-accent" />
        </div>
      )}
      <div className="p-5 flex-1 flex flex-col bg-gradient-to-b from-surface/50 to-transparent">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3 pr-6">
          <span className={severityBadge(risk.severity)}>{risk.severity}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">{risk.category}</span>
        </div>

        <h3 className="text-base font-semibold text-text mb-1 line-clamp-2 pr-2" title={risk.title}>
          {risk.title}
        </h3>
        <p className="text-xs text-muted leading-relaxed flex-1 mb-3">{risk.description || risk.message}</p>

        {/* Stable risk ID badge for reference & 1-click ID search */}
        <div className="mb-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              const shortId = risk.id?.slice(5, 13) || risk.id;
              if (onSearchId) onSearchId(shortId);
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(shortId).catch(() => {});
              }
            }}
            className="text-[9px] font-mono text-muted/70 hover:text-accent bg-surface/80 hover:bg-accent/15 border border-border/50 hover:border-accent/40 rounded px-1.5 py-0.5 select-all cursor-pointer transition-all inline-flex items-center gap-1 group/id"
            title={`Click to filter by Risk ID: ${risk.id?.slice(5, 13) || risk.id} (also copies to clipboard)`}
          >
            <span className="text-muted/50 font-normal">Risk ID:</span>
            <span className="font-semibold text-text group-hover/id:text-accent font-mono">
              {risk.id?.slice(5, 13) || risk.id}
            </span>
            <Copy className="w-2.5 h-2.5 opacity-40 group-hover/id:opacity-100 ml-0.5 transition-opacity" />
          </button>
        </div>

        {/* ── Tornhill Behavioral Hotspot breakdown ── */}
        {risk.evidence?.hotspotScore != null && (
          <div className="mb-3 flex items-center justify-between flex-wrap gap-1.5 p-2 rounded bg-surface/60 border border-border/50 text-[10px] font-mono">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="px-2 py-0.5 rounded bg-danger/15 text-danger font-bold border border-danger/30 flex items-center gap-1">
                <Flame className="w-3 h-3" /> Hotspot: {risk.evidence.hotspotScore}/100
              </span>
              <span className="px-2 py-0.5 rounded bg-surface border border-border text-muted">
                Churn: {risk.evidence.churnScore}/100
              </span>
              <span className="px-2 py-0.5 rounded bg-surface border border-border text-muted">
                Complexity: {risk.evidence.complexityScore}/100
              </span>
              {risk.evidence.quadrant && (
                <span className="px-2 py-0.5 rounded bg-accent/15 text-accent font-semibold border border-accent/20">
                  {risk.evidence.quadrant.replace('_', ' ')}
                </span>
              )}
            </div>
            <MetricInfoButton
              title="Tornhill Behavioral Hotspot Matrix"
              badge="Forensic Software Analysis"
              formula="Hotspot = (Churn × Complexity) / 100"
              description="From Adam Tornhill's 'Your Code as a Crime Scene'. Combines modification velocity (git churn) with code complexity to pinpoint defect-dense hotspots."
              bullets={[
                'Active Critical Hotspot: Files with high churn and high complexity are the primary origin of bugs and defect leakage.',
                'Stable Legacy: Complex files that rarely change pose low immediate risk.',
                'Active Development: High churn but low complexity represents active feature development.',
              ]}
              resolution="Prioritize refactoring and adding unit tests to active critical hotspots before adding new features."
            />
          </div>
        )}

        {/* ── Temporal Co-change breakdown ── */}
        {(risk.evidence?.coChangeSimilarity != null || risk.evidence?.jaccard != null) && (
          <div className="mb-3 p-2 rounded bg-surface border border-border/60">
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono mb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-warning/15 text-warning font-bold border border-warning/30 flex items-center gap-1">
                  <GitCompare className="w-3 h-3" /> Co-Change:{' '}
                  {Math.round((risk.evidence.coChangeSimilarity ?? risk.evidence.jaccard) * 100)}%
                </span>
                <span className="text-muted text-[10px]">
                  {risk.evidence.coChangeCount ?? risk.evidence.sharedCommits} shared commits
                </span>
              </div>
              <MetricInfoButton
                title="Hidden Logical Coupling (Temporal Co-Change)"
                badge="Git Mining"
                formula="Jaccard = |Commits(A) ∩ Commits(B)| / |Commits(A) ∪ Commits(B)|"
                description="Detects file pairs that frequently commit together in git history without having a direct static import statement."
                bullets={[
                  'Jaccard Similarity >= 40%: Statistical likelihood that changing one file requires changing the other.',
                  'Missing Abstraction: Often indicates copy-pasted boilerplate, implicit schema contracts, or un-imported dependencies.',
                  'Bulk Filtered: Mass formatting and bulk commits touching > 30 files are automatically excluded.',
                ]}
                resolution="Unify shared responsibilities into a single utility module or make dependencies explicit via typed imports."
              />
            </div>
            {((risk.evidence.coupledFiles && risk.evidence.coupledFiles.length > 0) || risk.evidence.fileB) && (
              <div className="text-[11px] text-muted space-y-1">
                <span className="text-[10px] uppercase font-semibold text-text/60 block">
                  Coupled Files (No Import Edge):
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(risk.evidence.coupledFiles || [risk.evidence.fileB]).map(cf => {
                    const cRef = tryMakeSourceRef({ filePath: cf });
                    return cRef ? (
                      <OpenSourceButton key={cf} ref={cRef} variant="button" className="text-[10px] py-0.5" />
                    ) : (
                      <span
                        key={cf}
                        className="px-1.5 py-0.5 rounded bg-panel text-muted font-mono text-[10px] border border-border"
                      >
                        {cf}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Stable Dependencies Principle (SDP) breakdown ── */}
        {risk.evidence?.sourceInstability != null && (
          <div className="mb-3 p-2.5 rounded bg-surface border border-border/60 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="px-2 py-0.5 rounded bg-warning/15 text-warning font-bold border border-warning/30 flex items-center gap-1">
                <Scale className="w-3 h-3" /> SDP Violation (Stability Inversion)
              </span>
              <MetricInfoButton
                title="Stable Dependencies Principle (SDP)"
                badge="Clean Architecture"
                formula="I = Ce / (Ca + Ce)"
                description="Formulated by Robert C. Martin: modules should depend in the direction of stability. A stable module (relied on by many files) should not depend on a volatile module (one that changes easily)."
                bullets={[
                  'Afferent Coupling (Ca): Incoming dependencies. High Ca means the module is foundational and hard to change.',
                  'Efferent Coupling (Ce): Outgoing dependencies. High Ce means the module has many reasons to change.',
                  'Stability Inversion: If a stable core depends on a volatile leaf, volatile changes cascade backwards into the core, breaking all dependants.',
                ]}
                resolution="Apply the Dependency Inversion Principle (DIP). Define an interface/contract in the stable layer and have volatile modules implement it."
              />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <div className="flex-1 p-2 rounded bg-panel border border-border">
                <span className="text-[9px] uppercase font-bold text-success block mb-0.5">Stable Source Module</span>
                <span className="font-mono text-[10px] text-text block truncate" title={risk.evidence.sourceFile}>
                  {risk.evidence.sourceFile?.split('/').pop()}
                </span>
                <span className="text-[10px] font-mono text-muted">
                  I: <strong className="text-success">{risk.evidence.sourceInstability}</strong> • Fan-in:{' '}
                  {risk.evidence.sourceFanIn}
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-warning shrink-0" />
              <div className="flex-1 p-2 rounded bg-panel border border-border">
                <span className="text-[9px] uppercase font-bold text-danger block mb-0.5">Volatile Target Module</span>
                {(() => {
                  const tgtRef = tryMakeSourceRef({ filePath: risk.evidence.targetFile });
                  return tgtRef ? (
                    <OpenSourceButton
                      ref={tgtRef}
                      variant="button"
                      className="text-[10px] py-0.5 truncate w-full justify-start"
                    />
                  ) : (
                    <span className="font-mono text-[10px] text-text block truncate" title={risk.evidence.targetFile}>
                      {risk.evidence.targetFile?.split('/').pop()}
                    </span>
                  );
                })()}
                <span className="text-[10px] font-mono text-muted">
                  I: <strong className="text-danger">{risk.evidence.targetInstability}</strong> • Fan-out:{' '}
                  {risk.evidence.targetFanOut}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Statistical Coupling Breakdown (Tukey IQR) ── */}
        {risk.evidence?.detectionMethod === 'iqr' && (
          <div className="mb-3 flex items-center justify-between flex-wrap gap-1.5 p-2 rounded bg-surface/60 border border-border/50 text-[10px] font-mono">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="px-2 py-0.5 rounded bg-accent/15 text-accent font-semibold border border-accent/20">
                Tukey IQR Fence: {risk.evidence.threshold}
              </span>
              <span className="px-2 py-0.5 rounded bg-surface border border-border text-muted">
                p50: {risk.evidence.p50}
              </span>
              <span className="px-2 py-0.5 rounded bg-surface border border-border text-muted">
                p75: {risk.evidence.p75}
              </span>
              <span className="px-2 py-0.5 rounded bg-surface border border-border text-muted">
                IQR: {risk.evidence.iqr}
              </span>
            </div>
            <MetricInfoButton
              title="Tukey IQR Coupling Fences"
              badge="Statistical Outliers"
              formula="Inner Fence = Q3 + 1.5 × IQR"
              description="Dynamically computes quartile distributions of fan-in and fan-out across the codebase, identifying true relative bottlenecks rather than applying hardcoded numbers."
              bullets={[
                'Relative to Codebase: Adapts automatically whether analyzing a small 10-file microservice or a 5,000-file monolith.',
                'Inner Fence (Warning): Files exceeding Q3 + 1.5 × IQR carry elevated architectural blast radius.',
                'Outer Fence (High): Files exceeding Q3 + 3.0 × IQR are extreme central bottlenecks.',
              ]}
              resolution="Decompose oversized modules with high fan-out, and introduce facade or mediator patterns to reduce central coupling."
            />
          </div>
        )}

        {/* ── Grouped instances (same issue, discontinuous blocks) ── */}
        {isGrouped ? (
          <div className="mt-2 border-t border-text/5 pt-3">
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text/70 hover:text-accent transition-colors w-full mb-2"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {isClone ? `${instances.length} duplicate locations` : `${instances.length} affected blocks`}
            </button>

            {expanded && (
              <div className="max-h-52 overflow-y-auto custom-scrollbar">
                {instances.map((inst, idx) => (
                  <InstanceRow key={idx} inst={inst} isClone={isClone} />
                ))}
              </div>
            )}

            {/* Show primary file link even when collapsed */}
            {!expanded && primaryRef && (
              <OpenSourceButton
                ref={primaryRef}
                variant="button"
                className="w-full justify-start truncate text-[11px]"
              />
            )}
          </div>
        ) : (
          /* Single-instance: show file + exact line directly */
          primaryRef && (
            <div className="mt-2 border-t border-text/5 pt-3">
              <span className="text-[10px] font-medium text-text/70 uppercase tracking-widest block mb-1.5">
                Target
              </span>
              <OpenSourceButton ref={primaryRef} variant="button" className="w-full justify-start truncate" />
              {risk.evidence?.location && (
                <span className="text-[10px] font-mono text-muted mt-1 block">
                  Lines {risk.evidence.location.startLine}
                  {risk.evidence.location.endLine && risk.evidence.location.endLine !== risk.evidence.location.startLine
                    ? `–${risk.evidence.location.endLine}`
                    : ''}
                </span>
              )}
            </div>
          )
        )}
      </div>

      {/* Footer actions */}
      <div className="bg-panel border-t border-border px-4 py-3 shrink-0 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onDraftAdr(risk)}
            className="text-xs font-medium text-text/70 hover:text-accent flex items-center gap-1 transition-colors"
          >
            <FileText className="w-3 h-3" /> ADR
          </button>
          {onExplainAi && !ignored && (
            <button
              onClick={() => onExplainAi(risk)}
              className="text-xs font-medium text-text/70 hover:text-accent flex items-center gap-1 transition-colors"
            >
              <Sparkles className="w-3 h-3" /> Explain
            </button>
          )}
          {/* Ignore / Restore toggle */}
          <button
            onClick={() => onIgnore(risk.id, ignored)}
            className={`text-xs font-medium flex items-center gap-1 transition-colors ${
              ignored ? 'text-accent hover:text-accent/80' : 'text-text/50 hover:text-text/80'
            }`}
            title={ignored ? 'Restore this risk to active' : 'Ignore this risk (persists across re-analyses)'}
          >
            {ignored ? (
              <>
                <RotateCcw className="w-3 h-3" /> Restore
              </>
            ) : (
              <>
                <EyeOff className="w-3 h-3" /> Ignore
              </>
            )}
          </button>
        </div>
        {!ignored && (
          <button
            onClick={() => navigate(`/explore/${repoId}/refactoring`)}
            className="text-xs font-medium text-text/80 hover:text-text flex items-center gap-1 transition-colors"
          >
            Triage <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────
const EngineeringHealthPage = () => {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { aiState } = useAIState();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileFilter = searchParams.get('file');
  const listStartRef = useRef(null);

  const handleClearFileFilter = useCallback(() => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('file');
        next.delete('page');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [confirmInterpretationOpen, setConfirmInterpretationOpen] = useState(false);
  const [adrRegistryOpen, setAdrRegistryOpen] = useState(false);
  const [selectedAdrFromRegistry, setSelectedAdrFromRegistry] = useState(null);
  const [adrCount, setAdrCount] = useState(0);

  const refreshAdrCount = useCallback(async () => {
    if (!repoId) return;
    try {
      const res = await repositoryApi.listADRs(repoId);
      setAdrCount(res.data?.length || 0);
    } catch {
      // non-fatal
    }
  }, [repoId]);

  useEffect(() => {
    refreshAdrCount();
  }, [refreshAdrCount]);

  const { repo, livePhase } = useRepository();
  const isGloballyAnalyzing = !!livePhase || repo?.status === 'analyzing';

  // Local ignored IDs — mirrors what's in IndexedDB, updated optimistically
  const [ignoredIds, setIgnoredIds] = useState(new Set());

  // Selection state for bulk actions
  const [selectedRiskIds, setSelectedRiskIds] = useState(new Set());

  const handleSelectRisk = riskId => {
    setSelectedRiskIds(prev => {
      const next = new Set(prev);
      if (next.has(riskId)) next.delete(riskId);
      else next.add(riskId);
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedRiskIds(new Set());
  };

  const handleBulkIgnore = async currentlyIgnored => {
    const idsToProcess = Array.from(selectedRiskIds);
    if (idsToProcess.length === 0) return;

    // Optimistic UI update
    setIgnoredIds(prev => {
      const next = new Set(prev);
      idsToProcess.forEach(id => {
        if (currentlyIgnored) next.delete(id);
        else next.add(id);
      });
      return next;
    });
    handleClearSelection();

    try {
      if (currentlyIgnored) {
        await Promise.all(idsToProcess.map(id => repositoryApi.restoreRisk(repoId, id)));
        addToast({
          title: 'Risks Restored',
          description: `${idsToProcess.length} risks are now active again.`,
          type: 'success',
        });
      } else {
        await Promise.all(idsToProcess.map(id => repositoryApi.ignoreRisk(repoId, id)));
        addToast({ title: 'Risks Ignored', description: `${idsToProcess.length} risks suppressed.`, type: 'success' });
      }
    } catch (err) {
      // Roll back
      setIgnoredIds(prev => {
        const next = new Set(prev);
        idsToProcess.forEach(id => {
          if (currentlyIgnored) next.add(id);
          else next.delete(id);
        });
        return next;
      });
      addToast({ title: 'Action Failed', description: err.message, type: 'error' });
    }
  };

  // ── URL-synced UI State ──
  const activeAdrRiskId = searchParams.get('adr');
  const activeAdrRisk = useMemo(() => {
    if (!activeAdrRiskId || !model) return null;
    return (
      model.risks?.find(r => r.id === activeAdrRiskId) ||
      model.ignoredRisks?.find(r => r.id === activeAdrRiskId) ||
      null
    );
  }, [activeAdrRiskId, model]);

  const setActiveAdrRisk = useCallback(
    risk => {
      if (risk) {
        if (aiState.authState === 'unauthenticated') {
          navigate('/auth/signin');
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
      }

      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (risk) next.set('adr', risk.id);
          else next.delete('adr');
          return next;
        },
        { replace: true }
      );
    },
    [aiState, navigate, addToast, setSearchParams]
  );

  const explainRiskId = searchParams.get('explain');
  const explainRisk = useMemo(() => {
    if (!explainRiskId || !model) return null;
    return (
      model.risks?.find(r => r.id === explainRiskId) || model.ignoredRisks?.find(r => r.id === explainRiskId) || null
    );
  }, [explainRiskId, model]);

  const setExplainRisk = risk => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (risk) next.set('explain', risk.id);
        else next.delete('explain');
        return next;
      },
      { replace: true }
    );
  };

  // ── URL-synced UI State ──
  const categoryFilter = searchParams.get('category');
  const setCategoryFilter = val => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (val) next.set('category', val);
        else next.delete('category');
        next.delete('page'); // Reset pagination on filter change
        return next;
      },
      { replace: true }
    );
  };

  const activeTab = searchParams.get('tab') || 'active';
  const setActiveTab = val => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val === 'active' || !val) next.delete('tab');
      else next.set('tab', val);
      next.delete('page'); // Reset pagination on tab change
      return next;
    });
  };

  const searchQuery = searchParams.get('search') || '';
  const setSearchQuery = val => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (val) next.set('search', val);
        else next.delete('search');
        next.delete('page'); // Reset pagination on search
        return next;
      },
      { replace: true }
    );
  };

  const currentPage = parseInt(searchParams.get('page')) || 1;
  const setCurrentPage = val => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (val === 1 || !val) next.delete('page');
        else next.set('page', val.toString());
        return next;
      },
      { replace: true }
    );

    // Scroll back to the top of the list slightly after DOM update
    setTimeout(() => {
      listStartRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  };
  const ITEMS_PER_PAGE = parseInt(searchParams.get('per_page')) || 20;
  const setItemsPerPage = val => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (val === '20' || !val) next.delete('per_page');
        else next.set('per_page', val);
        next.delete('page'); // Reset pagination when changing page size
        return next;
      },
      { replace: true }
    );
  };

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const riskData = await repositoryApi.getRisks(repoId);
      setModel(riskData.data);
      if (riskData.data?.insights) {
        setInsights(riskData.data.insights);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Ignore / Restore ────────────────────────────────────────────────────────
  const handleIgnoreToggle = useCallback(
    async (riskId, currentlyIgnored) => {
      // Optimistic UI update
      setIgnoredIds(prev => {
        const next = new Set(prev);
        if (currentlyIgnored) next.delete(riskId);
        else next.add(riskId);
        return next;
      });
      try {
        if (currentlyIgnored) {
          await repositoryApi.restoreRisk(repoId, riskId);
          addToast({
            title: 'Risk Restored',
            description: 'This risk is now active again.',
            type: 'success',
          });
        } else {
          await repositoryApi.ignoreRisk(repoId, riskId);
          addToast({
            title: 'Risk Ignored',
            description: 'Suppressed — will stay ignored across re-analyses.',
            type: 'success',
          });
        }
      } catch (err) {
        // Roll back optimistic update on failure
        setIgnoredIds(prev => {
          const next = new Set(prev);
          if (currentlyIgnored) next.add(riskId);
          else next.delete(riskId);
          return next;
        });
        addToast({
          title: 'Action Failed',
          description: err.message,
          type: 'error',
        });
      }
    },
    [repoId, addToast]
  );

  const executeGenerateInterpretation = useCallback(async () => {
    setLoadingInsights(true);
    try {
      const res = await repositoryApi.getRisks(repoId, {
        generateAi: true,
      });
      setInsights(res.data.insights);
      addToast({
        title: 'Interpretation Ready',
        description: 'AI architecture insights generated.',
        type: 'success',
      });
    } catch (err) {
      const sanitized = sanitizeAiError(err);
      addToast({
        title: sanitized.title || 'Generation Failed',
        description: sanitized.message,
        type: sanitized.type === 'offline' ? 'warning' : 'error',
      });
    } finally {
      setLoadingInsights(false);
    }
  }, [repoId, addToast]);

  // ── Score helpers ───────────────────────────────────────────────────────────
  function getScoreColor(score) {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    if (score >= 50) return 'text-orange-500';
    return 'text-red-500';
  }

  // Dynamically adjust the displayed score for local (optimistic) ignores that
  // aren't yet reflected in the backend-returned score
  function effectiveScore() {
    if (!model) return 0;

    // We cannot do a simple linear delta anymore because the score decays exponentially.
    // Instead, we compute the optimistic list of active risks and re-run the algorithm locally.
    const optimisticRisks = [];
    const alreadyIgnored = new Set((model.ignoredRisks || []).map(r => r.id));

    // 1. Keep risks that were active and haven't been newly ignored locally
    for (const r of model.risks || []) {
      if (!ignoredIds.has(r.id)) {
        optimisticRisks.push(r);
      }
    }

    // 2. Add back risks that were ignored in backend but have been restored locally
    for (const r of model.ignoredRisks || []) {
      if (!ignoredIds.has(r.id)) {
        optimisticRisks.push(r);
      }
    }

    let penalty = 0;
    for (const r of optimisticRisks) {
      let p = SEV_SCORE[r.severity] || 0;
      if (r.category === 'COUPLING' || r.title?.includes('Coupling')) {
        p = 1;
      }
      penalty += p;
    }

    const totalFiles = model.metrics?.totalFiles || 1;
    const sizeFactor = Math.max(1, totalFiles / 25);
    const normalizedPenalty = penalty / sizeFactor;

    let score = Math.round(100 * Math.exp(-normalizedPenalty / 100));
    return Math.max(0, Math.min(100, score));
  }

  // ── Sync ignoredIds with what the backend already has ──────────────────────
  useEffect(() => {
    if (model?.ignoredRisks) {
      setIgnoredIds(new Set(model.ignoredRisks.map(r => r.id)));
    }
  }, [model]);

  // ── Download comprehensive engineering health report ───────────────────────
  const downloadReport = async () => {
    if (!model) return;
    try {
      await downloadEngineeringHealthReport({
        model,
        repoId,
        score: effectiveScore(),
        ignoredIds,
        insights,
        repositoryApi,
      });
      addToast({
        title: 'Report Downloaded',
        description: 'Comprehensive health audit report with diagrams and roadmaps exported.',
        type: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Export Failed',
        description: err.message,
        type: 'error',
      });
    }
  };

  // ── Early returns ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-gray-400">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500" />
          <p>Analyzing structural engineering health...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const isNotReady = error.toLowerCase().includes('not ready') || error.toLowerCase().includes('pending');
    const handleReanalyze = async () => {
      setIsReanalyzing(true);
      try {
        await repositoryApi.reanalyze(repoId);
        navigate(`/explore/${repoId}`);
      } catch (err) {
        addToast({
          title: 'Reanalysis Failed',
          description: err.message || 'An error occurred.',
          type: 'error',
        });
        setIsReanalyzing(false);
      }
    };
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8 bg-surface rounded-lg shadow border border-text/10 max-w-md w-full">
          <ShieldAlert className="w-10 h-10 text-danger mx-auto mb-4 opacity-80" />
          <h2 className="text-lg font-medium text-text mb-2">Analysis Error</h2>
          <p className="text-muted mb-6 text-sm leading-relaxed">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-sm text-text bg-panel hover:bg-text/5 border border-border rounded-lg transition-colors"
            >
              Go Back
            </button>
            {!isNotReady && (
              <button
                onClick={handleReanalyze}
                disabled={isReanalyzing || isGloballyAnalyzing}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isReanalyzing || isGloballyAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Analyzing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" /> Re-analyze Repo
                  </>
                )}
              </button>
            )}

            {isNotReady && (
              <button
                onClick={async () => {
                  await repositoryApi.analyze(repoId);
                  navigate(`/explore/${repoId}`);
                }}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-text rounded-lg text-sm font-medium transition-colors"
              >
                Start Analysis
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Derived lists ───────────────────────────────────────────────────────────
  const score = effectiveScore();

  // All active risks (not ignored this session)
  const activeRisks = (model.risks || []).filter(r => !ignoredIds.has(r.id));
  // All ignored risks (from backend + locally ignored this session)
  const ignoredRisks = [
    ...(model.ignoredRisks || []),
    ...(model.risks || []).filter(r => ignoredIds.has(r.id) && !(model.ignoredRisks || []).find(ir => ir.id === r.id)),
  ].filter(r => ignoredIds.has(r.id));

  const applyFilters = risks => {
    return risks.filter(r => {
      const rawQ = (searchQuery || '').trim();
      if (rawQ) {
        const q = rawQ.toLowerCase();
        // Clean query: strip "risk id:", "risk id", "id:", "risk_", "risk-", "#", and extra whitespace
        const cleanId = q.replace(/^(risk\s*id[:\s]*|id[:\s]*|risk[-_]|#)/i, '').replace(/\s+/g, '');
        const rId = (r.id || '').toLowerCase();
        const rShortId = rId.replace(/^risk[-_]/, '');
        const rSlice = rId.length >= 13 ? rId.slice(5, 13) : rShortId;

        // Exact or prefix/substring match on the unique Risk ID
        const isIdMatch =
          Boolean(cleanId) &&
          (rId === cleanId ||
            rShortId === cleanId ||
            rSlice === cleanId ||
            rId.startsWith(cleanId) ||
            rShortId.startsWith(cleanId) ||
            rSlice.startsWith(cleanId) ||
            rId.includes(cleanId) ||
            rShortId.includes(cleanId));

        // When a user searches for a risk by ID snippet (e.g. "ed58"), match immediately!
        // This ensures ID search is never blocked by an active fileFilter or categoryFilter.
        if (isIdMatch) {
          return true;
        }

        // Standard scoped filters apply for general text search
        if (fileFilter && r.file !== fileFilter) return false;
        if (categoryFilter && r.category !== categoryFilter) return false;

        const haystack = [
          r.id,
          r.title,
          r.description,
          r.message,
          r.file,
          r.category,
          r.severity,
          ...(r.evidence?.instances?.map(i => i.name) || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(q);
      }

      if (fileFilter && r.file !== fileFilter) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      return true;
    });
  };

  const filteredActive = applyFilters(activeRisks);
  const filteredIgnored = applyFilters(ignoredRisks);

  const searchMatchesInOtherFilesCount = (() => {
    if (!fileFilter || !searchQuery.trim()) return 0;
    const q = searchQuery.toLowerCase().trim();
    const cleanId = q.replace(/^(risk\s*id[:\s]*|id[:\s]*|risk[-_]|#)/i, '').replace(/\s+/g, '');
    const sourceList = activeTab === 'active' ? activeRisks : ignoredRisks;
    return sourceList.filter(r => {
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (r.file === fileFilter) return false;
      const rId = (r.id || '').toLowerCase();
      const rShortId = rId.replace(/^risk[-_]/, '');
      const rSlice = rId.length >= 13 ? rId.slice(5, 13) : rShortId;
      if (cleanId && (rId.includes(cleanId) || rShortId.includes(cleanId) || rSlice.includes(cleanId))) {
        return true;
      }
      const haystack = [
        r.id,
        r.title,
        r.description,
        r.message,
        r.file,
        r.category,
        r.severity,
        ...(r.evidence?.instances?.map(i => i.name) || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    }).length;
  })();

  const handleSelectAllVisible = () => {
    const list = activeTab === 'active' ? filteredActive : filteredIgnored;
    setSelectedRiskIds(new Set(list.map(r => r.id)));
  };

  const deadCodeFiles = activeRisks.filter(r => r.title === 'Dead / Unreachable File').map(r => r.file);
  const clonesList = activeRisks
    .filter(r => r.title === 'Structural Code Clone')
    .map(r => ({
      count: r.evidence?.count || 0,
      instances: r.evidence?.instances || [],
    }));
  const hotspotList = activeRisks
    .filter(r => r.title.startsWith('Behavioral Hotspot'))
    .map(r => ({
      file: r.file,
      score: r.evidence?.hotspotScore || r.evidence?.compositeRisk || 0,
      churnScore: r.evidence?.churnScore || 0,
      complexityScore: r.evidence?.complexityScore || 0,
      quadrant: r.evidence?.quadrant || 'CRITICAL_HOTSPOT',
    }));
  const coChangeList = activeRisks
    .filter(r => r.title === 'Hidden Logical Coupling (Temporal Co-Change)')
    .map(r => ({
      file: r.file,
      coupledFiles: r.evidence?.coupledFiles || (r.evidence?.fileB ? [r.evidence.fileB] : []),
      similarity: r.evidence?.coChangeSimilarity ?? r.evidence?.jaccard ?? 0,
      count: r.evidence?.coChangeCount ?? r.evidence?.sharedCommits ?? 0,
    }));

  return (
    <div className="flex h-full flex-col overflow-auto bg-surface text-text">
      <div className="px-4 md:px-6 pt-6 md:pt-8 shrink-0">
        <PageHeader
          title="Engineering Health Dashboard"
          description="Analyze your codebase for structural issues: cyclomatic complexity, dead code, clones, and layer violations."
          icon={ShieldAlert}
        />
      </div>

      <div className="p-4 md:p-8 pt-2 pb-12">
        {/* ── Hero row ── */}
        <div className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <div>
              <h1 className="text-3xl font-bold text-text leading-tight">Engineering Health</h1>
              <p className="mt-2 text-muted">{model.summary}</p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <button
                onClick={() => setAdrRegistryOpen(true)}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-accent/15 border border-accent/30 hover:bg-accent/25 text-accent rounded text-sm font-medium transition-colors shadow-xs cursor-pointer group"
                title="Quick access to all generated Architecture Decision Records"
              >
                <BookOpen className="w-4 h-4 transition-transform group-hover:scale-110" />
                <span>ADR Registry</span>
                <span className="text-[11px] font-semibold px-1.5 py-0.2 rounded-full bg-accent/25 border border-accent/35 text-accent">
                  {adrCount}
                </span>
              </button>
              <button
                onClick={downloadReport}
                className="flex items-center gap-2 px-3 py-1.5 bg-text/5 border border-text/10 hover:bg-text/10 text-text rounded text-sm font-medium transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" /> Download Report
              </button>
            </div>
          </div>
          <div className="text-left md:text-right shrink-0 border-t md:border-t-0 border-border/50 pt-4 md:pt-0 w-full md:w-auto">
            <div className="text-sm font-medium text-muted uppercase tracking-wider mb-1">Health Score</div>
            <div className={`text-5xl font-bold ${getScoreColor(score)}`}>
              {score}
              <span className="text-2xl text-muted/50">/100</span>
            </div>
            {ignoredIds.size > 0 && (
              <div className="text-[10px] text-muted mt-1">{ignoredIds.size} risk(s) ignored</div>
            )}
          </div>
        </div>

        {/* ── Metric tiles ── */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            {
              label: 'Total Risks',
              value: model.metrics?.totalRisks || 0,
              cls: 'text-muted',
            },
            {
              label: 'Critical',
              value: model.metrics?.critical || 0,
              cls: 'text-danger',
            },
            {
              label: 'High',
              value: model.metrics?.high || 0,
              cls: 'text-warning',
            },
            {
              label: 'Warnings',
              value: model.metrics?.warning || 0,
              cls: 'text-amber-400',
            },
          ].map(({ label, value, cls }) => (
            <div key={label} className="rounded border border-border bg-panel p-4">
              <div className={`text-sm ${cls}`}>{label}</div>
              <div className="mt-1 text-2xl font-semibold">{value}</div>
            </div>
          ))}
        </div>

        {/* ── Summary Panels (Hotspots, Co-Change, Dead Code, Clones) ── */}
        {(hotspotList.length > 0 || coChangeList.length > 0 || deadCodeFiles.length > 0 || clonesList.length > 0) && (
          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {hotspotList.length > 0 && (
              <div className="rounded border border-border bg-panel p-5">
                <div className="flex items-center gap-2 text-danger mb-2">
                  <Flame className="w-5 h-5" />
                  <h3 className="font-semibold text-text">Behavioral Hotspots ({hotspotList.length})</h3>
                </div>
                <p className="text-sm text-muted mb-3">
                  High churn & high complexity files prone to defect regressions (Tornhill Matrix).
                </p>
                <div className="max-h-40 overflow-y-auto space-y-2 custom-scrollbar">
                  {hotspotList.map((h, i) => {
                    const ref = tryMakeSourceRef({ filePath: h.file });
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs bg-surface px-2.5 py-1.5 rounded gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          {ref ? (
                            <OpenSourceButton ref={ref} variant="button" className="truncate text-[11px] py-0" />
                          ) : (
                            <span className="font-mono text-muted truncate block">{h.file}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-bold text-danger bg-danger/10 px-1.5 py-0.5 rounded">
                            Score {h.score}
                          </span>
                          <span className="text-[9px] text-muted font-mono hidden sm:inline">
                            Churn {h.churnScore} • CC {h.complexityScore}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {coChangeList.length > 0 && (
              <div className="rounded border border-border bg-panel p-5">
                <div className="flex items-center gap-2 text-warning mb-2">
                  <GitCompare className="w-5 h-5" />
                  <h3 className="font-semibold text-text">Hidden Logical Couplings ({coChangeList.length})</h3>
                </div>
                <p className="text-sm text-muted mb-3">
                  Files frequently co-modified across commits without static imports.
                </p>
                <div className="max-h-40 overflow-y-auto space-y-2 custom-scrollbar">
                  {coChangeList.map((c, i) => {
                    const refA = tryMakeSourceRef({ filePath: c.file });
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs bg-surface px-2.5 py-1.5 rounded gap-2 border border-border/30 hover:border-border transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="min-w-0 flex-1">
                            {refA ? (
                              <OpenSourceButton
                                ref={refA}
                                variant="button"
                                className="truncate text-[11px] py-0 w-full justify-start"
                              />
                            ) : (
                              <span className="font-mono text-muted truncate block text-[11px]">{c.file}</span>
                            )}
                          </div>
                          <span className="text-muted/50 shrink-0 font-mono text-xs">↔</span>
                          <div className="min-w-0 flex-1 flex flex-col gap-1">
                            {c.coupledFiles.map(cf => {
                              const refB = tryMakeSourceRef({ filePath: cf });
                              return refB ? (
                                <OpenSourceButton
                                  key={cf}
                                  ref={refB}
                                  variant="button"
                                  className="truncate text-[11px] py-0 w-full justify-start"
                                />
                              ) : (
                                <span key={cf} className="font-mono text-muted truncate block text-[11px]">
                                  {cf}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 pl-1">
                          <span className="text-[10px] font-bold text-warning bg-warning/10 border border-warning/20 px-1.5 py-0.5 rounded">
                            {Math.round(c.similarity * 100)}% match
                          </span>
                          {c.count > 0 && (
                            <span className="text-[9px] text-muted font-mono hidden sm:inline">{c.count} commits</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {deadCodeFiles.length > 0 && (
              <div className="rounded border border-border bg-panel p-5">
                <div className="flex items-center gap-2 text-warning mb-2">
                  <Ghost className="w-5 h-5" />
                  <h3 className="font-semibold text-text">Dead / Unused Files ({deadCodeFiles.length})</h3>
                </div>
                <p className="text-sm text-muted mb-3">These files are never imported by any entry point.</p>
                <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                  {deadCodeFiles.map(f => {
                    const ref = tryMakeSourceRef({ filePath: f });
                    return ref ? (
                      <div key={f} className="text-xs bg-surface px-2 py-1 rounded">
                        <OpenSourceButton ref={ref} />
                      </div>
                    ) : (
                      <div key={f} className="text-xs font-mono text-muted bg-surface px-2 py-1 rounded truncate">
                        {f}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {clonesList.length > 0 && (
              <div className="rounded border border-border bg-panel p-5">
                <div className="flex items-center gap-2 text-danger mb-2">
                  <Copy className="w-5 h-5" />
                  <h3 className="font-semibold text-text">Structural Code Clones ({clonesList.length})</h3>
                </div>
                <p className="text-sm text-muted mb-3">Identical logical structures across the codebase.</p>
                <div className="max-h-40 overflow-y-auto space-y-3 custom-scrollbar">
                  {clonesList.slice(0, 5).map((c, i) => (
                    <div key={i} className="text-sm bg-surface p-2 rounded">
                      <div className="text-text font-medium mb-1">
                        Clone Group {i + 1} ({c.count} copies)
                      </div>
                      {c.instances.map((inst, idx) => {
                        const iRef = inst.filePath
                          ? tryMakeSourceRef({
                              filePath: inst.filePath,
                              startLine: inst.location?.startLine,
                              endLine: inst.location?.endLine,
                            })
                          : null;
                        return (
                          <div key={idx} className="text-xs font-mono text-muted truncate flex items-center gap-1">
                            {iRef ? (
                              <OpenSourceButton ref={iRef} variant="button" className="truncate py-0 text-[11px]" />
                            ) : (
                              <span>• {inst.name || 'anonymous'}</span>
                            )}
                            {inst.location && (
                              <span className="ml-auto shrink-0 text-muted/60">L{inst.location.startLine}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AI panel ── */}
        {insights && (
          <div className="mb-8 rounded-lg border border-accent/30 bg-accent/10 p-6 relative">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-accent/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> AI Architecture & Health Insights
              </span>
              <button
                onClick={() => setConfirmInterpretationOpen(true)}
                disabled={loadingInsights}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-accent transition-colors disabled:opacity-50 px-2 py-1 rounded hover:bg-accent/10"
                title="Regenerate with fresh AI synthesis"
              >
                {loadingInsights ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Regenerate
              </button>
            </div>
            <AiResponse
              repoId={repoId}
              chatId={`health-${repoId}`}
              data={{
                summary: insights.summary,
                recommendations: insights.recommendations,
                inferences: insights.observations,
                risks: insights.limitations
                  ? Array.isArray(insights.limitations)
                    ? insights.limitations
                    : [insights.limitations]
                  : [],
                references: insights.references || [],
              }}
              title={null}
            />
          </div>
        )}
        {!insights && !loadingInsights && (
          <div className="mb-8 rounded-lg border border-accent/30 bg-accent/5 p-6 flex flex-col items-center justify-center gap-3">
            <p className="text-muted">Generate an AI interpretation of your engineering health metrics.</p>
            {(() => {
              let btnText = 'Generate AI Interpretation',
                isDisabled = false,
                title = '';
              const handleInitiateGenerateInterpretation = () => {
                if (aiState.authState === 'unauthenticated') {
                  navigate('/auth/signin');
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
                setConfirmInterpretationOpen(true);
              };

              if (aiState.status === 'loading') {
                btnText = 'Loading...';
                isDisabled = true;
              } else if (aiState.authState === 'unauthenticated') {
                btnText = 'Sign in to use AI';
              } else if (aiState.status === 'offline') {
                btnText = 'AI Provider Offline';
                isDisabled = true;
                title = 'No AI provider configured.';
              } else if (aiState.quotaStatus === 'exhausted') {
                btnText = 'AI Quota Exceeded';
                isDisabled = true;
                title = 'Usage limit reached.';
              }
              return (
                <button
                  onClick={handleInitiateGenerateInterpretation}
                  disabled={isDisabled}
                  title={title}
                  className="px-4 py-2 bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors disabled:opacity-50 flex items-center gap-2 font-medium text-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  {btnText}
                </button>
              );
            })()}
          </div>
        )}
        {loadingInsights && !insights && (
          <div className="mb-8 flex flex-col items-center gap-3 text-accent text-sm p-6 border border-accent/10 rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin" /> Generating AI interpretations...
          </div>
        )}

        {/* ── Search bar + Risk Tabs ── */}
        <div ref={listStartRef} className="mb-4 border-b border-border scroll-mt-24">
          {/* Search & Per Page */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 mb-4">
            <div className="relative flex-1 flex items-center bg-surface border border-border rounded-lg px-3 py-2 sm:py-1.5 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20 transition-all min-w-0">
              <Search className="w-3.5 h-3.5 text-muted shrink-0 mr-2 pointer-events-none" />
              {fileFilter && (
                <span className="inline-flex items-center gap-1 mr-2 px-2 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent font-mono text-xs shrink-0 max-w-[110px] xs:max-w-[150px] sm:max-w-[200px] md:max-w-xs truncate">
                  <span className="truncate" title={fileFilter}>
                    {fileFilter.split('/').pop()}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearFileFilter}
                    className="hover:bg-accent/25 rounded p-0.5 text-accent hover:text-text transition-colors shrink-0"
                    title="Remove file scope (search all files)"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={
                  fileFilter ? 'Search within this file...' : 'Search risks by ID, title, file, or description...'
                }
                className="w-full min-w-[70px] bg-transparent border-none outline-none text-sm text-text placeholder-muted/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-muted hover:text-text ml-2 shrink-0 p-0.5 rounded"
                  title="Clear search text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="self-end sm:self-auto shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdrRegistryOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 bg-panel border border-border hover:border-accent/60 hover:bg-surface rounded-lg text-xs font-medium text-text transition-colors cursor-pointer shadow-xs"
                title="Open ADR Registry & search all drafted decision records"
              >
                <BookOpen className="w-3.5 h-3.5 text-accent" />
                <span>ADRs ({adrCount})</span>
              </button>

              <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5 sm:py-2">
                <span className="text-xs text-muted font-medium">Cards per page:</span>
                <select
                  value={ITEMS_PER_PAGE}
                  onChange={e => setItemsPerPage(e.target.value)}
                  className="bg-transparent text-sm text-text outline-none cursor-pointer hover:text-accent transition-colors"
                >
                  <option value="10" className="bg-panel">
                    10
                  </option>
                  <option value="20" className="bg-panel">
                    20
                  </option>
                  <option value="50" className="bg-panel">
                    50
                  </option>
                  <option value="1000000" className="bg-panel">
                    All
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Search matches alert in other files */}
          {fileFilter && searchQuery && searchMatchesInOtherFilesCount > 0 && (
            <div className="mb-4 px-3.5 py-2.5 bg-accent/10 border border-accent/25 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3 text-xs text-text">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-accent shrink-0 animate-pulse" />
                <span className="break-words">
                  Found <strong className="text-accent">{searchMatchesInOtherFilesCount}</strong> result
                  {searchMatchesInOtherFilesCount > 1 ? 's' : ''} matching &ldquo;{searchQuery}&rdquo; in other files
                  across the repository.
                </span>
              </div>
              <button
                type="button"
                onClick={handleClearFileFilter}
                className="w-full sm:w-auto px-3 py-1 bg-accent text-white rounded font-medium hover:bg-accent-hover transition-colors shrink-0 shadow-sm text-center"
              >
                Search All Files
              </button>
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-6">
              {[
                {
                  id: 'active',
                  label: 'Active Risks',
                  count: filteredActive.length,
                },
                { id: 'ignored', label: 'Ignored', count: filteredIgnored.length },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    handleClearSelection();
                  }}
                  className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                    activeTab === tab.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.id ? 'bg-accent/20 text-accent' : 'bg-panel border border-border text-muted'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Category filter chips */}
            <div className="flex flex-wrap items-center gap-2 pb-3 w-full sm:w-auto">
              {fileFilter && (
                <button
                  onClick={() => {
                    navigate(`/explore/${repoId}/health`);
                    setCategoryFilter(null);
                  }}
                  className="text-xs px-2 py-1 bg-surface border border-border rounded text-muted hover:text-text transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Clear Filters
                </button>
              )}
              {['ALL', 'QUALITY', 'COUPLING', 'DEPENDENCY', 'ARCHITECTURE', 'SIZE'].map(cat => {
                const isActive = cat === 'ALL' ? categoryFilter === null : categoryFilter === cat;
                const sourceList = activeTab === 'active' ? activeRisks : ignoredRisks;
                const count =
                  cat === 'ALL'
                    ? sourceList.filter(r => !fileFilter || r.file === fileFilter).length
                    : sourceList.filter(r => r.category === cat && (!fileFilter || r.file === fileFilter)).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat === 'ALL' ? null : cat)}
                    className={`text-xs pl-3 pr-2 py-1 rounded border transition-all flex items-center gap-2 ${
                      isActive
                        ? 'bg-accent/20 border-accent/40 text-accent font-medium'
                        : 'bg-surface border-border text-muted hover:text-text hover:border-text/30'
                    }`}
                  >
                    {cat === 'ALL' ? 'All' : cat}
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] leading-none ${
                        isActive ? 'bg-accent/30 text-accent' : 'bg-panel border border-border text-muted'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {fileFilter && (
            <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
              <span className="text-muted">Filtered to file:</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent/10 border border-accent/30 text-accent font-mono text-[11px] shadow-sm">
                <span className="truncate max-w-xs sm:max-w-md">{fileFilter}</span>
                <button
                  type="button"
                  onClick={handleClearFileFilter}
                  className="hover:bg-accent/20 rounded p-0.5 text-accent hover:text-text transition-colors"
                  title="Clear file filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
              <button
                type="button"
                onClick={handleClearFileFilter}
                className="text-xs text-accent hover:underline font-medium ml-1"
              >
                Clear file filter to search all files
              </button>
            </div>
          )}
        </div>

        {/* ── Selection & Bulk Actions Bar ── */}
        {((activeTab === 'active' && filteredActive.length > 0) ||
          (activeTab === 'ignored' && filteredIgnored.length > 0)) && (
          <div
            className={`mb-4 p-3 border rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm transition-colors ${selectedRiskIds.size > 0 ? 'bg-accent/10 border-accent/20' : 'bg-surface border-border'}`}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAllVisible}
                className="px-3 py-1.5 text-xs font-medium bg-panel hover:bg-panel/80 border border-border rounded text-text transition-colors shadow-sm"
              >
                Select All
              </button>
              {selectedRiskIds.size > 0 && (
                <span className="text-sm font-medium text-text">
                  {selectedRiskIds.size} risk{selectedRiskIds.size > 1 ? 's' : ''} selected
                </span>
              )}
            </div>

            {selectedRiskIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'active' && (
                  <button
                    onClick={() => handleBulkIgnore(false)}
                    className="px-3 py-1.5 text-xs font-medium bg-panel hover:bg-panel/80 border border-border rounded text-text flex items-center gap-1 transition-colors"
                  >
                    <EyeOff className="w-3 h-3" /> Ignore Selected
                  </button>
                )}
                {activeTab === 'ignored' && (
                  <button
                    onClick={() => handleBulkIgnore(true)}
                    className="px-3 py-1.5 text-xs font-medium bg-panel hover:bg-panel/80 border border-border rounded text-text flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Restore Selected
                  </button>
                )}
                <button
                  onClick={handleClearSelection}
                  className="px-3 py-1.5 text-xs font-medium bg-panel hover:bg-panel/80 border border-border rounded text-muted hover:text-text transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Risk Grid ── */}
        {activeTab === 'active' &&
          (filteredActive.length === 0 ? (
            <div className="rounded border border-border bg-panel p-8 text-center text-muted">
              {searchMatchesInOtherFilesCount > 0 ? (
                <div className="max-w-md mx-auto flex flex-col items-center">
                  <p className="text-text font-medium mb-1">
                    No active risks matching &ldquo;{searchQuery}&rdquo; in {fileFilter.split('/').pop()}.
                  </p>
                  <p className="text-xs text-muted mb-4">
                    However, {searchMatchesInOtherFilesCount} matching risk
                    {searchMatchesInOtherFilesCount > 1 ? 's were' : ' was'} found across other files in the project.
                  </p>
                  <button
                    type="button"
                    onClick={handleClearFileFilter}
                    className="px-4 py-2 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-semibold inline-flex items-center gap-2 shadow"
                  >
                    Show {searchMatchesInOtherFilesCount} Result{searchMatchesInOtherFilesCount > 1 ? 's' : ''} Across
                    All Files
                  </button>
                </div>
              ) : searchQuery && filteredIgnored.length > 0 ? (
                <div className="max-w-md mx-auto flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent mb-3">
                    <Search className="w-5 h-5" />
                  </div>
                  <p className="text-text font-medium mb-1">No active risks matching &ldquo;{searchQuery}&rdquo;.</p>
                  <p className="text-xs text-muted mb-4">
                    Found <strong className="text-accent">{filteredIgnored.length}</strong> matching risk
                    {filteredIgnored.length > 1 ? 's' : ''} in your <strong>Ignored</strong> list.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ignored')}
                    className="px-4 py-2 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-semibold inline-flex items-center gap-2 shadow"
                  >
                    View {filteredIgnored.length} Result{filteredIgnored.length > 1 ? 's' : ''} in Ignored Tab &rarr;
                  </button>
                </div>
              ) : (
                <>
                  <p className="mb-3">
                    {fileFilter
                      ? searchQuery
                        ? `No active risks matching "${searchQuery}" in ${fileFilter.split('/').pop()}.`
                        : 'No engineering risks found for this file.'
                      : searchQuery
                        ? `No active risks matching "${searchQuery}".`
                        : 'No active risks detected.'}
                  </p>
                  {fileFilter && (
                    <button
                      type="button"
                      onClick={handleClearFileFilter}
                      className="px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent-hover transition-colors font-medium inline-flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" /> Clear File Filter & Search All Files
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredActive.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(risk => (
                  <RiskCard
                    key={risk.id}
                    risk={risk}
                    repoId={repoId}
                    navigate={navigate}
                    onDraftAdr={setActiveAdrRisk}
                    onExplainAi={setExplainRisk}
                    onIgnore={handleIgnoreToggle}
                    ignored={false}
                    selected={selectedRiskIds.has(risk.id)}
                    onSelect={() => handleSelectRisk(risk.id)}
                    onSearchId={setSearchQuery}
                  />
                ))}
              </div>

              {filteredActive.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-surface border border-border rounded text-sm hover:bg-surface/80 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-muted">
                    Page {currentPage} of {Math.ceil(filteredActive.length / ITEMS_PER_PAGE)}
                  </span>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === Math.ceil(filteredActive.length / ITEMS_PER_PAGE)}
                    className="px-3 py-1.5 bg-surface border border-border rounded text-sm hover:bg-surface/80 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ))}

        {activeTab === 'ignored' &&
          (filteredIgnored.length === 0 ? (
            <div className="rounded border border-border bg-panel p-8 text-center text-muted">
              {searchMatchesInOtherFilesCount > 0 ? (
                <div className="max-w-md mx-auto flex flex-col items-center">
                  <p className="text-text font-medium mb-1">
                    No ignored risks matching &ldquo;{searchQuery}&rdquo; in {fileFilter.split('/').pop()}.
                  </p>
                  <p className="text-xs text-muted mb-4">
                    However, {searchMatchesInOtherFilesCount} matching ignored risk
                    {searchMatchesInOtherFilesCount > 1 ? 's were' : ' was'} found across other files in the project.
                  </p>
                  <button
                    type="button"
                    onClick={handleClearFileFilter}
                    className="px-4 py-2 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-semibold inline-flex items-center gap-2 shadow"
                  >
                    Show {searchMatchesInOtherFilesCount} Result{searchMatchesInOtherFilesCount > 1 ? 's' : ''} Across
                    All Files
                  </button>
                </div>
              ) : searchQuery && filteredActive.length > 0 ? (
                <div className="max-w-md mx-auto flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent mb-3">
                    <Search className="w-5 h-5" />
                  </div>
                  <p className="text-text font-medium mb-1">No ignored risks matching &ldquo;{searchQuery}&rdquo;.</p>
                  <p className="text-xs text-muted mb-4">
                    Found <strong className="text-accent">{filteredActive.length}</strong> matching risk
                    {filteredActive.length > 1 ? 's' : ''} in your <strong>Active Risks</strong> list.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('active')}
                    className="px-4 py-2 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-semibold inline-flex items-center gap-2 shadow"
                  >
                    View {filteredActive.length} Result{filteredActive.length > 1 ? 's' : ''} in Active Risks &rarr;
                  </button>
                </div>
              ) : (
                <>
                  <p className="mb-3">
                    {fileFilter || categoryFilter || searchQuery
                      ? 'No ignored risks match the current filters.'
                      : 'No risks have been ignored yet.'}
                  </p>
                  {fileFilter && (
                    <button
                      type="button"
                      onClick={handleClearFileFilter}
                      className="px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent-hover transition-colors font-medium inline-flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" /> Clear File Filter & Search All Files
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredIgnored.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(risk => (
                  <RiskCard
                    key={risk.id}
                    risk={risk}
                    repoId={repoId}
                    navigate={navigate}
                    onDraftAdr={setActiveAdrRisk}
                    onExplainAi={setExplainRisk}
                    onIgnore={handleIgnoreToggle}
                    ignored={true}
                    selected={selectedRiskIds.has(risk.id)}
                    onSelect={() => handleSelectRisk(risk.id)}
                    onSearchId={setSearchQuery}
                  />
                ))}
              </div>

              {filteredIgnored.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-surface border border-border rounded text-sm hover:bg-surface/80 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-muted">
                    Page {currentPage} of {Math.ceil(filteredIgnored.length / ITEMS_PER_PAGE)}
                  </span>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === Math.ceil(filteredIgnored.length / ITEMS_PER_PAGE)}
                    className="px-3 py-1.5 bg-surface border border-border rounded text-sm hover:bg-surface/80 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ))}
      </div>

      {/* ADR Panel: Opened either for a specific risk finding or directly with a selected ADR */}
      <ADRPanel
        key={selectedAdrFromRegistry?.id || activeAdrRisk?.id || (selectedAdrFromRegistry ? 'adr-reg' : 'adr-risk')}
        repoId={repoId}
        risk={activeAdrRisk}
        initialAdr={selectedAdrFromRegistry}
        onClose={() => {
          setActiveAdrRisk(null);
          setSelectedAdrFromRegistry(null);
          refreshAdrCount();
        }}
        onOpenRegistry={() => setAdrRegistryOpen(true)}
      />

      {/* Quick Access ADR Registry & Search Modal */}
      <ADRRegistryModal
        isOpen={adrRegistryOpen}
        onClose={() => {
          setAdrRegistryOpen(false);
          refreshAdrCount();
        }}
        repoId={repoId}
        onSelectAdr={adr => {
          setAdrRegistryOpen(false);
          setSelectedAdrFromRegistry(adr);
          // Check if this ADR corresponds to a known risk finding in the active model
          const matchingRisk =
            model?.risks?.find(r => r.id === adr.id || r.title === adr.title) ||
            model?.ignoredRisks?.find(r => r.id === adr.id || r.title === adr.title) ||
            null;
          setActiveAdrRisk(matchingRisk);
        }}
      />

      {/* Confirmation Modal for Full AI Architecture Interpretation */}
      <ConfirmAiModal
        isOpen={confirmInterpretationOpen}
        onClose={() => setConfirmInterpretationOpen(false)}
        onConfirm={() => {
          setConfirmInterpretationOpen(false);
          executeGenerateInterpretation();
        }}
        title="Generate AI Architecture Interpretation"
        subtitle="Synthesizing Repository Structural Metrics"
        description="CodeLens will synthesize your codebase metrics (hotspots, co-change coupling, complex functions, and structural risks) and request an architectural interpretation from the AI provider."
        tokenEstimate="~1,200 tokens"
        confirmText="Proceed to AI"
      />

      {/* AI Finding Explanation Slide-out Panel */}
      <ExplainFindingPanel
        key={explainRisk?.id || 'explain-panel'}
        isOpen={!!explainRisk}
        risk={explainRisk}
        repoId={repoId}
        onClose={() => setExplainRisk(null)}
        onDraftAdr={risk => {
          setExplainRisk(null);
          setActiveAdrRisk(risk);
        }}
      />
    </div>
  );
};

export default EngineeringHealthPage;
