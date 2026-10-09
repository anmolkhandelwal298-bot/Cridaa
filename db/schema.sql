-- Cridaa analytics + leads database (Supabase / any Postgres 13+).
-- Run once in Supabase → SQL Editor → New query → paste → Run.

-- ============ TABLES ============
-- One row per browser-tab session. "Live now" = sessions whose last_seen is < 2 min old.
create table if not exists public.sessions (
  session_id    text primary key,
  visitor_id    text        not null,            -- random id kept in the visitor's localStorage (unique-visitor counts)
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  city          text,
  area          text,
  device        text,                            -- mobile | desktop
  referrer      text,                            -- referrer hostname only
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  page_views    int         not null default 0
);
create index if not exists sessions_last_seen_idx  on public.sessions (last_seen desc);
create index if not exists sessions_first_seen_idx on public.sessions (first_seen desc);

-- One row per interaction (heartbeats are NOT stored here, only bump sessions.last_seen).
create table if not exists public.events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  session_id  text not null,
  type        text not null,                     -- page_view | search | sport_filter | card_open | call_click
  sport       text,                              -- football | box-cricket | badminton | pickleball | tennis | multi | all
  venue_name  text,
  venue_id    text,
  city        text,
  area        text
);
create index if not exists events_created_idx      on public.events (created_at desc);
create index if not exists events_type_created_idx on public.events (type, created_at desc);

-- Every "Call Now" form submission.
create table if not exists public.leads (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  full_name        text not null,
  phone            text not null,
  email            text not null,
  age_group        text not null,
  turf_name        text,
  turf_place_id    text,
  turf_area        text,
  sport            text,
  sport_filter     text,
  user_area        text,
  user_city        text,
  location_source  text,
  distance_km      numeric,
  page_url         text,
  referrer         text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  user_agent       text,
  session_id       text,
  consent          boolean not null default false
);
create index if not exists leads_created_idx on public.leads (created_at desc);

-- ============ SECURITY ============
-- RLS on with NO policies = the public anon key can read/write nothing.
-- Only your serverless functions (service key, server-side env var) can touch the data.
alter table public.sessions enable row level security;
alter table public.events   enable row level security;
alter table public.leads    enable row level security;
revoke all on public.sessions, public.events, public.leads from anon, authenticated;

-- ============ WRITE: one call records the session + event ============
create or replace function public.track_event(
  p_session text, p_visitor text, p_type text,
  p_sport text default null, p_venue_name text default null, p_venue_id text default null,
  p_city text default null, p_area text default null, p_device text default null,
  p_referrer text default null, p_utm_source text default null, p_utm_medium text default null, p_utm_campaign text default null
) returns void language plpgsql as $$
begin
  insert into public.sessions as s (session_id, visitor_id, city, area, device, referrer, utm_source, utm_medium, utm_campaign, page_views)
  values (p_session, p_visitor, nullif(p_city,''), nullif(p_area,''), p_device, nullif(p_referrer,''),
          nullif(p_utm_source,''), nullif(p_utm_medium,''), nullif(p_utm_campaign,''),
          case when p_type = 'page_view' then 1 else 0 end)
  on conflict (session_id) do update set
    last_seen  = now(),
    city       = coalesce(nullif(p_city,''), s.city),
    area       = coalesce(nullif(p_area,''), s.area),
    page_views = s.page_views + case when p_type = 'page_view' then 1 else 0 end;

  if p_type <> 'heartbeat' then
    insert into public.events (session_id, type, sport, venue_name, venue_id, city, area)
    values (p_session, p_type, nullif(p_sport,''), left(p_venue_name,150), left(p_venue_id,200), nullif(p_city,''), nullif(p_area,''));
  end if;
end $$;

-- ============ READ: everything the /admin dashboard needs, in one call ============
create or replace function public.admin_stats(p_days int default 30, p_tz text default 'Asia/Kolkata')
returns jsonb language sql stable as $$
  with bounds as (
    select now() - make_interval(days => greatest(1, least(p_days, 365))) as since,
           (date_trunc('day', now() at time zone p_tz) at time zone p_tz)  as today_start
  )
  select jsonb_build_object(
    'live_now',        (select count(*) from public.sessions where last_seen > now() - interval '2 minutes'),
    'live_by_city',    (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
                          select coalesce(city, 'Unknown') as city, count(*) n from public.sessions
                          where last_seen > now() - interval '2 minutes' group by 1) x),
    'visitors_today',  (select count(distinct visitor_id) from public.sessions, bounds where first_seen >= today_start),
    'visitors_period', (select count(distinct visitor_id) from public.sessions, bounds where first_seen >= since),
    'sessions_period', (select count(*) from public.sessions, bounds where first_seen >= since),
    'leads_today',     (select count(*) from public.leads, bounds where created_at >= today_start),
    'leads_total',     (select count(*) from public.leads),
    'daily_visitors',  (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'visitors', coalesce(c, 0)) order by d), '[]'::jsonb)
                        from generate_series((now() at time zone p_tz)::date - 13, (now() at time zone p_tz)::date, interval '1 day') d
                        left join (select (first_seen at time zone p_tz)::date as day, count(distinct visitor_id) c
                                   from public.sessions where first_seen > now() - interval '15 days' group by 1) s on s.day = d::date),
    -- "Most interacted sport": every filter click, card open and call click counts as one interaction.
    'top_sports',      (select coalesce(jsonb_agg(x order by x.interactions desc), '[]'::jsonb) from (
                          select sport,
                                 count(*) as interactions,
                                 count(*) filter (where type = 'sport_filter') as filters,
                                 count(*) filter (where type = 'card_open')    as opens,
                                 count(*) filter (where type = 'call_click')   as calls
                          from public.events, bounds
                          where created_at >= since and sport is not null and sport <> 'all'
                            and type in ('sport_filter','card_open','call_click')
                          group by sport) x),
    'top_venues',      (select coalesce(jsonb_agg(x order by x.interactions desc), '[]'::jsonb) from (
                          select venue_name, count(*) as interactions,
                                 count(*) filter (where type = 'card_open')  as opens,
                                 count(*) filter (where type = 'call_click') as calls
                          from public.events, bounds
                          where created_at >= since and venue_name is not null
                          group by venue_name order by count(*) desc limit 10) x),
    'top_areas',       (select coalesce(jsonb_agg(x order by x.sessions desc), '[]'::jsonb) from (
                          select coalesce(area, city, 'Unknown') as area, count(*) as sessions
                          from public.sessions, bounds where first_seen >= since
                          group by 1 order by count(*) desc limit 10) x),
    'funnel',          (select jsonb_build_object(
                          'sessions',   (select count(*) from public.sessions, bounds where first_seen >= since),
                          'opened',     (select count(distinct session_id) from public.events, bounds where created_at >= since and type = 'card_open'),
                          'called',     (select count(distinct session_id) from public.events, bounds where created_at >= since and type = 'call_click'),
                          'submitted',  (select count(*) from public.leads, bounds where created_at >= since))),
    'recent_leads',    (select coalesce(jsonb_agg(l order by l.created_at desc), '[]'::jsonb) from (
                          select * from public.leads order by created_at desc limit 500) l)
  );
$$;

-- Only the service key (server side) may run these.
revoke all on function public.track_event(text,text,text,text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_stats(int,text) from public, anon, authenticated;
