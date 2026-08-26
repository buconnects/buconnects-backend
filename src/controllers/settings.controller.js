// src/controllers/settings.controller.js
import db from '../config/db.js';
import bcrypt from 'bcryptjs';

// Get current user settings
export const getSettings = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) return res.status(400).json({ error: 'User ID missing from token' });

    // Retrieve settings or insert defaults if record doesn't exist yet
    let [rows] = await db.query('SELECT * FROM user_settings WHERE user_id = ?', [userId]);

    if (rows.length === 0) {
      await db.query(
        `INSERT INTO user_settings (user_id, email_notifications, push_notifications, sound_enabled, profile_visibility, show_email, theme) 
         VALUES (?, TRUE, TRUE, TRUE, 'CAMPUS_ONLY', FALSE, 'SYSTEM')`,
        [userId]
      );
      [rows] = await db.query('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update general preferences
export const updateSettings = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) return res.status(400).json({ error: 'User ID missing from token' });

    const {
      emailNotifications,
      pushNotifications,
      soundEnabled,
      profileVisibility,
      showEmail,
      theme,
    } = req.body;

    await db.query(
      `UPDATE user_settings 
       SET email_notifications = ?, push_notifications = ?, sound_enabled = ?, 
           profile_visibility = ?, show_email = ?, theme = ? 
       WHERE user_id = ?`,
      [
        emailNotifications,
        pushNotifications,
        soundEnabled,
        profileVisibility,
        showEmail,
        theme,
        userId,
      ]
    );

    res.status(200).json({ message: 'Settings updated successfully' });
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update user security (Password Change)
export const updatePassword = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new passwords are required' });
    }

    // Fetch user password hash
    const [users] = await db.query('SELECT password_hash, password FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const storedHash = users[0].password_hash || users[0].password;
    if (!storedHash) return res.status(500).json({ error: 'Password field is missing for this account' });

    const isMatch = await bcrypt.compare(currentPassword, storedHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const passwordColumn = users[0].password_hash ? 'password_hash' : 'password';
    await db.query(`UPDATE users SET ${passwordColumn} = ? WHERE id = ?`, [hashedPassword, userId]);

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Error updating password:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};