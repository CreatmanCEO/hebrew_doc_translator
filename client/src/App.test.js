import { render, screen } from '@testing-library/react';

// socket.io-client is mocked so the test never opens a real connection.
jest.mock('socket.io-client', () => ({
  __esModule: true,
  default: () => ({ on: jest.fn(), off: jest.fn(), close: jest.fn() }),
}));

import App from './App';
import { LanguageProvider, dict } from './i18n';

test('App mounts and renders the localized title', () => {
  render(
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
  // Default UI language is English; the wordmark + heading both use appTitle.
  expect(screen.getAllByText(dict.en.appTitle).length).toBeGreaterThan(0);
});
