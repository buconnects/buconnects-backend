import express from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { authorizeRoles } from '../../middlewares/role.middleware.js';

const router = express.Router();

// Only DEVELOPER / ADMIN roles can access these endpoints
router.get(
  '/system-metrics',
  authenticate,
  authorizeRoles('DEVELOPER', 'ADMIN'),
  (req, res) => {
    res.status(200).json({ status: 'All systems operational' });
  }
);

// Any authenticated role (USER, DEVELOPER, ADMIN) can access
router.get(
  '/dashboard-data',
  authenticate,
  authorizeRoles('USER', 'DEVELOPER', 'ADMIN'),
  (req, res) => {
    res.status(200).json({ data: 'General dashboard content' });
  }
);

export default router;