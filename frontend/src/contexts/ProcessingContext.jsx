// ProcessingContext.js
import React, { createContext, useState, useContext } from 'react';

// Create the context
const ProcessingContext = createContext();

// Create the provider component
export const ProcessingProvider = ({ children }) => {
  const [processing, setProcessing] = useState(false);

  return (
    <ProcessingContext.Provider value={{ processing, setProcessing }}>
      {children}
    </ProcessingContext.Provider>
  );
};

// Create a custom hook to use the ProcessingContext
export const useProcessing = () => {
  return useContext(ProcessingContext);
};