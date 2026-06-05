import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LanguageSwitcher from '../LanguageSwitcher';
import { LanguageProvider } from '../../i18n';

test('clicking HE toggle switches document direction to rtl', () => {
  render(
    <LanguageProvider>
      <LanguageSwitcher />
    </LanguageProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'he' }));

  expect(document.documentElement.dir).toBe('rtl');
  expect(document.documentElement.lang).toBe('he');
});
