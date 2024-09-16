// src/components/Avatar.js
import React from "react";
import { Box } from "@mui/material";
import { AVATAR_BOT_WEBSITE_LINK } from "../utilities/constants";
const Avatar = () => {
  return (
    <Box>
      {/* Embed the avatar application using an iframe */}
      <iframe
        src = {AVATAR_BOT_WEBSITE_LINK}
        width="100%"
        height="600px"
        style={{ border: "none" }}
        title="Interactive Avatar"
        allow="microphone"
      />
    </Box>
  );
};

export default Avatar;
