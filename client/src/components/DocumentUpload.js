import React, { useState, useCallback } from 'react';
import { CloudArrowUpIcon, DocumentIcon, XCircleIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

const DocumentUpload = ({ onFileSelect, acceptedTypes = ['.pdf', '.doc', '.docx'] }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const validateFile = (file) => {
    if (!file) return 'Выберите файл';
    
    const fileType = file.name.toLowerCase().split('.').pop();
    if (!acceptedTypes.includes(`.${fileType}`)) {
      return 'Неподдерживаемый тип файла. Поддерживаются только PDF и DOC/DOCX';
    }
    
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return 'Файл слишком большой. Максимальный размер 10MB';
    }

    return null;
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    const error = validateFile(file);
    
    if (error) {
      setError(error);
      return;
    }

    setSelectedFile(file);
    setError(null);
    onFileSelect?.(file);
  }, [onFileSelect, acceptedTypes]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    const error = validateFile(file);
    
    if (error) {
      setError(error);
      return;
    }

    setSelectedFile(file);
    setError(null);
    onFileSelect?.(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setError(null);
    onFileSelect?.(null);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div
        className={clsx(
          "relative rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300",
          error ? "border-red-500 bg-red-50" : ""
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleFileSelect}
          accept={acceptedTypes.join(',')}
        />

        <div className="space-y-4">
          {!selectedFile ? (
            <>
              <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
              <div className="text-gray-600">
                <span className="font-semibold text-blue-600">
                  Выберите файл
                </span>{' '}
                или перетащите его сюда
              </div>
              <div className="text-sm text-gray-500">
                PDF, DOC или DOCX до 10MB
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center space-x-3">
              <DocumentIcon className="h-8 w-8 text-blue-500" />
              <span className="text-gray-900">{selectedFile.name}</span>
              <button
                type="button"
                onClick={handleRemoveFile}
                className="text-gray-500 hover:text-red-500"
              >
                <XCircleIcon className="h-6 w-6" />
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;