const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

/**
 * GET /messages/:room
 *
 * Bonus section. Deliberately plain HTTP, not a socket event — this is
 * the ONE place this task intentionally has the two channels overlap:
 * writes happen inside a socket event handler (chat:message, in
 * chatHandlers.js), but reads happen over ordinary REST. A user joining
 * a room late uses this once, on load, to avoid staring at a blank
 * screen — they don't need a persistent connection just to fetch
 * history that already happened.
 */
router.get('/:room', async (req, res) => {
  try {
    const { room } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    const messages = await Message.find({ room })
      .sort({ createdAt: -1 }) // newest first out of the database...
      .limit(limit);

    messages.reverse(); // ...then flipped back to oldest-first, which
    // is the order a chat window actually reads top-to-bottom in.

    return res.status(200).json({ status: 'success', room, data: messages });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 'error', message: 'Server error while fetching message history.' });
  }
});

module.exports = router;