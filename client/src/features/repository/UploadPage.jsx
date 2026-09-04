import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2, AlertCircle, Code, Box, Network, Bot, Clock, FolderOpen, Eraser, Trash2, Database, Inbox } from 'lucide-react';
import { repositoryApi } from '../../shared/api';
import { Link } from 'react-router-dom';
import { Logo } from '../../shared/components/Logo';

export default function UploadPage() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [ignorePatterns, setIgnorePatterns] = useState('');
  const [recentRepos, setRecentRepos] = useState([]);
  const [hasLoadedRepos, setHasLoadedRepos] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [lastRepoId, setLastRepoId] = useState(null);
  const [selectedRepos, setSelectedRepos] = useState(new Set());
  const [batchActionRunning, setBatchActionRunning] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refreshRepos = async () => {
    setLoadingRepos(true);
    try {
      const { data } = await repositoryApi.listAll();
      setRecentRepos(data);
      setSelectedRepos(new Set());
      setHasLoadedRepos(true);
    } catch (err) {
      console.error('Failed to load repositories', err);
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleLoadRepos = async () => {
    if (!hasLoadedRepos && !loadingRepos) {
      await refreshRepos();
    }
  };

  useEffect(() => {
    const savedRepoId = localStorage.getItem('lastRepoId');
    if (savedRepoId) {
      setLastRepoId(savedRepoId);
    }
    
    handleLoadRepos();
  }, [navigate]);

  const handleBatchAction = async (action) => {
    if (selectedRepos.size === 0) return;
    setBatchActionRunning(true);
    try {
      await repositoryApi.batchManage(Array.from(selectedRepos), action);
      if (action === 'delete') {
        if (selectedRepos.has(lastRepoId)) {
          localStorage.removeItem('lastRepoId');
          setLastRepoId(null);
        }
      }
      await refreshRepos();
    } catch (err) {
      console.error(`Batch ${action} failed:`, err);
      alert(`Failed to perform batch action: ${err.message}`);
    } finally {
      setBatchActionRunning(false);
    }
  };

  const handleToggleSelect = (repoId) => {
    setSelectedRepos(prev => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRepos(new Set(recentRepos.map(r => r.id)));
    } else {
      setSelectedRepos(new Set());
    }
  };

  const handleFile = useCallback((f) => {
    setError(null);
    if (!f.name.endsWith('.zip')) {
      setError('Only ZIP archives are supported.');
      return;
    }
    setFile(f);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = (e) => {
    const f = e.target.files[0];
    if (f) handleFile(f);
  };

  const onUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    setIsSuccess(false);
    try {
      const { data } = await repositoryApi.upload(file, { ignorePatterns }, (evt) => {
        if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      setIsSuccess(true);
      setProgress(100);
      await new Promise(resolve => setTimeout(resolve, 1500));
      navigate(`/explore/${data.id}`);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setIsSuccess(false);
    }
  };

  return (
    <div 
      className={`min-h-screen lg:h-screen bg-surface flex flex-col pt-8 pb-4 px-4 md:px-8 font-sans text-white lg:overflow-hidden transition-opacity ${uploading ? 'pointer-events-none' : ''}`}
    >
      
      <div className="w-full max-w-7xl mx-auto mb-6 flex flex-col md:flex-row items-center justify-between gap-4 border-b border-border/50 pb-4 shrink-0">
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <Logo className="w-12 h-12 mb-2" textClass="text-2xl font-bold tracking-tight text-white" showText={true} />
          <p className="text-muted text-sm mt-1 max-w-md leading-relaxed hidden md:block">
            Upload your codebase to extract architecture, map dependencies, and generate intelligent documentation.
          </p>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
        
        <div className="w-full lg:w-[55%] flex flex-col lg:min-h-0">
          <div className="bg-panel border border-border rounded-2xl shadow-sm flex-1 flex flex-col lg:overflow-hidden relative">
            <div 
              className="flex-1 flex flex-col p-5 md:p-6 lg:overflow-y-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2 shrink-0">
                <FolderOpen className="w-4 h-4 text-accent" />
                Upload New Repository
              </h2>
            
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={[
                'relative rounded-xl p-6 flex flex-col items-center justify-center gap-3 transition-all duration-200 cursor-pointer border-2 border-dashed shrink-0',
                dragging 
                  ? 'border-accent bg-accent/5' 
                  : 'border-border/60 bg-surface/30 hover:bg-surface/60 hover:border-border',
              ].join(' ')}
              onClick={() => document.getElementById('file-input').click()}
            >
              <div className={`p-4 rounded-full mb-1 ${dragging ? 'bg-accent/10 text-accent' : 'bg-surface text-muted'}`}>
                <Upload className="w-8 h-8" />
              </div>
              <div className="text-center">
                <p className="text-base font-medium">
                  {dragging ? 'Drop your archive here' : 'Click or drag .zip archive here'}
                </p>
                <p className="text-muted text-sm mt-1">
                  Maximum file size: {import.meta.env.PROD ? '100 MB' : '2 GB'}
                </p>
              </div>
              <input
                id="file-input"
                type="file"
                accept=".zip"
                className="hidden"
                onChange={onInputChange}
              />
            </div>

            {file && !uploading && (
              <div className="mt-3 p-3 bg-surface border border-border rounded-lg flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                  <FileArchiveIcon className="w-4 h-4 text-muted" />
                  <span className="text-sm font-medium truncate" title={file.name}>{file.name}</span>
                </div>
                <span className="text-xs text-muted font-mono bg-panel px-2 py-1 rounded border border-border/50 shrink-0">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
            )}

            {(uploading || isSuccess) && (
              <div className="w-full mt-4 p-4 rounded-xl border border-border/50 bg-[#161b22] flex flex-col gap-3 shadow-xl">
                <div className="flex justify-between items-center text-white">
                  <span className="text-sm font-medium flex items-center gap-2">
                    {isSuccess ? (
                      <span className="text-success flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Extraction Complete!
                      </span>
                    ) : (
                      'Extracting & Analyzing...'
                    )}
                  </span>
                  {!isSuccess && <span className="text-sm font-mono text-muted">{progress}%</span>}
                </div>
                <div className="w-full bg-panel h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ease-out ${isSuccess ? 'bg-success' : 'bg-accent'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error Handling */}
            {error && (
              <div className="mt-3 p-3 bg-danger/10 border border-danger/20 rounded-lg flex items-start gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                <p className="text-xs text-danger/90 leading-relaxed">{error}</p>
              </div>
            )}

            {/* Ignore Patterns Input */}
            <div className="mt-4 pt-4 border-t border-border/50 shrink-0">
              <label className="block text-sm font-medium text-white mb-1">Additional Ignore Patterns</label>
              <p className="text-xs text-muted mb-2">Standard directories like .git, node_modules, and dist are ignored automatically. Add any extra comma-separated folders to skip.</p>
              <input
                type="text"
                placeholder="e.g. tests, assets, docs"
                value={ignorePatterns}
                onChange={(e) => setIgnorePatterns(e.target.value)}
                disabled={uploading}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
              <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
                By default, <span className="font-mono text-white/80 bg-panel px-1 py-0.5 rounded border border-border/50">.git, node_modules, dist, build, coverage, .next, out</span> are excluded.
              </p>
            </div>

            {/* Action Buttons - Push to bottom if space allows */}
            <div className="mt-auto pt-6 flex flex-col gap-3 shrink-0">
              <button
                onClick={onUpload}
                disabled={!file || uploading}
                className={[
                  'w-full py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2',
                  file && !uploading
                    ? 'bg-accent hover:bg-accent-hover text-white'
                    : 'bg-surface border border-border text-muted cursor-not-allowed',
                ].join(' ')}
              >
                {uploading ? 'Processing Repository...' : 'Analyze Repository'}
              </button>

              {/* Return to active repository escape hatch */}
              {lastRepoId && (
                <button
                  onClick={() => navigate(`/explore/${lastRepoId}`)}
                  className="w-full py-3 rounded-lg text-sm font-medium transition-colors border border-border bg-transparent hover:bg-surface text-muted hover:text-white"
                >
                  Return to Active Repository
                </button>
              )}
            </div>
            {/* Spacer to prevent content from touching bottom border when scrolled */}
            <div className="shrink-0 h-2 mt-2" />
            </div>
          </div>
        </div>

        {/* Right Column: Feature Grid */}
        <div className="w-full lg:w-[45%] flex flex-col lg:min-h-0">
          <div className="bg-panel border border-border rounded-2xl shadow-sm flex-1 flex flex-col lg:overflow-hidden relative">
            <div 
              className="flex-1 flex flex-col p-5 md:p-6 justify-center lg:overflow-y-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              
              {/* Recent Workspaces Box */}
          {!import.meta.env.PROD && (
            <div className="bg-panel border border-border rounded-xl p-5 shadow-sm mb-6 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Recent Workspaces</label>
                <div className="relative" ref={dropdownRef}>
                  <div
                    className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm font-medium text-white flex items-center justify-between cursor-pointer shadow-sm hover:bg-surface-light transition-colors"
                    onClick={() => {
                      if (!loadingRepos) setIsDropdownOpen(!isDropdownOpen);
                    }}
                  >
                    <span className={loadingRepos ? "text-white/50" : "text-white"}>
                      {loadingRepos ? 'Loading...' : 'Select repository...'}
                    </span>
                    <div className="pointer-events-none text-muted flex items-center gap-2">
                      {loadingRepos ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : recentRepos.length > 0 ? (
                        <Database className="w-4 h-4" />
                      ) : (
                        <Inbox className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                  
                  {isDropdownOpen && !loadingRepos && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1.5 bg-panel border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-[240px] overflow-y-auto">
                      {recentRepos.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-muted text-center">No recent workspaces found</div>
                      ) : (
                        recentRepos.map(repo => (
                          <div 
                            key={repo.id}
                            className="px-4 py-2.5 text-sm font-medium text-white hover:bg-surface cursor-pointer transition-colors flex items-center justify-between group"
                            onClick={() => {
                              setIsDropdownOpen(false);
                              navigate(`/explore/${repo.id}`);
                            }}
                          >
                            <span className="truncate group-hover:text-accent transition-colors">{repo.name}</span>
                            <span className="text-muted font-normal text-xs ml-2 shrink-0">{new Date(repo.uploadedAt).toLocaleDateString()}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="w-full sm:w-auto mt-2 sm:mt-0 self-end">
                <button
                  onClick={async () => {
                    await handleLoadRepos();
                    setShowManager(true);
                  }}
                  disabled={loadingRepos}
                  className="w-full sm:w-auto px-4 py-2.5 h-[42px] bg-surface hover:bg-surface-light border border-border rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  title="Manage Workspaces"
                >
                  {loadingRepos ? <Loader2 className="w-4 h-4 text-accent animate-spin" /> : <FolderOpen className="w-4 h-4 text-accent" />}
                  Manage
                </button>
              </div>
            </div>
          )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FeatureCard 
                  icon={<Network className="w-5 h-5 text-blue-400" />}
                  title="Dependency Mapping"
                  desc="Visualize cross-file relationships and data flow."
                />
                <FeatureCard 
                  icon={<Box className="w-5 h-5 text-green-400" />}
                  title="Architecture Extraction"
                  desc="Automatically extract logical layers and components."
                />
                <FeatureCard 
                  icon={<Bot className="w-5 h-5 text-purple-400" />}
                  title="AI Refactoring"
                  desc="Identify bottlenecks and get structural advice."
                />
                <FeatureCard 
                  icon={<Code className="w-5 h-5 text-orange-400" />}
                  title="Automated Docs"
                  desc="Generate up-to-date documentation on the fly."
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workspace Manager Modal */}
      {showManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-panel border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 md:p-6 border-b border-border/50 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-accent" />
                Manage Workspaces
              </h2>
              
              <div className="flex items-center gap-3">
                {selectedRepos.size > 0 && (
                  <div className="flex items-center gap-2 mr-4 border-r border-border/50 pr-4">
                    {selectedRepos.has(lastRepoId) && (
                      <span className="text-[11px] font-medium text-orange-400 mr-2 flex items-center gap-1 hidden md:flex bg-orange-500/10 px-2 py-1 rounded border border-orange-500/20">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Modifying active workspace
                      </span>
                    )}
                    <button 
                      onClick={() => handleBatchAction('clear_analysis')}
                      disabled={batchActionRunning}
                      className="px-3 py-1.5 text-xs font-medium bg-surface hover:bg-surface-light border border-border rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 text-orange-400/90 hover:text-orange-400"
                      title="Delete analysis data to re-analyze"
                    >
                      {batchActionRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}
                      Clear Analysis
                    </button>
                    <button 
                      onClick={() => handleBatchAction('delete')}
                      disabled={batchActionRunning}
                      className="px-3 py-1.5 text-xs font-medium bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      title="Permanently delete workspaces"
                    >
                      {batchActionRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Delete
                    </button>
                  </div>
                )}
                
                <button 
                  onClick={() => setShowManager(false)}
                  className="p-1.5 text-muted hover:text-white bg-surface hover:bg-surface-light rounded-lg transition-colors border border-border"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
            </div>
            
            {/* List Header */}
            <div className="px-5 py-3 border-b border-border/50 bg-surface/50 flex items-center gap-4 text-xs font-semibold text-muted uppercase tracking-wider shrink-0">
              <input 
                type="checkbox" 
                className="rounded border-border bg-surface text-accent focus:ring-accent focus:ring-offset-0 cursor-pointer"
                checked={recentRepos.length > 0 && selectedRepos.size === recentRepos.length}
                onChange={handleSelectAll}
              />
              <span className="flex-1">Workspace</span>
              <span className="w-24 text-right">Status</span>
            </div>

            {/* Scrollable List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {loadingRepos ? (
                <div className="flex flex-col items-center justify-center p-12 text-muted">
                  <Loader2 className="w-10 h-10 mb-4 animate-spin text-accent" />
                  <p>Loading workspaces...</p>
                </div>
              ) : recentRepos.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-muted">
                  <FolderOpen className="w-12 h-12 mb-4 opacity-20" />
                  <p>No workspaces found.</p>
                </div>
              ) : (
                recentRepos.map(repo => {
                  const isSelected = selectedRepos.has(repo.id);
                  const isReady = repo.status === 'ready';
                  return (
                    <div 
                      key={repo.id}
                      onClick={() => handleToggleSelect(repo.id)}
                      className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-accent/10 border border-accent/20' : 'hover:bg-surface border border-transparent'}`}
                    >
                      <input 
                        type="checkbox" 
                        className="rounded border-border bg-surface text-accent focus:ring-accent focus:ring-offset-0 pointer-events-none"
                        checked={isSelected}
                        readOnly
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-white truncate">{repo.name}</h3>
                          {repo.id === lastRepoId && (
                            <span className="text-[10px] font-medium bg-accent/20 text-accent px-1.5 py-0.5 rounded border border-accent/20 uppercase tracking-wider shrink-0">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted mt-0.5 truncate">
                          Analyzed {new Date(repo.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border ${isReady ? 'bg-green-500/10 text-green-400 border-green-500/20' : repo.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                          {repo.status}
                        </span>
                        
                        <button
                          onClick={() => {
                            setShowManager(false);
                            navigate(`/explore/${repo.id}`);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isReady ? 'bg-accent hover:bg-accent-hover text-white' : 'bg-surface border border-border text-muted hover:text-white'}`}
                        >
                          {isReady ? 'Open' : 'View'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-4 text-center shrink-0 w-full border-t border-border/50 pt-4 max-w-7xl mx-auto">
        <p className="text-xs text-muted">
          CodeLens runs static analysis locally. Your code is processed securely.
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="bg-surface border border-border p-5 rounded-xl flex flex-col items-start hover:border-accent/50 transition-colors h-full">
      <div className="p-2.5 bg-panel border border-border rounded-lg mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <p className="text-muted text-xs leading-relaxed">{desc}</p>
    </div>
  );
}

function FileArchiveIcon() {
  return (
    <div className="w-8 h-8 rounded bg-panel border border-border flex items-center justify-center text-accent">
      <svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 5L8.5 0.5H2C1.44772 0.5 1 0.947715 1 1.5V14.5C1 15.0523 1.44772 15.5 2 15.5H12C12.5523 15.5 13 15.0523 13 14.5V5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 1V5H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 6.5V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 11.5H5.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
