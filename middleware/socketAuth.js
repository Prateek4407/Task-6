const jwt = require('jsonwebtoken');

/**
 * Authenticates a Socket.io connection at handshake time.
 *
 * This is a SEPARATE step from your HTTP authMiddleware. HTTP middleware
 * runs once per request; this runs exactly once, the moment a client
 * first tries to open the socket connection. If it rejects the
 * connection, the client's "connect" event never fires, and none of
 * your event handlers in chatHandlers.js are ever reached for that
 * client — there is no way to "sneak in" and emit an event afterward
 * without having passed this check first.
 *
 * The client sends the token in the handshake's `auth` payload:
 *   io(url, { auth: { token: '<jwt>' } })
 * NOT as a query string (?token=...) — query strings get logged by
 * proxies and browser history, which a token never should be.
 */
function socketAuth(socket, next) {
  const token = socket.handshake.auth && socket.handshake.auth.token;

  if (!token) {
    return next(new Error('AUTH_NO_TOKEN'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the identified user directly onto the socket instance.
    // Every event handler registered on this socket (see
    // chatHandlers.js) can now read socket.user without re-checking
    // the token — identity was already proven once, at the door.
    socket.user = {
      id: decoded.id,
      name: decoded.name || decoded.email || `User-${String(decoded.id).slice(-4)}`,
      role: decoded.role
    };

    next(); // allow the connection to proceed
  }    catch (err) {
    console.log('JWT VERIFY FAILED:', err.name, err.message);  // ADD THIS LINE
    if (err.name === 'TokenExpiredError') {
      return next(new Error('AUTH_TOKEN_EXPIRED'));
    }
    return next(new Error('AUTH_INVALID_TOKEN'));
  }
}

module.exports = socketAuth;