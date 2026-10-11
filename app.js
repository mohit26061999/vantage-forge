/* Vantage Forge Portal frontend.
 * The browser uses only the Supabase anon key. Authorization is enforced by Postgres RLS.
 */
(() => {
  
  const $ = (s, root = document) =>
  (root || document).querySelector(s);

  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const cfg = window.VF_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT") &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
  let supabase = null, currentUser = null, currentProfile = null, currentRequest = null, toastTimer = null;
  const statusLabels = {submitted:"Submitted",reviewing:"Reviewing",awaiting_customer:"Awaiting customer",quoted:"Quotation sent",approved:"Approved",in_progress:"In progress",delivered:"Delivered",closed:"Closed"};
  const statusOptions = Object.entries(statusLabels).map(([v,l]) => `<option value="${v}">${l}</option>`).join("");
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmtDate = v => v ? new Date(v).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}) : "Not set";
  const showToast = (msg, bad=false) => { const el=$("#toast"); el.textContent=msg; el.style.background=bad?"#9f2828":"#10233b"; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),3500); };
  const setMessage = (selector,msg,bad=false) => { const el=$(selector); el.textContent=msg; el.classList.toggle("error",bad); };
  
const setBusy = (form, busy) => {
  if (!form) {
    console.error("setBusy received a missing form element");
    return;
  }

  const b = form.querySelector('button[type="submit"]');

  if (b) {
    b.disabled = busy;
    b.dataset.original ||= b.textContent;
    b.textContent = busy ? "Please wait…" : b.dataset.original;
  }
};

  const invokeNotify = async (payload) => {
    try { if(supabase) await supabase.functions.invoke("notify",{body:payload}); } catch(e) { console.warn("Optional notification failed",e); }
  };
  function setAuthTab(tab) {
    $$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.authTab===tab));
    $("#loginForm").classList.toggle("hidden",tab!=="login"); $("#signupForm").classList.toggle("hidden",tab!=="signup"); setMessage("#authMessage","");
  }
  function showSignedOut() { $("#authView").classList.remove("hidden"); $("#appView").classList.add("hidden"); $("#logoutBtn").classList.add("hidden"); }
  function showSignedIn() { $("#authView").classList.add("hidden"); $("#appView").classList.remove("hidden"); $("#logoutBtn").classList.remove("hidden"); }
  async function loadProfile() {
    const {data,error}=await supabase.from("profiles").select("id,full_name,email,role").eq("id",currentUser.id).single();
    if(error) throw error; currentProfile=data;
  }
  async function refreshDashboard() {
    if(!currentUser || !currentProfile) return;
    showSignedIn();
    const isStaff=["admin","staff"].includes(currentProfile.role);
    $("#roleLabel").textContent=isStaff?"TEAM WORKSPACE":"CUSTOMER WORKSPACE";
    $("#welcomeTitle").textContent=`${isStaff?"Welcome":"Welcome"}, ${(currentProfile.full_name||currentUser.email||"there").split(" ")[0]}`;
    $("#welcomeSub").textContent=isStaff?"Review requirements, coordinate responses, and manage delivery.":"Manage your requirements, conversations, and project files.";
    $("#adminTools").classList.toggle("hidden",!isStaff);
    $("#newRequestBtn").classList.toggle("hidden",isStaff);
    $("#sideNewRequestBtn").classList.toggle("hidden",isStaff);
    $("#listTitle").textContent=isStaff?"All customer requests":"Your requests";
    $("#listSub").textContent=isStaff?"Select a request to review and respond.":"Select a request to view updates and deliverables.";
    await loadRequests();
  }
  async function loadRequests() {
    const isStaff=["admin","staff"].includes(currentProfile.role);
    $("#requestList").innerHTML='<div class="empty">Loading requests…</div>';
    let query=supabase.from("requests").select("id,customer_id,title,category,status,created_at,updated_at,target_date,assigned_to,budget_range").order("created_at",{ascending:false}).limit(100);
    if(!isStaff) query=query.eq("customer_id",currentUser.id);
    const {data,error}=await query;
    if(error){$("#requestList").innerHTML='<div class="empty">Could not load requests. Check database setup and access policies.</div>';showToast(error.message,true);return;}
    const rows=data||[];
    $("#statEnquiries").textContent=rows.filter(r=>!["closed","delivered"].includes(r.status)).length;
    $("#statProjects").textContent=rows.filter(r=>["approved","in_progress"].includes(r.status)).length;
    const {count}=await supabase.from("messages").select("id",{count:"exact",head:true}).eq("recipient_id",currentUser.id).is("read_at",null);
    $("#statMessages").textContent=count||0;
    const filter=$("#statusFilter").value;
    const filtered=rows.filter(r=>filter==="all"||r.status===filter);
    if(!filtered.length){$("#requestList").innerHTML='<div class="empty">No requests found. Start by submitting a new requirement.</div>';return;}
    $("#requestList").innerHTML=filtered.map(r=>`<button class="request-item" data-request="${r.id}"><div class="request-item-top"><div><h3>${escapeHtml(r.title)}</h3><p>${escapeHtml(r.category)} · ${fmtDate(r.created_at)}</p></div><span class="status ${escapeHtml(r.status)}">${escapeHtml(statusLabels[r.status]||r.status)}</span></div><div class="item-meta"><span class="tag">VF-${r.id.slice(0,8).toUpperCase()}</span>${r.target_date?`<span class="tag">Target: ${fmtDate(r.target_date)}</span>`:""}${isStaff?`<span class="tag">Customer: ${escapeHtml(r.customer_id.slice(0,8))}</span>`:""}</div></button>`).join("");
    $$("[data-request]").forEach(b=>b.addEventListener("click",()=>openRequest(b.dataset.request)));
  }
  async function uploadPrivateFile(file, requestId, bucket) {
    if(!file) return null;
    if(file.size>10*1024*1024) throw new Error("Files must be 10 MB or smaller.");
    const allowed=/\.(pdf|doc|docx|ppt|pptx|txt|csv|xlsx|png|jpg|jpeg|zip)$/i;
    if(!allowed.test(file.name)) throw new Error("That file type is not allowed.");
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120);
    const path=`${requestId}/${crypto.randomUUID()}-${safeName}`;
    const {error}=await supabase.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
    if(error) throw error;
    return {bucket,path,name:file.name,size:file.size,content_type:file.type||"application/octet-stream"};
  }
  async function createRequirement(form) {
    const fd=new FormData(form); const file=fd.get("attachment");
    const input={customer_id:currentUser.id,title:String(fd.get("title")).trim(),category:String(fd.get("category")),technology:String(fd.get("technology")||"").trim()||null,target_date:fd.get("target_date")||null,budget_range:String(fd.get("budget_range")||"").trim()||null,description:String(fd.get("description")).trim(),status:"submitted"};
    if(input.description.length<20) throw new Error("Please provide at least 20 characters describing the requirement.");
    const {data,error}=await supabase.from("requests").insert(input).select("id,title").single();
    if(error) throw error;
    if(file && file.size) {
      try {
        const meta=await uploadPrivateFile(file,data.id,"project-files");
        const {error:metaError}=await supabase.from("files").insert({request_id:data.id,uploaded_by:currentUser.id,bucket:meta.bucket,object_path:meta.path,original_name:meta.name,file_size:meta.size,content_type:meta.content_type,kind:"reference"});
        if(metaError) throw metaError;
      } catch(e) { showToast("Request created, but attachment upload failed: "+e.message,true); }
    }
    await supabase.from("messages").insert({request_id:data.id,sender_id:currentUser.id,body:"A new requirement was submitted.",is_internal:false});
    await invokeNotify({event:"new_request",request_id:data.id});
    return data;
  }
  async function openRequest(id) {
    const {data:r,error}=await supabase.from("requests").select("*").eq("id",id).single();
    if(error){showToast(error.message,true);return;} currentRequest=r;
    const isStaff=["admin","staff"].includes(currentProfile.role);
    $("#detailTitle").textContent=r.title;
    const [profileRes,msgRes,fileRes,staffRes]=await Promise.all([
      supabase.from("profiles").select("id,full_name,email,role").eq("id",r.customer_id).single(),
      supabase.from("messages").select("id,request_id,sender_id,body,is_internal,created_at,read_at").eq("request_id",id).order("created_at"),
      supabase.from("files").select("id,request_id,uploaded_by,bucket,object_path,original_name,file_size,kind,created_at").eq("request_id",id).order("created_at"),
      isStaff?supabase.from("profiles").select("id,full_name,email,role").in("role",["admin","staff"]):Promise.resolve({data:[]})
    ]);
    if(msgRes.error||fileRes.error){showToast("Could not load request details.",true);return;}
    const customer=profileRes.data||{full_name:"Customer",email:""};
    const msgs=(msgRes.data||[]).filter(m=>isStaff||!m.is_internal);
    const files=fileRes.data||[];
    const staff=staffRes.data||[];
    const fileRows=files.map(f=>`<div class="file-row"><span>📎 ${escapeHtml(f.original_name)} <small>(${Math.ceil((f.file_size||0)/1024)} KB)</small></span><button class="btn ghost" data-download="${f.id}">Secure download</button></div>`).join("")||'<p class="muted">No files uploaded yet.</p>';
    const chat=msgs.map(m=>`<div class="chat-message ${m.sender_id===currentUser.id?"":"staff"}"><b>${m.sender_id===currentUser.id?"You":(isStaff?(m.is_internal?"Internal note":"Customer / team"):"Vantage Forge team")}${m.is_internal?" · INTERNAL":""}</b>${escapeHtml(m.body)}<small>${fmtDate(m.created_at)}</small></div>`).join("")||'<p class="muted">No messages yet.</p>';
    const staffControls=isStaff?`<div class="detail-box"><h3>Team controls</h3><label>Status<select id="editStatus">${statusOptions}</select></label><label>Assign to team member<select id="editAssignee"><option value="">Unassigned</option>${staff.map(s=>`<option value="${s.id}">${escapeHtml(s.full_name||s.email)} (${escapeHtml(s.role)})</option>`).join("")}</select></label><label>Quotation amount (INR, optional)<input id="editQuote" type="number" min="0" step="0.01" value="${r.quotation_amount??""}" placeholder="Amount in ₹"></label><label>Quotation details<textarea id="editQuoteNotes" rows="3" maxlength="5000">${escapeHtml(r.quotation_notes||"")}</textarea></label><button id="saveRequest" class="btn primary">Save changes</button><p class="tiny muted">Internal notes are visible to authorized team members only.</p><form id="internalNoteForm" class="inline-form"><input name="body" maxlength="5000" placeholder="Add internal note…" required><button class="btn ghost">Add note</button></form></div>`:"";
    const quoteBlock=r.quotation_amount!=null?`<div class="detail-box"><h3>Quotation</h3><p><b>₹${Number(r.quotation_amount).toLocaleString("en-IN")}</b></p><p>${escapeHtml(r.quotation_notes||"")}</p>${!isStaff&&r.status==="quoted"?`<button class="btn primary" id="approveQuote">Approve quotation</button>`:""}</div>`:"";
    $("#detailBody").innerHTML=`<div class="detail-grid"><div class="detail-box"><h3>Requirement</h3><p><b>${escapeHtml(statusLabels[r.status]||r.status)}</b> · VF-${r.id.slice(0,8).toUpperCase()}</p><p>${escapeHtml(r.description)}</p><p><b>Category:</b> ${escapeHtml(r.category)}<br><b>Technology:</b> ${escapeHtml(r.technology||"Not specified")}<br><b>Target date:</b> ${fmtDate(r.target_date)}<br><b>Budget:</b> ${escapeHtml(r.budget_range||"To discuss")}<br><b>Submitted by:</b> ${escapeHtml(customer.full_name||customer.email||"Customer")}</p></div>${quoteBlock}${staffControls}<div class="detail-box"><h3>Files & deliverables</h3><div class="file-list">${fileRows}</div><form id="deliverableForm" class="form-grid" style="margin-top:12px"><label>${isStaff?"Upload deliverable":"Upload additional reference"}<input name="file" type="file" required></label><label>File type<select name="kind"><option value="${isStaff?"deliverable":"reference"}">${isStaff?"Deliverable":"Reference"}</option></select></label><button class="btn primary" type="submit">${isStaff?"Publish file":"Upload file"}</button></form></div><div class="detail-box"><h3>Conversation</h3><div class="message-list">${chat}</div><form id="messageForm" class="inline-form"><input name="body" maxlength="5000" placeholder="Write a message…" required><button class="btn primary">Send</button></form></div></div>`;
    const statusEl=$("#editStatus"); if(statusEl) statusEl.value=r.status;
    const assignee=$("#editAssignee"); if(assignee) assignee.value=r.assigned_to||"";
    $$("[data-download]",$("#detailBody")).forEach(b=>b.addEventListener("click",()=>downloadFile(b.dataset.download)));
    $("#messageForm").addEventListener("submit",async e=>{e.preventDefault();const body=new FormData(e.currentTarget).get("body").trim();if(!body)return;const {error}=await supabase.from("messages").insert({request_id:id,sender_id:currentUser.id,body,is_internal:false});if(error){showToast(error.message,true);return;}await invokeNotify({event:"new_message",request_id:id});await openRequest(id);});
    $("#deliverableForm").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;const file=new FormData(form).get("file");try{const meta=await uploadPrivateFile(file,id,"project-files");const kind=isStaff?"deliverable":"reference";const {error}=await supabase.from("files").insert({request_id:id,uploaded_by:currentUser.id,bucket:meta.bucket,object_path:meta.path,original_name:meta.name,file_size:meta.size,content_type:meta.content_type,kind});if(error)throw error;if(isStaff){await supabase.from("requests").update({status:"delivered"}).eq("id",id);await supabase.from("messages").insert({request_id:id,sender_id:currentUser.id,body:"A deliverable has been published to your project workspace.",is_internal:false});await invokeNotify({event:"deliverable",request_id:id});}showToast("File uploaded.");await openRequest(id);await loadRequests();}catch(err){showToast(err.message,true);}});
    if(isStaff){
      $("#saveRequest").addEventListener("click",async()=>{const amount=$("#editQuote").value;const update={status:$("#editStatus").value,assigned_to:$("#editAssignee").value||null,quotation_amount:amount===""?null:Number(amount),quotation_notes:$("#editQuoteNotes").value.trim()||null};const {error}=await supabase.from("requests").update(update).eq("id",id);if(error){showToast(error.message,true);return;}await supabase.from("messages").insert({request_id:id,sender_id:currentUser.id,body:`Request status updated to ${statusLabels[update.status]||update.status}.`,is_internal:false});if(update.status==="quoted")await invokeNotify({event:"quotation",request_id:id});showToast("Request updated.");await openRequest(id);await loadRequests();});
      $("#internalNoteForm").addEventListener("submit",async e=>{e.preventDefault();const body=new FormData(e.currentTarget).get("body").trim();const {error}=await supabase.from("messages").insert({request_id:id,sender_id:currentUser.id,body,is_internal:true});if(error){showToast(error.message,true);return;}await openRequest(id);});
    }
    const approve=$("#approveQuote"); if(approve) approve.addEventListener("click",async()=>{const {error}=await supabase.from("requests").update({status:"approved"}).eq("id",id);if(error){showToast(error.message,true);return;}await supabase.from("messages").insert({request_id:id,sender_id:currentUser.id,body:"Quotation approved by customer.",is_internal:false});showToast("Quotation approved.");await openRequest(id);await loadRequests();});
    $("#detailDialog").showModal();
  }
  async function downloadFile(fileId) {
    const {data:f,error}=await supabase.from("files").select("bucket,object_path,original_name").eq("id",fileId).single();
    if(error){showToast("You don't have permission to access this file.",true);return;}
    const {data,error:dlError}=await supabase.storage.from(f.bucket).createSignedUrl(f.object_path,60);
    if(dlError){showToast(dlError.message,true);return;}
    const a=document.createElement("a");a.href=data.signedUrl;a.target="_blank";a.rel="noopener";a.download=f.original_name;document.body.appendChild(a);a.click();a.remove();
  }
  async function onSession(session) {
    currentUser=session?.user||null;
    if(!currentUser){currentProfile=null;showSignedOut();return;}
    try{await loadProfile();await refreshDashboard();}catch(e){console.error(e);showToast("Your profile is not ready. Confirm email and check the database setup.",true);showSignedOut();}
  }
  async function init() {
    $("#year").textContent=new Date().getFullYear();
    if(!configured || !window.supabase){$("#connectionState").textContent="Setup needed";$("#setupNotice").classList.remove("hidden");$("#authMessage").textContent="Connect Supabase to activate sign-in and project features.";return;}
    supabase=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    $("#connectionState").textContent="Secure workspace";
    $$("[data-auth-tab]").forEach(b=>b.addEventListener("click",()=>setAuthTab(b.dataset.authTab)));
    $("#loginForm").addEventListener("submit",async e=>{e.preventDefault();setBusy(e.currentTarget,true);setMessage("#authMessage","");const fd=new FormData(e.currentTarget);const {error}=await supabase.auth.signInWithPassword({email:fd.get("email"),password:fd.get("password")});setBusy(e.currentTarget,false);if(error){setMessage("#authMessage",error.message,true);return;}});
    $("#signupForm").addEventListener("submit",async e=>{e.preventDefault();setBusy(e.currentTarget,true);setMessage("#authMessage","");const fd=new FormData(e.currentTarget);const {data,error}=await supabase.auth.signUp({email:fd.get("email"),password:fd.get("password"),options:{data:{full_name:String(fd.get("full_name")).trim()}}});setBusy(e.currentTarget,false);if(error){setMessage("#authMessage",error.message,true);return;}if(data.session){setMessage("#authMessage","Account created. Loading your workspace…");}else{setMessage("#authMessage","Account created. Check your email to confirm your account before signing in.");}});
    $("#resetPasswordBtn").addEventListener("click",async()=>{const email=$("#loginForm [name=email]").value.trim();if(!email){setMessage("#authMessage","Enter your email address first.",true);return;}const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});setMessage("#authMessage",error?error.message:"If this email is registered, a password reset link will be sent.");});
    $("#logoutBtn").addEventListener("click",async()=>{await supabase.auth.signOut();});
    $("#newRequestBtn").addEventListener("click",()=>$("#requirementDialog").showModal());$("#sideNewRequestBtn").addEventListener("click",()=>$("#requirementDialog").showModal());
    $("#requirementForm").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;setBusy(form,true);setMessage("#requirementMessage","");try{const data=await createRequirement(form);form.reset();$("#requirementDialog").close();showToast("Requirement submitted: VF-"+data.id.slice(0,8).toUpperCase());await loadRequests();}catch(err){setMessage("#requirementMessage",err.message,true);}finally{setBusy(form,false);}});
    $("#statusFilter").addEventListener("change",loadRequests);$("#refreshBtn").addEventListener("click",loadRequests);$("#teamGuideBtn").addEventListener("click",()=>$("#teamDialog").showModal());
    $$("[data-close]").forEach(b=>b.addEventListener("click",()=>$("#"+b.dataset.close).close()));
    supabase.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>onSession(session),0);});
    const {data:{session}}=await supabase.auth.getSession();await onSession(session);
  }
  init();
})();
