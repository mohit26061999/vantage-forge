// Optional email notifications via Resend. Deploy with Supabase CLI after setting secrets.
// Secrets required: RESEND_API_KEY, NOTIFY_FROM (verified sender), SITE_URL.
// The frontend invokes this function only after an authenticated action. This function validates
// the caller token and reads the service key only from server-side environment variables.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

  const { data: callerProfile } = await createClient(url, service).from("profiles").select("role").eq("id", userData.user.id).single();
  if (!callerProfile) return json({ error: "Profile not found" }, 403);
  const body = await req.json().catch(() => ({}));
  const event = String(body.event ?? "");
  const requestId = String(body.request_id ?? "");
  if (!["new_request", "new_message", "quotation", "deliverable"].includes(event) || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return json({ error: "Invalid event" }, 400);
  }

  const admin = createClient(url, service);
  const { data: project, error: projectError } = await admin.from("requests")
    .select("id,title,customer_id,status,quotation_amount,quotation_notes")
    .eq("id", requestId).single();
  if (projectError || !project) return json({ error: "Request not found" }, 404);

  // Customer events may only notify on their own request; staff may notify on any request.
  if (callerProfile.role === "customer" && project.customer_id !== userData.user.id) return json({ error: "Forbidden" }, 403);
  const { data: customer } = await admin.from("profiles").select("email,full_name").eq("id", project.customer_id).single();
  const { data: staff } = await admin.from("profiles").select("email").in("role", ["admin", "staff"]);
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM");
  const site = Deno.env.get("SITE_URL");
  if (!apiKey || !from || !site) return json({ ok: true, email: "not_configured" });

  const recipients = new Set<string>();
  if (event === "new_request") (staff ?? []).forEach((s: {email:string}) => s.email && recipients.add(s.email));
  else if (event === "new_message") {
    if (callerProfile.role === "customer") (staff ?? []).forEach((s: {email:string}) => s.email && recipients.add(s.email));
    else if (customer?.email) recipients.add(customer.email);
  } else if (["quotation", "deliverable"].includes(event) && customer?.email) recipients.add(customer.email);

  const labels: Record<string,string> = {
    new_request: "New project requirement",
    new_message: "New project message",
    quotation: "Quotation ready for review",
    deliverable: "Project deliverable available",
  };
  const subject = `${labels[event]} — ${project.title}`;
  const safeTitle = project.title.replace(/[<>&"]/g, "");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#10213a"><h2>${labels[event]}</h2><p>Project: <b>${safeTitle}</b></p><p>Reference: VF-${project.id.slice(0,8).toUpperCase()}</p><p>Sign in to your Vantage Forge portal to view details and respond.</p><p><a href="${site}" style="background:#e5ff72;padding:12px 18px;color:#10213a;text-decoration:none;border-radius:8px">Open portal</a></p></div>`;
  const results = await Promise.all([...recipients].map(async (to) => {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    return { ok: resp.ok, status: resp.status };
  }));
  return json({ ok: true, attempted: results.length, delivered: results.filter(r => r.ok).length });
});
