-- Vantage Forge public website catalog (courses, services, projects)
-- Run this in Supabase SQL Editor after the existing schema.sql.
create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('course','service','project')),
  title text not null check (char_length(title) between 3 and 140),
  short_description text not null check (char_length(short_description) between 10 and 500),
  details text not null default '',
  category text not null default '',
  image_url text not null default '',
  tags text[] not null default '{}',
  is_trending boolean not null default false,
  is_featured boolean not null default false,
  is_published boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists catalog_items_public_idx on public.catalog_items(item_type, is_published, sort_order);
alter table public.catalog_items enable row level security;
drop policy if exists "Public can read published catalog items" on public.catalog_items;
create policy "Public can read published catalog items" on public.catalog_items for select to anon, authenticated using (is_published = true or (auth.role() = 'authenticated' and public.is_admin()));
grant execute on function public.is_admin() to anon;
drop policy if exists "Admins manage catalog items" on public.catalog_items;
create policy "Admins manage catalog items" on public.catalog_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create or replace function public.touch_catalog_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists catalog_items_touch_updated_at on public.catalog_items;
create trigger catalog_items_touch_updated_at before update on public.catalog_items for each row execute procedure public.touch_catalog_updated_at();

-- Optional starter content. You can edit/remove it from /admin.html after granting admin access.
insert into public.catalog_items(item_type,title,short_description,details,category,tags,is_trending,is_featured,is_published,sort_order)
select 'course','Free AI/ML Training Program','A practical introduction to Python, machine learning, deep learning and AI projects.','Learn through guided lessons, hands-on exercises and portfolio-oriented projects. Course schedule and seat availability will be announced by Vantage Forge.','Artificial Intelligence',array['Python','Machine Learning','Projects'],true,true,true,1
where not exists (select 1 from public.catalog_items where item_type='course' and title='Free AI/ML Training Program');
insert into public.catalog_items(item_type,title,short_description,details,category,tags,is_trending,is_featured,is_published,sort_order)
select 'service','AI & Machine Learning Solutions','Custom AI prototypes, prediction systems and intelligent automation for real-world needs.','We help scope, prototype and build AI/ML solutions based on your requirements. Contact us to discuss feasibility, timeline and deliverables.','AI / ML',array['AI','Machine Learning','Automation'],false,true,true,1
where not exists (select 1 from public.catalog_items where item_type='service' and title='AI & Machine Learning Solutions');
insert into public.catalog_items(item_type,title,short_description,details,category,tags,is_trending,is_featured,is_published,sort_order)
select 'project','RAG-Based Document Assistant','A document question-answering application that retrieves relevant content and generates grounded responses.','Example project showcase: document ingestion, embeddings, vector search and LLM response generation. Final scope depends on the client or learner brief.','Generative AI',array['RAG','LLMs','Vector Search'],true,true,true,1
where not exists (select 1 from public.catalog_items where item_type='project' and title='RAG-Based Document Assistant');
