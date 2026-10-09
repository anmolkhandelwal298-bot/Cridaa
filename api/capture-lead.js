/**
 * POST /api/capture-lead
 *
 * Validates a lead from the "Call Now" modal and forwards it — server side, so no
 * secret ever reaches the browser — to any of:
 *   A) Database (Supabase Postgres, powers /admin)→ SUPABASE_URL + SUPABASE_SERVICE_KEY
 *   B) Google Sheet via an Apps Script web-app   → LEAD_WEBHOOK_URL (+ LEAD_WEBHOOK_SECRET)
 *   C) Web3Forms (email + dashboard)             → WEB3FORMS_ACCESS_KEY
 * At least one must be configured.
 */
const { rateLimit, originAllowed, send } = require('./_util');
const db = require('./_db');

const AGE_GROUPS = ['Under 18', '18-25', '26-35', '36+'];
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
// Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell).
const safeCell = (s) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  if (!originAllowed(req)) return send(res, 403, { error: 'forbidden_origin' });
  if (!rateLimit(req, 'lead', 6)) return send(res, 429, { error: 'rate_limited' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== 'object') return send(res, 400, { error: 'invalid_json' });

  // Honeypot: real users never fill this hidden field. Pretend success to bots.
  if (b.website) return send(res, 200, { ok: true });

  const name = clip(b.fullName, 80);
  const email = clip(b.email, 120).toLowerCase();
  const phoneDigits = clip(b.phone, 20).replace(/\D/g, '');
  const errors = {};
  if (name.length < 2) errors.fullName = 'Please enter your full name';
  if (phoneDigits.length < 10 || phoneDigits.length > 13) errors.phone = 'Enter a valid phone number';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Enter a valid email';
  if (!AGE_GROUPS.includes(b.ageGroup)) errors.ageGroup = 'Select an age group';
  if (b.consent !== true) errors.consent = 'Consent is required';
  if (Object.keys(errors).length) return send(res, 422, { error: 'validation_failed', errors });

  const lead = {
    // user details
    fullName: name,
    phone: clip(b.phone, 20),
    email,
    ageGroup: b.ageGroup,
    // context for marketing analysis
    turfName: clip(b.turfName, 150),
    turfPlaceId: clip(b.turfPlaceId, 200),
    turfArea: clip(b.turfArea, 150),
    sport: clip(b.sport, 40),
    sportFilter: clip(b.sportFilter, 40),
    userArea: clip(b.userArea, 120),
    userCity: clip(b.userCity, 80),
    locationSource: clip(b.locationSource, 20), // gps | search | city
    distanceKm: Number.isFinite(+b.distanceKm) ? +(+b.distanceKm).toFixed(2) : null,
    pageUrl: clip(b.pageUrl, 300),
    referrer: clip(b.referrer, 300),
    utmSource: clip(b.utmSource, 80),
    utmMedium: clip(b.utmMedium, 80),
    utmCampaign: clip(b.utmCampaign, 80),
    // server-side facts (cannot be spoofed by the client)
    submittedAt: new Date().toISOString(),
    userAgent: clip(req.headers['user-agent'], 200),
    sessionId: /^[\w-]{8,64}$/.test(b.sessionId || '') ? b.sessionId : '',
    consent: true,
  };

  const jobs = [];
  if (process.env.LEAD_WEBHOOK_URL) jobs.push(toSheet(lead));
  if (process.env.WEB3FORMS_ACCESS_KEY) jobs.push(toWeb3Forms(lead));
  if (db.enabled()) jobs.push(toDatabase(lead));
  if (!jobs.length) return send(res, 500, { error: 'server_not_configured', message: 'Set SUPABASE_URL + SUPABASE_SERVICE_KEY, LEAD_WEBHOOK_URL and/or WEB3FORMS_ACCESS_KEY' });

  const settled = await Promise.allSettled(jobs);
  settled.filter((s) => s.status === 'rejected').forEach((s) => console.error('[lead] forward failed:', s.reason));
  if (!settled.some((s) => s.status === 'fulfilled')) return send(res, 502, { error: 'forward_failed' });
  return send(res, 200, { ok: true });
};

async function toDatabase(l) {
  await db.insert('leads', {
    full_name: l.fullName, phone: l.phone, email: l.email, age_group: l.ageGroup,
    turf_name: l.turfName, turf_place_id: l.turfPlaceId, turf_area: l.turfArea,
    sport: l.sport, sport_filter: l.sportFilter,
    user_area: l.userArea, user_city: l.userCity, location_source: l.locationSource, distance_km: l.distanceKm,
    page_url: l.pageUrl, referrer: l.referrer, utm_source: l.utmSource, utm_medium: l.utmMedium, utm_campaign: l.utmCampaign,
    user_agent: l.userAgent, session_id: l.sessionId || null, consent: l.consent,
  });
}

async function toSheet(lead) {
  const row = Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, typeof v === 'string' ? safeCell(v) : v]));
  const r = await fetch(process.env.LEAD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script web-apps reject preflighted JSON
    body: JSON.stringify({ secret: process.env.LEAD_WEBHOOK_SECRET || '', lead: row }),
    redirect: 'follow',
  });
  const text = await r.text();
  if (!r.ok || !text.includes('"ok":true')) throw new Error(`sheet webhook ${r.status}: ${text.slice(0, 200)}`);
}

async function toWeb3Forms(lead) {
  const r = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      access_key: process.env.WEB3FORMS_ACCESS_KEY,
      subject: `New Cridaa lead: ${lead.turfName} (${lead.sport})`,
      from_name: 'Cridaa',
      ...lead,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(`web3forms ${r.status}: ${d.message || ''}`);
}
