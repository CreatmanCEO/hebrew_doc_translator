import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { LanguageProvider, useUiLang } from './i18n';
import { makeTheme } from './theme';

const ltrCache = createCache({ key: 'mui', stylisPlugins: [prefixer] });
const rtlCache = createCache({ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin] });
const ltrTheme = makeTheme('ltr');
const rtlTheme = makeTheme('rtl');

function Root() {
  const { uiLang } = useUiLang();
  const rtl = uiLang === 'he';
  return (
    <CacheProvider value={rtl ? rtlCache : ltrCache}>
      <ThemeProvider theme={rtl ? rtlTheme : ltrTheme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </CacheProvider>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <Root />
    </LanguageProvider>
  </React.StrictMode>
);

reportWebVitals();
