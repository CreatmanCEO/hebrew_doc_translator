import React, { useEffect } from 'react';
import { Box, LinearProgress, Typography, Button } from '@mui/material';
import { useSnackbar } from 'notistack';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';

function TranslationProgress({ status, progress, error, onReset }) {
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
      <Box sx={{ width: '100%', mt: 4, textAlign: 'center' }}>
        <ErrorOutlineIcon color="error" sx={{ fontSize: 40, mb: 1 }} />
        <Typography color="error" gutterBottom>
          {error || 'Произошла ошибка при обработке файла'}
        </Typography>
        {onReset && (
          <Button
            variant="contained"
            color="primary"
            onClick={onReset}
            startIcon={<RefreshIcon />}
          >
            Попробовать снова
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="body1" sx={{ flexGrow: 1 }}>
          {status === 'uploading' ? 'Загрузка файла...' :
           status === 'processing' ? 'Перевод документа...' :
           status === 'completed' ? 'Перевод завершен' :
           'Подготовка к переводу...'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {progress}%
        </Typography>
      </Box>
      <LinearProgress 
        variant="determinate" 
        value={progress} 
        color={status === 'completed' ? 'success' : 'primary'}
      />
      {status === 'completed' && (
        <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
          Документ успешно переведен
        </Typography>
      )}
    </Box>
  );
}

export default TranslationProgress; 