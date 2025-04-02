// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/Components/ChatBody.jsx

import React, { useRef, useEffect, useState } from 'react';
import { useCookies } from 'react-cookie';
import { Box, Grid, Avatar, Typography } from '@mui/material';
import Attachment from './Attachment';
import ChatInput from './ChatInput';
import UserAvatar from '../Assets/UserAvatar.svg';
import StreamingMessage from './StreamingResponse';
import createMessageBlock from '../utilities/createMessageBlock';
import { ALLOW_FILE_UPLOAD, ALLOW_VOICE_RECOGNITION, ALLOW_FAQ, USERMESSAGE_TEXT_COLOR, WEBSOCKET_API, ALLOW_CHAT_HISTORY } from '../utilities/constants'; // <<< Added WEBSOCKET_API, ALLOW_CHAT_HISTORY
import BotFileCheckReply from './BotFileCheckReply';
import SpeechRecognitionComponent from './SpeechRecognition';
import { FAQExamples } from './index';
import { useMessage } from '../contexts/MessageContext';
import { useQuestion } from '../contexts/QuestionContext';
import { useProcessing } from '../contexts/ProcessingContext';
import BotReply from './BotReply';
import { useRole } from '../contexts/RoleContext'; // <<< *** IMPORT useRole HOOK ***

function ChatBody({ onFileUpload, showLeftNav, setLeftNav }) {
  const { messageList, addMessage } = useMessage();
  const { questionAsked, setQuestionAsked } = useQuestion();
  const { processing, setProcessing } = useProcessing();
  const { selectedRole } = useRole(); // <<< *** GET SELECTED ROLE FROM CONTEXT ***
  const [message, setMessage] = useState(''); // Input state for SpeechRecognition
  const [cookies, setCookie] = useCookies(['userMessages']);
  const messagesEndRef = useRef(null);
  const websocket = useRef(null); // <<< *** ADD WebSocket ref ***
  const [isWsConnected, setIsWsConnected] = useState(false); // <<< Track WS connection state

  // State removed as StreamingMessage handles its own display logic now
  // const [activeQuery, setActiveQuery] = useState(null);

  // --- WebSocket Connection Logic ---
  useEffect(() => {
    if (!WEBSOCKET_API) {
      console.error("WebSocket API URL is not defined. Please check your environment variables.");
      // Optionally, display an error to the user
      return;
    }

    console.log("Attempting to connect WebSocket...");
    websocket.current = new WebSocket(WEBSOCKET_API);

    websocket.current.onopen = () => {
      console.log("WebSocket Connected");
      setIsWsConnected(true);
    };

    websocket.current.onclose = () => {
      console.log("WebSocket Disconnected");
      setIsWsConnected(false);
      setProcessing(false); // Stop processing if connection drops
      // Implement reconnection logic if desired
    };

    websocket.current.onerror = (error) => {
      console.error("WebSocket Error:", error);
      setIsWsConnected(false);
      setProcessing(false);
      // Optionally display an error message
    };

    // Handle incoming messages (delegated to StreamingMessage component now)
    // websocket.current.onmessage = (event) => { ... }; // This logic is likely inside StreamingMessage

    // Cleanup on unmount
    return () => {
      if (websocket.current) {
        console.log("Closing WebSocket connection...");
        websocket.current.close();
      }
    };
  }, []); // Run only once on mount

  // --- Scroll Logic ---
  useEffect(() => {
    scrollToBottom();
  }, [messageList]); // Scroll when list changes

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // --- Send Message Handler ---
  const handleSendMessage = (messageToSend) => {
    const trimmedMessage = messageToSend ? messageToSend.trim() : "";

    // Check conditions: not processing, message exists, WebSocket connected
    if (!processing && trimmedMessage && websocket.current && websocket.current.readyState === WebSocket.OPEN) {
      setProcessing(true); // Disable input immediately
      const timestamp = new Date().toISOString();

      // Add user message to UI
      const newMessageBlock = createMessageBlock(trimmedMessage, 'USER', 'TEXT', 'SENT', null, timestamp);
      addMessage(newMessageBlock);
      setQuestionAsked(true); // Hide FAQ examples

      // Prepare payload for WebSocket
      const messagePayload = {
        action: 'sendMessage', // Matches backend routeKey
        prompt: trimmedMessage,
        role: selectedRole, // <<< *** INCLUDE SELECTED ROLE ***
        // Include history if enabled and needed by backend
        history: ALLOW_CHAT_HISTORY ? messageList : []
      };

      console.log("Sending payload:", JSON.stringify(messagePayload));

      // Send the message via WebSocket
      websocket.current.send(JSON.stringify(messagePayload));

      // --- NOTE ---
      // The 'StreamingMessage' component should now be listening for the response
      // triggered by this send action. We no longer need 'activeQuery' state here
      // to pass the query down, as StreamingMessage listens independently.
      // setActiveQuery(trimmedMessage); // <<< REMOVED / NO LONGER NEEDED HERE

    } else if (!trimmedMessage) {
       console.warn("Attempted to send an empty message.");
       // Optionally show helper text via ChatInput state if needed
    } else if (processing) {
        console.warn("Processing another request. Please wait.");
    } else if (!websocket.current || websocket.current.readyState !== WebSocket.OPEN) {
        console.error("WebSocket is not connected. Cannot send message.");
        // Optionally, display an error to the user or attempt reconnection
        setIsWsConnected(false); // Update connection status state
    }
  };

  // --- File Upload Handler (Keep as is or adjust based on backend expectations) ---
  const handleFileUploadComplete = (file, fileStatus) => {
    // This function currently only adds local messages for feedback.
    // If uploading a file should trigger a backend analysis/query via WebSocket,
    // you would need to add similar logic to handleSendMessage here,
    // potentially sending a different 'action' or payload structure.
    if (!processing) {
        setProcessing(true); // Set processing for file handling feedback
        const userMessageBlock = createMessageBlock(
            `File uploaded: ${file.name}`, 'USER', 'FILE', 'SENT', file.name, fileStatus, [], new Date().toISOString()
        );
        addMessage(userMessageBlock);
        // Add bot's file check reply immediately
        const botMessageBlock = createMessageBlock(
            fileStatus === 'File page limit check succeeded.' ? 'Checking file size...' :
            fileStatus === 'File size limit exceeded.' ? 'File size limit exceeded. Please upload a smaller file.' :
            'Network Error. Please try again later.',
            'BOT', 'FILE', 'RECEIVED', file.name, fileStatus, [], new Date().toISOString()
        );
        addMessage(botMessageBlock);
        setQuestionAsked(true);

        if (fileStatus !== 'File page limit check succeeded.') {
            setProcessing(false); // Re-enable input if file failed checks immediately
        } else {
            // If successful, decide next step. Maybe wait for user prompt?
            if (onFileUpload) onFileUpload(file, fileStatus); // Propagate if needed
            // TEMPORARILY set processing false. Adjust if upload should trigger analysis.
            setProcessing(false);
        }
    }
  };

  // --- FAQ Prompt Click Handler ---
  const handlePromptClick = (prompt) => {
    handleSendMessage(prompt);
  };


  // --- Component Rendering ---
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        margin: 0,
        padding: '0 1rem', // Add some horizontal padding
      }}
    >
      {/* Messages Area */}
      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          mb: 1,
          pr: 1
        }}
      >
        {/* FAQ rendering logic */}
        <Box sx={{ display: ALLOW_FAQ && !questionAsked ? 'flex' : 'none' }}>
           <FAQExamples onPromptClick={handlePromptClick} />
        </Box>

        {/* Display existing messages from the list */}
        {messageList.map((msg, index) => (
          <Box key={`${msg.sentBy}-${index}-${msg.timestamp || index}`} sx={{ mb: 2 }}> {/* Better key */}
            {msg.sentBy === 'USER' ? (
                <UserReply message={msg.message} />
            ) : msg.sentBy === 'BOT' && msg.type === 'TEXT' ? (
                // Use BotReply for completed BOT TEXT messages
                <BotReply message={msg.message} sources={msg.sources} />
            ) : msg.sentBy === 'BOT' && msg.type === 'FILE' ? (
                // Handle BOT FILE messages (like file check status)
                 <BotFileCheckReply messageId={index} /> // Assumes this component reads from context
            ) : msg.sentBy === 'BOT' && msg.type === 'SOURCES' ? (
                // Ignore SOURCES type messages here; handled by BotReply
                null
            ) : null /* Handle other types if needed */ }
          </Box>
        ))}

        {/* Conditionally render StreamingResponse when processing a query */}
        {/* StreamingMessage now needs the WebSocket ref to listen */}
        {processing && isWsConnected && ( // Only render if processing AND connected
            <Box sx={{ mb: 2 }}>
              <StreamingMessage websocket={websocket.current} /> {/* Pass WS instance */}
            </Box>
        )}

        {/* Invisible div to scroll to */}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input Area */}
      <Box
        sx={{
          display: 'flex',
          flexShrink: 0,
          alignItems: 'flex-end', // Align items to bottom
          pb: 1, // Padding bottom for spacing
          pl: { xs: 0, md: 1 }, // Padding left, adjust for mobile if needed
          pr: { xs: 0, md: 1 }, // Padding right
          width: '100%'
        }}
      >
        {/* Optional Voice Input Button */}
        <Box sx={{ display: ALLOW_VOICE_RECOGNITION ? 'flex' : 'none', alignSelf: 'center', mb: 1 }}>
          <SpeechRecognitionComponent setMessage={setMessage} getMessage={() => message} />
        </Box>
         {/* Optional File Upload Button */}
        <Box sx={{ display: ALLOW_FILE_UPLOAD ? 'flex' : 'none', alignSelf: 'center', mb: 1 }}>
          <Attachment onFileUploadComplete={handleFileUploadComplete} />
        </Box>
        {/* Main Chat Input Component */}
        <Box sx={{ width: '100%', ml: (ALLOW_FILE_UPLOAD || ALLOW_VOICE_RECOGNITION) ? 1 : 0 }}>
          {/* Pass the actual handleSendMessage function down */}
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

// --- UserReply Component (Keep as is) ---
function UserReply({ message }) {
  return (
    <Grid container direction='row' justifyContent='flex-end' alignItems='flex-start' spacing={1}>
      {/* Message Bubble */}
      <Grid
        item
        className='userMessage' // Keep class for potential global styling
        sx={{
          backgroundColor: (theme) => theme.palette.background.userMessage,
          color: USERMESSAGE_TEXT_COLOR, // Use constant
          padding: '10px 15px', // Consistent padding
          borderRadius: '20px', // Consistent rounding
          maxWidth: '80%', // Max width for bubble
          wordWrap: 'break-word', // Ensure long words break
          mt: 1, // Add consistent margin top
        }}
      >
        <Typography variant='body2'>{message}</Typography>
      </Grid>
        {/* Avatar */}
      <Grid item sx={{ mt: 1 }}> {/* Align avatar top with message margin top */}
        <Avatar
          alt={'User Profile Pic'}
          src={UserAvatar}
          sx={{ width: 40, height: 40 }}
        />
      </Grid>
    </Grid>
  );
}


export default ChatBody;

// --- IMPORTANT ---
// You will also need to modify your `StreamingMessage.jsx` component.
// It should now accept the `websocket` instance as a prop and set up its
// `onmessage` listener on that instance instead of potentially creating its own connection.
// It will use the message context (`useMessage`) to add the streamed parts and the final message.