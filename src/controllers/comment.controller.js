// backend/controllers/comment.controller.js
import db from '../config/db';
import createNotification from '../utils/createNotification';

exports.addComment = async (req, res) => {
  const { postId, content } = req.body;
  const commenterId = req.user.id;
  const commenterName = req.user.name;

  try {
    // 1. Insert comment into MySQL
    await db.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
      [postId, commenterId, content]
    );

    // 2. Find the author of the original post
    const [posts] = await db.query('SELECT user_id FROM posts WHERE id = ?', [postId]);
    
    if (posts.length > 0) {
      const postAuthorId = posts[0].user_id;

      // 3. Trigger notification ONLY if commenting on someone else's post
      if (postAuthorId !== commenterId) {
        await createNotification({
          userId: postAuthorId,
          title: 'New Comment',
          message: `${commenterName} commented on your campus post.`
        });
      }
    }

    res.status(201).json({ message: 'Comment added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};