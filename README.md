# Cridaa — hyper-local sports turf & court directory

Static site (HTML + Tailwind CDN + vanilla JS) with two Vercel serverless functions. **₹0 hosting** on Vercel's free tier.

```
cridaa/
├── index.html          # semantic HTML5, meta/OG/Schema.org, modal form
├── style.css           # custom theme tweaks on top of Tailwind
├── app.js              # geolocation, filters, sorting, cards, lead modal (NO API keys)
├── api/
│   ├── _util.js        # rate limit, origin check, helpers (not routed)
│   ├── places.js       # secure Google Geocoding + Places proxy (reads process.env.GOOGLE_MAPS_API_KEY)
│   └── capture-lead.js # validates lead → Google Sheet and/or Web3Forms
├── vercel.json  favicon.svg  robots.txt  sitemap.xml  .env.example  .gitignore
```

## Deploy in 2 minutes

1. **Google key** – [Google Cloud Console](https://console.cloud.google.com/) → new project → enable **Geocoding API** and **Places API (New)** → *Credentials → Create API key*.
   Under *API restrictions* allow only those two APIs. (Application restrictions can't be used for server-side calls on Vercel because egress IPs vary, so the quota cap in step 6 is your safety net.)
2. **Push this folder to GitHub** (or run `npm i -g vercel && vercel` from the folder).
3. **Vercel** → *Add New → Project* → import the repo. Framework preset: **Other**. No build command, no output directory. Deploy.
4. **Project → Settings → Environment Variables** (Production + Preview), then **redeploy**:

   | Name | Value |
   |---|---|
   | `GOOGLE_MAPS_API_KEY` | your key (server-only; never shipped to the browser) |
   | `LEAD_WEBHOOK_URL` + `LEAD_WEBHOOK_SECRET` | Option A below |
   | `WEB3FORMS_ACCESS_KEY` | Option B below |
   | `ALLOWED_ORIGINS` *(optional)* | `https://yourdomain.com` |
   | `DEFAULT_REGION` *(optional)* | `IN` |
   | `ANTHROPIC_API_KEY` *(optional)* | enables the AI venue judge (see below) |
   | `VENUE_FILTER` *(optional)* | `off` disables all filtering |

5. Replace `cridaa.example` in `index.html`, `robots.txt`, `sitemap.xml` with your domain; add a 1200×630 `og-image.jpg`.
6. **Cap spend**: Cloud Console → *APIs & Services → Quotas* → set a daily request limit per API (e.g. 500/day) and add a *Billing → Budget alert*.

Local dev: `npm i -g vercel && vercel dev` (put the variables in an untracked `.env.local`). Serving the folder with any plain static server works in **demo mode**, with clearly labelled sample listings.

## Lead capture (pick A and/or B)

The browser POSTs JSON to `/api/capture-lead`; the function validates it, adds server-side `submittedAt` / `userAgent`, then forwards it. Payload:

```json
{
  "fullName": "Asha K", "phone": "+91 98765 43210", "email": "asha@example.com", "ageGroup": "18-25",
  "turfName": "Arena 7 Box Cricket", "turfPlaceId": "ChIJ…", "turfArea": "Indiranagar, Bengaluru",
  "sport": "Box Cricket", "sportFilter": "All Sports",
  "userArea": "Koramangala, Bengaluru", "userCity": "Bengaluru", "locationSource": "gps", "distanceKm": 2.4,
  "pageUrl": "https://…", "referrer": "", "utmSource": "", "utmMedium": "", "utmCampaign": "",
  "submittedAt": "2026-10-08T10:18:56.717Z", "userAgent": "…", "consent": true
}
```

### A) Google Sheet (best for analysis)
1. Create a Sheet → **Extensions → Apps Script**, paste:
```js
const FIELDS = ['submittedAt','fullName','phone','email','ageGroup','turfName','turfPlaceId','turfArea','sport','sportFilter',
  'userArea','userCity','locationSource','distanceKm','pageUrl','referrer','utmSource','utmMedium','utmCampaign','userAgent','consent'];
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== PropertiesService.getScriptProperties().getProperty('SECRET')) return out({ ok: false });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Leads') || ss.insertSheet('Leads');
  if (sh.getLastRow() === 0) sh.appendRow(FIELDS);
  sh.appendRow(FIELDS.map((f) => body.lead[f] ?? ''));
  return out({ ok: true });
}
const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
```
2. *Project Settings → Script properties* → add `SECRET` = a long random string.
3. **Deploy → New deployment → Web app** → Execute as *Me*, access *Anyone* → copy the `/exec` URL.
4. In Vercel set `LEAD_WEBHOOK_URL` = that URL and `LEAD_WEBHOOK_SECRET` = the same string.

### B) Web3Forms (emails each lead)
Get a free access key at [web3forms.com](https://web3forms.com) and set `WEB3FORMS_ACCESS_KEY` in Vercel. The key stays on the server because the browser only talks to `/api/capture-lead`.

## Cost design
- Only the fields the UI renders are requested (Google bills by the highest-tier field in a request, and ratings sit in a higher tier, so check current Maps Platform pricing and free monthly caps). The phone number and the rich detail view (reviews, hours, website) are fetched **only on demand**: after a lead is submitted, or when a card is opened.
- Coordinates are rounded to ~1 km before calling `/api`, and responses carry `s-maxage` headers, so Vercel's CDN serves repeat searches without hitting Google.
- The city dropdown uses built-in coordinates (no geocoding call). Photos load lazily and are cached for 24 h.
- Per-IP rate limiting (best effort, in-memory), param clamping and photo-reference validation limit abuse of the proxy.

## Keeping out shops and stadiums (`api/_filter.js`)
Text search returns anything vaguely matching "football" or "badminton", including sports shops and big stadiums. Every result passes two gates:
1. **Free rules**: Google place types (`sports_complex`, `sports_club` and similar are accepted; `sporting_goods_store`, `stadium`, schools, hotels and similar are rejected) plus name patterns ("Store", "Traders" rejected; "Turf", "Box Cricket", "Court" accepted). This settles most results.
2. **AI judge (optional)**: places the rules can't decide (for example typed only as `point_of_interest`) are sent in one batched call to a small Claude model with their name, types, Google's summary and reviews. Set `ANTHROPIC_API_KEY` to enable it (default model `claude-haiku-5-5`, override with `FILTER_MODEL`). At most 10 places are judged per search, and the CDN caches results for an hour.
   Google's API returns **at most 5 reviews per place**, so the judge reads 5, not 10-15. Without the key, undecided places are dropped rather than shown.

Tune the lists at the top of `_filter.js`. Vercel's function logs show counts per search (`[search] filter {...}`).

## Notes
- **Google terms**: Places content may not be stored long-term. Cache TTLs are kept short, photo authors are shown, and the footer carries the "© Google" notice. Check the current Maps Platform terms before launch.
- **Privacy**: the modal has an explicit consent checkbox. Add a privacy-policy page before launch.
- **Production CSS**: the Tailwind CDN script is fine for launch. For the best Lighthouse score, compile with the Tailwind CLI and replace the `<script>` tag with the generated CSS file.
- **SEO**: listings are rendered client-side (Googlebot executes JS). For stronger rankings later, add static city/sport landing pages such as `/bengaluru/football-turf`.
