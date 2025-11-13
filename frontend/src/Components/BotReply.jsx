// BotReply.jsx
import React, { useState, useMemo, useRef } from 'react';
import {
  Grid, Box, Typography, IconButton, Tooltip,
  Popover, Button, TextField, Stack
} from '@mui/material';
import { FiCopy, FiThumbsUp, FiCheck } from 'react-icons/fi';
import { LuThumbsDown } from 'react-icons/lu';
import ReactMarkdown from 'react-markdown';
import { ALLOW_MARKDOWN_BOT, BOTMESSAGE_TEXT_COLOR } from '../utilities/constants';

function BotReply({ message, name = 'Tobi', isGreeting = false, messageIndex, messageList, websocket }) {
  const [copied, setCopied] = useState(false);
  const [thumbState, setThumbState] = useState(null); // 'up' or 'down'
  const [anchorEl, setAnchorEl] = useState(null);
  const [askStage, setAskStage] = useState('ask');   // 'ask' | 'input'
  const [reason, setReason] = useState('');

  // Derive the most recent user message before this bot message
  const priorUserMessage = useMemo(() => {
    if (!messageList || messageIndex == null) return '';
    for (let i = messageIndex - 1; i >= 0; i--) {
      const m = messageList[i];
      if (m.sentBy === 'USER' && m.type === 'TEXT' && m.message) return m.message;
    }
    return '';
  }, [messageList, messageIndex]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const handleUp = () => {
    setThumbState('up');
    // (Optional) you could send a thumbs-up payload if you later support it server-side.
  };

  const handleDown = (evt) => {
    setThumbState('down');
    setReason('');
    setAskStage('ask');
    setAnchorEl(evt.currentTarget);
  };

  const closePopover = () => {
    setAnchorEl(null);
    setAskStage('ask');
    setReason('');
  };

  const handleAskNo = () => {
    // "No" = dismiss only (no feedback sent)
    closePopover();
  };

  const handleAskYes = () => {
    setAskStage('input');
  };

  const handleSendReason = () => {
    // Send thumbsdown with optional reason
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      try {
        websocket.send(JSON.stringify({
          action: 'submitFeedback',
          rating: 'thumbsdown',
          botMessage: message || '',
          userMessage: priorUserMessage || '',
          timestamp: new Date().toISOString(),
          reason: (reason || '').trim()
        }));
        // You could show a tiny confirmation UI if desired
      } catch (e) {
        console.error('Failed to send feedback:', e);
      }
    } else {
      console.error('WebSocket not connected, cannot send feedback');
    }
    closePopover();
  };

  const popoverOpen = Boolean(anchorEl);

  const markdownStyles = {
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    maxWidth: { xs: '85%', md: '70%' },
    '& p': { margin: '0 0 0.5rem 0' },
    '& ul, & ol': { margin: '0.25rem 0 0.5rem 1.25rem', paddingLeft: '1.25rem' },
    '& li': { margin: '0.15rem 0' },
    '& a, & a:visited': { color: 'inherit', textDecoration: 'none', borderBottom: '1px dotted currentColor' },
    '& a:hover, & a:focus': { borderBottomStyle: 'solid', outline: 'none' },
    '& pre': { whiteSpace: 'pre', overflowX: 'auto', maxWidth: '100%', margin: '0.25rem 0' },
    '& code': { wordBreak: 'break-word' },
    '& table': { display: 'block', width: '100%', overflowX: 'auto' },
    '& img, & video': { maxWidth: '100%', height: 'auto' },
  };

  const plainTextStyles = {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    maxWidth: { xs: '85%', md: '70%' },
    '& a, & a:visited': { color: 'inherit', textDecoration: 'none', borderBottom: '1px dotted currentColor' },
    '& a:hover, & a:focus': { borderBottomStyle: 'solid', outline: 'none' },
  };

  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start">
      <Grid item xs sx={{ minWidth: 0, maxWidth: '100%' }}>
        <Box sx={{ p: 0 }}>
          <Box sx={{ mt: 1 }}>
            {ALLOW_MARKDOWN_BOT ? (
              <Typography variant="body2" component="div" color={BOTMESSAGE_TEXT_COLOR} sx={markdownStyles}>
                <ReactMarkdown
                  components={{
                    a: ({node, ...props}) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" />
                    )
                  }}
                >
                  {message || ''}
                </ReactMarkdown>
              </Typography>
            ) : (
              <Typography variant="body2" color={BOTMESSAGE_TEXT_COLOR} sx={plainTextStyles}>
                {message || ''}
              </Typography>
            )}
          </Box>
        </Box>

        {!isGreeting && (
          <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'flex-start', gap: 0.5 }}>
            <Tooltip title={copied ? 'Copied' : 'Copy'}>
              <IconButton size="small" onClick={handleCopy} aria-label="Copy message">
                {copied ? <FiCheck size={16} /> : <FiCopy size={16} />}
              </IconButton>
            </Tooltip>

            <Tooltip title="Thumbs up">
              <IconButton
                size="small"
                onClick={handleUp}
                aria-label="Thumbs up"
                sx={{ color: thumbState === 'up' ? 'primary.main' : 'inherit' }}
              >
                <FiThumbsUp size={16} />
              </IconButton>
            </Tooltip>

            <Tooltip title="Thumbs down">
              <IconButton
                size="small"
                onClick={handleDown}
                aria-label="Thumbs down"
                sx={{ color: thumbState === 'down' ? 'error.main' : 'inherit' }}
              >
                <LuThumbsDown size={16} />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {/* Popover: Ask why → optional input */}
        <Popover
          open={popoverOpen}
          anchorEl={anchorEl}
          onClose={closePopover}
          anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          PaperProps={{
            sx: {
              p: 1.5,
              width: 320,
              borderRadius: 2,
            }
          }}
        >
          {askStage === 'ask' ? (
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Care to explain why?
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button size="small" onClick={handleAskNo}>No</Button>
                <Button size="small" variant="contained" onClick={handleAskYes}>Yes</Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={1}>
              <TextField
                autoFocus
                multiline
                minRows={3}
                placeholder="What went wrong?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                fullWidth
              />
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button size="small" onClick={closePopover}>Cancel</Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleSendReason}
                  disabled={!reason.trim()}
                >
                  Send
                </Button>
              </Stack>
            </Stack>
          )}
        </Popover>
      </Grid>
    </Grid>
  );
}

export default BotReply;