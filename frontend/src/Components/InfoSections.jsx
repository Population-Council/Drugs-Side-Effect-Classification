// src/components/InfoSections.js
import React from "react";
import { Typography, Grid } from "@mui/material";
import { useLanguage } from "../contexts/LanguageContext"; // Adjust the import path
import { ABOUT_US_HEADER_BACKGROUND, ABOUT_US_TEXT, TEXT, DISPLAY_SEARCH_HISTORY } from "../utilities/constants"; // Adjust the import path
import SearchHistory from "./SearchHistory.jsx"; // Import the new component

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
      {DISPLAY_SEARCH_HISTORY && (
        <Grid item>
          {/* Add SearchHistory component here */}
          <SearchHistory />
        </Grid>
      )}
    </>
  );
}

export default InfoSections;