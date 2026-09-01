// src/routes/user.routes.js
import express from 'express';
import db from '../config/db.js';
import { authenticate, authenticate as verifyToken } from '../middlewares/authMiddleware.js'; // Aliased to fix named export
import { upload } from '../middlewares/upload.middleware.js'; 
import { getUserNotifications, markNotificationsRead } from'../controllers/notification.controller.js';
import { getSettings, updateSettings, updatePassword } from '../controllers/settings.controller.js';

const router = express.Router();

// 1. Upload file attachment
router.post('/upload', verifyToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  const isImage = req.file.mimetype.startsWith('image/');

  res.status(200).json({
    fileUrl,
    fileName: req.file.originalname,
    messageType: isImage ? 'image' : 'file'
  });
});

// 2. REST route to mark conversation messages as read
router.post('/read', verifyToken, async (req, res) => {
  const { senderId } = req.body; // User whose sent messages are being read
  const receiverId = req.user.id;

  try {
    await db.query(
      `UPDATE messages 
       SET is_read = TRUE, read_at = NOW() 
       WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE`,
      [senderId, receiverId]
    );

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update read status' });
  }
});

// 3. GET /api/users/conversations/:userId
router.get('/conversations/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const sql = `
      SELECT 
        u.id,
        u.full_name AS name,
        u.email,
        u.avatar_url AS avatar_url,
        u.avatar_url AS avatarUrl,
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
      WHERE u.id != ?
      ORDER BY m.created_at DESC;
    `;

    const [rows] = await db.execute(sql, [userId, userId, userId, userId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// 4. GET /api/users/history/:roomId (Includes attachment & read fields)
router.get('/history/:roomId', async (req, res) => {
  const { roomId } = req.params;

  try {
    const sql = `
      SELECT 
        id,
        room_id,
        sender_id,
        receiver_id,
        message,
        message_type,
        file_url,
        file_name,
        is_read,
        created_at
      FROM messages
      WHERE room_id = ?
      ORDER BY created_at ASC
    `;

    const [rows] = await db.execute(sql, [roomId]);
    
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to retrieve message history' });
  }
});

// 5. Get and update the authenticated user's profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, full_name AS fullName, email, phone_number AS phoneNumber,
              campus, role, avatar_url AS avatarUrl, created_at AS createdAt
       FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'User profile not found' });
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

router.put('/profile', verifyToken, upload.single('avatar'), async (req, res) => {
  const { fullName, phoneNumber, campus } = req.body;

  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Full name is required' });
  }

  if (req.file && !req.file.mimetype.startsWith('image/')) {
    return res.status(400).json({ error: 'Profile picture must be an image' });
  }

  try {
    const avatarUrl = req.file
      ? `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
      : null;

    if (avatarUrl) {
      await db.execute(
        `UPDATE users SET full_name = ?, phone_number = ?, campus = ?, avatar_url = ? WHERE id = ?`,
        [fullName.trim(), phoneNumber?.trim() || null, campus?.trim() || null, avatarUrl, req.user.id]
      );
    } else {
      await db.execute(
        `UPDATE users SET full_name = ?, phone_number = ?, campus = ? WHERE id = ?`,
        [fullName.trim(), phoneNumber?.trim() || null, campus?.trim() || null, req.user.id]
      );
    }

    const [rows] = await db.execute(
      `SELECT id, full_name AS fullName, email, phone_number AS phoneNumber,
              campus, role, avatar_url AS avatarUrl, created_at AS createdAt
       FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    );

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.get('/settings', verifyToken, getSettings);
router.put('/settings', verifyToken, updateSettings);
router.put('/settings/password', verifyToken, updatePassword);

// routes/users.js or server.js
router.get('/', verifyToken, async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, full_name AS name, email, campus, is_online AS isOnline FROM users'
    );
    res.status(200).json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

router.post('/notifications/mark-read', authenticate, markNotificationsRead)

// backend/routes/user.routes.js
router.get('/notifications', verifyToken, getUserNotifications, async (req, res) => {
  try {
    const userId = req.user.id; // Extracted from JWT auth middleware

    // Fetch latest notifications for the active user
    const [rows] = await db.query(
      `SELECT id, title, message, is_read AS isRead, created_at AS createdAt 
       FROM notifications 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [userId]
    );

    res.status(200).json(rows);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

export default router;