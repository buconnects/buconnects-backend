// backend/src/modules/chat/chat.routes.js
import express from 'express';
import db from '../../config/db.js'; // Your MySQL pool connection (mysql2/promise)

const router = express.Router();

/**
 * GET /api/chat/conversations/:userId
 * Retrieves recent contacts, last messages, timestamps, and unread counts
 */
router.get('/conversations/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const sql = `
      SELECT 
  u.id,
  u.name,
  u.email,
  m.message AS lastMessage,
  m.created_at AS lastMessageTime,
  COALESCE(
    (
      SELECT COUNT(*) 
      FROM messages 
      WHERE sender_id = u.id 
        AND receiver_id = ? 
        AND is_read = FALSE
    ), 0
  ) AS unreadCount
FROM users u
LEFT JOIN messages m ON (
  m.id = (
    SELECT id FROM messages 
    WHERE (sender_id = ? AND receiver_id = u.id) 
       OR (sender_id = u.id AND receiver_id = ?) 
    ORDER BY created_at DESC 
    LIMIT 1
  )
)
WHERE u.id != ?  -- Prevents showing yourself in your own chat list
ORDER BY m.created_at DESC;
    `;

    // Pass userId 3 times for the placeholders in the query
    const [rows] = await db.execute(sql, [userId, userId, userId]);

    res.status(200).json(rows);
  } catch (error) {
    console.error('Failed to fetch conversation list:', error);
    res.status(500).json({ error: 'Failed to retrieve active conversations.' });
  }
});

router.put('/read', async (req, res) => {
  const { currentUserId, targetUserId } = req.body;

  try {
    await db.execute(
      `UPDATE messages 
       SET is_read = TRUE 
       WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE`,
      [targetUserId, currentUserId]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to mark messages as read:', error);
    res.status(500).json({ error: 'Failed to update message status.' });
  }
});

export default router;