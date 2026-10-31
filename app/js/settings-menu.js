// Ayarlar: sipariş etiketleri, hammadde/reçete, istasyonlar, bölge/masa/kat planı, QR, ürünler (settings.js'ten ayrıldı; klasik script, fonksiyonlar global).

/* --- Sipariş Etiketleri (Personel Yemeği, İkram vb. checkbox'lar) --- */
function renderOrderFlagsSettings(el, session){
  const flags = APP.config.order_flags || [];
  el.innerHTML = `<div class="u-mwn box">
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
  const ingSort = APP.ingSort || 'name';
  const shownIngs0 = f==='low' ? ings.filter(isLow) : f==='out' ? ings.filter(i => Number(i.stock)<=0) : f==='idle' ? ings.filter(i => !useCount(i.id)) : f==='waste' ? ings.filter(i => Number(i.waste_pct)>0) : ings;
  const stRank = (i) => Number(i.stock)<=0 ? 0 : isLow(i) ? 1 : useCount(i.id) ? 2 : 3;
  const shownIngs = shownIngs0.slice().sort((a, b) => { const c = String(a.name).localeCompare(String(b.name), 'tr', { numeric: true });
    return ingSort==='za' ? -c : ingSort==='stock' ? (Number(a.stock)-Number(b.stock)) || c : ingSort==='stockd' ? (Number(b.stock)-Number(a.stock)) || c
      : ingSort==='uses' ? (useCount(b.id)-useCount(a.id)) || c : ingSort==='status' ? (stRank(a)-stRank(b)) || c : ingSort==='unit' ? String(a.unit).localeCompare(String(b.unit)) || c : c; });
  const chip = (k, ic, v, l, c) => `<div class="os-chip os-click ${f===k?'on':''}" role="button" title="Listeyi filtrele" style="--oc:${c};" ${act('setIngFilter', k)}><span class="os-ic">${ic}</span><div><b>${v}</b><small>${l}</small></div></div>`;
  el.innerHTML = `<div class="order-summary stat-chips" style="--n:5;">${chip('all','🥕', ings.length, 'Hammadde', 'var(--c1)')}${chip('low','📉', ings.filter(isLow).length, 'Kritik stok', 'var(--c3)')}${chip('out','⛔', ings.filter(i => Number(i.stock)<=0).length, 'Stoğu biten', 'var(--danger,#ef4444)')}${chip('idle','💤', ings.filter(i => !useCount(i.id)).length, 'Reçetede kullanılmayan', 'var(--c3)')}${chip('waste','✂️', ings.filter(i => Number(i.waste_pct)>0).length, 'Fire tanımlı', 'var(--c2)')}</div>
  <div class="u-mwn box">
    <div class="fsheet-bar" style="margin:0 0 12px;"><h2 class="u-m0">Hammaddeler / Stok Kalemleri</h2>${sheetBtnHtml('ingSheet','+ Yeni Hammadde')}</div>
    <details class="prod-info"><summary>ℹ️ Nasıl çalışır</summary><p class="muted" style="text-align:left;margin:0 0 12px;">Örn: "Köfte" (birim: adet, stok: 200), "Döner Eti" (birim: kg, stok: 20). Yeni bir hammadde eklediğinizde hangi ürünlerin onu kullandığını hemen soracağız — istediğiniz zaman "Kullanıldığı Ürünler" ile bunu tekrar düzenleyebilirsiniz. Aynı hammaddeyi paylaşan ürünlerin stoğu her zaman ortak ve anlık hesaplanır. <b>Min</b>: stok bu seviyeye inince Malzeme Siparişi Ver menüsünde uyarı çıkar ve tek tıkla sipariş taslağı hazırlanır. <b>Fire %</b>: temizleme/kesim kaybıdır; reçeteye net miktarı girersiniz, stoktan fire eklenerek düşülür (örn. %10 fire, 60 g net → 66,7 g düşer). Kartları değiştirip <b>Kaydet</b>'e basın; silmek için kartları seçin.</p></details>
    <div class="add-row-panel">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 10px;">
        ${listSearchHtml('ingredients', 'Hammadde ara…').replace('margin:0 0 12px;','margin:0;')}
        ${typeof excelBarHtml === 'function' ? excelBarHtml('ingredients') : ''}
        <select class="ig-sort" title="Sırala" ${actOn('change','setIngSort',['$value'])}>${[['name','A → Z'],['za','Z → A'],['status','Duruma göre (biten önce)'],['stock','Stok: azdan çoğa'],['stockd','Stok: çoktan aza'],['uses','En çok üründe kullanılan'],['unit','Birime göre']].map(([k,l]) => `<option value="${k}" ${ingSort===k?'selected':''}>↕ ${l}</option>`).join('')}</select>
        <span class="u-f1"></span>
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
    <div style="display:flex;align-items:center;gap:8px;margin:4px 0 10px;"><label style="display:flex;align-items:center;gap:6px;margin:0;font-size:13px;font-weight:600;"><input type="checkbox" class="u-wa-m0" ${actOn('change','selectAllIngredients',['$checked'])}> Tümünü seç</label></div>
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
          <label class="ig-waste" title="Birim (${escapeAttr(i.unit||'')}) başına ağırlıklı ortalama alış maliyeti. Mal Kabul'de fiyatlı teslim alınca eldeki stokla ortalanarak otomatik güncellenir; reçeteli ürünlerin maliyeti bundan hesaplanır.">Ort. ₺/${escapeHtml(i.unit||'birim')} <input type="number" step="0.01" min="0" value="${Number(i.unit_cost) ? Math.round(Number(i.unit_cost) * 100) / 100 : ''}" placeholder="—" id="ing_uc_${i.id}"></label><button type="button" class="pc-btn" title="Maliyet geçmişi" ${act('openIngCostLog', i.id)}>📈</button>
          <button type="button" class="pc-btn" ${act('openIngredientUsageModal', i.id)}>🍽️ ${uses} ürün</button>
          <button type="button" class="pc-btn" title="Hammaddeyi ve kullanıldığı ürünleri düzenle" ${act('openIngredientUsageModal', i.id, true)}>✏️ Düzenle</button>
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
function setIngSort(v){ APP.ingSort = v; renderSettingsContent(getSession()); }
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
      min: parseFloat(document.getElementById('ing_min_'+id).value)||0, uc: (() => { const e = document.getElementById('ing_uc_'+id); return e && e.value !== '' ? parseFloat(e.value) : null; })() };
  });
  if(!rows.length) return;
  if(rows.some(r => !r.name)){ alert('Hammadde adı boş olamaz'); return; }
  const session = getSession(); const errors = [];
  await withLoadingOverlay((async () => {
    const res = await bulkRpc('upsert_ingredient', rows.map(r => ({ p_id: r.id, p_name: r.name, p_unit: r.unit, p_stock: r.stock, p_waste_pct: r.waste })));
    const okRows = rows.filter((r, k) => { if(res[k].error){ errors.push(r.name + ': ' + res[k].error.message); return false; } return true; });
    (await bulkRpc('set_ingredient_min', okRows.map(r => ({ p_id: r.id, p_min: r.min })))).forEach((e, k) => { if(e.error) errors.push(okRows[k].name + ': ' + e.error.message); });
    (await bulkRpc('set_ingredient_cost', okRows.map(r => ({ p_id: r.id, p_cost: r.uc })))).forEach((e, k) => { if(e.error) errors.push(okRows[k].name + ': ' + e.error.message); });
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
    (await bulkRpc('delete_ingredient', list.map(i => ({ p_id: i.id })))).forEach((r, k) => { if(r.error) errors.push(list[k].name + ': ' + friendlyDeleteError(r.error.message)); });
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
function openIngredientUsageModal(ingredientId, edit){
  const ingredient = (APP.config.ingredients||[]).find(x => x.id===ingredientId);
  const ingredientName = ingredient ? ingredient.name : '';
  const unit = ingredient && ingredient.unit ? ingredient.unit : '';
  const products = APP.config.products || [];
  const bg = document.createElement('div');
  bg.id = 'ingUsageModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:480px;width:100%;max-height:88vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;"><h2 class="u-m0">${edit ? '✏️ Hammadde Düzenle' : escapeHtml(ingredientName) + ' - Kullanıldığı Ürünler'}</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','ingUsageModalBg')}>✕</span></div>
    ${edit && ingredient ? `<div class="fsheet-grid iu-edit">
      <div class="field-group wide"><label>Hammadde Adı</label><input id="iue_name" value="${escapeAttr(ingredient.name||'')}"></div>
      <div class="field-group"><label>Birim</label><select id="iue_unit">${['adet','gram','kg','ml','lt'].map(u => `<option value="${u}" ${u===ingredient.unit?'selected':''}>${u}</option>`).join('')}</select></div>
      <div class="field-group"><label>Stok</label><input type="number" step="0.01" id="iue_stock" value="${Number(ingredient.stock)||0}"></div>
      <div class="field-group"><label>Fire %</label><input type="number" step="0.1" min="0" max="99" id="iue_waste" value="${Number(ingredient.waste_pct)||0}"></div>
      <div class="field-group"><label>Min stok</label><input type="number" step="0.01" min="0" id="iue_min" value="${Number(ingredient.min_stock)||''}" placeholder="—"></div>
    </div><h3 style="margin:14px 0 0;font-size:15px;">🍽️ Kullanıldığı ürünler</h3>` : ''}
    <p class="u-tl muted">Bu hammaddeyi hangi ürünler kullanıyor, 1 porsiyonda net ne kadar tüketiliyor${unit?' ('+escapeHtml(unit)+')':''}?${ingredient && Number(ingredient.waste_pct)>0 ? ' Stoktan %'+Number(ingredient.waste_pct)+' fire eklenerek düşülür.' : ''} Seçmediğiniz ürünlerden bu hammadde kaldırılır (o ürünlerin diğer hammaddeleri etkilenmez).</p>
    ${products.length ? `<div class="iu-tools">
      <input id="iuSearch" placeholder="🔍 Ürün ara…" autocomplete="off" ${actOn('input','filterIngUsage',[])}>
      <div class="iu-row">
        <select id="iuMenu" ${actOn('change','filterIngUsage',[])}><option value="">Tüm menüler</option>${(APP.config.menus||[]).map(m => `<option value="${escapeAttr(m.id)}">${escapeHtml(m.name)}</option>`).join('')}</select>
        <select id="iuSort" ${actOn('change','filterIngUsage',[])}><option value="sel">Seçililer önce</option><option value="az">A → Z</option><option value="za">Z → A</option><option value="menu">Menüye göre</option></select>
      </div>
      <div class="iu-row"><label class="iu-only"><input type="checkbox" id="iuOnly" ${actOn('change','filterIngUsage',[])}> Sadece seçililer</label><small class="muted" id="iuCount"></small></div>
    </div>` : ''}
    <div id="ingUsageItemsBox"></div>
    <button style="margin-top:14px;" ${act('saveIngredientUsage', ingredientId)}>${ICON_SAVE}<span>Kaydet</span></button>
  </div>`;
  document.body.appendChild(bg);
  const box = document.getElementById('ingUsageItemsBox');
  box.innerHTML = products.length===0 ? '<p class="muted">Henüz ürün eklenmemiş.</p>' : products.map(p => {
    const existing = (p.recipe||[]).find(r => r.ingredient_id===ingredientId);
    return `
    <div class="iu-item" data-name="${escapeAttr(p.name)}" data-menu="${escapeAttr(p.menu_id||'')}" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <input type="checkbox" id="ingu_chk_${p.id}" ${existing?'checked':''} ${actOn('change','toggleIngUsageQty',[p.id,'$checked'])} class="u-wa-m0">
      <span class="u-f1">${escapeHtml(p.name)}${(APP.config.menus||[]).length > 1 && p.menu_id ? `<small class="muted iu-menu">${escapeHtml(((APP.config.menus||[]).find(m => m.id === p.menu_id)||{}).name||'')}</small>` : ''}</span>
      <input type="number" step="0.01" min="0" id="ingu_qty_${p.id}" value="${existing?existing.qty_per_unit:''}" placeholder="Miktar/porsiyon" ${existing?'':'disabled'} style="width:110px;margin:0;">
      <span class="muted" style="min-width:36px;">${escapeHtml(unit)}</span>
    </div>`;
  }).join('');
  filterIngUsage();
  const sr = document.getElementById('iuSearch'); if(sr) setTimeout(() => sr.focus(), 50);
}
/* Kullanıldığı Ürünler: arama, menü filtresi, sıralama (satırlar DOM'da kalır; kayıt hepsini okur). */
function filterIngUsage(){
  const box = document.getElementById('ingUsageItemsBox'); if(!box) return;
  const q = ((document.getElementById('iuSearch')||{}).value || '').toLocaleLowerCase('tr').trim();
  const menu = (document.getElementById('iuMenu')||{}).value || '';
  const only = !!(document.getElementById('iuOnly')||{}).checked;
  const sort = (document.getElementById('iuSort')||{}).value || 'sel';
  const menuName = (id) => ((APP.config.menus||[]).find(m => m.id === id)||{}).name || '';
  const items = [...box.querySelectorAll('.iu-item')];
  const chk = (el) => el.querySelector('input[type=checkbox]').checked;
  items.sort((a, b) => {
    const an = a.dataset.name, bn = b.dataset.name, c = an.localeCompare(bn, 'tr', { numeric: true });
    if(sort === 'za') return -c;
    if(sort === 'menu') return menuName(a.dataset.menu).localeCompare(menuName(b.dataset.menu), 'tr') || c;
    if(sort === 'sel') return (chk(b) - chk(a)) || c;
    return c;
  }).forEach(el => box.appendChild(el));
  let shown = 0, sel = 0;
  items.forEach(el => {
    const on = chk(el); if(on) sel++;
    const ok = (!q || el.dataset.name.toLocaleLowerCase('tr').includes(q)) && (!menu || el.dataset.menu === menu) && (!only || on);
    el.style.display = ok ? 'flex' : 'none'; if(ok) shown++;
  });
  const cnt = document.getElementById('iuCount'); if(cnt) cnt.textContent = `${sel} seçili · ${shown}/${items.length} ürün gösteriliyor`;
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
  const nm = document.getElementById('iue_name');
  if(nm){
    const name = nm.value.trim(); if(!name){ alert('Hammadde adı boş olamaz'); nm.focus(); return; }
    const { error: e1 } = await sb.rpc('upsert_ingredient', { p_token: session.session_token, p_id: ingredientId, p_name: name, p_unit: document.getElementById('iue_unit').value,
      p_stock: parseFloat(document.getElementById('iue_stock').value)||0, p_waste_pct: parseFloat(document.getElementById('iue_waste').value)||0 });
    if(e1){ alert(e1.message); return; }
    const { error: e2 } = await sb.rpc('set_ingredient_min', { p_token: session.session_token, p_id: ingredientId, p_min: parseFloat(document.getElementById('iue_min').value)||0 });
    if(e2){ alert(e2.message); return; }
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
    <div class="u-row-sb"><h2 class="u-m0">➕ ${escapeHtml(prod.name)} · Ekstralar</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','extrasModalBg')}>✕</span></div>
    <p class="muted" style="text-align:left;font-size:13px;">Siparişte bu ürün eklenince ekstralar seçilebilir. Her ekstra ayrı kalem olarak eklenir, fiyatı hesaba yansır ve ürünün istasyonuna/fişine düşer.</p>
    ${list.map(e => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
      <input id="xt_name_${e.id}" value="${escapeAttr(e.name)}" class="u-f1-m0">
      <input id="xt_price_${e.id}" type="number" min="0" step="0.01" value="${e.price}" style="width:110px;margin:0;" title="Ek fiyat (₺)">
      ${actBtn('save', 'saveProductExtra', productId, e.id)}${actBtn('delete', 'removeProductExtra', productId, e.id)}
    </div>`).join('') || '<p class="u-fs13 muted">Henüz ekstra yok.</p>'}
    <div style="display:flex;gap:8px;align-items:center;border-top:1px dashed var(--border);padding-top:12px;margin-top:6px;">
      <input id="xt_name_new" placeholder="örn. Ek Döner" class="u-f1-m0">
      <input id="xt_price_new" type="number" min="0" step="0.01" placeholder="Fiyat ₺" style="width:110px;margin:0;">
      <button type="button" class="u-wa-m0" ${act('saveProductExtra', productId, '')}>+ Ekle</button>
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
    <div style="display:flex;justify-content:space-between;"><h2 class="u-m0">${escapeHtml(prod.name)} - Reçete</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','recipeModalBg')}>✕</span></div>
    <p class="u-tl muted">Bu üründen 1 porsiyon satıldığında hangi hammaddeden ne kadar düşsün?</p>
    <div id="recipeItemsBox"></div>
    <div style="background:var(--panel2);border-radius:10px;padding:12px;margin-top:12px;">
      <div style="display:flex;gap:8px;">
        <select id="recipeIngSelect" class="u-f1-m0">
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
    <div style="display:flex;justify-content:space-between;"><h2 class="u-m0">${escapeHtml(prod.name)} - Çeviriler</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','translationsModalBg')}>✕</span></div>
    <p class="u-tl muted">Boş bıraktığınız diller için QR menüde Türkçe ad gösterilir.</p>
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
      <h3 class="u-m0">İkon Seç</h3>
      <button type="button" class="icon-picker-close" ${act('removeEl','iconPickerBg')}>✕</button>
    </div>
    <input id="iconPickerSearch" placeholder="🔍 Ara: pizza, kahve, tatlı…" autocomplete="off" class="u-mbb10"
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
      </div>
      <div class="st-col-tools">
        <span class="st-col-sub">${list.length} menü · ${(APP.config.products||[]).filter(p => p.station_id===s.id).length} ürün</span>
        <input type="color" class="st-col-color" value="${s.color}" id="st_color_${s.id}" title="İstasyon rengi">
        <button type="button" class="ico-btn" title="Kaydet" ${act('saveStation', s.id)}>💾</button>
        <button type="button" class="ico-btn danger" title="İstasyonu sil" ${act('removeStation', s.id)}>🗑</button>
      </div>
      <div class="st-col-body">${list.map(menuCard).join('') || '<div class="st-empty">Bu istasyona menü bağlı değil.<br>Bir menünün altındaki seçimden buraya taşıyın.</div>'}</div>
      ${stationKitchenProductsHtml(s)}
    </div>`; };
  const free = menus.filter(m => !m.station_id || !stations.some(x => x.id === m.station_id));
  el.innerHTML = statChips([['📋', menus.length, 'Menü', 'var(--c1)', 'all'], ['🍳', stations.length, 'İstasyon', 'var(--c2)', 'station'],
      ['🍽️', (APP.config.products||[]).length, 'Ürün', 'var(--c3)', 'go:setSettingsTab:products'], ['⚠️', free.length, 'İstasyonsuz menü', free.length ? 'var(--danger,#ef4444)' : 'var(--c4)', 'free']], '', 'menus') +
    `<div class="u-mwn box">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><h2 class="u-m0">Menüler & İstasyonlar</h2></div>
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
          <div style="display:flex;gap:8px;"><input type="color" id="newStColor" value="#b6a48d" title="Renk" class="st-col-color"><button type="button" class="u-f1" ${act('addStation')}>+ İstasyon Ekle</button></div>
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
      <div class="st-kp-list">${list.map(p => `<label><input type="checkbox" class="u-wa-m0" ${p.kitchen_skip ? '' : 'checked'} ${actOn('change','setProductKitchen',[p.id,'$checked',st.id])}>${escapeHtml(p.name)}</label>`).join('')}</div></div>`).join('')}
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
  el.innerHTML = `<div class="u-mwn box sub-tabs-box">
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
  el.innerHTML = `<div class="u-mwn box sub-tabs-box">
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
  el.innerHTML = `<div class="u-mwn box"><h2>🎟️ Kampanya & Kuponlar</h2>
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
  el.innerHTML = `<div class="u-mwn box sub-tabs-box">
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
    `<div class="u-mwn box">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <h2 class="u-m0">Bölgeler & Masalar</h2><span class="u-f1"></span>
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
    const errs = [];
    (await bulkRpc('upsert_table', todo.map(n => ({ p_id: null, p_zone_id: zoneId, p_name: n })))).forEach((r, k) => { if(r.error) errs.push(todo[k] + ': ' + r.error.message); });
    if(errs.length) alert(errs.join('\n'));
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
  el.innerHTML = `<div class="u-mwn box">
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
    <div style="display:flex;justify-content:space-between;"><h2 class="u-m0">${escapeHtml(tableName)}</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','tableQrModalBg')}>✕</span></div>
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
      <h2 class="u-m0">▦ Masa QR Kodları <span class="muted" style="font-size:13px;font-weight:600;">(${list.length})</span></h2>
      <div style="display:flex;gap:8px;">
        <button type="button" class="u-wa-m0" ${act('printAllTableQrs')}>🖨️ Yazdır / PDF</button>
        <button type="button" class="u-wa-m0 ghost-btn" ${act('downloadAllTableQrs')}>⬇ İndir</button>
        <button type="button" class="u-wa-m0 ghost-btn" ${act('removeEl', 'qrSheetBg')}>✕</button>
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
          <td><input type="checkbox" class="u-wa-m0 prod-sel" value="${p.id}" ${actOn('change','updateProdSelection',[])}></td>
          <td class="col-name"><input value="${escapeAttr(p.name)}" id="pr_name_${p.id}"></td>
          <td class="col-name"><select id="pr_st_${p.id}" ${p.menu_id ? 'title="İstasyon normalde menüden gelir; burada değiştirirseniz bu ürün için ayrı istasyon kullanılır. Menünün istasyonunu seçerseniz tekrar menüye bağlanır."' : ''}>
            ${!p.station_id ? '<option value="" selected>— İstasyon yok —</option>' : ''}
            ${stations.map(s => `<option value="${s.id}" ${s.id===p.station_id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
          </select></td>
          <td class="col-num"><input type="number" value="${p.price}" id="pr_price_${p.id}"></td>
          <td class="col-num"><input type="number" value="${p.cost}" id="pr_cost_${p.id}" ${p.cost_source==='recipe' ? 'readonly title="Reçeteden otomatik hesaplanır"' : ''}>${costSourceTag(p)}</td>
          <td class="col-name" style="min-width:150px;"><select id="pr_menu_${p.id}">${prodMenuOptions(p.menu_id)}</select></td>
          <td class="col-num" style="min-width:110px;">${vatSelectHtml('pr_vat_'+p.id, p.vat_rate, true)}</td>
          <td class="col-num">
            ${(p.recipe && p.recipe.length>0)
              ? `<span class="u-fs12 muted">Reçeteli (${p.available_qty==null?'?':p.available_qty} porsiyon)</span>`
              : `<input type="number" value="${p.stock==null?'':p.stock}" id="pr_stock_${p.id}" placeholder="Sınırsız">`}
          </td>
          <td class="u-tc"><input type="checkbox" class="u-wa-m0 prod-print" id="pr_print_${p.id}" title="İşaretliyse mutfak fişine yazdırılır" ${p.print_ticket===false?'':'checked'}></td>
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
    const sub = (t, n) => `<tr class="prod-cat-row"><td colspan="12" style="padding:12px 4px 4px;background:transparent;border:0;"><b style="font-size:12.5px;color:var(--accent);text-transform:uppercase;letter-spacing:.03em;">${escapeHtml(t)}</b> <span class="u-fs12 muted">(${n})</span></td></tr>`;
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
      <div class="pcard-margin" title="Kâr marjı"><div class="pcard-mbar"><i style="width:${Math.max(0,Math.min(100,m))}%;background:${m>=60?'var(--ok,#22c55e)':m>=35?'var(--c3)':'var(--danger,#ef4444)'};"></i></div><span>Maliyet ${money(cost)} ${costSourceTag(p)} · <b>%${m}</b> marj${overheadPct() ? ` · net <b>%${Math.round((price - fullCost(p)) / (price || 1) * 100)}</b>` : ''}</span></div>
      <div class="pcard-chips">
        <span class="pchip ${low?'warn':''}">${rec ? '📋 '+(q==null?'?':q)+' porsiyon' : (q==null ? '∞ Stok sınırsız' : '📦 '+q+' stok')}</span>
        ${p.category ? `<span class="pchip">${escapeHtml(p.category)}</span>` : ''}
        ${p.print_ticket===false ? '<span class="pchip">🖨️ fiş yok</span>' : ''}
        ${!(Number(p.cost) > 0) ? `<span class="pchip warn" title="Maliyet girilmedi">⚠️ Maliyet yok</span>` : ''}
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
      <summary><span class="prod-grp-dot"></span><b>${escapeHtml(title)}</b><span class="muted">${list.length} ürün${stLabel ? ' · 🍳 '+escapeHtml(stLabel) : ''}${list.some(p => p.available===false) ? ' · '+list.filter(p => p.available===false).length+' kapalı' : ''}</span><span class="u-f1"></span>${menuId ? menuAvailBtn(menuId) : ''}</summary>
      <div class="pcard-grid">${cardsFor(list)}</div>
    </details>` : `
    <details class="prod-grp" open style="--g:${colorDot||'var(--muted)'};">
      <summary><span class="prod-grp-dot"></span><b>${escapeHtml(title)}</b><span class="muted">${list.length} ürün${stLabel ? ' · 🍳 '+escapeHtml(stLabel) : ''}${list.some(p => p.available===false) ? ' · '+list.filter(p => p.available===false).length+' kapalı' : ''}</span><span class="u-f1"></span>${menuId ? menuAvailBtn(menuId) : ''}</summary>
      <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th style="width:36px;"><input type="checkbox" class="u-wa-m0" title="Bu gruptakilerin tümünü seç" ${actOn('change','selectProdGroup',['$this'])}></th><th>Ürün Adı</th><th>İstasyon</th><th>Fiyat</th><th>Maliyet</th><th title="Ürünün menüsü; istasyon menüden gelir">Menü</th><th title="Fiyata dahil KDV oranı">KDV</th><th>Stok</th><th title="Mutfak fişine yazdırılsın mı?">🖨️ Fiş</th><th>Durum</th><th></th></tr></thead>
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
    : pf==='nocost' ? products.filter(p => !(Number(p.cost) > 0)) : pf==='low' ? products.filter(isLow) : pf==='lowmargin' ? products.filter(p => Number(p.price)>0 && mOf(p) < .35) : products;
  const lowN = products.filter(p => { const q = p.recipe && p.recipe.length ? p.available_qty : p.stock; return q!=null && q<=5; }).length;
  el.innerHTML = `<div class="u-mwn box">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><h2 class="u-m0">Ürünler</h2><span class="u-f1"></span>
      <div class="seg">${[['cards','▦ Kart'],['table','☰ Tablo']].map(([k,l]) => `<button type="button" class="${(cardMode?'cards':'table')===k?'on':''}" ${act('setProdView', k)}>${l}</button>`).join('')}</div></div>
    <div class="order-summary prod-summary" style="margin:12px 0 14px;">
      <div class="os-chip os-click ${pf==='all'?'on':''}" role="button" title="Listeyi filtrele" ${act('setProdFilter', 'all')} style="--oc:var(--c1);"><span class="os-ic">🍔</span><div><b>${products.length}</b><small>Ürün</small></div></div>
      <div class="os-chip os-click ${pf==='on'?'on':''}" role="button" title="Listeyi filtrele" ${act('setProdFilter', 'on')} style="--oc:var(--ok,#22c55e);"><span class="os-ic">✅</span><div><b>${sale}</b><small>Satışta</small></div></div>
      <div class="os-chip os-click ${pf==='off'?'on':''}" role="button" title="Listeyi filtrele" ${act('setProdFilter', 'off')} style="--oc:var(--danger,#ef4444);"><span class="os-ic">⛔</span><div><b>${products.length-sale}</b><small>Kapalı</small></div></div>
      <div class="os-chip os-click ${pf==='lowmargin'?'on':''}" role="button" title="Listeyi filtrele" ${act('setProdFilter', 'lowmargin')} style="--oc:var(--c2);"><span class="os-ic">📈</span><div><b>${lowMN}</b><small>Düşük marj (ort. %${avgM})</small></div></div>
      <div class="os-chip os-click ${pf==='low'?'on':''}" role="button" title="Listeyi filtrele" ${act('setProdFilter', 'low')} style="--oc:var(--c3);"><span class="os-ic">⚠️</span><div><b>${lowN}</b><small>Stok azalan</small></div></div>
      <div class="os-chip os-click ${pf==='nocost'?'on':''}" role="button" title="Listeyi filtrele" ${act('setProdFilter', 'nocost')} style="--oc:#ef4444;"><span class="os-ic">💸</span><div><b>${products.filter(p => !(Number(p.cost) > 0)).length}</b><small>Maliyet girilmemiş</small></div></div>
    </div>
    <div class="rc-bar"><span>🧾 Reçeteli ürünlerin maliyeti hammaddelerin <b>ortalama alış maliyetinden</b> otomatik hesaplanır.${overheadPct() ? ` Genel giderler cironun <b>%${overheadPct()}</b>'i.` : ' Kira, personel, elektrik gibi giderleri ekleyerek net kârı görün.'}<br><small class="muted">💡 Hazır alıp sattığınız ürünler (ayran, kola…) için ürün adıyla bir hammadde açıp ürüne 1 adet reçete ekleyin; alış maliyeti de otomatik yansır.</small></span><button type="button" class="pc-btn" ${act('openOverheads')}>📊 Maliyet & Giderler</button></div>
    <label class="sc-toggle"><span class="oo-switch"><input type="checkbox" ${APP.config.close_no_cost !== false ? 'checked' : ''} ${actOn('change','toggleCloseNoCost',['$checked', '$this'])}><span class="oo-track"><span class="oo-thumb"></span></span><em>${APP.config.close_no_cost !== false ? 'Açık' : 'Kapalı'}</em></span><span>💸 Maliyeti girilmemiş ürünler satışa <b>kapalı</b> gelsin <small class="muted">(istediğiniz ürünü yine "Satışa Aç" ile açabilirsiniz)</small></span></label>
    <label class="sc-toggle" title="Kapalıyken satışa kapattığınız ürünler Sipariş Al ve Paket Servis ürün listesinde hiç görünmez"><span class="oo-switch"><input type="checkbox" ${APP.config.order_show_closed !== false ? 'checked' : ''} ${actOn('change','toggleOrderShowClosed',['$checked', '$this'])}><span class="oo-track"><span class="oo-thumb"></span></span><em>${APP.config.order_show_closed !== false ? 'Açık' : 'Kapalı'}</em></span><span>⛔ Satışa kapalı ürünler <b>Sipariş Al</b> ekranında görünsün <small class="muted">(kapalıyken listeden tamamen gizlenir)</small></span></label>
    ${pf!=='all' ? `<div class="pf-note">🔎 <b>${{on:'Satıştaki',off:'Kapalı',low:'Stoğu azalan',lowmargin:'Düşük marjlı',nocost:'Maliyeti girilmemiş'}[pf]} ürünler</b> gösteriliyor (${shown.length})<button type="button" class="pc-btn" ${act('setProdFilter', 'all')}>✕ Tümünü göster</button></div>` : ''}
    ${pf!=='all' && !shown.length ? '<div class="empty-state"><div style="font-size:38px;">🎉</div><p class="muted">Bu filtrede ürün yok.</p></div>' : ''}
    <details class="prod-info"><summary>ℹ️ Nasıl çalışır · Varsayılan KDV: %${APP.config.default_vat_rate ?? 10}</summary>
    <p class="muted" style="text-align:left;margin:-6px 0 12px;font-size:13px;"><b>Menü</b>: ürünün menüsü (menüleri ve hangi istasyona gideceklerini <b>Menüler & İstasyonlar</b> sekmesinde ayarlayın); ürünün istasyonu menüden gelir. <b>🖨️ Fiş</b> işareti kaldırılan ürünler mutfak fişine yazdırılmaz (ekranda yine görünür).</p>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px;">
      <label style="margin:0;font-weight:700;font-size:13.5px;">Varsayılan KDV oranı</label>
      <div style="width:130px;">${vatSelectHtml('defaultVatSel', APP.config.default_vat_rate ?? 10, false, `${actOn('change','saveDefaultVat',['$value'])} style="margin:0;"`)}</div>
      <span class="u-fs125 muted">Fiyatlar KDV dahildir. Lokantada yiyecek-içecek %10, alkollü içecek %20. Ürüne ayrı oran seçilmezse bu oran kullanılır.</span>
    </div>
    <p class="muted" style="text-align:left;margin:0 0 16px;">Stok alanını boş bırakırsanız o ürün için stok takibi yapılmaz. Satırları değiştirip <b>Kaydet</b>'e basın; satışa açmak / kapatmak / silmek için satırları seçin.</p>
    </details>
    <div class="add-row-panel">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 10px;">
        ${listSearchHtml('products', 'Ürün ara…').replace('margin:0 0 12px;','margin:0;')}
        ${sheetBtnHtml('prodSheet','+ Yeni Ürün')}${typeof excelBarHtml === 'function' ? excelBarHtml('products') : ''}
        <span class="u-f1"></span>
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
        <select id="npRecipeIngSelect" class="u-m0">${APP.config.ingredients.map(i => `<option value="${i.id}" data-unit="${i.unit}" data-name="${escapeAttr(i.name)}">${escapeHtml(i.name)} (${i.unit})</option>`).join('')}</select>
        <input type="number" step="0.01" id="npRecipeQtyInput" placeholder="Miktar" class="u-m0">
        <button type="button" class="u-wa-m0 ghost-btn" ${act('addNewProductRecipeItem')}>＋ Ekle</button>
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
    <span class="u-fs12 muted">Reçete:</span>
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
/* Reçeteden maliyet: önizleme (eski → yeni), onaylanınca ürün maliyetleri güncellenir. */
async function openRecipeCostCalc(){
  const { data, error } = await withLoadingOverlay(sb.rpc('recalc_recipe_costs', { p_token: getSession().session_token, p_apply: false }));
  if(error){ alert(error.message); return; }
  const rows = data || [], ok = rows.filter(r => r.new != null), miss = rows.filter(r => r.new == null);
  const bg = document.createElement('div'); bg.id = 'rcBg'; bg.className = 'modal-bg';
  bg.innerHTML = `<div class="box rc-modal"><div class="u-row-sb"><h2 class="u-m0">🧮 Reçeteden maliyet</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','rcBg')}>✕</span></div>
    <p class="u-fs13 muted">Hammadde birim fiyatı × reçete miktarı (fire payı dahil). Birim fiyatı girilmemiş hammaddede son satınalma fiyatı kullanılır.</p>
    ${ok.length ? `<div class="rc-list">${ok.map(r => { const d = Number(r.new) - Number(r.old || 0); return `<div class="rc-row"><b>${escapeHtml(r.name)}</b><span class="muted">${r.old ? money(r.old) : 'yok'}</span><span>→</span><b>${money(r.new)}</b><small class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d ? (d > 0 ? '▲ ' : '▼ ') + money(Math.abs(d)) : '='}</small></div>`; }).join('')}</div>` : '<p class="muted">Hesaplanabilen ürün yok.</p>'}
    ${miss.length ? `<details class="rc-miss"><summary>⚠️ ${miss.length} ürün hesaplanamadı (fiyatı eksik hammadde)</summary>${miss.map(r => `<div>• <b>${escapeHtml(r.name)}</b>: ${escapeHtml((r.missing || []).join(', '))}</div>`).join('')}<p class="muted">Hammaddeler sekmesinde ₺/birim alanını doldurun.</p></details>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;"><button type="button" class="u-wa-m0 ghost-btn" ${act('removeEl','rcBg')}>Vazgeç</button>
      ${ok.length ? `<button type="button" class="u-wa-m0" ${act('applyRecipeCosts')}>${ok.length} ürünün maliyetini güncelle</button>` : ''}</div></div>`;
  document.body.appendChild(bg);
}
async function applyRecipeCosts(){
  const { data, error } = await withLoadingOverlay(sb.rpc('recalc_recipe_costs', { p_token: getSession().session_token, p_apply: true }));
  if(error){ alert(error.message); return; }
  const el = document.getElementById('rcBg'); if(el) el.remove();
  showToast((data || []).filter(r => r.new != null).length + ' ürünün maliyeti güncellendi ✓');
  const { data: cfg } = await sb.rpc('get_restaurant_config', { p_token: getSession().session_token }); if(cfg) APP.config = cfg;
  renderSettingsContent(getSession());
}
function setProdFilter(k){ APP.prodFilter = (APP.prodFilter===k ? 'all' : k); renderSettingsContent(getSession()); }
function setProdView(v){ APP.prodView = v; renderSettingsContent(getSession()); }
// Kart görünümünde "Düzenle": ortada açılan düzenleme penceresi.
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
        <div class="pdrawer-3"><div><label>Fiyat (₺)</label><input type="number" id="ed_price" value="${p.price}"></div><div><label>Maliyet (₺)</label><input type="number" id="ed_cost" value="${p.cost}" ${p.cost_source==='recipe' ? 'readonly' : ''}>${p.cost_source==='recipe' ? '<small class="muted">🧾 Reçeteden otomatik (hammadde ortalama maliyetleri)</small>' : p.cost_source==='recipe_missing' ? '<small style="color:var(--c3)">⚠️ Reçetedeki bazı hammaddelerin maliyeti yok; elle girilen değer kullanılıyor</small>' : '<small class="muted">Reçete eklerseniz otomatik hesaplanır.</small>'}</div>
          <div><label title="Malzeme maliyeti + fiyat × genel gider oranı">Tam maliyet (₺)</label><input id="ed_full" readonly tabindex="-1"><small class="muted" id="ed_full_n"></small></div></div>
        <div class="pdrawer-margin"><div class="pcard-mbar"><i id="ed_mbar"></i></div><span id="ed_mtxt"></span></div>
        ${!rec ? `<div class="cost-tip">💡 <b>Hazır alıp olduğu gibi satıyorsanız</b> (ayran, kola, su…): Hammaddeler'de bu ürün adıyla bir hammadde açın ve ürüne <b>1 adet</b> reçete ekleyin. Böylece Mal Kabul'deki alış fiyatı ortalanarak maliyete otomatik yansır, stok da düşer.${APP.view==='settings' ? ` <button type="button" class="pc-btn" ${act('openRecipeModal', p.id)}>📋 Reçete ekle</button>` : ''}</div>` : ''}
        <div class="pdrawer-2"><div><label>Menü</label><select id="ed_menu">${prodMenuOptions(p.menu_id)}</select></div>
        <div><label>İstasyon</label><select id="ed_st">${!p.station_id ? '<option value="" selected>— İstasyon yok —</option>' : ''}${stations.map(x => `<option value="${x.id}" ${x.id===p.station_id?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}</select></div></div>
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
  const oh = overheadPct(), full = co + pr * oh / 100;
  const fe = document.getElementById('ed_full'), fn = document.getElementById('ed_full_n');
  if(fe) fe.value = (Math.round(full * 100) / 100).toFixed(2);
  if(fn) fn.textContent = oh ? '+ genel gider %' + oh + ' (' + money(pr * oh / 100) + ')' : 'Genel gider eklenmedi';
  t.innerHTML = `Brüt kâr <b>${money(pr-co)}</b> · <b>%${m}</b>` + (oh ? ` <span class="muted">|</span> Net kâr <b>${money(pr-full)}</b> · <b>%${pr>0 ? Math.round((pr-full)/pr*100) : 0}</b>` : '');
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
  if(!(parseFloat(v('cost') ? v('cost').value : 0) > 0)) setTimeout(() => noCostWarn(name, 0), 900);
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
  const errors = await runProductBulk(list, 'upsert_product', p => productPayload(p, { p_available: open }));
  if(errors.length) alert('Bazı ürünler güncellenemedi:\n\n' + errors.join('\n'));
  else showToast((menu ? menu.name : 'Menü') + ': ' + list.length + ' ürün ' + (open ? 'satışa açıldı ✓' : 'satışa kapatıldı'));
}
function productPayload(p, over){
  return Object.assign({ p_id: p.id, p_station_id: p.station_id, p_name: p.name, p_price: p.price, p_cost: p.cost, p_stock: p.stock, p_available: p.available!==false }, over || {});
}
async function runProductBulk(list, rpc, argsOf){
  return runProductBatch(list, null, () => bulkRpc(rpc, list.map(argsOf)));
}
async function runProductBatch(list, fn, bulk){
  const session = getSession(); const errors = [];
  const err = (item, error) => errors.push((item.name || '') + ': ' + (item.friendly ? friendlyDeleteError(error.message) : error.message));
  await withLoadingOverlay((async () => {
    if(bulk){ (await bulk()).forEach((r, k) => { if(r.error) err(list[k], r.error); }); return; }
    await runPool(list, async item => { const { error } = await fn(session, item); if(error) err(item, error); });
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
  const errors = await runProductBulk(list, 'upsert_product', p => productPayload(p, { p_available: open }));
  if(errors.length) alert('Bazı ürünler güncellenemedi:\n\n' + errors.join('\n')); else showToast(list.length + (open ? ' ürün satışa açıldı ✓' : ' ürün satışa kapatıldı'));
}
async function bulkDeleteProducts(){
  const ids = selectedProductIds(); if(!ids.length) return;
  const list = ids.map(id => APP.config.products.find(p => p.id===id)).filter(Boolean).map(p => ({ id: p.id, name: p.name, friendly: true }));
  if(!await uiConfirm(list.length + ' ürün silinsin mi?\n\n' + list.map(p => p.name).join(', '))) return;
  const errors = await runProductBulk(list, 'delete_product', p => ({ p_id: p.id }));
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
  noCostWarn(name, cost);
}
/* Maliyeti girilmemiş ürün: ayar açıksa sunucu ürünü satışa kapatır; kullanıcı uyarılır (elle açılabilir). */
function noCostWarn(name, cost){
  if(Number(cost) > 0) return;
  showToast(APP.config.close_no_cost !== false ? `⚠️ ${name}: maliyet girilmedi — ürün satışa kapalı geldi. Maliyeti girin ya da "Satışa Aç" ile açın.` : `⚠️ ${name}: maliyet girilmedi — kâr analizleri yanıltıcı olur.`, 7000);
}
/* Açma/kapama düğmesinin yanındaki "Açık/Kapalı" yazısını günceller. */
function switchLabel(el, on){ const em = el && el.closest('.oo-switch') && el.closest('.oo-switch').querySelector('em'); if(em) em.textContent = on ? 'Açık' : 'Kapalı'; }
async function toggleOrderShowClosed(on, el){
  const { error } = await sb.rpc('set_order_show_closed', { p_token: getSession().session_token, p_on: on });
  if(error){ if(el) el.checked = !on; alert(error.message); return; }
  APP.config.order_show_closed = on; switchLabel(el, on);
  showToast(on ? 'Satışa kapalı ürünler Sipariş Al ekranında görünecek' : 'Satışa kapalı ürünler Sipariş Al ekranında gizlenecek');
}
async function toggleCloseNoCost(on, el){
  const { error } = await sb.rpc('set_close_no_cost', { p_token: getSession().session_token, p_on: on });
  if(error){ if(el) el.checked = !on; alert(error.message); return; }
  APP.config.close_no_cost = on; switchLabel(el, on); showToast(on ? 'Maliyeti girilmemiş yeni ürünler satışa kapalı gelecek' : 'Maliyet kontrolü kapatıldı');
}

/* ---- Dinamik maliyet ----
   Reçeteli ürün: maliyet = reçetedeki hammaddelerin ağırlıklı ortalama alış maliyeti (fire dahil), sunucuda otomatik.
   Genel giderler (kira, personel, elektrik…) aylık toplamı ciroya oranlanır; ürünün tam maliyeti = malzeme + fiyat × oran. */
function overheadPct(){ return Number(APP.config && APP.config.overhead_pct) || 0; }
function fullCost(p){ return (Number(p.cost) || 0) + (Number(p.price) || 0) * overheadPct() / 100; }
function costSourceTag(p){
  return p.cost_source === 'recipe' ? '<span class="pchip" title="Reçeteden otomatik">🧾</span>' : p.cost_source === 'recipe_missing' ? '<span class="pchip warn" title="Reçetedeki bazı hammaddelerin maliyeti yok">⚠️</span>' : '';
}
const OH_PRESETS = [['🏠','Kira'],['⚡','Elektrik'],['💧','Su'],['🔥','Doğalgaz'],['🌐','İnternet & telefon'],['👥','Personel maaşları'],['🧾','Muhasebe'],['🧼','Temizlik'],['📣','Reklam'],['🛵','Kurye / yakıt'],['🔧','Bakım & onarım'],['💳','POS / banka komisyonu']];
const OH_PERIOD = { daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık', yearly: 'Yıllık' };
async function openOverheads(){
  const { data, error } = await withLoadingOverlay(sb.rpc('get_overheads', { p_token: getSession().session_token }));
  if(error){ alert(error.message); return; }
  APP.overheads = data;
  if(!document.getElementById('ohSheet')) document.body.insertAdjacentHTML('beforeend', sheetHtml('ohSheet', '📊', 'Maliyet & Giderler', '<div id="ohBody"></div>', 'var(--c2)'));
  renderOverheads(); openSheet('ohSheet');
}
function renderOverheads(){
  const d = APP.overheads || {}, el = document.getElementById('ohBody'); if(!el) return;
  const base = d.revenue_base || d.revenue_30d || 0;
  el.innerHTML = `<div class="oh-sum">
      <div class="oh-k"><small>Aylık genel gider</small><b>${money(d.monthly_total || 0)}</b></div>
      <div class="oh-k"><small>${d.revenue_base ? 'Aylık ciro (girilen)' : 'Son 30 gün ciro'}</small><b>${money(base)}</b></div>
      <div class="oh-k hi"><small>Ürünlere eklenen pay</small><b>${d.pct != null ? '%' + d.pct : '—'}</b></div></div>
    <p class="muted oh-note">Her ürünün tam maliyeti = <b>reçete/malzeme maliyeti</b> + <b>satış fiyatı × %${d.pct != null ? d.pct : '?'}</b>. Örn. 100 TL'lik üründe ${money((d.pct || 0))} genel gider payı.</p>
    <div class="oh-list">
      <label class="oh-row oh-auto"><span class="oh-ic">👥</span><div><b>Personel (vardiya kayıtlarından)</b><small>Son 30 gün çalışılan saat × saatlik ücret${d.labor_staff ? ' · ' + d.labor_staff + ' kişi' : ' · saatlik ücret girilmiş personel yok'}</small></div>
        <b>${money(d.labor_30d || 0)}</b><span class="oo-switch"><input type="checkbox" ${d.auto_labor ? 'checked' : ''} ${actOn('change','toggleOhLabor',['$checked'])}><span class="oo-track"><span class="oo-thumb"></span></span></span></label>
      ${(d.items || []).map(i => `<div class="oh-row ${i.active ? '' : 'off'}"><span class="oh-ic">${escapeHtml(i.icon || '💸')}</span><div><b>${escapeHtml(i.name)}</b><small>${money(i.amount)} · ${OH_PERIOD[i.period] || i.period}${i.period !== 'monthly' ? ' → aylık ' + money(i.monthly) : ''}${i.active ? '' : ' · hesaba katılmıyor'}</small></div>
        <b>${money(i.monthly)}</b><span class="oh-acts"><button type="button" class="pc-btn" ${act('editOverhead', i.id)}>✏️</button><button type="button" class="pc-btn" ${act('removeOverhead', i.id)}>🗑️</button></span></div>`).join('')}
    </div>
    <div class="oh-add-h">➕ Gider ekle</div>
    <div class="oh-presets">${OH_PRESETS.filter(([, n]) => !(d.items || []).some(i => i.name === n)).map(([ic, n]) => `<button type="button" class="rvf-chip" ${act('editOverhead', null, ic, n)}>${ic} ${n}</button>`).join('')}<button type="button" class="rvf-chip" ${act('editOverhead', null, '💸', '')}>✍️ Diğer</button></div>
    <div id="ohForm"></div>
    <details class="oh-adv"><summary>⚙️ Ciro tabanı</summary>
      <p class="muted">Gider oranı varsayılan olarak <b>son 30 günün cirosuna</b> göre hesaplanır. Yeni açıldıysanız ya da mevsimsel dalgalanma varsa beklenen aylık ciroyu girin.</p>
      <div style="display:flex;gap:8px;"><input type="number" id="ohBase" min="1" placeholder="Son 30 gün: ${money(d.revenue_30d || 0)}" value="${d.revenue_base || ''}" style="flex:1;margin:0;"><button type="button" class="u-wa-m0" ${act('saveOhBase')}>Kaydet</button></div></details>`;
}
function editOverhead(id, icon, name){
  const it = id ? ((APP.overheads && APP.overheads.items) || []).find(x => x.id === id) : { icon, name, amount: '', period: 'monthly', active: true };
  if(!it) return;
  document.getElementById('ohForm').innerHTML = `<div class="oh-form" data-id="${id || ''}">
    <div style="display:flex;gap:8px;"><input id="ohIc" value="${escapeAttr(it.icon || '💸')}" maxlength="4" style="width:56px;text-align:center;margin:0;"><input id="ohName" value="${escapeAttr(it.name || '')}" placeholder="Gider adı (örn. Kira)" style="flex:1;margin:0;"></div>
    <div style="display:flex;gap:8px;margin-top:8px;"><input id="ohAmt" type="number" min="0" inputmode="decimal" value="${it.amount}" placeholder="Tutar ₺" style="flex:1;margin:0;">
      <select id="ohPer" style="width:auto;margin:0;">${Object.entries(OH_PERIOD).map(([k, l]) => `<option value="${k}" ${it.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <label class="pdrawer-check" style="margin-top:8px;"><input type="checkbox" id="ohAct" ${it.active !== false ? 'checked' : ''}> Maliyete dahil et</label>
    <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('cancelOhForm')}>Vazgeç</button><button ${act('saveOverhead')}>Kaydet</button></div></div>`;
  const f = document.getElementById(it.name ? 'ohAmt' : 'ohName'); if(f) f.focus();
}
function cancelOhForm(){ const f = document.getElementById('ohForm'); if(f) f.innerHTML = ''; }
async function ohApply(res){
  if(res.error){ alert(res.error.message); return false; }
  APP.overheads = res.data; if(APP.config) APP.config.overhead_pct = res.data.pct;
  renderOverheads();
  if(APP.view === 'settings') renderSettingsContent(getSession());
  return true;
}
async function saveOverhead(){
  const f = document.querySelector('.oh-form'); if(!f) return;
  const v = id => (document.getElementById(id) || {}).value;
  const ok = await ohApply(await sb.rpc('upsert_overhead_item', { p_token: getSession().session_token, p_id: f.dataset.id || null, p_name: v('ohName'), p_icon: v('ohIc'),
    p_amount: parseFloat(v('ohAmt')), p_period: v('ohPer'), p_active: document.getElementById('ohAct').checked }));
  if(ok) showToast('Gider kaydedildi ✓');
}
async function removeOverhead(id){
  if(!confirm('Bu gider kalemi silinsin mi?')) return;
  await ohApply(await sb.rpc('remove_overhead_item', { p_token: getSession().session_token, p_id: id }));
}
async function toggleOhLabor(on){
  const d = APP.overheads || {};
  await ohApply(await sb.rpc('set_overhead_settings', { p_token: getSession().session_token, p_revenue_base: d.revenue_base || null, p_auto_labor: on }));
}
async function saveOhBase(){
  const v = parseFloat((document.getElementById('ohBase') || {}).value);
  const ok = await ohApply(await sb.rpc('set_overhead_settings', { p_token: getSession().session_token, p_revenue_base: v > 0 ? v : null, p_auto_labor: (APP.overheads || {}).auto_labor !== false }));
  if(ok) showToast(v > 0 ? 'Aylık ciro tabanı kaydedildi ✓' : 'Son 30 gün cirosu kullanılacak');
}

async function openIngCostLog(id){
  const ing = ((APP.config && APP.config.ingredients) || []).find(x => x.id === id) || {};
  const { data, error } = await sb.rpc('get_ingredient_cost_log', { p_token: getSession().session_token, p_ingredient: id });
  if(error){ alert(error.message); return; }
  if(!document.getElementById('icSheet')) document.body.insertAdjacentHTML('beforeend', sheetHtml('icSheet', '📈', 'Maliyet geçmişi', '<div id="icBody"></div>', 'var(--c2)'));
  const u = escapeHtml(ing.unit || 'birim'), src = { purchase: '📦 Alış', manual: '✍️ Elle', price_fix: '🔧 Fiyat düzeltme' };
  document.getElementById('icSheetTitle').textContent = '📈 ' + (ing.name || 'Hammadde') + ' · maliyet geçmişi';
  document.getElementById('icBody').innerHTML = `<p class="muted" style="text-align:left;font-size:12.5px;margin:0 0 10px;">Yeni alış, eldeki stokla <b>ağırlıklı ortalanır</b>: (eldeki × eski maliyet + gelen × alış fiyatı) ÷ toplam.</p>
    ${(data || []).length ? `<div class="oh-list">${data.map(r => `<div class="oh-row" style="grid-template-columns:1fr auto;"><div><b>${src[r.source] || r.source}${r.qty != null ? ' · ' + Number(r.qty) + ' ' + u + (r.unit_price != null ? ' × ' + money(r.unit_price) : '') : ''}</b>
      <small>${new Date(r.at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${r.stock_before != null && r.source === 'purchase' ? ' · eldeki ' + Number(r.stock_before) + ' ' + u + (r.old != null ? ' × ' + money(r.old) : '') : ''}</small></div>
      <b>${r.old != null ? money(r.old) + ' → ' : ''}${money(r.new)}</b></div>`).join('')}</div>` : '<p class="muted">Henüz kayıt yok. Mal Kabul\'de fiyatlı teslim aldıkça burada görünür.</p>'}`;
  openSheet('icSheet');
}
