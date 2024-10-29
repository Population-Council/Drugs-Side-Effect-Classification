import React, { createContext, useContext, useState } from 'react';

const QuestionContext = createContext();

export const QuestionProvider = ({ children }) => {
  const [questionAsked, setQuestionAsked] = useState(false);

  return (
    <QuestionContext.Provider value={{ questionAsked, setQuestionAsked }}>
      {children}
    </QuestionContext.Provider>
  );
};

export const useQuestion = () => {
  return useContext(QuestionContext);
};
