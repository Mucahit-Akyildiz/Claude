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
    if(statusEl) statusEl.textContent = 'Veri yüklenemedi: ' + ((cfgRes.error||liveRes.error).message);
    if(statusEl) statusEl.style.color = 'var(--red)';
    return;
  }
  if(!APP.config) APP.config = cfgRes.data;
  APP.liveOrders = liveRes.data || [];
  if(!statusEl || !statusEl.isConnected) return; // yanıt gelmeden başka ekrana geçildi
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
    const pickup = pkgTypeOf(o) === 'pickup';
    let eta = '';
    if(o.pickup_at){
      // Adrese teslimde süre, yola çıkış saatine (teslim − 10 dk) göre sayılır.
      const left = Math.round((pkgKitchenDeadline(o) - Date.now()) / 60000);
      const hm = new Date(o.pickup_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
      const warn = left >= 10 && left < 20 && !allReady, red = left < 10 && !allReady;
      eta = `<div style="margin-top:5px;"><span class="pk-badge ${left < 0 || red ? 'late' : warn ? 'warn' : 'ok'}">${warn || red ? '⚠️' : '🕒'} ${pickup ? '' : 'Teslim '}${hm} · ${left < 0 ? Math.abs(left) + ' dk geçti' : left + ' dk kaldı'}</span></div>`;
    }
    // Kurye durumu (yalnızca teslimat): kuryeye ver → yolda → teslim edildi (ödeme bekliyor).
    let courier = '';
    if(!pickup){
      const mins = (t) => Math.max(0, Math.round((Date.now() - new Date(t)) / 60000));
      courier = o.delivered_at ? `<div class="cr-row"><span class="pk-badge cr-done">✅ Teslim edildi · ödeme bekliyor</span><button type="button" class="cr-btn ghost" title="Teslim edildi işaretini geri al" ${actStop('markDelivered', o.order_id, true)}>↩</button></div>`
        : o.dispatched_at ? `<div class="cr-row"><span class="pk-badge cr-way">🛵 Yolda${o.courier_name ? ' · ' + escapeHtml(o.courier_name) : ''} · ${mins(o.dispatched_at)} dk</span>${courierAcceptBadge(o)}${courierLiveBadge(o)}<button type="button" class="cr-btn ghost" title="${o.courier_user_id === (getSession()||{}).user_id ? 'Konumumu paylaş' : 'Kurye linki · konum paylaşımı'}" ${actStop('openCourierLink', o.order_id)}>📍</button><button type="button" class="cr-btn" ${actStop('markDelivered', o.order_id, false)}>✅ Teslim</button></div>`
        : allReady ? `<div class="cr-row"><button type="button" class="cr-btn hot" ${actStop('openCourierSheet', o.order_id)}>🛵 Kuryeye Ver</button></div>`
        : `<div class="cr-row"><button type="button" class="cr-btn" disabled title="Mutfak tüm ürünleri hazırlayınca kuryeye verilebilir">⏳ Hazırlanıyor — kurye bekliyor</button></div>`;
    }
    return `<div class="table-cell pk-cell ${o.delivered_at ? 'pk-delivered' : o.dispatched_at ? 'pk-way' : ''}" style="cursor:pointer;background:rgba(244,63,94,.14);border-color:var(--red);color:var(--red);overflow-wrap:anywhere;word-break:break-word;" ${act('openPackageModal', 'pkg_'+o.order_id)}>
      ${pickup ? '🥡' : '🛵'} ${escapeHtml(label)}<div style="font-size:11px;margin-top:4px;font-weight:400;">${pickup ? 'Gel-Al' : 'Paket'} · ${o.items.length} ürün - ${allReady?'Hazır':'hazırlanıyor'} · ${money(total)}</div>${eta}${courier}</div>`;
  });
  const del = pkgOrders.filter(o => pkgTypeOf(o) !== 'pickup');
  const sum = document.getElementById('pkgStatus');
  if(sum && del.length) sum.innerHTML = (del.some(o => o.dispatched_at && !o.delivered_at) ? `<button type="button" class="cr-btn hot" style="float:right;margin:0 0 8px 8px;" ${act('openCourierMap')}>🗺️ Kuryeler</button>` : '') + statChips([['👨‍🍳', del.filter(o => !o.dispatched_at).length, 'Hazırlanıyor / kurye bekliyor', 'var(--c3)'], ['🛵', del.filter(o => o.dispatched_at && !o.delivered_at).length, 'Yolda', 'var(--c1)'], ['✅', del.filter(o => o.delivered_at).length, 'Teslim edildi, ödeme bekliyor', 'var(--ok,#22c55e)']], '', 'pkg');
  if(!document.getElementById('courierSheet')) document.body.insertAdjacentHTML('beforeend', sheetHtml('courierSheet', '🛵', 'Kuryeye Ver', '<div id="courierBody"></div>', 'var(--c1)'));
  cards.push(`<div class="table-cell" style="cursor:pointer;" ${act('openPackageModal','pkg_new')}>➕<div style="font-size:11px;margin-top:4px;font-weight:400;">Yeni Paket Sipariş</div></div>`);
  el.innerHTML = cards.join('');
}
function openPackageModal(pseudoId){
  if(!APP.draftCart) APP.draftCart = {};
  if(!APP.draftCart[pseudoId]) APP.draftCart[pseudoId] = [];
  const existing = pseudoId==='pkg_new' ? null : liveOrderForTable(pseudoId);
  if(pseudoId==='pkg_new'){ APP.pkgType = 'delivery'; APP.pkgPickupMin = null; }
  const isRs = pseudoId.indexOf('rs_')===0;
  const isWl = pseudoId.indexOf('wl_')===0 || isRs;
  const rsEntry = isRs ? (APP.reservationsCache||[]).find(r => r.id===pseudoId.slice(3)) : null;
  const wlEntry = isRs ? null : isWl ? (APP.waitlistCache||[]).find(w => w.id===pseudoId.slice(3)) : null;
  const title = isRs ? '📅 ' + escapeHtml((rsEntry && rsEntry.customer_name) || (existing && existing.customer_name) || 'Rezervasyon') + ' <span class="muted" style="font-size:13px;font-weight:600;">rezervasyon ön siparişi' + (rsEntry ? ' · ' + new Date(rsEntry.reservation_time).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) + ' · ' + rsEntry.party_size + ' kişi' : '') + '</span>'
    : isWl ? '⏳ ' + escapeHtml((wlEntry && wlEntry.customer_name) || (existing && existing.customer_name) || 'Bekleme Listesi') + ' <span class="muted" style="font-size:13px;font-weight:600;">bekleme listesi</span>'
    : '📦 ' + (existing ? escapeHtml(existing.customer_name || ('Paket #'+(existing.daily_number||''))) : 'Yeni Paket Sipariş');
  const bg = document.createElement('div');
  bg.id = 'tableModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:7vh 16px 16px;overflow-y:auto;';
  bg.onclick = (e) => { if(e.target===bg) closeTableModal(); };
  bg.innerHTML = `
    <div class="order-modal">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;overflow-wrap:anywhere;word-break:break-word;">${title}</h2>
        <span class="u-xclose" ${act('closeTableModal')}>✕</span>
      </div>
      <div class="order-modal-grid">
        <div class="order-modal-menu">
          <div class="tabs" id="prodStationTabs" style="margin-top:0;"></div>
          <div id="prodPick"></div>
        </div>
        <div class="order-modal-cart">
          <div class="om-cart-head">🧾 Sipariş<span class="om-cart-total"></span></div>
      ${isWl ? '<p class="muted" style="text-align:left;margin:0 0 6px;font-size:12.5px;">Siparişler hemen mutfağa düşer; müşteri oturtulunca masaya taşınır.</p>' : `<div class="field-group"><label>Müşteri Adı</label><input id="pkgCustName" maxlength="60" placeholder="örn. Ahmet Bey veya kayıtlı müşteri ara" autocomplete="off" ${actOn('input','tableCustSearch',['$value','pkgCust'])} value="${escapeAttr((existing&&existing.customer_name)||'')}"></div>
      <div class="field-group"><label>Telefon <span class="u-red">*</span></label><input id="pkgCustPhone" placeholder="örn. 5551234567" autocomplete="off" inputmode="tel" ${actOn('input','tableCustSearch',['$value','pkgCust'])} value="${escapeAttr((existing&&existing.customer_phone)||'')}"></div>
      <div id="pkgCustSuggest" style="margin:-6px 0 10px;"></div>
      <small class="muted" style="display:block;margin:-6px 0 10px;font-size:11.5px;">Telefon zorunludur. Kayıtlı müşteri seçince adresi otomatik dolar; yeni müşteri Müşteriler'e adresiyle birlikte eklenir.</small>
      ${pkgTypeHtml(existing)}
      <div class="field-group" id="pkgAddrWrap" style="${pkgTypeOf(existing)==='pickup'?'display:none;':''}"><label>Teslimat Adresi</label><textarea id="pkgAddress" rows="2" placeholder="örn. Atatürk Cad. No:12 D:4" style="resize:vertical;min-height:44px;">${escapeHtml((existing&&existing.delivery_address)||'')}</textarea></div>
      <div class="field-group"><label>Not</label><input id="pkgNote" placeholder="örn. Yan sokak, 2. kat" value="${escapeAttr((existing&&existing.note)||'')}"></div>`}
          <div id="sentItemsWrap"></div>
          <div id="draftItemsWrap"></div>
          ${orderAllowanceHtml(pseudoId)}${orderFlagsHtml(pseudoId)}
        </div>
      </div>
      ${omMobileBarHtml(pseudoId)}
      <div class="modal-sticky-actions">
        <button class="ghost-btn" style="flex:1;margin-top:0;color:var(--red);border-color:var(--red);" ${act('cancelTableOrder', pseudoId)} ${existing?'':'disabled'}>🗑️ İptal Et</button>
        <button id="confirmBtn" style="flex:1;margin-top:0;" disabled ${act('confirmOrder', pseudoId)}><kbd class="sc-k">F9</kbd>✅ Onayla ve Gönder</button>
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
  APP.ppLast = { stationId, tableId };
  const el = document.getElementById('prodPick'); if(!el) return;
  // Tüm menülerin ürünleri tek listede (istasyondan bağımsız); menüler Ayarlar sırasıyla.
  stationId = '__all_menus';
  // Satışa kapalı ürünler Ayarlar > Ürünler'deki "Kapalı ürünler Sipariş Al'da görünsün" ayarına göre gizlenir.
  const all = APP.config.order_show_closed === false ? APP.config.products.filter(p => p.available!==false) : APP.config.products.slice();
  const used = new Set(all.map(p => p.category).filter(Boolean));
  const menuOrder = (APP.config.menus || []).map(m => m.name);
  const cats = [...menuOrder.filter(c => used.has(c)), ...[...used].filter(c => !menuOrder.includes(c))];
  APP.prodPickCat = APP.prodPickCat || {};
  let cur = APP.prodPickCat[stationId];
  if(cur && cur !== '__all' && !cats.includes(cur)) cur = null;
  cur = cur || '__all';
  const q = String(APP.prodSearch || '').trim().toLocaleLowerCase('tr');
  const prods = q ? all.filter(p => String(p.name).toLocaleLowerCase('tr').includes(q)) : ((!cats.length || cur === '__all') ? all : all.filter(p => p.category === cur));
  // Menü rengi: menünün bağlı olduğu istasyonun rengi.
  const menuColor = (cat) => { const m = (APP.config.menus || []).find(x => x.name === cat); const st = m && (APP.config.stations || []).find(x => x.id === m.station_id); return (st && st.color) || 'var(--c1)'; };
  const count = (c) => c === '__all' ? all.length : all.filter(p => p.category === c).length;
  const side = cats.length ? `<div class="pp-cats">${[['__all','Tümü'], ...cats.map(c => [c, c])].map(([v, l]) =>
    `<button type="button" class="pp-cat ${cur===v && !q?'active':''}" style="--mc:${v==='__all' ? 'var(--c1)' : menuColor(v)};" data-cat="${escapeAttr(v)}" ${actStop('setProdPickCat', stationId, '$data.cat', tableId)}><span class="pp-cat-ic">${v==='__all' ? '🍽️' : catIcon(l)}</span><span class="pp-cat-t"><span>${escapeHtml(l)}</span><small>${count(v)} ürün</small></span></button>`).join('')}</div>` : '';
  const cards = prods.length ? prods.map(p => {
    const stock = effectiveStock(p);
    const off = p.available===false || (stock!=null && stock<=0);
    let badge = '';
    if(p.available===false) badge = '<div class="u-red pp-badge">Satışta Değil</div>';
    else if(stock!=null && stock<=0){
      // Reçeteli üründe hangi hammaddenin bittiği de yazılır (örn. "Stok Yok · Lavaş").
      const ings = APP.config.ingredients || [];
      const miss = (p.recipe || []).filter(r => { const i = ings.find(x => x.id === r.ingredient_id); return i && r.qty_per_unit > 0 && i.stock < r.qty_per_unit; }).map(r => r.ingredient_name);
      badge = '<div class="u-red pp-badge">Stok Yok' + (miss.length ? ' · ' + escapeHtml(miss.join(', ')) : '') + '</div>';
    }
    else if(stock!=null && stock<=10) badge = '<div class="u-accent pp-badge">Son '+stock+' porsiyon</div>';
    const inCart = ((APP.draftCart && APP.draftCart[tableId]) || []).filter(i => i.product_id === p.id).reduce((n, i) => n + i.qty, 0);
    const dIdx = ((APP.draftCart && APP.draftCart[tableId]) || []).findIndex(i => i.product_id === p.id);
    return `<div class="prod-pick-card pp-card ${off?'off':''} ${inCart?'in':''}" data-pid="${p.id}" style="--mc:${menuColor(p.category)};" ${off?'':act('addToDraft', tableId, p.id)}>
      ${inCart ? `<span class="pp-qty">${inCart}</span>` : ''}
      <div class="pp-name">${escapeHtml(p.name)}</div>
      <div class="pp-foot"><div class="pp-price">${money(p.price)}</div>${inCart && dIdx >= 0 ? `<span class="pp-step"><button type="button" title="Azalt" ${actStop('changeDraftQty', tableId, dIdx, -1)}>−</button><button type="button" title="Arttır" ${actStop('addToDraft', tableId, p.id)}>+</button></span>` : (off ? '' : '<span class="pp-plus">＋</span>')}</div>${badge}
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
  const searchHtml = `<div class="pp-search"><input id="ppSearch" placeholder="🔍 Ürün ara…" autocomplete="off" value="${escapeAttr(APP.prodSearch || '')}" ${actOn('input','setProdSearch',['$value', tableId])}>${q ? `<span class="pp-search-n">${prods.length} sonuç</span><button type="button" class="pp-search-x" title="Temizle" ${act('setProdSearch', '', tableId)}>✕</button>` : ''}</div>`;
  const focused = document.activeElement && document.activeElement.id === 'ppSearch';
  el.innerHTML = side + `<div class="pp-main">${searchHtml}${q ? '' : quickTopHtml(tableId)}<div class="pp-grid">${cards}</div>${extrasHtml}</div>`;
  loadOrderQuickPicks(tableId);
  if(focused){ const i = document.getElementById('ppSearch'); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
function setProdSearch(v, tableId){ APP.prodSearch = v; renderProductPick(null, tableId); }
function setProdPickCat(stationId, cat, tableId){ APP.prodSearch = '';
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
  if(!await uiConfirm(it.qty + '× ' + it.name + (it.status==='pending' ? '\nİstasyona iptal fişi gönderilecek.' : ''), { title:'Ürün iptal edilsin mi?', okText:'Evet, İptal Et', danger:true })) return;
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
  if(!await uiConfirm(list.length + ' ürün iptal edilecek:\n' + list.map(i => '• ' + i.qty + 'x ' + i.name).join('\n') + '\n\nHazırlanan ürünler için istasyona iptal fişi gönderilecek.', { title:'Seçilenler iptal edilsin mi?', okText:'Evet, İptal Et', danger:true })) return;
  const session = getSession();
  let closed = false, failed = 0;
  await withLoadingOverlay((async () => {
    (await bulkRpc('cancel_order_item', list.map(it => ({ p_item_id: it.id })))).forEach(r => { if(r.error) failed++; else if(r.data && r.data.order_closed) closed = true; });
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
    sentWrap.innerHTML = `<p style="font-weight:700;margin-bottom:2px;display:flex;justify-content:space-between;align-items:center;gap:8px;">Mutfağa Gönderilen<button type="button" class="ghost-btn repeat-btn" title="Son gönderilen ürünleri sepete tekrar ekle" ${act('repeatLastRound', tableId)}>🔁 Aynısından</button></p>${opened ? `<p class="muted" style="margin:0 0 6px;font-size:12px;">🕒 Sipariş açıldı: ${opened}${order.created_by_name ? ' · 👤 ' + escapeHtml(order.created_by_name) : ''}</p>` : ''}${orderWaiters(order).length > 1 ? `<p class="muted" style="margin:0 0 6px;font-size:12px;">İlgilenen garsonlar: ${escapeHtml(orderWaiters(order).join(', '))}</p>` : ''}` + order.items.map(it => `
      <div class="sent-row">
        <span class="sent-name">${escapeHtml(it.name)} x${it.qty} ${it.status==='ready'?'<span style="color:var(--green);">✓ Hazır</span>':'<span class="muted">Hazırlanıyor</span>'}</span>
        <span class="muted sent-meta">${it.added_by_name ? '👤 ' + escapeHtml(it.added_by_name) + ' · ' : ''}🕒 ${hm(it.added_at)}${it.ready_at ? ' · ✓ ' + hm(it.ready_at) : ''}${it.paid ? '' : `<button type="button" class="sent-cancel" title="Bu ürünü iptal et" ${act('cancelSentItem', tableId, it.id)}>✕ İptal</button><input type="checkbox" class="sent-sel" title="Toplu iptal için seç" ${sentSel(tableId).has(it.id)?'checked':''} ${actOn('change','toggleSentSel',[tableId, it.id, '$this'])}>`}</span>
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
    draftWrap.innerHTML = (order && order.items.length>0) || pending.length ? '' : '<div class="om-empty"><div class="om-empty-ic">🍽️</div><b>Sepet boş</b><span>Menüden ürünlere dokunarak ekleyin.</span><small>⭐ Sık satılanlar en üstte</small></div>';
  } else {
    // Gönderilecek ürünler: her ürün bir kart (adet adımlayıcı, tutar); not alanı "📝 Not" ile açılır.
    const total = draft.reduce((x, i) => x + i.price * i.qty, 0), cnt = draft.reduce((x, i) => x + i.qty, 0);
    APP.noteOpen = APP.noteOpen || {};
    draftWrap.innerHTML = `<div class="dc-box">
      <div class="dc-head"><span class="dc-title">🛒 Gönderilecek <b>${cnt}</b></span><button type="button" class="dc-clear" ${act('clearDraftCart', tableId)}>🗑️ Boşalt</button></div>
      ${draft.map((it, idx) => { const extra = String(it.name).startsWith('+ '); const nOpen = APP.noteOpen[tableId + ':' + idx] || false;
        const p = findProductAny(it.product_id) || {};
        const mc = ((APP.config.stations || []).find(x => x.id === (p.station_id || it.station_id)) || {}).color || 'var(--accent)';
        return `<div class="dc-item ${extra ? 'dc-extra' : ''}" style="--mc:${mc};">
          <div class="dc-row">
            <div class="dc-info"><b>${escapeHtml(it.name)}</b><small>${money(it.price)} × ${it.qty}</small></div>
            <div class="dc-step"><button type="button" ${act('changeDraftQty', tableId, idx, -1)}>${it.qty > 1 ? '−' : '🗑'}</button><span>${it.qty}</span><button type="button" ${act('changeDraftQty', tableId, idx, 1)}>+</button></div>
            <div class="dc-sum">${money(it.price * it.qty)}</div>
          </div>
          ${extra ? '' : `<div class="dc-note-row">
            ${it.note ? `<span class="dc-note">📝 ${escapeHtml(it.note)}</span>` : ''}
            <button type="button" class="dc-note-btn ${nOpen ? 'on' : ''}" ${act('toggleDraftNote', tableId, idx)}>${it.note ? '✏️ Düzenle' : '📝 Not ekle'}</button>
          </div>
          ${nOpen ? `<div class="dc-note-edit"><input type="text" placeholder="Not yazın (örn. az pişmiş, acısız…)" value="${escapeAttr(it.note||'')}" ${actOn('input','updateDraftItemNote',[tableId, idx, '$value'])}>
            <div class="note-chips">${quickNoteList().map(n => `<button type="button" class="note-chip ${noteHas(it.note, n) ? 'on' : ''}" ${act('toggleDraftNoteChip', tableId, idx, n)}>${escapeHtml(n)}</button>`).join('')}</div></div>` : ''}`}
        </div>`; }).join('')}
      <div class="dc-total"><span>Toplam</span><b>${money(total)}</b></div>
    </div>`;
  }
  const confirmBtn = document.getElementById('confirmBtn');
  if(confirmBtn) confirmBtn.disabled = draft.length===0;
  updateOmMobileBar(tableId);
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
  if(typeof allowanceWarnBeforeSend === 'function' && !(await allowanceWarnBeforeSend(tableId, draft.reduce((s, d) => s + d.price * d.qty, 0)))) return;
  const btn = document.getElementById('confirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }
  // Masa penceresinde yazılmış müşteri bilgisi siparişle birlikte kaydedilir.
  if(document.getElementById('tableCustName') && navigator.onLine){ try{ await saveTableCustomer(tableId, true); }catch(e){} }
  const session = getSession();
  const items = draft.map(d => ({ product_id:d.product_id, name:d.name, price:d.price, cost:d.cost, station_id:d.station_id, qty:d.qty, note:d.note||'', reserve: Math.min(d.unreserved||0, d.qty) }));
  const tags = (APP.orderFlagSelections && APP.orderFlagSelections[tableId]) || [];
  const isPkg = typeof tableId==='string' && tableId.indexOf('pkg_')===0;
  const isRs = typeof tableId==='string' && tableId.indexOf('rs_')===0;
  const isWl = typeof tableId==='string' && tableId.indexOf('wl_')===0;
  let kind, args, label;
  if(isRs){
    kind = 'reservation'; label = 'Rezervasyon ön siparişi';
    args = { p_reservation_id: tableId.slice(3), p_items: items, p_tags: tags };
  } else if(isWl){
    kind = 'waitlist'; label = 'Bekleme listesi siparişi';
    args = { p_waitlist_id: tableId.slice(3), p_items: items, p_tags: tags };
  } else if(isPkg){
    const existingOrderId = tableId==='pkg_new' ? null : tableId.slice(4);
    const nameEl = document.getElementById('pkgCustName');
    const phoneEl = document.getElementById('pkgCustPhone');
    if(!phoneEl || (phoneEl.value || '').replace(/\D/g, '').length < 10){
      alert('Paket siparişte müşteri telefonu zorunludur.'); if(phoneEl){ phoneEl.focus(); phoneEl.style.borderColor = 'var(--red)'; }
      if(btn){ btn.disabled = false; btn.innerHTML = '✅ Onayla ve Gönder'; } return;
    }
    const addrEl = document.getElementById('pkgAddress');
    if(APP.pkgType !== 'pickup' && addrEl && !addrEl.value.trim()){
      alert('Paket (adrese teslim) siparişte teslimat adresi zorunludur.'); addrEl.focus(); addrEl.style.borderColor = 'var(--red)';
      if(btn){ btn.disabled = false; btn.innerHTML = '✅ Onayla ve Gönder'; } return;
    }
    const noteEl = document.getElementById('pkgNote');
    kind = 'takeaway'; label = 'Paket sipariş' + (nameEl && nameEl.value.trim() ? ' · ' + nameEl.value.trim() : '');
    args = {
      p_order_id: existingOrderId, p_items: items,
      p_customer_name: nameEl ? (nameEl.value.trim()||null) : null,
      p_customer_phone: phoneEl ? (phoneEl.value.trim()||null) : null,
      p_note: noteEl ? (noteEl.value.trim()||null) : null,
      p_address: APP.pkgType !== 'pickup' && (document.getElementById('pkgAddress') || {}).value ? document.getElementById('pkgAddress').value.trim() : null,
      p_takeaway_type: APP.pkgType || 'delivery',
      p_pickup_min: APP.pkgPickupMin ? String(APP.pkgPickupMin) : null,
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
  APP._prevOrderIds = (APP.liveOrders || []).map(o => o.order_id);
  const [liveRes, cfgRes] = await Promise.all([
    sb.rpc('get_live_orders', { p_token: session.session_token }),
    sb.rpc('get_restaurant_config', { p_token: session.session_token })
  ]);
  APP.liveOrders = liveRes.data || [];
  if(cfgRes.data) APP.config = cfgRes.data;
  if(typeof attachAllowanceAfterSend === 'function') await attachAllowanceAfterSend(tableId, new Set(APP._prevOrderIds || []));
  if(kind === 'table' && APP.guestSel && APP.guestSel[tableId]){
    const o = liveOrderForTable(tableId);
    if(o && o.guest_count !== APP.guestSel[tableId]) await saveOrderGuests(o.order_id, APP.guestSel[tableId]);
  }
  // Sipariş veren cihazda yazıcı varsa fiş hemen basılır (Mutfak Ekranı açık olmasa da).
  // Basılan ürünler işaretlenir; aynı cihazda mutfak ekranı açıksa ikinci kez basmaz.
  if(printOnOrderEnabled() && deviceHasSilentPrinter()){
    APP.locallyPrintedItemIds = APP.locallyPrintedItemIds || new Set();
    APP.liveOrders.forEach(o => {
      const fresh = (o.items || []).filter(i => !prevItemIds.has(i.id) && i.status==='pending' && !APP.locallyPrintedItemIds.has(i.id));
      if(!fresh.length) return;
      fresh.forEach(i => APP.locallyPrintedItemIds.add(i.id));
      printKitchenTicketGrouped(orderDisplayName(o), fresh, true, o.daily_number, pkgInfoFromOrder(o), o.tags || [])
        .catch(e => { console.error('Fiş yazdırma hatası:', e); showToast('⚠️ Fiş yazdırılırken beklenmeyen bir hata oluştu'); });
    });
  }
  await closeTableModal();
  if(isPkg && APP.view==='packages') renderPackagesView(document.getElementById('main'), session);
  if(isWl && APP.view==='reservations') renderWaitlistContent(session, true);
  if(isRs && APP.view==='reservations' && typeof renderReservationsContent === 'function') renderReservationsContent(session, true);
}
async function openReservationOrderModal(rsId){
  const session = getSession();
  const [liveRes, cfgRes] = await withLoadingOverlay(Promise.all([
    sb.rpc('get_live_orders', { p_token: session.session_token }),
    APP.config ? Promise.resolve({ data: null }) : sb.rpc('get_restaurant_config', { p_token: session.session_token })
  ]));
  if(liveRes.error){ alert(liveRes.error.message); return; }
  APP.liveOrders = liveRes.data || [];
  if(cfgRes.data) APP.config = cfgRes.data;
  openPackageModal('rs_' + rsId);
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

/* Paket servis türü: 🛵 Paket (teslimat, adres) veya 🥡 Gel-Al (müşteri gelip alır,
   yaklaşık hazır olma / teslim alma süresi). */
const PKG_PICKUP_MINS = [10, 15, 20, 30, 45, 60];
/* Adrese teslimde yol süresi: haritadan hesaplanan (orders.travel_min), yoksa işletmenin varsayılanı (Ayarlar → Konum & Teslimat).
   Mutfağın hedefi teslim saatinden bu kadar önce = yola çıkış (sunucu bildirimleriyle aynı). */
/* Haritadan gelen süre etiketi: sürüş + işletmenin hazırlık/teslim payı ayrı gösterilir, son hesap saatiyle. */
function pkgTravelLabel(o){
  if(!o || o.travel_src !== 'google' || !o.travel_min) return '';
  const buf = Number(APP.config && APP.config.geo && APP.config.geo.travel_buffer_min) || 0, tot = Number(o.travel_min), drive = Math.max(1, tot - buf);
  const at = o.travel_checked_at ? ' · 🕒 ' + new Date(o.travel_checked_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : '';
  return '🗺️ ' + drive + ' dk yol' + (buf ? ' + ' + buf + ' dk pay' : '') + at;
}
function pkgTravelMin(o){ return Number(o && o.travel_min) || Number(APP.config && APP.config.geo && APP.config.geo.travel_default_min) || 10; }
function pkgKitchenDeadline(o){
  if(!o || !o.pickup_at) return null;
  return new Date(o.pickup_at).getTime() - (pkgTypeOf(o) !== 'pickup' ? pkgTravelMin(o) * 60000 : 0);
}
function pkgTypeOf(o){ return (o && o.takeaway_type) || (o && o.order_id ? (o.delivery_address ? 'delivery' : (o.pickup_at ? 'pickup' : 'delivery')) : (APP.pkgType || 'delivery')); }
function pkgTypeHtml(existing){
  APP.pkgType = pkgTypeOf(existing);
  const leftMin = existing && existing.pickup_at ? Math.max(0, Math.round((new Date(existing.pickup_at) - Date.now()) / 60000)) : null;
  APP.pkgHasExisting = !!existing;
  APP.pkgPickupMin = existing ? null : (APP.pkgPickupMin || (APP.pkgType === 'pickup' ? 15 : 30));
  const chip = (m) => `<button type="button" class="pk-chip ${APP.pkgPickupMin===m?'on':''}" data-min="${m}" ${act('setPkgPickupMin', m)}>${m} dk</button>`;
  return `<div class="field-group"><label>Sipariş Türü</label>
      <div class="pk-type">
        <button type="button" class="pk-type-btn ${APP.pkgType!=='pickup'?'on':''}" data-pt="delivery" ${act('setPkgType','delivery')}>🛵 Paket<small>Adrese teslim</small></button>
        <button type="button" class="pk-type-btn ${APP.pkgType==='pickup'?'on':''}" data-pt="pickup" ${act('setPkgType','pickup')}>🥡 Gel-Al<small>Müşteri gelip alır</small></button>
      </div></div>
    <div class="field-group" id="pkgPickupWrap"><label id="pkgPickupLbl">${APP.pkgType==='pickup' ? 'Yaklaşık Teslim Alma Süresi' : 'Yaklaşık Teslim Süresi'}${leftMin!=null ? ` <span class="u-fw4 muted">(şu an: ${existing.pickup_at ? new Date(existing.pickup_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : ''}, ${leftMin} dk kaldı)</span>` : ''}</label>
      <div class="pk-chips"><button type="button" class="pk-chip ${APP.pkgPickupMin==='now'?'on':''}" data-min="now" ${act('setPkgPickupMin', 'now')}>⚡ Hemen</button>${PKG_PICKUP_MINS.map(chip).join('')}
        <input type="number" min="1" max="600" inputmode="numeric" class="pk-chip-in" placeholder="Diğer" value="${APP.pkgPickupMin && APP.pkgPickupMin !== 'now' && !PKG_PICKUP_MINS.includes(APP.pkgPickupMin) ? APP.pkgPickupMin : ''}" ${actOn('input','setPkgPickupMin',['$value'])}>
        <label class="pk-time-in" title="Müşterinin geleceği saat">🕒 Saat <input type="time" id="pkgPickupTime" ${actOn('change','setPkgPickupTime',['$value'])}></label>
      </div>
      <small class="muted" id="pkgPickupHint">${pkgPickupHint()}</small></div>`;
}
function pkgPickupHint(){
  if(!APP.pkgPickupMin) return 'Süre seçmezseniz mevcut süre korunur.';
  if(APP.pkgPickupMin === 'now') return APP.pkgType === 'pickup' ? 'Hazırlanır hazırlanmaz teslim edilecek.' : 'Hazırlanır hazırlanmaz yola çıkacak' + '.';
  const hm = new Date(Date.now() + APP.pkgPickupMin * 60000).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
  return APP.pkgType === 'pickup' ? 'Müşteri yaklaşık ' + hm + ' civarı gelip alacak.' : 'Sipariş yaklaşık ' + hm + ' civarı adrese teslim edilecek.';
}
function setPkgType(t){
  APP.pkgType = t;
  document.querySelectorAll('.pk-type-btn').forEach(b => b.classList.toggle('on', b.dataset.pt === t));
  const a = document.getElementById('pkgAddrWrap'), p = document.getElementById('pkgPickupWrap');
  if(a) a.style.display = t === 'pickup' ? 'none' : '';
  const l = document.getElementById('pkgPickupLbl'); if(l) l.firstChild.textContent = t === 'pickup' ? 'Yaklaşık Teslim Alma Süresi' : 'Yaklaşık Teslim Süresi';
  const h = document.getElementById('pkgPickupHint'); if(h) h.textContent = pkgPickupHint();
  if(!APP.pkgPickupMin && !APP.pkgHasExisting) setPkgPickupMin(t === 'pickup' ? 15 : 30);
}
// Müşterinin söylediği saat (ör. 19:30) dakikaya çevrilir; geçmiş bir saat girilirse uyarılır.
function setPkgPickupTime(v){
  const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); if(!m) return;
  const t = new Date(); t.setHours(+m[1], +m[2], 0, 0);
  if(t - Date.now() < -60000 && t.getHours() < 6) t.setDate(t.getDate() + 1); // gece yarısını geçen saat ertesi güne aittir
  const mins = Math.round((t - Date.now()) / 60000);
  if(mins < 1){ alert('Geçmiş bir saat seçtiniz. Müşterinin geleceği ileri bir saati girin.'); return; }
  if(mins > 600){ alert('En fazla 10 saat sonrası seçilebilir.'); return; }
  setPkgPickupMin(mins);
  const other = document.querySelector('.pk-chip-in'); if(other && !PKG_PICKUP_MINS.includes(mins)) other.value = mins;
}
function setPkgPickupMin(m){
  const n = parseInt(m, 10); APP.pkgPickupMin = m === 'now' ? 'now' : (n > 0 ? Math.min(n, 600) : null);
  document.querySelectorAll('.pk-chip[data-min]').forEach(b => b.classList.toggle('on', b.dataset.min === String(APP.pkgPickupMin)));
  if(m === 'now'){ const o = document.querySelector('.pk-chip-in'); if(o) o.value = ''; }
  const h = document.getElementById('pkgPickupHint'); if(h) h.textContent = pkgPickupHint();
}

/* ---- Sipariş ekranı kısayolları: sık satılanlar, hızlı not çipleri, son siparişi tekrarla ---- */
const QUICK_NOTES_DEFAULT = ['Az pişmiş', 'Çok pişmiş', 'Acısız', 'Acılı', 'Soğansız', 'Sossuz'];
function loadOrderQuickPicks(tableId){
  if(APP.quickPicks && Date.now() - APP.quickPicks.at < 30 * 60000) return;
  if(APP.quickPicksLoading) return; APP.quickPicksLoading = true;
  sb.rpc('get_order_quickpicks', { p_token: getSession().session_token }).then(({ data }) => {
    APP.quickPicksLoading = false;
    APP.quickPicks = { at: Date.now(), top: (data && data.top) || [], notes: (data && data.notes) || [] };
    if(document.getElementById('prodPick') && !document.getElementById('ppQuick')) renderProductPick(null, tableId);
  }).catch(() => { APP.quickPicksLoading = false; });
}
function quickTopHtml(tableId){
  const top = ((APP.quickPicks && APP.quickPicks.top) || []).map(id => (APP.config.products || []).find(p => p.id === id))
    .filter(p => p && p.available !== false && !(effectiveStock(p) != null && effectiveStock(p) <= 0));
  if(!top.length) return '';
  return `<div class="pp-quick" id="ppQuick"><span class="pp-quick-h">⭐ Sık satılanlar</span>${top.map(p => `<button type="button" class="pp-quick-b" ${act('addToDraft', tableId, p.id)}>${escapeHtml(p.name)}<small>${money(p.price)}</small></button>`).join('')}</div>`;
}
function quickNoteList(){
  const extra = ((APP.quickPicks && APP.quickPicks.notes) || []).filter(n => !QUICK_NOTES_DEFAULT.some(d => d.toLocaleLowerCase('tr') === String(n).toLocaleLowerCase('tr')));
  return [...QUICK_NOTES_DEFAULT, ...extra].slice(0, 9);
}
const noteParts = (note) => String(note || '').split(',').map(x => x.trim()).filter(Boolean);
const noteHas = (note, n) => noteParts(note).some(x => x.toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr'));
function toggleDraftNoteChip(tableId, idx, n){
  const it = (APP.draftCart[tableId] || [])[idx]; if(!it) return;
  const parts = noteParts(it.note);
  const i = parts.findIndex(x => x.toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr'));
  if(i >= 0) parts.splice(i, 1); else parts.push(n);
  it.note = parts.join(', ');
  renderTableItems(tableId);
}
// Masanın en son gönderilen turunu (son 2 dk içinde eklenen ürünler) sepete aynı adet ve notla ekler.
function repeatLastRound(tableId){
  const order = liveOrderForTable(tableId); if(!order) return;
  const items = order.items.filter(i => i.status !== 'cancelled' && i.added_at && i.product_id);
  if(!items.length){ showToast('Tekrarlanacak ürün yok'); return; }
  const last = Math.max(...items.map(i => new Date(i.added_at).getTime()));
  const round = items.filter(i => last - new Date(i.added_at).getTime() <= 120000);
  let n = 0;
  round.forEach(it => {
    for(let k = 0; k < (Number(it.qty) || 1); k++){ addToDraft(tableId, it.product_id); n++; }
    const d = (APP.draftCart[tableId] || []).find(x => x.product_id === it.product_id);
    if(d && it.note && !d.note) d.note = it.note;
  });
  renderTableItems(tableId);
  if(n) showToast('🔁 ' + n + ' ürün sepete eklendi — kontrol edip gönderin');
}

/* Menü (kategori) simgesi: adından tahmin edilir, bulunamazsa baş harfi. */
const CAT_ICONS = [[/içecek|icecek|meşrubat|soğuk/i,'🥤'],[/tatlı|tatli|baklava|dessert/i,'🍰'],[/kahve|coffee|espresso/i,'☕'],[/çay|cay/i,'🍵'],[/ızgara|izgara|kebap|kebab|mangal/i,'🔥'],[/döner|doner|dürüm/i,'🥙'],[/çorba|corba/i,'🍲'],[/pide|lahmacun|fırın|firin/i,'🫓'],[/pizza/i,'🍕'],[/burger|hamburger/i,'🍔'],[/salata/i,'🥗'],[/kahvaltı|kahvalti/i,'🍳'],[/balık|balik|deniz/i,'🐟'],[/tavuk|piliç/i,'🍗'],[/makarna|pasta/i,'🍝'],[/meze|ara sıcak|başlangıç/i,'🥟'],[/alkol|bira|şarap|rakı/i,'🍺'],[/çocuk/i,'🧒']];
function catIcon(name){ const m = CAT_ICONS.find(([r]) => r.test(String(name))); return m ? m[1] : `<b>${escapeHtml(String(name).trim().charAt(0).toLocaleUpperCase('tr') || '•')}</b>`; }
/* Mobil: sipariş penceresinin altında sepet özeti; dokununca sepet tam ekran açılır. */
function omMobileBarHtml(tableId){
  return `<button type="button" class="om-mbar" id="omMbar" ${act('toggleOmCart')}><span class="om-mbar-n" id="omMbarN">0</span><span id="omMbarT">Sepet boş</span><b id="omMbarGo">Sepeti Gör ›</b></button>`;
}
function toggleOmCart(force){
  const m = document.querySelector('#tableModalBg .order-modal'); if(!m) return;
  const on = typeof force === 'boolean' ? force : !m.classList.contains('om-show-cart');
  m.classList.toggle('om-show-cart', on);
  const g = document.getElementById('omMbarGo'); if(g) g.textContent = on ? '‹ Ürünlere Dön' : 'Sepeti Gör ›';
  const sc = m.querySelector(on ? '.order-modal-cart' : '.order-modal-menu'); if(sc) sc.scrollTop = 0;
}
function updateOmMobileBar(tableId){
  const draft = (APP.draftCart && APP.draftCart[tableId]) || [];
  const n = draft.reduce((a, i) => a + (Number(i.qty) || 0), 0), t = draft.reduce((a, i) => a + i.price * i.qty, 0);
  const order = liveOrderForTable(tableId), sent = order ? order.items.length : 0;
  const nEl = document.getElementById('omMbarN'), tEl = document.getElementById('omMbarT'), bar = document.getElementById('omMbar');
  if(!bar) return;
  nEl.textContent = n; bar.classList.toggle('has', n > 0);
  tEl.textContent = n ? 'Yeni: ' + money(t) : (sent ? sent + ' ürün mutfakta' : 'Sepet boş');
  const head = document.querySelector('#tableModalBg .om-cart-total');
  if(head) head.textContent = n ? n + ' ürün · ' + money(t) : '';
  // Onay butonunda yeni ürünlerin tutarı; başlığın altında masanın durumu.
  const cb = document.getElementById('confirmBtn');
  if(cb && !cb.dataset.busy) cb.innerHTML = n ? `✅ Onayla ve Gönder <span class="om-cb-sum">${money(t)}</span>` : '✅ Onayla ve Gönder';
  const h2 = document.querySelector('#tableModalBg .order-modal h2');
  if(h2){
    let sub = document.getElementById('omSub');
    if(!sub){ sub = document.createElement('div'); sub.id = 'omSub'; sub.className = 'om-sub'; h2.after(sub); }
    const mins = order && order.created_at ? Math.max(0, Math.round((Date.now() - new Date(order.created_at)) / 60000)) : null;
    const due = order ? order.items.filter(i => !i.paid).reduce((a, i) => a + i.price * i.qty, 0) : 0;
    sub.innerHTML = order
      ? `<span>🕒 ${mins} dk önce açıldı</span>${order.created_by_name ? `<span>👤 ${escapeHtml(order.created_by_name)}</span>` : ''}<span>🍳 ${sent} ürün mutfakta</span><span>💰 ${money(due)}</span>${(order.tags || []).map(x => `<span class="om-sub-tag">🏷️ ${escapeHtml(x)}</span>`).join('')}`
      : '<span>✨ Yeni sipariş</span>';
  }
}

function toggleDraftNote(tableId, idx){ APP.noteOpen = APP.noteOpen || {}; const k = tableId + ':' + idx; APP.noteOpen[k] = !APP.noteOpen[k]; renderTableItems(tableId); if(APP.noteOpen[k]) setTimeout(() => { const i = document.querySelector('.dc-note-edit input'); if(i) i.focus(); }, 30); }

/* ---- Kurye takibi ----
   Teslimat siparişi kuryeye verilir (isteğe bağlı müşteriye SMS ile takip linki), teslim edilince işaretlenir.
   Müşteri /takip/?t=TOKEN sayfasından durumu görür. Ödeme her zamanki gibi Ödemeler'den alınır. */
function openCourierSheet(orderId){
  const o = (APP.liveOrders||[]).find(x => x.order_id === orderId); if(!o) return;
  const users = ((APP.config && APP.config.users) || []).filter(u => u.is_active !== false).sort((a, b) => String(a.username).localeCompare(String(b.username), 'tr'));
  APP.courierPick = { orderId, courier: (APP.lastCourier && users.some(u => u.id === APP.lastCourier)) ? APP.lastCourier : null };
  document.getElementById('courierBody').innerHTML = `
    <div class="cr-sum"><b>${escapeHtml(o.customer_name || ('Paket #' + (o.daily_number||'')))}</b>${o.delivery_address ? `<small>📍 ${escapeHtml(o.delivery_address)}${pkgTravelLabel(o) ? ' · ' + pkgTravelLabel(o) : ''}</small>` : ''}</div>
    <div class="u-mt12 rvf-t">🧑 Kurye</div>
    <div class="rvf-chips" id="crChips">${users.map(u => `<button type="button" class="rvf-chip ${APP.courierPick.courier===u.id?'on':''}" data-uid="${u.id}" ${act('pickCourier', u.id)}>${escapeHtml(u.username)}</button>`).join('') || '<p class="muted">Kullanıcı yok</p>'}</div>
    ${o.customer_phone ? `<label class="cr-sms"><input type="checkbox" id="crSms" checked> 📨 Müşteriye bildir: “Siparişiniz yola çıktı” + kurye, varış süresi ve takip linki — SMS (açıksa) ve e-posta (müşterinin kayıtlı e-postası varsa)</label>` : '<p class="muted" style="font-size:12px;text-align:left;">Siparişte telefon olmadığı için SMS gönderilemez; takip linkini kopyalayıp iletebilirsiniz.</p>'}
    <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','courierSheet')}>Vazgeç</button><button ${act('confirmDispatch')}>🛵 Yola Çıkar</button></div>`;
  openSheet('courierSheet');
}
function pickCourier(uid){ APP.courierPick.courier = uid; document.querySelectorAll('#crChips .rvf-chip').forEach(b => b.classList.toggle('on', b.dataset.uid === uid)); }
async function confirmDispatch(){
  const pk = APP.courierPick; if(!pk) return;
  if(!pk.courier){ alert('Kurye seçin'); return; }
  const sms = !!(document.getElementById('crSms') && document.getElementById('crSms').checked);
  const session = getSession();
  let { data, error } = await sb.rpc('dispatch_order', { p_token: session.session_token, p_order_id: pk.orderId, p_courier: pk.courier, p_send_sms: sms });
  if(error && sms){
    // SMS gönderilemese de (kapalı/kredi yok) sipariş yola çıkarılsın; personele bildirilir.
    const msg = error.message;
    ({ data, error } = await sb.rpc('dispatch_order', { p_token: session.session_token, p_order_id: pk.orderId, p_courier: pk.courier, p_send_sms: false }));
    if(!error) alert('Sipariş yola çıkarıldı ama SMS gönderilemedi: ' + msg);
  }
  if(error){ alert(error.message); return; }
  APP.lastCourier = pk.courier;
  closeSheet('courierSheet');
  const url = window.location.origin + '/takip/?t=' + data.tracking_token;
  // Kurye bu cihazı kullanan kişiyse konum paylaşımı için kurye sayfası açılır.
  if(data.courier_token && pk.courier === session.user_id && confirm('Konumunuzu paylaşmak için kurye sayfası açılsın mı? Müşteri varış süresini ve yerinizi görür.')){ window.location.href = '/kurye/?t=' + data.courier_token; return; }
  const via = [data.sms_sent && 'SMS', data.mail_sent && 'e-posta'].filter(Boolean).join(' ve ');
  if(via) showToast('🛵 Yola çıktı · müşteriye ' + via + ' ile takip linki gönderildi ✓');
  else { copyText(url, sms ? '🛵 Yola çıktı · müşteriye SMS/e-posta gönderilemedi (SMS kapalı, e-posta kayıtlı değil) — takip linki kopyalandı' : '🛵 Yola çıktı · takip linki kopyalandı'); }
  await refreshPackagesLive();
}
async function markDelivered(orderId, undo){
  const { error } = await sb.rpc('mark_order_delivered', { p_token: getSession().session_token, p_order_id: orderId, p_undo: !!undo });
  if(error){ alert(error.message); return; }
  showToast(undo ? 'Teslim işareti geri alındı' : '✅ Teslim edildi — ödemeyi Ödemeler\'den alabilirsiniz');
  await refreshPackagesLive();
}
async function refreshPackagesLive(){
  const { data } = await sb.rpc('get_live_orders', { p_token: getSession().session_token });
  if(data) APP.liveOrders = data;
  renderPackageGrid();
}

/* ---- Canlı kurye takibi ----
   Kurye /kurye/?t=… sayfasında konumunu paylaşır (uygulamada ekran kilitliyken de); müşteri takip linkinde
   kalan süreyi ve kuryeyi haritada görür. Restoran "🗺️ Kuryeler" panelinden yoldaki tüm kuryeleri izler. */
function courierLiveBadge(o){
  if(!o.courier_at) return '';
  const age = (Date.now() - new Date(o.courier_at)) / 60000;
  if(age > 3) return `<span class="pk-badge late" title="Kuryenin konumu ${Math.round(age)} dk önce alındı">📵 konum yok</span>`;
  if(o.courier_eta_min != null && o.courier_eta_at){
    const left = Math.max(1, Math.round((new Date(o.courier_eta_at).getTime() + o.courier_eta_min * 60000 - Date.now()) / 60000));
    return `<span class="pk-badge ok" title="Kuryenin anlık konumundan, trafik dahil">📍 ${left} dk kaldı</span>`;
  }
  return '<span class="pk-badge ok">📍 canlı</span>';
}
async function openCourierLink(orderId){
  const o = (APP.liveOrders||[]).find(x => x.order_id === orderId); if(!o) return;
  const session = getSession();
  const { data, error } = await sb.rpc('get_courier_link', { p_token: session.session_token, p_order_id: orderId });
  if(error){ alert(error.message); return; }
  const url = window.location.origin + '/kurye/?t=' + data;
  if(o.courier_user_id === session.user_id){ window.location.href = url; return; }
  if(!document.getElementById('crLinkSheet')) document.body.insertAdjacentHTML('beforeend', sheetHtml('crLinkSheet', '📍', 'Kurye konum linki', '<div id="crLinkBody"></div>', 'var(--c1)'));
  APP.crLink = url;
  document.getElementById('crLinkBody').innerHTML = `<p class="muted" style="text-align:left;margin:0 0 10px;">Kurye bu linki telefonunda açıp <b>📍 Konumumu paylaş</b> der. Müşteri takip sayfasında varış süresini ve kuryeyi haritada görür; siz de 🗺️ Kuryeler panelinden izlersiniz.${o.courier_name ? ' Kurye: <b>' + escapeHtml(o.courier_name) + '</b>' : ''}</p>
    <input readonly value="${escapeAttr(url)}" style="width:100%;font-family:monospace;font-size:12px;">
    <button type="button" class="ghost-btn" style="width:100%;margin-top:10px;" ${act('resendCourierNotify', orderId)}>🔁 Kuryeye onayı tekrar gönder</button>
    <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('copyCourierLink')}>📋 Kopyala</button><button ${act('shareCourierLink')}>📤 Paylaş</button></div>`;
  openSheet('crLinkSheet');
}
function copyCourierLink(){ copyText(APP.crLink, 'Kurye linki kopyalandı'); }
async function shareCourierLink(){
  if(navigator.share){ try{ await navigator.share({ title: 'Teslimat', text: 'Teslimat konum linki', url: APP.crLink }); return; }catch(e){ if(e && e.name === 'AbortError') return; } }
  window.open('https://wa.me/?text=' + encodeURIComponent('Teslimat linki: ' + APP.crLink), '_blank', 'noopener');
}
async function openCourierMap(){
  if(!document.getElementById('crMapSheet')) document.body.insertAdjacentHTML('beforeend', sheetHtml('crMapSheet', '🗺️', 'Yoldaki kuryeler', '<div id="crMap" class="cr-map"></div><div id="crMapList" class="cr-map-list"></div>', 'var(--c1)'));
  openSheet('crMapSheet');
  if(!APP.crMap && window.LiveMap) APP.crMap = LiveMap.create(document.getElementById('crMap'));
  await refreshCourierMap();
  clearInterval(APP.crMapTimer);
  APP.crMapTimer = setInterval(() => { const sh = document.getElementById('crMapSheet'); if(!sh || !sh.classList.contains('open')){ clearInterval(APP.crMapTimer); return; } refreshCourierMap(); }, 15000);
}
async function refreshCourierMap(){
  const { data, error } = await sb.rpc('get_courier_positions', { p_token: getSession().session_token });
  const list = document.getElementById('crMapList'); if(!list) return;
  if(error){ list.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`; return; }
  const rows = (data && data.list) || [], rest = (data && data.rest) || {};
  const fresh = (r) => r.at && Date.now() - new Date(r.at) < 180000;
  const pts = [{ kind: 'rest', id: 'r', lat: rest.lat, lng: rest.lng }];
  rows.forEach(r => {
    if(fresh(r)) pts.push({ kind: 'courier', id: r.id, lat: r.lat, lng: r.lng, label: (r.courier || 'Kurye') + (r.eta_min != null ? ' · ' + r.eta_min + ' dk' : '') });
    pts.push({ kind: 'dest', id: r.id, lat: r.dest_lat, lng: r.dest_lng, label: r.customer });
  });
  if(APP.crMap){ APP.crMap.set(pts); setTimeout(() => APP.crMap && APP.crMap.map.invalidateSize(), 80); }
  list.innerHTML = rows.length ? rows.map(r => {
    const left = r.eta_min != null && r.eta_at ? Math.max(1, Math.round((new Date(r.eta_at).getTime() + r.eta_min * 60000 - Date.now()) / 60000)) : null;
    const st = !r.at ? '<span class="pk-badge">📍 paylaşım başlamadı</span>' : fresh(r) ? `<span class="pk-badge ok">📍 ${left != null ? left + ' dk kaldı · varış ' + new Date(Date.now() + left * 60000).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : 'canlı'}</span>` : `<span class="pk-badge late">📵 ${Math.round((Date.now() - new Date(r.at)) / 60000)} dk önce</span>`;
    return `<div class="cr-ml-row"><div><b>🛵 ${escapeHtml(r.courier || 'Kurye')} → ${escapeHtml(r.customer)}</b><small>${escapeHtml(r.address || '')}</small></div><div class="cr-ml-r">${st}${r.at ? `<small>son konum ${new Date(r.at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}</small>` : ''}<button type="button" class="cr-btn ghost" ${act('openCourierLink', r.id)}>🔗 Link</button></div></div>`;
  }).join('') : '<p class="muted">Yolda kurye yok.</p>';
}

async function resendCourierNotify(orderId){
  const { error } = await sb.rpc('resend_courier_notify', { p_token: getSession().session_token, p_order_id: orderId });
  if(error){ alert(error.message); return; }
  showToast('🔁 Onay kuryenin ekranına tekrar gönderildi');
  await refreshPackagesLive();
}

// Kurye onayı: "Siparişi aldım" dendi mi? Denmediyse onayı tekrar gönderme düğmesi.
function courierAcceptBadge(o){
  if(!o.courier_user_id || o.delivered_at) return '';
  if(o.courier_accepted_at) return `<span class="pk-badge ok" title="Kurye siparişi aldığını onayladı">✅ aldı ${new Date(o.courier_accepted_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}</span>`;
  const m = Math.max(0, Math.round((Date.now() - new Date(o.courier_offer_at || o.dispatched_at)) / 60000));
  return `<span class="pk-badge ${m >= 3 ? 'late' : 'warn'}" title="Kuryenin ekranına onay gönderildi, henüz 'Siparişi aldım' denmedi">⏳ onay bekleniyor${m ? ' · ' + m + ' dk' : ''}</span><button type="button" class="cr-btn ghost" title="Onayı kuryenin ekranına tekrar gönder" ${actStop('resendCourierNotify', o.order_id)}>🔁</button>`;
}
