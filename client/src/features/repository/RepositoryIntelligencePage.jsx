/**
 * RepositoryIntelligencePage.jsx
 *
 * It initiates the intelligence dashboard, then extracts local repository schemas,
 * and then it applies offline metrics to render the structural UI.
 */
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { repositoryApi } from "../../shared/api";
import AiResponse from "../../shared/components/ai/AiResponse";
import {
  AlertCircle,
  Box,
  GitMerge,
  FileText,
  AlertTriangle,
  ShieldAlert,
  BookOpen,
  Loader2,
  Wrench,
  CheckCircle,
  Sparkles,
  X,
  MessageSquare,
} from "lucide-react";
import { useAIState, useAI } from "../../shared/context/AIContext";
import { useRepository } from "../../shared/context/RepositoryContext";
import { useToast } from "../../shared/context/ToastContext";
import AnalysisProgress from "./AnalysisProgress";
import OpenSourceButton from "../../shared/components/OpenSourceButton";
import { tryMakeSourceRef } from "../../shared/navigation/sourceRef";

export default function RepositoryIntelligencePage() {
  const { repoId } = useParams();
  const {
    repo,
    loading: repoLoading,
    error: repoError,
    refetchRepo,
    livePhase,
  } = useRepository();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);

  const { aiState } = useAIState();

  /**
   * It registers the AI context hook, then extracts the IndexedDB chat history,
   * and then it applies the messaging state to drive the side panel UI.
   */
  const {
    messages: aiMessages,
    isLoading: aiLoading,
    error: aiError,
    sendMessage,
  } = useAI({ repoId, feature: "intelligence" });

  // The latest message in the array is our synthesized summary
  const aiData =
    aiMessages.length > 0 ? aiMessages[aiMessages.length - 1].content : null;

  /**
   * It fetches the unified intelligence object, then extracts the specific metrics,
   * and then it applies them to the dashboard state.
   */
  const loadIntelligence = async (wasAnalyzing = false) => {
    setError(null);
    try {
      const res = await repositoryApi.getIntelligence(repoId);
      setData(res.data.intelligence || res.data);

      if (wasAnalyzing) {
        // It detects a recent extraction completion, then extracts a small delay, and then it applies it for a smooth UI transition.
        setTimeout(() => {
          setLoading(false);
        }, 1500);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
      setLoading(false);
    }
  };

  const wasAnalyzingRef = useRef(repo?.status === "analyzing");

  /**
   * It observes the global repository state, then extracts the ready flag,
   * and then it applies the data loader automatically when the background worker finishes.
   */
  useEffect(() => {
    if (repo?.status === "ready") {
      loadIntelligence(wasAnalyzingRef.current);
    }
  }, [repo?.status, repoId]);

  /**
   * It triggers the AI synthesis request, then extracts the natural language insights,
   * and then it applies the generated overview to the IndexedDB store.
   */
  const handleUnderstandRepository = async () => {
    if (aiState.authState === "unauthenticated") {
      navigate("/auth/signin");
      return;
    }
    try {
      await sendMessage(
        "Provide a comprehensive executive summary of this repository, including its architecture, tech stack, and overall engineering health.",
      );
      addToast({
        title: "AI Synthesis Complete",
        description: "Repository intelligence has been successfully generated.",
        type: "success",
      });
    } catch (err) {
      addToast({
        title: "AI Generation Failed",
        description: err.message || "Failed to synthesize data.",
        type: "error",
      });
    }
  };

  // Determine if we should show the analysis progress UI.
  // This includes when it's actively analyzing OR when it just finished ('ready') but we are still in the 1.5s visual hold.
  const isAnalyzing =
    repo?.status === "analyzing" ||
    (wasAnalyzingRef.current && repo?.status === "ready" && loading);

  if (isAnalyzing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-text">
        <AnalysisProgress
          currentPhase={livePhase?.phase ?? repo?.phase}
          phaseDetails={livePhase?.details ?? repo?.phaseDetails}
        />
      </div>
    );
  }

  const isInitialLoad = loading && !data;

  // If we are just refreshing the repo metadata (repoLoading) but not analyzing, show spinner.
  if (repoLoading || (isInitialLoad && !error)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface text-text">
        <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
        <span className="text-sm text-muted">
          Loading intelligence dashboard...
        </span>
      </div>
    );
  }

  if (error || repoError) {
    const errorMsg = error || repoError;
    const isNotReady =
      errorMsg.toLowerCase().includes("not ready") ||
      errorMsg.toLowerCase().includes("pending") ||
      errorMsg.toLowerCase().includes("graph not available");

    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <AlertCircle className="w-6 h-6 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4 text-sm">{errorMsg}</p>
          {isNotReady ? (
            <button
              onClick={async () => {
                await repositoryApi.analyze(repoId);
                await refetchRepo();
              }}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text rounded-lg text-sm font-medium transition-colors"
            >
              Start Analysis
            </button>
          ) : (
            <button
              onClick={() => navigate(-1)}
              className="text-sm text-accent hover:underline"
            >
              ← Go back
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex-1 h-full w-full overflow-hidden flex flex-col xl:flex-row bg-surface text-text">
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-panel border border-border p-4 rounded flex flex-col gap-2">
            <h3 className="text-sm font-medium text-text flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" />
              Repository
            </h3>
            <div className="flex justify-between items-center text-xs mt-2">
              <span className="text-muted">Files</span>
              <span className="font-mono text-text">
                {data.repository.fileCount}
              </span>
            </div>
            <div className="flex flex-col gap-1 mt-1">
              <span className="text-muted text-[11px] uppercase tracking-wider">
                Languages
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(data.repository.languages).map(
                  ([lang, count]) => (
                    <span
                      key={lang}
                      className="text-[10px] bg-surface px-1.5 py-0.5 rounded border border-text/5 text-text"
                    >
                      {lang} ({count})
                    </span>
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="bg-panel border border-border p-4 rounded flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-text flex items-center gap-2">
                <Box className="w-4 h-4 text-warning" />
                Architecture
              </h3>
              <Link
                to={`/explore/${repoId}/architecture`}
                className="text-[10px] text-accent hover:underline"
              >
                View Architecture
              </Link>
            </div>
            <div className="flex justify-between items-center text-xs mt-2">
              <span className="text-muted">Components</span>
              <span className="font-mono text-text">
                {data.architecture.components}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted">Entry Points</span>
              <span className="font-mono text-text">
                {data.architecture.entryPoints?.length || 0}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted">Layers</span>
              <span className="font-mono text-text">
                {data.architecture.layers?.length || 0}
              </span>
            </div>
          </div>

          <div className="bg-panel border border-border p-4 rounded flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-text flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-accent" />
                Dependencies
              </h3>
              <Link
                to={`/explore/${repoId}/graph`}
                className="text-[10px] text-accent hover:underline"
              >
                View Graph
              </Link>
            </div>
            <div className="flex justify-between items-center text-xs mt-2">
              <span className="text-muted">Total Nodes</span>
              <span className="font-mono text-text">
                {data.dependencies.nodes}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted">Total Edges</span>
              <span className="font-mono text-text">
                {data.dependencies.edges}
              </span>
            </div>
            {data.dependencies.cycles > 0 && (
              <div className="flex justify-between items-center text-xs mt-1 bg-danger/10 p-1 rounded border border-danger/20">
                <span className="text-danger flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Cycles
                </span>
                <span className="font-mono text-danger font-bold">
                  {data.dependencies.cycles}
                </span>
              </div>
            )}
          </div>

          <div className="bg-panel border border-border p-4 rounded flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-text flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-success" />
                Health
              </h3>
              <Link
                to={`/explore/${repoId}/health`}
                className="text-[10px] text-accent hover:underline"
              >
                View Health
              </Link>
            </div>
            <div className="flex justify-between items-center text-xs mt-2">
              <span className="text-muted">Health Score</span>
              <span
                className={`font-mono font-bold ${data.engineeringHealth.score >= 80 ? "text-success" : data.engineeringHealth.score >= 50 ? "text-warning" : "text-danger"}`}
              >
                {data.engineeringHealth.score}/100
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted">Critical Risks</span>
              <span
                className={`font-mono ${data.engineeringHealth.critical > 0 ? "text-danger" : "text-success"}`}
              >
                {data.engineeringHealth.critical}
              </span>
            </div>
          </div>
        </div>

        <section className="bg-panel border border-border p-5 rounded mt-2">
          <h3 className="text-sm font-medium text-text mb-4 flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold">
              !
            </span>
            Recommended Actions
          </h3>
          <div className="flex flex-col gap-3">
            {data.dependencies.cycles > 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 bg-surface border border-text/5 rounded">
                <div className="flex items-start gap-3 flex-1">
                  <GitMerge className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-semibold text-text mb-1">
                      {data.dependencies.cycles} Circular Dependencies Detected
                    </h4>
                    <p className="text-[11px] text-muted leading-relaxed">
                      Circular dependencies can make modules harder to change
                      and test. Breaking these cycles often improves
                      architecture.
                    </p>
                  </div>
                </div>
                <Link
                  to={`/explore/${repoId}/graph`}
                  className="w-full sm:w-auto text-center shrink-0 px-3 py-1.5 bg-panel border border-border rounded text-[10px] font-medium text-text hover:border-accent transition-colors"
                >
                  Explore Dependencies →
                </Link>
              </div>
            ) : null}

            {data.engineeringHealth.critical > 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 bg-surface border border-text/5 rounded">
                <div className="flex items-start gap-3 flex-1">
                  <ShieldAlert className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-semibold text-text mb-1">
                      {data.engineeringHealth.critical} High-Risk Files
                    </h4>
                    <p className="text-[11px] text-muted leading-relaxed">
                      These files combine multiple engineering risk factors like
                      excessive coupling or size. They are prime candidates for
                      bugs.
                    </p>
                  </div>
                </div>
                <Link
                  to={`/explore/${repoId}/health`}
                  className="w-full sm:w-auto text-center shrink-0 px-3 py-1.5 bg-panel border border-border rounded text-[10px] font-medium text-text hover:border-accent transition-colors"
                >
                  Review Engineering Health →
                </Link>
              </div>
            ) : null}

            {data.refactoring.candidateCount > 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 bg-surface border border-text/5 rounded">
                <div className="flex items-start gap-3 flex-1">
                  <Wrench className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-semibold text-text mb-1">
                      {Math.min(data.refactoring.candidateCount, 3)} High-Impact
                      Refactoring Candidates
                    </h4>
                    <p className="text-[11px] text-muted leading-relaxed">
                      These changes may improve maintainability and resolve
                      architectural debt.
                    </p>
                  </div>
                </div>
                <Link
                  to={`/explore/${repoId}/refactoring`}
                  className="w-full sm:w-auto text-center shrink-0 px-3 py-1.5 bg-panel border border-border rounded text-[10px] font-medium text-text hover:border-accent transition-colors"
                >
                  View Refactoring Plan →
                </Link>
              </div>
            ) : null}

            {data.dependencies.cycles === 0 &&
            data.engineeringHealth.critical === 0 &&
            data.refactoring.candidateCount === 0 ? (
              <div className="flex items-start gap-3 p-3 bg-surface border border-text/5 rounded">
                <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-xs font-semibold text-text mb-1">
                    Healthy Repository
                  </h4>
                  <p className="text-[11px] text-muted leading-relaxed">
                    No critical deterministic risks were detected. Great job
                    keeping technical debt low!
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 bg-surface border border-text/5 rounded">
              <div className="flex items-start gap-3 flex-1">
                <FileText className="w-4 h-4 text-success shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-xs font-semibold text-text mb-1">
                    Codebase Explorer
                  </h4>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Structural insights are automatically available for all
                    files in the explorer.
                  </p>
                </div>
              </div>
              <Link
                to={`/explore/${repoId}/source`}
                className="w-full sm:w-auto text-center shrink-0 px-3 py-1.5 bg-panel border border-border rounded text-[10px] font-medium text-text hover:border-accent transition-colors"
              >
                Explore Files →
              </Link>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          <section className="bg-panel border border-border p-5 rounded">
            <h3 className="text-sm font-medium text-text mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Repository Hotspots
            </h3>
            {data.hotspots && data.hotspots.length > 0 ? (
              <div className="flex flex-col gap-3">
                {data.hotspots.slice(0, 5).map((h, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-1 pb-3 border-b border-text/5 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between min-w-0">
                      <span
                        className="text-xs font-mono text-text truncate max-w-[80%]"
                        title={h.filePath}
                      >
                        {h.filePath}
                      </span>
                      <span className="text-xs font-bold text-warning">
                        {h.score}
                      </span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] text-muted leading-tight max-w-[80%]">
                        {h.reasons.join(" • ")}
                      </span>
                      {h.filePath ? (
                        <OpenSourceButton
                          ref={tryMakeSourceRef({ filePath: h.filePath })}
                          label="View File"
                          className="!text-[10px] shrink-0"
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted">
                No major hotspots detected.
              </span>
            )}
          </section>

          <section className="bg-panel border border-border p-5 rounded">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-text flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-danger" />
                Top Refactoring Priorities
              </h3>
              <Link
                to={`/explore/${repoId}/refactoring`}
                className="text-[10px] text-accent hover:underline"
              >
                View All ({data.refactoring.candidateCount})
              </Link>
            </div>

            {data.refactoring.topCandidates &&
            data.refactoring.topCandidates.length > 0 ? (
              <div className="flex flex-col gap-3">
                {data.refactoring.topCandidates.map((c, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-1 pb-3 border-b border-text/5 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-text">
                        {c.title}
                      </span>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded border border-text/5 font-bold bg-surface">
                        <span
                          className={
                            c.priority === "critical"
                              ? "text-danger"
                              : "text-warning"
                          }
                        >
                          {c.priority}
                        </span>
                        <span className="text-muted ml-1">({c.score})</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted">
                No critical refactoring candidates identified.
              </span>
            )}
          </section>
        </div>

        <section className="mt-8">
          <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
            Next Steps & Exploration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              onClick={() => {
                if (aiState.authState === "unauthenticated") {
                  navigate("/auth/signin");
                  return;
                }
                handleUnderstandRepository();
              }}
              disabled={
                aiLoading ||
                aiState.status === "loading" ||
                (aiState.authState !== "unauthenticated" &&
                  (aiState.status === "offline" ||
                    aiState.quotaStatus === "exhausted"))
              }
              title={
                aiState.status === "offline"
                  ? "No AI provider configured"
                  : aiState.quotaStatus === "exhausted"
                    ? "AI quota exceeded"
                    : ""
              }
              className="bg-surface/30 border border-text/5 p-4 rounded hover:border-accent hover:bg-surface transition-all flex flex-col gap-2 text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2 text-text font-medium group-hover:text-accent transition-colors">
                <BookOpen className="w-4 h-4 text-accent" />
                {aiState.authState === "unauthenticated"
                  ? "Sign in to Understand Codebase"
                  : "Understand Codebase"}
              </div>
              <span className="text-xs text-muted">
                Generate an AI overview of the entire repository structure.
              </span>
            </button>

            <Link
              to={`/explore/${repoId}/architecture`}
              className="bg-surface/30 border border-text/5 p-4 rounded hover:border-warning hover:bg-surface transition-all flex flex-col gap-2 group"
            >
              <div className="flex items-center gap-2 text-text font-medium group-hover:text-warning transition-colors">
                <Box className="w-4 h-4 text-warning" />
                Architecture Map
              </div>
              <span className="text-xs text-muted">
                Visualize how components and domains fit together.
              </span>
            </Link>

            <Link
              to={`/explore/${repoId}/graph`}
              className="bg-surface/30 border border-text/5 p-4 rounded hover:border-[#cba6f7] hover:bg-surface transition-all flex flex-col gap-2 group"
            >
              <div className="flex items-center gap-2 text-text font-medium group-hover:text-accent transition-colors">
                <GitMerge className="w-4 h-4 text-accent" />
                Dependency Graph
              </div>
              <span className="text-xs text-muted">
                Review{" "}
                {data.dependencies.cycles > 0 ? (
                  <span className="text-danger font-medium">
                    {data.dependencies.cycles} circular cycles
                  </span>
                ) : (
                  "dependency connections"
                )}
                .
              </span>
            </Link>

            <Link
              to={`/explore/${repoId}/health`}
              className="bg-surface/30 border border-text/5 p-4 rounded hover:border-danger hover:bg-surface transition-all flex flex-col gap-2 group"
            >
              <div className="flex items-center gap-2 text-text font-medium group-hover:text-danger transition-colors">
                <ShieldAlert className="w-4 h-4 text-danger" />
                Engineering Health
              </div>
              <span className="text-xs text-muted">
                Inspect {data.engineeringHealth.critical} critical structural
                issues.
              </span>
            </Link>

            <Link
              to={`/explore/${repoId}/refactoring`}
              className="bg-surface/30 border border-text/5 p-4 rounded hover:border-blue-400 hover:bg-surface transition-all flex flex-col gap-2 group"
            >
              <div className="flex items-center gap-2 text-text font-medium group-hover:text-blue-400 transition-colors">
                <Wrench className="w-4 h-4 text-blue-400" />
                Technical Debt
              </div>
              <span className="text-xs text-muted">
                View highest-priority refactoring candidates.
              </span>
            </Link>

            <Link
              to={`/explore/${repoId}/source`}
              className="bg-surface/30 border border-text/5 p-4 rounded hover:border-success hover:bg-surface transition-all flex flex-col gap-2 group"
            >
              <div className="flex items-center gap-2 text-text font-medium group-hover:text-success transition-colors">
                <FileText className="w-4 h-4 text-success" />
                Browse Source
              </div>
              <span className="text-xs text-muted">
                Explore the codebase files with contextual insights.
              </span>
            </Link>
          </div>
        </section>
      </main>

      {/* ── Mobile Floating Action Button (FAB) ── */}
      <button
        onClick={() => setIsAiPanelOpen(true)}
        className="xl:hidden fixed bottom-6 right-6 z-40 bg-accent hover:bg-accent-hover text-text w-14 h-14 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.5)] border border-accent/20 transition-transform active:scale-95"
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* ── Mobile Backdrop ── */}
      {isAiPanelOpen && (
        <div 
          className="xl:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
          onClick={() => setIsAiPanelOpen(false)}
        />
      )}

      {/* ── Right Panel: AI Repository Summary ─────────────────────────────── */}
      <aside 
        className={`fixed inset-x-0 bottom-0 z-50 bg-panel border-t border-border flex flex-col shrink-0 transition-transform duration-300 xl:relative xl:w-96 xl:border-t-0 xl:border-l xl:translate-y-0 h-[100vh] xl:h-auto rounded-t-2xl xl:rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.5)] xl:shadow-none
          ${isAiPanelOpen ? "translate-y-0" : "translate-y-full"}
        `}
      >
        <div className="p-4 border-b border-border flex flex-col gap-3 relative shrink-0 bg-surface/30 xl:bg-transparent rounded-t-2xl xl:rounded-none">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-sm font-medium text-text flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-accent shrink-0" />
                Repository Assistant
              </h2>
              <p className="text-xs text-muted leading-relaxed">
                Use AI to synthesize these deterministic facts into a high-level overview.
              </p>
            </div>
            <button 
              onClick={() => setIsAiPanelOpen(false)}
              className="xl:hidden p-1.5 -mr-1.5 -mt-1 text-muted hover:text-text rounded-lg hover:bg-text/5 transition-colors shrink-0 bg-surface/50 border border-border/50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={handleUnderstandRepository}
            disabled={
              aiLoading ||
              aiState.status === "loading" ||
              (aiState.authState !== "unauthenticated" &&
                (aiState.status === "offline" ||
                  aiState.quotaStatus === "exhausted"))
            }
            title={
              aiState.status === "offline"
                ? "No AI provider configured"
                : aiState.quotaStatus === "exhausted"
                  ? "AI quota exceeded"
                  : ""
            }
            className="bg-accent text-text text-xs py-2.5 px-4 rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex justify-center items-center gap-2 font-medium"
          >
            {aiLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            {aiLoading
              ? "Synthesizing..."
              : aiState.authState === "unauthenticated"
                ? "Sign in to Synthesize"
                : "Understand Repository"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 pb-8 xl:pb-5 bg-panel">
          {aiError && (
            <div className="bg-danger/10 p-3 rounded border border-danger/20 mb-4">
              <p className="text-xs text-danger flex items-center gap-1 mb-1">
                <AlertCircle className="w-3.5 h-3.5" /> AI Error
              </p>
              <p className="text-[11px] text-danger/80">{aiError}</p>
            </div>
          )}

          {!aiData && !aiLoading && !aiError && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-6">
              <div className="w-16 h-16 rounded-full bg-accent/5 flex items-center justify-center border border-accent/10 relative group">
                <div className="absolute inset-0 rounded-full border border-accent/20 animate-[spin_4s_linear_infinite]" />
                <Sparkles className="w-7 h-7 text-accent/50 group-hover:text-accent/70 transition-colors" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-text">AI Synthesis</h3>
                <p className="text-xs text-muted max-w-[250px] mx-auto leading-relaxed">
                  Generate a comprehensive, high-level summary of the entire repository architecture and health.
                </p>
              </div>

              <div className="flex flex-col gap-3 w-full max-w-[260px] mt-2">
                <div className="flex items-center gap-3 text-[11px] text-muted/80 bg-surface/30 p-2.5 rounded border border-border/50">
                  <BookOpen className="w-3.5 h-3.5 text-accent/70 shrink-0" />
                  <span className="text-left leading-tight">Summarize core purpose & architecture</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted/80 bg-surface/30 p-2.5 rounded border border-border/50">
                  <GitMerge className="w-3.5 h-3.5 text-blue-400/70 shrink-0" />
                  <span className="text-left leading-tight">Explain key dependency patterns</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted/80 bg-surface/30 p-2.5 rounded border border-border/50">
                  <ShieldAlert className="w-3.5 h-3.5 text-warning/70 shrink-0" />
                  <span className="text-left leading-tight">Contextualize structural health risks</span>
                </div>
              </div>
            </div>
          )}

          {aiData && (
            <div className="text-sm">
              <AiResponse
                data={aiData}
                title={null}
                onNavigate={() => {}}
                repoId={repoId}
                chatId="repo-intelligence"
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
