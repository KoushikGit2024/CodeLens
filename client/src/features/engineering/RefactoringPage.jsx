/**
 * RefactoringPage.jsx
 *
 * It initiates the technical debt dashboard, then extracts deterministic refactoring candidates,
 * and then it applies them to a prioritized triage interface.
 */
import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Layers,
  GitBranch,
  Search,
  Database,
  Brain,
  Loader2,
  CheckCircle,
  Sparkles,
  Wrench,
  ChevronDown,
  ChevronRight,
  File,
  RefreshCw,
  AlertCircle,
  X,
} from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { useToast } from '../../shared/context/ToastContext';
import { useAIState } from '../../shared/context/AIContext';
import { useRepository } from '../../shared/context/RepositoryContext';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import PageHeader from '../../shared/components/PageHeader';
import OpenSourceButton from '../../shared/components/OpenSourceButton';
import { makeSourceRef, tryMakeSourceRef } from '../../shared/navigation/sourceRef';

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

const formatCategory = category => {
  if (!category) return 'General';
  return category
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^./, str => str.toUpperCase());
};

// ── Code Peek ─────────────────────────────────────────────────────────────────
const CodePeek = ({ repoId, filePath, startLine, endLine }) => {
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    async function loadCode() {
      try {
        const res = await repositoryApi.getFile(repoId, filePath);
        if (res?.data?.content) {
          const lines = res.data.content.split('\n');
          // Bound lines safely
          const s = Math.max(1, startLine || 1);
          const e = Math.min(lines.length, endLine || s + 10);

          const sliced = lines.slice(s - 1, e).join('\n');
          setCode({ snippet: sliced, startLine: s });
        }
      } catch (err) {
        console.error('Failed to load code peek:', err);
      } finally {
        setLoading(false);
      }
    }
    loadCode();
  }, [repoId, filePath, startLine, endLine]);

  if (loading)
    return <div className="text-[10px] text-muted/50 p-2 animate-pulse bg-panel/50 rounded">Loading snippet...</div>;
  if (!code) return null;

  return (
    <div className="mt-2 rounded overflow-hidden border border-border/50 bg-surface">
      <button
        onClick={() => setIsExpanded(o => !o)}
        className="w-full bg-panel hover:bg-surface/80 transition-colors px-3 py-1.5 flex justify-between items-center border-b border-border/50"
      >
        <span className="text-[9px] uppercase tracking-wider text-muted font-semibold flex items-center gap-1.5">
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <File className="w-3 h-3" /> Code Peek
        </span>
        <span className="text-[9px] text-muted/60 font-mono">
          Lines {code.startLine}-{code.startLine + code.snippet.split('\n').length - 1}
        </span>
      </button>
      {isExpanded && (
        <pre className="p-3 overflow-auto max-h-[300px] custom-scrollbar text-[11px] font-mono leading-relaxed text-text bg-surface">
          <code>{code.snippet}</code>
        </pre>
      )}
    </div>
  );
};

// ── Candidate Card ────────────────────────────────────────────────────────────
/**
 * It evaluates the priority level, then extracts the specific styling metadata,
 * and then it applies them to render the interactive list item.
 */
const CandidateCard = ({ candidate, isSelected, onSelect, priorityLevel }) => {
  const meta = PRIORITY_META[priorityLevel] || PRIORITY_META.warning;
  return (
    <button
      onClick={() => onSelect(candidate.id)}
      className={`w-full text-left px-3 py-2.5 rounded border transition-all duration-150
        ${isSelected ? `${meta.selectedBg} ${meta.selectedBorder} border` : `border-transparent ${meta.bg}`}
      `}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className=" text-[10px] font-semibold text-muted tracking-wide">Score {candidate.priorityScore}</span>
        <span className="text-[9px] uppercase tracking-widest text-muted/60">{formatCategory(candidate.type)}</span>
      </div>
      {candidate.files?.length > 0 && (
        <div className="flex items-center gap-1.5 mb-1" onClick={e => e.stopPropagation()}>
          <OpenSourceButton
            ref={makeSourceRef({ filePath: candidate.files[0] })}
            label={candidate.files[0].split('/').pop()}
            className="text-[12px] font-medium text-text truncate hover:text-accent"
          />
          {candidate.files.length > 1 && (
            <span className="text-muted text-[12px] font-normal shrink-0">+{candidate.files.length - 1}</span>
          )}
        </div>
      )}
      {candidate.summary && <p className="text-[11px] text-muted leading-relaxed line-clamp-2">{candidate.summary}</p>}
    </button>
  );
};

// ── Issue Group ───────────────────────────────────────────────────────────────
/**
 * It sorts the candidate array, then extracts the grouped issues,
 * and then it applies a collapsible UI section for navigation.
 */
const IssueGroup = ({ issueTitle, issueData, priorityLevel, selectedCandidateId, setSelectedCandidateId }) => {
  const [isOpen, setIsOpen] = useState(true);
  const sorted = [...issueData.items].sort((a, b) => b.priorityScore - a.priorityScore);

  return (
    <div className="flex flex-col">
      <button
        className="flex items-center gap-1.5 py-1 px-1 text-left text-[11px] text-muted hover:text-text transition-colors"
        onClick={() => setIsOpen(o => !o)}
        title={issueTitle}
      >
        {isOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <span className="truncate font-medium">{issueTitle}</span>
        <span className="ml-auto text-[10px] shrink-0 text-muted/50">({sorted.length})</span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-0.5 ml-4 mt-0.5">
          {sorted.map((c, index) => (
            <CandidateCard
              key={`${c.id}-${index}`}
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
/**
 * It maps over the priority clusters, then extracts maximum severity scores,
 * and then it applies a descending sort for the sidebar groups.
 */
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
      <button onClick={() => setIsOpen(o => !o)} className="flex items-center gap-2 px-1 py-2 text-left group">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.dot }} />
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${meta.text}`}>{meta.label}</span>
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
/**
 * It triggers the offline refactoring intelligence endpoint, then extracts the deterministic candidates,
 * and then it applies them to the resizable triage layout.
 */
export default function RefactoringPage() {
  const { repoId } = useParams();
  const navigate = useNavigate();

  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const { repo, livePhase } = useRepository();
  const isGloballyAnalyzing = !!livePhase || repo?.status === 'analyzing';
  const [searchParams, setSearchParams] = useSearchParams();

  // ── URL-synced UI State ──
  const selectedCandidateId = searchParams.get('candidate');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(!selectedCandidateId);
  const [mobileTab, setMobileTab] = useState('details');

  const setSelectedCandidateId = val => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) next.set('candidate', val);
      else next.delete('candidate');
      return next;
    });
    if (isMobile) setMobileDrawerOpen(false);
  };

  const searchQuery = searchParams.get('search') || '';
  const setSearchQuery = val => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (val) next.set('search', val);
        else next.delete('search');
        return next;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const data = await repositoryApi.getRefactoringIntelligence(repoId);
        setIntel(data.data);
        const currentCandidate = new URLSearchParams(window.location.search).get('candidate');
        // Do not auto-select on mobile so they can see the list first
        if (data.data?.candidates?.length > 0 && !currentCandidate && window.innerWidth >= 1024) {
          setSearchParams(
            prev => {
              const next = new URLSearchParams(prev);
              next.set('candidate', data.data.candidates[0].id);
              return next;
            },
            { replace: true }
          );
        }
      } catch (err) {
        setError(err?.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [repoId]);

  // ── Derived data — MUST stay above early returns to satisfy Rules of Hooks ──
  const selectedCandidate = intel?.candidates?.find(c => c.id === selectedCandidateId);

  const filteredCandidates = useMemo(() => {
    if (!intel?.candidates) return [];
    if (!searchQuery.trim()) return intel.candidates;
    const q = searchQuery.toLowerCase();
    return intel.candidates.filter(
      c =>
        c.title?.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q) ||
        c.files?.some(f => f.toLowerCase().includes(q))
    );
  }, [intel?.candidates, searchQuery]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3 bg-surface">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
        <span className="text-muted text-sm">Analyzing Refactoring Candidates...</span>
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
          description: err.message || 'An error occurred while trying to reanalyze.',
          type: 'error',
        });
        setIsReanalyzing(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8 bg-surface rounded-lg shadow border border-text/10 max-w-md w-full">
          <AlertCircle className="w-10 h-10 text-danger mx-auto mb-4 opacity-80" />
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
                {(isReanalyzing || isGloballyAnalyzing) ? (
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

  const candidatesList = (
    <aside className="flex-1 overflow-y-auto p-3 flex flex-col custom-scrollbar bg-panel h-full">
      {/* Search bar */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search candidates..."
          className="w-full bg-surface border border-border rounded pl-8 pr-7 py-1.5 text-xs text-text placeholder-muted/60 focus:outline-none focus:border-accent/50 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {filteredCandidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-6 mt-10 text-center gap-3">
          {searchQuery ? (
            <>
              <Search className="w-8 h-8 text-muted/30" />
              <p className="text-sm text-muted">No candidates match "{searchQuery}"</p>
            </>
          ) : (
            <>
              <CheckCircle className="w-8 h-8 text-success/30 opacity-80" />
              <p className="text-sm text-muted">No refactoring candidates found.</p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/30">
          {['critical', 'high', 'warning'].map(level => {
            const group = filteredCandidates.filter(c => c.priority === level);
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
  );

  const detailsContent = (
    <>
      <div className="px-6 pt-6 shrink-0">
        <PageHeader
          title="Refactoring Intelligence"
          description="Automatically prioritize technical debt into actionable candidates. Select a candidate to see its blast radius and request an AI rewrite."
          icon={Wrench}
        />
      </div>
      <div className="flex-1 p-6 pt-3">
        {selectedCandidate ? (
          <CandidateDetail
            candidate={selectedCandidate}
            repoId={repoId}
            allCandidates={intel.candidates}
            onSelectCandidate={setSelectedCandidateId}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted text-sm">
            Select a candidate from the sidebar to view details
          </div>
        )}
      </div>
    </>
  );

  const detailsPane = (
    <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-surface h-full">{detailsContent}</main>
  );

  const advisorPane = (
    <aside className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-panel h-full">
      {selectedCandidate && <AiAdvisor candidate={selectedCandidate} repoId={repoId} />}
    </aside>
  );

  if (isMobile) {
    return (
      <div className="relative flex flex-col h-full bg-surface overflow-hidden">
        {/* Main Scrolling View */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
          <div className="px-6 pt-6 shrink-0">
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="mb-4 flex items-center gap-2 px-3 py-1.5 bg-panel border border-border hover:bg-surface text-text rounded text-xs transition-colors w-fit shadow-sm"
            >
              <Layers className="w-4 h-4" /> View Candidates
            </button>
            <PageHeader
              title="Refactoring Intelligence"
              description="Automatically prioritize technical debt into actionable candidates."
              icon={Wrench}
            />
            {selectedCandidate && (
              <div className="flex items-center gap-6 border-b border-border mt-4">
                <button
                  onClick={() => setMobileTab('details')}
                  className={`pb-3 text-sm font-medium transition-colors border-b-2 ${mobileTab === 'details' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'}`}
                >
                  Details
                </button>
                <button
                  onClick={() => setMobileTab('advisor')}
                  className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${mobileTab === 'advisor' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'}`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> AI Advisor
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 p-6 pt-4 flex flex-col">
            {!selectedCandidate ? (
              <div className="h-full flex items-center justify-center text-muted text-sm">
                Select a candidate from the sidebar to view details
              </div>
            ) : mobileTab === 'details' ? (
              <CandidateDetail
                candidate={selectedCandidate}
                repoId={repoId}
                allCandidates={intel.candidates}
                onSelectCandidate={setSelectedCandidateId}
              />
            ) : (
              <div className="flex-1 min-h-[500px] bg-panel rounded-lg border border-border overflow-hidden">
                <AiAdvisor candidate={selectedCandidate} repoId={repoId} />
              </div>
            )}
          </div>
        </div>

        {/* Drawer Backdrop */}
        {mobileDrawerOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />
        )}

        {/* Drawer Panel */}
        <div
          className={`absolute top-0 bottom-0 left-0 z-50 w-[85%] max-w-[320px] bg-panel border-r border-border shadow-2xl transition-transform duration-300 ease-in-out ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {candidatesList}
        </div>
      </div>
    );
  }

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
            content: candidatesList,
          },
          {
            id: 'details',
            defaultSize: 48,
            minWidth: 300,
            collapsible: false,
            content: detailsPane,
          },
          {
            id: 'advisor',
            defaultSize: 30,
            minWidth: 250,
            collapsible: true,
            collapseDirection: 'right',
            title: 'AI Advisor',
            icon: <Sparkles />,
            content: advisorPane,
          },
        ]}
      />
    </div>
  );
}

// ── Center Panel ──────────────────────────────────────────────────────────────
/**
 * It fetches the change impact payload, then extracts the directly affected files,
 * and then it applies them alongside the suggested strategies for manual or AI review.
 */
function CandidateDetail({ candidate, repoId, allCandidates, onSelectCandidate }) {
  const navigate = useNavigate();
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState(null);
  const [fixError, setFixError] = useState(null);

  const [generatingTests, setGeneratingTests] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);

  const { aiState } = useAIState();

  useEffect(() => {
    setFixResult(null);
    setFixError(null);
    setTestResult(null);
    setTestError(null);
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
          <h1 className="text-xl font-semibold text-text mb-1.5">{candidate.title}</h1>
          <p className="text-sm text-muted leading-relaxed">{candidate.summary}</p>
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          <div className="text-right">
            <div className="text-2xl  font-bold text-text">{candidate.priorityScore}</div>
            <div className="text-[10px] text-muted uppercase tracking-wide">Priority Score</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (aiState.authState === 'unauthenticated') {
                  navigate('/auth/signin');
                  return;
                }
                setGeneratingTests(true);
                setTestError(null);
                try {
                  const res = await repositoryApi.generateTestsRefactoringCandidate(repoId, candidate.id);
                  setTestResult(res.data);
                } catch (err) {
                  setTestError(err?.response?.data?.error || err.message);
                } finally {
                  setGeneratingTests(false);
                }
              }}
              disabled={
                generatingTests ||
                !!testResult ||
                aiState.status === 'loading' ||
                (aiState.authState !== 'unauthenticated' &&
                  (aiState.status === 'offline' || aiState.quotaStatus === 'exhausted'))
              }
              title="Generate a baseline test suite before refactoring"
              className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border hover:bg-panel disabled:opacity-40 text-text rounded text-sm font-medium transition-colors"
            >
              {generatingTests ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Database className="w-4 h-4 text-accent" />
              )}
              {generatingTests ? 'Writing Tests...' : 'Generate Tests First'}
            </button>
            <button
              onClick={async () => {
                if (aiState.authState === 'unauthenticated') {
                  navigate('/auth/signin');
                  return;
                }
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

              disabled={
                fixing ||
                !!fixResult ||
                aiState.status === 'loading' ||
                (aiState.authState !== 'unauthenticated' &&
                  (aiState.status === 'offline' || aiState.quotaStatus === 'exhausted'))
              }
              title={
                aiState.status === 'offline'
                  ? 'No AI provider configured'
                  : aiState.quotaStatus === 'exhausted'
                    ? 'AI quota exceeded'
                    : ''
              }
              className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent/80 disabled:opacity-40 text-text rounded text-sm font-medium transition-colors"
            >
              {fixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {fixing
                ? 'Auto-Fixing...'
                : aiState.authState === 'unauthenticated'
                  ? 'Sign in to Auto-Fix'
                  : 'Auto-Fix with AI'}
            </button>
          </div>
        </div>
      </div>

      {testError && (
        <div className="bg-danger/8 border border-danger/25 text-danger text-sm p-3 rounded flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {testError}
        </div>
      )}

      {fixError && (
        <div className="bg-danger/8 border border-danger/25 text-danger text-sm p-3 rounded flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {fixError}
        </div>
      )}

      {testResult && (
        <div className="border border-accent/30 rounded-lg flex flex-col h-[400px] overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-border bg-panel flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-4 h-4 text-accent" />
              <div>
                <div className="text-sm font-medium text-text">Baseline Test Suite Generated</div>
                <div className="text-xs  text-muted">Target: {testResult.file}</div>
              </div>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(testResult.testCode);
              }}
              className="bg-surface hover:bg-panel border border-border px-3 py-1.5 rounded text-xs font-medium transition-colors"
            >
              Copy Test Code
            </button>
          </div>
          <div className="flex-1 min-h-0 relative bg-surface p-4 overflow-auto">
            <pre className="text-xs font-mono text-[#d4d4d4] leading-relaxed">
              <code>{testResult.testCode}</code>
            </pre>
          </div>
        </div>
      )}

      {fixResult && (
        <div className="border border-success/20 rounded-lg flex flex-col h-[550px] overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-panel flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GitBranch className="w-4 h-4 text-success" />
              <div>
                <div className="text-sm font-medium text-text">Suggested Pull Request</div>
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
                lineNumbersMinChars: 3,
              }}
            />
          </div>
        </div>
      )}

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-border rounded p-4 min-w-0">
          <h3 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-3">
            Affected Files & Evidence
          </h3>
          <div className="space-y-3">
            {[...(candidate.files || [])]
              .filter(Boolean)
              .sort((a, b) => {
                if (a === candidate.mainFile) return -1;
                if (b === candidate.mainFile) return 1;
                return a.localeCompare(b);
              })
              .map(f => {
                const range = candidate.fileRanges && candidate.fileRanges[f];
                const isMain = candidate.mainFile === f;
                const ref = tryMakeSourceRef({ filePath: f, startLine: range?.startLine, endLine: range?.endLine });
                const ev = candidate.evidence;
                console.log(
                  'Rendering candidate file:',
                  f,
                  'isMain:',
                  isMain,
                  'type:',
                  candidate.type,
                  'evidence:',
                  ev
                );

                return (
                  <div key={f} className="flex flex-col gap-2 min-w-0 p-3 bg-panel border border-border/50 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <File className="w-3.5 h-3.5 text-muted shrink-0" />
                      {ref ? (
                        <OpenSourceButton
                          ref={ref}
                          variant="button"
                          className="flex-1 truncate text-xs justify-start hover:text-accent transition-colors"
                        />
                      ) : (
                        <span className="text-xs font-mono text-muted truncate flex-1">{f}</span>
                      )}
                      {isMain && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold uppercase tracking-wider shrink-0 border border-accent/20">
                          Target
                        </span>
                      )}
                    </div>

                    {/* Evidence Block */}
                    {ev && (isMain || candidate.type === 'DEPENDENCY' || candidate.type === 'QUALITY') && (
                      <div className="mt-1 pl-5">
                        {candidate.type === 'QUALITY' && ev.instances && isMain && (
                          <div className="space-y-1.5">
                            {ev.instances.map((inst, i) => (
                              <div
                                key={i}
                                className="text-[11px] bg-surface/80 border border-border/50 px-2 py-1.5 rounded flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="text-muted/80">{inst.kind}:</span>
                                  <span className="font-mono text-text truncate">{inst.name}</span>
                                </div>
                                {inst.complexity && (
                                  <span className="text-warning font-medium shrink-0 ml-3">
                                    Score: {inst.complexity}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {candidate.type === 'QUALITY' &&
                          ev.count &&
                          ev.instances &&
                          !isMain &&
                          candidate.title.includes('Clone') && (
                            <div className="text-[11px] text-muted bg-surface/50 px-2 py-1.5 rounded border border-border/30">
                              Clone detected in this file.
                            </div>
                          )}

                        {candidate.type === 'SIZE' && isMain && (
                          <div className="text-[11px] bg-surface/80 border border-border/50 px-2 py-1.5 rounded grid grid-cols-2 gap-2">
                            {ev.lineCount && (
                              <div>
                                <span className="text-muted">Lines:</span>{' '}
                                <span className="text-warning font-medium">{ev.lineCount}</span>
                              </div>
                            )}
                            {ev.complexity && (
                              <div>
                                <span className="text-muted">Complexity:</span>{' '}
                                <span className="text-warning font-medium">{ev.complexity}</span>
                              </div>
                            )}
                            {ev.exportCount && (
                              <div>
                                <span className="text-muted">Exports:</span>{' '}
                                <span className="text-warning font-medium">{ev.exportCount}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {candidate.type === 'COUPLING' && isMain && (
                          <div className="text-[11px] bg-surface/80 border border-border/50 px-2 py-1.5 rounded flex gap-4">
                            {ev.fanIn && (
                              <div>
                                <span className="text-muted">Dependent Files (Fan-In):</span>{' '}
                                <span className="text-warning font-medium ml-1">{ev.fanIn}</span>
                              </div>
                            )}
                            {ev.fanOut && (
                              <div>
                                <span className="text-muted">Dependencies (Fan-Out):</span>{' '}
                                <span className="text-warning font-medium ml-1">{ev.fanOut}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {candidate.type === 'DEPENDENCY' && ev.cyclePath && isMain && (
                          <div className="text-[10px] bg-danger/5 border border-danger/20 px-2 py-1.5 rounded text-danger font-mono break-all leading-relaxed">
                            {ev.cyclePath.join(' → ')}
                          </div>
                        )}

                        {candidate.type === 'ARCHITECTURE' && isMain && (
                          <div className="text-[11px] bg-surface/80 border border-border/50 px-2 py-1.5 rounded">
                            <span className="text-muted">Violated Rule:</span>{' '}
                            <span className="text-warning font-mono ml-1">{ev.ruleId}</span>
                          </div>
                        )}

                        {candidate.type === 'CHURN' && isMain && (
                          <div className="text-[11px] bg-surface/80 border border-border/50 px-2 py-1.5 rounded flex gap-4">
                            {ev.churnScore && (
                              <div>
                                <span className="text-muted">Churn Score:</span>{' '}
                                <span className="text-warning font-medium ml-1">{ev.churnScore.toFixed(1)}/100</span>
                              </div>
                            )}
                            {ev.commitsModified && (
                              <div>
                                <span className="text-muted">Commits:</span>{' '}
                                <span className="text-text font-medium ml-1">{ev.commitsModified}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {range?.startLine && !ev?.instances && (
                      <div className="mt-2 pl-5">
                        <CodePeek repoId={repoId} filePath={f} startLine={range.startLine} endLine={range.endLine} />
                      </div>
                    )}
                    {candidate.type === 'QUALITY' && ev?.instances && isMain && (
                      <div className="mt-2 pl-5 flex flex-col gap-2">
                        {ev.instances.slice(0, 3).map((inst, i) => (
                          <CodePeek
                            key={i}
                            repoId={repoId}
                            filePath={f}
                            startLine={inst.location?.startLine || range?.startLine}
                            endLine={inst.location?.endLine || range?.endLine}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
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
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs text-muted">Direct Dependencies</span>
                  <span className="text-sm font-medium text-text">
                    {impact?.directlyAffectedFiles?.length || 0} files
                  </span>
                </div>
                {impact?.directlyAffectedFiles?.length > 0 && (
                  <div className="max-h-[120px] overflow-auto custom-scrollbar bg-surface/50 rounded border border-border/40 p-2 flex flex-col items-start">
                    {impact.directlyAffectedFiles.map(f => {
                      const ref = tryMakeSourceRef({ filePath: f });
                      if (ref) {
                        return (
                          <OpenSourceButton
                            key={f}
                            ref={ref}
                            label={f.split('/').pop()}
                            variant="button"
                            className="text-[10px] font-mono text-muted/80 truncate mb-1 last:mb-0 hover:text-accent transition-colors text-left"
                            title={f}
                          />
                        );
                      }
                      return (
                        <div key={f} className="text-[10px] font-mono text-muted/80 truncate mb-1 last:mb-0" title={f}>
                          {f.split('/').pop()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs text-muted">Transitive (Indirect)</span>
                  <span className="text-sm font-medium text-text">
                    {impact?.transitivelyAffectedFiles?.length || 0} files
                  </span>
                </div>
                {impact?.transitivelyAffectedFiles?.length > 0 && (
                  <div className="max-h-[120px] overflow-auto custom-scrollbar bg-surface/50 rounded border border-border/40 p-2 flex flex-col items-start">
                    {impact.transitivelyAffectedFiles.map(f => {
                      const ref = tryMakeSourceRef({ filePath: f });
                      if (ref) {
                        return (
                          <OpenSourceButton
                            key={f}
                            ref={ref}
                            label={f.split('/').pop()}
                            variant="button"
                            className="text-[10px] font-mono text-muted/80 truncate mb-1 last:mb-0 hover:text-accent transition-colors text-left"
                            title={f}
                          />
                        );
                      }
                      return (
                        <div key={f} className="text-[10px] font-mono text-muted/80 truncate mb-1 last:mb-0" title={f}>
                          {f.split('/').pop()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {impact?.affectedComponents?.length > 0 && (
                <div>
                  <span className="text-xs text-muted block mb-1.5">Components</span>
                  <div className="flex flex-wrap gap-1">
                    {impact.affectedComponents.map(c => (
                      <span
                        key={c}
                        className="text-[10px] px-1.5 py-0.5 bg-surface rounded border border-border text-muted"
                      >
                        {c}
                      </span>
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
        <div className="flex flex-col gap-3">
          <h3 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" /> Action Plan
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {candidate.suggestedStrategies.map((strat, idx) => (
              <div
                key={idx}
                className="bg-panel border border-border/50 rounded-xl overflow-hidden shadow-sm group hover:border-accent/30 transition-colors"
              >
                <div className="bg-surface/50 px-4 py-3 border-b border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-bold shrink-0">
                      {idx + 1}
                    </div>
                    <h4 className="text-sm font-semibold text-text">{strat.action}</h4>
                  </div>
                </div>

                <div className="p-4">
                  <p className="text-[13px] text-muted mb-4 leading-relaxed">{strat.description}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px]">
                    <div className="bg-success/5 border border-success/10 rounded-lg p-3">
                      <span className="text-success font-medium mb-2 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                        <CheckCircle className="w-3 h-3" /> Expected Benefits
                      </span>
                      <ul className="space-y-1.5 text-muted/90">
                        {strat.expectedBenefits?.map((b, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="mt-1 w-1 h-1 rounded-full bg-success/40 shrink-0" />
                            <span className="leading-tight">{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-warning/5 border border-warning/10 rounded-lg p-3">
                      <span className="text-warning font-medium mb-2 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                        <AlertTriangle className="w-3 h-3" /> Potential Risks
                      </span>
                      <ul className="space-y-1.5 text-muted/90">
                        {strat.risks?.map((r, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="mt-1 w-1 h-1 rounded-full bg-warning/40 shrink-0" />
                            <span className="leading-tight">{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer meta */}
      <div className="flex items-center gap-6 text-xs text-muted pt-2 border-t border-border mt-2">
        <span>
          Severity: <span className="text-text uppercase">{candidate.severity}</span>
        </span>
        <span>
          Confidence: <span className="text-text uppercase">{candidate.confidence}</span>
        </span>
      </div>

      {/* Other Issues in this File */}
      {allCandidates &&
        candidate.mainFile &&
        (() => {
          const otherIssues = allCandidates.filter(c => c.id !== candidate.id && c.files?.includes(candidate.mainFile));

          if (otherIssues.length === 0) return null;

          return (
            <div className="mt-6 border-t border-border pt-6">
              <h3 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-3">
                Other Issues in {candidate.mainFile.split('/').pop()}
              </h3>
              <div className="flex flex-col gap-2">
                {otherIssues.map(other => (
                  <button
                    key={other.id}
                    onClick={() => onSelectCandidate && onSelectCandidate(other.id)}
                    className="flex items-center justify-between p-3 bg-panel border border-border/50 rounded-lg hover:border-accent/40 transition-colors text-left group"
                  >
                    <div>
                      <div className="text-sm font-semibold text-text group-hover:text-accent transition-colors">
                        {other.title}
                      </div>
                      <div className="text-[11px] text-muted line-clamp-1 mt-0.5">{other.summary}</div>
                    </div>
                    <div className="flex flex-col items-end shrink-0 ml-4">
                      <span className="text-xs font-bold text-text">{other.priorityScore}</span>
                      <span className="text-[9px] uppercase text-muted tracking-widest">{other.priority}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
    </div>
  );
}

// ── Right Panel ───────────────────────────────────────────────────────────────
/**
 * It queries the AI proxy, then extracts the generated refactoring strategy,
 * and then it applies the markdown response to the advisor panel.
 */
function AiAdvisor({ candidate, repoId }) {
  const navigate = useNavigate();
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const { aiState } = useAIState();

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
              onClick={() => {
                if (aiState.authState === 'unauthenticated') {
                  navigate('/auth/signin');
                  return;
                }
                loadInsights();
              }}
              disabled={
                aiState.status === 'loading' ||
                (aiState.authState !== 'unauthenticated' &&
                  (aiState.status === 'offline' || aiState.quotaStatus === 'exhausted'))
              }
              title={
                aiState.status === 'offline'
                  ? 'No AI provider configured'
                  : aiState.quotaStatus === 'exhausted'
                    ? 'AI quota exceeded'
                    : ''
              }
              className="px-4 py-2 border border-accent/30 text-accent hover:bg-accent/8 rounded transition-colors text-sm disabled:opacity-50"
            >
              {aiState.authState === 'unauthenticated' ? 'Sign in to Generate Strategy' : 'Generate AI Strategy'}
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
          <div className="text-xs text-danger p-3 bg-danger/8 border border-danger/20 rounded">{insights.error}</div>
        )}

        {!loading && insights && !insights.error && (
          <AiResponse
            repoId={repoId}
            chatId={`refactor-${candidate.id}`}
            data={{
              summary: insights.summary,
              recommendations:
                insights.recommendations?.map(rec => {
                  let md = `**${rec.strategy}**\n${rec.reasoning}`;
                  if (rec.steps?.length > 0) {
                    md += `\n\n*Execution Steps:*\n` + rec.steps.map(s => `- ${s}`).join('\n');
                  }
                  return md;
                }) || [],
              risks: insights.limitations || [],
              references: insights.recommendations?.flatMap(r => r.references || []) || [],
            }}
            title={null}
          />
        )}
      </div>
    </div>
  );
}
