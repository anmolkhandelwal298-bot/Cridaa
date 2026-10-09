/**
 * GET /api/admin-stats?days=30 — dashboard data for /admin. Requires header  x-admin-key: <ADMIN_PASSWORD>.
 */
const crypto = require('crypto');
const { rateLimit, send, num } = require('./_util');
const db = require('./_db');

function authorised(req) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const given = String(req.headers['x-admin-key'] || '');
  if (expected.length < 8) return false; // refuse to run with a missing / trivially short password
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  if (!rateLimit(req, 'admin', 30)) return send(res, 429, { error: 'rate_limited' });
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) return send(res, 500, { error: 'server_not_configured', message: 'Set ADMIN_PASSWORD (8+ characters)' });
  if (!authorised(req)) return send(res, 401, { error: 'unauthorised' });
  if (!db.enabled()) return send(res, 500, { error: 'server_not_configured', message: 'Set SUPABASE_URL and SUPABASE_SERVICE_KEY' });
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    return send(res, 200, await db.rpc('admin_stats', { p_days: Math.round(num(q.days, 1, 365, 30)) }));
  } catch (err) {
    console.error('[admin-stats]', err.message);
    return send(res, 502, { error: 'database_error' });
  }
};
