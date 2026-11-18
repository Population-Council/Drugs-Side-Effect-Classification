// src/Components/AppHeader.jsx
import React, { useState } from "react";
import { AppBar, Grid, Box, Typography, Button, IconButton, Tooltip, useTheme, useMediaQuery } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import Logo from "../Assets/tobi.png";
import Switch from "./Switch.jsx";
import UploadContentDialog from "./UploadContentDialog.jsx";
import headerBg from "../Assets/HeaderBackend.png"; // <- import your header background image
import { ALLOW_MULTLINGUAL_TOGGLE, ALLOW_UPLOAD_CONTENT, UPLOAD_BUTTON_COLOR } from "../utilities/constants";

function AppHeader({ showSwitch, showUpload = true }) {
  const theme = useTheme();
  // same 768px breakpoint the rest of the app uses for "mobile"
  const isSmall = useMediaQuery("(max-width:768px)");
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
<AppBar
  position="static"
  sx={{
    position: 'relative',             // anchor for the Upload Content button (no visual change)
    height: '100%',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    backgroundColor: 'transparent',   // bg lives on wrapper now
    backgroundImage: 'none',
  }}
>
  <Grid
    container
    direction="row"
    justifyContent="space-between"
    alignItems="center"
    sx={{
      height: '100%',
      padding: { xs: '0 1rem', md: '0 3rem' },
    }}
  >
    <Grid item sx={{ width: { xs: 32, md: 64 } }} />

    <Grid item xs sx={{ height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          // vertical breathing room tied to header height
          pt: 'clamp(6px, calc(var(--header-h) * 0.10), 24px)',
          pb: 'clamp(8px,  calc(var(--header-h) * 0.10), 20px)',
          gap: 'clamp(4px, calc(var(--header-h) * 0.03), 10px)',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <Box
          component="img"
          src={Logo}
          alt="App main Logo"
          sx={{
            // avatar scales with header, never too big or tiny
          height: 'min(calc(var(--header-h) * 0.65), 110px)',
            width: 'auto',
            objectFit: 'contain',
            // optional: make it round if you like the circle look
            // borderRadius: '50%',
          }}
        />

        <Typography
          variant="h6"
          sx={{
            m: 0,
            fontWeight: 500,
            color: '#FFFFFF',
            // font size driven by header height (not viewport)
            fontSize: 'clamp(18px, calc(var(--header-h) * 0.20), 32px)',
            lineHeight: 1.15,
          }}
        >
          Tobi
        </Typography>
      </Box>
    </Grid>

    <Grid item sx={{ width: { xs: 32, md: 64 } }}>
      <Grid
        container
        alignItems="center"
        justifyContent="flex-end"
        sx={{ display: ALLOW_MULTLINGUAL_TOGGLE && showSwitch ? 'flex' : 'none' }}
      >
        <Switch />
      </Grid>
    </Grid>
  </Grid>

  {/* Upload Content — overlaid so it never shifts Tobi's centered avatar */}
  {ALLOW_UPLOAD_CONTENT && showUpload && (
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        right: isSmall ? '12px' : 'clamp(16px, 8%, 160px)',
        zIndex: 1,
      }}
    >
      {isSmall ? (
        <Tooltip title="Upload Content">
          <IconButton
            aria-label="Upload Content"
            onClick={() => setUploadOpen(true)}
            sx={{
              width: 40,
              height: 40,
              bgcolor: UPLOAD_BUTTON_COLOR,
              color: '#FFFFFF',
              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
              '&:hover': { bgcolor: UPLOAD_BUTTON_COLOR, filter: 'brightness(1.15)' },
            }}
          >
            <CloudUploadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          variant="contained"
          disableElevation
          startIcon={<CloudUploadIcon />}
          onClick={() => setUploadOpen(true)}
          sx={{
            bgcolor: UPLOAD_BUTTON_COLOR,
            color: '#FFFFFF',
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '15px',
            borderRadius: '6px',
            px: 2,
            py: 0.75,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            '&:hover': { bgcolor: UPLOAD_BUTTON_COLOR, filter: 'brightness(1.15)', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' },
          }}
        >
          Upload Content
        </Button>
      )}
    </Box>
  )}

  <UploadContentDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
</AppBar>
  );
}

export default AppHeader;