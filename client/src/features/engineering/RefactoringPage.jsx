import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ChevronLeft, AlertTriangle, Layers, GitBranch, 
  Database, Brain, Activity, File, Loader2, ArrowRight, CheckCircle, LayoutDashboard, Sparkles, Wrench
} from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import PageHeader from '../../shared/components/PageHeader';

const formatCategory = (category) => {
  if (!category) return 'General';
  return category.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase());
};

const IssueGroup = ({ issueTitle, issueData, priorityLevel, selectedCandidateId, setSelectedCandidateId, bgColors, selectedBg }) => {
  const [isOpen, setIsOpen] = useState(true);
  
  return (
    <div className="flex flex-col gap-1.5 ml-2 border-l-2 border-border/50 pl-3">
      <div 
        className="text-[11px] text-muted/80 font-semibold mb-1 truncate cursor-pointer hover:text-white transition-colors flex items-center gap-1" 
        title={issueTitle}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{isOpen ? '▾' : '▸'}</span>
        <span>{issueTitle} <span className="font-normal opacity-70">({issueData.items.length})</span></span>
      </div>
      
      {isOpen && issueData.items.sort((a,b) => b.priorityScore - a.priorityScore).map(c => (
        <button
          key={c.id}
          onClick={() => setSelectedCandidateId(c.id)}
          className={`text-left p-3 rounded-lg border transition-all ${
            selectedCandidateId === c.id 
              ? selectedBg[priorityLevel]
              : bgColors[priorityLevel]
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-surface border border-border/50">Score {c.priorityScore}</span>
            <p className="text-[9px] uppercase tracking-wider text-muted truncate" title={c.type}>{formatCategory(c.type)}</p>
          </div>
          
          {c.files && c.files.length > 0 && (
            <h3 className="text-sm font-medium text-white/90 truncate mb-1 font-mono" title={c.files[0]}>
              {c.files[0].split('/').pop()}
              {c.files.length > 1 ? ` (+${c.files.length - 1})` : ''}
            </h3>
          )}
          
          {c.description && (
            <p className="text-[11px] text-muted/80 line-clamp-2 leading-relaxed" title={c.description}>
              {c.description}
            </p>
          )}
        </button>
      ))}
    </div>
  );
};

export default function RefactoringPage() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  
  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedCandidateId, setSelectedCandidateId] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await repositoryApi.getRefactoringIntelligence(repoId);
        setIntel(data.data);
        if (data.candidates && data.candidates.length > 0) {
          setSelectedCandidateId(data.candidates[0].id);
        }
      } catch (err) {
        setError(err?.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [repoId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3 bg-surface text-white">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
        <span className="text-muted text-sm">Analyzing Refactoring Candidates...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-surface text-white">
        <AlertTriangle className="w-6 h-6 text-danger" />
        <p className="text-sm text-danger">{error}</p>
        <button onClick={() => navigate(`/explore/${repoId}`)} className="text-xs text-accent hover:underline mt-4">
          ← Back to Explorer
        </button>
      </div>
    );
  }

  const formatCategory = (category) => {
    switch (category) {
      case 'QUALITY': return 'Code Quality Issue';
      case 'ARCHITECTURE': return 'Architecture Layer Violation';
      case 'DEPENDENCY': return 'Dependency Graph Flaw';
      case 'COUPLING': return 'High Module Coupling';
      case 'SIZE': return 'Oversized Component';
      default: return category;
    }
  };

  const selectedCandidate = intel?.candidates?.find(c => c.id === selectedCandidateId);

  return (
    <div className="flex flex-col h-full bg-surface">
      <ResizableLayout
      panels={[
        {
          id: 'candidates',
          defaultSize: 20,
          minWidth: 200,
          collapsible: true,
          collapseDirection: 'left',
          title: 'Candidates',
          icon: <Wrench />,
          content: (
            <aside className="flex-1 overflow-y-auto p-3 flex flex-col gap-4 custom-scrollbar bg-[#0d1117] h-full border-r border-border">
              
              {(!intel?.candidates || intel.candidates.length === 0) ? (
                <div className="flex flex-col items-center justify-center p-6 mt-10 text-center gap-3">
                  <CheckCircle className="w-8 h-8 text-success opacity-80" />
                  <p className="text-sm text-muted">Inbox zero! No refactoring candidates found.</p>
                </div>
              ) : (
                <>
                  {['critical', 'high', 'warning'].map(priorityLevel => {
                    const group = intel.candidates.filter(c => c.priority === priorityLevel);
                    if (group.length === 0) return null;
                    
                    const titles = {
                      'critical': 'Critical Action Required',
                      'high': 'High Priority Triage',
                      'warning': 'Suggested Improvements'
                    };
                    const bgColors = {
                      'critical': 'bg-danger/5 border-danger/20 hover:border-danger/40',
                      'high': 'bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40',
                      'warning': 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40'
                    };
                    const selectedBg = {
                      'critical': 'bg-danger/20 border-danger/60 shadow-[0_0_10px_rgba(248,113,113,0.15)]',
                      'high': 'bg-orange-500/20 border-orange-500/60 shadow-[0_0_10px_rgba(251,146,60,0.15)]',
                      'warning': 'bg-blue-500/20 border-blue-500/60 shadow-[0_0_10px_rgba(59,130,246,0.15)]'
                    };
                    
                    // Group candidates by title
                    const issuesMap = {};
                    group.forEach(c => {
                      if (!issuesMap[c.title]) issuesMap[c.title] = { maxScore: 0, items: [] };
                      issuesMap[c.title].items.push(c);
                      issuesMap[c.title].maxScore = Math.max(issuesMap[c.title].maxScore, c.priorityScore);
                    });
                    
                    const sortedIssues = Object.entries(issuesMap).sort((a, b) => b[1].maxScore - a[1].maxScore);
                    
                    return (
                      <div key={priorityLevel} className="flex flex-col gap-3 mb-4">
                        <div className="flex items-center gap-2 px-1">
                          <p className="text-xs text-white/90 uppercase tracking-wider font-bold">{titles[priorityLevel]}</p>
                          <span className="text-[10px] bg-surface border border-border px-1.5 rounded text-muted">{group.length}</span>
                        </div>
                        
                        {sortedIssues.map(([issueTitle, issueData]) => (
                          <IssueGroup 
                            key={issueTitle}
                            issueTitle={issueTitle}
                            issueData={issueData}
                            priorityLevel={priorityLevel}
                            selectedCandidateId={selectedCandidateId}
                            setSelectedCandidateId={setSelectedCandidateId}
                            bgColors={bgColors}
                            selectedBg={selectedBg}
                          />
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            </aside>
          )
        },
        {
          id: 'details',
          defaultSize: 50,
          minWidth: 300,
          collapsible: false,
          content: (
            <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-surface/50 h-full">
              <div className="px-6 pt-6 shrink-0">
                <PageHeader 
                  title="Refactoring Intelligence" 
                  description="Automatically prioritize technical debt into actionable candidates. Select a candidate to see its blast radius and request an AI rewrite."
                  icon={Wrench}
                />
              </div>
              <div className="flex-1 p-6 pt-2">
                {selectedCandidate ? (
                  <CandidateDetail candidate={selectedCandidate} repoId={repoId} />
                ) : (
                  <div className="flex-1 h-full flex items-center justify-center text-muted">Select a candidate to view details</div>
                )}
              </div>
            </main>
          )
        },
        {
          id: 'advisor',
          defaultSize: 30,
          minWidth: 250,
          collapsible: true,
          collapseDirection: 'right',
          title: 'Advisor',
          icon: <Sparkles />,
          content: (
            <aside className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-panel h-full">
              {selectedCandidate && (
                 <AiAdvisor candidate={selectedCandidate} repoId={repoId} />
              )}
            </aside>
          )
        }
      ]}
    />
    </div>
  );
}

// ── Center Panel ─────────────────────────────────────────────────────────────

function CandidateDetail({ candidate, repoId }) {
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState(null);
  const [fixError, setFixError] = useState(null);

  // Clear fix result when candidate changes
  useEffect(() => {
    setFixResult(null);
    setFixError(null);
  }, [candidate.id]);

  useEffect(() => {
    async function loadImpact() {
      setLoading(true);
      try {
        const data = await repositoryApi.getRefactoringImpact(repoId, candidate.id);
        setImpact(data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadImpact();
  }, [repoId, candidate.id]);

  return (
    <div className="max-w-4xl mx-auto w-full flex flex-col gap-6 pb-12">
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-success" />
            <span className="text-xs font-medium text-success uppercase tracking-wider">Deterministic Findings</span>
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">{candidate.title}</h1>
          <p className="text-sm text-white/80 leading-relaxed">{candidate.summary}</p>
        </div>
        <div className="flex flex-col items-end gap-3 text-right">
          <div className="flex flex-col items-end gap-1">
            <span className="text-2xl font-mono font-bold text-white">{candidate.priorityScore}</span>
            <span className="text-[10px] text-muted uppercase">Priority Score</span>
          </div>
          <button 
            onClick={async () => {
              setFixing(true);
              setFixError(null);
              try {
                const res = await repositoryApi.autoFixRefactoringCandidate(repoId, candidate.id);
                setFixResult(res.data);
              } catch (err) {
                setFixError(err?.response?.data?.error || err.message);
              } finally {
                setFixing(false);
              }
            }}
            disabled={fixing || !!fixResult}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#8957e5] hover:bg-[#9d6ef7] disabled:opacity-50 text-white rounded text-sm font-medium transition-colors shadow shadow-[#8957e5]/20"
          >
            {fixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {fixing ? 'Auto-Fixing...' : 'Auto-Fix with AI'}
          </button>
        </div>
      </div>

      {fixError && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm p-3 rounded flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {fixError}
        </div>
      )}

      {fixResult && (
        <div className="bg-[#0d1117] border-2 border-success/30 rounded-lg flex flex-col h-[550px] overflow-hidden shadow-2xl shadow-success/10 mt-6">
          <div className="p-4 border-b border-border bg-surface flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="p-1.5 bg-success/20 rounded-md">
                 <GitBranch className="w-5 h-5 text-success" />
               </div>
               <div>
                 <h3 className="text-sm font-semibold text-white">Suggested Pull Request</h3>
                 <span className="text-xs font-mono text-muted">{fixResult.file}</span>
               </div>
             </div>
             <button className="bg-success hover:bg-success/80 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2">
               <CheckCircle className="w-4 h-4" /> Approve & Merge
             </button>
          </div>
          <div className="flex-1 min-h-0 relative bg-[#0d1117]">
            <DiffEditor
              original={fixResult.originalCode}
              modified={fixResult.refactoredCode}
              language="javascript"
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                renderSideBySide: true,
                fontSize: 12,
                scrollBeyondLastLine: false,
                lineNumbersMinChars: 3
              }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-panel border border-border rounded p-4 min-w-0">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Affected Files</h3>
          <ul className="space-y-1.5">
            {candidate.files.map(f => {
              const range = candidate.fileRanges && candidate.fileRanges[f];
              let url = `/explore/${repoId}/source?path=${encodeURIComponent(f)}`;
              if (range && range.startLine && range.endLine) {
                url += `&line=${range.startLine}-${range.endLine}`;
              }
              return (
                <li key={f} className="text-sm font-mono text-accent truncate" title={f}>
                  <Link to={url} className="hover:underline">
                    {f}
                    {range && range.startLine && (
                      <span className="text-muted/60 text-xs ml-2">
                        L{range.startLine}-{range.endLine}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        
        <div className="bg-panel border border-border rounded p-4 min-w-0">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5" />
            Change Impact Preview
          </h3>
          {loading ? (
            <div className="text-xs text-muted flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> Calculating...</div>
          ) : impact ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted mb-1">Direct Dependents</div>
                <div className="text-sm font-medium text-white">{impact?.directlyAffectedFiles?.length || 0} files</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Transitive Dependents</div>
                <div className="text-sm font-medium text-white">{impact?.transitivelyAffectedFiles?.length || 0} files</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Affected Components</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {impact?.affectedComponents?.length > 0 ? impact.affectedComponents.map(c => (
                     <span key={c} className="text-[10px] px-1.5 py-0.5 bg-surface rounded border border-border">{c}</span>
                  )) : <span className="text-[10px] text-muted">None</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-danger">Failed to load impact</div>
          )}
        </div>
      </div>

      <div className="bg-panel border border-border rounded p-4">
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-4">Deterministic Strategies</h3>
        {candidate.suggestedStrategies?.length > 0 ? (
          <div className="space-y-6">
            {candidate.suggestedStrategies.map((strat, idx) => (
              <div key={idx} className="border-l-2 border-accent/40 pl-4">
                <h4 className="text-sm font-semibold text-white mb-1">{strat.action}</h4>
                <p className="text-sm text-white/70 mb-3">{strat.description}</p>
                
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-success font-medium mb-1 block">Expected Benefits</span>
                    <ul className="list-disc list-inside text-white/60 space-y-0.5">
                      {strat.expectedBenefits?.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                  <div>
                    <span className="text-orange-400 font-medium mb-1 block">Risks</span>
                    <ul className="list-disc list-inside text-white/60 space-y-0.5">
                      {strat.risks?.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No deterministic strategies available for this category.</p>
        )}
      </div>

      <div className="text-xs text-muted flex gap-4 border-t border-border pt-4">
         <span>Severity: <span className="uppercase text-white/70">{candidate.severity}</span></span>
         <span>Confidence: <span className="uppercase text-white/70">{candidate.confidence}</span></span>
      </div>
    </div>
  );
}

// ── Right Panel ──────────────────────────────────────────────────────────────

function AiAdvisor({ candidate, repoId }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadInsights = async () => {
    setLoading(true);
    setInsights(null);
    try {
        const data = await repositoryApi.getRefactoringInsights(repoId, candidate.id);
        setInsights(data.data);
    } catch (err) {
      setInsights({ error: err?.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  // Reset insights when candidate changes
  useEffect(() => {
    setInsights(null);
    setLoading(false);
  }, [candidate.id]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e]/40">
      <div className="p-4 border-b border-border bg-panel flex items-center gap-2 shrink-0">
        <Brain className="w-4 h-4 text-[#cba6f7]" />
        <span className="text-sm font-medium text-[#cba6f7]">AI Refactoring Advisor</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {!insights && !loading && (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
            <p className="text-sm text-muted">Generate a customized AI refactoring strategy for this candidate.</p>
            <button 
              onClick={loadInsights}
              className="px-4 py-2 bg-accent/20 text-accent hover:bg-accent/30 rounded transition-colors"
            >
              Generate AI Strategy
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted">
            <Loader2 className="w-6 h-6 text-[#cba6f7] animate-spin" />
            <span className="text-xs">Analyzing candidate...</span>
          </div>
        ) : insights?.error ? (
          <div className="text-xs text-danger p-3 bg-danger/10 border border-danger/20 rounded">
            {insights.error}
          </div>
        ) : insights ? (
          <AiResponse 
            repoId={repoId}
            chatId={`refactor-${candidate.id}`}
            data={{
              summary: insights.summary,
              recommendations: insights.recommendations?.map(rec => {
                let md = `**${rec.strategy}**\n${rec.reasoning}`;
                if (rec.steps?.length > 0) {
                  md += `\n\n*Execution Steps:*\n` + rec.steps.map(s => `- ${s}`).join('\n');
                }
                return md;
              }) || [],
              risks: insights.limitations || [],
              references: insights.recommendations?.flatMap(r => r.references || []) || []
            }}
            title={null}
          />
        ) : null}
      </div>
    </div>
  );
}
