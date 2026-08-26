// src/controllers/notification.controller.js
import db from '../config/db.js';

export const getUserNotifications = async (req, res) => {
  console.log('--- [CONTROLLER] Received req.user ---:', req.user);
  try {
    // Check all potential paths where the ID might reside on req or req.user
    const userId = 
      req.user?.id || 
      req.user?.user_id || 
      req.user?.userId || 
      req.user?.user?.id || 
      req.user?.user?.user_id || 
      req.userId;

      console.log('--- [CONTROLLER] Extracted userId ---:', userId);

    if (!userId) {
      console.error('--- [CONTROLLER] FAILED: userId is missing/falsy ---');
      return res.status(400).json({ 
        error: 'User ID missing from authentication token.',
       debugPayload: req.user || 'req.user was undefined'
      });
    }

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
    console.error('--- [CONTROLLER] Database/Execution Error ---:', err);
    res.status(500).json({ error: err.message });
  }
};


// src/controllers/notification.controller.js

export const markNotificationsRead = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ error: 'User ID missing from authentication token.' });
    }

    // Optional: if body contains specific notification IDs, update those; otherwise mark all as read for the user
    const { notificationIds } = req.body || {};

    if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      await db.query(
        `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (?)`,
        [userId, notificationIds]
      );
    } else {
      await db.query(
        `UPDATE notifications SET is_read = 1 WHERE user_id = ?`,
        [userId]
      );
    }

    res.status(200).json({ message: 'Notifications marked as read' });
  } catch (err) {
    console.error('Error marking notifications read:', err);
    res.status(500).json({ error: err.message });
  }
};