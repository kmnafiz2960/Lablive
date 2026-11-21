-- =====================================================================
-- LabLive database schema
--
-- HOW TO RUN (one time, on a fresh Supabase project):
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file -> Run
--
-- It creates the tables, the security rules (Row Level Security), and the
-- small database functions the backend uses.
-- Run it BEFORE anyone signs up, so every new account gets a profile.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 1 and 100),
  student_id  text check (student_id is null or char_length(student_id) <= 30),
  role        text not null default 'student' check (role in ('student', 'teacher')),
  created_at  timestamptz not null default now()
);

create table public.lab_sessions (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  join_code   text not null unique check (char_length(join_code) between 4 and 12),
  title       text not null check (char_length(title) between 1 and 120),
  task        text check (task is null or char_length(task) <= 2000),
  language    text not null default 'python'
              check (language in ('python', 'javascript', 'java', 'c', 'cpp', 'other')),
  status      text not null default 'open' check (status in ('open', 'ended')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index lab_sessions_teacher_idx on public.lab_sessions (teacher_id, created_at desc);

create table public.participants (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.lab_sessions(id) on delete cascade,
  student_id        uuid not null references public.profiles(id) on delete cascade,
  latest_code       text not null default '' check (char_length(latest_code) <= 50000),
  last_activity_at  timestamptz not null default now(),
  hand_raised_at    timestamptz,
  submitted_at      timestamptz,
  joined_at         timestamptz not null default now(),
  unique (session_id, student_id)
);
create index participants_session_idx on public.participants (session_id);

create table public.teacher_notes (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references public.participants(id) on delete cascade,
  line_number     int check (line_number is null or line_number between 1 and 100000),
  body            text not null check (char_length(body) between 1 and 500),
  created_at      timestamptz not null default now()
);
create index teacher_notes_participant_idx on public.teacher_notes (participant_id, created_at);

-- Phase 2 (replay slider). Created now so you do not need a second migration later.
create table public.snapshots (
  id              bigint generated always as identity primary key,
  participant_id  uuid not null references public.participants(id) on delete cascade,
  content         text not null check (char_length(content) <= 50000),
  saved_at        timestamptz not null default now()
);
create index snapshots_participant_idx on public.snapshots (participant_id, saved_at);


-- ---------------------------------------------------------------------
-- 2. AUTOMATIC PROFILE WHEN SOMEONE SIGNS UP
--    Everyone starts as a 'student'. A teacher is made by hand (see the
--    bottom of this file), so nobody can make themselves a teacher.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, student_id, role)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'Student'), 100),
    left(nullif(trim(new.raw_user_meta_data->>'student_id'), ''), 30),
    'student'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 3. HELPER FUNCTIONS (used by the security rules below)
--    "security definer" lets them look at other tables without the
--    security rules calling each other in a loop.
-- ---------------------------------------------------------------------

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'teacher'
  );
$$;

create or replace function public.is_session_teacher(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lab_sessions s
    where s.id = sid and s.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_session_member(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.participants p
    where p.session_id = sid and p.student_id = auth.uid()
  );
$$;

create or replace function public.is_participant_owner(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.participants p
    where p.id = pid and p.student_id = auth.uid()
  );
$$;

create or replace function public.is_participant_teacher(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participants p
    join public.lab_sessions s on s.id = p.session_id
    where p.id = pid and s.teacher_id = auth.uid()
  );
$$;

create or replace function public.teacher_sees_student(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participants p
    join public.lab_sessions s on s.id = p.session_id
    where p.student_id = uid and s.teacher_id = auth.uid()
  );
$$;


-- ---------------------------------------------------------------------
-- 4. JOINING A SESSION WITH A CODE
--    A student cannot read a session before joining it, so joining is done
--    by this function. It checks the code and creates the participant row.
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

  if v_session.status <> 'open' then
    raise exception 'LABLIVE_SESSION_ENDED';
  end if;

  -- Joining twice returns the same row (the no-op update is only there so
  -- that "returning" gives us the id).
  insert into public.participants (session_id, student_id)
  values (v_session.id, auth.uid())
  on conflict (session_id, student_id) do update set student_id = excluded.student_id
  returning id into v_pid;

  return jsonb_build_object('participant_id', v_pid, 'session_id', v_session.id);
end;
$$;


-- ---------------------------------------------------------------------
-- 5. LOCK CODE EDITS AFTER SUBMIT OR AFTER THE SESSION ENDS
--    The API already checks this. This trigger makes it true even if
--    someone talks to the database directly.
-- ---------------------------------------------------------------------

create or replace function public.participants_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.latest_code is distinct from old.latest_code then
    if old.submitted_at is not null then
      raise exception 'LABLIVE_ALREADY_SUBMITTED';
    end if;
    if exists (
      select 1 from public.lab_sessions s
      where s.id = new.session_id and s.status = 'ended'
    ) then
      raise exception 'LABLIVE_SESSION_ENDED';
    end if;
  end if;

  if old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at then
    raise exception 'LABLIVE_ALREADY_SUBMITTED';
  end if;

  return new;
end;
$$;

create trigger participants_guard_trg
  before update on public.participants
  for each row execute function public.participants_guard();


-- ---------------------------------------------------------------------
-- 6. SECURITY RULES (Row Level Security)
--    Rule of thumb: a student sees only their own row. A teacher sees only
--    their own sessions and the students inside them.
-- ---------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.lab_sessions   enable row level security;
alter table public.participants   enable row level security;
alter table public.teacher_notes  enable row level security;
alter table public.snapshots      enable row level security;

-- profiles
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles: teacher reads students of own sessions"
  on public.profiles for select to authenticated
  using (public.teacher_sees_student(id));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- lab_sessions
create policy "sessions: teacher creates own"
  on public.lab_sessions for insert to authenticated
  with check (teacher_id = auth.uid() and public.is_teacher());

create policy "sessions: owner or joined student reads"
  on public.lab_sessions for select to authenticated
  using (teacher_id = auth.uid() or public.is_session_member(id));

create policy "sessions: owner updates"
  on public.lab_sessions for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "sessions: owner deletes"
  on public.lab_sessions for delete to authenticated
  using (teacher_id = auth.uid());

-- participants (rows are created only by join_session)
create policy "participants: student reads own"
  on public.participants for select to authenticated
  using (student_id = auth.uid());

create policy "participants: teacher reads own sessions"
  on public.participants for select to authenticated
  using (public.is_session_teacher(session_id));

create policy "participants: student updates own"
  on public.participants for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- teacher_notes
create policy "notes: student or teacher reads"
  on public.teacher_notes for select to authenticated
  using (public.is_participant_owner(participant_id) or public.is_participant_teacher(participant_id));

create policy "notes: teacher adds"
  on public.teacher_notes for insert to authenticated
  with check (public.is_participant_teacher(participant_id));

-- snapshots (Phase 2)
create policy "snapshots: teacher reads"
  on public.snapshots for select to authenticated
  using (public.is_participant_teacher(participant_id));

create policy "snapshots: student adds own"
  on public.snapshots for insert to authenticated
  with check (public.is_participant_owner(participant_id));


-- ---------------------------------------------------------------------
-- 7. PERMISSIONS (what each kind of logged-in user may do at all)
--    Not logged in = no access. Logged in = only what is listed here,
--    and then still limited by the security rules above.
-- ---------------------------------------------------------------------

revoke all on public.profiles, public.lab_sessions, public.participants,
              public.teacher_notes, public.snapshots
  from anon, authenticated;

grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, student_id) on public.profiles to authenticated;   -- role cannot be changed by users

grant select, insert, update, delete on public.lab_sessions to authenticated;

grant select on public.participants to authenticated;
grant update (latest_code, last_activity_at, hand_raised_at, submitted_at)
  on public.participants to authenticated;

grant select, insert on public.teacher_notes to authenticated;
grant select, insert on public.snapshots to authenticated;

revoke execute on function public.join_session(text) from public, anon;
grant execute on function public.join_session(text) to authenticated;

grant execute on function
  public.is_teacher(),
  public.is_session_teacher(uuid),
  public.is_session_member(uuid),
  public.is_participant_owner(uuid),
  public.is_participant_teacher(uuid),
  public.teacher_sees_student(uuid)
  to authenticated;


-- =====================================================================
-- MAKE YOURSELF A TEACHER (run this separately, after you have signed up)
--   1. Replace the email below with the email you signed up with.
--   2. Select ONLY these lines, then press Run.
-- =====================================================================
-- update public.profiles
-- set role = 'teacher'
-- where id = (select id from auth.users where email = 'your-email@example.com');


-- =====================================================================
-- START OVER (only if you want to wipe LabLive and run everything again)
-- =====================================================================
-- drop table if exists public.snapshots, public.teacher_notes,
--   public.participants, public.lab_sessions, public.profiles cascade;
-- drop function if exists public.join_session(text), public.participants_guard(),
--   public.handle_new_user(), public.is_teacher(), public.is_session_teacher(uuid),
--   public.is_session_member(uuid), public.is_participant_owner(uuid),
--   public.is_participant_teacher(uuid), public.teacher_sees_student(uuid) cascade;
-- drop trigger if exists on_auth_user_created on auth.users;
