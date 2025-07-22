import React from "react";
import { AppBar, Grid, Box, Typography } from "@mui/material";
import Logo from "../Assets/tobi.png";
import Switch from "./Switch.jsx";
import { ALLOW_MULTLINGUAL_TOGGLE } from "../utilities/constants";

function AppHeader({ showSwitch }) {
  return (
    <AppBar
      position="static"
      sx={{
        backgroundColor: (theme) => theme.palette.background.header,
        // height: "5rem",
        boxShadow: "none",
        borderBottom: (theme) => `1.5px solid ${theme.palette.primary[50]}`,
      }}
    >
      <Grid
        container
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ padding: "0 3rem", height: "100%" }}
        className="appHeight100"
      >
        {/* Left spacer (keeps overall layout width the same) */}
        <Grid item sx={{ width: 64 }} />

        {/* Center block */}
        <Grid item xs>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            <img src={Logo} alt="App main Logo" height={64} />
            <Typography
              variant="h6"
              sx={{ mt: 0.5, fontWeight: 500, color: (t) => t.palette.text.primary }}
            >
              Hi, I’m Tobi
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: (t) => t.palette.text.secondary }}
            >
              I’m ready to answer any questions about SSLN &amp; I2I.
            </Typography>
          </Box>
        </Grid>

        {/* Right controls */}
        <Grid item>
          <Grid container alignItems="center" justifyContent="flex-end" spacing={2}>
            <Grid
              item
              sx={{ display: ALLOW_MULTLINGUAL_TOGGLE && showSwitch ? "flex" : "none" }}
            >
              <Switch />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </AppBar>
  );
}

export default AppHeader;