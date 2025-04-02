// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/ChatBody.jsx

import React, { useRef, useEffect, useState } from 'react';
import { useCookies } from 'react-cookie';
import { Box, Grid, Avatar, Typography } from '@mui/material';
import Attachment from './Attachment';
import ChatInput from './ChatInput';
import UserAvatar from '../Assets/UserAvatar.svg';
// *** Corrected import name potentially ***
// Ensure the component file is actually named StreamingMessage.jsx if using this name
import StreamingMessage from './StreamingMessage'; // Corrected import name
import createMessageBlock from '../utilities/createMessageBlock';
import { ALLOW_FILE_UPLOAD, ALLOW_VOICE_RECOGNITION, ALLOW_FAQ, USERMESSAGE_TEXT_COLOR, WEBSOCKET_API, ALLOW_CHAT_HISTORY } from '../utilities/constants';
import BotFileCheckReply from './BotFileCheckReply';
import SpeechRecognitionComponent from './SpeechRecognition';
import { FAQExamples } from './index';
import { useMessage } from '../contexts/MessageContext';
import { useQuestion } from '../contexts/QuestionContext';
import { useProcessing } from '../contexts/ProcessingContext';
import BotReply from './BotReply';
import { useRole } from '../contexts/RoleContext';

function ChatBody({ onFileUpload, showLeftNav, setLeftNav }) {
    const { messageList, addMessage } = useMessage();
    const { questionAsked, setQuestionAsked } = useQuestion();
    const { processing, setProcessing } = useProcessing(); // Get setProcessing here
    const { selectedRole } = useRole();
    const [message, setMessage] = useState('');
    const [cookies, setCookie] = useCookies(['userMessages']);
    const messagesEndRef = useRef(null);
    const websocket = useRef(null);
    const [isWsConnected, setIsWsConnected] = useState(false);

    // --- WebSocket Connection Logic (keep as is) ---
    useEffect(() => {
       if (!WEBSOCKET_API) {
            console.error("WebSocket API URL is not defined.");
            return;
        }
        console.log("Attempting to connect WebSocket...");
        websocket.current = new WebSocket(WEBSOCKET_API);
        websocket.current.onopen = () => { console.log("WebSocket Connected"); setIsWsConnected(true); };
        websocket.current.onclose = () => { console.log("WebSocket Disconnected"); setIsWsConnected(false); setProcessing(false); };
        websocket.current.onerror = (error) => { console.error("WebSocket Error:", error); setIsWsConnected(false); setProcessing(false); };
        return () => { if (websocket.current) { console.log("Closing WebSocket connection..."); websocket.current.close(); }};
    }, []);

    // --- Scroll Logic (keep as is) ---
    useEffect(() => { scrollToBottom(); }, [messageList]);
    const scrollToBottom = () => { if (messagesEndRef.current) { messagesEndRef.current.scrollIntoView({ behavior: 'smooth' }); }};

    // --- Send Message Handler (keep as is) ---
    const handleSendMessage = (messageToSend) => {
        const trimmedMessage = messageToSend ? messageToSend.trim() : "";
        if (!processing && trimmedMessage && websocket.current && websocket.current.readyState === WebSocket.OPEN) {
            setProcessing(true);
            const timestamp = new Date().toISOString();
            const newMessageBlock = createMessageBlock(trimmedMessage, 'USER', 'TEXT', 'SENT', null, timestamp);
            addMessage(newMessageBlock);
            setQuestionAsked(true);
            const historyToSend = ALLOW_CHAT_HISTORY ? messageList : [];
            console.log("History state right before sending:", JSON.stringify(messageList));
            console.log("History being sent in payload:", JSON.stringify(historyToSend));
            const messagePayload = { action: 'sendMessage', prompt: trimmedMessage, role: selectedRole, history: historyToSend };
            console.log("Sending payload:", JSON.stringify(messagePayload));
            websocket.current.send(JSON.stringify(messagePayload));
        } else if (!trimmedMessage) { console.warn("Attempted to send an empty message.");
        } else if (processing) { console.warn("Processing another request. Please wait.");
        } else if (!websocket.current || websocket.current.readyState !== WebSocket.OPEN) { console.error("WebSocket is not connected."); setIsWsConnected(false); }
    };

    // --- File Upload Handler (keep as is) ---
    const handleFileUploadComplete = (file, fileStatus) => { /* ... keep existing logic ... */
       if (!processing) {
            setProcessing(true); // Set processing for file handling feedback
            const userMessageBlock = createMessageBlock( `File uploaded: ${file.name}`, 'USER', 'FILE', 'SENT', file.name, fileStatus, [], new Date().toISOString() );
            addMessage(userMessageBlock);
            const botMessageBlock = createMessageBlock( fileStatus === 'File page limit check succeeded.' ? 'Checking file size...' : fileStatus === 'File size limit exceeded.' ? 'File size limit exceeded. Please upload a smaller file.' : 'Network Error. Please try again later.', 'BOT', 'FILE', 'RECEIVED', file.name, fileStatus, [], new Date().toISOString() );
            addMessage(botMessageBlock);
            setQuestionAsked(true);
            if (fileStatus !== 'File page limit check succeeded.') { setProcessing(false);
            } else { if (onFileUpload) onFileUpload(file, fileStatus); setProcessing(false); }
        }
     };

    // --- FAQ Prompt Click Handler (keep as is) ---
    const handlePromptClick = (prompt) => { handleSendMessage(prompt); };

    // *** Define the callback function ***
    const handleStreamComplete = () => {
        console.log("ChatBody: Stream complete signal received. Setting processing to false.");
        setProcessing(false); // Re-enable input now
    };

    // --- Component Rendering ---
    return (
        <Box sx={{ /* ... styles ... */
            display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
            overflow: 'hidden', margin: 0, padding: '0 1rem',
         }}>
            {/* Messages Area */}
            <Box sx={{ /* ... styles ... */
                flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', mb: 1, pr: 1
             }}>
                {/* FAQ rendering */}
                <Box sx={{ display: ALLOW_FAQ && !questionAsked ? 'flex' : 'none' }}>
                   <FAQExamples onPromptClick={handlePromptClick} />
                </Box>

                {/* Display existing messages */}
                {messageList.map((msg, index) => (
                    <Box key={`${msg.sentBy}-${index}-${msg.timestamp || index}`} sx={{ mb: 2 }}>
                        {msg.sentBy === 'USER' ? ( <UserReply message={msg.message} />
                        ) : msg.sentBy === 'BOT' && msg.type === 'TEXT' ? ( <BotReply message={msg.message} sources={msg.sources} />
                        ) : msg.sentBy === 'BOT' && msg.type === 'FILE' ? ( <BotFileCheckReply messageId={index} />
                        ) : msg.sentBy === 'BOT' && msg.type === 'SOURCES' ? ( null
                        ) : null}
                    </Box>
                ))}

                {/* Conditionally render StreamingMessage */}
                {processing && isWsConnected && (
                    <Box sx={{ mb: 2 }}>
                        {/* *** Pass the callback prop *** */}
                        <StreamingMessage
                            websocket={websocket.current}
                            onStreamComplete={handleStreamComplete}
                        />
                    </Box>
                )}

                {/* Scroll div */}
                <div ref={messagesEndRef} />
            </Box>

            {/* Input Area */}
            <Box sx={{ /* ... styles ... */
                display: 'flex', flexShrink: 0, alignItems: 'flex-end', pb: 1,
                pl: { xs: 0, md: 1 }, pr: { xs: 0, md: 1 }, width: '100%'
             }}>
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
                    />
                </Box>
            </Box>
        </Box>
    );
}

// --- UserReply Component (keep as is) ---
function UserReply({ message }) { /* ... component code ... */
 return (
    <Grid container direction='row' justifyContent='flex-end' alignItems='flex-start' spacing={1}>
      <Grid item className='userMessage' sx={{ backgroundColor: (theme) => theme.palette.background.userMessage, color: USERMESSAGE_TEXT_COLOR, padding: '10px 15px', borderRadius: '20px', maxWidth: '80%', wordWrap: 'break-word', mt: 1, }}> <Typography variant='body2'>{message}</Typography> </Grid>
      <Grid item sx={{ mt: 1 }}> <Avatar alt={'User Profile Pic'} src={UserAvatar} sx={{ width: 40, height: 40 }} /> </Grid>
    </Grid>
  );
 }

export default ChatBody;
// --- IMPORTANT ---
// You will also need to modify your `StreamingMessage.jsx` component.
// It should now accept the `websocket` instance as a prop and set up its
// `onmessage` listener on that instance instead of potentially creating its own connection.
// It will use the message context (`useMessage`) to add the streamed parts and the final message.