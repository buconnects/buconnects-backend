import express from 'express';
import path from 'path';
import multer from 'multer';
import pool from '../config/db.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { randomUUID } from 'crypto';

const router = express.Router();

const notifyPostAuthor = async ({ postId, actorId, title, message }) => {
  const [rows] = await pool.execute('SELECT author_id FROM posts WHERE id = ? LIMIT 1', [postId]);
  const recipientId = rows[0]?.author_id;
  if (recipientId && String(recipientId) !== String(actorId)) {
    await pool.execute(
      `INSERT INTO notifications (user_id, title, message, is_read, created_at)
       VALUES (?, ?, ?, FALSE, NOW())`,
      [recipientId, title, message]
    );
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are supported.'));
    }
  }
});

// GET ALL POSTS (Made public or optional-auth to prevent unexpected 401s)
router.get('/', async (req, res) => {
  const currentUserId = req.user?.id || null;

  try {
    const [posts] = await pool.execute(
      `SELECT 
        p.id,
        p.author_id AS authorId,
        p.author_name AS authorName,
        p.campus,
        p.content,
        p.media_urls AS mediaUrls,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        COUNT(DISTINCT l.id) AS likesCount,
        COUNT(DISTINCT c.id) AS commentsCount,
        EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = ?) AS isLikedByMe
       FROM posts p
       LEFT JOIN post_likes l ON p.id = l.post_id
       LEFT JOIN post_comments c ON p.id = c.post_id
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [currentUserId]
    );

    const postIds = posts.map((post) => post.id);
    let commentsMap = {};

    if (postIds.length > 0) {
      const [comments] = await pool.query(
        `SELECT 
          c.id, 
          c.post_id AS postId, 
          c.author_id AS authorId, 
          c.comment, 
          c.created_at AS createdAt,
          u.full_name AS authorName
         FROM post_comments c
         LEFT JOIN users u ON c.author_id = u.id
         WHERE c.post_id IN (?) 
         ORDER BY c.created_at ASC`,
        [postIds]
      );

      comments.forEach((c) => {
        if (!commentsMap[c.postId]) commentsMap[c.postId] = [];
        commentsMap[c.postId].push(c);
      });
    }

    const formattedPosts = posts.map((post) => {
      let parsedMedia = post.mediaUrls;
      try {
        parsedMedia = JSON.parse(post.mediaUrls);
      } catch (e) {
        // Keep string if single URL
      }

      return {
        ...post,
        mediaUrls: parsedMedia,
        isLikedByMe: Boolean(post.isLikedByMe),
        comments: commentsMap[post.id] || []
      };
    });

    res.json(formattedPosts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Failed to retrieve posts.' });
  }
});

// CREATE A POST
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  const { content, campus } = req.body;
  const authorId = req.user.id;
  const authorName = req.user.fullName || req.user.userName || req.user.name || 'Anonymous';
  const userCampus = campus || req.user.campus || 'Main Campus';

  if (!content && !req.file) {
    return res.status(400).json({ error: 'Post must contain text or a media file.' });
  }

  let mediaUrlArray = null;
  let responseMediaUrl = null;

  if (req.file) {
    responseMediaUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    mediaUrlArray = JSON.stringify([responseMediaUrl]); 
  }

  try {
    const postId = randomUUID();

    await pool.execute(
      `INSERT INTO posts (id, author_id, author_name, campus, content, media_urls) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [postId, authorId, authorName, userCampus, content || '', mediaUrlArray]
    );

    const newPost = {
      id: postId,
      authorId,
      authorName,
      campus: userCampus,
      content: content || '',
      mediaUrls: responseMediaUrl,
      likesCount: 0,
      commentsCount: 0,
      isLikedByMe: false,
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    res.status(201).json(newPost);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

export default router;