import React, { useEffect } from 'react';
import { Box, Paper, LinearProgress, Typography, Button, Stack } from '@mui/material';
import { useSnackbar } from 'notistack';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useT } from '../i18n';

function TranslationProgress({ status, progress, error, onReset }) {
  const t = useT();
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    if (error) {
      enqueueSnackbar(error, {
        variant: 'error',
        autoHideDuration: 5000,
        action: onReset ? (
          <Button color="inherit" size="small" onClick={onReset}>
            <RefreshIcon />
          </Button>
        ) : undefined
      });
    }
  }, [error, enqueueSnackbar, onReset]);

  if (!status || status === 'idle') return null;

  if (status === 'error') {
    return (
      <Paper elevation={0} sx={{ p: 4, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
        <ErrorOutlineIcon color="error" sx={{ fontSize: 40, mb: 1 }} />
        <Typography color="error" gutterBottom>
          {t('statusError')}
        </Typography>
        {error && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}
        {onReset && (
          <Button
            variant="contained"
            color="primary"
            onClick={onReset}
            startIcon={<RefreshIcon />}
          >
            {t('retry')}
          </Button>
        )}
      </Paper>
    );
  }

  const label =
    status === 'uploading'
      ? t('statusUploading')
      : status === 'processing'
      ? t('statusProcessing')
      : status === 'completed'
      ? t('statusDone')
      : t('statusProcessing');

  return (
    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="body1" sx={{ flexGrow: 1, fontWeight: 500 }}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {progress}%
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={progress}
        color={status === 'completed' ? 'success' : 'primary'}
        sx={{ height: 6, borderRadius: 3 }}
      />
      {status === 'completed' && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="success.main">
            {t('statusDone')}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

export default TranslationProgress;
