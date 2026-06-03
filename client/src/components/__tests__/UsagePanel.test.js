import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import UsagePanel from '../UsagePanel';

afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

test('renders nothing without admin key', () => {
  const { container } = render(<UsagePanel resultToken="tok1" />);
  expect(container.firstChild).toBeNull();
});

test('shows usage when admin key present', async () => {
  localStorage.setItem('adminKey', 'secret');
  global.fetch = jest.fn(async () => ({ ok:true, json: async () => ({
    byOwner:{}, jobs:[{ token:'tok1', owner:'anon', jobId:'1',
      totals:{calls:2,in:150,out:50,total:200,costUsd:0.0015},
      byModel:{ 'gemini/gemini-2.0-flash': {calls:2,in:150,out:50,total:200,costUsd:0.0015} } }] }) }));
  render(<UsagePanel resultToken="tok1" />);
  await waitFor(() => expect(screen.getByText(/200/)).toBeInTheDocument());
  expect(screen.getByText(/gemini/i)).toBeInTheDocument();
});
