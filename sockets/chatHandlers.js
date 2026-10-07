const Message = require('../models/Message');

/**
 * ---- In-memory state ----
 *
 * This is NOT a database. It lives only in this running process's RAM.
 *
 * roomUsers: Map<roomName, Map<socketId, { id, name }>>
 *   Who is currently in each room. Rebuilt from nothing every time the
 *   server restarts — if you redeploy or the process crashes, every
 *   room empties out immediately, even though the underlying users are
 *   probably still "logged in" from the HTTP/JWT side of things. This
 *   is the exact thing Section 6 of the task asks you to be able to
 *   explain: there is no persistence for "who's online" by design —
 *   only chat MESSAGES are optionally persisted (the bonus section),
 *   never presence/room-membership state.
 *
 * If you ever ran two instances of this server behind a load balancer
 * (explicitly out of scope for this task), each instance would have
 * its OWN separate roomUsers map, with no idea what the other instance
 * knows — that's exactly the kind of horizontal-scaling problem a
 * Redis adapter exists to solve, which the task tells you not to touch.
 */
const roomUsers = new Map();

function getRoomMap(room) {
  if (!roomUsers.has(room)) {
    roomUsers.set(room, new Map());
  }
  return roomUsers.get(room);
}

function getOnlineUsersList(room) {
  const map = getRoomMap(room);
  return Array.from(map.values()); // [{ id, name }, ...]
}

function emitOnlineUsers(io, room) {
  // server -> room. Sent to EVERYONE currently in the room (including
  // whoever just triggered the change), since the whole point is that
  // everyone's view of "who's here" needs to match.
  io.to(room).emit('chat:online-users', getOnlineUsersList(room));
}

/**
 * Removes a socket from whichever room it was in, and tells that room
 * it left. Used both by an explicit "leave" and by an unclean
 * disconnect (closed tab, lost network) — the task is explicit that
 * these two cases must be handled identically, since a closed browser
 * tab never sends a polite "I'm leaving" message first.
 */
function removeFromCurrentRoom(io, socket) {
  const room = socket.currentRoom;
  if (!room) return;

  const map = getRoomMap(room);
  map.delete(socket.id);

  socket.leave(room);

  // server -> room (sender already removed from the map above, so this
  // naturally excludes them from the online-users list that follows)
  io.to(room).emit('chat:user-left', {
    id: socket.user.id,
    name: socket.user.name,
    room
  });

  emitOnlineUsers(io, room);

  if (map.size === 0) {
    roomUsers.delete(room); // don't leak empty rooms forever
  }

  socket.currentRoom = null;
}

function registerChatHandlers(io, socket) {
  /**
   * chat:join   — client -> server
   * payload: { room: string }
   */
  socket.on('chat:join', (payload) => {
    const room = (payload && typeof payload.room === 'string' && payload.room.trim())
      ? payload.room.trim()
      : 'general'; // default room, per Section 3

    // A socket can only be in one chat room at a time in this app —
    // joining a new one first cleanly leaves the old one.
    if (socket.currentRoom && socket.currentRoom !== room) {
      removeFromCurrentRoom(io, socket);
    }

    socket.join(room); // Socket.io's own room support — we never
    // hand-roll membership tracking for WHICH SOCKETS ARE IN WHICH
    // SOCKET.IO ROOM; io.to(room).emit(...) relies entirely on this.
    socket.currentRoom = room;

    getRoomMap(room).set(socket.id, { id: socket.user.id, name: socket.user.name });

    // server -> room, EXCLUDING the user who just joined (Section 3:
    // "but not back to the user who just joined"). socket.to(...)
    // (as opposed to io.to(...)) broadcasts to everyone in the room
    // EXCEPT the socket that called it.
    socket.to(room).emit('chat:system', {
      message: `${socket.user.name} joined the room.`,
      room,
      at: new Date().toISOString()
    });

    emitOnlineUsers(io, room);
  });

  /**
   * chat:message   — client -> server, then server -> room (everyone,
   * sender included — Section 4 is explicit about this)
   * client sends: { text: string }
   * server broadcasts: { id, senderId, senderName, text, room, at }
   */
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

    // The server decides WHO sent this and WHEN — never the client.
    // A client could easily send { senderName: "admin", text: "..." }
    // trying to impersonate someone; we never read those fields from
    // payload at all, so there's nothing to trust or distrust there.
    const message = {
      senderId: socket.user.id,
      senderName: socket.user.name,
      text,
      room,
      at: new Date().toISOString()
    };

    // io.to(room) — not socket.to(room) — because the sender should
    // see their own message appear too, same as any real chat app.
    io.to(room).emit('chat:message', message);

    // Bonus: persistence. Only runs if Message/MongoDB is wired up;
    // failing to save never breaks the live chat for anyone, since the
    // broadcast above has already happened regardless.
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

  /**
   * chat:typing   — client -> server -> room, EXCLUDING the typer
   * payload: { isTyping: boolean }
   *
   * Deliberately never written to the database. A chat message is
   * content someone actually sent; a typing flicker is just a transient
   * UI hint with no meaning once the moment has passed — saving it would
   * bloat storage for something nobody will ever want to look back at.
   */
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

  /**
   * chat:leave   — client -> server (explicit leave, as opposed to a
   * disconnect)
   */
  socket.on('chat:leave', () => {
    removeFromCurrentRoom(io, socket);
  });

  /**
   * disconnect — Socket.io's own built-in event, fires automatically
   * on ANY disconnection: explicit, network loss, or a closed tab.
   * There is no separate "goodbye" message to wait for — this is the
   * ONE place that's guaranteed to run no matter how the connection
   * ended, which is exactly why cleanup lives here rather than only
   * in chat:leave above.
   */
  socket.on('disconnect', () => {
    removeFromCurrentRoom(io, socket);
  });

  /**
   * Catches a client sending a socket event with completely malformed
   * data (e.g. not valid JSON) that Socket.io itself couldn't even
   * parse into our handlers above. Keeps one bad client from crashing
   * the whole process or breaking other users' connections.
   */
  socket.on('error', (err) => {
    console.error(`Socket error from ${socket.id}:`, err.message);
  });
}

module.exports = registerChatHandlers;