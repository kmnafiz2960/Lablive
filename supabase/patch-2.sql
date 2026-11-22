-- =====================================================================
-- LabLive PATCH 2: teachers can reset a student's forgotten password
--
-- HOW TO RUN (once): Supabase -> SQL Editor -> New query -> paste ALL of this -> Run
-- Run patch-1.sql first. Safe while your website is live.
--
-- What it adds
--   * search_students()         teachers search students by name or student ID
--   * reset_student_password()  sets a new password for ONE student, signs them out
--                               everywhere, and writes a log line
--   * password_resets           the log: which teacher reset which student, and when
--
-- Safety rules built into the database
--   * only teachers can use these functions
--   * only accounts with the role "student" can be reset (never a teacher)
--   * at most 20 resets per teacher per hour
--   * the password is stored scrambled, like every other password
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. THE LOG
-- ---------------------------------------------------------------------

create table if not exists public.password_resets (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  student_id    uuid references public.profiles(id) on delete set null,
  student_name  text not null,
  student_code  text,
  created_at    timestamptz not null default now()
);
create index if not exists password_resets_teacher_idx
  on public.password_resets (teacher_id, created_at desc);

alter table public.password_resets enable row level security;

drop policy if exists "resets: teacher reads own" on public.password_resets;
create policy "resets: teacher reads own"
  on public.password_resets for select to authenticated
  using (teacher_id = auth.uid());

revoke all on public.password_resets from anon, authenticated;
grant select on public.password_resets to authenticated;
-- Rows are only written by reset_student_password() below.


-- ---------------------------------------------------------------------
-- 2. SEARCH STUDENTS (name or student ID, teachers only)
-- ---------------------------------------------------------------------

create or replace function public.search_students(p_query text)
returns table (id uuid, full_name text, student_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q text := trim(coalesce(p_query, ''));
begin
  if auth.uid() is null then
    raise exception 'LABLIVE_NOT_LOGGED_IN';
  end if;
  if not public.is_teacher() then
    raise exception 'LABLIVE_TEACHERS_ONLY';
  end if;

  if char_length(v_q) < 2 then
    return;
  end if;

  -- searching for "%" or "_" should find those characters, not act as wildcards
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  return query
    select p.id, p.full_name, p.student_id
    from public.profiles p
    where p.role = 'student'
      and (p.full_name ilike '%' || v_q || '%' or p.student_id ilike '%' || v_q || '%')
    order by p.full_name
    limit 20;
end;
$$;

revoke execute on function public.search_students(text) from public, anon;
grant execute on function public.search_students(text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. RESET ONE STUDENT'S PASSWORD
-- ---------------------------------------------------------------------

create or replace function public.reset_student_password(p_student_id uuid, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'LABLIVE_NOT_LOGGED_IN';
  end if;
  if not public.is_teacher() then
    raise exception 'LABLIVE_TEACHERS_ONLY';
  end if;

  if not public.check_rate_limit('reset_password', 20, 3600) then
    raise exception 'LABLIVE_TOO_MANY';
  end if;

  if p_new_password is null
     or char_length(p_new_password) < 8
     or char_length(p_new_password) > 72 then
    raise exception 'LABLIVE_BAD_PASSWORD';
  end if;

  select * into v_student from public.profiles where id = p_student_id;
  if not found or v_student.role <> 'student' then
    raise exception 'LABLIVE_STUDENT_NOT_FOUND';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_student_id;
  if not found then
    raise exception 'LABLIVE_STUDENT_NOT_FOUND';
  end if;

  -- Sign the student out everywhere. A problem here must not undo the reset.
  begin
    delete from auth.sessions where user_id = p_student_id;
  exception when others then
    null;
  end;

  insert into public.password_resets (teacher_id, student_id, student_name, student_code)
  values (auth.uid(), v_student.id, v_student.full_name, v_student.student_id);

  return jsonb_build_object(
    'id', v_student.id,
    'full_name', v_student.full_name,
    'student_id', v_student.student_id
  );
end;
$$;

revoke execute on function public.reset_student_password(uuid, text) from public, anon;
grant execute on function public.reset_student_password(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
select 'LabLive patch 2 applied' as status;
