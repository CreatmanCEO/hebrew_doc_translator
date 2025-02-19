import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Box, Paper, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CircularProgress from '@mui/material/CircularProgress';

function DocumentUpload({ onFileUpload, disabled }) {
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
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Язык перевода</InputLabel>
        <Select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          disabled={disabled}
          label="Язык перевода"
        >
          <MenuItem value="ru">Русский</MenuItem>
          <MenuItem value="en">English</MenuItem>
        </Select>
      </FormControl>

      <Paper
        {...getRootProps()}
        sx={{
          p: 3,
          textAlign: 'center',
          cursor: disabled ? 'default' : 'pointer',
          bgcolor: isDragActive ? 'action.hover' : 'background.paper',
          border: '2px dashed',
          borderColor: disabled ? 'action.disabled' : isDragActive ? 'primary.main' : 'divider',
          opacity: disabled ? 0.7 : 1,
          '&:hover': {
            bgcolor: disabled ? 'background.paper' : 'action.hover',
            borderColor: disabled ? 'action.disabled' : 'primary.main'
          }
        }}
      >
        <input {...getInputProps()} disabled={disabled} />
        <Box sx={{ mb: 2 }}>
          {disabled ? (
            <CircularProgress size={48} />
          ) : (
            <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main' }} />
          )}
        </Box>
        <Typography variant="h6" gutterBottom>
          {disabled ? 'Обработка файла...' :
           isDragActive ? 'Отпустите файл здесь' : 
           'Перетащите файл сюда или нажмите для выбора'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Поддерживаются файлы PDF и DOCX до 50MB
        </Typography>
      </Paper>
    </Box>
  );
}

export default DocumentUpload; 