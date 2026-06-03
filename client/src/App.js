import React, { useEffect, useMemo } from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import io from 'socket.io-client';
import DocumentUpload from './components/DocumentUpload';
import TranslationProgress from './components/TranslationProgress';
import DocumentPreview from './components/DocumentPreview';

// API origin: пусто => тот же origin, что и страница (прод, через Traefik).
// В dev задаётся через client/.env.development (REACT_APP_API_URL=http://localhost:3001).
const API_URL = process.env.REACT_APP_API_URL || '';

function App() {
  const [translationState, setTranslationState] = React.useState({
    status: 'idle',
    progress: 0,
    error: null,
    documentUrl: null,
    originalName: null
  });

  const [socket, setSocket] = React.useState(null);

  // Стабильный идентификатор сессии: события прогресса приходят только в нашу комнату
  const sessionId = useMemo(
    () => (window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : String(Date.now()) + Math.random()),
    []
  );

  // Инициализация WebSocket соединения
  useEffect(() => {
    const newSocket = io(API_URL || window.location.origin, { query: { sessionId } });
    setSocket(newSocket);

    return () => newSocket.close();
  }, [sessionId]);

  // Обработка WebSocket событий
  useEffect(() => {
    if (!socket) return;

    socket.on('translation:progress', (data) => {
      setTranslationState(prev => ({
        ...prev,
        status: data.status,
        progress: data.progress
      }));
    });

    socket.on('translation:complete', (data) => {
      setTranslationState(prev => ({
        ...prev,
        status: 'completed',
        progress: 100,
        documentUrl: data.downloadUrl
      }));
    });

    socket.on('translation:error', (data) => {
      setTranslationState(prev => ({
        ...prev,
        status: 'error',
        error: data.message
      }));
    });

    return () => {
      socket.off('translation:progress');
      socket.off('translation:complete');
      socket.off('translation:error');
    };
  }, [socket]);

  const handleFileUpload = async (file, targetLang) => {
    try {
      setTranslationState({
        status: 'uploading',
        progress: 0,
        error: null,
        documentUrl: null,
        originalName: file.name
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetLang', targetLang);
      formData.append('sourceLang', 'he'); // Исходный язык всегда иврит
      formData.append('sessionId', sessionId);

      const response = await fetch(`${API_URL}/api/translate`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Ошибка при загрузке файла');
      }

      if (data.success) {
        setTranslationState(prev => ({
          ...prev,
          status: 'processing',
          progress: 30,
          jobId: data.jobId
        }));
      } else {
        throw new Error(data.message || 'Ошибка при обработке файла');
      }
      
    } catch (error) {
      console.error('Upload error:', error);
      setTranslationState(prev => ({
        ...prev,
        status: 'error',
        progress: 0,
        error: error.message || 'Произошла ошибка при загрузке файла'
      }));
    }
  };

  const handleDownload = async () => {
    if (!translationState.documentUrl) return;
    
    try {
      const response = await fetch(translationState.documentUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `translated_${translationState.originalName}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const handleReset = () => {
    setTranslationState({
      status: 'idle',
      progress: 0,
      error: null,
      documentUrl: null,
      originalName: null
    });
  };

  return (
    <SnackbarProvider maxSnack={3}>
      <Container maxWidth="md">
        <Box sx={{ my: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            Переводчик документов с иврита
          </Typography>
          
          <Paper sx={{ mt: 4, p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Загрузите документ для перевода
            </Typography>
            <DocumentUpload 
              onFileUpload={handleFileUpload} 
              disabled={translationState.status === 'uploading' || translationState.status === 'processing'}
            />
          </Paper>

          <TranslationProgress
            status={translationState.status}
            progress={translationState.progress}
            error={translationState.error}
            onReset={handleReset}
          />

          {translationState.status === 'completed' && translationState.documentUrl && (
            <DocumentPreview
              documentUrl={translationState.documentUrl}
              originalName={translationState.originalName}
              onDownload={handleDownload}
            />
          )}
        </Box>
      </Container>
    </SnackbarProvider>
  );
}

export default App; 