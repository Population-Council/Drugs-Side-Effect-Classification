import React, { useState, useEffect } from 'react';
import theme from './theme'; // Import your theme
import { ThemeProvider } from '@mui/material/styles'; // Import ThemeProvider
import Grid from '@mui/material/Grid';
import AppHeader from './Components/AppHeader';
import LeftNav from './Components/LeftNav';
import ChatHeader from './Components/ChatHeader';
import ChatBody from './Components/ChatBody';
import { LanguageProvider } from './contexts/LanguageContext'; // Adjust the import path
import LandingPage from './Components/LandingPage';
import { useCookies } from 'react-cookie';
import { ALLOW_LANDING_PAGE } from './utilities/constants';
import { TranscriptProvider } from './contexts/TranscriptContext';
import { MessageProvider } from './contexts/MessageContext';
import { ALLOW_PDF_PREVIEW, ALLOW_VIDEO_PREVIEW } from './utilities/constants';
import { QuestionProvider } from './contexts/QuestionContext';
import { ProcessingProvider } from './contexts/ProcessingContext';
import Box from '@mui/material/Box';

function MainApp() {
  const [showLeftNav, setLeftNav] = useState(true);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  // Check if the screen is mobile size
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    // Set initial value
    checkIsMobile();
    
    // Add event listener
    window.addEventListener('resize', checkIsMobile);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  // Auto-hide left nav on mobile
  useEffect(() => {
    if (isMobile) {
      setLeftNav(false);
    }
  }, [isMobile]);

  const handleFileUploadComplete = (file, fileStatus) => {
    setUploadedFile(file);
    const fileType = file.type === 'application/pdf' || file.type === 'video/mp4' ? file.type : null;
    setFileType(fileType);
    console.log('In app.js');
    console.log(`File uploaded: ${file.name}, Status: ${fileStatus}`);
  };

  const isFilePreviewAllowed = (fileType === 'application/pdf' && ALLOW_PDF_PREVIEW) || (fileType === 'video/mp4' && ALLOW_VIDEO_PREVIEW);
  const leftNavSize = isFilePreviewAllowed ? 5 : 3;
  const chatBodySize = isFilePreviewAllowed ? 7 : 9;

  return (
    <Box 
      sx={{ 
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        margin: 0,
        padding: 0,
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <Box sx={{ flexShrink: 0 }}>
        <AppHeader showSwitch={true} />
      </Box>
      
      {/* Main Content Area */}
      <Box 
        sx={{ 
          flexGrow: 1,
          display: 'flex',
          overflow: 'hidden',
          backgroundColor: isMobile ? 'inherit' : 'inherit',
          minHeight: 0 // This is critical for flexbox to work properly
        }}
      >
        {/* Left Navigation */}
        {(showLeftNav || !isMobile) && (
          <Box 
            sx={{ 
              width: showLeftNav ? (isMobile ? '100%' : `${(leftNavSize/12)*100}%`) : '40px',
              position: isMobile ? 'absolute' : 'relative',
              zIndex: isMobile ? 1100 : 1,
              display: isMobile && !showLeftNav ? 'none' : 'block',
              height: '100%',
              overflow: 'hidden'
            }}
          >
            <LeftNav 
              showLeftNav={showLeftNav} 
              setLeftNav={setLeftNav} 
              uploadedFile={uploadedFile} 
              fileType={fileType} 
            />
          </Box>
        )}
        
        {/* Chat Area */}
        <Box 
          sx={{
            flexGrow: 1,
            height: '100%', 
            // padding: { xs: '1.5rem', md: '1.5rem 5%', lg: '1.5rem 10%', xl: '1.5rem 10%' },
            paddingBottom: 0, // Remove bottom padding
            backgroundColor: (theme) => theme.palette.background.chatBody,
            visibility: isMobile && showLeftNav ? 'hidden' : 'visible',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {!isMobile && (
            <Box sx={{ flexShrink: 0 }}>
              <ChatHeader onFileUpload={handleFileUploadComplete} />
            </Box>
          )}
          
          <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
            <ChatBody 
              onFileUpload={handleFileUploadComplete} 
              showLeftNav={showLeftNav}
              setLeftNav={setLeftNav}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function App() {
  const [cookies] = useCookies(['language']);
  const languageSet = Boolean(cookies.language);

  return (
    <LanguageProvider>
      <TranscriptProvider>
        <QuestionProvider>
          <MessageProvider>
            <ProcessingProvider>
              <ThemeProvider theme={theme}>
                {!languageSet && ALLOW_LANDING_PAGE ? <LandingPage /> : <MainApp />}
              </ThemeProvider>
            </ProcessingProvider>
          </MessageProvider>
        </QuestionProvider>
      </TranscriptProvider>
    </LanguageProvider>
  );
}

export default App;
