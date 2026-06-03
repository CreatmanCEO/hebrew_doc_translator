import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let app;
beforeAll(() => {
  process.env.ADMIN_KEY = 'secret123';
  const router = require('../translate.js');           // CJS instance
  const { saveResult } = require('../../services/resultStore.js'); // same instance as route
  saveResult('admintok-1111-2222', { schemaVersion:1, blocks:[], usage:{
    byModel:{ 'gemini/gemini-2.0-flash': {calls:2,in:150,out:50,total:200,costUsd:0.0015} },
    totals:{ calls:2,in:150,out:50,total:200,costUsd:0.0015 }, owner:'anon', jobId:'1', ts:1 } });
  app = express(); app.use('/api', router);
});

describe('GET /api/admin/usage', () => {
  it('401 without key', async () => {
    const r = await request(app).get('/api/admin/usage');
    expect(r.status).toBe(401);
  });
  it('401 with wrong key', async () => {
    const r = await request(app).get('/api/admin/usage').set('x-admin-key','nope');
    expect(r.status).toBe(401);
  });
  it('200 with valid key, grouped by owner', async () => {
    const r = await request(app).get('/api/admin/usage').set('x-admin-key','secret123');
    expect(r.status).toBe(200);
    expect(r.body.byOwner.anon.total).toBeGreaterThanOrEqual(200);
    expect(Array.isArray(r.body.jobs)).toBe(true);
  });
});
