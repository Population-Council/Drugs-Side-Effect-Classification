// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/ChatBody.jsx


import React, { useRef, useEffect, useState } from 'react';
import { useCookies } from 'react-cookie';
import { Box, Grid, Avatar, Typography } from '@mui/material';
import Attachment from './Attachment';
import ChatInput from './ChatInput';
import UserAvatar from '../Assets/UserAvatar.svg';
import StreamingResponse from './StreamingResponse';
import createMessageBlock from '../utilities/createMessageBlock';
import { ALLOW_FILE_UPLOAD, ALLOW_VOICE_RECOGNITION, ALLOW_FAQ, USERMESSAGE_TEXT_COLOR, WEBSOCKET_API, ALLOW_CHAT_HISTORY, DISPLAY_SOURCES_BEDROCK_KB } from '../utilities/constants'; // Added DISPLAY_SOURCES_BEDROCK_KB
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
    const { processing, setProcessing } = useProcessing();
    const { selectedRole } = useRole();
    const [message, setMessage] = useState('');
    const [cookies, setCookie] = useCookies(['userMessages']);
    const messagesEndRef = useRef(null);
    const websocket = useRef(null);
    const [isWsConnected, setIsWsConnected] = useState(false);

    // WebSocket Connection Logic (keep as is)
    useEffect(() => {
       if (!WEBSOCKET_API) { console.error("WebSocket API URL is not defined."); return; }
       console.log("Attempting to connect WebSocket...");
       websocket.current = new WebSocket(WEBSOCKET_API);
       websocket.current.onopen = () => { console.log("WebSocket Connected"); setIsWsConnected(true); };
       websocket.current.onclose = () => { console.log("WebSocket Disconnected"); setIsWsConnected(false); setProcessing(false); }; // Also set processing false on close
       websocket.current.onerror = (error) => { console.error("WebSocket Error:", error); setIsWsConnected(false); setProcessing(false); }; // Also set processing false on error
       return () => { if (websocket.current) { console.log("Closing WebSocket connection..."); websocket.current.close(); }};
    }, [setProcessing]); // Added setProcessing dependency as it's used in listeners

    // Scroll Logic (keep as is)
    useEffect(() => { scrollToBottom(); }, [messageList]);
    const scrollToBottom = () => { if (messagesEndRef.current) { messagesEndRef.current.scrollIntoView({ behavior: 'smooth' }); }};

    // Send Message Handler (keep as is)
    const handleSendMessage = (messageToSend) => {
       const trimmedMessage = messageToSend ? messageToSend.trim() : "";
       if (!processing && trimmedMessage && websocket.current && websocket.current.readyState === WebSocket.OPEN) {
           setProcessing(true);
           const timestamp = new Date().toISOString(); // Use ISO string for timestamp consistency
           const newMessageBlock = createMessageBlock(trimmedMessage, 'USER', 'TEXT', 'SENT', "", "", [], timestamp); // Add timestamp
           addMessage(newMessageBlock);
           setQuestionAsked(true);
           const historyToSend = ALLOW_CHAT_HISTORY ? messageList.slice(-20) : []; // Send recent history only
           console.log("History being sent in payload:", JSON.stringify(historyToSend));
           const messagePayload = { action: 'sendMessage', prompt: trimmedMessage, role: selectedRole, history: historyToSend };
           console.log("Sending payload:", JSON.stringify(messagePayload));
           websocket.current.send(JSON.stringify(messagePayload));
       } else if (!trimmedMessage) { console.warn("Attempted to send an empty message.");
       } else if (processing) { console.warn("Processing another request. Please wait.");
       } else if (!websocket.current || websocket.current.readyState !== WebSocket.OPEN) {
           console.error("WebSocket is not connected."); setIsWsConnected(false); setProcessing(false); // Set processing false if WS fails
           // Optionally show an error message to the user
           addMessage(createMessageBlock("Connection error. Please refresh.", "BOT", "TEXT", "SENT"));
       }
    };

    // File Upload Handler (keep as is)
    const handleFileUploadComplete = (file, fileStatus) => { /* ... keep existing logic ... */
        if (!processing) {
             setProcessing(true);
             const timestamp = new Date().toISOString();
             const userMessageBlock = createMessageBlock(`File uploaded: ${file.name}`, 'USER', 'FILE', 'SENT', file.name, fileStatus, [], timestamp);
             addMessage(userMessageBlock);
             const botMessageBlock = createMessageBlock( fileStatus === 'File page limit check succeeded.' ? 'Checking file size...' : fileStatus === 'File size limit exceeded.' ? 'File size limit exceeded. Please upload a smaller file.' : 'Network Error. Please try again later.', 'BOT', 'FILE', 'RECEIVED', file.name, fileStatus, [], timestamp );
             addMessage(botMessageBlock);
             setQuestionAsked(true);
             if (fileStatus !== 'File page limit check succeeded.') { setProcessing(false);
             } else { if (onFileUpload) onFileUpload(file, fileStatus); setProcessing(false); } // Keep processing false here? Or only after actual processing? Review needed if file triggers backend call.
        }
    };

    // FAQ Prompt Click Handler (keep as is)
    const handlePromptClick = (prompt) => { handleSendMessage(prompt); };

    // *** MODIFIED: Callback function to handle stream completion ***
    const handleStreamComplete = (finalText, finalSources, isError, errorMessage = null) => {
        console.log("ChatBody: Stream complete signal received.");
        console.log("ChatBody: Final Text:", finalText);
        console.log("ChatBody: Final Sources:", finalSources);
        console.log("ChatBody: Is Error:", isError);
        console.log("ChatBody: Error Message:", errorMessage);

        // Determine the text to display
        const messageTextToAdd = isError && !finalText
            ? errorMessage || "An error occurred." // Use specific error or default
            : finalText;

        // Add the final message block if there's text or sources, or if it was an error
        if (messageTextToAdd || (finalSources && finalSources.length > 0)) {
             const finalSourcesForBlock = (DISPLAY_SOURCES_BEDROCK_KB && finalSources && finalSources.length > 0) ? finalSources : [];
             const botMessageBlock = createMessageBlock(
                 messageTextToAdd,
                 "BOT",
                 "TEXT",
                 "SENT",
                 "", // fileName
                 "", // fileStatus
                 finalSourcesForBlock,
                 new Date().toISOString() // Add timestamp
             );
             addMessage(botMessageBlock);
        } else {
            console.log("ChatBody: Stream ended with no content/sources to add.");
            // Optionally add a generic message if nothing came back at all?
            // addMessage(createMessageBlock("Response finished.", "BOT", "TEXT", "SENT"));
        }

        // Set processing to false AFTER adding the message
        setProcessing(false);
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
                    // Use a more unique key if possible, combining timestamp and index
                     <Box key={`${msg.sentBy}-${msg.timestamp || index}`} sx={{ mb: 2 }}>
                         {msg.sentBy === 'USER' ? ( <UserReply message={msg.message} />
                         ) : msg.sentBy === 'BOT' && msg.type === 'TEXT' ? ( <BotReply message={msg.message} sources={msg.sources} />
                         ) : msg.sentBy === 'BOT' && msg.type === 'FILE' ? ( <BotFileCheckReply messageId={index} /> // Ensure this component exists and works
                         ) : msg.sentBy === 'BOT' && msg.type === 'SOURCES' ? ( null
                         ) : null}
                    </Box>
                ))}

                 {/* Render StreamingResponse ONLY when processing */}
                 {/* It no longer adds the final message itself */}
                {processing && isWsConnected && (
                    <Box sx={{ mb: 2 }}>
                        <StreamingResponse
                             websocket={websocket.current}
                             onStreamComplete={handleStreamComplete} // Pass the updated callback
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
// You will also need to modify your `StreamingResponse.jsx` component.
// It should now accept the `websocket` instance as a prop and set up its
// `onmessage` listener on that instance instead of potentially creating its own connection.
// It will use the message context (`useMessage`) to add the streamed parts and the final message.