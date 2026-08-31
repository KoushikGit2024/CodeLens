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
import { ChevronRight, ChevronDown, File, Folder, Code2, Play, Search, Network, Brain, Database, FileText, X, MessageSquare, Send, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import { repositoryApi } from '../../shared/api';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { useRepository } from '../../shared/context/RepositoryContext';
import { FileTree } from './FileTree';
import AiResponse from '../../shared/components/ai/AiResponse';
import AiMarkdown from '../../shared/components/ai/AiMarkdown';

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
  const { repo, fileTree, loading: repoLoading, error: repoError } = useRepository();
  const [reanalyzing, setReanalyzing] = useState(false);
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();

  const [pageError, setPageError] = useState(null);

  // Currently open file
  const [selectedPath, setSelectedPath]  = useState(null);
  const [fileContent,  setFileContent]   = useState(null);   // { content, language }
  const [fileLoading,  setFileLoading]   = useState(false);
  const [fileError,    setFileError]     = useState(null);

  // Monaco editor instance ref — used for revealLine / decorations
  const editorRef = useRef(null);


  const handleIncrementalAnalyze = async () => {
    setReanalyzing(true);
    try {
      await repositoryApi.analyzeIncremental(repoId);
      window.location.reload(); // Hard reload to fetch everything again
    } catch (err) {
      console.error(err);
    } finally {
      setReanalyzing(false);
    }
  };



  // ── openFile — central navigation function ─────────────────────────────────
  const openFile = useCallback(async (filePath, line, endLine) => {
    if (!filePath) return;

    // Don't re-fetch if already showing this file (unless a line jump is requested)
    if (filePath === selectedPath && !line) return;

    setSelectedPath(filePath);
    setFileError(null);
    setFileLoading(true);
    setFileContent(null);

    try {
      const res = await repositoryApi.getFile(repoId, filePath);
      const { content, language } = res.data;
      setFileContent({ content, language: monacoLanguage(filePath, language) });
    } catch (err) {
      setFileError(err?.response?.data?.error || err.message || 'Failed to load file');
    } finally {
      setFileLoading(false);
    }

    // Reveal line after editor mounts — handled in handleEditorMount
    if (line) {
      pendingLineRef.current = { line, endLine };
    }
  }, [repoId, selectedPath]);

  // ── Handle ?path= and ?line= from deep-links (e.g. DependencyGraphPage) ───
  useEffect(() => {
    const deepPath = searchParams.get('path');
    const deepLine = searchParams.get('line');
    if (deepPath) {
      if (deepLine) {
        const parts = deepLine.split('-');
        const startLine = parseInt(parts[0], 10);
        const endLine = parts.length > 1 ? parseInt(parts[1], 10) : undefined;
        openFile(deepPath, startLine, endLine);
      } else {
        openFile(deepPath);
      }
    }
  }, [searchParams, openFile]);

  // Pending line navigation — set before editor mounts, consumed on mount
  const pendingLineRef = useRef(null);

  // ── Monaco editor callbacks ────────────────────────────────────────────────
  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;
    if (pendingLineRef.current) {
      const { line, endLine } = pendingLineRef.current;
      if (endLine) {
        highlightRange(line, endLine);
      } else {
        revealLine(line);
      }
      pendingLineRef.current = null;
    }
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
    return <div className="p-8 text-white">Loading repository context...</div>;
  }
  
  if (repoError) {
    return (
      <div className="p-8 text-red-400 flex flex-col items-start gap-4">
        <div>Error loading repository: {repoError}</div>
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

  return (
    <ResizableLayout
      panels={[
        {
          id: 'fileTree',
          defaultSize: 20,
          minWidth: 200,
          collapsible: true,
          content: (
            <div className="flex-1 overflow-y-auto overflow-x-auto p-3 custom-scrollbar bg-panel">
              <p className="text-xs text-muted uppercase tracking-wider mb-2 px-1">Files</p>
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
          defaultSize: 55,
          minWidth: 300,
          collapsible: false,
          content: (
            <div className="flex-1 flex flex-col overflow-hidden bg-surface h-full">
              <CodeViewer
                filePath={selectedPath}
                fileContent={fileContent}
                loading={fileLoading}
                error={fileError}
                onEditorMount={handleEditorMount}
              />
            </div>
          )
        },
        {
          id: 'aiPanel',
          defaultSize: 25,
          minWidth: 250,
          collapsible: true,
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
        }
      ]}
    />
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
function CodeViewer({ filePath, fileContent, loading, error, onEditorMount }) {
  if (!filePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted gap-2">
        <File className="w-8 h-8 opacity-30" />
        <p className="text-sm">Select a file from the tree to view its contents</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
        <span className="text-muted text-sm">Loading {filePath.split('/').pop()}…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-danger">
        <AlertTriangle className="w-6 h-6" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!fileContent) return null;

  return (
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
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-accent/10 border border-accent/20 rounded px-2.5 py-1.5 text-xs text-white">
          <AiMarkdown content={msg.content} />
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
    <div className="flex flex-col gap-2 bg-surface/30 border border-border rounded p-2.5">
      <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-2">
        <span className="text-[10px] font-medium text-white/80 flex items-center gap-1">
          {msg.isDeterministic ? <Database className="w-3 h-3 text-success" /> : <Brain className="w-3 h-3 text-accent" />}
          {msg.isDeterministic ? 'Deterministic' : 'AI Inference'}
        </span>
        {msg.intent && (
          <span className="text-[9px] text-muted uppercase tracking-wider">{msg.intent}</span>
        )}
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
