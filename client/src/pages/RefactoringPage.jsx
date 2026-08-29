import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ChevronLeft, AlertTriangle, Layers, GitBranch, 
  Database, Brain, Activity, File, Loader2, ArrowRight, CheckCircle, LayoutDashboard
} from 'lucide-react';
import { Panel, Group as PanelGroup } from 'react-resizable-panels';
import AIStatusIndicator from '../components/AIStatusIndicator';
import { PanelResizer } from '../components/PanelResizer';
import { 
  getRefactoringIntelligence, 
  getRefactoringImpact, 
  getRefactoringInsights 
} from '../api';

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
        const data = await getRefactoringIntelligence(repoId);
        setIntel(data);
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

  const selectedCandidate = intel?.candidates?.find(c => c.id === selectedCandidateId);

  return (
    <PanelGroup direction="horizontal" className="h-full w-full">
          {/* Left Panel — Candidate List */}
          <Panel defaultSize={20} minSize={15} className="bg-panel flex flex-col">
            <aside className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
          <p className="text-xs text-muted uppercase tracking-wider mb-2 px-1">Candidates by Priority</p>
          
          {intel?.candidates?.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCandidateId(c.id)}
              className={`text-left p-3 rounded border transition-colors ${
                selectedCandidateId === c.id 
                  ? 'bg-accent/10 border-accent/40' 
                  : 'bg-surface/30 border-border hover:border-white/20'
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  c.priority === 'critical' ? 'bg-danger/20 text-danger' :
                  c.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {c.priority}
                </span>
                <span className="text-[10px] text-muted font-mono">Score {c.priorityScore}</span>
              </div>
              <h3 className="text-sm font-medium text-white/90 truncate leading-snug">{c.title}</h3>
              <p className="text-[11px] text-muted mt-1 truncate">{c.type}</p>
            </button>
          ))}
          {(!intel?.candidates || intel.candidates.length === 0) && (
            <div className="flex flex-col items-center justify-center p-6 mt-10 text-center gap-3">
              <CheckCircle className="w-8 h-8 text-success opacity-80" />
              <p className="text-sm text-muted">No high-priority refactoring candidates found.</p>
            </div>
          )}
            </aside>
          </Panel>

          <PanelResizer />

          {/* Center Panel — Deterministic Details & Impact */}
          <Panel defaultSize={50} minSize={30} className="bg-surface/50 flex flex-col">
            <main className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col">
          {selectedCandidate ? (
            <CandidateDetail candidate={selectedCandidate} repoId={repoId} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted">Select a candidate to view details</div>
          )}
            </main>
          </Panel>

          <PanelResizer />

          {/* Right Panel — AI Advisor */}
          <Panel defaultSize={30} minSize={20} className="bg-panel flex flex-col">
            <aside className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
          {selectedCandidate && (
             <AiAdvisor candidate={selectedCandidate} repoId={repoId} />
          )}
            </aside>
          </Panel>
    </PanelGroup>
  );
}

// ── Center Panel ─────────────────────────────────────────────────────────────

function CandidateDetail({ candidate, repoId }) {
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadImpact() {
      setLoading(true);
      try {
        const data = await getRefactoringImpact(repoId, candidate.id);
        setImpact(data);
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
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-2xl font-mono font-bold text-white">{candidate.priorityScore}</span>
          <span className="text-[10px] text-muted uppercase">Priority Score</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-panel border border-border rounded p-4">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Affected Files</h3>
          <ul className="space-y-1.5">
            {candidate.files.map(f => (
              <li key={f} className="text-sm font-mono text-accent truncate">
                <Link to={`/explore/${repoId}?path=${encodeURIComponent(f)}`} className="hover:underline">
                  {f}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="bg-panel border border-border rounded p-4">
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
                <div className="text-sm font-medium text-white">{impact.directlyAffectedFiles.length} files</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Transitive Dependents</div>
                <div className="text-sm font-medium text-white">{impact.transitivelyAffectedFiles.length} files</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Affected Components</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {impact.affectedComponents.length > 0 ? impact.affectedComponents.map(c => (
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
                      {strat.expectedBenefits.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                  <div>
                    <span className="text-orange-400 font-medium mb-1 block">Risks</span>
                    <ul className="list-disc list-inside text-white/60 space-y-0.5">
                      {strat.risks.map((r, i) => <li key={i}>{r}</li>)}
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setInsights(null);
      try {
        const data = await getRefactoringInsights(repoId, candidate.id);
        setInsights(data);
      } catch (err) {
        setInsights({ error: err?.response?.data?.error || err.message });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [repoId, candidate.id]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e]/40">
      <div className="p-4 border-b border-border bg-panel flex items-center gap-2 shrink-0">
        <Brain className="w-4 h-4 text-[#cba6f7]" />
        <span className="text-sm font-medium text-[#cba6f7]">AI Refactoring Advisor</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
          <>
            <div>
               <h4 className="text-[10px] uppercase font-bold text-muted tracking-wider mb-2">AI Summary</h4>
               <p className="text-sm text-white/90 leading-relaxed">{insights.summary}</p>
            </div>

            {insights.recommendations?.map((rec, idx) => (
              <div key={idx} className="bg-panel border border-border rounded p-3">
                <h4 className="text-sm font-semibold text-[#cba6f7] mb-2">{rec.strategy}</h4>
                <p className="text-xs text-white/80 leading-relaxed mb-3">{rec.reasoning}</p>
                
                <div className="mb-3">
                  <h5 className="text-[10px] uppercase font-bold text-muted tracking-wider mb-1">Execution Steps</h5>
                  <ol className="list-decimal list-inside text-xs text-white/70 space-y-1">
                    {rec.steps.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                </div>

                {rec.references?.length > 0 && (
                   <div className="pt-2 border-t border-border/50">
                      <h5 className="text-[10px] uppercase font-bold text-muted tracking-wider mb-1">References</h5>
                      {rec.references.map((ref, i) => (
                         <Link key={i} to={`/explore/${repoId}?path=${encodeURIComponent(ref.path)}`} className="block text-xs text-[#89b4fa] hover:underline mb-0.5 truncate">
                           <File className="w-3 h-3 inline mr-1 opacity-70"/>
                           {ref.path}
                         </Link>
                      ))}
                   </div>
                )}
              </div>
            ))}

            {insights.limitations?.length > 0 && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded p-3">
                <h4 className="text-[10px] uppercase font-bold text-yellow-500/70 tracking-wider mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3"/> Limitations
                </h4>
                <ul className="list-disc list-inside text-xs text-white/60 space-y-1">
                  {insights.limitations.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
