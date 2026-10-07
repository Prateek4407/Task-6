const socketAuth = require('../middleware/socketAuth');
const registerChatHandlers = require('./chatHandlers');

/**
 * Wires Socket.io up to this app. Called once from server.js, after the
 * Socket.io server has been created and attached to the same underlying
 * HTTP server Express uses (never a second server on a second port —
 * see Section 1 of the task).
 */
function initSocket(io) {
  // io.use(...) runs this middleware for EVERY incoming connection
  // attempt, before the 'connection' event below ever fires. A
  // rejected handshake (next(new Error(...))) never reaches anything
  // past this point.
  io.use(socketAuth);

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (user: ${socket.user.name})`);

    registerChatHandlers(io, socket);

    // Note: this console.log is separate from the 'disconnect' handler
    // inside chatHandlers.js — that one does the actual room cleanup;
    // this one is purely for server-side visibility/logging.
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });
}

module.exports = initSocket;