import React, { useState } from 'react';
import { Grid, Box, Avatar, Typography, IconButton, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import BotAvatar from '../Assets/BotAvatar.svg';
import ReactMarkdown from 'react-markdown';
import { ALLOW_MARKDOWN_BOT, BOTMESSAGE_TEXT_COLOR } from '../utilities/constants';

function BotReply({ message, name = 'Tobi', isLast = false }) {
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message || '');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const handleThumbUp = () => {
    // Clickable only for now
    console.log('Thumbs up clicked');
  };

  const handleThumbDown = () => {
    // Clickable only for now
    console.log('Thumbs down clicked');
  };

  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start">
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

          {/* Actions bar (only on the last bot bubble) */}
          {isLast && (
            <Box
              sx={{
                mt: 1,
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 0.5
              }}
            >
              <Tooltip title={copySuccess ? 'Copied' : 'Copy'}>
                <IconButton size="small" onClick={handleCopy}>
                  {copySuccess ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Thumbs up">
                <IconButton size="small" onClick={handleThumbUp}>
                  <ThumbUpOffAltIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Thumbs down">
                <IconButton size="small" onClick={handleThumbDown}>
                  <ThumbDownOffAltIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>
      </Grid>
    </Grid>
  );
}

export default BotReply;