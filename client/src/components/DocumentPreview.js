import React from 'react';
import { Box, Paper, Typography, Button, Stack } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { Document, Page } from 'react-pdf';
import { pdfjs } from 'react-pdf';
import { useT } from '../i18n';

// Инициализация PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function DocumentPreview({ documentUrl, originalName, onDownload, onReset }) {
  const t = useT();
  const [numPages, setNumPages] = React.useState(null);
  const [pageNumber, setPageNumber] = React.useState(1);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  return (
    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
          <CheckCircleIcon color="success" />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {t('statusDone')}
            </Typography>
            {originalName && (
              <Typography variant="body2" color="text.secondary" noWrap>
                {originalName}
              </Typography>
            )}
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={<DownloadIcon />}
            onClick={onDownload}
          >
            {t('download')}
          </Button>
          {onReset && (
            <Button color="primary" onClick={onReset}>
              {t('translateAnother')}
            </Button>
          )}
        </Stack>
      </Stack>

      <Box sx={{
        mt: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        bgcolor: 'background.default',
        borderRadius: 2,
        p: 2
      }}>
        {documentUrl && documentUrl.endsWith('.pdf') ? (
          <>
            <Document
              file={documentUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <Box sx={{ p: 2 }}>
                  <Typography>{t('loadingDocument')}</Typography>
                </Box>
              }
            >
              <Page
                pageNumber={pageNumber}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                width={600}
              />
            </Document>
            {numPages && (
              <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                <Button
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))}
                >
                  {t('prevPage')}
                </Button>
                <Typography>
                  {t('pageOf')
                    .replace('{current}', pageNumber)
                    .replace('{total}', numPages)}
                </Typography>
                <Button
                  disabled={pageNumber >= numPages}
                  onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages))}
                >
                  {t('nextPage')}
                </Button>
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ p: 2 }}>
            <Typography color="text.secondary">
              {t('previewOnlyPdf')}
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}

export default DocumentPreview;
