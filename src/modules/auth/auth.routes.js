// src/modules/auth/auth.routes.js
import express from 'express';
import { handleRegister, handleLogin, getProfile } from './auth.controller.js';
import { authenticate } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// Public Auth Routes
router.post('/register', handleRegister);
router.post('/login', handleLogin);

// Protected Auth Route
router.get('/me', authenticate, getProfile);

export default router;