import express from 'express';
import crypto from 'crypto';
import db from '../../config/db.js';
import { authenticate } from '../../middlewares/authMiddleware.js';

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

// POST /api/updates
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, summary, content, category, audience, priority } = req.body;
    const id = crypto.randomUUID();
    
    // Fall back to summary or title if content isn't passed directly
    const announcementContent = content || summary || title;
    const authorId = req.user.id || req.user.userId;

    const query = `
      INSERT INTO announcements (id, title, content, category, audience, priority, author_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(query, [
      id,
      title,
      announcementContent,
      category || 'GENERAL',
      audience || 'All students',
      priority || 'Medium',
      authorId
    ]);

    const [newUpdate] = await db.query('SELECT * FROM announcements WHERE id = ?', [id]);
    res.status(201).json(newUpdate[0]);
  } catch (err) {
    console.error('Error creating announcement:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;