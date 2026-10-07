const express = require('express');
const router = express.Router();
const Message = require('../models/Message');


router.get('/:room', async (req, res) => {
  try {
    const { room } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    const messages = await Message.find({ room })
      .sort({ createdAt: -1 }) 
      .limit(limit);

    messages.reverse(); 
   

    return res.status(200).json({ status: 'success', room, data: messages });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 'error', message: 'Server error while fetching message history.' });
  }
});

module.exports = router;
