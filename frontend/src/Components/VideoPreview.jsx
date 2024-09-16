// src/components/VideoPreview.js
import React, { useRef } from "react";
import { Typography, Grid } from "@mui/material";
import ReactPlayer from 'react-player';
import { useLanguage } from "../contexts/LanguageContext"; // Adjust the import path
import { ABOUT_US_TEXT, TEXT } from "../utilities/constants"; // Adjust the import path

function VideoPreview({ uploadedFile, startTime = 0 }) {
  const { language } = useLanguage();
  const videoUrl = URL.createObjectURL(uploadedFile);
  const playerRef = useRef(null);

  const handleReady = () => {
    if (playerRef.current) {
      playerRef.current.seekTo(startTime, 'seconds');
    }
  };

  return (
    <Grid item>
      <Typography variant="h6" color={ABOUT_US_TEXT} sx={{ fontWeight: "bold" }}>
        {TEXT[language].FILE_PREVIEW}
      </Typography>
      <Typography sx={{ marginBottom: 2 }} variant="subtitle1" color={ABOUT_US_TEXT}>
        {uploadedFile.name}
      </Typography>
      <ReactPlayer
        ref={playerRef}
        url={videoUrl}
        controls
        width="100%"
        height="100%"
        onReady={handleReady}
      />
    </Grid>
  );
}

export default VideoPreview;
