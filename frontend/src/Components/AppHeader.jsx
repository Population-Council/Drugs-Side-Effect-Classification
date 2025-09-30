// src/Components/AppHeader.jsx
import React from "react";
import { AppBar, Grid, Box, Typography, useTheme } from "@mui/material";
import Logo from "../Assets/tobi.png";
import Switch from "./Switch.jsx";
import headerBg from "../Assets/HeaderBackend.png"; // <- import your header background image
import { ALLOW_MULTLINGUAL_TOGGLE } from "../utilities/constants";

function AppHeader({ showSwitch }) {
  const theme = useTheme();

  return (
<AppBar
  position="static"
  sx={{
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
</AppBar>
  );
}

export default AppHeader;