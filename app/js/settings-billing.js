// Ayarlar: online menü düzenleyici, abonelik/ödeme, destek erişimi, değişiklik kaydı (settings.js'ten ayrıldı; klasik script, fonksiyonlar global).

/* ---- Online Menü düzenleyici: online sipariş sayfasında gösterilecek
   başlıklar (örn. "Fırın") ve içlerine atanan ürünler. Ürünün mutfak
   istasyonu/fişi değişmez; başlık yalnızca müşteriye görünen gruplamadır.
   Ürün fotoğrafları da burada yüklenir (tarayıcıda küçültülüp kaydedilir). ---- */
function goProductMedia(){ APP.settingsTab = 'products'; APP.productsSubTab = 'media'; renderSettingsView(document.getElementById('main'), getSession()); }
async function openOnlineMenuEditor(){
  const session = getSession();
  const { data, error } = await withLoadingOverlay(sb.rpc('get_online_menu_admin', { p_token: session.session_token }));
  if(error){ alert(error.message); return; }
  APP.onlineMenu = data;
  let bg = document.getElementById('onlineMenuBg');
  if(!bg){
    bg = document.createElement('div'); bg.id = 'onlineMenuBg';
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:28px 16px 16px;overflow-y:auto;';
    bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
    document.body.appendChild(bg);
  }
  drawOnlineMenuEditor();
}
function drawOnlineMenuEditor(){
  const bg = document.getElementById('onlineMenuBg'); if(!bg) return;
  const d = APP.onlineMenu; const byId = {}; d.products.forEach(p => byId[p.id] = p);
  const tab = APP.onlineMenuTab || 'sections';
  const sectionsHtml = d.sections.map((sec, i) => `
    <div class="add-row-panel" style="margin:0 0 12px;">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input value="${escapeAttr(sec.name)}" id="oms_name_${sec.id}" style="flex:1;min-width:140px;margin:0;font-weight:700;">
        <button type="button" class="u-wa-m0 sbtn" ${i===0?'disabled':''} ${act('moveOnlineSection', sec.id, -1)} title="Yukarı">↑</button>
        <button type="button" class="u-wa-m0 sbtn" ${i===d.sections.length-1?'disabled':''} ${act('moveOnlineSection', sec.id, 1)} title="Aşağı">↓</button>
        <button type="button" class="u-wa-m0 sbtn" ${act('saveOnlineSectionName', sec.id)}>💾</button>
        <button type="button" class="sbtn" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" ${act('removeOnlineSection', sec.id)}>🗑️</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">
        ${sec.product_ids.map(id => byId[id]).filter(Boolean).map(p => `<span class="role-badge" style="display:inline-flex;gap:6px;align-items:center;">${escapeHtml(p.name)} <span class="u-fs11 muted">(${escapeHtml(p.station_name||'-')})</span><a href="#" style="color:var(--red);text-decoration:none;" ${act('toggleOnlineSectionProduct', sec.id, p.id)}>✕</a></span>`).join('') || '<span class="u-fs125 muted">Henüz ürün yok.</span>'}
      </div>
      <button type="button" class="ghost-btn" style="max-width:200px;margin-top:10px;" ${act('pickOnlineSectionProducts', sec.id)}>+ Ürün Ekle / Çıkar</button>
    </div>`).join('');
  const photosHtml = d.products.map(p => `
    <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);">
      ${p.image ? `<img src="${p.image}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0;">` : '<div style="width:56px;height:56px;border-radius:10px;background:var(--panel2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">📷</div>'}
      <div style="flex:1;min-width:0;"><b style="overflow-wrap:anywhere;">${escapeHtml(p.name)}</b><div class="u-fs12 muted">${escapeHtml(p.station_name||'-')} · ${money(p.price)}</div></div>
      <label class="sbtn" style="width:auto;margin:0;cursor:pointer;">${p.image?'Değiştir':'Fotoğraf Ekle'}<input type="file" accept="image/*" style="display:none;" ${actOn('change','uploadProductImage',[p.id, '$this'])}></label>
      ${p.image ? `<button type="button" class="sbtn" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" ${act('removeProductImage', p.id)}>✕</button>` : ''}
    </div>`).join('');
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:640px;width:100%;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h2 class="u-m0">🗂️ Online Menü</h2>
      <span class="u-xclose" ${act('removeEl','onlineMenuBg')}>✕</span>
    </div>
    <div class="sub-tabs" style="margin-bottom:14px;">
      <div role="tab" tabindex="0" class="sub-tab ${tab==='sections'?'active':''}" ${act('setOnlineMenuTab','sections')}><span class="sub-tab-ic">🗂️</span>Başlıklar</div>
      <div role="tab" tabindex="0" class="sub-tab ${tab==='photos'?'active':''}" ${act('setOnlineMenuTab','photos')}><span class="sub-tab-ic">📷</span>Fotoğraflar</div>
    </div>
    ${tab==='sections' ? `
      <p class="muted" style="text-align:left;margin:0 0 12px;font-size:13px;">Online sipariş sayfasında müşteriye görünecek başlıkları oluşturun ve ürünleri yerleştirin (örn. lahmacunu "Fırın" başlığına). Ürünün fişi yine kendi istasyonuna gider. Hiç başlık yoksa ürünler istasyonlara göre listelenir; başlık varsa yalnızca başlıklardaki ürünler görünür.</p>
      ${sectionsHtml || '<p class="muted">Henüz başlık yok.</p>'}
      <div style="display:flex;gap:8px;margin-top:6px;"><input id="oms_new" placeholder="Yeni başlık (örn. Fırın)" style="margin:0;flex:1;"><button type="button" class="u-wa-m0" ${act('addOnlineSection')}>+ Ekle</button></div>`
    : `<p class="muted" style="text-align:left;margin:0 0 8px;font-size:13px;">Fotoğraflar online sipariş sayfasında ürünün yanında görünür. Yüklerken otomatik küçültülür.</p>${photosHtml || '<p class="muted">Ürün yok.</p>'}`}
  </div>`;
}
async function saveOnlineSection(sec, extra){
  const session = getSession();
  const { error } = await sb.rpc('save_online_menu_section', Object.assign({ p_token: session.session_token, p_id: sec.id, p_name: sec.name, p_product_ids: sec.product_ids, p_sort: null }, extra||{}));
  if(error){ alert(error.message); return false; }
  return true;
}
async function addOnlineSection(){
  const name = (document.getElementById('oms_new').value||'').trim(); if(!name) return;
  const session = getSession();
  const { error } = await sb.rpc('save_online_menu_section', { p_token: session.session_token, p_id: null, p_name: name, p_product_ids: [], p_sort: null });
  if(error){ alert(error.message); return; }
  openOnlineMenuEditor();
}
async function saveOnlineSectionName(id){
  const sec = APP.onlineMenu.sections.find(x => x.id===id); if(!sec) return;
  sec.name = document.getElementById('oms_name_'+id).value.trim();
  if(await saveOnlineSection(sec)) showToast('Kaydedildi ✓');
}
async function removeOnlineSection(id){
  if(!await uiConfirm('Bu başlık silinsin mi? (Ürünler silinmez)')) return;
  const session = getSession();
  const { error } = await sb.rpc('remove_online_menu_section', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  openOnlineMenuEditor();
}
async function moveOnlineSection(id, dir){
  const list = APP.onlineMenu.sections; const i = list.findIndex(x => x.id===id); const j = i + dir;
  if(i<0 || j<0 || j>=list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  for(let k=0; k<list.length; k++){ if(!(await saveOnlineSection(list[k], { p_sort: k+1, p_product_ids: null }))) return; }
  drawOnlineMenuEditor();
}
async function toggleOnlineSectionProduct(secId, productId){
  const sec = APP.onlineMenu.sections.find(x => x.id===secId); if(!sec) return;
  sec.product_ids = sec.product_ids.includes(productId) ? sec.product_ids.filter(x => x!==productId) : sec.product_ids.concat(productId);
  if(await saveOnlineSection(sec)) drawOnlineMenuEditor();
}
function pickOnlineSectionProducts(secId){
  const sec = APP.onlineMenu.sections.find(x => x.id===secId); if(!sec) return;
  const ov = document.createElement('div'); ov.id = 'omsPickBg';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:110;padding:16px;';
  ov.onclick = (e) => { if(e.target===ov) ov.remove(); };
  ov.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:18px;max-width:420px;width:100%;max-height:82vh;display:flex;flex-direction:column;">
    <h3 class="u-mb8">${escapeHtml(sec.name)} · ürünler</h3>
    <input id="omsPickSearch" placeholder="Ara..." class="u-mb8" ${actOn('input','filterOmsPickList',['$value'])}>
    <div id="omsPickList" style="overflow:auto;flex:1;">
      ${APP.onlineMenu.products.map(p => `<label style="display:flex;gap:10px;align-items:center;padding:7px 2px;border-bottom:1px solid var(--border);cursor:pointer;">
        <input type="checkbox" value="${p.id}" class="u-wa-m0" ${sec.product_ids.includes(p.id)?'checked':''}>
        <span class="u-f1">${escapeHtml(p.name)} <span class="muted" style="font-size:11.5px;">${escapeHtml(p.station_name||'-')}</span></span></label>`).join('')}
    </div>
    <div style="display:flex;gap:10px;margin-top:12px;">
      <button type="button" class="u-f1-m0 ghost-btn" ${act('removeEl','omsPickBg')}>Vazgeç</button>
      <button type="button" class="u-f1-m0" ${act('applyOnlineSectionPick', secId)}>Kaydet</button>
    </div></div>`;
  document.body.appendChild(ov);
}
async function applyOnlineSectionPick(secId){
  const sec = APP.onlineMenu.sections.find(x => x.id===secId); if(!sec) return;
  const checked = [...document.querySelectorAll('#omsPickList input:checked')].map(x => x.value);
  // Mevcut sıra korunur, yeni seçilenler sona eklenir.
  sec.product_ids = sec.product_ids.filter(id => checked.includes(id)).concat(checked.filter(id => !sec.product_ids.includes(id)));
  if(await saveOnlineSection(sec)){ document.getElementById('omsPickBg').remove(); drawOnlineMenuEditor(); }
}
function resizeImageToDataUrl(file, maxSide){
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Görsel okunamadı')); };
    img.src = url;
  });
}
/* Fotoğraf & Açıklama: QR menü ve online sipariş sayfasında ürünün fotoğrafı ve kısa açıklaması.
   Sayfalardaki başlıklar otomatik olarak menülerdir (Ayarlar → İstasyonlar → Menüler). */
async function renderProductMedia(el, session){
  el.innerHTML = '<div class="u-mwn box"><p class="muted">Yükleniyor…</p></div>';
  const { data, error } = await sb.rpc('list_product_media', { p_token: session.session_token });
  if(error){ el.innerHTML = '<div class="box"><p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p></div>'; return; }
  APP.productMedia = data || [];
  const groups = []; const map = {};
  APP.productMedia.forEach(p => { const k = p.menu || 'Menüsüz'; if(!map[k]){ map[k] = { name: k, items: [] }; groups.push(map[k]); } map[k].items.push(p); });
  const all = APP.productMedia, withImg = all.filter(p => p.image).length, withDesc = all.filter(p => (p.description||'').trim()).length;
  const mf = APP.mediaFilter || 'all';
  const pass = (p) => mf==='noimg' ? !p.image : mf==='nodesc' ? !(p.description||'').trim() : mf==='done' ? (p.image && (p.description||'').trim()) : true;
  const chip = (k, ic, v, l, c) => `<div class="os-chip os-click ${mf===k?'on':''}" role="button" style="--oc:${c};" ${act('setMediaFilter', k)}><span class="os-ic">${ic}</span><div><b>${v}</b><small>${l}</small></div></div>`;
  const pct = all.length ? Math.round((withImg + withDesc) / (all.length*2) * 100) : 0;
  el.innerHTML = `<div class="order-summary stat-chips" style="--n:4;">${chip('all','🍽️', all.length, 'Ürün', 'var(--c1)')}${chip('noimg','📷', all.length - withImg, 'Fotoğrafsız', 'var(--c3)')}${chip('nodesc','✍️', all.length - withDesc, 'Açıklamasız', 'var(--c2)')}${chip('done','✅', all.filter(p => p.image && (p.description||'').trim()).length, 'Tamamlanan', 'var(--ok,#22c55e)')}</div>
  <div class="box" style="max-width:none;text-align:left;">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;"><h2 class="u-m0">📷 Fotoğraf & Açıklama</h2><span class="u-f1"></span>
      <div class="md-prog" title="Menü vitrininin tamamlanma oranı"><div class="pcard-mbar"><i style="width:${pct}%;background:linear-gradient(90deg,var(--c1),var(--c2));"></i></div><small>Vitrin %${pct} hazır</small></div></div>
    <p class="muted" style="margin:6px 0 14px;font-size:13px;">QR menüde ve online sipariş sayfasında görünür. Başlıklar menülerinizdir. Açıklama kutusundan çıkınca kaydedilir.</p>
    ${groups.map(g => { const items = g.items.filter(pass); return !items.length ? '' : `<div class="rv-day-h" style="margin:18px 0 10px;">${escapeHtml(g.name)}<span class="muted">${items.length} ürün</span></div>
      <div class="md-grid">${items.map((p, k) => `
        <div class="md-card ${p.image?'':'noimg'}" style="--i:${Math.min(k,12)};">
          <label class="md-img" title="${p.image ? 'Fotoğrafı değiştir' : 'Fotoğraf yükle'}">
            ${p.image ? `<img src="${p.image}" alt="">` : '<span class="md-ph">📷<small>Fotoğraf ekle</small></span>'}
            <span class="md-over">${p.image ? '🔄 Değiştir' : '⬆️ Yükle'}</span>
            <input type="file" accept="image/*" style="display:none;" ${actOn('change','uploadProductImage',[p.id, '$this'])}>
          </label>
          ${p.image ? `<button type="button" class="md-rm" title="Fotoğrafı kaldır" ${act('removeProductImage', p.id)}>✕</button>` : ''}
          <div class="md-body">
            <div class="md-title"><b>${escapeHtml(p.name)}</b><span>${money(p.price)}</span></div>
            <textarea rows="3" maxlength="500" placeholder="Kısa, iştah açıcı bir açıklama yazın…" ${actOn('change','saveProductDescription',[p.id, '$value'])}>${escapeHtml(p.description || '')}</textarea>
          </div>
        </div>`).join('')}</div>`; }).join('') || '<div class="empty-state"><div style="font-size:38px;">🎉</div><p class="muted">Bu filtrede ürün yok.</p></div>'}
  </div>`;
}
function setMediaFilter(k){ APP.mediaFilter = APP.mediaFilter===k ? 'all' : k; refreshMediaViews(); }
async function saveProductDescription(pid, text){
  const { error } = await sb.rpc('set_product_description', { p_token: getSession().session_token, p_product_id: pid, p_text: text });
  if(error){ alert(error.message); return; }
  showToast('Açıklama kaydedildi ✓');
}
function refreshMediaViews(){
  if(document.getElementById('onlineMenuBg')) drawOnlineMenuEditor();
  else if(APP.settingsTab === 'products' && APP.productsSubTab === 'media'){ const box = document.getElementById('productsSubContent') || document.getElementById('settingsContent'); if(box) renderProductMedia(box, getSession()); }
}
async function uploadProductImage(productId, input){
  const file = input.files && input.files[0]; if(!file) return;
  let dataUrl;
  try{ dataUrl = await resizeImageToDataUrl(file, 480); }catch(e){ alert(e.message); return; }
  const session = getSession();
  const { error } = await withLoadingOverlay(sb.rpc('set_product_image', { p_token: session.session_token, p_product_id: productId, p_data: dataUrl }));
  if(error){ alert(error.message); return; }
  showToast('Fotoğraf kaydedildi ✓');
  refreshMediaViews();
}
async function removeProductImage(productId){
  if(!await uiConfirm('Fotoğraf kaldırılsın mı?')) return;
  const session = getSession();
  const { error } = await sb.rpc('set_product_image', { p_token: session.session_token, p_product_id: productId, p_data: null });
  if(error){ alert(error.message); return; }
  refreshMediaViews();
}
function lockedFeatureHtml(){
  return `<p class="u-m0 muted">🔒 Bu özellik paketinizde yok. Eklenti olarak eklemek ya da paketinizi yükseltmek için bizimle iletişime geçin.</p>`;
}
function ixPick(sel, v){ const h = document.getElementById(sel); if(!h) return; h.value = v;
  h.nextElementSibling.querySelectorAll('.ix-tile').forEach(b => b.classList.toggle('on', b.dataset.v === v)); }
function ixSw(on){ const e = event && event.target; const em = e && e.closest('.oo-switch') && e.closest('.oo-switch').querySelector('em'); if(em) em.textContent = on ? 'Açık' : 'Kapalı';
  const h = e && e.closest('.oo-hero'); if(h) h.classList.toggle('on', !!on); }
function onlineOrderingLinkHtml(){
  const url = window.location.origin + '/siparis/?r=' + encodeURIComponent(APP.config.online_ordering.code);
  const qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=' + encodeURIComponent(url);
  return `<div class="oo-share">
    <div class="oo-qr"><img src="${qrImgUrl}" alt="QR"></div>
    <div class="oo-share-t">
      <span class="oo-live">● Yayında</span>
      <b>Paylaşmaya hazır</b>
      <small>Instagram bio'su, Google İşletme profili, WhatsApp veya masa standı — her yerde çalışır.</small>
      <div class="oo-url">${escapeHtml(url.replace(/^https?:\/\//, ''))}</div>
      <div class="oo-btns">
        <button type="button" ${act('copyText', url, 'Link kopyalandı ✓')}>🔗 Kopyala</button>
        <a class="oo-open" href="${escapeAttr(url)}" target="_blank" rel="noopener">↗ Sayfayı aç</a>
      </div>
    </div>
  </div>`;
}
async function saveAccountingSettings(){
  const session = getSession();
  const provider = document.getElementById('int_accounting_provider').value || null;
  const key = document.getElementById('int_accounting_key').value;
  const enabled = document.getElementById('int_accounting_enabled').checked;
  const { error } = await sb.rpc('update_accounting_settings', { p_token: session.session_token, p_provider: provider, p_api_key: key||null, p_enabled: enabled });
  if(error){ alert(error.message==='PAKET_OZELLIK_YOK' ? 'Muhasebe Entegrasyonu paketinizde dahil değil - ayrı bir eklenti olarak satınalmak için bizimle iletişime geçin.' : error.message); return; }
  renderSettingsContent(session);
  showToast('Kaydedildi ✓');
}
async function saveGoogleReviewUrl(){
  const session = getSession();
  const url = document.getElementById('int_google_review_url').value.trim();
  const { error } = await sb.rpc('update_google_review_url', { p_token: session.session_token, p_url: url||null });
  if(error){ alert(error.message); return; }
  APP.config.google_review_url = url || null;
  showToast('Kaydedildi ✓');
}
async function saveOnlineOrderingSettings(){
  const session = getSession();
  const enabled = document.getElementById('int_online_ordering_enabled').checked;
  const { error } = await sb.rpc('update_online_ordering_settings', { p_token: session.session_token, p_enabled: enabled });
  if(error){ alert(error.message==='PAKET_OZELLIK_YOK' ? 'Dışarıdan Online Sipariş paketinizde dahil değil - paketinizi yükseltmek için bizimle iletişime geçin.' : error.message); document.getElementById('int_online_ordering_enabled').checked = !enabled; return; }
  if(!APP.config.online_ordering) APP.config.online_ordering = {};
  APP.config.online_ordering.enabled = enabled;
  showToast(enabled ? 'Online sipariş açıldı ✓' : 'Online sipariş kapatıldı ✓');
  renderSettingsContent(session);
}
/* Paket/eklenti gerektiren bir RPC 'PAKET_OZELLIK_YOK' ile dönerse, ham
   hata koduyla uğraştırmak yerine ilgili özelliğin adıyla anlaşılır bir
   mesaj gösterir. */
function friendlyPaketError(errMessage, featureLabel){
  if(errMessage !== 'PAKET_OZELLIK_YOK') return errMessage;
  return featureLabel + ' paketinizde/eklentilerinizde dahil değil - açmak için bizimle iletişime geçin.';
}
async function saveEfaturaSettings(){
  const session = getSession();
  const provider = document.getElementById('int_efatura_provider').value || null;
  const key = document.getElementById('int_efatura_key').value;
  const enabled = document.getElementById('int_efatura_enabled').checked;
  const { error } = await sb.rpc('update_efatura_settings', { p_token: session.session_token, p_provider: provider, p_api_key: key||null, p_enabled: enabled });
  if(error){ alert(friendlyPaketError(error.message, 'ÖKC / e-Fatura Entegrasyonu')); return; }
  renderSettingsContent(session);
  showToast('Kaydedildi ✓');
}
async function saveMarketplaceSettings(){
  const session = getSession();
  const ys = document.getElementById('int_ys_key').value;
  const ty = document.getElementById('int_ty_key').value;
  const gt = document.getElementById('int_gt_key').value;
  const enabled = document.getElementById('int_marketplace_enabled').checked;
  const { error } = await sb.rpc('update_marketplace_settings', { p_token: session.session_token, p_yemeksepeti_key: ys||null, p_trendyol_key: ty||null, p_getir_key: gt||null, p_enabled: enabled });
  if(error){ alert(friendlyPaketError(error.message, 'Pazaryeri Entegrasyonu')); return; }
  renderSettingsContent(session);
  showToast('Kaydedildi ✓');
}

/* ---- Abonelik / Aylık Ödeme (Ayarlar > Kullanıcılar üstünde) ---- */
function renderSubscriptionPanel(lic){
  if(!lic.expires_at){
    // Süresiz lisans (platform yöneticisi bitiş tarihi koymamış): ödeme istenmez.
    const used = APP.config.users.length, max = lic.max_users || 1, up = Math.min(100, Math.round(used/max*100));
    return `<div class="sub-hero" style="--hc:var(--green);">
      <div class="sub-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="trk"/><circle cx="50" cy="50" r="42" class="val" style="stroke-dasharray:264;stroke-dashoffset:0;"/></svg><div><b>∞</b><small>süresiz</small></div></div>
      <div class="sub-info"><small class="muted">Mevcut paket</small><h3>${escapeHtml(lic.package_id)}</h3>
        <div class="sub-status">✅ Süresiz lisans — ödeme gerekmez.</div>
        <div class="sub-users"><div class="pcard-mbar"><i style="width:${up}%;background:${up>=90?'var(--c3)':'var(--c1)'};"></i></div><small>👥 ${used} / ${max} kullanıcı</small></div></div>
    </div>`;
  }
  const expires = new Date(lic.expires_at);
  const daysLeft = Math.ceil((expires - new Date()) / (24*60*60*1000));
  const expired = daysLeft <= 0;
  const soon = !expired && daysLeft <= 3;
  const color = expired ? 'var(--red)' : (soon ? 'var(--accent)' : 'var(--green)');
  const statusText = expired
    ? 'Süreniz doldu — devam etmek için ödeme yapın.'
    : (daysLeft + ' gün kaldı (bitiş: ' + expires.toLocaleDateString('tr-TR') + ')');
  const totalDays = 30, ring = Math.max(0, Math.min(1, daysLeft / totalDays)), C = 2*Math.PI*42;
  const used = APP.config.users.length, max = lic.max_users || 1, up = Math.min(100, Math.round(used/max*100));
  return `
    <div class="sub-hero" style="--hc:${color};">
      <div class="sub-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="trk"/><circle cx="50" cy="50" r="42" class="val" style="stroke-dasharray:${C};stroke-dashoffset:${C*(1-ring)};"/></svg>
        <div><b>${expired ? '0' : daysLeft}</b><small>gün</small></div></div>
      <div class="sub-info">
        <small class="muted">Mevcut paket</small>
        <h3>${escapeHtml(lic.package_id)}</h3>
        <div class="sub-status">${expired ? '⛔ ' : soon ? '⚠️ ' : '✅ '}${statusText}</div>
        <div class="sub-users"><div class="pcard-mbar"><i style="width:${up}%;background:${up>=90?'var(--c3)':'var(--c1)'};"></i></div><small>👥 ${used} / ${max} kullanıcı</small></div>
      </div>
      <div class="sub-cta">
        ${billingCycleSelectorHtml()}
        <button id="renewBtn" disabled title="Kartla ödeme yakında açılacak">💳 Kredi Kartı ile Öde</button>
        <span class="sub-soon">🔜 Kart ile ödeme yakında</span>
      </div>
      <div class="error" id="renewErr" style="grid-column:1/-1;text-align:left;"></div>
    </div>`;
}
/* Aylık/Yıllık seçimi - hem (ileride açılacak) kart ödemesini hem de
   havale bildirimini etkiler, bu yüzden abonelik panelinin en üstünde tek
   bir yerden seçiliyor (APP.billingCycle). Yıllık fiyat platform admin
   panelinden paket başına ayrıca girilebilir; girilmemişse aylık fiyatın
   12 katı (indirimsiz) sunucuda otomatik hesaplanır. */
function billingCycleSelectorHtml(){
  const cycle = APP.billingCycle || 'monthly';
  return `<div class="seg sub-seg">${[['monthly','Aylık'],['yearly','Yıllık']].map(([k,l]) => `<button type="button" class="${cycle===k?'on':''}" ${act('setBillingCycle', k)}>${l}</button>`).join('')}</div>`;
}
function setBillingCycle(cycle){
  APP.billingCycle = cycle;
  renderBillingSettings(billingBox(), getSession());
}
/* Kredi kartı (iyzico) akışı gecici olarak kapali - "şirket" (vergi/ticari
   kayıt) süreci tamamlanana kadar tek ödeme yolu havale bildirimi (bkz.
   aşağıda renderBillingSettings). Buton bilinçli olarak disabled bırakıldı. */
async function startRenewal(){
  const session = getSession();
  const btn = document.getElementById('renewBtn');
  const errBox = document.getElementById('renewErr');
  errBox.textContent = '';
  btn.disabled = true; btn.textContent = 'Yönlendiriliyor...';
  try{
    const res = await fetch(PAYMENT_RENEW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: session.session_token, p_billing_cycle: APP.billingCycle||'monthly' })
    });
    const data = await res.json();
    if(!res.ok || !data.paymentPageUrl){
      errBox.textContent = 'Ödeme başlatılamadı: ' + (data.errorMessage || JSON.stringify(data));
      btn.disabled = false; btn.textContent = '💳 Kredi Kartı ile Öde';
      return;
    }
    window.location.href = data.paymentPageUrl;
  }catch(err){
    errBox.textContent = 'Ödeme sayfasına ulaşılamadı: ' + err.message;
    btn.disabled = false; btn.textContent = '💳 Kredi Kartı ile Öde';
  }
}
/* ---- Ayarlar > Abonelik: iyzico ile kart ödemesi çalışmıyorsa/yoksa
   kullanılabilecek havale/EFT alternatifi. Yönetici IBAN'a gönderip
   "Ödemeyi Yaptım" der, platform yöneticisi (Admin Paneli > Havale
   Bildirimleri) onaylayınca abonelik otomatik 30 gün uzar. ---- */
function renderBillingSettings(el, session){
  const lic = APP.config.license;
  // Google Play, uygulama içinde Play Billing dışı dijital abonelik satışını
  // yasaklıyor - native uygulamada ödeme/havale ekranı gösterilmez, sadece
  // abonelik durumu bilgisi kalır (web'de akış aynen devam eder).
  if(isNativeApp()){
    el.innerHTML = `<div class="u-mwn box">
      <h2>💳 Abonelik</h2>
      ${lic ? `<p>Paket: <b>${escapeHtml(lic.package_id)}</b> · Bitiş: <b>${lic.expires_at ? new Date(lic.expires_at).toLocaleDateString('tr-TR') : 'Süresiz'}</b></p>` : ''}
      <p class="muted">Abonelik işlemleri bu uygulama üzerinden yapılamaz; lütfen bir bilgisayar veya tarayıcıdan hesabınıza giriş yapın.</p>
    </div>`;
    return;
  }
  el.innerHTML = `<div class="u-mwn box">
    <h2>💳 Abonelik ve Ödemeler</h2>
    ${lic ? renderSubscriptionPanel(lic) : '<p class="muted">Abonelik bilgisi bulunamadı.</p>'}
    <div class="bill-grid">
      <div id="billingIdentityBox">${renderBillingIdentityBox(lic)}</div>
      <div id="billingAddressBox">${renderBillingAddressBox(lic)}</div>
    </div>
    <div id="bankTransferBox"><p class="muted">Yükleniyor…</p></div>
  </div>`;
  loadBankTransferStatus(session);
}
function renderBillingAddressBox(lic){
  const has = lic && lic.billing_address && lic.billing_city;
  if(has && !APP.billingAddressEditing){
    return `<div class="add-row-panel" style="margin-top:16px;">
      <h3 class="u-mb8">📍 Fatura Adresi</h3>
      <p class="u-tl muted">${escapeHtml(lic.billing_address)} · <b>${escapeHtml(lic.billing_city)}</b></p>
      <button class="ghost-btn" ${act('editBillingField','billingAddressEditing')}>Değiştir</button>
    </div>`;
  }
  return `<div class="add-row-panel" style="margin-top:16px;">
    <h3 class="u-mb8">📍 Fatura Adresi</h3>
    <p class="muted">Kart ile ödemede ve faturada kullanılacak adres.</p>
    <input id="biAddress" placeholder="Açık adres (mahalle, sokak, no, ilçe)" value="${escapeAttr((lic && lic.billing_address) || '')}">
    <input id="biCity" placeholder="Şehir (örn. İstanbul)" value="${escapeAttr((lic && lic.billing_city) || '')}">
    <div class="error" id="biAddressErr"></div>
    <button id="biAddressSaveBtn" ${act('saveBillingAddress')}>Kaydet</button>
  </div>`;
}
async function saveBillingAddress(){
  const session = getSession();
  const errBox = document.getElementById('biAddressErr'); errBox.textContent = '';
  const address = document.getElementById('biAddress').value.trim(), city = document.getElementById('biCity').value.trim();
  const { error } = await sb.rpc('update_billing_address', { p_token: session.session_token, p_address: address, p_city: city });
  if(error){ errBox.textContent = error.message; return; }
  Object.assign(APP.config.license, { billing_address: address, billing_city: city });
  APP.billingAddressEditing = false;
  showToast('Fatura adresi kaydedildi ✓');
  renderBillingSettings(billingBox(), session);
}
function renderBillingIdentityBox(lic){
  const isSet = lic && lic.billing_identity_set;
  if(isSet && !APP.billingIdentityEditing){
    return `<div class="add-row-panel" style="margin-top:16px;">
      <h3 class="u-mb8">🧾 Fatura Kimlik Bilgisi</h3>
      <p class="muted">T.C. Kimlik Numaranız kayıtlı ✓</p>
      <button class="ghost-btn" ${act('editBillingField','billingIdentityEditing')}>Değiştir</button>
    </div>`;
  }
  return `<div class="add-row-panel" style="margin-top:16px;">
    <h3 class="u-mb8">🧾 Fatura Kimlik Bilgisi</h3>
    <p class="muted">Kart ile ödeme yapabilmek için fatura üzerinde görünecek T.C. Kimlik Numaranızı girin.</p>
    <input id="biIdentityNumber" placeholder="T.C. Kimlik Numarası" inputmode="numeric" maxlength="11">
    <div class="error" id="biIdentityErr"></div>
    <button id="biIdentitySaveBtn" ${act('saveBillingIdentity')}>Kaydet</button>
  </div>`;
}
async function saveBillingIdentity(){
  const session = getSession();
  const errBox = document.getElementById('biIdentityErr');
  const num = document.getElementById('biIdentityNumber').value.trim();
  errBox.textContent = '';
  if(!isValidTcKimlikNo(num)){ errBox.textContent = 'Geçerli bir T.C. Kimlik Numarası girin'; return; }
  const btn = document.getElementById('biIdentitySaveBtn');
  btn.disabled = true; btn.textContent = 'Kaydediliyor...';
  const { error } = await sb.rpc('update_billing_identity', { p_token: session.session_token, p_identity_number: num });
  btn.disabled = false; btn.textContent = 'Kaydet';
  if(error){ errBox.textContent = error.message; return; }
  APP.config.license.billing_identity_set = true;
  APP.billingIdentityEditing = false;
  showToast('Kaydedildi ✓');
  renderBillingSettings(billingBox(), session);
}
async function loadBankTransferStatus(session){
  const el = document.getElementById('bankTransferBox'); if(!el) return;
  const cycle = APP.billingCycle || 'monthly';
  const { data, error } = await sb.rpc('get_bank_transfer_status', { p_token: session.session_token, p_billing_cycle: cycle });
  if(error){ el.innerHTML = '<p class="muted">Havale bilgisi yüklenemedi: '+error.message+'</p>'; return; }
  APP.bankTransferStatus = data;
  if(data.pending_notice){
    const pn = data.pending_notice;
    const cycleLabel = pn.billing_cycle==='yearly' ? 'yıllık' : 'aylık';
    el.innerHTML = `
      <div class="add-row-panel" style="border-color:var(--accent);margin-top:16px;">
        <h3 class="u-mb8">🏦 Havale Bildirimi Gönderildi</h3>
        <p class="muted">${money(pn.amount)} tutarındaki (${cycleLabel}) havale bildiriminiz ${new Date(pn.created_at).toLocaleString('tr-TR')} tarihinde alındı, platform yöneticisinin onayı bekleniyor. Onaylanınca aboneliğiniz otomatik uzayacak.</p>
        ${pn.note ? `<p class="u-fs12 muted">Not: ${escapeHtml(pn.note)}</p>` : ''}
      </div>`;
    return;
  }
  if(!data.iban){
    el.innerHTML = `
      <div class="add-row-panel" style="margin-top:16px;">
        <h3 class="u-mb8">🏦 Havale ile Öde</h3>
        <p class="muted">Banka bilgileri henüz tanımlanmamış. Lütfen platform yöneticisiyle iletişime geçin.</p>
      </div>`;
    return;
  }
  const cycleLabel = cycle==='yearly' ? 'Yıllık' : 'Aylık';
  const savingsNote = (cycle==='yearly' && data.yearly_amount < data.monthly_amount*12)
    ? `<p class="muted" style="font-size:12px;color:var(--green);">Yıllık ödemede ${money(data.monthly_amount*12 - data.yearly_amount)} tasarruf ediyorsunuz.</p>`
    : '';
  el.innerHTML = `
    <div class="add-row-panel" style="margin-top:16px;">
      <h3 class="u-mb8">🏦 Havale ile Öde (${cycleLabel})</h3>
      <p class="muted">Kartla ödeme çalışmıyorsa aşağıdaki hesaba havale/EFT gönderip "Ödemeyi Yaptım" ile bildirin - platform yöneticisi onayladığında aboneliğiniz otomatik ${cycle==='yearly'?'365':'30'} gün uzar.</p>
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin:10px 0;font-size:14px;line-height:1.8;">
        <div><b>IBAN:</b> ${escapeHtml(data.iban)}</div>
        <div><b>Hesap Adı:</b> ${escapeHtml(data.account_name||'-')}</div>
        <div><b>Banka:</b> ${escapeHtml(data.bank_name||'-')}</div>
        <div><b>Tutar (${cycleLabel}):</b> ${money(data.amount)}</div>
        <div><b>Açıklama (mutlaka yazın):</b> ${escapeHtml(data.target_name)}</div>
      </div>
      ${savingsNote}
      <input id="bankTransferNote" placeholder="İsteğe bağlı not (örn. dekont no, gönderen ad)">
      <div class="error" id="bankTransferErr"></div>
      <button id="bankTransferSubmitBtn" ${act('submitBankTransferNotice')}>✅ Ödemeyi Yaptım, Bildir</button>
    </div>`;
}
async function submitBankTransferNotice(){
  const session = getSession();
  const btn = document.getElementById('bankTransferSubmitBtn');
  const errBox = document.getElementById('bankTransferErr');
  const note = document.getElementById('bankTransferNote').value.trim();
  errBox.textContent = '';
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  // Popup engelleyicilere takılmamak için pencere, kullanıcı tıklamasıyla
  // aynı anda (await'ten ÖNCE) senkron olarak açılır; adresi RPC
  // sonuçlandıktan sonra doldurulur.
  const waWin = window.open('', '_blank');
  const { error } = await sb.rpc('submit_bank_transfer_notice', { p_token: session.session_token, p_note: note||null, p_billing_cycle: APP.billingCycle||'monthly' });
  if(error){
    errBox.textContent = error.message; btn.disabled = false; btn.textContent = '✅ Ödemeyi Yaptım, Bildir';
    if(waWin) waWin.close();
    return;
  }
  showToast('Bildirim gönderildi ✓');
  const st = APP.bankTransferStatus || {};
  const waNumber = (st.whatsapp_number || '').replace(/\D/g, '');
  if(waWin && waNumber){
    const msg = 'Merhaba, ' + (st.target_name||'') + ' için ' + money(st.amount||0) + ' tutarında havale yaptım'
      + (note ? (' (not: '+note+')') : '') + '. Kontrol edebilir misiniz?';
    waWin.location.href = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(msg);
  } else if(waWin){
    waWin.close();
  }
  loadBankTransferStatus(session);
}

/* Kullanıcılara giriş bilgilerini SMS ile gönder (tek kişi ya da herkes). Şifreler şifreli saklandığı için
   istenirse yeni geçici şifre oluşturulup mesaja eklenir (eski şifre geçersiz olur). */
function openStaffSmsModal(){
  const us = (APP.config.users || []).filter(u => !isOwnerUser(u) && u.is_active !== false).sort((a, b) => String(a.username).localeCompare(String(b.username), 'tr'));
  const canReset = canManage(getSession(), 'users_assign_roles');
  const bg = document.createElement('div'); bg.id = 'staffSmsBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:150;padding:7vh 16px 16px;overflow-y:auto;';
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  bg.innerHTML = `<div class="order-modal" style="max-width:560px;width:100%;">
    <div class="u-row-sb"><h2 class="u-m0">📱 Giriş bilgilerini SMS ile gönder</h2><span class="u-xclose" ${act('removeEl','staffSmsBg')}>✕</span></div>
    <p class="muted" style="text-align:left;font-size:13px;">Mesajda işletme kodu, kullanıcı adı ve uygulama linkleri (Android, iPhone/Web) yer alır. Telefonu girilmemiş kullanıcılara gönderilmez.</p>
    <label class="sm-all"><input type="checkbox" id="ssAll" ${actOn('change','staffSmsAll',['$checked'])}> <b>Herkesi seç</b></label>
    <div class="sm-list">${us.map(u => `<label class="sm-row ${u.phone ? '' : 'nophone'}"><input type="checkbox" class="ss-u" value="${u.id}" ${u.phone ? '' : 'disabled'}> ${avatarHtml(u.username)}<span><b>${escapeHtml(u.username)}</b><small>${u.phone ? escapeHtml(u.phone) : 'telefon yok'} · ${escapeHtml((u.role_names||[]).join(', '))}</small></span></label>`).join('') || '<p class="muted">Kullanıcı yok.</p>'}</div>
    ${canReset ? `<label class="sw-card" style="margin:12px 0 !important;"><input type="checkbox" class="sw" id="ssReset"><span><b>Yeni geçici şifre oluştur ve mesaja ekle</b><br><span class="u-fs125 muted">Şifreler güvenlik için şifreli saklanır, mevcut şifre gönderilemez. Açarsanız her kişiye yeni bir şifre üretilir; <b>eski şifresi geçersiz olur</b>.</span></span></label>` : ''}
    <div class="u-mt12 modal-sticky-actions"><button type="button" class="u-f1-m0 ghost-btn" ${act('removeEl','staffSmsBg')}>Vazgeç</button><button type="button" class="u-f1-m0" ${act('sendStaffSms')}>📨 Gönder</button></div>
  </div>`;
  document.body.appendChild(bg);
}
function staffSmsAll(on){ document.querySelectorAll('#staffSmsBg .ss-u:not(:disabled)').forEach(c => { c.checked = on; }); }
async function sendStaffSms(){
  const ids = [...document.querySelectorAll('#staffSmsBg .ss-u:checked')].map(c => c.value);
  if(!ids.length){ alert('En az bir kişi seçin'); return; }
  const reset = !!(document.getElementById('ssReset') || {}).checked;
  if(reset && !await uiConfirm(ids.length + ' kişinin şifresi yenilenecek ve yeni şifre SMS ile gönderilecek. Eski şifreleri çalışmaz. Devam edilsin mi?')) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('send_staff_login_sms', { p_token: getSession().session_token, p_user_ids: ids, p_reset_password: reset }));
  if(error){ alert(error.message); return; }
  removeEl('staffSmsBg');
  showToast('📨 ' + data.sent + ' kişiye SMS gönderildi' + ((data.skipped || []).length ? ' · telefonu olmayan: ' + data.skipped.join(', ') : ''), 7000);
}
async function addUser(){
  const session = getSession();
  const username = document.getElementById('nu_name').value.trim();
  const password = document.getElementById('nu_pass').value;
  const roleIds = selectedRoleIds('nu');
  if(!username || !password) return;
  if(roleIds.length===0){ alert('En az 1 rol seçmelisiniz'); return; }
  const { data: newId, error } = await sb.rpc('create_staff_user', { p_token: session.session_token, p_username: username, p_password: password, p_role_ids: roleIds });
  if(error){ alert(error.message); return; }
  const ph = (document.getElementById('nu_phone') || {}).value || '';
  if(newId && ph.trim()){ const { error: pe } = await sb.rpc('set_staff_phone', { p_token: session.session_token, p_user_id: newId, p_phone: ph }); if(pe) alert('Kullanıcı eklendi ama telefon kaydedilemedi: ' + pe.message); }
  const em = (document.getElementById('nu_email') || {}).value || '';
  if(newId && em.trim()){ const { error: ee } = await sb.rpc('set_staff_email', { p_token: session.session_token, p_user_id: newId, p_email: em }); if(ee) alert('Kullanıcı eklendi ama e-posta kaydedilemedi: ' + ee.message); }
  closeSheet('userSheet');
  renderSettingsView(document.getElementById('main'), session);
}
/* Kullanıcılar: satırlardaki değişiklikler tek düğmeyle kaydedilir; pasife alma /
   aktifleştirme / silme seçilen satırlara toplu uygulanır. */
function markUserDirty(e){
  if(!e.target || e.target.classList.contains('user-sel')) return;
  const tr = e.target.closest('tr[data-uid]'); if(!tr) return;
  tr.dataset.dirty = '1';
  tr.style.boxShadow = 'inset 4px 0 0 var(--accent)';
  updateUserSelection();
}
function selectedUserIds(){ return Array.from(document.querySelectorAll('.user-sel:checked')).map(b => b.value); }
function selectAllUsers(on){
  document.querySelectorAll('tr[data-uid] .user-sel').forEach(b => { if(b.closest('tr').style.display !== 'none') b.checked = on; });
  updateUserSelection();
}
function updateUserSelection(){
  const n = selectedUserIds().length, dirty = document.querySelectorAll('tr[data-uid][data-dirty]').length;
  document.querySelectorAll('[data-needs-sel]').forEach(b => { b.disabled = !n; });
  const save = document.getElementById('userSaveAllBtn');
  if(save){ save.disabled = !dirty; save.querySelector('span').textContent = dirty ? `Kaydet (${dirty})` : 'Kaydet'; }
  const info = document.getElementById('userSelInfo');
  if(info && (n || dirty)) info.innerHTML = [n ? `<b>${n}</b> kullanıcı seçili` : '', dirty ? `<b>${dirty}</b> satırda kaydedilmemiş değişiklik` : ''].filter(Boolean).join(' · ');
}
async function saveAllUsers(){
  const session = getSession();
  const exemptIds = (APP.config.roles||[]).filter(r => r.shift_exempt && !r.is_system).map(r => r.id);
  const rows = Array.from(document.querySelectorAll('tr[data-uid][data-dirty]')).map(tr => {
    const id = tr.dataset.uid, isOwner = !!tr.dataset.owner;
    const nameEl = document.getElementById('us_name_'+id), passEl = document.getElementById('us_pass_'+id);
    const roleIds = isOwner ? null : selectedRoleIds('us_'+id);
    const phEl = document.getElementById('us_phone_'+id), emEl = document.getElementById('us_email_'+id);
    return { id, isOwner, username: nameEl ? nameEl.value.trim() : '', password: passEl ? passEl.value : '', roleIds, phone: phEl && phEl.dataset.masked !== '1' && phEl.value.trim() !== (phEl.dataset.orig || '') ? phEl.value.trim() : undefined,
      email: emEl && emEl.value.trim() !== (emEl.dataset.orig || '') ? emEl.value.trim() : undefined,
      exempt: !!(roleIds && roleIds.some(r => exemptIds.includes(r))) };
  });
  if(!rows.length) return;
  const bad = rows.find(r => r.roleIds && r.roleIds.length === 0);
  if(bad){ alert((bad.username || 'Bir kullanıcı') + ': en az 1 rol seçmelisiniz'); return; }
  // Vardiyasız rol sınırına takılmamak için önce bu rolden çıkanlar kaydedilir.
  rows.sort((a, b) => Number(a.exempt) - Number(b.exempt));
  const errors = [];
  await withLoadingOverlay((async () => {
    // bulk_call kayıtları gönderilen sırayla işler, yukarıdaki sıralama korunur.
    const res = await bulkRpc('update_staff_user', rows.map(r => ({ p_user_id: r.id, p_username: r.username, p_password: r.password || null, p_role_ids: r.roleIds })));
    const ph = rows.filter((r, k) => { if(res[k].error){ errors.push((r.username || r.id) + ': ' + res[k].error.message); return false; } return r.phone !== undefined; });
    (await bulkRpc('set_staff_phone', ph.map(r => ({ p_user_id: r.id, p_phone: r.phone })))).forEach((e, k) => { if(e.error) errors.push((ph[k].username || ph[k].id) + ': ' + e.error.message); });
    const em = rows.filter(r => r.email !== undefined && !errors.some(x => x.startsWith((r.username || r.id) + ':')));
    if(em.length) (await bulkRpc('set_staff_email', em.map(r => ({ p_user_id: r.id, p_email: r.email })))).forEach((e, k) => { if(e.error) errors.push((em[k].username || em[k].id) + ': ' + e.error.message); });
  })());
  renderSettingsView(document.getElementById('main'), session);
  if(errors.length) alert('Bazı kullanıcılar kaydedilemedi:\n\n' + errors.join('\n'));
  else showToast(rows.length + ' kullanıcı kaydedildi ✓');
}
async function bulkUserActive(activate){
  const ids = selectedUserIds(); if(!ids.length) return;
  const names = ids.map(id => ((APP.config.users||[]).find(x => x.id===id) || {}).username).filter(Boolean);
  if(!activate && !await uiConfirm(names.length + ' kullanıcı pasife alınsın mı?\n\n' + names.join(', ') + '\n\nGiriş yapamazlar ve açık oturumları hemen kapanır. Kayıtları silinmez, istediğinizde tekrar aktifleştirebilirsiniz.')) return;
  const session = getSession(); const errors = [];
  await withLoadingOverlay((async () => {
    (await bulkRpc('set_staff_user_active', ids.map(id => ({ p_user_id: id, p_active: !!activate })))).forEach(r => { if(r.error) errors.push(r.error.message); });
  })());
  renderSettingsView(document.getElementById('main'), session);
  if(errors.length) alert('Bazı işlemler yapılamadı:\n\n' + errors.join('\n'));
  else showToast(activate ? ids.length + ' kullanıcı aktifleştirildi ✓' : ids.length + ' kullanıcı pasife alındı');
}
async function bulkDeleteUsers(){
  const ids = selectedUserIds(); if(!ids.length) return;
  const names = ids.map(id => ((APP.config.users||[]).find(x => x.id===id) || {}).username).filter(Boolean);
  if(!await uiConfirm(names.length + ' kullanıcı kalıcı olarak silinsin mi?\n\n' + names.join(', '))) return;
  const session = getSession(); const errors = [];
  await withLoadingOverlay((async () => {
    (await bulkRpc('delete_staff_user', ids.map(id => ({ p_user_id: id })))).forEach(r => { if(r.error) errors.push(r.error.message); });
  })());
  renderSettingsView(document.getElementById('main'), session);
  if(errors.length) alert('Bazı kullanıcılar silinemedi:\n\n' + errors.join('\n'));
  else showToast(ids.length + ' kullanıcı silindi');
}

function setListSearch(key, v){ APP.listSearch[key] = v; filterListRows(key); }
function toggleIngUsageQty(pid, on){ const q = document.getElementById('ingu_qty_' + pid); if(!q) return; q.disabled = !on; if(on) q.focus(); else q.style.borderColor = '';
  const cnt = document.getElementById('iuCount'), box = document.getElementById('ingUsageItemsBox');
  if(cnt && box) cnt.textContent = cnt.textContent.replace(/^\d+/, box.querySelectorAll('.iu-item input[type=checkbox]:checked').length); if(typeof iuRecalc === 'function') iuRecalc(); }
function filterIconPicker(targetId, current, q){ document.getElementById('iconPickerBody').innerHTML = iconPickerGridHtml(targetId, current, q); }
function setUserSearch(v){ APP.userSearch = v; filterUserRows(); }
function setActiveUsersMinutes(v){ APP.activeUsersMinutes = Number(v); loadActiveUsers(); }
function toggleResetCustom(v){ document.getElementById('resetCustom').style.display = v === 'custom' ? 'flex' : 'none'; }
function openNewRoleCard(){ openSheet('rs_new_role'); }
function setOnlineMenuTab(t){ APP.onlineMenuTab = t; drawOnlineMenuEditor(); }
function filterOmsPickList(v){ const q = String(v).toLocaleLowerCase('tr'); document.querySelectorAll('#omsPickList label').forEach(l => { l.style.display = l.textContent.toLocaleLowerCase('tr').includes(q) ? 'flex' : 'none'; }); }
function editBillingField(flag){ APP[flag] = true; renderBillingSettings(billingBox(), getSession()); }

/* ---- Destek erişimi ----
   İşletme yöneticisi Peyktan desteğine süreli izin verir; destek ekibi yalnızca izin süresince,
   en fazla 1 saatlik oturumlarla girebilir. Her giriş kaydedilir ve burada listelenir. */
async function renderSupportAccessSettings(el, session){
  el.innerHTML = '<div class="u-mwn box"><p class="muted">Yükleniyor…</p></div>';
  const { data, error } = await sb.rpc('get_support_access', { p_token: session.session_token });
  if(error){ el.innerHTML = '<div class="box"><p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p></div>'; return; }
  const until = data && data.until ? new Date(data.until) : null;
  const fmt = (d) => new Date(d).toLocaleString('tr-TR', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' });
  const log = (data && data.log) || [];
  el.innerHTML = `<div class="box" style="max-width:none;text-align:left;">
    <h2 style="margin:0 0 6px;">🛟 Peyktan Destek Erişimi</h2>
    <p class="muted" style="font-size:13px;margin:0 0 14px;">Bir sorun için Peyktan'dan yardım istediğinizde, destek ekibinin işletmenize girip sorunu görebilmesi için süreli izin verin. Şifrenizi paylaşmanız gerekmez. Destek ekibi yalnızca izin süresince ve en fazla 1 saatlik oturumlarla girebilir; her giriş aşağıda listelenir. İzni istediğiniz an kaldırabilirsiniz.</p>
    <div class="sp-hero ${until?'on':''}">
      <div class="sp-shield">${until ? '🔓' : '🔒'}</div>
      <div class="sp-info"><b>${until ? 'Destek erişimi açık' : 'Destek erişimi kapalı'}</b>
        <small>${until ? escapeHtml(fmt(until)) + ' tarihine kadar · ' + Math.max(1, Math.round((until - Date.now())/36e5)) + ' saat kaldı' : 'Destek ekibi işletmenize giremez'}</small></div>
      <div class="sp-acts">
        <button type="button" class="sp-btn" ${act('setSupportAccess', 24)}>⏱ ${until ? '24 saat uzat' : '24 saat izin ver'}</button>
        <button type="button" class="pc-btn" ${act('setSupportAccess', 2)}>Sadece 2 saat</button>
        ${until ? `<button type="button" class="pc-btn rv-del" ${act('setSupportAccess', 0)}>✕ İzni kaldır</button>` : ''}
      </div>
    </div>
    <div class="rv-day-h" style="margin:22px 0 10px;">Destek girişleri<span class="muted">${log.length} giriş</span></div>
    ${log.length ? `<div class="sp-log">${log.map((l, i) => `<div class="sp-li" style="--i:${Math.min(i,12)};">
        <span class="sp-dot"></span>${avatarHtml(l.admin || 'P')}
        <div class="cu-id"><b>${escapeHtml(l.admin || 'Peyktan Destek')}</b><small>Giriş: ${escapeHtml(fmt(l.at))}${l.until ? ' · oturum bitişi ' + escapeHtml(fmt(l.until)) : ''}</small></div>
      </div>`).join('')}</div>` : '<div class="empty-state"><div style="font-size:38px;">🛟</div><p class="muted">Henüz destek girişi olmadı.</p></div>'}
  </div>`;
}
async function setSupportAccess(hours){
  const session = getSession(); if(!session) return;
  if(!hours && !await uiConfirm('Destek erişim izni kaldırılsın mı? Açık destek oturumu varsa hemen kapanır.')) return;
  const { error } = await sb.rpc('set_support_access', { p_token: session.session_token, p_hours: hours });
  if(error){ alert(error.message); return; }
  showToast(hours ? '🛟 Destek erişimine izin verildi' : 'Destek erişim izni kaldırıldı');
  renderSupportAccessSettings(document.getElementById('securitySubContent') || document.getElementById('settingsContent'), session);
}

/* ---- Değişiklik Kaydı: ürün, fiyat, rol, kullanıcı, masa, istasyon, işletme ayarı değişiklikleri ve
   sipariş/ürün iptalleri kim tarafından ne zaman yapıldı (veritabanı tetikleyicisi yazar, bkz. audit_log). */
const AUDIT_ENTITIES = { products:'Ürün', roles:'Rol', app_users:'Kullanıcı', restaurant_tables:'Masa', stations:'İstasyon', restaurants:'İşletme Ayarı', orders:'Sipariş', order_items:'Sipariş Ürünü' };
const AUDIT_ACTIONS = { insert:'Eklendi', update:'Değiştirildi', delete:'Silindi' };
const AUDIT_FIELDS = { name:'Ad', price:'Fiyat', cost:'Maliyet', available:'Satışta', vat_rate:'KDV oranı', station_id:'İstasyon', permissions:'Yetkiler', role_ids:'Roller',
  is_active:'Aktif', password:'Şifre', username:'Kullanıcı adı', status:'Durum', zone_id:'Bölge', pos_x:'Kat planı konumu', pos_y:'Kat planı konumu', color:'Renk', icon:'Simge',
  shift_exempt:'Vardiyasız çalışma', ticket_design:'Fiş tasarımı', name_translations:'Ürün çevirileri',
  // İşletme ayarları
  sms_enabled:'SMS bildirimleri', email:'E-posta', phone:'Telefon', loyalty_enabled:'Sadakat programı', loyalty_spend_per_point:'Puan başına harcama',
  loyalty_point_value:'Puan değeri', efatura_provider:'e-Fatura entegratörü', efatura_api_key:'e-Fatura API anahtarı', efatura_enabled:'e-Fatura',
  marketplace_yemeksepeti_key:'Yemeksepeti anahtarı', marketplace_trendyol_key:'Trendyol anahtarı', marketplace_getir_key:'Getir anahtarı', marketplace_enabled:'Pazaryeri entegrasyonu',
  birthday_discount_percent:'Doğum günü indirimi (%)', tip_pool_enabled:'Bahşiş havuzu', tip_pool_mode:'Bahşiş dağıtımı', google_review_url:'Google yorum linki',
  online_ordering_enabled:'Online sipariş', accounting_provider:'Muhasebe yazılımı', accounting_api_key:'Muhasebe API anahtarı', accounting_enabled:'Muhasebe entegrasyonu',
  billing_identity_number:'Fatura TCKN/VKN', invoice_title:'Fatura ünvanı', tax_number:'Vergi numarası', tax_office:'Vergi dairesi', invoice_address:'Fatura adresi',
  shift_approval_required:'Vardiya onayı', shift_required:'Vardiya zorunluluğu', default_vat_rate:'Varsayılan KDV', billing_address:'Fatura adresi', billing_city:'Fatura şehri',
  support_access_until:'Destek erişimi', reports_password_hash:'Rapor şifresi', package_id:'Paket', expires_at:'Abonelik bitişi', max_users:'Kullanıcı limiti', code:'İşletme kodu' };
const AUDIT_STATUS = { open:'Açık', cancelled:'İptal', closed:'Kapandı', paid:'Ödendi' };
// Kimlik (uuid) değerlerini işletmedeki adına çevirir; bulunamazsa kısa gösterir.
function auditRefName(k, v){
  const c = APP.config || {};
  const find = (list) => ((list || []).find(x => x.id === v) || {}).name;
  if(k === 'station_id') return find(c.stations);
  if(k === 'zone_id') return find(c.zones);
  if(k === 'role_ids') return null;
  return null;
}
function auditVal(k, v){
  if(v == null || v === '') return '—';
  if(typeof v === 'boolean') return v ? 'Açık' : 'Kapalı';
  if(k === 'status') return AUDIT_STATUS[v] || String(v);
  if(k === 'price' || k === 'cost') return money(Number(v));
  if(k === 'vat_rate' || k === 'default_vat_rate' || k === 'birthday_discount_percent') return '%' + v;
  if(k === 'expires_at' && !v) return 'Süresiz';
  if(k === 'support_access_until' || k === 'expires_at') return new Date(v).toLocaleString('tr-TR', { dateStyle:'short', timeStyle:'short' });
  if(k === 'role_ids' && Array.isArray(v)) return v.map(id => ((APP.config && APP.config.roles || []).find(r => r.id === id) || {}).name || 'silinmiş rol').join(', ') || '—';
  if(Array.isArray(v)) return v.length + ' öğe';
  if(typeof v === 'object') return 'güncellendi';
  return auditRefName(k, v) || String(v);
}
// Yetki listelerinde eklenen/çıkarılan yetkiler gösterilir.
function auditArrayDiff(o, n){
  const a = new Set(o || []), b = new Set(n || []);
  const label = (id) => (((APP.config && APP.config.role_permissions) || []).find(p => p.id === id) || {}).label || id;
  const add = [...b].filter(x => !a.has(x)).map(label), rem = [...a].filter(x => !b.has(x)).map(label);
  return [add.length ? '<b style="color:var(--green);">+ ' + escapeHtml(add.join(', ')) + '</b>' : '', rem.length ? '<b class="u-red">− ' + escapeHtml(rem.join(', ')) + '</b>' : ''].filter(Boolean).join(' ') || 'sıra değişti';
}
async function renderAuditLogSettings(el, session){
  el.innerHTML = '<div class="u-mwn box"><p class="muted">Yükleniyor…</p></div>';
  const ent = APP.auditEntity || '';
  const { data, error } = await sb.rpc('list_audit_log', { p_token: session.session_token, p_entity: ent || null, p_before: null });
  if(error){ el.innerHTML = '<div class="box"><p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p></div>'; return; }
  const rows = data || [];
  el.innerHTML = `<div class="box" style="max-width:none;text-align:left;">
    <h2 style="margin:0 0 6px;">📜 Değişiklik Kaydı</h2>
    <p class="muted" style="margin:0 0 12px;font-size:13px;">Ürün, fiyat, rol, kullanıcı, masa ve işletme ayarlarındaki değişiklikler ile sipariş iptalleri; kim yaptı, ne zaman yaptı. Son 200 kayıt.</p>
    <select style="width:auto;margin:0 0 12px;" ${actOn('change','setAuditEntity',['$value'])}>
      <option value="">Tümü</option>${Object.keys(AUDIT_ENTITIES).map(k => `<option value="${k}" ${ent===k?'selected':''}>${AUDIT_ENTITIES[k]}</option>`).join('')}
    </select>
    ${auditTableHtml(rows)}</div>`;
}
function setAuditEntity(v){ APP.auditEntity = v; renderAuditLogSettings(document.getElementById('securitySubContent') || document.getElementById('settingsContent'), getSession()); }
// Değişiklik kaydı tablosu (işletme Ayarlar sekmesi ve platform admin paneli ortak kullanır).
function auditTableHtml(rows){
  const changes = (c) => {
    if(!c) return '';
    const keys = Object.keys(c).filter(k => !(k === 'pos_y' && c.pos_x)); // konum tek satır
    return keys.map(k => {
      const x = c[k]; const f = escapeHtml(AUDIT_FIELDS[k] || k.replace(/_/g, ' '));
      if(x.masked) return `${f} değiştirildi`;
      if(k === 'pos_x' || k === 'pos_y') return `${f} değişti`;
      if(k === 'permissions') return `${f}: ${auditArrayDiff(x.old, x.new)}`;
      return `${f}: <s class="muted">${escapeHtml(auditVal(k, x.old))}</s> → <b>${escapeHtml(auditVal(k, x.new))}</b>`;
    }).join('<br>');
  };
  return `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Tarih</th><th>Kişi</th><th>Kayıt</th><th>İşlem</th><th>Değişiklik</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td class="u-nw">${new Date(r.created_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}</td>
      <td>${escapeHtml(r.user_name || 'Sistem')}${r.is_support ? ' <span style="color:var(--amber, #f59e0b);font-size:11px;">🛟 Destek</span>' : ''}</td>
      <td>${escapeHtml(AUDIT_ENTITIES[r.entity] || r.entity)}${r.label ? '<div class="u-fs12 muted">' + escapeHtml(r.label) + '</div>' : ''}</td>
      <td>${r.entity==='orders' && r.action==='update' ? 'İptal edildi' : (AUDIT_ACTIONS[r.action] || r.action)}</td>
      <td class="u-fs125">${changes(r.changes)}</td></tr>`).join('') || '<tr><td colspan="5" class="u-tc muted">Henüz kayıt yok.</td></tr>'}
    </tbody></table></div>`;
}
