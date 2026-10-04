/**
 * UploadPage.jsx
 *
 * It provides the drag-and-drop workspace UI, then extracts the provided ZIP archive entirely client-side,
 * and then it applies the files to IndexedDB before launching the Web Worker analysis.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Upload,
  Loader2,
  AlertCircle,
  Code,
  Box,
  Network,
  Bot,
  FolderOpen,
  Eraser,
  Trash2,
  Database,
  Inbox,
  FolderInput,
  AlertTriangle,
  X,
  Clock,
  Brain,
  Activity,
  Info,
  Github,
} from 'lucide-react';
import { repositoryApi } from '../../shared/api';
import { Logo } from '../../shared/components/Logo';
import UserAvatarWidget from '../account/UserAvatarWidget';
import ThemeSwitcher from '../../shared/components/ThemeSwitcher';
import JSZip from 'jszip';
import { useToast } from '../../shared/context/ToastContext';

// ── Size / count thresholds for large-folder warning ──────────────────────────
const WARN_FILE_COUNT = 500; // warn if more than this many files
const WARN_SIZE_MB = 50; // warn if total raw size > this many MB

// ── Default paths to exclude when reading a folder ───────────────────────────
const DEFAULT_IGNORES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  '.DS_Store',
  'Thumbs.db',
]);

function shouldIgnore(relativePath, extra = []) {
  const parts = relativePath.split('/');
  const extraSet = new Set(
    extra.flatMap(p =>
      p
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    )
  );
  return parts.some(p => DEFAULT_IGNORES.has(p) || extraSet.has(p));
}

/** Convert the FileList from a webkitdirectory input into a JSZip Blob */
async function folderToZip(fileList, ignorePatterns) {
  const zip = new JSZip();
  for (const file of Array.from(fileList)) {
    const rel = file.webkitRelativePath || file.name;
    if (shouldIgnore(rel, [ignorePatterns])) continue;
    const buf = await file.arrayBuffer();
    zip.file(rel, buf);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } });
}

/** Summarise a FileList for display */
function summariseFolder(fileList, ignorePatterns) {
  let count = 0,
    bytes = 0;
  for (const f of Array.from(fileList)) {
    if (shouldIgnore(f.webkitRelativePath || f.name, [ignorePatterns])) continue;
    count++;
    bytes += f.size;
  }
  return { count, mb: bytes / 1024 / 1024 };
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null); // ZIP File object
  const [folderName, setFolderName] = useState(null); // display name when folder was picked
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
  const [inputMode, setInputMode] = useState('zip'); // 'zip' | 'folder' | 'github'
  const [githubUrl, setGithubUrl] = useState('');
  const [fetchAllBranches, setFetchAllBranches] = useState(false);
  const [cloningPhase, setCloningPhase] = useState('');
  const [currentFile, setCurrentFile] = useState('');
  const [packingFolder, setPackingFolder] = useState(false); // zipping in-browser
  const [largeWarning, setLargeWarning] = useState(null); // { count, mb, proceed }
  const dropdownRef = useRef(null);
  const folderInputRef = useRef(null);
  const { addToast } = useToast();

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

      const savedRepoId = localStorage.getItem('lastRepoId');
      if (savedRepoId) {
        if (data.some(r => r.id === savedRepoId)) {
          setLastRepoId(savedRepoId);
        } else {
          localStorage.removeItem('lastRepoId');
          setLastRepoId(null);
        }
      }
    } catch (err) {
      console.error('Failed to load repositories', err);
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleLoadRepos = async () => {
    if (!hasLoadedRepos && !loadingRepos) await refreshRepos();
  };

  useEffect(() => {
    // We don't set lastRepoId immediately from localStorage anymore.
    // It will be set after refreshRepos confirms it still exists in the database.
    handleLoadRepos();
  }, [navigate]);

  const handleBatchAction = async action => {
    if (selectedRepos.size === 0) return;
    if (action === 'delete') {
      const confirmed = window.confirm(
        `Are you sure you want to permanently delete ${selectedRepos.size} workspace(s)? This action cannot be undone.`
      );
      if (!confirmed) return;
    } else if (action === 'clear_analysis') {
      const confirmed = window.confirm(
        `Are you sure you want to clear the analysis data for ${selectedRepos.size} workspace(s)?`
      );
      if (!confirmed) return;
    }
    setBatchActionRunning(true);
    try {
      await repositoryApi.batchManage(Array.from(selectedRepos), action);
      if (action === 'delete' && selectedRepos.has(lastRepoId)) {
        localStorage.removeItem('lastRepoId');
        setLastRepoId(null);
      }

      addToast({
        title: 'Success',
        description: `Successfully performed ${action.replace('_', ' ')} on ${selectedRepos.size} workspace(s).`,
        type: 'success',
      });

      await refreshRepos();
    } catch (err) {
      addToast({
        title: 'Batch Action Failed',
        description: err.message || 'An unexpected error occurred.',
        type: 'error',
      });
    } finally {
      setBatchActionRunning(false);
    }
  };

  const handleToggleSelect = repoId => {
    setSelectedRepos(prev => {
      const next = new Set(prev);
      next.has(repoId) ? next.delete(repoId) : next.add(repoId);
      return next;
    });
  };

  const handleSelectAll = e => {
    setSelectedRepos(e.target.checked ? new Set(recentRepos.map(r => r.id)) : new Set());
  };

  // ── ZIP file handler ────────────────────────────────────────────────────────
  const handleFile = useCallback(f => {
    setError(null);
    setFolderName(null);
    if (!f.name.endsWith('.zip')) {
      setError('Only ZIP archives are supported.');
      return;
    }
    setFile(f);
  }, []);

  const onDrop = useCallback(
    e => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const onInputChange = e => {
    const f = e.target.files[0];
    if (f) handleFile(f);
  };

  // ── Folder handler ──────────────────────────────────────────────────────────
  const onFolderChange = useCallback(
    async e => {
      setError(null);
      setFile(null);
      setFolderName(null);
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      const { count, mb } = summariseFolder(fileList, ignorePatterns);
      const rootName = (fileList[0]?.webkitRelativePath || '').split('/')[0] || 'Selected Folder';

      const doPackage = async () => {
        setFile(fileList);
        setFolderName(`${rootName} (${count.toLocaleString()} files, ${mb.toFixed(1)} MB)`);
        setLargeWarning(null);
      };

      if (count > WARN_FILE_COUNT || mb > WARN_SIZE_MB) {
        // Show warning — pass the actual do-packaging callback to the modal
        setLargeWarning({ count, mb, rootName, onProceed: doPackage });
      } else {
        await doPackage();
      }
    },
    [ignorePatterns]
  );

  // ── Upload ──────────────────────────────────────────────────────────────────
  const onUpload = async () => {
    if (inputMode === 'github') {
      if (!githubUrl || !githubUrl.includes('github.com')) {
        setError('Please enter a valid GitHub repository URL.');
        return;
      }
    } else {
      if (!file) return;
    }

    setUploading(true);
    setError(null);
    setProgress(0);
    setIsSuccess(false);
    setCloningPhase('');
    setCurrentFile('');
    try {
      let data;
      if (inputMode === 'github') {
        const res = await repositoryApi.importFromGitHub(githubUrl, { ignorePatterns, fetchAllBranches }, evt => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
          if (evt.phase) setCloningPhase(evt.phase);
          if (evt.currentFile) setCurrentFile(evt.currentFile);
        });
        data = res.data;
      } else if (file instanceof FileList) {
        const rootName = (file[0]?.webkitRelativePath || '').split('/')[0] || 'Selected Folder';
        const res = await repositoryApi.uploadDirectory(file, rootName, { ignorePatterns }, evt => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
          if (evt.currentFile) setCurrentFile(evt.currentFile);
        });
        data = res.data;
      } else {
        const res = await repositoryApi.upload(file, { ignorePatterns }, evt => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
          if (evt.currentFile) setCurrentFile(evt.currentFile);
        });
        data = res.data;
      }
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

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(1) : null;

  return (
    <div
      className={`h-[100dvh] bg-surface flex flex-col pt-6 md:pt-8 pb-4 md:pb-6 px-4 md:px-8 font-sans text-text overflow-y-auto overflow-x-hidden transition-opacity ${uploading || packingFolder ? 'pointer-events-none' : ''}`}
    >
      {/* ── Large-Folder Warning Modal ─────────────────────────────────────── */}
      {largeWarning && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70"
          style={{ backdropFilter: 'blur(4px)' }}
        >
          <div
            className="bg-panel border border-warning/40 rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4"
            style={{ background: 'linear-gradient(135deg,#0d1117ee,#1a1200ee)' }}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-warning/10 border border-warning/30 shrink-0">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-text mb-1">Large Folder Detected</h2>
                <p className="text-sm text-muted leading-relaxed">
                  <span className="font-semibold text-text">{largeWarning.rootName}</span> contains{' '}
                  <span className="text-warning font-semibold">{largeWarning.count.toLocaleString()} files</span> (
                  {largeWarning.mb.toFixed(1)} MB after filtering). Analysis of very large codebases may:
                </p>
              </div>
            </div>

            <ul className="text-sm text-muted space-y-2 pl-2 border-l-2 border-warning/30">
              <li className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-warning" /> Take several minutes to complete
              </li>
              <li className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-warning" /> Use significant browser memory
              </li>
              <li className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-warning" /> Slow down other browser tabs
              </li>
            </ul>

            <div className="rounded-lg bg-surface/60 border border-border/60 p-3 text-xs text-muted">
              <span className="font-medium text-text">Tip:</span> Add folder names to the ignore list below to skip
              large asset or vendor directories before proceeding.
            </div>

            <div className="flex gap-3 mt-1">
              <button
                onClick={() => {
                  setLargeWarning(null);
                  if (folderInputRef.current) folderInputRef.current.value = '';
                }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-border bg-surface hover:bg-surface/80 transition-colors text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                onClick={largeWarning.onProceed}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-warning/90 hover:bg-warning text-black transition-colors flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-7xl mx-auto mb-6 md:mb-8 border-b border-border/50 pb-5 md:pb-6 shrink-0">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex flex-col items-start text-left">
            <Logo className="w-10 h-10 md:w-12 md:h-12 mb-1.5 md:mb-2" textClass="text-xl md:text-2xl font-bold tracking-tight text-text" showText={true} />
            <p className="text-muted text-[13px] md:text-sm mt-1 max-w-[280px] sm:max-w-sm md:max-w-md leading-relaxed">
              Upload your codebase to extract architecture, map dependencies, and generate intelligent documentation.
            </p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 shrink-0 mt-2 sm:mt-0 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-2 sm:gap-4 bg-surface/50 sm:bg-transparent p-1.5 sm:p-0 rounded-xl border border-border/50 sm:border-transparent flex-1 sm:flex-none justify-evenly sm:justify-start">
              <Link
                to="/about"
                className="text-sm font-medium text-muted hover:text-text transition-colors flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface"
              >
                <Info className="w-4 h-4" /> About
              </Link>
              <div className="h-4 w-px bg-border" />
              <ThemeSwitcher />
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="shrink-0">
              <UserAvatarWidget />
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col lg:flex-row gap-6 md:gap-8 lg:min-h-0 mb-4 md:mb-6">
        {/* ── Left Column: Upload ──────────────────────────────────────────────── */}
        <div className="w-full lg:w-[55%] flex flex-col lg:min-h-0">
          <div className="bg-panel border border-border rounded-2xl shadow-sm flex-1 flex flex-col lg:overflow-hidden relative">
            {/* ── Fixed Header & Tabs ── */}
            <div className="p-5 md:p-6 pb-0 shrink-0">
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2 shrink-0">
                <FolderOpen className="w-4 h-4 text-accent" />
                Upload New Repository
              </h2>

              {/* ── Mode Tab Toggle ──────────────────────────────────────────── */}
              <div className="flex rounded-lg border border-border overflow-hidden mb-4 shrink-0 text-sm">
                <button
                  onClick={() => {
                    setInputMode('zip');
                    setFile(null);
                    setFolderName(null);
                    setError(null);
                  }}
                  className={`flex-1 py-2 font-medium flex items-center justify-center gap-2 transition-colors
                    ${inputMode === 'zip' ? 'bg-accent/15 text-accent border-r border-accent/30' : 'text-muted hover:text-text hover:bg-surface/50'}`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  ZIP Archive
                </button>
                <button
                  onClick={() => {
                    setInputMode('folder');
                    setFile(null);
                    setFolderName(null);
                    setError(null);
                  }}
                  className={`flex-1 py-2 font-medium flex items-center justify-center gap-2 transition-colors
                    ${inputMode === 'folder' ? 'bg-accent/15 text-accent border-x border-accent/30' : 'text-muted hover:text-text hover:bg-surface/50'}`}
                >
                  <FolderInput className="w-3.5 h-3.5" />
                  Select Folder
                </button>
                <button
                  onClick={() => {
                    setInputMode('github');
                    setFile(null);
                    setFolderName(null);
                    setError(null);
                  }}
                  className={`flex-1 py-2 font-medium flex items-center justify-center gap-2 transition-colors
                    ${inputMode === 'github' ? 'bg-accent/15 text-accent border-l border-accent/30' : 'text-muted hover:text-text hover:bg-surface/50'}`}
                >
                  <Github className="w-3.5 h-3.5" />
                  GitHub URL
                </button>
              </div>
            </div>

            {/* ── Scrollable Form Area ── */}
            <div
              className="flex-1 flex flex-col px-5 md:px-6 pb-5 md:pb-6 lg:overflow-y-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {/* ── Drop Zone ───────────────────────────────────────────────── */}
              {inputMode === 'github' ? (
                <div className="relative rounded-xl p-6 flex flex-col items-center justify-center gap-4 border border-border/60 bg-surface/30 shrink-0">
                  <div className="p-4 rounded-full mb-1 bg-surface text-muted">
                    <Github className="w-8 h-8" />
                  </div>
                  <div className="text-center w-full">
                    <p className="text-base font-medium">Import from GitHub</p>
                    <p className="text-muted text-sm mt-1 mb-4">
                      Enter a public GitHub repository URL to import it directly.
                    </p>
                    <input
                      type="url"
                      placeholder="https://github.com/facebook/react"
                      value={githubUrl}
                      onChange={e => setGithubUrl(e.target.value)}
                      className="w-full max-w-md px-4 py-2.5 rounded-lg bg-surface border border-border focus:outline-none focus:border-accent text-sm mb-5"
                    />
                    
                    <div className="flex items-start justify-center w-full max-w-md mx-auto">
                      <label className="flex items-start gap-3 cursor-pointer group text-left">
                        <div className="relative mt-0.5 shrink-0">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={fetchAllBranches}
                            onChange={(e) => setFetchAllBranches(e.target.checked)}
                          />
                          <div className={`w-9 h-5 rounded-full transition-colors ${fetchAllBranches ? 'bg-warning/90' : 'bg-surface border border-border group-hover:border-accent/50'}`} />
                          <div className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${fetchAllBranches ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                        <div>
                          <span className={`font-semibold text-sm transition-colors block ${fetchAllBranches ? 'text-warning' : 'text-text group-hover:text-accent'}`}>
                            Fetch All Branches
                          </span>
                          <span className="text-[11px] text-muted leading-snug block mt-1">
                            {fetchAllBranches 
                              ? "Warning: Downloads the entire history of all remote branches. This can take a very long time and consume massive bandwidth for large repositories." 
                              : "Downloads only the default branch to save bandwidth and memory."}
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              ) : inputMode === 'zip' ? (
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setDragging(true);
                  }}
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
                  <div
                    className={`p-4 rounded-full mb-1 ${dragging ? 'bg-accent/10 text-accent' : 'bg-surface text-muted'}`}
                  >
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
                  <input id="file-input" type="file" accept=".zip" className="hidden" onChange={onInputChange} />
                </div>
              ) : (
                <div
                  className="relative rounded-xl p-6 flex flex-col items-center justify-center gap-3 transition-all duration-200 cursor-pointer border-2 border-dashed shrink-0 border-border/60 bg-surface/30 hover:bg-surface/60 hover:border-border"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <div className="p-4 rounded-full mb-1 bg-surface text-muted">
                    <FolderInput className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-medium">Click to select a folder</p>
                    <p className="text-muted text-sm mt-1">
                      All files are read locally in the browser — nothing is uploaded.
                    </p>
                    <p className="text-[11px] text-muted/70 mt-1.5">
                      Large folders ({'>'}500 files) will show a size warning before proceeding.
                    </p>
                  </div>
                  <input
                    ref={folderInputRef}
                    type="file"
                    /* @ts-ignore — webkitdirectory is not in standard TS types */
                    webkitdirectory=""
                    multiple
                    className="hidden"
                    onChange={onFolderChange}
                  />
                </div>
              )}

              {/* ── Selected file / folder summary ──────────────────────────── */}
              {packingFolder && (
                <div className="mt-3 p-3 bg-surface border border-border rounded-lg flex items-center gap-3 shrink-0">
                  <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
                  <span className="text-sm text-muted">Packaging folder into archive…</span>
                </div>
              )}

              {file && !uploading && !packingFolder && (
                <div className="mt-3 p-3 bg-surface border border-border rounded-lg flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FileArchiveIcon />
                    <div className="flex flex-col min-w-0">
                      <span
                        className="text-sm font-medium truncate"
                        title={file instanceof FileList ? folderName.split(' ')[0] : file.name}
                      >
                        {file instanceof FileList ? folderName.split(' ')[0] : file.name}
                      </span>
                      {folderName && <span className="text-[11px] text-muted truncate">{folderName}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted font-mono bg-panel px-2 py-1 rounded border border-border/50">
                      {file instanceof FileList ? folderName.match(/([\d.]+) MB/)[1] : fileSizeMB} MB
                    </span>
                    <button
                      onClick={() => {
                        setFile(null);
                        setFolderName(null);
                      }}
                      title="Remove"
                      className="text-muted hover:text-danger transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ── Upload progress ──────────────────────────────────────────── */}
              {(uploading || isSuccess) && (
                <div className="w-full mt-4 p-4 rounded-xl border border-border/50 bg-surface flex flex-col gap-3 shadow-xl">
                  <div className="flex justify-between items-center text-text">
                    <span className="text-sm font-medium flex items-center gap-2">
                      {isSuccess ? (
                        <span className="text-success flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Extraction Complete!
                        </span>
                      ) : (
                        'Extracting & Analyzing…'
                      )}
                    </span>
                    {!isSuccess && <span className="text-sm font-mono text-muted">{progress}%</span>}
                  </div>
                  {!isSuccess && currentFile && (
                    <div className="text-[11px] font-mono text-muted/70 truncate max-w-full -mt-2 mb-1">
                      {currentFile}
                    </div>
                  )}
                  <div className="w-full bg-panel h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ease-out ${isSuccess ? 'bg-success' : 'bg-accent'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* ── Error ────────────────────────────────────────────────────── */}
              {error && (
                <div className="mt-3 p-3 bg-danger/10 border border-danger/20 rounded-lg flex items-start gap-2 shrink-0">
                  <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                  <p className="text-xs text-danger/90 leading-relaxed">{error}</p>
                </div>
              )}

              {/* ── Ignore Patterns ──────────────────────────────────────────── */}
              <div className="mt-4 pt-4 border-t border-border/50 shrink-0">
                <label className="block text-sm font-medium text-text mb-1">Additional Ignore Patterns</label>
                <p className="text-xs text-muted mb-2">
                  Standard directories like node_modules and dist are ignored automatically. Add any extra
                  comma-separated folders to skip.
                  {/* Standard directories like node_modules and dist are ignored automatically. The .git folder is preserved for churn analysis. Add any extra comma-separated folders to skip. */}
                </p>
                <input
                  type="text"
                  placeholder="e.g. tests, assets, docs"
                  value={ignorePatterns}
                  onChange={e => setIgnorePatterns(e.target.value)}
                  disabled={uploading}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
                <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
                  By default,{' '}
                  <span className="font-mono text-text/80 bg-panel px-1 py-0.5 rounded border border-border/50">
                    node_modules, dist, build, coverage, .next, out
                  </span>{' '}
                  are excluded.
                </p>
              </div>

              {/* ── Action Buttons ───────────────────────────────────────────── */}
              <div className="mt-auto pt-6 flex flex-col gap-3 shrink-0">
                <button
                  onClick={onUpload}
                  disabled={
                    uploading ||
                    packingFolder ||
                    (inputMode !== 'github' && !file) ||
                    (inputMode === 'github' && !githubUrl)
                  }
                  className={[
                    'w-full py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2',
                    !uploading && !packingFolder && (file || (inputMode === 'github' && githubUrl))
                      ? 'bg-accent hover:bg-accent-hover text-text'
                      : 'bg-surface border border-border text-muted cursor-not-allowed',
                  ].join(' ')}
                >
                  {uploading ? 'Processing Repository…' : 'Analyze Repository'}
                </button>

                {lastRepoId && (
                  <button
                    onClick={() => navigate(`/explore/${lastRepoId}`)}
                    className="w-full py-3 rounded-lg text-sm font-medium transition-colors border border-border bg-transparent hover:bg-surface text-muted hover:text-text"
                  >
                    Return to Active Repository
                  </button>
                )}
              </div>
              <div className="shrink-0 h-2 mt-2" />
            </div>
          </div>
        </div>

        {/* ── Right Column: Feature Grid & Workspaces ──────────────────────────── */}
        <div className="w-full lg:w-[45%] flex flex-col lg:min-h-0">
          <div className="bg-panel border border-border rounded-2xl shadow-sm flex-1 flex flex-col lg:overflow-hidden relative">
            <div
              className="flex-1 flex flex-col p-5 md:p-6 justify-center lg:overflow-y-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {/* Recent Workspaces — always shown; EnvironmentGuard handles the iframe/preview case */}
              <div className="bg-panel border border-border rounded-xl p-5 shadow-sm mb-6 flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    Recent Workspaces
                  </label>
                  <div className="relative" ref={dropdownRef}>
                    <div
                      className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm font-medium text-text flex items-center justify-between cursor-pointer shadow-sm hover:bg-surface-light transition-colors"
                      onClick={() => {
                        if (!loadingRepos) setIsDropdownOpen(!isDropdownOpen);
                      }}
                    >
                      <span className={loadingRepos ? 'text-text/50' : 'text-text'}>
                        {loadingRepos ? 'Loading…' : 'Select repository…'}
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
                              className="px-4 py-2.5 text-sm font-medium text-text hover:bg-surface cursor-pointer transition-colors flex items-center justify-between group"
                              onClick={() => {
                                setIsDropdownOpen(false);
                                navigate(`/explore/${repo.id}`);
                              }}
                            >
                              <span className="truncate group-hover:text-accent transition-colors">{repo.name}</span>
                              <span className="text-muted font-normal text-xs ml-2 shrink-0">
                                {new Date(repo.uploadedAt).toLocaleDateString()}
                              </span>
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
                    {loadingRepos ? (
                      <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    ) : (
                      <FolderOpen className="w-4 h-4 text-accent" />
                    )}
                    Manage
                  </button>
                </div>
              </div>

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

      {/* ── Workspace Manager Modal ──────────────────────────────────────────── */}
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
                      <span className="text-[11px] font-medium text-orange-400 mr-2 hidden items-center gap-1 md:flex bg-orange-500/10 px-2 py-1 rounded border border-orange-500/20">
                        <AlertCircle className="w-3.5 h-3.5" /> Modifying active workspace
                      </span>
                    )}
                    <button
                      onClick={() => handleBatchAction('clear_analysis')}
                      disabled={batchActionRunning}
                      className="px-3 py-1.5 text-xs font-medium bg-surface hover:bg-surface-light border border-border rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 text-orange-400/90 hover:text-orange-400"
                    >
                      {batchActionRunning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Eraser className="w-3.5 h-3.5" />
                      )}
                      Clear Analysis
                    </button>
                    <button
                      onClick={() => handleBatchAction('delete')}
                      disabled={batchActionRunning}
                      className="px-3 py-1.5 text-xs font-medium bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {batchActionRunning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setShowManager(false)}
                  className="p-1.5 text-muted hover:text-text bg-surface hover:bg-surface-light rounded-lg transition-colors border border-border"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

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

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {loadingRepos ? (
                <div className="flex flex-col items-center justify-center p-12 text-muted">
                  <Loader2 className="w-10 h-10 mb-4 animate-spin text-accent" />
                  <p>Loading workspaces…</p>
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
                          <h3 className="text-sm font-medium text-text truncate">{repo.name}</h3>
                          {repo.id === lastRepoId && (
                            <span className="text-[10px] font-medium bg-accent/20 text-accent px-1.5 py-0.5 rounded border border-accent/20 uppercase tracking-wider shrink-0">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted mt-0.5 truncate">
                          {isReady
                            ? 'Analyzed'
                            : repo.status === 'error'
                              ? 'Analysis failed'
                              : repo.status === 'analyzing'
                                ? 'Analyzing'
                                : 'Uploaded'}{' '}
                          on {new Date(repo.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border ${isReady ? 'bg-green-500/10 text-green-400 border-green-500/20' : repo.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}
                        >
                          {repo.status}
                        </span>
                        <button
                          onClick={async () => {
                            if (!isReady) await repositoryApi.reanalyze(repo.id);
                            setShowManager(false);
                            navigate(`/explore/${repo.id}`);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isReady ? 'bg-accent hover:bg-accent-hover text-text' : 'bg-surface border border-border text-muted hover:text-text'}`}
                        >
                          {isReady ? 'Open' : 'Re-Analyze'}
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

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="mt-8 md:mt-12 text-center shrink-0 w-full border-t border-border/50 pt-4 pb-2 max-w-7xl mx-auto">
        <p className="text-xs text-muted">
          CodeLens runs static analysis locally. Your code is processed securely in your browser.
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="bg-surface border border-border p-5 rounded-xl flex flex-col items-start hover:border-accent/50 transition-colors h-full">
      <div className="p-2.5 bg-panel border border-border rounded-lg mb-4">{icon}</div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <p className="text-muted text-xs leading-relaxed">{desc}</p>
    </div>
  );
}

function FileArchiveIcon() {
  return (
    <div className="w-8 h-8 rounded bg-panel border border-border flex items-center justify-center text-accent shrink-0">
      <svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M13 5L8.5 0.5H2C1.44772 0.5 1 0.947715 1 1.5V14.5C1 15.0523 1.44772 15.5 2 15.5H12C12.5523 15.5 13 15.0523 13 14.5V5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9 1V5H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 6.5V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 11.5H5.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
