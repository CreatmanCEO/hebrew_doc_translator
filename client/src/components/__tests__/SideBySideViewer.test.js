import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SideBySideViewer from '../SideBySideViewer';

const doc = {
  schemaVersion:1, sourceLang:'he', targetLang:'en',
  blocks:[{ id:'b0', type:'paragraph', sentences:[
    { id:'b0s0', source:'שלום עולם', target:'Hello world',
      srcTokens:['שלום','עולם'], tgtTokens:['Hello','world'],
      align:[{src:[0],tgt:[0]},{src:[1],tgt:[1]}] }
  ]}]
};

test('renders source and target tokens', () => {
  render(<SideBySideViewer doc={doc} />);
  expect(screen.getByText('שלום')).toBeInTheDocument();
  expect(screen.getByText('Hello')).toBeInTheDocument();
});

test('XSS: a token with HTML is rendered as literal text, not injected', () => {
  const evil = { schemaVersion:1, sourceLang:'he', targetLang:'en', blocks:[{ id:'b0', type:'paragraph', sentences:[
    { id:'b0s0', source:'x', target:'<img src=x onerror=alert(1)>',
      srcTokens:['x'], tgtTokens:['<img','src=x','onerror=alert(1)>'], align:[] }
  ]}]};
  const { container } = render(<SideBySideViewer doc={evil} />);
  expect(container.querySelector('img')).toBeNull();           // no element injected
  expect(screen.getByText('<img', { exact:false })).toBeInTheDocument(); // literal text present
});

test('hovering a source token highlights the aligned target token', () => {
  const { container } = render(<SideBySideViewer doc={doc} />);
  const srcTok0 = container.querySelector('[data-side="src"][data-block="b0"][data-sentence="b0s0"][data-token="0"]');
  fireEvent.mouseEnter(srcTok0);
  const tgtTok0 = container.querySelector('[data-side="tgt"][data-block="b0"][data-sentence="b0s0"][data-token="0"]');
  // highlighted token gets a non-empty backgroundColor (or hl class)
  expect(tgtTok0.className.includes('hl') || tgtTok0.style.backgroundColor).toBeTruthy();
});
