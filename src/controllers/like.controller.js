// backend/controllers/like.controller.js
const createNotification = require('../utils/createNotification');
const db = require('../config/db');

exports.toggleLike = async (req, res) => {
  const { postId } = req.body;
  const likerId = req.user.id;
  const likerName = req.user.name;

  try {
    // Check if like exists (assuming toggle logic)
    const [existing] = await db.query(
      'SELECT id FROM likes WHERE post_id = ? AND user_id = ?',
      [postId, likerId]
    );

    if (existing.length === 0) {
      // 1. Add Like
      await db.query('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [postId, likerId]);

      // 2. Fetch post owner
      const [posts] = await db.query('SELECT user_id FROM posts WHERE id = ?', [postId]);

      if (posts.length > 0) {
        const postAuthorId = posts[0].user_id;

        // 3. Trigger Notification
        if (postAuthorId !== likerId) {
          await createNotification({
            userId: postAuthorId,
            title: 'New Like',
            message: `${likerName} liked your post.`
          });
        }
      }

      return res.status(200).json({ liked: true });
    } else {
      // Remove Like
      await db.query('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [postId, likerId]);
      return res.status(200).json({ liked: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};