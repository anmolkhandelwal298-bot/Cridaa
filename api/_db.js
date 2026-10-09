/**
 * Minimal Supabase (PostgREST) client using fetch — no npm dependencies.
 * SUPABASE_URL and SUPABASE_SERVICE_KEY are server-only env vars (never sent to the browser).
 */
const enabled = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

function headers() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`; // legacy JWT-style keys; new sb_secret_ keys use apikey only
  return h;
}
const base = () => process.env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';

async function rpc(fn, args) {
  const r = await fetch(`${base()}/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(args), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`supabase rpc ${fn} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function insert(table, row) {
  const r = await fetch(`${base()}/${table}`, { method: 'POST', headers: { ...headers(), Prefer: 'return=minimal' }, body: JSON.stringify(row), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`supabase insert ${table} ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

module.exports = { enabled, rpc, insert };
