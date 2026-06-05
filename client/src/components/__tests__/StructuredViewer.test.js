import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LanguageProvider } from '../../i18n';
import StructuredViewer from '../StructuredViewer';

const doc = { schemaVersion:2, sourceLang:'he', targetLang:'en', elements:[
  { type:'heading', level:1, source:'כותרת', target:'Title' },
  { type:'paragraph', source:'פסקה', target:'A paragraph' },
  { type:'list', ordered:true, items:[{source:'א',target:'First'},{source:'ב',target:'Second'}] },
  { type:'table', rows:[[{source:'ש',target:'Name'},{source:'ג',target:'Age'}],[{source:'x',target:'Bob'},{source:'y',target:'30'}]] },
]};
const renderV = (d=doc) => render(<LanguageProvider><StructuredViewer doc={d}/></LanguageProvider>);

test('renders target structure: heading, paragraph, list, table', () => {
  renderV();
  expect(screen.getByText('Title')).toBeInTheDocument();
  expect(screen.getByText('A paragraph')).toBeInTheDocument();
  expect(screen.getByText('First')).toBeInTheDocument();
  expect(screen.getByText('Name')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
});

test('renders source (Hebrew) too', () => {
  renderV();
  expect(screen.getByText('כותרת')).toBeInTheDocument();
});

test('XSS: element target with HTML is literal text, no injection', () => {
  const evil = { schemaVersion:2, sourceLang:'he', targetLang:'en', elements:[
    { type:'paragraph', source:'x', target:'<img src=x onerror=alert(1)>' } ]};
  const { container } = renderV(evil);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('<img src=x onerror=alert(1)>', { exact:false })).toBeInTheDocument();
});

test('hovering an element highlights that index (data-el present)', () => {
  const { container } = renderV();
  const els = container.querySelectorAll('[data-el="0"]');
  expect(els.length).toBeGreaterThanOrEqual(1);   // present on both columns
  fireEvent.mouseEnter(els[0]);
  // highlighted element gets a non-default background or 'hl' class
  expect(els[0].className.includes('hl') || els[0].style.backgroundColor).toBeTruthy();
});
