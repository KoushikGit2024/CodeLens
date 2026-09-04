import React, { useState, useEffect } from 'react';
import { ChevronLeft, Loader2, AlertCircle, RefreshCw, ShieldAlert, CheckCircle, LayoutDashboard, FileText, Copy, Ghost, ChevronDown, ChevronUp, Code } from 'lucide-react';
import AIStatusIndicator from '../assistant/AIStatusIndicator';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import PageHeader from '../../shared/components/PageHeader';
import { useToast } from '../../shared/context/ToastContext';

const RiskAccordionItem = ({ risk, repoId, navigate }) => {
  const [expanded, setExpanded] = useState(false);
  const [sourceCode, setSourceCode] = useState(null);
  const [loadingCode, setLoadingCode] = useState(false);

  const handleExpand = async () => {
    const isExpanding = !expanded;
    setExpanded(isExpanding);
    
    if (isExpanding && risk.file && !sourceCode) {
      setLoadingCode(true);
      try {
        const res = await repositoryApi.getFile(repoId, risk.file);
        let content = res.data.content;
        
        // If we have line numbers, we can slice it
        const loc = risk.details?.location;
        if (loc && loc.startLine) {
          const lines = content.split('\n');
          const start = Math.max(0, loc.startLine - 5);
          const end = Math.min(lines.length, (loc.endLine || loc.startLine) + 5);
          content = lines.slice(start, end).map((l, i) => {
            const lineNum = start + i + 1;
            const isTarget = lineNum >= loc.startLine && lineNum <= (loc.endLine || loc.startLine);
            return `${isTarget ? '>' : ' '} ${String(lineNum).padStart(3, ' ')} | ${l}`;
          }).join('\n');
        } else {
          // just show the first 30 lines if no loc
          content = content.split('\n').slice(0, 30).join('\n') + '\n... (truncated)';
        }
        
        setSourceCode(content);
      } catch (err) {
        setSourceCode("// Source code could not be loaded.");
      } finally {
        setLoadingCode(false);
      }
    }
  };

  const getSeverityBadge = (severity) => {
    const map = {
      critical: 'bg-red-500/20 text-red-500 border border-red-500/30',
      high: 'bg-orange-500/20 text-orange-500 border border-orange-500/30',
      warning: 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
    };
    return `px-2 py-0.5 rounded text-xs uppercase font-medium ${map[severity] || ''}`;
  };

  return (
    <div className={`rounded border ${expanded ? 'border-accent/50 bg-panel shadow-md' : 'border-border bg-panel'} overflow-hidden transition-all duration-200`}>
      {/* Header */}
      <button 
        onClick={handleExpand}
        className="w-full flex items-start justify-between p-5 text-left hover:bg-surface/50 transition-colors"
      >
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className={getSeverityBadge(risk.severity)}>{risk.severity}</span>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">{risk.category}</span>
          </div>
          <h3 className="mt-2 text-lg font-medium text-white">{risk.title}</h3>
          {!expanded && <p className="mt-1 text-sm text-muted line-clamp-1">{risk.description}</p>}
        </div>
        <div className="ml-4 mt-2 text-muted">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-5 border-t border-border/50 bg-surface/30">
          <p className="mb-4 text-gray-300">{risk.description}</p>
          
          {/* File location */}
          {risk.file && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-accent" />
                  Target File
                </span>
                <Link
                  to={`/explore/${repoId}/source?path=${encodeURIComponent(risk.file)}`}
                  className="text-xs text-accent hover:underline flex items-center gap-1"
                >
                  <Code className="w-3 h-3" />
                  View Full Source
                </Link>
              </div>
              <div className="font-mono text-sm text-muted bg-surface px-3 py-2 rounded border border-border">
                {risk.file} {risk.details?.location?.startLine ? `(Line ${risk.details.location.startLine})` : ''}
              </div>
            </div>
          )}

          {/* Details / Evidence */}
          {risk.details && Object.keys(risk.details).length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-white mb-2">Technical Details</h4>
              <div className="bg-surface rounded p-3 text-sm text-muted">
                {Object.entries(risk.details).map(([k, v]) => (
                  k !== 'location' && k !== 'instances' && (
                    <div key={k} className="flex mb-1">
                      <span className="w-1/3 font-medium text-gray-400 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="w-2/3 text-gray-300">{String(v)}</span>
                    </div>
                  )
                ))}
                {risk.details.instances && (
                  <div className="mt-2">
                    <span className="font-medium text-gray-400 block mb-1">Clone Instances:</span>
                    <ul className="list-disc list-inside">
                      {risk.details.instances.map((inst, i) => (
                        <li key={i} className="text-gray-300">
                          {inst.filePath} {inst.location?.startLine ? `(Line ${inst.location.startLine})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Source Code Snippet */}
          {risk.file && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-white mb-2">Code Snippet</h4>
              <div className="relative rounded border border-border overflow-hidden bg-[#1e1e1e]">
                {loadingCode ? (
                  <div className="flex items-center justify-center p-8 text-muted">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Fetching source code...
                  </div>
                ) : sourceCode ? (
                  <pre className="p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre">
                    <code>{sourceCode}</code>
                  </pre>
                ) : (
                  <div className="p-4 text-xs text-muted">No snippet available.</div>
                )}
              </div>
            </div>
          )}

          {/* Refactoring Strategy Action */}
          <div className="mt-6 flex justify-end">
            <button 
              onClick={() => navigate(`/explore/${repoId}/refactoring`)}
              className="px-4 py-2 text-sm font-medium bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors flex items-center"
            >
              Generate Refactoring Strategy
              <svg className="ml-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const EngineeringHealthPage = () => {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const fileFilter = searchParams.get('file');
  
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    fetchData();
  }, [repoId]);

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

  const getSeverityBadge = (severity) => {
    const map = {
      critical: 'bg-red-500/20 text-red-500 border border-red-500/30',
      high: 'bg-orange-500/20 text-orange-500 border border-orange-500/30',
      warning: 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
    };
    return `px-2 py-0.5 rounded text-xs uppercase font-medium ${map[severity] || ''}`;
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

  const filteredRisks = model.risks.filter(r => !fileFilter || r.file === fileFilter);

  return (
    <div className="flex h-full flex-col overflow-auto bg-surface text-white">
      <div className="px-6 pt-6 shrink-0">
        <PageHeader 
          title="Engineering Health Dashboard" 
          description="Analyze your entire codebase for structural issues like cyclomatic complexity, dead code, code clones, and layer violations."
          icon={ShieldAlert}
        />
      </div>
      
      <div className="p-8 pt-2">
        <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Engineering Health</h1>
          <p className="mt-2 text-muted">{model.summary}</p>
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
          <div className="mt-1 text-2xl font-semibold">{model.metrics.totalRisks}</div>
        </div>
        <div className="rounded border border-border bg-panel p-4">
          <div className="text-sm text-danger">Critical Risks</div>
          <div className="mt-1 text-2xl font-semibold">{model.metrics.critical}</div>
        </div>
        <div className="rounded border border-border bg-panel p-4">
          <div className="text-sm text-warning">High Risks</div>
          <div className="mt-1 text-2xl font-semibold">{model.metrics.high}</div>
        </div>
        <div className="rounded border border-border bg-panel p-4">
          <div className="text-sm text-amber-400">Warnings</div>
          <div className="mt-1 text-2xl font-semibold">{model.metrics.warning}</div>
        </div>
      </div>

      {(model.deadCode?.length > 0 || model.clones?.length > 0) && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {model.deadCode?.length > 0 && (
            <div className="rounded border border-border bg-panel p-5">
              <div className="flex items-center gap-2 text-warning mb-2">
                <Ghost className="w-5 h-5" />
                <h3 className="font-semibold text-white">Dead / Unused Files ({model.deadCode.length})</h3>
              </div>
              <p className="text-sm text-muted mb-3">These files are never imported or called from any entry point.</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {model.deadCode.map(f => (
                  <div key={f} className="text-xs font-mono text-muted bg-surface px-2 py-1 rounded truncate">{f}</div>
                ))}
              </div>
            </div>
          )}

          {model.clones?.length > 0 && (
            <div className="rounded border border-border bg-panel p-5">
              <div className="flex items-center gap-2 text-danger mb-2">
                <Copy className="w-5 h-5" />
                <h3 className="font-semibold text-white">Structural Code Clones ({model.clones.length})</h3>
              </div>
              <p className="text-sm text-muted mb-3">These function groups have identical logical structures across the codebase.</p>
              <div className="max-h-40 overflow-y-auto space-y-3">
                {model.clones.slice(0, 5).map((c, i) => (
                  <div key={i} className="text-sm bg-surface p-2 rounded">
                    <div className="text-white font-medium mb-1">Clone Group {i + 1} (Copied {c.count} times)</div>
                    {c.instances.map((inst, idx) => (
                      <div key={idx} className="text-xs font-mono text-muted truncate">
                        • {inst.name || 'anonymous'} {inst.location?.startLine ? `(Line ${inst.location.startLine})` : ''}
                      </div>
                    ))}
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
          <button 
            onClick={async () => {
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
            }}
            className="px-4 py-2 bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors"
          >
            Generate AI Interpretation
          </button>
        </div>
      )}

      {loadingInsights && !insights && (
        <div className="mb-8 flex flex-col items-center gap-3 text-accent text-sm p-6 border border-accent/10 rounded-lg">
          <Loader2 className="h-6 w-6 animate-spin" />
          Generating AI interpretations...
        </div>
      )}

      <div className="mb-4 flex items-center justify-between border-b border-border pb-2">
        <h2 className="text-xl font-semibold text-white">Identified Risks</h2>
        {fileFilter && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Showing risks for: <code className="text-white">{fileFilter}</code></span>
            <button 
              onClick={() => navigate(`/explore/${repoId}/health`)}
              className="text-xs px-2 py-1 bg-surface border border-border rounded text-muted hover:text-white transition-colors flex items-center gap-1"
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
        <div className="space-y-4">
          {filteredRisks.map((risk) => (
            <RiskAccordionItem key={risk.id} risk={risk} repoId={repoId} navigate={navigate} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
};

export default EngineeringHealthPage;
