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
    return `<div class="table-cell" style="cursor:pointer;background:rgba(244,63,94,.14);border-color:var(--red);color:var(--red);overflow-wrap:anywhere;word-break:break-word;" ${act('openPackageModal', 'pkg_'+o.order_id)}>
      📦 ${escapeHtml(label)}<div style="font-size:11px;margin-top:4px;font-weight:400;">${o.items.length} ürün - ${allReady?'Hazır':'hazırlanıyor'} · ${money(total)}</div></div>`;
  });
  cards.push(`<div class="table-cell" style="cursor:pointer;" ${act('openPackageModal','pkg_new')}>➕<div style="font-size:11px;margin-top:4px;font-weight:400;">Yeni Paket Sipariş</div></div>`);
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
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:7vh 16px 16px;overflow-y:auto;';
  bg.onclick = (e) => { if(e.target===bg) closeTableModal(); };
  bg.innerHTML = `
    <div class="order-modal">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;overflow-wrap:anywhere;word-break:break-word;">${title}</h2>
        <span style="cursor:pointer;color:var(--muted);font-size:20px;" ${act('closeTableModal')}>✕</span>
      </div>
      <div class="order-modal-grid">
        <div class="order-modal-menu">
          <div class="tabs" id="prodStationTabs" style="margin-top:0;"></div>
          <div id="prodPick"></div>
        </div>
        <div class="order-modal-cart">
          <div class="om-cart-head">🧾 Sipariş</div>
      ${isWl ? '<p class="muted" style="text-align:left;margin:0 0 6px;font-size:12.5px;">Siparişler hemen mutfağa düşer; müşteri oturtulunca masaya taşınır.</p>' : `<div class="field-group"><label>Müşteri Adı</label><input id="pkgCustName" placeholder="örn. Ahmet Bey veya kayıtlı müşteri ara" autocomplete="off" ${actOn('input','tableCustSearch',['$value','pkgCust'])} value="${escapeAttr((existing&&existing.customer_name)||'')}"></div>
      <div class="field-group"><label>Telefon</label><input id="pkgCustPhone" placeholder="örn. 5551234567" autocomplete="off" inputmode="tel" ${actOn('input','tableCustSearch',['$value','pkgCust'])} value="${escapeAttr((existing&&existing.customer_phone)||'')}"></div>
      <div id="pkgCustSuggest" style="margin:-6px 0 10px;"></div>
      <div class="field-group"><label>Not</label><input id="pkgNote" placeholder="örn. Yan sokak, 2. kat" value="${escapeAttr((existing&&existing.note)||'')}"></div>`}
          <div id="sentItemsWrap"></div>
          <div id="draftItemsWrap"></div>
          ${orderFlagsHtml(pseudoId)}
        </div>
      </div>
      <div class="modal-sticky-actions">
        <button class="ghost-btn" style="flex:1;margin-top:0;color:var(--red);border-color:var(--red);" ${act('cancelTableOrder', pseudoId)} ${existing?'':'disabled'}>🗑️ İptal Et</button>
        <button id="confirmBtn" style="flex:1;margin-top:0;" disabled ${act('confirmOrder', pseudoId)}>✅ Onayla ve Gönder</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  bg.dataset.tableId = pseudoId;
  // İstasyon sekmesi yok: tüm menüler tek listede; sipariş/fiş ürünün istasyonuna gider.
  const stTabs = document.getElementById('prodStationTabs'); if(stTabs) stTabs.style.display = 'none';
  renderProductPick(null, pseudoId);
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
/* Ürün seçimi: istasyonun alt menüleri solda (dar ekranda üstte kaydırılabilir) liste, ürünler sağda ızgara. */
function renderProductPick(stationId, tableId){
  const el = document.getElementById('prodPick'); if(!el) return;
  // Tüm menülerin ürünleri tek listede (istasyondan bağımsız); menüler Ayarlar sırasıyla.
  stationId = '__all_menus';
  const all = APP.config.products.slice();
  const used = new Set(all.map(p => p.category).filter(Boolean));
  const menuOrder = (APP.config.menus || []).map(m => m.name);
  const cats = [...menuOrder.filter(c => used.has(c)), ...[...used].filter(c => !menuOrder.includes(c))];
  APP.prodPickCat = APP.prodPickCat || {};
  let cur = APP.prodPickCat[stationId];
  if(cur && cur !== '__all' && !cats.includes(cur)) cur = null;
  cur = cur || '__all';
  const prods = (!cats.length || cur === '__all') ? all : all.filter(p => p.category === cur);
  const count = (c) => c === '__all' ? all.length : all.filter(p => p.category === c).length;
  const side = cats.length ? `<div class="pp-cats">${[['__all','Tümü'], ...cats.map(c => [c, c])].map(([v, l]) =>
    `<button type="button" class="pp-cat ${cur===v?'active':''}" data-cat="${escapeAttr(v)}" ${actStop('setProdPickCat', stationId, '$data.cat', tableId)}><span>${escapeHtml(l)}</span><b>${count(v)}</b></button>`).join('')}</div>` : '';
  const cards = prods.length ? prods.map(p => {
    const stock = effectiveStock(p);
    const off = p.available===false || (stock!=null && stock<=0);
    let badge = '';
    if(p.available===false) badge = '<div class="pp-badge" style="color:var(--red);">Satışta Değil</div>';
    else if(stock!=null && stock<=0){
      // Reçeteli üründe hangi hammaddenin bittiği de yazılır (örn. "Stok Yok · Lavaş").
      const ings = APP.config.ingredients || [];
      const miss = (p.recipe || []).filter(r => { const i = ings.find(x => x.id === r.ingredient_id); return i && r.qty_per_unit > 0 && i.stock < r.qty_per_unit; }).map(r => r.ingredient_name);
      badge = '<div class="pp-badge" style="color:var(--red);">Stok Yok' + (miss.length ? ' · ' + escapeHtml(miss.join(', ')) : '') + '</div>';
    }
    else if(stock!=null && stock<=10) badge = '<div class="pp-badge" style="color:var(--accent);">Son '+stock+' porsiyon</div>';
    const inCart = ((APP.draftCart && APP.draftCart[tableId]) || []).filter(i => i.product_id === p.id).reduce((n, i) => n + i.qty, 0);
    return `<div class="prod-pick-card pp-card ${off?'off':''}" ${off?'':act('addToDraft', tableId, p.id)}>
      ${inCart ? `<span class="pp-qty">${inCart}</span>` : ''}
      <div class="pp-name">${escapeHtml(p.name)}</div><div class="pp-price">${money(p.price)}</div>${badge}
    </div>`;
  }).join('') : '<p class="muted" style="grid-column:1/-1;">Bu bölümde ürün yok.</p>';
  el.className = 'pp-wrap' + (cats.length ? ' has-cats' : '');
  el.removeAttribute('style');
  // Ekstralar: sepetteki ürünlerin ekstraları ürünlerin altında seçilir (açılır pencere yok).
  const cart = (APP.draftCart && APP.draftCart[tableId]) || [];
  const parents = [...new Set(cart.map(i => i.product_id))].map(id => (APP.config.products || []).find(p => p.id === id)).filter(p => p && productExtras(p.id).some(e => e.available !== false));
  const extrasHtml = parents.length ? `<div class="pp-extras"><div class="pp-extras-h">➕ Ekstralar</div>
    ${parents.map(par => `<div class="pp-extras-row"><span class="pp-extras-for">${escapeHtml(par.name)}</span>
      ${productExtras(par.id).filter(e => e.available !== false).map(e => { const n = (cart.find(i => i.product_id === e.id) || {}).qty || 0;
        return `<button type="button" class="pp-extra ${n?'on':''}" ${act('addToDraft', tableId, e.id)}>${escapeHtml(e.name)}<small>${Number(e.price) ? '+'+money(e.price) : 'ücretsiz'}</small>${n ? `<b>${n}</b>` : ''}</button>`; }).join('')}</div>`).join('')}
  </div>` : '';
  el.innerHTML = side + `<div class="pp-main"><div class="pp-grid">${cards}</div>${extrasHtml}</div>`;
}
function setProdPickCat(stationId, cat, tableId){
  APP.prodPickCat = APP.prodPickCat || {}; APP.prodPickCat[stationId] = cat;
  renderProductPick(stationId, tableId);
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
      renderProductPick(null, tableId);
    }
  }, 1500);
}
function addToDraft(tableId, productId, noExtrasPrompt){
  const prod = findProductAny(productId);
  if(!prod) return;
  if(prod.available===false){ alert('Bu ürün şu anda satışta değil'); return; }
  const stock = effectiveStock(prod);
  if(stock!=null && stock<=0){ alert('Bu üründe stok kalmadı'); return; }
  const draft = APP.draftCart[tableId];
  const existing = draft.find(i => i.product_id===productId);
  if(existing){ existing.qty += 1; }
  else{
    // Ekstra ayrı kalem olarak eklenir; adı ana ürünle birlikte yazılır (mutfak ekranı ve fişte okunur).
    const parent = prod.parent_id ? (APP.config.products || []).find(p => p.id === prod.parent_id) : null;
    const name = parent ? '+ ' + prod.name + ' (' + parent.name + ')' : prod.name;
    draft.push({ product_id:productId, name, price:prod.price, cost:prod.cost, station_id:prod.station_id, qty:1, note:'' });
  }
  applyLocalStockDelta(productId, 1);
  renderTableItems(tableId);
  const activeTab = document.querySelector('#prodStationTabs .tab.active');
  renderProductPick(null, tableId);
  // Sepete ekleme ekranda anında görünür; stok düşümü arka planda sunucuya gönderilir.
  const session = getSession();
  sb.rpc('adjust_stock', { p_token: session.session_token, p_product_id: productId, p_delta: -1 }).then(({error}) => {
    if(!error){ scheduleConfigResync(tableId); return; }
    if(isNetworkError(error)){
      // Çevrimdışı: ürün sepette kalır, stoğu sipariş gönderilirken ayrılır (bkz. offline.js).
      const it = APP.draftCart[tableId].find(i => i.product_id===productId);
      if(it) it.unreserved = (it.unreserved || 0) + 1;
      return;
    }
    alert('Ürün eklenemedi, sepetten çıkarıldı: '+error.message);
    const d = APP.draftCart[tableId];
    const it = d.find(i => i.product_id===productId);
    if(it){ it.qty -= 1; if(it.qty<=0) d.splice(d.indexOf(it),1); }
    applyLocalStockDelta(productId, -1);
    renderTableItems(tableId);
    const t = document.querySelector('#prodStationTabs .tab.active');
    renderProductPick(null, tableId);
  });
}
async function changeDraftQty(tableId, idx, delta){
  const draft = APP.draftCart[tableId];
  if(!draft[idx]) return;
  const item = draft[idx];
  const productId = item.product_id;
  // Azaltmada önce stoğu hiç ayrılmamış (çevrimdışı eklenmiş) adetten düşülür; sunucuya gerek yok.
  let serverDelta = delta;
  if(delta < 0 && item.unreserved > 0){ const used = Math.min(item.unreserved, -delta); item.unreserved -= used; serverDelta += used; }
  item.qty += delta;
  if(item.qty<=0) draft.splice(idx,1);
  applyLocalStockDelta(productId, delta);
  renderTableItems(tableId);
  const activeTab = document.querySelector('#prodStationTabs .tab.active');
  renderProductPick(null, tableId);
  if(serverDelta === 0) return;
  const session = getSession();
  const { error } = await sb.rpc('adjust_stock', { p_token: session.session_token, p_product_id: productId, p_delta: -serverDelta });
  if(error && isNetworkError(error)){
    if(serverDelta > 0){ const it = APP.draftCart[tableId].find(i => i.product_id===productId); if(it) it.unreserved = (it.unreserved || 0) + serverDelta; }
    else queueStockReturn(productId, -serverDelta);
    return;
  }
  if(error){
    alert(error.message);
    const d = APP.draftCart[tableId];
    const existing = d.find(i => i.product_id===productId);
    if(existing){ existing.qty -= delta; if(existing.qty<=0) d.splice(d.indexOf(existing),1); }
    else if(delta<0){ d.push({ ...item, qty:-delta }); }
    applyLocalStockDelta(productId, -delta);
    renderTableItems(tableId);
    const t = document.querySelector('#prodStationTabs .tab.active');
    renderProductPick(null, tableId);
    return;
  }
  scheduleConfigResync(tableId);
}
/* Mutfağa gönderilmiş (ödenmemiş) tek bir ürünü iptal eder; hazırlanıyorsa
   istasyona iptal fişi gider ve istasyon ekranında 15 sn "İPTAL EDİLDİ" görünür. */
async function cancelSentItem(tableId, itemId){
  const order = liveOrderForTable(tableId);
  const it = order && order.items.find(i => i.id===itemId);
  if(!it) return;
  if(!confirm(it.qty + 'x ' + it.name + ' iptal edilsin mi?' + (it.status==='pending' ? '\nİstasyona iptal fişi gönderilecek.' : ''))) return;
  const session = getSession();
  const { data, error } = await withLoadingOverlay(sb.rpc('cancel_order_item', { p_token: session.session_token, p_item_id: itemId }));
  if(error){ alert('İptal edilemedi: ' + error.message); return; }
  const { data: live } = await sb.rpc('get_live_orders', { p_token: session.session_token });
  APP.liveOrders = live || [];
  showToast('❌ ' + it.name + ' iptal edildi');
  if(data && data.order_closed && !(APP.draftCart[tableId]||[]).length){ await closeTableModal(); render(); return; }
  renderTableItems(tableId);
}
/* Toplu iptal: gönderilen ürünlerde seçim (masa bazında, yenilemelerde korunur). */
function sentSel(tableId){ APP.sentCancelSel = APP.sentCancelSel || {}; return APP.sentCancelSel[tableId] = APP.sentCancelSel[tableId] || new Set(); }
function toggleSentSel(tableId, itemId, el){ const s = sentSel(tableId); if(el.checked) s.add(itemId); else s.delete(itemId); renderTableItems(tableId); }
function selectAllSent(tableId){
  const order = liveOrderForTable(tableId); if(!order) return;
  const ids = order.items.filter(i => !i.paid).map(i => i.id), s = sentSel(tableId);
  if(ids.every(id => s.has(id))) s.clear(); else ids.forEach(id => s.add(id));
  renderTableItems(tableId);
}
async function cancelSelectedSent(tableId){
  const order = liveOrderForTable(tableId); if(!order) return;
  const s = sentSel(tableId);
  const list = order.items.filter(i => s.has(i.id) && !i.paid);
  if(!list.length) return;
  if(!confirm(list.length + ' ürün iptal edilsin mi?\n' + list.map(i => '• ' + i.qty + 'x ' + i.name).join('\n') + '\n\nHazırlanan ürünler için istasyona iptal fişi gönderilecek.')) return;
  const session = getSession();
  let closed = false, failed = 0;
  await withLoadingOverlay((async () => {
    for(const it of list){
      const { data, error } = await sb.rpc('cancel_order_item', { p_token: session.session_token, p_item_id: it.id });
      if(error) failed++; else if(data && data.order_closed) closed = true;
    }
  })());
  s.clear();
  const { data: live } = await sb.rpc('get_live_orders', { p_token: session.session_token });
  APP.liveOrders = live || [];
  showToast(failed ? '⚠️ ' + failed + ' ürün iptal edilemedi' : '❌ ' + list.length + ' ürün iptal edildi');
  if(closed && !(APP.draftCart[tableId]||[]).length){ await closeTableModal(); render(); return; }
  renderTableItems(tableId);
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
    sentWrap.innerHTML = `<p style="font-weight:700;margin-bottom:2px;">Mutfağa Gönderilen</p>${opened ? `<p class="muted" style="margin:0 0 6px;font-size:12px;">🕒 Sipariş açıldı: ${opened}${order.created_by_name ? ' · 👤 ' + escapeHtml(order.created_by_name) : ''}</p>` : ''}${orderWaiters(order).length > 1 ? `<p class="muted" style="margin:0 0 6px;font-size:12px;">İlgilenen garsonlar: ${escapeHtml(orderWaiters(order).join(', '))}</p>` : ''}` + order.items.map(it => `
      <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span style="min-width:0;overflow-wrap:anywhere;">${escapeHtml(it.name)} x${it.qty} ${it.status==='ready'?'<span style="color:var(--green);">✓ Hazır</span>':'<span class="muted">Hazırlanıyor</span>'}</span>
        <span class="muted" style="white-space:nowrap;font-size:12px;display:flex;align-items:center;gap:6px;">${it.added_by_name ? '👤 ' + escapeHtml(it.added_by_name) + ' · ' : ''}🕒 ${hm(it.added_at)}${it.ready_at ? ' · ✓ ' + hm(it.ready_at) : ''}${it.paid ? '' : `<button type="button" class="sent-cancel" title="Bu ürünü iptal et" ${act('cancelSentItem', tableId, it.id)}>✕ İptal</button><input type="checkbox" class="sent-sel" title="Toplu iptal için seç" ${sentSel(tableId).has(it.id)?'checked':''} ${actOn('change','toggleSentSel',[tableId, it.id, '$this'])}>`}</span>
      </div>`).join('') + (order.items.some(i => !i.paid) ? `<div class="sent-bulk">
        <button type="button" class="ghost-btn" ${act('selectAllSent', tableId)}>☑️ ${order.items.filter(i => !i.paid).every(i => sentSel(tableId).has(i.id)) ? 'Seçimi Kaldır' : 'Tümünü Seç'}</button>
        <button type="button" class="sent-bulk-go" ${sentSel(tableId).size ? '' : 'disabled'} ${act('cancelSelectedSent', tableId)}>✕ Seçilenleri İptal Et${sentSel(tableId).size ? ' (' + sentSel(tableId).size + ')' : ''}</button>
      </div>` : '');
  } else { sentWrap.innerHTML = ''; }
  // Çevrimdışıyken onaylanıp cihazda bekleyen siparişler (bkz. offline.js).
  const pending = typeof outboxAll === 'function' ? outboxAll().filter(e => e.tableKey === tableId) : [];
  if(pending.length){
    sentWrap.innerHTML += `<p style="font-weight:700;margin:10px 0 2px;color:var(--amber, #f59e0b);">⏳ Gönderilmeyi Bekleyen</p>
      <p class="muted" style="margin:0 0 6px;font-size:12px;">Bağlantı gelince mutfağa otomatik gönderilecek.</p>` + pending.map(e => (e.args.p_items || []).map(it => `
      <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span style="min-width:0;overflow-wrap:anywhere;">${escapeHtml(it.name)} x${Number(it.qty) || 1}${it.note ? ' <span class="muted">(' + escapeHtml(it.note) + ')</span>' : ''}</span>
        <span style="white-space:nowrap;font-size:12px;color:${e.error ? 'var(--red)' : 'var(--muted)'};">${e.error ? '⚠️ gönderilemedi' : '🕒 ' + new Date(e.at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}</span>
      </div>`).join('')).join('') + `<button type="button" class="ghost-btn" style="width:100%;margin:8px 0 0;" ${act('openOutboxModal')}>Bekleyen siparişleri yönet</button>`;
  }
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
    draftWrap.innerHTML = (order && order.items.length>0) || pending.length ? '' : '<div class="om-empty"><div style="font-size:34px;">🍽️</div><b>Sepet boş</b><span>Soldaki menüden ürünlere dokunarak ekleyin.</span></div>';
  } else {
    let total=0;
    draftWrap.innerHTML = `<div style="border:1px dashed var(--accent);border-radius:10px;padding:10px;margin:10px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <p style="font-weight:700;color:var(--accent);margin:0;">Sepet (Gönderilmedi)</p>
        <button style="width:auto;padding:4px 10px;margin:0;font-size:12px;background:transparent;border:1px solid var(--red);color:var(--red);box-shadow:none;" ${act('clearDraftCart', tableId)}>Sepeti Boşalt</button>
      </div>` +
      draft.map((it,idx) => { total += it.price*it.qty; return `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13.5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div>${escapeHtml(it.name)}</div>
              <div class="muted" style="font-size:12px;">${money(it.price*it.qty)}</div>
            </div>
            <span style="display:flex;align-items:center;gap:8px;">
              <button class="qty-btn" ${act('changeDraftQty', tableId, idx, -1)}>-</button>
              <span style="min-width:16px;text-align:center;font-weight:700;">${it.qty}</span>
              <button class="qty-btn" ${act('changeDraftQty', tableId, idx, 1)}>+</button>
            </span>
          </div>
          <input type="text" placeholder="Not ekle (örn. az pişmiş, acısız...)" value="${escapeAttr(it.note||'')}" style="margin:6px 0 0;font-size:12px;padding:6px 10px;" ${actOn('input','updateDraftItemNote',[tableId, idx, '$value'])}>
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
  if(document.getElementById('tableCustName') && navigator.onLine){ try{ await saveTableCustomer(tableId, true); }catch(e){} }
  const session = getSession();
  const items = draft.map(d => ({ product_id:d.product_id, name:d.name, price:d.price, cost:d.cost, station_id:d.station_id, qty:d.qty, note:d.note||'', reserve: Math.min(d.unreserved||0, d.qty) }));
  const tags = (APP.orderFlagSelections && APP.orderFlagSelections[tableId]) || [];
  const isPkg = typeof tableId==='string' && tableId.indexOf('pkg_')===0;
  const isWl = typeof tableId==='string' && tableId.indexOf('wl_')===0;
  let kind, args, label;
  if(isWl){
    kind = 'waitlist'; label = 'Bekleme listesi siparişi';
    args = { p_waitlist_id: tableId.slice(3), p_items: items, p_tags: tags };
  } else if(isPkg){
    const existingOrderId = tableId==='pkg_new' ? null : tableId.slice(4);
    const nameEl = document.getElementById('pkgCustName');
    const phoneEl = document.getElementById('pkgCustPhone');
    const noteEl = document.getElementById('pkgNote');
    kind = 'takeaway'; label = 'Paket sipariş' + (nameEl && nameEl.value.trim() ? ' · ' + nameEl.value.trim() : '');
    args = {
      p_order_id: existingOrderId, p_items: items,
      p_customer_name: nameEl ? (nameEl.value.trim()||null) : null,
      p_customer_phone: phoneEl ? (phoneEl.value.trim()||null) : null,
      p_note: noteEl ? (noteEl.value.trim()||null) : null,
      p_tags: tags
    };
  } else {
    kind = 'table';
    const t = (APP.config && APP.config.tables || []).find(x => x.id === tableId);
    label = t ? t.name : 'Masa siparişi';
    args = { p_table_id: tableId, p_items: items, p_tags: tags };
  }
  // Sipariş, bağlantı koparsa cihazda kuyruğa alınır (bkz. offline.js); sunucu aynı siparişi iki kez işlemez.
  const sent = await submitOrderSafely(kind, args, tableId, label);
  const error = sent.error;
  if(error){
    alert('Sipariş gönderilemedi: ' + error.message);
    if(btn){ btn.disabled = false; btn.textContent = '✅ Siparişi Onayla ve Mutfağa Gönder'; }
    return;
  }
  APP.draftCart[tableId] = [];
  if(sent.queued){
    showToast('📴 Bağlantı yok: sipariş cihazda bekletiliyor, bağlantı gelince mutfağa gönderilecek');
    await closeTableModal();
    if(typeof render === 'function') render();
    return;
  }
  // Not: Fis burada (siparis alan cihazda) degil, ilgili istasyonun kendi mutfak
  // ekraninda (yazicisi ona fiziksel olarak bagli oldugu icin) otomatik yazdiriliyor
  // - bkz. refreshKitchenItems. Farkli fiziksel bilgisayarlara bagli birden fazla
  // yazici oldugunda WebUSB sadece o an acik olan cihaza takili yaziciya erisebilir.
  const prevItemIds = new Set((APP.liveOrders || []).flatMap(o => (o.items || []).map(i => i.id)));
  const [liveRes, cfgRes] = await Promise.all([
    sb.rpc('get_live_orders', { p_token: session.session_token }),
    sb.rpc('get_restaurant_config', { p_token: session.session_token })
  ]);
  APP.liveOrders = liveRes.data || [];
  if(cfgRes.data) APP.config = cfgRes.data;
  // Sipariş veren cihazda yazıcı varsa fiş hemen basılır (Mutfak Ekranı açık olmasa da).
  // Basılan ürünler işaretlenir; aynı cihazda mutfak ekranı açıksa ikinci kez basmaz.
  if(printOnOrderEnabled() && deviceHasSilentPrinter()){
    APP.locallyPrintedItemIds = APP.locallyPrintedItemIds || new Set();
    APP.liveOrders.forEach(o => {
      const fresh = (o.items || []).filter(i => !prevItemIds.has(i.id) && i.status==='pending' && !APP.locallyPrintedItemIds.has(i.id));
      if(!fresh.length) return;
      fresh.forEach(i => APP.locallyPrintedItemIds.add(i.id));
      printKitchenTicketGrouped(orderDisplayName(o), fresh, true, o.daily_number)
        .catch(e => { console.error('Fiş yazdırma hatası:', e); showToast('⚠️ Fiş yazdırılırken beklenmeyen bir hata oluştu'); });
    });
  }
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
