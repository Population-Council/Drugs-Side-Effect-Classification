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

  const textStyles = {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    maxWidth: { xs: '85%', md: '70%' }, // align with user bubble width
    // Link styling (visited/unvisited same color + dotted underline)
    '& a, & a:visited': {
      color: 'inherit',
      textDecoration: 'none',
      borderBottom: '1px dotted currentColor',
    },
    '& a:hover, & a:focus': {
      borderBottomStyle: 'solid',
      outline: 'none',
    },
    // Markdown safety
    '& pre': { whiteSpace: 'pre-wrap', overflowX: 'auto', maxWidth: '100%' },
    '& code': { wordBreak: 'break-word' },
    '& table': { display: 'block', width: '100%', overflowX: 'auto' },
    '& img, & video': { maxWidth: '100%', height: 'auto' },
    '& > p': { margin: 0 },
  };

  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start">
      <Grid item xs sx={{ minWidth: 0, maxWidth: '100%' }}>
        {/* No bubble for bot; constrain width and ensure wrapping */}
        <Box sx={{ p: 0 }}>
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

        {/* Actions row */}
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