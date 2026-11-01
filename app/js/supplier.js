/* Tedarikçi & Satınalma - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= TEDARİKÇİ & SATINALMA ================= */
async function renderPurchasingView(main, session){
  // Satın alma talepleri burada verilir; birim fiyat ve tedarikçiler
  // Finansal Analiz > Satınalma'dadır (izin: purchasing_reports / reports).
  const canOrders = hasPurchPerm(session, 'orders') || hasPurchPerm(session, 'manage');
  APP.purchTab = 'orders';
  main.innerHTML = `<h1>Malzeme Siparişi Ver</h1><p class="muted page-sub">İhtiyacınız olan hammaddeleri ve miktarları sipariş verin. Mal geldiğinde teslim alma, tedarikçi seçimi ve birim fiyat <b>Mal Kabul</b> menüsünden yapılır.</p>
    <div id="purchContent">${canOrders ? '' : '<div class="box"><p class="muted">Tedarikçiler artık <b>Satınalma → Tedarikçiler</b> altında.</p></div>'}</div>`;
  if(!canOrders) return;
  // Kritik stok uyarısı güncel stokla hesaplansın.
  try{ const { data } = await sb.rpc('get_restaurant_config', { p_token: session.session_token }); if(data) APP.config = data; }catch(e){}
  applyNavBadges();
  await renderPurchTabContent(session);
}
function setPurchTab(tab){
  if(tab !== APP.purchTab) pushScreen();
  setTimeout(applyNavBadges, 0);
  APP.purchTab = tab;
  document.querySelectorAll('#purchTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  renderPurchTabContent(getSession());
}
function renderPurchTabContent(session){
  return renderPurchaseOrdersContent(session);
}
// Tedarikçi listesi Finansal Analiz > Satınalma > Tedarikçiler içinde çizilir (APP.supplierTarget).
async function renderSuppliersContent(session){
  const el = document.getElementById(APP.supplierTarget || 'purchContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('list_suppliers', { p_token: session.session_token }));
  const rows = error ? [] : (data||[]);
  APP.supplierRows = rows;
  el.innerHTML = `<div class="u-mwn box">
    <div class="fsheet-bar" style="margin:0 0 12px;"><h2 class="u-m0">Tedarikçiler</h2><button type="button" class="fsheet-open" ${act('newSupplier')}>+ Yeni Tedarikçi</button></div>
    ${rows.length ? `<div class="cu-grid">${rows.map((x, i) => `<div class="cu-card" style="--i:${Math.min(i,12)};--tc:var(--c${i%4+1});">
      <div class="cu-top">${avatarHtml(x.name)}<div class="cu-id"><b>${escapeHtml(x.name)}</b><small>Tedarikçi</small></div></div>
      <div class="sup-lines">
        ${x.phone ? `<a class="sup-line" href="tel:${escapeAttr(x.phone)}">📞 ${escapeHtml(x.phone)}</a>` : ''}
        ${x.email ? `<a class="sup-line" href="mailto:${escapeAttr(x.email)}">✉️ ${escapeHtml(x.email)}</a>` : ''}
        ${x.address ? `<span class="sup-line">📍 ${escapeHtml(x.address)}</span>` : ''}
        ${!x.phone && !x.email && !x.address ? '<span class="sup-line muted">İletişim bilgisi yok</span>' : ''}
      </div>
      <div class="pcard-acts"><button type="button" class="pc-btn pc-edit" style="margin-left:0;" ${act('editSupplier', x.id)}>✏️ Düzenle</button><button type="button" class="pc-btn rv-del" style="margin-left:auto;" ${act('removeSupplier', x.id)}>🗑 Sil</button></div>
    </div>`).join('')}</div>` : '<div class="empty-state"><div style="font-size:42px;">🏭</div><p class="muted">Henüz tedarikçi yok.</p></div>'}
    ${sheetHtml('supSheet', '🏭', 'Yeni Tedarikçi', `<input type="hidden" id="sup_edit_id">
      <div class="fsheet-grid">
        <div class="field-group wide"><label>Ad</label><input id="sup_name" placeholder="örn. ABC Gıda Toptan"></div>
        <div class="field-group"><label>Telefon</label><input id="sup_phone" placeholder="opsiyonel" inputmode="tel"></div>
        <div class="field-group"><label>E-posta</label><input id="sup_email" placeholder="opsiyonel" autocapitalize="none"></div>
        <div class="field-group wide"><label>Adres</label><input id="sup_address" placeholder="opsiyonel"></div>
      </div>
      <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','supSheet')}>Vazgeç</button><button ${act('saveSupplier')}>${ICON_SAVE}<span>Kaydet</span></button></div>`, 'var(--c2)')}
  </div>`;
}
function editSupplier(id){
  const s = (APP.supplierRows||[]).find(x => x.id===id); if(!s) return;
  document.getElementById('sup_edit_id').value = s.id;
  document.getElementById('sup_name').value = s.name;
  document.getElementById('sup_phone').value = s.phone||'';
  document.getElementById('sup_email').value = s.email||'';
  document.getElementById('sup_address').value = s.address||'';
  document.getElementById('supSheetTitle').textContent = 'Tedarikçiyi Düzenle';
  openSheet('supSheet');
}
function newSupplier(){
  ['sup_edit_id','sup_name','sup_phone','sup_email','sup_address'].forEach(k => { const e = document.getElementById(k); if(e) e.value = ''; });
  document.getElementById('supSheetTitle').textContent = 'Yeni Tedarikçi';
  openSheet('supSheet');
}
async function saveSupplier(){
  const session = getSession();
  const id = document.getElementById('sup_edit_id').value || null;
  const name = document.getElementById('sup_name').value.trim();
  if(!name){ alert('Tedarikçi adı gerekli'); return; }
  const { error } = await sb.rpc('upsert_supplier', { p_token: session.session_token, p_id: id, p_name: name,
    p_phone: document.getElementById('sup_phone').value.trim()||null,
    p_email: document.getElementById('sup_email').value.trim()||null,
    p_address: document.getElementById('sup_address').value.trim()||null,
    p_notes: null });
  if(error){ alert(error.message); return; }
  closeSheet('supSheet');
  renderSuppliersContent(session);
  showToast('Kaydedildi ✓');
}
async function removeSupplier(id){
  if(!await uiConfirm('Bu tedarikçiyi silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_supplier', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  renderSuppliersContent(session);
}
const PO_STATUS_LABELS = { draft:'Taslak', ordered:'Sipariş Verildi', received:'Teslim Alındı', cancelled:'İptal' };
/* Kısmi teslim: sipariş verilmiş ama bir kısmı teslim alınmışsa "Kısmen
   Teslim (%x)" ve her kalem için alınan/sipariş edilen miktar gösterilir. */
function poStatusBadge(p){
  const ordered = Number(p.ordered_total)||0, received = Number(p.received_total)||0;
  if(p.status==='ordered' && received > 0 && received < ordered){
    return `<span class="role-badge" style="color:#d97706;border-color:#d97706;">Kısmen Teslim (%${Math.round(received/ordered*100)})</span>`;
  }
  const st = p.status==='received' ? 'color:var(--green);border-color:var(--green);' : p.status==='cancelled' ? 'color:var(--red);border-color:var(--red);' : '';
  return `<span class="role-badge" style="${st}">${PO_STATUS_LABELS[p.status]||p.status}</span>`;
}
function fmtDateTr(d){ const x = new Date(d); return isNaN(x) ? String(d||'') : x.toLocaleDateString('tr-TR'); }
function fmtQty(n){ const v = Number(n)||0; return Number.isInteger(v) ? String(v) : v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }); }
function poItemsProgressHtml(p){
  const items = p.items || [];
  if(!items.length || p.status==='draft' || p.status==='cancelled') return '';
  return `<div style="margin-top:6px;font-size:12px;line-height:1.5;">${items.map(it => {
    const done = Number(it.received) >= Number(it.quantity);
    const partial = Number(it.received) > 0 && !done;
    return `<div style="color:${done?'var(--green)':partial?'#d97706':'var(--muted)'};">${done?'✓':partial?'◐':'○'} ${escapeHtml(it.name)}: <b>${fmtQty(it.received)}</b> / ${fmtQty(it.quantity)} ${escapeHtml(it.unit)}${partial ? ` <span class="muted">(kalan ${fmtQty(it.quantity - it.received)})</span>` : ''}</div>`;
  }).join('')}</div>`;
}
async function renderPurchaseOrdersContent(session){
  const el = document.getElementById('purchContent'); if(!el) return;
  if(!APP.config){ const { data } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token })); if(data) APP.config = data; }
  const [poRes, supRes] = await withLoadingOverlay(Promise.all([
    sb.rpc('list_purchase_orders', { p_token: session.session_token }),
    sb.rpc('list_suppliers', { p_token: session.session_token })
  ]));
  const rows = poRes.error ? [] : (poRes.data||[]);
  APP.poRows = rows;
  const suppliers = supRes.data || [];
  const canManage = hasPurchPerm(session, 'manage');
  const ownDraft = (p) => p.status==='draft' && (canManage || p.created_by===session.user_id);
  if(!APP.poDraftItems) APP.poDraftItems = [];
  const PO_TONE = { draft:'#a78bfa', ordered:'#f59e0b', received:'var(--green)', cancelled:'var(--red)' };
  const cnt = (st) => rows.filter(p => p.status===st).length;
  const today = new Date(); today.setHours(0,0,0,0);
  const isLate = (p) => p.status==='ordered' && p.expected_date && new Date(p.expected_date) < today;
  // Açılışta teslim bekleyenler gösterilir (yoksa tümü); "Tüm siparişler"de de bekleyenler en üstte.
  // Açılışta onay/teslim bekleyenler (teslim bekleyen yoksa taslaklar) gösterilir.
  const pf = APP.poFilter || (cnt('ordered') || !cnt('draft') ? 'ordered' : 'draft');
  const rank = (p) => p.status==='ordered' ? (isLate(p) ? 0 : 1) : p.status==='draft' ? 2 : 3;
  const shown = (pf==='all' ? rows.filter(p => p.status !== 'cancelled') : pf==='late' ? rows.filter(isLate) : rows.filter(p => p.status===pf)).map((p, i) => [p, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
  el.innerHTML = `
  ${lowStockBannerHtml()}
  <div class="fsheet-bar" style="margin:0 0 14px;"><p class="muted" style="margin:0;font-size:13px;text-align:left;">Hammadde ihtiyacınızı tedarikçiye sipariş olarak iletin.</p><button type="button" class="fsheet-open" ${act('openNewPoSheet')}>📝 Sipariş Taslağı Oluştur</button></div>
  ${sheetHtml('poSheet', '📝', 'Yeni Sipariş Taslağı', `<p class="muted" style="text-align:left;margin:0 0 12px;font-size:13px;">İhtiyaç duyduğunuz hammaddeleri ve miktarları girip <b>Taslağı Oluştur</b>'a basın. Taslak, kartındaki <b>🚚 Sipariş Ver</b> ile tedarikçiye iletilir; teslim alma, tedarikçi seçimi ve birim fiyat <b>Mal Kabul</b> menüsünden yapılır.</p>
      <div class="fsheet-grid">
        <div class="field-group"><label>Beklenen Tarih</label><input id="po_expected" type="date" ${actOn('change','refreshPoSuggest',[])}></div>
        <div class="field-group wide"><label>Not</label><input id="po_notes" placeholder="opsiyonel"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px;"><b style="font-size:14px;">📦 Hammaddeler</b><button type="button" class="u-wa-m0 ghost-btn" ${act('addPoDraftItemRow')}>+ Hammadde Ekle</button></div>
      <div id="poItemsWrap">${renderPoDraftItemsHtml()}</div>
      <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','poSheet')}>Vazgeç</button><button ${act('createPurchaseOrder')}>📝 Taslağı Oluştur</button></div>`, 'var(--accent)')}
  ${statChipsClick([['ordered','🚚', cnt('ordered'), 'Teslim bekliyor', '#f59e0b'], ['draft','📝', cnt('draft'), 'Taslak', '#a78bfa'],
      ['late','⏰', rows.filter(isLate).length, 'Gecikmiş', 'var(--danger,#ef4444)'], ['received','✅', cnt('received'), 'Teslim alındı', 'var(--ok,#22c55e)'],
      ['cancelled','✕', cnt('cancelled'), 'İptal edilen', '#94a3b8'], ['all','📋', rows.length - cnt('cancelled'), 'Tüm siparişler', 'var(--c1)']], pf, 'setPoFilter')}
  <div class="fs-panel pa-sec" style="--t:#f59e0b;">
    <h3><i>📋</i>Verilen Siparişler${cnt('draft') ? ` <span class="pa-legend"><span><b style="background:#a78bfa;"></b>Taslak ${cnt('draft')}</span></span>` : ''}</h3>
    ${shown.length ? `<div class="po-grid">${shown.map((p, i) => { const items = p.items || [], ord = Number(p.ordered_total)||items.reduce((x, it) => x + (Number(it.quantity)||0), 0), rec = Number(p.received_total)||items.reduce((x, it) => x + Math.min(Number(it.received)||0, Number(it.quantity)||0), 0);
      const pct = p.status==='received' ? 100 : ord ? Math.round(rec/ord*100) : 0;
      return `<div class="po-card po-click" ${act('openPoDetail', p.id)} title="Detay için tıklayın" style="--st:${isLate(p) ? 'var(--danger,#ef4444)' : PO_TONE[p.status]||'var(--muted)'};--i:${Math.min(i,12)};">
        <div class="po-top">${avatarHtml(p.supplier_name||'?')}<div class="cu-id"><b>${escapeHtml(p.supplier_name||'Tedarikçi bekleniyor')}</b><small>${p.created_by_name ? 'Oluşturan: '+escapeHtml(p.created_by_name) : ''}</small></div>${poStatusBadge(p)}</div>
        <div class="po-dates"><span class="pchip">📅 ${fmtDateTr(p.order_date)}</span>${p.expected_date ? `<span class="pchip ${isLate(p)?'warn':''}">${isLate(p) ? '⏰ gecikti · ' : '🎯 '}${fmtDateTr(p.expected_date)}</span>` : ''}<span class="pchip">📦 ${items.length} kalem</span></div>
        ${p.status!=='draft' && p.status!=='cancelled' ? `<div class="po-prog"><div class="pcard-mbar"><i style="width:${pct}%;background:var(--st);"></i></div><small>%${pct} teslim alındı</small></div>` : ''}
        ${items.length ? `<div class="po-items">${items.slice(0, 6).map(it => { const q = Number(it.quantity)||0, r = Number(it.received)||0, done = r >= q && q > 0;
          return `<div class="po-it ${done?'done':r>0?'part':''}"><span>${done?'✓':r>0?'◐':'○'} ${escapeHtml(it.name)}</span><b>${p.status==='draft' ? fmtQty(q) : fmtQty(r)+' / '+fmtQty(q)} ${escapeHtml(it.unit||'')}</b></div>`; }).join('')}${items.length > 6 ? `<div class="u-fs12 muted">+${items.length-6} kalem daha</div>` : ''}</div>` : ''}
        ${p.notes ? `<div class="rv-note">📝 ${escapeHtml(p.notes)}</div>` : ''}
        <div class="po-more">Detay için tıklayın ›</div>
        ${ownDraft(p) ? `<div class="pcard-acts"><button type="button" class="pc-btn pc-edit" style="margin-left:0;" ${act('markPOOrdered', p.id)}>🚚 Sipariş Ver</button><button type="button" class="pc-btn rv-del" style="margin-left:auto;" ${act('removePO', p.id)}>🗑 Sil</button></div>` : ''}
      </div>`; }).join('')}</div>`
      : '<div class="empty-state"><div style="font-size:42px;">📋</div><p class="muted">Bu filtrede sipariş yok.</p></div>'}
  </div>`;
}
/* Sipariş detayı: tüm kalemler, not, tarih; yetkiliyse iptal (teslim alınmışsa stok ve maliyet geri alınır). */
function openPoDetail(id){
  const p = (APP.poRows || []).find(x => x.id === id); if(!p) return;
  const s = getSession(), items = p.items || [], canCancel = p.status !== 'cancelled' && (hasPurchPerm(s, 'manage') || (p.status === 'draft' && p.created_by === s.user_id));
  const rec = items.some(i => Number(i.received) > 0);
  const bg = document.createElement('div'); bg.className = 'dg-bg'; bg.style.zIndex = 3000;
  bg.innerHTML = `<div class="dg-card uc-card" style="max-width:520px;text-align:left;">
    <div class="u-row-sb"><b style="font-size:17px;">🛒 ${escapeHtml(p.supplier_name || 'Tedarikçi bekleniyor')}</b>${poStatusBadge(p)}</div>
    <p class="muted u-fs12" style="margin:4px 0 10px;">📅 ${fmtDateTr(p.order_date)}${p.expected_date ? ' · 🎯 ' + fmtDateTr(p.expected_date) : ''}${p.created_by_name ? ' · 👤 ' + escapeHtml(p.created_by_name) : ''} · 📦 ${items.length} kalem</p>
    <div class="po-items" style="max-height:52vh;overflow:auto;">${items.map(it => { const q = Number(it.quantity)||0, r = Number(it.received)||0, done = r >= q && q > 0;
      return `<div class="po-it ${done?'done':r>0?'part':''}"><span>${done?'✓':r>0?'◐':'○'} ${escapeHtml(it.name)}</span><b>${p.status==='draft' ? fmtQty(q) : fmtQty(r)+' / '+fmtQty(q)} ${escapeHtml(it.unit||'')}</b></div>`; }).join('')}</div>
    ${p.notes ? `<div class="rv-note" style="margin-top:8px;">📝 ${escapeHtml(p.notes)}</div>` : ''}
    <div class="uc-acts">${canCancel ? '<button type="button" class="pc-btn pd-cx" style="color:var(--red);margin-right:auto;">✕ Siparişi iptal et</button>' : ''}<button type="button" class="uc-yes pd-close">Kapat</button></div></div>`;
  bg.addEventListener('click', e => { if(e.target === bg) bg.remove(); });
  bg.querySelector('.pd-close').addEventListener('click', () => bg.remove());
  const cx = bg.querySelector('.pd-cx');
  if(cx) cx.addEventListener('click', async () => {
    if(!(await uiConfirm(rec ? 'Teslim alınan miktarlar stoktan düşülür ve bu alışın ortalama maliyete etkisi geri alınır.' : 'Bu malzeme siparişi iptal edilsin mi?', { title: 'Siparişi iptal et', icon: '✕', okText: 'İptal et', cancelText: 'Vazgeç', danger: rec }))) return;
    const { error } = await sb.rpc('set_purchase_order_status', { p_token: s.session_token, p_id: id, p_status: 'cancelled' });
    if(error){ alert(error.message); return; }
    bg.remove(); showToast(rec ? 'Sipariş iptal edildi · stok ve maliyet geri alındı' : 'Sipariş iptal edildi');
    renderPurchaseOrdersContent(s);
  });
  document.body.appendChild(bg);
}
/* Kritik stok: minimum seviyenin altındaki hammaddeler için uyarı ve tek tıkla sipariş taslağı. */
function lowStockList(){
  return ((APP.config && APP.config.ingredients) || []).filter(i => Number(i.min_stock) > 0 && Number(i.stock) <= Number(i.min_stock));
}
function lowStockBannerHtml(){
  const low = lowStockList(); if(!low.length) return '';
  return `<div class="ls-banner">
    <div class="ls-head"><span class="ls-ic">📉</span><div><b>${low.length} hammadde kritik seviyede</b><small>Minimum stok seviyesinin altına inenler</small></div>
      <button type="button" class="ls-btn" ${act('draftLowStockOrder')}>🛒 Sipariş taslağı hazırla</button></div>
    <div class="ls-chips">${low.map(i => `<span class="pchip ${Number(i.stock) <= 0 ? 'warn' : ''}">${escapeHtml(i.name)} · <b>${fmtQty(Number(i.stock)||0)}</b> / ${fmtQty(Number(i.min_stock))} ${escapeHtml(i.unit||'')}</span>`).join('')}</div>
  </div>`;
}
// Yeni Sipariş her zaman boş başlar (önceki taslak / kritik stok önerisi taşınmaz).
function openNewPoSheet(){
  APP.poDraftItems = [];
  const w = document.getElementById('poItemsWrap'); if(w) w.innerHTML = renderPoDraftItemsHtml();
  ['po_expected', 'po_notes'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; });
  openSheet('poSheet');
}
async function draftLowStockOrder(){
  const low = lowStockList(); if(!low.length) return;
  await loadIngUsage();
  APP.poDraftItems = []; // taslak her seferinde kritik stoktan yeniden hazırlanır
  const have = new Set();
  low.forEach(i => { if(!have.has(i.id)) APP.poDraftItems.push({ ingredient_id: i.id, quantity: String(poSuggest(i).qty), unit_cost: '' }); });
  document.getElementById('poItemsWrap').innerHTML = renderPoDraftItemsHtml();
  openSheet('poSheet');
}
function renderPoDraftItemsHtml(){
  const ingredients = (APP.config && APP.config.ingredients) || [];
  if(APP.poDraftItems.length===0) return '<p class="u-fs13 muted">Henüz hammadde eklenmedi.</p>';
  return APP.poDraftItems.map((it, idx) => { const ig = ingredients.find(x => x.id === it.ingredient_id), sg = ig ? poSuggest(ig) : null; return `
    <div class="po-line">
    <div style="display:grid;grid-template-columns:1fr 120px 32px;gap:8px;align-items:center;">
      <select ${actOn('change','setPoDraftField',[idx,'ingredient_id','$value'])}>
        ${ingredients.map(ig => `<option value="${ig.id}" ${it.ingredient_id===ig.id?'selected':''}>${escapeHtml(ig.name)} (${escapeHtml(ig.unit)})</option>`).join('')}
      </select>
      <input type="number" min="0" step="0.01" placeholder="Miktar" value="${it.quantity||''}" ${actOn('input','setPoDraftField',[idx,'quantity','$value'])}>
      <button type="button" class="qty-btn" ${act('removePoDraftItemRow', idx)}>✕</button>
    </div>
    ${sg ? `<div class="po-sg"><span>💡 Öneri <b>${fmtQty(sg.qty)} ${escapeHtml(ig.unit || '')}</b> <small class="muted">· ${sg.why}</small></span>${String(sg.qty) !== String(it.quantity) && sg.qty > 0 ? `<button type="button" class="pc-btn" ${act('applyPoSuggest', idx)}>Uygula</button>` : ''}</div>` : ''}
    </div>`; }).join('');
}
async function addPoDraftItemRow(){
  await loadIngUsage();
  const ingredients = (APP.config && APP.config.ingredients) || [];
  if(ingredients.length===0){ alert('Önce Ayarlar > Hammaddeler kısmından hammadde ekleyin'); return; }
  APP.poDraftItems.push({ ingredient_id: ingredients[0].id, quantity:'', unit_cost:'' });
  document.getElementById('poItemsWrap').innerHTML = renderPoDraftItemsHtml();
}
function removePoDraftItemRow(idx){
  APP.poDraftItems.splice(idx,1);
  document.getElementById('poItemsWrap').innerHTML = renderPoDraftItemsHtml();
}
async function createPurchaseOrder(){
  const session = getSession();
  const supplierId = null; // tedarikçiyi Satınalma sorumlusu seçer
  const expected = document.getElementById('po_expected').value || null;
  const notes = document.getElementById('po_notes').value.trim() || null;
  const items = (APP.poDraftItems||[]).filter(it => it.ingredient_id && parseFloat(it.quantity) > 0)
    .map(it => ({ ingredient_id: it.ingredient_id, quantity: parseFloat(it.quantity), unit_cost: 0 }));
  if(items.length===0){ alert('En az bir hammadde ekleyin'); return; }
  const { error } = await sb.rpc('upsert_purchase_order', { p_token: session.session_token, p_id: null, p_supplier_id: supplierId, p_expected_date: expected, p_notes: notes, p_items: items });
  if(error){ alert(error.message); return; }
  APP.poDraftItems = [];
  closeSheet('poSheet');
  renderPurchaseOrdersContent(session);
  showToast('📝 Sipariş taslağı oluşturuldu — kartından Sipariş Ver ile iletebilirsiniz');
}
async function markPOOrdered(id){
  const session = getSession();
  const { data, error } = await sb.rpc('set_purchase_order_status', { p_token: session.session_token, p_id: id, p_status: 'ordered' });
  if(error){ alert(error.message); return; }
  renderPurchaseOrdersContent(session);
  showToast(data && data.email_sent ? 'Sipariş verildi, tedarikçiye e-posta gönderildi ✓' : 'Sipariş verildi (tedarikçiye e-posta gönderilmedi — e-posta adresi kayıtlı değil ya da e-posta sistemi henüz ayarlanmadı)');
}
async function removePO(id){
  if(!await uiConfirm('Bu siparişi silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_purchase_order', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  renderPurchaseOrdersContent(session);
}
async function openReceivePOModal(id){
  const session = getSession();
  const { data, error } = await sb.rpc('get_purchase_order', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  const items = data.items || [];
  const bg = document.createElement('div');
  bg.id = 'receivePOModalBg';
  bg.dataset.poId = id;
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:420px;width:100%;max-height:88vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;"><h2 class="u-m0">Teslim Al</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','receivePOModalBg')}>✕</span></div>
    <div id="receivePOItemsWrap" style="margin-top:10px;">
    ${items.map(it => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;font-size:13px;"><span>${escapeHtml(it.ingredient_name)}</span><span class="muted">${it.received_quantity}/${it.quantity} ${escapeHtml(it.ingredient_unit)}</span></div>
        <input type="number" min="0" step="0.01" max="${it.quantity - it.received_quantity}" placeholder="Teslim alınan miktar" data-item-id="${it.id}" class="recv-qty-input" style="margin-top:4px;">
      </div>`).join('')}
    </div>
    <button class="u-mt12" ${act('confirmReceivePO')}>Teslim Alındı Olarak Kaydet</button>
  </div>`;
  document.body.appendChild(bg);
}
async function confirmReceivePO(){
  const bg = document.getElementById('receivePOModalBg');
  const poId = bg.dataset.poId;
  const receipts = Array.from(bg.querySelectorAll('.recv-qty-input'))
    .map(inp => ({ item_id: inp.dataset.itemId, quantity: parseFloat(inp.value)||0 }))
    .filter(r => r.quantity > 0);
  if(receipts.length===0){ alert('En az bir kalem için miktar girin'); return; }
  const session = getSession();
  const { error } = await sb.rpc('receive_purchase_order_items', { p_token: session.session_token, p_id: poId, p_receipts: receipts });
  if(error){ alert(error.message); return; }
  bg.remove();
  if(APP.view==='procurement') renderPurchaseReportContent(session); else renderPurchaseOrdersContent(session);
  if(typeof refreshNavBadges === 'function') refreshNavBadges();
  showToast('Teslim alındı, stok güncellendi ✓');
}

function setPoDraftField(idx, field, v){
  if(!APP.poDraftItems[idx]) return; APP.poDraftItems[idx][field] = v;
  // Hammadde değişince satır yeniden çizilir (öneri yeni hammaddeye göre); miktar boşsa öneri yazılır.
  if(field === 'ingredient_id'){ const ig = ((APP.config && APP.config.ingredients) || []).find(x => x.id === v); if(ig && !parseFloat(APP.poDraftItems[idx].quantity)) APP.poDraftItems[idx].quantity = String(poSuggest(ig).qty || ''); const w = document.getElementById('poItemsWrap'); if(w) w.innerHTML = renderPoDraftItemsHtml(); }
}
/* Sipariş önerisi: (günlük ortalama tüketim × sonraki teslimata kadar gün + güvenlik payı) − mevcut stok.
   Günlük tüketim son 14 günde satılan ürünlerin reçetesinden (fire dahil); gün = Beklenen Tarih'e kadar (+1 gün tampon), yoksa 7;
   güvenlik payı = min stok. Tüketim verisi yoksa eski kural: min stoğun iki katına tamamla. */
async function loadIngUsage(){
  if(APP.ingUsageD && Date.now() - APP.ingUsageD.at < 10 * 60000) return;
  try{ const { data } = await sb.rpc('get_ingredient_daily_usage', { p_token: getSession().session_token, p_days: 14 }); if(data) APP.ingUsageD = Object.assign({ at: Date.now() }, data); }catch(e){}
}
function poCoverDays(){
  const v = (document.getElementById('po_expected') || {}).value;
  if(v){ const d = Math.ceil((new Date(v + 'T12:00:00') - Date.now()) / 86400000); if(d >= 0) return Math.max(1, d + 1); }
  return 7;
}
function poSuggest(ig){
  const u = APP.ingUsageD || {}, span = Number(u.span) || 14, used = Number((u.usage || {})[ig.id]) || 0, perDay = used / span;
  const stock = Math.max(0, Number(ig.stock) || 0), min = Number(ig.min_stock) || 0, days = poCoverDays(), un = ig.unit || '';
  const r2 = (x) => Math.max(0, Math.round(x * 100) / 100);
  if(perDay > 0){
    const need = perDay * days + min - stock;
    return { qty: r2(Math.ceil(need * 10) / 10), why: `günde ~${fmtQty(r2(perDay))} ${un} × ${days} gün${min ? ' + ' + fmtQty(min) + ' ' + un + ' güvenlik' : ''} − ${fmtQty(stock)} ${un} elde${need <= 0 ? ' → stok yeterli' : ''}` };
  }
  if(min > 0) return { qty: r2(min * 2 - stock), why: `son 14 günde tüketim yok · min stoğun iki katına (${fmtQty(min * 2)} ${un}) tamamlama` };
  return { qty: 0, why: 'tüketim verisi ve min stok yok — miktarı siz girin' };
}
function applyPoSuggest(idx){
  const it = APP.poDraftItems[idx]; if(!it) return;
  const ig = ((APP.config && APP.config.ingredients) || []).find(x => x.id === it.ingredient_id); if(!ig) return;
  it.quantity = String(poSuggest(ig).qty);
  document.getElementById('poItemsWrap').innerHTML = renderPoDraftItemsHtml();
}
function refreshPoSuggest(){ const w = document.getElementById('poItemsWrap'); if(w && (APP.poDraftItems || []).length) w.innerHTML = renderPoDraftItemsHtml(); }

function setPoFilter(k){ APP.poFilter = k; renderPurchaseOrdersContent(getSession()); }
