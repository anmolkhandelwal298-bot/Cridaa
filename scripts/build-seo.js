#!/usr/bin/env node
/**
 * Generates the SEO landing pages, the "browse" link sections on the home page, sitemap.xml and robots.txt.
 *
 *   SITE_URL=https://www.yourdomain.com node scripts/build-seo.js
 *
 * Output:  /badminton-courts            (hub: "near me", uses the visitor's location)
 *          /badminton-courts/ahmedabad  (city page, fixed location)   ... for every sport x city
 * Re-run whenever you edit scripts/seo-data.js or index.html, then commit the generated files.
 * Zero dependencies.
 */
const fs = require('fs');
const path = require('path');
const { SPORTS, CITIES } = require('./seo-data');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, c) => { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), c); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const list = (arr) => (arr.length > 1 ? `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}` : arr[0]);

let home = read('index.html');
const currentSite = (home.match(/<link rel="canonical" href="(https?:\/\/[^"]+?)\/?">/) || [])[1];
const SITE = (process.env.SITE_URL || currentSite || 'https://cridaa.com').replace(/\/+$/, '');
if (currentSite && currentSite !== SITE) home = home.split(currentSite).join(SITE);

const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); if (i < 0 || j < 0) throw new Error(`marker ${a} / ${b} missing in index.html`); return [i, j + b.length]; };
// ---------------------------------------------------------------- shared <head> (home + every landing page)
const HOME_META = {
  title: 'Cridaa – Sports Venues Near Me | Courts & Turfs Directory',
  desc: 'Directory of sports venues near you: box cricket and football turfs, badminton, pickleball and tennis courts. Photos, ratings, timings and distance.',
  keywords: 'sports venues near me, badminton court near me, box cricket turf near me, football turf near me, pickleball court near me, tennis court near me, sports turf directory',
};
function headBlock({ title, desc, url, keywords, graph, geo }) {
  const t = esc(title), d = esc(desc);
  return `<!--@head-start-->
  <title>${t}</title>
  <meta name="description" content="${d}">
  <meta name="keywords" content="${esc(keywords)}">
  <meta name="author" content="Cridaa">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="en-IN" href="${url}">
  <link rel="alternate" hreflang="x-default" href="${url}">
  ${geo ? `<meta name="geo.region" content="IN">\n  <meta name="geo.placename" content="${esc(geo.name)}">\n  <meta name="geo.position" content="${geo.lat};${geo.lng}">\n  <meta name="ICBM" content="${geo.lat}, ${geo.lng}">` : '<meta name="geo.region" content="IN">'}
  <meta name="theme-color" content="#f2f9f9">
  <meta name="color-scheme" content="light">
  <meta name="application-name" content="Cridaa">
  <meta name="apple-mobile-web-app-title" content="Cridaa">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Cridaa">
  <meta property="og:locale" content="en_IN">
  <meta property="og:title" content="${t}">
  <meta property="og:description" content="${d}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/og-image.png">
  <meta property="og:image:secure_url" content="${SITE}/og-image.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Cridaa – every sports venue near you, in one place">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${t}">
  <meta name="twitter:description" content="${d}">
  <meta name="twitter:image" content="${SITE}/og-image.png">
  <meta name="twitter:image:alt" content="Cridaa – every sports venue near you, in one place">
  <script type="application/ld+json">
  ${JSON.stringify(graph)}
  </script>
  <!--@head-end-->`;
}
const ORG = (site) => ({ '@type': 'Organization', '@id': site + '/#org', name: 'Cridaa', url: site + '/', logo: site + '/icon-512.png' });
{
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      ORG(SITE),
      { '@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: 'Cridaa', description: 'Directory of sports venues near you: turfs, courts and grounds', inLanguage: 'en-IN', publisher: { '@id': SITE + '/#org' } },
      { '@type': 'ItemList', name: 'Sports venues on Cridaa', itemListElement: SPORTS.map((s, k) => ({ '@type': 'ListItem', position: k + 1, name: s.nearMe, url: SITE + '/' + s.slug })) },
    ],
  };
  home = swap(home, '<!--@head-start-->', '<!--@head-end-->', headBlock({ ...HOME_META, url: SITE + '/', graph }));
}

const pageUrl = (sport, city) => `/${sport.slug}${city ? '/' + city.slug : ''}`;

// ---------------------------------------------------------------- shared link sections (home + every page)
function linksSection() {
  const sportCards = SPORTS.map((s) => `
        <a href="${pageUrl(s)}" class="rounded-2xl border border-line bg-white p-5 transition hover:border-teal hover:shadow-md">
          <h3 class="font-display text-xl font-semibold">${esc(s.nearMe)}</h3>
          <p class="mt-1 text-sm text-muted">${esc(s.tagline)}</p>
          <span class="mt-3 inline-block text-sm font-semibold text-teal-dark">Browse ${esc(s.plural)} →</span>
        </a>`).join('');
  const cityBlocks = CITIES.map((c) => `
        <div>
          <h3 class="font-semibold">${esc(c.name)}</h3>
          <ul class="mt-2 space-y-1 text-sm">
            ${SPORTS.map((s) => `<li><a class="text-muted hover:text-teal-dark hover:underline" href="${pageUrl(s, c)}">${esc(s.name)} in ${esc(c.name)}</a></li>`).join('\n            ')}
          </ul>
        </div>`).join('');
  return `<!--@links-start-->
    <section aria-labelledby="by-sport" class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p class="text-xs font-bold uppercase tracking-[.18em] text-teal-dark">Browse by sport</p>
      <h2 id="by-sport" class="mt-1 font-display text-3xl font-semibold">Find the venue for your game</h2>
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${sportCards}
      </div>
    </section>
    <section aria-labelledby="by-city" class="bg-white py-14">
      <div class="mx-auto max-w-7xl px-4 sm:px-6">
        <p class="text-xs font-bold uppercase tracking-[.18em] text-teal-dark">Browse by city</p>
        <h2 id="by-city" class="mt-1 font-display text-3xl font-semibold">Sports venues in your city</h2>
        <div class="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">${cityBlocks}
        </div>
      </div>
    </section>
    <!--@links-end-->`;
}
{
  const [i, j] = between(home, '<!--@links-start-->', '<!--@links-end-->');
  home = home.slice(0, i) + linksSection() + home.slice(j);
}
write('index.html', home);

// ---------------------------------------------------------------- per-page builders
function pageHtml({ sport, city }) {
  const cityName = city ? city.name : 'me';
  const h1Core = city ? `${sport.name === 'Box Cricket' ? 'Box cricket turfs' : cap(sport.plural)} in ` : `${cap(sport.plural)} `;
  const title = city
    ? `${titleCase(sport.plural)} in ${city.name} – Timings & Ratings | Cridaa`
    : `${titleCase(sport.plural)} Near Me – Timings & Ratings | Cridaa`;
  const desc = city
    ? `Find ${sport.plural} in ${city.name}, from ${list(city.areas.slice(0, 3))}. Compare photos, ratings, timings and distance, then call the venue.`
    : `Find ${sport.plural} near you. Compare photos, ratings, timings and distance, then call the venue directly.`;
  const url = SITE + pageUrl(sport, city);
  const crumbs = [['Cridaa', '/'], [cap(sport.plural), pageUrl(sport)]].concat(city ? [[city.name, pageUrl(sport, city)]] : []);

  const head = headBlock({
    title, desc, url,
    keywords: [sport.nearMe, `${sport.plural} ${city ? 'in ' + city.name : 'near me'}`, city ? `${sport.singular} ${city.name}` : `best ${sport.plural}`, ...(city ? city.areas.slice(0, 3).map((a) => `${sport.singular} ${a}`) : []), 'sports venues near me'].join(', '),
    geo: city,
    graph: {
      '@context': 'https://schema.org',
      '@graph': [
        ORG(SITE),
        { '@type': 'WebPage', '@id': url + '#page', url, name: title, description: desc, inLanguage: 'en-IN', isPartOf: { '@type': 'WebSite', name: 'Cridaa', url: SITE + '/' } },
        { '@type': 'BreadcrumbList', itemListElement: crumbs.map(([name, p], k) => ({ '@type': 'ListItem', position: k + 1, name, item: SITE + p })) },
      ],
    },
  });

  const hero = `<!--@hero-start-->
          <nav aria-label="Breadcrumb" class="mb-5 text-sm text-muted">${crumbs.map(([n, p], k) => (k < crumbs.length - 1 ? `<a class="hover:text-teal-dark hover:underline" href="${p}">${esc(n)}</a> <span aria-hidden="true">›</span> ` : `<span aria-current="page">${esc(n)}</span>`)).join('')}</nav>
          <h1 id="hero-title" class="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            ${city ? `${esc(cap(sport.plural))} in <span class="text-teal">${esc(city.name)}</span>` : `<span class="text-teal">${esc(cap(sport.singular))}</span><br>near me`}
          </h1>
          <p class="mt-5 max-w-lg text-lg leading-relaxed text-muted">${esc(sport.tagline)} ${city ? `Browse ${esc(sport.plural)} across ${esc(city.areas.join(', '))} and more.` : 'Allow location access to see the nearest venues first.'}</p>
          <!--@hero-end-->`;

  const otherSports = SPORTS.filter((s) => s.id !== sport.id);
  const intro = sport.intro.map((p) => `<p class="mt-4 leading-relaxed text-muted">${esc(p)}</p>`).join('');
  const cityPara = city
    ? `<p class="mt-4 leading-relaxed text-muted">${esc(city.name)} players are spread across neighbourhoods such as ${esc(list(city.areas))}. The list above is sorted by distance from ${esc(city.name)}'s centre; allow location access or use the location button at the top to see the ${esc(sport.plural)} closest to you.</p>`
    : '';
  const faqs = sport.faqs.concat(city ? [[`Where can I find ${sport.plural} in ${city.name}?`, `Use the list on this page: it shows ${sport.plural} around ${city.name} with ratings, photos and timings. Areas such as ${list(city.areas.slice(0, 3))} are good places to start.`]] : []);
  const content = `<!--@page-content-->
    <section aria-labelledby="about-page" class="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h2 id="about-page" class="font-display text-3xl font-semibold">${city ? `${esc(cap(sport.plural))} in ${esc(city.name)}` : `Find ${esc(sport.plural)} near you`}</h2>
      ${intro}${cityPara}
      <h3 class="mt-8 font-display text-xl font-semibold">What to check before you go</h3>
      <ul class="mt-3 list-disc space-y-1.5 pl-5 text-muted">${sport.checklist.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <h3 class="mt-8 font-display text-xl font-semibold">Frequently asked questions</h3>
      <div class="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
        ${faqs.map(([q, a]) => `<details class="p-5"><summary class="cursor-pointer font-semibold">${esc(q)}</summary><p class="mt-2 text-muted">${esc(a)}</p></details>`).join('\n        ')}
      </div>
      <div class="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span class="font-semibold">More ${city ? `in ${esc(city.name)}` : 'sports'}:</span>
        ${otherSports.map((s) => `<a class="text-teal-dark hover:underline" href="${pageUrl(s, city)}">${esc(cap(s.plural))}${city ? ` in ${esc(city.name)}` : ''}</a>`).join('\n        ')}
      </div>
      ${city ? `<div class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm"><span class="font-semibold">Other cities:</span>${CITIES.filter((c) => c.slug !== city.slug).map((c) => `<a class="text-teal-dark hover:underline" href="${pageUrl(sport, c)}">${esc(c.name)}</a>`).join(' ')}</div>` : ''}
    </section>`;

  const config = `<!--@page-config-->
  <script>window.CRIDAA_PAGE = ${JSON.stringify({ sport: sport.id, city: city ? { name: city.name, lat: city.lat, lng: city.lng } : null })};</script>`;

  let html = home;
  html = swap(html, '<!--@head-start-->', '<!--@head-end-->', head);
  html = swap(html, '<!--@hero-start-->', '<!--@hero-end-->', hero);
  html = html.replace('<!--@page-content-->', content).replace('<!--@page-config-->', config);
  return html;
}

function swap(src, a, b, replacement) { const [i, j] = between(src, a, b); return src.slice(0, i) + replacement + src.slice(j); }
function titleCase(s) { return s.replace(/\b\w/g, (c) => c.toUpperCase()); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------------------------------------------------------------- write pages, sitemap, robots
const urls = [{ loc: '/', pri: '1.0' }];
let count = 0;
for (const sport of SPORTS) {
  write(`${sport.slug}/index.html`, pageHtml({ sport })); count++;
  urls.push({ loc: pageUrl(sport), pri: '0.9' });
  for (const city of CITIES) {
    write(`${sport.slug}/${city.slug}.html`, pageHtml({ sport, city })); count++;
    urls.push({ loc: pageUrl(sport, city), pri: '0.8' });
  }
}
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u.loc}</loc><changefreq>daily</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Built ${count} pages + sitemap.xml + robots.txt for ${SITE}`);
