import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  AlertTriangle, Layers, GitBranch, 
  Database, Brain, Loader2, CheckCircle, Sparkles, Wrench,
  ChevronDown, ChevronRight, File
} from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import PageHeader from '../../shared/components/PageHeader';

// Palette constants — all in sync with CSS variables
const PRIORITY_META = {
  critical: {
    label: 'Critical',
    dot: '#e05252',
    border: 'border-[#e05252]/30',
    bg: 'hover:bg-[#e05252]/5',
    selectedBorder: 'border-[#e05252]/50',
    selectedBg: 'bg-[#e05252]/8',
    text: 'text-[#e05252]',
  },
  high: {
    label: 'High Priority',
    dot: '#d4923a',
    border: 'border-[#d4923a]/30',
    bg: 'hover:bg-[#d4923a]/5',
    selectedBorder: 'border-[#d4923a]/50',
    selectedBg: 'bg-[#d4923a]/8',
    text: 'text-[#d4923a]',
  },
  warning: {
    label: 'Suggestions',
    dot: '#4D7EFF',
    border: 'border-[#4D7EFF]/20',
    bg: 'hover:bg-[#4D7EFF]/5',
    selectedBorder: 'border-[#4D7EFF]/40',
    selectedBg: 'bg-[#4D7EFF]/8',
    text: 'text-accent',
  },
};

const formatCategory = (category) => {
  if (!category) return 'General';
  return category.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase());
};

// ── Candidate Card ────────────────────────────────────────────────────────────
const CandidateCard = ({ candidate, isSelected, onSelect, priorityLevel }) => {
  const meta = PRIORITY_META[priorityLevel] || PRIORITY_META.warning;
  return (
    <button
      onClick={() => onSelect(candidate.id)}
      className={`w-full text-left px-3 py-2.5 rounded border transition-all duration-150
        ${isSelected
          ? `${meta.selectedBg} ${meta.selectedBorder} border`
          : `border-transparent ${meta.bg}`
        }
      `}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className=" text-[10px] font-semibold text-muted tracking-wide">
          Score {candidate.priorityScore}
        </span>
        <span className="text-[9px] uppercase tracking-widest text-muted/60">
          {formatCategory(candidate.type)}
        </span>
      </div>
      {candidate.files?.length > 0 && (
        <div className="flex items-center gap-1.5 mb-1">
          <File className="w-3 h-3 shrink-0 text-muted/50" />
          <span className="text-[12px] font-medium text-[#CBD5E8] truncate" title={candidate.files[0]}>
            {candidate.files[0].split('/').pop()}
            {candidate.files.length > 1 && (
              <span className="text-muted ml-1 font-normal">+{candidate.files.length - 1}</span>
            )}
          </span>
        </div>
      )}
      {candidate.description && (
        <p className="text-[11px] text-muted leading-relaxed line-clamp-2">
          {candidate.description}
        </p>
      )}
    </button>
  );
};

// ── Issue Group ───────────────────────────────────────────────────────────────
const IssueGroup = ({ issueTitle, issueData, priorityLevel, selectedCandidateId, setSelectedCandidateId }) => {
  const [isOpen, setIsOpen] = useState(true);
  const sorted = [...issueData.items].sort((a, b) => b.priorityScore - a.priorityScore);

  return (
    <div className="flex flex-col">
      <button
        className="flex items-center gap-1.5 py-1 px-1 text-left text-[11px] text-muted hover:text-[#CBD5E8] transition-colors"
        onClick={() => setIsOpen(o => !o)}
        title={issueTitle}
      >
        {isOpen
          ? <ChevronDown className="w-3 h-3 shrink-0" />
          : <ChevronRight className="w-3 h-3 shrink-0" />
        }
        <span className="truncate font-medium">{issueTitle}</span>
        <span className="ml-auto text-[10px] shrink-0 text-muted/50">({sorted.length})</span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-0.5 ml-4 mt-0.5">
          {sorted.map(c => (
            <CandidateCard
              key={c.id}
              candidate={c}
              isSelected={selectedCandidateId === c.id}
              onSelect={setSelectedCandidateId}
              priorityLevel={priorityLevel}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Priority Section ──────────────────────────────────────────────────────────
const PrioritySection = ({ priorityLevel, group, selectedCandidateId, setSelectedCandidateId }) => {
  const [isOpen, setIsOpen] = useState(true);
  const meta = PRIORITY_META[priorityLevel] || PRIORITY_META.warning;

  const issuesMap = {};
  group.forEach(c => {
    if (!issuesMap[c.title]) issuesMap[c.title] = { maxScore: 0, items: [] };
    issuesMap[c.title].items.push(c);
    issuesMap[c.title].maxScore = Math.max(issuesMap[c.title].maxScore, c.priorityScore);
  });
  const sortedIssues = Object.entries(issuesMap).sort((a, b) => b[1].maxScore - a[1].maxScore);

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setIsOpen(o => !o)}
        className="flex items-center gap-2 px-1 py-2 text-left group"
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: meta.dot }}
        />
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${meta.text}`}>
          {meta.label}
        </span>
        <span className="ml-1 text-[10px] text-muted/60">({group.length})</span>
        <span className="ml-auto text-muted/40 group-hover:text-muted transition-colors">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-1 mb-2">
          {sortedIssues.map(([issueTitle, issueData]) => (
            <IssueGroup
              key={issueTitle}
              issueTitle={issueTitle}
              issueData={issueData}
              priorityLevel={priorityLevel}
              selectedCandidateId={selectedCandidateId}
              setSelectedCandidateId={setSelectedCandidateId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────
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
        if (data.data?.candidates?.length > 0) {
          setSelectedCandidateId(data.data.candidates[0].id);
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
      <div className="min-h-screen flex items-center justify-center gap-3 bg-surface">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
        <span className="text-muted text-sm">Analyzing Refactoring Candidates...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-surface">
        <AlertTriangle className="w-6 h-6 text-danger" />
        <p className="text-sm text-danger">{error}</p>
        <button onClick={() => navigate(`/explore/${repoId}`)} className="text-xs text-accent hover:underline mt-4">
          ← Back to Explorer
        </button>
      </div>
    );
  }

  const selectedCandidate = intel?.candidates?.find(c => c.id === selectedCandidateId);

  return (
    <div className="flex flex-col h-full bg-surface">
      <ResizableLayout
        panels={[
          {
            id: 'candidates',
            defaultSize: 22,
            minWidth: 220,
            collapsible: true,
            collapseDirection: 'left',
            title: 'Candidates',
            icon: <Wrench />,
            content: (
              <aside className="flex-1 overflow-y-auto p-3 flex flex-col custom-scrollbar bg-panel h-full">
                {(!intel?.candidates || intel.candidates.length === 0) ? (
                  <div className="flex flex-col items-center justify-center p-6 mt-10 text-center gap-3">
                    <CheckCircle className="w-8 h-8 text-success/30 opacity-80" />
                    <p className="text-sm text-muted">No refactoring candidates found.</p>
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-border/30">
                    {['critical', 'high', 'warning'].map(level => {
                      const group = intel.candidates.filter(c => c.priority === level);
                      if (group.length === 0) return null;
                      return (
                        <div key={level} className="py-2">
                          <PrioritySection
                            priorityLevel={level}
                            group={group}
                            selectedCandidateId={selectedCandidateId}
                            setSelectedCandidateId={setSelectedCandidateId}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </aside>
            )
          },
          {
            id: 'details',
            defaultSize: 48,
            minWidth: 300,
            collapsible: false,
            content: (
              <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-surface h-full">
                <div className="px-6 pt-6 shrink-0">
                  <PageHeader 
                    title="Refactoring Intelligence" 
                    description="Automatically prioritize technical debt into actionable candidates. Select a candidate to see its blast radius and request an AI rewrite."
                    icon={Wrench}
                  />
                </div>
                <div className="flex-1 p-6 pt-3">
                  {selectedCandidate ? (
                    <CandidateDetail candidate={selectedCandidate} repoId={repoId} />
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted text-sm">
                      Select a candidate from the sidebar to view details
                    </div>
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
            title: 'AI Advisor',
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

// ── Center Panel ──────────────────────────────────────────────────────────────

function CandidateDetail({ candidate, repoId }) {
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState(null);
  const [fixError, setFixError] = useState(null);

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

  const priorityMeta = PRIORITY_META[candidate.priority] || PRIORITY_META.warning;

  return (
    <div className="max-w-4xl mx-auto w-full flex flex-col gap-5 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between pb-4 border-b border-border">
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-3.5 h-3.5 text-success shrink-0" />
            <span className="text-[11px] font-medium text-success uppercase tracking-wider">Deterministic Finding</span>
            <span
              className={`ml-1 text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${priorityMeta.text}`}
              style={{ borderColor: `${priorityMeta.dot}40`, background: `${priorityMeta.dot}10` }}
            >
              {priorityMeta.label}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-[#CBD5E8] mb-1.5">{candidate.title}</h1>
          <p className="text-sm text-muted leading-relaxed">{candidate.summary}</p>
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          <div className="text-right">
            <div className="text-2xl  font-bold text-[#CBD5E8]">{candidate.priorityScore}</div>
            <div className="text-[10px] text-muted uppercase tracking-wide">Priority Score</div>
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
            className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent/80 disabled:opacity-40 text-[#CBD5E8] rounded text-sm font-medium transition-colors"
          >
            {fixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {fixing ? 'Auto-Fixing...' : 'Auto-Fix with AI'}
          </button>
        </div>
      </div>

      {fixError && (
        <div className="bg-danger/8 border border-danger/25 text-danger text-sm p-3 rounded flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {fixError}
        </div>
      )}

      {fixResult && (
        <div className="border border-success/20 rounded-lg flex flex-col h-[550px] overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-panel flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GitBranch className="w-4 h-4 text-success" />
              <div>
                <div className="text-sm font-medium text-[#CBD5E8]">Suggested Pull Request</div>
                <div className="text-xs  text-muted">{fixResult.file}</div>
              </div>
            </div>
            <button className="bg-success/15 hover:bg-success/25 border border-success/30 text-success px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Approve & Merge
            </button>
          </div>
          <div className="flex-1 min-h-0 relative bg-surface">
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

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-border rounded p-4 min-w-0">
          <h3 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-3">Affected Files</h3>
          <ul className="space-y-1.5">
            {candidate.files.map(f => {
              const range = candidate.fileRanges && candidate.fileRanges[f];
              let url = `/explore/${repoId}/source?path=${encodeURIComponent(f)}`;
              if (range?.startLine && range?.endLine) url += `&line=${range.startLine}-${range.endLine}`;
              return (
                <li key={f} className="flex items-center gap-1.5 min-w-0">
                  <File className="w-3 h-3 shrink-0 text-muted/50" />
                  <Link to={url} className="text-xs  text-accent hover:underline truncate" title={f}>
                    {f}
                    {range?.startLine && (
                      <span className="text-muted/50 ml-1.5">L{range.startLine}–{range.endLine}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border border-border rounded p-4 min-w-0">
          <h3 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Change Impact
          </h3>
          {loading ? (
            <div className="text-xs text-muted flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Calculating...
            </div>
          ) : impact ? (
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-muted">Direct</span>
                <span className="text-sm  font-medium text-[#CBD5E8]">{impact?.directlyAffectedFiles?.length || 0} files</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-muted">Transitive</span>
                <span className="text-sm  font-medium text-[#CBD5E8]">{impact?.transitivelyAffectedFiles?.length || 0} files</span>
              </div>
              {impact?.affectedComponents?.length > 0 && (
                <div>
                  <span className="text-xs text-muted block mb-1.5">Components</span>
                  <div className="flex flex-wrap gap-1">
                    {impact.affectedComponents.map(c => (
                      <span key={c} className="text-[10px] px-1.5 py-0.5 bg-surface rounded border border-border text-muted">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-danger">Failed to load impact</div>
          )}
        </div>
      </div>

      {/* Strategies */}
      {candidate.suggestedStrategies?.length > 0 && (
        <div className="border border-border rounded p-4">
          <h3 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-4">Deterministic Strategies</h3>
          <div className="space-y-5">
            {candidate.suggestedStrategies.map((strat, idx) => (
              <div key={idx} className="border-l-2 border-border pl-4">
                <h4 className="text-sm font-semibold text-[#CBD5E8] mb-1">{strat.action}</h4>
                <p className="text-sm text-muted mb-3 leading-relaxed">{strat.description}</p>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-success font-medium mb-1.5 block">Expected Benefits</span>
                    <ul className="space-y-0.5 text-muted">
                      {strat.expectedBenefits?.map((b, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-1 w-1 h-1 rounded-full bg-success/60 shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="text-warning font-medium mb-1.5 block">Risks</span>
                    <ul className="space-y-0.5 text-muted">
                      {strat.risks?.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-1 w-1 h-1 rounded-full bg-warning/60 shrink-0" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer meta */}
      <div className="flex items-center gap-6 text-xs text-muted pt-2 border-t border-border">
        <span>Severity: <span className="text-[#CBD5E8] uppercase">{candidate.severity}</span></span>
        <span>Confidence: <span className="text-[#CBD5E8] uppercase">{candidate.confidence}</span></span>
      </div>
    </div>
  );
}

// ── Right Panel ───────────────────────────────────────────────────────────────

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

  useEffect(() => {
    setInsights(null);
    setLoading(false);
  }, [candidate.id]);

  return (
    <div className="flex flex-col h-full bg-panel">
      <div className="h-10 flex items-center px-4 border-b border-border shrink-0 gap-2">
        <Brain className="w-3.5 h-3.5 text-muted" />
        <span className="text-xs text-muted uppercase tracking-wider">AI Refactoring Advisor</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!insights && !loading && (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
            <p className="text-sm text-muted">Generate a customized AI refactoring strategy for this candidate.</p>
            <button
              onClick={loadInsights}
              className="px-4 py-2 border border-accent/30 text-accent hover:bg-accent/8 rounded transition-colors text-sm"
            >
              Generate AI Strategy
            </button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted">
            <Loader2 className="w-5 h-5 text-accent animate-spin" />
            <span className="text-xs">Analyzing candidate...</span>
          </div>
        )}

        {!loading && insights?.error && (
          <div className="text-xs text-danger p-3 bg-danger/8 border border-danger/20 rounded">
            {insights.error}
          </div>
        )}

        {!loading && insights && !insights.error && (
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
        )}
      </div>
    </div>
  );
}
