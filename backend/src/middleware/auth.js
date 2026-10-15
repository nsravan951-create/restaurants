const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/env');
const { getUserProfile } = require('../utils/rbac');

const sessionCache = new Map();
const SESSION_TTL_MS = 15000;

async function loadSessionUser(userId, tokenVersion, role) {
  const key = String(userId);
  const cached = sessionCache.get(key);
  const version = Number(tokenVersion || 0);
  if (
    cached
    && cached.expires > Date.now()
    && Number(cached.profile?.token_version || 0) === version
    && cached.profile?.role === role
  ) {
    return cached.profile;
  }

  const profile = await getUserProfile(userId);
  if (profile) {
    sessionCache.set(key, { profile, expires: Date.now() + SESSION_TTL_MS });
  } else {
    sessionCache.delete(key);
  }
  if (sessionCache.size > 500) {
    const oldest = sessionCache.keys().next().value;
    sessionCache.delete(oldest);
  }
  return profile;
}

const requireAuth = (roles = []) => async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: token missing' });
    }

    const payload = jwt.verify(token, getJwtSecret());
    if (!payload?.userId) {
      return res.status(401).json({ message: 'Unauthorized: invalid token' });
    }

    const profile = await loadSessionUser(payload.userId, payload.tokenVersion, payload.role);
    if (!profile) {
      return res.status(401).json({ message: 'Unauthorized: invalid token' });
    }
    if (profile.is_active === false) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }
    if (profile.role !== payload.role || Number(profile.token_version || 0) !== Number(payload.tokenVersion || 0)) {
      sessionCache.delete(String(payload.userId));
      return res.status(401).json({ message: 'Session revoked. Please sign in again.' });
    }

    req.user = payload;

    if (roles.length > 0 && !roles.includes(payload.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }

    return next();
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Unauthorized: invalid token' });
    }
    return next(error);
  }
};

module.exports = { requireAuth };
