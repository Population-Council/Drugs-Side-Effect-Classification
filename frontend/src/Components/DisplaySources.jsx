// File: DisplaySources.jsx
import React from "react";
import { List, ListItem, Link, Typography } from "@mui/material";
import { BOTMESSAGE_TEXT_COLOR } from "../utilities/constants";

const DisplaySources = ({ sources }) => {
  return (
    <>
      {sources.length > 0 && (
        <div
          style={{
            backgroundColor: (theme) => theme.palette.background.botMessage,
            padding: '10px',
            borderRadius: '8px',
          }}
        >
          <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} gutterBottom>
            Relevant research papers:
          </Typography>
          <List>
            {sources.map((source, index) => (
              <ListItem key={index} disableGutters>
                <Link href={source.url} target="_blank" rel="noopener">
                  {`Paper ${index + 1}: Score - ${source.score}`}
                </Link>
              </ListItem>
            ))}
          </List>
        </div>
      )}
    </>
  );
};

export default DisplaySources;
