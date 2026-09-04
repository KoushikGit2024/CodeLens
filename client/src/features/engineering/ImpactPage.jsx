import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Activity, CheckSquare, Loader2 } from 'lucide-react';
import { repositoryApi } from '../../shared/api';
import { useRepository } from '../../shared/context/RepositoryContext';
import PageHeader from '../../shared/components/PageHeader';
import { ResizableLayout } from '../../shared/components/ResizableLayout';

export default function ImpactPage() {
  const { repoId } = useParams();
  const { repo, loading: repoLoading, error: repoError } = useRepository();
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // File selection state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Extract all file paths from the repository analysis
  const allFiles = repo?.analysis?.files?.map(f => f.filePath) || [];
  const filteredFiles = allFiles.filter(f => f.toLowerCase().includes(searchTerm.toLowerCase()));

  const analyzeImpact = async () => {
    if (selectedFiles.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const impactRes = await repositoryApi.getChangeImpact(repoId, selectedFiles);
      setImpact(impactRes.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleFile = (filePath) => {
    setSelectedFiles(prev => 
      prev.includes(filePath) ? prev.filter(f => f !== filePath) : [...prev, filePath]
    );
  };

  const highlightMatch = (text, query) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() 
            ? <span key={i} className="bg-accent/40 text-white font-semibold rounded-sm px-0.5">{part}</span> 
            : part
        )}
      </>
    );
  };

  if (repoLoading) return <div className="p-8 text-white">Loading repository data...</div>;
  if (repoError) return <div className="p-8 text-red-400">Error: {repoError}</div>;

  return (
    <div className="flex flex-col h-full bg-surface">
      <ResizableLayout
        panels={[
          {
            id: 'impact-results',
            defaultSize: 70,
            minWidth: 400,
            content: (
              <main className="flex-1 overflow-auto custom-scrollbar flex flex-col bg-surface/50 h-full">
                <div className="px-6 pt-6 shrink-0">
                  <PageHeader 
                    title="Change Impact Analysis" 
                    description="Select files that you plan to modify. The deterministic engine will traverse the dependency graph to identify exactly which files and architectural components will be affected downstream."
                    icon={Activity}
                  />
                </div>
                <div className="flex-1 p-6 pt-2">
                  {!impact ? (
                    <div className="flex-1 h-full flex flex-col items-center justify-center text-muted gap-3">
                      <Activity className="w-8 h-8 opacity-50" />
                      <p className="text-sm">Select files from the sidebar and click "Analyze Impact".</p>
                    </div>
                  ) : (
                    <div className="max-w-4xl w-full mx-auto space-y-6 pb-12">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Changed Files */}
                      <div className="bg-panel rounded border border-border shadow-sm flex flex-col h-64">
                        <div className="px-4 py-3 border-b border-border bg-surface/50">
                          <h2 className="text-sm font-semibold text-white">Changed Files</h2>
                        </div>
                        <ul className="p-4 space-y-1.5 flex-1 overflow-auto custom-scrollbar">
                          {impact?.changedFiles?.map(f => (
                            <li key={f} className="text-xs font-mono text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded whitespace-nowrap">
                              <Link to={`/explore/${repoId}/source?path=${encodeURIComponent(f)}`} className="hover:underline">
                                {f}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Affected Components */}
                      <div className="bg-panel rounded border border-border shadow-sm flex flex-col h-64">
                        <div className="px-4 py-3 border-b border-border bg-surface/50">
                          <h2 className="text-sm font-semibold text-white">Affected Components</h2>
                        </div>
                        <ul className="p-4 space-y-1.5 flex-1 overflow-auto custom-scrollbar">
                          {impact?.affectedComponents?.length === 0 ? (
                            <li className="text-xs text-muted italic">No components affected.</li>
                          ) : impact?.affectedComponents?.map(c => (
                            <li key={c} className="text-xs font-medium text-purple-400 bg-purple-400/10 px-2 py-1 rounded whitespace-nowrap">
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Direct Dependents */}
                      <div className="bg-panel rounded border border-border shadow-sm flex flex-col h-72">
                        <div className="px-4 py-3 border-b border-border bg-surface/50 flex justify-between items-center">
                          <h2 className="text-sm font-semibold text-white">Directly Affected Files</h2>
                          <span className="text-xs text-white/70 bg-white/10 px-2 py-0.5 rounded-full">
                            {impact?.directlyAffectedFiles?.length || 0}
                          </span>
                        </div>
                        <ul className="p-4 space-y-1.5 flex-1 overflow-auto custom-scrollbar">
                          {impact?.directlyAffectedFiles?.length === 0 ? (
                            <li className="text-xs text-muted italic">No files directly depend on the changes.</li>
                          ) : impact?.directlyAffectedFiles?.map(f => (
                            <li key={f} className="text-xs font-mono text-orange-400 bg-orange-400/10 px-2 py-1 rounded whitespace-nowrap">
                              <Link to={`/explore/${repoId}/source?path=${encodeURIComponent(f)}`} className="hover:underline">
                                {f}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Transitive Dependents */}
                      <div className="bg-panel rounded border border-border shadow-sm flex flex-col h-72">
                        <div className="px-4 py-3 border-b border-border bg-surface/50 flex justify-between items-center">
                          <h2 className="text-sm font-semibold text-white">Transitively Affected Files</h2>
                          <span className="text-xs text-white/70 bg-white/10 px-2 py-0.5 rounded-full">
                            {impact?.transitivelyAffectedFiles?.length || 0}
                          </span>
                        </div>
                        <ul className="p-4 space-y-1.5 flex-1 overflow-auto custom-scrollbar">
                          {impact?.transitivelyAffectedFiles?.length === 0 ? (
                            <li className="text-xs text-muted italic">No downstream files affected.</li>
                          ) : impact?.transitivelyAffectedFiles?.map(f => (
                            <li key={f} className="text-xs font-mono text-danger bg-danger/10 px-2 py-1 rounded whitespace-nowrap">
                              <Link to={`/explore/${repoId}/source?path=${encodeURIComponent(f)}`} className="hover:underline">
                                {f}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                    </div>
                  </div>
                )}
                </div>
              </main>
            )
          },
          {
            id: 'file-selector',
            defaultSize: 30,
            minWidth: 250,
            collapsible: true,
            collapseDirection: 'right',
            title: 'Files to Modify',
            icon: <CheckSquare />,
            content: (
              <aside className="flex-1 flex flex-col bg-panel h-full p-4 overflow-hidden">
                <input 
                  type="text"
                  placeholder="Search files..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent mb-4 shrink-0"
                />
                
                <div className="flex-1 overflow-auto custom-scrollbar border border-border rounded bg-surface p-2 mb-4">
                  {filteredFiles.length === 0 ? (
                    <div className="text-sm text-muted p-2 text-center">No files found.</div>
                  ) : (
                    filteredFiles.map(filePath => (
                      <label key={filePath} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded cursor-pointer transition-colors">
                        <input 
                          type="checkbox"
                          checked={selectedFiles.includes(filePath)}
                          onChange={() => toggleFile(filePath)}
                          className="rounded border-border text-accent focus:ring-accent bg-panel"
                        />
                        <span className="text-xs text-white/80 font-mono whitespace-nowrap" title={filePath}>
                          {highlightMatch(filePath, searchTerm)}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                
                <div className="flex flex-col gap-3 shrink-0 pt-2 border-t border-border">
                  <div className="text-xs text-muted flex justify-between">
                    <span>{selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected</span>
                    {selectedFiles.length > 0 && (
                      <button onClick={() => setSelectedFiles([])} className="text-accent hover:underline">Clear</button>
                    )}
                  </div>
                  <button 
                    onClick={analyzeImpact}
                    disabled={selectedFiles.length === 0 || loading}
                    className="w-full bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Analyze Impact
                  </button>
                  {error && <div className="p-2 bg-danger/10 text-danger text-xs rounded border border-danger/20">{error}</div>}
                </div>
              </aside>
            )
          }
        ]}
      />
    </div>
  );
}
