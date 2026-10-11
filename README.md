# Vantage Forge Portal V1

A deployable customer + team project portal using:
- **Netlify**: static frontend hosting
- **Supabase Auth**: customer and team login
- **Supabase Postgres + RLS**: database and authorization
- **Supabase private Storage**: project references and deliverables
- **Supabase Edge Function + Resend (optional)**: email notifications
- **GitHub**: source control

The supplied Vantage Forge logo is included in `assets/`.

## What V1 includes

- Customer signup, sign-in, password reset
- Personal dashboard with request list and statuses
- Requirement submission with optional file attachment (10 MB limit)
- Staff/admin dashboard for reviewing all requests
- Status changes, staff assignment, quotation notes and amount
- Customer quotation approval
- Customer/team messaging and staff-only internal notes
- Private file uploads and time-limited signed download URLs
- Optional email notifications for new requests, messages, quotations and deliverables

## Free-tier notes

You can develop and deploy on free tiers. Providers' limits and policies may change. Free hosting and database plans are not a guarantee of unlimited or permanent uptime. Email delivery requires a Resend account and a verified sender/domain for reliable production use; if email isn't configured, portal functionality still works and the notify function reports `not_configured`.

## Deployment overview

### 1. Create Supabase project
1. Go to https://supabase.com/ and create a project.
2. Open **SQL Editor** and run the full contents of `supabase/schema.sql`.
3. In **Project Settings → API**, copy the Project URL and the public anon/publishable key.
4. Edit `config.js`:
   - `SUPABASE_URL`: your project URL
   - `SUPABASE_ANON_KEY`: your public anon/publishable key
   These are browser-visible values. **Never use the service_role key in `config.js`.**

### 2. Create your first admin safely
1. Sign up using the deployed portal or Supabase Auth dashboard.
2. Confirm the account if email confirmation is enabled.
3. In Supabase SQL Editor, run this query with your exact account email:

```sql
update public.profiles
set role = 'admin'
where email = 'YOUR-ADMIN-EMAIL@example.com';
```

Verify exactly one row was updated. Do not expose admin role assignment in the public UI. For each staff member, have them create their own account first, then run:

```sql
update public.profiles
set role = 'staff'
where email = 'TEAM-MEMBER@example.com';
```

Use individual accounts. Never share a single admin login. Revoke access promptly when a team member leaves.

### 3. Deploy frontend to Netlify
1. Extract this ZIP.
2. Create a GitHub repository, e.g. `vantage-forge-portal`.
3. Upload the **contents** of this folder into the repository root. Confirm `index.html`, `config.js`, `app.js`, and `style.css` are at the root, not one folder deeper.
4. In Netlify, select **Add new project → Import an existing project → GitHub** and choose the repository.
5. Build command: leave blank. Publish directory: `.`.
6. Deploy. In Supabase Auth settings, add the Netlify site URL to **Site URL** and **Redirect URLs**. If using a custom domain later, add it there too.
7. Replace `YOUR-...` placeholders in `config.js`, commit, and redeploy.

### 4. Enable email notifications (optional but recommended)
Email is not sent by the static website itself. Deploy the Edge Function from a trusted local terminal with the Supabase CLI:
1. Install the Supabase CLI and log in: https://supabase.com/docs/guides/cli
2. Link the project, then set secrets:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set RESEND_API_KEY=re_xxxxxxxxx NOTIFY_FROM="Vantage Forge <notifications@your-verified-domain.com>" SITE_URL="https://YOUR-SITE.netlify.app"
supabase functions deploy notify
```

3. Configure a verified sender in Resend: https://resend.com/
4. For the function's CORS allow-list, `SITE_URL` must be your deployed website origin. If you use a custom domain, update it and redeploy/reconfigure.
5. Verify email deliverability with a test customer and staff account. Do not use an unverified sender or pretend emails are configured until a real test succeeds.

The Edge Function checks the caller's JWT and reads the service role key only from server-side Supabase environment secrets. Never paste secrets into frontend files, GitHub, or a chat.

### 5. Important launch checks
- Test customer signup, email confirmation, sign-in, password reset.
- Test two customers and confirm they cannot see each other's requests, messages, or files.
- Test staff and admin accounts with separate logins.
- Test quotation flow, internal notes, upload, and signed download links.
- Verify customer cannot change another user's request, assign staff, set admin roles, or read internal notes.
- Check Supabase Auth rate limits, SMTP/email confirmation settings, backup options, and current free-plan limits.
- Add a privacy policy, terms, company contact details, and retention policy before collecting real customer data.
- Do not collect payment card details directly; use a reputable payment provider if adding payments later.

## Current limitations / V1 scope
- This is a starter deployable V1, not a fully audited commercial platform.
- No built-in payment gateway, invoice generator, realtime chat, audit log, or file virus scanning yet.
- Notification emails are optional and require Edge Function deployment and Resend configuration.
- File validation in the browser is for user experience; production systems should add server-side file scanning and stricter MIME/content checks.
- Staff/customer role and row-level access are enforced by the provided Supabase RLS policies; review the policies with a security professional before storing sensitive or high-value client materials.
