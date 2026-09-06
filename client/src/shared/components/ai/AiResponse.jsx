import React, { useState, useEffect, useRef } from 'react';
import AiMarkdown from './AiMarkdown';
import AiReference from './AiReference';
import { AlertCircle, FileText, Settings, ShieldAlert, Sparkles, Lightbulb, ListChecks, Send, Loader2, User, Copy, Check } from 'lucide-react';
import { useAI } from '../../context/AIContext';

// ── TypewriterMarkdown (New Animation Component) ──────────────────────────────
function TypewriterMarkdown({ content, animate = true, speed = 15, className = "" }) {
  const [displayed, setDisplayed] = useState(animate ? '' : content);
  const [isTyping, setIsTyping] = useState(animate);

  useEffect(() => {
    // If animation is disabled or there is no content, just render it instantly
    if (!animate || !content) {
      setDisplayed(content);
      setIsTyping(false);
      return;
    }

    let currentLength = 0;
    setIsTyping(true);
    
    // Adaptive chunk size: prevents massive responses from taking 2 minutes to type out,
    // while keeping short responses looking like a natural keystroke speed.
    const chunkSize = Math.max(1, Math.floor(content.length / 150)); 

    const interval = setInterval(() => {
      currentLength += chunkSize;
      
      if (currentLength >= content.length) {
        setDisplayed(content);
        setIsTyping(false);
        clearInterval(interval);
      } else {
        // Appends a solid block character cursor while actively typing
        setDisplayed(content.slice(0, currentLength) + ' ▌');
      }
    }, speed);

    return () => clearInterval(interval);
  }, [content, animate, speed]);

  return (
    <div className={`${className} ${isTyping ? 'opacity-90' : 'opacity-100 transition-opacity duration-500'}`}>
      <AiMarkdown content={displayed} />
    </div>
  );
}

// ── CopyableListItem ──────────────────────────────────────────────────────────
function CopyableListItem({ content, className }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <li className={`${className} group/item relative pr-6`}>
      <AiMarkdown content={content} />
      <button 
        onClick={handleCopy}
        className="absolute top-0 right-0 opacity-0 group-hover/item:opacity-100 transition-opacity text-muted hover:text-white"
        title="Copy item"
      >
        {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
      </button>
    </li>
  );
}

// ── CopyableChatMessage ───────────────────────────────────────────────────────
function CopyableChatMessage({ msg }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-3 group/chat ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {msg.role === 'assistant' && (
        <div className="w-6 h-6 rounded bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0 mt-1">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
        </div>
      )}
      
      <div className="flex flex-col gap-1 max-w-[85%] w-full">
        <div className={`text-sm px-4 py-2.5 rounded-lg w-full ${
          msg.role === 'user' 
            ? 'bg-panel border border-border text-white' 
            : 'bg-transparent text-white/90'
        }`}>
          {msg.role === 'user' ? (
            msg.content
          ) : (
            // Apply the typewriter animation to the assistant's chat responses
            <TypewriterMarkdown content={msg.content} animate={true} />
          )}
        </div>

        <button 
          onClick={handleCopy} 
          className={`opacity-0 group-hover/chat:opacity-100 text-muted hover:text-white transition-opacity shrink-0 flex items-center gap-1 text-[10px] ${msg.role === 'user' ? 'self-end' : 'self-start'}`} 
          title="Copy Message"
        >
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {msg.role === 'user' && (
        <div className="w-6 h-6 rounded bg-panel border border-border flex items-center justify-center shrink-0 mt-1">
          <User className="w-3.5 h-3.5 text-muted" />
        </div>
      )}
    </div>
  );
}

export default function AiResponse({ data, title = "AI Intelligence", onNavigate, repoId, chatId }) {
  const { messages: chatHistory, isLoading: isAsking, error: chatError, sendMessage, retryLast, lastFailedPrompt } = useAI({ 
    repoId, 
    feature: chatId, 
    contextData: data 
  });
  const [input, setInput] = useState('');
  const chatEndRef = useRef(null);

  const handleAskQuestion = (e) => {
    e.preventDefault();
    if (!input.trim() || isAsking) return;
    sendMessage(input);
    setInput('');
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
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

  const references = (data.references || []).filter(Boolean);
  
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
          {/* Replaced AiMarkdown with TypewriterMarkdown */}
          <TypewriterMarkdown content={summary} className="text-white/90" animate={true} speed={15} />
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
        <section className="bg-panel/50 border border-border/50 rounded-lg p-4 transition-all duration-700 delay-300 animate-in fade-in slide-in-from-bottom-2">
          <h4 className="text-[10px] uppercase text-muted tracking-wider mb-3 font-bold flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5 text-success" />
            Deterministic Facts
          </h4>
          <ul className="list-disc pl-4 flex flex-col gap-1.5">
            {facts.map((fact, i) => (
              <CopyableListItem key={i} content={fact} className="text-xs text-white/80 leading-relaxed" />
            ))}
          </ul>
        </section>
      )}

      {/* ── AI Inferences ─────────────────────────────────────────────────── */}
      {inferences && inferences.length > 0 && (
        <section className="transition-all duration-700 delay-500 animate-in fade-in slide-in-from-bottom-2">
          <h4 className="text-[10px] uppercase text-muted tracking-wider mb-2 font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#cba6f7]" />
            AI Inferences
          </h4>
          <ul className="list-disc pl-4 flex flex-col gap-1.5">
            {inferences.map((inf, i) => (
              <CopyableListItem key={i} content={inf} className="text-xs text-white/80 leading-relaxed" />
            ))}
          </ul>
        </section>
      )}

      {/* ── Risks & Limitations ───────────────────────────────────────────── */}
      {risks && risks.length > 0 && (
        <section className="bg-danger/5 border border-danger/10 rounded-lg p-4 transition-all duration-700 delay-700 animate-in fade-in slide-in-from-bottom-2">
          <h4 className="text-[10px] uppercase text-danger/80 tracking-wider mb-2 font-bold flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            Risks & Limitations
          </h4>
          <ul className="list-disc pl-4 flex flex-col gap-1.5">
            {risks.map((risk, i) => (
              <CopyableListItem key={i} content={risk} className="text-xs text-danger/90 leading-relaxed" />
            ))}
          </ul>
        </section>
      )}

      {/* ── Recommendations ───────────────────────────────────────────────── */}
      {recommendations && recommendations.length > 0 && (
        <section className="bg-success/5 border border-success/10 rounded-lg p-4 transition-all duration-700 delay-1000 animate-in fade-in slide-in-from-bottom-2">
          <h4 className="text-[10px] uppercase text-success/80 tracking-wider mb-2 font-bold flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" />
            Recommendations
          </h4>
          <ul className="list-disc pl-4 flex flex-col gap-1.5">
            {recommendations.map((rec, i) => (
              <CopyableListItem key={i} content={rec} className="text-xs text-success/90 leading-relaxed" />
            ))}
          </ul>
        </section>
      )}

      {/* ── Source References ─────────────────────────────────────────────── */}
      {references && references.length > 0 && (
        <section className="border-t border-border pt-4">
          <h4 className="text-[10px] uppercase text-muted tracking-wider mb-3 font-bold flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Source References{console.log(references)}
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
                <CopyableChatMessage key={idx} msg={msg} />
              ))}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Error Message with Retry */}
          {chatError && (
            <div className="flex flex-col gap-2 bg-danger/10 border border-danger/20 rounded-lg p-3">
              <div className="flex items-start gap-2 text-danger text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="flex-1 leading-relaxed">{chatError}</span>
              </div>
              {lastFailedPrompt && (
                <div className="flex items-center justify-between border-t border-danger/10 pt-2 mt-1">
                  <span className="text-[10px] text-danger/60 italic truncate max-w-[70%]">"{lastFailedPrompt}"</span>
                  <button
                    onClick={retryLast}
                    disabled={isAsking}
                    className="flex items-center gap-1.5 text-[10px] font-semibold text-danger hover:text-white bg-danger/20 hover:bg-danger/40 border border-danger/30 rounded px-2.5 py-1 transition-colors disabled:opacity-50"
                  >
                    {isAsking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    {isAsking ? 'Retrying...' : 'Retry'}
                  </button>
                </div>
              )}
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