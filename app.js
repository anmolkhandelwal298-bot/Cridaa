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
  const SPORTS = [
    { id: 'all', label: 'All Sports', icon: '🏟️' },
    { id: 'box-cricket', label: 'Box Cricket', icon: '🏏' },
    { id: 'football', label: 'Football', icon: '⚽' },
    { id: 'badminton', label: 'Badminton', icon: '🏸' },
    { id: 'tennis', label: 'Tennis', icon: '🎾' },
  ];
  const SPORT = Object.fromEntries(SPORTS.map((s) => [s.id, s]));
  // Hard-coded coordinates => picking a city costs ₹0 (no geocoding call).
  const CITIES = [
    { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
    { name: 'Delhi', lat: 28.6139, lng: 77.209 },
    { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
    { name: 'Hyderabad', lat: 17.385, lng: 78.4867 },
    { name: 'Pune', lat: 18.5204, lng: 73.8567 },
    { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
    { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
    { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
    { name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
    { name: 'Gurugram', lat: 28.4595, lng: 77.0266 },
  ];

  // ---------------------------------------------------------------- state
  const state = {
    loc: null,          // { lat, lng, area, city, source: 'gps'|'search'|'city' }
    venues: [],
    sport: 'all',
    sort: 'nearest',
    demo: false,
    active: null,       // venue currently in the lead modal
    loadSeq: 0,         // guards against out-of-order responses
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    label: $('location-label'), note: $('location-note'), locate: $('btn-locate'),
    form: $('location-form'), input: $('location-input'), city: $('city-select'),
    chips: $('sport-chips'), sort: $('sort-select'), count: $('result-count'),
    grid: $('venue-grid'), empty: $('empty-state'), error: $('error-state'), demo: $('demo-banner'),
    dlg: $('lead-dialog'), lform: $('lead-form'), lerr: $('lead-error'), lsubmit: $('lead-submit'),
    lturf: $('lead-turf'), success: $('lead-success'),
  };

  // ---------------------------------------------------------------- utils
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round2 = (n) => Math.round(n * 100) / 100; // ~1 km grid => far better CDN cache hit-rate
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  function distanceKm(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

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

  /** Inline SVG placeholder, used when Google has no photo (or it fails to load). */
  function placeholder(sportId) {
    const icon = (SPORT[sportId] || SPORT.all).icon;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f3d2a"/><stop offset="1" stop-color="#0c2a46"/></linearGradient></defs>
      <rect width="640" height="400" fill="url(#g)"/>
      <g stroke="#2dff8a" stroke-opacity=".25" stroke-width="3" fill="none"><rect x="60" y="50" width="520" height="300" rx="8"/><line x1="320" y1="50" x2="320" y2="350"/><circle cx="320" cy="200" r="55"/></g>
      <text x="320" y="228" font-size="84" text-anchor="middle">${icon}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ---------------------------------------------------------------- location
  function setLocation(loc, { persist = true } = {}) {
    state.loc = loc;
    const text = [loc.area, loc.city].filter((v, i, a) => v && a.indexOf(v) === i).join(', ') || 'your location';
    el.label.textContent = text;
    document.title = `Sports Turfs & Courts in ${text} | Cridaa`;
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
    el.label.textContent = 'Detecting your location…';
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
      const denied = err && err.code === 1;
      showNote(denied
        ? 'Location access is blocked – showing a default city. Search an area or pick a city above.'
        : 'We couldn’t detect your location – showing a default city. Search an area or pick a city above.');
      setLocation(saved || { ...CITIES[0], area: '', city: CITIES[0].name, source: 'city' });
    }
  }

  async function searchLocation(text) {
    const q = text.trim();
    if (q.length < 2) return;
    showNote('');
    el.label.textContent = 'Searching…';
    try {
      const r = await api(`/places?action=geocode&q=${encodeURIComponent(q)}`);
      setLocation({ lat: r.lat, lng: r.lng, area: r.area || q, city: r.city, source: 'search' });
    } catch (e) {
      el.label.textContent = state.loc ? [state.loc.area, state.loc.city].filter(Boolean).join(', ') : 'Unknown';
      showNote(e.code === 'not_found' ? `We couldn’t find “${q}”. Try a nearby landmark or city.` : 'Search is unavailable right now. Please pick a city from the list.');
    }
  }

  // ---------------------------------------------------------------- data
  async function loadVenues() {
    const seq = ++state.loadSeq;
    showSkeleton();
    el.error.classList.add('hidden');
    const { lat, lng } = state.loc;
    try {
      const data = await api(`/places?action=search&lat=${round2(lat)}&lng=${round2(lng)}&radius=8000&sports=box-cricket,football,badminton,tennis`);
      if (seq !== state.loadSeq) return;
      state.venues = data.venues;
      state.demo = false;
    } catch (e) {
      if (seq !== state.loadSeq) return;
      if (e.code === 'no_api') { state.venues = demoVenues(state.loc); state.demo = true; }
      else { state.venues = []; showError(e.code === 'server_not_configured' ? 'Server is missing GOOGLE_MAPS_API_KEY – see README.' : 'Couldn’t load venues. Please try again in a moment.'); }
    }
    el.demo.classList.toggle('hidden', !state.demo);
    render();
  }

  /** Sample data so the UI is reviewable without a backend. Clearly flagged by the demo banner. */
  function demoVenues(loc) {
    const defs = [
      ['Arena 7 Box Cricket', ['box-cricket'], 4.6, 812, 0.012, 0.008],
      ['Greenfield Football Turf', ['football'], 4.4, 356, -0.02, 0.015],
      ['Smash Badminton Academy', ['badminton'], 4.8, 201, 0.03, -0.01],
      ['City Tennis Club', ['tennis'], 4.2, 97, -0.045, -0.03],
      ['The Pitch – Multi Sport Turf', ['football', 'box-cricket'], 4.5, 1240, 0.008, -0.022],
      ['Shuttle Hub Courts', ['badminton'], 3.9, 64, 0.06, 0.04],
      ['Striker’s Nest Turf', ['football', 'box-cricket'], 4.1, 410, -0.01, -0.05],
      ['Ace Point Tennis Courts', ['tennis'], 4.7, 150, 0.02, 0.05],
    ];
    return defs.map(([name, sports, rating, reviews, dLat, dLng], i) => ({
      id: null, name, sports, rating, reviews, photo: null, photoAuthor: '',
      address: `${loc.area || loc.city || 'Sample'} (sample address)`, area: loc.area || loc.city || 'Sample area',
      lat: loc.lat + dLat, lng: loc.lng + dLng, demoIndex: i,
    }));
  }

  // ---------------------------------------------------------------- render
  function showSkeleton() {
    el.empty.classList.add('hidden');
    el.grid.innerHTML = Array.from({ length: 6 }, () => `
      <div class="overflow-hidden rounded-2xl border border-line bg-card" aria-hidden="true">
        <div class="skeleton h-48"></div>
        <div class="space-y-3 p-5"><div class="skeleton h-5 w-3/4 rounded"></div><div class="skeleton h-4 w-1/2 rounded"></div><div class="skeleton h-10 rounded-xl"></div></div>
      </div>`).join('');
    el.count.textContent = 'Finding venues near you…';
    el.grid.setAttribute('aria-busy', 'true');
  }

  function showError(msg) { el.error.textContent = msg; el.error.classList.remove('hidden'); }

  function visibleVenues() {
    const origin = state.loc;
    let list = state.venues.map((v) => ({ ...v, km: distanceKm(origin, v) }));
    if (state.sport !== 'all') list = list.filter((v) => v.sports.includes(state.sport));
    const by = {
      nearest: (a, b) => a.km - b.km,
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.reviews - a.reviews || a.km - b.km,
      reviews: (a, b) => b.reviews - a.reviews || (b.rating ?? -1) - (a.rating ?? -1),
    };
    return list.sort(by[state.sort]).slice(0, MAX_CARDS);
  }

  function primarySport(v) {
    return state.sport !== 'all' && v.sports.includes(state.sport) ? state.sport : v.sports[0];
  }

  function cardHTML(v, idx) {
    const sid = primarySport(v);
    const photoSrc = v.photo ? `${API}/places?action=photo&ref=${encodeURIComponent(v.photo)}&w=640` : placeholder(sid);
    const rating = v.rating != null ? v.rating.toFixed(1) : null;
    const tags = v.sports.map((s) => `<span class="rounded-full border border-line bg-ink/70 px-2.5 py-0.5 text-xs font-medium text-slate-200">${SPORT[s].icon} ${esc(SPORT[s].label)}</span>`).join('');
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name + ' ' + v.address)}${v.id ? `&query_place_id=${encodeURIComponent(v.id)}` : ''}`;
    return `
    <article class="venue-card flex flex-col overflow-hidden rounded-2xl border border-line bg-card" data-idx="${idx}">
      <div class="relative">
        <img src="${esc(photoSrc)}" data-sport="${esc(sid)}" alt="${esc(v.name)} – ${esc(SPORT[sid].label)} venue" width="640" height="400"
             loading="${idx < 3 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" class="h-48 w-full object-cover">
        <span class="badge-soon absolute left-3 top-3 rounded-full border border-bolt/50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sky-100 backdrop-blur">Prices Coming Soon</span>
        <span class="absolute bottom-3 right-3 rounded-full bg-ink/85 px-3 py-1 text-xs font-semibold text-volt backdrop-blur">${fmtKm(v.km)} away</span>
      </div>
      <div class="flex flex-1 flex-col p-5">
        <div class="mb-3 flex flex-wrap gap-1.5">${tags}</div>
        <h3 class="font-display text-2xl font-bold leading-tight text-white">${esc(v.name)}</h3>
        <p class="mt-1 line-clamp-2 text-sm text-slate-400">${esc(v.area || v.address)}</p>
        <div class="mt-3 flex items-center gap-2 text-sm">
          ${rating ? `<span class="stars" style="--rating:${v.rating}" aria-hidden="true">★★★★★</span>
            <span class="font-semibold text-white">${rating}</span>
            <span class="text-slate-400">(${v.reviews.toLocaleString('en-IN')} reviews)</span>
            <span class="sr-only">Rated ${rating} out of 5</span>` : '<span class="text-slate-500">No ratings yet</span>'}
        </div>
        ${v.photo && v.photoAuthor ? `<p class="mt-2 text-[11px] text-slate-500">Photo: ${esc(v.photoAuthor)} / Google</p>` : ''}
        <div class="mt-auto flex gap-2 pt-5">
          <button type="button" data-call="${idx}" class="flex-1 rounded-xl bg-volt px-4 py-3 font-bold text-black hover:brightness-110">📞 Call Now</button>
          <a href="${esc(maps)}" target="_blank" rel="noopener noreferrer" class="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/5" aria-label="Directions to ${esc(v.name)} (opens Google Maps)">Map ↗</a>
        </div>
      </div>
    </article>`;
  }

  let shown = [];
  function render() {
    shown = visibleVenues();
    el.grid.removeAttribute('aria-busy');
    el.grid.innerHTML = shown.map(cardHTML).join('');
    el.empty.classList.toggle('hidden', shown.length > 0 || !el.error.classList.contains('hidden'));
    const where = el.label.textContent;
    const sportName = state.sport === 'all' ? 'venues' : SPORT[state.sport].label + ' venues';
    el.count.textContent = shown.length ? `${shown.length} ${sportName} near ${where}` : '';
    injectStructuredData();
  }

  /** Live Schema.org ItemList → LocalBusiness (SportsActivityLocation) for the currently shown venues. */
  function injectStructuredData() {
    document.getElementById('ld-live')?.remove();
    if (!shown.length || state.demo) return; // never publish sample data as structured data
    const data = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Sports turfs and courts near ${el.label.textContent}`,
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
      `<button type="button" class="chip rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-slate-200 hover:border-volt/60" data-sport="${s.id}" aria-pressed="${s.id === state.sport}">${s.icon} ${esc(s.label)}</button>`).join('');
  }

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
    f.turfName.value = venue.name;
    f.turfPlaceId.value = venue.id || '';
    f.turfArea.value = venue.area || venue.address || '';
    f.sport.value = SPORT[primarySport(venue)].label;
    f.userArea.value = [state.loc.area, state.loc.city].filter(Boolean).join(', ');
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
      sport: f.sport.value, sportFilter: state.sport === 'all' ? 'All Sports' : SPORT[state.sport].label,
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
  el.chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sport]'); if (!b) return;
    state.sport = b.dataset.sport;
    el.chips.querySelectorAll('[data-sport]').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    const url = new URL(location.href);
    state.sport === 'all' ? url.searchParams.delete('sport') : url.searchParams.set('sport', state.sport);
    history.replaceState(null, '', url);
    if (state.loc) render();
  });
  el.sort.addEventListener('change', () => { state.sort = el.sort.value; if (state.loc) render(); });
  el.locate.addEventListener('click', () => detectLocation({ fallbackToSaved: false }));
  el.form.addEventListener('submit', (e) => { e.preventDefault(); searchLocation(el.input.value); });
  el.city.addEventListener('change', () => {
    const c = CITIES.find((x) => x.name === el.city.value); if (!c) return;
    el.input.value = '';
    showNote('');
    setLocation({ lat: c.lat, lng: c.lng, area: '', city: c.name, source: 'city' });
  });
  el.grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-call]'); if (b) openLead(shown[+b.dataset.call]);
  });
  // <img> error events don't bubble, so listen in the capture phase.
  el.grid.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && !img.dataset.fallback) { img.dataset.fallback = '1'; img.src = placeholder(img.dataset.sport); }
  }, true);
  el.lform.addEventListener('submit', submitLead);
  $('lead-close').addEventListener('click', closeLead);
  $('success-close').addEventListener('click', closeLead);
  el.dlg.addEventListener('click', (e) => { if (e.target === el.dlg) closeLead(); }); // backdrop click

  // ---------------------------------------------------------------- init
  function init() {
    $('year').textContent = new Date().getFullYear();
    el.city.insertAdjacentHTML('beforeend', CITIES.map((c) => `<option>${esc(c.name)}</option>`).join(''));
    const wanted = new URLSearchParams(location.search).get('sport');
    if (SPORT[wanted]) state.sport = wanted;
    renderChips();
    showSkeleton();
    detectLocation();
  }
  init();
})();
