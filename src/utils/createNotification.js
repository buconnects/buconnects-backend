import db from '../config/db'

/**
 * Creates a notification in MySQL for a recipient user.
 * 
 * @param {Object} params
 * @param {string} params.userId - Recipient user's UUID (VARCHAR 36)
 * @param {string} params.title - Notification title (e.g. 'New Comment')
 * @param {string} params.message - Notification body text
 */
const createNotification = async ({ userId, title, message }) => {
  try {
    const query = `
      INSERT INTO notifications (user_id, title, message, is_read, created_at)
      VALUES (?, ?, ?, 0, NOW())
    `;

    const [result] = await db.query(query, [userId, title, message]);
    return result.insertId;
  } catch (error) {
    // Log error silently so main controller flow (e.g., adding comment) isn't interrupted
    console.error('Failed to create notification:', error.message);
    return null;
  }
};

module.exports = createNotification;