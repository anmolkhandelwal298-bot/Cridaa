# Cridaa — directory of sports venues near you

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
├── admin.html          # private dashboard (live visitors, sports, funnel, leads, CSV)
├── db/schema.sql       # Postgres tables + functions for Supabase
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
   | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_PASSWORD` | database + dashboard (below) |
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

## Analytics database + admin dashboard (free, Supabase)

Tracks **live visitors**, **most-interacted sport**, a visit→lead funnel, and **every form entry**. Anonymous: only random ids are stored (no IP, no cookies).

1. **Create the database** – [supabase.com](https://supabase.com) → New project (free plan). Pick the region closest to your users (Mumbai if available) and save the database password.
2. **Create the tables** – Supabase → *SQL Editor → New query* → paste all of `db/schema.sql` → *Run*. This creates `sessions`, `events`, `leads`, locks them down with Row Level Security (the public key can read nothing) and adds the two functions the site calls.
3. **Copy the keys** – *Project Settings → API*: the **Project URL**, and the **service_role / secret key**. The secret key is server-only: never put it in `app.js`.
4. **Add to Vercel → Environment Variables** (mark the key and password as *Secret*), then redeploy:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | the secret / service_role key |
   | `ADMIN_PASSWORD` | a long password (8+ characters) for the dashboard |

   *Shortcut:* in Vercel → *Storage / Integrations → Supabase → Connect* adds `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for you (the code accepts either name). You still need step 2 and `ADMIN_PASSWORD`.

5. Open **`https://yourdomain.com/admin`** and sign in. It refreshes every 15 seconds.

What it records:

| What | How |
|---|---|
| **Live now** | each open tab pings `/api/track` every 30 s; "live" = pinged in the last 2 minutes, with a split by city |
| **Footfall** | unique visitors and sessions per day (IST), last 14 days, plus the selected period |
| **Most interacted sport** | every sport-filter click, card opened and "Call Now" click, counted per sport |
| **Top venues / areas** | cards opened and calls per venue, sessions per area |
| **Funnel** | sessions → opened a place → clicked Call Now → submitted the form |
| **All form entries** | every lead (name, phone, email, age group, turf, sport, user area, UTM, source), searchable, with CSV download |

Notes: the Supabase free plan pauses projects after about a week of no activity (just resume it) and has a 500 MB limit, which is hundreds of thousands of events. If you operate under India's DPDP Act or GDPR, mention the anonymous analytics in your privacy policy. To purge old events, run `delete from events where created_at < now() - interval '180 days';` in the SQL Editor.

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
