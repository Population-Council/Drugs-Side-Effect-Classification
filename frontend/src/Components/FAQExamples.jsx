import React, { useState, useEffect } from "react";
import { TEXT } from "../utilities/constants";
import { useLanguage } from "../contexts/LanguageContext"; // Adjust the import path
import { Box, Button, Grid } from "@mui/material";

const shuffleArray = (array) => {
  return array.sort(() => Math.random() - 0.5);
};

const FAQExamples = ({ onPromptClick }) => {
  const { language } = useLanguage();
  const [faqs, setFaqs] = useState([]);

  useEffect(() => {
    // Shuffle FAQs on initial render
    const shuffledFAQs = shuffleArray([...TEXT[language].FAQS]).slice(0, 4);
    setFaqs(shuffledFAQs);
  }, [language]);

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <Grid container spacing={1}>
          {faqs.map((prompt, index) => (
            <Grid item key={index} xs={3}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => onPromptClick(prompt)}
                sx={{
                  width: "100%",
                  textAlign: "left", 
                  textTransform: "none", // Prevent text from being uppercase
                }}
              >
                {prompt}
              </Button>
            </Grid>
          ))}
        </Grid>
      </Box>
  );
};

export default FAQExamples;
