// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/StreamingResponseDisplay.jsx

import React, { useState, useEffect } from "react";
import { Grid, Avatar, Typography, IconButton, Tooltip, Box } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import BotAvatar from "../Assets/BotAvatar.svg";
import LoadingAnimation from "../Assets/loading_animation.gif";
import { ALLOW_MARKDOWN_BOT, BOTMESSAGE_TEXT_COLOR } from "../utilities/constants";
import ReactMarkdown from "react-markdown";

// This component ONLY displays the incoming stream deltas visually
// It does NOT handle WebSocket connections or final message state management
const StreamingResponse = ({ deltas = [] }) => {
    const [showLoading, setShowLoading] = useState(true);
    const [copySuccess, setCopySuccess] = useState(false);
    // Combine deltas received so far for continuous display
    const currentText = deltas.join("");

    // Effect to hide the initial loading animation once the first delta arrives
    useEffect(() => {
        if (deltas.length > 0 && showLoading) {
            setShowLoading(false);
        }
        // Optional: Reset loading if deltas are cleared (e.g., new message sent)
        // This depends on how the parent component manages the key/remounting
        if (deltas.length === 0 && !showLoading) {
            // This might not be needed if parent uses key prop effectively
            // setShowLoading(true);
        }
    }, [deltas, showLoading]);

    const handleCopyToClipboard = () => {
        if (!currentText) return;
        navigator.clipboard.writeText(currentText).then(() => {
            console.log("Streaming message copied to clipboard");
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000); // Shorter timeout for feedback
        }).catch((err) => {
            console.error("Failed to copy streaming message: ", err);
        });
    };

     // Show loading animation initially or if deltas somehow get cleared before ending
    if (showLoading && deltas.length === 0) {
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
                            borderRadius: '20px',
                            mt: 1,
                            minWidth: '50px',
                            maxWidth: 'calc(100% - 50px)',
                            minHeight: '40px', // Ensure bubble has height for loading animation
                         }}
                    >
                         <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 'inherit' }}>
                             <img src={LoadingAnimation} alt="Loading..." style={{ width: '30px', height: '30px' }} /> {/* Slightly smaller loading gif */}
                         </Box>
                    </Grid>
                </Grid>
             </Box>
         );
    }

    // If deltas exist (even if empty string), display the content bubble
    return (
        <Box sx={{ width: '100%' }}>
           <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" spacing={1} wrap="nowrap">
               <Grid item>
                   <Avatar alt="Bot Avatar" src={BotAvatar} sx={{ width: 40, height: 40, mt: 1 }} />
               </Grid>
               <Grid
                   item
                   className="botMessage"
                   xs // Allow grid item to take up available space
                   sx={{
                        backgroundColor: (theme) => theme.palette.background.botMessage,
                        position: "relative",
                        padding: '10px 15px',
                        paddingRight: '40px', // Make space for copy button
                        borderRadius: '20px',
                        mt: 1,
                        minWidth: '50px',
                        maxWidth: 'calc(100% - 50px)', // Prevent exceeding parent width
                        wordWrap: 'break-word', // Break long words
                    }}
               >
                   {currentText && ( // Show copy button only if there's actually text streamed
                       <Tooltip title={copySuccess ? "Copied!" : "Copy response"}>
                           <IconButton
                               size="small"
                               onClick={handleCopyToClipboard}
                               sx={{ position: "absolute", top: 5, right: 5, zIndex: 1, color: 'grey.600', '&:hover': { color: 'primary.main' } }}
                           >
                               {copySuccess ? <CheckIcon fontSize="inherit" /> : <ContentCopyIcon fontSize="inherit" />}
                           </IconButton>
                       </Tooltip>
                   )}

                   {/* Render actual text content */}
                   {ALLOW_MARKDOWN_BOT ? (
                       <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} sx={{ '& > p': { margin: 0 } }}>
                           {/* Render markdown, ensure no extra margins */}
                           <ReactMarkdown>{currentText || "\u00A0"}</ReactMarkdown> {/* Use non-breaking space as placeholder if empty */}
                       </Typography>
                   ) : (
                       <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR}>
                           {/* Render plain text */}
                           {currentText || "\u00A0"} {/* Use non-breaking space */}
                       </Typography>
                   )}
                   {/* Note: Sources/Errors are handled by the final BotReply added by ChatBody */}
               </Grid>
           </Grid>
        </Box>
   );
};

export default StreamingResponse;