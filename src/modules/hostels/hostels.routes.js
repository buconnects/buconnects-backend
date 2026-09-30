import express from 'express';
import crypto from 'crypto';
import db from '../../config/db.js';
import { authenticate, authorize } from '../../middlewares/authMiddleware.js';
import { deleteCloudinaryMedia } from '../../utils/cloudinaryMedia.js';

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
router.post('/', authenticate, authorize('ADMIN', 'DEVELOPER'), async (req, res) => {
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

router.delete('/:id/media', authenticate, authorize('ADMIN', 'DEVELOPER'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT cover_image FROM hostels WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Hostel listing not found.' });

    await db.query('UPDATE hostels SET cover_image = NULL WHERE id = ?', [req.params.id]);
    await deleteCloudinaryMedia(rows[0].cover_image);
    return res.status(200).json({ id: req.params.id, cover_image: null });
  } catch (err) {
    console.error('Error deleting hostel media:', err);
    return res.status(500).json({ error: 'Failed to delete hostel image.' });
  }
});

export default router;