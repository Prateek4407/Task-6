require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const initSocket = require('./sockets');
const messageRoutes = require('./routes/messageRoutes');

const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serves the
// test client at http://localhost:8000/index.html

app.get('/', (req, res) => {
  res.send('Chat server is running');
});

app.use('/messages', messageRoutes); // bonus section only

// ---------------------------------------------------------------------
// ONE HTTP server, carrying BOTH Express and Socket.io. This is
// deliberate: http.createServer(app) wraps your existing Express app,
// and then Socket.io attaches to that SAME server object below — there
// is no second server, no second port. A plain GET / and a socket
// handshake both arrive on port 8000.
// ---------------------------------------------------------------------
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*' // fine for local development with a plain HTML test
    // client; in a real deployment this would be locked down to your
    // actual frontend's origin instead of allowing any site to connect.
  }
});

initSocket(io);

/**
 * Database connection is optional for the CORE task (Sections 1-7 need
 * no database at all — everything lives in the in-memory roomUsers map).
 * It's only required for the bonus persistence section. If MONGO_URI
 * isn't set, the chat still works live; only message history and
 * GET /messages/:room would be unavailable.
 */
async function start() {
  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('Connected to MongoDB');
    } catch (err) {
      console.error('MongoDB connection failed (chat will still work live, no history):', err.message);
    }
  } else {
    console.log('MONGO_URI not set — running without message persistence.');
  }

  httpServer.listen(port, () => {
    console.log(`Server (HTTP + Socket.io) running on PORT:${port}`);
  });
}

start();