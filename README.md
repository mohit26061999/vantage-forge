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


## Unified workspace update

The client portal now provides a unified workspace entry point. Customers use the existing customer dashboard for requirements, status, messages and files. Staff use the team request queue. Admin-role accounts also get a **Website content** tab embedded in the same portal page, allowing catalog management without manually navigating to a separate admin page. The embedded catalog reuses the Supabase browser session; `admin.js` still independently checks that the authenticated profile role is `admin`.

### Before deploying

1. In `config.js`, set `SUPABASE_URL` to the base project URL only (for this project: `https://esularfkuecmftbbhpuv.supabase.co`) and replace the placeholder with the project's publishable/anon key. Never put a service-role or secret key in browser code.
2. Run `supabase/schema.sql` and `supabase/catalog.sql` in the Supabase SQL Editor if not already applied. Review the policies before production use.
3. Ensure your own account's `profiles.role` is `admin` using the trusted Supabase SQL Editor. Never allow users to assign their own roles through the website.
4. In Supabase Authentication URL Configuration, add your deployed Netlify URL to Site URL and Redirect URLs.
5. Deploy the repository root on Netlify. For a local update, commit and push normally; do not use `git push --force`.

### Notes

- This ZIP does not contain a Supabase service-role key or user passwords.
- The admin content tab is shown only to profiles whose database role is `admin`; staff still see the request-management tools according to the existing app's role checks. Database Row Level Security remains the actual security boundary.
- WhatsApp is configured to `+91 89358 32240` based on the number provided earlier. Confirm this is the business WhatsApp number before publishing.


## Seamless public website + customer workspace

The customer portal shares the Vantage Forge brand and now includes the same primary navigation as the public site. Customers can move between Home, Projects & Services, Courses, About and Contact without losing the shared site context. Their authenticated workspace remains on `portal.html`, where the existing dashboard, requirements, request details, messages and private files are managed. Signing out ends the authenticated session; public pages remain available.

Admin tools remain restricted to accounts whose Supabase profile has the `admin` role. Customer permissions must continue to be enforced by Supabase Row Level Security (RLS), not by front-end visibility alone.


## Dashboard navigation fix

Every public page now includes a visible **Dashboard / Client Portal** link that opens `portal.html`. If the visitor is already signed in, the existing Supabase session should load their dashboard; otherwise the page displays sign-in/create-account. The portal navigation also includes a Dashboard link so customers can return to their workspace from public pages.


## Final navigation and sign-out behavior

- Public pages share the same top navigation and a Dashboard / Client Portal link.
- When Supabase reports an active session on a public page, the link label changes to Dashboard and a Sign out button becomes visible.
- Sign out calls Supabase Auth, clears the session, and returns the visitor to the public home page.
- The portal retains its own Sign out control. After signing out there, the portal returns to the login view.
- Admins use the role-protected team workspace. The Website Content tab opens the existing catalog manager within that workspace; customer requests and content management are grouped in the same admin area.
- Do not place a Supabase service-role or secret key in browser files. Configure only the public anon/publishable key in `config.js`, and keep access controlled by database RLS policies.


## Fix for the embedded Website Content tab

The admin workspace embeds `admin.html` inside the team workspace so customer requests and catalog management can be accessed in one place. The prior Netlify header `X-Frame-Options = "DENY"` blocked this same-site iframe, causing the large blank/grey panel and preventing access to the add/edit/delete controls. This package changes the header to `SAMEORIGIN`, which allows the site to embed its own admin page while continuing to block embedding by other sites.

After deploying, confirm `supabase/catalog.sql` has been run in the same Supabase project and that the signed-in profile has role `admin`. Catalog writes are enforced by Supabase RLS. If catalog operations still fail, read the error shown by the admin editor and check the catalog table policies.


## Visual consistency and real image uploads

The customer dashboard header now uses the same centered max-width container and public navigation structure as Home/Courses/Projects pages, with a responsive menu on smaller screens.

The admin catalog editor now accepts an image file (JPG, PNG, WEBP, GIF; max 5 MB) instead of requiring an image URL. Images upload to the Supabase Storage `catalog-images` bucket; the resulting public URL is saved in `catalog_items.image_url`, and public catalog cards display the uploaded image.

**One-time storage setup:** Run the updated `supabase/catalog.sql` in Supabase SQL Editor. It creates/configures the public-read `catalog-images` bucket and policies allowing only admins to upload, update, and delete images. This uses the existing `public.is_admin()` function. Do not use a service-role key in the browser.


## Account creation troubleshooting

The sign-in and account-creation handlers now always restore the submit button with `finally`, show a clear status message, and stop showing “Please wait…” after 20 seconds if Supabase does not respond. A timeout does not prove the account was not created; check Supabase Authentication → Users before retrying to avoid duplicate attempts.

If signup times out, check Supabase Authentication → Logs and Authentication → SMTP Settings. If email confirmation is enabled, use a verified SMTP sender/domain and confirm the redirect URL includes the deployed `/portal.html` path. Do not disable email confirmation just to mask SMTP errors, and never put a service-role key in frontend files.
