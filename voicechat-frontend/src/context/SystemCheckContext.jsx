import React, { createContext, useContext, useState } from 'react';

const SystemCheckContext = createContext();

export function SystemCheckProvider({ children }) {
  // Store an array of language codes that have passed the system check
  const [validatedLanguages, setValidatedLanguages] = useState([]);

  const addValidatedLanguage = (lang) => {
    if (!lang) return;
    setValidatedLanguages((prev) => {
      if (prev.includes(lang)) return prev;
      return [...prev, lang];
    });
  };

  const hasValidatedLanguage = (lang) => {
    if (!lang) return false;
    return validatedLanguages.includes(lang);
  };

  return (
    <SystemCheckContext.Provider value={{ validatedLanguages, addValidatedLanguage, hasValidatedLanguage }}>
      {children}
    </SystemCheckContext.Provider>
  );
}

export function useSystemCheck() {
  const context = useContext(SystemCheckContext);
  if (context === undefined) {
    throw new Error('useSystemCheck must be used within a SystemCheckProvider');
  }
  return context;
}
