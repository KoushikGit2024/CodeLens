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
import { Loader2, File, FileText, Brain, Database } from 'lucide-react';
import { Panel, Group as PanelGroup } from 'react-resizable-panels';
import { repositoryApi } from '../api';
import { FileTree } from '../components/FileTree';
import { PanelResizer } from '../components/PanelResizer';

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
  const [reanalyzing, setReanalyzing] = useState(false);
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();

  const [repo,     setRepo]     = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [pageError, setPageError] = useState(null);

  // Currently open file
  const [selectedPath, setSelectedPath]  = useState(null);
  const [fileContent,  setFileContent]   = useState(null);   // { content, language }
  const [fileLoading,  setFileLoading]   = useState(false);
  const [fileError,    setFileError]     = useState(null);

  // Monaco editor instance ref — used for revealLine / decorations
  const editorRef = useRef(null);

  // ── Load repo + file tree ──────────────────────────────────────────────────
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
        if (!cancelled) setPageError(err?.response?.data?.error || err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [repoId]);

  const handleIncrementalAnalyze = async () => {
    setReanalyzing(true);
    try {
      await repositoryApi.analyzeIncremental(repoId);
      const [repoRes, treeRes] = await Promise.all([
        repositoryApi.get(repoId),
        repositoryApi.listFiles(repoId),
      ]);
      setRepo(repoRes.data);
      setFileTree(treeRes.data.tree);
    } catch (err) {
      console.error(err);
    } finally {
      setReanalyzing(false);
    }
  };

  // ── Handle ?path= and ?line= from deep-links (e.g. DependencyGraphPage) ───
  useEffect(() => {
    const deepPath = searchParams.get('path');
    const deepLine = searchParams.get('line');
    if (deepPath) {
      openFile(deepPath, deepLine ? parseInt(deepLine, 10) : undefined);
    }
  }, []); // run once on mount

  // ── openFile — central navigation function ─────────────────────────────────
  const openFile = useCallback(async (filePath, line) => {
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
      pendingLineRef.current = line;
    }
  }, [repoId, selectedPath]);

  // Pending line navigation — set before editor mounts, consumed on mount
  const pendingLineRef = useRef(null);

  // ── Monaco editor callbacks ────────────────────────────────────────────────
  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;
    if (pendingLineRef.current) {
      revealLine(pendingLineRef.current);
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

  // ── Error / loading states ─────────────────────────────────────────────────
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
    <PanelGroup direction="horizontal" className="h-full w-full">
          {/* Sidebar — file tree: independently scrollable */}
          <Panel defaultSize={20} minSize={15} className="bg-panel flex flex-col">
            <div className="flex-1 overflow-y-auto overflow-x-auto p-3 custom-scrollbar">
              <p className="text-xs text-muted uppercase tracking-wider mb-2 px-1">Files</p>
              <FileTree
                nodes={fileTree}
                selectedPath={selectedPath}
                onSelectFile={(p) => openFile(p)}
              />
            </div>
          </Panel>

          <PanelResizer />

          {/* Center — Monaco editor: fills remaining space, Monaco handles its own scroll */}
          <Panel defaultSize={55} minSize={30} className="min-w-0 flex flex-col overflow-hidden bg-surface">
            <CodeViewer
              filePath={selectedPath}
              fileContent={fileContent}
              loading={fileLoading}
              error={fileError}
              onEditorMount={handleEditorMount}
            />
          </Panel>

          <PanelResizer />

          {/* Right panel — AI Q&A: independently scrollable (chat messages) */}
          <Panel defaultSize={25} minSize={20} className="bg-panel flex flex-col">
            <AiPanel
              repoId={repoId}
              onOpenFile={(filePath, line) => openFile(filePath, line)}
              onHighlightRange={(filePath, start, end) => {
                openFile(filePath).then(() => highlightRange(start, end));
              }}
            />
          </Panel>
    </PanelGroup>
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

function AiPanel({ repoId, onOpenFile, onHighlightRange }) {
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
      // Use the new Step 8 endpoint
      const res = await repositoryApi.askQuestion(repoId, q);
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
        <div className="max-w-[85%] bg-accent/10 border border-accent/20 rounded px-2.5 py-1.5 text-xs text-white whitespace-pre-wrap">
          {msg.content}
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
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-white/80 flex items-center gap-1">
          {msg.isDeterministic ? <Database className="w-3 h-3 text-success" /> : <Brain className="w-3 h-3 text-accent" />}
          {msg.isDeterministic ? 'Deterministic' : 'AI Inference'}
        </span>
        {msg.intent && (
          <span className="text-[9px] text-muted uppercase tracking-wider">{msg.intent}</span>
        )}
      </div>

      <div className="text-xs text-white/90 whitespace-pre-wrap leading-relaxed">
        {msg.content}
      </div>

      {msg.facts && msg.facts.length > 0 && (
        <div className="mt-1">
          <span className="text-[10px] font-medium text-muted uppercase">Facts</span>
          <ul className="list-disc list-inside text-[11px] text-white/70 space-y-0.5 mt-0.5">
            {msg.facts.slice(0, 3).map((f, i) => <li key={i} className="truncate">{f}</li>)}
            {msg.facts.length > 3 && <li className="italic">+{msg.facts.length - 3} more</li>}
          </ul>
        </div>
      )}

      {msg.references && msg.references.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-2 pt-2 border-t border-border">
          <span className="text-[10px] font-medium text-muted uppercase mb-0.5">References</span>
          {msg.references.map((ref, i) => (
            <button
              key={i}
              onClick={() => onOpenFile(ref.path, ref.startLine)}
              className="flex items-center gap-1 text-[11px] text-accent/80 hover:text-accent transition-colors text-left group"
              title={`Open ${ref.path}${ref.startLine ? ` at line ${ref.startLine}` : ''}`}
            >
              <File className="w-3 h-3 shrink-0" />
              <span className="font-mono truncate">
                {ref.path}{ref.startLine ? `:${ref.startLine}` : ''}
              </span>
              {ref.reason && (
                <span className="text-[9px] text-muted ml-1 truncate group-hover:text-accent/60">({ref.reason})</span>
              )}
            </button>
          ))}
        </div>
      )}
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
