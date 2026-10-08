/**
 * Cridaa — front-end logic (vanilla JS, no build step).
 *
 * SECURITY: this file contains NO API keys. Every Google call goes through
 * /api/places (a Vercel serverless proxy that reads process.env.GOOGLE_MAPS_API_KEY).
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- config
  const API = '/api';
  const MAX_CARDS = 36;
  const MAX_PINS = 12;
  const FETCH_SPORTS = 'football,box-cricket,badminton,pickleball,tennis';

  // Simple 24px stroke icons (inner SVG markup).
  const ICONS = {
    all: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    football: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.500"/>',
    'box-cricket': '<path d="M14 3l7 7-9 9-4-1-1-4z"/><path d="M5 19l-2 2"/>',
    badminton: '<path d="M9 3l2 6M15 3l-2 6M12 3v6"/><path d="M8 9h8l-1.500 5h-5z"/><circle cx="12" cy="18" r="3"/>',
    pickleball: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9.500" r=".8"/><circle cx="15" cy="9.500" r=".8"/><circle cx="12" cy="14" r=".8"/>',
    tennis: '<circle cx="12" cy="12" r="9"/><path d="M5 5.500c3.500 3.500 3.500 9.500 0 13M19 5.500c-3.500 3.500-3.500 9.500 0 13"/>',
    multi: '<rect x="5" y="3" width="14" height="18" rx="1.500"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4"/>',
  };
  const SPORTS = [
    { id: 'all', label: 'All sports' },
    { id: 'football', label: 'Football turf', short: 'Football' },
    { id: 'box-cricket', label: 'Box Cricket', short: 'Box Cricket' },
    { id: 'badminton', label: 'Badminton', short: 'Badminton' },
    { id: 'pickleball', label: 'Pickleball', short: 'Pickleball' },
    { id: 'tennis', label: 'Tennis', short: 'Tennis' },
    { id: 'multi', label: 'Multi-sport' }, // virtual: venues that offer 2+ sports
  ];
  const SPORT = Object.fromEntries(SPORTS.map((s) => [s.id, { short: s.label, ...s }]));
  const EMOJI = { football: '⚽', 'box-cricket': '🏏', badminton: '🏸', pickleball: '🏓', tennis: '🎾', multi: '🏟️', all: '🏟️' };
  const ALIASES = { cricket: 'box-cricket', football: 'football', soccer: 'football', futsal: 'football', badminton: 'badminton', shuttle: 'badminton', pickle: 'pickleball', tennis: 'tennis', multi: 'multi' };
  const ico = (id, cls = '') => `<svg aria-hidden="true" class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[id] || ICONS.all}</svg>`;

  // Hard-coded coordinates => picking a city costs ₹0 (no geocoding call).
  const CITIES = [
    { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
    { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
    { name: 'Delhi', lat: 28.6139, lng: 77.209 },
    { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
    { name: 'Hyderabad', lat: 17.385, lng: 78.4867 },
    { name: 'Pune', lat: 18.5204, lng: 73.8567 },
    { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
    { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
    { name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
    { name: 'Gurugram', lat: 28.4595, lng: 77.0266 },
  ];

  // ---------------------------------------------------------------- state
  const state = {
    loc: null,          // { lat, lng, area, city, source: 'gps'|'search'|'city' }
    venues: [],
    sport: 'all',
    sort: 'nearest',
    query: '',          // venue-name filter from the hero search
    demo: false,
    active: null,       // venue currently in the lead modal
    loadSeq: 0,         // guards against out-of-order responses
    favs: new Set(),
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    locToggle: $('loc-toggle'), locLabel: $('loc-label'), locPanel: $('loc-panel'), locForm: $('loc-form'), locInput: $('loc-input'),
    locate: $('btn-locate'), cityList: $('city-list'), note: $('loc-note'),
    heroForm: $('hero-form'), heroInput: $('hero-input'),
    chips: $('sport-chips'), sort: $('sort-select'),
    eyebrow: $('res-eyebrow'), title: $('results-title'), sub: $('res-sub'),
    grid: $('venue-grid'), empty: $('empty-state'), error: $('error-state'), demo: $('demo-banner'),
    mapCanvas: $('map-canvas'), mapGmaps: $('map-gmaps'),
    detail: $('detail-dialog'), dlg: $('lead-dialog'), lform: $('lead-form'), lerr: $('lead-error'), lsubmit: $('lead-submit'), lturf: $('lead-turf'), success: $('lead-success'),
  };

  // ---------------------------------------------------------------- utils
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round2 = (n) => Math.round(n * 100) / 100; // ~1 km grid => far better CDN cache hit-rate
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const favKey = (v) => v.id || v.name;

  function distanceKm(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
  const locText = (l) => [l.area, l.city].filter((v, i, a) => v && a.indexOf(v) === i).join(', ') || 'your location';

  async function api(path) {
    let res;
    try { res = await fetch(API + path, { headers: { Accept: 'application/json' } }); }
    catch { throw Object.assign(new Error('Network error'), { code: 'no_api' }); }
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    if (!isJson) throw Object.assign(new Error('API not reachable'), { code: 'no_api' }); // static host / 404 page
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.message || data.error || 'Request failed'), { code: data.error || 'http_' + res.status });
    return data;
  }

  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const dayIdx = () => (new Date().getDay() + 6) % 7; // Google lists Monday first
  const stripDay = (line) => String(line || '').replace(/^[^:]+:\s*/, '');
  const todayHours = (v) => (v.hours && v.hours[dayIdx()] ? stripDay(v.hours[dayIdx()]) : null);
  const photoList = (v) => (v.photos && v.photos.length ? v.photos : v.photo ? [{ name: v.photo, author: v.photoAuthor }] : []);
  /** Demo photo refs start with "demo:" and render as placeholders; real ones go through the secure proxy. */
  const imgSrc = (ref, w, sid) => (!ref || ref.startsWith('demo:') ? placeholder(sid) : `${API}/places?action=photo&ref=${encodeURIComponent(ref)}&w=${w}`);

  /** Inline SVG placeholder, used when Google has no photo (or it fails to load). */
  function placeholder(sportId) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2bbfcf"/><stop offset="1" stop-color="#14353d"/></linearGradient></defs>
      <rect width="640" height="400" fill="url(#g)"/>
      <g stroke="#fff" stroke-opacity=".3" stroke-width="3" fill="none"><rect x="60" y="50" width="520" height="300" rx="8"/><line x1="320" y1="50" x2="320" y2="350"/><circle cx="320" cy="200" r="55"/></g>
      <text x="320" y="228" font-size="84" text-anchor="middle">${EMOJI[sportId] || EMOJI.all}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ---------------------------------------------------------------- location
  function setLocation(loc, { persist = true } = {}) {
    state.loc = loc;
    state.query = '';
    const text = locText(loc);
    el.locLabel.textContent = loc.area || loc.city || 'Your location';
    document.title = `Sports Turfs & Courts in ${text} | Cridaa`;
    el.mapGmaps.href = `https://www.google.com/maps/@${loc.lat},${loc.lng},14z`;
    if (persist) store.set('cridaa.loc', loc);
    loadVenues();
  }

  function showNote(msg) {
    el.note.textContent = msg || '';
    el.note.classList.toggle('hidden', !msg);
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(Object.assign(new Error('unsupported'), { code: 0 }));
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 });
    });
  }

  async function detectLocation({ fallbackToSaved = true } = {}) {
    el.locLabel.textContent = 'Locating…';
    showNote('');
    try {
      const pos = await getPosition();
      const { latitude: lat, longitude: lng } = pos.coords;
      let area = '', city = '';
      try { ({ area, city } = await api(`/places?action=reverse&lat=${round2(lat)}&lng=${round2(lng)}`)); }
      catch (e) { if (e.code !== 'no_api') console.warn('reverse geocode failed', e); }
      setLocation({ lat, lng, area, city, source: 'gps' });
    } catch (err) {
      const saved = fallbackToSaved && store.get('cridaa.loc');
      showNote(err && err.code === 1
        ? 'Location access is blocked, so we’re showing a default city. Use the location button at the top to pick yours.'
        : 'We couldn’t detect your location, so we’re showing a default city. Use the location button at the top to pick yours.');
      setLocation(saved || { ...CITIES[0], area: '', city: CITIES[0].name, source: 'city' });
    }
  }

  async function searchLocation(text) {
    const q = text.trim();
    if (q.length < 2) return;
    showNote('');
    el.locLabel.textContent = 'Searching…';
    try {
      const r = await api(`/places?action=geocode&q=${encodeURIComponent(q)}`);
      setLocation({ lat: r.lat, lng: r.lng, area: r.area || q, city: r.city, source: 'search' });
    } catch (e) {
      el.locLabel.textContent = state.loc ? (state.loc.area || state.loc.city || 'Your location') : 'Unknown';
      showNote(e.code === 'not_found' ? `We couldn’t find “${q}”. Try a nearby landmark or city.` : 'Search is unavailable right now. Please pick a city from the list.');
    }
  }

  /** Hero search: a sport keyword filters, a venue name filters, anything else is treated as a place. */
  function handleHeroSearch(text) {
    const q = text.trim().toLowerCase();
    if (q.length < 2) return;
    const key = Object.keys(ALIASES).find((k) => q.includes(k));
    if (key) { state.query = ''; setSport(ALIASES[key]); $('explore').scrollIntoView(); return; }
    if (state.venues.some((v) => v.name.toLowerCase().includes(q))) {
      state.query = q; render(); $('results').scrollIntoView(); return;
    }
    searchLocation(text);
  }

  // ---------------------------------------------------------------- data
  async function loadVenues() {
    const seq = ++state.loadSeq;
    showSkeleton();
    el.error.classList.add('hidden');
    const { lat, lng } = state.loc;
    try {
      const data = await api(`/places?action=search&lat=${round2(lat)}&lng=${round2(lng)}&radius=8000&sports=${FETCH_SPORTS}`);
      if (seq !== state.loadSeq) return;
      state.venues = data.venues;
      state.demo = false;
    } catch (e) {
      if (seq !== state.loadSeq) return;
      if (e.code === 'no_api') { state.venues = demoVenues(state.loc); state.demo = true; }
      else { state.venues = []; showError(e.code === 'server_not_configured' ? 'Server is missing GOOGLE_MAPS_API_KEY – see README.' : 'Couldn’t load venues. Please try again in a moment.'); }
    }
    state.venues.forEach((v) => { v.km = distanceKm(state.loc, v); });
    el.demo.classList.toggle('hidden', !state.demo);
    render();
  }

  /** Sample data so the UI is reviewable without a backend. Clearly flagged by the demo banner. */
  function demoVenues(loc) {
    const defs = [
      ['Arena 7 Box Cricket', ['box-cricket'], 4.6, 812, 0.012, 0.008],
      ['The Turf Arena', ['football'], 4.8, 356, -0.02, 0.015],
      ['Smash Badminton Academy', ['badminton'], 4.8, 201, 0.03, -0.01],
      ['Ace Pickleball Club', ['pickleball'], 4.9, 150, -0.045, -0.03],
      ['The Pitch – Multi Sport Turf', ['football', 'box-cricket'], 4.5, 1240, 0.008, -0.022],
      ['Shuttle Hub Courts', ['badminton'], 3.9, 64, 0.06, 0.04],
      ['City Tennis Club', ['tennis'], 4.2, 97, -0.01, -0.05],
    ];
    const hours = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => `${d}: 6:00 AM – 11:00 PM`);
    return defs.map(([name, sports, rating, reviews, dLat, dLng]) => ({
      id: null, name, sports, rating, reviews, photo: null, photoAuthor: '', hours,
      photos: [{ name: 'demo:1' }, { name: 'demo:2' }, { name: 'demo:3' }],
      address: `${loc.area || loc.city || 'Sample'} (sample address)`, area: loc.area || loc.city || 'Sample area',
      lat: loc.lat + dLat, lng: loc.lng + dLng,
    }));
  }

  // ---------------------------------------------------------------- render
  function showSkeleton() {
    el.empty.classList.add('hidden');
    el.grid.innerHTML = Array.from({ length: 4 }, () => `
      <div class="overflow-hidden rounded-2xl border border-line bg-white" aria-hidden="true">
        <div class="skeleton h-48"></div>
        <div class="space-y-3 p-5"><div class="skeleton h-5 w-3/4 rounded"></div><div class="skeleton h-4 w-1/2 rounded"></div><div class="skeleton h-10 rounded-xl"></div></div>
      </div>`).join('');
    el.title.textContent = 'Finding places to play…';
    el.sub.textContent = '';
    el.mapCanvas.innerHTML = '';
    el.grid.setAttribute('aria-busy', 'true');
  }

  function showError(msg) { el.error.textContent = msg; el.error.classList.remove('hidden'); }

  const isMulti = (v) => v.sports.length > 1;
  function visibleVenues() {
    let list = state.venues.slice();
    if (state.sport === 'multi') list = list.filter(isMulti);
    else if (state.sport !== 'all') list = list.filter((v) => v.sports.includes(state.sport));
    if (state.query) list = list.filter((v) => v.name.toLowerCase().includes(state.query));
    const by = {
      nearest: (a, b) => a.km - b.km,
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.reviews - a.reviews || a.km - b.km,
      reviews: (a, b) => b.reviews - a.reviews || (b.rating ?? -1) - (a.rating ?? -1),
    };
    return list.sort(by[state.sort]).slice(0, MAX_CARDS);
  }

  /** Sport used for the card tag / placeholder image. */
  function primarySport(v) {
    return state.sport !== 'all' && state.sport !== 'multi' && v.sports.includes(state.sport) ? state.sport : v.sports[0];
  }
  const tagLabel = (v) => (isMulti(v) ? 'Multi-sport' : SPORT[v.sports[0]].short);

  function cardHTML(v, idx) {
    const sid = primarySport(v);
    const photos = photoList(v);
    const imgs = (photos.length ? photos : [null]).map((p, i) => {
      const src = imgSrc(p && p.name, 640, sid);
      // Every photo download is billed by Google, so photos 2+ stay blank until the user swipes.
      const lazy = i > 0 && p && !p.name.startsWith('demo:');
      return `<img ${lazy ? `src="${BLANK}" data-src="${esc(src)}"` : `src="${esc(src)}"`} data-sport="${esc(sid)}" alt="${esc(v.name)} – photo ${i + 1}" width="640" height="400"
               loading="${idx < 2 && i === 0 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" class="media-img h-48 object-cover">`;
    }).join('');
    const today = todayHours(v);
    const rating = v.rating != null ? v.rating.toFixed(1) : null;
    const others = v.sports.map((s) => `<span class="tag">${esc(SPORT[s].short)}</span>`).join('');
    const reviews = v.reviews ? `<span class="tag">${v.reviews.toLocaleString('en-IN')} Google reviews</span>` : '';
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name + ' ' + v.address)}${v.id ? `&query_place_id=${encodeURIComponent(v.id)}` : ''}`;
    const fav = state.favs.has(favKey(v));
    return `
    <article id="card-${idx}" class="venue-card flex flex-col overflow-hidden rounded-2xl border border-line bg-white" data-idx="${idx}">
      <div class="card-media relative">
        <div class="media-track" data-track>${imgs}</div>
        ${photos.length > 1 ? `<button type="button" class="slide-btn left-2" data-slide="-1" aria-label="Previous photo">‹</button>
        <button type="button" class="slide-btn right-2" data-slide="1" aria-label="Next photo">›</button>
        <span class="absolute bottom-3 left-3 rounded-full bg-ink/80 px-2.5 py-1 text-xs font-semibold text-white" data-count>1/${photos.length}</span>` : ''}
        <span class="absolute left-3 top-3 rounded-md bg-ink/90 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">${esc(tagLabel(v))}</span>
        <button type="button" data-fav="${idx}" aria-pressed="${fav}" aria-label="Save ${esc(v.name)}" class="heart absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-ink shadow">
          <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.400-9-9.200C1.700 7.600 3.800 4.500 7 4.500c2 0 3.400 1 5 3 1.600-2 3-3 5-3 3.200 0 5.300 3.100 4 6.300C19 15.600 12 20 12 20z"/></svg>
        </button>
      </div>
      <div class="flex flex-1 flex-col p-5">
        <div class="flex items-start justify-between gap-3">
          <h3 class="font-display text-xl font-semibold leading-tight"><button type="button" data-open="${idx}" class="card-open" aria-label="Explore ${esc(v.name)}">${esc(v.name)}</button></h3>
          ${rating ? `<span class="flex shrink-0 items-center gap-1 font-semibold text-amber-500"><span aria-hidden="true">★</span>${rating}<span class="sr-only"> out of 5 stars</span></span>` : ''}
        </div>
        <p class="mt-2 flex items-start gap-1.5 text-sm text-muted">
          <svg aria-hidden="true" class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.200 7-11.500A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/></svg>
          <span class="line-clamp-2">${esc(v.area || v.address)}</span>
        </p>
        <p class="mt-1.5 flex items-start gap-1.5 text-sm ${today && /closed/i.test(today) ? 'text-coral-dark' : 'text-muted'}">
          <svg aria-hidden="true" class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <span>${today ? `Today · ${esc(today)}` : 'Timings not listed'}</span>
        </p>
        <div class="my-4 flex items-center justify-between gap-2 border-y border-line py-3">
          <span class="badge-soon"><svg aria-hidden="true" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.500"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Prices Coming Soon</span>
          <a href="${esc(maps)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 text-sm text-muted hover:text-teal-dark" aria-label="${fmtKm(v.km)} away – directions to ${esc(v.name)} (opens Google Maps)">
            <svg aria-hidden="true" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>${fmtKm(v.km)}
          </a>
        </div>
        <div class="flex flex-wrap gap-2">${others}${reviews}</div>
        <button type="button" data-open="${idx}" class="mt-4 text-left text-sm font-semibold text-teal-dark hover:underline">Explore this place →</button>
        <button type="button" data-call="${idx}" class="mt-3 flex items-center justify-center gap-2 rounded-xl bg-coral px-4 py-3 font-semibold text-white hover:bg-coral-dark">
          <svg aria-hidden="true" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6.600 10.800a15 15 0 0 0 6.600 6.600l2.200-2.200a1 1 0 0 1 1-.25 11.400 11.400 0 0 0 3.600.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.500a1 1 0 0 1 1 1c0 1.250.2 2.450.57 3.570a1 1 0 0 1-.25 1z"/></svg>
          Call Now
        </button>
      </div>
    </article>`;
  }

  let shown = [];
  function render() {
    shown = visibleVenues();
    el.grid.removeAttribute('aria-busy');
    el.grid.innerHTML = shown.map(cardHTML).join('');
    el.empty.classList.toggle('hidden', shown.length > 0 || !el.error.classList.contains('hidden'));

    const city = state.loc.city || state.loc.area || '';
    el.eyebrow.textContent = city ? `Near you · ${city}` : 'Near you';
    const noun = state.sport === 'all' ? 'places to play' : `${SPORT[state.sport].short.toLowerCase()} spots`;
    el.title.textContent = shown.length ? `${shown.length} ${noun}` : 'No places found';
    const areas = [...new Set(shown.map((v) => (v.area || '').split(',')[0].trim()).filter(Boolean))].slice(0, 3);
    const picks = areas.length ? `Fresh picks around ${areas.length > 1 ? areas.slice(0, -1).join(', ') + ' and ' + areas.slice(-1) : areas[0]}` : '';
    el.sub.innerHTML = state.query
      ? `Showing venues matching “${esc(state.query)}” · <button type="button" id="clear-query" class="font-semibold text-coral hover:underline">Clear</button>`
      : esc(picks);

    updateHero();
    renderMap();
    injectStructuredData();
  }

  /** Hero stats + floating cards, computed from real results (nothing hard-coded). */
  function updateHero() {
    const all = state.venues;
    const rated = all.filter((v) => v.rating != null);
    $('stat-venues').textContent = all.length ? String(all.length) : '–';
    $('stat-rating').textContent = rated.length ? (rated.reduce((s, v) => s + v.rating, 0) / rated.length).toFixed(1) : '–';
    $('stat-sports').textContent = all.length ? String(new Set(all.flatMap((v) => v.sports)).size) : '–';

    const counts = {};
    all.forEach((v) => v.sports.forEach((s) => { counts[s] = (counts[s] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      $('fc-pop-title').textContent = SPORT[top[0]].short;
      $('fc-pop-sub').textContent = `${top[1]} venue${top[1] > 1 ? 's' : ''} nearby`;
      $('hero-icon').innerHTML = ICONS[top[0]];
    }
    const best = rated.filter((v) => v.reviews >= 10).sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)[0] || rated.sort((a, b) => b.rating - a.rating)[0];
    if (best) {
      $('fc-top-rating').textContent = best.rating.toFixed(1);
      $('fc-top-name').textContent = best.name;
      $('fc-top-sub').textContent = `${fmtKm(best.km)} away · ${(best.area || '').split(',')[0]}`;
    }
  }

  /** Schematic map: pins placed by true relative distance/bearing from the user. No map API needed. */
  function renderMap() {
    const o = state.loc, pins = shown.slice(0, MAX_PINS);
    const k = Math.cos((o.lat * Math.PI) / 180);
    const pts = pins.map((v) => ({ dx: (v.lng - o.lng) * 111 * k, dy: (v.lat - o.lat) * 111 }));
    const maxR = Math.max(1.5, ...pts.map((p) => Math.hypot(p.dx, p.dy)));
    el.mapCanvas.innerHTML =
      pins.map((v, i) => `<button type="button" class="map-pin" data-pin="${i}" style="left:${(50 + (pts[i].dx / maxR) * 38).toFixed(1)}%;top:${(52 - (pts[i].dy / maxR) * 34).toFixed(1)}%"
        aria-label="${esc(v.name)}, ${fmtKm(v.km)} away">${v.rating != null ? v.rating.toFixed(1) : '•'}</button>`).join('') +
      '<div class="map-you" aria-hidden="true"><span>You</span></div>';
  }

  function pick(idx) {
    document.querySelectorAll('.is-picked').forEach((n) => n.classList.remove('is-picked'));
    if (idx == null) return;
    const card = $(`card-${idx}`);
    card?.classList.add('is-picked');
    el.mapCanvas.querySelector(`[data-pin="${idx}"]`)?.classList.add('is-picked');
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** Live Schema.org ItemList → LocalBusiness (SportsActivityLocation) for the currently shown venues. */
  function injectStructuredData() {
    document.getElementById('ld-live')?.remove();
    if (!shown.length || state.demo) return; // never publish sample data as structured data
    const data = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Sports turfs and courts near ${locText(state.loc)}`,
      itemListElement: shown.slice(0, 20).map((v, i) => ({
        '@type': 'ListItem', position: i + 1,
        item: {
          '@type': 'SportsActivityLocation', // subtype of LocalBusiness
          name: v.name,
          address: { '@type': 'PostalAddress', streetAddress: v.address },
          geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lng },
          ...(v.rating != null && v.reviews > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: v.rating, reviewCount: v.reviews, bestRating: 5 } } : {}),
          ...(v.id ? { url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name)}&query_place_id=${encodeURIComponent(v.id)}` } : {}),
        },
      })),
    };
    const s = document.createElement('script');
    s.type = 'application/ld+json'; s.id = 'ld-live';
    s.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    document.head.appendChild(s);
  }

  function renderChips() {
    el.chips.innerHTML = SPORTS.map((s) =>
      `<button type="button" class="chip" data-sport="${s.id}" aria-pressed="${s.id === state.sport}">${ico(s.id)}${esc(s.label)}</button>`).join('');
  }

  function setSport(id) {
    state.sport = id;
    el.chips.querySelectorAll('[data-sport]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.sport === id)));
    const url = new URL(location.href);
    id === 'all' ? url.searchParams.delete('sport') : url.searchParams.set('sport', id);
    history.replaceState(null, '', url);
    if (state.loc) render();
  }


  // ---------------------------------------------------------------- place detail ("explore more")
  const photoUrl = (ref, w = 960) => imgSrc(ref, w, dView.sid);
  const dView = { photos: [], i: 0, sid: 'all' };
  let detailSeq = 0;

  function showDetailPhoto(i) {
    const n = dView.photos.length;
    if (!n) return;
    dView.i = (i + n) % n;
    const img = $('d-photo');
    delete img.dataset.fallback;
    img.src = photoUrl(dView.photos[dView.i].name);
    $('d-count').textContent = `${dView.i + 1} / ${n}`;
    const who = dView.photos[dView.i].author;
    $('d-credit').textContent = who ? `Photo: ${who} / Google` : '';
    $('d-thumbs').querySelectorAll('.thumb').forEach((t, k) => (k === dView.i ? t.setAttribute('aria-current', 'true') : t.removeAttribute('aria-current')));
  }

  function setDetailPhotos(list) {
    dView.photos = list;
    const multi = list.length > 1;
    ['d-prev', 'd-next', 'd-count'].forEach((id) => $(id).classList.toggle('hidden', !multi));
    $('d-thumbs').innerHTML = multi ? list.map((p, i) =>
      `<button type="button" class="thumb" data-thumb="${i}" aria-label="Show photo ${i + 1}"><img src="${esc(imgSrc(p.name, 200, dView.sid))}" alt="" loading="lazy"></button>`).join('') : '';
    if (list.length) showDetailPhoto(0);
  }

  function setDetailHours(hours, openNow) {
    const wrap = $('d-hours-wrap');
    wrap.classList.toggle('hidden', !hours.length && openNow == null);
    const today = hours[dayIdx()];
    $('d-today').textContent = today ? `Today: ${stripDay(today)}` : '';
    $('d-open').textContent = openNow == null ? '' : openNow ? 'Open now' : 'Closed now';
    $('d-open').className = `mt-1 text-sm font-semibold ${openNow ? 'text-emerald-600' : 'text-coral-dark'}`;
    $('d-hours').innerHTML = hours.map((h, i) => `<li class="${i === dayIdx() ? 'font-semibold text-ink' : ''}">${esc(h)}</li>`).join('');
  }

  function openDetail(v) {
    state.active = v;
    const seq = ++detailSeq, sid = primarySport(v);
    dView.sid = sid;
    const img = $('d-photo');
    img.dataset.sport = sid; img.alt = `${v.name} – ${tagLabel(v)} venue`;
    const photos = photoList(v);
    setDetailPhotos(photos);
    if (!photos.length) { img.src = placeholder(sid); delete img.dataset.fallback; }
    $('d-tag').textContent = tagLabel(v);
    $('d-title').textContent = v.name;
    $('d-rating').innerHTML = v.rating != null
      ? `<span class="font-semibold text-amber-500">★ ${v.rating.toFixed(1)}</span><span class="text-muted">· ${v.reviews.toLocaleString('en-IN')} Google reviews</span>` : '<span class="text-muted">No ratings yet</span>';
    $('d-sports').innerHTML = v.sports.map((s) => `<span class="tag">${esc(SPORT[s].short)}</span>`).join('');
    $('d-address').textContent = v.address || v.area;
    $('d-distance').textContent = `${fmtKm(v.km)} from ${state.loc.area || state.loc.city || 'you'}`;
    $('d-directions').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name + ' ' + v.address)}${v.id ? `&query_place_id=${encodeURIComponent(v.id)}` : ''}`;
    $('d-summary').classList.add('hidden');
    $('d-reviews').innerHTML = '';
    $('d-website').classList.add('hidden');
    setDetailHours(v.hours || [], null);
    $('d-status').textContent = v.id ? 'Loading details…' : 'Reviews appear here once the Google backend is connected.';
    try { el.detail.showModal(); } catch { el.detail.setAttribute('open', ''); } // very old browsers lack <dialog>
    el.detail.scrollTop = 0;
    if (!v.id) return;

    api(`/places?action=details&id=${encodeURIComponent(v.id)}`).then((d) => {
      if (seq === detailSeq) renderDetail(d);
    }).catch(() => { if (seq === detailSeq) $('d-status').textContent = 'Couldn’t load more details right now.'; });
  }

  function renderDetail(d) {
    if (d.summary) { $('d-summary').textContent = d.summary; $('d-summary').classList.remove('hidden'); }
    // The details call can return more photos than the search did; keep the user's current photo if it is still there.
    if (d.photos.length > dView.photos.length) {
      const cur = dView.photos[dView.i] && dView.photos[dView.i].name;
      setDetailPhotos(d.photos);
      const keep = d.photos.findIndex((p) => p.name === cur);
      if (keep > 0) showDetailPhoto(keep);
    }
    if (d.hours.length || d.openNow != null) setDetailHours(d.hours.length ? d.hours : state.active.hours || [], d.openNow);
    if (d.website) { const w = $('d-website'); w.href = d.website; w.classList.remove('hidden'); }
    if (d.mapsUri) $('d-directions').href = d.mapsUri;
    $('d-status').textContent = d.reviews.length ? '' : 'No written reviews yet.';
    $('d-reviews').innerHTML = d.reviews.map((r) => `
      <li class="rounded-xl border border-line p-4">
        <div class="flex items-center justify-between gap-2"><span class="font-semibold">${esc(r.author)}</span>
          <span class="text-sm text-amber-500" aria-label="${r.rating} out of 5">${'★'.repeat(Math.round(r.rating))}</span></div>
        <p class="mt-0.5 text-xs text-muted">${esc(r.when)}</p>
        ${r.text ? `<p class="mt-2 text-sm leading-relaxed">${esc(r.text)}</p>` : ''}
      </li>`).join('');
  }

  const closeDetail = () => { if (el.detail.open) el.detail.close(); };

  // ---------------------------------------------------------------- lead modal
  function openLead(venue) {
    state.active = venue;
    el.lform.reset();
    el.lform.classList.remove('hidden');
    el.success.classList.add('hidden');
    el.lerr.classList.add('hidden');
    el.lsubmit.disabled = false; el.lsubmit.textContent = 'Continue';
    el.lturf.textContent = venue.name;
    const f = el.lform.elements;
    // Sport = the chip the user filtered by (if it applies), otherwise every sport the venue offers.
    const sport = ['all', 'multi'].includes(state.sport) || !venue.sports.includes(state.sport)
      ? venue.sports.map((s) => SPORT[s].short).join(' / ')
      : SPORT[state.sport].short;
    f.turfName.value = venue.name;
    f.turfPlaceId.value = venue.id || '';
    f.turfArea.value = venue.area || venue.address || '';
    f.sport.value = sport;
    f.userArea.value = locText(state.loc);
    el.dlg.showModal();
    f.fullName.focus();
  }

  function closeLead() { if (el.dlg.open) el.dlg.close(); }

  async function submitLead(e) {
    e.preventDefault();
    el.lerr.classList.add('hidden');
    if (!el.lform.checkValidity()) { el.lform.reportValidity(); return; }
    const f = el.lform.elements, v = state.active, qs = new URLSearchParams(location.search);
    const payload = {
      // who
      fullName: f.fullName.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), ageGroup: f.ageGroup.value,
      // what they clicked (hidden metadata)
      turfName: f.turfName.value, turfPlaceId: f.turfPlaceId.value, turfArea: f.turfArea.value,
      sport: f.sport.value, sportFilter: SPORT[state.sport].label,
      // where they are
      userArea: f.userArea.value, userCity: state.loc.city || '', locationSource: state.loc.source, distanceKm: v.km,
      // attribution
      pageUrl: location.href, referrer: document.referrer,
      utmSource: qs.get('utm_source') || '', utmMedium: qs.get('utm_medium') || '', utmCampaign: qs.get('utm_campaign') || '',
      consent: f.consent.checked,
      website: f.website.value, // honeypot
    };
    el.lsubmit.disabled = true; el.lsubmit.textContent = 'Sending…';
    try {
      const res = await fetch(`${API}/capture-lead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('json') ? await res.json() : {};
      if (!res.ok) throw new Error(data.errors ? Object.values(data.errors).join('. ') : data.error === 'rate_limited' ? 'Too many attempts – please wait a minute.' : 'Something went wrong. Please try again.');
      await showSuccess(payload.fullName.split(' ')[0], v);
    } catch (err) {
      el.lerr.textContent = err.message;
      el.lerr.classList.remove('hidden');
      el.lsubmit.disabled = false; el.lsubmit.textContent = 'Continue';
    }
  }

  async function showSuccess(firstName, venue) {
    $('success-name').textContent = firstName;
    const call = $('success-call');
    call.classList.add('hidden'); call.classList.remove('flex');
    $('success-msg').textContent = 'Fetching the venue’s number…';
    el.lform.classList.add('hidden');
    el.success.classList.remove('hidden');
    $('success-close').focus();
    let phone = null;
    if (venue.id) { try { phone = await api(`/places?action=phone&id=${encodeURIComponent(venue.id)}`); } catch { /* handled below */ } }
    if (phone && phone.tel) {
      $('success-msg').textContent = `Here’s the number for ${venue.name}.`;
      call.href = `tel:${phone.tel}`;
      call.textContent = `📞 Call ${phone.phone}`;
      call.classList.remove('hidden'); call.classList.add('flex');
    } else {
      $('success-msg').textContent = 'We’ve noted your request. The venue’s number isn’t available yet – we’ll reach out to you shortly.';
    }
  }

  // ---------------------------------------------------------------- events
  function togglePanel(open) {
    el.locPanel.hidden = !open;
    el.locToggle.setAttribute('aria-expanded', String(open));
    if (open) el.locInput.focus();
  }
  el.locToggle.addEventListener('click', () => togglePanel(el.locPanel.hidden));
  document.addEventListener('click', (e) => { if (!el.locPanel.hidden && !e.target.closest('#loc-panel, #loc-toggle')) togglePanel(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.locPanel.hidden) { togglePanel(false); el.locToggle.focus(); } });

  el.locForm.addEventListener('submit', (e) => { e.preventDefault(); togglePanel(false); searchLocation(el.locInput.value); });
  el.locate.addEventListener('click', () => { togglePanel(false); detectLocation({ fallbackToSaved: false }); });
  el.cityList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-city]'); if (!b) return;
    const c = CITIES.find((x) => x.name === b.dataset.city);
    togglePanel(false); showNote('');
    setLocation({ lat: c.lat, lng: c.lng, area: '', city: c.name, source: 'city' });
  });
  el.heroForm.addEventListener('submit', (e) => { e.preventDefault(); handleHeroSearch(el.heroInput.value); });

  el.chips.addEventListener('click', (e) => { const b = e.target.closest('[data-sport]'); if (b) setSport(b.dataset.sport); });
  el.sort.addEventListener('change', () => { state.sort = el.sort.value; if (state.loc) render(); });
  el.sub.addEventListener('click', (e) => { if (e.target.id === 'clear-query') { state.query = ''; render(); } });

  function loadMedia(track) {
    track.querySelectorAll('img[data-src]').forEach((i) => { i.src = i.dataset.src; i.removeAttribute('data-src'); });
  }
  el.grid.addEventListener('click', (e) => {
    const slide = e.target.closest('[data-slide]');
    if (slide) {
      const track = slide.closest('.card-media').querySelector('[data-track]');
      loadMedia(track);
      track.scrollBy({ left: +slide.dataset.slide * track.clientWidth, behavior: 'smooth' });
      return;
    }
    const call = e.target.closest('[data-call]');
    if (call) return openLead(shown[+call.dataset.call]);
    const open = e.target.closest('[data-open]');
    if (open) return openDetail(shown[+open.dataset.open], open);
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const key = favKey(shown[+fav.dataset.fav]);
      state.favs.has(key) ? state.favs.delete(key) : state.favs.add(key);
      fav.setAttribute('aria-pressed', String(state.favs.has(key)));
      store.set('cridaa.favs', [...state.favs]);
      return;
    }
    // Clicking anywhere else on the card (photo, blank space) also opens it; links keep their own behaviour.
    const card = e.target.closest('.venue-card');
    if (card && !e.target.closest('a, button')) openDetail(shown[+card.dataset.idx]);
  });
  el.mapCanvas.addEventListener('click', (e) => { const p = e.target.closest('[data-pin]'); if (p) pick(+p.dataset.pin); });
  $('map-recenter').addEventListener('click', () => pick(null));

  // Scroll doesn't bubble either: update the "2/5" counter and load the other photos on first swipe.
  el.grid.addEventListener('scroll', (e) => {
    const t = e.target; if (!t.matches || !t.matches('[data-track]')) return;
    loadMedia(t);
    const n = Math.round(t.scrollLeft / t.clientWidth) + 1;
    const c = t.parentElement.querySelector('[data-count]'); if (c) c.textContent = `${n}/${t.children.length}`;
  }, true);
  // <img> error events don't bubble, so listen in the capture phase.
  el.grid.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && !img.dataset.fallback) { img.dataset.fallback = '1'; img.src = placeholder(img.dataset.sport); }
  }, true);

  el.lform.addEventListener('submit', submitLead);
  $('lead-close').addEventListener('click', closeLead);
  $('d-close').addEventListener('click', closeDetail);
  el.detail.addEventListener('click', (e) => { if (e.target === el.detail) closeDetail(); });
  $('d-call').addEventListener('click', () => { const v = state.active; closeDetail(); openLead(v); });
  $('d-thumbs').addEventListener('click', (e) => { const b = e.target.closest('[data-thumb]'); if (b) showDetailPhoto(+b.dataset.thumb); });
  $('d-prev').addEventListener('click', () => showDetailPhoto(dView.i - 1));
  $('d-next').addEventListener('click', () => showDetailPhoto(dView.i + 1));
  el.detail.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') showDetailPhoto(dView.i - 1);
    else if (e.key === 'ArrowRight') showDetailPhoto(dView.i + 1);
  });
  $('d-photo').addEventListener('error', (e) => { const i = e.target; if (!i.dataset.fallback) { i.dataset.fallback = '1'; i.src = placeholder(i.dataset.sport); } });
  $('success-close').addEventListener('click', closeLead);
  el.dlg.addEventListener('click', (e) => { if (e.target === el.dlg) closeLead(); }); // backdrop click

  // ---------------------------------------------------------------- init
  function init() {
    $('year').textContent = new Date().getFullYear();
    el.cityList.innerHTML = CITIES.map((c) => `<li><button type="button" data-city="${esc(c.name)}" class="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-mist">${esc(c.name)}</button></li>`).join('');
    const saved = store.get('cridaa.favs'); if (Array.isArray(saved)) saved.forEach((k) => state.favs.add(k));
    const wanted = new URLSearchParams(location.search).get('sport');
    if (SPORT[wanted]) state.sport = wanted;
    renderChips();
    showSkeleton();
    detectLocation();
  }
  init();
})();
