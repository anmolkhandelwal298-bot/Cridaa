/**
 * /api/places  — secure proxy for Google Geocoding + Places (New).
 *
 * The browser NEVER sees GOOGLE_MAPS_API_KEY. It is read from the server
 * environment (Vercel → Settings → Environment Variables).
 *
 *   GET /api/places?action=reverse&lat=..&lng=..          → { area, city, formatted }
 *   GET /api/places?action=geocode&q=Indiranagar          → { lat, lng, area, city, formatted }
 *   GET /api/places?action=search&lat=..&lng=..&radius=8000&sports=football,tennis
 *   GET /api/places?action=photo&ref=places/ID/photos/REF&w=640   → image bytes
 *   GET /api/places?action=phone&id=PLACE_ID              → { phone, tel }  (called only AFTER a lead is captured)
 *
 * Cost controls: strict field masks, clamped params, small page sizes,
 * CDN caching (s-maxage), per-IP rate limit, optional origin allow-list.
 */
const { rateLimit, originAllowed, send, num, haversineKm } = require('./_util');

const SPORT_QUERIES = {
  'box-cricket': 'box cricket turf',
  football: 'football turf',
  badminton: 'badminton court',
  tennis: 'tennis court',
};

const KEY = () => process.env.GOOGLE_MAPS_API_KEY;
const REGION = () => (process.env.DEFAULT_REGION || 'IN').toUpperCase();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  if (!originAllowed(req)) return send(res, 403, { error: 'forbidden_origin' });
  if (!KEY()) return send(res, 500, { error: 'server_not_configured', message: 'GOOGLE_MAPS_API_KEY is not set' });
  if (!rateLimit(req, 'places', 90)) return send(res, 429, { error: 'rate_limited' });

  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  try {
    switch (q.action) {
      case 'reverse': return await reverse(q, res);
      case 'geocode': return await geocode(q, res);
      case 'search': return await search(q, res);
      case 'photo': return await photo(q, res);
      case 'phone': return await phone(q, res);
      default: return send(res, 400, { error: 'unknown_action' });
    }
  } catch (err) {
    console.error('[places]', q.action, err);
    return send(res, 502, { error: 'upstream_error' });
  }
};

// ---------- Geocoding ----------
function parseAddress(result) {
  const comps = result.address_components || [];
  const pick = (...types) => comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name;
  const area = pick('sublocality_level_1', 'sublocality', 'neighborhood', 'sublocality_level_2') || pick('locality') || '';
  const city = pick('locality', 'administrative_area_level_2') || '';
  return { area, city, formatted: result.formatted_address || '' };
}

async function reverse(q, res) {
  const lat = num(q.lat, -90, 90, null), lng = num(q.lng, -180, 180, null);
  if (lat === null || lng === null) return send(res, 400, { error: 'bad_coordinates' });
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.search = new URLSearchParams({
    latlng: `${lat},${lng}`,
    result_type: 'sublocality|neighborhood|locality',
    key: KEY(),
  });
  const data = await (await fetch(url)).json();
  if (data.status !== 'OK' || !data.results?.length) return send(res, 200, { area: '', city: '', formatted: '' }, 'public, s-maxage=86400');
  // Merge components of the first few results so we get both neighbourhood and city.
  const first = parseAddress(data.results[0]);
  const withCity = data.results.map(parseAddress).find((r) => r.city) || first;
  return send(res, 200, { area: first.area || withCity.area, city: withCity.city, formatted: first.formatted }, 'public, s-maxage=86400, stale-while-revalidate=604800');
}

async function geocode(q, res) {
  const text = String(q.q || '').trim().slice(0, 120);
  if (text.length < 2) return send(res, 400, { error: 'query_too_short' });
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.search = new URLSearchParams({ address: text, region: REGION().toLowerCase(), key: KEY() });
  const data = await (await fetch(url)).json();
  const r = data.results?.[0];
  if (data.status !== 'OK' || !r) return send(res, 404, { error: 'not_found' }, 'public, s-maxage=3600');
  const { area, city, formatted } = parseAddress(r);
  return send(res, 200, { lat: r.geometry.location.lat, lng: r.geometry.location.lng, area, city, formatted }, 'public, s-maxage=86400, stale-while-revalidate=604800');
}

// ---------- Places (New) ----------
// Pro-tier fields only (no phone/website here — those are costlier SKUs).
const SEARCH_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.shortFormattedAddress',
  'places.location', 'places.rating', 'places.userRatingCount', 'places.photos',
].join(',');

async function search(q, res) {
  const lat = num(q.lat, -90, 90, null), lng = num(q.lng, -180, 180, null);
  if (lat === null || lng === null) return send(res, 400, { error: 'bad_coordinates' });
  const radius = num(q.radius, 1000, 30000, 8000);
  const sports = String(q.sports || Object.keys(SPORT_QUERIES).join(','))
    .split(',').map((s) => s.trim()).filter((s) => SPORT_QUERIES[s]).slice(0, 4);
  if (!sports.length) return send(res, 400, { error: 'bad_sports' });

  const results = await Promise.all(sports.map(async (sport) => {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY(), 'X-Goog-FieldMask': SEARCH_MASK },
      body: JSON.stringify({
        textQuery: SPORT_QUERIES[sport],
        languageCode: 'en',
        regionCode: REGION(),
        pageSize: 12,
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius } },
      }),
    });
    if (!r.ok) throw new Error(`places ${r.status} ${await r.text()}`);
    return { sport, places: (await r.json()).places || [] };
  }));

  // Merge the per-sport result sets, de-duplicating by place id.
  const byId = new Map();
  for (const { sport, places } of results) {
    for (const p of places) {
      if (!p.location) continue;
      if (haversineKm(lat, lng, p.location.latitude, p.location.longitude) > (radius / 1000) * 1.5) continue;
      const existing = byId.get(p.id);
      if (existing) { if (!existing.sports.includes(sport)) existing.sports.push(sport); continue; }
      const photo = p.photos?.[0];
      byId.set(p.id, {
        id: p.id,
        name: p.displayName?.text || 'Sports venue',
        address: p.formattedAddress || '',
        area: p.shortFormattedAddress || '',
        lat: p.location.latitude,
        lng: p.location.longitude,
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? 0,
        photo: photo?.name || null,
        // Google requires author attribution to be shown next to its photos.
        photoAuthor: photo?.authorAttributions?.[0]?.displayName || '',
        sports: [sport],
      });
    }
  }
  return send(res, 200, { venues: [...byId.values()] }, 'public, s-maxage=3600, stale-while-revalidate=86400');
}

async function photo(q, res) {
  const ref = String(q.ref || '');
  if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(ref)) return send(res, 400, { error: 'bad_ref' });
  const w = num(q.w, 100, 800, 640);
  // skipHttpRedirect → JSON with a short-lived photoUri; keeps our API key off the redirect hop.
  const meta = await fetch(`https://places.googleapis.com/v1/${ref}/media?maxWidthPx=${Math.round(w)}&skipHttpRedirect=true`, {
    headers: { 'X-Goog-Api-Key': KEY() },
  });
  if (!meta.ok) return send(res, 404, { error: 'photo_not_found' }, 'public, s-maxage=300');
  const { photoUri } = await meta.json();
  const host = photoUri && new URL(photoUri).hostname;
  if (!host || !(host.endsWith('.googleusercontent.com') || host.endsWith('.ggpht.com'))) return send(res, 502, { error: 'bad_photo_host' });
  const img = await fetch(photoUri);
  if (!img.ok) return send(res, 404, { error: 'photo_not_found' });
  res.statusCode = 200;
  res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Kept to 1 day: Google's terms restrict long-term caching of Places content.
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.end(Buffer.from(await img.arrayBuffer()));
}

async function phone(q, res) {
  const id = String(q.id || '');
  if (!/^[\w-]{10,200}$/.test(id)) return send(res, 400, { error: 'bad_id' });
  const r = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
    headers: { 'X-Goog-Api-Key': KEY(), 'X-Goog-FieldMask': 'nationalPhoneNumber,internationalPhoneNumber' },
  });
  if (!r.ok) return send(res, 404, { error: 'not_found' });
  const d = await r.json();
  const intl = d.internationalPhoneNumber || '';
  return send(res, 200, { phone: d.nationalPhoneNumber || intl || '', tel: intl.replace(/[^\d+]/g, '') }, 'public, s-maxage=86400');
}
