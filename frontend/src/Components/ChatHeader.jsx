import React, { useState, useEffect } from "react";
import Typography from "@mui/material/Typography";
import { useLanguage } from "../contexts/LanguageContext";
import { TEXT } from "../utilities/constants";
import { Container } from "@mui/material";

function ChatHeader({ selectedLanguage }) {
  const { language: contextLanguage } = useLanguage();
  const language = selectedLanguage || contextLanguage || 'EN';
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth <= 768);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  if (isMobile) {
    return null;
  }

  return (
    <Container
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        py: 2
      }}
    >
      <Typography
        variant="h4"
        className="chatHeaderText"
        sx={{
          color: '#FFFFFF',          // White font
          fontWeight: 600,           // Semi-bold
          textAlign: 'center',
          // No gradient background per request
        }}
      >
        {TEXT[language]?.CHAT_HEADER_TITLE || "Tobi"}
      </Typography>
    </Container>
  );
}

export default ChatHeader;