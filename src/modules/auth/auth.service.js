// src/modules/auth/auth.service.js
import db from '../../config/db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { normalizeRole } from '../../utils/roles.js';

export const registerUser = async ({ fullName, email, password, role = 'USER', phoneNumber = null }) => {
  const cleanEmail = email.trim().toLowerCase();
  const safeRole = normalizeRole(role);

  // 1. Check if email already exists
  const [existing] = await db.query('SELECT id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
  if (existing.length > 0) {
    throw new Error('User with this email already exists');
  }

  // 2. Hash password & generate UUID v4
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const userId = uuidv4();

  // 3. Save to MySQL
  await db.query(
    `INSERT INTO users (id, full_name, email, password_hash, role, phone_number)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, fullName, cleanEmail, passwordHash, safeRole, phoneNumber]
  );

  // 4. Return new record without password_hash
  const [users] = await db.query(
    'SELECT id, full_name, email, role, avatar_url, phone_number, created_at FROM users WHERE id = ?',
    [userId]
  );

  return users[0];
};

export const loginUser = async ({ email, password }) => {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Fetch user by email (case-insensitive)
  const [users] = await db.query('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);
  if (users.length === 0) {
    throw new Error('Invalid email or password');
  }

  const user = users[0];
  user.role = normalizeRole(user.role);

  // 2. Fallback check for column name (password_hash vs password)
  const storedHash = user.password_hash || user.password;
  if (!storedHash) {
    throw new Error('Invalid database configuration: password field missing');
  }

  // 3. Compare hashed password with entered password
  const isMatch = await bcrypt.compare(password, storedHash);
  if (!isMatch) {
    throw new Error('Invalid email or password');
  }

  // 4. Strip sensitive data before returning user profile
  const { password_hash, password: _, ...sanitizedUser } = user;
  return sanitizedUser;
};