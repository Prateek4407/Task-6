const mongoose = require('mongoose');

/**
 * Bonus section only. Persists chat messages so GET /messages/:room
 * can return history to a user joining a room that already has activity.
 *
 * Notice what is NOT modeled here: there is no "online status" or
 * "typing" field anywhere in this schema. Those live only in the
 * in-memory roomUsers map in chatHandlers.js and are never meant to be
 * durable — only the message content itself is worth keeping.
 */
const messageSchema = new mongoose.Schema(
  {
    room: {
      type: String,
      required: true,
      trim: true,
      index: true // messages are always looked up BY room, so this
      // is the one field here worth indexing — same reasoning as
      // the course/createdAt indexes on Student.
    },
    senderId: {
      type: String,
      required: true
    },
    senderName: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    }
  },
  { timestamps: true } // createdAt doubles as the message's sent-at time
);

module.exports = mongoose.model('Message', messageSchema);