import React, { useState, useEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { renderAsync } from 'docx-preview';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

const DocumentPreview = ({ file, isRTL = false }) => {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewContent, setPreviewContent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!file) {
      setPreviewContent(null);
      setError(null);
      setLoading(false);
      return;
    }

    const loadPreview = async () => {
      setLoading(true);
      setError(null);

      try {
        const fileType = file.name.toLowerCase().split('.').pop();
        
        if (fileType === 'pdf') {
          // PDF обрабатывается через react-pdf
          setPreviewContent('pdf');
        } else if (['doc', 'docx'].includes(fileType)) {
          // Для DOCX используем docx-preview
          const arrayBuffer = await file.arrayBuffer();
          const container = document.createElement('div');
          container.className = clsx(
            'docx-preview',
            isRTL && 'rtl'
          );
          
          await renderAsync(arrayBuffer, container, container, {
            className: 'docx-preview',
            inWrapper: false,
            useBase64URL: true
          });
          
          setPreviewContent(container.innerHTML);
        }
      } catch (err) {
        console.error('Preview generation failed:', err);
        setError('Ошибка при создании предпросмотра');
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [file, isRTL]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

  const changePage = (offset) => {
    setCurrentPage(prevPage => {
      const newPage = prevPage + offset;
      return Math.min(Math.max(1, newPage), numPages || 1);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 p-4">
        {error}
      </div>
    );
  }

  if (!file || !previewContent) {
    return (
      <div className="text-center text-gray-500 p-4">
        Выберите документ для предпросмотра
      </div>
    );
  }

  return (
    <div className={clsx(
      'border rounded-lg overflow-hidden bg-white',
      'shadow-sm hover:shadow transition-shadow duration-200',
      isRTL && 'rtl'
    )}>
      {previewContent === 'pdf' ? (
        <>
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            error={
              <div className="text-center text-red-600 p-4">
                Ошибка загрузки PDF
              </div>
            }
          >
            <Page 
              pageNumber={currentPage}
              className="max-w-full"
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </Document>

          {numPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <button
                onClick={() => changePage(-1)}
                disabled={currentPage <= 1}
                className={clsx(
                  'p-2 rounded-full',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'hover:bg-gray-100 transition-colors'
                )}
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>

              <span className="text-sm text-gray-600">
                Страница {currentPage} из {numPages}
              </span>

              <button
                onClick={() => changePage(1)}
                disabled={currentPage >= numPages}
                className={clsx(
                  'p-2 rounded-full',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'hover:bg-gray-100 transition-colors'
                )}
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </div>
          )}
        </>
      ) : (
        <div 
          className="docx-preview p-4"
          dangerouslySetInnerHTML={{ __html: previewContent }}
        />
      )}
    </div>
  );
};

export default DocumentPreview;