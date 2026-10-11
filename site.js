(() => {
  const cfg = window.VF_CONFIG || {};
  const site = window.VF_SITE || {};
  const ready = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes('YOUR-PROJECT') && !cfg.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  const supabase = ready && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = (s, root=document) => root.querySelector(s);
  const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const waLink = (message='Hello Vantage Forge, I would like to know more about your services and courses.') => {
    const num = String(site.WHATSAPP_NUMBER || '').replace(/\D/g,'');
    return num ? `https://wa.me/${num}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message+' Please add the Vantage Forge WhatsApp number in site-config.js.')}`;
  };
  document.querySelectorAll('[data-whatsapp]').forEach(a => { a.href = waLink(a.dataset.message || undefined); a.target='_blank'; a.rel='noopener'; });
  document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());
  const toggle = $('.menu-toggle'); if(toggle) toggle.addEventListener('click',()=>$('.nav-links')?.classList.toggle('open'));
  async function getItems(type, featuredOnly=false) {
    if(!supabase) return {data:null,error:new Error('Supabase settings are not configured in config.js.')};
    let q = supabase.from('catalog_items').select('*').eq('item_type',type).eq('is_published',true).order('sort_order',{ascending:true}).order('created_at',{ascending:false});
    if(featuredOnly) q=q.eq('is_featured',true);
    return await q;
  }
  function itemCard(item) {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const badge = item.is_trending ? '<span class="pill">TRENDING</span>' : `<span class="pill">${esc(item.category || item.item_type)}</span>`;
    const image = item.image_url ? `<img loading="lazy" src="${esc(item.image_url)}" alt="${esc(item.title)}">` : '';
    const message = `Hello Vantage Forge, I'm interested in ${item.item_type}: ${item.title}. Please share details.`;
    return `<article class="card">${image}<div class="card-body">${badge}<h3>${esc(item.title)}</h3><p>${esc(item.short_description)}</p>${tags.length?`<div class="tag-list">${tags.slice(0,5).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}<div class="card-foot"><a class="btn outline" href="contact.html?interest=${encodeURIComponent(item.title)}">Enquire</a><a class="btn primary" target="_blank" rel="noopener" href="${waLink(message)}">WhatsApp ↗</a></div></div></article>`;
  }
  async function renderCatalog() {
    const containers = document.querySelectorAll('[data-catalog]');
    for(const el of containers) {
      const type=el.dataset.catalog; const featured=el.dataset.featured==='true'; const trending=el.dataset.trending==='true';
      const {data,error}=await getItems(type,featured);
      if(error){el.innerHTML=`<div class="empty-state">${ready?'Could not load items. Make sure you ran <code>supabase/catalog.sql</code> and enabled public read access.':'Add your Supabase URL and publishable/anon key to config.js to load courses, services and projects.'}</div>`;continue;}
      let items=data||[]; if(trending) items=items.filter(x=>x.is_trending); if(el.dataset.limit) items=items.slice(0,Number(el.dataset.limit));
      el.innerHTML=items.length?items.map(itemCard).join(''):'<div class="empty-state">Nothing published here yet. The admin can add items from <a href="admin.html">the admin panel</a>.</div>';
      const filterHost=document.querySelector(`[data-filters-for="${type}"]`);
      if(filterHost && !filterHost.dataset.ready){filterHost.dataset.ready='1';const categories=['All',...new Set(items.map(x=>x.category).filter(Boolean))];filterHost.innerHTML=categories.map((c,i)=>`<button type="button" class="${i===0?'active':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('');filterHost.addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;filterHost.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));const c=b.dataset.filter;const shown=c==='All'?items:items.filter(x=>x.category===c);el.innerHTML=shown.length?shown.map(itemCard).join(''):'<div class="empty-state">No items in this category yet.</div>';});}
    }
  }
  // Keep navigation consistent across public pages and the authenticated workspace.
  // The browser key is the public anon/publishable key; authorization remains enforced by Supabase RLS.
  async function updateSessionNavigation() {
    const link = $('[data-session-link]');
    const signout = $('[data-session-signout]');
    if (!link || !supabase) return;
    const apply = (session) => {
      const signedIn = Boolean(session?.user);
      link.textContent = signedIn ? 'Dashboard ↗' : 'Dashboard / Client Portal ↗';
      if (signout) signout.classList.toggle('hidden', !signedIn);
    };
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      apply(data.session);
      supabase.auth.onAuthStateChange((_event, session) => apply(session));
    } catch (err) {
      console.warn('Could not read sign-in state for navigation:', err);
    }
    if (signout) signout.addEventListener('click', async () => {
      signout.disabled = true;
      signout.textContent = 'Signing out…';
      const { error } = await supabase.auth.signOut();
      signout.disabled = false;
      signout.textContent = 'Sign out';
      if (error) {
        alert('Could not sign out: ' + error.message);
        return;
      }
      // Keep the visitor on the public page; only the account session ends.
      apply(null);
      window.location.href = 'index.html';
    });
  }
  updateSessionNavigation();
  renderCatalog();
  const form=$('#contactForm'); if(form) form.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(form);const name=fd.get('name'),email=fd.get('email'),interest=fd.get('interest'),message=fd.get('message');const text=`Hello Vantage Forge,\nName: ${name}\nEmail: ${email}\nInterest: ${interest}\nMessage: ${message}`;const url=waLink(text);const number=String(site.WHATSAPP_NUMBER||'').replace(/\D/g,'');if(number){window.open(url,'_blank','noopener');$('#formMessage').textContent='Opening WhatsApp with your enquiry. Please press Send in WhatsApp to submit it.';}else{$('#formMessage').textContent='Please set the WhatsApp number in site-config.js. Your enquiry details have not been sent.';}});
})();
