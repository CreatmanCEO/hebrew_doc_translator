import React, { createContext, useContext, useEffect, useState } from 'react';

const dict = {
  en: {
    appTitle: 'Hebrew Document Translator',
    uploadHint: 'Drag a PDF or DOCX here, or click to choose',
    sizeLimit: 'PDF and DOCX up to 25 MB',
    targetLang: 'Translate to',
    langEnglish: 'English',
    langRussian: 'Russian',
    statusUploading: 'Uploading…',
    statusProcessing: 'Translating…',
    statusDone: 'Done',
    statusError: 'Something went wrong',
    download: 'Download',
    translateAnother: 'Translate another',
    viewerSource: 'Original',
    viewerTarget: 'Translation',
    processing: 'Processing your document…',
    usageTitle: 'Processing cost (admin)',
  },
  ru: {
    appTitle: 'Переводчик документов с иврита',
    uploadHint: 'Перетащите сюда PDF или DOCX, либо нажмите для выбора',
    sizeLimit: 'PDF и DOCX до 25 МБ',
    targetLang: 'Язык перевода',
    langEnglish: 'Английский',
    langRussian: 'Русский',
    statusUploading: 'Загрузка…',
    statusProcessing: 'Перевод…',
    statusDone: 'Готово',
    statusError: 'Что-то пошло не так',
    download: 'Скачать',
    translateAnother: 'Перевести другой',
    viewerSource: 'Оригинал',
    viewerTarget: 'Перевод',
    processing: 'Обрабатываем ваш документ…',
    usageTitle: 'Расход (admin)',
  },
  he: {
    appTitle: 'מתרגם מסמכים מעברית',
    uploadHint: 'גררו לכאן קובץ PDF או DOCX, או לחצו לבחירה',
    sizeLimit: 'קבצי PDF ו-DOCX עד 25 MB',
    targetLang: 'תרגם ל',
    langEnglish: 'אנגלית',
    langRussian: 'רוסית',
    statusUploading: 'מעלה…',
    statusProcessing: 'מתרגם…',
    statusDone: 'הושלם',
    statusError: 'משהו השתבש',
    download: 'הורד',
    translateAnother: 'תרגם עוד',
    viewerSource: 'מקור',
    viewerTarget: 'תרגום',
    processing: 'מעבד את המסמך שלך…',
    usageTitle: 'עלות עיבוד (admin)',
  },
};

const SUPPORTED = ['he', 'en', 'ru'];

const LanguageContext = createContext({ uiLang: 'en', setUiLang: () => {} });

function detectInitialLang() {
  const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('uiLang')) || null;
  if (SUPPORTED.includes(stored)) return stored;
  const nav = ((typeof navigator !== 'undefined' && navigator.language) || 'en').slice(0, 2);
  if (SUPPORTED.includes(nav)) return nav;
  return 'en';
}

export function LanguageProvider({ children }) {
  const [uiLang, setUiLang] = useState(detectInitialLang);

  useEffect(() => {
    localStorage.setItem('uiLang', uiLang);
    document.documentElement.lang = uiLang;
    document.documentElement.dir = uiLang === 'he' ? 'rtl' : 'ltr';
  }, [uiLang]);

  return (
    <LanguageContext.Provider value={{ uiLang, setUiLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useUiLang() {
  return useContext(LanguageContext);
}

export function useT() {
  const { uiLang } = useContext(LanguageContext);
  return (key) => (dict[uiLang] && dict[uiLang][key]) ?? dict.en[key] ?? key;
}

export { dict };
