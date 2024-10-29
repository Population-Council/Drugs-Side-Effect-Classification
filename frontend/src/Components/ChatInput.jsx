import React, { useState, useEffect } from "react";
import { TextField, Grid, IconButton } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import { useLanguage } from "../contexts/LanguageContext";
import { TEXT } from "../utilities/constants";
import { useTranscript } from "../contexts/TranscriptContext";
import InputAdornment from '@mui/material/InputAdornment';
import { useProcessing } from '../contexts/ProcessingContext';

function ChatInput({ onSendMessage }) {
  const [message, setMessage] = useState("");
  const [helperText, setHelperText] = useState("");
  const { language } = useLanguage();
  const { transcript, setTranscript, isListening } = useTranscript();
  const { processing } = useProcessing();
  const [isMultilineAllowed, setIsMultilineAllowed] = useState(true); // State to track multiline

  useEffect(() => {
    if (!isListening && transcript) {
      setMessage(prevMessage => prevMessage ? `${prevMessage} ${transcript}` : transcript);
      setTranscript(""); // Clear the transcript buffer
    }
  }, [isListening, transcript, setTranscript]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1000) {
        setIsMultilineAllowed(false); // Disable multiline for small screens
      } else {
        setIsMultilineAllowed(true); // Enable multiline for larger screens
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []); 

  const handleTyping = (event) => {
    if (helperText) {
      setHelperText("");
    }
    setMessage(event.target.value);
  };

  const handleSendMessage = () => {
    if (message.trim() !== "") {
      onSendMessage(message);
      setMessage("");
    } else {
      setHelperText(TEXT[language].HELPER_TEXT);
    }
  };

  const getMessage = (message, transcript, isListening) => {
    if (isListening) {
      if (transcript.length) {
        return message.length ? `${message} ${transcript}` : transcript;
      }
    }
    return message;
  };

  return (
    <Grid container item className="sendMessageContainer">
      <TextField
        className="sendMessageContainer"
        multiline={isMultilineAllowed} // Dynamically allow/disallow multiline
        maxRows={8}
        fullWidth
        disabled={isListening} // Disable input while listening for voice input
        placeholder={TEXT[language].CHAT_INPUT_PLACEHOLDER}
        id="USERCHATINPUT"
        value={getMessage(message, transcript, isListening)} // Handle the message input value
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !processing) {
            e.preventDefault(); 
            handleSendMessage(); 
          }
        }}
        onChange={handleTyping}
        helperText={isListening ? TEXT[language].SPEECH_RECOGNITION_HELPER_TEXT : helperText} // Helper text based on current state
        sx={{ "& fieldset": { border: "none" } }} 
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label="send"
                disabled={processing || isListening} // Disable send button while processing or listening
                onClick={handleSendMessage} // Trigger message send on click
                color={message.trim() !== "" ? "primary" : "default"} // Change button color based on message content
              >
                <SendIcon />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    </Grid>
  );
}

export default ChatInput;
