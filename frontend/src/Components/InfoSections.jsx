// src/components/InfoSections.js
import React from "react";
import { Typography, Grid } from "@mui/material";
import { useLanguage } from "../contexts/LanguageContext"; // Adjust the import path
import { ABOUT_US_HEADER_BACKGROUND, ABOUT_US_TEXT, FAQ_HEADER_BACKGROUND, FAQ_TEXT, TEXT } from "../utilities/constants"; // Adjust the import path

function InfoSections() {
  const { language } = useLanguage();

  return (
    <>
      <Grid item>
        <Typography variant="h6" sx={{ fontWeight: "bold" }} color={ABOUT_US_HEADER_BACKGROUND}>
          {TEXT[language].ABOUT_US_TITLE}
        </Typography>
      </Grid>
      <Grid item>
        <Typography variant="subtitle1" color={ABOUT_US_TEXT}>
          {TEXT[language].ABOUT_US}
        </Typography>
      </Grid>
      <Grid item>
        <Typography variant="h6" sx={{ fontWeight: "bold" }} color={FAQ_HEADER_BACKGROUND}>
          {TEXT[language].FAQ_TITLE}
        </Typography>
        <ul>
          {TEXT[language].FAQS.map((question, index) => (
            <li key={index}>
              <Typography variant="subtitle1" color={FAQ_TEXT}>
                {question}
              </Typography>
            </li>
          ))}
        </ul>
      </Grid>
    </>
  );
}

export default InfoSections;
