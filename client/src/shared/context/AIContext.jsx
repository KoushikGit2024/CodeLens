/**
 * AIContext.jsx
 *
 * It initiates the AI tracking hooks, then extracts structured conversational payloads, 
 * and then it applies local active-file bindings before sending queries to Watsonx.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getAiHealth, repositoryApi } from '../api';
import { chatStore } from '../../services/storage/chat.store';

const AIContext = createContext();

export function AIProvider({ children }) {
  const [aiState, setAiState] = useState('loading'); 

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const { configured } = await getAiHealth();
        setAiState(configured ? 'enhanced' : 'offline');
      } catch (err) {
        console.warn('AI health check failed, falling back to offline mode:', err.message);
        setAiState('offline');
      }
    };
    checkHealth();
  }, []);

  const reportAiError = () => {
    if (aiState === 'enhanced') setAiState('unavailable');
  };

  return (
    <AIContext.Provider value={{ aiState, reportAiError }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAIState() {
  return useContext(AIContext);
}

export function useAI({ repoId, feature, contextData }) {
  const { aiState, reportAiError } = useAIState();
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
      reportAiError();
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