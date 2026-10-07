const Message = require('../models/Message');


const roomUsers = new Map();

function getRoomMap(room) {
  if (!roomUsers.has(room)) {
    roomUsers.set(room, new Map());
  }
  return roomUsers.get(room);
}

function getOnlineUsersList(room) {
  const map = getRoomMap(room);
  return Array.from(map.values()); 
}

function emitOnlineUsers(io, room) {

  io.to(room).emit('chat:online-users', getOnlineUsersList(room));
}


function removeFromCurrentRoom(io, socket) {
  const room = socket.currentRoom;
  if (!room) return;

  const map = getRoomMap(room);
  map.delete(socket.id);

  socket.leave(room);

 
  io.to(room).emit('chat:user-left', {
    id: socket.user.id,
    name: socket.user.name,
    room
  });

  emitOnlineUsers(io, room);

  if (map.size === 0) {
    roomUsers.delete(room); 
  }

  socket.currentRoom = null;
}

function registerChatHandlers(io, socket) {
  
  socket.on('chat:join', (payload) => {
    const room = (payload && typeof payload.room === 'string' && payload.room.trim())
      ? payload.room.trim()
      : 'general'; 

  
    if (socket.currentRoom && socket.currentRoom !== room) {
      removeFromCurrentRoom(io, socket);
    }

    socket.join(room); 
  
    socket.currentRoom = room;

    getRoomMap(room).set(socket.id, { id: socket.user.id, name: socket.user.name });

   
    socket.to(room).emit('chat:system', {
      message: `${socket.user.name} joined the room.`,
      room,
      at: new Date().toISOString()
    });

    emitOnlineUsers(io, room);
  });

  
  socket.on('chat:message', async (payload) => {
    const room = socket.currentRoom;
    if (!room) {
      return socket.emit('chat:error', { message: 'Join a room before sending messages.' });
    }

    const text = payload && typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text) {
      return socket.emit('chat:error', { message: 'Message text cannot be empty.' });
    }
    if (text.length > 2000) {
      return socket.emit('chat:error', { message: 'Message is too long.' });
    }

.
    const message = {
      senderId: socket.user.id,
      senderName: socket.user.name,
      text,
      room,
      at: new Date().toISOString()
    };

    
    io.to(room).emit('chat:message', message);

   
    try {
      await Message.create({
        room,
        senderId: message.senderId,
        senderName: message.senderName,
        text: message.text
      });
    } catch (err) {
      console.error('Failed to persist message (chat still delivered live):', err.message);
    }
  });

 
  socket.on('chat:typing', (payload) => {
    const room = socket.currentRoom;
    if (!room) return;

    const isTyping = !!(payload && payload.isTyping);

    socket.to(room).emit('chat:typing', {
      id: socket.user.id,
      name: socket.user.name,
      isTyping
    });
  });

  
  socket.on('chat:leave', () => {
    removeFromCurrentRoom(io, socket);
  });

 
  socket.on('disconnect', () => {
    removeFromCurrentRoom(io, socket);
  });

  
  socket.on('error', (err) => {
    console.error(`Socket error from ${socket.id}:`, err.message);
  });
}

module.exports = registerChatHandlers;
