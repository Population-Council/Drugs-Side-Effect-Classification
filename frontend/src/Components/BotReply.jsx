// src/Components/BotReply.jsx
import React, { useState } from 'react';
import { Grid, Box, Typography, IconButton, Tooltip } from '@mui/material';
import { FiCopy, FiThumbsUp, FiCheck } from 'react-icons/fi';
import { LuThumbsDown } from 'react-icons/lu';
import ReactMarkdown from 'react-markdown';
import { ALLOW_MARKDOWN_BOT, BOTMESSAGE_TEXT_COLOR } from '../utilities/constants';

function BotReply({ message, name = 'Tobi' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const handleUp = () => console.log('Thumbs up clicked');
  const handleDown = () => console.log('Thumbs down clicked');

  // Shared text wrapping styles so nothing overflows horizontally
  const textStyles = {
    whiteSpace: 'pre-wrap',        // keep newlines, allow wrapping
    overflowWrap: 'anywhere',      // break long URLs/tokens
    wordBreak: 'break-word',       // fallback
    '& pre': {                     // markdown code blocks
      whiteSpace: 'pre-wrap',
      overflowX: 'auto',
      maxWidth: '100%',
    },
    '& code': {
      wordBreak: 'break-word',
    },
    '& a': {
      wordBreak: 'break-all',
    },
    '& table': {                   // wide tables scroll instead of overflow
      display: 'block',
      width: '100%',
      overflowX: 'auto',
    },
    '& img, & video': {            // responsive media
      maxWidth: '100%',
      height: 'auto',
    },
    '& > p': { margin: 0 },        // tighten default p spacing if desired
  };

  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start">
      <Grid
        item
        xs
        // minWidth: 0 is crucial so this flex child can shrink within the row
        sx={{ minWidth: 0, maxWidth: '100%' }}
      >
        {/* No bubble background for bot; constrain width like the user bubble */}
        <Box sx={{ p: 0, maxWidth: { xs: '85%', md: '70%' } }}>
          {/* Message body */}
          <Box sx={{ mt: 1 }}>
            {ALLOW_MARKDOWN_BOT ? (
              <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} sx={textStyles}>
                <ReactMarkdown>{message || ''}</ReactMarkdown>
              </Typography>
            ) : (
              <Typography variant="body2" color={BOTMESSAGE_TEXT_COLOR} sx={textStyles}>
                {message || ''}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Actions row (under text, left-aligned) */}
        <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'flex-start', gap: 0.5 }}>
          <Tooltip title={copied ? 'Copied' : 'Copy'}>
            <IconButton size="small" onClick={handleCopy} aria-label="Copy message">
              {copied ? <FiCheck size={16} /> : <FiCopy size={16} />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Thumbs up">
            <IconButton size="small" onClick={handleUp} aria-label="Thumbs up">
              <FiThumbsUp size={16} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Thumbs down">
            <IconButton size="small" onClick={handleDown} aria-label="Thumbs down">
              <LuThumbsDown size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      </Grid>
    </Grid>
  );
}

export default BotReply;