import express from 'express';
import crypto from 'crypto';
import db from '../../config/db.js';
import { authenticate, authorize } from '../../middlewares/authMiddleware.js';
import { deleteCloudinaryMedia } from '../../utils/cloudinaryMedia.js';

const router = express.Router();

// GET /api/events
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM events ORDER BY date ASC, time ASC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch campus events' });
  }
});

// POST /api/events
router.post('/', authenticate, authorize('ADMIN', 'DEVELOPER'), async (req, res) => {
  try {
    const { title, category, date, time, venue, host, capacity, description, status, image_url } = req.body;
    const id = crypto.randomUUID();
    const created_by = req.user.id;

    const query = `
      INSERT INTO events (id, title, category, date, time, venue, host, capacity, status, description, image_url, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(query, [
      id,
      title,
      category || 'Workshop',
      date,
      time,
      venue,
      host || null,
      capacity || 'Open',
      status || 'Open for registration',
      description || null,
      image_url || null,
      created_by
    ]);

    const [newEvent] = await db.query('SELECT * FROM events WHERE id = ?', [id]);
    res.status(201).json(newEvent[0]);
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: 'Failed to create campus event' });
  }
});

router.delete('/:id/media', authenticate, authorize('ADMIN', 'DEVELOPER'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT image_url FROM events WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Event not found.' });

    await db.query('UPDATE events SET image_url = NULL WHERE id = ?', [req.params.id]);
    await deleteCloudinaryMedia(rows[0].image_url);
    return res.status(200).json({ id: req.params.id, image_url: null });
  } catch (err) {
    console.error('Error deleting event media:', err);
    return res.status(500).json({ error: 'Failed to delete event image.' });
  }
});

export default router;