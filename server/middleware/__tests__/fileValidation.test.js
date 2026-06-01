import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { validateMagicBytes } from '../fileValidation.js';

const tmp = (name, bytes) => {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, bytes);
  return p;
};

describe('validateMagicBytes', () => {
  it('accepts a real PDF signature', async () => {
    const p = tmp('ok.pdf', Buffer.from('%PDF-1.7\n...'));
    expect((await validateMagicBytes(p, 'pdf')).valid).toBe(true);
    fs.rmSync(p, { force: true });
  });

  it('rejects a text file renamed .pdf', async () => {
    const p = tmp('fake.pdf', Buffer.from('just text not a pdf'));
    expect((await validateMagicBytes(p, 'pdf')).valid).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it('accepts a real DOCX (PK zip) signature', async () => {
    const p = tmp('ok.docx', Buffer.from([0x50, 0x4B, 0x03, 0x04, 0, 0, 0, 0]));
    expect((await validateMagicBytes(p, 'docx')).valid).toBe(true);
    fs.rmSync(p, { force: true });
  });

  it('rejects a fake docx', async () => {
    const p = tmp('fake.docx', Buffer.from('not a zip'));
    expect((await validateMagicBytes(p, 'docx')).valid).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it('rejects unsupported ext', async () => {
    const p = tmp('x.txt', Buffer.from('whatever'));
    expect((await validateMagicBytes(p, 'txt')).valid).toBe(false);
    fs.rmSync(p, { force: true });
  });
});
