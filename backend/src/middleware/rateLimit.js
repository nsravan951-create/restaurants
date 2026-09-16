function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({ windowMs, max, key = (req) => getClientIp(req) } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const id = String(key(req) || 'unknown');
    const prior = hits.get(id);
    const bucket = !prior || prior.resetAt <= now ? { count: 0, resetAt: now + windowMs } : prior;
    bucket.count += 1;
    hits.set(id, bucket);
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }
    return next();
  };
}

function createFailureRateLimiter({
  windowMs,
  max,
  key,
  failureStatuses = [401, 403],
  message = 'Too many attempts. Please try again later.',
} = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const id = String(key(req) || 'unknown');
    const prior = hits.get(id);

    if (prior && prior.resetAt > now && prior.count >= max) {
      res.set('Retry-After', String(Math.ceil((prior.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }

    res.on('finish', () => {
      if (!failureStatuses.includes(res.statusCode)) return;
      const current = hits.get(id);
      const bucket = !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;
      bucket.count += 1;
      hits.set(id, bucket);
    });

    return next();
  };
}

const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
const loginFailureLimiter = createFailureRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: (req) => `${getClientIp(req)}:${String(req.body?.email || '').trim().toLowerCase()}`,
  message: 'Too many failed login attempts. Please wait and try again.',
});
const publicOrderLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 60 });
const paymentLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });
const webhookLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 300 });

module.exports = {
  getClientIp,
  createRateLimiter,
  createFailureRateLimiter,
  authLimiter,
  loginFailureLimiter,
  publicOrderLimiter,
  paymentLimiter,
  webhookLimiter,
};
