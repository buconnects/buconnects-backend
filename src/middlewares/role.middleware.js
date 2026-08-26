import { normalizeRole } from '../utils/roles.js';

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Unauthorized: User identity not found' });
    }

    const userRole = normalizeRole(req.user.role);
    const allowed = allowedRoles.map((role) => normalizeRole(role));

    if (!allowed.includes(userRole)) {
      return res.status(403).json({
        error: `Forbidden: Access restricted to roles [${allowedRoles.join(', ')}]`
      });
    }

    next();
  };
};