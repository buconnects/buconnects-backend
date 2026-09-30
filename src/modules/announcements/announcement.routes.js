import express from 'express';
import crypto from 'crypto';
import webpush from 'web-push';
import db from '../../config/db.js';
import { authenticate, authorize } from '../../middlewares/authMiddleware.js';
import { deleteCloudinaryMedia } from '../../utils/cloudinaryMedia.js';

const router = express.Router();

// GET /api/updates
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM announcements ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching announcements:', err);
    res.status(500).json({ error: 'Failed to fetch campus updates' });
  }
});

const sendPushNotificationToAllSubscribers = async (title, body) => {
  try {
    const [rows] = await db.query('SELECT user_id, subscription_json FROM push_subscriptions');

    for (const row of rows) {
      if (!row.subscription_json) continue;

      const subscription = typeof row.subscription_json === 'string'
        ? JSON.parse(row.subscription_json)
        : row.subscription_json;

      const payload = JSON.stringify({
        title,
        body,
        icon: '/icon.png',
        badge: '/icon.png',
        actions: [{ action: 'open_app', title: 'Open' }],
        data: { url: '/dashboard' },
      });

      await webpush.sendNotification(subscription, payload).catch((err) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.warn('Expired push subscription removed for user:', row.user_id);
        }
      });
    }
  } catch (err) {
    console.error('Announcement push notification error:', err);
  }
};

// POST /api/updates
router.post('/', authenticate, authorize('ADMIN', 'DEVELOPER'), async (req, res) => {
  try {
    const { title, summary, content, category, audience, priority, image_url } = req.body;
    const id = crypto.randomUUID();
    
    // Fall back to summary or title if content isn't passed directly
    const announcementContent = content || summary || title;
    const authorId = req.user.id || req.user.userId;

    const query = `
      INSERT INTO announcements (id, title, content, category, audience, priority, image_url, author_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(query, [
      id,
      title,
      announcementContent,
      category || 'GENERAL',
      audience || 'All students',
      priority || 'Medium',
      image_url || null,
      authorId
    ]);

    const notificationTitle = 'Campus Update';
    const notificationBody = `${title} is now live.`;
    await sendPushNotificationToAllSubscribers(notificationTitle, notificationBody);

    const [newUpdate] = await db.query('SELECT * FROM announcements WHERE id = ?', [id]);
    res.status(201).json(newUpdate[0]);
  } catch (err) {
    console.error('Error creating announcement:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/media', authenticate, authorize('ADMIN', 'DEVELOPER'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT image_url FROM announcements WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Campus update not found.' });

    await db.query('UPDATE announcements SET image_url = NULL WHERE id = ?', [req.params.id]);
    await deleteCloudinaryMedia(rows[0].image_url);
    return res.status(200).json({ id: req.params.id, image_url: null });
  } catch (err) {
    console.error('Error deleting announcement media:', err);
    return res.status(500).json({ error: 'Failed to delete update image.' });
  }
});

export default router;