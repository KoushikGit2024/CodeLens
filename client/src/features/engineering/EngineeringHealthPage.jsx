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
} from 'lucide-react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import PageHeader from '../../shared/components/PageHeader';
import { useToast } from '../../shared/context/ToastContext';
import { useAIState } from '../../shared/context/AIContext';
import ADRPanel from './ADRPanel';
import OpenSourceButton from '../../shared/components/OpenSourceButton';
import { tryMakeSourceRef } from '../../shared/navigation/sourceRef';

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
const RiskCard = ({ risk, repoId, navigate, onDraftAdr, onExplainAi, onIgnore, ignored = false }) => {
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
      className={`rounded-xl border flex flex-col overflow-hidden shadow-lg transition-all ${
        ignored ? 'border-border/40 bg-panel/50 opacity-60' : 'border-border bg-panel hover:border-accent/40'
      }`}
    >
      <div className="p-5 flex-1 flex flex-col bg-gradient-to-b from-surface/50 to-transparent">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <span className={severityBadge(risk.severity)}>{risk.severity}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">{risk.category}</span>
        </div>

        <h3 className="text-base font-semibold text-text mb-1 line-clamp-2" title={risk.title}>
          {risk.title}
        </h3>
        <p className="text-xs text-muted leading-relaxed flex-1 mb-3">{risk.description || risk.message}</p>

        {/* Stable risk ID badge for reference */}
        <div className="mb-3">
          <span
            className="text-[9px] font-mono text-muted/50 select-all"
            title="Stable risk ID — persists across re-analyses"
          >
            Risk Id: {risk.id?.slice(5, 13)}
          </span>
        </div>

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

  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainResult, setExplainResult] = useState(null);

  // Local ignored IDs — mirrors what's in IndexedDB, updated optimistically
  const [ignoredIds, setIgnoredIds] = useState(new Set());

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

  const setActiveAdrRisk = risk => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (risk) next.set('adr', risk.id);
        else next.delete('adr');
        return next;
      },
      { replace: true }
    );
  };

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

  const handleExplainAi = useCallback(
    async risk => {
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
          description: 'No AI provider configured.',
          type: 'error',
        });
        return;
      }
      setExplainRisk(risk);
      setExplainResult(null);
      setExplainLoading(true);
      try {
        const res = await repositoryApi.getRisks(repoId, {
          generateAi: true,
          singleRisk: risk,
        });
        setExplainResult(res.data?.insights || null);
      } catch (err) {
        addToast({
          title: 'Explanation Failed',
          description: err.message,
          type: 'error',
        });
        setExplainRisk(null);
      } finally {
        setExplainLoading(false);
      }
    },
    [aiState, repoId, navigate, addToast, setExplainRisk]
  );

  useEffect(() => {
    if (explainRisk && !explainResult && !explainLoading) {
      handleExplainAi(explainRisk);
    }
  }, [explainRisk, explainResult, explainLoading, handleExplainAi]);

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
    // ignoredIds may contain IDs added locally this session that aren't yet in
    // model.ignoredRisks — we subtract their extra penalties
    const alreadyIgnored = new Set((model.ignoredRisks || []).map(r => r.id));
    let delta = 0;
    for (const id of ignoredIds) {
      if (!alreadyIgnored.has(id)) {
        const risk = model.risks?.find(r => r.id === id);
        if (risk) delta += SEV_SCORE[risk.severity] || 0;
      }
    }
    // Also add back any risks restored this session that were in model.ignoredRisks
    for (const r of model.ignoredRisks || []) {
      if (!ignoredIds.has(r.id)) {
        delta -= SEV_SCORE[r.severity] || 0;
      }
    }
    return Math.max(0, Math.min(100, model.score - delta));
  }

  // ── Sync ignoredIds with what the backend already has ──────────────────────
  useEffect(() => {
    if (model?.ignoredRisks) {
      setIgnoredIds(new Set(model.ignoredRisks.map(r => r.id)));
    }
  }, [model]);

  // ── Download report ─────────────────────────────────────────────────────────
  const downloadReport = () => {
    if (!model) return;
    let md = `# Engineering Health Report\n\n`;
    md += `**Score**: ${effectiveScore()}/100\n\n`;
    md += `## Active Risks\n`;
    model.risks.forEach(r => {
      md += `### ${r.title}\n- **Severity**: ${r.severity}\n- **Category**: ${r.category}\n- **File**: ${r.file || '—'}\n- **ID**: ${r.id}\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const safeRepo = repoId.replace(/[^a-zA-Z0-9-]/g, '_');
    const dateStamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `engineering_health_${safeRepo}_${dateStamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
                disabled={isReanalyzing}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isReanalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Starting...
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

  const filteredActive = activeRisks.filter(r => {
    if (fileFilter && r.file !== fileFilter) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const haystack = [r.title, r.description, r.file, r.category, ...(r.evidence?.instances?.map(i => i.name) || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const deadCodeFiles = activeRisks.filter(r => r.title === 'Dead / Unreachable File').map(r => r.file);
  const clonesList = activeRisks
    .filter(r => r.title === 'Structural Code Clone')
    .map(r => ({
      count: r.evidence?.count || 0,
      instances: r.evidence?.instances || [],
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
            <button
              onClick={downloadReport}
              className="flex shrink-0 items-center gap-2 px-3 py-1.5 bg-text/5 border border-text/10 hover:bg-text/10 text-text rounded text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" /> Download Report
            </button>
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

        {/* ── Dead code / Clone summary panels ── */}
        {(deadCodeFiles.length > 0 || clonesList.length > 0) && (
          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
          <div className="mb-8 rounded-lg border border-accent/30 bg-accent/10 p-6">
            <AiResponse
              repoId={repoId}
              chatId={`health-${repoId}`}
              data={{
                summary: insights.summary,
                recommendations: insights.recommendations,
                inferences: insights.observations,
                risks: insights.limitations ? [insights.limitations] : [],
              }}
              title="AI Architecture Insights"
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
              const handleGenerate = async () => {
                if (aiState.authState === 'unauthenticated') {
                  navigate('/auth/signin');
                  return;
                }
                setLoadingInsights(true);
                try {
                  const res = await repositoryApi.getRisks(repoId, {
                    generateAi: true,
                  });
                  setInsights(res.data.insights);
                  addToast({
                    title: 'Interpretation Generated',
                    description: 'AI interpretation ready.',
                    type: 'success',
                  });
                } catch (err) {
                  addToast({
                    title: 'Generation Failed',
                    description: err.message || 'Failed to generate.',
                    type: 'error',
                  });
                } finally {
                  setLoadingInsights(false);
                }
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
                  onClick={handleGenerate}
                  disabled={isDisabled}
                  title={title}
                  className="px-4 py-2 bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors disabled:opacity-50"
                >
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
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search risks by title, file, or description..."
                className="w-full bg-surface border border-border rounded-lg pl-9 pr-9 py-2 text-sm text-text placeholder-muted/60 focus:outline-none focus:border-accent/50 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2">
              <span className="text-xs text-muted font-medium hidden sm:inline">Cards per page:</span>
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
          <div className="flex items-center gap-6 mb-3">
            {[
              {
                id: 'active',
                label: 'Active Risks',
                count: activeRisks.length,
              },
              { id: 'ignored', label: 'Ignored', count: ignoredRisks.length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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

            {/* Category filter chips — only for active tab */}
            {activeTab === 'active' && (
              <div className="ml-auto flex flex-wrap gap-2 pb-3">
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
                  const count =
                    cat === 'ALL'
                      ? activeRisks.filter(r => !fileFilter || r.file === fileFilter).length
                      : activeRisks.filter(r => r.category === cat && (!fileFilter || r.file === fileFilter)).length;
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
            )}
          </div>

          {fileFilter && activeTab === 'active' && (
            <p className="text-xs text-muted mb-3">
              Filtered to file: <code className="text-text">{fileFilter}</code>
            </p>
          )}
        </div>

        {/* ── Risk Grid ── */}
        {activeTab === 'active' &&
          (filteredActive.length === 0 ? (
            <div className="rounded border border-border bg-panel p-8 text-center text-muted">
              {fileFilter ? 'No engineering risks found for this file.' : 'No active risks detected.'}
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
                    onExplainAi={handleExplainAi}
                    onIgnore={handleIgnoreToggle}
                    ignored={false}
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

              {/* Inline AI explanation panel */}
              {explainRisk && (
                <div className="mt-6 rounded-lg border border-accent/30 bg-accent/5 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-accent flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> AI Explanation — {explainRisk.title}
                    </span>
                    <button
                      onClick={() => {
                        setExplainRisk(null);
                        setExplainResult(null);
                      }}
                      className="text-muted hover:text-text text-xs"
                    >
                      Dismiss
                    </button>
                  </div>
                  {explainLoading && (
                    <div className="flex items-center gap-2 text-muted text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating explanation...
                    </div>
                  )}
                  {explainResult && (
                    <AiResponse
                      repoId={repoId}
                      chatId={`health-explain-${explainRisk.id}`}
                      data={{
                        summary: explainResult.summary,
                        recommendations: explainResult.recommendations,
                        inferences: explainResult.observations,
                      }}
                      title="AI Explanation"
                    />
                  )}
                </div>
              )}
            </>
          ))}

        {activeTab === 'ignored' &&
          (ignoredRisks.length === 0 ? (
            <div className="rounded border border-border bg-panel p-8 text-center text-muted">
              No risks have been ignored yet.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {ignoredRisks.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(risk => (
                  <RiskCard
                    key={risk.id}
                    risk={risk}
                    repoId={repoId}
                    navigate={navigate}
                    onDraftAdr={setActiveAdrRisk}
                    onExplainAi={null}
                    onIgnore={handleIgnoreToggle}
                    ignored={true}
                  />
                ))}
              </div>

              {ignoredRisks.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-surface border border-border rounded text-sm hover:bg-surface/80 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-muted">
                    Page {currentPage} of {Math.ceil(ignoredRisks.length / ITEMS_PER_PAGE)}
                  </span>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === Math.ceil(ignoredRisks.length / ITEMS_PER_PAGE)}
                    className="px-3 py-1.5 bg-surface border border-border rounded text-sm hover:bg-surface/80 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ))}
      </div>

      <ADRPanel repoId={repoId} risk={activeAdrRisk} onClose={() => setActiveAdrRisk(null)} />
    </div>
  );
};

export default EngineeringHealthPage;
