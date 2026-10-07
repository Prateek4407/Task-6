const jwt = require('jsonwebtoken');


 
function socketAuth(socket, next) {
  const token = socket.handshake.auth && socket.handshake.auth.token;

  if (!token) {
    return next(new Error('AUTH_NO_TOKEN'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

   
    socket.user = {
      id: decoded.id,
      name: decoded.name || decoded.email || `User-${String(decoded.id).slice(-4)}`,
      role: decoded.role
    };

    next(); 
  }    catch (err) {
    console.log('JWT VERIFY FAILED:', err.name, err.message);  
    if (err.name === 'TokenExpiredError') {
      return next(new Error('AUTH_TOKEN_EXPIRED'));
    }
    return next(new Error('AUTH_INVALID_TOKEN'));
  }
}

module.exports = socketAuth;
