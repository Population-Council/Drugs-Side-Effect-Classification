import React from 'react';
import { Grid, Box, Avatar, Typography, List, ListItem, Link } from '@mui/material';
import BotAvatar from '../Assets/BotAvatar.svg';
import ReactMarkdown from 'react-markdown';
import { ALLOW_MARKDOWN_BOT, BOTMESSAGE_TEXT_COLOR, DISPLAY_SOURCES_BEDROCK_KB } from '../utilities/constants';

// Helper to get filename (copied from StreamingResponse)
const getFileNameFromUrl = (url = '') => {
  if (!url) return 'source';
  try {
    const lastSlashIndex = url.lastIndexOf('/');
    let fileNameWithQuery = url.substring(lastSlashIndex + 1);
    const queryIndex = fileNameWithQuery.indexOf('?');
    let fileNameOnly = (queryIndex !== -1) ? fileNameWithQuery.substring(0, queryIndex) : fileNameWithQuery;
    return decodeURIComponent(fileNameOnly);
  } catch (e) {
    console.error("Error getting clean filename from URL:", url, e);
    try {
      let fallback = url.substring(url.lastIndexOf('/') + 1);
      const queryIndex = fallback.indexOf('?');
      return (queryIndex !== -1) ? fallback.substring(0, queryIndex) : fallback;
    } catch {
      return 'source';
    }
  }
};

function BotReply({ message, sources, name = 'Tobi' }) {
  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start">
      {/* Single bubble that contains avatar + bold name (row 1) and message (row 2) */}
      <Grid item xs="auto" sx={{ maxWidth: '100%' }}>
        <Box
          sx={{
            backgroundColor: (theme) => theme.palette.background.botMessage,
            borderRadius: 2.5,
            p: 1.5,
            maxWidth: { xs: '100%', sm: '80%' },
            wordWrap: 'break-word'
          }}
        >
          {/* Row 1: avatar + bold name */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar
              alt={`${name} Avatar`}
              src={BotAvatar}
              sx={{ width: 28, height: 28, '& .MuiAvatar-img': { objectFit: 'contain' } }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BOTMESSAGE_TEXT_COLOR }}>
              {name}
            </Typography>
          </Box>

          {/* Row 2: message body */}
          <Box sx={{ mt: 1 }}>
            {ALLOW_MARKDOWN_BOT ? (
              <Typography
                variant="body2"
                component="div"
                color={BOTMESSAGE_TEXT_COLOR}
                sx={{ '& > p': { margin: 0 } }}
              >
                <ReactMarkdown>{message || ''}</ReactMarkdown>
              </Typography>
            ) : (
              <Typography variant="body2" color={BOTMESSAGE_TEXT_COLOR}>
                {message || ''}
              </Typography>
            )}
          </Box>

          {/* Sources (optional) */}
          {DISPLAY_SOURCES_BEDROCK_KB && sources && sources.length > 0 && (
            <List sx={{ mt: 1, p: 0 }}>
              {sources.map((source, index) => (
                <ListItem key={index} sx={{ p: 0, mb: 0.5 }}>
                  <Link
                    href={source.page ? `${source.url}#page=${source.page}` : source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="caption"
                    title={source.url}
                    sx={{
                      display: 'block',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}
                  >
                    {getFileNameFromUrl(source.url)} (Score: {source.score?.toFixed(2) ?? 'N/A'})
                  </Link>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Grid>
    </Grid>
  );
}

export default BotReply;