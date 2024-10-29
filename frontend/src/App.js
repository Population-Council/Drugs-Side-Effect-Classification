// App.js
import React, { useState } from 'react';
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

function MainApp() {
  const [showLeftNav, setLeftNav] = useState(true);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileType, setFileType] = useState(null);

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
    <Grid container direction='column' justifyContent='center' alignItems='stretch' className='appHeight100 appHideScroll'>
      <Grid item>
        <AppHeader showSwitch={true} />
      </Grid>
      <Grid item container direction='row' justifyContent='flex-start' alignItems='stretch' className='appFixedHeight100'>
        <Grid item xs={showLeftNav ? leftNavSize : 0.5} sx={{ backgroundColor: (theme) => theme.palette.background.chatLeftPanel, height: '100%' }}>
          <LeftNav showLeftNav={showLeftNav} setLeftNav={setLeftNav} uploadedFile={uploadedFile} fileType={fileType} />
        </Grid>
        <Grid
          container
          item
          xs={showLeftNav ? chatBodySize : 11.5}
          direction='column'
          justifyContent='flex-start'
          alignItems='stretch'
          className='appHeight100'
          sx={{
            padding: { xs: '1.5rem', md: '1.5rem 5%', lg: '1.5rem 10%', xl: '1.5rem 10%' },
            backgroundColor: (theme) => theme.palette.background.chatBody,
          }}
        >
          <Grid item>
            <ChatHeader onFileUpload={handleFileUploadComplete} />
          </Grid>
          <Grid
            container
            item
            direction='row'
            justifyContent='center'
            alignItems='flex-end'
            sx={{
              height: { xs: 'calc(100% - 2.625rem)', md: 'calc(100% - 2.625rem)', lg: 'calc(100% - 2.625rem)', xl: 'calc(100% - 2.625rem)' },
            }}
          >
            <ChatBody onFileUpload={handleFileUploadComplete} />
          </Grid>
        </Grid>
      </Grid>
    </Grid>
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
          <ThemeProvider theme={theme}>
            {!languageSet && ALLOW_LANDING_PAGE ? <LandingPage /> : <MainApp />}
          </ThemeProvider>
        </MessageProvider>
        </QuestionProvider>
      </TranscriptProvider>
    </LanguageProvider>

  );
}

export default App;
