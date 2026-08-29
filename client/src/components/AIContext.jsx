import React, { createContext, useContext, useEffect, useState } from 'react';
import { getAiHealth } from '../api';

const AIContext = createContext();

export function AIProvider({ children }) {
  const [aiState, setAiState] = useState('loading'); // 'loading', 'enhanced', 'offline', 'unavailable', 'error'

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const { configured } = await getAiHealth();
        setAiState(configured ? 'enhanced' : 'offline');
      } catch (err) {
        setAiState('error');
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
