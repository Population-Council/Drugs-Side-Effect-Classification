import React, { useState, useEffect } from "react";
import { Box, Typography, CircularProgress } from "@mui/material";
import PdfIcon from "../Assets/pdf_logo.svg";
import { useMessage } from "../contexts/MessageContext";
import BotMessageBubble from "./BotMessageBubble";

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
      } else if (
        fileStatus === "File size limit exceeded." ||
        fileStatus === "Network Error. Please try again later." ||
        error
      ) {
        timeout = setTimeout(() => setAnimationState("fail"), 1000);
      }
    }
    return () => clearTimeout(timeout);
  }, [animationState, fileStatus, error]);

  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
      <BotMessageBubble>
        {fileStatus ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img
                src={PdfIcon}
                alt="PDF Icon"
                style={{ width: 40, height: 40, borderRadius: "5px" }}
              />
              <Typography variant="body2">{fileName}</Typography>
            </div>
            <div style={{ marginTop: 8 }}>
              <Typography variant="body2" color={error ? "error" : "textPrimary"}>
                {animationState === "checking"
                  ? "Checking file size..."
                  : fileStatus}
              </Typography>
              {animationState === "checking" && (
                <CircularProgress size={24} style={{ marginLeft: 8, verticalAlign: 'middle' }} />
              )}
            </div>
          </div>
        ) : (
          <Typography variant="body2">{messageData.message}</Typography>
        )}
      </BotMessageBubble>
    </Box>
  );
}

export default BotFileCheckReply;