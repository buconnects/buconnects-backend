import express from 'express';
import path from 'path';
import multer from 'multer';
import webpush from 'web-push';
import pool from '../config/db.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { randomUUID } from 'crypto';

const router = express.Router();

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  return authenticate(req, res, next);
};

const sendPushNotificationToUser = async (userId, title, body, data = {}) => {
  if (!userId) return;

  try {
    const [rows] = await pool.execute(
      'SELECT subscription_json FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );

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
        actions: title.toLowerCase().includes('like')
          ? [{ action: 'view_post', title: 'View post' }]
          : [{ action: 'open_app', title: 'Open' }],
        data: { url: data.url || '/dashboard', postUrl: data.url || '/dashboard' },
      });

      await webpush.sendNotification(subscription, payload).catch((err) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.warn('Expired push subscription removed for user:', userId);
        }
      });
    }
  } catch (err) {
    console.error('Push notification error:', err);
  }
};

const notifyPostAuthor = async ({ postId, actorId, title, message }) => {
  try {
    const [rows] = await pool.execute('SELECT author_id FROM posts WHERE id = ? LIMIT 1', [postId]);
    const recipientId = rows[0]?.author_id;
    if (recipientId && String(recipientId) !== String(actorId)) {
      await pool.execute(
        `INSERT INTO notifications (user_id, title, message, is_read, created_at)
         VALUES (?, ?, ?, FALSE, NOW())`,
        [recipientId, title, message]
      );

      await sendPushNotificationToUser(recipientId, title, message, { url: '/dashboard' });
    }
  } catch (err) {
    console.error('Notification error:', err);
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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are supported.'));
    }
  }
});

// GET ALL POSTS
router.get('/', optionalAuth, async (req, res) => {
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
        // Keep as string if single URL
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
    responseMediaUrl = `/uploads/${req.file.filename}`;
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

// TOGGLE LIKE ON A POST
router.post('/:id/like', authenticate, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  const userName = req.user.fullName || req.user.userName || req.user.name || 'Someone';

  try {
    const [existing] = await pool.execute(
      'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?',
      [postId, userId]
    );

    if (existing.length > 0) {
      await pool.execute('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
      return res.status(200).json({ message: 'Unliked successfully', isLiked: false });
    } else {
      await pool.execute(
        'INSERT INTO post_likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, NOW())',
        [randomUUID(), postId, userId]
      );

      await notifyPostAuthor({
        postId,
        actorId: userId,
        title: 'New Like',
        message: `${userName} liked your post.`
      });

      return res.status(200).json({ message: 'Liked successfully', isLiked: true });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    return res.status(500).json({ error: 'Failed to toggle like.' });
  }
});

// ADD A COMMENT TO A POST
router.post('/:id/comments', authenticate, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  const { content, comment } = req.body;
  const commentText = content || comment;
  const userName = req.user.fullName || req.user.userName || req.user.name || 'Someone';

  if (!commentText || !commentText.trim()) {
    return res.status(400).json({ error: 'Comment content is required.' });
  }

  try {
    const commentId = randomUUID();
    await pool.execute(
      `INSERT INTO post_comments (id, post_id, author_id, comment, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [commentId, postId, userId, commentText.trim()]
    );

    await notifyPostAuthor({
      postId,
      actorId: userId,
      title: 'New Comment',
      message: `${userName} commented on your post.`
    });

    const newComment = {
      id: commentId,
      postId,
      authorId: userId,
      authorName: userName,
      comment: commentText.trim(),
      createdAt: new Date()
    };

    return res.status(201).json(newComment);
  } catch (error) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ error: 'Failed to add comment.' });
  }
});

// DELETE A COMMENT
router.delete('/:id/comments/:commentId', authenticate, async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user.id;

  try {
    await pool.execute(
      'DELETE FROM post_comments WHERE id = ? AND author_id = ?',
      [commentId, userId]
    );
    res.status(200).json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

export default router;