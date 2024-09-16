import React, { useState, useEffect } from "react";
import { Grid, Avatar, Typography, CircularProgress } from "@mui/material";
import BotAvatar from "../Assets/BotAvatar.svg";
import PdfIcon from "../Assets/pdf_logo.svg";
import { BOTMESSAGE_BACKGROUND } from "../utilities/constants";
import { useMessage } from "../contexts/MessageContext";

function BotFileCheckReply({ messageId }) {
  const { messageList } = useMessage();
  const messageData = messageList[messageId];
  const { fileName, fileStatus, error } = messageData;

  const [animationState, setAnimationState] = useState("checking");

  useEffect(() => {
    let timeout;
    if (animationState === "checking") {
      if (fileStatus === "File page limit check succeeded.") {
        timeout = setTimeout(() => setAnimationState("success"), 1000);
      } else if (fileStatus === "File size limit exceeded." || fileStatus === "Network Error. Please try again later." || error) {
        timeout = setTimeout(() => setAnimationState("fail"), 1000);
      }
    }
    return () => clearTimeout(timeout);
  }, [animationState, fileStatus, error]);

  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="center" spacing={2}>
      <Grid item>
        <Avatar alt="Bot Avatar" src={BotAvatar} />
      </Grid>
      <Grid item style={{ background: BOTMESSAGE_BACKGROUND, borderRadius: 20, padding: 10 }}>
        {fileStatus ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src={PdfIcon} alt="PDF Icon" style={{ width: 40, height: 40, borderRadius: "5px" }} />
              <Typography variant="body2">{fileName}</Typography>
            </div>
            <div className={`file-status-box ${animationState}`} style={{ marginTop: 8 }}>
              <Typography variant="body2" color={error ? "error" : "textPrimary"}>
                {animationState === "checking" ? "Checking file size..." : fileStatus}
              </Typography>
              {animationState === "checking" && <CircularProgress size={24} className="loading" />}
            </div>
          </div>
        ) : (
          <Typography variant="body2">{messageData.message}</Typography>
        )}
      </Grid>
    </Grid>
  );
}

export default BotFileCheckReply;
