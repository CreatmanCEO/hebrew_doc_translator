import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import { Server } from 'socket.io';
import { io as Client } from 'socket.io-client';
import { registerRooms, emitToSession } from '../rooms.js';

function setup() {
  const server = http.createServer();
  const io = new Server(server);
  registerRooms(io);
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ io, server, port: server.address().port }));
  });
}

describe('per-session socket rooms', () => {
  it('emit reaches only the matching session room', async () => {
    const { io, server, port } = await setup();
    const url = `http://localhost:${port}`;
    const a = Client(url, { query: { sessionId: 'A' } });
    const b = Client(url, { query: { sessionId: 'B' } });
    await new Promise(r => { let n = 0; const d = () => { if (++n === 2) r(); }; a.on('connect', d); b.on('connect', d); });

    let aGot = null, bGot = null;
    a.on('evt', (p) => { aGot = p; });
    b.on('evt', (p) => { bGot = p; });

    // give the server a tick to process the join, then emit to room A
    await new Promise(r => setTimeout(r, 100));
    emitToSession(io, 'A', 'evt', { hi: 1 });
    await new Promise(r => setTimeout(r, 150));

    expect(aGot).toEqual({ hi: 1 });
    expect(bGot).toBeNull(); // B must NOT receive A's event

    a.close(); b.close(); io.close(); server.close();
  });

  it('emit with no sessionId is dropped (fail closed, no broadcast)', async () => {
    const { io, server, port } = await setup();
    const url = `http://localhost:${port}`;
    const a = Client(url, { query: { sessionId: 'A' } });
    await new Promise(r => a.on('connect', r));

    let aGot = null;
    a.on('evt', (p) => { aGot = p; });

    await new Promise(r => setTimeout(r, 100));
    emitToSession(io, undefined, 'evt', { hi: 2 });
    await new Promise(r => setTimeout(r, 150));

    expect(aGot).toBeNull(); // no sessionId => dropped, not broadcast

    a.close(); io.close(); server.close();
  });
});
