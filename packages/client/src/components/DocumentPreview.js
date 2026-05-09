import React from 'react';
import { Box, Paper, Typography, Button } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { Document, Page } from 'react-pdf';
import { pdfjs } from 'react-pdf';

// Инициализация PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function DocumentPreview({ documentUrl, originalName, onDownload }) {
  const [numPages, setNumPages] = React.useState(null);
  const [pageNumber, setPageNumber] = React.useState(1);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  return (
    <Paper sx={{ mt: 4, p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Предварительный просмотр
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<DownloadIcon />}
          onClick={onDownload}
        >
          Скачать перевод
        </Button>
      </Box>

      <Box sx={{ 
        mt: 2, 
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        bgcolor: 'grey.100',
        borderRadius: 1,
        p: 2
      }}>
        {documentUrl && documentUrl.endsWith('.pdf') ? (
          <>
            <Document
              file={documentUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <Box sx={{ p: 2 }}>
                  <Typography>Загрузка документа...</Typography>
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
                  Предыдущая
                </Button>
                <Typography>
                  Страница {pageNumber} из {numPages}
                </Typography>
                <Button 
                  disabled={pageNumber >= numPages}
                  onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages))}
                >
                  Следующая
                </Button>
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ p: 2 }}>
            <Typography>
              Предпросмотр доступен только для PDF файлов. 
              Для просмотра DOCX используйте скачивание.
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}

export default DocumentPreview; 