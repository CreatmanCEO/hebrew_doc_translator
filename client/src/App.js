import React, { useEffect, useMemo } from 'react';
import { AppBar, Toolbar, Container, Typography, Box, Stack } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import io from 'socket.io-client';
import DocumentUpload from './components/DocumentUpload';
import TranslationProgress from './components/TranslationProgress';
import DocumentPreview from './components/DocumentPreview';
import SideBySideViewer from './components/SideBySideViewer';
import StructuredViewer from './components/StructuredViewer';
import UsagePanel from './components/UsagePanel';
import LanguageSwitcher from './components/LanguageSwitcher';
import { useT } from './i18n';

// API origin: пусто => тот же origin, что и страница (прод, через Traefik).
// В dev задаётся через client/.env.development (REACT_APP_API_URL=http://localhost:3001).
const API_URL = process.env.REACT_APP_API_URL || '';

function App() {
  const t = useT();
  const [translationState, setTranslationState] = React.useState({
    status: 'idle',
    progress: 0,
    error: null,
    documentUrl: null,
    originalName: null
  });

  const [socket, setSocket] = React.useState(null);
  const [translationDoc, setTranslationDoc] = React.useState(null);
  const [resultToken, setResultToken] = React.useState(null);

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

      setResultToken(data.resultToken || null);

      if (data.resultToken) {
        fetch(`${API_URL}/api/result/${data.resultToken}`)
          .then(r => r.ok ? r.json() : null)
          .then(doc => { if (doc) setTranslationDoc(doc); })
          .catch(() => {});
      }
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
      setTranslationDoc(null);
      setResultToken(null);
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
        throw new Error(data.message || t('statusError'));
      }

      if (data.success) {
        setTranslationState(prev => ({
          ...prev,
          status: 'processing',
          progress: 30,
          jobId: data.jobId
        }));
      } else {
        throw new Error(data.message || t('statusError'));
      }
      
    } catch (error) {
      console.error('Upload error:', error);
      setTranslationState(prev => ({
        ...prev,
        status: 'error',
        progress: 0,
        error: error.message || t('statusError')
      }));
    }
  };

  const handleDownload = () => {
    if (!translationState.documentUrl) return;
    // Direct anchor to the server's attachment URL (server sends
    // Content-Disposition: attachment). More reliable than a blob+download on
    // iOS Safari, which ignores the download attribute for blob: URLs and opens
    // them inline instead.
    const a = document.createElement('a');
    a.href = `${API_URL}${translationState.documentUrl}`;
    a.download = '';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setTranslationDoc(null);
    setResultToken(null);
    setTranslationState({
      status: 'idle',
      progress: 0,
      error: null,
      documentUrl: null,
      originalName: null
    });
  };

  const busy =
    translationState.status === 'uploading' || translationState.status === 'processing';

  return (
    <SnackbarProvider maxSnack={3}>
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <AppBar position="static" color="transparent" elevation={0}>
          <Toolbar sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography
              variant="subtitle1"
              component="span"
              sx={{ flexGrow: 1, fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              {t('appTitle')}
            </Typography>
            <LanguageSwitcher />
          </Toolbar>
        </AppBar>

        <Container maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
          <Stack spacing={1} sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
              {t('appTitle')}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t('subtitle')}
            </Typography>
          </Stack>

          <Stack spacing={3}>
            <DocumentUpload onFileUpload={handleFileUpload} disabled={busy} />

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
                onReset={handleReset}
              />
            )}

            <UsagePanel resultToken={resultToken} />

            {translationDoc && (translationDoc.schemaVersion === 2
              ? <StructuredViewer doc={translationDoc} />
              : <SideBySideViewer doc={translationDoc} />)}
          </Stack>
        </Container>
      </Box>
    </SnackbarProvider>
  );
}

export default App; 