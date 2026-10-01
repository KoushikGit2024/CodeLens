/**
 * RepositoryAssistantPage.jsx
 *
 * It loads the conversational interface, then extracts user queries, 
 * and then it applies the local AI context hook to proxy grounded requests to LLM.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Brain, AlertTriangle, AlertCircle, Trash2, XCircle } from 'lucide-react';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import AiMarkdown from '../../shared/components/ai/AiMarkdown';
import { useRepository } from '../../shared/context/RepositoryContext';
import { useAI } from '../../shared/context/AIContext';
import ChatInputArea from './ChatInputArea';

export default function RepositoryAssistantPage() {
  const { repoId } = useParams();
  const { repo, fileTree, loading: repoLoading, error: repoError, refetchRepo } = useRepository();
  const navigate = useNavigate();
  const bottomRef = useRef(null);

  /**
   * It initializes the AI state manager, then extracts IndexedDB chat histories, 
   * and then it applies automatic message syncing for the assistant feature.
   */
  const { messages, isLoading, error: chatError, sendMessage, clearHistory, effectiveState, stopGeneration } = useAI({ 
    repoId, 
    feature: 'assistant', 
    contextData: null 
  });

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  
  const chatInputRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const isAtBottomRef = useRef(true);

  const isExhausted = effectiveState === 'quota_exhausted';
  const disableInput = isLoading || isExhausted;

  // Derive the full flat list of repo file paths from the complete file tree
  // so that non-source files (configs, markdowns) can also be mentioned.
  const filePaths = useMemo(() => {
    if (!fileTree) return repo?.analysis?.files?.map(f => f.filePath) ?? [];
    
    const flat = [];
    const traverse = (nodes) => {
      for (const node of nodes) {
        if (node.type === 'file') flat.push(node.path);
        if (node.children) traverse(node.children);
      }
    };
    traverse(fileTree);
    return flat;
  }, [fileTree, repo?.analysis?.files]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // Consider "at bottom" if within 100px of the bottom
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
  };

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  /**
   * It intercepts the ChatInputArea's onSend event, then extracts the raw text
   * and attachments array, and then it applies them to the centralized sendMessage dispatcher.
   */
  const handleSend = async (text, attachments) => {
    if (disableInput) return;
    isAtBottomRef.current = true; // force scroll on new send
    try {
      await sendMessage(text, attachments);
    } catch (err) {
      // Error handled globally by AIContext
    }
  };

  // Suggestion card quick-send
  const handleSuggestion = async (q) => {
    if (disableInput) return;
    isAtBottomRef.current = true;
    try { await sendMessage(q, []); } catch {}
  };

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsGlobalDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsGlobalDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsGlobalDragging(false);
    if (e.dataTransfer?.files?.length && chatInputRef.current) {
      chatInputRef.current.attachFiles(e.dataTransfer.files);
    }
  }, []);

  if (repoLoading) {
    return <div className="p-8 text-text">Loading assistant...</div>;
  }

  if (repoError) {
    const errorMsg = repoError;
    const isNotReady = errorMsg.toLowerCase().includes('not ready') || errorMsg.toLowerCase().includes('pending');
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <AlertCircle className="w-6 h-6 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4 text-sm">{errorMsg}</p>
          {isNotReady ? (
            <button 
              onClick={async () => {
                await repositoryApi.analyze(repoId);
                await refetchRepo();
              }}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text rounded-lg text-sm font-medium transition-colors"
            >
              Start Analysis
            </button>
          ) : (
            <button onClick={() => navigate(-1)} className="text-sm text-accent hover:underline">
              ← Go back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="flex-1 h-full w-full flex flex-col overflow-hidden bg-surface text-text relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isGlobalDragging && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-accent m-4 rounded-xl">
          <div className="text-center animate-in zoom-in duration-200">
            <Brain className="w-16 h-16 text-accent mx-auto mb-4" style={{ animation: 'bounce 2s infinite' }} />
            <h2 className="text-2xl font-bold text-text mb-2">Drop files to attach</h2>
            <p className="text-muted">They will be added to your current message</p>
          </div>
        </div>
      )}

      {/* ── Main Chat Area ─────────────────────────────────────────────────── */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-6"
      >
        <div className="max-w-4xl w-full mx-auto flex flex-col gap-6">
          
          {messages.length === 0 && (
            <div className="mt-12 text-center animate-fade-in">
              <Brain className="w-12 h-12 text-accent/50 mx-auto mb-4" />
              <h1 className="text-2xl font-semibold mb-2">How can I help you understand this codebase?</h1>
              <p className="text-muted text-sm mb-8">
                Ask anything. Type <kbd className="bg-panel border border-border rounded px-1 py-0.5 text-[11px] font-mono">@</kbd> to attach a file from the repository, or drag &amp; drop files directly.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto text-left" title={isExhausted ? "AI limit exceeded" : ""}>
                <SuggestionCard text="What are the entry points?" onClick={handleSuggestion} disabled={disableInput} />
                <SuggestionCard text="How many files are in this project?" onClick={handleSuggestion} disabled={disableInput} />
                <SuggestionCard text="What are the main architectural components?" onClick={handleSuggestion} disabled={disableInput} />
                <SuggestionCard text="How does authentication work?" onClick={handleSuggestion} disabled={disableInput} />
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage key={i} msg={msg} repoId={repoId} />
          ))}

          {isLoading && <ThinkingIndicator onStop={stopGeneration} />}
          
          {chatError && (
             <div className="flex items-center gap-3 text-danger bg-danger/10 border border-danger/20 rounded-lg p-4 self-start">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span className="text-sm">{chatError}</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input Area ─────────────────────────────────────────────────────── */}
      <div className="bg-panel/80 border-t border-border p-4 shrink-0" style={{ backdropFilter: 'blur(8px)' }}>
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          <ChatInputArea
            ref={chatInputRef}
            repoId={repoId}
            filePaths={filePaths}
            disabled={disableInput}
            onSend={handleSend}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted">
              CodeLens uses deterministic analysis first, falling back to AI only when needed. Type <kbd className="bg-panel border border-border rounded px-1 font-mono">@</kbd> to attach a file.
            </span>
            {messages.length > 0 && (
              showClearConfirm ? (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
                  <span className="text-[10px] text-danger font-medium uppercase tracking-wider">Clear history?</span>
                  <button
                    onClick={() => { clearHistory(); setShowClearConfirm(false); }}
                    className="text-[10px] bg-danger text-text px-2 py-0.5 rounded hover:bg-danger/80 transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="text-[10px] bg-surface text-text px-2 py-0.5 rounded border border-border hover:bg-panel transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="text-[10px] text-muted hover:text-danger flex items-center gap-1 transition-colors"
                  title="Clear conversation"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThinkingIndicator({ onStop }) {
  const PHASES = [
    'Thinking…',
    'Reading context…',
    'Consulting AI…',
    'Synthesising response…',
    'Almost there…',
  ];
  const [phase, setPhase] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const phraseTimer = setInterval(() =>
      setPhase(p => (p + 1) % PHASES.length), 2200
    );
    const dotTimer = setInterval(() =>
      setDots(d => (d + 1) % 4), 500
    );
    return () => { clearInterval(phraseTimer); clearInterval(dotTimer); };
  }, []);

  const dotStr = '.'.repeat(dots);

  return (
    <div
      className="flex items-center justify-between self-start rounded-xl border border-border px-4 py-3 min-w-[280px]"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      <div className="flex items-center gap-3">
        {/* Pulsing brain icon */}
        <div className="relative shrink-0">
          <Brain
            className="w-4 h-4 text-accent"
            style={{ animation: 'pulse 1.4s ease-in-out infinite' }}
          />
        </div>

        {/* Phase text + dots */}
        <span className="text-sm text-text/70 tabular-nums" style={{ minWidth: 160 }}>
          {PHASES[phase]}<span className="text-accent/60" style={{ letterSpacing: 2 }}>{dotStr}</span>
        </span>

        {/* Three bouncing dots */}
        <span className="flex gap-1 items-center" aria-hidden>
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="block w-1.5 h-1.5 rounded-full bg-accent/60"
              style={{
                animation: `bounce 1.2s ease-in-out ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </span>
      </div>

      {onStop && (
        <button 
          onClick={onStop} 
          className="ml-4 text-muted hover:text-danger p-1 rounded hover:bg-danger/10 transition-colors"
          title="Stop generating"
        >
          <XCircle className="w-4 h-4" />
        </button>
      )}

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.6; }
          40%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function SuggestionCard({ text, onClick, disabled }) {
  return (
    <button
      onClick={() => onClick(text)}
      disabled={disabled}
      className="bg-panel border border-border hover:border-accent/50 hover:bg-surface rounded-lg p-3 text-sm text-text/90 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {text}
    </button>
  );
}

/**
 * It examines the message role, then extracts the content payload, 
 * and then it applies Markdown formatting for either the user or the AI Assistant.
 */
function ChatMessage({ msg, repoId }) {
  if (msg.role === 'user') {
    return (
      <div className="self-end max-w-[85%] bg-accent text-text rounded-lg px-4 py-3 text-sm shadow-md">
        <AiMarkdown content={msg.content} />
      </div>
    );
  }

  if (msg.role === 'error') {
    return (
      <div className="self-start max-w-[85%] text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span>{msg.content}</span>
      </div>
    );
  }

  return (
    <div className="self-start w-full max-w-4xl bg-panel border border-border rounded-lg overflow-hidden shadow-sm">
      <div className="bg-surface/50 border-b border-border px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text/80 flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-accent" />
          AI Interpretation
        </span>
        <span className="text-[10px] text-muted uppercase tracking-wider bg-surface px-1.5 py-0.5 rounded border border-border">
          CodeLens AI
        </span>
      </div>
      
      <div className="p-5">
        <AiResponse data={msg.content} title={null} />
      </div>
    </div>
  );
}