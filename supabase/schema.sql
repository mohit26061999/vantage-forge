-- Vantage Forge Portal V1 — Supabase schema and Row Level Security
-- Run this entire file in Supabase Dashboard > SQL Editor.
-- IMPORTANT: Staff roles must be granted only by a trusted project owner using SQL.
create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('customer','staff','admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.request_status as enum ('submitted','reviewing','awaiting_customer','quoted','approved','in_progress','delivered','closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.file_kind as enum ('reference','deliverable');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 160),
  category text not null check (char_length(category) between 2 and 100),
  description text not null check (char_length(description) between 20 and 10000),
  technology text,
  target_date date,
  budget_range text,
  status public.request_status not null default 'submitted',
  assigned_to uuid references public.profiles(id) on delete set null,
  quotation_amount numeric(12,2) check (quotation_amount is null or quotation_amount >= 0),
  quotation_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 5000),
  is_internal boolean not null default false,
  recipient_id uuid references public.profiles(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  bucket text not null default 'project-files' check (bucket = 'project-files'),
  object_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  file_size bigint not null check (file_size between 1 and 10485760),
  content_type text,
  kind public.file_kind not null default 'reference',
  created_at timestamptz not null default now()
);
create index if not exists requests_customer_created_idx on public.requests(customer_id, created_at desc);
create index if not exists requests_assigned_idx on public.requests(assigned_to, status);
create index if not exists messages_request_created_idx on public.messages(request_id, created_at);
create index if not exists messages_recipient_unread_idx on public.messages(recipient_id) where read_at is null;
create index if not exists files_request_idx on public.files(request_id, created_at);

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin')) $$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') $$;
revoke all on function public.is_staff() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Create profile on signup. Role is always customer; user metadata cannot choose role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, email, role)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.email,''), 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists requests_touch_updated_at on public.requests;
create trigger requests_touch_updated_at before update on public.requests for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.requests enable row level security;
alter table public.messages enable row level security;
alter table public.files enable row level security;

drop policy if exists "profiles select self or staff" on public.profiles;
create policy "profiles select self or staff" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
-- No client insert/delete on profiles. Trigger creates them; admins should use SQL for role management.

drop policy if exists "customers create own requests" on public.requests;
create policy "customers create own requests" on public.requests for insert to authenticated with check (customer_id = auth.uid() and status = 'submitted' and assigned_to is null and quotation_amount is null and quotation_notes is null);
drop policy if exists "customer or staff read requests" on public.requests;
create policy "customer or staff read requests" on public.requests for select to authenticated using (customer_id = auth.uid() or public.is_staff());
drop policy if exists "staff update requests" on public.requests;
create policy "staff update requests" on public.requests for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "customer approve quotation" on public.requests;
create policy "customer approve quotation" on public.requests for update to authenticated using (customer_id = auth.uid() and status = 'quoted') with check (customer_id = auth.uid() and status = 'approved');

drop policy if exists "request participants read messages" on public.messages;
create policy "request participants read messages" on public.messages for select to authenticated using (
  (not is_internal and exists(select 1 from public.requests r where r.id = request_id and (r.customer_id = auth.uid() or public.is_staff())))
  or (is_internal and public.is_staff())
);
drop policy if exists "participants send messages" on public.messages;
create policy "participants send messages" on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and (
    (not is_internal and exists(select 1 from public.requests r where r.id = request_id and (r.customer_id = auth.uid() or public.is_staff())))
    or (is_internal and public.is_staff())
  )
);
drop policy if exists "recipient mark messages read" on public.messages;
create policy "recipient mark messages read" on public.messages for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists "request participants read files metadata" on public.files;
create policy "request participants read files metadata" on public.files for select to authenticated using (exists(select 1 from public.requests r where r.id = request_id and (r.customer_id = auth.uid() or public.is_staff())));
drop policy if exists "participants add file metadata" on public.files;
create policy "participants add file metadata" on public.files for insert to authenticated with check (
  uploaded_by = auth.uid() and exists(select 1 from public.requests r where r.id = request_id and (r.customer_id = auth.uid() or public.is_staff()))
);

-- Private storage bucket. The object path must begin with the related request UUID.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-files','project-files',false,10485760,array[
 'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'text/plain','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'image/png','image/jpeg','application/zip','application/x-zip-compressed','application/octet-stream'
])
on conflict (id) do update set public=false,file_size_limit=10485760;

drop policy if exists "read authorized project objects" on storage.objects;
create policy "read authorized project objects" on storage.objects for select to authenticated using (
  bucket_id = 'project-files' and exists(
    select 1 from public.requests r
    where r.id::text = (storage.foldername(name))[1]
      and (r.customer_id = auth.uid() or public.is_staff())
  )
);
drop policy if exists "upload authorized project objects" on storage.objects;
create policy "upload authorized project objects" on storage.objects for insert to authenticated with check (
  bucket_id = 'project-files' and exists(
    select 1 from public.requests r
    where r.id::text = (storage.foldername(name))[1]
      and (r.customer_id = auth.uid() or public.is_staff())
  )
);
-- No public bucket, no anonymous access, and no direct object deletion/update policies.
