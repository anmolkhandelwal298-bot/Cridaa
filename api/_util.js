/**
 * Shared helpers for the Cridaa serverless functions.
 * Files starting with "_" inside /api are NOT exposed as routes by Vercel.
 */

// ---- tiny in-memory rate limiter (best effort: resets on cold start, per instance) ----
const buckets = new Map();
function rateLimit(req, key, max, windowMs = 60_000) {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const id = `${key}:${ip}`;
  const now = Date.now();
  const b = buckets.get(id);
  if (!b || now - b.start > windowMs) {
    buckets.set(id, { start: now, count: 1 });
    if (buckets.size > 5000) buckets.clear(); // keep memory bounded
    return true;
  }
  b.count += 1;
  return b.count <= max;
}

/**
 * Cheap deterrent against other websites hot-linking your proxy.
 * Set ALLOWED_ORIGINS="https://cridaa.in,https://www.cridaa.in" in Vercel.
 * (Real protection = API-key restrictions + quota caps in Google Cloud. See README.)
 */
function originAllowed(req) {
  const list = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return true;
  const src = req.headers.origin || req.headers.referer;
  if (!src) return true; // direct navigation / some <img> requests send neither
  try {
    const u = new URL(src);
    return list.some((o) => new URL(o).host === u.host);
  } catch {
    return false;
  }
}

function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(body));
}

function num(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = { rateLimit, originAllowed, send, num, haversineKm };
