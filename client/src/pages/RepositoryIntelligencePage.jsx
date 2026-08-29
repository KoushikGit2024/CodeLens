import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { repositoryApi } from '../api';
import { 
  ChevronLeft, Loader2, AlertCircle, RefreshCw, CheckCircle, Wrench,
  Box, GitMerge, FileText, AlertTriangle, ShieldAlert, BookOpen
} from 'lucide-react';
import AIStatusIndicator from '../components/AIStatusIndicator';
import { useAIState } from '../components/AIContext';
import AnalysisProgress from '../components/AnalysisProgress';

export default function RepositoryIntelligencePage() {
  const { repoId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('uploading');
  const [phaseDetails, setPhaseDetails] = useState(null);
  
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiData, setAiData] = useState(null);
  const { aiState, reportAiError } = useAIState();

  const loadIntelligence = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await repositoryApi.getIntelligence(repoId);
      if (res.status === 202) {
        setCurrentPhase(res.data.phase || 'scanning_files');
        setPhaseDetails(res.data.phaseDetails || null);
        setTimeout(loadIntelligence, 1000);
      } else {
        setData(res.data);
        setLoading(false);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIntelligence();
  }, [repoId]);

  const handleUnderstandRepository = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await repositoryApi.askQuestion(repoId, "Give me an overview of this repository.");
      // The answer is expected to be a JSON string since it was generated via generateStructuredResponse
      // However, wait, the askEndpoint returns { answer, references }
      let parsed;
      try {
        parsed = JSON.parse(res.data.answer);
      } catch (e) {
        // Fallback if not valid JSON
        parsed = { summary: res.data.answer };
      }
      setAiData(parsed);
    } catch (err) {
      setAiError(err?.response?.data?.error || err.message);
      reportAiError();
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-white">
        <AnalysisProgress currentPhase={currentPhase} phaseDetails={phaseDetails} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <AlertCircle className="w-6 h-6 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4 text-sm">{error}</p>
          <button onClick={() => navigate(-1)} className="text-sm text-accent hover:underline">
            ← Go back
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex-1 h-full w-full overflow-hidden flex flex-row bg-surface text-white">
        {/* ── Main Content Area ──────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Repository Basics */}
            <div className="bg-panel border border-border p-4 rounded flex flex-col gap-2">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent" />
                Repository
              </h3>
              <div className="flex justify-between items-center text-xs mt-2">
                <span className="text-muted">Files</span>
                <span className="font-mono text-white">{data.repository.fileCount}</span>
              </div>
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-muted text-[11px] uppercase tracking-wider">Languages</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(data.repository.languages).map(([lang, count]) => (
                    <span key={lang} className="text-[10px] bg-surface px-1.5 py-0.5 rounded border border-border/50 text-white">
                      {lang} ({count})
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Architecture */}
            <div className="bg-panel border border-border p-4 rounded flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <Box className="w-4 h-4 text-warning" />
                  Architecture
                </h3>
                <Link to={`/explore/${repoId}/architecture`} className="text-[10px] text-accent hover:underline">View Architecture</Link>
              </div>
              <div className="flex justify-between items-center text-xs mt-2">
                <span className="text-muted">Components</span>
                <span className="font-mono text-white">{data.architecture.components}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted">Entry Points</span>
                <span className="font-mono text-white">{data.architecture.entryPoints.length}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted">Layers</span>
                <span className="font-mono text-white">{data.architecture.layers.length}</span>
              </div>
            </div>

            {/* Dependencies */}
            <div className="bg-panel border border-border p-4 rounded flex flex-col gap-2">
               <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <GitMerge className="w-4 h-4 text-[#cba6f7]" />
                  Dependencies
                </h3>
                <Link to={`/explore/${repoId}/graph`} className="text-[10px] text-accent hover:underline">View Graph</Link>
              </div>
              <div className="flex justify-between items-center text-xs mt-2">
                <span className="text-muted">Total Nodes</span>
                <span className="font-mono text-white">{data.dependencies.nodes}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted">Total Edges</span>
                <span className="font-mono text-white">{data.dependencies.edges}</span>
              </div>
              {data.dependencies.cycles > 0 && (
                 <div className="flex justify-between items-center text-xs mt-1 bg-danger/10 p-1 rounded border border-danger/20">
                  <span className="text-danger flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Cycles</span>
                  <span className="font-mono text-danger font-bold">{data.dependencies.cycles}</span>
                </div>
              )}
            </div>

            {/* Engineering Health */}
             <div className="bg-panel border border-border p-4 rounded flex flex-col gap-2">
               <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-success" />
                  Health
                </h3>
                <Link to={`/explore/${repoId}/health`} className="text-[10px] text-accent hover:underline">View Health</Link>
              </div>
              <div className="flex justify-between items-center text-xs mt-2">
                <span className="text-muted">Health Score</span>
                <span className={`font-mono font-bold ${data.engineeringHealth.score >= 80 ? 'text-success' : data.engineeringHealth.score >= 50 ? 'text-warning' : 'text-danger'}`}>
                  {data.engineeringHealth.score}/100
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted">Critical Risks</span>
                <span className={`font-mono ${data.engineeringHealth.critical > 0 ? 'text-danger' : 'text-success'}`}>{data.engineeringHealth.critical}</span>
              </div>
            </div>

          </div>

          {/* Recommended Actions */}
          <section className="bg-panel border border-border p-5 rounded mt-2">
            <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold">!</span>
              Recommended Actions
            </h3>
            <div className="flex flex-col gap-3">
              {data.dependencies.cycles > 0 ? (
                <div className="flex items-start gap-3 p-3 bg-surface border border-border/50 rounded">
                  <GitMerge className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-semibold text-white mb-1">{data.dependencies.cycles} Circular Dependencies Detected</h4>
                    <p className="text-[11px] text-muted leading-relaxed">Circular dependencies can make modules harder to change and test. Breaking these cycles often improves architecture.</p>
                  </div>
                  <Link to={`/explore/${repoId}/graph`} className="shrink-0 px-3 py-1.5 bg-panel border border-border rounded text-[10px] font-medium text-white hover:border-accent transition-colors">
                    Explore Dependencies →
                  </Link>
                </div>
              ) : null}

              {data.engineeringHealth.critical > 0 ? (
                <div className="flex items-start gap-3 p-3 bg-surface border border-border/50 rounded">
                  <ShieldAlert className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-semibold text-white mb-1">{data.engineeringHealth.critical} High-Risk Files</h4>
                    <p className="text-[11px] text-muted leading-relaxed">These files combine multiple engineering risk factors like excessive coupling or size. They are prime candidates for bugs.</p>
                  </div>
                  <Link to={`/explore/${repoId}/health`} className="shrink-0 px-3 py-1.5 bg-panel border border-border rounded text-[10px] font-medium text-white hover:border-accent transition-colors">
                    Review Engineering Health →
                  </Link>
                </div>
              ) : null}

              {data.refactoring.candidateCount > 0 ? (
                <div className="flex items-start gap-3 p-3 bg-surface border border-border/50 rounded">
                  <Wrench className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-semibold text-white mb-1">{Math.min(data.refactoring.candidateCount, 3)} High-Impact Refactoring Candidates</h4>
                    <p className="text-[11px] text-muted leading-relaxed">These changes may improve maintainability and resolve architectural debt.</p>
                  </div>
                  <Link to={`/explore/${repoId}/refactoring`} className="shrink-0 px-3 py-1.5 bg-panel border border-border rounded text-[10px] font-medium text-white hover:border-accent transition-colors">
                    View Refactoring Plan →
                  </Link>
                </div>
              ) : null}

              {data.dependencies.cycles === 0 && data.engineeringHealth.critical === 0 && data.refactoring.candidateCount === 0 ? (
                <div className="flex items-start gap-3 p-3 bg-surface border border-border/50 rounded">
                  <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-semibold text-white mb-1">Healthy Repository</h4>
                    <p className="text-[11px] text-muted leading-relaxed">No critical deterministic risks were detected. Great job keeping technical debt low!</p>
                  </div>
                </div>
              ) : null}

              <div className="flex items-start gap-3 p-3 bg-surface border border-border/50 rounded">
                <BookOpen className="w-4 h-4 text-[#a6e3a1] shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-xs font-semibold text-white mb-1">Repository Documentation</h4>
                  <p className="text-[11px] text-muted leading-relaxed">Structural documentation is automatically available for all components.</p>
                </div>
                <Link to={`/explore/${repoId}/documentation`} className="shrink-0 px-3 py-1.5 bg-panel border border-border rounded text-[10px] font-medium text-white hover:border-accent transition-colors">
                  Read Documentation →
                </Link>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
             {/* Hotspots */}
             <section className="bg-panel border border-border p-5 rounded">
               <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                 <AlertTriangle className="w-4 h-4 text-warning" />
                 Repository Hotspots
               </h3>
               {data.hotspots.length > 0 ? (
                 <div className="flex flex-col gap-3">
                   {data.hotspots.slice(0, 5).map((h, i) => (
                     <div key={i} className="flex flex-col gap-1 pb-3 border-b border-border/50 last:border-0 last:pb-0">
                       <div className="flex items-center justify-between">
                         <span className="text-xs font-mono text-white truncate max-w-[80%]">{h.filePath}</span>
                         <span className="text-xs font-bold text-warning">{h.score}</span>
                       </div>
                       <div className="flex justify-between items-end">
                         <span className="text-[10px] text-muted leading-tight max-w-[80%]">
                           {h.reasons.join(' • ')}
                         </span>
                         <Link to={`/explore/${repoId}/source?path=${encodeURIComponent(h.filePath)}`} className="text-[10px] text-accent hover:underline shrink-0">
                           View File
                         </Link>
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <span className="text-xs text-muted">No major hotspots detected.</span>
               )}
             </section>

             {/* Refactoring Priorities */}
             <section className="bg-panel border border-border p-5 rounded">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-danger" />
                    Top Refactoring Priorities
                  </h3>
                  <Link to={`/explore/${repoId}/refactoring`} className="text-[10px] text-accent hover:underline">View All ({data.refactoring.candidateCount})</Link>
               </div>
               
               {data.refactoring.topCandidates.length > 0 ? (
                 <div className="flex flex-col gap-3">
                   {data.refactoring.topCandidates.map((c, i) => (
                     <div key={i} className="flex flex-col gap-1 pb-3 border-b border-border/50 last:border-0 last:pb-0">
                       <div className="flex items-center justify-between">
                         <span className="text-xs font-medium text-white">{c.title}</span>
                         <span className="text-[10px] uppercase px-1.5 py-0.5 rounded border border-border/50 font-bold bg-surface">
                           <span className={c.priority === 'critical' ? 'text-danger' : 'text-warning'}>
                             {c.priority}
                           </span>
                           <span className="text-muted ml-1">({c.score})</span>
                         </span>
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <span className="text-xs text-muted">No critical refactoring candidates identified.</span>
               )}
             </section>
          </div>

          {/* ── Recommended Exploration ────────────────────────────────────────── */}
          <section className="bg-panel border border-border p-5 rounded mt-4">
            <h3 className="text-sm font-semibold text-white mb-3">Recommended Exploration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <Link to={`/explore/${repoId}/architecture`} className="bg-surface/50 border border-border/50 p-4 rounded hover:border-white/20 hover:bg-surface transition-colors flex flex-col gap-1 group">
                <span className="text-white font-medium group-hover:text-accent transition-colors flex items-center gap-2"><Box className="w-4 h-4" /> Architecture &rarr;</span>
                <span className="text-xs text-muted">Understand how components fit together.</span>
              </Link>
              <Link to={`/explore/${repoId}/graph`} className="bg-surface/50 border border-border/50 p-4 rounded hover:border-white/20 hover:bg-surface transition-colors flex flex-col gap-1 group">
                <span className="text-white font-medium group-hover:text-accent transition-colors flex items-center gap-2"><GitMerge className="w-4 h-4 text-[#cba6f7]" /> Dependencies &rarr;</span>
                <span className="text-xs text-muted">Review {data.dependencies.cycles > 0 ? `${data.dependencies.cycles} circular cycles` : 'dependency connections'}.</span>
              </Link>
              <Link to={`/explore/${repoId}/health`} className="bg-surface/50 border border-border/50 p-4 rounded hover:border-white/20 hover:bg-surface transition-colors flex flex-col gap-1 group">
                <span className="text-white font-medium group-hover:text-accent transition-colors flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-danger" /> Health Risks &rarr;</span>
                <span className="text-xs text-muted">Inspect {data.health.criticalCount} critical structural issues.</span>
              </Link>
              <Link to={`/explore/${repoId}/refactoring`} className="bg-surface/50 border border-border/50 p-4 rounded hover:border-white/20 hover:bg-surface transition-colors flex flex-col gap-1 group">
                <span className="text-white font-medium group-hover:text-accent transition-colors flex items-center gap-2"><Wrench className="w-4 h-4 text-blue-400" /> Refactoring &rarr;</span>
                <span className="text-xs text-muted">View highest-priority technical debt.</span>
              </Link>
            </div>
          </section>
        </main>

        {/* ── Right Panel: AI Repository Summary ─────────────────────────────── */}
        <aside className="w-96 border-l border-border bg-[#0d1117] flex flex-col shrink-0">
          <div className="p-4 border-b border-border flex flex-col gap-3">
            <h2 className="text-sm font-medium text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-accent" />
              Repository Assistant
            </h2>
            <p className="text-xs text-muted leading-relaxed">
              Use IBM watsonx to synthesize these deterministic facts into a high-level overview.
            </p>
            <button
              onClick={handleUnderstandRepository}
              disabled={aiLoading}
              className="bg-accent text-white text-xs py-2 px-4 rounded hover:bg-accent/90 disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
            >
              {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {aiLoading ? 'Synthesizing...' : 'Understand Repository'}
            </button>
            {aiState === 'offline' || aiState === 'unavailable' ? (
               <p className="text-[10px] text-warning text-center mt-1">
                 AI summaries are currently unavailable.
               </p>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {aiError && (
              <div className="bg-danger/10 p-3 rounded border border-danger/20 mb-4">
                <p className="text-xs text-danger flex items-center gap-1 mb-1">
                  <AlertCircle className="w-3.5 h-3.5" /> AI Error
                </p>
                <p className="text-[11px] text-danger/80">{aiError}</p>
              </div>
            )}

            {!aiData && !aiLoading && !aiError && (
              <div className="h-full flex items-center justify-center">
                <span className="text-xs text-muted text-center italic max-w-[80%]">
                  Click "Understand Repository" to generate an AI summary based on the current deterministic models.
                </span>
              </div>
            )}

            {aiData && (
              <div className="flex flex-col gap-5 text-sm">
                <div>
                  <h3 className="text-xs uppercase text-muted tracking-wider mb-2 font-semibold">Summary</h3>
                  <p className="text-xs text-white/90 leading-relaxed">{aiData.summary}</p>
                </div>

                {aiData.keyCharacteristics?.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase text-muted tracking-wider mb-2 font-semibold">Key Characteristics</h3>
                    <ul className="list-disc pl-4 flex flex-col gap-1">
                      {aiData.keyCharacteristics.map((item, i) => (
                        <li key={i} className="text-xs text-white/80">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiData.architectureExplanation && (
                  <div>
                    <h3 className="text-xs uppercase text-muted tracking-wider mb-2 font-semibold">Architecture</h3>
                    <p className="text-xs text-white/90 leading-relaxed">{aiData.architectureExplanation}</p>
                  </div>
                )}

                {aiData.mainRisks?.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase text-muted tracking-wider mb-2 font-semibold">Main Risks</h3>
                    <ul className="list-disc pl-4 flex flex-col gap-1">
                      {aiData.mainRisks.map((item, i) => (
                        <li key={i} className="text-xs text-warning/90">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiData.recommendedActions?.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase text-muted tracking-wider mb-2 font-semibold">Recommended Actions</h3>
                    <ul className="list-disc pl-4 flex flex-col gap-1">
                      {aiData.recommendedActions.map((item, i) => (
                        <li key={i} className="text-xs text-success/90">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
    </div>
  );
}
