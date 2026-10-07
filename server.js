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
app.use(express.static(path.join(__dirname, 'public'))); 


app.get('/', (req, res) => {
  res.send('Chat server is running');
});

app.use('/messages', messageRoutes); 


const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*' 
    
  }
});

initSocket(io);


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
