// src/Components/BotReply.jsx
import React, { useState } from 'react';
import { Grid, Box, Typography, IconButton, Tooltip } from '@mui/material';
// React Icons replacements
import { FiCopy, FiThumbsUp, FiCheck } from 'react-icons/fi';
import { LuThumbsDown } from 'react-icons/lu';
import { AiOutlineExport } from 'react-icons/ai';

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

  const handleUp = () => {
    console.log('Thumbs up clicked');
  };

  const handleDown = () => {
    console.log('Thumbs down clicked');
  };

  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start">
      <Grid item xs="auto" sx={{ maxWidth: '100%' }}>
        {/* NO bubble: removed background + border for bot messages */}
        <Box sx={{ p: 0, maxWidth: { xs: '100%', sm: '80%' }, wordWrap: 'break-word' }}>
          {/* Row 1 (avatar + name) intentionally hidden per your last version */}
          {/* <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar alt={`${name} Avatar`} src={BotAvatar} sx={{ width: 28, height: 28, '& .MuiAvatar-img': { objectFit: 'contain' } }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BOTMESSAGE_TEXT_COLOR }}>{name}</Typography>
          </Box> */}

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
        </Box>

        {/* Actions row (outside, under text, left-aligned) */}
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