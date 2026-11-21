-- =====================================================================
-- LabLive PATCH 1
--
-- HOW TO RUN (once): Supabase -> SQL Editor -> New query -> paste ALL of this -> Run
--
-- Safe to run while your website is live: the current app keeps working.
-- Run it BEFORE you deploy the new backend files.
--
-- What it adds
--   * sessions expire after 12 hours, and a teacher can lock joining
--   * a teacher can remove a student (and the student cannot rejoin)
--   * the database (not the browser) decides activity, hand and submit times
--   * whitespace-only typing no longer counts as "activity"
--   * a student can add a short message when raising a hand
--   * simple rate limiting for joining, creating sessions, notes and hands
--   * closes two loopholes (students writing to snapshots / editing profiles)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. NEW COLUMNS
-- ---------------------------------------------------------------------

alter table public.lab_sessions
  add column if not exists expires_at timestamptz not null default (now() + interval '12 hours'),
  add column if not exists join_locked boolean not null default false;

alter table public.participants
  add column if not exists help_message text
    check (help_message is null or char_length(help_message) <= 200);


-- ---------------------------------------------------------------------
-- 2. NEW TABLES
-- ---------------------------------------------------------------------

create table if not exists public.session_bans (
  session_id  uuid not null references public.lab_sessions(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (session_id, student_id)
);

create table if not exists public.rate_limits (
  user_id       uuid not null,
  bucket        text not null,
  window_start  timestamptz not null,
  hits          int not null default 1,
  primary key (user_id, bucket, window_start)
);

alter table public.session_bans enable row level security;
alter table public.rate_limits  enable row level security;

drop policy if exists "bans: teacher reads" on public.session_bans;
create policy "bans: teacher reads"
  on public.session_bans for select to authenticated
  using (public.is_session_teacher(session_id));

drop policy if exists "bans: teacher adds" on public.session_bans;
create policy "bans: teacher adds"
  on public.session_bans for insert to authenticated
  with check (public.is_session_teacher(session_id));

revoke all on public.session_bans, public.rate_limits from anon, authenticated;
grant select, insert on public.session_bans to authenticated;
-- rate_limits is only touched by the check_rate_limit() function below.


-- ---------------------------------------------------------------------
-- 3. RATE LIMITING
--    check_rate_limit('join', 20, 60) -> false when this user has already
--    done 'join' 20 times in the current 60-second window.
-- ---------------------------------------------------------------------

create or replace function public.check_rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_hits int;
begin
  if auth.uid() is null then
    raise exception 'LABLIVE_NOT_LOGGED_IN';
  end if;

  v_start := to_timestamp(
    (floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)::double precision
  );

  insert into public.rate_limits as r (user_id, bucket, window_start, hits)
  values (auth.uid(), p_bucket, v_start, 1)
  on conflict (user_id, bucket, window_start)
  do update set hits = r.hits + 1
  returning hits into v_hits;

  -- tidy up old rows now and then
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int) from public, anon;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;


-- ---------------------------------------------------------------------
-- 4. JOINING (new rules: expiry, lock, removed students)
-- ---------------------------------------------------------------------

create or replace function public.join_session(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.lab_sessions%rowtype;
  v_pid uuid;
begin
  if auth.uid() is null then
    raise exception 'LABLIVE_NOT_LOGGED_IN';
  end if;

  select * into v_session
  from public.lab_sessions
  where join_code = upper(trim(p_code));

  if not found then
    raise exception 'LABLIVE_INVALID_CODE';
  end if;

  if v_session.status <> 'open' or v_session.expires_at <= now() then
    raise exception 'LABLIVE_SESSION_ENDED';
  end if;

  if exists (
    select 1 from public.session_bans b
    where b.session_id = v_session.id and b.student_id = auth.uid()
  ) then
    raise exception 'LABLIVE_REMOVED';
  end if;

  -- Someone who already joined may come back, even when joining is locked.
  select p.id into v_pid
  from public.participants p
  where p.session_id = v_session.id and p.student_id = auth.uid();

  if v_pid is null then
    if v_session.join_locked then
      raise exception 'LABLIVE_JOIN_LOCKED';
    end if;

    insert into public.participants (session_id, student_id)
    values (v_session.id, auth.uid())
    on conflict (session_id, student_id) do nothing
    returning id into v_pid;

    if v_pid is null then
      select p.id into v_pid
      from public.participants p
      where p.session_id = v_session.id and p.student_id = auth.uid();
    end if;
  end if;

  return jsonb_build_object('participant_id', v_pid, 'session_id', v_session.id);
end;
$$;

revoke execute on function public.join_session(text) from public, anon;
grant execute on function public.join_session(text) to authenticated;


-- ---------------------------------------------------------------------
-- 5. THE DATABASE DECIDES THE TIMES (the browser cannot fake them)
--    - submitted_at: set once, by the database clock
--    - hand_raised_at: the first time the hand went up
--    - last_activity_at: moves only when the code changes by more than spaces/blank lines
--    - code is locked after submit and after the session ends or expires
-- ---------------------------------------------------------------------

create or replace function public.participants_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open boolean;
begin
  select (s.status = 'open' and s.expires_at > now())
    into v_open
  from public.lab_sessions s
  where s.id = new.session_id;

  v_open := coalesce(v_open, false);

  -- submit
  if new.submitted_at is distinct from old.submitted_at then
    if old.submitted_at is not null then
      raise exception 'LABLIVE_ALREADY_SUBMITTED';
    end if;
    if new.submitted_at is not null then
      if not v_open then
        raise exception 'LABLIVE_SESSION_ENDED';
      end if;
      new.submitted_at := now();
    end if;
  end if;

  -- raised hand
  if new.hand_raised_at is not null then
    new.hand_raised_at := coalesce(old.hand_raised_at, now());
  end if;

  -- code
  if new.latest_code is distinct from old.latest_code then
    if old.submitted_at is not null then
      raise exception 'LABLIVE_ALREADY_SUBMITTED';
    end if;
    if not v_open then
      raise exception 'LABLIVE_SESSION_ENDED';
    end if;

    if regexp_replace(new.latest_code, '\s', '', 'g')
       is distinct from regexp_replace(old.latest_code, '\s', '', 'g') then
      new.last_activity_at := now();
    else
      new.last_activity_at := old.last_activity_at;
    end if;
  else
    new.last_activity_at := old.last_activity_at;
  end if;

  return new;
end;
$$;
-- (the trigger participants_guard_trg already exists and keeps using this function)


-- ---------------------------------------------------------------------
-- 6. PERMISSIONS: remove students, short help message, close two loopholes
-- ---------------------------------------------------------------------

drop policy if exists "participants: teacher removes" on public.participants;
create policy "participants: teacher removes"
  on public.participants for delete to authenticated
  using (public.is_session_teacher(session_id));

grant delete on public.participants to authenticated;
grant update (help_message) on public.participants to authenticated;

-- Students could insert rows into snapshots (a feature we never built).
drop policy if exists "snapshots: student adds own" on public.snapshots;
revoke insert on public.snapshots from authenticated;

-- Users could edit their own name / student id through the database API.
revoke update on public.profiles from authenticated;
revoke update (full_name, student_id) on public.profiles from authenticated;


-- ---------------------------------------------------------------------
-- Shows one row when everything above ran.
-- ---------------------------------------------------------------------
select 'LabLive patch 1 applied' as status;


-- =====================================================================
-- OPTIONAL, run by hand when you want to: delete sessions older than 90 days
-- (this also deletes their students' code and notes)
-- =====================================================================
-- delete from public.lab_sessions where created_at < now() - interval '90 days';
