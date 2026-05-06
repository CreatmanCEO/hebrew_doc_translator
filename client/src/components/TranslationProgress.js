import React from 'react';
import clsx from 'clsx';
import {
  DocumentTextIcon,
  LanguageIcon,
  DocumentDuplicateIcon,
  CheckCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

const steps = [
  { id: 'extract', icon: DocumentTextIcon, title: 'Извлечение текста' },
  { id: 'translate', icon: LanguageIcon, title: 'Перевод' },
  { id: 'generate', icon: DocumentDuplicateIcon, title: 'Создание документа' }
];

const TranslationProgress = ({ 
  currentStep = null,
  error = null,
  progress = 0,
  details = {}
}) => {
  const getStepStatus = (stepId) => {
    if (error) return 'error';
    if (!currentStep) return 'pending';
    if (currentStep === stepId) return 'current';
    
    const currentIndex = steps.findIndex(s => s.id === currentStep);
    const stepIndex = steps.findIndex(s => s.id === stepId);
    
    return stepIndex < currentIndex ? 'completed' : 'pending';
  };

  const renderStepIcon = (step, status) => {
    const Icon = step.icon;
    
    return (
      <div
        className={clsx(
          'relative z-10 flex h-12 w-12 items-center justify-center rounded-full',
          {
            'bg-white border-2 border-gray-300': status === 'pending',
            'bg-blue-600': status === 'current',
            'bg-green-600': status === 'completed',
            'bg-red-600': status === 'error'
          }
        )}
      >
        {status === 'completed' ? (
          <CheckCircleIcon className="h-8 w-8 text-white" />
        ) : status === 'error' ? (
          <ExclamationCircleIcon className="h-8 w-8 text-white" />
        ) : (
          <Icon
            className={clsx('h-6 w-6', {
              'text-gray-500': status === 'pending',
              'text-white': status === 'current'
            })}
          />
        )}
      </div>
    );
  };

  const renderStepDetails = (step) => {
    const stepDetails = details[step.id];
    if (!stepDetails) return null;

    return (
      <div className="mt-2 text-sm text-gray-500">
        {stepDetails}
      </div>
    );
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="relative mb-8">
        <div 
          className="absolute left-0 top-1/2 w-full h-0.5 -translate-y-1/2 bg-gray-200"
          aria-hidden="true"
        >
          <div 
            className={clsx(
              'h-full transition-all duration-500',
              error ? 'bg-red-500' : 'bg-blue-500'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="relative z-10 flex justify-between">
          {steps.map((step) => {
            const status = getStepStatus(step.id);
            
            return (
              <div key={step.id} className="flex flex-col items-center">
                {renderStepIcon(step, status)}

                <div className="mt-2">
                  <div className={clsx(
                    'text-sm font-medium',
                    {
                      'text-gray-500': status === 'pending',
                      'text-blue-600': status === 'current',
                      'text-green-600': status === 'completed',
                      'text-red-600': status === 'error'
                    }
                  )}>
                    {step.title}
                  </div>
                  {renderStepDetails(step)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex">
            <ExclamationCircleIcon className="h-5 w-5 text-red-600 mr-2" />
            <div className="text-sm text-red-600">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslationProgress;