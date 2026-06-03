import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import router from '../translate.js';
import { createRequire } from 'module';

// translate.js is a CommonJS module that vitest externalizes to native Node
// (it pulls in bull/multer/etc.). Its `require('../services/resultStore')`
// therefore resolves to the *native* module instance, not the ESM-transformed
// copy a plain `import` would give us. To share the same in-memory store the
// route reads from, we must save through that same native instance.
const require = createRequire(import.meta.url);
const { saveResult } = require('../../services/resultStore.js');

const app = express();
app.use('/api', router);

describe('GET /api/result/:token', () => {
  it('400 on bad token', async () => {
    const r = await request(app).get('/api/result/..%2f');
    expect(r.status).toBe(400);
  });
  it('404 on missing', async () => {
    const r = await request(app).get('/api/result/deadbeef-0000-1111');
    expect(r.status).toBe(404);
  });
  it('200 returns doc without usage, with no-store', async () => {
    saveResult('aaaabbbb-cccc-dddd', { schemaVersion:1, sourceLang:'he', targetLang:'en', blocks:[{id:'b0'}], usage:{secret:true} });
    const r = await request(app).get('/api/result/aaaabbbb-cccc-dddd');
    expect(r.status).toBe(200);
    expect(r.body.blocks).toHaveLength(1);
    expect(r.body.usage).toBeUndefined();          // usage stripped
    expect(r.headers['cache-control']).toMatch(/no-store/);
  });
});
