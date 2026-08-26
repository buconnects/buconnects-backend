import { verifyToken } from '../utils/jwt.js';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('--- [MIDDLEWARE] Raw Auth Header ---:', authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('--- [MIDDLEWARE] FAILED: Missing or malformed Bearer header ---');
    return res.status(401).json({ error: 'Access denied: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    console.log('--- [MIDDLEWARE] Decoded JWT Payload ---:', decoded);

    if(!decoded) {
      console.error('--- [MIDDLEWARE] FAILED: verifyToken returned null/undefined ---')
      return res.status(401).json({error: 'Invalid orexpired token'});
    }
    req.user = decoded;
    console.log('--- [MIDDLEWARE] Set req.user to ---:', req.user);
    next();
  } catch (err) {
    console.error('--- [MIDDLEWARE] JWT Exception ---:', err.message);
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
};

export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Unauthorized: User identity not found' });
    }

    const userRole = String(req.user.role).toUpperCase();
    const allowed = allowedRoles.map((role) => String(role).toUpperCase());

    if (!allowed.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
};