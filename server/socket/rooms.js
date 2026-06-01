/**
 * Per-session room helpers. A client connects with ?sessionId=<id> and is
 * joined to a room named by that id; progress events are emitted only to that
 * room so users never see each other's jobs.
 */
function registerRooms(io) {
  io.on('connection', (socket) => {
    const sid = socket.handshake.query && socket.handshake.query.sessionId;
    if (sid) socket.join(String(sid));
  });
}

function emitToSession(io, sessionId, event, payload) {
  if (!io) return;
  if (sessionId) io.to(String(sessionId)).emit(event, payload);
  // if no sessionId, do NOT broadcast (fail closed) — drop the event.
}

module.exports = { registerRooms, emitToSession };
