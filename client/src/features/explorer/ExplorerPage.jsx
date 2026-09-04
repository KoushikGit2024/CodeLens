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
import { ChevronRight, ChevronDown, File, Folder, Code2, Play, Search, Network, Brain, Database, FileText, X, MessageSquare, Send, AlertTriangle, Loader2, RefreshCw, Image as ImageIcon, Copy, Check, FolderTree, Sparkles } from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import { repositoryApi } from '../../shared/api';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { useRepository } from '../../shared/context/RepositoryContext';
import { FileTree } from './FileTree';
import AiResponse from '../../shared/components/ai/AiResponse';
import AiMarkdown from '../../shared/components/ai/AiMarkdown';
import ModuleDocumentation from './ModuleDocumentation';
import AnalysisProgress from '../repository/AnalysisProgress';

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

// ── Main component ────────────────────────────────────────────────────────────

export default function ExplorerPage() {
  const { repoId }        = useParams();
  const { repo, fileTree, loading: repoLoading, error: repoError, refetchRepo } = useRepository();
  const [reanalyzing, setReanalyzing] = useState(false);
  const navigate          = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pageError, setPageError] = useState(null);

  // URL is the single source of truth
  const selectedPath = searchParams.get('path');
  const viewMode = searchParams.get('view') || 'source';

  const [fileContent,  setFileContent]   = useState(null);   // { content, language }
  const [fileLoading,  setFileLoading]   = useState(false);
  const [fileError,    setFileError]     = useState(null);

  const [moduleDocs,   setModuleDocs]    = useState(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Monaco editor instance ref — used for revealLine / decorations
  const editorRef = useRef(null);

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
    } finally {
      setReanalyzing(false);
    }
  };

  const handleGenerateAi = async () => {
    if (!selectedPath) return;
    setIsGeneratingAi(true);
    try {
      const docsRes = await repositoryApi.getModuleDocumentation(repoId, selectedPath, { generateAi: true });
      setModuleDocs(docsRes.data);
    } catch (err) {
      console.error('Failed to generate AI docs', err);
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
      setFileContent(null);

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
  }, [repoId, selectedPath]);

  // ── Line highlighting Effect ───────────────────────────────────────────────
  useEffect(() => {
    const lineParam = searchParams.get('line');
    if (lineParam && editorRef.current && !fileLoading && fileContent) {
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
  }, [searchParams.get('line'), fileLoading, fileContent]);

  // ── Monaco editor callbacks ────────────────────────────────────────────────
  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface text-white">
        <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
        <span className="text-sm text-muted">Loading repository...</span>
      </div>
    );
  }

  // If repo is reanalyzing after being ready, we can also show progress over the UI
  if (repo?.status === 'analyzing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-white">
        <AnalysisProgress currentPhase={repo.phase} phaseDetails={repo.phaseDetails} />
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
          className="px-3 py-1.5 bg-panel border border-border rounded text-sm text-white hover:bg-[#30363d] disabled:opacity-50 flex items-center gap-2"
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
        <div className="flex-1 overflow-y-auto overflow-x-auto p-3 custom-scrollbar bg-panel">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs text-muted uppercase tracking-wider">Files</p>
            <button 
              onClick={handleIncrementalAnalyze}
              disabled={reanalyzing}
              className="text-muted hover:text-white transition-colors"
              title="Refresh File Tree"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reanalyzing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <FileTree
            nodes={fileTree}
            selectedPath={selectedPath}
            onSelectFile={(p) => openFile(p)}
          />
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
  if (!filePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted gap-2">
        <File className="w-8 h-8 opacity-30" />
        <p className="text-sm">Select a file from the tree to view its contents</p>
      </div>
    );
  }

  const header = (
    <div className="flex items-center justify-center px-4 py-2 bg-panel border-b border-border shadow-sm shrink-0 z-10">
      <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-border/50">
        <button 
          onClick={() => setViewMode('source')} 
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'source' ? 'bg-accent/20 text-accent shadow-sm' : 'text-muted hover:text-white hover:bg-white/5'}`}
        >
          Source Code
        </button>
        <button 
          onClick={() => setViewMode('docs')} 
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'docs' ? 'bg-accent/20 text-accent shadow-sm' : 'text-muted hover:text-white hover:bg-white/5'}`}
        >
          Documentation
        </button>
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
    if (loading) {
      content = (
        <div className="flex-1 flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
          <span className="text-muted text-sm">Loading {filePath.split('/').pop()}…</span>
        </div>
      );
    } else if (error) {
      content = (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-danger">
          <AlertTriangle className="w-6 h-6" />
          <p className="text-sm">{error}</p>
        </div>
      );
    } else if (/\.(png|jpe?g|gif|svg|webp|ico|bmp)$/i.test(filePath)) {
      const imageUrl = `/api/repository/${repoId}/file?path=${encodeURIComponent(filePath)}`;
      content = (
        <div className="flex-1 flex flex-col p-8 overflow-auto bg-[#0d1117] custom-scrollbar">
          {/* <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-sm mb-6 mx-auto w-full max-w-lg">
            <ImageIcon className="w-5 h-5 shrink-0" />
            <p><strong>Image Viewer</strong> Rendering image directly.</p>
          </div> */}
          <div className="flex-1 flex items-center justify-center min-h-[40vh]">
            <img src={imageUrl} alt={filePath} className="max-w-full max-h-[70vh] object-contain rounded drop-shadow-2xl border border-white/10" />
          </div>
        </div>
      );
    } else if (!fileContent) {
      content = null;
    } else {
      content = (
        <Editor
          height="100%"
          language={fileContent.language || 'plaintext'}
          value={fileContent.content}
          theme="vs-dark"
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

  return (
    <div className="flex-1 flex flex-col h-full w-full relative">
      {header}
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
          className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-xs text-white placeholder-muted focus:outline-none focus:border-accent disabled:opacity-50"
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
      <div className="flex justify-end group/msg">
        <div className="flex flex-col gap-1 items-end max-w-[90%]">
          <div className="bg-accent/10 border border-accent/20 rounded px-2.5 py-1.5 text-xs text-white">
            <AiMarkdown content={msg.content} />
          </div>
          <button onClick={handleCopy} className="opacity-0 group-hover/msg:opacity-100 text-muted hover:text-white transition-opacity text-[10px] flex items-center gap-1" title="Copy Message">
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
    <div className="flex flex-col gap-2 bg-surface/30 border border-border rounded p-2.5 group/msg">
      <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-2">
        <span className="text-[10px] font-medium text-white/80 flex items-center gap-1">
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
        <button onClick={handleCopy} className="opacity-0 group-hover/msg:opacity-100 text-muted hover:text-white transition-opacity text-[10px] flex items-center gap-1" title="Copy Response">
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
