import React, { useState, useCallback } from 'react';
import axios from 'axios';
import DocumentUpload from './components/DocumentUpload';
import DocumentPreview from './components/DocumentPreview';
import TranslationProgress from './components/TranslationProgress';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

const App = () => {
  const [file, setFile] = useState(null);
  const [translatedFile, setTranslatedFile] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [targetLanguage, setTargetLanguage] = useState('ru');
  const [details, setDetails] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = useCallback((selectedFile) => {
    setFile(selectedFile);
    setTranslatedFile(null);
    setCurrentStep(null);
    setProgress(0);
    setError(null);
    setDetails({});
  }, []);

  const handleTranslate = async () => {
    if (!file || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setTranslatedFile(null);
    setProgress(0);
    setCurrentStep('extract');

    const formData = new FormData();
    formData.append('document', file);
    formData.append('targetLanguage', targetLanguage);

    try {
      const response = await axios.post('http://localhost:3001/api/translate', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const uploadProgress = (progressEvent.loaded / progressEvent.total) * 30;
          setProgress(uploadProgress);
        },
        onDownloadProgress: (progressEvent) => {
          const downloadProgress = 70 + (progressEvent.loaded / progressEvent.total) * 30;
          setProgress(downloadProgress);
        }
      });

      // Создаем URL для скачивания файла
      const blob = new Blob([response.data], {
        type: file.type
      });
      
      setTranslatedFile(blob);
      setCurrentStep('generate');
      setProgress(100);
      
    } catch (err) {
      console.error('Translation failed:', err);
      setError(err.response?.data?.message || 'Ошибка при переводе документа');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!translatedFile) return;

    const downloadUrl = window.URL.createObjectURL(translatedFile);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `translated_${file.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Переводчик документов с иврита
          </h1>
          <p className="mt-2 text-gray-600">
            Загрузите документ (PDF, DOC, DOCX) для перевода
          </p>
        </div>

        {/* Main content */}
        <div className="space-y-8">
          {/* Upload and language selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="max-w-xl mx-auto">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Язык перевода
                </label>
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  disabled={isProcessing}
                >
                  <option value="ru">Русский</option>
                  <option value="en">Английский</option>
                </select>
              </div>
              
              <DocumentUpload onFileSelect={handleFileSelect} />
            </div>
          </div>

          {/* Progress */}
          {(file || translatedFile) && (
            <div className="bg-white rounded-lg shadow p-6">
              <TranslationProgress
                currentStep={currentStep}
                error={error}
                progress={progress}
                details={details}
              />

              {/* Action buttons */}
              <div className="mt-6 flex justify-center space-x-4">
                <button
                  type="button"
                  onClick={handleTranslate}
                  disabled={!file || isProcessing}
                  className={
                    "inline-flex items-center px-4 py-2 border border-transparent " +
                    "text-sm font-medium rounded-md shadow-sm text-white " +
                    "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 " +
                    ((!file || isProcessing) ? 
                      "bg-gray-400 cursor-not-allowed" : 
                      "bg-blue-600 hover:bg-blue-700")
                  }
                >
                  {isProcessing && (
                    <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isProcessing ? 'Обработка...' : 'Перевести'}
                </button>

                {translatedFile && (
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center px-4 py-2 border border-transparent
                             text-sm font-medium rounded-md shadow-sm text-white
                             bg-green-600 hover:bg-green-700
                             focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    Скачать перевод
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Document preview */}
          {(file || translatedFile) && (
            <div className="grid md:grid-cols-2 gap-6">
              {file && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Оригинал
                  </h3>
                  <DocumentPreview file={file} isRTL={true} />
                </div>
              )}

              {translatedFile && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Перевод
                  </h3>
                  <DocumentPreview 
                    file={new File([translatedFile], `translated_${file.name}`, { type: file.type })}
                    isRTL={false}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;