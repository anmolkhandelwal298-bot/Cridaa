/**
 * POST /api/track — anonymous usage analytics (live footfall + sport interest).
 * Stores a random session/visitor id only: no IP address, name or contact details.
 * If the database isn't configured it quietly does nothing, so the site works without it.
 */
const { rateLimit, originAllowed } = require('./_util');
const db = require('./_db');

const TYPES = new Set(['page_view', 'heartbeat', 'search', 'sport_filter', 'card_open', 'call_click']);
const SPORTS = new Set(['all', 'multi', 'football', 'box-cricket', 'badminton', 'pickleball', 'tennis']);
const ID = /^[\w-]{8,64}$/;
const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

module.exports = async function handler(req, res) {
  const done = (code) => { res.statusCode = code; res.setHeader('Cache-Control', 'no-store'); res.end(); };
  if (req.method !== 'POST') return done(405);
  if (!originAllowed(req)) return done(403);
  if (!db.enabled()) return done(204);
  if (!rateLimit(req, 'track', 120)) return done(429);

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || !ID.test(b.sessionId || '') || !ID.test(b.visitorId || '') || !TYPES.has(b.type)) return done(400);

  try {
    await db.rpc('track_event', {
      p_session: b.sessionId, p_visitor: b.visitorId, p_type: b.type,
      p_sport: SPORTS.has(b.sport) ? b.sport : null,
      p_venue_name: s(b.venueName, 150) || null, p_venue_id: s(b.venueId, 200) || null,
      p_city: s(b.city, 80) || null, p_area: s(b.area, 120) || null,
      p_device: b.device === 'mobile' ? 'mobile' : 'desktop',
      p_referrer: s(b.referrer, 120) || null,
      p_utm_source: s(b.utmSource, 80) || null, p_utm_medium: s(b.utmMedium, 80) || null, p_utm_campaign: s(b.utmCampaign, 80) || null,
    });
    return done(204);
  } catch (err) {
    console.error('[track]', err.message);
    return done(204); // analytics must never break the site
  }
};
