// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/StreamingMessage.jsx
// Renamed file to match component name conceptually

import React, { useState, useEffect, useRef } from "react";
import { Grid, Avatar, Typography, IconButton, Tooltip, Box } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import BotAvatar from "../Assets/BotAvatar.svg";
import LoadingAnimation from "../Assets/loading_animation.gif";
// Removed WEBSOCKET_API, ALLOW_CHAT_HISTORY as they are handled by ChatBody
import { ALLOW_MARKDOWN_BOT, DISPLAY_SOURCES_BEDROCK_KB, BOTMESSAGE_TEXT_COLOR } from "../utilities/constants";
import { useMessage } from "../contexts/MessageContext";
import createMessageBlock from "../utilities/createMessageBlock";
import ReactMarkdown from "react-markdown";
import { useProcessing } from '../contexts/ProcessingContext';

// This component now ONLY handles the streaming *process* based on a passed WebSocket instance.
const StreamingMessage = ({ websocket }) => { // <<< Accept websocket as a prop
  const [responses, setResponses] = useState([]); // Holds incoming text chunks
  const [sources, setSources] = useState([]); // Holds received source data
  const [showLoading, setShowLoading] = useState(true); // Show loading animation initially
  const messageBuffer = useRef(""); // Buffer for potentially chunked JSON messages
  const { addMessage } = useMessage(); // Get addMessage from context
  const { setProcessing } = useProcessing(); // Need to set processing to false when done
  const [copySuccess, setCopySuccess] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false); // Track if the 'end' signal arrived

  // Effect to attach listeners to the passed WebSocket instance
  useEffect(() => {
    // Don't proceed if websocket is not available or not connected
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      console.warn("StreamingMessage: WebSocket instance not available or not open.");
      // If connection is lost before stream ends, ensure processing stops
      // Checking processing state avoids unnecessary calls if already false
      //if (processing) { // Check processing state from context if needed
      //  setProcessing(false);
      //}
      return;
    }

    console.log("StreamingMessage: Attaching listeners to WebSocket.");

    // Reset local state for this streaming session
    setStreamEnded(false);
    setResponses([]);
    setSources([]);
    setShowLoading(true);
    messageBuffer.current = ""; // Clear buffer on new stream start

    const handleWebSocketMessage = (event) => {
      // console.log("StreamingMessage Raw message received:", event.data); // Debugging
      let jsonData = null;
      try {
        // Attempt to parse the incoming data directly
        jsonData = JSON.parse(event.data);
        messageBuffer.current = ""; // Clear buffer if direct parse succeeds

        // --- Process parsed data ---
        if (jsonData.type === "delta" && jsonData.text) {
            if (showLoading) setShowLoading(false); // Hide loading on first delta
            setResponses((prev) => [...prev, jsonData.text]);
        } else if (jsonData.type === "sources" && jsonData.sources) {
            console.log("StreamingMessage Sources received: ", jsonData.sources);
            setSources(jsonData.sources); // Store sources
        } else if (jsonData.type === "end") {
            console.log("StreamingMessage End signal received.");
            setStreamEnded(true); // Mark stream as ended internally
            setProcessing(false); // <<< Crucial: Re-enable input <<<
        } else if (jsonData.type === "error") {
            console.error("StreamingMessage Backend error message:", jsonData.text);
            // Optionally add an error message block to display?
            // const errorBlock = createMessageBlock(`Bot Error: ${jsonData.text}`, 'BOT', 'TEXT', 'SENT');
            // addMessage(errorBlock);
            setStreamEnded(true); // Treat error as end of stream for final message logic
            setProcessing(false); // Still need to re-enable input
        } else {
            console.warn("StreamingMessage Received unknown message type:", jsonData.type, jsonData);
        }

      } catch (e) {
          // Handle potential JSON parsing errors if data is chunked
          messageBuffer.current += event.data;
          // console.log("StreamingMessage Attempting to parse buffered data:", messageBuffer.current); // Verbose Debugging
          try {
              jsonData = JSON.parse(messageBuffer.current);
              // If parse succeeds now, process it
              if (jsonData.type === "delta" && jsonData.text) {
                  if (showLoading) setShowLoading(false);
                  setResponses((prev) => [...prev, jsonData.text]);
              } else if (jsonData.type === "sources" && jsonData.sources) {
                  console.log("StreamingMessage Sources received (buffered): ", jsonData.sources);
                  setSources(jsonData.sources);
              } else if (jsonData.type === "end") {
                  console.log("StreamingMessage End signal received (buffered).");
                  setStreamEnded(true);
                  setProcessing(false);
              } else if (jsonData.type === "error") {
                  console.error("StreamingMessage Backend error message (buffered):", jsonData.text);
                  setStreamEnded(true);
                  setProcessing(false);
              } else {
                  console.warn("StreamingMessage Received unknown message type (buffered):", jsonData.type, jsonData);
              }
              // Clear buffer since it formed a valid JSON object
              messageBuffer.current = "";
          } catch (parseError) {
              // If still can't parse, wait for more data
              if (messageBuffer.current.length > 15000) { // Avoid infinite buffer growth
                  console.error("StreamingMessage Buffer too large, clearing. Potential connection issue.", parseError);
                  messageBuffer.current = "";
                  setStreamEnded(true); // Assume stream failed
                  setProcessing(false); // Reset processing on potential error
              } else {
                  // console.log("StreamingMessage Received incomplete JSON chunk, waiting..."); // Verbose
              }
          }
      }
    };

    const handleWebSocketError = (error) => {
      console.error("StreamingMessage WebSocket Error: ", error);
      setShowLoading(false); // Hide loading on error
      setStreamEnded(true); // Treat error as end of stream
      setProcessing(false); // Ensure processing stops
      // Optionally add an error message
    };

    const handleWebSocketClose = (event) => {
      setShowLoading(false); // Hide loading on close
      console.log(`StreamingMessage WebSocket closed. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
      // Ensure processing stops if closed unexpectedly before 'end' signal
      if (!streamEnded) {
          console.log("StreamingMessage WebSocket closed unexpectedly.");
          setStreamEnded(true); // Trigger final message processing if needed
          setProcessing(false);
      }
    };

    // Attach handlers to the passed-in websocket instance
    websocket.onmessage = handleWebSocketMessage;
    websocket.onerror = handleWebSocketError;
    websocket.onclose = handleWebSocketClose;

    // Cleanup function to remove listeners when component unmounts or websocket changes
    return () => {
      console.log("StreamingMessage: Detaching listeners.");
      if (websocket) {
        // It's generally safer to nullify handlers rather than assuming ChatBody handles it exclusively
        websocket.onmessage = null;
        websocket.onerror = null;
        websocket.onclose = null; // Prevent ChatBody's close handler from firing redundantly if this unmounts first
      }
      // If the component unmounts before the stream ends, ensure processing is reset
      // This prevents the input staying disabled if user navigates away mid-stream
      // Check streamEnded ref/state if needed to avoid double-setting
       if (!streamEnded) {
           // setProcessing(false); // Be cautious with this, might interfere if ChatBody handles close
       }
    };
  // Dependency: Re-run effect if the websocket instance changes.
  }, [websocket, setProcessing]); // Add setProcessing dependency

  // Effect to add the *final* message block to the context once streaming is done
  useEffect(() => {
    // Only run when the stream has ended (signal received or connection closed/errored)
    if (streamEnded) {
      const finalMessage = responses.join("");
      // Add message only if there's content OR sources (avoid empty blocks on errors)
      if (finalMessage || sources.length > 0) {
          console.log("StreamingMessage Stream ended. Adding final message to context:", finalMessage);
          const finalSources = (DISPLAY_SOURCES_BEDROCK_KB && sources.length > 0) ? sources : [];
          const botMessageBlock = createMessageBlock(
            finalMessage,
            "BOT",
            "TEXT",
            "SENT",
            "", // fileName
            "", // fileStatus
            finalSources // <<< Pass final sources here >>>
          );
          addMessage(botMessageBlock);
      } else {
          console.log("StreamingMessage Stream ended with no content/sources to add.");
      }

      // Clear local state for next potential render (though component likely unmounts/remounts)
      // setResponses([]); // Clearing state might cause flicker if component re-renders before unmount
      // setSources([]);
    }
  }, [streamEnded, addMessage, responses, sources]); // Depend on streamEnded flag and accumulated data


  const handleCopyToClipboard = () => {
    const textToCopy = responses.join("");
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      console.log("Streaming message copied to clipboard");
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    }).catch((err) => {
      console.error("Failed to copy streaming message: ", err);
    });
  };

  // --- Component Rendering ---
  // Render only if there's something to show (loading or response text)
  if (!showLoading && responses.length === 0 && !streamEnded) {
      // Avoid rendering an empty box before the first delta arrives but after loading is hidden
      return null;
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1} wrap="nowrap">
        <Grid item>
            <Avatar
              alt="Bot Avatar"
              src={BotAvatar}
              sx={{ width: 40, height: 40, mt: 1 }}
            />
        </Grid>

        <Grid
          item
          className="botMessage"
          xs // Allow grid item to take available space
          sx={{
              backgroundColor: (theme) => theme.palette.background.botMessage,
              position: "relative",
              padding: '10px 15px',
              paddingRight: '40px', // Ensure space for copy button
              borderRadius: '20px',
              mt: 1,
              minWidth: '50px',
              maxWidth: 'calc(100% - 50px)', // Adjust max width if needed
              wordWrap: 'break-word',
              minHeight: '40px', // Ensure minimum height
          }}
        >
          {/* Show loading animation or streaming text */}
          {showLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 'inherit' }}>
                <img src={LoadingAnimation} alt="Loading..." style={{ width: '40px', height: '40px' }} />
            </Box>
          ) : (
            <>
              {/* Copy button appears when not loading and there's text */}
              {responses.length > 0 && (
                <Tooltip title={copySuccess ? "Copied" : "Copy current text"}>
                  <IconButton
                    size="small"
                    onClick={handleCopyToClipboard}
                    sx={{ position: "absolute", top: 5, right: 5, zIndex: 1, color: 'grey.600' }}
                  >
                    {copySuccess ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
              )}
              {/* Render streaming text */}
              {ALLOW_MARKDOWN_BOT ? (
                <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} sx={{ '& > p': { margin: 0 } }}>
                  <ReactMarkdown>{responses.join("") || "\u00A0"}</ReactMarkdown> {/* Use Non-breaking space if empty */}
                </Typography>
              ) : (
                <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR}>
                  {responses.join("") || "\u00A0"} {/* Use Non-breaking space if empty */}
                </Typography>
              )}
            </>
          )}
          {/* Source rendering moved to BotReply component */}
        </Grid>
      </Grid>
    </Box>
  );
};

export default StreamingMessage;