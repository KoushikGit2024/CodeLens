import React, { useState, useEffect, useRef } from 'react';
import AiMarkdown from './AiMarkdown';
import AiReference from './AiReference';
import { AlertCircle, FileText, Settings, ShieldAlert, Sparkles, Lightbulb, ListChecks, Send, Loader2, User } from 'lucide-react';
import { repositoryApi } from '../../api';
import { useRepository } from '../../context/RepositoryContext';

/**
 * A canonical component to present AI responses consistently across CodeLens.
 * It expects a structured object that might contain:
 * - status (e.g. 'unavailable', 'error')
 * - summary / explanation / answer
 * - facts (deterministic facts)
 * - inferences / keyCharacteristics / observations / insights
 * - recommendations / recommendedActions / strategies
 * - risks / mainRisks / limitations
 * - references (array of strings or objects)
 */
export default function AiResponse({ data, title = "AI Intelligence", onNavigate, repoId, chatId }) {
  const { repo } = useRepository();
  const [chatHistory, setChatHistory] = useState(() => {
    // In production, fallback to localStorage since the backend has no persistent disk
    if (import.meta.env.PROD) {
      const cached = localStorage.getItem(`chat_${repoId}_${chatId}`);
      return cached ? JSON.parse(cached) : [];
    }
    // In development, use the backend-provided persistent chat history
    return (repo?.chats && repo.chats[chatId]) || [];
  });
  const [input, setInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [chatError, setChatError] = useState(null);
  const chatEndRef = useRef(null);

  const handleAskQuestion = async (e) => {
    e.preventDefault();
    if (!input.trim() || !repoId) return;

    const userMessage = { role: 'user', content: input.trim() };
    setChatHistory(prev => [...prev, userMessage]);
    setInput('');
    setIsAsking(true);
    setChatError(null);

    // Scroll to bottom
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    try {
      const activeContext = {
        baseData: data,
        history: chatHistory
      };
      const res = await repositoryApi.askQuestion(repoId, userMessage.content, activeContext);
      
      const newHistory = [...chatHistory, userMessage, { role: 'assistant', content: res.data.answer }];
      setChatHistory(newHistory);
      
      if (import.meta.env.PROD) {
        // Persist to local storage in production
        localStorage.setItem(`chat_${repoId}_${chatId}`, JSON.stringify(newHistory));
      } else {
        // Persist to backend disk silently in development
        repositoryApi.saveChatHistory(repoId, chatId, newHistory).catch(e => {
          console.error('Failed to sync chat history to server', e);
        });
      }

    } catch (err) {
      setChatError(err.response?.data?.error || err.message || 'Failed to get a response.');
      // Remove the user message if it failed entirely, or leave it and show error? 
      // It's usually better to leave the message and show an error below it.
    } finally {
      setIsAsking(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  if (!data) return null;

  // Handle offline/error states natively
  if (data.status === 'unavailable' || data.configured === false) {
    return (
      <div className="bg-surface/50 border border-warning/20 rounded-lg p-5">
        <div className="flex items-center gap-2 text-warning mb-2">
          <Settings className="w-5 h-5" />
          <h3 className="font-semibold text-sm">AI Unavailable</h3>
        </div>
        <p className="text-xs text-warning/80 leading-relaxed mb-4">
          The AI provider is currently unconfigured or unreachable. 
          Deterministic analysis remains fully available.
        </p>
        <div className="text-[10px] uppercase tracking-wider text-muted font-bold border-t border-border pt-4">
          Deterministic Mode Active
        </div>
      </div>
    );
  }

  if (data.status === 'error' || data.error) {
    return (
      <div className="bg-danger/10 border border-danger/20 rounded-lg p-5">
        <div className="flex items-center gap-2 text-danger mb-2">
          <AlertCircle className="w-5 h-5" />
          <h3 className="font-semibold text-sm">AI Error</h3>
        </div>
        <p className="text-xs text-danger/80 leading-relaxed">
          {data.error || 'An error occurred while generating the AI response.'}
        </p>
      </div>
    );
  }

  // Normalize data fields from different generators
  const summary = data.summary || data.answer || data.text || data.architectureSummary;
  const explanation = data.explanation || data.architectureExplanation;
  const facts = data.facts || [];
  const inferences = data.inferences || data.keyCharacteristics || data.observations || [];
  const recommendations = data.recommendations || data.recommendedActions || data.strategies || [];
  const risks = data.risks || data.mainRisks || data.limitations || [];
  const references = data.references || [];

  return (
    <div className="flex flex-col gap-6">
      {/* ── Summary / Main Content ────────────────────────────────────────── */}
      {summary && (
        <section>
          {title && (
            <h3 className="text-xs uppercase text-muted tracking-wider mb-3 font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              {title}
            </h3>
          )}
          <AiMarkdown content={summary} className="text-white/90" />
        </section>
      )}

      {/* ── Explanation ───────────────────────────────────────────────────── */}
      {explanation && (
        <section>
          <h3 className="text-xs uppercase text-muted tracking-wider mb-3 font-bold flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-accent" />
            Detailed Explanation
          </h3>
          <AiMarkdown content={explanation} className="text-white/90" />
        </section>
      )}

      {/* ── Deterministic Facts ───────────────────────────────────────────── */}
      {facts && facts.length > 0 && (
        <section className="bg-panel/50 border border-border/50 rounded-lg p-4">
          <h4 className="text-[10px] uppercase text-muted tracking-wider mb-3 font-bold flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5 text-success" />
            Deterministic Facts
          </h4>
          <ul className="list-disc pl-4 flex flex-col gap-1.5">
            {facts.map((fact, i) => (
              <li key={i} className="text-xs text-white/80 leading-relaxed">
                <AiMarkdown content={fact} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── AI Inferences ─────────────────────────────────────────────────── */}
      {inferences && inferences.length > 0 && (
        <section>
          <h4 className="text-[10px] uppercase text-muted tracking-wider mb-2 font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#cba6f7]" />
            AI Inferences
          </h4>
          <ul className="list-disc pl-4 flex flex-col gap-1.5">
            {inferences.map((inf, i) => (
              <li key={i} className="text-xs text-white/80 leading-relaxed">
                <AiMarkdown content={inf} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Risks & Limitations ───────────────────────────────────────────── */}
      {risks && risks.length > 0 && (
        <section className="bg-danger/5 border border-danger/10 rounded-lg p-4">
          <h4 className="text-[10px] uppercase text-danger/80 tracking-wider mb-2 font-bold flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            Risks & Limitations
          </h4>
          <ul className="list-disc pl-4 flex flex-col gap-1.5">
            {risks.map((risk, i) => (
              <li key={i} className="text-xs text-danger/90 leading-relaxed">
                <AiMarkdown content={risk} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Recommendations ───────────────────────────────────────────────── */}
      {recommendations && recommendations.length > 0 && (
        <section className="bg-success/5 border border-success/10 rounded-lg p-4">
          <h4 className="text-[10px] uppercase text-success/80 tracking-wider mb-2 font-bold flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" />
            Recommendations
          </h4>
          <ul className="list-disc pl-4 flex flex-col gap-1.5">
            {recommendations.map((rec, i) => (
              <li key={i} className="text-xs text-success/90 leading-relaxed">
                <AiMarkdown content={rec} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Source References ─────────────────────────────────────────────── */}
      {references && references.length > 0 && (
        <section className="border-t border-border pt-4">
          <h4 className="text-[10px] uppercase text-muted tracking-wider mb-3 font-bold flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Source References
          </h4>
          <div className="flex flex-wrap gap-2">
            {references.map((ref, i) => (
              <AiReference key={i} reference={ref} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      )}

      {/* ── Continuous Chat UI ───────────────────────────────────────────── */}
      {(repoId && chatId && (data.status !== 'error' && data.status !== 'unavailable')) && (
        <section className="mt-4 border-t border-border pt-6 flex flex-col gap-4">
          
          {/* Chat History */}
          {chatHistory.length > 0 && (
            <div className="flex flex-col gap-4 mb-2">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0 mt-1">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                    </div>
                  )}
                  <div className={`text-sm px-4 py-2.5 rounded-lg max-w-[85%] ${
                    msg.role === 'user' 
                      ? 'bg-panel border border-border text-white' 
                      : 'bg-transparent text-white/90'
                  }`}>
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <AiMarkdown content={msg.content} />
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded bg-panel border border-border flex items-center justify-center shrink-0 mt-1">
                      <User className="w-3.5 h-3.5 text-muted" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Error Message */}
          {chatError && (
            <div className="flex items-center gap-2 text-danger text-xs bg-danger/10 p-2 rounded border border-danger/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {chatError}
            </div>
          )}

          {/* Chat Input */}
          <form onSubmit={handleAskQuestion} className="relative mt-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a follow-up question about this context..."
              disabled={isAsking}
              className="w-full bg-panel border border-border rounded-lg pl-4 pr-12 py-3 text-sm text-white placeholder-muted focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isAsking}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-surface text-muted hover:text-white transition-colors disabled:opacity-50"
            >
              {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
