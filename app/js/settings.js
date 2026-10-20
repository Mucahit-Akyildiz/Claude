/* Ayarlar bölümü - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= AYARLAR ================= */
/* Her sekme ilgili settings_* iznini gerektirir; Roller sekmesi ise
   sadece Yönetici'ye (is_manager) açık - bir role bu yetkiyi vermek
   mümkün değil (bkz. manager_upsert_role'un izin backend'i). */
const SETTINGS_TABS = [
  { tab:'stations', perm:'settings_stations', label:'Menüler & İstasyonlar', ico:'🍳', desc:'Menüler, mutfak istasyonları' },
  { tab:'zones', perm:'settings_zones', label:'Bölgeler & Masalar', ico:'🪑', desc:'Salon, masa planı' },
  { tab:'products', label:'Ürünler & Hammaddeler', ico:'🍔', desc:'Fiyat, reçete, stok' }, // alt sekmeler: Ürünler, Hammaddeler
  { tab:'flags', perm:'settings_flags', label:'Sipariş Etiketleri', ico:'🏷️', desc:'Sipariş notu etiketleri' },
  { tab:'users', label:'Kullanıcılar & Vardiyalar', ico:'👥', desc:'Personel, vardiya' }, // alt sekmeler: Kullanıcılar, Aktif, Vardiyalar
  { tab:'roles', perm:'settings_roles', label:'Roller', ico:'🔑', desc:'Yetkiler' },
  { tab:'integrations', perm:'settings_integrations', label:'Entegrasyonlar', ico:'🔌', desc:'Platformlar, yazıcılar' },
  { tab:'billing', label:'Abonelik, Hediye Kartı & Kampanya', ico:'💳', desc:'Plan, fatura, kartlar, kuponlar' }, // alt sekmeler
  { tab:'security', label:'Güvenlik', ico:'🛡️', desc:'Destek, kayıt, sıfırlama' }, // alt sekmeler: Destek Erişimi, Değişiklik Kaydı, Veri Sıfırlama
];
function settingsTabVisible(t, session){
  if(t.feature && !hasFeature(t.feature)) return false;
  if(t.tab==='users') return canManage(session, 'settings_users') || canManage(session, 'shifts');
  if(t.tab==='products') return canManage(session, 'settings_products') || canManage(session, 'settings_ingredients');
  if(t.tab==='security') return canManage(session, 'settings_support') || canManage(session, 'settings_audit') || canManage(session, 'settings_datareset');
  if(t.tab==='billing') return canManage(session, 'settings_billing') || canManage(session, 'giftcards') || hasPerm(session, 'payments') || canManage(session, 'crm');
  return t.managerOnly ? !!session.isManager : canManage(session, t.perm);
}
async function renderSettingsView(main, session){
  const { data, error } = await sb.rpc('get_restaurant_config', { p_token: session.session_token });
  if(error){ main.innerHTML = '<h1>Ayarlar</h1><p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  APP.config = data;
  // Eski sekme adları (bildirimden/kayıtlı ekrandan gelebilir) yeni sekme + alt sekmeye çevrilir.
  const LEGACY_TABS = { shifts:['users','usersSubTab','shifts'], ingredients:['products','productsSubTab','ingredients'], floorplan:['zones','zonesSubTab','floorplan'],
    giftcards:['billing','billingSubTab','giftcards'], promos:['billing','billingSubTab','promos'], datareset:['security','securitySubTab','datareset'], support:['security','securitySubTab','support'], audit:['security','securitySubTab','audit'] };
  const lg = LEGACY_TABS[APP.settingsTab]; if(lg){ APP.settingsTab = lg[0]; APP[lg[1]] = lg[2]; }
  const visibleTabs = SETTINGS_TABS.filter(t => settingsTabVisible(t, session));
  if(!visibleTabs.some(t => t.tab===APP.settingsTab)) APP.settingsTab = visibleTabs.length ? visibleTabs[0].tab : null;
  main.innerHTML = `<h1>Ayarlar</h1>
    <div class="set-layout">
      <nav class="tabs settings-tabs set-nav">
        ${visibleTabs.map((t, i) => `<div class="tab set-item ${APP.settingsTab===t.tab?'active':''}" data-tab="${t.tab}" style="--i:${i};--sc:var(--c${i%4+1});" ${act('setSettingsTab', t.tab)}><span class="set-ico">${t.ico||'⚙️'}</span><span class="set-txt"><b>${t.label}</b><small>${t.desc||''}</small></span></div>`).join('')}
      </nav>
      <div id="settingsContent" class="set-content"></div>
    </div>`;
  applyNavBadges();
  renderSettingsContent(session);
}
function setSettingsTab(tab){
  if(tab !== APP.settingsTab) pushScreen();
  setTimeout(applyNavBadges, 0);
  APP.settingsTab = tab;
  document.querySelectorAll('.tabs .tab[data-tab]').forEach(el => el.classList.toggle('active', el.dataset.tab===tab));
  renderSettingsContent(getSession());
}
/* Ürünler/Hammaddeler listelerinde ada göre anlık arama (satırdaki ilk kutu = ad).
   Eşleşen satırı kalmayan istasyon grupları da gizlenir. Yazılan arama yenilemede korunur. */
function listSearchHtml(key, ph){
  APP.listSearch = APP.listSearch || {};
  setTimeout(() => filterListRows(key), 0);
  return `<input class="list-search" placeholder="🔍 ${escapeAttr(ph)}" value="${escapeAttr(APP.listSearch[key]||'')}" ${actOn('input','setListSearch',[key,'$value'])} style="max-width:320px;margin:0 0 12px;">`;
}
function filterListRows(key){
  const box = document.querySelector('#settingsContent .box'); if(!box) return;
  const q = String((APP.listSearch||{})[key]||'').trim().toLocaleLowerCase('tr');
  box.querySelectorAll('.settings-table tbody tr').forEach(tr => {
    if(tr.classList.contains('prod-cat-row')){ tr.style.display = q ? 'none' : ''; return; }
    const inp = tr.querySelector('input:not([type=checkbox])'); const name = (inp ? inp.value : tr.textContent).toLocaleLowerCase('tr');
    tr.style.display = !q || name.includes(q) ? '' : 'none';
  });
  box.querySelectorAll('.pcard').forEach(c => { c.style.display = !q || (c.dataset.name||'').includes(q) ? '' : 'none'; });
  box.querySelectorAll('.pcard-grid').forEach(g => { const d = g.closest('.prod-grp'); if(d) d.style.display = !q || [...g.children].some(c => c.style.display !== 'none') ? '' : 'none'; });
  box.querySelectorAll('.settings-table').forEach(t => {
    const grp = t.closest('.settings-table-wrap'); const wrap = grp && grp.parentElement !== box ? grp.parentElement : grp;
    if(!wrap) return;
    const any = [...t.querySelectorAll('tbody tr')].some(tr => tr.style.display !== 'none');
    wrap.style.display = any || !q ? '' : 'none';
  });
}
function renderSettingsContent(session){
  const el = document.getElementById('settingsContent'); if(!el) return;
  if(!APP.settingsTab){ el.innerHTML = '<p class="muted">Görüntüleme yetkiniz olan bir ayar bölümü yok.</p>'; return; }
  if(APP.settingsTab==='stations') renderStationsSettings(el, session);
  else if(APP.settingsTab==='zones') renderZonesTabWithSubtabs(el, session);
  else if(APP.settingsTab==='products') renderProductsTabWithSubtabs(el, session);
  else if(APP.settingsTab==='flags') renderOrderFlagsSettings(el, session);
  else if(APP.settingsTab==='roles') renderRolesSettings(el, session);
  else if(APP.settingsTab==='integrations') renderIntegrationsSettings(el, session);
  else if(APP.settingsTab==='billing') renderBillingTabWithSubtabs(el, session);
  else if(APP.settingsTab==='security') renderSecuritySettings(el, session);
  else renderUsersTabWithSubtabs(el, session);
}
/* Kullanıcılar sekmesi alt sekmeli: Kullanıcılar | Aktif Kullanıcılar | Vardiyalar (yetkiye göre). */
function renderUsersTabWithSubtabs(el, session){
  const tabs = [
    canManage(session, 'settings_users') ? { id:'list', ic:'👥', label:'Kullanıcılar' } : null,
    canManage(session, 'settings_users') ? { id:'active', ic:'🟢', label:'Aktif Kullanıcılar' } : null,
    hasPerm(session, 'shifts') || canManage(session, 'shifts') ? { id:'shifts', ic:'⏱️', label:'Vardiyalar' } : null,
  ].filter(Boolean);
  if(!tabs.length){ el.innerHTML = ''; return; }
  if(!tabs.some(t => t.id === APP.usersSubTab)) APP.usersSubTab = tabs[0].id;
  const sub = APP.usersSubTab;
  const draw = (box) => sub==='active' ? renderActiveUsersSettings(box) : sub==='shifts' ? renderShiftsSettings(box, session) : renderUsersSettings(box, session);
  if(tabs.length === 1){ el.innerHTML = '<div id="usersSubContent"></div>'; draw(document.getElementById('usersSubContent')); return; }
  // Alt sekmeler kartın içinde, üst menüden ayrışan altı çizili stilde.
  el.innerHTML = `<div class="box sub-tabs-box" style="max-width:none;">
      <div class="sub-tabs" id="usersSubTabs">${tabs.map(t => `<div role="tab" tabindex="0" class="sub-tab ${sub===t.id?'active':''}" data-sub="${t.id}" ${act('setUsersSubTab', t.id)}><span class="sub-tab-ic">${t.ic}</span>${t.label}</div>`).join('')}</div>
      <div id="usersSubContent" class="sub-tabs-content"></div>
    </div>`;
  draw(document.getElementById('usersSubContent'));
}
/* Güvenlik sekmesi iki alt sekmeli: Destek Erişimi | Değişiklik Kaydı (yetkiye göre). */
function renderSecuritySettings(el, session){
  const tabs = [
    canManage(session, 'settings_support') ? { id:'support', ic:'🛟', label:'Destek Erişimi' } : null,
    canManage(session, 'settings_audit') ? { id:'audit', ic:'📜', label:'Değişiklik Kaydı' } : null,
    canManage(session, 'settings_datareset') ? { id:'datareset', ic:'🗑️', label:'Veri Sıfırlama' } : null,
  ].filter(Boolean);
  if(!tabs.length){ el.innerHTML = ''; return; }
  if(!tabs.some(t => t.id === APP.securitySubTab)) APP.securitySubTab = tabs[0].id;
  el.innerHTML = `<div class="box sub-tabs-box" style="max-width:none;">
      ${tabs.length > 1 ? `<div class="sub-tabs">${tabs.map(t => `<div role="tab" tabindex="0" class="sub-tab ${APP.securitySubTab===t.id?'active':''}" ${act('setSecuritySubTab', t.id)}><span class="sub-tab-ic">${t.ic}</span>${t.label}</div>`).join('')}</div>` : ''}
      <div id="securitySubContent" class="sub-tabs-content"></div>
    </div>`;
  const box = document.getElementById('securitySubContent');
  if(APP.securitySubTab === 'audit') renderAuditLogSettings(box, session);
  else if(APP.securitySubTab === 'datareset') renderDataResetSettings(box);
  else renderSupportAccessSettings(box, session);
}
function setSecuritySubTab(t){
  if(t !== APP.securitySubTab) pushScreen();
  APP.securitySubTab = t;
  const el = document.getElementById('settingsContent');
  if(el) renderSecuritySettings(el, getSession());
}
function setUsersSubTab(t){
  if(t !== (APP.usersSubTab||'list')) pushScreen();
  APP.usersSubTab = t;
  const el = document.getElementById('settingsContent');
  if(el) renderUsersTabWithSubtabs(el, getSession());
}

/* --- Sipariş Etiketleri (Personel Yemeği, İkram vb. checkbox'lar) --- */
function renderOrderFlagsSettings(el, session){
  const flags = APP.config.order_flags || [];
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Sipariş Etiketleri</h2>
    <p class="muted" style="text-align:left;margin:0 0 16px;">Sipariş al ekranında, siparişi mutfağa göndermeden önce işaretlenebilecek checkbox'lar (örn. "Personel Yemeği", "İkram"). İşaretlenen siparişlerde stok yine düşer, ama Finansal Analiz'deki ciro/net kârdan hariç tutulup ayrı bir toplam olarak gösterilir. İstediğiniz kadar etiket ekleyebilirsiniz.</p>
    <div class="fl-grid">
      ${flags.map((f, i) => `<div class="fl-card" style="--sc:var(--c${i%4+1});--i:${Math.min(i,12)};">
        <span class="fl-ic">🏷️</span>
        <input class="fl-name" value="${escapeAttr(f.label)}" id="flag_label_${f.id}" title="Adı değiştirip Enter'a basın" ${actOn('keydown','onEnterCall',['$event','saveOrderFlag', f.id])}>
        <button type="button" class="ico-btn" title="Kaydet" ${act('saveOrderFlag', f.id)}>💾</button>
        <button type="button" class="ico-btn danger" title="Sil" ${act('removeOrderFlag', f.id)}>🗑</button>
      </div>`).join('')}
      <div class="fl-card fl-new">
        <span class="fl-ic">＋</span>
        <input class="fl-name" id="nf_label" placeholder="Yeni etiket (örn. Personel Yemeği)" ${actOn('keydown','onEnterCall',['$event','addOrderFlag'])}>
        <button type="button" class="fl-add" ${act('addOrderFlag')}>Ekle</button>
      </div>
    </div>
    ${flags.length ? `<div class="fl-prev"><small>👀 Sipariş ekranında böyle görünür</small>
      <div>${flags.map((f, i) => `<span class="fl-chip" style="--sc:var(--c${i%4+1});"><i>${i===0?'✓':''}</i>${escapeHtml(f.label)}</span>`).join('')}</div></div>` : ''}
  </div>`;
}
async function saveOrderFlag(id){
  const session = getSession();
  const label = document.getElementById('flag_label_'+id).value.trim();
  if(!label) return;
  const { error } = await sb.rpc('rename_order_flag', { p_token: session.session_token, p_flag_id: id, p_label: label });
  if(error){ alert(error.message); return; }
  await renderSettingsView(document.getElementById('main'), session);
  showToast('Kaydedildi ✓');
}
async function addOrderFlag(){
  const session = getSession();
  const label = document.getElementById('nf_label').value.trim();
  if(!label) return;
  const { error } = await sb.rpc('create_order_flag', { p_token: session.session_token, p_label: label });
  if(error){ alert(error.message); return; }
  await renderSettingsView(document.getElementById('main'), session);
}
async function removeOrderFlag(id){
  if(!await uiConfirm('Bu etiket silinsin mi?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_order_flag', { p_token: session.session_token, p_flag_id: id });
  if(error){ alert(error.message); return; }
  await renderSettingsView(document.getElementById('main'), session);
}

/* --- Hammaddeler (reçete tabanlı stok) --- */
function renderIngredientsSettings(el, session){
  const ings = APP.config.ingredients || [];
  const useCount = (id) => (APP.config.products||[]).filter(p => (p.recipe||[]).some(r => r.ingredient_id === id)).length;
  const maxStock = Math.max(1, ...ings.map(i => Number(i.stock)||0));
  const f = APP.ingFilter || 'all';
  const isLow = (i) => Number(i.min_stock) > 0 && Number(i.stock) <= Number(i.min_stock);
  const shownIngs = f==='low' ? ings.filter(isLow) : f==='out' ? ings.filter(i => Number(i.stock)<=0) : f==='idle' ? ings.filter(i => !useCount(i.id)) : f==='waste' ? ings.filter(i => Number(i.waste_pct)>0) : ings;
  const chip = (k, ic, v, l, c) => `<div class="os-chip os-click ${f===k?'on':''}" role="button" title="Listeyi filtrele" style="--oc:${c};" ${act('setIngFilter', k)}><span class="os-ic">${ic}</span><div><b>${v}</b><small>${l}</small></div></div>`;
  el.innerHTML = `<div class="order-summary stat-chips" style="--n:5;">${chip('all','🥕', ings.length, 'Hammadde', 'var(--c1)')}${chip('low','📉', ings.filter(isLow).length, 'Kritik stok', 'var(--c3)')}${chip('out','⛔', ings.filter(i => Number(i.stock)<=0).length, 'Stoğu biten', 'var(--danger,#ef4444)')}${chip('idle','💤', ings.filter(i => !useCount(i.id)).length, 'Reçetede kullanılmayan', 'var(--c3)')}${chip('waste','✂️', ings.filter(i => Number(i.waste_pct)>0).length, 'Fire tanımlı', 'var(--c2)')}</div>
  <div class="box" style="max-width:none;">
    <div class="fsheet-bar" style="margin:0 0 12px;"><h2 style="margin:0;">Hammaddeler / Stok Kalemleri</h2>${sheetBtnHtml('ingSheet','+ Yeni Hammadde')}</div>
    <details class="prod-info"><summary>ℹ️ Nasıl çalışır</summary><p class="muted" style="text-align:left;margin:0 0 12px;">Örn: "Köfte" (birim: adet, stok: 200), "Döner Eti" (birim: kg, stok: 20). Yeni bir hammadde eklediğinizde hangi ürünlerin onu kullandığını hemen soracağız — istediğiniz zaman "Kullanıldığı Ürünler" ile bunu tekrar düzenleyebilirsiniz. Aynı hammaddeyi paylaşan ürünlerin stoğu her zaman ortak ve anlık hesaplanır. <b>Min</b>: stok bu seviyeye inince Satınalma Siparişleri menüsünde uyarı çıkar ve tek tıkla sipariş taslağı hazırlanır. <b>Fire %</b>: temizleme/kesim kaybıdır; reçeteye net miktarı girersiniz, stoktan fire eklenerek düşülür (örn. %10 fire, 60 g net → 66,7 g düşer). Kartları değiştirip <b>Kaydet</b>'e basın; silmek için kartları seçin.</p></details>
    <div class="add-row-panel">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 10px;">
        ${listSearchHtml('ingredients', 'Hammadde ara…').replace('margin:0 0 12px;','margin:0;')}
        <span style="flex:1;"></span>
        <div class="act-row">
          <button type="button" class="act-btn act-save" id="ingSaveAllBtn" ${act('saveAllIngredients')} disabled>${ICON_SAVE}<span>Kaydet</span></button>
          <button type="button" class="act-btn act-delete" data-ing-sel ${act('bulkDeleteIngredients')} disabled>${ICON_TRASH}<span>Sil</span></button>
        </div>
      </div>
      <p class="muted" id="ingSelInfo" style="text-align:left;font-size:12.5px;margin:-4px 0 8px;text-transform:none;letter-spacing:0;font-weight:400;"></p>
    </div>
    ${sheetHtml('ingSheet', '🥕', 'Yeni Hammadde', `
      <div class="fsheet-grid">
        <div class="field-group wide"><label>Hammadde Adı</label><input id="ni_name" placeholder="örn. Döner Eti"></div>
        <div class="field-group"><label>Birim</label><select id="ni_unit"><option value="adet">adet</option><option value="gram">gram</option><option value="kg">kg</option><option value="ml">ml</option><option value="lt">lt</option></select></div>
        <div class="field-group"><label>Başlangıç Stoku</label><input type="number" step="0.01" id="ni_stock" placeholder="0"></div>
        <div class="field-group"><label>Fire %</label><input type="number" step="0.1" min="0" max="99" id="ni_waste" placeholder="0"></div>
      </div>
      <p class="muted" style="font-size:12px;text-align:left;margin:10px 0 0;">Ekledikten sonra hangi ürünlerin bu hammaddeyi kullandığını soracağız.</p>
      <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','ingSheet')}>Vazgeç</button><button ${act('addIngredient')}>+ Hammadde Ekle</button></div>`, 'var(--c3)')}
    <div style="display:flex;align-items:center;gap:8px;margin:4px 0 10px;"><label style="display:flex;align-items:center;gap:6px;margin:0;font-size:13px;font-weight:600;"><input type="checkbox" style="width:auto;margin:0;" ${actOn('change','selectAllIngredients',['$checked'])}> Tümünü seç</label></div>
    <div class="ig-grid" ${actOn('input','markIngDirty',['$event'])} ${actOn('change','markIngDirty',['$event'])}>
      ${shownIngs.map((i, k) => { const st = Number(i.stock)||0, out = st <= 0, uses = useCount(i.id), pct = Math.max(4, Math.min(100, st / maxStock * 100));
        return `<div class="pcard ig-card ${out?'ig-out':''}" data-iid="${i.id}" data-name="${escapeAttr(String(i.name||'').toLocaleLowerCase('tr'))}" style="--i:${Math.min(k,12)};">
        <div class="pcard-top"><input type="checkbox" class="ing-sel" value="${i.id}" ${actOn('change','updateIngSelection',[])}>
          <input class="ig-name" value="${escapeAttr(i.name)}" id="ing_name_${i.id}">
          <span class="ig-st ${out?'out':isLow(i)?'low':uses?'ok':'idle'}">${out ? '● Bitti' : isLow(i) ? '● Kritik' : uses ? '● Kullanımda' : '○ Kullanılmıyor'}</span></div>
        <div class="ig-stock"><input type="number" step="0.01" value="${i.stock}" id="ing_stock_${i.id}" class="ig-qty">
          <select id="ing_unit_${i.id}" class="ig-unit">${['adet','gram','kg','ml','lt'].map(u => `<option value="${u}" ${u===i.unit?'selected':''}>${u}</option>`).join('')}</select></div>
        <div class="pcard-mbar"><i style="width:${out?0:pct}%;background:${out?'var(--danger,#ef4444)':isLow(i)||pct<15?'var(--c3)':'var(--ok,#22c55e)'};"></i></div>
        <div class="ig-foot">
          <label class="ig-waste" title="Temizleme/kesim kaybı">Fire % <input type="number" step="0.1" min="0" max="99" value="${Number(i.waste_pct)||0}" id="ing_waste_${i.id}"></label>
          <label class="ig-waste" title="Stok bu seviyeye inince uyarı verilir (boş = uyarı yok)">Min <input type="number" step="0.01" min="0" value="${Number(i.min_stock)||''}" placeholder="—" id="ing_min_${i.id}"></label>
          <button type="button" class="pc-btn" ${act('openIngredientUsageModal', i.id)}>🍽️ ${uses} ürün</button>
        </div>
      </div>`; }).join('') || '<div class="empty-state" style="grid-column:1/-1;"><div style="font-size:38px;">🥕</div><p class="muted">Bu filtrede hammadde yok.</p></div>'}
    </div>
  </div>`;
}
/* Hammaddeler: değişen satırlar tek düğmeyle kaydedilir; silme seçilen satırlara toplu uygulanır. */
function markIngDirty(e){
  if(!e.target || e.target.type==='checkbox') return;
  const tr = e.target.closest('[data-iid]'); if(!tr) return;
  tr.dataset.dirty = '1'; tr.classList.add('is-dirty');
  updateIngSelection();
}
function setIngFilter(k){ APP.ingFilter = APP.ingFilter===k ? 'all' : k; renderSettingsContent(getSession()); }
function selectedIngredientIds(){ return [...document.querySelectorAll('.ing-sel:checked')].map(b => b.value); }
function selectAllIngredients(on){
  document.querySelectorAll('[data-iid]').forEach(tr => { const c = tr.querySelector('.ing-sel'); if(c && tr.style.display!=='none') c.checked = on; });
  updateIngSelection();
}
function updateIngSelection(){
  const n = selectedIngredientIds().length, dirty = document.querySelectorAll('[data-iid][data-dirty]').length;
  document.querySelectorAll('[data-ing-sel]').forEach(b => { b.disabled = !n; });
  const save = document.getElementById('ingSaveAllBtn');
  if(save){ save.disabled = !dirty; save.querySelector('span').textContent = dirty ? `Kaydet (${dirty})` : 'Kaydet'; }
  const info = document.getElementById('ingSelInfo');
  if(info) info.innerHTML = [n ? `<b>${n}</b> hammadde seçili` : '', dirty ? `<b>${dirty}</b> satırda kaydedilmemiş değişiklik` : ''].filter(Boolean).join(' · ');
}
async function saveAllIngredients(){
  const rows = [...document.querySelectorAll('[data-iid][data-dirty]')].map(tr => {
    const id = tr.dataset.iid;
    return { id, name: document.getElementById('ing_name_'+id).value.trim(), unit: document.getElementById('ing_unit_'+id).value,
      stock: parseFloat(document.getElementById('ing_stock_'+id).value)||0, waste: parseFloat(document.getElementById('ing_waste_'+id).value)||0,
      min: parseFloat(document.getElementById('ing_min_'+id).value)||0 };
  });
  if(!rows.length) return;
  if(rows.some(r => !r.name)){ alert('Hammadde adı boş olamaz'); return; }
  const session = getSession(); const errors = [];
  await withLoadingOverlay((async () => {
    for(const r of rows){ const { error } = await sb.rpc('upsert_ingredient', { p_token: session.session_token, p_id: r.id, p_name: r.name, p_unit: r.unit, p_stock: r.stock, p_waste_pct: r.waste }); if(error){ errors.push(r.name + ': ' + error.message); continue; }
      const { error: e2 } = await sb.rpc('set_ingredient_min', { p_token: session.session_token, p_id: r.id, p_min: r.min }); if(e2) errors.push(r.name + ': ' + e2.message); }
  })());
  renderSettingsView(document.getElementById('main'), session);
  if(errors.length) alert('Bazı hammaddeler kaydedilemedi:\n\n' + errors.join('\n')); else showToast(rows.length + ' hammadde kaydedildi ✓');
}
async function bulkDeleteIngredients(){
  const ids = selectedIngredientIds(); if(!ids.length) return;
  const list = ids.map(id => (APP.config.ingredients||[]).find(x => x.id===id)).filter(Boolean);
  if(!await uiConfirm(list.length + ' hammadde silinsin mi? Bunlara bağlı reçeteler de silinir.\n\n' + list.map(i => i.name).join(', '))) return;
  const session = getSession(); const errors = [];
  await withLoadingOverlay((async () => {
    for(const i of list){ const { error } = await sb.rpc('delete_ingredient', { p_token: session.session_token, p_id: i.id }); if(error) errors.push(i.name + ': ' + friendlyDeleteError(error.message)); }
  })());
  renderSettingsView(document.getElementById('main'), session);
  if(errors.length) alert('Bazı hammaddeler silinemedi:\n\n' + errors.join('\n')); else showToast(list.length + ' hammadde silindi');
}
async function addIngredient(){
  const session = getSession();
  const name = document.getElementById('ni_name').value.trim();
  const unit = document.getElementById('ni_unit').value;
  const stock = parseFloat(document.getElementById('ni_stock').value)||0;
  const waste = parseFloat(document.getElementById('ni_waste').value)||0;
  if(!name){ alert('Hammadde adı gerekli'); return; }
  const { data, error } = await sb.rpc('upsert_ingredient', { p_token: session.session_token, p_id: null, p_name: name, p_unit: unit, p_stock: stock, p_waste_pct: waste });
  if(error){ alert(error.message); return; }
  closeSheet('ingSheet');
  await renderSettingsView(document.getElementById('main'), session);
  // Hammadde eklenir eklenmez, hangi urunlerin kullandigini sormaya devam et.
  if(data) openIngredientUsageModal(data);
}

/* --- Bir hammaddeyi hangi urunlerin kullandigini duzenleme penceresi
   (hammadde tarafindan bakis - ekledigimiz/duzenledigimiz hammaddeyi
   birden fazla urune tek seferde atayabilmek icin) --- */
function openIngredientUsageModal(ingredientId){
  const ingredient = (APP.config.ingredients||[]).find(x => x.id===ingredientId);
  const ingredientName = ingredient ? ingredient.name : '';
  const unit = ingredient && ingredient.unit ? ingredient.unit : '';
  const products = APP.config.products || [];
  const bg = document.createElement('div');
  bg.id = 'ingUsageModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:480px;width:100%;max-height:88vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">${escapeHtml(ingredientName)} - Kullanıldığı Ürünler</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','ingUsageModalBg')}>✕</span></div>
    <p class="muted" style="text-align:left;">Bu hammaddeyi hangi ürünler kullanıyor, 1 porsiyonda net ne kadar tüketiliyor${unit?' ('+escapeHtml(unit)+')':''}?${ingredient && Number(ingredient.waste_pct)>0 ? ' Stoktan %'+Number(ingredient.waste_pct)+' fire eklenerek düşülür.' : ''} Seçmediğiniz ürünlerden bu hammadde kaldırılır (o ürünlerin diğer hammaddeleri etkilenmez).</p>
    <div id="ingUsageItemsBox"></div>
    <button style="margin-top:14px;" ${act('saveIngredientUsage', ingredientId)}>${ICON_SAVE}<span>Kaydet</span></button>
  </div>`;
  document.body.appendChild(bg);
  const box = document.getElementById('ingUsageItemsBox');
  box.innerHTML = products.length===0 ? '<p class="muted">Henüz ürün eklenmemiş.</p>' : products.map(p => {
    const existing = (p.recipe||[]).find(r => r.ingredient_id===ingredientId);
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <input type="checkbox" id="ingu_chk_${p.id}" ${existing?'checked':''} ${actOn('change','toggleIngUsageQty',[p.id,'$checked'])} style="width:auto;margin:0;">
      <span style="flex:1;">${escapeHtml(p.name)}</span>
      <input type="number" step="0.01" min="0" id="ingu_qty_${p.id}" value="${existing?existing.qty_per_unit:''}" placeholder="Miktar/porsiyon" ${existing?'':'disabled'} style="width:110px;margin:0;">
      <span class="muted" style="min-width:36px;">${escapeHtml(unit)}</span>
    </div>`;
  }).join('');
}
async function saveIngredientUsage(ingredientId){
  const session = getSession();
  const products = APP.config.products || [];
  const usages = [];
  const missing = [];
  products.forEach(p => {
    const chk = document.getElementById('ingu_chk_'+p.id);
    if(chk && chk.checked){
      const inp = document.getElementById('ingu_qty_'+p.id);
      const qty = parseFloat(inp.value);
      inp.style.borderColor = '';
      if(qty && qty>0) usages.push({ product_id: p.id, qty_per_unit: qty });
      else { missing.push(p.name); inp.style.borderColor = 'var(--red)'; }
    }
  });
  // İşaretli ürünün miktarı boşsa kaydetme (eskiden sessizce atlanıyordu).
  if(missing.length){
    alert('Miktar giriniz: ' + missing.join(', ') + '\n\nİşaretlediğiniz ürünler için 1 porsiyonda kullanılan miktarı girin ya da işareti kaldırın.');
    const first = products.find(p => missing.includes(p.name));
    if(first) document.getElementById('ingu_qty_'+first.id).focus();
    return;
  }
  const { error } = await sb.rpc('set_ingredient_usage', { p_token: session.session_token, p_ingredient_id: ingredientId, p_usages: usages });
  if(error){ alert(error.message); return; }
  document.getElementById('ingUsageModalBg').remove();
  showToast('Kaydedildi ✓');
  renderSettingsView(document.getElementById('main'), session);
}

/* --- Bir ürünün reçetesini düzenleme penceresi --- */
let RECIPE_DRAFT = [];
/* Ürün ekstraları: ana ürüne bağlı, siparişte ayrı kalem olarak eklenen seçenekler
   (örn. Porsiyon Döner → Ek Döner +150 ₺). Ana ürünün istasyonuna ve fişine düşer. */
function openExtrasModal(productId){
  const prod = (APP.config.products || []).find(p => p.id === productId); if(!prod) return;
  document.getElementById('extrasModalBg')?.remove();
  const bg = document.createElement('div'); bg.id = 'extrasModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:8vh 16px 16px;overflow:auto;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  const list = productExtras(productId);
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:480px;width:100%;">
    <div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;">➕ ${escapeHtml(prod.name)} · Ekstralar</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','extrasModalBg')}>✕</span></div>
    <p class="muted" style="text-align:left;font-size:13px;">Siparişte bu ürün eklenince ekstralar seçilebilir. Her ekstra ayrı kalem olarak eklenir, fiyatı hesaba yansır ve ürünün istasyonuna/fişine düşer.</p>
    ${list.map(e => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
      <input id="xt_name_${e.id}" value="${escapeAttr(e.name)}" style="flex:1;margin:0;">
      <input id="xt_price_${e.id}" type="number" min="0" step="0.01" value="${e.price}" style="width:110px;margin:0;" title="Ek fiyat (₺)">
      ${actBtn('save', 'saveProductExtra', productId, e.id)}${actBtn('delete', 'removeProductExtra', productId, e.id)}
    </div>`).join('') || '<p class="muted" style="font-size:13px;">Henüz ekstra yok.</p>'}
    <div style="display:flex;gap:8px;align-items:center;border-top:1px dashed var(--border);padding-top:12px;margin-top:6px;">
      <input id="xt_name_new" placeholder="örn. Ek Döner" style="flex:1;margin:0;">
      <input id="xt_price_new" type="number" min="0" step="0.01" placeholder="Fiyat ₺" style="width:110px;margin:0;">
      <button type="button" style="width:auto;margin:0;" ${act('saveProductExtra', productId, '')}>+ Ekle</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
}
async function saveProductExtra(productId, extraId){
  const k = extraId || 'new';
  const name = document.getElementById('xt_name_'+k).value.trim();
  const price = parseFloat(document.getElementById('xt_price_'+k).value) || 0;
  if(!name){ showToast('Ekstra adı girin'); return; }
  const session = getSession();
  const { error } = await sb.rpc('upsert_product_extra', { p_token: session.session_token, p_parent_id: productId, p_id: extraId || null, p_name: name, p_price: price });
  if(error){ alert(error.message); return; }
  const { data } = await sb.rpc('get_restaurant_config', { p_token: session.session_token }); if(data) APP.config = data;
  showToast('Ekstra kaydedildi ✓');
  openExtrasModal(productId);
  if(APP.settingsTab==='products') renderSettingsContent(session);
}
async function removeProductExtra(productId, extraId){
  if(!await uiConfirm('Bu ekstra silinsin mi?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_product', { p_token: session.session_token, p_id: extraId });
  if(error){ alert(friendlyDeleteError ? friendlyDeleteError(error.message) : error.message); return; }
  const { data } = await sb.rpc('get_restaurant_config', { p_token: session.session_token }); if(data) APP.config = data;
  openExtrasModal(productId);
  if(APP.settingsTab==='products') renderSettingsContent(session);
}
function openRecipeModal(productId){
  const prod = APP.config.products.find(p => p.id===productId);
  RECIPE_DRAFT = (prod.recipe || []).map(r => ({ ingredient_id: r.ingredient_id, qty_per_unit: r.qty_per_unit, ingredient_name: r.ingredient_name, ingredient_unit: r.ingredient_unit }));
  const bg = document.createElement('div');
  bg.id = 'recipeModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:440px;width:100%;max-height:88vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">${escapeHtml(prod.name)} - Reçete</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','recipeModalBg')}>✕</span></div>
    <p class="muted" style="text-align:left;">Bu üründen 1 porsiyon satıldığında hangi hammaddeden ne kadar düşsün?</p>
    <div id="recipeItemsBox"></div>
    <div style="background:var(--panel2);border-radius:10px;padding:12px;margin-top:12px;">
      <div style="display:flex;gap:8px;">
        <select id="recipeIngSelect" style="flex:1;margin:0;">
          ${(APP.config.ingredients||[]).map(i => `<option value="${i.id}" data-unit="${i.unit}" data-name="${escapeAttr(i.name)}">${escapeHtml(i.name)} (${i.unit})</option>`).join('')}
        </select>
        <input type="number" step="0.01" id="recipeQtyInput" placeholder="Miktar" style="width:100px;margin:0;">
        <button style="width:auto;padding:8px 12px;margin:0;" ${act('addRecipeItem', productId)}>Ekle</button>
      </div>
    </div>
    <button style="margin-top:14px;" ${act('saveRecipe', productId)}>Reçeteyi Kaydet</button>
  </div>`;
  document.body.appendChild(bg);
  renderRecipeItems();
}
function renderRecipeItems(){
  const el = document.getElementById('recipeItemsBox'); if(!el) return;
  el.innerHTML = RECIPE_DRAFT.length===0 ? '<p class="muted">Henüz hammadde eklenmedi (bu ürün basit stok sayacı kullanır).</p>' :
    RECIPE_DRAFT.map((r,idx) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
        <span>${escapeHtml(r.ingredient_name)}: <b>${r.qty_per_unit} ${r.ingredient_unit}</b></span>
        <span style="cursor:pointer;color:var(--red);" ${act('removeRecipeItem', idx)}>✕</span>
      </div>`).join('');
}
function addRecipeItem(productId){
  const sel = document.getElementById('recipeIngSelect');
  if(!sel.value){ alert('Önce Hammaddeler sekmesinden en az bir hammadde ekleyin'); return; }
  const qty = parseFloat(document.getElementById('recipeQtyInput').value);
  if(!qty || qty<=0){ alert('Geçerli bir miktar girin'); return; }
  const opt = sel.options[sel.selectedIndex];
  const existing = RECIPE_DRAFT.find(r => r.ingredient_id===sel.value);
  if(existing){ existing.qty_per_unit = qty; }
  else{ RECIPE_DRAFT.push({ ingredient_id: sel.value, qty_per_unit: qty, ingredient_name: opt.dataset.name, ingredient_unit: opt.dataset.unit }); }
  document.getElementById('recipeQtyInput').value = '';
  renderRecipeItems();
}
function removeRecipeItem(idx){ RECIPE_DRAFT.splice(idx,1); renderRecipeItems(); }
async function saveRecipe(productId){
  const session = getSession();
  const bad = RECIPE_DRAFT.filter(r => !(parseFloat(r.qty_per_unit) > 0));
  if(bad.length){ alert('Miktar giriniz: ' + bad.map(r => r.ingredient_name || 'hammadde').join(', ') + '\n\nHer hammadde için 1 porsiyonda kullanılan miktarı girin ya da satırı silin.'); return; }
  const items = RECIPE_DRAFT.map(r => ({ ingredient_id: r.ingredient_id, qty_per_unit: parseFloat(r.qty_per_unit) }));
  const { error } = await sb.rpc('set_recipe', { p_token: session.session_token, p_product_id: productId, p_items: items });
  if(error){ alert(error.message); return; }
  document.getElementById('recipeModalBg').remove();
  renderSettingsView(document.getElementById('main'), session);
}

/* --- Çok dilli QR menü: ürün adının diğer dillerdeki karşılığı (opsiyonel,
   boş bırakılırsa /menu/ sayfası Türkçe adı gösterir), bkz.
   update_product_translations / get_public_menu. */
const QR_MENU_LANGUAGES = [
  { code:'en', label:'İngilizce' },
  { code:'ar', label:'Arapça' },
  { code:'de', label:'Almanca' },
  { code:'ru', label:'Rusça' },
];
function openTranslationsModal(productId){
  const prod = APP.config.products.find(p => p.id===productId);
  const translations = prod.name_translations || {};
  const bg = document.createElement('div');
  bg.id = 'translationsModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:440px;width:100%;max-height:88vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">${escapeHtml(prod.name)} - Çeviriler</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','translationsModalBg')}>✕</span></div>
    <p class="muted" style="text-align:left;">Boş bıraktığınız diller için QR menüde Türkçe ad gösterilir.</p>
    ${QR_MENU_LANGUAGES.map(l => `<div class="field-group"><label>${l.label}</label><input id="tr_${l.code}_${productId}" value="${escapeAttr(translations[l.code]||'')}" placeholder="${escapeAttr(prod.name)}"></div>`).join('')}
    <button style="margin-top:14px;" ${act('saveTranslations', productId)}>Çevirileri Kaydet</button>
  </div>`;
  document.body.appendChild(bg);
}
async function saveTranslations(productId){
  const session = getSession();
  const translations = {};
  QR_MENU_LANGUAGES.forEach(l => {
    const v = document.getElementById('tr_'+l.code+'_'+productId).value.trim();
    if(v) translations[l.code] = v;
  });
  const { error } = await sb.rpc('update_product_translations', { p_token: session.session_token, p_product_id: productId, p_translations: translations });
  if(error){ alert(error.message); return; }
  document.getElementById('translationsModalBg').remove();
  showToast('Çeviriler kaydedildi ✓');
  renderSettingsView(document.getElementById('main'), session);
}

/* --- İstasyonlar --- */
/* İstasyon ikonları kategorilere ayrılmış [ikon, aranabilir ad] listesi.
   İkonlar emoji olarak saklanır (veritabanı ve diğer ekranlar aynen
   kullanmaya devam eder). */
const STATION_ICON_GROUPS = [
  ['Ocak & Izgara', [['🍳','tava yumurta kahvaltı'],['🔥','ateş ızgara mangal'],['🥩','et biftek'],['🍖','kemikli et pirzola'],['🍗','tavuk but'],['🥓','pastırma bacon'],['🌭','sosis sucuk'],['🍔','burger hamburger'],['🥙','dürüm döner'],['🌯','wrap dürüm'],['🍢','şiş kebap'],['🍤','karides'],['🐟','balık'],['🦐','deniz ürünü'],['🥘','güveç tencere'],['🍲','çorba yemek'],['🫕','fondü'],['🔪','bıçak hazırlık']]],
  ['Fırın & Pizza', [['🍕','pizza'],['🫓','pide lahmacun'],['🥖','baget ekmek'],['🍞','ekmek'],['🥐','kruvasan'],['🥨','simit pretzel'],['🥯','simit bagel'],['🧀','peynir'],['🥧','börek tart'],['🫔','tamale']]],
  ['Dünya Mutfağı', [['🍝','makarna'],['🍜','ramen noodle'],['🍛','köri'],['🍣','sushi'],['🍱','bento'],['🍙','onigiri'],['🥟','mantı'],['🥠','fal kurabiyesi'],['🌮','taco'],['🥗','salata'],['🥪','sandviç tost'],['🍟','patates kızartma'],['🧆','falafel'],['🫒','zeytin meze']]],
  ['Tatlı', [['🍰','pasta dilim'],['🎂','doğum günü pasta'],['🧁','cupcake'],['🍩','donut'],['🍪','kurabiye'],['🍫','çikolata'],['🍮','puding sütlaç'],['🍯','bal'],['🍦','dondurma külah'],['🍨','dondurma kase'],['🧇','waffle'],['🥞','pankek krep'],['🍬','şeker'],['🍭','lolipop']]],
  ['İçecek', [['☕','kahve'],['🍵','çay'],['🫖','demlik çay'],['🧋','bubble tea'],['🥤','soğuk içecek'],['🧃','meyve suyu'],['🥛','süt ayran'],['🧉','mate'],['🍹','kokteyl'],['🍸','martini'],['🍷','şarap'],['🍺','bira'],['🍻','bira bardak'],['🥂','şampanya'],['🍾','şişe'],['🧊','buz']]],
  ['Meyve & Sebze', [['🍎','elma'],['🍊','portakal'],['🍋','limon'],['🍉','karpuz'],['🍇','üzüm'],['🍓','çilek'],['🍒','kiraz'],['🍑','şeftali'],['🥭','mango'],['🍍','ananas'],['🥑','avokado'],['🍅','domates'],['🌶️','biber acı'],['🥕','havuç'],['🌽','mısır'],['🥦','brokoli'],['🧅','soğan'],['🧄','sarımsak'],['🍄','mantar'],['🥜','fıstık kuruyemiş']]],
  ['Servis & Diğer', [['🍽️','servis tabak'],['🥡','paket servis'],['🛵','kurye teslimat'],['🧾','fiş kasa'],['🛎️','zil servis'],['👨‍🍳','şef aşçı'],['🧑‍🍳','aşçı'],['🥄','kaşık'],['🍴','çatal bıçak'],['🧂','tuz baharat'],['🫙','kavanoz turşu'],['🧺','sepet'],['❄️','soğuk soğutucu'],['♨️','sıcak buhar'],['⭐','yıldız özel'],['🏷️','etiket']]]
];
const STATION_ICON_CHOICES = STATION_ICON_GROUPS.flatMap(g => g[1].map(x => x[0]));
function stationIconPickerHtml(id, current, extraStyle){
  const cur = current || '🍳';
  return `<input type="hidden" id="${id}" value="${cur}">
    <button type="button" class="icon-pick-btn" id="${id}_btn" style="${extraStyle||''}" ${act('openIconPicker', id)}>${cur}</button>`;
}
function iconPickerGridHtml(targetId, current, filter){
  const q = (filter||'').trim().toLocaleLowerCase('tr');
  const groups = STATION_ICON_GROUPS.map(([name, items]) => [name, items.filter(([ic, kw]) => !q || kw.includes(q) || name.toLocaleLowerCase('tr').includes(q))]).filter(g => g[1].length);
  if(!groups.length) return '<p class="muted" style="text-align:center;margin:24px 0;">Sonuç bulunamadı</p>';
  return groups.map(([name, items]) => `
    <div class="icon-picker-cat">${escapeHtml(name)}</div>
    <div class="icon-picker-grid">${items.map(([ic, kw]) => `<button type="button" class="icon-picker-item ${ic===current?'selected':''}" title="${escapeAttr(kw)}" ${act('pickStationIcon', targetId, ic)}>${ic}</button>`).join('')}</div>`).join('');
}
function openIconPicker(targetId){
  const current = document.getElementById(targetId).value;
  const bg = document.createElement('div');
  bg.id = 'iconPickerBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;';
  bg.innerHTML = `<div class="icon-picker-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="margin:0;">İkon Seç</h3>
      <button type="button" class="icon-picker-close" ${act('removeEl','iconPickerBg')}>✕</button>
    </div>
    <input id="iconPickerSearch" placeholder="🔍 Ara: pizza, kahve, tatlı…" autocomplete="off" style="margin-bottom:10px;"
      ${actOn('input','filterIconPicker',[targetId, current, '$value'])}>
    <div id="iconPickerBody" class="icon-picker-body">${iconPickerGridHtml(targetId, current, '')}</div>
  </div>`;
  bg.addEventListener('click', (e) => { if(e.target===bg) bg.remove(); });
  document.body.appendChild(bg);
  setTimeout(() => { const i = document.getElementById('iconPickerSearch'); if(i && window.innerWidth > 700) i.focus(); }, 30);
}
function pickStationIcon(targetId, icon){
  document.getElementById(targetId).value = icon;
  const btn = document.getElementById(targetId+'_btn');
  if(btn) btn.textContent = icon;
  const bg = document.getElementById('iconPickerBg');
  if(bg) bg.remove();
}
function renderStationsSettings(el, session){
  const menus = APP.config.menus || [], stations = APP.config.stations || [];
  const prodCount = (mid) => (APP.config.products||[]).filter(p => p.menu_id === mid).length;
  const menuCard = (m) => { const i = menus.indexOf(m);
    return `<div class="mn-card">
      <div class="mn-row">
        <input class="mn-name" value="${escapeAttr(m.name)}" id="menu_name_${m.id}" title="Adı değiştirip Enter'a basın" ${actOn('keydown','onEnterCall',['$event','saveMenu', m.id])}>
        <button type="button" class="ico-btn" title="Adı kaydet" ${act('saveMenu', m.id)}>💾</button>
        <button type="button" class="ico-btn danger" title="Menüyü sil" ${act('removeMenu', m.id)}>🗑</button>
      </div>
      <div class="mn-row mn-foot">
        <span class="pchip">🍽️ ${prodCount(m.id)} ürün</span>
        <select class="mn-move" title="Bu menünün gideceği istasyon" ${actOn('change','moveMenuToStation',[m.id,'$value'])}>
          <option value="">— İstasyon yok —</option>${stations.map(x => `<option value="${x.id}" ${x.id===m.station_id?'selected':''}>${escapeHtml(x.icon||'🍳')} ${escapeHtml(x.name)}</option>`).join('')}
        </select>
        ${menuAvailBtn(m.id)}
      </div>
    </div>`; };
  const col = (s) => { const list = menus.filter(m => m.station_id === s.id);
    return `<div class="st-col" data-cf-tags="station" style="--sc:${s.color||'var(--c1)'};">
      <div class="st-col-head">
        ${stationIconPickerHtml('st_icon_'+s.id, s.icon||'🍳', '')}
        <input class="st-col-name" value="${escapeAttr(s.name)}" id="st_name_${s.id}" placeholder="İstasyon adı" ${actOn('keydown','onEnterCall',['$event','saveStation', s.id])}>
        <input type="color" class="st-col-color" value="${s.color}" id="st_color_${s.id}" title="Renk">
        <button type="button" class="ico-btn" title="Kaydet" ${act('saveStation', s.id)}>💾</button>
        <button type="button" class="ico-btn danger" title="İstasyonu sil" ${act('removeStation', s.id)}>🗑</button>
      </div>
      <div class="st-col-sub">${list.length} menü · ${(APP.config.products||[]).filter(p => p.station_id===s.id).length} ürün</div>
      <div class="st-col-body">${list.map(menuCard).join('') || '<div class="st-empty">Bu istasyona menü bağlı değil.<br>Bir menünün altındaki seçimden buraya taşıyın.</div>'}</div>
      ${stationKitchenProductsHtml(s)}
    </div>`; };
  const free = menus.filter(m => !m.station_id || !stations.some(x => x.id === m.station_id));
  el.innerHTML = statChips([['📋', menus.length, 'Menü', 'var(--c1)', 'all'], ['🍳', stations.length, 'İstasyon', 'var(--c2)', 'station'],
      ['🍽️', (APP.config.products||[]).length, 'Ürün', 'var(--c3)', 'go:setSettingsTab:products'], ['⚠️', free.length, 'İstasyonsuz menü', free.length ? 'var(--danger,#ef4444)' : 'var(--c4)', 'free']], '', 'menus') +
    `<div class="box" style="max-width:none;">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><h2 style="margin:0;">Menüler & İstasyonlar</h2></div>
    <p class="muted" style="text-align:left;margin:6px 0 14px;font-size:13px;">Her sütun bir mutfak istasyonu. İçindeki menülerin ürünleri o istasyonun ekranına ve yazıcısına düşer. Menüyü başka istasyona taşımak için kartındaki seçimi değiştirin.</p>
    <div class="st-board" data-cf-scope="menus">
      <div class="st-col st-free" data-cf-tags="free" style="--sc:#94a3b8;">
        <div class="st-col-head"><span class="st-free-ic">📋</span><b class="st-col-title">İstasyonsuz menüler</b></div>
        <div class="st-col-sub">${free.length ? 'Bu menülerin ürünleri hiçbir istasyona düşmez' : 'Tüm menüler bir istasyona bağlı ✓'}</div>
        <div class="st-col-body">${free.map(menuCard).join('')}</div>
        <div class="st-add"><input id="newMenuName" placeholder="Yeni menü (örn. Çorbalar)" ${actOn('keydown','newMenuKey',['$event'])}><button type="button" ${act('addMenu')}>+ Menü</button></div>
      </div>
      ${stations.map(col).join('')}
      <div class="st-col st-new" data-cf-tags="station">
        <div class="st-col-head">${stationIconPickerHtml('newStIcon','🍳', '')}<b class="st-col-title">Yeni istasyon</b></div>
        <div class="st-add" style="flex-direction:column;align-items:stretch;">
          <input id="newStName" placeholder="İstasyon adı (örn. Fırın)" ${actOn('keydown','onEnterCall',['$event','addStation'])}>
          <div style="display:flex;gap:8px;"><input type="color" id="newStColor" value="#b6a48d" title="Renk" class="st-col-color"><button type="button" style="flex:1;" ${act('addStation')}>+ İstasyon Ekle</button></div>
        </div>
      </div>
    </div>
  </div>
  <div class="box mo-box" style="max-width:none;margin-top:18px;">
    <h2 style="margin:0 0 4px;">📋 Sipariş Al Ekranında Menü Sırası</h2>
    <p class="muted" style="text-align:left;margin:0 0 14px;font-size:13px;">Menüleri sürükleyip bırakın ya da oklarla taşıyın. Sipariş Al ekranındaki soldaki menü listesi bu sırayla görünür.</p>
    <div class="mo-wrap">
      <div class="mo-list" id="menuOrderList">
        <div class="mo-item mo-fixed"><span class="mo-no">★</span><b>Tümü</b><small>her zaman en üstte</small></div>
        ${menus.map((m, i) => { const st = stations.find(x => x.id === m.station_id);
          return `<div class="mo-item" draggable="true" data-id="${m.id}" style="--sc:${(st && st.color) || '#94a3b8'};">
            <span class="mo-grip" title="Sürükle">⋮⋮</span><span class="mo-no">${i + 1}</span>
            <div class="mo-txt"><b>${escapeHtml(m.name)}</b><small>${prodCount(m.id)} ürün${st ? ' · ' + escapeHtml(st.icon || '🍳') + ' ' + escapeHtml(st.name) : ' · istasyonsuz'}</small></div>
            <div class="mo-arrows"><button type="button" ${i===0?'disabled':''} title="Yukarı" ${act('moveMenu', m.id, -1)}>▲</button><button type="button" ${i===menus.length-1?'disabled':''} title="Aşağı" ${act('moveMenu', m.id, 1)}>▼</button></div>
          </div>`; }).join('')}
      </div>
      <div class="mo-preview"><small class="muted">Önizleme · Sipariş Al</small>
        <div class="mo-pv"><div class="mo-pv-i on">Tümü <em>${(APP.config.products||[]).length}</em></div>${menus.map(m => `<div class="mo-pv-i">${escapeHtml(m.name)} <em>${prodCount(m.id)}</em></div>`).join('')}</div>
      </div>
    </div>
  </div>`;
  initMenuOrderDnD();
}
/* Menü sırası: sürükle-bırak (HTML5 DnD + dokunmatik için oklar). */
function initMenuOrderDnD(){
  const list = document.getElementById('menuOrderList'); if(!list) return;
  let drag = null;
  list.querySelectorAll('.mo-item[draggable]').forEach(it => {
    it.addEventListener('dragstart', e => { drag = it; it.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try{ e.dataTransfer.setData('text/plain', it.dataset.id); }catch(x){} });
    it.addEventListener('dragend', () => { it.classList.remove('dragging'); list.querySelectorAll('.drop-over').forEach(x => x.classList.remove('drop-over'));
      if(!drag) return; drag = null;
      const ids = [...list.querySelectorAll('.mo-item[data-id]')].map(x => x.dataset.id);
      const cur = (APP.config.menus || []).map(m => m.id);
      if(ids.join() !== cur.join()) menuRpc('set_menu_order', { p_ids: ids }, 'Menü sırası kaydedildi ✓');
    });
    it.addEventListener('dragover', e => {
      e.preventDefault(); if(!drag || drag === it) return;
      const r = it.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      list.insertBefore(drag, after ? it.nextSibling : it);
      [...list.querySelectorAll('.mo-item[data-id]')].forEach((x, i) => { const n = x.querySelector('.mo-no'); if(n) n.textContent = i + 1; });
    });
  });
}
function moveMenuToStation(menuId, stationId){
  const m = (APP.config.menus || []).find(x => x.id === menuId); if(!m) return;
  if(!stationId){ if(m.station_id) toggleStationMenu(m.station_id, menuId); return; }
  if(m.station_id !== stationId) toggleStationMenu(stationId, menuId);
}
/* İstasyon kartında: seçili menülerin ürünleri istasyona (mutfak ekranı + fiş) düşsün mü?
   İşaretsiz ürün siparişte doğrudan "hazır" olur (bkz. products.kitchen_skip). */
function stationKitchenProductsHtml(st){
  const menus = (APP.config.menus || []).filter(m => m.station_id === st.id);
  const prods = (APP.config.products || []).filter(p => p.station_id === st.id);
  if(!prods.length) return '';
  const on = prods.filter(p => !p.kitchen_skip).length;
  const groups = menus.map(m => [m.name, prods.filter(p => p.menu_id === m.id)]).filter(g => g[1].length);
  const rest = prods.filter(p => !menus.some(m => m.id === p.menu_id));
  if(rest.length) groups.push(['Diğer', rest]);
  return `<details class="st-kp" ${APP.stKpOpen===st.id?'open':''} style="flex-basis:100%;">
    <summary>🍳 İstasyona düşen ürünler · <b>${on}/${prods.length}</b>${on<prods.length ? ` <span class="muted">(${prods.length-on} ürün doğrudan hazır olur)</span>` : ''}</summary>
    <p class="muted" style="font-size:12px;margin:6px 0 8px;">İşareti kaldırılan ürünler bu istasyonun ekranına ve yazıcısına düşmez; masa siparişinde doğrudan <b>hazır</b> olur (örn. kasadan verilen su, hazır içecekler). <b>Paket siparişler etkilenmez</b>: paket siparişte girilen tüm ürünler istasyona ve fişe düşer.</p>
    ${groups.map(([name, list]) => `<div class="st-kp-grp"><div class="st-kp-h">📋 ${escapeHtml(name)} <span class="muted">${list.filter(p => !p.kitchen_skip).length}/${list.length}</span></div>
      <div class="st-kp-list">${list.map(p => `<label><input type="checkbox" style="width:auto;margin:0;" ${p.kitchen_skip ? '' : 'checked'} ${actOn('change','setProductKitchen',[p.id,'$checked',st.id])}>${escapeHtml(p.name)}</label>`).join('')}</div></div>`).join('')}
  </details>`;
}
async function setProductKitchen(pid, on, stId){
  const p = (APP.config.products || []).find(x => x.id === pid); if(!p) return;
  const { error } = await sb.rpc('set_product_kitchen', { p_token: getSession().session_token, p_product_id: pid, p_on: !!on });
  if(error){ alert(error.message); return; }
  p.kitchen_skip = !on; APP.stKpOpen = stId;
  showToast(on ? p.name + ' istasyona düşecek' : p.name + ' istasyona düşmeyecek (doğrudan hazır)');
  const sum = document.querySelector('details.st-kp[open] summary b'); if(sum){ const st = (APP.config.products||[]).filter(x => x.station_id===stId); sum.textContent = st.filter(x => !x.kitchen_skip).length + '/' + st.length; }
}
/* Menüler: ürünler menüye bağlanır; menü bir istasyona atanır (ürünün istasyonu menüden gelir).
   Sipariş ekranı / QR menüde istasyonun içinde menüler sekme olarak görünür. */
async function menuRpc(fn, args, okMsg){
  const session = getSession();
  const { error } = await sb.rpc(fn, Object.assign({ p_token: session.session_token }, args));
  if(error){ alert(error.message); return false; }
  renderSettingsView(document.getElementById('main'), session);
  if(okMsg) showToast(okMsg);
  return true;
}
function newMenuKey(e){ if(e.key === 'Enter'){ e.preventDefault(); addMenu(); } }
function addMenu(){ const v = (document.getElementById('newMenuName')||{}).value || ''; if(!v.trim()) return; menuRpc('upsert_menu', { p_id: null, p_name: v.trim() }, 'Menü eklendi ✓'); }
function saveMenu(id){ const v = (document.getElementById('menu_name_'+id)||{}).value || ''; menuRpc('upsert_menu', { p_id: id, p_name: v.trim() }, 'Kaydedildi ✓'); }
async function removeMenu(id){
  const m = (APP.config.menus||[]).find(x => x.id === id) || {};
  const n = (APP.config.products||[]).filter(p => p.menu_id === id).length;
  if(!await uiConfirm(`"${m.name}" menüsü silinsin mi?` + (n ? `\n\n${n} ürün menüsüz kalacak (ürünler silinmez, istasyonları değişmez).` : ''))) return;
  menuRpc('delete_menu', { p_id: id }, 'Menü silindi');
}
function moveMenu(id, dir){
  const ids = (APP.config.menus||[]).map(m => m.id); const i = ids.indexOf(id); const j = i + dir;
  if(i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  menuRpc('set_menu_order', { p_ids: ids });
}
function toggleStationMenu(stationId, menuId){
  const menus = APP.config.menus || [];
  const mine = menus.filter(m => m.station_id === stationId).map(m => m.id);
  const on = mine.includes(menuId);
  const list = on ? mine.filter(x => x !== menuId) : mine.concat(menuId);
  menuRpc('set_station_menus', { p_station_id: stationId, p_menu_ids: list });
}
async function saveStation(id){
  const session = getSession();
  const name = document.getElementById('st_name_'+id).value.trim();
  const color = document.getElementById('st_color_'+id).value;
  const icon = document.getElementById('st_icon_'+id).value;
  const { error } = await sb.rpc('upsert_station', { p_token: session.session_token, p_id: id, p_name: name, p_color: color, p_icon: icon });
  if(error){ alert(error.message); return; }
  renderSettingsView(document.getElementById('main'), session);
  showToast('Kaydedildi ✓');
}
async function addStation(){
  const session = getSession();
  const name = document.getElementById('newStName').value.trim();
  const color = document.getElementById('newStColor').value;
  const icon = document.getElementById('newStIcon').value;
  if(!name) return;
  const { error } = await sb.rpc('upsert_station', { p_token: session.session_token, p_id: null, p_name: name, p_color: color, p_icon: icon });
  if(error){ alert(error.message); return; }
  renderSettingsView(document.getElementById('main'), session);
}
async function removeStation(id){
  const linkedCount = APP.config.products.filter(p => p.station_id===id).length;
  if(linkedCount>0){
    alert('Bu istasyona bağlı '+linkedCount+' ürün var. Önce Ürünler sekmesinden bu ürünleri başka bir istasyona taşıyın veya silin, sonra bu istasyonu silebilirsiniz.');
    return;
  }
  if(!await uiConfirm('İstasyonu silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_station', { p_token: session.session_token, p_id: id });
  if(error){
    if(error.message.includes('foreign key')) alert('Bu istasyona bağlı ürünler var, önce onları taşıyın veya silin.');
    else alert(error.message);
    return;
  }
  renderSettingsView(document.getElementById('main'), session);
}

/* --- Bölgeler & Masalar --- */
/* Bölgeler & Masalar sekmesi: Kat Planı paketinde varsa iki alt sekme (Bölgeler & Masalar | Kat Planı). */
function renderZonesTabWithSubtabs(el, session){
  if(!hasFeature('floorplan')){ APP.zonesSubTab = 'zones'; renderZonesSettings(el, session); return; }
  const sub = APP.zonesSubTab === 'floorplan' ? 'floorplan' : 'zones';
  el.innerHTML = `<div class="box sub-tabs-box" style="max-width:none;">
      <div class="sub-tabs">
        <div role="tab" tabindex="0" class="sub-tab ${sub==='zones'?'active':''}" ${act('setZonesSubTab', 'zones')}><span class="sub-tab-ic">🪑</span>Bölgeler & Masalar</div>
        <div role="tab" tabindex="0" class="sub-tab ${sub==='floorplan'?'active':''}" ${act('setZonesSubTab', 'floorplan')}><span class="sub-tab-ic">🗺️</span>Kat Planı</div>
      </div>
      <div id="zonesSubContent" class="sub-tabs-content"></div>
    </div>`;
  const box = document.getElementById('zonesSubContent');
  if(sub==='floorplan') renderFloorPlanSettings(box, session); else renderZonesSettings(box, session);
}
/* Ürünler & Hammaddeler sekmesi: yetkiye göre iki alt sekme. */
function renderProductsTabWithSubtabs(el, session){
  const tabs = [
    canManage(session, 'settings_products') ? { id:'products', ic:'🍽️', label:'Ürünler' } : null,
    canManage(session, 'settings_products') ? { id:'media', ic:'📷', label:'Fotoğraf & Açıklama' } : null,
    canManage(session, 'settings_ingredients') ? { id:'ingredients', ic:'🥕', label:'Hammaddeler' } : null,
  ].filter(Boolean);
  if(!tabs.length){ el.innerHTML = ''; return; }
  if(!tabs.some(t => t.id === APP.productsSubTab)) APP.productsSubTab = tabs[0].id;
  const drawFn = APP.productsSubTab === 'ingredients' ? renderIngredientsSettings : APP.productsSubTab === 'media' ? renderProductMedia : renderProductsSettings;
  if(tabs.length === 1){ drawFn(el, session); return; }
  el.innerHTML = `<div class="box sub-tabs-box" style="max-width:none;">
      <div class="sub-tabs">${tabs.map(t => `<div role="tab" tabindex="0" class="sub-tab ${APP.productsSubTab===t.id?'active':''}" ${act('setProductsSubTab', t.id)}><span class="sub-tab-ic">${t.ic}</span>${t.label}</div>`).join('')}</div>
      <div id="productsSubContent" class="sub-tabs-content"></div>
    </div>`;
  drawFn(document.getElementById('productsSubContent'), session);
}
function setProductsSubTab(t){
  if(t !== APP.productsSubTab) pushScreen();
  APP.productsSubTab = t;
  const el = document.getElementById('settingsContent');
  if(el) renderProductsTabWithSubtabs(el, getSession());
}
/* Kampanya & Kuponlar (Abonelik / Hediye Kartları'nın yanında): yönetim crm.js'teki renderPromoBody ile. */
function renderPromosSettings(el){
  APP.promoEdit = null;
  el.innerHTML = `<div class="box" style="max-width:none;"><h2>🎟️ Kampanya & Kuponlar</h2>
    <p class="muted" style="text-align:left;margin:-6px 0 14px;font-size:13px;">Kupon kodu ödeme ekranında İndirim bölümünden girilir; otomatik kampanyalar (happy hour) belirlenen gün ve saatte ödeme ekranında tek tıkla önerilir.</p>
    <div id="promoBody"><p class="muted">Yükleniyor…</p></div></div>`;
  renderPromoBody();
}
/* Abonelik & Hediye Kartları sekmesi: yetkiye göre alt sekmeler. */
function billingBox(){ return document.getElementById('billingSubContent') || document.getElementById('settingsContent'); }
function renderBillingTabWithSubtabs(el, session){
  const tabs = [
    canManage(session, 'settings_billing') ? { id:'billing', ic:'💳', label:'Abonelik' } : null,
    (canManage(session, 'giftcards') || hasPerm(session, 'payments')) ? { id:'giftcards', ic:'🎁', label:'Hediye Kartları' } : null,
    canManage(session, 'crm') ? { id:'promos', ic:'🎟️', label:'Kampanya & Kuponlar' } : null,
  ].filter(Boolean);
  if(!tabs.length){ el.innerHTML = ''; return; }
  if(!tabs.some(t => t.id === APP.billingSubTab)) APP.billingSubTab = tabs[0].id;
  const draw = (box) => APP.billingSubTab === 'giftcards' ? renderGiftCardsSettings(box, session) : APP.billingSubTab === 'promos' ? renderPromosSettings(box) : renderBillingSettings(box, session);
  if(tabs.length === 1){ draw(el); return; }
  el.innerHTML = `<div class="box sub-tabs-box" style="max-width:none;">
      <div class="sub-tabs">${tabs.map(t => `<div role="tab" tabindex="0" class="sub-tab ${APP.billingSubTab===t.id?'active':''}" ${act('setBillingSubTab', t.id)}><span class="sub-tab-ic">${t.ic}</span>${t.label}</div>`).join('')}</div>
      <div id="billingSubContent" class="sub-tabs-content"></div>
    </div>`;
  draw(document.getElementById('billingSubContent'));
}
function setBillingSubTab(t){
  if(t !== APP.billingSubTab) pushScreen();
  APP.billingSubTab = t;
  const el = document.getElementById('settingsContent');
  if(el) renderBillingTabWithSubtabs(el, getSession());
}
function setZonesSubTab(t){
  if(t !== (APP.zonesSubTab||'zones')) pushScreen();
  APP.zonesSubTab = t;
  const el = document.getElementById('settingsContent');
  if(el) renderZonesTabWithSubtabs(el, getSession());
}
function renderZonesSettings(el, session){
  const natural = (a, b) => String(a.name).localeCompare(String(b.name), 'tr', { numeric:true, sensitivity:'base' });
  const zones = APP.config.zones || [];
  if(!zones.some(z => z.id === APP.zoneSel)) APP.zoneSel = zones.length ? zones[0].id : null;
  const z = zones.find(x => x.id === APP.zoneSel);
  const total = zones.reduce((x, q) => x + q.tables.length, 0);
  el.innerHTML = statChips([['📍', zones.length, 'Bölge', 'var(--c1)'], ['🪑', total, 'Toplam masa', 'var(--c2)', 'all'],
      ['▦', zones.reduce((x, q) => x + q.tables.filter(t => t.qr_token).length, 0), 'QR kodlu masa', 'var(--c3)', 'qr'], ['⬜', zones.reduce((x, q) => x + q.tables.filter(t => !t.qr_token).length, 0), 'QR kodsuz masa', 'var(--c4)', 'noqr']], '', 'zones') +
    `<div class="box" style="max-width:none;">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <h2 style="margin:0;">Bölgeler & Masalar</h2><span style="flex:1;"></span>
      <button type="button" class="pc-btn" ${act('showAllTableQrs')}>▦ Tüm QR'ları Yazdır</button>
      <button type="button" class="pc-btn" ${act('downloadAllTableQrs')}>⬇ Tüm QR'ları İndir</button>
    </div>
    <div class="zn-layout">
      <div class="zn-list">
        ${zones.map((q, i) => `<button type="button" class="zn-item ${q.id===APP.zoneSel?'on':''}" style="--zc:var(--c${i%4+1});" ${act('selectZoneSetting', q.id)}>
          <span class="zn-dot">📍</span><span class="zn-txt"><b>${escapeHtml(q.name)}</b><small>${q.tables.length} masa</small></span></button>`).join('')}
        <div class="zn-new"><input id="newZoneName" placeholder="Yeni bölge (örn. Teras)" ${actOn('keydown','onEnterCall',['$event','addZone'])}><button type="button" ${act('addZone')}>+</button></div>
      </div>
      <div class="zn-panel">
        ${z ? `<div class="zn-head">
            <input value="${escapeAttr(z.name)}" id="zn_name_${z.id}" class="zn-title" title="Adı değiştirip Enter'a basın" ${actOn('keydown','onEnterCall',['$event','saveZone', z.id])}>
            <button type="button" class="ico-btn" title="Bölge adını kaydet" ${act('saveZone', z.id)}>💾</button>
            <button type="button" class="ico-btn danger" title="Bölgeyi sil" ${act('removeZone', z.id)}>🗑</button>
          </div>
          <div class="zn-tiles" data-cf-scope="zones">
            ${z.tables.slice().sort(natural).map((t, i) => `<div class="zn-tile" data-cf-tags="${t.qr_token ? 'qr' : 'noqr'}" style="--i:${Math.min(i,20)};">
              <button type="button" class="zn-tname" title="Yeniden adlandır" ${act('renameTable', t.id, z.id, t.name)}>${escapeHtml(t.name)}</button>
              <div class="zn-tacts">
                <button type="button" title="QR Menü Kodu" ${act('showTableQr', t.id, t.qr_token)}>▦ QR</button>
                <button type="button" class="danger" title="Masayı sil" ${act('removeTable', t.id)}>✕</button>
              </div>
            </div>`).join('')}
            <div class="zn-tile zn-addtile">
              <input id="newTable_${z.id}" placeholder="Masa 21 ya da Masa 1-10" ${actOn('keydown','onEnterCall',['$event','addTable', z.id])}>
              <button type="button" ${act('addTable', z.id)}>+ Masa Ekle</button>
            </div>
          </div>
          <p class="muted" style="font-size:12px;margin:12px 0 0;text-align:left;">İpucu: Masa adına tıklayıp yeniden adlandırabilirsiniz. Toplu eklemek için <b>Masa 1-10</b> yazın.</p>`
        : '<div class="empty-state"><div style="font-size:42px;">📍</div><p class="muted">Soldan ilk bölgenizi ekleyin (örn. Salon, Bahçe).</p></div>'}
      </div>
    </div>
  </div>`;
}
function selectZoneSetting(id){ APP.zoneSel = id; renderSettingsContent(getSession()); }
async function renameTable(id, zoneId, current){
  const name = (await uiPrompt('Masa adı:', current) || '').trim();
  if(!name || name===current) return;
  const session = getSession();
  const { error } = await sb.rpc('upsert_table', { p_token: session.session_token, p_id: id, p_zone_id: zoneId, p_name: name });
  if(error){ alert(error.message); return; }
  renderSettingsView(document.getElementById('main'), session);
}
async function saveZone(id){
  const session = getSession();
  const name = document.getElementById('zn_name_'+id).value.trim();
  const { error } = await sb.rpc('upsert_zone', { p_token: session.session_token, p_id: id, p_name: name });
  if(error){ alert(error.message); return; }
  renderSettingsView(document.getElementById('main'), session);
  showToast('Kaydedildi ✓');
}
async function addZone(){
  const session = getSession();
  const name = document.getElementById('newZoneName').value.trim();
  if(!name) return;
  const { error } = await sb.rpc('upsert_zone', { p_token: session.session_token, p_id: null, p_name: name });
  if(error){ alert(error.message); return; }
  renderSettingsView(document.getElementById('main'), session);
}
function friendlyDeleteError(msg){
  if(msg && msg.includes('foreign key')) return 'Bu kayıt başka bir yerde kullanılıyor olduğu için silinemedi (örn. bağlı ürün, masa veya sipariş geçmişi). Önce bağlı kayıtları taşıyın/silin.';
  return msg;
}
async function removeZone(id){
  if(!await uiConfirm('Bölgeyi ve içindeki masaları silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_zone', { p_token: session.session_token, p_id: id });
  if(error){ alert(friendlyDeleteError(error.message)); return; }
  renderSettingsView(document.getElementById('main'), session);
}
let ADD_TABLE_BUSY = false;
async function addTable(zoneId){
  // Çift tıklama / Enter + düğme ile aynı ekleme iki kez çalışmasın.
  if(ADD_TABLE_BUSY) return;
  const session = getSession();
  const name = document.getElementById('newTable_'+zoneId).value.trim();
  if(!name) return;
  ADD_TABLE_BUSY = true;
  try{ await addTableInner(session, zoneId, name); } finally { ADD_TABLE_BUSY = false; }
}
async function addTableInner(session, zoneId, name){
  // "Masa 1-10" gibi aralık yazılırsa masalar toplu eklenir.
  const m = name.match(/^(.*?)(\d+)\s*-\s*(\d+)$/);
  let names = [name];
  if(m){
    const from = parseInt(m[2],10), to = parseInt(m[3],10);
    if(to < from || to - from > 99){ alert('Aralık en fazla 100 masa olabilir.'); return; }
    if(!await uiConfirm(`${to-from+1} masa eklenecek (${m[1]}${from} … ${m[1]}${to}). Devam edilsin mi?`)) return;
    names = []; for(let i=from;i<=to;i++) names.push(m[1] + i);
  }
  // Bu bölgede zaten var olan adlar atlanır (büyük/küçük harf fark etmez); diğer bölgelerde aynı ad olabilir.
  const zone = (APP.config.zones||[]).find(z => z.id === zoneId) || { tables: [] };
  const existing = new Set((zone.tables||[]).map(t => String(t.name).trim().toLocaleLowerCase('tr')));
  const todo = names.filter(n => !existing.has(n.trim().toLocaleLowerCase('tr')));
  const skipped = names.length - todo.length;
  if(!todo.length){ alert('Bu adlarda masalar bu bölgede zaten var.'); return; }
  await withLoadingOverlay((async () => {
    for(const n of todo){
      const { error } = await sb.rpc('upsert_table', { p_token: session.session_token, p_id: null, p_zone_id: zoneId, p_name: n });
      if(error){ alert(n + ': ' + error.message); break; }
    }
  })());
  if(skipped) showToast(skipped + ' masa zaten vardı, atlandı.');
  renderSettingsView(document.getElementById('main'), session);
}
async function removeTable(id){
  if(!await uiConfirm('Masayı silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_table', { p_token: session.session_token, p_id: id });
  if(error){ alert(friendlyDeleteError(error.message)); return; }
  renderSettingsView(document.getElementById('main'), session);
}
/* --- Kat Planı: masaları sürükle-bırak ile yerleştirme (bkz.
   update_table_positions RPC'si) - Sipariş Al ekranındaki "Kat Planı"
   görünümü bu konumları kullanır. Pointer Capture ile sürükleme, imleç
   masa kutusunun dışına çıksa bile events'i o kutuda tutar. --- */
function renderFloorPlanSettings(el, session){
  const zones = APP.config.zones || [];
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>🗺️ Kat Planı</h2>
    <p class="muted" style="margin-top:-8px;margin-bottom:16px;">Masaları sürükleyerek yerleştirin - bırakınca otomatik kaydedilir. Bu düzen, Sipariş Al ekranındaki "Kat Planı" görünümünde kullanılır.</p>
    ${zones.map(z => `
      <div style="margin-bottom:22px;">
        <h3 style="margin:0 0 8px;font-size:14px;">${escapeHtml(z.name)}</h3>
        ${z.tables.length===0 ? '<p class="muted">Bu bölgede masa yok.</p>' : `<div class="floorplan-canvas floorplan-editor" id="fpEdit_${z.id}"></div>`}
      </div>`).join('')}
    ${zones.length===0 ? '<p class="muted">Önce Bölgeler &amp; Masalar sekmesinden bölge/masa ekleyin.</p>' : ''}
  </div>`;
  zones.forEach(z => { if(z.tables.length>0) renderFloorPlanEditorCanvas(z); });
  if(!window._fpResizeBound){
    window._fpResizeBound = true;
    window.addEventListener('resize', () => {
      if(APP.settingsTab!=='floorplan' || FP_DRAG || !APP.config) return;
      (APP.config.zones||[]).forEach(z => { if(z.tables.length>0) renderFloorPlanEditorCanvas(z); });
    });
  }
}
function renderFloorPlanEditorCanvas(zone){
  const canvas = document.getElementById('fpEdit_'+zone.id); if(!canvas) return;
  const { scale, logicalW } = fpLayout(canvas, zone.tables);
  canvas.dataset.fpScale = scale; canvas.dataset.fpW = logicalW;
  canvas.innerHTML = zone.tables.map(t => `<div class="floorplan-table" data-table-id="${t.id}" data-x="${Number(t.pos_x||0)}" data-y="${Number(t.pos_y||0)}" style="left:${Number(t.pos_x||0)*scale}px;top:${Number(t.pos_y||0)*scale}px;">${escapeHtml(t.name)}</div>`).join('');
  canvas.querySelectorAll('.floorplan-table').forEach(elx => {
    elx.addEventListener('pointerdown', (ev) => startTableDrag(ev, elx));
  });
}
let FP_DRAG = null;
function startTableDrag(ev, elx){
  ev.preventDefault();
  const canvas = elx.parentElement;
  FP_DRAG = { elx, startX: ev.clientX, startY: ev.clientY, startLeft: Number(elx.dataset.x)||0, startTop: Number(elx.dataset.y)||0,
    scale: Number(canvas.dataset.fpScale)||1, maxX: (Number(canvas.dataset.fpW)||600) - FP_TABLE_SIZE, tableId: elx.dataset.tableId };
  elx.classList.add('dragging');
  elx.setPointerCapture(ev.pointerId);
  elx.addEventListener('pointermove', onTableDragMove);
  elx.addEventListener('pointerup', onTableDragEnd);
  elx.addEventListener('pointercancel', onTableDragEnd);
}
function onTableDragMove(ev){
  if(!FP_DRAG) return;
  const d = FP_DRAG;
  const x = Math.min(d.maxX, Math.max(0, d.startLeft + (ev.clientX - d.startX) / d.scale));
  const y = Math.max(0, d.startTop + (ev.clientY - d.startY) / d.scale);
  d.elx.dataset.x = x; d.elx.dataset.y = y;
  d.elx.style.left = (x * d.scale) + 'px';
  d.elx.style.top = (y * d.scale) + 'px';
}
async function onTableDragEnd(ev){
  if(!FP_DRAG) return;
  const { elx, tableId } = FP_DRAG;
  elx.classList.remove('dragging');
  elx.removeEventListener('pointermove', onTableDragMove);
  elx.removeEventListener('pointerup', onTableDragEnd);
  elx.removeEventListener('pointercancel', onTableDragEnd);
  const posX = Math.round(Number(elx.dataset.x)||0);
  const posY = Math.round(Number(elx.dataset.y)||0);
  FP_DRAG = null;
  const session = getSession();
  const { error } = await sb.rpc('update_table_positions', { p_token: session.session_token, p_positions: [{ id: tableId, pos_x: posX, pos_y: posY }] });
  if(error){ showToast('Konum kaydedilemedi: '+error.message); return; }
  let zoneOf = null;
  APP.config.zones.forEach(z => z.tables.forEach(t => { if(t.id===tableId){ t.pos_x = posX; t.pos_y = posY; zoneOf = z; } }));
  // Plan genişleyip/daraldıysa ölçeği yeniden hesapla.
  if(zoneOf) renderFloorPlanEditorCanvas(zoneOf);
}
/* Her masanın kendi QR token'ı var (bkz. restaurant_tables.qr_token) - bu
   linki tarayan müşteri login gerektirmeyen /menu/ sayfasında o masanın
   menüsünü görür ve sipariş isteği gönderebilir (bkz. get_public_menu/
   submit_customer_order_request, personel tarafında onay için bkz.
   refreshCustomerOrderRequests). */
function showTableQr(tableId, qrToken){
  const tableName = tableNameForId(tableId);
  const url = window.location.origin + '/menu/?t=' + qrToken;
  const qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(url);
  const bg = document.createElement('div');
  bg.id = 'tableQrModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:320px;width:100%;text-align:center;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">${escapeHtml(tableName)}</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','tableQrModalBg')}>✕</span></div>
    <img src="${qrImgUrl}" alt="QR" style="width:100%;max-width:260px;margin:14px 0;border-radius:8px;background:#fff;padding:8px;">
    <p class="muted" style="font-size:12px;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(url)}</p>
    <button style="margin-top:8px;" ${act('copyText', url, 'Link kopyalandı ✓')}>🔗 Linki Kopyala</button>
  </div>`;
  document.body.appendChild(bg);
}

/* --- Toplu QR: tüm masaların QR kodları tek sayfada (yazdır / PDF) ya da PNG olarak indirme --- */
function allTablesForQr(){
  const natural = (a, b) => String(a.name).localeCompare(String(b.name), 'tr', { numeric:true, sensitivity:'base' });
  return (APP.config.zones || []).flatMap(z => (z.tables || []).slice().sort(natural).map(t => ({ zone: z.name, name: t.name, url: window.location.origin + '/menu/?t=' + t.qr_token })));
}
const qrImg = (url, size) => 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=8&data=' + encodeURIComponent(url);
function showAllTableQrs(){
  const list = allTablesForQr(); if(!list.length){ showToast('Henüz masa yok'); return; }
  removeEl('qrSheetBg');
  const bg = document.createElement('div'); bg.id = 'qrSheetBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:120;padding:5vh 16px 16px;overflow-y:auto;';
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  const zones = [...new Set(list.map(t => t.zone))];
  bg.innerHTML = `<div class="qr-sheet-box" style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:18px;max-width:980px;width:100%;">
    <div class="qr-toolbar" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <h2 style="margin:0;">▦ Masa QR Kodları <span class="muted" style="font-size:13px;font-weight:600;">(${list.length})</span></h2>
      <div style="display:flex;gap:8px;">
        <button type="button" style="width:auto;margin:0;" ${act('printAllTableQrs')}>🖨️ Yazdır / PDF</button>
        <button type="button" class="ghost-btn" style="width:auto;margin:0;" ${act('downloadAllTableQrs')}>⬇ İndir</button>
        <button type="button" class="ghost-btn" style="width:auto;margin:0;" ${act('removeEl', 'qrSheetBg')}>✕</button>
      </div>
    </div>
    ${zones.map(z => `<h3 style="margin:14px 0 8px;font-size:14px;">${escapeHtml(z)}</h3><div class="qr-sheet">${list.filter(t => t.zone === z).map(t => `<div class="qr-cell"><img src="${qrImg(t.url, 300)}" alt=""><b>${escapeHtml(t.name)}</b><small>${escapeHtml(z)}</small></div>`).join('')}</div>`).join('')}
  </div>`;
  document.body.appendChild(bg);
}
function printAllTableQrs(){
  document.body.classList.add('printing-qr');
  const done = () => { document.body.classList.remove('printing-qr'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 300);
}
// Her masa için ayrı PNG (QR + masa adı) indirilir; görseller CORS'lu yüklenip tuvale çizilir.
async function downloadAllTableQrs(){
  const list = allTablesForQr(); if(!list.length){ showToast('Henüz masa yok'); return; }
  if(!await uiConfirm(list.length + ' QR kodu PNG olarak indirilecek. Tarayıcı "birden fazla dosya indirme" izni sorarsa İzin Ver deyin.')) return;
  const load = (src) => new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; });
  let ok = 0;
  await withLoadingOverlay((async () => {
    for(const t of list){
      try{
        const im = await load(qrImg(t.url, 600));
        const c = document.createElement('canvas'); c.width = 640; c.height = 760;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(im, 20, 20, 600, 600);
        g.fillStyle = '#111'; g.textAlign = 'center'; g.font = 'bold 44px sans-serif'; g.fillText(t.name, 320, 680);
        g.fillStyle = '#666'; g.font = '26px sans-serif'; g.fillText(t.zone, 320, 724);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = (t.zone + '-' + t.name).replace(/[\\/:*?"<>|]+/g, '_') + '-QR.png';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        ok++; await new Promise(r => setTimeout(r, 250));
      }catch(e){}
    }
  })());
  if(ok < list.length) alert(ok + '/' + list.length + ' QR indirildi. İndirilemeyenler için "Tüm QR Kodlarını Göster / Yazdır" ile PDF olarak kaydedebilirsiniz.');
  else showToast(ok + ' QR kodu indirildi ✓');
}

/* --- Ürünler --- */
/* KDV: fiyatlar KDV dahildir. Ürün oranı boşsa işletmenin varsayılan oranı kullanılır.
   Türkiye'de lokanta/kafe yiyecek-içecek %10, alkollü içecek %20. */
const VAT_RATES = [0, 1, 10, 20];
function vatSelectHtml(id, value, withDefault, extraAttr){
  const def = APP.config.default_vat_rate ?? 10;
  const opts = (withDefault ? [`<option value="" ${value==null?'selected':''}>Varsayılan (%${def})</option>`] : [])
    .concat(VAT_RATES.map(r => `<option value="${r}" ${value!=null && Number(value)===r?'selected':''}>%${r}</option>`));
  if(value!=null && !VAT_RATES.includes(Number(value))) opts.push(`<option value="${value}" selected>%${value}</option>`);
  return `<select id="${id}" ${extraAttr||''}>${opts.join('')}</select>`;
}
async function saveDefaultVat(v){
  const session = getSession();
  const { error } = await sb.rpc('update_vat_settings', { p_token: session.session_token, p_default_rate: Number(v) });
  if(error){ alert(error.message); return; }
  APP.config.default_vat_rate = Number(v);
  showToast('Varsayılan KDV %' + v + ' olarak kaydedildi ✓');
  renderSettingsView(document.getElementById('main'), session);
}
// Ürünün menü seçenekleri: tüm menüler (yanında bağlı olduğu istasyon).
function prodMenuOptions(current){
  const st = (id) => ((APP.config.stations||[]).find(x => x.id === id) || {}).name;
  return `<option value="">— Menü yok —</option>` + (APP.config.menus||[]).map(m => `<option value="${m.id}" ${m.id===current?'selected':''}>${escapeHtml(m.name)}${m.station_id ? ' · ' + escapeHtml(st(m.station_id)||'') : ' · istasyonsuz'}</option>`).join('');
}
function prodCatOptions(stationId, current){
  const st = (APP.config.stations||[]).find(s => s.id === stationId) || {};
  const cats = (st.categories || []).slice();
  if(current && !cats.includes(current)) cats.push(current);
  return `<option value="">—</option>` + cats.map(c => `<option value="${escapeAttr(c)}" ${c===current?'selected':''}>${escapeHtml(c)}</option>`).join('');
}
function prodStationChanged(stationId, pid){
  const sel = document.getElementById(pid ? 'pr_cat_'+pid : 'np_cat'); if(sel) sel.innerHTML = prodCatOptions(stationId, null);
}
function renderProductsSettings(el, session){
  const stations = APP.config.stations || [];
  const products = APP.config.products || [];

  const rowsFor = (list) => list.map(p => `
        <tr data-pid="${p.id}" style="${p.available===false?'opacity:.6;':''}">
          <td><input type="checkbox" class="prod-sel" value="${p.id}" style="width:auto;margin:0;" ${actOn('change','updateProdSelection',[])}></td>
          <td class="col-name"><input value="${escapeAttr(p.name)}" id="pr_name_${p.id}"></td>
          <td class="col-name"><select id="pr_st_${p.id}" ${p.menu_id ? 'title="İstasyon normalde menüden gelir; burada değiştirirseniz bu ürün için ayrı istasyon kullanılır. Menünün istasyonunu seçerseniz tekrar menüye bağlanır."' : ''}>
            ${!p.station_id ? '<option value="" selected>— İstasyon yok —</option>' : ''}
            ${stations.map(s => `<option value="${s.id}" ${s.id===p.station_id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
          </select></td>
          <td class="col-num"><input type="number" value="${p.price}" id="pr_price_${p.id}"></td>
          <td class="col-num"><input type="number" value="${p.cost}" id="pr_cost_${p.id}"></td>
          <td class="col-name" style="min-width:150px;"><select id="pr_menu_${p.id}">${prodMenuOptions(p.menu_id)}</select></td>
          <td class="col-num" style="min-width:110px;">${vatSelectHtml('pr_vat_'+p.id, p.vat_rate, true)}</td>
          <td class="col-num">
            ${(p.recipe && p.recipe.length>0)
              ? `<span class="muted" style="font-size:12px;">Reçeteli (${p.available_qty==null?'?':p.available_qty} porsiyon)</span>`
              : `<input type="number" value="${p.stock==null?'':p.stock}" id="pr_stock_${p.id}" placeholder="Sınırsız">`}
          </td>
          <td style="text-align:center;"><input type="checkbox" class="prod-print" id="pr_print_${p.id}" style="width:auto;margin:0;" title="İşaretliyse mutfak fişine yazdırılır" ${p.print_ticket===false?'':'checked'}></td>
          <td><button type="button" class="prod-avail ${p.available===false?'off':'on'}" title="Tıklayınca ${p.available===false?'satışa açılır':'satışa kapanır'}" ${act('toggleProductAvailable', p.id)}><i></i>${p.available===false?'Kapalı':'Satışta'}</button></td>
          <td><div class="act-row">
            <button type="button" class="act-btn act-recipe" ${act('openRecipeModal', p.id)}><b>📋</b><span>Reçete</span></button>
            <button type="button" class="act-btn act-recipe" title="Ekstralar (örn. Ek Döner)" ${act('openExtrasModal', p.id)}><b>➕</b><span>Ekstra${productExtras(p.id).length ? ' ('+productExtras(p.id).length+')' : ''}</span></button>
            ${hasFeature('multilang_menu') ? `<button type="button" class="act-btn act-lang" ${act('openTranslationsModal', p.id)} title="QR menüde diğer dillerde gösterilecek isim"><b>🌐</b><span>Çeviri</span></button>` : ''}
          </div></td>
        </tr>`).join('');

  // İstasyon içinde ürünler alt menülere göre gruplanır (istasyondaki sıra, sonra alt menüsüzler).
  const groupedRows = (list, cats) => {
    const used = [...new Set(list.map(p => p.category).filter(Boolean))];
    const order = [...(cats||[]).filter(c => used.includes(c)), ...used.filter(c => !(cats||[]).includes(c))];
    if(!order.length) return rowsFor(list);
    const sub = (t, n) => `<tr class="prod-cat-row"><td colspan="12" style="padding:12px 4px 4px;background:transparent;border:0;"><b style="font-size:12.5px;color:var(--accent);text-transform:uppercase;letter-spacing:.03em;">${escapeHtml(t)}</b> <span class="muted" style="font-size:12px;">(${n})</span></td></tr>`;
    const none = list.filter(p => !p.category);
    return order.map(c => { const l = list.filter(p => p.category === c); return sub(c, l.length) + rowsFor(l); }).join('') + (none.length ? sub('Alt menüsüz', none.length) + rowsFor(none) : '');
  };
  const cardsFor = (list) => list.map(p => {
    const price = Number(p.price)||0, cost = Number(p.cost)||0, m = price>0 ? Math.round((price-cost)/price*100) : 0;
    const rec = p.recipe && p.recipe.length>0, q = rec ? p.available_qty : p.stock, low = q!=null && q<=5;
    const nx = productExtras(p.id).length;
    return `<div class="pcard ${p.available===false?'off':''}" data-name="${escapeAttr(String(p.name||'').toLocaleLowerCase('tr'))}">
      <div class="pcard-top"><input type="checkbox" class="prod-sel" value="${p.id}" ${actOn('change','updateProdSelection',[])}>
        <b class="pcard-name">${escapeHtml(p.name)}</b>
        <button type="button" class="prod-avail ${p.available===false?'off':'on'}" title="Tıklayınca ${p.available===false?'satışa açılır':'satışa kapanır'}" ${act('toggleProductAvailable', p.id)}><i></i>${p.available===false?'Kapalı':'Satışta'}</button></div>
      <div class="pcard-price">${money(price)}</div>
      <div class="pcard-margin" title="Kâr marjı"><div class="pcard-mbar"><i style="width:${Math.max(0,Math.min(100,m))}%;background:${m>=60?'var(--ok,#22c55e)':m>=35?'var(--c3)':'var(--danger,#ef4444)'};"></i></div><span>Maliyet ${money(cost)} · <b>%${m}</b> marj</span></div>
      <div class="pcard-chips">
        <span class="pchip ${low?'warn':''}">${rec ? '📋 '+(q==null?'?':q)+' porsiyon' : (q==null ? '∞ Stok sınırsız' : '📦 '+q+' stok')}</span>
        ${p.category ? `<span class="pchip">${escapeHtml(p.category)}</span>` : ''}
        ${p.print_ticket===false ? '<span class="pchip">🖨️ fiş yok</span>' : ''}
        ${p.vat_rate!=null ? `<span class="pchip">KDV %${p.vat_rate}</span>` : ''}
      </div>
      <div class="pcard-acts">
        <button type="button" class="pc-btn" ${act('openRecipeModal', p.id)}>📋 Reçete</button>
        <button type="button" class="pc-btn" ${act('openExtrasModal', p.id)}>➕ Ekstra${nx ? ' ('+nx+')' : ''}</button>
        ${hasFeature('multilang_menu') ? `<button type="button" class="pc-btn" ${act('openTranslationsModal', p.id)}>🌐</button>` : ''}
        <button type="button" class="pc-btn pc-edit" ${act('editProductRow', p.id)}>✏️ Düzenle</button>
      </div>
    </div>`; }).join('');
  const cardMode = APP.prodView !== 'table';
  const groupHtml = (title, colorDot, list, cats, menuId, stLabel) => list.length===0 ? '' : cardMode ? `
    <details class="prod-grp" open style="--g:${colorDot||'var(--muted)'};">
      <summary><span class="prod-grp-dot"></span><b>${escapeHtml(title)}</b><span class="muted">${list.length} ürün${stLabel ? ' · 🍳 '+escapeHtml(stLabel) : ''}${list.some(p => p.available===false) ? ' · '+list.filter(p => p.available===false).length+' kapalı' : ''}</span><span style="flex:1;"></span>${menuId ? menuAvailBtn(menuId) : ''}</summary>
      <div class="pcard-grid">${cardsFor(list)}</div>
    </details>` : `
    <details class="prod-grp" open style="--g:${colorDot||'var(--muted)'};">
      <summary><span class="prod-grp-dot"></span><b>${escapeHtml(title)}</b><span class="muted">${list.length} ürün${stLabel ? ' · 🍳 '+escapeHtml(stLabel) : ''}${list.some(p => p.available===false) ? ' · '+list.filter(p => p.available===false).length+' kapalı' : ''}</span><span style="flex:1;"></span>${menuId ? menuAvailBtn(menuId) : ''}</summary>
      <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th style="width:36px;"><input type="checkbox" style="width:auto;margin:0;" title="Bu gruptakilerin tümünü seç" ${actOn('change','selectProdGroup',['$this'])}></th><th>Ürün Adı</th><th>İstasyon</th><th>Fiyat</th><th>Maliyet</th><th title="Ürünün menüsü; istasyon menüden gelir">Menü</th><th title="Fiyata dahil KDV oranı">KDV</th><th>Stok</th><th title="Mutfak fişine yazdırılsın mı?">🖨️ Fiş</th><th>Durum</th><th></th></tr></thead>
        <tbody>${rowsFor(list)}</tbody>
      </table>
      </div>
    </details>`;

  const unassigned = products.filter(p => !stations.some(s => s.id===p.station_id));

  const sale = products.filter(p => p.available!==false).length;
  const priced = products.filter(p => Number(p.price)>0);
  const avgM = priced.length ? Math.round(priced.reduce((a,p) => a + (p.price-(p.cost||0))/p.price, 0)/priced.length*100) : 0;
  const pf = APP.prodFilter || 'all';
  const mOf = (p) => Number(p.price)>0 ? (p.price-(p.cost||0))/p.price : 1;
  const isLow = (p) => { const q = p.recipe && p.recipe.length ? p.available_qty : p.stock; return q!=null && q<=5; };
  const lowMN = products.filter(p => Number(p.price)>0 && mOf(p) < .35).length;
  const shown = pf==='on' ? products.filter(p => p.available!==false) : pf==='off' ? products.filter(p => p.available===false)
    : pf==='low' ? products.filter(isLow) : pf==='lowmargin' ? products.filter(p => Number(p.price)>0 && mOf(p) < .35) : products;
  const lowN = products.filter(p => { const q = p.recipe && p.recipe.length ? p.available_qty : p.stock; return q!=null && q<=5; }).length;
  el.innerHTML = `<div class="box" style="max-width:none;">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><h2 style="margin:0;">Ürünler</h2><span style="flex:1;"></span>
      <div class="seg">${[['cards','▦ Kart'],['table','☰ Tablo']].map(([k,l]) => `<button type="button" class="${(cardMode?'cards':'table')===k?'on':''}" ${act('setProdView', k)}>${l}</button>`).join('')}</div></div>
    <div class="order-summary prod-summary" style="margin:12px 0 14px;">
      <div class="os-chip os-click ${pf==='all'?'on':''}" role="button" title="Listeyi filtrele" ${act('setProdFilter', 'all')} style="--oc:var(--c1);"><span class="os-ic">🍔</span><div><b>${products.length}</b><small>Ürün</small></div></div>
      <div class="os-chip os-click ${pf==='on'?'on':''}" role="button" title="Listeyi filtrele" ${act('setProdFilter', 'on')} style="--oc:var(--ok,#22c55e);"><span class="os-ic">✅</span><div><b>${sale}</b><small>Satışta</small></div></div>
      <div class="os-chip os-click ${pf==='off'?'on':''}" role="button" title="Listeyi filtrele" ${act('setProdFilter', 'off')} style="--oc:var(--danger,#ef4444);"><span class="os-ic">⛔</span><div><b>${products.length-sale}</b><small>Kapalı</small></div></div>
      <div class="os-chip os-click ${pf==='lowmargin'?'on':''}" role="button" title="Listeyi filtrele" ${act('setProdFilter', 'lowmargin')} style="--oc:var(--c2);"><span class="os-ic">📈</span><div><b>${lowMN}</b><small>Düşük marj (ort. %${avgM})</small></div></div>
      <div class="os-chip os-click ${pf==='low'?'on':''}" role="button" title="Listeyi filtrele" ${act('setProdFilter', 'low')} style="--oc:var(--c3);"><span class="os-ic">⚠️</span><div><b>${lowN}</b><small>Stok azalan</small></div></div>
    </div>
    ${pf!=='all' ? `<div class="pf-note">🔎 <b>${{on:'Satıştaki',off:'Kapalı',low:'Stoğu azalan',lowmargin:'Düşük marjlı'}[pf]} ürünler</b> gösteriliyor (${shown.length})<button type="button" class="pc-btn" ${act('setProdFilter', 'all')}>✕ Tümünü göster</button></div>` : ''}
    ${pf!=='all' && !shown.length ? '<div class="empty-state"><div style="font-size:38px;">🎉</div><p class="muted">Bu filtrede ürün yok.</p></div>' : ''}
    <details class="prod-info"><summary>ℹ️ Nasıl çalışır · Varsayılan KDV: %${APP.config.default_vat_rate ?? 10}</summary>
    <p class="muted" style="text-align:left;margin:-6px 0 12px;font-size:13px;"><b>Menü</b>: ürünün menüsü (menüleri ve hangi istasyona gideceklerini <b>Menüler & İstasyonlar</b> sekmesinde ayarlayın); ürünün istasyonu menüden gelir. <b>🖨️ Fiş</b> işareti kaldırılan ürünler mutfak fişine yazdırılmaz (ekranda yine görünür).</p>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px;">
      <label style="margin:0;font-weight:700;font-size:13.5px;">Varsayılan KDV oranı</label>
      <div style="width:130px;">${vatSelectHtml('defaultVatSel', APP.config.default_vat_rate ?? 10, false, `${actOn('change','saveDefaultVat',['$value'])} style="margin:0;"`)}</div>
      <span class="muted" style="font-size:12.5px;">Fiyatlar KDV dahildir. Lokantada yiyecek-içecek %10, alkollü içecek %20. Ürüne ayrı oran seçilmezse bu oran kullanılır.</span>
    </div>
    <p class="muted" style="text-align:left;margin:0 0 16px;">Stok alanını boş bırakırsanız o ürün için stok takibi yapılmaz. Satırları değiştirip <b>Kaydet</b>'e basın; satışa açmak / kapatmak / silmek için satırları seçin.</p>
    </details>
    <div class="add-row-panel">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 10px;">
        ${listSearchHtml('products', 'Ürün ara…').replace('margin:0 0 12px;','margin:0;')}
        ${sheetBtnHtml('prodSheet','+ Yeni Ürün')}
        <span style="flex:1;"></span>
        <div class="act-row">
          <button type="button" class="act-btn act-save" id="prodSaveAllBtn" ${act('saveAllProducts')} disabled>${ICON_SAVE}<span>Kaydet</span></button>
          <button type="button" class="act-btn act-open" data-prod-sel ${act('bulkProductAvailable', true)} disabled><b>✓</b><span>Satışa Aç</span></button>
          <button type="button" class="act-btn act-close" data-prod-sel ${act('bulkProductAvailable', false)} disabled><b>✕</b><span>Satışa Kapat</span></button>
          <button type="button" class="act-btn act-delete" data-prod-sel ${act('bulkDeleteProducts')} disabled>${ICON_TRASH}<span>Sil</span></button>
        </div>
      </div>
      <p class="muted" id="prodSelInfo" style="text-align:left;font-size:12.5px;margin:-4px 0 8px;text-transform:none;letter-spacing:0;font-weight:400;min-height:0;"></p>
${sheetHtml('prodSheet', '🍽️', 'Yeni Ürün', `
      <div class="fsheet-grid">
        <div class="field-group wide"><label>Ürün Adı</label><input id="np_name" placeholder="örn. Izgara Köfte"></div>
        <div class="field-group"><label>Menü</label><select id="np_menu">${prodMenuOptions((APP.config.menus[0]||{}).id)}</select></div>
        <div class="field-group"><label>KDV</label>${vatSelectHtml('np_vat', null, true, '')}</div>
        <div class="field-group"><label>Fiyat (₺)</label><input type="number" id="np_price" placeholder="0" inputmode="decimal"></div>
        <div class="field-group"><label>Maliyet (₺)</label><input type="number" id="np_cost" placeholder="0" inputmode="decimal"></div>
        <div class="field-group wide"><label>Stok</label><input type="number" id="np_stock" placeholder="Sınırsız" title="Boş = sınırsız; reçete eklerseniz bu alan kullanılmaz"></div>
      </div>
      ${(APP.config.ingredients||[]).length===0 ? '' : `
      <div class="rvf-t" style="margin-top:14px;">🥕 Reçete (opsiyonel)</div>
      <div style="display:grid;grid-template-columns:1fr 90px auto;gap:8px;align-items:end;">
        <select id="npRecipeIngSelect" style="margin:0;">${APP.config.ingredients.map(i => `<option value="${i.id}" data-unit="${i.unit}" data-name="${escapeAttr(i.name)}">${escapeHtml(i.name)} (${i.unit})</option>`).join('')}</select>
        <input type="number" step="0.01" id="npRecipeQtyInput" placeholder="Miktar" style="margin:0;">
        <button type="button" class="ghost-btn" style="width:auto;margin:0;" ${act('addNewProductRecipeItem')}>＋ Ekle</button>
      </div>`}
      <div id="npRecipeItemsBox"></div>
      <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','prodSheet')}>Vazgeç</button><button ${act('addProduct')}>+ Ürün Ekle</button></div>`, 'var(--c1)')}
    </div>
    <div id="prodGroups" ${actOn('input','markProdDirty',['$event'])} ${actOn('change','markProdDirty',['$event'])}>
    ${(APP.config.menus||[]).map(m => { const st = stations.find(x => x.id===m.station_id); return groupHtml(m.name, st ? st.color : null, shown.filter(p => p.menu_id===m.id), null, m.id, st ? st.name : 'istasyon seçilmedi'); }).join('')}
    ${groupHtml('Menüsüz', null, shown.filter(p => !p.menu_id || !(APP.config.menus||[]).some(m => m.id===p.menu_id)))}
    </div>

  </div>`;
  NEW_PRODUCT_RECIPE_DRAFT = [];
  renderNewProductRecipeItems();
}
let NEW_PRODUCT_RECIPE_DRAFT = [];
function renderNewProductRecipeItems(){
  const el = document.getElementById('npRecipeItemsBox'); if(!el) return;
  // Reçete kalemleri formun altında küçük etiketler olarak (boşsa yer kaplamaz).
  el.innerHTML = NEW_PRODUCT_RECIPE_DRAFT.length===0 ? '' : `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center;">
    <span class="muted" style="font-size:12px;">Reçete:</span>
    ${NEW_PRODUCT_RECIPE_DRAFT.map((r,idx) => `<span class="role-badge" style="display:inline-flex;gap:6px;align-items:center;">${escapeHtml(r.ingredient_name)}: <b>${r.qty_per_unit} ${escapeHtml(r.ingredient_unit)}</b><span style="cursor:pointer;color:var(--red);" title="Çıkar" ${act('removeNewProductRecipeItem', idx)}>✕</span></span>`).join('')}</div>`;
}
function addNewProductRecipeItem(){
  const sel = document.getElementById('npRecipeIngSelect');
  if(!sel || !sel.value) return;
  const qty = parseFloat(document.getElementById('npRecipeQtyInput').value);
  if(!qty || qty<=0){ alert('Geçerli bir miktar girin'); return; }
  const opt = sel.options[sel.selectedIndex];
  const existing = NEW_PRODUCT_RECIPE_DRAFT.find(r => r.ingredient_id===sel.value);
  if(existing){ existing.qty_per_unit = qty; }
  else{ NEW_PRODUCT_RECIPE_DRAFT.push({ ingredient_id: sel.value, qty_per_unit: qty, ingredient_name: opt.dataset.name, ingredient_unit: opt.dataset.unit }); }
  document.getElementById('npRecipeQtyInput').value = '';
  renderNewProductRecipeItems();
}
function removeNewProductRecipeItem(idx){ NEW_PRODUCT_RECIPE_DRAFT.splice(idx,1); renderNewProductRecipeItems(); }
/* Ürünler: değişen satırlar tek düğmeyle kaydedilir; satışa aç/kapat ve silme seçilen satırlara toplu uygulanır. */
function markProdDirty(e){
  if(!e.target || (e.target.type==='checkbox' && !e.target.classList.contains('prod-print'))) return;
  const tr = e.target.closest('tr[data-pid]'); if(!tr) return;
  tr.dataset.dirty = '1'; tr.classList.add('is-dirty');
  updateProdSelection();
}
function setProdFilter(k){ APP.prodFilter = (APP.prodFilter===k ? 'all' : k); renderSettingsContent(getSession()); }
function setProdView(v){ APP.prodView = v; renderSettingsContent(getSession()); }
// Kart görünümünde "Düzenle": sağdan açılan düzenleme paneli.
function editProductRow(pid){
  const p = (APP.config.products||[]).find(x => x.id===pid); if(!p) return;
  closeProdDrawer();
  const rec = p.recipe && p.recipe.length>0, stations = APP.config.stations || [];
  const d = document.createElement('div'); d.id = 'prodDrawer'; d.className = 'pdrawer-wrap';
  d.innerHTML = `<div class="pdrawer-bg" ${act('closeProdDrawer')}></div>
    <aside class="pdrawer" data-pid="${p.id}">
      <div class="pdrawer-head"><div><small class="muted">Ürün düzenle</small><h3>${escapeHtml(p.name)}</h3></div><button type="button" class="pdrawer-x" ${act('closeProdDrawer')}>✕</button></div>
      <div class="pdrawer-body" ${actOn('input','prodDrawerCalc',[])} ${actOn('change','prodDrawerCalc',[])}>
        <label>Ürün Adı</label><input id="ed_name" value="${escapeAttr(p.name)}">
        <div class="pdrawer-2"><div><label>Fiyat (₺)</label><input type="number" id="ed_price" value="${p.price}"></div><div><label>Maliyet (₺)</label><input type="number" id="ed_cost" value="${p.cost}"></div></div>
        <div class="pdrawer-margin"><div class="pcard-mbar"><i id="ed_mbar"></i></div><span id="ed_mtxt"></span></div>
        <label>Menü</label><select id="ed_menu">${prodMenuOptions(p.menu_id)}</select>
        <label>İstasyon</label><select id="ed_st">${!p.station_id ? '<option value="" selected>— İstasyon yok —</option>' : ''}${stations.map(x => `<option value="${x.id}" ${x.id===p.station_id?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}</select>
        <div class="pdrawer-2"><div><label>KDV</label>${vatSelectHtml('ed_vat', p.vat_rate, true)}</div>
          <div><label>Stok</label>${rec ? `<input disabled value="Reçeteli: ${p.available_qty==null?'?':p.available_qty} porsiyon">` : `<input type="number" id="ed_stock" value="${p.stock==null?'':p.stock}" placeholder="Sınırsız">`}</div></div>
        <label class="pdrawer-check"><input type="checkbox" id="ed_print" ${p.print_ticket===false?'':'checked'}> 🖨️ Mutfak fişine yazdır</label>
        <div class="pdrawer-links">
          ${APP.view!=='settings' ? `<button type="button" class="pc-btn" ${act('goEditProductInSettings', p.id)}>⚙️ Tüm ayarlar</button>` : ''}
          ${APP.view==='settings' ? `<button type="button" class="pc-btn" ${act('openRecipeModal', p.id)}>📋 Reçete</button>` : ''}
          ${APP.view==='settings' ? `<button type="button" class="pc-btn" ${act('openExtrasModal', p.id)}>➕ Ekstralar</button>` : ''}
          <button type="button" class="pc-btn" ${act('toggleProductAvailable', p.id)}>${p.available===false?'✓ Satışa Aç':'✕ Satışa Kapat'}</button>
        </div>
      </div>
      <div class="pdrawer-foot"><button type="button" class="ghost-btn" ${act('closeProdDrawer')}>Vazgeç</button><button type="button" ${act('saveProdDrawer')}>Kaydet</button></div>
    </aside>`;
  document.body.appendChild(d);
  prodDrawerCalc();
  requestAnimationFrame(() => d.classList.add('open'));
}
function goEditProductInSettings(pid){ closeProdDrawer(); if(typeof closeTableModal==='function' && document.getElementById('prodPick')) closeTableModal(); APP.settingsTab = 'products'; APP.productsSubTab = 'products'; goToView('settings'); setTimeout(() => editProductRow(pid), 600); }
// Sipariş Al'da yönetici bir ürüne uzun basınca (ya da sağ tıklayınca) hızlı düzenleme açılır.
(function(){
  let timer = null, fired = false;
  const canEdit = () => { const s = getSession(); return !!(s && canManage(s, 'settings_products')); };
  const open = (card) => { if(!APP.config || !canEdit()) return false; const pid = card.dataset.pid; if(!(APP.config.products||[]).some(p => p.id===pid)) return false; fired = true; try{ navigator.vibrate && navigator.vibrate(30); }catch(e){} editProductRow(pid); return true; };
  document.addEventListener('pointerdown', (e) => {
    const card = e.target.closest && e.target.closest('.prod-pick-card[data-pid]'); fired = false; clearTimeout(timer);
    if(!card || e.target.closest('button')) return;
    timer = setTimeout(() => open(card), 600);
  });
  ['pointerup','pointercancel','pointermove'].forEach(ev => document.addEventListener(ev, (e) => { if(ev !== 'pointermove' || (e.movementX*e.movementX + e.movementY*e.movementY) > 25) clearTimeout(timer); }));
  document.addEventListener('contextmenu', (e) => { const card = e.target.closest && e.target.closest('.prod-pick-card[data-pid]'); if(card && open(card)) e.preventDefault(); });
  // Uzun basmanın ardından gelen tıklama ürünü sepete eklemesin.
  document.addEventListener('click', (e) => { if(fired && e.target.closest && e.target.closest('.prod-pick-card')){ e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
})();
function closeProdDrawer(){ const d = document.getElementById('prodDrawer'); if(d) d.remove(); }
function prodDrawerCalc(){
  const pr = parseFloat((document.getElementById('ed_price')||{}).value)||0, co = parseFloat((document.getElementById('ed_cost')||{}).value)||0;
  const m = pr>0 ? Math.round((pr-co)/pr*100) : 0, bar = document.getElementById('ed_mbar'), t = document.getElementById('ed_mtxt'); if(!bar) return;
  bar.style.width = Math.max(0,Math.min(100,m))+'%'; bar.style.background = m>=60?'var(--ok,#22c55e)':m>=35?'var(--c3)':'var(--danger,#ef4444)';
  t.innerHTML = `Kâr: <b>${money(pr-co)}</b> · <b>%${m}</b> marj`;
}
async function saveProdDrawer(){
  const box = document.querySelector('#prodDrawer .pdrawer'); if(!box) return;
  const id = box.dataset.pid, p = APP.config.products.find(x => x.id===id); if(!p) return;
  const v = (k) => document.getElementById('ed_'+k);
  const name = v('name').value.trim(); if(!name){ alert('Ürün adı boş olamaz'); return; }
  let stock = p.stock; if(v('stock')){ const raw = v('stock').value.trim(); stock = raw==='' ? null : parseInt(raw,10); }
  const vat = v('vat').value !== '' ? Number(v('vat').value) : null, menu = v('menu').value || null, pr = v('print').checked;
  const errors = await runProductBatch([{ name }], async (s) => {
    const res = await sb.rpc('upsert_product', Object.assign({ p_token: s.session_token }, productPayload(p, { p_name: name, p_station_id: v('st').value || null,
      p_price: parseFloat(v('price').value)||0, p_cost: parseFloat(v('cost').value)||0, p_stock: stock })));
    if(res.error) return res;
    if(pr !== (p.print_ticket !== false)){ const o = await sb.rpc('set_product_options', { p_token: s.session_token, p_product_id: id, p_category: p.category || null, p_print_ticket: pr }); if(o.error) return o; }
    if(menu !== (p.menu_id || null)){ const o = await sb.rpc('set_product_menu', { p_token: s.session_token, p_product_id: id, p_menu_id: menu }); if(o.error) return o; }
    if((p.vat_rate ?? null) === vat) return res;
    return sb.rpc('set_product_vat', { p_token: s.session_token, p_product_id: id, p_rate: vat });
  });
  if(errors.length){ alert('Kaydedilemedi:\n\n' + errors.join('\n')); return; }
  closeProdDrawer(); showToast(name + ' kaydedildi ✓');
}
function selectedProductIds(){ return [...document.querySelectorAll('.prod-sel:checked')].map(b => b.value); }
function selectProdGroup(box){
  box.closest('table').querySelectorAll('tbody tr').forEach(tr => { const c = tr.querySelector('.prod-sel'); if(c && tr.style.display!=='none') c.checked = box.checked; });
  updateProdSelection();
}
function updateProdSelection(){
  const n = selectedProductIds().length, dirty = document.querySelectorAll('tr[data-pid][data-dirty]').length;
  document.querySelectorAll('[data-prod-sel]').forEach(b => { b.disabled = !n; });
  const save = document.getElementById('prodSaveAllBtn');
  if(save){ save.disabled = !dirty; save.querySelector('span').textContent = dirty ? `Kaydet (${dirty})` : 'Kaydet'; }
  const info = document.getElementById('prodSelInfo');
  if(info) info.innerHTML = [n ? `<b>${n}</b> ürün seçili` : '', dirty ? `<b>${dirty}</b> üründe kaydedilmemiş değişiklik` : ''].filter(Boolean).join(' · ');
}
/* Menünün tüm ürünlerini tek tuşla satışa açma/kapatma. Ürünlerin hepsi satıştaysa
   "Satışa Kapat", en az biri kapalıysa "Satışa Aç" gösterilir. */
function menuAvailBtn(menuId){
  const list = (APP.config.products || []).filter(p => p.menu_id === menuId);
  if(!list.length) return `<button type="button" class="act-btn act-close" disabled title="Bu menüde henüz ürün yok; ürün ekleyince satışa açıp kapatabilirsiniz"><b>✕</b><span>Satışa Kapat</span></button>`;
  const closed = list.filter(p => p.available === false).length;
  return closed
    ? `<button type="button" class="act-btn act-open" title="${closed}/${list.length} ürün satışta değil" ${act('setMenuAvailable', menuId, true)}><b>✓</b><span>Satışa Aç</span></button>`
    : `<button type="button" class="act-btn act-close" ${act('setMenuAvailable', menuId, false)}><b>✕</b><span>Satışa Kapat</span></button>`;
}
async function setMenuAvailable(menuId, open){
  const menu = (APP.config.menus || []).find(m => m.id === menuId);
  const list = (APP.config.products || []).filter(p => p.menu_id === menuId && (p.available !== false) !== open);
  if(!list.length) return;
  if(!open && !await uiConfirm((menu ? menu.name : 'Bu menü') + ' menüsündeki ' + list.length + ' ürün satışa kapatılsın mı?')) return;
  const errors = await runProductBatch(list, (s, p) => sb.rpc('upsert_product', Object.assign({ p_token: s.session_token }, productPayload(p, { p_available: open }))));
  if(errors.length) alert('Bazı ürünler güncellenemedi:\n\n' + errors.join('\n'));
  else showToast((menu ? menu.name : 'Menü') + ': ' + list.length + ' ürün ' + (open ? 'satışa açıldı ✓' : 'satışa kapatıldı'));
}
function productPayload(p, over){
  return Object.assign({ p_id: p.id, p_station_id: p.station_id, p_name: p.name, p_price: p.price, p_cost: p.cost, p_stock: p.stock, p_available: p.available!==false }, over || {});
}
async function runProductBatch(list, fn){
  const session = getSession(); const errors = [];
  await withLoadingOverlay((async () => {
    for(const item of list){ const { error } = await fn(session, item); if(error) errors.push((item.name || '') + ': ' + (item.friendly ? friendlyDeleteError(error.message) : error.message)); }
  })());
  // Sipariş Al'daki uzun basma ile açılan düzenlemede ekran Ayarlar'a geçmez; yalnızca veriler tazelenir.
  if(APP.view==='settings') renderSettingsView(document.getElementById('main'), session);
  else { try{ const { data } = await sb.rpc('get_restaurant_config', { p_token: session.session_token }); if(data) APP.config = data; }catch(e){} if(document.getElementById('prodPick') && APP.ppLast) renderProductPick(APP.ppLast.stationId, APP.ppLast.tableId); else if(typeof softRerender==='function') softRerender(session, true); }
  return errors;
}
async function saveAllProducts(){
  const rows = [...document.querySelectorAll('tr[data-pid][data-dirty]')].map(tr => {
    const id = tr.dataset.pid, p = APP.config.products.find(x => x.id===id) || { id };
    const stockEl = document.getElementById('pr_stock_'+id);
    let stock = p.stock; if(stockEl){ const raw = stockEl.value.trim(); stock = raw==='' ? null : parseInt(raw,10); }
    const name = document.getElementById('pr_name_'+id).value.trim();
    const vatEl = document.getElementById('pr_vat_'+id);
    const vat = vatEl && vatEl.value !== '' ? Number(vatEl.value) : null;
    const menuEl = document.getElementById('pr_menu_'+id); const menu = menuEl ? (menuEl.value || null) : (p.menu_id || null);
    const pr = (document.getElementById('pr_print_'+id) || {}).checked;
    const optChanged = pr != null && pr !== (p.print_ticket !== false);
    const menuChanged = menu !== (p.menu_id || null);
    return { name, id, vat, menu, menuChanged, cat: p.category || null, pr: pr == null ? p.print_ticket !== false : pr, optChanged, vatChanged: (p.vat_rate ?? null) !== vat, payload: productPayload(p, { p_name: name, p_station_id: document.getElementById('pr_st_'+id).value || null,
      p_price: parseFloat(document.getElementById('pr_price_'+id).value)||0, p_cost: parseFloat(document.getElementById('pr_cost_'+id).value)||0, p_stock: stock }) };
  });
  if(!rows.length) return;
  const bad = rows.find(r => !r.name); if(bad){ alert('Ürün adı boş olamaz'); return; }
  const errors = await runProductBatch(rows, async (s, r) => {
    const res = await sb.rpc('upsert_product', Object.assign({ p_token: s.session_token }, r.payload));
    if(res.error) return res;
    if(r.optChanged){ const o = await sb.rpc('set_product_options', { p_token: s.session_token, p_product_id: r.id, p_category: r.cat || null, p_print_ticket: r.pr }); if(o.error) return o; }
    if(r.menuChanged){ const o = await sb.rpc('set_product_menu', { p_token: s.session_token, p_product_id: r.id, p_menu_id: r.menu }); if(o.error) return o; }
    if(!r.vatChanged) return res;
    return sb.rpc('set_product_vat', { p_token: s.session_token, p_product_id: r.id, p_rate: r.vat });
  });
  if(errors.length) alert('Bazı ürünler kaydedilemedi:\n\n' + errors.join('\n')); else showToast(rows.length + ' ürün kaydedildi ✓');
}
// Durum rozetine tıklayınca tek ürün anında satışa açılır/kapanır.
async function toggleProductAvailable(pid){
  const p = (APP.config.products || []).find(x => x.id === pid); if(!p) return;
  const open = p.available === false;
  const { error } = await sb.rpc('upsert_product', Object.assign({ p_token: getSession().session_token }, productPayload(p, { p_available: open })));
  if(error){ alert(error.message); return; }
  p.available = open; closeProdDrawer();
  showToast(p.name + (open ? ' satışa açıldı ✓' : ' satışa kapatıldı'));
  renderSettingsContent(getSession());
}
async function bulkProductAvailable(open){
  const ids = selectedProductIds(); if(!ids.length) return;
  const list = ids.map(id => APP.config.products.find(p => p.id===id)).filter(p => p && (p.available!==false) !== open);
  if(!list.length){ showToast(open ? 'Seçilenler zaten satışta' : 'Seçilenler zaten kapalı'); return; }
  const errors = await runProductBatch(list, (s, p) => sb.rpc('upsert_product', Object.assign({ p_token: s.session_token }, productPayload(p, { p_available: open }))));
  if(errors.length) alert('Bazı ürünler güncellenemedi:\n\n' + errors.join('\n')); else showToast(list.length + (open ? ' ürün satışa açıldı ✓' : ' ürün satışa kapatıldı'));
}
async function bulkDeleteProducts(){
  const ids = selectedProductIds(); if(!ids.length) return;
  const list = ids.map(id => APP.config.products.find(p => p.id===id)).filter(Boolean).map(p => ({ id: p.id, name: p.name, friendly: true }));
  if(!await uiConfirm(list.length + ' ürün silinsin mi?\n\n' + list.map(p => p.name).join(', '))) return;
  const errors = await runProductBatch(list, (s, p) => sb.rpc('delete_product', { p_token: s.session_token, p_id: p.id }));
  if(errors.length) alert('Bazı ürünler silinemedi:\n\n' + errors.join('\n')); else showToast(list.length + ' ürün silindi');
}
async function addProduct(){
  const session = getSession();
  const name = document.getElementById('np_name').value.trim();
  const npMenu = (document.getElementById('np_menu') || {}).value || null;
  const npMenuObj = (APP.config.menus||[]).find(m => m.id === npMenu);
  const stationId = (npMenuObj && npMenuObj.station_id) || ((APP.config.stations||[])[0] || {}).id;
  const price = parseFloat(document.getElementById('np_price').value)||0;
  const cost = parseFloat(document.getElementById('np_cost').value)||0;
  const stockRaw = document.getElementById('np_stock').value.trim();
  const stock = stockRaw==='' ? null : parseInt(stockRaw,10);
  if(!name) return;
  const { data: newId, error } = await sb.rpc('upsert_product', { p_token: session.session_token, p_id: null, p_station_id: stationId, p_name: name, p_price: price, p_cost: cost, p_stock: stock, p_available: true });
  if(error){ alert(error.message); return; }
  if(newId && npMenu){ const { error: cErr } = await sb.rpc('set_product_menu', { p_token: session.session_token, p_product_id: newId, p_menu_id: npMenu }); if(cErr) alert('Ürün eklendi ama menü kaydedilemedi: ' + cErr.message); }
  const npVat = document.getElementById('np_vat').value;
  if(newId && npVat !== ''){
    const { error: vErr } = await sb.rpc('set_product_vat', { p_token: session.session_token, p_product_id: newId, p_rate: Number(npVat) });
    if(vErr) alert('Ürün eklendi ama KDV oranı kaydedilemedi: ' + vErr.message);
  }
  if(newId && NEW_PRODUCT_RECIPE_DRAFT.length>0){
    const items = NEW_PRODUCT_RECIPE_DRAFT.map(r => ({ ingredient_id: r.ingredient_id, qty_per_unit: r.qty_per_unit }));
    const { error: recError } = await sb.rpc('set_recipe', { p_token: session.session_token, p_product_id: newId, p_items: items });
    if(recError){ alert('Ürün eklendi ama reçete kaydedilemedi: ' + recError.message); }
  }
  NEW_PRODUCT_RECIPE_DRAFT = [];
  closeSheet('prodSheet');
  renderSettingsView(document.getElementById('main'), session);
}

/* --- Kullanıcılar --- */
/* Bir kullanıcıya en fazla 2 rol atanabilir (bkz. app_users.role_ids
   CHECK kısıtı ve create_staff_user/update_staff_user). Rol seçimi
   checkbox listesi olarak gösteriliyor, tek <select> yerine - çünkü
   artık roller sabit 3 tane değil, yöneticinin Roller sekmesinde
   tanımladığı sayıda ve isimde olabiliyor. */
function roleCheckboxes(idPrefix, selectedIds, disabled){
  // Yönetici (sistem) rolü yalnızca işletme sahibine aittir, başkasına atanamaz.
  const roles = (APP.config.roles||[]).filter(r => !r.is_system);
  return roles.map(r => `
    <label class="role-chk" style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:13px;margin-bottom:4px;">
      <input type="checkbox" id="${idPrefix}_role_${r.id}" value="${r.id}" data-roles-group="${idPrefix}" ${selectedIds.includes(r.id)?'checked':''} style="width:auto;margin:0;" ${disabled?'disabled':''} ${actOn('change','enforceMaxTwoRoles',[idPrefix])}>
      ${escapeHtml(r.name)}
    </label>`).join('');
}
function enforceMaxTwoRoles(idPrefix){
  const boxes = Array.from(document.querySelectorAll(`input[data-roles-group="${idPrefix}"]`));
  const checked = boxes.filter(b => b.checked);
  if(checked.length > 2){
    alert('Bir kullanıcıya en fazla 2 rol atanabilir');
    checked[checked.length-1].checked = false;
  }
}
function selectedRoleIds(idPrefix){
  return Array.from(document.querySelectorAll(`input[data-roles-group="${idPrefix}"]:checked`)).map(b => b.value);
}
function isOwnerUser(u){
  const sys = (APP.config.roles||[]).filter(r => r.is_system).map(r => r.id);
  return (u.role_ids||[]).some(id => sys.includes(id));
}
/* Şifre alanı: mevcut şifreler geri çevrilemez biçimde (bcrypt) saklandığı için
   gösterilemez; alan •••••• ile "ayarlı" görünür. 👁 yazılanı gösterir, 🎲 rastgele
   şifre üretip görünür halde alana yazar (personele iletmek için). */
function passField(id, disabled, existing){
  const btn = 'flex:0 0 auto;width:auto;margin:0;padding:6px 9px;font-size:15px;line-height:1;';
  return `<div style="display:flex;gap:6px;align-items:center;">
    <input type="password" id="${id}" placeholder="${existing ? '••••••  (değiştirmek için yaz)' : 'Şifre'}" autocomplete="new-password" style="flex:1;min-width:0;margin:0;" ${disabled?'disabled':''}>
    ${disabled ? '' : `<button type="button" class="ghost-btn" style="${btn}" title="Göster / gizle" ${act('togglePassVisible', id, '$this')}>👁</button>
    <button type="button" class="ghost-btn" style="${btn}" title="Rastgele şifre üret" ${act('fillRandomPass', id)}>🎲</button>`}
  </div>`;
}
function togglePassVisible(id, b){
  const el = document.getElementById(id); if(!el) return;
  el.type = el.type==='password' ? 'text' : 'password';
  if(b) b.style.opacity = el.type==='text' ? '1' : '';
}
function fillRandomPass(id){
  const el = document.getElementById(id); if(!el) return;
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const r = new Uint32Array(10); crypto.getRandomValues(r);
  el.value = Array.from(r, x => chars[x % chars.length]).join('');
  el.type = 'text';
  el.dispatchEvent(new Event('input', { bubbles:true }));
  el.focus(); el.select();
  showToast('Şifre üretildi — kaydetmeden önce not alın');
}
/* İşletme sahibi: Yönetici rolü sabit; hesabını yalnızca kendisi düzenleyebilir. */
function ownerUserRow(u, session){
  const self = u.id === session.user_id;
  return `<tr data-uid="${u.id}" data-owner="1">
    <td></td>
    <td class="col-name uc-name">${avatarHtml(u.username)}<input value="${escapeAttr(u.username)}" id="us_name_${u.id}" ${self?'':'disabled'}></td>
    <td class="col-name">${self ? `${passField('us_pass_'+u.id, false, true)}` : '<span class="muted">—</span>'}</td>
    <td class="col-name"><span class="role-badge">👑 İşletme Sahibi · Yönetici</span>${self ? '' : '<div class="muted" style="font-size:12px;margin-top:4px;">🔒 Değiştirilemez</div>'}</td>
  </tr>`;
}
/* "Kullanıcı Rollerini Değiştirme" izni olmayan: rol atayamaz, kullanıcı ekleyemez ve bu
   izne / vardiyasız çalışma iznine sahip kişilerin hesaplarını düzenleyemez (sunucu da reddeder). */
function userIsPrivileged(u){
  const roles = (APP.config.roles||[]).filter(r => (u.role_ids||[]).includes(r.id));
  return roles.some(r => (r.permissions||[]).includes('users_assign_roles') || (r.permissions||[]).includes('shift_exempt'));
}
function renderUsersSettings(el, session){
  const canAssign = canManage(session, 'users_assign_roles');
  const us = APP.config.users || [], lic = APP.config.license || {};
  el.innerHTML = statChips([['👥', us.length, 'Kullanıcı', 'var(--c1)', 'all'], ['✅', us.filter(u => u.is_active!==false).length, 'Aktif', 'var(--ok,#22c55e)', 'on'],
      ['⏸', us.filter(u => u.is_active===false).length, 'Pasif', 'var(--c3)', 'off'], ['🎫', lic.max_users ? Math.max(0, lic.max_users - us.length) : '—', 'Eklenebilir kullanıcı', 'var(--c2)']], '', 'users') + `<div class="box" style="max-width:none;">
    <div class="fsheet-bar" style="margin:0 0 12px;"><h2 style="margin:0;">Kullanıcılar</h2>${canAssign ? sheetBtnHtml('userSheet','+ Yeni Kullanıcı') : ''}</div>
    ${canAssign ? '' : '<p class="muted" style="text-align:left;font-size:12.5px;margin:-4px 0 12px;">🔒 Kullanıcı ekleme, rol değiştirme, pasife alma ve silme için <b>Kullanıcı Yönetimi</b> izni gerekir; yetkili kişilerin hesapları da kilitlidir. Diğer personelin adını ve şifresini değiştirebilirsiniz.</p>'}
    ${canAssign ? sheetHtml('userSheet', '👤', 'Yeni Kullanıcı', `
      <div class="fsheet-grid">
        <div class="field-group"><label>Kullanıcı Adı</label><input id="nu_name" placeholder="örn. ahmet" autocapitalize="none"></div>
        <div class="field-group"><label>Şifre</label>${passField('nu_pass', false, false)}</div>
        <div class="field-group wide"><label>Roller (en fazla 2)</label>${roleCheckboxes('nu', [])}</div>
      </div>
      <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','userSheet')}>Vazgeç</button><button ${act('addUser')}>+ Kullanıcı Ekle</button></div>`, 'var(--c1)') : ''}
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 10px;">
      <input id="userSearch" placeholder="🔍 Kullanıcı ara…" value="${escapeAttr(APP.userSearch||'')}" ${actOn('input','setUserSearch',['$value'])} style="max-width:320px;margin:0;">
      <span class="spacer" style="flex:1;"></span>
      <div class="act-row" id="userBulkBar">
        <button type="button" class="act-btn act-save" id="userSaveAllBtn" ${act('saveAllUsers')} disabled>${ICON_SAVE}<span>Kaydet</span></button>
      </div>
      <div class="act-row" style="${canAssign?'':'display:none;'}">
        <button type="button" class="act-btn act-close" data-needs-sel ${act('bulkUserActive', false)} disabled title="Seçilenler giriş yapamaz, açık oturumları kapanır"><b>⏸</b><span>Pasife Al</span></button>
        <button type="button" class="act-btn act-open" data-needs-sel ${act('bulkUserActive', true)} disabled><b>✓</b><span>Aktifleştir</span></button>
        <button type="button" class="act-btn act-delete" data-needs-sel ${act('bulkDeleteUsers')} disabled>${ICON_TRASH}<span>Sil</span></button>
      </div>
    </div>
    <p class="muted" id="userSelInfo" style="text-align:left;font-size:12.5px;margin:0 0 8px;">Satırdaki bilgileri değiştirip <b>Kaydet</b>'e basın${canAssign ? '; pasife almak / silmek için satırları seçin' : ''}.</p>
    <div class="settings-table-wrap user-cards">
    <table class="settings-table">
      <thead><tr><th style="width:36px;">${canAssign ? `<input type="checkbox" id="userSelAll" style="width:auto;margin:0;" title="Tümünü seç" ${actOn('change','selectAllUsers',['$checked'])}>` : ''}</th><th>Kullanıcı Adı</th><th>Yeni Şifre</th><th>Roller (en fazla 2)</th></tr></thead>
      <tbody data-cf-scope="users" ${actOn('input','markUserDirty',['$event'])} ${actOn('change','markUserDirty',['$event'])}>
      ${APP.config.users.slice().sort((x, y) => String(x.username).localeCompare(String(y.username), 'tr', { sensitivity: 'base' }))
        .map(u => { const locked = !canAssign && userIsPrivileged(u); return (isOwnerUser(u) ? ownerUserRow(u, session) : `
        <tr data-uid="${u.id}" data-cf-tags="${u.is_active===false ? 'off' : 'on'}" style="${u.is_active===false?'opacity:.55;':''}">
          <td>${locked ? '<span title="Yetkili kullanıcı - düzenleme izniniz yok">🔒</span>' : !canAssign ? '' : `<input type="checkbox" class="user-sel" value="${u.id}" style="width:auto;margin:0;" ${actOn('change','updateUserSelection',[])}>`}</td>
          <td class="col-name uc-name">${avatarHtml(u.username)}<input value="${escapeAttr(u.username)}" id="us_name_${u.id}" ${locked?'disabled':''}>${u.is_active===false?'<span class="role-badge" style="color:var(--red);border-color:var(--red);margin-top:6px;display:inline-block;">Pasif</span>':''}</td>
          <td class="col-name">${passField('us_pass_'+u.id, locked, true)}</td>
          <td class="col-name">${roleCheckboxes('us_'+u.id, u.role_ids||[], !canAssign)}</td>
        </tr>`).replace('<tr', `<tr data-uname="${escapeAttr(String(u.username).toLocaleLowerCase('tr'))}"`); }).join('')}
      </tbody>
    </table>
    </div>
  </div>`;
  filterUserRows();
}
/* Kullanıcı listesinde ada göre anlık arama (liste zaten alfabetik sıralı). */
function filterUserRows(){
  const q = String(APP.userSearch||'').trim().toLocaleLowerCase('tr');
  document.querySelectorAll('tr[data-uname]').forEach(tr => { tr.style.display = !q || tr.dataset.uname.includes(q) ? '' : 'none'; });
}

/* --- Vardiyalar: personelin giriş/çıkış (clock_in/clock_out) kayıtlarını
   yöneticinin görebildiği ekran, bkz. list_staff_shifts RPC'si. */
function formatShiftDuration(mins){
  if(mins===null || mins===undefined) return '—';
  const h = Math.floor(mins/60), m = mins%60;
  return h>0 ? (h+'sa '+m+'dk') : (m+'dk');
}
function formatShiftTime(iso){
  const d = new Date(iso);
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
async function renderShiftsSettings(el, session){
  if(!APP.shiftsDate) APP.shiftsDate = todayLocalDateStr();
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Vardiyalar</h2>
    <div id="shiftApprovalWrap"></div>
    <div id="shiftPendingWrap"></div>
    <div class="sh-date">
      <button type="button" class="ico-btn" title="Önceki gün" ${act('shiftDayStep', -1)}>‹</button>
      <input type="date" id="shiftsDateInput" value="${APP.shiftsDate}" ${actOn('change','changeShiftsDate',['$value'])}>
      <button type="button" class="ico-btn" title="Sonraki gün" ${act('shiftDayStep', 1)}>›</button>
      <button type="button" class="pc-btn" ${act('changeShiftsDate', todayLocalDateStr())}>Bugün</button>
    </div>
    <div id="shiftsTableWrap"><p class="muted">Yükleniyor…</p></div>
  </div>`;
  await renderShiftsTable(session);
  // Sekme açıkken yeni vardiya istekleri / değişiklikler 20 sn'de bir sessizce gelir (animasyonsuz, yanıp sönmeden).
  if(SHIFTS_TIMER) clearInterval(SHIFTS_TIMER);
  SHIFTS_TIMER = setInterval(() => {
    if(APP.view!=='settings' || !document.getElementById('shiftsTableWrap')){ clearInterval(SHIFTS_TIMER); SHIFTS_TIMER = null; return; }
    if(typeof uiBusyForAutoRefresh==='function' && uiBusyForAutoRefresh()) return;
    renderShiftsTable(getSession(), true);
  }, 20000);
}
let SHIFTS_TIMER = null;
function changeShiftsDate(v){ APP.shiftsDate = v; const i = document.getElementById('shiftsDateInput'); if(i) i.value = v; renderShiftsTable(getSession()); }
function shiftDayStep(d){ const x = new Date(APP.shiftsDate+'T12:00'); x.setDate(x.getDate()+d); changeShiftsDate(x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')); }
async function setDayEndHour(v){ const s = getSession(); const { error } = await sb.rpc('set_day_end_hour', { p_token: s.session_token, p_hour: parseInt(v, 10) }); if(error){ alert(error.message); return; } showToast('Gün sonu saati ' + String(v).padStart(2,'0') + ':00 ✓'); }
async function renderShiftsTable(session, quiet){
  const wrap = document.getElementById('shiftsTableWrap'); if(!wrap) return;
  const box = wrap.closest('.box');
  if(quiet){ if(box) box.dataset.snap = '1'; APP.silentLoad = true; } else if(box) delete box.dataset.snap;
  try { await renderShiftsTableInner(session, wrap); } finally { if(quiet) setTimeout(() => { APP.silentLoad = false; }, 0); }
}
async function renderShiftsTableInner(session, wrap){
  const { data, error } = await withLoadingOverlay(sb.rpc('list_staff_shifts', { p_token: session.session_token, p_date: APP.shiftsDate }));
  if(error){ wrap.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const approvalWrap = document.getElementById('shiftApprovalWrap');
  if(approvalWrap) approvalWrap.innerHTML = `
    <div class="sh-opts"><label class="sw-card">
      <input type="checkbox" class="sw" ${data.approval_required?'checked':''} ${canManage(session,'shifts')?'':'disabled'} ${actOn('change','toggleShiftApproval',['$checked'])}>
      <span><b>Vardiya başlatma yönetici onayına bağlı</b><br>
      <span class="muted" style="font-size:12.5px;">Açıkken personel vardiyayı sadece <i>isteyebilir</i>; siz onayladığınızda başlar ve vardiyayı yalnızca yönetici bitirebilir.${canManage(session,'shifts')?'':' (Bu ayarı Yönetici değiştirebilir.)'}</span></span>
    </label>
    <label class="sw-card">
      <input type="checkbox" class="sw" ${data.shift_required?'checked':''} ${canManage(session,'shifts')?'':'disabled'} ${actOn('change','toggleShiftRequired',['$checked'])}>
      <span><b>Vardiya açmadan çalışılamasın</b><br>
      <span class="muted" style="font-size:12.5px;">Açıkken personel vardiyasını başlatmadan Sipariş Al, Paket, Mutfak, Ödemeler, Rezervasyon ve Satınalma ekranlarını kullanamaz. Vardiya talebini gönderdiği anda çalışmaya başlayabilir; onayı siz sonradan verirsiniz. Yönetici ve <b>⏱ Vardiya Açmadan Çalışma</b> izni verilen roller (ör. Tam Yetkili, en fazla 3 kişi) bu kuraldan muaftır.</span></span>
    </label>
    <label class="sw-card">
      <span style="font-size:22px;">🌙</span>
      <span style="flex:1;"><b>Gün sonu saati</b> <select style="width:auto;display:inline-block;margin:0 0 0 6px;padding:4px 8px;" ${canManage(session,'shifts')?'':'disabled'} ${actOn('change','setDayEndHour',['$value'])}>${Array.from({length:24},(_,h) => `<option value="${h}" ${Number(data.day_end_hour ?? 5)===h?'selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}</select><br>
      <span class="muted" style="font-size:12.5px;">Bu saatte açık kalan vardiyalar otomatik kapanır; herkes her gün vardiyasını yeniden açar. Bitiş saati olarak kişinin uygulamayı son kullandığı an yazılır. Gün Sonu kasa sayımı kaydedildiğinde de diğer personelin vardiyaları kapanır.</span></span>
    </label></div>`;
  const pendWrap = document.getElementById('shiftPendingWrap');
  const pending = data.pending || [];
  const endReqs = data.end_requests || [];
  if(pendWrap) pendWrap.innerHTML = (endReqs.length ? `
    <div style="border:1px solid #d9a400;border-radius:12px;padding:12px;margin-bottom:16px;">
      <b>🏁 Bitirme Talepleri (${endReqs.length})</b>
      ${endReqs.map(p => `<div data-badge-id="${p.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
        <span><b>${escapeHtml(p.username)}</b> <span class="muted">· ${formatShiftTime(p.clock_in)}'dan beri vardiyada, ${formatShiftTime(p.requested_at)}'de bitirmek istedi</span></span>
        <span style="display:flex;gap:8px;">
          <button class="actBtn" style="width:auto;margin:0;" ${act('manageShift', p.id, 'approve_end')}>✓ Bitir</button>
          <button class="actBtn" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" ${act('manageShift', p.id, 'reject_end')}>✕ Reddet</button>
        </span></div>`).join('')}
    </div>` : '') + (pending.length ? `
    <div style="border:1px solid #d9a400;border-radius:12px;padding:12px;margin-bottom:16px;">
      <b>🟡 Onay Bekleyen Vardiya Talepleri (${pending.length})</b>
      ${pending.map(p => `<div data-badge-id="${p.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
        <span><b>${escapeHtml(p.username)}</b> <span class="muted">· ${formatShiftTime(p.requested_at)}'de istedi</span></span>
        <span style="display:flex;gap:8px;">
          <button class="actBtn" style="width:auto;margin:0;" ${act('manageShift', p.id, 'approve')}>✓ Onayla</button>
          <button class="actBtn danger" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" ${act('manageShift', p.id, 'reject')}>✕ Reddet</button>
        </span></div>`).join('')}
    </div>` : '');
  const rows = data.rows || [];
  if(!rows.length){ wrap.innerHTML = '<div class="empty-state"><div style="font-size:42px;">🕐</div><p class="muted">Bu tarihte vardiya kaydı yok.</p></div>'; return; }
  const dayStart = new Date(APP.shiftsDate+'T00:00').getTime(), pos = (t) => Math.max(0, Math.min(100, (t - dayStart) / 864e5 * 100));
  const nowPct = pos(Date.now()), totalMin = rows.reduce((x, r) => x + (Number(r.duration_minutes)||0), 0), live = rows.filter(r => !r.clock_out).length;
  wrap.innerHTML = statChips([['🧑‍🍳', rows.length, 'Vardiya', 'var(--c1)', 'all'], ['🟢', live, 'Devam eden', 'var(--ok,#22c55e)', 'live'],
      ['⏱', formatShiftDuration(totalMin), 'Toplam çalışma', 'var(--c2)', 'done'], ['⏸', rows.filter(r => r.is_paused).length, 'Duraklatılmış', 'var(--c3)', 'paused']], '', 'shifts') + `
    <div class="sh-tl" data-cf-scope="shifts">
      <div class="sh-axis"><span></span><div>${[0,3,6,9,12,15,18,21,24].map(h => `<i style="left:${h/24*100}%">${String(h).padStart(2,'0')}</i>`).join('')}</div><span></span></div>
      ${rows.map((r, i) => { const a = pos(new Date(r.clock_in).getTime()), b = r.clock_out ? pos(new Date(r.clock_out).getTime()) : nowPct;
        return `<div class="sh-row ${r.clock_out?'':'live'}" data-cf-tags="${r.clock_out ? 'done' : 'live'}${r.is_paused ? ' paused' : ''}" style="--i:${Math.min(i,12)};">
          <div class="sh-who">${avatarHtml(r.username)}<div><b>${escapeHtml(r.username)}</b><small>${r.approved_by && r.approved_by!==r.username ? 'Onaylayan: '+escapeHtml(r.approved_by) : formatShiftTime(r.clock_in)+' → '+(r.clock_out ? formatShiftTime(r.clock_out) : 'devam ediyor')}</small></div></div>
          <div class="sh-track">${nowPct>0 && nowPct<100 ? `<span class="sh-now" style="left:${nowPct}%"></span>` : ''}
            <div class="sh-bar ${r.is_paused?'paused':''}" style="left:${a}%;width:${Math.max(1.2, b-a)}%;" title="${formatShiftTime(r.clock_in)} - ${r.clock_out ? formatShiftTime(r.clock_out) : 'şimdi'}"><span>${formatShiftDuration(r.duration_minutes)}</span></div></div>
          <div class="sh-side">
            ${!r.clock_out && r.end_requested_at ? `<span class="pchip warn">🏁 ${formatShiftTime(r.end_requested_at)}'de bitirmek istedi</span>` : ''}
            ${r.is_paused ? '<span class="pchip warn">⏸ Duraklatıldı</span>' : ''}
            ${r.paused_minutes > 0 ? `<span class="pchip">${formatShiftDuration(r.paused_minutes)} pasif</span>` : ''}
            ${r.clock_out && r.auto_closed ? `<span class="pchip warn" title="Gün sonunda açık kaldığı için kapatıldı; bitiş saati kişinin son kullanım anıdır">⚠️ Otomatik kapandı</span>` : r.clock_out ? (r.ended_by && r.ended_by!==r.username ? `<span class="pchip">${escapeHtml(r.ended_by)} bitirdi</span>` : '<span class="pchip">✓ Bitti</span>') : `<button type="button" class="pc-btn rv-del" ${act('manageShift', r.id, 'end')}>⏹ Bitir</button>`}
          </div>
        </div>`; }).join('')}
    </div>`;
}
async function manageShift(id, action){
  if(action==='end' && !await uiConfirm('Bu personelin vardiyası şimdi bitirilsin mi?')) return;
  const session = getSession();
  const { error } = await withLoadingOverlay(sb.rpc('manage_staff_shift', { p_token: session.session_token, p_shift_id: id, p_action: action }));
  if(error){ showToast(error.message); return; }
  showToast({ approve:'Vardiya başlatıldı ✓', reject:'Talep reddedildi', approve_end:'Vardiya bitirildi ✓', reject_end:'Bitirme talebi reddedildi', end:'Vardiya bitirildi ✓' }[action] || 'Tamam');
  renderShiftsTable(session);
  refreshShiftWidget(session);
  refreshNavBadges();
}
async function toggleShiftRequired(on){
  const session = getSession();
  const { error } = await sb.rpc('set_shift_required', { p_token: session.session_token, p_value: on });
  if(error){ showToast(error.message); renderShiftsTable(session); return; }
  showToast(on ? 'Personel artık vardiya açmadan çalışamaz' : 'Vardiya zorunluluğu kapatıldı');
  refreshShiftWidget(session);
}
async function toggleShiftApproval(on){
  const session = getSession();
  const { error } = await sb.rpc('set_shift_approval_required', { p_token: session.session_token, p_value: on });
  if(error){ showToast(error.message); renderShiftsTable(session); return; }
  showToast(on ? 'Vardiya başlatma artık yönetici onayına bağlı' : 'Personel vardiyasını kendisi başlatıp bitirebilir');
  refreshShiftWidget(session);
}

/* --- Aktif Kullanıcılar (yalnızca Yönetici): işletmede şu an uygulamayı
   kullanan personel. staff_sessions.last_seen_at her istekte (en fazla 30
   sn'de bir) güncellenir (bkz. list_active_staff). Sekme açıkken 20 sn'de
   bir yenilenir. */
let ACTIVE_USERS_TIMER = null;
function renderActiveUsersSettings(el){
  if(!APP.activeUsersMinutes) APP.activeUsersMinutes = 5;
  el.innerHTML = `<div class="box" style="max-width:none;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <h2 style="margin:0;">🟢 Aktif Kullanıcılar</h2>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="muted" style="font-size:13px;">Son</span>
        <select id="activeUsersMinutes" style="width:auto;margin:0;" ${actOn('change','setActiveUsersMinutes',['$value'])}>
          ${[5,15,60,1440].map(m => `<option value="${m}" ${APP.activeUsersMinutes===m?'selected':''}>${m===1440?'24 saat':m+' dakika'}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="au-legend">
      <span><i class="d on"></i>Çevrimiçi</span><span><i class="d idle"></i>Boşta · 2 dk+ işlem yok, vardiya sayacı durur</span><span><i class="d away"></i>Çevrimdışı · 30 dk+ işlem yok</span><span><i class="d off"></i>Çıkış yaptı</span>
      <span class="au-auto" title="Liste 20 saniyede bir kendiliğinden yenilenir">🔄 20 sn'de bir yenilenir</span>
    </div>
    <div id="activeUsersBody"><p class="muted">Yükleniyor...</p></div>
  </div>`;
  loadActiveUsers();
  if(ACTIVE_USERS_TIMER) clearInterval(ACTIVE_USERS_TIMER);
  ACTIVE_USERS_TIMER = setInterval(() => {
    if(APP.view!=='settings' || APP.settingsTab!=='users' || !document.getElementById('activeUsersBody')){ clearInterval(ACTIVE_USERS_TIMER); ACTIVE_USERS_TIMER = null; return; }
    loadActiveUsers(true);
  }, 20000);
}
async function loadActiveUsers(quiet){
  const session = getSession(); const body = document.getElementById('activeUsersBody');
  if(!session || !body) return;
  const { data, error } = await sb.rpc('list_active_staff', { p_token: session.session_token, p_minutes: APP.activeUsersMinutes || 5 });
  if(error){ body.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const rows = data.rows || [];
  const full = data.max_users && data.total_users >= data.max_users;
  // Otomatik yenilemede giriş animasyonları/sayaçlar tekrar oynamasın.
  if(quiet){ body.dataset.snap = '1'; APP.silentLoad = true; } else delete body.dataset.snap;
  body.innerHTML = statChips([['🟢', data.active_users, 'Aktif kullanıcı', 'var(--ok,#22c55e)', 'on'], ['🧑‍🍳', data.on_shift, 'Vardiyada', 'var(--c1)', 'shift'],
      ['📅', data.today_users, 'Bugün giren', 'var(--c2)', 'all'], ['🎫', (data.total_users ?? '—') + ' / ' + (data.max_users ?? '—'), data.max_users ? 'Lisans · ' + Math.max(0, data.max_users - data.total_users) + ' boş yer' + (data.total_users - data.enabled_users ? ' · ' + (data.total_users - data.enabled_users) + ' pasif' : '') : 'Kullanıcı / lisans', full ? 'var(--danger,#ef4444)' : 'var(--c3)']], '', 'active') + `
    ${!rows.length ? '<div class="empty-state"><div style="font-size:42px;">😴</div><p class="muted">Bu sürede aktif kullanıcı yok.</p></div>' : `<div class="au-grid" data-cf-scope="active">${rows.map((r, i) => {
      // 2 dk içinde işlem: çevrimiçi; 2–30 dk: boşta; 30 dk+ işlem yok ya da çıkış: çevrimdışı.
      const age = Date.now() - new Date(r.last_seen_at).getTime();
      const st = r.online===false ? 'off' : age < 120000 ? 'on' : age < 1800000 ? 'idle' : 'away';
      return `<div class="au-card au-${st}" data-cf-tags="${st}${r.on_shift ? ' shift' : ''}" style="--i:${Math.min(i,12)};">
        <div class="cu-top"><span class="au-av">${avatarHtml(r.username)}<i></i></span><div class="cu-id"><b>${escapeHtml(r.username)}</b><small>${escapeHtml(r.roles||'—')}</small></div>
          <span class="au-st">${st==='on' ? 'Çevrimiçi' : st==='idle' ? 'Boşta' : st==='away' ? 'Çevrimdışı' : 'Çıkış yaptı'}</span></div>
        <div class="pcard-chips">
          <span class="pchip">⚡ ${fmtRelativeTime(r.last_seen_at)}</span>
          <span class="pchip">🔑 ${new Date(r.login_at).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
          ${r.online===false && r.logged_out_at ? `<span class="pchip">🚪 ${new Date(r.logged_out_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span>` : ''}
        </div>
        ${r.on_shift ? `<div class="au-shift ${r.shift_paused?'paused':''}">${r.shift_paused ? '⏸ Vardiya durdu' : '🟢 Vardiyada'}${r.shift_minutes != null ? ' · '+formatShiftDuration(r.shift_minutes) : ''}</div>` : '<div class="au-shift none">Vardiyada değil</div>'}
      </div>`; }).join('')}</div>`}`;
  if(quiet) setTimeout(() => { APP.silentLoad = false; }, 0);
}

/* --- Veri Sıfırlama (yalnızca Yönetici): seçilen tarih aralığındaki işlem
   verilerini kalıcı olarak siler (bkz. reset_restaurant_data). Ürünler,
   masalar, kullanıcılar ve açık siparişler etkilenmez (müşteriler yalnızca seçilirse);
   e-faturası kesilmiş satışlar yasal kayıt olduğu için korunur. */
const RESET_CATEGORIES = [
  { id:'sales', label:'Satışlar ve kapanmış siparişler', hint:'Satış geçmişi, iptal/kapalı siparişler, faturalar (e-fatura hariç), online sipariş talepleri, SMS kayıtları' },
  { id:'waste', label:'Zayi / fire kayıtları' },
  { id:'shifts', label:'Vardiya kayıtları', hint:'Devam eden vardiyalar silinmez' },
  { id:'reservations', label:'Rezervasyonlar ve bekleme listesi' },
  { id:'purchases', label:'Satınalma siparişleri' },
  { id:'messages', label:'Mesajlar', hint:'Ekip içi mesajlar, fotoğraf ve sesli mesajlar', off:true },
  { id:'waiter_calls', label:'Garson çağrıları', hint:'QR menüden gelen tamamlanmış çağrılar', off:true },
  { id:'audit', label:'Değişiklik kaydı', hint:'Ayarlar → Güvenlik → Değişiklik Kaydı', off:true },
  { id:'customers', label:'Müşteriler', hint:'Bu dönemde eklenen müşteri kayıtları, sadakat puanlarıyla birlikte (satış geçmişi silinmez)', off:true, warn:true },
];
// Hiçbir seçenekle silinmeyen kalıcı veriler (kullanıcıya bilgi olarak gösterilir).
const RESET_KEPT = ['Ürünler, ekstralar ve reçeteler','Menüler ve istasyonlar','Hammaddeler ve stok miktarları','Bölgeler ve masalar','Kullanıcılar ve roller','Tedarikçiler','Hediye kartları ve bakiyeleri','Açık hesaplar ve borç kayıtları','Açık (ödenmemiş) siparişler ve devam eden vardiyalar','E-faturası kesilmiş satışlar (yasal kayıt)','Ayarlar, fiş tasarımı ve entegrasyonlar'];
const RESET_ICONS = { sales:'🧾', waste:'🔥', shifts:'🕐', reservations:'📅', purchases:'🚚', messages:'💬', waiter_calls:'🛎️', audit:'📜', customers:'👥' };
function renderDataResetSettings(el){
  const R = [['1m','1 ay'],['3m','3 ay'],['6m','6 ay'],['1y','1 yıl'],['all','Tümü'],['custom','Tarih seç']];
  el.innerHTML = `<div class="box" style="max-width:none;text-align:left;">
    <h2>🗑️ Verileri Sıfırla</h2>
    <p class="muted" style="margin:0 0 14px;">Seçtiğiniz dönemdeki işlem verilerini <b>kalıcı olarak</b> siler. Bu işlem geri alınamaz.</p>
    <div class="dr-layout">
      <div>
        <div class="dr-step"><span>1</span>Dönem</div>
        <select id="resetRange" style="display:none;" ${actOn('change','toggleResetCustom',['$value'])}>${R.map(([k,l]) => `<option value="${k}" ${k==='3m'?'selected':''}>${l}</option>`).join('')}</select>
        <div class="seg dr-seg">${R.map(([k,l]) => `<button type="button" data-rr="${k}" class="${k==='3m'?'on':''}" ${act('setResetRange', k)}>${k==='all'||k==='custom' ? l : 'Son ' + l}</button>`).join('')}</div>
        <div id="resetCustom" style="display:none;gap:10px;flex-wrap:wrap;margin-top:10px;">
          <div class="field-group" style="flex:1;min-width:140px;"><label>Başlangıç (tarih ve saat)</label><input type="datetime-local" id="resetFrom"></div>
          <div class="field-group" style="flex:1;min-width:140px;"><label>Bitiş (tarih ve saat)</label><input type="datetime-local" id="resetTo" value="${(() => { const d = new Date(); return todayLocalDateStr() + 'T' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); })()}"></div>
        </div>
        <div class="dr-step" style="margin-top:18px;"><span>2</span>Silinecek veriler <small class="muted" id="drCount"></small></div>
        <div class="dr-grid" ${actOn('change','updateResetCount',[])}>
          ${RESET_CATEGORIES.map(c => `<label class="dr-card ${c.warn?'warn':''}">
            <input type="checkbox" class="resetCat" value="${c.id}" ${c.off?'':'checked'}>
            <span class="dr-ic">${RESET_ICONS[c.id]||'🗂️'}</span>
            <span class="dr-txt"><b>${c.label}${c.warn?' <em>⚠️ dikkat</em>':''}</b>${c.hint?`<small>${c.hint}</small>`:''}</span>
            <span class="dr-chk"></span>
          </label>`).join('')}
        </div>
      </div>
      <div class="dr-side">
        <details class="dr-kept"><summary>🔒 Silinmeyecek veriler <small>(${RESET_KEPT.length})</small></summary>
          <ul>${RESET_KEPT.map(k => `<li>✓ ${k}</li>`).join('')}</ul></details>
        <div class="dr-danger">
          <div class="dr-step"><span>3</span>Onayla</div>
          <p class="muted" style="font-size:12.5px;margin:0 0 10px;">Silmeden önce son bir kez soracağız.</p>
          <label style="font-size:12.5px;font-weight:700;">Giriş şifreniz</label>
          <input type="password" id="resetPassword" autocomplete="current-password" placeholder="••••••••" style="margin:6px 0 12px;">
          <button type="button" class="dr-btn" ${act('doDataReset')}>🗑️ Verileri Kalıcı Olarak Sil</button>
        </div>
      </div>
    </div>
  </div>`;
  updateResetCount();
}
function setResetRange(k){
  const sel = document.getElementById('resetRange'); if(!sel) return;
  sel.value = k; document.querySelectorAll('[data-rr]').forEach(b => b.classList.toggle('on', b.dataset.rr === k));
  toggleResetCustom(k);
}
function updateResetCount(){ const n = document.querySelectorAll('.resetCat:checked').length, el = document.getElementById('drCount'); if(el) el.textContent = n + ' / ' + RESET_CATEGORIES.length + ' seçili'; }
function resetRangeDates(){
  const v = document.getElementById('resetRange').value;
  const fmt = (x) => x ? x.replace('T', ' ') : '';
  if(v==='all') return { from:null, to:null, label:'TÜM ZAMANLARA ait' };
  if(v==='custom'){
    const from = document.getElementById('resetFrom').value || null, to = document.getElementById('resetTo').value || null;
    return { from, to, label: (fmt(from)||'en baştan') + ' – ' + (fmt(to)||'şu an') + ' arasındaki' };
  }
  const months = { '1m':1, '3m':3, '6m':6, '1y':12 }[v];
  const d = new Date(); d.setMonth(d.getMonth() - months);
  const from = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') + 'T00:00';
  return { from, to: null, label: document.getElementById('resetRange').selectedOptions[0].textContent + 'a ait' };
}
async function doDataReset(){
  const cats = Array.from(document.querySelectorAll('.resetCat:checked')).map(b => b.value);
  if(!cats.length){ showToast('En az bir veri türü seçin'); return; }
  const pw = document.getElementById('resetPassword').value;
  if(!pw){ showToast('Onay için şifrenizi girin'); return; }
  const r = resetRangeDates();
  if(document.getElementById('resetRange').value==='custom' && !r.from && !r.to){ showToast('Tarih aralığı seçin'); return; }
  const names = RESET_CATEGORIES.filter(c => cats.includes(c.id)).map(c => '• ' + c.label).join('\n');
  if(!await uiConfirm(r.label + ' şu veriler kalıcı olarak silinecek:\n\n' + names + '\n\nBu işlem GERİ ALINAMAZ. Devam edilsin mi?')) return;
  const session = getSession();
  const { data, error } = await withLoadingOverlay(sb.rpc('reset_restaurant_data_ts', { p_token: session.session_token, p_password: pw, p_from: r.from, p_to: r.to, p_categories: cats }));
  if(error){ showToast(error.message); return; }
  if(!data || !data.ok){ showToast((data && data.error) || 'Silinemedi'); return; }
  document.getElementById('resetPassword').value = '';
  const n = data.removed || {};
  showToast('Veriler silindi ✓ ' + Object.keys(n).map(k => (RESET_CATEGORIES.find(c => c.id===k)||{label:k}).label + ': ' + n[k]).join(', '));
}

/* --- Roller: yönetici rolleri kendisi ekleyip/çıkarabilir, hangi role
   hangi ekranların açık olduğuna kendisi karar verir (bkz.
   manager_upsert_role/manager_delete_role). Yönetici rolü (is_system)
   salt okunur - tüm ekranlara erişimi sabit ve değiştirilemez. */
function rolePermissionCatalog(){
  // İzin listesi sunucudan gelir (get_restaurant_config.role_permissions):
  // işletmenin paketindeki/eklentilerindeki tüm özellikler. Yeni bir özellik
  // eklendiğinde burada kod değişikliği gerekmeden otomatik görünür.
  return (APP.config && APP.config.role_permissions && APP.config.role_permissions.length)
    ? APP.config.role_permissions
    : Object.keys(PERMISSION_LABELS).map(id => ({ id, label: PERMISSION_LABELS[id], category: 'Temel' }));
}
function permissionCheckboxes(idPrefix, selectedPerms){
  const byCat = {};
  rolePermissionCatalog().forEach(p => { (byCat[p.category||'Diğer'] = byCat[p.category||'Diğer'] || []).push(p); });
  return `<div class="perm-cats">` + Object.keys(byCat).map(cat => `
    <div class="perm-cat">
      <div class="perm-cat-head"><span>${escapeHtml(cat)}</span>
        <a ${act('toggleRoleCategory', '$this', true)}>Tümü</a></div>
      <div class="perm-pills">${byCat[cat].map(p => `
        <label class="perm-pill"><input type="checkbox" value="${escapeAttr(p.id)}" data-perms-group="${idPrefix}" ${selectedPerms.includes(p.id)?'checked':''} ${actOn('change','markRoleDirty',[idPrefix])}>${escapeHtml(p.label)}</label>`).join('')}
      </div>
    </div>`).join('') + `</div>`;
}
function selectedPermissions(idPrefix){
  return Array.from(document.querySelectorAll(`input[data-perms-group="${idPrefix}"]:checked`)).map(b => b.value);
}
/* Kategori başlığındaki "Tümü/Hiçbiri": kategorideki hepsi seçiliyse
   temizler, değilse hepsini seçer. */
function toggleRoleCategory(link){
  const boxes = link.closest('.perm-cat').querySelectorAll('input[type=checkbox]');
  const allOn = Array.from(boxes).every(b => b.checked);
  boxes.forEach(b => { b.checked = !allOn; });
  if(boxes[0]) markRoleDirty(boxes[0].dataset.permsGroup);
}
function markRoleDirty(group){
  const card = document.querySelector(`[data-role-card="${group}"]`);
  if(!card) return;
  card.classList.add('dirty');
  const n = selectedPermissions(group).length;
  const chip = card.querySelector('.role-perm-count');
  if(chip) chip.textContent = n + ' / ' + rolePermissionCatalog().length + ' izin';
}
function toggleRoleCard(group){
  const card = document.querySelector(`[data-role-card="${group}"]`);
  if(card) card.classList.toggle('open');
}
function rolePermSummary(perms){
  const labels = rolePermissionCatalog().filter(p => perms.includes(p.id)).map(p => p.label);
  if(!labels.length) return 'Henüz izin verilmedi';
  return labels.slice(0, 4).join(', ') + (labels.length > 4 ? ' +' + (labels.length - 4) + ' daha' : '');
}
const ROLE_TEMPLATES = {
  'Garson': ['order','packages','settings_products','settings_ingredients','purchasing_orders'],
  'Mutfak': ['kitchen','settings_products','settings_ingredients','purchasing_orders'],
  'Kasiyer': ['order','packages','payments','tips','giftcards','crm'],
  'Satınalma': ['purchasing_orders','purchasing_manage','purchasing_suppliers','purchasing_reports','settings_ingredients'],
  'Müdür Yardımcısı': ['order','packages','kitchen','payments','reservations','crm','shifts','purchasing_orders','purchasing_manage','purchasing_suppliers','settings_products','settings_ingredients','settings_zones','settings_flags']
};
function applyRoleTemplate(name){
  const perms = ROLE_TEMPLATES[name] || [];
  document.getElementById('new_role_name').value = name;
  document.querySelectorAll('input[data-perms-group="new_role"]').forEach(b => { b.checked = perms.includes(b.value); });
  markRoleDirty('new_role');
}
function roleCardHtml(r, i){
  const total = rolePermissionCatalog().length, sc = `var(--c${(i||0)%4+1})`;
  if(r.is_system) return `
    <div class="role-card role-sys" style="--sc:var(--c3);">
      <div class="role-head" style="cursor:default;">
        <div class="role-avatar">👑</div>
        <div class="role-title"><b>${escapeHtml(r.name)}</b> <span class="role-badge" style="margin-left:6px;font-size:11px;padding:3px 9px;">Sistem</span>
          <div class="role-sub">Yalnızca işletme sahibinde · tüm ekranlara erişir · değiştirilemez</div></div>
        <div class="role-meta"><span class="role-chip">${r.user_count} kullanıcı</span><span class="role-chip accent">Tüm izinler</span></div>
      </div>
    </div>`;
  const g = 'role_'+r.id, perms = r.permissions || [];
  return `
    <div class="role-card" data-role-card="${g}" style="--sc:${sc};">
      <div class="role-head" ${act('openSheet', 'rs_'+g)}>
        <div class="role-avatar">${escapeHtml((r.name||'?')[0].toLocaleUpperCase('tr'))}</div>
        <div class="role-title"><b>${escapeHtml(r.name)}</b>${r.shift_exempt ? ' <span class="role-badge" style="margin-left:6px;font-size:11px;padding:3px 9px;" title="Vardiya açmadan çalışabilir">⏱ Vardiyasız</span>' : ''}<div class="role-sub">${escapeHtml(rolePermSummary(perms))}</div></div>
        <div class="role-meta"><span class="role-chip">👥 ${r.user_count}</span><span class="role-pbar" title="İzin kapsamı"><i style="width:${Math.round(perms.filter(p => rolePermissionCatalog().some(c => c.id===p)).length/total*100)}%;"></i></span><span class="role-chip accent role-perm-count">${perms.filter(p => rolePermissionCatalog().some(c => c.id===p)).length} / ${total} izin</span></div>
        <span class="role-chevron">▶</span>
      </div>
    </div>
    ${sheetHtml('rs_'+g, escapeHtml((r.name||'?')[0].toLocaleUpperCase('tr')), escapeHtml(r.name) + ' rolü', `
        <div class="field-group" style="margin:0 0 6px;"><label>Rol Adı</label><input value="${escapeAttr(r.name)}" id="role_name_${r.id}" ${actOn('input','markRoleDirty',[g])}></div>
        ${permissionCheckboxes(g, perms)}
        <div class="role-actions">
          <button class="ghost-btn" style="width:auto;margin:0;color:var(--red);border-color:var(--red);" ${act('deleteRole', r.id)} ${r.user_count>0?`title="Bu role atanmış ${r.user_count} kullanıcı var"`:''}>${ICON_TRASH}<span>Rolü Sil</span></button>
          <span class="spacer"></span>
          <span class="role-dirty-note">● Kaydedilmemiş değişiklik</span>
          <button style="width:auto;margin:0;padding:10px 22px;" ${act('saveRole', r.id)}>${ICON_SAVE}<span>Kaydet</span></button>
        </div>
`, sc)}`;
}
function renderRolesSettings(el, session){
  const roles = APP.config.roles || [];
  const custom = roles.filter(r => !r.is_system);
  el.innerHTML = statChips([['🔑', roles.length, 'Rol', 'var(--c1)', 'all'], ['👥', roles.reduce((x, r) => x + (Number(r.user_count)||0), 0), 'Rol atanmış kullanıcı', 'var(--c2)', 'used'],
      ['⏱', custom.filter(r => r.shift_exempt).length, 'Vardiyasız rol', 'var(--c3)', 'exempt'], ['💤', custom.filter(r => !Number(r.user_count)).length, 'Kullanılmayan rol', 'var(--c4)', 'unused']], '', 'roles') + `<div class="box" style="max-width:none;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div><h2 style="margin-bottom:4px;">Roller</h2>
        <p class="muted" style="margin:0 0 16px;">Bir role tıklayarak hangi ekranlara erişebileceğini seçin. Bir kullanıcıya en fazla 2 rol verilebilir; izinleri birleşir.</p></div>
      <button style="width:auto;margin:0;" ${act('openNewRoleCard')}>+ Yeni Rol</button>
    </div>
    <div class="role-list" data-cf-scope="roles">${roles.map((r, i) => roleCardHtml(r, i).replace('<div class="role-card', `<div data-cf-tags="${Number(r.user_count) ? 'used' : 'unused'}${r.shift_exempt ? ' exempt' : ''}" class="role-card`)).join('')}</div>
    <div class="role-card" data-role-card="new_role" style="border-style:dashed;">
      <div class="role-head" ${act('openNewRoleCard')}>
        <div class="role-avatar">＋</div>
        <div class="role-title"><b>Yeni Rol Oluştur</b><div class="role-sub">Hazır şablonla başlayın ya da izinleri kendiniz seçin</div></div>
        <div class="role-meta"><span class="role-chip accent role-perm-count">0 / ${rolePermissionCatalog().length} izin</span></div>
        <span class="role-chevron">▶</span>
      </div>
    </div>
    ${sheetHtml('rs_new_role', '＋', 'Yeni Rol', `
        <div class="role-templates"><span class="muted" style="font-size:12px;align-self:center;">Şablon:</span>
          ${Object.keys(ROLE_TEMPLATES).map(t => `<button class="sbtn" style="margin:0;" ${act('applyRoleTemplate', jsArg(t))}>${escapeHtml(t)}</button>`).join('')}
        </div>
        <div class="field-group" style="margin:10px 0 6px;"><label>Rol Adı</label><input id="new_role_name" placeholder="örn. Kasiyer" ${actOn('input','markRoleDirty',['new_role'])}></div>
        ${permissionCheckboxes('new_role', [])}
        <div class="role-actions"><span class="spacer"></span>
          <button style="width:auto;margin:0;padding:10px 22px;" ${act('createRole')}>+ Rolü Oluştur</button>
        </div>
`, 'var(--c1)')}
  </div>`;
}
async function saveRole(id){
  const session = getSession();
  const name = document.getElementById('role_name_'+id).value.trim();
  const perms = selectedPermissions('role_'+id);
  if(!name){ alert('Rol adı gerekli'); return; }
  const { error } = await sb.rpc('manager_upsert_role', { p_token: session.session_token, p_id: id, p_name: name, p_permissions: perms });
  if(error){ alert(error.message); return; }
  closeSheet();
  renderSettingsView(document.getElementById('main'), session);
  showToast('Kaydedildi ✓');
}
async function createRole(){
  const session = getSession();
  const name = document.getElementById('new_role_name').value.trim();
  const perms = selectedPermissions('new_role');
  if(!name){ alert('Rol adı gerekli'); return; }
  const { error } = await sb.rpc('manager_upsert_role', { p_token: session.session_token, p_id: null, p_name: name, p_permissions: perms });
  if(error){ alert(error.message); return; }
  closeSheet();
  renderSettingsView(document.getElementById('main'), session);
}
async function deleteRole(id){
  if(!await uiConfirm('Bu rolü silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('manager_delete_role', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  closeSheet();
  renderSettingsView(document.getElementById('main'), session);
}

/* --- Entegrasyonlar: ÖKC/e-Fatura ve pazaryeri (Yemeksepeti/Trendyol/Getir)
   API kimlik bilgileri burada sadece güvenli şekilde SAKLANIR - gerçek bir
   dış servis çağrısı yapılmıyor. Bir e-fatura entegratörüyle (Foriba,
   İzibiz, Logo, Nesbilgi vb.) sözleşme yapılıp API bilgileri elde
   edildiğinde veya pazaryerlerinden onaylı işletme/API erişimi
   sağlandığında, bu ekrandan girilen anahtarlar üzerinden gerçek
   bağlantı ayrıca kodlanmalı (backend'de sadece ayarları okuyan/yazan
   RPC'ler var: get_integration_settings/update_efatura_settings/
   update_marketplace_settings). */
async function renderIntegrationsSettings(el, session){
  const { data, error } = await sb.rpc('get_integration_settings', { p_token: session.session_token });
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>ÖKC / e-Fatura Entegrasyonu <span class="role-badge" style="font-weight:600;">Eklenti</span></h2>
    <p class="muted" style="margin-top:-6px;">Bu bölüm şu an sadece kimlik bilgilerinizi güvenli şekilde saklar. Gerçek bağlantı, bir e-fatura entegratörüyle (Foriba, İzibiz, Logo, Nesbilgi vb.) sözleşme yapıldıktan sonra aktif hale getirilir.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:500px;">
      <div class="field-group"><label>Entegratör</label>
        <select id="int_efatura_provider">
          <option value="">Seçilmedi</option>
          <option value="foriba" ${data.efatura_provider==='foriba'?'selected':''}>Foriba</option>
          <option value="izibiz" ${data.efatura_provider==='izibiz'?'selected':''}>İzibiz</option>
          <option value="logo" ${data.efatura_provider==='logo'?'selected':''}>Logo</option>
          <option value="nesbilgi" ${data.efatura_provider==='nesbilgi'?'selected':''}>Nesbilgi</option>
          <option value="other" ${data.efatura_provider==='other'?'selected':''}>Diğer</option>
        </select>
      </div>
      <div class="field-group"><label>API Anahtarı</label><input id="int_efatura_key" type="password" placeholder="${data.efatura_configured?'(değiştirmek için yaz)':'API anahtarı'}"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin-top:10px;">
      <input type="checkbox" id="int_efatura_enabled" ${data.efatura_enabled?'checked':''} style="width:auto;margin:0;"> Aktif
    </label>
    <p class="muted" style="font-size:12px;margin-top:6px;">${data.efatura_configured ? '✓ API anahtarı kayıtlı' : 'Henüz API anahtarı girilmedi'}</p>
    <button style="margin-top:12px;max-width:220px;" ${act('saveEfaturaSettings')}>${ICON_SAVE}<span>Kaydet</span></button>
  </div>
  <div class="box" style="max-width:none;">
    <h2>Pazaryeri Entegrasyonu <span class="role-badge" style="font-weight:600;">Eklenti</span></h2>
    <p class="muted" style="margin-top:-6px;">Yemeksepeti, Trendyol Yemek ve Getir Yemek siparişlerini tek ekrandan almak için gereken altyapı. Gerçek bağlantı için ilgili platformdan onaylı işletme/API erişimi gerekir.</p>
    <div style="display:grid;grid-template-columns:1fr;gap:10px;max-width:500px;">
      <div class="field-group"><label>Yemeksepeti API Anahtarı</label><input id="int_ys_key" type="password" placeholder="${data.marketplace_yemeksepeti_configured?'(değiştirmek için yaz)':'API anahtarı'}"></div>
      <div class="field-group"><label>Trendyol Yemek API Anahtarı</label><input id="int_ty_key" type="password" placeholder="${data.marketplace_trendyol_configured?'(değiştirmek için yaz)':'API anahtarı'}"></div>
      <div class="field-group"><label>Getir Yemek API Anahtarı</label><input id="int_gt_key" type="password" placeholder="${data.marketplace_getir_configured?'(değiştirmek için yaz)':'API anahtarı'}"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin-top:10px;">
      <input type="checkbox" id="int_marketplace_enabled" ${data.marketplace_enabled?'checked':''} style="width:auto;margin:0;"> Aktif
    </label>
    <p class="muted" style="font-size:12px;margin-top:6px;">
      ${data.marketplace_yemeksepeti_configured?'✓ Yemeksepeti':'✗ Yemeksepeti'} ·
      ${data.marketplace_trendyol_configured?'✓ Trendyol Yemek':'✗ Trendyol Yemek'} ·
      ${data.marketplace_getir_configured?'✓ Getir Yemek':'✗ Getir Yemek'}
    </p>
    <button style="margin-top:12px;max-width:220px;" ${act('saveMarketplaceSettings')}>${ICON_SAVE}<span>Kaydet</span></button>
  </div>
  <div class="box" style="max-width:none;">
    <h2>📊 Muhasebe Entegrasyonu <span class="role-badge" style="font-weight:600;">Eklenti</span></h2>
    <p class="muted" style="margin-top:-6px;">Satış verilerinizi muhasebe programınıza (Logo, Mikro, Netsis vb.) otomatik aktarmak için gereken altyapı. Bu bölüm şu an sadece kimlik bilgilerinizi güvenli şekilde saklar - gerçek veri aktarımı, ilgili yazılımla sözleşme/entegrasyon onayı alındıktan sonra aktif hale getirilir. Bu özellik hiçbir pakete dahil değildir, ayrı bir eklenti olarak satın alınması gerekir.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:500px;">
      <div class="field-group"><label>Muhasebe Yazılımı</label>
        <select id="int_accounting_provider">
          <option value="">Seçilmedi</option>
          <option value="logo" ${data.accounting_provider==='logo'?'selected':''}>Logo</option>
          <option value="mikro" ${data.accounting_provider==='mikro'?'selected':''}>Mikro</option>
          <option value="netsis" ${data.accounting_provider==='netsis'?'selected':''}>Netsis</option>
          <option value="other" ${data.accounting_provider==='other'?'selected':''}>Diğer</option>
        </select>
      </div>
      <div class="field-group"><label>API Anahtarı</label><input id="int_accounting_key" type="password" placeholder="${data.accounting_configured?'(değiştirmek için yaz)':'API anahtarı'}"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin-top:10px;">
      <input type="checkbox" id="int_accounting_enabled" ${data.accounting_enabled?'checked':''} style="width:auto;margin:0;"> Aktif
    </label>
    <p class="muted" style="font-size:12px;margin-top:6px;">${data.accounting_configured ? '✓ API anahtarı kayıtlı' : 'Henüz API anahtarı girilmedi'}</p>
    <button style="margin-top:12px;max-width:220px;" ${act('saveAccountingSettings')}>${ICON_SAVE}<span>Kaydet</span></button>
  </div>
  <div class="box" style="max-width:none;">
    <h2>⭐ Google Yorumları</h2>
    <p class="muted" style="margin-top:-6px;">İşletmenizin Google Business Profili'ndeki "yorum yaz" linkini girin. Ödeme alma ekranında bir hesabın tamamı ödendiğinde, personele bu linke giden bir QR kod gösterme seçeneği çıkar - müşteriden telefonuyla okutup değerlendirme bırakmasını isteyebilirsiniz.</p>
    <div class="field-group" style="max-width:500px;"><label>Google Yorum Linki</label><input id="int_google_review_url" placeholder="https://g.page/r/..." value="${escapeAttr(APP.config.google_review_url||'')}"></div>
    <button style="margin-top:12px;max-width:220px;" ${act('saveGoogleReviewUrl')}>${ICON_SAVE}<span>Kaydet</span></button>
  </div>
  <div class="box oo-box" style="max-width:none;">
    <h2>🛵 Dışarıdan Online Sipariş</h2>
    <div class="oo-hero ${APP.config.online_ordering && APP.config.online_ordering.enabled?'on':''}">
      <div class="oo-hero-ic">🛵</div>
      <div class="oo-hero-t"><b>Kendi sipariş sayfanız</b><small>Müşteriler telefondan gel-al veya paket sipariş verir; istekler "Sipariş Al" şeridine düşer, onaylayınca Paket Servis'e geçer. Komisyon yok.</small></div>
      <label class="oo-switch" title="Sipariş sayfasını aç/kapat">
        <input type="checkbox" id="int_online_ordering_enabled" ${APP.config.online_ordering && APP.config.online_ordering.enabled?'checked':''} ${actOn('change','saveOnlineOrderingSettings',[])}>
        <span class="oo-track"><span class="oo-thumb"></span></span><em>${APP.config.online_ordering && APP.config.online_ordering.enabled?'Açık':'Kapalı'}</em>
      </label>
    </div>
    <div class="oo-grid">
      <div class="oo-col">${APP.config.online_ordering && APP.config.online_ordering.enabled ? onlineOrderingLinkHtml() : `<div class="oo-share oo-off"><span>🔒</span><b>Sayfa kapalı</b><small>Açtığınızda burada QR kodunuz ve paylaşım linkiniz çıkar.</small></div>`}
        <div class="oo-quick">
          <button type="button" class="oo-chip" ${act('goProductMedia')}><span>📷</span><b>Ürün fotoğrafları</b><small>Görsel & açıklama ekle</small></button>
          <div class="oo-chip oo-chip-info"><span>📚</span><b>Başlıklar = menüleriniz</b><small>Ayarlar → İstasyonlar → Menüler</small></div>
        </div>
      </div>
      <div class="oo-col" id="ooPayCol"></div>
    </div>
  </div>`;
  // Paketinizde/eklentilerinizde olmayan bölümler kilitli gösterilir
  // (sunucu da ilgili RPC'lerde PAKET_OZELLIK_YOK ile reddediyor).
  const boxFeatures = ['efatura','marketplace','accounting','google_reviews','online_ordering'];
  el.querySelectorAll(':scope > .box').forEach((box, i) => {
    const f = boxFeatures[i];
    if(!f || hasFeature(f)) return;
    const title = box.querySelector('h2') ? box.querySelector('h2').outerHTML : '';
    box.innerHTML = title + lockedFeatureHtml() + `<div class="addon-buy" data-addon="${f}"></div>`;
    loadAddonPurchaseBox(box.querySelector('.addon-buy'), f);
  });
  // Fatura bilgileri tüm paketlerde: ödeme sonrası e-postayla gönderilen
  // hesap/faturanın başlığında görünür (bkz. email_invoice).
  const inv = document.createElement('div');
  inv.className = 'box'; inv.style.maxWidth = 'none';
  inv.innerHTML = `<h2>🧾 Fatura Bilgileri</h2>
    <p class="muted" style="margin-top:-6px;">Ödeme sonrası müşteriye e-postayla gönderilen hesap/faturanın üstünde görünür.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:640px;">
      <div class="field-group"><label>Ünvan</label><input id="inv_title" value="${escapeAttr(data.invoice_title||'')}" placeholder="${escapeAttr(APP.config&&APP.config.restaurant_name||'İşletme ünvanı')}"></div>
      <div class="field-group"><label>VKN / TCKN</label><input id="inv_tax" value="${escapeAttr(data.tax_number||'')}" inputmode="numeric" maxlength="11"></div>
      <div class="field-group"><label>Vergi Dairesi</label><input id="inv_office" value="${escapeAttr(data.tax_office||'')}"></div>
      <div class="field-group"><label>Adres</label><input id="inv_addr" value="${escapeAttr(data.invoice_address||'')}"></div>
    </div>
    <button style="max-width:200px;margin-top:10px;" ${act('saveInvoiceSettings')}>${ICON_SAVE}<span>Kaydet</span></button>
    <h3 style="margin:18px 0 6px;font-size:14px;">Son 30 günde gönderilenler</h3>
    <div id="invoiceList" class="muted" style="font-size:13px;">Yükleniyor...</div>`;
  el.appendChild(inv);
  const sms = document.createElement('div');
  sms.className = 'box'; sms.style.maxWidth = 'none';
  sms.innerHTML = `<h2>📱 SMS Bildirimleri</h2>
    <p class="muted" style="margin-top:-6px;">Açıkken müşterilere otomatik SMS gider: rezervasyon onayı ve 2 saat kala hatırlatma, paket siparişi hazır olunca bildirim, bekleme listesinde "Masa Hazır" butonu.</p>
    <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin:10px 0;">
      <input type="checkbox" id="int_sms_enabled" ${data.sms_enabled?'checked':''} style="width:auto;margin:0;" ${actOn('change','saveSmsSettings',['$checked'])}> Aktif
    </label><div id="tiSms"></div>`;
  el.insertBefore(sms, inv);
  const today = new Date(), from = new Date(Date.now()-29*864e5);
  const iso = d => d.toLocaleDateString('sv-SE');
  sb.rpc('list_invoices', { p_token: session.session_token, p_date: iso(from), p_date_to: iso(today) }).then(({ data: rows, error: e }) => {
    const box = document.getElementById('invoiceList'); if(!box) return;
    if(e){ box.textContent = e.message; return; }
    const st = { emailed:'E-posta', efatura_queued:'e-Fatura kuyrukta', efatura_issued:'e-Fatura kesildi', efatura_failed:'e-Fatura hata' };
    box.innerHTML = !(rows||[]).length ? 'Henüz gönderilen yok.' : `<table class="settings-table"><thead><tr><th>No</th><th>Tarih</th><th>E-posta</th><th>Alıcı</th><th>Tutar</th><th>Durum</th></tr></thead><tbody>${
      rows.map(r => `<tr><td>${escapeHtml(r.number)}</td><td>${new Date(r.created_at).toLocaleString('tr-TR')}</td><td>${escapeHtml(r.email||'')}</td><td>${escapeHtml(r.buyer_name||'—')}</td><td>${money(r.total)}</td><td>${st[r.status]||escapeHtml(r.status)}</td></tr>`).join('')}</tbody></table>`;
  });
  // Her entegrasyon ayrı alt sekmede (tek uzun sayfa yerine).
  const INT_TABS = [
    { id:'online', ic:'🛵', label:'Online Sipariş' }, { id:'google', ic:'⭐', label:'Google Yorumları' },
    { id:'sms', ic:'📱', label:'SMS' }, { id:'invoice', ic:'🧾', label:'Fatura Bilgileri' },
    { id:'mail', ic:'✉️', label:'E-posta' },
    { id:'efatura', ic:'🧾', label:'ÖKC / e-Fatura' }, { id:'marketplace', ic:'🛍️', label:'Pazaryeri' }, { id:'accounting', ic:'📊', label:'Muhasebe' },
  ];
  const order = ['efatura','marketplace','accounting','google','online','sms','invoice'];
  const boxes = [...el.querySelectorAll(':scope > .box')];
  boxes.forEach((b, i) => { b.dataset.int = order[i]; b.classList.add('int-pane'); });
  // İşletmenin kendi e-posta ve online ödeme hesapları (bkz. renderTenantIntegrations).
  [['mail','✉️ E-posta Gönderimi','tiMail']].forEach(([k, t, id]) => {
    const b = document.createElement('div'); b.className = 'box int-pane'; b.style.maxWidth = 'none'; b.dataset.int = k;
    b.innerHTML = `<h2>${t}</h2><div id="${id}"><p class="muted">Yükleniyor…</p></div>`; el.appendChild(b); boxes.push(b);
  });
  // Online kartla ödeme, Online Sipariş sekmesinin içinde.
  const onl = boxes.find(x => x.dataset.int === 'online');
  if(onl){ const d = document.createElement('div'); d.id = 'tiPay'; (onl.querySelector('#ooPayCol') || onl).appendChild(d); }
  if(!INT_TABS.some(t => t.id === APP.integrationsSubTab)) APP.integrationsSubTab = 'online';
  const INT_DESC = { online:'Kendi sipariş sayfanız ve kartla ödeme', google:'İşletme yorumlarını takip edin', sms:'Müşterilere SMS bildirimi', mail:'Kendi alan adınızdan e-posta', pay:'iyzico / PayTR ile kartla ödeme', invoice:'Faturada görünecek bilgiler',
    efatura:'Yazarkasa ve e-Fatura/e-Arşiv', marketplace:'Pazaryeri menü eşitleme', accounting:'Muhasebe yazılımına aktarım' };
  const stOf = (id) => { const b = boxes.find(x => x.dataset.int === id); const t = b ? b.textContent : '';
    return /paketinizde yok|eklenti/i.test(t) && /paketinizde yok/i.test(t) ? ['lock','🔒 Eklenti'] : ['ok','● Kullanılabilir']; };
  const bar = document.createElement('div');
  bar.className = 'int-groups';
  const GROUPS = [['🛒 Satış kanalları', ['online','marketplace','google']], ['💬 Müşteri iletişimi', ['sms','mail']], ['🧾 Fatura & muhasebe', ['invoice','efatura','accounting']]];
  bar.innerHTML = GROUPS.map(([g, ids]) => `<div class="int-group"><div class="int-gt">${g}</div><div class="int-gl">${ids.map(id => { const t = INT_TABS.find(x => x.id === id); if(!t) return ''; const [k, l] = stOf(id);
    return `<button type="button" class="int-row ${APP.integrationsSubTab===id?'active':''} st-${k}" data-int-tab="${id}" ${act('setIntegrationsSubTab', id)}>
      <span class="int-ic">${t.ic}</span><span class="int-txt"><b>${t.label}</b><small>${INT_DESC[id]||''}</small></span><span class="int-st">${k==='lock' ? '🔒' : '●'}</span></button>`; }).join('')}</div></div>`).join('');
  el.insertBefore(bar, el.firstChild);
  showIntegrationPane();
  renderTenantIntegrations(session);
}
function showIntegrationPane(){
  document.querySelectorAll('#settingsContent .int-pane').forEach(b => { b.style.display = b.dataset.int === APP.integrationsSubTab ? '' : 'none'; });
  document.querySelectorAll('#settingsContent [data-int-tab]').forEach(t => t.classList.toggle('active', t.dataset.intTab === APP.integrationsSubTab));
}
function setIntegrationsSubTab(t){ APP.integrationsSubTab = t; showIntegrationPane(); }
async function saveSmsSettings(enabled){
  const session = getSession();
  const { error } = await sb.rpc('update_sms_settings', { p_token: session.session_token, p_enabled: enabled });
  if(error){ alert(error.message); return; }
  showToast(enabled ? 'SMS bildirimleri açıldı ✓' : 'SMS bildirimleri kapatıldı');
}
async function saveInvoiceSettings(){
  const session = getSession();
  const v = id => document.getElementById(id).value;
  const { error } = await sb.rpc('update_invoice_settings', { p_token: session.session_token,
    p_title: v('inv_title'), p_tax_number: v('inv_tax'), p_tax_office: v('inv_office'), p_address: v('inv_addr') });
  if(error){ alert(error.message); return; }
  showToast('Fatura bilgileri kaydedildi ✓');
}
/* Kilitli eklenti: abonelikteki havale akışının aynısı - IBAN'a gönderip
   "Ödemeyi Yaptım" bildirimi; platform yöneticisi onaylayınca eklenti açılır
   (bkz. submit_addon_transfer_notice / admin_review_bank_transfer_notice).
   Google Play politikası gereği native uygulamada gösterilmez. */
async function loadAddonPurchaseBox(el, addonId){
  if(!el || isNativeApp()) return;
  const session = getSession();
  const { data, error } = await sb.rpc('get_addon_purchase_info', { p_token: session.session_token, p_addon_id: addonId });
  if(error || !data || !data.addon || !(Number(data.addon.price) > 0)) return;
  const a = data.addon;
  if(data.pending){
    el.innerHTML = `<div class="add-row-panel" style="border-color:var(--accent);margin-top:12px;">
      <b>🏦 Ödeme bildiriminiz alındı</b>
      <p class="muted" style="text-align:left;margin:6px 0 0;">${money(data.pending.amount)} tutarındaki bildiriminiz ${new Date(data.pending.created_at).toLocaleString('tr-TR')} tarihinde iletildi. Onaylanınca eklenti otomatik açılacak.</p></div>`;
    return;
  }
  if(!data.is_manager){ return; }
  el.innerHTML = `<div class="add-row-panel" style="margin-top:12px;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
      <b>🧩 ${escapeHtml(a.label)} eklentisini ekleyin</b>
      <span class="role-badge" style="color:var(--accent);border-color:var(--accent);">${money(a.price)} / ay</span>
    </div>
    ${data.iban ? `<p class="muted" style="text-align:left;margin:8px 0;font-size:13px;">Tutarı aşağıdaki hesaba havale/EFT ile gönderip <b>Ödemeyi Yaptım</b>'a basın. Açıklamaya işletme adınızı yazın.</p>
    <div style="background:var(--panel2);border-radius:10px;padding:10px 12px;font-size:13.5px;line-height:1.7;">
      ${data.bank_name ? `<div>Banka: <b>${escapeHtml(data.bank_name)}</b></div>` : ''}
      ${data.account_name ? `<div>Alıcı: <b>${escapeHtml(data.account_name)}</b></div>` : ''}
      <div style="overflow-wrap:anywhere;">IBAN: <b>${escapeHtml(data.iban)}</b> <a href="#" style="color:var(--accent);font-size:12px;" ${act('copyText', data.iban, 'IBAN kopyalandı ✓')}>Kopyala</a></div>
    </div>
    <div class="field-group" style="margin-top:10px;"><label>Not (opsiyonel)</label><input class="addon-note" placeholder="örn. gönderen adı / dekont no"></div>
    <button style="max-width:240px;" ${act('submitAddonTransfer', '$this', addonId)}>🏦 Ödemeyi Yaptım</button>`
    : '<p class="muted" style="text-align:left;">Banka bilgileri henüz tanımlanmamış, lütfen bizimle iletişime geçin.</p>'}
  </div>`;
}
async function submitAddonTransfer(btn, addonId){
  const wrap = btn.closest('.addon-buy');
  const noteEl = wrap && wrap.querySelector('.addon-note');
  if(!await uiConfirm('Havale/EFT ödemesini yaptığınızı onaylıyor musunuz?')) return;
  btn.disabled = true;
  const session = getSession();
  const { error } = await sb.rpc('submit_addon_transfer_notice', { p_token: session.session_token, p_addon_id: addonId, p_note: noteEl ? (noteEl.value.trim()||null) : null });
  if(error){ btn.disabled = false; alert(error.message); return; }
  showToast('Ödeme bildiriminiz alındı ✓ Onaylanınca eklenti açılacak.');
  loadAddonPurchaseBox(wrap, addonId);
}
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
        <button type="button" class="sbtn" style="width:auto;margin:0;" ${i===0?'disabled':''} ${act('moveOnlineSection', sec.id, -1)} title="Yukarı">↑</button>
        <button type="button" class="sbtn" style="width:auto;margin:0;" ${i===d.sections.length-1?'disabled':''} ${act('moveOnlineSection', sec.id, 1)} title="Aşağı">↓</button>
        <button type="button" class="sbtn" style="width:auto;margin:0;" ${act('saveOnlineSectionName', sec.id)}>💾</button>
        <button type="button" class="sbtn" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" ${act('removeOnlineSection', sec.id)}>🗑️</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">
        ${sec.product_ids.map(id => byId[id]).filter(Boolean).map(p => `<span class="role-badge" style="display:inline-flex;gap:6px;align-items:center;">${escapeHtml(p.name)} <span class="muted" style="font-size:11px;">(${escapeHtml(p.station_name||'-')})</span><a href="#" style="color:var(--red);text-decoration:none;" ${act('toggleOnlineSectionProduct', sec.id, p.id)}>✕</a></span>`).join('') || '<span class="muted" style="font-size:12.5px;">Henüz ürün yok.</span>'}
      </div>
      <button type="button" class="ghost-btn" style="max-width:200px;margin-top:10px;" ${act('pickOnlineSectionProducts', sec.id)}>+ Ürün Ekle / Çıkar</button>
    </div>`).join('');
  const photosHtml = d.products.map(p => `
    <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);">
      ${p.image ? `<img src="${p.image}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0;">` : '<div style="width:56px;height:56px;border-radius:10px;background:var(--panel2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">📷</div>'}
      <div style="flex:1;min-width:0;"><b style="overflow-wrap:anywhere;">${escapeHtml(p.name)}</b><div class="muted" style="font-size:12px;">${escapeHtml(p.station_name||'-')} · ${money(p.price)}</div></div>
      <label class="sbtn" style="width:auto;margin:0;cursor:pointer;">${p.image?'Değiştir':'Fotoğraf Ekle'}<input type="file" accept="image/*" style="display:none;" ${actOn('change','uploadProductImage',[p.id, '$this'])}></label>
      ${p.image ? `<button type="button" class="sbtn" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" ${act('removeProductImage', p.id)}>✕</button>` : ''}
    </div>`).join('');
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:640px;width:100%;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h2 style="margin:0;">🗂️ Online Menü</h2>
      <span style="cursor:pointer;color:var(--muted);font-size:20px;" ${act('removeEl','onlineMenuBg')}>✕</span>
    </div>
    <div class="sub-tabs" style="margin-bottom:14px;">
      <div role="tab" tabindex="0" class="sub-tab ${tab==='sections'?'active':''}" ${act('setOnlineMenuTab','sections')}><span class="sub-tab-ic">🗂️</span>Başlıklar</div>
      <div role="tab" tabindex="0" class="sub-tab ${tab==='photos'?'active':''}" ${act('setOnlineMenuTab','photos')}><span class="sub-tab-ic">📷</span>Fotoğraflar</div>
    </div>
    ${tab==='sections' ? `
      <p class="muted" style="text-align:left;margin:0 0 12px;font-size:13px;">Online sipariş sayfasında müşteriye görünecek başlıkları oluşturun ve ürünleri yerleştirin (örn. lahmacunu "Fırın" başlığına). Ürünün fişi yine kendi istasyonuna gider. Hiç başlık yoksa ürünler istasyonlara göre listelenir; başlık varsa yalnızca başlıklardaki ürünler görünür.</p>
      ${sectionsHtml || '<p class="muted">Henüz başlık yok.</p>'}
      <div style="display:flex;gap:8px;margin-top:6px;"><input id="oms_new" placeholder="Yeni başlık (örn. Fırın)" style="margin:0;flex:1;"><button type="button" style="width:auto;margin:0;" ${act('addOnlineSection')}>+ Ekle</button></div>`
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
    <h3 style="margin:0 0 8px;">${escapeHtml(sec.name)} · ürünler</h3>
    <input id="omsPickSearch" placeholder="Ara..." style="margin:0 0 8px;" ${actOn('input','filterOmsPickList',['$value'])}>
    <div id="omsPickList" style="overflow:auto;flex:1;">
      ${APP.onlineMenu.products.map(p => `<label style="display:flex;gap:10px;align-items:center;padding:7px 2px;border-bottom:1px solid var(--border);cursor:pointer;">
        <input type="checkbox" value="${p.id}" style="width:auto;margin:0;" ${sec.product_ids.includes(p.id)?'checked':''}>
        <span style="flex:1;">${escapeHtml(p.name)} <span class="muted" style="font-size:11.5px;">${escapeHtml(p.station_name||'-')}</span></span></label>`).join('')}
    </div>
    <div style="display:flex;gap:10px;margin-top:12px;">
      <button type="button" class="ghost-btn" style="flex:1;margin:0;" ${act('removeEl','omsPickBg')}>Vazgeç</button>
      <button type="button" style="flex:1;margin:0;" ${act('applyOnlineSectionPick', secId)}>Kaydet</button>
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
  el.innerHTML = '<div class="box" style="max-width:none;"><p class="muted">Yükleniyor…</p></div>';
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
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;"><h2 style="margin:0;">📷 Fotoğraf & Açıklama</h2><span style="flex:1;"></span>
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
  return `<p class="muted" style="margin:0;">🔒 Bu özellik paketinizde yok. Eklenti olarak eklemek ya da paketinizi yükseltmek için bizimle iletişime geçin.</p>`;
}
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
    el.innerHTML = `<div class="box" style="max-width:none;">
      <h2>💳 Abonelik</h2>
      ${lic ? `<p>Paket: <b>${escapeHtml(lic.package_id)}</b> · Bitiş: <b>${new Date(lic.expires_at).toLocaleDateString('tr-TR')}</b></p>` : ''}
      <p class="muted">Abonelik işlemleri bu uygulama üzerinden yapılamaz; lütfen bir bilgisayar veya tarayıcıdan hesabınıza giriş yapın.</p>
    </div>`;
    return;
  }
  el.innerHTML = `<div class="box" style="max-width:none;">
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
      <h3 style="margin:0 0 8px;">📍 Fatura Adresi</h3>
      <p class="muted" style="text-align:left;">${escapeHtml(lic.billing_address)} · <b>${escapeHtml(lic.billing_city)}</b></p>
      <button class="ghost-btn" ${act('editBillingField','billingAddressEditing')}>Değiştir</button>
    </div>`;
  }
  return `<div class="add-row-panel" style="margin-top:16px;">
    <h3 style="margin:0 0 8px;">📍 Fatura Adresi</h3>
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
      <h3 style="margin:0 0 8px;">🧾 Fatura Kimlik Bilgisi</h3>
      <p class="muted">T.C. Kimlik Numaranız kayıtlı ✓</p>
      <button class="ghost-btn" ${act('editBillingField','billingIdentityEditing')}>Değiştir</button>
    </div>`;
  }
  return `<div class="add-row-panel" style="margin-top:16px;">
    <h3 style="margin:0 0 8px;">🧾 Fatura Kimlik Bilgisi</h3>
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
        <h3 style="margin:0 0 8px;">🏦 Havale Bildirimi Gönderildi</h3>
        <p class="muted">${money(pn.amount)} tutarındaki (${cycleLabel}) havale bildiriminiz ${new Date(pn.created_at).toLocaleString('tr-TR')} tarihinde alındı, platform yöneticisinin onayı bekleniyor. Onaylanınca aboneliğiniz otomatik uzayacak.</p>
        ${pn.note ? `<p class="muted" style="font-size:12px;">Not: ${escapeHtml(pn.note)}</p>` : ''}
      </div>`;
    return;
  }
  if(!data.iban){
    el.innerHTML = `
      <div class="add-row-panel" style="margin-top:16px;">
        <h3 style="margin:0 0 8px;">🏦 Havale ile Öde</h3>
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
      <h3 style="margin:0 0 8px;">🏦 Havale ile Öde (${cycleLabel})</h3>
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

async function addUser(){
  const session = getSession();
  const username = document.getElementById('nu_name').value.trim();
  const password = document.getElementById('nu_pass').value;
  const roleIds = selectedRoleIds('nu');
  if(!username || !password) return;
  if(roleIds.length===0){ alert('En az 1 rol seçmelisiniz'); return; }
  const { error } = await sb.rpc('create_staff_user', { p_token: session.session_token, p_username: username, p_password: password, p_role_ids: roleIds });
  if(error){ alert(error.message); return; }
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
    return { id, isOwner, username: nameEl ? nameEl.value.trim() : '', password: passEl ? passEl.value : '', roleIds,
      exempt: !!(roleIds && roleIds.some(r => exemptIds.includes(r))) };
  });
  if(!rows.length) return;
  const bad = rows.find(r => r.roleIds && r.roleIds.length === 0);
  if(bad){ alert((bad.username || 'Bir kullanıcı') + ': en az 1 rol seçmelisiniz'); return; }
  // Vardiyasız rol sınırına takılmamak için önce bu rolden çıkanlar kaydedilir.
  rows.sort((a, b) => Number(a.exempt) - Number(b.exempt));
  const errors = [];
  await withLoadingOverlay((async () => {
    for(const r of rows){
      const { error } = await sb.rpc('update_staff_user', { p_token: session.session_token, p_user_id: r.id, p_username: r.username, p_password: r.password || null, p_role_ids: r.roleIds });
      if(error) errors.push((r.username || r.id) + ': ' + error.message);
    }
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
    for(const id of ids){
      const { error } = await sb.rpc('set_staff_user_active', { p_token: session.session_token, p_user_id: id, p_active: !!activate });
      if(error) errors.push(error.message);
    }
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
    for(const id of ids){
      const { error } = await sb.rpc('delete_staff_user', { p_token: session.session_token, p_user_id: id });
      if(error) errors.push(error.message);
    }
  })());
  renderSettingsView(document.getElementById('main'), session);
  if(errors.length) alert('Bazı kullanıcılar silinemedi:\n\n' + errors.join('\n'));
  else showToast(ids.length + ' kullanıcı silindi');
}

function setListSearch(key, v){ APP.listSearch[key] = v; filterListRows(key); }
function toggleIngUsageQty(pid, on){ const q = document.getElementById('ingu_qty_' + pid); if(!q) return; q.disabled = !on; if(on) q.focus(); else q.style.borderColor = ''; }
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
  el.innerHTML = '<div class="box" style="max-width:none;"><p class="muted">Yükleniyor…</p></div>';
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
  return [add.length ? '<b style="color:var(--green);">+ ' + escapeHtml(add.join(', ')) + '</b>' : '', rem.length ? '<b style="color:var(--red);">− ' + escapeHtml(rem.join(', ')) + '</b>' : ''].filter(Boolean).join(' ') || 'sıra değişti';
}
async function renderAuditLogSettings(el, session){
  el.innerHTML = '<div class="box" style="max-width:none;"><p class="muted">Yükleniyor…</p></div>';
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
      <td style="white-space:nowrap;">${new Date(r.created_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}</td>
      <td>${escapeHtml(r.user_name || 'Sistem')}${r.is_support ? ' <span style="color:var(--amber, #f59e0b);font-size:11px;">🛟 Destek</span>' : ''}</td>
      <td>${escapeHtml(AUDIT_ENTITIES[r.entity] || r.entity)}${r.label ? '<div class="muted" style="font-size:12px;">' + escapeHtml(r.label) + '</div>' : ''}</td>
      <td>${r.entity==='orders' && r.action==='update' ? 'İptal edildi' : (AUDIT_ACTIONS[r.action] || r.action)}</td>
      <td style="font-size:12.5px;">${changes(r.changes)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;">Henüz kayıt yok.</td></tr>'}
    </tbody></table></div>`;
}

/* ---- İşletmenin kendi hesapları: SMS, e-posta, online ödeme. Gizli anahtarlar sunucuda saklanır,
   buraya yalnızca son 4 hanesi gelir; boş bırakılan gizli alan mevcut değeri korur. ---- */
async function renderTenantIntegrations(session){
  const bs = document.getElementById('tiSms'), bm = document.getElementById('tiMail'), bp = document.getElementById('tiPay'); if(!bs && !bm && !bp) return;
  const { data, error } = await sb.rpc('get_tenant_integrations', { p_token: session.session_token });
  if(error){ [bs, bm, bp].forEach(x => { if(x) x.innerHTML = `<p class="muted">Entegrasyon ayarları yüklenemedi: ${escapeHtml(error.message)}</p>`; }); return; }
  const sm = data.sms || {}, ml = data.mail || {}, py = data.pay || {};
  const opt = (v, cur, l) => `<option value="${v}" ${cur===v?'selected':''}>${l}</option>`;
  const st = (ok, txt) => `<span class="ti-st ${ok?'ok':''}">${ok ? '● Bağlı' : '○ ' + txt}</span>`;
  const cards = [`<div class="ti-card">
      <div class="ti-h"><span>📱</span><b>SMS</b>${st(sm.provider && sm.user && sm.has_pass, 'Bağlı değil — gönderilmez')}</div>
      <p class="muted ti-d">Müşteri SMS'leri (rezervasyon, masa hazır, sipariş) <b>sizin</b> SMS hesabınızdan, kendi başlığınızla gider. Bağlamazsanız müşterilere SMS gönderilmez.</p>
      <label>Sağlayıcı</label><select id="ti_sms_provider">${opt('', sm.provider || '', 'Bağlı değil')}${opt('netgsm', sm.provider, 'NetGSM')}</select>
      <label>API kullanıcı adı (NetGSM kullanıcı kodu)</label><input id="ti_sms_user" value="${escapeAttr(sm.user || '')}" placeholder="850xxxxxxx">
      <label>API şifresi / anahtarı</label><input id="ti_sms_pass" type="password" placeholder="${sm.has_pass ? '•••••• (kayıtlı — değiştirmek için yazın)' : 'NetGSM API alt kullanıcı şifresi'}" autocomplete="new-password">
      <small class="muted" style="text-align:left;">NetGSM panelinde <b>Abonelik İşlemleri → API İşlemleri</b>'nden bir API alt kullanıcısı oluşturup bilgilerini buraya girin.</small>
      <label>Gönderen başlığı</label><input id="ti_sms_header" value="${escapeAttr(sm.header || '')}" placeholder="ÖRN. LEZZETSOFR" maxlength="11">
      <button type="button" ${act('saveTenantInt', 'sms')}>💾 Kaydet</button>
    </div>`, `<div class="ti-card">
      <div class="ti-h"><span>✉️</span><b>E-posta</b>${st(ml.provider && ml.key_tail && ml.from, 'Bağlı değil — gönderilmez')}</div>
      <p class="muted ti-d">Fiş, fatura, rezervasyon ve bekleme listesi e-postaları kendi alan adınızdan (ör. info@restoraniniz.com) gider. Resend veya Brevo hesabınızdaki API anahtarını girin; alan adınızı orada doğrulamanız gerekir. Bağlamazsanız müşterilere e-posta gönderilmez.</p>
      <label>Sağlayıcı</label><select id="ti_mail_provider">${opt('', ml.provider || '', 'Bağlı değil')}${opt('resend', ml.provider, 'Resend')}${opt('brevo', ml.provider, 'Brevo (Sendinblue)')}</select>
      <label>API anahtarı</label><input id="ti_mail_key" type="password" placeholder="${ml.key_tail ? '••••' + escapeAttr(ml.key_tail) + ' (kayıtlı — değiştirmek için yazın)' : 'API anahtarı'}" autocomplete="new-password">
      <label>Gönderen e-posta</label><input id="ti_mail_from" type="email" value="${escapeAttr(ml.from || '')}" placeholder="info@restoraniniz.com">
      <label>Gönderen adı</label><input id="ti_mail_from_name" value="${escapeAttr(ml.from_name || '')}" placeholder="Restoran adınız">
      <button type="button" ${act('saveTenantInt', 'mail')}>💾 Kaydet</button>
    </div>`, `<div class="ti-card">
      <div class="ti-h"><span>💳</span><b>Online ödeme</b>${st((py.mode||'off')!=='off', 'Kapıda ödeme')}</div>
      <p class="muted ti-d">Açarsanız online sipariş sayfasında müşteri kartla ödeyebilir; para doğrudan <b>sizin</b> sanal POS hesabınıza geçer. Kapalıyken müşteri kapıda öder.</p>
      <label>Sipariş sayfasında ödeme</label>
      <div class="ti-modes">
        ${[['off','💵 Kapıda ödeme','Kart istenmez; müşteri teslimde öder. Sipariş hemen düşer.'],['optional','🔀 Müşteri seçsin','Kapıda veya online kartla. Online seçerse sipariş ödeme sonrası düşer.'],['required','💳 Önce online ödeme','Her sipariş önce kartla ödenir; ödeme başarılı olunca size düşer.']].map(([k, l, d]) => `<label class="ti-mode ${(py.mode||'off')===k?'on':''}"><input type="radio" name="ti_pay_mode" value="${k}" ${(py.mode||'off')===k?'checked':''} ${actOn('change','tiPayToggle',[k])}><b>${l}</b><small>${d}</small></label>`).join('')}
      </div>
      <div id="tiPayFields" style="${(py.mode||'off')!=='off'?'':'display:none;'}">
        <label>Sağlayıcı</label><select id="ti_pay_provider">${opt('iyzico', py.provider || 'iyzico', 'iyzico')}<option value="paytr" disabled>PayTR (yakında)</option></select>
        <label>API anahtarı (Merchant key / API key)</label><input id="ti_pay_key" type="password" placeholder="${py.key_tail ? '••••' + escapeAttr(py.key_tail) + ' (kayıtlı)' : 'API anahtarı'}" autocomplete="new-password">
        <label>Gizli anahtar (Secret / Merchant salt)</label><input id="ti_pay_secret" type="password" placeholder="${py.has_secret ? '•••••• (kayıtlı)' : 'Gizli anahtar'}" autocomplete="new-password">
        <label class="ti-sw"><input type="checkbox" id="ti_pay_sandbox" ${py.sandbox!==false?'checked':''}> Test modu (gerçek para çekilmez)</label>
      </div>
      <button type="button" ${act('saveTenantInt', 'pay')}>💾 Kaydet</button>
    </div>`];
  if(bs) bs.innerHTML = `<div class="ti-one">${cards[0]}</div>`;
  if(bm) bm.innerHTML = `<div class="ti-one">${cards[1]}</div>`;
  if(bp) bp.innerHTML = `<div class="ti-one">${cards[2]}</div>`;
}
function tiPayToggle(mode){
  const f = document.getElementById('tiPayFields'); if(f) f.style.display = mode !== 'off' ? '' : 'none';
  document.querySelectorAll('.ti-mode').forEach(l => l.classList.toggle('on', l.querySelector('input').value === mode));
}
async function saveTenantInt(kind){
  const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
  const c = (id) => !!(document.getElementById(id) || {}).checked;
  const data = kind==='sms' ? { provider: v('ti_sms_provider'), user: v('ti_sms_user'), pass: v('ti_sms_pass'), header: v('ti_sms_header') }
    : kind==='mail' ? { provider: v('ti_mail_provider'), key: v('ti_mail_key'), from: v('ti_mail_from'), from_name: v('ti_mail_from_name') }
    : { mode: (document.querySelector('input[name=ti_pay_mode]:checked') || {}).value || 'off', provider: v('ti_pay_provider'), key: v('ti_pay_key'), secret: v('ti_pay_secret'), sandbox: c('ti_pay_sandbox') };
  const s = getSession();
  const { error } = await withLoadingOverlay(sb.rpc('save_tenant_integration', { p_token: s.session_token, p_kind: kind, p_data: data }));
  if(error){ alert(error.message); return; }
  showToast({ sms:'SMS', mail:'E-posta', pay:'Online ödeme' }[kind] + ' ayarları kaydedildi ✓');
  renderTenantIntegrations(s);
}
