// src/components/PdfPreview.js
import React from "react";
import { Typography, Grid } from "@mui/material";
import { useLanguage } from "../contexts/LanguageContext"; // Adjust the import path
import { ABOUT_US_TEXT, TEXT } from "../utilities/constants"; // Adjust the import path

function PdfPreview({ uploadedFile }) {
  const { language } = useLanguage();

  return (
    <Grid item>
      <Typography variant="h6" color={ABOUT_US_TEXT} sx={{ fontWeight: "bold" }}>
        {TEXT[language].FILE_PREVIEW}
      </Typography>
      <Typography sx={{ marginBottom: 2 }} variant="subtitle1" color={ABOUT_US_TEXT}>
        {uploadedFile.name}
      </Typography>
      <embed src={URL.createObjectURL(uploadedFile)} width="100%" height="520px" type="application/pdf" />
    </Grid>
  );
}

export default PdfPreview;
