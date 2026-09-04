import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, ChevronLeft, MessageSquare, Send, File, Brain, Database, AlertTriangle, Layers, MapPin } from 'lucide-react';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import AiMarkdown from '../../shared/components/ai/AiMarkdown';
import { useRepository } from '../../shared/context/RepositoryContext';

export default function RepositoryAssistantPage() {
  const { repoId } = useParams();
  const { repo, loading: repoLoading, error: repoError } = useRepository();
  const navigate = useNavigate();
  const bottomRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);

  const chatRepoIdRef = useRef(repoId);

  useEffect(() => {
    setMessages([]);
    chatRepoIdRef.current = repoId;
    async function loadChat() {
      if (!repoId) return;
      try {
        const stored = localStorage.getItem(`codelens_chats_${repoId}_assistant`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
          }
        }
      } catch (err) {
        console.error('Failed to load chat history from localStorage', err);
      }
    }
    loadChat();
  }, [repoId]);

  useEffect(() => {
    if (messages.length > 0 && repoId && chatRepoIdRef.current === repoId) {
      try {
        localStorage.setItem(`codelens_chats_${repoId}_assistant`, JSON.stringify(messages));
      } catch (err) {
        console.error('Failed to save chat history to localStorage', err);
      }
    }
  }, [messages, repoId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e, presetQuestion = null) {
    if (e) e.preventDefault();
    const q = (presetQuestion || question).trim();
    if (!q || loading) return;

    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const res = await repositoryApi.askQuestion(repoId, q);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.answer, // structured answer
        intent: res.data.intent,
        requiresAi: res.data.requiresAi
      }]);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Request failed';
      setMessages(prev => [...prev, { role: 'error', content: msg }]);
    } finally {
      setLoading(false);
    }
  }

  if (repoLoading) {
    return <div className="p-8 text-white">Loading assistant...</div>;
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
                navigate(`/explore/${repoId}`);
              }}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
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
    <div className="flex-1 h-full w-full flex flex-col overflow-hidden bg-surface text-white">

      {/* ── Main Chat Area ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6" style={{ background: '#0d1117' }}>
        <div className="max-w-4xl w-full mx-auto flex flex-col gap-6">
          
          {messages.length === 0 && (
            <div className="mt-12 text-center animate-fade-in">
              <Brain className="w-12 h-12 text-accent/50 mx-auto mb-4" />
              <h1 className="text-2xl font-semibold mb-2">How can I help you understand this codebase?</h1>
              <p className="text-muted text-sm mb-8">
                Ask a natural-language question. Answers are grounded in the repository's structural facts.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto text-left">
                <SuggestionCard text="What are the entry points?" onClick={(q) => handleSubmit(null, q)} />
                <SuggestionCard text="How many files are in this project?" onClick={(q) => handleSubmit(null, q)} />
                <SuggestionCard text="What are the main architectural components?" onClick={(q) => handleSubmit(null, q)} />
                <SuggestionCard text="How does authentication work?" onClick={(q) => handleSubmit(null, q)} />
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage key={i} msg={msg} repoId={repoId} />
          ))}

          {loading && (
            <div className="flex items-center gap-3 text-muted bg-panel border border-border rounded-lg p-4 self-start">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
              <span className="text-sm">Analyzing repository intelligence...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input Area ─────────────────────────────────────────────────────── */}
      <div className="bg-panel border-t border-border p-4 shrink-0">
        <form
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto relative flex items-center"
        >
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Ask a question about the repository..."
            disabled={loading}
            className="w-full bg-surface border border-border rounded-lg pl-4 pr-12 py-3 text-sm text-white placeholder-muted focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="absolute right-2 flex items-center justify-center w-8 h-8 bg-accent text-white rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="text-center mt-2">
          <span className="text-[10px] text-muted">
            CodeLens uses deterministic analysis first, falling back to AI interpretation only when needed.
          </span>
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({ text, onClick }) {
  return (
    <button
      onClick={() => onClick(text)}
      className="bg-panel border border-border hover:border-accent/50 hover:bg-surface rounded-lg p-3 text-sm text-white/90 text-left transition-colors"
    >
      {text}
    </button>
  );
}

function ChatMessage({ msg, repoId }) {
  if (msg.role === 'user') {
    return (
      <div className="self-end max-w-[85%] bg-accent text-white rounded-lg px-4 py-3 text-sm shadow-md">
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

  // Assistant message (Structured Answer)
  const ans = msg.content;
  const isDeterministic = !msg.requiresAi;

  return (
    <div className="self-start w-full max-w-4xl bg-panel border border-border rounded-lg overflow-hidden shadow-sm">
      <div className="bg-surface/50 border-b border-border px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-white/80 flex items-center gap-1.5">
          {isDeterministic ? <Database className="w-3.5 h-3.5 text-success" /> : <Brain className="w-3.5 h-3.5 text-accent" />}
          {isDeterministic ? 'Deterministic Query' : 'AI Interpretation'}
        </span>
        <span className="text-[10px] text-muted uppercase tracking-wider bg-surface px-1.5 py-0.5 rounded border border-border">
          Intent: {msg.intent || 'GENERAL'}
        </span>
      </div>
      
      <div className="p-5">
        <AiResponse data={ans} title={null} />
      </div>
    </div>
  );
}
