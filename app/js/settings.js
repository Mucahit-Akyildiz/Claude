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
  { tab:'datareset', managerOnly:true, label:'🗑️ Veri Sıfırlama' },
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
  applyNavBadges();
  renderSettingsContent(session);
}
function setSettingsTab(tab){
  setTimeout(applyNavBadges, 0);
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
  else if(APP.settingsTab==='datareset') renderDataResetSettings(el);
  else renderUsersTabWithSubtabs(el, session);
}
/* Kullanıcılar sekmesi iki alt sekmeli: Kullanıcılar | Aktif Kullanıcılar
   (ikincisi yalnızca Yönetici'ye görünür). */
function renderUsersTabWithSubtabs(el, session){
  if(!session.isManager) APP.usersSubTab = 'list';
  const sub = APP.usersSubTab || 'list';
  // Alt sekmeler kartın içinde, üst menüden ayrışan altı çizili stilde.
  el.innerHTML = session.isManager ? `<div class="box sub-tabs-box" style="max-width:none;">
      <div class="sub-tabs" id="usersSubTabs">
        <div role="tab" tabindex="0" class="sub-tab ${sub==='list'?'active':''}" onclick="setUsersSubTab('list')"><span class="sub-tab-ic">👥</span>Kullanıcılar</div>
        <div role="tab" tabindex="0" class="sub-tab ${sub==='active'?'active':''}" onclick="setUsersSubTab('active')"><span class="sub-tab-ic">🟢</span>Aktif Kullanıcılar</div>
      </div>
      <div id="usersSubContent" class="sub-tabs-content"></div>
    </div>` : '<div id="usersSubContent"></div>';
  const box = document.getElementById('usersSubContent');
  if(sub==='active') renderActiveUsersSettings(box);
  else renderUsersSettings(box, session);
}
function setUsersSubTab(t){
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
    <div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Etiket</th><th></th></tr></thead>
      <tbody>
      ${flags.map(f => `
        <tr>
          <td class="col-name"><input value="${escapeAttr(f.label)}" id="flag_label_${f.id}"></td>
          <td style="white-space:nowrap;">
            <button type="button" class="act-btn act-save" onclick="saveOrderFlag('${f.id}')">${ICON_SAVE}<span>Kaydet</span></button>
            <button type="button" class="act-btn act-delete" onclick="removeOrderFlag('${f.id}')">${ICON_TRASH}<span>Sil</span></button>
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
          <td class="col-name"><input value="${escapeAttr(i.name)}" id="ing_name_${i.id}"></td>
          <td class="col-num"><select id="ing_unit_${i.id}">
            ${['adet','gram','kg','ml','lt'].map(u => `<option value="${u}" ${u===i.unit?'selected':''}>${u}</option>`).join('')}
          </select></td>
          <td class="col-num"><input type="number" step="0.01" value="${i.stock}" id="ing_stock_${i.id}"></td>
          <td style="white-space:nowrap;">
            <button type="button" class="act-btn act-save" onclick="saveIngredient('${i.id}')">${ICON_SAVE}<span>Kaydet</span></button>
            <button class="sbtn" style="background:var(--accent2);color:var(--btn-ink);" onclick="openIngredientUsageModal('${i.id}')">Kullanıldığı Ürünler</button>
            <button type="button" class="act-btn act-delete" onclick="removeIngredient('${i.id}')">${ICON_TRASH}<span>Sil</span></button>
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
  if(data) openIngredientUsageModal(data);
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
function openIngredientUsageModal(ingredientId){
  const ingredient = (APP.config.ingredients||[]).find(x => x.id===ingredientId);
  const ingredientName = ingredient ? ingredient.name : '';
  const products = APP.config.products || [];
  const bg = document.createElement('div');
  bg.id = 'ingUsageModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:480px;width:100%;max-height:88vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">${escapeHtml(ingredientName)} - Kullanıldığı Ürünler</h2><span style="cursor:pointer;color:var(--muted);" onclick="document.getElementById('ingUsageModalBg').remove()">✕</span></div>
    <p class="muted" style="text-align:left;">Bu hammaddeyi hangi ürünler kullanıyor, 1 porsiyonda ne kadar tüketiliyor? Seçmediğiniz ürünlerden bu hammadde kaldırılır (o ürünlerin diğer hammaddeleri etkilenmez).</p>
    <div id="ingUsageItemsBox"></div>
    <button style="margin-top:14px;" onclick="saveIngredientUsage('${ingredientId}')">${ICON_SAVE}<span>Kaydet</span></button>
  </div>`;
  document.body.appendChild(bg);
  const box = document.getElementById('ingUsageItemsBox');
  box.innerHTML = products.length===0 ? '<p class="muted">Henüz ürün eklenmemiş.</p>' : products.map(p => {
    const existing = (p.recipe||[]).find(r => r.ingredient_id===ingredientId);
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <input type="checkbox" id="ingu_chk_${p.id}" ${existing?'checked':''} onchange="const q=document.getElementById('ingu_qty_${p.id}');q.disabled=!this.checked;if(this.checked)q.focus();else q.style.borderColor=''" style="width:auto;margin:0;">
      <span style="flex:1;">${escapeHtml(p.name)}</span>
      <input type="number" step="0.01" min="0" id="ingu_qty_${p.id}" value="${existing?existing.qty_per_unit:''}" placeholder="Miktar/porsiyon" ${existing?'':'disabled'} style="width:130px;margin:0;">
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
          ${(APP.config.ingredients||[]).map(i => `<option value="${i.id}" data-unit="${i.unit}" data-name="${escapeAttr(i.name)}">${escapeHtml(i.name)} (${i.unit})</option>`).join('')}
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
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">${escapeHtml(prod.name)} - Çeviriler</h2><span style="cursor:pointer;color:var(--muted);" onclick="document.getElementById('translationsModalBg').remove()">✕</span></div>
    <p class="muted" style="text-align:left;">Boş bıraktığınız diller için QR menüde Türkçe ad gösterilir.</p>
    ${QR_MENU_LANGUAGES.map(l => `<div class="field-group"><label>${l.label}</label><input id="tr_${l.code}_${productId}" value="${escapeAttr(translations[l.code]||'')}" placeholder="${escapeAttr(prod.name)}"></div>`).join('')}
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
    <button type="button" class="icon-pick-btn" id="${id}_btn" style="${extraStyle||''}" onclick="openIconPicker('${id}')">${cur}</button>`;
}
function iconPickerGridHtml(targetId, current, filter){
  const q = (filter||'').trim().toLocaleLowerCase('tr');
  const groups = STATION_ICON_GROUPS.map(([name, items]) => [name, items.filter(([ic, kw]) => !q || kw.includes(q) || name.toLocaleLowerCase('tr').includes(q))]).filter(g => g[1].length);
  if(!groups.length) return '<p class="muted" style="text-align:center;margin:24px 0;">Sonuç bulunamadı</p>';
  return groups.map(([name, items]) => `
    <div class="icon-picker-cat">${escapeHtml(name)}</div>
    <div class="icon-picker-grid">${items.map(([ic, kw]) => `<button type="button" class="icon-picker-item ${ic===current?'selected':''}" title="${escapeAttr(kw)}" onclick="pickStationIcon('${targetId}','${ic}')">${ic}</button>`).join('')}</div>`).join('');
}
function openIconPicker(targetId){
  const current = document.getElementById(targetId).value;
  const bg = document.createElement('div');
  bg.id = 'iconPickerBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;';
  bg.innerHTML = `<div class="icon-picker-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="margin:0;">İkon Seç</h3>
      <button type="button" class="icon-picker-close" onclick="document.getElementById('iconPickerBg').remove()">✕</button>
    </div>
    <input id="iconPickerSearch" placeholder="🔍 Ara: pizza, kahve, tatlı…" autocomplete="off" style="margin-bottom:10px;"
      oninput="document.getElementById('iconPickerBody').innerHTML = iconPickerGridHtml('${targetId}', ${jsArg(current)}, this.value)">
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
function stationRowActionBtn(icon, title, color, onclick){
  return `<button type="button" title="${title}" onclick="${onclick}" style="width:38px;height:38px;flex-shrink:0;border-radius:10px;border:1px solid var(--border);background:var(--panel);color:${color||'var(--text)'};cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;padding:0;margin:0;">${icon}</button>`;
}
function renderStationsSettings(el, session){
  const rowHtml = (s) => `
    <div style="display:flex;align-items:center;gap:12px;background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px 12px;flex-wrap:wrap;">
      ${stationIconPickerHtml('st_icon_'+s.id, s.icon||'🍳', `border-radius:50%;background:${s.color}26;border-color:${s.color};`)}
      <input value="${escapeAttr(s.name)}" id="st_name_${s.id}" placeholder="İstasyon adı" style="flex:1;min-width:120px;margin:0;font-weight:700;">
      <input type="color" value="${s.color}" id="st_color_${s.id}" title="Renk" style="padding:2px;height:38px;width:42px;flex-shrink:0;margin:0;">
      ${actBtn('save', `saveStation('${s.id}')`)}
      ${actBtn('delete', `removeStation('${s.id}')`)}
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
          <input value="${escapeAttr(z.name)}" id="zn_name_${z.id}" style="flex:1;font-weight:700;">
          <button type="button" class="act-btn act-save" onclick="saveZone('${z.id}')">${ICON_SAVE}<span>Kaydet</span></button>
          <button type="button" class="act-btn act-delete" onclick="removeZone('${z.id}')">${ICON_TRASH}<span>Sil</span></button>
        </div>
        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">
          ${z.tables.map(t => `<span style="background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:5px 10px;font-size:12px;display:flex;align-items:center;gap:6px;">
            ${escapeHtml(t.name)}
            <span style="cursor:pointer;color:var(--accent);" title="QR Menü Kodu" onclick="showTableQr('${t.id}','${t.qr_token}')">▦</span>
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
          <td class="col-name"><input value="${escapeAttr(p.name)}" id="pr_name_${p.id}"></td>
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
          <td><div class="act-row">
            <button type="button" class="act-btn act-save" onclick="saveProduct('${p.id}')">${ICON_SAVE}<span>Kaydet</span></button>
            <button type="button" class="act-btn ${p.available===false?'act-open':'act-close'}" onclick="toggleProductAvailable('${p.id}')"><b>${p.available===false?'✓':'✕'}</b><span>${p.available===false?'Aç':'Kapat'}</span></button>
            <button type="button" class="act-btn act-recipe" onclick="openRecipeModal('${p.id}')"><b>📋</b><span>Reçete</span></button>
            ${hasFeature('multilang_menu') ? `<button type="button" class="act-btn act-lang" onclick="openTranslationsModal('${p.id}')" title="QR menüde diğer dillerde gösterilecek isim"><b>🌐</b><span>Çeviri</span></button>` : ''}
            <button type="button" class="act-btn act-delete" onclick="removeProduct('${p.id}')">${ICON_TRASH}<span>Sil</span></button>
          </div></td>
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
                ${APP.config.ingredients.map(i => `<option value="${i.id}" data-unit="${i.unit}" data-name="${escapeAttr(i.name)}">${escapeHtml(i.name)} (${i.unit})</option>`).join('')}
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
        <tr style="${u.is_active===false?'opacity:.55;':''}">
          <td class="col-name"><input value="${escapeAttr(u.username)}" id="us_name_${u.id}">${u.is_active===false?'<span class="role-badge" style="color:var(--red);border-color:var(--red);margin-top:6px;display:inline-block;">Pasif</span>':''}</td>
          <td class="col-name"><input type="password" placeholder="(değiştirmek için yaz)" id="us_pass_${u.id}"></td>
          <td class="col-name">${roleCheckboxes('us_'+u.id, u.role_ids||[])}</td>
          <td>
            <div class="act-row">
            <button type="button" class="act-btn act-save" onclick="saveUser('${u.id}')">${ICON_SAVE}<span>Kaydet</span></button>
            <button type="button" class="act-btn ${u.is_active===false?'act-open':'act-close'}" onclick="toggleUserActive('${u.id}', ${u.is_active===false})" title="${u.is_active===false?'Kullanıcıyı tekrar aktif et':'Giriş yapamaz, açık oturumu kapanır'}"><b>${u.is_active===false?'✓':'⏸'}</b><span>${u.is_active===false?'Aktifleştir':'Pasife Al'}</span></button>
            <button type="button" class="act-btn act-delete" onclick="removeUser('${u.id}')">${ICON_TRASH}<span>Sil</span></button>
            </div>
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
    <div id="shiftApprovalWrap"></div>
    <div id="shiftPendingWrap"></div>
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
  const approvalWrap = document.getElementById('shiftApprovalWrap');
  if(approvalWrap) approvalWrap.innerHTML = `
    <label style="display:flex;align-items:flex-start;gap:10px;margin:0 0 14px;cursor:${session.isManager?'pointer':'default'};">
      <input type="checkbox" style="width:auto;margin-top:3px;" ${data.approval_required?'checked':''} ${session.isManager?'':'disabled'} onchange="toggleShiftApproval(this.checked)">
      <span><b>Vardiya başlatma yönetici onayına bağlı</b><br>
      <span class="muted" style="font-size:12.5px;">Açıkken personel vardiyayı sadece <i>isteyebilir</i>; siz onayladığınızda başlar ve vardiyayı yalnızca yönetici bitirebilir.${session.isManager?'':' (Bu ayarı Yönetici değiştirebilir.)'}</span></span>
    </label>`;
  const pendWrap = document.getElementById('shiftPendingWrap');
  const pending = data.pending || [];
  const endReqs = data.end_requests || [];
  if(pendWrap) pendWrap.innerHTML = (endReqs.length ? `
    <div style="border:1px solid #d9a400;border-radius:12px;padding:12px;margin-bottom:16px;">
      <b>🏁 Bitirme Talepleri (${endReqs.length})</b>
      ${endReqs.map(p => `<div data-badge-id="${p.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
        <span><b>${escapeHtml(p.username)}</b> <span class="muted">· ${formatShiftTime(p.clock_in)}'dan beri vardiyada, ${formatShiftTime(p.requested_at)}'de bitirmek istedi</span></span>
        <span style="display:flex;gap:8px;">
          <button class="actBtn" style="width:auto;margin:0;" onclick="manageShift('${p.id}','approve_end')">✓ Bitir</button>
          <button class="actBtn" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" onclick="manageShift('${p.id}','reject_end')">✕ Reddet</button>
        </span></div>`).join('')}
    </div>` : '') + (pending.length ? `
    <div style="border:1px solid #d9a400;border-radius:12px;padding:12px;margin-bottom:16px;">
      <b>🟡 Onay Bekleyen Vardiya Talepleri (${pending.length})</b>
      ${pending.map(p => `<div data-badge-id="${p.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
        <span><b>${escapeHtml(p.username)}</b> <span class="muted">· ${formatShiftTime(p.requested_at)}'de istedi</span></span>
        <span style="display:flex;gap:8px;">
          <button class="actBtn" style="width:auto;margin:0;" onclick="manageShift('${p.id}','approve')">✓ Onayla</button>
          <button class="actBtn danger" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" onclick="manageShift('${p.id}','reject')">✕ Reddet</button>
        </span></div>`).join('')}
    </div>` : '');
  const rows = data.rows || [];
  if(!rows.length){ wrap.innerHTML = '<p class="muted">Bu tarihte vardiya kaydı yok.</p>'; return; }
  wrap.innerHTML = `<div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Personel</th><th>Giriş</th><th>Çıkış</th><th>Süre</th><th></th></tr></thead>
      <tbody>
      ${rows.map(r => `
        <tr>
          <td class="col-name">${escapeHtml(r.username)}${r.approved_by && r.approved_by!==r.username ? `<div class="muted" style="font-size:11.5px;">Onaylayan: ${escapeHtml(r.approved_by)}</div>` : ''}</td>
          <td>${formatShiftTime(r.clock_in)}</td>
          <td>${!r.clock_out && r.end_requested_at ? `<span style="color:#d9a400;font-weight:700;">🏁 ${formatShiftTime(r.end_requested_at)}'de bitirmek istedi</span>` : r.clock_out ? formatShiftTime(r.clock_out) + (r.ended_by && r.ended_by!==r.username ? `<div class="muted" style="font-size:11.5px;">${escapeHtml(r.ended_by)} bitirdi</div>` : '') : '<span class="muted">Devam ediyor</span>'}</td>
          <td>${formatShiftDuration(r.duration_minutes)}</td>
          <td>${r.clock_out ? '' : `<button class="actBtn" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" onclick="manageShift('${r.id}','end')">⏹ Bitir</button>`}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}
async function manageShift(id, action){
  if(action==='end' && !confirm('Bu personelin vardiyası şimdi bitirilsin mi?')) return;
  const session = getSession();
  const { error } = await withLoadingOverlay(sb.rpc('manage_staff_shift', { p_token: session.session_token, p_shift_id: id, p_action: action }));
  if(error){ showToast(error.message); return; }
  showToast({ approve:'Vardiya başlatıldı ✓', reject:'Talep reddedildi', approve_end:'Vardiya bitirildi ✓', reject_end:'Bitirme talebi reddedildi', end:'Vardiya bitirildi ✓' }[action] || 'Tamam');
  renderShiftsTable(session);
  refreshShiftWidget(session);
  refreshNavBadges();
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
        <select id="activeUsersMinutes" style="width:auto;margin:0;" onchange="APP.activeUsersMinutes=Number(this.value);loadActiveUsers()">
          ${[5,15,60,1440].map(m => `<option value="${m}" ${APP.activeUsersMinutes===m?'selected':''}>${m===1440?'24 saat':m+' dakika'}</option>`).join('')}
        </select>
      </div>
    </div>
    <p class="muted" style="margin:6px 0 16px;font-size:12.5px;text-align:left;">Seçilen süre içinde uygulamada işlem yapan (ekranı açık olan) personel; çıkış yapanlar ⚪ ile gösterilir. 20 saniyede bir otomatik yenilenir.</p>
    <div id="activeUsersBody"><p class="muted">Yükleniyor...</p></div>
  </div>`;
  loadActiveUsers();
  if(ACTIVE_USERS_TIMER) clearInterval(ACTIVE_USERS_TIMER);
  ACTIVE_USERS_TIMER = setInterval(() => {
    if(APP.view!=='settings' || APP.settingsTab!=='users' || !document.getElementById('activeUsersBody')){ clearInterval(ACTIVE_USERS_TIMER); ACTIVE_USERS_TIMER = null; return; }
    loadActiveUsers();
  }, 20000);
}
async function loadActiveUsers(){
  const session = getSession(); const body = document.getElementById('activeUsersBody');
  if(!session || !body) return;
  const { data, error } = await sb.rpc('list_active_staff', { p_token: session.session_token, p_minutes: APP.activeUsersMinutes || 5 });
  if(error){ body.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const rows = data.rows || [];
  body.innerHTML = `
    <div class="home-grid" style="margin-top:0;margin-bottom:20px;">
      ${statCard('Aktif Kullanıcı', data.active_users, 'var(--green)')}
      ${statCard('Vardiyada', data.on_shift)}
      ${statCard('Bugün Giren', data.today_users)}
      ${statCard('Kullanıcı / Lisans', (data.total_users ?? '—') + ' / ' + (data.max_users ?? '—'), (data.max_users && data.total_users >= data.max_users) ? 'var(--red)' : null)}
    </div>
    ${data.max_users ? `<p class="muted" style="text-align:left;margin:-8px 0 16px;font-size:12.5px;">Sistemde ${data.total_users} kullanıcı var (${data.enabled_users} aktif, ${data.total_users - data.enabled_users} pasif) · paketiniz ${data.max_users} kullanıcıya izin veriyor · ${Math.max(0, data.max_users - data.total_users)} kullanıcı daha ekleyebilirsiniz.</p>` : ''}
    ${!rows.length ? '<p class="muted">Bu sürede aktif kullanıcı yok.</p>' : `<div class="settings-table-wrap"><table class="settings-table">
      <thead><tr><th>Kullanıcı</th><th>Rol</th><th>Son İşlem</th><th>Giriş</th><th>Vardiya</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="col-name">${r.online===false ? '⚪' : Date.now() - new Date(r.last_seen_at).getTime() < 120000 ? '🟢' : '🟡'} ${escapeHtml(r.username)}${r.online===false ? ' <span class="muted" style="font-size:11.5px;">çıkış yaptı' + (r.logged_out_at ? ' ' + new Date(r.logged_out_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '') + '</span>' : ''}</td>
        <td>${escapeHtml(r.roles||'—')}</td>
        <td>${fmtRelativeTime(r.last_seen_at)}</td>
        <td style="font-size:12.5px;">${new Date(r.login_at).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
        <td>${r.on_shift ? '<span class="role-badge" style="color:var(--green);border-color:var(--green);">Vardiyada</span>' : '<span class="muted">—</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`}`;
}

/* --- Veri Sıfırlama (yalnızca Yönetici): seçilen tarih aralığındaki işlem
   verilerini kalıcı olarak siler (bkz. reset_restaurant_data). Ürünler,
   masalar, kullanıcılar, müşteriler ve açık siparişler etkilenmez;
   e-faturası kesilmiş satışlar yasal kayıt olduğu için korunur. */
const RESET_CATEGORIES = [
  { id:'sales', label:'Satışlar ve kapanmış siparişler', hint:'Satış geçmişi, iptal/kapalı siparişler, faturalar (e-fatura hariç), online sipariş talepleri, SMS kayıtları' },
  { id:'waste', label:'Zayi / fire kayıtları' },
  { id:'shifts', label:'Vardiya kayıtları', hint:'Devam eden vardiyalar silinmez' },
  { id:'reservations', label:'Rezervasyonlar ve bekleme listesi' },
  { id:'purchases', label:'Satın alma siparişleri' },
];
function renderDataResetSettings(el){
  el.innerHTML = `<div class="box" style="max-width:640px;">
    <h2>🗑️ Verileri Sıfırla</h2>
    <p class="muted" style="text-align:left;">Seçtiğiniz dönemdeki işlem verilerini <b>kalıcı olarak</b> siler. Ürünler, masalar, kullanıcılar, müşteriler ve açık siparişler etkilenmez.</p>
    <div class="field-group"><label>Dönem</label>
      <select id="resetRange" onchange="document.getElementById('resetCustom').style.display=this.value==='custom'?'flex':'none'">
        <option value="1m">Son 1 ay</option>
        <option value="3m" selected>Son 3 ay</option>
        <option value="6m">Son 6 ay</option>
        <option value="1y">Son 1 yıl</option>
        <option value="all">Tümü (tüm zamanlar)</option>
        <option value="custom">Tarih aralığı seç…</option>
      </select>
    </div>
    <div id="resetCustom" style="display:none;gap:10px;flex-wrap:wrap;">
      <div class="field-group" style="flex:1;min-width:140px;"><label>Başlangıç</label><input type="date" id="resetFrom"></div>
      <div class="field-group" style="flex:1;min-width:140px;"><label>Bitiş</label><input type="date" id="resetTo" value="${todayLocalDateStr()}"></div>
    </div>
    <div class="field-group"><label>Silinecek veriler</label></div>
    ${RESET_CATEGORIES.map(c => `<label style="display:flex;gap:10px;align-items:flex-start;margin:0 0 10px;cursor:pointer;">
      <input type="checkbox" class="resetCat" value="${c.id}" style="width:auto;margin-top:3px;" checked>
      <span>${c.label}${c.hint?`<br><span class="muted" style="font-size:12px;">${c.hint}</span>`:''}</span></label>`).join('')}
    <div class="field-group" style="margin-top:14px;"><label>Onay için giriş şifreniz</label><input type="password" id="resetPassword" autocomplete="current-password"></div>
    <button style="background:var(--red);color:var(--btn-ink);max-width:260px;" onclick="doDataReset()">Verileri Kalıcı Olarak Sil</button>
  </div>`;
}
function resetRangeDates(){
  const v = document.getElementById('resetRange').value;
  const today = todayLocalDateStr();
  if(v==='all') return { from:null, to:null, label:'TÜM ZAMANLARA ait' };
  if(v==='custom'){
    const from = document.getElementById('resetFrom').value || null, to = document.getElementById('resetTo').value || null;
    return { from, to, label: (from||'en baştan') + ' – ' + (to||'bugün') + ' arasındaki' };
  }
  const months = { '1m':1, '3m':3, '6m':6, '1y':12 }[v];
  const d = new Date(); d.setMonth(d.getMonth() - months);
  const from = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  return { from, to: today, label: document.getElementById('resetRange').selectedOptions[0].textContent + 'a ait' };
}
async function doDataReset(){
  const cats = Array.from(document.querySelectorAll('.resetCat:checked')).map(b => b.value);
  if(!cats.length){ showToast('En az bir veri türü seçin'); return; }
  const pw = document.getElementById('resetPassword').value;
  if(!pw){ showToast('Onay için şifrenizi girin'); return; }
  const r = resetRangeDates();
  if(document.getElementById('resetRange').value==='custom' && !r.from && !r.to){ showToast('Tarih aralığı seçin'); return; }
  const names = RESET_CATEGORIES.filter(c => cats.includes(c.id)).map(c => '• ' + c.label).join('\n');
  if(!confirm(r.label + ' şu veriler kalıcı olarak silinecek:\n\n' + names + '\n\nBu işlem GERİ ALINAMAZ. Devam edilsin mi?')) return;
  const session = getSession();
  const { data, error } = await withLoadingOverlay(sb.rpc('reset_restaurant_data', { p_token: session.session_token, p_password: pw, p_from: r.from, p_to: r.to, p_categories: cats }));
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
        <a onclick="toggleRoleCategory(this, true)">Tümü</a></div>
      <div class="perm-pills">${byCat[cat].map(p => `
        <label class="perm-pill"><input type="checkbox" value="${escapeAttr(p.id)}" data-perms-group="${idPrefix}" ${selectedPerms.includes(p.id)?'checked':''} onchange="markRoleDirty('${idPrefix}')">${escapeHtml(p.label)}</label>`).join('')}
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
  'Müdür Yardımcısı': ['order','packages','kitchen','payments','reservations','crm','shifts','purchasing_orders','purchasing_manage','purchasing_suppliers','settings_products','settings_ingredients','settings_zones','settings_flags']
};
function applyRoleTemplate(name){
  const perms = ROLE_TEMPLATES[name] || [];
  document.getElementById('new_role_name').value = name;
  document.querySelectorAll('input[data-perms-group="new_role"]').forEach(b => { b.checked = perms.includes(b.value); });
  markRoleDirty('new_role');
}
function roleCardHtml(r){
  const total = rolePermissionCatalog().length;
  if(r.is_system) return `
    <div class="role-card">
      <div class="role-head" style="cursor:default;">
        <div class="role-avatar">👑</div>
        <div class="role-title"><b>${escapeHtml(r.name)}</b> <span class="role-badge" style="margin-left:6px;font-size:11px;padding:3px 9px;">Sistem</span>
          <div class="role-sub">Tüm ekranlara ve ayarlara erişir · değiştirilemez</div></div>
        <div class="role-meta"><span class="role-chip">${r.user_count} kullanıcı</span><span class="role-chip accent">Tüm izinler</span></div>
      </div>
    </div>`;
  const g = 'role_'+r.id, perms = r.permissions || [];
  return `
    <div class="role-card" data-role-card="${g}">
      <div class="role-head" onclick="toggleRoleCard('${g}')">
        <div class="role-avatar">👤</div>
        <div class="role-title"><b>${escapeHtml(r.name)}</b><div class="role-sub">${escapeHtml(rolePermSummary(perms))}</div></div>
        <div class="role-meta"><span class="role-chip">${r.user_count} kullanıcı</span><span class="role-chip accent role-perm-count">${perms.filter(p => rolePermissionCatalog().some(c => c.id===p)).length} / ${total} izin</span></div>
        <span class="role-chevron">▶</span>
      </div>
      <div class="role-body">
        <div class="field-group" style="max-width:320px;margin-top:12px;"><label>Rol Adı</label><input value="${escapeAttr(r.name)}" id="role_name_${r.id}" oninput="markRoleDirty('${g}')"></div>
        ${permissionCheckboxes(g, perms)}
        <div class="role-actions">
          <button class="ghost-btn" style="width:auto;margin:0;color:var(--red);border-color:var(--red);" onclick="deleteRole('${r.id}')" ${r.user_count>0?`title="Bu role atanmış ${r.user_count} kullanıcı var"`:''}>${ICON_TRASH}<span>Rolü Sil</span></button>
          <span class="spacer"></span>
          <span class="role-dirty-note">● Kaydedilmemiş değişiklik</span>
          <button style="width:auto;margin:0;padding:10px 22px;" onclick="saveRole('${r.id}')">${ICON_SAVE}<span>Kaydet</span></button>
        </div>
      </div>
    </div>`;
}
function renderRolesSettings(el, session){
  const roles = APP.config.roles || [];
  el.innerHTML = `<div class="box" style="max-width:none;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div><h2 style="margin-bottom:4px;">Roller</h2>
        <p class="muted" style="margin:0 0 16px;">Bir role tıklayarak hangi ekranlara erişebileceğini seçin. Bir kullanıcıya en fazla 2 rol verilebilir; izinleri birleşir.</p></div>
      <button style="width:auto;margin:0;" onclick="toggleRoleCard('new_role');document.getElementById('new_role_name').focus()">+ Yeni Rol</button>
    </div>
    ${roles.map(roleCardHtml).join('')}
    <div class="role-card" data-role-card="new_role" style="border-style:dashed;">
      <div class="role-head" onclick="toggleRoleCard('new_role')">
        <div class="role-avatar">＋</div>
        <div class="role-title"><b>Yeni Rol Oluştur</b><div class="role-sub">Hazır şablonla başlayın ya da izinleri kendiniz seçin</div></div>
        <div class="role-meta"><span class="role-chip accent role-perm-count">0 / ${rolePermissionCatalog().length} izin</span></div>
        <span class="role-chevron">▶</span>
      </div>
      <div class="role-body">
        <div class="role-templates"><span class="muted" style="font-size:12px;align-self:center;">Şablon:</span>
          ${Object.keys(ROLE_TEMPLATES).map(t => `<button class="sbtn" style="margin:0;" onclick="applyRoleTemplate(${jsArg(t)})">${escapeHtml(t)}</button>`).join('')}
        </div>
        <div class="field-group" style="max-width:320px;margin-top:10px;"><label>Rol Adı</label><input id="new_role_name" placeholder="örn. Kasiyer" oninput="markRoleDirty('new_role')"></div>
        ${permissionCheckboxes('new_role', [])}
        <div class="role-actions"><span class="spacer"></span>
          <button style="width:auto;margin:0;padding:10px 22px;" onclick="createRole()">+ Rolü Oluştur</button>
        </div>
      </div>
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
    <button style="margin-top:12px;max-width:220px;" onclick="saveEfaturaSettings()">${ICON_SAVE}<span>Kaydet</span></button>
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
    <button style="margin-top:12px;max-width:220px;" onclick="saveMarketplaceSettings()">${ICON_SAVE}<span>Kaydet</span></button>
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
    <button style="margin-top:12px;max-width:220px;" onclick="saveAccountingSettings()">${ICON_SAVE}<span>Kaydet</span></button>
  </div>
  <div class="box" style="max-width:none;">
    <h2>⭐ Google Yorumları</h2>
    <p class="muted" style="margin-top:-6px;">İşletmenizin Google Business Profili'ndeki "yorum yaz" linkini girin. Ödeme alma ekranında bir hesabın tamamı ödendiğinde, personele bu linke giden bir QR kod gösterme seçeneği çıkar - müşteriden telefonuyla okutup değerlendirme bırakmasını isteyebilirsiniz.</p>
    <div class="field-group" style="max-width:500px;"><label>Google Yorum Linki</label><input id="int_google_review_url" placeholder="https://g.page/r/..." value="${escapeAttr(APP.config.google_review_url||'')}"></div>
    <button style="margin-top:12px;max-width:220px;" onclick="saveGoogleReviewUrl()">${ICON_SAVE}<span>Kaydet</span></button>
  </div>
  <div class="box" style="max-width:none;">
    <h2>🛵 Dışarıdan Online Sipariş</h2>
    <p class="muted" style="margin-top:-6px;">Masaya bağlı olmayan, gel-al veya paket teslimat siparişleri için müşterilerinizin doğrudan telefonlarından erişebileceği bir sipariş sayfası. Açtığınızda gelen sipariş istekleri, masa siparişleri gibi "Sipariş Al" ekranınızdaki bildirim şeridinde görünür ve onayladığınızda Paket Servis'e düşer.</p>
    <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin:10px 0;">
      <input type="checkbox" id="int_online_ordering_enabled" ${APP.config.online_ordering&&APP.config.online_ordering.enabled?'checked':''} style="width:auto;margin:0;" onchange="saveOnlineOrderingSettings()"> Aktif
    </label>
    ${APP.config.online_ordering && APP.config.online_ordering.enabled ? onlineOrderingLinkHtml() : ''}
    <button type="button" class="ghost-btn" style="max-width:280px;margin-top:12px;" onclick="openOnlineMenuEditor()">🗂️ Online Menüyü Düzenle (başlıklar ve fotoğraflar)</button>
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
      <div class="field-group"><label>Ünvan</label><input id="inv_title" value="${escapeHtml(data.invoice_title||'')}" placeholder="${escapeHtml(APP.config&&APP.config.restaurant_name||'İşletme ünvanı')}"></div>
      <div class="field-group"><label>VKN / TCKN</label><input id="inv_tax" value="${escapeHtml(data.tax_number||'')}" inputmode="numeric" maxlength="11"></div>
      <div class="field-group"><label>Vergi Dairesi</label><input id="inv_office" value="${escapeHtml(data.tax_office||'')}"></div>
      <div class="field-group"><label>Adres</label><input id="inv_addr" value="${escapeHtml(data.invoice_address||'')}"></div>
    </div>
    <button style="max-width:200px;margin-top:10px;" onclick="saveInvoiceSettings()">${ICON_SAVE}<span>Kaydet</span></button>
    <h3 style="margin:18px 0 6px;font-size:14px;">Son 30 günde gönderilenler</h3>
    <div id="invoiceList" class="muted" style="font-size:13px;">Yükleniyor...</div>`;
  el.appendChild(inv);
  const sms = document.createElement('div');
  sms.className = 'box'; sms.style.maxWidth = 'none';
  sms.innerHTML = `<h2>📱 SMS Bildirimleri</h2>
    <p class="muted" style="margin-top:-6px;">Açıkken müşterilere otomatik SMS gider: rezervasyon onayı ve 2 saat kala hatırlatma, paket siparişi hazır olunca bildirim, bekleme listesinde "Masa Hazır" butonu.</p>
    <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin:10px 0;">
      <input type="checkbox" id="int_sms_enabled" ${data.sms_enabled?'checked':''} style="width:auto;margin:0;" onchange="saveSmsSettings(this.checked)"> Aktif
    </label>`;
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
}
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
      <div style="overflow-wrap:anywhere;">IBAN: <b>${escapeHtml(data.iban)}</b> <a href="#" style="color:var(--accent);font-size:12px;" onclick="navigator.clipboard&&navigator.clipboard.writeText(${escapeAttr(JSON.stringify(data.iban))});showToast('IBAN kopyalandı ✓');return false;">Kopyala</a></div>
    </div>
    <div class="field-group" style="margin-top:10px;"><label>Not (opsiyonel)</label><input class="addon-note" placeholder="örn. gönderen adı / dekont no"></div>
    <button style="max-width:240px;" onclick="submitAddonTransfer(this, '${addonId}')">🏦 Ödemeyi Yaptım</button>`
    : '<p class="muted" style="text-align:left;">Banka bilgileri henüz tanımlanmamış, lütfen bizimle iletişime geçin.</p>'}
  </div>`;
}
async function submitAddonTransfer(btn, addonId){
  const wrap = btn.closest('.addon-buy');
  const noteEl = wrap && wrap.querySelector('.addon-note');
  if(!confirm('Havale/EFT ödemesini yaptığınızı onaylıyor musunuz?')) return;
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
        <button type="button" class="sbtn" style="width:auto;margin:0;" ${i===0?'disabled':''} onclick="moveOnlineSection('${sec.id}',-1)" title="Yukarı">↑</button>
        <button type="button" class="sbtn" style="width:auto;margin:0;" ${i===d.sections.length-1?'disabled':''} onclick="moveOnlineSection('${sec.id}',1)" title="Aşağı">↓</button>
        <button type="button" class="sbtn" style="width:auto;margin:0;" onclick="saveOnlineSectionName('${sec.id}')">💾</button>
        <button type="button" class="sbtn" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" onclick="removeOnlineSection('${sec.id}')">🗑️</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">
        ${sec.product_ids.map(id => byId[id]).filter(Boolean).map(p => `<span class="role-badge" style="display:inline-flex;gap:6px;align-items:center;">${escapeHtml(p.name)} <span class="muted" style="font-size:11px;">(${escapeHtml(p.station_name||'-')})</span><a href="#" style="color:var(--red);text-decoration:none;" onclick="toggleOnlineSectionProduct('${sec.id}','${p.id}');return false;">✕</a></span>`).join('') || '<span class="muted" style="font-size:12.5px;">Henüz ürün yok.</span>'}
      </div>
      <button type="button" class="ghost-btn" style="max-width:200px;margin-top:10px;" onclick="pickOnlineSectionProducts('${sec.id}')">+ Ürün Ekle / Çıkar</button>
    </div>`).join('');
  const photosHtml = d.products.map(p => `
    <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);">
      ${p.image ? `<img src="${p.image}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0;">` : '<div style="width:56px;height:56px;border-radius:10px;background:var(--panel2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">📷</div>'}
      <div style="flex:1;min-width:0;"><b style="overflow-wrap:anywhere;">${escapeHtml(p.name)}</b><div class="muted" style="font-size:12px;">${escapeHtml(p.station_name||'-')} · ${money(p.price)}</div></div>
      <label class="sbtn" style="width:auto;margin:0;cursor:pointer;">${p.image?'Değiştir':'Fotoğraf Ekle'}<input type="file" accept="image/*" style="display:none;" onchange="uploadProductImage('${p.id}', this)"></label>
      ${p.image ? `<button type="button" class="sbtn" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" onclick="removeProductImage('${p.id}')">✕</button>` : ''}
    </div>`).join('');
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:640px;width:100%;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h2 style="margin:0;">🗂️ Online Menü</h2>
      <span style="cursor:pointer;color:var(--muted);font-size:20px;" onclick="document.getElementById('onlineMenuBg').remove()">✕</span>
    </div>
    <div class="sub-tabs" style="margin-bottom:14px;">
      <div role="tab" tabindex="0" class="sub-tab ${tab==='sections'?'active':''}" onclick="APP.onlineMenuTab='sections';drawOnlineMenuEditor()"><span class="sub-tab-ic">🗂️</span>Başlıklar</div>
      <div role="tab" tabindex="0" class="sub-tab ${tab==='photos'?'active':''}" onclick="APP.onlineMenuTab='photos';drawOnlineMenuEditor()"><span class="sub-tab-ic">📷</span>Fotoğraflar</div>
    </div>
    ${tab==='sections' ? `
      <p class="muted" style="text-align:left;margin:0 0 12px;font-size:13px;">Online sipariş sayfasında müşteriye görünecek başlıkları oluşturun ve ürünleri yerleştirin (örn. lahmacunu "Fırın" başlığına). Ürünün fişi yine kendi istasyonuna gider. Hiç başlık yoksa ürünler istasyonlara göre listelenir; başlık varsa yalnızca başlıklardaki ürünler görünür.</p>
      ${sectionsHtml || '<p class="muted">Henüz başlık yok.</p>'}
      <div style="display:flex;gap:8px;margin-top:6px;"><input id="oms_new" placeholder="Yeni başlık (örn. Fırın)" style="margin:0;flex:1;"><button type="button" style="width:auto;margin:0;" onclick="addOnlineSection()">+ Ekle</button></div>`
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
  if(!confirm('Bu başlık silinsin mi? (Ürünler silinmez)')) return;
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
    <input id="omsPickSearch" placeholder="Ara..." style="margin:0 0 8px;" oninput="document.querySelectorAll('#omsPickList label').forEach(l => l.style.display = l.textContent.toLocaleLowerCase('tr').includes(this.value.toLocaleLowerCase('tr')) ? 'flex' : 'none')">
    <div id="omsPickList" style="overflow:auto;flex:1;">
      ${APP.onlineMenu.products.map(p => `<label style="display:flex;gap:10px;align-items:center;padding:7px 2px;border-bottom:1px solid var(--border);cursor:pointer;">
        <input type="checkbox" value="${p.id}" style="width:auto;margin:0;" ${sec.product_ids.includes(p.id)?'checked':''}>
        <span style="flex:1;">${escapeHtml(p.name)} <span class="muted" style="font-size:11.5px;">${escapeHtml(p.station_name||'-')}</span></span></label>`).join('')}
    </div>
    <div style="display:flex;gap:10px;margin-top:12px;">
      <button type="button" class="ghost-btn" style="flex:1;margin:0;" onclick="document.getElementById('omsPickBg').remove()">Vazgeç</button>
      <button type="button" style="flex:1;margin:0;" onclick="applyOnlineSectionPick('${secId}')">Kaydet</button>
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
async function uploadProductImage(productId, input){
  const file = input.files && input.files[0]; if(!file) return;
  let dataUrl;
  try{ dataUrl = await resizeImageToDataUrl(file, 480); }catch(e){ alert(e.message); return; }
  const session = getSession();
  const { error } = await withLoadingOverlay(sb.rpc('set_product_image', { p_token: session.session_token, p_product_id: productId, p_data: dataUrl }));
  if(error){ alert(error.message); return; }
  const p = APP.onlineMenu.products.find(x => x.id===productId); if(p) p.image = dataUrl;
  showToast('Fotoğraf kaydedildi ✓');
  drawOnlineMenuEditor();
}
async function removeProductImage(productId){
  if(!confirm('Fotoğraf kaldırılsın mı?')) return;
  const session = getSession();
  const { error } = await sb.rpc('set_product_image', { p_token: session.session_token, p_product_id: productId, p_data: null });
  if(error){ alert(error.message); return; }
  const p = APP.onlineMenu.products.find(x => x.id===productId); if(p) p.image = null;
  drawOnlineMenuEditor();
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
async function toggleUserActive(id, activate){
  const u = (APP.config.users||[]).find(x => x.id===id);
  if(!activate && !confirm((u ? u.username : 'Bu kullanıcı') + ' pasife alınsın mı?\n\nGiriş yapamaz ve açık oturumu hemen kapanır. Kayıtları silinmez, istediğinizde tekrar aktifleştirebilirsiniz.')) return;
  const session = getSession();
  const { error } = await withLoadingOverlay(sb.rpc('set_staff_user_active', { p_token: session.session_token, p_user_id: id, p_active: !!activate }));
  if(error){ alert(error.message); return; }
  showToast(activate ? 'Kullanıcı aktifleştirildi ✓' : 'Kullanıcı pasife alındı');
  renderSettingsView(document.getElementById('main'), session);
}
async function removeUser(id){
  if(!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_staff_user', { p_token: session.session_token, p_user_id: id });
  if(error){ alert(error.message); return; }
  renderSettingsView(document.getElementById('main'), session);
}
