import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { LanguageProvider, useT, useUiLang, dict } from '../i18n';

function Probe() {
  const t = useT();
  const { uiLang, setUiLang } = useUiLang();
  return (
    <div>
      <span data-testid="dl">{t('download')}</span>
      <span data-testid="lang">{uiLang}</span>
      <button onClick={() => setUiLang('ru')}>ru</button>
      <button onClick={() => setUiLang('he')}>he</button>
      <span data-testid="missing">{t('___nope___')}</span>
    </div>
  );
}

beforeEach(() => localStorage.clear());

test('default en, returns english string', () => {
  render(<LanguageProvider><Probe/></LanguageProvider>);
  expect(screen.getByTestId('lang').textContent).toBe('en');
  expect(screen.getByTestId('dl').textContent).toBe(dict.en.download);
});

test('switch to ru updates strings + persists + dir ltr', () => {
  render(<LanguageProvider><Probe/></LanguageProvider>);
  act(() => screen.getByText('ru').click());
  expect(screen.getByTestId('dl').textContent).toBe(dict.ru.download);
  expect(localStorage.getItem('uiLang')).toBe('ru');
  expect(document.documentElement.dir).toBe('ltr');
});

test('switch to he sets rtl', () => {
  render(<LanguageProvider><Probe/></LanguageProvider>);
  act(() => screen.getByText('he').click());
  expect(document.documentElement.dir).toBe('rtl');
});

test('unknown key falls back to the key', () => {
  render(<LanguageProvider><Probe/></LanguageProvider>);
  expect(screen.getByTestId('missing').textContent).toBe('___nope___');
});

test('all languages share the same keys', () => {
  const ke = Object.keys(dict.en).sort();
  expect(Object.keys(dict.ru).sort()).toEqual(ke);
  expect(Object.keys(dict.he).sort()).toEqual(ke);
});
