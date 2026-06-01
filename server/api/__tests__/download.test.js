import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import router from '../translate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use('/api', router);

// The download route reads from path.join(__dirname, '../uploads') where its
// __dirname is server/api, i.e. server/uploads. This test file lives in
// server/api/__tests__, so server/uploads is one level up from server/api.
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

describe('GET /api/download/:filename', () => {
  it('rejects path traversal with 400', async () => {
    const res = await request(app).get('/api/download/..%2f..%2f.env');
    expect(res.status).toBe(400);
  });

  it('rejects non-translated filename with 400', async () => {
    const res = await request(app).get('/api/download/secret.pdf');
    expect(res.status).toBe(400);
  });

  it('404 for valid-form but missing file', async () => {
    const res = await request(app).get('/api/download/translated_deadbeef-0000.pdf');
    expect(res.status).toBe(404);
  });

  it('streams an existing translated file', async () => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    // UUID-shaped (hex + hyphens) name, matching crypto.randomUUID() output the
    // queue processor produces and the download validation regex.
    const name = 'translated_deadbeef-0000-4000-8000-abcdef123456.pdf';
    fs.writeFileSync(path.join(uploadsDir, name), '%PDF-1.4 test');
    const res = await request(app).get('/api/download/' + name);
    expect(res.status).toBe(200);
    fs.rmSync(path.join(uploadsDir, name), { force: true });
  });
});
