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
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  Code2,
  Play,
  Search,
  Network,
  Brain,
  Database,
  FileText,
  X,
  MessageSquare,
  Send,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
  Copy,
  Check,
  FolderTree,
  Sparkles,
  Bookmark,
  Trash2,
} from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import { repositoryApi } from '../../shared/api';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { useRepository } from '../../shared/context/RepositoryContext';
import { useTheme } from '../../shared/context/ThemeContext';
import { FileTree } from './FileTree';
import AiResponse from '../../shared/components/ai/AiResponse';
import AiMarkdown from '../../shared/components/ai/AiMarkdown';
import ModuleDocumentation from './ModuleDocumentation';
import { useAIState } from '../../shared/context/AIContext';
import { useBookmark, addBookmark, removeBookmark, updateNote } from '../../services/storage/bookmark.store';
import { chatStore } from '../../services/storage/chat.store';
import { useToast } from '../../shared/context/ToastContext';

// ── Monaco language map ───────────────────────────────────────────────────────
// Maps file extensions to Monaco language IDs.
// The analyzer uses 'javascript'/'typescript'; Monaco uses the same strings for
// .js/.ts but needs distinct IDs for JSX/TSX and other formats.
const EXT_TO_MONACO = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.json': 'json',
  '.md': 'markdown',
  '.css': 'css',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.sh': 'shell',
  '.env': 'ini',
};

function monacoLanguage(filePath, serverLanguage) {
  // Prefer the server's language field (already covers JS/TS accurately)
  if (serverLanguage) return serverLanguage;
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return EXT_TO_MONACO[ext] || 'plaintext';
}

// ── Monaco editor theme config ────────────────────────────────────────────────
const MONACO_OPTIONS = {
  readOnly: true,
  minimap: { enabled: true },
  fontSize: 13,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  wordWrap: 'off',
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
  const { repoId } = useParams();
  const { repo, fileTree, loading: repoLoading, error: repoError, refetchRepo, livePhase } = useRepository();
  const [reanalyzing, setReanalyzing] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pageError, setPageError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { addToast } = useToast();

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [mobileAiOpen, setMobileAiOpen] = useState(false);

  // URL is the single source of truth
  const selectedPath = searchParams.get('path');
  const viewMode = searchParams.get('view') || 'source';

  const [fileContent, setFileContent] = useState(null); // { content, language }
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState(null);

  const [moduleDocs, setModuleDocs] = useState(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const { aiState } = useAIState();

  // Monaco editor instance ref — used for revealLine / decorations
  const editorRef = useRef(null);
  const decorationsRef = useRef(null); // Holds the active highlight decoration collection
  const [isEditorMounted, setIsEditorMounted] = useState(false);

  const handleSetViewMode = mode => {
    setSearchParams(
      prev => {
        const p = new URLSearchParams(prev);
        p.set('view', mode);
        return p;
      },
      { replace: true }
    );
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
        type: 'error',
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
        type: 'error',
      });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // ── openFile — central navigation function ─────────────────────────────────
  const openFile = useCallback(
    async (filePath, line, endLine) => {
      if (!filePath) return;

      setSearchParams(
        prev => {
          const p = new URLSearchParams(prev);
          if (p.get('path') !== filePath) {
            p.delete('line'); // Wipe line if changing files
          }
          p.set('path', filePath);
          if (line) {
            p.set('line', endLine ? `${line}-${endLine}` : line.toString());
          }
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // ── File Fetching Effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPath) return;

    let active = true;

    const fetchFile = async () => {
      setFileError(null);
      setFileLoading(true);
      setModuleDocs(null);
      // Clear any risk-block highlight decorations from the previous file
      if (decorationsRef.current) {
        decorationsRef.current.clear();
        decorationsRef.current = null;
      }
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
          repositoryApi.getModuleDocumentation(repoId, selectedPath),
        ]);

        if (!active) return;

        if (fileRes.status === 'fulfilled') {
          const { content, language, resolvedPath } = fileRes.value.data;
          const targetPath = resolvedPath || selectedPath;
          if (resolvedPath && resolvedPath !== selectedPath) {
            setSearchParams(
              prev => {
                const next = new URLSearchParams(prev);
                next.set('path', resolvedPath);
                return next;
              },
              { replace: true }
            );
          }
          setFileContent({ content, language: monacoLanguage(targetPath, language) });
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

    return () => {
      active = false;
    };
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
  const applyDynamicTheme = useCallback(monaco => {
    if (!monaco) return;

    const root = document.documentElement;
    const style = getComputedStyle(root);
    // Since our class might be 'theme-light', 'theme-ocean-dark', or absent (default dark).
    // The easiest way to know if it's dark is checking if '--color-surface' is dark,
    // or relying on our `ThemeContext` resolvedMode. But we don't have direct access to resolvedMode here easily without plumbing.
    // However, we can check if body/html has a '-light' class.
    const isLight = Array.from(root.classList).some(c => c.includes('-light'));
    const isDark = !isLight;

    const normalizeColor = color => {
      // Monaco's internal token parser crashes on 3-digit hex colors (like #fff) and rgb()
      // But we use rgb(r, g, b) variables like 13, 17, 23 or spaced values 13 17 23.
      // So we need to parse them.
      if (!color) return isDark ? '#161b22' : '#ffffff';

      const rgbMatch = color.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      if (rgbMatch) {
        const toHex = n => parseInt(n, 10).toString(16).padStart(2, '0');
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

  const handleEditorMount = useCallback(
    (editor, monaco) => {
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
    },
    [applyDynamicTheme]
  );

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
    // Clear any existing highlight decorations
    if (decorationsRef.current) {
      decorationsRef.current.clear();
      decorationsRef.current = null;
    }
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
  }

  /**
   * It receives a line range, then scrolls Monaco to center on the block,
   * and then it applies a persistent amber background decoration so the exact
   * discontinuous block is visually distinct from the rest of the file.
   * The decoration auto-clears when the user navigates to a new file.
   */
  function highlightRange(startLine, endLine) {
    const editor = editorRef.current;
    if (!editor || !startLine) return;
    const model = editor.getModel();
    if (!model) return;
    const end = endLine || startLine;

    // Clear previous decorations
    if (decorationsRef.current) {
      decorationsRef.current.clear();
      decorationsRef.current = null;
    }

    editor.revealLinesInCenter(startLine, end);

    // Apply decoration: highlighted background + gutter icon
    decorationsRef.current = editor.createDecorationsCollection([
      {
        range: {
          startLineNumber: startLine,
          startColumn: 1,
          endLineNumber: end,
          endColumn: model.getLineMaxColumn(end),
        },
        options: {
          isWholeLine: true,
          className: 'codelens-risk-highlight',
          overviewRuler: {
            color: '#f59e0b', // amber-500
            position: 4, // OverviewRulerLane.Full
          },
          minimap: {
            color: '#f59e0b',
            position: 1, // MinimapPosition.Inline
          },
        },
      },
    ]);

    // Also set cursor to the start of the block so keyboard navigation starts there
    editor.setPosition({ lineNumber: startLine, column: 1 });
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
      endLine: selection.endLineNumber,
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
            <div className="flex items-center gap-2">
              <button
                onClick={handleIncrementalAnalyze}
                disabled={reanalyzing}
                className="text-muted hover:text-text transition-colors p-1"
                title="Refresh File Tree"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reanalyzing ? 'animate-spin' : ''}`} />
              </button>
              {isMobile && (
                <button
                  onClick={() => setMobileTreeOpen(false)}
                  className="xl:hidden p-1 bg-surface/50 rounded text-muted hover:text-text border border-border/50 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="px-1 mb-3 shrink-0">
            <input
              type="text"
              placeholder="Search files..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <FileTree
              nodes={fileTree}
              selectedPath={selectedPath}
              onSelectFile={p => {
                openFile(p);
                setMobileTreeOpen(false);
              }}
              searchTerm={searchTerm}
            />
          </div>
        </div>
      ),
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
            isMobile={isMobile}
            onOpenMobileTree={() => setMobileTreeOpen(true)}
            onOpenMobileAi={() => setMobileAiOpen(true)}
          />
        </div>
      ),
    },
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
            filePath={selectedPath}
            getActiveContext={getActiveContext}
            onOpenFile={(filePath, line) => openFile(filePath, line)}
            onHighlightRange={(filePath, start, end) => {
              openFile(filePath).then(() => highlightRange(start, end));
            }}
            onMobileClose={isMobile ? () => setMobileAiOpen(false) : null}
          />
        </div>
      ),
    });
  }

  return (
    <>
      <ResizableLayout panels={isMobile ? [panels[1]] : panels} />

      {/* Mobile File Tree Drawer */}
      {isMobile && (
        <div
          className={`fixed inset-0 z-[100] transition-opacity ${mobileTreeOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileTreeOpen(false)} />
          <div
            className={`absolute top-0 left-0 bottom-0 w-[85%] max-w-sm bg-panel border-r border-border transform transition-transform duration-300 ${mobileTreeOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}
          >
            {panels[0].content}
          </div>
        </div>
      )}

      {/* Mobile AI Panel Drawer */}
      {isMobile && viewMode !== 'docs' && (
        <div
          className={`fixed inset-0 z-[100] transition-opacity ${mobileAiOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileAiOpen(false)} />
          <div
            className={`absolute top-0 right-0 bottom-0 w-[85%] max-w-sm bg-panel border-l border-border transform transition-transform duration-300 ${mobileAiOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}
          >
            {panels[panels.length - 1].content}
          </div>
        </div>
      )}
    </>
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
function CodeViewer({
  repoId,
  filePath,
  fileContent,
  loading,
  error,
  onEditorMount,
  viewMode,
  setViewMode,
  moduleDocs,
  onGenerateAi,
  isGeneratingAi,
  isMobile,
  onOpenMobileTree,
  onOpenMobileAi,
}) {
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
      <div className="flex-1 flex flex-col items-center justify-center text-muted gap-4">
        <File className="w-12 h-12 opacity-30" />
        <p className="text-sm">Select a file from the tree to view its contents</p>
        {isMobile && (
          <button
            onClick={onOpenMobileTree}
            className="px-4 py-2 bg-accent/10 text-accent rounded hover:bg-accent/20 text-sm font-medium transition-colors flex items-center gap-2"
          >
            <FolderTree className="w-4 h-4" /> Browse Files
          </button>
        )}
      </div>
    );
  }

  const header = (
    <div className="flex items-center justify-between px-2 sm:px-4 pt-2 bg-panel border-b border-border shadow-sm shrink-0 z-10 relative">
      {loading && fileContent && (
        <div className="absolute bottom-0 left-0 h-0.5 bg-accent animate-pulse w-full z-20"></div>
      )}
      <div className="flex items-center flex-1">
        {isMobile && (
          <button onClick={onOpenMobileTree} className="mr-2 text-muted hover:text-text p-1.5 rounded hover:bg-surface">
            <FolderTree className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-6 justify-center">
        <button
          onClick={() => setViewMode('source')}
          className={`px-2 sm:px-4 py-2 text-[11px] sm:text-xs font-medium border-b-2 transition-all whitespace-nowrap ${viewMode === 'source' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text hover:border-border'}`}
        >
          Source Code
        </button>
        <button
          onClick={() => setViewMode('docs')}
          className={`px-2 sm:px-4 py-2 text-[11px] sm:text-xs font-medium border-b-2 transition-all whitespace-nowrap ${viewMode === 'docs' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text hover:border-border'}`}
        >
          Documentation
        </button>
      </div>
      <div className="flex-1 flex justify-end gap-1 sm:gap-2">
        <button
          onClick={handleToggleBookmark}
          className={`flex items-center gap-1.5 px-2 py-1 mb-1 rounded text-xs transition-colors ${bookmark ? 'text-accent hover:bg-accent/10' : 'text-muted hover:text-text hover:bg-text/10'}`}
          title={bookmark ? 'Remove bookmark' : 'Bookmark this file'}
        >
          <Bookmark className="w-3.5 h-3.5" fill={bookmark ? 'currentColor' : 'none'} />
        </button>
        {viewMode === 'source' && fileContent?.content && !isMobile && (
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-2 py-1 mb-1 rounded text-xs text-muted hover:text-text hover:bg-text/10 transition-colors"
            title="Copy source code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? <span className="text-green-400">Copied!</span> : <span>Copy</span>}
          </button>
        )}
        {isMobile && viewMode !== 'docs' && (
          <button
            onClick={onOpenMobileAi}
            className="ml-1 mb-1 text-accent hover:text-accent p-1.5 rounded bg-accent/10"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  let content;
  if (viewMode === 'docs') {
    content = (
      <div className="flex-1 overflow-y-auto bg-surface p-6 custom-scrollbar relative">
        <ModuleDocumentation
          docs={moduleDocs}
          repoId={repoId}
          onGenerateAi={onGenerateAi}
          isGeneratingAi={isGeneratingAi}
        />
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
            <p className="text-xs max-w-sm">
              Select a file within this directory from the tree to view its source code.
            </p>
          </div>
        </div>
      );
    } else if (error) {
      const isNotFound = typeof error === 'string' && error.toLowerCase().includes('not found');
      content = (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto gap-4">
          <div className="p-3 bg-danger/10 text-danger rounded-full border border-danger/20">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text mb-1">
              {isNotFound ? 'File Not Found' : 'Failed to Load File'}
            </h3>
            <p className="text-xs font-mono text-muted bg-surface px-2.5 py-1 rounded mb-3 break-all border border-border inline-block max-w-full">
              {filePath}
            </p>
            <p className="text-xs text-muted leading-relaxed">
              {isNotFound
                ? 'This file was referenced in historical git activity or commits, but is not present in the current repository tree (it may have been deleted, moved, or excluded).'
                : error}
            </p>
          </div>
          {onOpenMobileTree && (
            <button
              onClick={onOpenMobileTree}
              className="px-4 py-2 bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 rounded text-xs font-medium transition-colors flex items-center gap-2"
            >
              <FolderTree className="w-4 h-4" /> Browse Active Files
            </button>
          )}
        </div>
      );
    } else if (!fileContent) {
      content = null;
    } else if (/\.(png|jpe?g|gif|webp|ico|bmp)$/i.test(filePath)) {
      content = (
        <div className="flex-1 flex flex-col p-8 overflow-auto bg-panel custom-scrollbar relative">
          <div className="flex-1 flex items-center justify-center min-h-[40vh]">
            <img
              src={fileContent.content}
              alt={filePath}
              className="max-w-full max-h-[70vh] object-contain rounded drop-shadow-2xl border border-border"
            />
          </div>
        </div>
      );
    } else if (/\.svg$/i.test(filePath)) {
      const svgUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(fileContent.content)))}`;
      content = (
        <div className="flex-1 flex flex-col p-8 overflow-auto bg-panel custom-scrollbar">
          <div className="flex-1 flex items-center justify-center min-h-[40vh]">
            <img
              src={svgUrl}
              alt={filePath}
              className="max-w-full max-h-[70vh] object-contain rounded drop-shadow-2xl border border-border"
            />
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
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveNote();
              if (e.key === 'Escape') setShowNoteEditor(false);
            }}
          />
          <button
            onClick={handleSaveNote}
            className="px-2 py-1 bg-accent/10 text-accent rounded hover:bg-accent/20 text-xs"
          >
            Save
          </button>
          <button onClick={() => setShowNoteEditor(false)} className="px-2 py-1 text-muted hover:text-text text-xs">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between group/note">
          <p className="text-muted text-xs truncate max-w-xl">
            <span className="font-medium text-accent mr-2">Note:</span>
            {bookmark.note || <span className="opacity-50 italic">No note added.</span>}
          </p>
          <button
            onClick={() => {
              setEditNote(bookmark.note || '');
              setShowNoteEditor(true);
            }}
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

function AiPanel({ repoId, filePath, onOpenFile, onHighlightRange, getActiveContext, onMobileClose }) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const abortControllerRef = useRef(null);

  const chatKey = filePath ? `explorer:${filePath}` : 'explorer:repo';
  const fileName = filePath ? filePath.split('/').pop() : null;

  useEffect(() => {
    let mounted = true;
    if (!repoId) return;

    // Free any running AI request from previous file
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setMessages([]);

    chatStore
      .getChat(repoId, chatKey)
      .then(history => {
        if (mounted && Array.isArray(history)) {
          setMessages(history);
        }
      })
      .catch(err => {
        console.error('Failed to load explorer chat history:', err);
      });

    return () => {
      mounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [repoId, chatKey]);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleClearChat = async () => {
    setMessages([]);
    await chatStore.clearChat(repoId, chatKey).catch(() => {});
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    setQuestion('');
    const userMsg = { role: 'user', content: q };
    const currentMessages = messages;
    const updatedWithUser = [...currentMessages, userMsg];
    setMessages(updatedWithUser);
    chatStore.saveChat(repoId, chatKey, updatedWithUser).catch(() => {});
    setLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      const activeContext = getActiveContext ? getActiveContext() : null;
      const res = await repositoryApi.askQuestion(repoId, q, activeContext, currentMessages, {
        signal: abortControllerRef.current.signal,
      });

      // Handle both structured { answer: ... } and direct proxy { response: "..." } payloads
      const rawAns = res?.data?.answer || res?.data?.response || res?.data;
      let ans = rawAns;

      if (typeof rawAns === 'string') {
        try {
          const cleaned = rawAns
            .trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/, '')
            .replace(/\s*```$/, '');
          const parsed = JSON.parse(cleaned);
          if (parsed && typeof parsed === 'object') {
            ans = parsed;
          }
        } catch {
          ans = { summary: rawAns };
        }
      }

      if (!ans || typeof ans !== 'object') {
        ans = { summary: String(ans || 'No response returned from assistant.') };
      }

      const summaryText = ans.summary || ans.answer || ans.text || (typeof rawAns === 'string' ? rawAns : '') || '';
      const explanationText = ans.explanation || '';
      const fullContent = summaryText + (explanationText ? `\n\n${explanationText}` : '');

      const assistantMsg = {
        role: 'assistant',
        summary: summaryText,
        explanation: explanationText,
        content: fullContent,
        references: Array.isArray(ans.references) ? ans.references : res?.data?.references || [],
        facts: Array.isArray(ans.facts) ? ans.facts : res?.data?.facts || [],
        inferences: Array.isArray(ans.inferences) ? ans.inferences : [],
        intent: ans.intent || res?.data?.intent,
        isDeterministic: res?.data?.requiresAi === false,
      };

      setMessages(prev => {
        const next = [...prev, assistantMsg];
        chatStore.saveChat(repoId, chatKey, next).catch(() => {});
        return next;
      });
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return;
      }
      const msg = err?.response?.data?.error || err.message || 'Request failed';
      const errorMsg = { role: 'error', content: msg };
      setMessages(prev => {
        const next = [...prev, errorMsg];
        chatStore.saveChat(repoId, chatKey, next).catch(() => {});
        return next;
      });
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  return (
    <>
      <div className="h-10 flex items-center justify-between px-3 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Brain className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="text-xs font-medium text-text truncate" title={filePath || 'Repository Context'}>
            {fileName ? `Ask about ${fileName}` : 'Ask about this repo'}
          </span>
          {fileName && (
            <span className="text-[10px] text-muted bg-surface/70 px-1.5 py-0.5 rounded border border-border/40 font-mono hidden sm:inline">
              File
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              title={fileName ? `Clear conversation for ${fileName}` : 'Clear conversation'}
              className="p-1 rounded text-muted hover:text-text hover:bg-surface/50 text-[11px] flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="xl:hidden p-1 bg-surface/50 rounded text-muted hover:text-text border border-border/50 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-center px-2">
            <MessageSquare className="w-8 h-8 text-muted/30 mb-2" />
            <p className="text-xs text-text/90 font-medium">
              {fileName ? `Ask about ${fileName}` : 'Ask about the codebase'}
            </p>
            <p className="text-[11px] text-muted mt-1 leading-relaxed max-w-[240px]">
              {fileName ? (
                <>
                  Inquire about logic, functions, or dependencies in{' '}
                  <span className="font-mono text-text/80">{fileName}</span>.
                </>
              ) : (
                'Select a file to inspect, or ask a question about the repository.'
              )}
            </p>
            {fileName && (
              <div className="mt-3 flex flex-col gap-1.5 w-full max-w-[220px]">
                <button
                  type="button"
                  onClick={() => setQuestion(`What is the primary responsibility of ${fileName}?`)}
                  className="text-[10px] bg-surface/60 hover:bg-surface border border-border/60 hover:border-accent/40 rounded px-2 py-1 text-muted hover:text-text transition-colors text-left truncate"
                >
                  • What is the responsibility?
                </button>
                <button
                  type="button"
                  onClick={() => setQuestion(`Are there any potential risks or edge cases in ${fileName}?`)}
                  className="text-[10px] bg-surface/60 hover:bg-surface border border-border/60 hover:border-accent/40 rounded px-2 py-1 text-muted hover:text-text transition-colors text-left truncate"
                >
                  • Any potential risks?
                </button>
              </div>
            )}
          </div>
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

      <form onSubmit={handleSubmit} className="border-t border-border p-3 shrink-0 flex gap-2">
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
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover/msg:opacity-100 text-muted hover:text-text transition-opacity text-[10px] flex items-center gap-1"
            title="Copy Message"
          >
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
          {msg.isDeterministic ? (
            <Database className="w-3 h-3 text-success" />
          ) : (
            <Brain className="w-3 h-3 text-accent" />
          )}
          {msg.isDeterministic ? 'Deterministic' : 'AI Inference'}
        </span>
        <div className="flex items-center gap-3">
          {msg.intent && <span className="text-[9px] text-muted uppercase tracking-wider">{msg.intent}</span>}
        </div>
      </div>

      <AiResponse
        data={{
          summary: msg.summary || msg.content,
          facts: msg.facts,
          inferences: msg.inferences,
          references: msg.references,
        }}
        title={null}
        onNavigate={onOpenFile}
      />
      <div className="flex justify-start">
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover/msg:opacity-100 text-muted hover:text-text transition-opacity text-[10px] flex items-center gap-1"
          title="Copy Response"
        >
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
