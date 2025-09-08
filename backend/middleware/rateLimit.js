const WINDOW = 60 * 1000;
const MAX = 5;
const hits = new Map();

export default (req, res, next) => {
  const key = `${req.ip}-${req.originalUrl}`;
  const now = Date.now();
  const data = hits.get(key) || [];
  const recent = data.filter((t) => now - t < WINDOW);
  if (recent.length >= MAX) {
    return res.status(429).json({ ok: false, message: 'Too many requests', code: 429 });
  }
  recent.push(now);
  hits.set(key, recent);
  next();
};
