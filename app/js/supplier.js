/* Tedarikçi & Satın Alma - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= TEDARİKÇİ & SATIN ALMA ================= */
async function renderPurchasingView(main, session){
  // Sekmeler izne göre: siparişler (verme/yönetim), tedarikçiler (yönetim).
  const canOrders = hasPurchPerm(session, 'orders') || hasPurchPerm(session, 'manage');
  const canSuppliers = hasPurchPerm(session, 'suppliers');
  if(!canOrders) APP.purchTab = 'suppliers';
  else if(!canSuppliers) APP.purchTab = 'orders';
  main.innerHTML = `<h1>Tedarikçi & Satın Alma</h1>
    <div class="tabs" id="purchTabs">
      ${canOrders ? `<div class="tab ${(APP.purchTab||'orders')==='orders'?'active':''}" data-tab="orders" onclick="setPurchTab('orders')">Satın Alma Siparişleri</div>` : ''}
      ${canSuppliers ? `<div class="tab ${APP.purchTab==='suppliers'?'active':''}" data-tab="suppliers" onclick="setPurchTab('suppliers')">Tedarikçiler</div>` : ''}
    </div>
    <div id="purchContent"></div>`;
  applyNavBadges();
  await renderPurchTabContent(session);
}
function setPurchTab(tab){
  APP.purchTab = tab;
  document.querySelectorAll('#purchTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  renderPurchTabContent(getSession());
}
function renderPurchTabContent(session){
  return (APP.purchTab||'orders')==='suppliers' ? renderSuppliersContent(session) : renderPurchaseOrdersContent(session);
}
async function renderSuppliersContent(session){
  const el = document.getElementById('purchContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('list_suppliers', { p_token: session.session_token }));
  const rows = error ? [] : (data||[]);
  APP.supplierRows = rows;
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Tedarikçiler</h2>
    <div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Ad</th><th>Telefon</th><th>E-posta</th><th>Adres</th><th></th></tr></thead>
      <tbody>
      ${rows.map(s => `
        <tr>
          <td class="col-name">${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.phone||'-')}</td>
          <td>${escapeHtml(s.email||'-')}</td>
          <td>${escapeHtml(s.address||'-')}</td>
          <td>
            <button class="sbtn" onclick="editSupplier('${s.id}')">Düzenle</button>
            <button type="button" class="act-btn act-delete" onclick="removeSupplier('${s.id}')">${ICON_TRASH}<span>Sil</span></button>
          </td>
        </tr>`).join('')}
      ${rows.length===0?'<tr><td colspan="5" class="muted" style="text-align:center;">Tedarikçi yok.</td></tr>':''}
      </tbody>
    </table>
    </div>
    <div class="add-row-panel">
      <p id="supFormTitle">Yeni Tedarikçi Ekle</p>
      <input type="hidden" id="sup_edit_id">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        <div class="field-group"><label>Ad</label><input id="sup_name" placeholder="örn. ABC Gıda Toptan"></div>
        <div class="field-group"><label>Telefon</label><input id="sup_phone" placeholder="opsiyonel"></div>
        <div class="field-group"><label>E-posta</label><input id="sup_email" placeholder="opsiyonel"></div>
      </div>
      <div class="field-group" style="margin-top:10px;"><label>Adres</label><input id="sup_address" placeholder="opsiyonel"></div>
      <button style="margin-top:12px;max-width:220px;" onclick="saveSupplier()">${ICON_SAVE}<span>Kaydet</span></button>
    </div>
  </div>`;
}
function editSupplier(id){
  const s = (APP.supplierRows||[]).find(x => x.id===id); if(!s) return;
  document.getElementById('sup_edit_id').value = s.id;
  document.getElementById('sup_name').value = s.name;
  document.getElementById('sup_phone').value = s.phone||'';
  document.getElementById('sup_email').value = s.email||'';
  document.getElementById('sup_address').value = s.address||'';
  document.getElementById('supFormTitle').textContent = 'Tedarikçiyi Düzenle';
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
  renderSuppliersContent(session);
  showToast('Kaydedildi ✓');
}
async function removeSupplier(id){
  if(!confirm('Bu tedarikçiyi silmek istediğinize emin misiniz?')) return;
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
  const suppliers = supRes.data || [];
  const canManage = hasPurchPerm(session, 'manage');
  const ownDraft = (p) => p.status==='draft' && (canManage || p.created_by===session.user_id);
  if(!APP.poDraftItems) APP.poDraftItems = [];
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Satın Alma Siparişleri</h2>
    <div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Tedarikçi</th><th>Durum</th><th>Sipariş Tarihi</th><th>Beklenen</th><th>Tutar</th><th></th></tr></thead>
      <tbody>
      ${rows.map(p => `
        <tr data-badge-id="${p.id}">
          <td class="col-name">${escapeHtml(p.supplier_name||'-')}${p.created_by_name ? `<div class="muted" style="font-size:11.5px;">Oluşturan: ${escapeHtml(p.created_by_name)}</div>` : ''}</td>
          <td>${poStatusBadge(p)}${poItemsProgressHtml(p)}</td>
          <td>${p.order_date}</td>
          <td>${p.expected_date||'-'}</td>
          <td>${money(p.total_amount)}</td>
          <td>
            ${canManage && p.status!=='received' && p.status!=='cancelled' ? `<button class="sbtn" onclick="openReceivePOModal('${p.id}')">Teslim Al</button>` : ''}
            ${ownDraft(p) ? `<button class="sbtn" onclick="markPOOrdered('${p.id}')">Sipariş Ver</button><button type="button" class="act-btn act-delete" onclick="removePO('${p.id}')">${ICON_TRASH}<span>Sil</span></button>` : ''}
          </td>
        </tr>`).join('')}
      ${rows.length===0?'<tr><td colspan="6" class="muted" style="text-align:center;">Sipariş yok.</td></tr>':''}
      </tbody>
    </table>
    </div>
    <div class="add-row-panel">
      <p>Yeni Satın Alma Siparişi</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="field-group"><label>Tedarikçi</label><select id="po_supplier"><option value="">-</option>${suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select></div>
        <div class="field-group"><label>Beklenen Tarih</label><input id="po_expected" type="date"></div>
      </div>
      <div id="poItemsWrap" style="margin-top:10px;">${renderPoDraftItemsHtml()}</div>
      <button type="button" class="ghost-btn" style="max-width:200px;margin-top:6px;" onclick="addPoDraftItemRow()">+ Hammadde Ekle</button>
      <div class="field-group" style="margin-top:10px;"><label>Not</label><input id="po_notes" placeholder="opsiyonel"></div>
      <button style="margin-top:12px;max-width:220px;" onclick="createPurchaseOrder()">Sipariş Oluştur</button>
    </div>
  </div>`;
}
function renderPoDraftItemsHtml(){
  const ingredients = (APP.config && APP.config.ingredients) || [];
  if(APP.poDraftItems.length===0) return '<p class="muted" style="font-size:13px;">Henüz hammadde eklenmedi.</p>';
  return APP.poDraftItems.map((it, idx) => `
    <div style="display:grid;grid-template-columns:1fr 100px 100px 32px;gap:8px;align-items:center;margin-bottom:6px;">
      <select onchange="APP.poDraftItems[${idx}].ingredient_id=this.value">
        ${ingredients.map(ig => `<option value="${ig.id}" ${it.ingredient_id===ig.id?'selected':''}>${escapeHtml(ig.name)} (${escapeHtml(ig.unit)})</option>`).join('')}
      </select>
      <input type="number" min="0" step="0.01" placeholder="Miktar" value="${it.quantity||''}" oninput="APP.poDraftItems[${idx}].quantity=this.value">
      <input type="number" min="0" step="0.01" placeholder="Birim Fiyat" value="${it.unit_cost||''}" oninput="APP.poDraftItems[${idx}].unit_cost=this.value">
      <button type="button" class="qty-btn" onclick="removePoDraftItemRow(${idx})">✕</button>
    </div>`).join('');
}
function addPoDraftItemRow(){
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
  const supplierId = document.getElementById('po_supplier').value || null;
  const expected = document.getElementById('po_expected').value || null;
  const notes = document.getElementById('po_notes').value.trim() || null;
  const items = (APP.poDraftItems||[]).filter(it => it.ingredient_id && parseFloat(it.quantity) > 0)
    .map(it => ({ ingredient_id: it.ingredient_id, quantity: parseFloat(it.quantity), unit_cost: parseFloat(it.unit_cost)||0 }));
  if(items.length===0){ alert('En az bir hammadde ekleyin'); return; }
  const { error } = await sb.rpc('upsert_purchase_order', { p_token: session.session_token, p_id: null, p_supplier_id: supplierId, p_expected_date: expected, p_notes: notes, p_items: items });
  if(error){ alert(error.message); return; }
  APP.poDraftItems = [];
  renderPurchaseOrdersContent(session);
  showToast('Sipariş oluşturuldu ✓');
}
async function markPOOrdered(id){
  const session = getSession();
  const { data, error } = await sb.rpc('set_purchase_order_status', { p_token: session.session_token, p_id: id, p_status: 'ordered' });
  if(error){ alert(error.message); return; }
  renderPurchaseOrdersContent(session);
  showToast(data && data.email_sent ? 'Sipariş verildi, tedarikçiye e-posta gönderildi ✓' : 'Sipariş verildi (tedarikçiye e-posta gönderilmedi — e-posta adresi kayıtlı değil ya da e-posta sistemi henüz ayarlanmadı)');
}
async function removePO(id){
  if(!confirm('Bu siparişi silmek istediğinize emin misiniz?')) return;
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
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">Teslim Al</h2><span style="cursor:pointer;color:var(--muted);" onclick="document.getElementById('receivePOModalBg').remove()">✕</span></div>
    <div id="receivePOItemsWrap" style="margin-top:10px;">
    ${items.map(it => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;font-size:13px;"><span>${escapeHtml(it.ingredient_name)}</span><span class="muted">${it.received_quantity}/${it.quantity} ${escapeHtml(it.ingredient_unit)}</span></div>
        <input type="number" min="0" step="0.01" max="${it.quantity - it.received_quantity}" placeholder="Teslim alınan miktar" data-item-id="${it.id}" class="recv-qty-input" style="margin-top:4px;">
      </div>`).join('')}
    </div>
    <button style="margin-top:12px;" onclick="confirmReceivePO()">Teslim Alındı Olarak Kaydet</button>
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
  renderPurchaseOrdersContent(session);
  showToast('Teslim alındı, stok güncellendi ✓');
}
