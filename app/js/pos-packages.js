/* POS - Paket servis. Eski pos-core.js'ten bölündü; klasik <script src>, globaller
   paylaşılır ve dosyalar index.html'deki sırayla yüklenir (sıra önemli). */
/* ================= PAKET SERVİS ================= */
/* Masa siparişleriyle aynı sepet/ürün-seçim/mutfağa-gönderme altyapısını
   kullanır - tek fark "tableId" yerine 'pkg_new' (yeni sipariş) veya
   'pkg_<order_id>' (mevcut açık paket sipariş) sözde kimliği kullanılması.
   liveOrderForTable, renderProductPick, renderTableItems, addToDraft,
   changeDraftQty, cancelTableOrder, clearDraftCart bu kimliklerle zaten
   generic çalışıyor - bkz. liveOrderForTable. */
async function renderPackagesView(main, session){
  main.innerHTML = `<h1>📦 Paket Servis</h1><div class="muted" id="pkgStatus"></div><div class="table-grid" id="packageGrid"></div>`;
  const [cfgRes, liveRes] = await withLoadingOverlay(Promise.all([
    APP.config ? Promise.resolve({data:APP.config}) : sb.rpc('get_restaurant_config', { p_token: session.session_token }),
    sb.rpc('get_live_orders', { p_token: session.session_token })
  ]));
  const statusEl = document.getElementById('pkgStatus');
  if(cfgRes.error || liveRes.error){
    statusEl.textContent = 'Veri yüklenemedi: ' + ((cfgRes.error||liveRes.error).message);
    statusEl.style.color = 'var(--red)';
    return;
  }
  if(!APP.config) APP.config = cfgRes.data;
  APP.liveOrders = liveRes.data || [];
  statusEl.textContent = '';
  renderPackageGrid();
  startOrderPolling(session);
}
function renderPackageGrid(){
  const el = document.getElementById('packageGrid'); if(!el) return;
  const pkgOrders = (APP.liveOrders||[]).filter(o => o.kind==='takeaway');
  const cards = pkgOrders.map(o => {
    const total = o.items.reduce((s,i) => s+i.price*i.qty, 0);
    const allReady = o.items.length>0 && o.items.every(i => i.status==='ready');
    const label = o.customer_name || ('Paket #'+(o.daily_number||''));
    return `<div class="table-cell" style="cursor:pointer;background:rgba(244,63,94,.14);border-color:var(--red);color:var(--red);overflow-wrap:anywhere;word-break:break-word;" onclick="openPackageModal('pkg_${o.order_id}')">
      📦 ${escapeHtml(label)}<div style="font-size:11px;margin-top:4px;font-weight:400;">${o.items.length} ürün - ${allReady?'Hazır':'hazırlanıyor'} · ${money(total)}</div></div>`;
  });
  cards.push(`<div class="table-cell" style="cursor:pointer;" onclick="openPackageModal('pkg_new')">➕<div style="font-size:11px;margin-top:4px;font-weight:400;">Yeni Paket Sipariş</div></div>`);
  el.innerHTML = cards.join('');
}
function openPackageModal(pseudoId){
  if(!APP.draftCart) APP.draftCart = {};
  if(!APP.draftCart[pseudoId]) APP.draftCart[pseudoId] = [];
  const existing = pseudoId==='pkg_new' ? null : liveOrderForTable(pseudoId);
  const isWl = pseudoId.indexOf('wl_')===0;
  const wlEntry = isWl ? (APP.waitlistCache||[]).find(w => w.id===pseudoId.slice(3)) : null;
  const title = isWl ? '⏳ ' + escapeHtml((wlEntry && wlEntry.customer_name) || (existing && existing.customer_name) || 'Bekleme Listesi') + ' <span class="muted" style="font-size:13px;font-weight:600;">bekleme listesi</span>'
    : '📦 ' + (existing ? escapeHtml(existing.customer_name || ('Paket #'+(existing.daily_number||''))) : 'Yeni Paket Sipariş');
  const bg = document.createElement('div');
  bg.id = 'tableModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:28px 16px 16px;overflow-y:auto;';
  bg.onclick = (e) => { if(e.target===bg) closeTableModal(); };
  bg.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:480px;width:100%;max-height:88vh;overflow:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;overflow-wrap:anywhere;word-break:break-word;">${title}</h2>
        <span style="cursor:pointer;color:var(--muted);font-size:20px;" onclick="closeTableModal()">✕</span>
      </div>
      ${isWl ? '<p class="muted" style="text-align:left;margin:0 0 6px;font-size:12.5px;">Siparişler hemen mutfağa düşer; müşteri oturtulunca masaya taşınır.</p>' : `<div class="field-group"><label>Müşteri Adı</label><input id="pkgCustName" placeholder="örn. Ahmet Bey veya kayıtlı müşteri ara" autocomplete="off" oninput="tableCustSearch(this.value, 'pkgCust')" value="${escapeAttr((existing&&existing.customer_name)||'')}"></div>
      <div class="field-group"><label>Telefon</label><input id="pkgCustPhone" placeholder="örn. 5551234567" autocomplete="off" inputmode="tel" oninput="tableCustSearch(this.value, 'pkgCust')" value="${escapeAttr((existing&&existing.customer_phone)||'')}"></div>
      <div id="pkgCustSuggest" style="margin:-6px 0 10px;"></div>
      <div class="field-group"><label>Not</label><input id="pkgNote" placeholder="örn. Yan sokak, 2. kat" value="${escapeAttr((existing&&existing.note)||'')}"></div>`}
      <div style="margin-top:10px;">
        <p style="font-weight:700;margin-bottom:8px;">Ürün Ekle</p>
        <div class="tabs" id="prodStationTabs"></div>
        <div id="prodPick" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;"></div>
      </div>
      <div id="sentItemsWrap" style="margin-top:14px;"></div>
      <div id="draftItemsWrap"></div>
      ${orderFlagsHtml(pseudoId)}
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="ghost-btn" style="flex:1;margin-top:0;color:var(--red);border-color:var(--red);" onclick="cancelTableOrder('${pseudoId}')" ${existing?'':'disabled'}>🗑️ İptal Et</button>
        <button id="confirmBtn" style="flex:1;margin-top:0;" disabled onclick="confirmOrder('${pseudoId}')">✅ Onayla ve Gönder</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  bg.dataset.tableId = pseudoId;
  const stations = APP.config.stations;
  document.getElementById('prodStationTabs').innerHTML = stations.map((s,i) =>
    `<div class="tab ${i===0?'active':''}" data-st="${s.id}" onclick="pickStationTab('${s.id}')">${escapeHtml(s.name)}</div>`
  ).join('');
  renderProductPick(stations[0] ? stations[0].id : null, pseudoId);
  renderTableItems(pseudoId);
}

function pickStationTab(stId){
  document.querySelectorAll('#prodStationTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.st===stId));
  const tableId = document.getElementById('tableModalBg').dataset.tableId;
  renderProductPick(stId, tableId);
}
function effectiveStock(p){
  if(p.recipe && p.recipe.length>0) return p.available_qty;
  return p.stock;
}
function renderProductPick(stationId, tableId){
  const el = document.getElementById('prodPick'); if(!el) return;
  const prods = APP.config.products.filter(p => p.station_id===stationId);
  el.innerHTML = prods.length ? prods.map(p => {
    const stock = effectiveStock(p);
    const off = p.available===false || (stock!=null && stock<=0);
    let badge = '';
    if(p.available===false) badge = '<div style="margin-top:4px;font-size:11px;color:var(--red);">Satışta Değil</div>';
    else if(stock!=null && stock<=0) badge = '<div style="margin-top:4px;font-size:11px;color:var(--red);">Stok Yok</div>';
    else if(stock!=null && stock<=10) badge = '<div style="margin-top:4px;font-size:11px;color:var(--accent);">Son '+stock+' porsiyon</div>';
    return `
    <div class="prod-pick-card" style="background:var(--panel2);border:1px solid var(--border);border-radius:10px;padding:12px 10px;font-size:13.5px;${off?'opacity:.4;cursor:not-allowed;':'cursor:pointer;'}" ${off?'':`onclick="addToDraft('${tableId}','${p.id}')"`}>
      <div style="font-weight:700;">${escapeHtml(p.name)}</div><div class="muted" style="font-size:12px;">${money(p.price)}</div>${badge}
    </div>`;
  }).join('') : '<p class="muted">Bu istasyonda ürün yok.</p>';
}
async function refreshConfigKeepDraft(session){
  const { data } = await sb.rpc('get_restaurant_config', { p_token: session.session_token });
  if(data) APP.config = data;
}
/* Sunucudaki get_restaurant_config'in stok hesabını (floor(min(hammadde stok/oran))) client tarafında
   birebir tekrar üretir, böylece her tıklamada tam config'i yeniden çekmeye gerek kalmaz. */
function applyLocalStockDelta(productId, delta){
  const prod = APP.config.products.find(p => p.id===productId);
  if(!prod) return;
  if(prod.recipe && prod.recipe.length>0){
    const touchedIngredientIds = new Set();
    prod.recipe.forEach(r => {
      const ing = APP.config.ingredients.find(i => i.id===r.ingredient_id);
      if(ing){ ing.stock -= r.qty_per_unit*delta; touchedIngredientIds.add(ing.id); }
    });
    APP.config.products.forEach(p => {
      if(!p.recipe || !p.recipe.some(r => touchedIngredientIds.has(r.ingredient_id))) return;
      let minQty = null;
      p.recipe.forEach(r => {
        if(r.qty_per_unit<=0) return;
        const ing = APP.config.ingredients.find(i => i.id===r.ingredient_id);
        if(!ing) return;
        const q = Math.floor(ing.stock / r.qty_per_unit);
        if(minQty===null || q<minQty) minQty = q;
      });
      p.available_qty = minQty;
    });
  } else if(prod.stock!=null){
    prod.stock -= delta;
  }
}
let _configResyncTimer = null;
function scheduleConfigResync(tableId){
  clearTimeout(_configResyncTimer);
  _configResyncTimer = setTimeout(async () => {
    const session = getSession();
    if(!session) return;
    await refreshConfigKeepDraft(session);
    const bg = document.getElementById('tableModalBg');
    if(bg && bg.dataset.tableId===tableId){
      const activeTab = document.querySelector('#prodStationTabs .tab.active');
      if(activeTab) renderProductPick(activeTab.dataset.st, tableId);
    }
  }, 1500);
}
function addToDraft(tableId, productId){
  const prod = APP.config.products.find(p => p.id===productId);
  if(!prod) return;
  if(prod.available===false){ alert('Bu ürün şu anda satışta değil'); return; }
  const stock = effectiveStock(prod);
  if(stock!=null && stock<=0){ alert('Bu üründe stok kalmadı'); return; }
  const draft = APP.draftCart[tableId];
  const existing = draft.find(i => i.product_id===productId);
  if(existing){ existing.qty += 1; }
  else{ draft.push({ product_id:productId, name:prod.name, price:prod.price, cost:prod.cost, station_id:prod.station_id, qty:1, note:'' }); }
  applyLocalStockDelta(productId, 1);
  renderTableItems(tableId);
  const activeTab = document.querySelector('#prodStationTabs .tab.active');
  if(activeTab) renderProductPick(activeTab.dataset.st, tableId);
  // Sepete ekleme ekranda anında görünür; stok düşümü arka planda sunucuya gönderilir.
  const session = getSession();
  sb.rpc('adjust_stock', { p_token: session.session_token, p_product_id: productId, p_delta: -1 }).then(({error}) => {
    if(!error){ scheduleConfigResync(tableId); return; }
    alert('Ürün eklenemedi, sepetten çıkarıldı: '+error.message);
    const d = APP.draftCart[tableId];
    const it = d.find(i => i.product_id===productId);
    if(it){ it.qty -= 1; if(it.qty<=0) d.splice(d.indexOf(it),1); }
    applyLocalStockDelta(productId, -1);
    renderTableItems(tableId);
    const t = document.querySelector('#prodStationTabs .tab.active');
    if(t) renderProductPick(t.dataset.st, tableId);
  });
}
async function changeDraftQty(tableId, idx, delta){
  const draft = APP.draftCart[tableId];
  if(!draft[idx]) return;
  const item = draft[idx];
  const productId = item.product_id;
  item.qty += delta;
  if(item.qty<=0) draft.splice(idx,1);
  applyLocalStockDelta(productId, delta);
  renderTableItems(tableId);
  const activeTab = document.querySelector('#prodStationTabs .tab.active');
  if(activeTab) renderProductPick(activeTab.dataset.st, tableId);
  const session = getSession();
  const { error } = await sb.rpc('adjust_stock', { p_token: session.session_token, p_product_id: productId, p_delta: -delta });
  if(error){
    alert(error.message);
    const d = APP.draftCart[tableId];
    const existing = d.find(i => i.product_id===productId);
    if(existing){ existing.qty -= delta; if(existing.qty<=0) d.splice(d.indexOf(existing),1); }
    else if(delta<0){ d.push({ ...item, qty:-delta }); }
    applyLocalStockDelta(productId, -delta);
    renderTableItems(tableId);
    const t = document.querySelector('#prodStationTabs .tab.active');
    if(t) renderProductPick(t.dataset.st, tableId);
    return;
  }
  scheduleConfigResync(tableId);
}
function renderTableItems(tableId){
  const sentWrap = document.getElementById('sentItemsWrap');
  const draftWrap = document.getElementById('draftItemsWrap');
  const order = liveOrderForTable(tableId);
  const draft = APP.draftCart[tableId] || [];
  if(order && order.items.length>0){
    // Her ürün için sipariş edildiği ve hazır olduğu saat (ödeme saati Finansal Analiz'de).
    const hm = (t) => t ? new Date(t).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : '';
    const opened = order.created_at ? new Date(order.created_at).toLocaleString('tr-TR', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' }) : '';
    sentWrap.innerHTML = `<p style="font-weight:700;margin-bottom:2px;">Mutfağa Gönderilen</p>${opened ? `<p class="muted" style="margin:0 0 6px;font-size:12px;">🕒 Sipariş açıldı: ${opened}</p>` : ''}` + order.items.map(it => `
      <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span style="min-width:0;overflow-wrap:anywhere;">${escapeHtml(it.name)} x${it.qty} ${it.status==='ready'?'<span style="color:var(--green);">✓ Hazır</span>':'<span class="muted">Hazırlanıyor</span>'}</span>
        <span class="muted" style="white-space:nowrap;font-size:12px;">🕒 ${hm(it.added_at)}${it.ready_at ? ' · ✓ ' + hm(it.ready_at) : ''}</span>
      </div>`).join('');
  } else { sentWrap.innerHTML = ''; }
  // Sepet (draftCart) tamamen yerel/gönderilmemiş bir durum, başka bir
  // cihazdan değişmez - bu yüzden kullanıcı şu an bir not alanına
  // yazıyorsa (bkz. arka plan canlı durum yenilemesi, refreshOrderLiveStatus,
  // 5 saniyede bir bu fonksiyonu çağırıyor) sepeti yeniden çizip
  // imleci/odağı kaybetmeyelim - yazması bitince zaten bir sonraki
  // yenilemede veya bir sepet işlemiyle güncellenir.
  if(draftWrap.contains(document.activeElement) && document.activeElement.tagName==='INPUT'){
    const confirmBtn = document.getElementById('confirmBtn');
    if(confirmBtn) confirmBtn.disabled = draft.length===0;
    return;
  }
  if(draft.length===0){
    draftWrap.innerHTML = order && order.items.length>0 ? '' : '<p class="muted">Henüz ürün eklenmedi.</p>';
  } else {
    let total=0;
    draftWrap.innerHTML = `<div style="border:1px dashed var(--accent);border-radius:10px;padding:10px;margin:10px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <p style="font-weight:700;color:var(--accent);margin:0;">Sepet (Gönderilmedi)</p>
        <button style="width:auto;padding:4px 10px;margin:0;font-size:12px;background:transparent;border:1px solid var(--red);color:var(--red);box-shadow:none;" onclick="clearDraftCart('${tableId}')">Sepeti Boşalt</button>
      </div>` +
      draft.map((it,idx) => { total += it.price*it.qty; return `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13.5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div>${escapeHtml(it.name)}</div>
              <div class="muted" style="font-size:12px;">${money(it.price*it.qty)}</div>
            </div>
            <span style="display:flex;align-items:center;gap:8px;">
              <button class="qty-btn" onclick="changeDraftQty('${tableId}',${idx},-1)">-</button>
              <span style="min-width:16px;text-align:center;font-weight:700;">${it.qty}</span>
              <button class="qty-btn" onclick="changeDraftQty('${tableId}',${idx},1)">+</button>
            </span>
          </div>
          <input type="text" placeholder="Not ekle (örn. az pişmiş, acısız...)" value="${escapeAttr(it.note||'')}" style="margin:6px 0 0;font-size:12px;padding:6px 10px;" oninput="updateDraftItemNote('${tableId}',${idx},this.value)">
        </div>`; }).join('') +
      `<div style="text-align:right;font-weight:700;margin-top:8px;">Toplam: ${money(total)}</div>
      </div>`;
  }
  const confirmBtn = document.getElementById('confirmBtn');
  if(confirmBtn) confirmBtn.disabled = draft.length===0;
}
/* Not girilirken her tuş vuruşunda tüm sepeti yeniden çizmiyoruz (yazarken
   imleç/odak kaybolmasın diye) - sadece draft dizisindeki değeri güncelliyor. */
function updateDraftItemNote(tableId, idx, value){
  const draft = APP.draftCart[tableId];
  if(draft && draft[idx]) draft[idx].note = value;
}
async function confirmOrder(tableId){
  const draft = APP.draftCart[tableId];
  if(!draft || draft.length===0) return;
  const btn = document.getElementById('confirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }
  // Masa penceresinde yazılmış müşteri bilgisi siparişle birlikte kaydedilir.
  if(document.getElementById('tableCustName')) await saveTableCustomer(tableId, true);
  const session = getSession();
  const items = draft.map(d => ({ product_id:d.product_id, name:d.name, price:d.price, cost:d.cost, station_id:d.station_id, qty:d.qty, note:d.note||'' }));
  const tags = (APP.orderFlagSelections && APP.orderFlagSelections[tableId]) || [];
  const isPkg = typeof tableId==='string' && tableId.indexOf('pkg_')===0;
  const isWl = typeof tableId==='string' && tableId.indexOf('wl_')===0;
  let error;
  if(isWl){
    const res = await sb.rpc('send_waitlist_order', { p_token: session.session_token, p_waitlist_id: tableId.slice(3), p_items: items, p_tags: tags });
    error = res.error;
  } else if(isPkg){
    const existingOrderId = tableId==='pkg_new' ? null : tableId.slice(4);
    const nameEl = document.getElementById('pkgCustName');
    const phoneEl = document.getElementById('pkgCustPhone');
    const noteEl = document.getElementById('pkgNote');
    const res = await sb.rpc('send_takeaway_order', {
      p_token: session.session_token, p_order_id: existingOrderId, p_items: items,
      p_customer_name: nameEl ? (nameEl.value.trim()||null) : null,
      p_customer_phone: phoneEl ? (phoneEl.value.trim()||null) : null,
      p_note: noteEl ? (noteEl.value.trim()||null) : null,
      p_tags: tags
    });
    error = res.error;
  } else {
    const res = await sb.rpc('send_order', { p_token: session.session_token, p_table_id: tableId, p_items: items, p_tags: tags });
    error = res.error;
  }
  if(error){
    alert('Sipariş gönderilemedi: ' + error.message);
    if(btn){ btn.disabled = false; btn.textContent = '✅ Siparişi Onayla ve Mutfağa Gönder'; }
    return;
  }
  APP.draftCart[tableId] = [];
  // Not: Fis burada (siparis alan cihazda) degil, ilgili istasyonun kendi mutfak
  // ekraninda (yazicisi ona fiziksel olarak bagli oldugu icin) otomatik yazdiriliyor
  // - bkz. refreshKitchenItems. Farkli fiziksel bilgisayarlara bagli birden fazla
  // yazici oldugunda WebUSB sadece o an acik olan cihaza takili yaziciya erisebilir.
  const [liveRes, cfgRes] = await Promise.all([
    sb.rpc('get_live_orders', { p_token: session.session_token }),
    sb.rpc('get_restaurant_config', { p_token: session.session_token })
  ]);
  APP.liveOrders = liveRes.data || [];
  if(cfgRes.data) APP.config = cfgRes.data;
  await closeTableModal();
  if(isPkg && APP.view==='packages') renderPackagesView(document.getElementById('main'), session);
  if(isWl && APP.view==='reservations') renderWaitlistContent(session, true);
}
async function openWaitlistOrderModal(wlId){
  const session = getSession();
  const [liveRes, cfgRes] = await withLoadingOverlay(Promise.all([
    sb.rpc('get_live_orders', { p_token: session.session_token }),
    APP.config ? Promise.resolve({ data: null }) : sb.rpc('get_restaurant_config', { p_token: session.session_token })
  ]));
  if(liveRes.error){ alert(liveRes.error.message); return; }
  APP.liveOrders = liveRes.data || [];
  if(cfgRes.data) APP.config = cfgRes.data;
  openPackageModal('wl_' + wlId);
}
