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
    py: 'clamp(6px, 1.2vh, 14px)',   // <— vertical breathing room
    px: { xs: 2, sm: 3 },
  }}
>
      <Typography
        variant="h4"
        className="chatHeaderText"
         sx={{
    color: '#FFFFFF',
    fontWeight: 400,                // stays not-bold
    textAlign: 'center',
    fontSize: 'clamp(20px, 3.2vw, 36px)',  // <— tweak here
    lineHeight: 1.2,
  }}
      >
        {TEXT[language]?.CHAT_HEADER_TITLE || "Tobi"}
      </Typography>
    </Container>
  );
}

export default ChatHeader;