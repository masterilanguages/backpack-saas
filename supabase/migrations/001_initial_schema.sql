-- ============================================================
-- BACKPACK SAAS — Initial Multi-Tenant Schema
-- ============================================================
-- Every table has school_id as the tenant key.
-- Row Level Security (RLS) ensures each school only sees its data.
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- SCHOOLS (Tenants)
-- ============================================================
create table public.schools (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,          -- e.g. "masteri"
  name          text not null,                 -- e.g. "Masteri Languages"
  tagline       text,
  industry      text,
  currency      text not null default 'USD',
  accent_color  text not null default '#0d9488',
  logo_url      text,
  plan          text not null default 'starter', -- starter | pro | enterprise
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- SCHOOL USERS (admins / coaches per school)
-- ============================================================
create table public.school_users (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'admin',   -- admin | coach | viewer
  created_at  timestamptz not null default now(),
  unique(school_id, user_id)
);

-- ============================================================
-- STUDENTS (clients)
-- ============================================================
create table public.students (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  language    text,                            -- e.g. Hebrew, Spanish
  level       text,                            -- A1, B2, etc.
  since       date,
  total_value numeric(10,2) default 0,
  status      text not null default 'Active',  -- Active | Paused | Churned | Trial
  meta        jsonb default '{}',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- LEADS
-- ============================================================
create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  email       text,
  contact     text,
  source      text,
  value       numeric(10,2) default 0,
  status      text not null default 'New',     -- New | Contacted | Qualified | Proposal Sent | Won | Lost
  owner       text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- VOCABULARY
-- ============================================================
create table public.vocabulary (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  word        text not null,
  translation text not null,
  language    text not null,
  deck        text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- VOCABULARY PROGRESS (per student)
-- ============================================================
create table public.vocabulary_progress (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  mastery       int not null default 0 check (mastery between 0 and 100),
  last_reviewed timestamptz,
  next_review   timestamptz,
  unique(student_id, vocabulary_id)
);

-- ============================================================
-- LESSONS (sessions / projects)
-- ============================================================
create table public.lessons (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  student_id  uuid references public.students(id) on delete set null,
  coach       text,
  language    text,
  date        date,
  time        text,
  topic       text,
  status      text not null default 'Scheduled', -- Scheduled | Completed | Cancelled | No-Show
  notes       text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- TASKS
-- ============================================================
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  title       text not null,
  assignee    text,
  related     text,
  due_date    date,
  priority    text not null default 'Medium',  -- Low | Medium | High
  status      text not null default 'To Do',   -- To Do | In Progress | Done | Blocked
  created_at  timestamptz not null default now()
);

-- ============================================================
-- FINANCES
-- ============================================================
create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  date        date not null default current_date,
  description text not null,
  category    text,
  type        text not null,                   -- Income | Expense
  amount      numeric(10,2) not null,
  status      text not null default 'Paid',    -- Paid | Pending | Overdue
  created_at  timestamptz not null default now()
);

-- ============================================================
-- TEAM
-- ============================================================
create table public.team_members (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  role        text,
  email       text,
  phone       text,
  speciality  text,
  status      text not null default 'Active',  -- Active | Freelance | Inactive
  created_at  timestamptz not null default now()
);

-- ============================================================
-- NOTES
-- ============================================================
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  title       text not null,
  body        text,
  author      text,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- FILES
-- ============================================================
create table public.files (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  type        text,                            -- PDF | Image | Doc | Video | Audio
  size        text,
  storage_path text,                           -- Supabase Storage path
  owner       text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- CALENDAR EVENTS
-- ============================================================
create table public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  title       text not null,
  date        date not null,
  time        text,
  type        text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Helper function: returns the school_id for the current user
create or replace function public.my_school_id()
returns uuid language sql stable security definer as $$
  select school_id from public.school_users
  where user_id = auth.uid()
  limit 1;
$$;

-- Enable RLS on all tables
alter table public.schools           enable row level security;
alter table public.school_users      enable row level security;
alter table public.students          enable row level security;
alter table public.leads             enable row level security;
alter table public.vocabulary        enable row level security;
alter table public.vocabulary_progress enable row level security;
alter table public.lessons           enable row level security;
alter table public.tasks             enable row level security;
alter table public.transactions      enable row level security;
alter table public.team_members      enable row level security;
alter table public.notes             enable row level security;
alter table public.files             enable row level security;
alter table public.calendar_events   enable row level security;

-- Schools: user can only see their own school
create policy "school: own" on public.schools
  for all using (id = public.my_school_id());

-- school_users: user can see members of their school
create policy "school_users: own school" on public.school_users
  for all using (school_id = public.my_school_id());

-- Generic policy macro for all other tables (all have school_id)
create policy "students: own school"          on public.students           for all using (school_id = public.my_school_id());
create policy "leads: own school"             on public.leads              for all using (school_id = public.my_school_id());
create policy "vocabulary: own school"        on public.vocabulary         for all using (school_id = public.my_school_id());
create policy "vocab_progress: own school"    on public.vocabulary_progress for all using (school_id = public.my_school_id());
create policy "lessons: own school"           on public.lessons            for all using (school_id = public.my_school_id());
create policy "tasks: own school"             on public.tasks              for all using (school_id = public.my_school_id());
create policy "transactions: own school"      on public.transactions       for all using (school_id = public.my_school_id());
create policy "team: own school"              on public.team_members       for all using (school_id = public.my_school_id());
create policy "notes: own school"             on public.notes              for all using (school_id = public.my_school_id());
create policy "files: own school"             on public.files              for all using (school_id = public.my_school_id());
create policy "calendar: own school"          on public.calendar_events    for all using (school_id = public.my_school_id());

-- ============================================================
-- SEED: Masteri Languages as first tenant
-- ============================================================
insert into public.schools (slug, name, tagline, industry, currency, accent_color, plan)
values ('masteri', 'Masteri Languages', '1-on-1 language coaching', 'Education', 'USD', '#0d9488', 'pro');
