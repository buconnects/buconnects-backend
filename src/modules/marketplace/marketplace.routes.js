import express from 'express';
import crypto from 'node:crypto';
import db from '../../config/db.js';
import { authenticate, authorize } from '../../middlewares/authMiddleware.js';
import { deleteCloudinaryMedia } from '../../utils/cloudinaryMedia.js';

const router = express.Router();

// GET /api/marketplace - Fetch all marketplace listings matching your DB schema
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        id, 
        seller_id AS sellerId, 
        title, 
        description, 
        price, 
        category, 
        status, 
        images, 
        created_at AS createdAt, 
        updated_at AS updatedAt 
       FROM market_items 
       ORDER BY created_at DESC`
    );

    // Parse JSON images array if returned as string from DB
    const formattedItems = rows.map(item => ({
      ...item,
      images: typeof item.images === 'string' ? JSON.parse(item.images) : item.images
    }));

    res.status(200).json({
      items: formattedItems,
      message: 'Marketplace listings visible to authenticated users.'
    });
  } catch (error) {
    console.error('Error fetching marketplace items:', error);
    res.status(500).json({ error: 'Failed to fetch marketplace listings.' });
  }
});

// POST /api/marketplace - Insert a new item matching your DB column types
router.post('/', authenticate, authorize('ADMIN', 'DEVELOPER'), async (req, res) => {
  const { title, price, description, category, images } = req.body;

  if (!title || !price) {
    return res.status(400).json({ error: 'Title and price are required.' });
  }

  // Must fit varchar(36) primary key limit
  const itemId = crypto.randomUUID(); 
  
  // Extract user ID attached by authenticate middleware
  const sellerId = req.user?.id || req.user?.userId; 

  if (!sellerId) {
    return res.status(400).json({ error: 'Seller identity could not be verified.' });
  }

  // Ensure ENUM value uppercase matching ('AVAILABLE' / 'SOLD')
  const itemStatus = 'AVAILABLE';
  const itemCategory = category || 'General';
  const itemDescription = description || '';

  // Handle JSON array conversion for images column
  const imagesJson = Array.isArray(images) 
    ? JSON.stringify(images) 
    : JSON.stringify(images ? [images] : []);

  // Parse numeric string values to clean decimals
  const numericPrice = parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0.00;

  try {
    await db.query(
      `INSERT INTO market_items (id, seller_id, title, description, price, category, status, images) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemId, sellerId, title, itemDescription, numericPrice, itemCategory, itemStatus, imagesJson]
    );

    const newItem = {
      id: itemId,
      sellerId,
      title,
      description: itemDescription,
      price: numericPrice,
      category: itemCategory,
      status: itemStatus,
      images: JSON.parse(imagesJson),
      createdAt: new Date()
    };

    res.status(201).json({ 
      message: 'Market item created successfully.', 
      item: newItem 
    });
  } catch (error) {
    console.error('Error creating marketplace item:', error);
    res.status(500).json({ error: 'Failed to create marketplace item.' });
  }
});

router.delete('/:id/media', authenticate, authorize('ADMIN', 'DEVELOPER'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT images FROM market_items WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Marketplace item not found.' });

    let imageUrls = rows[0].images;
    if (typeof imageUrls === 'string') {
      try {
        imageUrls = JSON.parse(imageUrls);
      } catch {
        imageUrls = [imageUrls];
      }
    }

    const currentImages = Array.isArray(imageUrls) ? imageUrls : imageUrls ? [imageUrls] : [];
    const removedImages = req.body?.imageUrl
      ? currentImages.filter((url) => url === req.body.imageUrl)
      : currentImages;
    const remainingImages = req.body?.imageUrl
      ? currentImages.filter((url) => url !== req.body.imageUrl)
      : [];

    await db.query('UPDATE market_items SET images = ? WHERE id = ?', [JSON.stringify(remainingImages), req.params.id]);
    await deleteCloudinaryMedia(removedImages);
    return res.status(200).json({ id: req.params.id, images: remainingImages });
  } catch (error) {
    console.error('Error deleting marketplace media:', error);
    return res.status(500).json({ error: 'Failed to delete marketplace images.' });
  }
});

export default router;