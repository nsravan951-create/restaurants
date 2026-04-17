const jwt = require('jsonwebtoken');

const requireAuth = (roles = []) => (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: token missing' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = payload;

    if (roles.length > 0 && !roles.includes(payload.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized: invalid token' });
  }
};

module.exports = { requireAuth };
