/**
 * AIContext.jsx
 *
 * It initiates the AI tracking hooks, then extracts structured conversational payloads, 
 * and then it applies local active-file bindings before sending queries to Watsonx.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { getAiHealth, getAiStatus, repositoryApi } from '../api';
import { chatStore } from '../../services/storage/chat.store';
import { useAuth } from './AuthContext';

const AIContext = createContext();

export function AIProvider({ children }) {
  const { user } = useAuth();
  const [aiState, setAiState] = useState({
    status: 'loading', // 'loading', 'ready', 'offline', 'unavailable'
    authState: 'unauthenticated',
    quotaStatus: 'available',
    usage: null,
  });

  const checkStatus = useCallback(async () => {
    try {
      if (!user) {
        // If not logged in, just check health (public)
        const { configured } = await getAiHealth();
        setAiState(prev => ({
          ...prev,
          status: configured ? 'ready' : 'offline',
          authState: 'unauthenticated',
        }));
        return;
      }

      // If logged in, check detailed status
      const data = await getAiStatus();
      setAiState({
        status: data.providerConfigured ? 'ready' : 'offline',
        authState: data.authState,
        quotaStatus: data.quotaStatus,
        usage: data.usage,
      });
    } catch (err) {
      console.warn('AI status check failed, falling back:', err.message);
      setAiState(prev => ({ ...prev, status: 'offline' }));
    }
  }, [user]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const reportAiError = useCallback(() => {
    setAiState(prev => ({ ...prev, status: 'unavailable' }));
  }, []);

  const retryConnection = useCallback(async () => {
    setAiState(prev => ({ ...prev, status: 'connecting' }));
    await checkStatus();
  }, [checkStatus]);

  let effectiveState = aiState.status;
  if (aiState.status !== 'loading' && aiState.status !== 'connecting') {
    if (aiState.authState === 'unauthenticated') {
      effectiveState = 'unauthenticated';
    } else if (aiState.status === 'offline') {
      effectiveState = 'offline';
    } else if (aiState.status === 'unavailable') {
      effectiveState = 'unavailable';
    } else if (aiState.quotaStatus === 'exhausted') {
      effectiveState = 'quota_exhausted';
    } else {
      effectiveState = 'enhanced';
    }
  }

  return (
    <AIContext.Provider value={{ aiState, effectiveState, reportAiError, refreshStatus: checkStatus, retryConnection }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAIState() {
  return useContext(AIContext);
}

export function useAI({ repoId, feature, contextData } = {}) {
  const { effectiveState, aiState, reportAiError, refreshStatus } = useAIState();
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState(null);
  const abortControllerRef = useRef(null);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!repoId || !feature) return;

    const loadHistory = async () => {
      try {
        const history = await chatStore.getChat(repoId, feature);
        if (mounted) {
          setMessages(history);
        }
      } catch (err) {
        console.error('Failed to load chat history', err);
      }
    };

    loadHistory();
    return () => { mounted = false; };
  }, [repoId, feature]);

  /**
   * It evaluates the user submission (text + optional attachments), then extracts Monaco
   * context ranges and serialises any file / image / snippet attachments into the prompt,
   * and then it applies the combined payload to the local API processor.
   *
   * @param {string}   prompt       - User-visible message text
   * @param {object[]} attachments  - Optional array of { type, name, content, dataUrl, path }
   */
  const sendMessage = useCallback(async (prompt, attachments = []) => {
    if ((!prompt?.trim() && attachments.length === 0) || !repoId || !feature) return;

    // ── Build the display message (what appears in the chat bubble) ────────
    const displayParts = [prompt?.trim()].filter(Boolean);
    if (attachments.length > 0) {
      const labels = attachments.map(a => {
        if (a.type === 'image') return `[Image] ${a.name}`;
        if (a.type === 'snippet') return `[Snippet] ${a.name}`;
        return `[File] ${a.name}`;
      });
      displayParts.push(`\n\n_Attachments: ${labels.join(', ')}_`);
    }
    const displayText = displayParts.join('');

    // ── Build the actual AI prompt (text + serialised attachments) ─────────
    const promptParts = [prompt?.trim()].filter(Boolean);
    for (const a of attachments) {
      if (a.type === 'image' && a.dataUrl) {
        promptParts.push(
          `\n\n--- Attached Image: ${a.name} ---\n[Image data: ${a.dataUrl.slice(0, 80)}…]\n---`
        );
      } else if (a.content) {
        const fence = a.type === 'snippet' ? 'text' : (a.name?.split('.').pop() || 'text');
        promptParts.push(
          `\n\n--- Attached ${a.type === 'snippet' ? 'Text Snippet' : `File: ${a.path || a.name}`} ---\n\`\`\`${fence}\n${a.content}\n\`\`\`\n---`
        );
      }
    }
    const fullPrompt = promptParts.join('');

    const userMessage = { role: 'user', content: displayText };
    const optimisticMessages = [...messages, userMessage];

    setMessages(optimisticMessages);
    setIsLoading(true);
    setError(null);
    setLastFailedPrompt(null);

    try {
      const activeContext = contextData?.filePath ? {
        filePath: contextData.filePath,
        startLine: contextData.startLine,
        endLine: contextData.endLine
      } : null;

      abortControllerRef.current = new AbortController();
      const res = await repositoryApi.askQuestion(
        repoId, 
        fullPrompt, 
        activeContext, 
        optimisticMessages, 
        { signal: abortControllerRef.current.signal }
      );

      const finalMessages = [...optimisticMessages, { role: 'assistant', content: res.data.answer || res.data.response }];
      setMessages(finalMessages);

      await chatStore.saveChat(repoId, feature, finalMessages);
    } catch (err) {
      if (err.name === 'CanceledError') {
        // User aborted the request — just silently revert the optimistic message
        setMessages(messages);
        return;
      }
      console.error(err);
      setMessages(messages);
      setLastFailedPrompt(fullPrompt);
      setError(err.response?.data?.error || err.message || 'Failed to get AI response.');

      if (err.response?.status === 429) {
        if (refreshStatus) refreshStatus();
      } else {
        reportAiError();
      }
      throw err;
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [repoId, feature, messages, contextData, reportAiError, refreshStatus]);

  const retryLast = useCallback(() => {
    if (lastFailedPrompt) {
      sendMessage(lastFailedPrompt);
    }
  }, [lastFailedPrompt, sendMessage]);

  const clearHistory = useCallback(async () => {
    if (!repoId || !feature) return;
    setMessages([]);
    setError(null);
    setLastFailedPrompt(null);
    await chatStore.clearChat(repoId, feature);
  }, [repoId, feature]);

  return {
    messages,
    isLoading,
    error,
    lastFailedPrompt,
    sendMessage,
    retryLast,
    clearHistory,
    stopGeneration,
    effectiveState
  };
}