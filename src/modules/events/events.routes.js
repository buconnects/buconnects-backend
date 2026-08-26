import express from 'express';
import crypto from 'crypto';
import db from '../../config/db.js';
import { authenticate } from '../../middlewares/authMiddleware.js';

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
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, category, date, time, venue, host, capacity, description, status } = req.body;
    const id = crypto.randomUUID();
    const created_by = req.user.id;

    const query = `
      INSERT INTO events (id, title, category, date, time, venue, host, capacity, status, description, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      created_by
    ]);

    const [newEvent] = await db.query('SELECT * FROM events WHERE id = ?', [id]);
    res.status(201).json(newEvent[0]);
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: 'Failed to create campus event' });
  }
});

export default router;