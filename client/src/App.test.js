import { render, screen } from '@testing-library/react';

// socket.io-client is mocked so the test never opens a real connection.
jest.mock('socket.io-client', () => ({
  __esModule: true,
  default: () => ({ on: jest.fn(), off: jest.fn(), close: jest.fn() }),
}));

import App from './App';

test('App mounts without crashing', () => {
  render(<App />);
  expect(
    screen.getByText(/Переводчик документов с иврита/i)
  ).toBeInTheDocument();
});
