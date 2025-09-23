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
        height: "100%",
        boxShadow: "none",
        borderBottom: `1.5px solid ${theme.palette.primary[50]}`,
        display: "flex",
        justifyContent: "center",
        // Use the image as the header background
        backgroundImage: `url(${headerBg})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundColor: "transparent",
      }}
    >
      <Grid
        container
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{
          height: "100%",
          backgroundColor: "transparent", // ensure no gray overlay from theme
          padding: { xs: "0 1rem", md: "0 3rem" },
        }}
      >
        {/* Left spacer */}
        <Grid item sx={{ width: { xs: 32, md: 64 } }} />

        {/* Center block */}
        <Grid item xs sx={{ height: "100%" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              textAlign: "center",
            }}
          >
            <Box
              component="img"
              src={Logo}
              alt="App main Logo"
              sx={{
                height: { xs: "55%", md: "65%" },
                maxHeight: { xs: "80px", md: "140px" },
                width: "auto",
                objectFit: "contain",
              }}
            />
            <Typography
              variant="h6"
              sx={{
                mt: 0.5,
                fontWeight: 600,              // slightly bold
                color: "#FFFFFF",              // white font
                fontSize: { xs: "1.5rem", md: "2.20rem" },
              }}
            >
              Tobi
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "rgba(255,255,255,0.85)",
                fontSize: { xs: "0.8rem", md: "1.1rem" },
              }}
            />
          </Box>
        </Grid>

        {/* Right controls */}
        <Grid item sx={{ width: { xs: 32, md: 64 } }}>
          <Grid
            container
            alignItems="center"
            justifyContent="flex-end"
            sx={{
              display: ALLOW_MULTLINGUAL_TOGGLE && showSwitch ? "flex" : "none",
            }}
          >
            <Switch />
          </Grid>
        </Grid>
      </Grid>
    </AppBar>
  );
}

export default AppHeader;