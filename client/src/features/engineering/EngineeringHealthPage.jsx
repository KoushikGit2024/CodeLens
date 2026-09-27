/**
 * EngineeringHealthPage.jsx
 *
 * It initiates the structural risk view, then extracts specific deterministic flaws, 
 * and then it applies them into visually categorized severity cards.
 */
import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw, ShieldAlert, Copy, Ghost, ArrowRight, Sparkles, ExternalLink, Download } from 'lucide-react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import PageHeader from '../../shared/components/PageHeader';
import { useToast } from '../../shared/context/ToastContext';
import { useAIState } from '../../shared/context/AIContext';
import ADRPanel from './ADRPanel';
import OpenSourceButton from '../../shared/components/OpenSourceButton';
import { FileText } from 'lucide-react';
import { tryMakeSourceRef } from '../../shared/navigation/sourceRef';

const RiskCard = ({ risk, repoId, navigate, onDraftAdr, onExplainAi }) => {
  /**
   * It evaluates the risk severity string, then extracts the specific priority level, 
   * and then it applies the corresponding Tailwind color badge.
   */
  const getSeverityBadge = (severity) => {
    const map = {
      critical: 'bg-red-500/20 text-red-500 border border-red-500/30',
      high: 'bg-orange-500/20 text-orange-500 border border-orange-500/30',
      warning: 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
    };
    return `px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest ${map[severity] || ''}`;
  };

  // Build a canonical source reference when the risk points to a specific file
  const sourceRef = risk.file
    ? tryMakeSourceRef({
        filePath: risk.file,
        startLine: risk.evidence?.startLine ?? risk.location?.startLine,
        endLine:   risk.evidence?.endLine   ?? risk.location?.endLine,
        meta: { category: risk.category, severity: risk.severity },
      })
    : null;

  return (
    <div className="rounded-xl border border-border bg-panel flex flex-col overflow-hidden hover:border-accent/40 transition-colors shadow-lg">
      <div className="p-5 flex-1 flex flex-col bg-gradient-to-b from-surface/50 to-transparent">
        <div className="flex items-start justify-between mb-3">
          <span className={getSeverityBadge(risk.severity)}>{risk.severity}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">{risk.category}</span>
        </div>
        <h3 className="text-base font-semibold text-text mb-2 line-clamp-2" title={risk.title}>{risk.title}</h3>
        <p className="text-xs text-muted line-clamp-3 leading-relaxed flex-1">{risk.description || risk.message}</p>
        
        {sourceRef ? (
          <div className="mt-4 pt-4 border-t border-text/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-text/70 uppercase tracking-widest">Target File</span>
            </div>
            {/* Canonical navigation — no hand-built URLs */}
            <OpenSourceButton ref={sourceRef} variant="button" className="w-full justify-start truncate" />
          </div>
        ) : risk.files && risk.files.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-text/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-text/70 uppercase tracking-widest">Target Files ({risk.files.length})</span>
            </div>
            <div className="space-y-1 max-h-[80px] overflow-y-auto custom-scrollbar pr-1">
              {risk.files.map((f, i) => {
                const r = tryMakeSourceRef({ filePath: f });
                return r ? (
                  <OpenSourceButton key={i} ref={r} variant="button" className="w-full justify-start truncate py-1 text-[11px]" />
                ) : (
                  <div key={i} className="text-xs truncate text-muted px-2 py-1">{f}</div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      <div className="bg-panel border-t border-border px-4 py-3 shrink-0 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onDraftAdr(risk)}
            className="text-xs font-medium text-text/80 hover:text-accent flex items-center gap-1 transition-colors"
          >
            <FileText className="w-3 h-3" /> Draft ADR
          </button>
          {onExplainAi && (
            <button 
              onClick={() => onExplainAi(risk)}
              className="text-xs font-medium text-text/80 hover:text-accent flex items-center gap-1 transition-colors"
            >
              <Sparkles className="w-3 h-3" /> Explain
            </button>
          )}
        </div>
        <button 
          onClick={() => navigate(`/explore/${repoId}/refactoring`)}
          className="text-xs font-medium text-text/80 hover:text-text flex items-center gap-1 transition-colors"
        >
          Triage <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

const EngineeringHealthPage = () => {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { aiState } = useAIState();
  const [searchParams] = useSearchParams();
  const fileFilter = searchParams.get('file');
  
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [activeAdrRisk, setActiveAdrRisk] = useState(null);
  // Risk selected for AI explanation — shown inline below the grid
  const [explainRisk, setExplainRisk] = useState(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainResult, setExplainResult] = useState(null);

  const handleExplainAi = async (risk) => {
    if (aiState.authState === 'unauthenticated') { navigate('/auth/signin'); return; }
    if (aiState.quotaStatus === 'exhausted') {
      addToast({ title: 'Quota Exceeded', description: 'AI usage limit reached.', type: 'error' }); return;
    }
    if (aiState.status === 'offline') {
      addToast({ title: 'AI Offline', description: 'No AI provider configured.', type: 'error' }); return;
    }
    setExplainRisk(risk);
    setExplainResult(null);
    setExplainLoading(true);
    try {
      const res = await repositoryApi.getRisks(repoId, { generateAi: true, singleRisk: risk });
      setExplainResult(res.data?.insights || null);
    } catch (err) {
      addToast({ title: 'Explanation Failed', description: err.message, type: 'error' });
      setExplainRisk(null);
    } finally {
      setExplainLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [repoId]);

  /**
   * It triggers the risk API endpoint, then extracts the compiled engineering model, 
   * and then it applies the data to the dashboard component state.
   */
  const fetchData = async () => {
    try {
      setLoading(true);
      const riskData = await repositoryApi.getRisks(repoId);
      setModel(riskData.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    if (score >= 50) return 'text-orange-500';
    return 'text-red-500';
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-gray-400">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500"></div>
          <p>Analyzing structural engineering health...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          <h2 className="mb-2 font-semibold">Error Loading Engineering Health</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const downloadReport = () => {
    let md = `# Engineering Health Report\n\n`;
    md += `**Summary**: ${model.summary}\n\n`;
    md += `## Metrics\n`;
    md += `- **Health Score**: ${model.overallHealthScore}/100\n`;
    md += `- **Cyclomatic Complexity**: ${model.metrics?.totalCyclomaticComplexity || 0}\n`;
    md += `- **Dead Code**: ${model.metrics?.unreachableFilesCount || 0} files\n`;
    md += `- **Code Clones**: ${model.metrics?.totalClones || 0} instances\n\n`;
    
    md += `## Top Risks\n`;
    model.risks.forEach(r => {
      md += `### ${r.title}\n`;
      md += `- **Severity**: ${r.severity}\n`;
      md += `- **Category**: ${r.category}\n`;
      md += `- **Description**: ${r.description}\n`;
      if (r.file) md += `- **File**: ${r.file}\n`;
      md += `\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'engineering_health_report.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredRisks = model.risks.filter(r => !fileFilter || r.file === fileFilter);

  // It parses the unified risk array, then extracts specific quality issues, and then it applies them to the dead code and clone lists.
  const deadCodeFiles = model.risks.filter(r => r.title === 'Dead / Unreachable File').map(r => r.file);
  const clonesList = model.risks
    .filter(r => r.title === 'Structural Code Clone')
    .map(r => ({ count: r.evidence?.count || 0, instances: r.evidence?.instances || [] }));

  return (
    <div className="flex h-full flex-col overflow-auto bg-surface text-text">
      <div className="px-6 pt-6 shrink-0">
        <PageHeader 
          title="Engineering Health Dashboard" 
          description="Analyze your entire codebase for structural issues like cyclomatic complexity, dead code, code clones, and layer violations."
          icon={ShieldAlert}
        />
      </div>
      
      <div className="p-8 pt-2">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-3xl font-bold text-text">Engineering Health</h1>
              <p className="mt-2 text-muted">{model.summary}</p>
            </div>
            <button 
              onClick={downloadReport}
              className="flex items-center gap-2 px-3 py-1.5 bg-text/5 border border-text/10 hover:bg-text/10 text-text rounded text-sm font-medium transition-colors mt-2"
            >
              <Download className="w-4 h-4" /> Download Report
            </button>
          </div>
          <div className="text-right">
          <div className="text-sm font-medium text-muted uppercase tracking-wider mb-1">Health Score</div>
          <div className={`text-5xl font-bold ${getScoreColor(model.score)}`}>
            {model.score}
            <span className="text-2xl text-muted/50">/100</span>
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="rounded border border-border bg-panel p-4">
          <div className="text-sm text-muted">Total Risks</div>
          <div className="mt-1 text-2xl font-semibold">{model.metrics?.totalRisks || 0}</div>
        </div>
        <div className="rounded border border-border bg-panel p-4">
          <div className="text-sm text-danger">Critical Risks</div>
          <div className="mt-1 text-2xl font-semibold">{model.metrics?.critical || 0}</div>
        </div>
        <div className="rounded border border-border bg-panel p-4">
          <div className="text-sm text-warning">High Risks</div>
          <div className="mt-1 text-2xl font-semibold">{model.metrics?.high || 0}</div>
        </div>
        <div className="rounded border border-border bg-panel p-4">
          <div className="text-sm text-amber-400">Warnings</div>
          <div className="mt-1 text-2xl font-semibold">{model.metrics?.warning || 0}</div>
        </div>
      </div>

      {(deadCodeFiles.length > 0 || clonesList.length > 0) && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {deadCodeFiles.length > 0 && (
            <div className="rounded border border-border bg-panel p-5">
              <div className="flex items-center gap-2 text-warning mb-2">
                <Ghost className="w-5 h-5" />
                <h3 className="font-semibold text-text">Dead / Unused Files ({deadCodeFiles.length})</h3>
              </div>
              <p className="text-sm text-muted mb-3">These files are never imported or called from any entry point.</p>
              <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                {deadCodeFiles.map(f => {
                  const ref = tryMakeSourceRef({ filePath: f });
                  return ref
                    ? <div key={f} className="text-xs bg-surface px-2 py-1 rounded"><OpenSourceButton ref={ref} /></div>
                    : <div key={f} className="text-xs font-mono text-muted bg-surface px-2 py-1 rounded truncate">{f}</div>;
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
              <p className="text-sm text-muted mb-3">These function groups have identical logical structures across the codebase.</p>
              <div className="max-h-40 overflow-y-auto space-y-3 custom-scrollbar">
                {clonesList.slice(0, 5).map((c, i) => (
                  <div key={i} className="text-sm bg-surface p-2 rounded">
                    <div className="text-text font-medium mb-1">Clone Group {i + 1} (Copied {c.count} times)</div>
                    {c.instances.map((inst, idx) => {
                      const iRef = inst.location?.file
                        ? tryMakeSourceRef({ filePath: inst.location.file, startLine: inst.location.startLine })
                        : null;
                      return (
                        <div key={idx} className="text-xs font-mono text-muted truncate flex items-center gap-1">
                          • {inst.name || 'anonymous'}
                          {iRef && <OpenSourceButton ref={iRef} variant="icon" />}
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

      {insights && (
        <div className="mb-8 rounded-lg border border-accent/30 bg-accent/10 p-6">
          <AiResponse
            repoId={repoId}
            chatId={`health-${repoId}`}
            data={{
              summary: insights.summary,
              recommendations: insights.recommendations,
              inferences: insights.observations,
              risks: insights.limitations ? [insights.limitations] : []
            }}
            title="AI Architecture Insights"
          />
        </div>
      )}

      {!insights && !loadingInsights && (
        <div className="mb-8 rounded-lg border border-accent/30 bg-accent/5 p-6 flex flex-col items-center justify-center gap-3">
          <p className="text-muted">Generate an AI interpretation of your engineering health metrics.</p>
          
          {(() => {
            let btnText = 'Generate AI Interpretation';
            let isDisabled = false;
            let title = '';
            
            const handleGenerate = async () => {
              if (aiState.authState === 'unauthenticated') {
                navigate('/auth/signin');
                return;
              }
              
              setLoadingInsights(true);
              try {
                const res = await repositoryApi.getRisks(repoId, { generateAi: true });
                setInsights(res.data.insights);
                addToast({ title: 'Interpretation Generated', description: 'AI interpretation of engineering health is ready.', type: 'success' });
              } catch (err) {
                console.error(err);
                addToast({ title: 'Generation Failed', description: err.message || 'Failed to generate AI interpretation.', type: 'error' });
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
              title = 'No AI provider configured on the server.';
            } else if (aiState.quotaStatus === 'exhausted') {
              btnText = 'AI Quota Exceeded';
              isDisabled = true;
              title = 'You have reached your AI usage limit.';
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
          <Loader2 className="h-6 w-6 animate-spin" />
          Generating AI interpretations...
        </div>
      )}

      <div className="mb-4 flex items-center justify-between border-b border-border pb-2">
        <h2 className="text-xl font-semibold text-text">Identified Risks</h2>
        {fileFilter && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Showing risks for: <code className="text-text">{fileFilter}</code></span>
            <button 
              onClick={() => navigate(`/explore/${repoId}/health`)}
              className="text-xs px-2 py-1 bg-surface border border-border rounded text-muted hover:text-text transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Clear Filter
            </button>
          </div>
        )}
      </div>
      
      {filteredRisks.length === 0 ? (
        <div className="rounded border border-border bg-panel p-8 text-center text-muted">
          {fileFilter ? 'No engineering risks found for this specific file.' : 'No engineering risks identified. The codebase appears structurally healthy.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredRisks.map((risk) => (
              <RiskCard
                key={risk.id}
                risk={risk}
                repoId={repoId}
                navigate={navigate}
                onDraftAdr={setActiveAdrRisk}
                onExplainAi={handleExplainAi}
              />
            ))}
          </div>

          {/* Inline AI explanation panel */}
          {explainRisk && (
            <div className="mt-6 rounded-lg border border-accent/30 bg-accent/5 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-accent flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Explanation — {explainRisk.title}</span>
                <button onClick={() => { setExplainRisk(null); setExplainResult(null); }} className="text-muted hover:text-text text-xs">Dismiss</button>
              </div>
              {explainLoading && <div className="flex items-center gap-2 text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Generating explanation...</div>}
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
      )}
      </div>
      
      <ADRPanel repoId={repoId} risk={activeAdrRisk} onClose={() => setActiveAdrRisk(null)} />
    </div>
  );
};

export default EngineeringHealthPage;