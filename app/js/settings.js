/* Ayarlar bölümü - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= AYARLAR ================= */
/* Her sekme ilgili settings_* iznini gerektirir; Roller sekmesi ise
   sadece Yönetici'ye (is_manager) açık - bir role bu yetkiyi vermek
   mümkün değil (bkz. manager_upsert_role'un izin backend'i). */
const SETTINGS_TABS = [
  { tab:'stations', perm:'settings_stations', label:'İstasyonlar' },
  { tab:'zones', perm:'settings_zones', label:'Bölgeler & Masalar' },
  { tab:'floorplan', perm:'settings_zones', feature:'floorplan', label:'🗺️ Kat Planı' },
  { tab:'products', perm:'settings_products', label:'Ürünler' },
  { tab:'ingredients', perm:'settings_ingredients', label:'Hammaddeler' },
  { tab:'flags', perm:'settings_flags', label:'Sipariş Etiketleri' },
  { tab:'users', perm:'settings_users', label:'Kullanıcılar' },
  { tab:'shifts', perm:'shifts', label:'Vardiyalar' },
  { tab:'billing', managerOnly:true, label:'💳 Abonelik' },
  { tab:'roles', managerOnly:true, label:'Roller' },
  { tab:'integrations', managerOnly:true, label:'Entegrasyonlar' },
  { tab:'giftcards', perm:'payments', label:'🎁 Hediye Kartları' },
];
function settingsTabVisible(t, session){
  if(t.feature && !hasFeature(t.feature)) return false;
  return t.managerOnly ? !!session.isManager : hasPerm(session, t.perm);
}
async function renderSettingsView(main, session){
  const { data, error } = await sb.rpc('get_restaurant_config', { p_token: session.session_token });
  if(error){ main.innerHTML = '<h1>Ayarlar</h1><p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  APP.config = data;
  const visibleTabs = SETTINGS_TABS.filter(t => settingsTabVisible(t, session));
  if(!visibleTabs.some(t => t.tab===APP.settingsTab)) APP.settingsTab = visibleTabs.length ? visibleTabs[0].tab : null;
  main.innerHTML = `<h1>Ayarlar</h1>
    <div class="tabs">
      ${visibleTabs.map(t => `<div class="tab ${APP.settingsTab===t.tab?'active':''}" data-tab="${t.tab}" onclick="setSettingsTab('${t.tab}')">${t.label}</div>`).join('')}
    </div>
    <div id="settingsContent"></div>`;
  renderSettingsContent(session);
}
function setSettingsTab(tab){
  APP.settingsTab = tab;
  document.querySelectorAll('.tabs .tab[data-tab]').forEach(el => el.classList.toggle('active', el.dataset.tab===tab));
  renderSettingsContent(getSession());
}
function renderSettingsContent(session){
  const el = document.getElementById('settingsContent'); if(!el) return;
  if(!APP.settingsTab){ el.innerHTML = '<p class="muted">Görüntüleme yetkiniz olan bir ayar bölümü yok.</p>'; return; }
  if(APP.settingsTab==='stations') renderStationsSettings(el, session);
  else if(APP.settingsTab==='zones') renderZonesSettings(el, session);
  else if(APP.settingsTab==='floorplan') renderFloorPlanSettings(el, session);
  else if(APP.settingsTab==='products') renderProductsSettings(el, session);
  else if(APP.settingsTab==='ingredients') renderIngredientsSettings(el, session);
  else if(APP.settingsTab==='flags') renderOrderFlagsSettings(el, session);
  else if(APP.settingsTab==='roles') renderRolesSettings(el, session);
  else if(APP.settingsTab==='integrations') renderIntegrationsSettings(el, session);
  else if(APP.settingsTab==='giftcards') renderGiftCardsSettings(el, session);
  else if(APP.settingsTab==='shifts') renderShiftsSettings(el, session);
  else if(APP.settingsTab==='billing') renderBillingSettings(el, session);
  else renderUsersSettings(el, session);
}

/* --- Sipariş Etiketleri (Personel Yemeği, İkram vb. checkbox'lar) --- */
function renderOrderFlagsSettings(el, session){
  const flags = APP.config.order_flags || [];
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Sipariş Etiketleri</h2>
    <p class="muted" style="text-align:left;margin:0 0 16px;">Sipariş al ekranında, siparişi mutfağa göndermeden önce işaretlenebilecek checkbox'lar (örn. "Personel Yemeği", "İkram"). İşaretlenen siparişlerde stok yine düşer, ama Finansal Analiz'deki ciro/net kârdan hariç tutulup ayrı bir toplam olarak gösterilir. İstediğiniz kadar etiket ekleyebilirsiniz.</p>
    <div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Etiket</th><th></th></tr></thead>
      <tbody>
      ${flags.map(f => `
        <tr>
          <td class="col-name"><input value="${escapeHtml(f.label)}" id="flag_label_${f.id}"></td>
          <td style="white-space:nowrap;">
            <button class="sbtn" onclick="saveOrderFlag('${f.id}')">Kaydet</button>
            <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="removeOrderFlag('${f.id}')">Sil</button>
          </td>
        </tr>`).join('')}
      ${flags.length===0 ? '<tr><td colspan="2" class="muted" style="padding:10px 4px;">Henüz etiket eklenmedi.</td></tr>' : ''}
      </tbody>
    </table>
    </div>
    <div class="add-row-panel">
      <p>Yeni Etiket Ekle</p>
      <div style="display:flex;gap:10px;align-items:end;">
        <div class="field-group" style="flex:1;"><label>Etiket Adı</label><input id="nf_label" placeholder="örn. Personel Yemeği"></div>
        <button style="max-width:160px;" onclick="addOrderFlag()">+ Etiket Ekle</button>
      </div>
    </div>
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
  if(!confirm('Bu etiket silinsin mi?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_order_flag', { p_token: session.session_token, p_flag_id: id });
  if(error){ alert(error.message); return; }
  await renderSettingsView(document.getElementById('main'), session);
}

/* --- Hammaddeler (reçete tabanlı stok) --- */
function renderIngredientsSettings(el, session){
  const ings = APP.config.ingredients || [];
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Hammaddeler / Stok Kalemleri</h2>
    <p class="muted" style="text-align:left;margin:0 0 16px;">Örn: "Köfte" (birim: adet, stok: 200), "Döner Eti" (birim: kg, stok: 20). Yeni bir hammadde eklediğinizde hangi ürünlerin onu kullandığını hemen soracağız — istediğiniz zaman "Kullanıldığı Ürünler" ile bunu tekrar düzenleyebilirsiniz. Aynı hammaddeyi paylaşan ürünlerin stoğu her zaman ortak ve anlık hesaplanır.</p>
    <div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Hammadde Adı</th><th>Birim</th><th>Stok</th><th></th></tr></thead>
      <tbody>
      ${ings.map(i => `
        <tr>
          <td class="col-name"><input value="${escapeHtml(i.name)}" id="ing_name_${i.id}"></td>
          <td class="col-num"><select id="ing_unit_${i.id}">
            ${['adet','gram','kg','ml','lt'].map(u => `<option value="${u}" ${u===i.unit?'selected':''}>${u}</option>`).join('')}
          </select></td>
          <td class="col-num"><input type="number" step="0.01" value="${i.stock}" id="ing_stock_${i.id}"></td>
          <td style="white-space:nowrap;">
            <button class="sbtn" onclick="saveIngredient('${i.id}')">Kaydet</button>
            <button class="sbtn" style="background:var(--accent2);color:var(--btn-ink);" onclick="openIngredientUsageModal('${i.id}',${jsArg(i.name)})">Kullanıldığı Ürünler</button>
            <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="removeIngredient('${i.id}')">Sil</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>
    <div class="add-row-panel">
      <p>Yeni Hammadde Ekle</p>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;align-items:end;">
        <div class="field-group"><label>Hammadde Adı</label><input id="ni_name" placeholder="örn. Döner Eti"></div>
        <div class="field-group"><label>Birim</label><select id="ni_unit">
          <option value="adet">adet</option><option value="gram">gram</option><option value="kg">kg</option><option value="ml">ml</option><option value="lt">lt</option>
        </select></div>
        <div class="field-group"><label>Başlangıç Stoku</label><input type="number" step="0.01" id="ni_stock" placeholder="0"></div>
      </div>
      <button style="margin-top:12px;max-width:220px;" onclick="addIngredient()">+ Hammadde Ekle</button>
    </div>
  </div>`;
}
async function saveIngredient(id){
  const session = getSession();
  const name = document.getElementById('ing_name_'+id).value.trim();
  const unit = document.getElementById('ing_unit_'+id).value;
  const stock = parseFloat(document.getElementById('ing_stock_'+id).value)||0;
  const { error } = await sb.rpc('upsert_ingredient', { p_token: session.session_token, p_id: id, p_name: name, p_unit: unit, p_stock: stock });
  if(error){ alert(error.message); return; }
  renderSettingsView(document.getElementById('main'), session);
  showToast('Kaydedildi ✓');
}
async function addIngredient(){
  const session = getSession();
  const name = document.getElementById('ni_name').value.trim();
  const unit = document.getElementById('ni_unit').value;
  const stock = parseFloat(document.getElementById('ni_stock').value)||0;
  if(!name) return;
  const { data, error } = await sb.rpc('upsert_ingredient', { p_token: session.session_token, p_id: null, p_name: name, p_unit: unit, p_stock: stock });
  if(error){ alert(error.message); return; }
  await renderSettingsView(document.getElementById('main'), session);
  // Hammadde eklenir eklenmez, hangi urunlerin kullandigini sormaya devam et.
  if(data) openIngredientUsageModal(data, name);
}
async function removeIngredient(id){
  if(!confirm('Bu hammaddeyi silmek istediğinize emin misiniz? Buna bağlı reçeteler de silinir.')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_ingredient', { p_token: session.session_token, p_id: id });
  if(error){ alert(friendlyDeleteError(error.message)); return; }
  renderSettingsView(document.getElementById('main'), session);
}

/* --- Bir hammaddeyi hangi urunlerin kullandigini duzenleme penceresi
   (hammadde tarafindan bakis - ekledigimiz/duzenledigimiz hammaddeyi
   birden fazla urune tek seferde atayabilmek icin) --- */
function openIngredientUsageModal(ingredientId, ingredientName){
  const products = APP.config.products || [];
  const bg = document.createElement('div');
  bg.id = 'ingUsageModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:480px;width:100%;max-height:88vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">${escapeHtml(ingredientName)} - Kullanıldığı Ürünler</h2><span style="cursor:pointer;color:var(--muted);" onclick="document.getElementById('ingUsageModalBg').remove()">✕</span></div>
    <p class="muted" style="text-align:left;">Bu hammaddeyi hangi ürünler kullanıyor, 1 porsiyonda ne kadar tüketiliyor? Seçmediğiniz ürünlerden bu hammadde kaldırılır (o ürünlerin diğer hammaddeleri etkilenmez).</p>
    <div id="ingUsageItemsBox"></div>
    <button style="margin-top:14px;" onclick="saveIngredientUsage('${ingredientId}')">Kaydet</button>
  </div>`;
  document.body.appendChild(bg);
  const box = document.getElementById('ingUsageItemsBox');
  box.innerHTML = products.length===0 ? '<p class="muted">Henüz ürün eklenmemiş.</p>' : products.map(p => {
    const existing = (p.recipe||[]).find(r => r.ingredient_id===ingredientId);
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <input type="checkbox" id="ingu_chk_${p.id}" ${existing?'checked':''} onchange="document.getElementById('ingu_qty_${p.id}').disabled=!this.checked" style="width:auto;margin:0;">
      <span style="flex:1;">${escapeHtml(p.name)}</span>
      <input type="number" step="0.01" min="0" id="ingu_qty_${p.id}" value="${existing?existing.qty_per_unit:''}" placeholder="Miktar/porsiyon" ${existing?'':'disabled'} style="width:130px;margin:0;">
    </div>`;
  }).join('');
}
async function saveIngredientUsage(ingredientId){
  const session = getSession();
  const products = APP.config.products || [];
  const usages = [];
  products.forEach(p => {
    const chk = document.getElementById('ingu_chk_'+p.id);
    if(chk && chk.checked){
      const qty = parseFloat(document.getElementById('ingu_qty_'+p.id).value);
      if(qty && qty>0) usages.push({ product_id: p.id, qty_per_unit: qty });
    }
  });
  const { error } = await sb.rpc('set_ingredient_usage', { p_token: session.session_token, p_ingredient_id: ingredientId, p_usages: usages });
  if(error){ alert(error.message); return; }
  document.getElementById('ingUsageModalBg').remove();
  showToast('Kaydedildi ✓');
  renderSettingsView(document.getElementById('main'), session);
}

/* --- Bir ürünün reçetesini düzenleme penceresi --- */
let RECIPE_DRAFT = [];
function openRecipeModal(productId){
  const prod = APP.config.products.find(p => p.id===productId);
  RECIPE_DRAFT = (prod.recipe || []).map(r => ({ ingredient_id: r.ingredient_id, qty_per_unit: r.qty_per_unit, ingredient_name: r.ingredient_name, ingredient_unit: r.ingredient_unit }));
  const bg = document.createElement('div');
  bg.id = 'recipeModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:440px;width:100%;max-height:88vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">${escapeHtml(prod.name)} - Reçete</h2><span style="cursor:pointer;color:var(--muted);" onclick="document.getElementById('recipeModalBg').remove()">✕</span></div>
    <p class="muted" style="text-align:left;">Bu üründen 1 porsiyon satıldığında hangi hammaddeden ne kadar düşsün?</p>
    <div id="recipeItemsBox"></div>
    <div style="background:var(--panel2);border-radius:10px;padding:12px;margin-top:12px;">
      <div style="display:flex;gap:8px;">
        <select id="recipeIngSelect" style="flex:1;margin:0;">
          ${(APP.config.ingredients||[]).map(i => `<option value="${i.id}" data-unit="${i.unit}" data-name="${escapeHtml(i.name)}">${escapeHtml(i.name)} (${i.unit})</option>`).join('')}
        </select>
        <input type="number" step="0.01" id="recipeQtyInput" placeholder="Miktar" style="width:100px;margin:0;">
        <button style="width:auto;padding:8px 12px;margin:0;" onclick="addRecipeItem('${productId}')">Ekle</button>
      </div>
    </div>
    <button style="margin-top:14px;" onclick="saveRecipe('${productId}')">Reçeteyi Kaydet</button>
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
        <span style="cursor:pointer;color:var(--red);" onclick="removeRecipeItem(${idx})">✕</span>
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
  const items = RECIPE_DRAFT.map(r => ({ ingredient_id: r.ingredient_id, qty_per_unit: r.qty_per_unit }));
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
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">${escapeHtml(prod.name)} - Çeviriler</h2><span style="cursor:pointer;color:var(--muted);" onclick="document.getElementById('translationsModalBg').remove()">✕</span></div>
    <p class="muted" style="text-align:left;">Boş bıraktığınız diller için QR menüde Türkçe ad gösterilir.</p>
    ${QR_MENU_LANGUAGES.map(l => `<div class="field-group"><label>${l.label}</label><input id="tr_${l.code}_${productId}" value="${escapeHtml(translations[l.code]||'')}" placeholder="${escapeHtml(prod.name)}"></div>`).join('')}
    <button style="margin-top:14px;" onclick="saveTranslations('${productId}')">Çevirileri Kaydet</button>
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
const STATION_ICON_CHOICES = ['🍳','🍕','🍔','🍖','🥩','🍗','🍟','🌭','🥪','🌮','🥗','🍜','🍲','🍝','🍣','🍱','🥟','🍞','🥐','🧁','🍰','🍦','☕','🍵','🧋','🍹','🍺','🥤','🔥','🔪'];
function stationIconPickerHtml(id, current, extraStyle){
  const cur = current || '🍳';
  return `<input type="hidden" id="${id}" value="${cur}">
    <button type="button" class="icon-pick-btn" id="${id}_btn" style="${extraStyle||''}" onclick="openIconPicker('${id}')">${cur}</button>`;
}
function openIconPicker(targetId){
  const current = document.getElementById(targetId).value;
  const bg = document.createElement('div');
  bg.id = 'iconPickerBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;';
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:360px;width:100%;max-height:80vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="margin:0;">İkon Seç</h3>
      <span style="cursor:pointer;color:var(--muted);font-size:20px;" onclick="document.getElementById('iconPickerBg').remove()">✕</span>
    </div>
    <div class="icon-picker-grid">
      ${STATION_ICON_CHOICES.map(ic => `<div class="icon-picker-item ${ic===current?'selected':''}" onclick="pickStationIcon('${targetId}','${ic}')">${ic}</div>`).join('')}
    </div>
  </div>`;
  bg.addEventListener('click', (e) => { if(e.target===bg) bg.remove(); });
  document.body.appendChild(bg);
}
function pickStationIcon(targetId, icon){
  document.getElementById(targetId).value = icon;
  const btn = document.getElementById(targetId+'_btn');
  if(btn) btn.textContent = icon;
  const bg = document.getElementById('iconPickerBg');
  if(bg) bg.remove();
}
function stationRowActionBtn(icon, title, color, onclick){
  return `<button type="button" title="${title}" onclick="${onclick}" style="width:38px;height:38px;flex-shrink:0;border-radius:10px;border:1px solid var(--border);background:var(--panel);color:${color||'var(--text)'};cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;padding:0;margin:0;">${icon}</button>`;
}
function renderStationsSettings(el, session){
  const rowHtml = (s) => `
    <div style="display:flex;align-items:center;gap:12px;background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px 12px;flex-wrap:wrap;">
      ${stationIconPickerHtml('st_icon_'+s.id, s.icon||'🍳', `border-radius:50%;background:${s.color}26;border-color:${s.color};`)}
      <input value="${escapeHtml(s.name)}" id="st_name_${s.id}" placeholder="İstasyon adı" style="flex:1;min-width:120px;margin:0;font-weight:700;">
      <input type="color" value="${s.color}" id="st_color_${s.id}" title="Renk" style="padding:2px;height:38px;width:42px;flex-shrink:0;margin:0;">
      ${stationRowActionBtn('💾','Kaydet','var(--accent)',`saveStation('${s.id}')`)}
      ${stationRowActionBtn('🗑️','Sil','var(--red)',`removeStation('${s.id}')`)}
    </div>`;
  el.innerHTML = `<div class="box" style="max-width:none;">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
      <h2 style="margin:0;">Mutfak İstasyonları</h2>
      <span class="muted" style="font-size:12px;">${APP.config.stations.length} istasyon</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${APP.config.stations.map(rowHtml).join('')}
      <div style="display:flex;align-items:center;gap:12px;background:transparent;border:1.5px dashed var(--border);border-radius:12px;padding:10px 12px;flex-wrap:wrap;">
        ${stationIconPickerHtml('newStIcon','🍳', 'border-radius:50%;')}
        <input id="newStName" placeholder="Yeni istasyon adı (örn. Fırın)" style="flex:1;min-width:160px;margin:0;">
        <input type="color" id="newStColor" value="#b6a48d" title="Renk" style="padding:2px;height:38px;width:42px;flex-shrink:0;margin:0;">
        <button style="width:auto;margin:0;padding:0 18px;height:38px;" onclick="addStation()">+ Ekle</button>
      </div>
    </div>
  </div>`;
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
  if(!confirm('İstasyonu silmek istediğinize emin misiniz?')) return;
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
function renderZonesSettings(el, session){
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Bölgeler ve Masalar</h2>
    ${APP.config.zones.map(z => `
      <div style="background:var(--panel2);border-radius:10px;padding:12px;margin-bottom:12px;">
        <div style="display:flex;gap:8px;align-items:center;">
          <input value="${escapeHtml(z.name)}" id="zn_name_${z.id}" style="flex:1;font-weight:700;">
          <button style="width:auto;padding:8px 12px;" onclick="saveZone('${z.id}')">Kaydet</button>
          <button style="width:auto;padding:8px 12px;background:var(--red);" onclick="removeZone('${z.id}')">Sil</button>
        </div>
        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">
          ${z.tables.map(t => `<span style="background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:5px 10px;font-size:12px;display:flex;align-items:center;gap:6px;">
            ${escapeHtml(t.name)}
            <span style="cursor:pointer;color:var(--accent);" title="QR Menü Kodu" onclick="showTableQr(${jsArg(t.name)},'${t.qr_token}')">▦</span>
            <span style="cursor:pointer;color:var(--red);" onclick="removeTable('${t.id}')">✕</span></span>`).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <input id="newTable_${z.id}" placeholder="Yeni masa adı" style="flex:1;">
          <button style="width:auto;padding:8px 12px;" onclick="addTable('${z.id}')">+ Masa</button>
        </div>
      </div>`).join('')}
    <div style="display:flex;gap:8px;">
      <input id="newZoneName" placeholder="Yeni bölge adı" style="flex:1;">
      <button style="width:auto;padding:8px 14px;" onclick="addZone()">+ Bölge Ekle</button>
    </div>
  </div>`;
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
  if(!confirm('Bölgeyi ve içindeki masaları silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_zone', { p_token: session.session_token, p_id: id });
  if(error){ alert(friendlyDeleteError(error.message)); return; }
  renderSettingsView(document.getElementById('main'), session);
}
async function addTable(zoneId){
  const session = getSession();
  const name = document.getElementById('newTable_'+zoneId).value.trim();
  if(!name) return;
  const { error } = await sb.rpc('upsert_table', { p_token: session.session_token, p_id: null, p_zone_id: zoneId, p_name: name });
  if(error){ alert(error.message); return; }
  renderSettingsView(document.getElementById('main'), session);
}
async function removeTable(id){
  if(!confirm('Masayı silmek istediğinize emin misiniz?')) return;
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
        ${z.tables.length===0 ? '<p class="muted">Bu bölgede masa yok.</p>' : `<div class="floorplan-canvas floorplan-editor" id="fpEdit_${z.id}" style="height:320px;"></div>`}
      </div>`).join('')}
    ${zones.length===0 ? '<p class="muted">Önce Bölgeler &amp; Masalar sekmesinden bölge/masa ekleyin.</p>' : ''}
  </div>`;
  zones.forEach(z => { if(z.tables.length>0) renderFloorPlanEditorCanvas(z); });
}
function renderFloorPlanEditorCanvas(zone){
  const canvas = document.getElementById('fpEdit_'+zone.id); if(!canvas) return;
  canvas.innerHTML = zone.tables.map(t => `<div class="floorplan-table" data-table-id="${t.id}" style="left:${Number(t.pos_x||0)}px;top:${Number(t.pos_y||0)}px;">${escapeHtml(t.name)}</div>`).join('');
  canvas.querySelectorAll('.floorplan-table').forEach(elx => {
    elx.addEventListener('pointerdown', (ev) => startTableDrag(ev, elx));
  });
}
let FP_DRAG = null;
function startTableDrag(ev, elx){
  ev.preventDefault();
  FP_DRAG = { elx, startX: ev.clientX, startY: ev.clientY, startLeft: parseFloat(elx.style.left)||0, startTop: parseFloat(elx.style.top)||0, tableId: elx.dataset.tableId };
  elx.classList.add('dragging');
  elx.setPointerCapture(ev.pointerId);
  elx.addEventListener('pointermove', onTableDragMove);
  elx.addEventListener('pointerup', onTableDragEnd);
  elx.addEventListener('pointercancel', onTableDragEnd);
}
function onTableDragMove(ev){
  if(!FP_DRAG) return;
  const dx = ev.clientX - FP_DRAG.startX;
  const dy = ev.clientY - FP_DRAG.startY;
  FP_DRAG.elx.style.left = Math.max(0, FP_DRAG.startLeft + dx) + 'px';
  FP_DRAG.elx.style.top = Math.max(0, FP_DRAG.startTop + dy) + 'px';
}
async function onTableDragEnd(ev){
  if(!FP_DRAG) return;
  const { elx, tableId } = FP_DRAG;
  elx.classList.remove('dragging');
  elx.removeEventListener('pointermove', onTableDragMove);
  elx.removeEventListener('pointerup', onTableDragEnd);
  elx.removeEventListener('pointercancel', onTableDragEnd);
  const posX = Math.round(parseFloat(elx.style.left)||0);
  const posY = Math.round(parseFloat(elx.style.top)||0);
  FP_DRAG = null;
  const session = getSession();
  const { error } = await sb.rpc('update_table_positions', { p_token: session.session_token, p_positions: [{ id: tableId, pos_x: posX, pos_y: posY }] });
  if(error){ showToast('Konum kaydedilemedi: '+error.message); return; }
  APP.config.zones.forEach(z => z.tables.forEach(t => { if(t.id===tableId){ t.pos_x = posX; t.pos_y = posY; } }));
}
/* Her masanın kendi QR token'ı var (bkz. restaurant_tables.qr_token) - bu
   linki tarayan müşteri login gerektirmeyen /menu/ sayfasında o masanın
   menüsünü görür ve sipariş isteği gönderebilir (bkz. get_public_menu/
   submit_customer_order_request, personel tarafında onay için bkz.
   refreshCustomerOrderRequests). */
function showTableQr(tableName, qrToken){
  const url = window.location.origin + '/menu/?t=' + qrToken;
  const qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(url);
  const bg = document.createElement('div');
  bg.id = 'tableQrModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:320px;width:100%;text-align:center;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">${escapeHtml(tableName)}</h2><span style="cursor:pointer;color:var(--muted);" onclick="document.getElementById('tableQrModalBg').remove()">✕</span></div>
    <img src="${qrImgUrl}" alt="QR" style="width:100%;max-width:260px;margin:14px 0;border-radius:8px;background:#fff;padding:8px;">
    <p class="muted" style="font-size:12px;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(url)}</p>
    <button style="margin-top:8px;" onclick="navigator.clipboard.writeText(${jsArg(url)}).then(()=>showToast('Link kopyalandı ✓'))">🔗 Linki Kopyala</button>
  </div>`;
  document.body.appendChild(bg);
}

/* --- Ürünler --- */
function renderProductsSettings(el, session){
  const stations = APP.config.stations || [];
  const products = APP.config.products || [];

  const rowsFor = (list) => list.map(p => `
        <tr>
          <td class="col-name"><input value="${escapeHtml(p.name)}" id="pr_name_${p.id}"></td>
          <td class="col-name"><select id="pr_st_${p.id}">
            ${stations.map(s => `<option value="${s.id}" ${s.id===p.station_id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
          </select></td>
          <td class="col-num"><input type="number" value="${p.price}" id="pr_price_${p.id}"></td>
          <td class="col-num"><input type="number" value="${p.cost}" id="pr_cost_${p.id}"></td>
          <td class="col-num">
            ${(p.recipe && p.recipe.length>0)
              ? `<span class="muted" style="font-size:12px;">Reçeteli (${p.available_qty==null?'?':p.available_qty} porsiyon)</span>`
              : `<input type="number" value="${p.stock==null?'':p.stock}" id="pr_stock_${p.id}" placeholder="Sınırsız">`}
          </td>
          <td>${p.available===false
              ? '<span class="role-badge" style="color:var(--red);border-color:var(--red);">Kapalı</span>'
              : '<span class="role-badge" style="color:var(--green);border-color:var(--green);">Satışta</span>'}</td>
          <td style="white-space:normal;">
            <button class="sbtn" onclick="saveProduct('${p.id}')">Kaydet</button>
            <button class="sbtn" style="background:${p.available===false?'var(--green)':'var(--panel)'};color:${p.available===false?'var(--btn-ink)':'var(--text)'};border:1.5px solid var(--border);" onclick="toggleProductAvailable('${p.id}')">${p.available===false?'Aç':'Kapat'}</button>
            <button class="sbtn" style="background:var(--accent2);color:var(--btn-ink);" onclick="openRecipeModal('${p.id}')">Reçete</button>
            ${hasFeature('multilang_menu') ? `<button class="sbtn" style="background:#6366f1;color:#fff;" onclick="openTranslationsModal('${p.id}')" title="QR menüde diğer dillerde gösterilecek isim">🌐 Çeviri</button>` : ''}
            <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="removeProduct('${p.id}')">Sil</button>
          </td>
        </tr>`).join('');

  const groupHtml = (title, colorDot, list) => list.length===0 ? '' : `
    <div style="margin-bottom:22px;">
      <h3 style="display:flex;align-items:center;gap:8px;font-size:14px;margin:0 0 10px;">${colorDot?`<span style="width:10px;height:10px;border-radius:50%;background:${colorDot};display:inline-block;flex-shrink:0;"></span>`:''}${escapeHtml(title)}<span class="muted" style="font-weight:400;">(${list.length})</span></h3>
      <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>Ürün Adı</th><th>İstasyon</th><th>Fiyat</th><th>Maliyet</th><th>Stok</th><th>Durum</th><th></th></tr></thead>
        <tbody>${rowsFor(list)}</tbody>
      </table>
      </div>
    </div>`;

  const unassigned = products.filter(p => !stations.some(s => s.id===p.station_id));

  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Ürünler</h2>
    <p class="muted" style="text-align:left;margin:0 0 16px;">Stok alanını boş bırakırsanız o ürün için stok takibi yapılmaz. "Kapat" ile bir ürünü geçici olarak siparişe kapatabilirsiniz.</p>
    ${stations.map(s => groupHtml(s.name, s.color, products.filter(p => p.station_id===s.id))).join('')}
    ${groupHtml('İstasyonsuz', null, unassigned)}

    <div class="add-row-panel">
      <p>Yeni Ürün Ekle</p>
      <div style="display:grid;grid-template-columns:2fr 1.4fr 1fr 1fr 1fr;gap:10px;align-items:end;">
        <div class="field-group"><label>Ürün Adı</label><input id="np_name" placeholder="örn. Izgara Köfte"></div>
        <div class="field-group"><label>İstasyon</label><select id="np_station">${APP.config.stations.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select></div>
        <div class="field-group"><label>Fiyat (₺)</label><input type="number" id="np_price" placeholder="0"></div>
        <div class="field-group"><label>Maliyet (₺)</label><input type="number" id="np_cost" placeholder="0"></div>
        <div class="field-group"><label>Stok</label><input type="number" id="np_stock" placeholder="Sınırsız (reçete eklerseniz bu alan kullanılmaz)"></div>
      </div>
      <div style="background:var(--panel);border-radius:10px;padding:12px;margin-top:14px;">
        <p class="muted" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin:0 0 8px;">Reçete (opsiyonel) — ürünü kaydederken hemen tanımlayın</p>
        <div id="npRecipeItemsBox"></div>
        ${(APP.config.ingredients||[]).length===0
          ? '<p class="muted" style="font-size:12px;">Önce Hammaddeler sekmesinden en az bir hammadde ekleyin.</p>'
          : `<div style="display:flex;gap:8px;margin-top:8px;">
              <select id="npRecipeIngSelect" style="flex:1;margin:0;">
                ${APP.config.ingredients.map(i => `<option value="${i.id}" data-unit="${i.unit}" data-name="${escapeHtml(i.name)}">${escapeHtml(i.name)} (${i.unit})</option>`).join('')}
              </select>
              <input type="number" step="0.01" id="npRecipeQtyInput" placeholder="Miktar" style="width:100px;margin:0;">
              <button style="width:auto;padding:8px 12px;margin:0;" onclick="addNewProductRecipeItem()">Ekle</button>
            </div>`}
      </div>
      <button style="margin-top:12px;max-width:220px;" onclick="addProduct()">+ Ürün Ekle</button>
    </div>
  </div>`;
  NEW_PRODUCT_RECIPE_DRAFT = [];
  renderNewProductRecipeItems();
}
let NEW_PRODUCT_RECIPE_DRAFT = [];
function renderNewProductRecipeItems(){
  const el = document.getElementById('npRecipeItemsBox'); if(!el) return;
  el.innerHTML = NEW_PRODUCT_RECIPE_DRAFT.length===0 ? '<p class="muted" style="font-size:12px;">Henüz hammadde eklenmedi (reçete eklemezseniz bu ürün basit stok sayacı kullanır).</p>' :
    NEW_PRODUCT_RECIPE_DRAFT.map((r,idx) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:13px;">
        <span>${escapeHtml(r.ingredient_name)}: <b>${r.qty_per_unit} ${r.ingredient_unit}</b></span>
        <span style="cursor:pointer;color:var(--red);" onclick="removeNewProductRecipeItem(${idx})">✕</span>
      </div>`).join('');
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
async function saveProduct(id){
  const session = getSession();
  const prod = APP.config.products.find(p => p.id===id);
  const name = document.getElementById('pr_name_'+id).value.trim();
  const stationId = document.getElementById('pr_st_'+id).value;
  const price = parseFloat(document.getElementById('pr_price_'+id).value)||0;
  const cost = parseFloat(document.getElementById('pr_cost_'+id).value)||0;
  const stockEl = document.getElementById('pr_stock_'+id);
  let stock = prod.stock;
  if(stockEl){ const raw = stockEl.value.trim(); stock = raw==='' ? null : parseInt(raw,10); }
  const { error } = await sb.rpc('upsert_product', { p_token: session.session_token, p_id: id, p_station_id: stationId, p_name: name, p_price: price, p_cost: cost, p_stock: stock, p_available: prod.available!==false });
  if(error){ alert(error.message); return; }
  renderSettingsView(document.getElementById('main'), session);
  showToast('Kaydedildi ✓');
}
async function toggleProductAvailable(id){
  const session = getSession();
  const prod = APP.config.products.find(p => p.id===id);
  const newAvailable = prod.available===false ? true : false;
  const { error } = await sb.rpc('upsert_product', { p_token: session.session_token, p_id: id, p_station_id: prod.station_id, p_name: prod.name, p_price: prod.price, p_cost: prod.cost, p_stock: prod.stock, p_available: newAvailable });
  if(error){ alert(error.message); return; }
  prod.available = newAvailable;
  renderSettingsView(document.getElementById('main'), session);
}
async function addProduct(){
  const session = getSession();
  const name = document.getElementById('np_name').value.trim();
  const stationId = document.getElementById('np_station').value;
  const price = parseFloat(document.getElementById('np_price').value)||0;
  const cost = parseFloat(document.getElementById('np_cost').value)||0;
  const stockRaw = document.getElementById('np_stock').value.trim();
  const stock = stockRaw==='' ? null : parseInt(stockRaw,10);
  if(!name) return;
  const { data: newId, error } = await sb.rpc('upsert_product', { p_token: session.session_token, p_id: null, p_station_id: stationId, p_name: name, p_price: price, p_cost: cost, p_stock: stock, p_available: true });
  if(error){ alert(error.message); return; }
  if(newId && NEW_PRODUCT_RECIPE_DRAFT.length>0){
    const items = NEW_PRODUCT_RECIPE_DRAFT.map(r => ({ ingredient_id: r.ingredient_id, qty_per_unit: r.qty_per_unit }));
    const { error: recError } = await sb.rpc('set_recipe', { p_token: session.session_token, p_product_id: newId, p_items: items });
    if(recError){ alert('Ürün eklendi ama reçete kaydedilemedi: ' + recError.message); }
  }
  NEW_PRODUCT_RECIPE_DRAFT = [];
  renderSettingsView(document.getElementById('main'), session);
}
async function removeProduct(id){
  if(!confirm('Ürünü silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_product', { p_token: session.session_token, p_id: id });
  if(error){ alert(friendlyDeleteError(error.message)); return; }
  renderSettingsView(document.getElementById('main'), session);
}

/* --- Kullanıcılar --- */
/* Bir kullanıcıya en fazla 2 rol atanabilir (bkz. app_users.role_ids
   CHECK kısıtı ve create_staff_user/update_staff_user). Rol seçimi
   checkbox listesi olarak gösteriliyor, tek <select> yerine - çünkü
   artık roller sabit 3 tane değil, yöneticinin Roller sekmesinde
   tanımladığı sayıda ve isimde olabiliyor. */
function roleCheckboxes(idPrefix, selectedIds){
  const roles = (APP.config.roles||[]);
  return roles.map(r => `
    <label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:13px;margin-bottom:4px;">
      <input type="checkbox" id="${idPrefix}_role_${r.id}" value="${r.id}" data-roles-group="${idPrefix}" ${selectedIds.includes(r.id)?'checked':''} style="width:auto;margin:0;" onchange="enforceMaxTwoRoles('${idPrefix}')">
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
function renderUsersSettings(el, session){
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Kullanıcılar</h2>
    <div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Kullanıcı Adı</th><th>Yeni Şifre</th><th>Roller (en fazla 2)</th><th></th></tr></thead>
      <tbody>
      ${APP.config.users.map(u => `
        <tr>
          <td class="col-name"><input value="${escapeHtml(u.username)}" id="us_name_${u.id}"></td>
          <td class="col-name"><input type="password" placeholder="(değiştirmek için yaz)" id="us_pass_${u.id}"></td>
          <td class="col-name">${roleCheckboxes('us_'+u.id, u.role_ids||[])}</td>
          <td>
            <button class="sbtn" onclick="saveUser('${u.id}')">Kaydet</button>
            <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="removeUser('${u.id}')">Sil</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>
    <div class="add-row-panel">
      <p>Yeni Kullanıcı Ekle</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;align-items:start;">
        <div class="field-group"><label>Kullanıcı Adı</label><input id="nu_name" placeholder="örn. ahmet"></div>
        <div class="field-group"><label>Şifre</label><input id="nu_pass" placeholder="Şifre"></div>
        <div class="field-group"><label>Roller (en fazla 2)</label>${roleCheckboxes('nu', [])}</div>
      </div>
      <button style="margin-top:12px;max-width:220px;" onclick="addUser()">+ Kullanıcı Ekle</button>
    </div>
  </div>`;
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
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <span class="muted">Tarih Seç</span>
      <input type="date" id="shiftsDateInput" value="${APP.shiftsDate}" onchange="changeShiftsDate(this.value)">
    </div>
    <div id="shiftsTableWrap"><p class="muted">Yükleniyor…</p></div>
  </div>`;
  await renderShiftsTable(session);
}
function changeShiftsDate(v){ APP.shiftsDate = v; renderShiftsTable(getSession()); }
async function renderShiftsTable(session){
  const wrap = document.getElementById('shiftsTableWrap'); if(!wrap) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('list_staff_shifts', { p_token: session.session_token, p_date: APP.shiftsDate }));
  if(error){ wrap.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const rows = data || [];
  if(!rows.length){ wrap.innerHTML = '<p class="muted">Bu tarihte vardiya kaydı yok.</p>'; return; }
  wrap.innerHTML = `<div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Personel</th><th>Giriş</th><th>Çıkış</th><th>Süre</th></tr></thead>
      <tbody>
      ${rows.map(r => `
        <tr>
          <td class="col-name">${escapeHtml(r.username)}</td>
          <td>${formatShiftTime(r.clock_in)}</td>
          <td>${r.clock_out ? formatShiftTime(r.clock_out) : '<span class="muted">Devam ediyor</span>'}</td>
          <td>${formatShiftDuration(r.duration_minutes)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

/* --- Roller: yönetici rolleri kendisi ekleyip/çıkarabilir, hangi role
   hangi ekranların açık olduğuna kendisi karar verir (bkz.
   manager_upsert_role/manager_delete_role). Yönetici rolü (is_system)
   salt okunur - tüm ekranlara erişimi sabit ve değiştirilemez. */
function permissionCheckboxes(idPrefix, selectedPerms){
  return Object.keys(PERMISSION_LABELS).map(key => `
    <label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:13px;margin-bottom:4px;">
      <input type="checkbox" id="${idPrefix}_perm_${key}" value="${key}" data-perms-group="${idPrefix}" ${selectedPerms.includes(key)?'checked':''} style="width:auto;margin:0;">
      ${PERMISSION_LABELS[key]}
    </label>`).join('');
}
function selectedPermissions(idPrefix){
  return Array.from(document.querySelectorAll(`input[data-perms-group="${idPrefix}"]:checked`)).map(b => b.value);
}
function renderRolesSettings(el, session){
  const roles = APP.config.roles || [];
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Roller</h2>
    <p class="muted" style="margin-top:-8px;margin-bottom:16px;">Hangi rolün hangi ekranlara erişebileceğini burada belirleyin. Yönetici rolü tüm ekranlara erişebilir ve değiştirilemez.</p>
    <div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Rol Adı</th><th>Ekran İzinleri</th><th>Kullanıcı Sayısı</th><th></th></tr></thead>
      <tbody>
      ${roles.map(r => r.is_system ? `
        <tr>
          <td class="col-name">${escapeHtml(r.name)} <span class="role-badge" style="margin-left:6px;">Sistem</span></td>
          <td><span class="muted">Tüm ekranlar</span></td>
          <td>${r.user_count}</td>
          <td></td>
        </tr>` : `
        <tr>
          <td class="col-name"><input value="${escapeHtml(r.name)}" id="role_name_${r.id}"></td>
          <td>${permissionCheckboxes('role_'+r.id, r.permissions||[])}</td>
          <td>${r.user_count}</td>
          <td>
            <button class="sbtn" onclick="saveRole('${r.id}')">Kaydet</button>
            <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="deleteRole('${r.id}')">Sil</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>
    <div class="add-row-panel">
      <p>Yeni Rol Ekle</p>
      <div class="field-group" style="max-width:280px;"><label>Rol Adı</label><input id="new_role_name" placeholder="örn. Kasiyer"></div>
      <div style="margin-top:10px;">${permissionCheckboxes('new_role', [])}</div>
      <button style="margin-top:12px;max-width:220px;" onclick="createRole()">+ Rol Ekle</button>
    </div>
  </div>`;
}
async function saveRole(id){
  const session = getSession();
  const name = document.getElementById('role_name_'+id).value.trim();
  const perms = selectedPermissions('role_'+id);
  if(!name){ alert('Rol adı gerekli'); return; }
  const { error } = await sb.rpc('manager_upsert_role', { p_token: session.session_token, p_id: id, p_name: name, p_permissions: perms });
  if(error){ alert(error.message); return; }
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
  renderSettingsView(document.getElementById('main'), session);
}
async function deleteRole(id){
  if(!confirm('Bu rolü silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('manager_delete_role', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
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
    <button style="margin-top:12px;max-width:220px;" onclick="saveEfaturaSettings()">Kaydet</button>
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
    <button style="margin-top:12px;max-width:220px;" onclick="saveMarketplaceSettings()">Kaydet</button>
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
    <button style="margin-top:12px;max-width:220px;" onclick="saveAccountingSettings()">Kaydet</button>
  </div>
  <div class="box" style="max-width:none;">
    <h2>⭐ Google Yorumları</h2>
    <p class="muted" style="margin-top:-6px;">İşletmenizin Google Business Profili'ndeki "yorum yaz" linkini girin. Ödeme alma ekranında bir hesabın tamamı ödendiğinde, personele bu linke giden bir QR kod gösterme seçeneği çıkar - müşteriden telefonuyla okutup değerlendirme bırakmasını isteyebilirsiniz.</p>
    <div class="field-group" style="max-width:500px;"><label>Google Yorum Linki</label><input id="int_google_review_url" placeholder="https://g.page/r/..." value="${escapeHtml(APP.config.google_review_url||'')}"></div>
    <button style="margin-top:12px;max-width:220px;" onclick="saveGoogleReviewUrl()">Kaydet</button>
  </div>
  <div class="box" style="max-width:none;">
    <h2>🛵 Dışarıdan Online Sipariş</h2>
    <p class="muted" style="margin-top:-6px;">Masaya bağlı olmayan, gel-al veya paket teslimat siparişleri için müşterilerinizin doğrudan telefonlarından erişebileceği bir sipariş sayfası. Açtığınızda gelen sipariş istekleri, masa siparişleri gibi "Sipariş Al" ekranınızdaki bildirim şeridinde görünür ve onayladığınızda Paket Servis'e düşer.</p>
    <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin:10px 0;">
      <input type="checkbox" id="int_online_ordering_enabled" ${APP.config.online_ordering&&APP.config.online_ordering.enabled?'checked':''} style="width:auto;margin:0;" onchange="saveOnlineOrderingSettings()"> Aktif
    </label>
    ${APP.config.online_ordering && APP.config.online_ordering.enabled ? onlineOrderingLinkHtml() : ''}
  </div>`;
  // Paketinizde/eklentilerinizde olmayan bölümler kilitli gösterilir
  // (sunucu da ilgili RPC'lerde PAKET_OZELLIK_YOK ile reddediyor).
  const boxFeatures = ['efatura','marketplace','accounting','google_reviews','online_ordering'];
  el.querySelectorAll(':scope > .box').forEach((box, i) => {
    const f = boxFeatures[i];
    if(!f || hasFeature(f)) return;
    const title = box.querySelector('h2') ? box.querySelector('h2').outerHTML : '';
    box.innerHTML = title + lockedFeatureHtml();
  });
}
function lockedFeatureHtml(){
  return `<p class="muted" style="margin:0;">🔒 Bu özellik paketinizde yok. Eklenti olarak eklemek ya da paketinizi yükseltmek için bizimle iletişime geçin.</p>`;
}
function onlineOrderingLinkHtml(){
  const url = window.location.origin + '/siparis/?r=' + encodeURIComponent(APP.config.online_ordering.code);
  const qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);
  return `<div style="background:var(--panel2);border-radius:10px;padding:12px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
    <img src="${qrImgUrl}" alt="QR" style="width:110px;height:110px;border-radius:8px;background:#fff;padding:6px;flex-shrink:0;">
    <div style="min-width:0;flex:1;">
      <p class="muted" style="font-size:12px;margin:0 0 6px;">Bu linki sosyal medya bio'nuza, Google İşletme profilinize ya da bir masa standına koyabilirsiniz.</p>
      <p style="font-size:13px;overflow-wrap:anywhere;word-break:break-word;margin:0 0 8px;">${escapeHtml(url)}</p>
      <button style="width:auto;padding:8px 12px;margin:0;" onclick="navigator.clipboard.writeText(${jsArg(url)}).then(()=>showToast('Link kopyalandı ✓'))">🔗 Linki Kopyala</button>
    </div>
  </div>`;
}
async function saveAccountingSettings(){
  const session = getSession();
  const provider = document.getElementById('int_accounting_provider').value || null;
  const key = document.getElementById('int_accounting_key').value;
  const enabled = document.getElementById('int_accounting_enabled').checked;
  const { error } = await sb.rpc('update_accounting_settings', { p_token: session.session_token, p_provider: provider, p_api_key: key||null, p_enabled: enabled });
  if(error){ alert(error.message==='PAKET_OZELLIK_YOK' ? 'Muhasebe Entegrasyonu paketinizde dahil değil - ayrı bir eklenti olarak satın almak için bizimle iletişime geçin.' : error.message); return; }
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
  return `
    <div class="add-row-panel" style="border-color:${color};margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <div class="role-badge" style="margin-bottom:6px;">${escapeHtml(lic.package_id)} · ${APP.config.users.length}/${lic.max_users} kullanıcı</div>
          <div style="color:${color};font-weight:700;font-size:13.5px;">${statusText}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button id="renewBtn" disabled title="Kartla ödeme yakında açılacak" style="width:auto;padding:10px 18px;margin:0;opacity:.55;cursor:not-allowed;">💳 Kredi Kartı ile Öde</button>
          <span class="role-badge" style="color:var(--accent);border-color:var(--accent);white-space:nowrap;">🔜 Yakında</span>
        </div>
      </div>
      <div class="error" id="renewErr" style="text-align:left;margin-top:8px;"></div>
    </div>
    ${billingCycleSelectorHtml()}`;
}
/* Aylık/Yıllık seçimi - hem (ileride açılacak) kart ödemesini hem de
   havale bildirimini etkiler, bu yüzden abonelik panelinin en üstünde tek
   bir yerden seçiliyor (APP.billingCycle). Yıllık fiyat platform admin
   panelinden paket başına ayrıca girilebilir; girilmemişse aylık fiyatın
   12 katı (indirimsiz) sunucuda otomatik hesaplanır. */
function billingCycleSelectorHtml(){
  const cycle = APP.billingCycle || 'monthly';
  return `<div class="add-row-panel" style="margin-bottom:16px;">
    <h3 style="margin:0 0 10px;">Ödeme Dönemi</h3>
    <div style="display:flex;gap:8px;">
      <button class="sbtn" style="width:auto;${cycle==='monthly'?'':'opacity:.55;'}" onclick="setBillingCycle('monthly')">Aylık</button>
      <button class="sbtn" style="width:auto;${cycle==='yearly'?'':'opacity:.55;'}" onclick="setBillingCycle('yearly')">Yıllık</button>
    </div>
  </div>`;
}
function setBillingCycle(cycle){
  APP.billingCycle = cycle;
  renderBillingSettings(document.getElementById('settingsContent'), getSession());
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
    <div id="billingIdentityBox">${renderBillingIdentityBox(lic)}</div>
    <div id="bankTransferBox"><p class="muted">Yükleniyor…</p></div>
  </div>`;
  loadBankTransferStatus(session);
}
function renderBillingIdentityBox(lic){
  const isSet = lic && lic.billing_identity_set;
  if(isSet && !APP.billingIdentityEditing){
    return `<div class="add-row-panel" style="margin-top:16px;">
      <h3 style="margin:0 0 8px;">🧾 Fatura Kimlik Bilgisi</h3>
      <p class="muted">T.C. Kimlik Numaranız kayıtlı ✓</p>
      <button class="ghost-btn" onclick="APP.billingIdentityEditing=true;renderBillingSettings(document.getElementById('settingsContent'),getSession());">Değiştir</button>
    </div>`;
  }
  return `<div class="add-row-panel" style="margin-top:16px;">
    <h3 style="margin:0 0 8px;">🧾 Fatura Kimlik Bilgisi</h3>
    <p class="muted">Kart ile ödeme yapabilmek için fatura üzerinde görünecek T.C. Kimlik Numaranızı girin.</p>
    <input id="biIdentityNumber" placeholder="T.C. Kimlik Numarası" inputmode="numeric" maxlength="11">
    <div class="error" id="biIdentityErr"></div>
    <button id="biIdentitySaveBtn" onclick="saveBillingIdentity()">Kaydet</button>
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
  renderBillingSettings(document.getElementById('settingsContent'), session);
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
      <button id="bankTransferSubmitBtn" onclick="submitBankTransferNotice()">✅ Ödemeyi Yaptım, Bildir</button>
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

async function saveUser(id){
  const session = getSession();
  const username = document.getElementById('us_name_'+id).value.trim();
  const password = document.getElementById('us_pass_'+id).value;
  const roleIds = selectedRoleIds('us_'+id);
  if(roleIds.length===0){ alert('En az 1 rol seçmelisiniz'); return; }
  const { error } = await sb.rpc('update_staff_user', { p_token: session.session_token, p_user_id: id, p_username: username, p_password: password||null, p_role_ids: roleIds });
  if(error){ alert(error.message); return; }
  renderSettingsView(document.getElementById('main'), session);
  showToast('Kaydedildi ✓');
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
  renderSettingsView(document.getElementById('main'), session);
}
async function removeUser(id){
  if(!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_staff_user', { p_token: session.session_token, p_user_id: id });
  if(error){ alert(error.message); return; }
  renderSettingsView(document.getElementById('main'), session);
}
