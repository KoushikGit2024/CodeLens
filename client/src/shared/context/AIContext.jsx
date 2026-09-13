/**
 * AIContext.jsx
 *
 * It initiates the AI tracking hooks, then extracts structured conversational payloads, 
 * and then it applies local active-file bindings before sending queries to Watsonx.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
   * It evaluates the user submission, then extracts Monaco context ranges, 
   * and then it applies the query and history to the local API processor.
   */
  const sendMessage = useCallback(async (prompt) => {
    if (!prompt.trim() || !repoId || !feature) return;
    
    const userMessage = { role: 'user', content: prompt.trim() };
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
      
      const res = await repositoryApi.askQuestion(repoId, prompt.trim(), activeContext, optimisticMessages);
      
      const finalMessages = [...optimisticMessages, { role: 'assistant', content: res.data.answer || res.data.response }];
      setMessages(finalMessages);
      
      await chatStore.saveChat(repoId, feature, finalMessages);
    } catch (err) {
      console.error(err);
      setMessages(messages);
      setLastFailedPrompt(prompt.trim());
      setError(err.response?.data?.error || err.message || 'Failed to get AI response.');
      
      if (err.response?.status === 429) {
        setEffectiveState('quota_exhausted');
        if (refreshStatus) refreshStatus();
      } else {
        reportAiError();
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [repoId, feature, messages, contextData, reportAiError]);

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
    clearHistory
  };
}