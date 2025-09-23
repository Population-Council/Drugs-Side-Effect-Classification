// src/theme.js
import { createTheme } from "@mui/material/styles";
import {
  PRIMARY_MAIN,
  SECONDARY_MAIN,
  CHAT_BODY_BACKGROUND,
  CHAT_LEFT_PANEL_BACKGROUND,
  HEADER_BACKGROUND,
  USERMESSAGE_BACKGROUND,
  BOTMESSAGE_BACKGROUND,
  primary_50
} from "./utilities/constants";

const theme = createTheme({
  typography: {
    // (2) Switch global font to Arial
    fontFamily: 'Arial, Helvetica, sans-serif',
  },
  palette: {
    primary: {
      main: PRIMARY_MAIN,
      50: primary_50,
    },
    // (3) Make default/main text color red for testing
    text: {
      primary: 'red',
      secondary: 'rgba(0,0,0,0.6)',
    },
    background: {
      default: CHAT_BODY_BACKGROUND,
      chatBody: CHAT_BODY_BACKGROUND,
      chatLeftPanel: CHAT_LEFT_PANEL_BACKGROUND,
      header: HEADER_BACKGROUND,
      botMessage: BOTMESSAGE_BACKGROUND,
      userMessage: USERMESSAGE_BACKGROUND,
    },
    secondary: {
      main: SECONDARY_MAIN,
    },
  },
  // also enforce red text at the root level for generic elements
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          color: 'red',
          fontFamily: 'Arial, Helvetica, sans-serif',
        },
      },
    },
  },
});

export default theme;