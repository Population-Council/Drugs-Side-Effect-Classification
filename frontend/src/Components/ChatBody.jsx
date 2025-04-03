// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/ChatBody.jsx

import React, { useRef, useEffect, useState } from 'react';
import { useCookies } from 'react-cookie';
import { Box, Grid, Avatar, Typography } from '@mui/material';
import Attachment from './Attachment';
import ChatInput from './ChatInput';
import UserAvatar from '../Assets/UserAvatar.svg';
import createMessageBlock from '../utilities/createMessageBlock';
import { ALLOW_FILE_UPLOAD, ALLOW_VOICE_RECOGNITION, ALLOW_FAQ, USERMESSAGE_TEXT_COLOR, WEBSOCKET_API, ALLOW_CHAT_HISTORY, DISPLAY_SOURCES_BEDROCK_KB } from '../utilities/constants';
import BotFileCheckReply from './BotFileCheckReply';
import SpeechRecognitionComponent from './SpeechRecognition';
import { FAQExamples } from './index';
import { useMessage } from '../contexts/MessageContext';
import { useQuestion } from '../contexts/QuestionContext';
import { useProcessing } from '../contexts/ProcessingContext';
import BotReply from './BotReply'; // Displays final BOT messages
import StreamingResponseDisplay from './StreamingResponseDisplay'; // Displays streaming BOT messages
import { useRole } from '../contexts/RoleContext';

function ChatBody({ onFileUpload, showLeftNav, setLeftNav }) {
    const { messageList, addMessage } = useMessage();
    const { questionAsked, setQuestionAsked } = useQuestion();
    const { processing, setProcessing } = useProcessing();
    const { selectedRole } = useRole();
    const [message, setMessage] = useState(''); // State for SpeechRecognition component
    const [cookies, setCookie] = useCookies(['userMessages']);
    const messagesEndRef = useRef(null);
    const websocket = useRef(null);
    const [isWsConnected, setIsWsConnected] = useState(false);

    // --- State for Streaming Data ---
    const [streamingData, setStreamingData] = useState({
        deltas: [],
        sources: [],
        ended: false,
        error: null,
        key: Date.now() // Key to force remount of display component if needed
    });

    // --- WebSocket Connection & Message Handling ---
    useEffect(() => {
        if (!WEBSOCKET_API) {
            console.error("WebSocket API URL is not defined.");
            return;
        }

        console.log("ChatBody: Attempting WebSocket connection...");
        websocket.current = new WebSocket(WEBSOCKET_API);

        websocket.current.onopen = () => {
            console.log("ChatBody: WebSocket Connected");
            setIsWsConnected(true);
        };

        websocket.current.onclose = (event) => {
            console.log(`ChatBody: WebSocket Disconnected. Clean: ${event.wasClean}, Code: ${event.code}, Reason: ${event.reason}`);
            setIsWsConnected(false);
             // Only set processing false if it was true, avoid unnecessary state changes
            if (processing) {
                setProcessing(false);
            }
            // If closed while streaming was active (deltas received but not ended), mark as ended with error
            if (streamingData.deltas.length > 0 && !streamingData.ended) {
                 console.warn("ChatBody: WebSocket closed during active stream.");
                 setStreamingData(prev => ({ ...prev, ended: true, error: 'Connection closed unexpectedly.' }));
            }
        };

        websocket.current.onerror = (error) => {
            console.error("ChatBody: WebSocket Error:", error);
            setIsWsConnected(false);
            if (processing) {
                setProcessing(false);
            }
            // If error happened during active stream
             if (streamingData.deltas.length > 0 && !streamingData.ended) {
                 console.warn("ChatBody: WebSocket error during active stream.");
                 setStreamingData(prev => ({ ...prev, ended: true, error: 'WebSocket connection error.' }));
            }
        };

        // *** Central Message Handler ***
        websocket.current.onmessage = (event) => {
            let jsonData = null;
            try {
                jsonData = JSON.parse(event.data);
                console.log("ChatBody WS Received:", jsonData); // Log all incoming messages

                // --- Route based on type ---
                if (jsonData.type === "delta" && jsonData.text != null) { // Check text specifically exists
                     if (!streamingData.ended) { // Only process if stream hasn't ended
                        setStreamingData(prev => ({ ...prev, deltas: [...prev.deltas, jsonData.text], ended: false, error: null }));
                    } else {
                        console.warn("ChatBody: Received delta after stream already marked as ended.");
                    }
                } else if (jsonData.type === "sources" && jsonData.sources) {
                     if (!streamingData.ended) {
                         setStreamingData(prev => ({ ...prev, sources: jsonData.sources }));
                    } else {
                         console.warn("ChatBody: Received sources after stream already marked as ended.");
                    }
                } else if (jsonData.type === "end") {
                     if (!streamingData.ended) {
                         console.log("ChatBody: Received 'end' signal.");
                         setStreamingData(prev => ({ ...prev, ended: true }));
                         // IMPORTANT: Do NOT set processing false here. The useEffect hook below handles it.
                    }
                } else if (jsonData.type === "error") {
                     if (!streamingData.ended) {
                        console.error("ChatBody: Received 'error' signal:", jsonData.text);
                        setStreamingData(prev => ({ ...prev, ended: true, error: jsonData.text || 'An unknown error occurred.' }));
                         // IMPORTANT: Do NOT set processing false here.
                    }
                } else if (jsonData.type === "text") {
                    // *** Handle direct text response (e.g., country list) ***
                    console.log("ChatBody: Handling direct 'text' message.");
                    const botMessageBlock = createMessageBlock(
                        jsonData.text || "", // Ensure text is provided
                        "BOT",
                        "TEXT",
                        "RECEIVED", // Use RECEIVED consistently for bot messages
                        "", // fileName
                        "", // fileStatus
                        [] // No sources for direct text response
                    );
                    addMessage(botMessageBlock);
                    // Reset any potential ongoing stream state immediately
                    setStreamingData({ deltas: [], sources: [], ended: false, error: null, key: Date.now() });
                    setProcessing(false); // End processing now

                } else {
                    console.warn("ChatBody: Received unknown or unhandled message type:", jsonData.type, jsonData);
                }

            } catch (e) {
                console.error("ChatBody: Error parsing WebSocket message or processing:", e, event.data);
                 // Handle parsing errors gracefully
                setStreamingData(prev => ({ ...prev, ended: true, error: 'Received malformed data from server.' }));
                 if (processing) { // Only set false if it was true
                     setProcessing(false);
                 }
            }
        };

        return () => {
            if (websocket.current) {
                console.log("ChatBody: Closing WebSocket connection in cleanup.");
                websocket.current.onopen = null;
                websocket.current.onmessage = null;
                websocket.current.onerror = null;
                websocket.current.onclose = null;
                websocket.current.close();
            }
        };
     // Add dependencies based on variables used inside the effect's functions
    }, [addMessage, setProcessing, processing, streamingData.ended, streamingData.deltas]); // Added processing and streamingData states

    // --- Scroll Logic ---
    useEffect(() => { scrollToBottom(); }, [messageList, streamingData.deltas]); // Scroll on new messages AND new deltas
    const scrollToBottom = () => { if (messagesEndRef.current) { messagesEndRef.current.scrollIntoView({ behavior: 'smooth' }); }};

    // --- Send Message Handler ---
    const handleSendMessage = (messageToSend) => {
        const trimmedMessage = messageToSend ? messageToSend.trim() : "";
        if (!processing && trimmedMessage && websocket.current && websocket.current.readyState === WebSocket.OPEN) {
            setProcessing(true);
            // *** Reset streaming state for the new request ***
            setStreamingData({ deltas: [], sources: [], ended: false, error: null, key: Date.now() });
            const timestamp = new Date().toISOString();
            const newMessageBlock = createMessageBlock(trimmedMessage, 'USER', 'TEXT', 'SENT', null, timestamp);
            addMessage(newMessageBlock);
            setQuestionAsked(true);
            // Use the *current* messageList state at the time of sending
            const currentHistory = ALLOW_CHAT_HISTORY ? messageList : [];
            const messagePayload = {
                action: 'sendMessage',
                prompt: trimmedMessage,
                role: selectedRole,
                history: currentHistory // Send history *before* adding the new user message
            };
            console.log("ChatBody Sending payload:", JSON.stringify(messagePayload));
            websocket.current.send(JSON.stringify(messagePayload));
            setMessage(''); // Clear any text potentially set by SpeechRecognition
        } else if (!trimmedMessage) {
             console.warn("Attempted to send an empty message.");
        } else if (processing) {
            console.warn("Processing another request. Please wait.");
             // Optionally provide user feedback here (e.g., toast notification)
        } else if (!websocket.current || websocket.current.readyState !== WebSocket.OPEN) {
            console.error("WebSocket is not connected. Cannot send message.");
            setIsWsConnected(false);
             // Optionally provide user feedback here
        }
    };

     // --- Effect to handle adding the *final* message block after stream ends ---
    useEffect(() => {
        // Only run if the stream has been marked as ended AND we were in a processing state
        if (streamingData.ended && processing) {
            const finalMessage = streamingData.deltas.join("");
            const finalSources = (DISPLAY_SOURCES_BEDROCK_KB && streamingData.sources.length > 0) ? streamingData.sources : [];

            // Determine the text to add, prioritizing error message if stream was empty
            const messageTextToAdd = streamingData.error && !finalMessage
                ? streamingData.error // Use error text if nothing streamed
                : finalMessage; // Otherwise use the accumulated deltas

            // Add final message block only if there's text, sources, or an error occurred
            if (messageTextToAdd || finalSources.length > 0) {
                 console.log("ChatBody: Stream ended. Adding final message block to context.");
                 const botMessageBlock = createMessageBlock(
                     messageTextToAdd || "", // Ensure it's a string
                     "BOT",
                     "TEXT", // Keep type as TEXT for simplicity, even for errors
                     "RECEIVED",
                     "", "", finalSources
                 );
                 addMessage(botMessageBlock);
            } else {
                 console.log("ChatBody: Stream ended with no content/sources/error to add to context.");
            }

            // *** Crucially, set processing to false AFTER handling the end state ***
            console.log("ChatBody: Stream ended processing complete. Setting processing to false.");
            setProcessing(false);
        }
    // Trigger this effect when 'streamingData.ended' becomes true while 'processing' is true
    }, [streamingData.ended, processing, addMessage, streamingData.deltas, streamingData.sources, streamingData.error, setProcessing]);


    // --- File Upload Handler (Simplified - adapt based on your full logic) ---
    const handleFileUploadComplete = (file, fileStatus) => {
       if (!processing) {
            // ... (your existing logic for adding user/bot file status messages) ...
             console.log(`ChatBody: File upload status: ${file.name} - ${fileStatus}`);
            // Example: Add message and potentially stop processing if error
            const userMsg = createMessageBlock(`File uploaded: ${file.name}`, 'USER', 'FILE', 'SENT');
            addMessage(userMsg);
            const botMsgText = fileStatus === 'File page limit check succeeded.' ? 'File ready.' : `File Error: ${fileStatus}`;
             const botMsg = createMessageBlock(botMsgText, 'BOT', 'FILE', 'RECEIVED');
            addMessage(botMsg);
            setQuestionAsked(true); // Mark conversation started
            if (fileStatus !== 'File page limit check succeeded.') {
                 // Stop processing immediately on file error if needed
                 // setProcessing(false);
            } else {
                 // Pass to parent if needed (e.g., for preview)
                if (onFileUpload) onFileUpload(file, fileStatus);
            }
             // Maybe set processing false here depending on flow? Or let user ask question next?
        }
    };

    // --- FAQ Prompt Click Handler ---
    const handlePromptClick = (prompt) => { handleSendMessage(prompt); };


    // --- Component Rendering ---
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', margin: 0, padding: '0 1rem' }}>
            {/* Messages Area */}
            <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', mb: 1, pr: 1 }}>
                {/* FAQ rendering */}
                <Box sx={{ display: ALLOW_FAQ && !questionAsked ? 'flex' : 'none' }}>
                   <FAQExamples onPromptClick={handlePromptClick} />
                </Box>

                {/* Display existing messages from context */}
                {messageList.map((msg, index) => (
                    <Box key={`${msg.sentBy}-${index}-${msg.timestamp || index}`} sx={{ mb: 2 }}>
                        {msg.sentBy === 'USER' ? ( <UserReply message={msg.message} /> )
                        : msg.sentBy === 'BOT' && msg.type === 'TEXT' ? ( <BotReply message={msg.message} sources={msg.sources} /> )
                        : msg.sentBy === 'BOT' && msg.type === 'FILE' ? ( <BotFileCheckReply messageId={index} /> /* Assumes this exists */ )
                        : null /* Ignore BOT SOURCES type explicitly */}
                    </Box>
                ))}

                {/* Conditionally render the *display* component for ongoing streams */}
                 {processing && isWsConnected && !streamingData.ended && (
                    <Box sx={{ mb: 2 }} key={streamingData.key}> {/* Use key to reset display state */}
                        <StreamingResponseDisplay
                            deltas={streamingData.deltas}
                            // Pass sources/error if StreamingResponseDisplay needs them live
                            // sources={streamingData.sources}
                            // error={streamingData.error}
                         />
                    </Box>
                )}

                {/* Scroll div */}
                <div ref={messagesEndRef} />
            </Box>

            {/* Input Area */}
            <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'flex-end', pb: 1, pl: { xs: 0, md: 1 }, pr: { xs: 0, md: 1 }, width: '100%' }}>
                 {/* Optional Buttons */}
                <Box sx={{ display: ALLOW_VOICE_RECOGNITION ? 'flex' : 'none', alignSelf: 'center', mb: 1 }}>
                    <SpeechRecognitionComponent setMessage={setMessage} getMessage={() => message} />
                </Box>
                <Box sx={{ display: ALLOW_FILE_UPLOAD ? 'flex' : 'none', alignSelf: 'center', mb: 1 }}>
                    <Attachment onFileUploadComplete={handleFileUploadComplete} />
                </Box>
                 {/* Main Chat Input */}
                <Box sx={{ width: '100%', ml: (ALLOW_FILE_UPLOAD || ALLOW_VOICE_RECOGNITION) ? 1 : 0 }}>
                    <ChatInput
                        onSendMessage={handleSendMessage}
                        showLeftNav={showLeftNav}
                        setLeftNav={setLeftNav}
                        // Pass processing state to disable input when busy
                        disabled={processing}
                        // Pass message state if ChatInput needs to be controlled by SpeechRecognition
                        message={message}
                        setMessage={setMessage}
                    />
                </Box>
            </Box>
        </Box>
    );
}

// --- UserReply Component ---
function UserReply({ message }) {
 return (
    <Grid container direction='row' justifyContent='flex-end' alignItems='flex-start' spacing={1}>
       <Grid item className='userMessage' sx={{ backgroundColor: (theme) => theme.palette.background.userMessage, color: USERMESSAGE_TEXT_COLOR, padding: '10px 15px', borderRadius: '20px', maxWidth: '80%', wordWrap: 'break-word', mt: 1, }}> <Typography variant='body2'>{message}</Typography> </Grid>
       <Grid item sx={{ mt: 1 }}> <Avatar alt={'User Profile Pic'} src={UserAvatar} sx={{ width: 40, height: 40 }} /> </Grid>
    </Grid>
  );
}

export default ChatBody;