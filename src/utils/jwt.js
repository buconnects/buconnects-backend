// src/utils/jwt.js
import jwt from 'jsonwebtoken';

export const generateToken = (user) => {
  const role = (user.role || 'USER').toString().toUpperCase();
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role,
      fullName: user.full_name || user.fullName || user.name || 'User'
    },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

export const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
};