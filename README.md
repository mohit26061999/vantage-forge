# Vantage Forge website + client portal

This package contains a public multi-page company website, a Supabase-powered editable catalog, and the existing customer/project portal.

## Pages
- `index.html` — homepage with trending courses, featured services and projects
- `projects.html` — services and project showcase
- `courses.html` — trending and published courses
- `about.html` — company overview
- `contact.html` — enquiry form that opens WhatsApp
- `admin.html` — admin-only management for courses, services and projects
- `portal.html` — existing customer/project portal (preserved from the previous package)

## 1. Configure Supabase browser settings
Open `config.js`. The project URL is prefilled for your existing Supabase project. Replace `SUPABASE_ANON_KEY` with your project's public **publishable key** (`sb_publishable_...`) or legacy anon key. Never use a service-role or `sb_secret_...` key in browser code.

## 2. Create the catalog table
In Supabase Dashboard → SQL Editor, run the existing `supabase/schema.sql` only if you have not already run the portal schema. Since your current project already has `profiles`, `requests`, `messages` and `files`, do not rerun the entire original schema unnecessarily.

Then run all of `supabase/catalog.sql`. This creates the catalog table, row-level security policies and starter examples for a course, service and project. The starter records are editable from the admin page.

## 3. Give your account admin permission
First create an account through the existing portal/signup flow, and confirm the email if confirmation is enabled. Then run this SQL in Supabase SQL Editor, replacing the email with the email used for your owner account:

```sql
update public.profiles
set role = 'admin'
where email = 'YOUR_OWNER_EMAIL@example.com';
```

Verify that exactly one row was updated. Do not grant admin role to ordinary customers. Admin roles are assigned only by a trusted project owner through SQL.

## 4. Configure WhatsApp
Open `site-config.js` and set `WHATSAPP_NUMBER` to your WhatsApp number with country code and digits only. Example format: `919876543210` (replace with your real number). Set `CONTACT_EMAIL` if desired. Until the real number is set, WhatsApp links cannot directly reach your business.

## 5. Deploy
Upload all files and folders to the root of your existing GitHub repository, keeping the file/folder structure. Commit/push, then let Netlify redeploy. The public pages read published catalog records from Supabase. An admin can add, edit, publish/unpublish, mark trending/featured, reorder, or delete catalog items at `/admin.html`.

## Admin behavior
- Sign in to `admin.html` with your existing Supabase account.
- Only accounts with `profiles.role = 'admin'` can manage the catalog.
- Public visitors can read published items only. Admin writes are protected by Supabase Row Level Security.
- “Trending” is manually controlled by the admin, not an automatic external trend feed.

## Notes
- This is a static HTML/CSS/JavaScript website. It does not require a separate server.
- The contact form opens WhatsApp with a prefilled message; the visitor still presses Send in WhatsApp. It does not silently send messages.
- Test the catalog after running SQL. If the page says the catalog cannot load, check the Supabase table/policies and browser console.
