import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, ChevronLeft, BookOpen, Layers, GitBranch, FileText, AlertTriangle, Cpu } from 'lucide-react';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { repositoryApi } from '../../shared/api';
import { FileTree } from '../explorer/FileTree';

export default function DocumentationPage() {
  const { repoId } = useParams();
  const navigate = useNavigate();

  const [repo, setRepo] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  
  const [selectedPath, setSelectedPath] = useState(null); // null = overview
  const [docs, setDocs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load Repo & Tree
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [repoRes, treeRes] = await Promise.all([
          repositoryApi.get(repoId),
          repositoryApi.listFiles(repoId),
        ]);
        if (!cancelled) {
          setRepo(repoRes.data);
          setFileTree(treeRes.data.tree);
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.error || err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [repoId]);

  // Load Documentation
  useEffect(() => {
    let cancelled = false;
    async function fetchDocs() {
      setLoading(true);
      setError(null);
      setDocs(null);
      try {
        let res;
        if (!selectedPath) {
          res = await repositoryApi.getOverviewDocumentation(repoId);
        } else {
          res = await repositoryApi.getModuleDocumentation(repoId, selectedPath);
        }
        if (!cancelled) {
          setDocs(res.data);
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.error || err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchDocs();
    return () => { cancelled = true; };
  }, [repoId, selectedPath]);

  if (error && !repo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger mb-4 text-sm">{error}</p>
          <button onClick={() => navigate(-1)} className="text-sm text-accent hover:underline">
            ← Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <ResizableLayout
      panels={[
        {
          id: 'sidebar',
          defaultSize: 20,
          minWidth: 200,
          collapsible: true,
          content: (
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar bg-panel h-full">
              <div className="mb-4">
                <button
                  onClick={() => setSelectedPath(null)}
                  className={`w-full text-left block py-1.5 px-2 text-sm rounded transition-colors ${
                    !selectedPath ? 'text-accent bg-accent/10 font-medium' : 'text-white/80 hover:text-white hover:bg-surface'
                  }`}
                >
                  Project Overview
                </button>
              </div>
              
              <p className="text-xs text-muted uppercase tracking-wider mb-2 px-1">Modules</p>
              {fileTree ? (
                <div className="overflow-x-auto">
                  <FileTree 
                    nodes={fileTree} 
                    selectedPath={selectedPath} 
                    onSelectFile={setSelectedPath} 
                  />
                </div>
              ) : (
                <div className="px-2 text-xs text-muted">Loading files...</div>
              )}
            </div>
          )
        },
        {
          id: 'content',
          defaultSize: 80,
          minWidth: 300,
          collapsible: false,
          content: (
            <main className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0d1117] h-full">
              <div className="max-w-4xl mx-auto">
                {loading ? (
                  <div className="flex items-center gap-3 mt-10">
                    <Loader2 className="w-5 h-5 text-accent animate-spin" />
                    <span className="text-muted text-sm">Generating documentation...</span>
                  </div>
                ) : error ? (
                  <div className="flex items-center gap-3 mt-10 text-danger bg-danger/10 p-4 border border-danger/20 rounded">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="text-sm">{error}</span>
                  </div>
                ) : (
                  !selectedPath ? <OverviewDoc docs={docs} repoId={repoId} /> : <ModuleDoc docs={docs} repoId={repoId} />
                )}
              </div>
            </main>
          )
        }
      ]}
    />
  );
}

// ── Documentation Renderers ───────────────────────────────────────────────────

function OverviewDoc({ docs, repoId }) {
  if (!docs) return null;
  const { facts, aiInterpretation: ai } = docs;

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="border-b border-border pb-4">
        <h1 className="text-3xl font-semibold mb-2">{facts.projectName}</h1>
        <p className="text-muted text-sm flex items-center gap-4">
          <span>{facts.meta.totalFiles} files</span>
          <span>{facts.meta.totalEdges} dependency edges</span>
          <span>{facts.components.length} architectural components</span>
        </p>
      </header>

      {/* AI Overview */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium flex items-center gap-2">
          <Cpu className="w-5 h-5 text-accent" />
          AI Analysis
        </h2>
        {ai ? (
          <div className="bg-panel border border-border rounded-lg p-5 space-y-5">
            <div>
              <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Summary</h3>
              <p className="text-sm leading-relaxed text-white/90">{ai.summary}</p>
            </div>
            
            {ai.architectureSummary && (
              <div>
                <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Architecture</h3>
                <p className="text-sm leading-relaxed text-white/90">{ai.architectureSummary}</p>
              </div>
            )}

            {ai.technologies?.length > 0 && (
              <div>
                <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Technologies</h3>
                <div className="flex flex-wrap gap-2">
                  {ai.technologies.map((tech, i) => (
                    <span key={i} className="text-xs bg-surface border border-border px-2 py-1 rounded">{tech}</span>
                  ))}
                </div>
              </div>
            )}

            {ai.observations?.length > 0 && (
              <div>
                <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Observations</h3>
                <ul className="list-disc list-inside text-sm text-white/80 space-y-1">
                  {ai.observations.map((obs, i) => <li key={i}>{obs}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted italic bg-surface p-4 rounded border border-border">
            AI interpretation is currently unavailable. Viewing deterministic facts only.
          </div>
        )}
      </section>

      {/* Deterministic Facts */}
      <section className="space-y-6">
        <h2 className="text-xl font-medium">Repository Structure</h2>
        
        {facts.entryPoints?.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-accent">Entry Points</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {facts.entryPoints.map((ep, i) => (
                <SourceLink key={i} path={ep} repoId={repoId} />
              ))}
            </div>
          </div>
        )}

        {facts.apiBoundaries?.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-success">API Boundaries</h3>
            <div className="space-y-3">
              {facts.apiBoundaries.map((b, i) => (
                <div key={i} className="bg-panel border border-border rounded p-3">
                  <SourceLink path={b.filePath} repoId={repoId} />
                  {b.exports.length > 0 && (
                    <div className="mt-2 text-xs text-muted font-mono">
                      Exports: {b.exports.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium mb-2">Major Components</h3>
          <div className="bg-panel border border-border rounded overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface text-muted text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Component</th>
                  <th className="px-4 py-2 font-medium">Layer</th>
                  <th className="px-4 py-2 font-medium">Files</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {facts.components.map((c, i) => (
                  <tr key={i} className="hover:bg-surface/50">
                    <td className="px-4 py-2 text-white font-mono">{c.name}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs bg-surface border border-border rounded px-1.5 py-0.5">{c.layer}</span>
                    </td>
                    <td className="px-4 py-2 text-muted">{c.fileCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {facts.keyExternalPackages?.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-warning">Key External Packages</h3>
            <div className="flex flex-wrap gap-2">
              {facts.keyExternalPackages.map((pkg, i) => (
                <span key={i} className="text-xs bg-warning/10 text-warning border border-warning/30 px-2 py-1 rounded font-mono">
                  {pkg}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ModuleDoc({ docs, repoId }) {
  if (!docs) return null;

  if (docs.unsupported) {
    return <UnsupportedFileViewer path={docs.path} repoId={repoId} reason={docs.reason} />;
  }

  const { facts, aiInterpretation: ai } = docs;

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="border-b border-border pb-4">
        <h1 className="text-2xl font-mono text-white mb-2 break-all flex items-center gap-2">
          <FileText className="w-6 h-6 text-accent shrink-0" />
          {facts.filePath}
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-surface border border-border rounded px-2 py-1">
            Component: <span className="text-white">{facts.component}</span>
          </span>
          <span className="text-xs bg-surface border border-border rounded px-2 py-1">
            Layer: <span className="text-white">{facts.layer}</span>
          </span>
          {facts.isApiBoundary && (
            <span className="text-xs bg-success/10 border border-success/30 text-success rounded px-2 py-1">
              API Boundary
            </span>
          )}
          <Link 
            to={`/explore/${repoId}/source?path=${encodeURIComponent(facts.filePath)}`}
            className="ml-auto text-xs text-accent hover:underline"
          >
            View Source →
          </Link>
        </div>
      </header>

      {/* AI Module Interpretation */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium flex items-center gap-2">
          <Cpu className="w-5 h-5 text-accent" />
          Module Intelligence
        </h2>
        {ai ? (
          <div className="bg-panel border border-border rounded-lg p-5 space-y-5">
            {ai.responsibility && (
              <div>
                <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Responsibility</h3>
                <p className="text-sm leading-relaxed text-white/90">{ai.responsibility}</p>
              </div>
            )}
            {ai.architectureRole && (
              <div>
                <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Architecture Role</h3>
                <p className="text-sm leading-relaxed text-white/90">{ai.architectureRole}</p>
              </div>
            )}
            {ai.apiNotes && facts.isApiBoundary && (
              <div>
                <h3 className="text-xs text-muted uppercase tracking-wider mb-2">API Notes</h3>
                <p className="text-sm leading-relaxed text-white/90">{ai.apiNotes}</p>
              </div>
            )}
            {ai.inferredDependenciesPurpose && (
              <div>
                <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Dependency Context</h3>
                <p className="text-sm leading-relaxed text-white/90">{ai.inferredDependenciesPurpose}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted italic bg-surface p-4 rounded border border-border">
            AI interpretation is currently unavailable. Viewing deterministic facts only.
          </div>
        )}
      </section>

      {/* Deterministic Module Facts */}
      <section className="space-y-6">
        <h2 className="text-xl font-medium">Relationships & Interfaces</h2>

        {facts.exports?.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Exports ({facts.exports.length})</h3>
            <div className="flex flex-wrap gap-2">
              {facts.exports.map((ex, i) => (
                <span key={i} className="text-xs bg-surface border border-border px-2 py-1 rounded font-mono text-white/90">
                  {ex}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium mb-2">Dependencies ({facts.dependencies?.length || 0})</h3>
            <div className="bg-panel border border-border rounded max-h-64 overflow-y-auto p-2 space-y-1">
              {!facts.dependencies || facts.dependencies.length === 0 ? (
                <p className="text-xs text-muted p-2">No dependencies</p>
              ) : (
                facts.dependencies.map((dep, i) => (
                  <SourceLink key={i} path={dep} repoId={repoId} compact />
                ))
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Dependents ({facts.dependents?.length || 0})</h3>
            <div className="bg-panel border border-border rounded max-h-64 overflow-y-auto p-2 space-y-1">
              {!facts.dependents || facts.dependents.length === 0 ? (
                <p className="text-xs text-muted p-2">No dependents</p>
              ) : (
                facts.dependents.map((dep, i) => (
                  <SourceLink key={i} path={dep} repoId={repoId} compact />
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function SourceLink({ path, repoId, compact = false }) {
  const isPackage = !path.includes('/') && !path.endsWith('.js') && !path.endsWith('.ts');
  
  if (isPackage) {
    return (
      <div className={`flex items-center gap-2 ${compact ? 'p-1.5' : 'bg-surface border border-border p-3'} rounded`}>
        <Layers className={`shrink-0 text-warning ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
        <span className="text-xs font-mono text-white truncate" title={path}>{path}</span>
      </div>
    );
  }

  return (
    <Link 
      to={`/explore/${repoId}/source?path=${encodeURIComponent(path)}`}
      className={`group flex items-center gap-2 ${compact ? 'p-1.5 hover:bg-surface' : 'bg-surface border border-border hover:border-accent/40 p-3'} rounded transition-colors`}
    >
      <FileText className={`shrink-0 text-accent ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
      <span className="text-xs font-mono text-white truncate group-hover:text-accent transition-colors" title={path}>
        {path}
      </span>
    </Link>
  );
}

function UnsupportedFileViewer({ path, repoId, reason }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await repositoryApi.getFile(repoId, path);
        setContent(res.data);
      } catch (err) {
        setError(err.message || 'Failed to load file content.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [repoId, path]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/20 rounded text-warning text-sm">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <p><strong>{reason || "This file type is not parsed for architectural insights."}</strong> Showing raw text content as fallback.</p>
      </div>
      <div className="bg-panel border border-border rounded-lg overflow-hidden flex flex-col">
        <div className="bg-surface border-b border-border px-4 py-2 flex items-center justify-between text-xs font-mono text-muted">
          <span>{path}</span>
        </div>
        <div className="p-4 overflow-auto custom-scrollbar" style={{ maxHeight: '60vh' }}>
          {loading ? (
            <div className="flex items-center gap-2 text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin"/> Loading content...</div>
          ) : error ? (
            <div className="text-danger text-sm">{error}</div>
          ) : (
            <pre className="text-sm font-mono text-white/90 m-0">
              <code>{content}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

