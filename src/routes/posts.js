import express from 'express';
import path from 'path';
import multer from 'multer';
import mysql from 'mysql2/promise';
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

// ============================================================================
// MYSQL POOL CONNECTION CONFIG
// ============================================================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'buconnects',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ============================================================================
// MULTER FILE UPLOAD STORAGE CONFIG
// ============================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Ensure the 'uploads/' folder exists in your project root
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 50MB max file size limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are supported.'));
    }
  }
});

// ============================================================================
// 1. GET ALL POSTS (Includes Likes Count, Comments List, and IsLiked Status)
// ============================================================================
router.get('/', authenticate, async (req, res) => {
  const currentUserId = req.user.id;

  try {
    // Retrieve all posts with aggregated counts and user like status
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

    // Fetch comments for all returned posts matching post_comments table (author_id, comment)
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

    // Format final JSON structure
    const formattedPosts = posts.map((post) => {
      let parsedMedia = post.mediaUrls;
      try {
        parsedMedia = JSON.parse(post.mediaUrls);
      } catch (e) {
        // Keeps as string if single URL or null
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

// ============================================================================
// 2. CREATE A POST (Stores into posts table)
// ============================================================================
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  const { content, campus } = req.body;
  const authorId = req.user.id;
  const authorName = req.user.fullName || req.user.userName || req.user.name || 'Anonymous';
  const userCampus = campus || req.user.campus || 'Main Campus';

  if (!content && !req.file) {
    return res.status(400).json({ error: 'Post must contain text or a media file.' });
  }

  // Format mediaUrls strictly for MySQL JSON column rules
  let mediaUrlArray = null;
  let responseMediaUrl = null;

  if (req.file) {
    responseMediaUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    // Wrap in JSON string array format for MySQL
    mediaUrlArray = JSON.stringify([responseMediaUrl]); 
  }

  try {
    const postId = randomUUID(); // Generate UUID for posts.id

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
      mediaUrls: responseMediaUrl, // Return clean single string or array to frontend
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

// 3. REPOST AN EXISTING POST
router.post('/:id/repost', authenticate, async (req, res) => {
  const postId = req.params.id;
  const authorId = req.user.id;
  const authorName = req.user.fullName || req.user.userName || req.user.name || 'Anonymous';

  try {
    const [originalRows] = await pool.execute(
      `SELECT id, author_name AS originalAuthorName, campus, content, media_urls AS mediaUrls
       FROM posts WHERE id = ? LIMIT 1`,
      [postId]
    );

    if (originalRows.length === 0) return res.status(404).json({ error: 'Original post not found.' });

    const original = originalRows[0];
    const repostId = randomUUID();
    const repostContent = `Reposted from ${original.originalAuthorName || 'Campus User'}\n\n${original.content || ''}`;

    await pool.execute(
      `INSERT INTO posts (id, author_id, author_name, campus, content, media_urls)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [repostId, authorId, authorName, original.campus, repostContent, original.mediaUrls]
    );

    let mediaUrls = original.mediaUrls;
    try {
      mediaUrls = JSON.parse(original.mediaUrls);
    } catch (error) {
      // Keep legacy single-URL values unchanged.
    }

    res.status(201).json({
      id: repostId,
      authorId,
      authorName,
      campus: original.campus,
      content: repostContent,
      mediaUrls,
      likesCount: 0,
      commentsCount: 0,
      isLikedByMe: false,
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      isRepost: true,
    });
  } catch (error) {
    console.error('Error reposting post:', error);
    res.status(500).json({ error: 'Failed to repost post.' });
  }
});

// ============================================================================
// 3. TOGGLE LIKE / UNLIKE (Stores into post_likes table)
// ============================================================================
router.post('/:id/like', authenticate, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;

  try {
    const [existing] = await pool.execute(
      `SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?`,
      [postId, userId]
    );

    if (existing.length > 0) {
      // Unlike
      await pool.execute(
        `DELETE FROM post_likes WHERE post_id = ? AND user_id = ?`,
        [postId, userId]
      );
      return res.json({ success: true, status: 'unliked', postId });
    } else {
      // Like (Generate UUID for id)
      const likeId = randomUUID();

      await pool.execute(
        `INSERT INTO post_likes (id, post_id, user_id) VALUES (?, ?, ?)`,
        [likeId, postId, userId]
      );

      await notifyPostAuthor({
        postId,
        actorId: userId,
        title: 'New like',
        message: `${req.user.fullName || req.user.name || 'Someone'} liked your post.`,
      });

      return res.json({ success: true, status: 'liked', postId });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ error: 'Failed to update like status.' });
  }
});
// ============================================================================
// 4. ADD A COMMENT (Stores into post_comments table)
// ============================================================================
router.post('/:id/comments', authenticate, async (req, res) => {
  const postId = req.params.id;
  const { comment } = req.body;
  const authorId = req.user.id;
  const authorName = req.user.fullName || req.user.userName || req.user.name || 'Anonymous';

  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: 'Comment text cannot be empty.' });
  }

  try {
    const commentId = randomUUID(); // Generate UUID

    await pool.execute(
      `INSERT INTO post_comments (id, post_id, author_id, comment) VALUES (?, ?, ?, ?)`,
      [commentId, postId, authorId, comment.trim()]
    );

    await notifyPostAuthor({
      postId,
      actorId: authorId,
      title: 'New comment',
      message: `${req.user.fullName || req.user.name || 'Someone'} commented on your post.`,
    });

    const newComment = {
      id: commentId,
      postId: postId,
      authorId,
      authorName,
      comment: comment.trim(),
      createdAt: new Date()
    };

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to save comment.' });
  }
});

// 5. DELETE A COMMENT (Only the comment author may delete it)
router.delete('/:postId/comments/:commentId', authenticate, async (req, res) => {
  const { postId, commentId } = req.params;
  const userId = req.user.id;

  try {
    const [result] = await pool.execute(
      `DELETE FROM post_comments WHERE id = ? AND post_id = ? AND author_id = ?`,
      [commentId, postId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Comment not found or you are not its author.' });
    }

    res.status(200).json({ success: true, commentId });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

export default router;