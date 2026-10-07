const mongoose = require('mongoose');


const messageSchema = new mongoose.Schema(
  {
    room: {
      type: String,
      required: true,
      trim: true,
      index: true 
     
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
  { timestamps: true } 
);

module.exports = mongoose.model('Message', messageSchema);
