// src/modules/auth/auth.controller.js
import { registerUser, loginUser } from './auth.service.js';
import { generateToken } from '../../utils/jwt.js';

export const handleRegister = async (req, res) => {
  try {
    const { fullName, email, password, role, phoneNumber } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'fullName, email, and password are required' });
    }

    const newUser = await registerUser({ fullName, email, password, role, phoneNumber });

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser,
    });
  } catch (error) {
    console.error('Registration Controller Error:', error);
    res.status(400).json({ error: error.message });
  }
};

export const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await loginUser({ email, password });
    const token = generateToken(user);

    res.status(200).json({
      message: 'Login successful',
      user,
      token
    });
  } catch (error) {
    console.error('Login Controller Error:', error.message);
    res.status(401).json({ error: error.message });
  }
};

export const getProfile = async (req, res) => {
  res.status(200).json({
    user: req.user
  });
};