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
  if(tab === 'depot'){
    const list = depot.filter(i => match(i.name)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
    body = list.length ? `<div class="sh-list">${list.map(i => { const preps = prep.filter(x => x.prep_source_id === i.id), used = shUsedIn(i.id).length + preps.reduce((n, x) => n + shUsedIn(x.id).length, 0);
      return `<button type="button" class="sh-row" ${act('openStockChain', i.id)}>
        <span class="sh-ic">🏬</span><span class="sh-name"><b>${escapeHtml(i.name)}</b><small>${preps.length ? '🥙 ' + preps.length + ' hazırlık · ' : ''}🍽️ ${used} üründe</small></span>
        <span class="sh-qty">${escapeHtml(shQty(i.stock, i))}</span>${shPill(i)}<span class="sh-go">›</span></button>`; }).join('')}</div>`
      : '<div class="empty-state"><p class="muted">Depo hammaddesi yok.</p></div>';
  } else if(tab === 'prep'){
    const list = prep.filter(i => match(i.name));
    body = `<p class="muted ux-hint">Her gün depodan alınıp hazırlanan kalemler. Mutfakta <b>➕ Hazırla</b> ile tezgâha eklenir, depodan otomatik düşer; satışlar tezgâhtan düşer.</p>` + (list.length ? `<div class="sh-list">${list.map(i => { const src = ings.find(x => x.id === i.prep_source_id);
      return `<button type="button" class="sh-row" ${act('openStockChain', i.id)}>
        <span class="sh-ic">🥙</span><span class="sh-name"><b>${escapeHtml(i.name)}</b><small>🏬 ${escapeHtml(src ? src.name : '—')}'dan · günlük ${escapeHtml(i.prep_default ? shQty(i.prep_default, i) : 'miktar yok')}</small></span>
        <span class="sh-qty">${escapeHtml(shQty(i.stock, i))}</span>${shPill(i)}<span class="sh-go">›</span></button>`; }).join('')}</div>`
      : '<div class="empty-state"><p class="muted">Günlük hazırlık kalemi yok. Bir depo hammaddesine tıklayıp "Günlük hazırlık oluştur" ile ekleyebilirsiniz.</p></div>');
  } else {
    const list = shProds().filter(p => match(p.name)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
    body = `<p class="muted ux-hint">Reçete yalnızca buradan, ürünün içinden düzenlenir. Ürün satılınca reçetedeki miktarlar stoktan düşer.</p><div class="sh-list">${list.map(p => { const rc = p.recipe || [];
      return `<button type="button" class="sh-row" ${act('openRecipeModal', p.id)}>
        <span class="sh-ic">🍽️</span><span class="sh-name"><b>${escapeHtml(p.name)}</b><small>${rc.length ? rc.map(r => escapeHtml(r.ingredient_name || '') + ' ' + escapeHtml(recipeQtyLabel(r))).join(' · ') : '<span class="u-red">Reçete yok — stok ve maliyet düşmez</span>'}</small></span>
        <span class="sh-qty">${Number(p.cost) > 0 ? money(p.cost) : '—'}</span><span class="sh-pill ${rc.length ? 'ok' : 'warn'}">${rc.length ? rc.length + ' kalem' : 'Reçetesiz'}</span><span class="sh-go">›</span></button>`; }).join('')}</div>`;
  }
  el.innerHTML = `<div class="u-mwn box ux-prod sh-hub">
    <div class="sh-draft">🧪 Taslak ekran — sadece görüntüler; düzenleme mevcut pencerelerden yapılır.</div>
    <div class="ux-bar"><h2 class="u-m0">📦 Stok & Reçete</h2>
      <input class="list-search" placeholder="🔍 Ara…" value="${escapeAttr(APP.shQ || '')}" ${actOn('input', 'shSearch', ['$value'])}>
      <button type="button" class="fsheet-open" ${act('shNew')}>+ Yeni</button></div>
    <div class="sh-flow"><span class="${tab==='depot'?'on':''}" role="button" ${act('setShTab','depot')}>🏬 Depo <em>${depot.length}</em></span><i>→</i>
      <span class="${tab==='prep'?'on':''}" role="button" ${act('setShTab','prep')}>🥙 Günlük Hazırlık <em>${prep.length}</em></span><i>→</i>
      <span class="${tab==='recipes'?'on':''}" role="button" ${act('setShTab','recipes')}>🍽️ Ürünler & Reçeteler <em>${shProds().length}</em></span></div>
    <div id="shBody">${body}</div></div>`;
}
function setShTab(t){ APP.shTab = t; renderSettingsContent(getSession()); }
function shSearch(v){ APP.shQ = v; const el = document.getElementById('settingsContent'); renderStockHub(el); const inp = el.querySelector('.sh-hub .list-search'); if(inp){ inp.focus(); inp.setSelectionRange(v.length, v.length); } }
function shNew(){ if((APP.shTab || 'depot') === 'recipes'){ APP.settingsTab = 'products'; APP.productsSubTab = 'products'; renderSettingsView(document.getElementById('main'), getSession()).then(() => typeof openSheet === 'function' && openSheet('prodSheet')); return; }
  APP.settingsTab = 'products'; APP.productsSubTab = 'ingredients'; renderSettingsView(document.getElementById('main'), getSession()).then(() => typeof niStart === 'function' && niStart('')); }

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
        return `<button type="button" class="sh-node" ${act('openRecipeModal', p.id)}><span>🍽️</span><b>${escapeHtml(p.name)}</b><small>${r ? escapeHtml(recipeQtyLabel(r)) + ' · ' : ''}${via.prep_source_id ? '🥙 hazırlıktan' : '🏬 depodan'}</small></button>`; }).join('') : '<small class="muted">Hiçbir üründe kullanılmıyor.</small>'}</div></div>
    </div>
    <div class="oa-edit-acts">
      ${depot ? `<button type="button" class="ghost-btn" ${act('openIngCostLog', depot.id)}>📈 Fiyat geçmişi</button>` : ''}
      <button type="button" class="ghost-btn" ${act('openIngredientUsageModal', id, true)}>⚙️ Düzenle</button>
      <button type="button" ${act('removeEl','shChainBg')}>Tamam</button></div></div>`;
  document.body.appendChild(bg);
}
