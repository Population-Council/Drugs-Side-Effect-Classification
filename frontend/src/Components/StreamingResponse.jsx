import React, { useState, useEffect, useRef } from "react";
import { Grid, Avatar, Typography } from "@mui/material";
import BotAvatar from "../Assets/BotAvatar.svg";
import LoadingAnimation from "../Assets/loading_animation.gif"; // Import the loading animation
import { ALLOW_CHAT_HISTORY, WEBSOCKET_API, ALLOW_MARKDOWN_BOT } from "../utilities/constants";
import { useMessage } from "../contexts/MessageContext";
import createMessageBlock from "../utilities/createMessageBlock";
import ReactMarkdown from "react-markdown";
import { BOTMESSAGE_TEXT_COLOR } from "../utilities/constants";
import {List, ListItem, Link } from "@mui/material";

const StreamingMessage = ({ initialMessage, processing, setProcessing }) => {
  const [responses, setResponses] = useState([]);
  const [showLoading, setShowLoading] = useState(true); // State to handle loading animation
  const ws = useRef(null);
  const messageBuffer = useRef("");
  const { messageList, addMessage } = useMessage();
  const [sources, setSources] = useState([]);



  useEffect(() => {
    ws.current = new WebSocket(WEBSOCKET_API);

    ws.current.onopen = () => {
      console.log("WebSocket Connected");
      ws.current.send(
        JSON.stringify({
          action: "sendMessage",
          prompt: initialMessage,
          history: ALLOW_CHAT_HISTORY ? messageList : [],
        })
      );
      console.log("Initial message sent to bot");
      console.log("Message list: ", messageList);
    };

    ws.current.onmessage = (event) => {
      try {
        messageBuffer.current += event.data;
        const parsedData = JSON.parse(messageBuffer.current);

        if (parsedData.type === "end") {
          setProcessing(false);
          console.log("End of conversation");
        }

        if (parsedData.type === "delta") {
          setResponses((prev) => [...prev, parsedData.text]);

          // Hide the loading animation once the first response hits
          if (showLoading) {
            setShowLoading(false);
          }
        }
        if(parsedData.type === "sources") {
          setSources(parsedData.sources);
          const sourcesMessage = parsedData.sources.map((source, index) => `Paper ${index + 1}: ${source}`).join("\n");
          const sourcesMessageBlock = createMessageBlock(
            sourcesMessage,
            "BOT",
            "SOURCES",
            "SENT"
          );
          addMessage(sourcesMessageBlock);
          console.log("Sources message added to message list");
          console.log("Message list with sources(hopefully): ", messageList);
        
        }

        messageBuffer.current = "";
      } catch (e) {
        if (e instanceof SyntaxError) {
          console.log("Received incomplete JSON, waiting for more data...");
        } else {
          console.error("Error processing message: ", e);
          messageBuffer.current = "";
        }
      }
    };

    ws.current.onerror = (error) => {
      console.log("WebSocket Error: ", error);
    };

    ws.current.onclose = (event) => {
      if (event.wasClean) {
        console.log(
          `WebSocket closed cleanly, code=${event.code}, reason=${event.reason}`
        );
      } else {
        console.log("WebSocket Disconnected unexpectedly");
      }
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [initialMessage, setProcessing]);

  useEffect(() => {
    if (!processing) {
      const finalMessage = responses.join("");
      const botMessageBlock = createMessageBlock(
        finalMessage,
        "BOT",
        "TEXT",
        "SENT"
      );
      addMessage(botMessageBlock);
      console.log("Bot message added to message list");
      console.log("Message list: ", messageList);
    }
  }, [processing]);



  return (
    <>
      {/* Primary message container */}
      <Grid container direction="row" justifyContent="flex-start" alignItems="flex-end">
        <Grid item>
          {/* Avatar (bot image) */}
          <Avatar
            alt="Bot Avatar"
            src={BotAvatar}
            sx={{
              width: 40,
              height: 40,
              '& .MuiAvatar-img': {
                objectFit: 'contain',
                p: 1,
              },
            }}
          />
        </Grid>

        <Grid
          item
          className="botMessage"
          mt={1}
          sx={{
            backgroundColor: (theme) => theme.palette.background.botMessage,
          }}
        >
          {processing ? (
            showLoading ? (
              <img src={LoadingAnimation} alt="Loading..." style={{ width: '50px', marginTop: '10px' }} />
            ) : (
              ALLOW_MARKDOWN_BOT ? (
                <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR}>
                  <ReactMarkdown>{responses.join("")}</ReactMarkdown>
                </Typography>
              ) : (
                <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR}>
                  {responses.join("")}
                </Typography>
              )
            )
          ) : (
            ALLOW_MARKDOWN_BOT ? (
              <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR}>
                <ReactMarkdown>{responses.join("")}</ReactMarkdown>
              </Typography>
            ) : (
              <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR}>
                {responses.join("")}
              </Typography>
            )
          )}
        </Grid>
      </Grid>

      {/* Research papers container, aligned with message block */}
      {sources.length > 0 && (
        <Grid
          container
          justifyContent="flex-start"
          mt={1}
          sx={{
            paddingLeft: '40px', // Adjust left padding to align with the main message container
          }}
        >
          <Grid
            item
            className="botMessage"
            sx={{
              backgroundColor: (theme) => theme.palette.background.botMessage,
            }}
          >
            <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} gutterBottom>
              Relevant research papers:
            </Typography>
            <List>
              {sources.map((source, index) => (
                <ListItem key={index} disableGutters>
                  <Link href={source} target="_blank" rel="noopener">
                    {`Paper ${index + 1}`}
                  </Link>
                </ListItem>
              ))}
            </List>
          </Grid>
        </Grid>
      )}
    </>
  );
};

export default StreamingMessage;
