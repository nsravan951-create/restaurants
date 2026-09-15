function createRateLimiter({ windowMs, max, key = (req) => req.ip } = {}) {
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
const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const publicOrderLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 60 });
const paymentLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });
const webhookLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 300 });
module.exports = { createRateLimiter, authLimiter, publicOrderLimiter, paymentLimiter, webhookLimiter };
