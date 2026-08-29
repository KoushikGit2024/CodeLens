import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2, AlertCircle, Code, Box, Network, Bot } from 'lucide-react';
import { repositoryApi } from '../../shared/api';
import { Logo } from '../../shared/components/Logo';

export default function UploadPage() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [ignorePatterns, setIgnorePatterns] = useState('');

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
    <div className="min-h-screen bg-surface flex flex-col items-center pt-24 pb-12 px-6 font-sans">
      
      {/* Hero Section */}
      <div className="text-center max-w-2xl mb-12 flex flex-col items-center">
        <Logo className="w-20 h-20 mb-4" textClass="text-4xl md:text-5xl" showText={true} />
        <p className="text-muted text-lg font-light leading-relaxed mt-4">
          AI-driven code intelligence and automated documentation platform. 
          Upload your repository to instantly generate architectural insights and dependency graphs.
        </p>
      </div>

      {/* Main Upload Interface */}
      <div className="w-full max-w-xl mb-20">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={[
            'relative rounded-2xl p-10 flex flex-col items-center gap-5 transition-all duration-300 cursor-pointer backdrop-blur-sm',
            dragging 
              ? 'border-2 border-accent bg-accent/5 scale-[1.02] shadow-2xl shadow-accent/10' 
              : 'border border-border/50 bg-panel/50 hover:bg-panel hover:border-border hover:shadow-xl',
          ].join(' ')}
          onClick={() => document.getElementById('file-input').click()}
        >
          <div className="w-16 h-16 rounded-full bg-surface/80 border border-border flex items-center justify-center shadow-inner">
            <Upload className={`w-8 h-8 transition-colors ${dragging ? 'text-accent' : 'text-muted'}`} />
          </div>
          <div className="text-center">
            <p className="text-white text-lg font-medium tracking-wide">
              {dragging ? 'Drop repository here' : 'Select repository archive'}
            </p>
            <p className="text-muted text-sm mt-1.5 font-light">
              Drag and drop your .zip file, or click to browse (max 100 MB)
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
          <div className="mt-4 px-5 py-4 bg-panel/80 border border-border/60 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3 overflow-hidden">
              <FileArchiveIcon />
              <span className="text-sm font-medium text-white truncate">{file.name}</span>
            </div>
            <span className="text-xs text-muted font-mono ml-4 shrink-0 px-2 py-1 bg-surface rounded-md border border-border/40">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
        )}

        {/* Upload Progress */}
        {uploading && (
          <div className="mt-4 p-5 bg-panel/80 border border-border/60 rounded-xl shadow-sm animate-in fade-in duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-accent animate-spin" />
                <span className="text-sm font-medium text-white">Extracting & Analyzing...</span>
              </div>
              <span className="text-xs font-mono text-accent">{progress}%</span>
            </div>
            <div className="h-1.5 bg-surface rounded-full overflow-hidden border border-border/40">
              <div
                className="h-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Handling */}
        {error && (
          <div className="mt-4 px-5 py-4 bg-danger/5 border border-danger/20 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <AlertCircle className="w-5 h-5 text-danger shrink-0" />
            <p className="text-sm text-danger/90 leading-relaxed">{error}</p>
          </div>
        )}

        {/* Ignore Patterns Input */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-white mb-2 ml-1">
            Ignore Patterns (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. build, tests, docs"
            value={ignorePatterns}
            onChange={(e) => setIgnorePatterns(e.target.value)}
            disabled={uploading}
            className="w-full px-4 py-2.5 bg-surface/50 border border-border rounded-xl text-sm text-white placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent transition-all duration-300"
          />
        </div>

        {/* Action Button */}
        <button
          onClick={onUpload}
          disabled={!file || uploading}
          className={[
            'mt-6 w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-300 shadow-lg',
            file && !uploading
              ? 'bg-white text-black hover:bg-gray-200 hover:scale-[1.01] hover:shadow-white/20'
              : 'bg-panel border border-border text-muted cursor-not-allowed shadow-none',
          ].join(' ')}
        >
          {uploading ? 'Processing Repository...' : 'Analyze Repository'}
        </button>
      </div>

      {/* Feature Grid */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-4">
        <FeatureCard 
          icon={Code} 
          title="Static Analysis" 
          desc="Deep AST parsing to understand dependencies and structure offline." 
        />
        <FeatureCard 
          icon={Network} 
          title="Dependency Graphs" 
          desc="Interactive visualization of internal connections and external packages." 
        />
        <FeatureCard 
          icon={Box} 
          title="Architecture Insights" 
          desc="Automated component detection and layer grouping for legacy code." 
        />
        <FeatureCard 
          icon={Bot} 
          title="AI Assistant" 
          desc="Context-aware chat utilizing your specific repository data structure." 
        />
      </div>

      {/* Footer */}
      <footer className="mt-20 text-center pb-8">
        <p className="text-xs text-muted/60 font-mono">
          CodeLens runs static analysis locally. Your code is processed securely.
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }) {
  return (
    <div className="bg-panel/30 border border-border/40 rounded-2xl p-6 flex flex-col items-start gap-4 hover:bg-panel/60 hover:border-border/60 transition-colors">
      <div className="w-10 h-10 rounded-xl bg-surface border border-border/50 flex items-center justify-center">
        <Icon className="w-5 h-5 text-accent/80" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
        <p className="text-xs text-muted leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function FileArchiveIcon() {
  return (
    <div className="w-8 h-8 rounded-lg bg-surface border border-border/60 flex items-center justify-center">
      <svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-accent">
        <path d="M13 5L8.5 0.5H2C1.44772 0.5 1 0.947715 1 1.5V14.5C1 15.0523 1.44772 15.5 2 15.5H12C12.5523 15.5 13 15.0523 13 14.5V5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 1V5H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 6.5V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 11.5H5.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
