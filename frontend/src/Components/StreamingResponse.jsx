// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/StreamingMessage.jsx

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
// Removed useProcessing import as it no longer sets the state directly
// import { useProcessing } from '../contexts/ProcessingContext';

// Accept onStreamComplete prop
const StreamingMessage = ({ websocket, onStreamComplete }) => {
    const [responses, setResponses] = useState([]);
    const [sources, setSources] = useState([]);
    const [showLoading, setShowLoading] = useState(true);
    const messageBuffer = useRef("");
    const { addMessage } = useMessage();
    // const { setProcessing } = useProcessing(); // <<< REMOVED >>>
    const [copySuccess, setCopySuccess] = useState(false);
    const [streamEnded, setStreamEnded] = useState(false);
    const [errorOccurred, setErrorOccurred] = useState(false); // Track if an error happened

    // Effect to attach listeners
    useEffect(() => {
        if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            console.warn("StreamingMessage: WebSocket instance not available or not open.");
            // If component mounts but WS is bad, signal completion immediately to avoid hanging
            if (onStreamComplete) {
                onStreamComplete();
            }
            return;
        }

        console.log("StreamingMessage: Attaching listeners to WebSocket.");
        setStreamEnded(false);
        setErrorOccurred(false); // Reset error state
        setResponses([]);
        setSources([]);
        setShowLoading(true);
        messageBuffer.current = "";

        const handleWebSocketMessage = (event) => {
            let jsonData = null;
            try {
                jsonData = JSON.parse(event.data);
                messageBuffer.current = "";

                if (jsonData.type === "delta" && jsonData.text) {
                    if (showLoading) setShowLoading(false);
                    setResponses((prev) => [...prev, jsonData.text]);
                } else if (jsonData.type === "sources" && jsonData.sources) {
                    console.log("StreamingMessage Sources received: ", jsonData.sources);
                    setSources(jsonData.sources);
                } else if (jsonData.type === "end") {
                    console.log("StreamingMessage End signal received.");
                    setStreamEnded(true);
                    // setProcessing(false); // <<< REMOVED >>>
                } else if (jsonData.type === "error") {
                    console.error("StreamingMessage Backend error message:", jsonData.text);
                    setErrorOccurred(true); // Mark that an error occurred
                    setStreamEnded(true); // Treat error as end of stream for final message logic
                    // setProcessing(false); // <<< REMOVED >>>
                } else {
                    console.warn("StreamingMessage Received unknown message type:", jsonData.type, jsonData);
                }

            } catch (e) {
                messageBuffer.current += event.data;
                try {
                    jsonData = JSON.parse(messageBuffer.current);
                    if (jsonData.type === "delta" && jsonData.text) {
                        if (showLoading) setShowLoading(false);
                        setResponses((prev) => [...prev, jsonData.text]);
                    } else if (jsonData.type === "sources" && jsonData.sources) {
                        console.log("StreamingMessage Sources received (buffered): ", jsonData.sources);
                        setSources(jsonData.sources);
                    } else if (jsonData.type === "end") {
                        console.log("StreamingMessage End signal received (buffered).");
                        setStreamEnded(true);
                        // setProcessing(false); // <<< REMOVED >>>
                    } else if (jsonData.type === "error") {
                        console.error("StreamingMessage Backend error message (buffered):", jsonData.text);
                        setErrorOccurred(true);
                        setStreamEnded(true);
                        // setProcessing(false); // <<< REMOVED >>>
                    } else {
                        console.warn("StreamingMessage Received unknown message type (buffered):", jsonData.type, jsonData);
                    }
                    messageBuffer.current = "";
                } catch (parseError) {
                    if (messageBuffer.current.length > 15000) {
                        console.error("StreamingMessage Buffer too large, clearing.", parseError);
                        messageBuffer.current = "";
                        setErrorOccurred(true);
                        setStreamEnded(true);
                        // setProcessing(false); // <<< REMOVED >>>
                    }
                }
            }
        };

        const handleWebSocketError = (error) => {
            console.error("StreamingMessage WebSocket Error: ", error);
            setShowLoading(false);
            setErrorOccurred(true);
            setStreamEnded(true);
            // setProcessing(false); // <<< REMOVED >>>
        };

        const handleWebSocketClose = (event) => {
            setShowLoading(false);
            console.log(`StreamingMessage WebSocket closed. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
            if (!streamEnded) { // Only trigger if end signal wasn't received
                console.log("StreamingMessage WebSocket closed unexpectedly.");
                if (!event.wasClean) setErrorOccurred(true); // Treat unclean close as an error scenario
                setStreamEnded(true);
                // setProcessing(false); // <<< REMOVED >>>
            }
        };

        websocket.onmessage = handleWebSocketMessage;
        websocket.onerror = handleWebSocketError;
        websocket.onclose = handleWebSocketClose;

        return () => {
            console.log("StreamingMessage: Detaching listeners.");
            if (websocket) {
                websocket.onmessage = null;
                websocket.onerror = null;
                websocket.onclose = null;
            }
        };
    // Removed setProcessing dependency
    }, [websocket]); // Dependency only on websocket instance


    // Effect to add the *final* message block and signal completion
    useEffect(() => {
        if (streamEnded) {
            const finalMessage = responses.join("");
            // Add message only if there's content OR sources (avoid empty blocks on pure errors)
            // Also add if an error occurred to ensure some feedback might be present
            if (finalMessage || sources.length > 0 || errorOccurred) {
                console.log("StreamingMessage Stream ended. Adding final message block.");
                const finalSources = (DISPLAY_SOURCES_BEDROCK_KB && sources.length > 0) ? sources : [];
                const messageTextToAdd = errorOccurred && !finalMessage
                    ? "An error occurred while generating the response." // Default error text if nothing streamed
                    : finalMessage;

                const botMessageBlock = createMessageBlock(
                    messageTextToAdd,
                    "BOT",
                    "TEXT", // Keep type as TEXT even for errors for simplicity, could add 'ERROR' type if needed
                    "SENT",
                    "", // fileName
                    "", // fileStatus
                    finalSources
                );
                addMessage(botMessageBlock);
            } else {
                console.log("StreamingMessage Stream ended with no content/sources/error to add.");
            }

            // *** Signal completion back to ChatBody ***
            if (onStreamComplete) {
                console.log("StreamingMessage: Signaling stream completion.");
                onStreamComplete();
            }

        }
    // Depend on streamEnded to trigger this logic
    // Add dependencies used inside: addMessage, responses, sources, onStreamComplete, errorOccurred
    }, [streamEnded, addMessage, responses, sources, onStreamComplete, errorOccurred]);


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

    // Render logic remains the same...
    if (!showLoading && responses.length === 0 && !streamEnded) {
        return null;
    }
    
  return (
    <Box sx={{ width: '100%' }}>
       <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1} wrap="nowrap">
                <Grid item>
                    <Avatar alt="Bot Avatar" src={BotAvatar} sx={{ width: 40, height: 40, mt: 1 }} />
                </Grid>
                <Grid
                    item
                    className="botMessage"
                    xs
                    sx={{
                        backgroundColor: (theme) => theme.palette.background.botMessage,
                        position: "relative",
                        padding: '10px 15px',
                        paddingRight: '40px',
                        borderRadius: '20px',
                        mt: 1,
                        minWidth: '50px',
                        maxWidth: 'calc(100% - 50px)',
                        wordWrap: 'break-word',
                        minHeight: '40px',
                    }}
                >
                    {showLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 'inherit' }}>
                            <img src={LoadingAnimation} alt="Loading..." style={{ width: '40px', height: '40px' }} />
                        </Box>
                    ) : (
                        <>
                            {responses.length > 0 && (
                                <Tooltip title={copySuccess ? "Copied" : "Copy current text"}>
                                    <IconButton size="small" onClick={handleCopyToClipboard} sx={{ position: "absolute", top: 5, right: 5, zIndex: 1, color: 'grey.600' }}>
                                        {copySuccess ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                                    </IconButton>
                                </Tooltip>
                            )}
                            {ALLOW_MARKDOWN_BOT ? (
                                <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} sx={{ '& > p': { margin: 0 } }}>
                                    <ReactMarkdown>{responses.join("") || "\u00A0"}</ReactMarkdown>
                                </Typography>
                            ) : (
                                <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR}>
                                    {responses.join("") || "\u00A0"}
                                </Typography>
                            )}
                        </>
                    )}
                </Grid>
            </Grid>
        </Box>
  );
};

export default StreamingMessage;