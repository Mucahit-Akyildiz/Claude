/* ---- 📦 Stok & Reçete (taslak) ----
   Tek zincir: Mal Kabul → 🏬 Depo → 🥙 Günlük Hazırlık → 🍽️ Ürünler (reçete).
   Bu ekran yalnızca gösterir ve mevcut düzenleme pencerelerine yönlendirir; veri yapısı değişmez. */
function shIngs(){ return (APP.config && APP.config.ingredients) || []; }
function shProds(){ return ((APP.config && APP.config.products) || []).filter(p => !p.parent_id); }
function shQty(q, i){ return typeof fmtIngQty === 'function' ? fmtIngQty(Number(q) || 0, i) : (Number(q) || 0) + ' ' + (i.unit || ''); }
function shState(i){
  if(i.prep_source_id) return Number(i.stock) > 0 ? ['ok', 'Tezgâhta var'] : ['warn', 'Hazırlanmadı'];
  if(Number(i.stock) <= 0) return ['bad', 'Bitti'];
  if(Number(i.min_stock) > 0 && Number(i.stock) <= Number(i.min_stock)) return ['warn', 'Azaldı'];
  return ['ok', 'Yeterli'];
}
function shUsedIn(id){ return shProds().filter(p => (p.recipe || []).some(r => r.ingredient_id === id) || (p.packaging || []).some(r => r.ingredient_id === id)); }
function shPill(i){ const [c, l] = shState(i); return `<span class="sh-pill ${c}">${l}</span>`; }

function renderStockHub(el){
  const tab = APP.shTab || 'depot', ings = shIngs();
  const depot = ings.filter(i => !i.prep_source_id), prep = ings.filter(i => i.prep_source_id);
  const q = String(APP.shQ || '').trim().toLocaleLowerCase('tr'), match = (n) => !q || String(n || '').toLocaleLowerCase('tr').includes(q);
  let body = '';
  if(tab === 'depot' && APP.shBulk){
    body = '<div id="shBulkBox"></div>';
  } else if(tab === 'depot'){
    const list = depot.filter(i => match(i.name)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
    body = `<p class="muted ux-hint">Satın alınıp depoda duran malzemeler. Stok Mal Kabul'den girer; satış ya da günlük hazırlık depodan düşer. Satıra dokunup zinciri görün ve düzenleyin.</p>` + (list.length ? `<div class="sh-list">${list.map(i => { const preps = prep.filter(x => x.prep_source_id === i.id), used = shUsedIn(i.id).length + preps.reduce((n, x) => n + shUsedIn(x.id).length, 0);
      return `<button type="button" class="sh-row" ${act('openStockChain', i.id)}>
        <span class="sh-ic">🏬</span><span class="sh-name"><b>${escapeHtml(i.name)}</b><small>${preps.length ? '🥙 ' + preps.length + ' hazırlık · ' : ''}🍽️ ${used} üründe</small></span>
        <span class="sh-qty">${escapeHtml(shQty(i.stock, i))}</span>${shPill(i)}<span class="sh-go">›</span></button>`; }).join('')}</div>`
      : '<div class="empty-state"><p class="muted">Depo hammaddesi yok.</p></div>');
  } else if(tab === 'prep'){
    const list = prep.filter(i => match(i.name));
    body = `<div class="ux-bar" style="margin:0 0 8px;"><button type="button" class="fsheet-open" ${act('openPrepHub', true)}>📋 Bugünün hazırlığı</button></div><p class="muted ux-hint">Her gün depodan alınıp hazırlanan kalemler. Mutfakta <b>➕ Hazırla</b> ile tezgâha eklenir, depodan otomatik düşer; satışlar tezgâhtan düşer.</p>` + (list.length ? `<div class="sh-list">${list.map(i => { const src = ings.find(x => x.id === i.prep_source_id);
      return `<button type="button" class="sh-row" ${act('openStockChain', i.id)}>
        <span class="sh-ic">🥙</span><span class="sh-name"><b>${escapeHtml(i.name)}</b><small>🏬 ${escapeHtml(src ? src.name : '—')}'dan · günlük ${escapeHtml(i.prep_default ? shQty(i.prep_default, i) : 'miktar yok')}</small></span>
        <span class="sh-qty">${escapeHtml(shQty(i.stock, i))}</span>${shPill(i)}<span class="sh-go">›</span></button>`; }).join('')}</div>`
      : '<div class="empty-state"><p class="muted">Günlük hazırlık kalemi yok. Bir depo hammaddesine tıklayıp "Günlük hazırlık oluştur" ile ekleyebilirsiniz.</p></div>');
  } else {
    const list = shProds().filter(p => match(p.name)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
    body = `<p class="muted ux-hint">Reçete yalnızca buradan, ürünün içinden düzenlenir. Ürün satılınca reçetedeki miktarlar stoktan düşer.</p><div class="sh-list">${list.map(p => { const rc = p.recipe || [];
      return `<button type="button" class="sh-row" ${act('openShProduct', p.id)}>
        <span class="sh-ic">🍽️</span><span class="sh-name"><b>${escapeHtml(p.name)}</b><small>${rc.length ? rc.map(r => escapeHtml(r.ingredient_name || '') + ' ' + escapeHtml(recipeQtyLabel(r))).join(' · ') : '<span class="u-red">Reçete yok — stok ve maliyet düşmez</span>'}</small></span>
        <span class="sh-qty">${Number(p.cost) > 0 ? money(p.cost) : '—'}</span><span class="sh-pill ${rc.length ? 'ok' : 'warn'}">${rc.length ? rc.length + ' kalem' : 'Reçetesiz'}</span><span class="sh-go">›</span></button>`; }).join('')}</div>`;
  }
  el.innerHTML = `<div class="u-mwn box ux-prod sh-hub">
    <div class="sh-draft">🧪 Yeni ekran (deneme) — satıra dokunun: zinciri görün ve aynı pencereden düzenleyin.</div>
    <div class="ux-bar"><h2 class="u-m0">📦 Stok & Reçete</h2>
      <input class="list-search" placeholder="🔍 Ara…" value="${escapeAttr(APP.shQ || '')}" ${actOn('input', 'shSearch', ['$value'])}>
      <button type="button" class="fsheet-open" ${act('shNew')}>+ Yeni</button>
      ${tab === 'depot' ? `<div class="seg">${[['0','☰ Liste'],['1','✏️ Toplu düzenle / Excel']].map(([k, l]) => `<button type="button" class="${(APP.shBulk ? '1' : '0') === k ? 'on' : ''}" ${act('setShBulk', k)}>${l}</button>`).join('')}</div>` : ''}</div>
    <div class="sh-flow"><span class="${tab==='depot'?'on':''}" role="button" ${act('setShTab','depot')}>🏬 Depo <em>${depot.length}</em></span><i>→</i>
      <span class="${tab==='prep'?'on':''}" role="button" ${act('setShTab','prep')}>🥙 Günlük Hazırlık <em>${prep.length}</em></span><i>→</i>
      <span class="${tab==='recipes'?'on':''}" role="button" ${act('setShTab','recipes')}>🍽️ Ürünler & Reçeteler <em>${shProds().length}</em></span></div>
    <div id="shBody">${body}</div></div>`;
  const bb = document.getElementById('shBulkBox'); if(bb) renderIngredientsSettings(bb, getSession());
}
function setShBulk(k){ APP.shBulk = k === '1'; renderSettingsContent(getSession()); }
function setShTab(t){ APP.shTab = t; renderSettingsContent(getSession()); }
function shSearch(v){ APP.shQ = v; const el = document.getElementById('settingsContent'); renderStockHub(el); const inp = el.querySelector('.sh-hub .list-search'); if(inp){ inp.focus(); inp.setSelectionRange(v.length, v.length); } }
function shNew(){
  if((APP.shTab || 'depot') === 'recipes'){ APP.settingsTab = 'products'; APP.productsSubTab = 'products'; renderSettingsView(document.getElementById('main'), getSession()).then(() => typeof openSheet === 'function' && openSheet('prodSheet')); return; }
  APP.shTab = 'depot'; APP.shBulk = true; renderSettingsContent(getSession()); if(typeof niStart === 'function') niStart('');
}

/* Hammadde zinciri: nereden geliyor, nereye gidiyor. */
function openStockChain(id){
  const ings = shIngs(), i = ings.find(x => x.id === id); if(!i) return;
  const depot = i.prep_source_id ? ings.find(x => x.id === i.prep_source_id) : i;
  const preps = depot ? ings.filter(x => x.prep_source_id === depot.id) : [];
  const prods = [...new Map([depot, ...preps].filter(Boolean).flatMap(x => shUsedIn(x.id).map(p => [p.id, { p, via: x }]))).values()];
  const node = (x, ic, sub) => `<button type="button" class="sh-node ${x.id === id ? 'on' : ''}" ${act('openStockChain', x.id)}><span>${ic}</span><b>${escapeHtml(x.name)}</b><small>${sub}</small>${shPill(x)}</button>`;
  removeEl('shChainBg');
  const bg = document.createElement('div'); bg.id = 'shChainBg'; bg.className = 'modal-bg';
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  bg.innerHTML = `<div class="box sd-box sh-chain"><div class="u-row-sb"><h2 class="u-m0">🔗 ${escapeHtml(depot ? depot.name : i.name)}</h2><span class="u-xclose" ${act('removeEl','shChainBg')}>✕</span></div>
    <p class="muted u-fs13" style="margin:4px 0 12px;">Bu malzemenin yolculuğu: alıştan satışa.</p>
    <div class="sh-steps">
      <div class="sh-step"><div class="sh-step-t">📥 Mal Kabul</div><div class="sh-node sh-static"><span>🧾</span><b>Alış</b><small>${depot && Number(depot.unit_cost) > 0 ? 'Ort. ' + money(depot.unit_cost) + ' / ' + escapeHtml(unitShort(depot.unit)) : 'Fiyat girilmemiş'}</small></div></div>
      <div class="sh-arrow">↓</div>
      <div class="sh-step"><div class="sh-step-t">🏬 Depo</div>${depot ? node(depot, '🏬', 'Stok: ' + escapeHtml(shQty(depot.stock, depot)) + (Number(depot.min_stock) > 0 ? ' · min ' + escapeHtml(shQty(depot.min_stock, depot)) : '')) : '—'}</div>
      <div class="sh-arrow">↓</div>
      <div class="sh-step"><div class="sh-step-t">🥙 Günlük hazırlık</div>${preps.length ? preps.map(x => node(x, '🥙', 'Tezgâhta: ' + escapeHtml(shQty(x.stock, x)))).join('') : '<div class="sh-node sh-static"><small>Hazırlık yok — satış doğrudan depodan düşer</small></div>'}</div>
      <div class="sh-arrow">↓</div>
      <div class="sh-step"><div class="sh-step-t">🍽️ Kullanıldığı ürünler · ${prods.length}</div><div class="sh-prods">${prods.length ? prods.map(({ p, via }) => { const r = (p.recipe || []).find(x => x.ingredient_id === via.id);
        return `<button type="button" class="sh-node" ${act('openShProduct', p.id)}><span>🍽️</span><b>${escapeHtml(p.name)}</b><small>${r ? escapeHtml(recipeQtyLabel(r)) + ' · ' : ''}${via.prep_source_id ? '🥙 hazırlıktan' : '🏬 depodan'}</small></button>`; }).join('') : '<small class="muted">Hiçbir üründe kullanılmıyor.</small>'}</div></div>
    </div>
    <details class="ux-set sh-edit" open><summary>✏️ ${escapeHtml(i.name)} — düzenle</summary><div class="ux-set-body"><div class="sh-form">
      <label>Ad<input id="she_name" maxlength="80" value="${escapeAttr(i.name)}"></label>
      <label>${i.prep_source_id ? 'Tezgâhtaki miktar' : 'Depodaki stok'} <small>(${escapeHtml(unitShort(i.unit))})</small><input id="she_stock" type="number" step="any" inputmode="decimal" value="${Number(i.stock) || 0}"></label>
      ${i.prep_source_id ? '' : `<label>Min stok <small>(uyarı seviyesi)</small><input id="she_min" type="number" step="any" min="0" inputmode="decimal" value="${Number(i.min_stock) || ''}"></label>
      <label>Birim alış fiyatı <small>(₺ / ${escapeHtml(unitShort(i.unit))})</small><input id="she_uc" type="number" step="0.01" min="0" inputmode="decimal" value="${Number(i.unit_cost) || ''}"></label>`}
      <label>Fire % <small>(temizleme kaybı)</small><input id="she_waste" type="number" step="0.1" min="0" max="99" inputmode="decimal" value="${Number(i.waste_pct) || ''}"></label>
    </div>
    <div class="sh-links"><button type="button" class="xl-btn" ${act('openIngredientUsageModal', id, true)}>🔗 Kullanıldığı ürünler / hazırlık ayarı</button>${depot ? `<button type="button" class="xl-btn" ${act('openIngCostLog', depot.id)}>📈 Fiyat geçmişi</button>` : ''}</div>
    </div></details>
    <div class="oa-edit-acts"><button type="button" class="ghost-btn" ${act('removeEl','shChainBg')}>Kapat</button><button type="button" ${act('saveShIngredient', id)}>💾 Kaydet</button></div></div>`;
  document.body.appendChild(bg);
}

async function shReload(){ await renderSettingsView(document.getElementById('main'), getSession()); }
async function saveShIngredient(id){
  const i = shIngs().find(x => x.id === id); if(!i) return;
  const v = (k) => { const e = document.getElementById(k); return e ? e.value.trim() : null; }, num = (k) => { const x = v(k); return x === null || x === '' ? null : parseFloat(x.replace(',', '.')); };
  const name = v('she_name'); if(!name){ uiAlert('Ad boş olamaz'); return; }
  const errs = [];
  await withLoadingOverlay((async () => {
    const r1 = await bulkRpc('upsert_ingredient', [{ p_id: id, p_name: name, p_unit: i.unit, p_stock: num('she_stock') ?? 0, p_waste_pct: num('she_waste') ?? 0 }]); if(r1[0].error) errs.push(r1[0].error.message);
    if(!i.prep_source_id){
      const r2 = await bulkRpc('set_ingredient_min', [{ p_id: id, p_min: num('she_min') ?? 0 }]); if(r2[0].error) errs.push(r2[0].error.message);
      if(num('she_uc') !== null && num('she_uc') !== (Number(i.unit_cost) || null)){ const r3 = await bulkRpc('set_ingredient_cost', [{ p_id: id, p_cost: num('she_uc') }]); if(r3[0].error) errs.push(r3[0].error.message); }
    }
  })());
  if(errs.length){ uiAlert(errs.join('\n')); return; }
  showToast('💾 ' + name + ' kaydedildi'); await shReload(); openStockChain(id);
}

/* Tek ürün penceresi: Bilgi · Reçete · Ekstralar. */
function openShProduct(id, tab){
  const p = shProds().find(x => x.id === id); if(!p) return;
  tab = tab || 'info';
  const rc = p.recipe || [], ings = shIngs();
  removeEl('shProdBg'); removeEl('shChainBg');
  const bg = document.createElement('div'); bg.id = 'shProdBg'; bg.className = 'modal-bg';
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  const tabs = [['info','ℹ️ Bilgi'],['recipe','🥕 Reçete'],['extras','➕ Ekstralar']];
  const info = `<div class="sh-form">
      <label class="wide">Ürün adı<input id="shp_name" maxlength="120" value="${escapeAttr(p.name)}"></label>
      <label>Satış fiyatı (₺)<input id="shp_price" type="number" step="0.01" min="0" inputmode="decimal" value="${Number(p.price) || 0}"></label>
      <label>Menü<select id="shp_menu">${prodMenuOptions(p.menu_id)}</select></label>
      ${rc.length ? `<label>Maliyet<input disabled value="${money(p.cost || 0)} · reçeteden"></label>` : `<label>Maliyet (₺) <small>(reçete yoksa elle)</small><input id="shp_cost" type="number" step="0.01" min="0" inputmode="decimal" value="${Number(p.cost) || ''}"></label>`}
      ${rc.length ? '' : `<label>Stok <small>(boş = sınırsız)</small><input id="shp_stock" type="number" step="1" min="0" inputmode="numeric" value="${p.stock != null ? p.stock : ''}"></label>`}
      <label class="sh-chk wide"><input type="checkbox" id="shp_av" ${p.available !== false ? 'checked' : ''}> Satışta</label>
    </div>
    ${Number(p.price) > 0 && Number(p.cost) > 0 ? `<p class="muted u-fs12">Marj: %${Math.round((1 - Number(p.cost) / Number(p.price)) * 100)} (KDV dahil fiyattan)</p>` : ''}
    <div class="oa-edit-acts"><button type="button" class="ghost-btn" ${act('removeEl','shProdBg')}>Kapat</button><button type="button" ${act('saveShProduct', id)}>💾 Kaydet</button></div>`;
  const recipe = `<p class="muted u-fs13" style="margin:0 0 8px;">1 porsiyon satılınca hangi malzemeden ne kadar düşsün? (🥙 hazırlık kalemleri tezgâhtan, 🏬 depo kalemleri depodan düşer)</p>
    <div id="recipeItemsBox"></div>
    <div class="sh-radd">
      <select id="recipeIngSelect" ${actOn('change','recipeUnitOpts',['recipeIngSelect','recipeUnitSel'])}>${ings.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr')).map(i => `<option value="${i.id}" data-unit="${i.unit}" data-name="${escapeAttr(i.name)}">${i.prep_source_id ? '🥙' : '🏬'} ${escapeHtml(i.name)} (${escapeHtml(unitShort(i.unit))})</option>`).join('')}</select>
      <input type="number" step="any" id="recipeQtyInput" placeholder="Miktar" inputmode="decimal">
      <select id="recipeUnitSel" class="rc-unit"></select>
      <button type="button" ${act('addRecipeItem', id)}>+ Ekle</button>
    </div>
    <div class="sh-links"><button type="button" class="xl-btn" ${act('copyRecipeDraft', id)}>📋 Kopyala</button><button type="button" class="xl-btn" id="recipePasteBtn" ${act('pasteRecipeDraft')} ${APP.recipeClip ? '' : 'disabled'}>📥 Yapıştır</button></div>
    <div class="oa-edit-acts"><button type="button" class="ghost-btn" ${act('removeEl','shProdBg')}>Kapat</button><button type="button" ${act('saveRecipe', id)}>💾 Reçeteyi kaydet</button></div>`;
  const extras = `<div id="shXtBox"></div>`;
  bg.innerHTML = `<div class="box sd-box sh-chain"><div class="u-row-sb"><h2 class="u-m0">🍽️ ${escapeHtml(p.name)}</h2><span class="u-xclose" ${act('removeEl','shProdBg')}>✕</span></div>
    <div class="seg ux-tabs sh-ptabs">${tabs.map(([k, l]) => `<button type="button" class="${tab===k?'on':''}" ${act('openShProduct', id, k)}>${l}${k==='recipe' ? ' · ' + rc.length : ''}</button>`).join('')}</div>
    ${tab === 'recipe' ? recipe : tab === 'extras' ? extras : info}</div>`;
  document.body.appendChild(bg);
  if(tab === 'recipe'){ RECIPE_DRAFT = rc.map(r => ({ ingredient_id: r.ingredient_id, qty_per_unit: r.qty_per_unit, ingredient_name: r.ingredient_name, ingredient_unit: r.ingredient_unit })); recipeUnitOpts('recipeIngSelect', 'recipeUnitSel'); renderRecipeItems(); }
  if(tab === 'extras') openExtrasModal(id);
}
function shOpenRecipe(id){ removeEl('shProdBg'); openRecipeModal(id); }
function shOpenExtras(id){ removeEl('shProdBg'); openExtrasModal(id); }
async function saveShProduct(id){
  const p = shProds().find(x => x.id === id); if(!p) return;
  const v = (k) => { const e = document.getElementById(k); return e ? e.value.trim() : null; };
  const name = v('shp_name'); if(!name){ uiAlert('Ürün adı boş olamaz'); return; }
  const over = { p_name: name, p_price: parseFloat((v('shp_price') || '0').replace(',', '.')) || 0, p_available: !!(document.getElementById('shp_av') || {}).checked };
  if(v('shp_cost') !== null) over.p_cost = parseFloat((v('shp_cost') || '0').replace(',', '.')) || 0;
  if(v('shp_stock') !== null) over.p_stock = v('shp_stock') === '' ? null : parseInt(v('shp_stock'), 10);
  const s = getSession(), menu = v('shp_menu') || null;
  const { error } = await withLoadingOverlay(sb.rpc('upsert_product', Object.assign({ p_token: s.session_token }, productPayload(p, over))));
  if(error){ uiAlert(error.message); return; }
  if(menu !== (p.menu_id || null)){ const o = await sb.rpc('set_product_menu', { p_token: s.session_token, p_product_id: id, p_menu_id: menu }); if(o.error){ uiAlert(o.error.message); return; } }
  showToast('💾 ' + name + ' kaydedildi'); await shReload(); openShProduct(id, 'info');
}
