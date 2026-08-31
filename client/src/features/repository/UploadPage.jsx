import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2, AlertCircle, Code, Box, Network, Bot, Clock, FolderOpen } from 'lucide-react';
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
  const [ignorePatterns, setIgnorePatterns] = useState('');
  const [recentRepos, setRecentRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [lastRepoId, setLastRepoId] = useState(null);

  useEffect(() => {
    // Check if there is a last active repository to show the return button
    const savedRepoId = localStorage.getItem('lastRepoId');
    if (savedRepoId) {
      setLastRepoId(savedRepoId);
    }

    // Only load the recent repositories list if we are not in production
    if (!import.meta.env.PROD) {
      async function loadRepos() {
        try {
          const { data } = await repositoryApi.listAll();
          setRecentRepos(data);
        } catch (err) {
          console.error('Failed to load repositories', err);
        } finally {
          setLoadingRepos(false);
        }
      }
      loadRepos();
    } else {
      setLoadingRepos(false);
    }
  }, [navigate]);

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
    try {
      const { data } = await repositoryApi.upload(file, { ignorePatterns }, (evt) => {
        if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      navigate(`/explore/${data.id}`);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div 
      className="min-h-screen lg:h-screen bg-surface flex flex-col pt-8 pb-4 px-4 md:px-8 font-sans text-white lg:overflow-hidden"
    >
      
      {/* Header Section */}
      <div className="w-full max-w-7xl mx-auto mb-6 flex flex-col md:flex-row items-center justify-between gap-4 border-b border-border/50 pb-4 shrink-0">
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <Logo className="w-12 h-12 mb-2" textClass="text-2xl font-bold tracking-tight text-white" showText={true} />
          <p className="text-muted text-sm mt-1 max-w-md leading-relaxed hidden md:block">
            Upload your codebase to extract architecture, map dependencies, and generate intelligent documentation.
          </p>
        </div>
        
        {/* Recent Repositories Dropdown */}
        {!import.meta.env.PROD && !loadingRepos && recentRepos.length > 0 && (
          <div className="w-full md:w-72">
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Recent Workspaces</label>
            <div className="relative">
              <select
                className="w-full appearance-none bg-panel border border-border rounded-lg px-4 py-2 text-sm font-medium text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent cursor-pointer shadow-sm hover:bg-surface-light transition-colors"
                onChange={(e) => {
                  if (e.target.value) navigate(`/explore/${e.target.value}`);
                }}
                defaultValue=""
              >
                <option value="" disabled>Select repository...</option>
                {recentRepos.map(repo => (
                  <option key={repo.id} value={repo.id}>
                    {repo.name} ({new Date(repo.uploadedAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                <Clock className="w-4 h-4" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area - Split Layout */}
      <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
        
        {/* Left Column: Upload Section */}
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

            {/* Selected File Details */}
            {file && !uploading && (
              <div className="mt-3 p-3 bg-surface border border-border rounded-lg flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                  <FileArchiveIcon />
                  <span className="text-sm font-medium truncate" title={file.name}>{file.name}</span>
                </div>
                <span className="text-xs text-muted font-mono bg-panel px-2 py-1 rounded border border-border/50 shrink-0">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
            )}

            {/* Upload Progress */}
            {uploading && (
              <div className="mt-3 p-4 bg-surface border border-border rounded-lg shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    <span className="text-sm font-medium">Extracting & Analyzing...</span>
                  </div>
                  <span className="text-sm font-mono text-muted">{progress}%</span>
                </div>
                <div className="h-1.5 bg-panel rounded-full overflow-hidden border border-border/50">
                  <div
                    className="h-full bg-accent transition-all duration-300 ease-out"
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
              <label className="block text-xs font-medium mb-1.5">
                Ignore Patterns <span className="text-muted font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. tests, docs, assets"
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
        <div className="w-full lg:w-[45%] flex flex-col justify-center lg:min-h-0 py-4">
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
    <div className="bg-panel border border-border p-5 rounded-xl flex flex-col items-start hover:border-accent/50 transition-colors">
      <div className="p-2.5 bg-surface border border-border rounded-lg mb-4">
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
