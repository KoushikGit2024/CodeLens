/**
 * ExplorerPage.jsx — Step 5
 *
 * Integrated code viewer, file tree, and AI Q&A panel.
 *
 * Layout:
 *   ┌──────────────────────────── header ─────────────────────────────────┐
 *   ├─── file tree ───┬────────── Monaco editor ──────┬─── AI panel ──────┤
 *   │  (sidebar)      │  (center — file viewer)       │  (Q&A chat)       │
 *   └─────────────────┴───────────────────────────────┴───────────────────┘
 *
 * File-navigation contract:
 *   openFile(path, line?) — callable from:
 *     • file tree node clicks
 *     • AI reference clicks
 *     • DependencyGraph "open in explorer" links
 *
 * The Monaco editor ref is passed as a prop so AiPanel can call
 * revealLine() without coupling to Monaco's internals.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { ChevronRight, ChevronDown, File, Folder, Code2, Play, Search, Network, Brain, Database, FileText, X, MessageSquare, Send, AlertTriangle, Loader2, RefreshCw, Image as ImageIcon, Copy, Check, FolderTree, Sparkles, Bookmark } from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import { repositoryApi } from '../../shared/api';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { useRepository } from '../../shared/context/RepositoryContext';
import { useTheme } from '../../shared/context/ThemeContext';
import { FileTree } from './FileTree';
import AiResponse from '../../shared/components/ai/AiResponse';
import AiMarkdown from '../../shared/components/ai/AiMarkdown';
import ModuleDocumentation from './ModuleDocumentation';
import AnalysisProgress from '../repository/AnalysisProgress';
import { useAIState } from '../../shared/context/AIContext';
import { useBookmark, addBookmark, removeBookmark, updateNote } from '../../services/storage/bookmark.store';
import { useToast } from '../../shared/context/ToastContext';

// ── Monaco language map ───────────────────────────────────────────────────────
// Maps file extensions to Monaco language IDs.
// The analyzer uses 'javascript'/'typescript'; Monaco uses the same strings for
// .js/.ts but needs distinct IDs for JSX/TSX and other formats.
const EXT_TO_MONACO = {
  '.js':   'javascript',
  '.mjs':  'javascript',
  '.cjs':  'javascript',
  '.jsx':  'javascript',
  '.ts':   'typescript',
  '.tsx':  'typescript',
  '.mts':  'typescript',
  '.cts':  'typescript',
  '.py':   'python',
  '.java': 'java',
  '.cpp':  'cpp',
  '.cc':   'cpp',
  '.cxx':  'cpp',
  '.h':    'cpp',
  '.hpp':  'cpp',
  '.json': 'json',
  '.md':   'markdown',
  '.css':  'css',
  '.html': 'html',
  '.htm':  'html',
  '.xml':  'xml',
  '.yaml': 'yaml',
  '.yml':  'yaml',
  '.sh':   'shell',
  '.env':  'ini',
};

function monacoLanguage(filePath, serverLanguage) {
  // Prefer the server's language field (already covers JS/TS accurately)
  if (serverLanguage) return serverLanguage;
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return EXT_TO_MONACO[ext] || 'plaintext';
}

// ── Monaco editor theme config ────────────────────────────────────────────────
const MONACO_OPTIONS = {
  readOnly:        true,
  minimap:         { enabled: true },
  fontSize:        13,
  lineNumbers:     'on',
  scrollBeyondLastLine: false,
  wordWrap:        'off',
  renderLineHighlight: 'all',
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
};

function isDirectory(tree, path) {
  if (!tree || !path) return false;
  for (const node of tree) {
    if (node.path === path) return node.type === 'directory';
    if (node.children) {
      const found = isDirectory(node.children, path);
      if (found) return true;
    }
  }
  return false;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExplorerPage() {
  const { repoId }        = useParams();
  const { repo, fileTree, loading: repoLoading, error: repoError, refetchRepo, livePhase } = useRepository();
  const [reanalyzing, setReanalyzing] = useState(false);
  const navigate          = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pageError, setPageError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { addToast } = useToast();

  // URL is the single source of truth
  const selectedPath = searchParams.get('path');
  const viewMode = searchParams.get('view') || 'source';

  const [fileContent,  setFileContent]   = useState(null);   // { content, language }
  const [fileLoading,  setFileLoading]   = useState(false);
  const [fileError,    setFileError]     = useState(null);

  const [moduleDocs,   setModuleDocs]    = useState(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const { aiState } = useAIState();

  // Monaco editor instance ref — used for revealLine / decorations
  const editorRef = useRef(null);
  const [isEditorMounted, setIsEditorMounted] = useState(false);

  const handleSetViewMode = (mode) => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('view', mode);
      return p;
    }, { replace: true });
  };

  const handleIncrementalAnalyze = async () => {
    setReanalyzing(true);
    try {
      await repositoryApi.analyzeIncremental(repoId);
      refetchRepo(); // Soft reload to fetch everything again
    } catch (err) {
      console.error(err);
      addToast({
        title: 'Analysis Failed',
        description: err.message || 'Failed to analyze incrementally.',
        type: 'error'
      });
    } finally {
      setReanalyzing(false);
    }
  };

  const handleGenerateAi = async () => {
    if (aiState.authState === 'unauthenticated') {
      navigate('/auth/signin');
      return;
    }
    if (!selectedPath) return;
    setIsGeneratingAi(true);
    try {
      const docsRes = await repositoryApi.getModuleDocumentation(repoId, selectedPath, { generateAi: true });
      setModuleDocs(docsRes.data);
    } catch (err) {
      console.error('Failed to generate AI docs', err);
      addToast({
        title: 'Generation Failed',
        description: err.message || 'Failed to generate AI documentation.',
        type: 'error'
      });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // ── openFile — central navigation function ─────────────────────────────────
  const openFile = useCallback(async (filePath, line, endLine) => {
    if (!filePath) return;

    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (p.get('path') !== filePath) {
        p.delete('line'); // Wipe line if changing files
      }
      p.set('path', filePath);
      if (line) {
        p.set('line', endLine ? `${line}-${endLine}` : line.toString());
      }
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  // ── File Fetching Effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPath) return;

    let active = true;

    const fetchFile = async () => {
      setFileError(null);
      setFileLoading(true);
      // We intentionally do NOT clear fileContent here to prevent Monaco from unmounting 
      // and causing a flicker/lag while fetching the next file.

      if (fileTree && isDirectory(fileTree, selectedPath)) {
        setFileError('DIRECTORY');
        setFileLoading(false);
        return;
      }

      try {
        const [fileRes, docsRes] = await Promise.allSettled([
          repositoryApi.getFile(repoId, selectedPath),
          repositoryApi.getModuleDocumentation(repoId, selectedPath)
        ]);

        if (!active) return;

        if (fileRes.status === 'fulfilled') {
          const { content, language } = fileRes.value.data;
          setFileContent({ content, language: monacoLanguage(selectedPath, language) });
        } else {
          setFileError(fileRes.reason?.response?.data?.error || fileRes.reason?.message || 'Failed to load file');
        }

        if (docsRes.status === 'fulfilled') {
          setModuleDocs(docsRes.value.data);
        } else {
          setModuleDocs(null);
        }
      } catch (err) {
        if (!active) return;
        setFileError('Unexpected error occurred');
      } finally {
        if (active) setFileLoading(false);
      }
    };

    fetchFile();

    return () => { active = false; };
  }, [repoId, selectedPath, fileTree]);

  // ── Line highlighting Effect ───────────────────────────────────────────────
  useEffect(() => {
    const lineParam = searchParams.get('line');
    if (lineParam && isEditorMounted && !fileLoading && fileContent) {
      const parts = lineParam.split('-');
      const start = parseInt(parts[0], 10);
      const end = parts.length > 1 ? parseInt(parts[1], 10) : undefined;
      
      // Delay slightly to ensure editor has fully laid out content
      setTimeout(() => {
        if (end) {
          highlightRange(start, end);
        } else {
          revealLine(start);
        }
      }, 50);
    }
  }, [searchParams.get('line'), fileLoading, fileContent, isEditorMounted]);

  // ── Monaco editor callbacks ────────────────────────────────────────────────
  const applyDynamicTheme = useCallback((monaco) => {
    if (!monaco) return;

    const root = document.documentElement;
    const style = getComputedStyle(root);
    // Since our class might be 'theme-light', 'theme-ocean-dark', or absent (default dark).
    // The easiest way to know if it's dark is checking if '--color-surface' is dark,
    // or relying on our `ThemeContext` resolvedMode. But we don't have direct access to resolvedMode here easily without plumbing.
    // However, we can check if body/html has a '-light' class.
    const isLight = Array.from(root.classList).some(c => c.includes('-light'));
    const isDark = !isLight;

    const normalizeColor = (color) => {
      // Monaco's internal token parser crashes on 3-digit hex colors (like #fff) and rgb()
      // But we use rgb(r, g, b) variables like 13, 17, 23 or spaced values 13 17 23.
      // So we need to parse them.
      if (!color) return isDark ? '#161b22' : '#ffffff';
      
      const rgbMatch = color.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      if (rgbMatch) {
        const toHex = (n) => parseInt(n, 10).toString(16).padStart(2, '0');
        return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
      }
      
      if (color.startsWith('#') && color.length === 4) {
        return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
      }
      return color;
    };

    const bg = normalizeColor(style.getPropertyValue('--color-panel'));
    const text = normalizeColor(style.getPropertyValue('--color-text'));
    const muted = normalizeColor(style.getPropertyValue('--color-muted'));
    const accent = normalizeColor(style.getPropertyValue('--color-accent'));
    const surface2 = normalizeColor(style.getPropertyValue('--color-surface'));

    monaco.editor.defineTheme('codelens-dynamic', {
      base: isDark ? 'vs-dark' : 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': bg,
        'editor.foreground': text,
        'editorLineNumber.foreground': muted,
        'editorLineNumber.activeForeground': accent,
        'editorCursor.foreground': accent,
        'editor.selectionBackground': accent + '40',
        'editor.inactiveSelectionBackground': accent + '20',
        'editor.lineHighlightBackground': surface2,
      },
    });

    monaco.editor.setTheme('codelens-dynamic');
  }, []);

  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    setIsEditorMounted(true);
    
    applyDynamicTheme(monaco);
    
    // Listen for theme class changes on document element
    const observer = new MutationObserver(() => {
      applyDynamicTheme(monaco);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    // Store observer so it can be disconnected (dirty but works for mount lifecycle here)
    editorRef.current._themeObserver = observer;
  }, [applyDynamicTheme]);

  useEffect(() => {
    return () => {
      if (editorRef.current?._themeObserver) {
        editorRef.current._themeObserver.disconnect();
      }
    };
  }, []);

  function revealLine(line) {
    const editor = editorRef.current;
    if (!editor || !line) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
  }

  function highlightRange(startLine, endLine) {
    const editor = editorRef.current;
    if (!editor || !startLine) return;
    const model = editor.getModel();
    if (!model) return;
    const end = endLine || startLine;
    editor.revealLineInCenter(startLine);
    editor.setSelection({
      startLineNumber: startLine,
      startColumn:     1,
      endLineNumber:   end,
      endColumn:       model.getLineLength(end) + 1,
    });
  }

  const getActiveContext = useCallback(() => {
    if (!selectedPath) return null;
    const editor = editorRef.current;
    if (!editor) return { filePath: selectedPath };
    
    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) {
       return { filePath: selectedPath };
    }
    return {
      filePath: selectedPath,
      startLine: selection.startLineNumber,
      endLine: selection.endLineNumber
    };
  }, [selectedPath]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (repoLoading && !fileTree) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface text-text">
        <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
        <span className="text-sm text-muted">Loading repository...</span>
      </div>
    );
  }

  // If repo is reanalyzing after being ready, we can also show progress over the UI
  if (repo?.status === 'analyzing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-text">
        <AnalysisProgress currentPhase={livePhase?.phase ?? repo.phase} phaseDetails={livePhase?.details ?? repo.phaseDetails} />
      </div>
    );
  }
  if (repoError || repo?.status === 'error') {
    const displayError = repoError || repo?.error || 'Unknown analysis error';
    return (
      <div className="p-8 text-red-400 flex flex-col items-start gap-4">
        <div>Error loading repository: {displayError}</div>
        <button 
          onClick={handleIncrementalAnalyze}
          disabled={reanalyzing}
          className="px-3 py-1.5 bg-panel border border-border rounded text-sm text-text hover:bg-[#30363d] disabled:opacity-50 flex items-center gap-2"
        >
          {reanalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {reanalyzing ? 'Retrying...' : 'Retry Analysis'}
        </button>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger mb-4 text-sm">{pageError}</p>
          <button onClick={() => navigate('/')} className="text-sm text-accent hover:underline">
            ← Back to upload
          </button>
        </div>
      </div>
    );
  }

  if (!repo || !fileTree) {
    return (
      <div className="h-screen flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
        <span className="text-muted text-sm">Loading repository…</span>
      </div>
    );
  }

  const fileCount = countFiles(fileTree);

  const panels = [
    {
      id: 'fileTree',
      defaultSize: 20,
      minWidth: 200,
      collapsible: true,
      collapseDirection: 'left',
      title: 'Explorer',
      icon: <FolderTree />,
      content: (
        <div className="flex-1 overflow-y-auto overflow-x-auto p-3 custom-scrollbar bg-panel flex flex-col">
          <div className="flex items-center justify-between mb-2 px-1 shrink-0">
            <p className="text-xs text-muted uppercase tracking-wider">Files</p>
            <button 
              onClick={handleIncrementalAnalyze}
              disabled={reanalyzing}
              className="text-muted hover:text-text transition-colors"
              title="Refresh File Tree"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reanalyzing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="px-1 mb-3 shrink-0">
            <input 
              type="text"
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <FileTree
              nodes={fileTree}
              selectedPath={selectedPath}
              onSelectFile={(p) => openFile(p)}
              searchTerm={searchTerm}
            />
          </div>
        </div>
      )
    },
    {
      id: 'codeViewer',
      defaultSize: viewMode === 'docs' ? 80 : 55,
      minWidth: 300,
      collapsible: false,
      content: (
        <div className="flex-1 flex flex-col overflow-hidden bg-surface h-full">
          <CodeViewer
            repoId={repoId}
            filePath={selectedPath}
            fileContent={fileContent}
            loading={fileLoading}
            error={fileError}
            onEditorMount={handleEditorMount}
            viewMode={viewMode}
            setViewMode={handleSetViewMode}
            moduleDocs={moduleDocs}
            onGenerateAi={handleGenerateAi}
            isGeneratingAi={isGeneratingAi}
          />
        </div>
      )
    }
  ];

  if (viewMode !== 'docs') {
    panels.push({
      id: 'aiPanel',
      defaultSize: 25,
      minWidth: 250,
      collapsible: true,
      collapseDirection: 'right',
      title: 'Assistant',
      icon: <Sparkles />,
      content: (
        <div className="flex-1 h-full flex flex-col bg-panel">
          <AiPanel
            repoId={repoId}
            getActiveContext={getActiveContext}
            onOpenFile={(filePath, line) => openFile(filePath, line)}
            onHighlightRange={(filePath, start, end) => {
              openFile(filePath).then(() => highlightRange(start, end));
            }}
          />
        </div>
      )
    });
  }

  return (
    <ResizableLayout panels={panels} />
  );
}

// ── CodeViewer ────────────────────────────────────────────────────────────────

/**
 * Renders one of four states:
 *   empty   — no file selected
 *   loading — fetching file content
 *   error   — fetch failed
 *   editor  — Monaco
 */
function CodeViewer({ repoId, filePath, fileContent, loading, error, onEditorMount, viewMode, setViewMode, moduleDocs, onGenerateAi, isGeneratingAi }) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const bookmark = useBookmark(repoId, filePath);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editNote, setEditNote] = useState('');
  const [forceText, setForceText] = useState(false);

  useEffect(() => {
    setShowNoteEditor(false);
    setForceText(false);
  }, [filePath]);

  const handleToggleBookmark = () => {
    if (bookmark) {
      removeBookmark(repoId, filePath);
      setShowNoteEditor(false);
    } else {
      addBookmark(repoId, filePath, '');
      setEditNote('');
      setShowNoteEditor(true);
    }
  };
  
  const handleSaveNote = () => {
    updateNote(repoId, filePath, editNote);
    setShowNoteEditor(false);
  };

  const handleCopyCode = () => {
    if (fileContent?.content) {
      navigator.clipboard.writeText(fileContent.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!filePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted gap-2">
        <File className="w-8 h-8 opacity-30" />
        <p className="text-sm">Select a file from the tree to view its contents</p>
      </div>
    );
  }

  const header = (
    <div className="flex items-center justify-between px-4 pt-2 bg-panel border-b border-border shadow-sm shrink-0 z-10 relative">
      {loading && fileContent && (
        <div className="absolute bottom-0 left-0 h-0.5 bg-accent animate-pulse w-full z-20"></div>
      )}
      <div className="flex-1"></div>
      <div className="flex items-center gap-6">
        <button 
          onClick={() => setViewMode('source')} 
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-all ${viewMode === 'source' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text hover:border-border'}`}
        >
          Source Code
        </button>
        <button 
          onClick={() => setViewMode('docs')} 
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-all ${viewMode === 'docs' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text hover:border-border'}`}
        >
          Documentation
        </button>
      </div>
      <div className="flex-1 flex justify-end gap-2">
        <button
          onClick={handleToggleBookmark}
          className={`flex items-center gap-1.5 px-2 py-1 mb-1 rounded text-xs transition-colors ${bookmark ? 'text-accent hover:bg-accent/10' : 'text-muted hover:text-text hover:bg-text/10'}`}
          title={bookmark ? "Remove bookmark" : "Bookmark this file"}
        >
          <Bookmark className="w-3.5 h-3.5" fill={bookmark ? "currentColor" : "none"} />
        </button>
        {viewMode === 'source' && fileContent?.content && (
          <button 
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-2 py-1 mb-1 rounded text-xs text-muted hover:text-text hover:bg-text/10 transition-colors"
            title="Copy source code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? <span className="text-green-400">Copied!</span> : <span>Copy</span>}
          </button>
        )}
      </div>
    </div>
  );

  let content;
  if (viewMode === 'docs') {
    content = (
      <div className="flex-1 overflow-y-auto bg-surface p-6 custom-scrollbar relative">
        <ModuleDocumentation docs={moduleDocs} repoId={repoId} onGenerateAi={onGenerateAi} isGeneratingAi={isGeneratingAi} />
      </div>
    );
  } else {
    // Source Code Mode
    if (loading && !fileContent) {
      content = (
        <div className="flex-1 flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
          <span className="text-muted text-sm">Loading {filePath.split('/').pop()}…</span>
        </div>
      );
    } else if (error === 'DIRECTORY') {
      content = (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted bg-surface/50">
          <Folder className="w-16 h-16 text-yellow-400 opacity-80" />
          <div className="text-center">
            <p className="text-sm font-medium text-text mb-1">Folder Selected</p>
            <p className="text-xs max-w-sm">Select a file within this directory from the tree to view its source code.</p>
          </div>
        </div>
      );
    } else if (error) {
      content = (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-danger">
          <AlertTriangle className="w-6 h-6" />
          <p className="text-sm">{error}</p>
        </div>
      );
    } else if (!fileContent) {
      content = null;
    } else if (/\.(png|jpe?g|gif|webp|ico|bmp)$/i.test(filePath)) {
      content = (
        <div className="flex-1 flex flex-col p-8 overflow-auto bg-panel custom-scrollbar relative">
          <div className="flex-1 flex items-center justify-center min-h-[40vh]">
            <img src={fileContent.content} alt={filePath} className="max-w-full max-h-[70vh] object-contain rounded drop-shadow-2xl border border-border" />
          </div>
        </div>
      );
    } else if (/\.svg$/i.test(filePath)) {
      const svgUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(fileContent.content)))}`;
      content = (
        <div className="flex-1 flex flex-col p-8 overflow-auto bg-panel custom-scrollbar">
          <div className="flex-1 flex items-center justify-center min-h-[40vh]">
            <img src={svgUrl} alt={filePath} className="max-w-full max-h-[70vh] object-contain rounded drop-shadow-2xl border border-border" />
          </div>
        </div>
      );
    } else if (!forceText && /\.(wasm|pdf|zip|tar|gz|dll|exe|bin|class|jar|woff|woff2|ttf|eot)$/i.test(filePath)) {
      content = (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted bg-surface/50 p-6 text-center">
          <File className="w-16 h-16 opacity-30 mb-2" />
          <p className="text-base font-medium text-text mb-1">Unsupported File Format</p>
          <p className="text-sm max-w-sm opacity-80">
            This file appears to be a binary format that cannot be safely displayed in the code editor.
          </p>
          <button 
            onClick={() => setForceText(true)} 
            className="mt-4 px-4 py-2 bg-accent/10 text-accent rounded hover:bg-accent/20 text-xs font-medium transition-colors"
          >
            Load as Text Anyway
          </button>
        </div>
      );
    } else {
      content = (
        <Editor
          height="100%"
          language={fileContent.language || 'plaintext'}
          value={fileContent.content}
          theme="codelens-dynamic"
          options={MONACO_OPTIONS}
          onMount={onEditorMount}
          loading={
            <div className="flex-1 flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 text-accent animate-spin" />
              <span className="text-muted text-sm">Loading editor…</span>
            </div>
          }
        />
      );
    }
  }

  const noteBanner = (bookmark || showNoteEditor) && (
    <div className="bg-panel/50 border-b border-border px-4 py-2 shrink-0 text-sm">
      {showNoteEditor ? (
        <div className="flex gap-2">
          <input 
            type="text" 
            value={editNote}
            onChange={e => setEditNote(e.target.value)}
            placeholder="Add a personal note about this file..."
            className="flex-1 bg-surface border border-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSaveNote(); if (e.key === 'Escape') setShowNoteEditor(false); }}
          />
          <button onClick={handleSaveNote} className="px-2 py-1 bg-accent/10 text-accent rounded hover:bg-accent/20 text-xs">Save</button>
          <button onClick={() => setShowNoteEditor(false)} className="px-2 py-1 text-muted hover:text-text text-xs">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center justify-between group/note">
          <p className="text-muted text-xs truncate max-w-xl">
            <span className="font-medium text-accent mr-2">Note:</span>
            {bookmark.note || <span className="opacity-50 italic">No note added.</span>}
          </p>
          <button 
            onClick={() => { setEditNote(bookmark.note || ''); setShowNoteEditor(true); }}
            className="text-[10px] text-muted hover:text-text opacity-0 group-hover/note:opacity-100 transition-opacity"
          >
            Edit Note
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full w-full relative">
      {header}
      {noteBanner}
      {content}
    </div>
  );
}

// ── AI Q&A Panel ──────────────────────────────────────────────────────────────

function AiPanel({ repoId, onOpenFile, onHighlightRange, getActiveContext }) {
  const [messages,  setMessages]  = useState([]);
  const [question,  setQuestion]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const bottomRef                 = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const activeContext = getActiveContext ? getActiveContext() : null;
      // Use the new Step 8 endpoint
      const res = await repositoryApi.askQuestion(repoId, q, activeContext);
      const ans = res.data.answer;
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: ans.summary + (ans.explanation ? `\n\n${ans.explanation}` : ''),
        references: ans.references || [],
        facts: ans.facts || [],
        inferences: ans.inferences || [],
        intent: res.data.intent,
        isDeterministic: !res.data.requiresAi
      }]);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Request failed';
      setMessages(prev => [...prev, { role: 'error', content: msg }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="h-10 flex items-center px-3 border-b border-border shrink-0">
        <span className="text-xs text-muted uppercase tracking-wider">Ask about this repo</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted text-center mt-6 leading-relaxed">
            Ask a question about the codebase.<br />
            <span className="opacity-60">e.g. "How does authentication work?"</span>
          </p>
        )}

        {messages.map((msg, i) => (
          <Message key={i} msg={msg} onOpenFile={onOpenFile} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-muted text-xs">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Thinking…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-3 shrink-0 flex gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask a question…"
          disabled={loading}
          className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-accent/10 border border-accent/40 rounded text-xs text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-3 h-3" />
        </button>
      </form>
    </>
  );
}

// ── Message ───────────────────────────────────────────────────────────────────

function Message({ msg, onOpenFile }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    let textToCopy = '';
    if (msg.role === 'user') {
      textToCopy = msg.content;
    } else {
      textToCopy = typeof msg.content === 'string' ? msg.content : msg.summary;
      if (msg.explanation) textToCopy += `\n\n${msg.explanation}`;
    }
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end group/msg mb-2">
        <div className="flex flex-col gap-1 items-end max-w-[90%]">
          <div className="px-3 py-2 text-xs text-text bg-surface border border-border rounded shadow-sm">
            <AiMarkdown content={msg.content} />
          </div>
          <button onClick={handleCopy} className="opacity-0 group-hover/msg:opacity-100 text-muted hover:text-text transition-opacity text-[10px] flex items-center gap-1" title="Copy Message">
            {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    );
  }

  if (msg.role === 'error') {
    return (
      <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded px-2.5 py-1.5 flex gap-2">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>{msg.content}</span>
      </div>
    );
  }

  // assistant — render structured response compactly
  return (
    <div className="flex flex-col gap-2 border-l-2 border-accent pl-3 py-1 mb-2 group/msg">
      <div className="flex items-center justify-between pb-1">
        <span className="text-[10px] font-medium text-text/80 flex items-center gap-1">
          {msg.isDeterministic ? <Database className="w-3 h-3 text-success" /> : <Brain className="w-3 h-3 text-accent" />}
          {msg.isDeterministic ? 'Deterministic' : 'AI Inference'}
        </span>
        <div className="flex items-center gap-3">
          {msg.intent && (
            <span className="text-[9px] text-muted uppercase tracking-wider">{msg.intent}</span>
          )}
        </div>
      </div>

      <AiResponse 
        data={{
          summary: msg.summary || msg.content,
          facts: msg.facts,
          inferences: msg.inferences,
          references: msg.references
        }} 
        title={null} 
        onNavigate={onOpenFile} 
      />
      <div className="flex justify-start">
        <button onClick={handleCopy} className="opacity-0 group-hover/msg:opacity-100 text-muted hover:text-text transition-opacity text-[10px] flex items-center gap-1" title="Copy Response">
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function countFiles(nodes) {
  let count = 0;
  for (const n of nodes) {
    if (n.type === 'file') count++;
    else if (n.children) count += countFiles(n.children);
  }
  return count;
}
