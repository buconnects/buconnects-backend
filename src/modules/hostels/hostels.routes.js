import express from 'express';
import crypto from 'crypto';
import db from '../../config/db.js';
import { authenticate } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// GET /api/hostels
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM hostels ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching hostels:', err);
    res.status(500).json({ error: 'Failed to fetch hostels' });
  }
});

// POST /api/hostels
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, location, price_range, amenities, contact_phone, description, cover_image } = req.body;
    const id = crypto.randomUUID();
    const created_by = req.user.id;

    const amenitiesJson = JSON.stringify(Array.isArray(amenities) ? amenities : []);

    const query = `
      INSERT INTO hostels (id, name, location, price_range, amenities, contact_phone, description, cover_image, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(query, [id, name, location, price_range, amenitiesJson, contact_phone, description, cover_image || null, created_by]);

    const [newHostel] = await db.query('SELECT * FROM hostels WHERE id = ?', [id]);
    res.status(201).json(newHostel[0]);
  } catch (err) {
    console.error('Error creating hostel:', err);
    res.status(500).json({ error: 'Failed to create hostel listing' });
  }
});

export default router;