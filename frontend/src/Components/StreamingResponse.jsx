// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/StreamingResponse.jsx

import React, { useState, useEffect, useRef } from "react";
import { Grid, Avatar, Typography, IconButton, Tooltip, Box } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import BotAvatar from "../Assets/BotAvatar.svg";
import LoadingAnimation from "../Assets/loading_animation.gif";
import { ALLOW_MARKDOWN_BOT, DISPLAY_SOURCES_BEDROCK_KB, BOTMESSAGE_TEXT_COLOR } from "../utilities/constants";
import { useMessage } from "../contexts/MessageContext";
import createMessageBlock from "../utilities/createMessageBlock";
import ReactMarkdown from "react-markdown";

const StreamingResponse = ({ websocket, onStreamComplete }) => {
    const [currentStreamText, setCurrentStreamText] = useState(""); // Store current streaming text directly
    const [sources, setSources] = useState([]);
    const [showLoading, setShowLoading] = useState(true);
    const { addMessage } = useMessage();
    const [copySuccess, setCopySuccess] = useState(false);
    // Removed streamEnded and errorOccurred states as they are handled directly in the message listener

    // Ref to track if the component is still mounted to avoid state updates after unmount
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false; // Set to false when component unmounts
        };
    }, []);


    // Effect to attach listeners
    useEffect(() => {
        if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            console.warn("StreamingResponse: WebSocket instance not available or not open.");
            if (onStreamComplete) {
                onStreamComplete(); // Signal completion if WS is bad on mount
            }
            return;
        }

        console.log("StreamingResponse: Attaching listeners to WebSocket.");
        // Reset state on new stream
        setCurrentStreamText("");
        setSources([]);
        setShowLoading(true);
        setCopySuccess(false);

        let accumulatedText = ""; // Local accumulator for this stream instance

        const handleWebSocketMessage = (event) => {
             // Check if component is still mounted before updating state
             if (!isMounted.current) {
                console.log("StreamingResponse: Component unmounted, ignoring WS message.");
                return;
            }

            let jsonData = null;
            try {
                jsonData = JSON.parse(event.data);

                if (jsonData.type === "delta" && jsonData.text) {
                    if (showLoading) setShowLoading(false);
                    accumulatedText += jsonData.text; // Append to local accumulator
                    setCurrentStreamText(accumulatedText); // Update state for rendering
                } else if (jsonData.type === "sources" && jsonData.sources) {
                    console.log("StreamingResponse Sources received: ", jsonData.sources);
                    setSources(jsonData.sources); // Update sources state
                } else if (jsonData.type === "end" || jsonData.type === "error") {
                    // --- Final Message Handling ---
                    const isError = jsonData.type === "error";
                    const errorText = isError ? jsonData.text : null;
                    console.log(`StreamingResponse ${isError ? 'Error' : 'End'} signal received.`);

                    const finalMessageText = isError && !accumulatedText
                        ? errorText || "An error occurred while generating the response." // Use error text or default
                        : accumulatedText; // Use accumulated text

                    // Add final message block *before* signalling completion
                    if (finalMessageText || sources.length > 0) {
                         const finalSources = (DISPLAY_SOURCES_BEDROCK_KB && sources.length > 0) ? sources : [];
                         const botMessageBlock = createMessageBlock(
                            finalMessageText,
                            "BOT",
                            "TEXT", // Keep as TEXT even for errors for now
                            "SENT",
                            "", // fileName
                            "", // fileStatus
                            finalSources
                        );
                        console.log("StreamingResponse: Adding final message block.");
                        addMessage(botMessageBlock);
                    } else {
                        console.log("StreamingResponse: Stream ended with no content/sources to add.");
                    }

                    // Signal completion *after* adding message block
                    if (onStreamComplete) {
                        console.log("StreamingResponse: Signaling stream completion.");
                        onStreamComplete();
                    }
                    // Clean up listeners potentially? Though the effect cleanup does this.
                    // Consider if WS listener should be removed here if WS persists

                } else {
                    console.warn("StreamingResponse Received unknown message type:", jsonData.type, jsonData);
                }

            } catch (e) {
                // Handle potential JSON parse errors if data comes in chunks - less likely with WS but possible
                 console.error("StreamingResponse: Error parsing WebSocket message or partial message received.", e, "Data:", event.data);
                 // If parsing fails consistently, might indicate a problem. Could add an error message here too.
                 // For simplicity, we'll currently rely on the backend sending a proper 'error' type message.
            }
        };

        const handleWebSocketError = (error) => {
            if (!isMounted.current) return; // Check mount status
            console.error("StreamingResponse WebSocket Error: ", error);
            setShowLoading(false);
            // Create and add an error message block
            const errorMsgBlock = createMessageBlock(
                "A WebSocket error occurred. Please try again.",
                "BOT", "TEXT", "SENT", "", "", []
            );
            addMessage(errorMsgBlock);
            // Signal completion
            if (onStreamComplete) {
                onStreamComplete();
            }
        };

        const handleWebSocketClose = (event) => {
            if (!isMounted.current) return; // Check mount status
             setShowLoading(false);
            console.log(`StreamingResponse WebSocket closed. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
             // Only add error message and signal completion IF it wasn't triggered by a normal 'end'/'error' message handler above
            // This requires tracking if 'end' or 'error' was already handled. A simple flag could do this.
            // For now, let's assume 'end'/'error' messages are reliable. If the close is unexpected,
            // signal completion, but maybe don't add a duplicate error message if one was already added.
            // A more robust solution might involve a ref to track if completion was signaled.
            if (onStreamComplete) {
                console.log("StreamingResponse: WebSocket closed, ensuring completion signal.")
                onStreamComplete(); // Ensure completion is signalled even on close
            }
        };

        websocket.onmessage = handleWebSocketMessage;
        websocket.onerror = handleWebSocketError;
        websocket.onclose = handleWebSocketClose;

        // Cleanup function
        return () => {
            console.log("StreamingResponse: Detaching listeners.");
            // Clear listeners on the specific websocket instance passed in props
            // Avoid potential issues if the same websocket object is reused elsewhere
            if (websocket) {
                 // Check if functions are still assigned before nulling them
                 if (websocket.onmessage === handleWebSocketMessage) websocket.onmessage = null;
                 if (websocket.onerror === handleWebSocketError) websocket.onerror = null;
                 if (websocket.onclose === handleWebSocketClose) websocket.onclose = null;
            }
        };
    // Re-run effect if the websocket instance changes or the callback changes
    }, [websocket, onStreamComplete, addMessage]); // Added addMessage dependency


    const handleCopyToClipboard = () => {
        if (!currentStreamText) return;
        navigator.clipboard.writeText(currentStreamText).then(() => {
            console.log("Streaming message copied to clipboard");
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 3000);
        }).catch((err) => {
            console.error("Failed to copy streaming message: ", err);
        });
    };

    // --- Render Logic ---
    // Show loading only initially
    if (showLoading) {
         return (
             <Box sx={{ width: '100%' }}>
                <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1} wrap="nowrap">
                    <Grid item>
                        <Avatar alt="Bot Avatar" src={BotAvatar} sx={{ width: 40, height: 40, mt: 1 }} />
                    </Grid>
                    <Grid item className="botMessage" xs sx={{ /* styles */ backgroundColor: (theme) => theme.palette.background.botMessage, position: "relative", padding: '10px 15px', borderRadius: '20px', mt: 1, minWidth: '50px', maxWidth: 'calc(100% - 50px)', wordWrap: 'break-word', minHeight: '40px' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 'inherit' }}>
                            <img src={LoadingAnimation} alt="Loading..." style={{ width: '40px', height: '40px' }} />
                        </Box>
                    </Grid>
                </Grid>
            </Box>
        );
    }

    // If loading is finished but there's no text yet (and sources haven't arrived), render nothing temporarily
    // This prevents an empty box flashing briefly before text arrives.
    // We rely on the final message block being added by the 'end'/'error' handler.
    if (!showLoading && !currentStreamText && sources.length === 0) {
        // Or, you could potentially keep the loading indicator until the *first* delta or 'end'/'error' if preferred.
        // For now, rendering null once loading is false but text hasn't arrived.
        return null;
    }


    // Render the streaming text as it arrives
    return (
        <Box sx={{ width: '100%' }}>
           <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1} wrap="nowrap">
                <Grid item>
                    <Avatar alt="Bot Avatar" src={BotAvatar} sx={{ width: 40, height: 40, mt: 1 }} />
                </Grid>
                <Grid item className="botMessage" xs sx={{ /* styles */ backgroundColor: (theme) => theme.palette.background.botMessage, position: "relative", padding: '10px 15px', paddingRight: '40px', borderRadius: '20px', mt: 1, minWidth: '50px', maxWidth: 'calc(100% - 50px)', wordWrap: 'break-word', minHeight: '40px' }}>
                   {currentStreamText && ( // Render copy button only if there is text
                        <Tooltip title={copySuccess ? "Copied" : "Copy current text"}>
                             <IconButton size="small" onClick={handleCopyToClipboard} sx={{ position: "absolute", top: 5, right: 5, zIndex: 1, color: 'grey.600' }}>
                                 {copySuccess ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                             </IconButton>
                         </Tooltip>
                    )}
                     {ALLOW_MARKDOWN_BOT ? (
                        <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} sx={{ '& > p': { margin: 0 } }}>
                            <ReactMarkdown>{currentStreamText || "\u00A0"}</ReactMarkdown>
                         </Typography>
                     ) : (
                        <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR}>
                             {currentStreamText || "\u00A0"}
                         </Typography>
                     )}
                     {/* Note: Sources are added to the final message block, not displayed live during streaming here */}
                </Grid>
            </Grid>
       </Box>
    );
};

export default StreamingResponse;