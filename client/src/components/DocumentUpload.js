import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Paper,
  Typography,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useT } from '../i18n';

function DocumentUpload({ onFileUpload, disabled }) {
  const t = useT();
  const [targetLang, setTargetLang] = React.useState('ru');

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles?.length > 0 && !disabled) {
      onFileUpload(acceptedFiles[0], targetLang);
    }
  }, [onFileUpload, disabled, targetLang]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: false,
    disabled
  });

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        sx={{ mb: 2 }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          {t('targetLang')}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          color="primary"
          value={targetLang}
          onChange={(_, v) => v && setTargetLang(v)}
          disabled={disabled}
          aria-label={t('targetLang')}
        >
          <ToggleButton value="en" aria-label={t('langEnglish')}>
            {t('langEnglish')}
          </ToggleButton>
          <ToggleButton value="ru" aria-label={t('langRussian')}>
            {t('langRussian')}
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Paper
        {...getRootProps()}
        elevation={0}
        sx={{
          py: 6,
          px: 3,
          textAlign: 'center',
          cursor: disabled ? 'default' : 'pointer',
          bgcolor: isDragActive ? 'action.hover' : 'background.paper',
          border: '2px dashed',
          borderColor: disabled
            ? 'action.disabled'
            : isDragActive
            ? 'primary.main'
            : 'divider',
          opacity: disabled ? 0.7 : 1,
          transition: 'background-color .15s ease, border-color .15s ease',
          '&:hover': {
            bgcolor: disabled ? 'background.paper' : 'action.hover',
            borderColor: disabled ? 'action.disabled' : 'primary.main'
          }
        }}
      >
        <input {...getInputProps()} disabled={disabled} />
        <Box sx={{ mb: 2 }}>
          {disabled ? (
            <CircularProgress size={44} />
          ) : (
            <CloudUploadIcon sx={{ fontSize: 44, color: 'primary.main' }} />
          )}
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
          {disabled
            ? t('processingFile')
            : isDragActive
            ? t('dropActive')
            : t('uploadHint')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('sizeLimit')}
        </Typography>
      </Paper>
    </Box>
  );
}

export default DocumentUpload;
