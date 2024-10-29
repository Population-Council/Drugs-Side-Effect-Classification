// StreamingMessage.js
import React, { useState, useEffect, useRef } from "react";
import { Grid, Avatar, Typography, List, ListItem, Link, IconButton, Tooltip } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import BotAvatar from "../Assets/BotAvatar.svg";
import LoadingAnimation from "../Assets/loading_animation.gif"; // Import the loading animation
import { ALLOW_CHAT_HISTORY, WEBSOCKET_API, ALLOW_MARKDOWN_BOT, DISPLAY_SOURCES_BEDROCK_KB, BOTMESSAGE_TEXT_COLOR } from "../utilities/constants";
import { useMessage } from "../contexts/MessageContext";
import createMessageBlock from "../utilities/createMessageBlock";
import ReactMarkdown from "react-markdown";
import { useProcessing } from '../contexts/ProcessingContext';

const StreamingMessage = ({ initialMessage }) => {
  const [responses, setResponses] = useState([]);
  const [showLoading, setShowLoading] = useState(true); // State to handle loading animation
  const ws = useRef(null);
  const messageBuffer = useRef("");
  const { messageList, addMessage } = useMessage();
  const [sources, setSources] = useState([]);
  const [copySuccess, setCopySuccess] = useState(false);
  const { processing, setProcessing } = useProcessing();

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
        if (parsedData.type === "sources") {
          setSources(parsedData.sources);
          console.log("Sources received: ", parsedData.sources);

          const sourcesMessage = parsedData.sources
            .map((source) => `${getFileNameFromUrl(source.url)} (Score: ${source.score}): ${source.url}`)
            .join("\n");

          const sourcesMessageBlock = createMessageBlock(
            sourcesMessage,
            "BOT",
            "SOURCES",
            "SENT"
          );

          addMessage(sourcesMessageBlock);
          console.log("Sources message added to message list");
          console.log("Message list with sources (hopefully): ", messageList);
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

  const getFileNameFromUrl = (url) => {
    return url.substring(url.lastIndexOf("/") + 1);
  };

  const handleCopyToClipboard = () => {
    const textToCopy = `${responses.join("")}${sources.length > 0 ? "\n\nSources:\n" + sources.map((source) => `${getFileNameFromUrl(source.url)} (Score: ${source.score}): ${source.url}`).join("\n") : ""}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      console.log("Message copied to clipboard");
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    }).catch((err) => {
      console.error("Failed to copy: ", err);
    });
  };

  return (
    <>
      {/* Primary message container */}
      <Grid container direction="row" justifyContent="flex-start" alignItems="flex-end">
        <Grid item>
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
            position: "relative",
          }}
        >
          {!processing && (
            <Tooltip title={copySuccess ? "Message copied" : "Copy message to clipboard"}>
              <IconButton
                size="small"
                onClick={handleCopyToClipboard}
                sx={{ position: "absolute", top: 0, right: 0 }}
              >
                {copySuccess ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
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
          {DISPLAY_SOURCES_BEDROCK_KB && sources.length > 0 && (
            <List sx={{ mt: 2 }}>
              {sources.map((source, index) => (
                <ListItem key={index}>
                  <Link href={`${source.url}#page=${source.page}`} target="_blank" rel="noopener">
                    {getFileNameFromUrl(source.url)} (Score: {source.score})
                  </Link>
                </ListItem>
              ))}
            </List>
          )}
        </Grid>
      </Grid>
    </>
  );
};

export default StreamingMessage;
