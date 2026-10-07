const socketAuth = require('../middleware/socketAuth');
const registerChatHandlers = require('./chatHandlers');


function initSocket(io) {
  
  io.use(socketAuth);

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (user: ${socket.user.name})`);

    registerChatHandlers(io, socket);


    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });
}

module.exports = initSocket;
