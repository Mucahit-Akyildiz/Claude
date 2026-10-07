/* POS - Ödemeler + masa penceresi + sipariş etiketleri. Eski pos-core.js'ten bölündü; klasik <script src>, globaller
   paylaşılır ve dosyalar index.html'deki sırayla yüklenir (sıra önemli). */
/* ================= ÖDEMELER ================= */
async function openPaymentsView(){ APP.view='payments'; render(); }
async function renderPaymentsView(main, session){
  const [cfgRes, liveRes] = await withLoadingOverlay(Promise.all([
    APP.config ? {data:APP.config} : sb.rpc('get_restaurant_config', { p_token: session.session_token }),
    sb.rpc('get_live_orders', { p_token: session.session_token })
  ]));
  if(!APP.config) APP.config = cfgRes.data;
  APP.liveOrders = liveRes.data || [];
  main.innerHTML = `<h1>Ödemeler <button class="sbtn" style="width:auto;display:inline-flex;vertical-align:middle;margin-left:10px;" onclick="openTableScanModal()">📷 Masa Tara</button></h1><div class="muted" id="payStatus"></div><div class="table-grid" id="payGrid"></div>`;
  renderPayGrid();
}
/* --- Hediye Kartları: yeni kart oluşturma (kod üretimi) ve mevcut
   kartları arama/görme, bkz. issue_gift_card / list_gift_cards. Ayarlar
   sekmesi olarak yaşar - kart OLUŞTURMA burada yapılır, ödeme alırken
   kart bakiyesiyle ÖDEME ise Ödemeler ekranındaki hesap penceresinden
   (bkz. openPayModal > lookupPayGiftCard/finishPaymentFull). */
async function renderGiftCardsSettings(el, session){
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>🎁 Hediye Kartları</h2>
    <p class="muted" style="text-align:left;margin:-8px 0 16px;">Burada yeni hediye kartı oluşturup mevcut kartların bakiyesini görebilirsiniz. Bir kartı ödeme olarak kullanmak için Ödemeler ekranında hesabı açıp "Hediye Kartı" alanına kodu girin.</p>
    <div class="add-row-panel">
      <p>Yeni Hediye Kartı Oluştur</p>
      <div style="${INLINE_ROW}">
        <div class="field-group" style="${fgStyle(140)}"><label>Tutar</label><input id="gcNewAmount" type="number" min="0" step="0.01" placeholder="örn. 200" style="margin:0;"></div>
        <div class="field-group" style="${fgStyle(220, 2)}"><label>Not (opsiyonel)</label><input id="gcNewNote" placeholder="örn. hediye" style="margin:0;"></div>
        <button style="${INLINE_BTN}" onclick="createGiftCard()">+ Kart Oluştur</button>
      </div>
      <div id="gcNewResult" style="margin-top:10px;"></div>
    </div>
    <div style="margin-top:18px;">
      <input id="gcSearchInput" placeholder="Kod, müşteri adı veya telefon ara..." oninput="debouncedGiftCardSearch(this.value)">
    </div>
    <div id="gcListWrap" style="margin-top:10px;"><p class="muted">Yükleniyor…</p></div>
  </div>`;
  await refreshGiftCardList(session);
}
async function createGiftCard(){
  const session = getSession();
  const amount = parseFloat(document.getElementById('gcNewAmount').value);
  const note = document.getElementById('gcNewNote').value.trim();
  if(!amount || amount<=0){ alert('Geçerli bir tutar girin'); return; }
  const { data, error } = await sb.rpc('issue_gift_card', { p_token: session.session_token, p_amount: amount, p_customer_id: null, p_note: note||null });
  if(error){ alert(error.message); return; }
  document.getElementById('gcNewResult').innerHTML = `<div style="background:var(--panel2);border-radius:10px;padding:12px;text-align:center;">
    <div class="muted" style="font-size:12px;">Yeni Kart Kodu</div>
    <div style="font-size:22px;font-weight:800;letter-spacing:2px;margin:4px 0;">${escapeHtml(data.code)}</div>
    <div class="muted" style="font-size:12px;">Bakiye: ${money(data.balance)}</div>
  </div>`;
  document.getElementById('gcNewAmount').value = '';
  document.getElementById('gcNewNote').value = '';
  showToast('Hediye kartı oluşturuldu ✓');
  refreshGiftCardList(session);
}
let GC_SEARCH_TIMER = null;
function debouncedGiftCardSearch(v){
  clearTimeout(GC_SEARCH_TIMER);
  GC_SEARCH_TIMER = setTimeout(() => refreshGiftCardList(getSession(), v), 350);
}
async function refreshGiftCardList(session, search){
  const wrap = document.getElementById('gcListWrap'); if(!wrap) return;
  const { data, error } = await sb.rpc('list_gift_cards', { p_token: session.session_token, p_search: search||null });
  if(error){ wrap.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const rows = data || [];
  if(!rows.length){ wrap.innerHTML = '<p class="muted">Hediye kartı yok.</p>'; return; }
  wrap.innerHTML = `<div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Kod</th><th>Bakiye</th><th>Müşteri</th><th>Oluşturma</th></tr></thead>
      <tbody>
      ${rows.map(g => `
        <tr>
          <td class="col-name" style="font-weight:700;letter-spacing:1px;">${escapeHtml(g.code)}${!g.is_active?' <span class="muted" style="font-weight:400;">(iptal)</span>':''}</td>
          <td>${money(g.balance)} / ${money(g.initial_balance)}</td>
          <td>${g.customer_name ? escapeHtml(g.customer_name) : '<span class="muted">-</span>'}</td>
          <td>${new Date(g.created_at).toLocaleDateString('tr-TR')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}
/* Grid'i (masa/paket kartları + tutarları) APP.liveOrders'tan yeniden çizer -
   sunucuya yeniden sormadan, herhangi bir ödeme al(n)dığında hemen
   çağrılabilir (örn. ödeme modalı açıkken arkadaki kartın tutarı da güncellensin diye). */
/* Kart adı: uzun adlar kelime ortasından bölünmesin diye yazı küçülür; yine sığmazsa
   tirelenerek bölünür (lang="tr"). */
function payCellName(name){
  const longest = Math.max(0, ...String(name||'').split(/\s+/).map(w => w.length));
  const fs = longest > 14 ? 11.5 : longest > 9 ? 13 : null;
  return `<span lang="tr" style="display:block;hyphens:auto;-webkit-hyphens:auto;overflow-wrap:break-word;word-break:normal;${fs ? 'font-size:'+fs+'px;' : ''}">${escapeHtml(name)}</span>`;
}
function renderPayGrid(){
  const grid = document.getElementById('payGrid'); if(!grid) return;
  const allTables = APP.config.zones.flatMap(z => z.tables);
  const tableRows = allTables.map(t => {
    const order = liveOrderForTable(t.id);
    const unpaid = order ? order.items.filter(i=>!i.paid) : [];
    if(unpaid.length===0) return null;
    const total = unpaid.reduce((s,i) => s+i.price*i.qty, 0);
    return `<div class="table-cell" data-badge-id="${order.order_id}" style="cursor:pointer;background:rgba(244,63,94,.14);border-color:var(--red);color:var(--red);" onclick="openPayModal('${order.order_id}')">
      ${payCellName(t.name)}<div style="font-size:11px;margin-top:4px;font-weight:400;">${money(total)}</div></div>`;
  }).filter(Boolean);
  const pkgRows = (APP.liveOrders||[]).filter(o => o.kind==='takeaway' && o.items.filter(i=>!i.paid).length>0).map(o => {
    const unpaid = o.items.filter(i=>!i.paid);
    const total = unpaid.reduce((s,i)=>s+i.price*i.qty,0);
    const label = o.customer_name || ('Paket #'+(o.daily_number||''));
    return `<div class="table-cell" data-badge-id="${o.order_id}" style="cursor:pointer;background:rgba(244,63,94,.14);border-color:var(--red);color:var(--red);" onclick="openPayModal('${o.order_id}')">
      📦 ${payCellName(label)}<div style="font-size:11px;margin-top:4px;font-weight:400;">${money(total)}</div></div>`;
  });
  const occupiedRows = tableRows.concat(pkgRows);
  grid.innerHTML = occupiedRows.length ? occupiedRows.join('') : '<p class="muted">Açık hesap yok.</p>';
}
/* Ödenecek ürünler adet bazında seçilebilir (örn. 4 Izgara Köfte'den sadece
   1'i) - sadece seçilen adetlerin tutarı için ödeme alınır, geri kalanı
   hesapta açık kalır (kısmi/ürün-adet bazlı ödeme). itemId -> seçili adet. */
let PAY_SELECTED_QTYS = {};
/* tableName artık ikinci parametre olarak değil (serbest metin olduğundan
   onclick="..."'a gömülmesi tırnak-kaçışı XSS'ine açıktı, bkz. güvenlik notu),
   order bulunduktan sonra buradan türetiliyor. */
function openPayModal(orderId){
  const order = APP.liveOrders.find(o => o.order_id===orderId);
  if(!order) return;
  const tableName = order.kind==='takeaway'
    ? ('📦 '+(order.customer_name || ('Paket #'+(order.daily_number||''))))
    : tableNameForId(order.table_id);
  const unpaidItems = order.items.filter(i => !i.paid);
  PAY_SELECTED_QTYS = {};
  unpaidItems.forEach(i => { PAY_SELECTED_QTYS[i.id] = i.qty; });
  const subtotal = unpaidItems.reduce((s,i)=>s+i.price*i.qty,0);
  const itemsHtml = unpaidItems.map(it => `
    <div class="pay-item-row">
      <div class="row-top">
        <span>${escapeHtml(it.name)} <span class="muted" style="font-size:11px;">(${money(it.price)}/adet)</span></span>
        <span class="pay-item-subtotal" data-item-id="${it.id}" style="font-weight:700;">${money(it.price*it.qty)}</span>
      </div>
      <div class="row-bottom">
        <button type="button" class="qty-btn" onclick="stepPayItemQty('${it.id}',-1)">-</button>
        <span class="pay-item-qty" data-item-id="${it.id}" style="min-width:20px;text-align:center;font-weight:700;">${it.qty}</span>
        <button type="button" class="qty-btn" onclick="stepPayItemQty('${it.id}',1)">+</button>
        <span class="muted" style="font-size:11px;">/ ${it.qty} adet</span>
      </div>
    </div>`).join('');
  const bg = document.createElement('div');
  bg.id = 'payModalBg';
  bg.dataset.orderId = orderId;
  bg.dataset.tableName = tableName;
  bg.dataset.subtotal = String(subtotal);
  bg.dataset.discountAmount = '0';
  bg.dataset.tipAmount = '0';
  bg.dataset.redeemPoints = '0';
  bg.dataset.customerId = '';
  bg.dataset.customerPoints = '0';
  bg.dataset.isBirthdayToday = '0';
  bg.dataset.giftCardCode = '';
  bg.dataset.giftCardBalance = '0';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div class="pay-modal">
    <div class="pay-modal-header">
      <h2>${escapeHtml(tableName)}</h2>
      <span class="pay-modal-close" onclick="document.getElementById('payModalBg').remove()">✕</span>
    </div>
    ${unpaidItems.length>1 ? `<div class="pay-select-all-row"><button class="pay-select-all-btn" onclick="toggleAllPayItems()">Tümünü Seç/Kaldır</button></div>` : ''}
    <div class="pay-items-card" id="payItemsWrap">${itemsHtml}</div>
    <div class="pay-subtotal-row" id="paySubtotalLine"><span>Ara Toplam</span><span>${money(subtotal)}</span></div>

    <div class="pay-options-grid">
      <div class="pay-option-card">
        <h4>🏷️ İndirim</h4>
        <div class="field-row">
          <input id="discValue" type="number" min="0" step="0.01" placeholder="0" style="flex:1;">
          <select id="discType" style="width:66px;padding:0 4px;">
            <option value="percent">%</option>
            <option value="amount">₺</option>
          </select>
          <button style="width:auto;padding:0 14px;margin:0;" onclick="applyPayDiscount()">Uygula</button>
        </div>
        <p id="discInfo" class="hint">İndirim yok</p>
      </div>
      <div class="pay-option-card">
        <h4>💸 Bahşiş</h4>
        <div class="pay-chip-row">
          <button type="button" class="pay-chip" onclick="applyTipPercent(5)">%5</button>
          <button type="button" class="pay-chip" onclick="applyTipPercent(10)">%10</button>
          <button type="button" class="pay-chip" onclick="applyTipPercent(15)">%15</button>
          <input id="tipValue" type="number" min="0" step="0.01" placeholder="Tutar" style="flex:1;min-width:80px;margin:0;" oninput="applyTipAmount(this.value)">
        </div>
        <p id="tipInfo" class="hint">Bahşiş yok</p>
        <div style="border-top:1px dashed var(--border);margin-top:10px;padding-top:10px;">
          <label class="hint" style="display:block;margin-bottom:4px;">Alınan nakit — üstü bahşiş olur</label>
          <input id="cashReceivedInput" type="number" min="0" step="0.01" placeholder="örn. 5000" style="margin:0;" oninput="handleCashReceivedInput(this.value)">
        </div>
      </div>
      <div class="pay-option-card">
        <h4>🧑 Müşteri</h4>
        <div class="field-row">
          <input id="payCustomerPhone" placeholder="Telefon ile ara" style="flex:1;">
          <button style="width:auto;padding:0 14px;margin:0;" onclick="lookupPayCustomer()">Bul</button>
        </div>
        <p id="payCustomerInfo" class="hint">Müşteri seçilmedi</p>
        <div id="payRedeemWrap" style="display:none;margin-top:8px;">
          <input id="payRedeemPoints" type="number" min="0" step="1" placeholder="Kullanılacak puan" style="margin:0;" oninput="applyRedeemPoints(this.value)">
        </div>
      </div>
      <div class="pay-option-card">
        <h4>🎁 Hediye Kartı</h4>
        <div class="field-row">
          <input id="payGiftCardCode" placeholder="Kart kodu" style="flex:1;text-transform:uppercase;">
          <button style="width:auto;padding:0 14px;margin:0;" onclick="lookupPayGiftCard()">Sorgula</button>
        </div>
        <p id="payGiftCardInfo" class="hint">Kart seçilmedi</p>
        <div id="payGiftCardPartialActions" style="display:none;margin-top:8px;">
          <p class="hint" style="margin:0 0 6px;">Bakiye yetersiz — kartın tamamı düşülür, kalanı seçin:</p>
          <div class="field-row" style="gap:8px;">
            <button style="width:auto;padding:0 12px;margin:0;flex:1;" onclick="finishGiftCardPartial('cash')">💵 Kalanı Nakit</button>
            <button style="width:auto;padding:0 12px;margin:0;flex:1;" onclick="finishGiftCardPartial('card')">💳 Kalanı Kart</button>
          </div>
        </div>
      </div>
    </div>

    <label class="pay-email-toggle ${APP.payWantsEmail?'on':''}">
      <input type="checkbox" id="payEmailInvoice" ${APP.payWantsEmail?'checked':''} onchange="APP.payWantsEmail=this.checked;this.closest('.pay-email-toggle').classList.toggle('on',this.checked)">
      <span class="pet-icon">📧</span>
      <span class="pet-text"><b>Hesabı e-postayla gönder</b><small>Ödemeden sonra müşterinin e-posta adresi sorulur</small></span>
      <span class="pet-switch"></span>
    </label>
    <div class="pay-total-banner">
      <span class="label">Ödenecek</span>
      <span class="amt" id="payFinalTotal">${money(subtotal)}</span>
    </div>
    <div class="pay-method-grid">
      <button class="pay-method-btn cash" onclick="finishPaymentFull('cash')">💵 Nakit</button>
      <button class="pay-method-btn card" onclick="finishPaymentFull('card')">💳 Kredi Kartı</button>
    </div>
    <div class="pay-method-grid secondary">
      <button class="pay-method-btn gift" id="payGiftCardPayBtn" disabled onclick="finishPaymentFull('gift_card')">🎁 Hediye Kartı ile Öde</button>
      <button class="pay-method-btn split" onclick="openSplitPay()">➗ Bölünmüş Ödeme</button>
    </div>
    <button type="button" class="pay-method-btn split" style="width:100%;margin-top:10px;" onclick="openOpenAccountTransfer()">📒 Açık Hesaba At</button>
  </div>`;
  document.body.appendChild(bg);
  autoSelectPayCustomer(order);
  updatePayReadiness();
}
/* Masaya girilmiş müşteri kayıtlıysa ödeme ekranında otomatik seçilir
   (telefon varsa telefonla, yoksa isimle tek ve birebir eşleşmede). */
async function autoSelectPayCustomer(order){
  const input = document.getElementById('payCustomerPhone');
  if(!input) return;
  let phone = (order.customer_phone || '').trim();
  const name = (order.customer_name || '').trim();
  if(!phone && name.length >= 2){
    const { data } = await sb.rpc('search_customers_quick', { p_token: getSession().session_token, p_search: name });
    const exact = (data || []).filter(c => (c.name || '').trim().toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr') && c.phone);
    if(exact.length === 1) phone = exact[0].phone;
  }
  if(!phone || !document.getElementById('payModalBg') || input.value) return;
  input.value = phone;
  lookupPayCustomer();
}
function applyTipPercent(pct){
  const bg = document.getElementById('payModalBg');
  const subtotal = parseFloat(bg.dataset.subtotal);
  const discAmount = parseFloat(bg.dataset.discountAmount||0);
  const base = Math.max(0, subtotal-discAmount);
  const tip = Math.round(base*pct/100*100)/100;
  bg.dataset.tipAmount = String(tip);
  document.getElementById('tipValue').value = tip;
  document.getElementById('tipInfo').textContent = 'Bahşiş: '+money(tip)+' (%'+pct+')';
  syncCashReceivedFromTip();
  updatePayFinalTotalLine();
}
function applyTipAmount(v){
  const bg = document.getElementById('payModalBg');
  let tip = parseFloat(v)||0;
  if(tip<0) tip=0;
  bg.dataset.tipAmount = String(tip);
  document.getElementById('tipInfo').textContent = tip>0 ? 'Bahşiş: '+money(tip) : 'Bahşiş yok';
  syncCashReceivedFromTip();
  updatePayFinalTotalLine();
}
/* "Müşteriden Alınan Nakit" alanı ile bahşiş alanı birbirini senkronize
   eder - hangisine yazılırsa diğeri ona göre güncellenir, ikisi de aynı
   şeyi (bahşiş tutarını) farklı bir açıdan ifade ediyor. */
function syncCashReceivedFromTip(){
  const bg = document.getElementById('payModalBg');
  const receivedInput = document.getElementById('cashReceivedInput');
  if(!receivedInput || document.activeElement===receivedInput) return;
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const due = payFinalTotal();
  receivedInput.value = tip>0 ? (Math.round((due+tip)*100)/100) : '';
}
function handleCashReceivedInput(v){
  const bg = document.getElementById('payModalBg');
  const received = parseFloat(v)||0;
  const due = payFinalTotal();
  const tip = received>due ? Math.round((received-due)*100)/100 : 0;
  bg.dataset.tipAmount = String(tip);
  const tipValueInput = document.getElementById('tipValue');
  if(tipValueInput && document.activeElement!==tipValueInput) tipValueInput.value = tip || '';
  document.getElementById('tipInfo').textContent = tip>0 ? 'Bahşiş: '+money(tip)+' (alınan nakitten hesaplandı)' : 'Bahşiş yok';
  updatePayFinalTotalLine();
}
async function lookupPayCustomer(){
  const bg = document.getElementById('payModalBg');
  const phone = document.getElementById('payCustomerPhone').value.trim();
  const infoEl = document.getElementById('payCustomerInfo');
  const redeemWrap = document.getElementById('payRedeemWrap');
  if(!phone){ infoEl.textContent = 'Telefon girin'; return; }
  const session = getSession();
  const { data, error } = await sb.rpc('get_customer_by_phone', { p_token: session.session_token, p_phone: phone });
  if(error || !data){
    infoEl.textContent = 'Müşteri bulunamadı';
    bg.dataset.customerId = '';
    bg.dataset.customerPoints = '0';
    bg.dataset.redeemPoints = '0';
    bg.dataset.isBirthdayToday = '0';
    delete bg.dataset.pointValue; delete bg.dataset.birthdayPct;
    redeemWrap.style.display = 'none';
    updatePayFinalTotalLine();
    return;
  }
  bg.dataset.customerId = data.id;
  bg.dataset.customerPoints = String(data.points_balance||0);
  bg.dataset.isBirthdayToday = data.is_birthday_today ? '1' : '0';
  const loyalty = (APP.config && APP.config.loyalty) || {};
  // Müşteriye özel sadakat ayarı varsa onu kullan (sunucu genel ayarla birleştirip döner).
  bg.dataset.pointValue = String(data.point_value ?? loyalty.point_value ?? 1);
  bg.dataset.birthdayPct = String(data.birthday_discount_percent ?? loyalty.birthday_discount_percent ?? 0);
  const birthdayPct = Number(bg.dataset.birthdayPct) || 0;
  infoEl.textContent = data.name + ' · ' + data.points_balance + ' puan' + (data.custom_loyalty ? ' · ⭐ özel sadakat' : '') +
    (data.is_birthday_today && birthdayPct>0 ? ' · 🎂 Bugün doğum günü! %'+birthdayPct+' indirim uygulanacak' : '');
  if(loyalty.enabled && data.points_balance>0){
    redeemWrap.style.display = 'block';
    document.getElementById('payRedeemPoints').max = data.points_balance;
  } else {
    redeemWrap.style.display = 'none';
  }
  recomputePaySelection();
}
function applyRedeemPoints(v){
  const bg = document.getElementById('payModalBg');
  let pts = parseFloat(v)||0;
  const maxPts = parseFloat(bg.dataset.customerPoints||0);
  if(pts<0) pts=0; if(pts>maxPts) pts=maxPts;
  bg.dataset.redeemPoints = String(pts);
  recomputePaySelection();
}
async function lookupPayGiftCard(){
  const bg = document.getElementById('payModalBg');
  const code = document.getElementById('payGiftCardCode').value.trim();
  const infoEl = document.getElementById('payGiftCardInfo');
  const payBtn = document.getElementById('payGiftCardPayBtn');
  const partialBox = document.getElementById('payGiftCardPartialActions');
  if(!code){ infoEl.textContent = 'Kart kodu girin'; return; }
  const session = getSession();
  const { data, error } = await sb.rpc('check_gift_card', { p_token: session.session_token, p_code: code });
  if(error || !data){
    infoEl.textContent = error ? error.message : 'Kart bulunamadı';
    bg.dataset.giftCardCode = '';
    bg.dataset.giftCardBalance = '0';
    if(payBtn) payBtn.disabled = true;
    if(partialBox) partialBox.style.display = 'none';
    return;
  }
  bg.dataset.giftCardCode = data.code;
  bg.dataset.giftCardBalance = String(data.balance);
  const total = Math.round(payFinalTotal()*100)/100;
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const amountWithTip = Math.round((total+tip)*100)/100;
  const remaining = Math.round((amountWithTip - data.balance)*100)/100;
  if(remaining > 0){
    // Bakiye yetmiyor: tam ödeme butonu yerine, kartın tamamını düşüp
    // kalanı nakit/kartla tamamlayan iki kısa yol gösterilir.
    infoEl.textContent = data.code + ' · Bakiye: ' + money(data.balance) + ' (yetersiz — kalan ' + money(remaining) + ')';
    if(payBtn) payBtn.disabled = true;
    if(partialBox){
      partialBox.style.display = '';
      partialBox.querySelector('p').textContent = 'Bakiye yetersiz — ' + money(data.balance) + ' düşülür, kalan ' + money(remaining) + ' için seçin:';
    }
  } else {
    infoEl.textContent = data.code + ' · Bakiye: ' + money(data.balance);
    if(payBtn) payBtn.disabled = false;
    if(partialBox) partialBox.style.display = 'none';
  }
}
async function finishGiftCardPartial(method){
  const bg = document.getElementById('payModalBg');
  const orderId = bg.dataset.orderId;
  const code = bg.dataset.giftCardCode;
  const balance = parseFloat(bg.dataset.giftCardBalance||0);
  if(!code){ alert('Önce bir hediye kartı sorgulayın'); return; }
  const itemQtys = buildPayItemQtys();
  if(itemQtys.length===0){ alert('Ödeme almak için en az bir ürün/adet seçin'); return; }
  const total = Math.round(payFinalTotal()*100)/100;
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const amountWithTip = Math.round((total+tip)*100)/100;
  const giftAmount = Math.min(balance, amountWithTip);
  const remaining = Math.round((amountWithTip - giftAmount)*100)/100;
  const customerId = bg.dataset.customerId || null;
  const redeemPoints = parseFloat(bg.dataset.redeemPoints||0);
  await finishPayment(orderId, 'split', total, method==='cash'?remaining:0, method==='card'?remaining:0, parseFloat(bg.dataset.discountAmount||0), itemQtys, tip, customerId, redeemPoints, code, giftAmount);
}
function updatePayFinalTotalLine(){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const net = payFinalTotal();
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const el = document.getElementById('payFinalTotal');
  // İndirim/puan/doğum günü indirimi varsa normal fiyat üstü çizili olarak da gösterilir.
  const gross = parseFloat(bg.dataset.subtotal||0);
  const orig = gross - net > 0.009 ? `<span style="font-size:15px;font-weight:600;color:var(--muted);text-decoration:line-through;margin-right:8px;">${money(gross+tip)}</span>` : '';
  if(el) el.innerHTML = orig+money(net+tip)+(tip>0?' <span style="font-size:12px;font-weight:600;color:var(--muted);">(bahşiş dahil)</span>':'');
}
function stepPayItemQty(itemId, delta){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const order = APP.liveOrders.find(o => o.order_id===bg.dataset.orderId);
  const item = order && order.items.find(i => i.id===itemId);
  if(!item) return;
  const next = Math.max(0, Math.min(item.qty, (PAY_SELECTED_QTYS[itemId]||0) + delta));
  PAY_SELECTED_QTYS[itemId] = next;
  const qtyEl = document.querySelector('.pay-item-qty[data-item-id="'+itemId+'"]');
  if(qtyEl) qtyEl.textContent = next;
  const subEl = document.querySelector('.pay-item-subtotal[data-item-id="'+itemId+'"]');
  if(subEl) subEl.textContent = money(item.price*next);
  recomputePaySelection();
}
function toggleAllPayItems(){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const order = APP.liveOrders.find(o => o.order_id===bg.dataset.orderId);
  const unpaid = order.items.filter(i => !i.paid);
  const allSelected = unpaid.every(i => (PAY_SELECTED_QTYS[i.id]||0) === i.qty);
  unpaid.forEach(i => {
    PAY_SELECTED_QTYS[i.id] = allSelected ? 0 : i.qty;
    const qtyEl = document.querySelector('.pay-item-qty[data-item-id="'+i.id+'"]');
    if(qtyEl) qtyEl.textContent = PAY_SELECTED_QTYS[i.id];
    const subEl = document.querySelector('.pay-item-subtotal[data-item-id="'+i.id+'"]');
    if(subEl) subEl.textContent = money(i.price*PAY_SELECTED_QTYS[i.id]);
  });
  recomputePaySelection();
}
function buildPayItemQtys(){
  return Object.keys(PAY_SELECTED_QTYS)
    .filter(id => PAY_SELECTED_QTYS[id]>0)
    .map(id => ({ item_id: id, qty: PAY_SELECTED_QTYS[id] }));
}
/* Mutfağa giden (istasyonu olan) ürün hazır değilse ödeme alınamaz: uyarı gösterilir,
   ödeme düğmeleri kapanır (sunucu da ayrıca reddeder, bkz. pay_order_items HAZIR_DEGIL). */
function payNotReadyItems(order){
  const prods = (APP.config && APP.config.products) || [];
  return order.items.filter(i => !i.paid && (PAY_SELECTED_QTYS[i.id]||0) > 0 && i.status !== 'ready'
    && (() => { const p = prods.find(x => x.id === i.product_id); return !p || p.station_id; })());
}
function updatePayReadiness(){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const order = APP.liveOrders.find(o => o.order_id===bg.dataset.orderId); if(!order) return;
  const notReady = payNotReadyItems(order);
  let warn = document.getElementById('payNotReadyWarn');
  if(!warn){
    warn = document.createElement('div'); warn.id = 'payNotReadyWarn';
    warn.style.cssText = 'background:rgba(244,63,94,.12);border:1px solid var(--red);color:var(--red);border-radius:12px;padding:10px 12px;margin:10px 0;font-size:13.5px;font-weight:600;';
    const grid = bg.querySelector('.pay-method-grid'); if(grid) grid.parentNode.insertBefore(warn, grid);
  }
  warn.style.display = notReady.length ? '' : 'none';
  warn.innerHTML = notReady.length ? '⏳ Mutfakta hazır olmayan ürün var, ödeme alınamaz: ' + notReady.map(i => escapeHtml(i.name)).join(', ') : '';
  bg.querySelectorAll('.pay-method-btn').forEach(b => {
    if(b.id === 'payGiftCardPayBtn' && !bg.dataset.giftCardCode) return;
    b.disabled = notReady.length > 0; b.style.opacity = notReady.length ? '.5' : '';
  });
}
function recomputePaySelection(){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  setTimeout(updatePayReadiness, 0);
  const order = APP.liveOrders.find(o => o.order_id===bg.dataset.orderId);
  const subtotal = order.items.reduce((s,i) => s + i.price*(PAY_SELECTED_QTYS[i.id]||0), 0);
  bg.dataset.subtotal = String(subtotal);
  document.getElementById('paySubtotalLine').textContent = 'Ara Toplam: '+money(subtotal);
  // İndirim varsa yeni seçime göre yeniden hesaplanır (yüzdeyse orana göre, tutarsa ara toplamı geçmeyecek şekilde).
  const discType = bg.dataset.discountType;
  const discValue = parseFloat(bg.dataset.discountValue||0);
  let discAmount = 0;
  if(discType==='percent') discAmount = subtotal*discValue/100;
  else if(discType==='amount') discAmount = discValue;
  if(discAmount>subtotal) discAmount = subtotal;
  bg.dataset.discountAmount = String(discAmount);
  const discInfo = document.getElementById('discInfo');
  if(discInfo) discInfo.textContent = discAmount>0 ? ('İndirim: -'+money(discAmount)+(discType==='percent'?' (%'+discValue+')':'')) : 'İndirim yok';
  updatePayFinalTotalLine();
}
function applyPayDiscount(){
  const bg = document.getElementById('payModalBg');
  const type = document.getElementById('discType').value;
  let val = parseFloat(document.getElementById('discValue').value)||0;
  if(val<0) val=0;
  bg.dataset.discountType = type;
  bg.dataset.discountValue = String(val);
  recomputePaySelection();
}
function payFinalTotal(){
  const bg = document.getElementById('payModalBg');
  const subtotal = parseFloat(bg.dataset.subtotal);
  const discountAmount = parseFloat(bg.dataset.discountAmount||0);
  const redeemPoints = parseFloat(bg.dataset.redeemPoints||0);
  const pointValue = bg.dataset.pointValue ? Number(bg.dataset.pointValue) : ((APP.config && APP.config.loyalty && APP.config.loyalty.point_value) || 1);
  const afterDiscounts = Math.max(0, subtotal - discountAmount - redeemPoints*pointValue);
  const birthdayPct = bg.dataset.isBirthdayToday==='1' ? (bg.dataset.birthdayPct ? Number(bg.dataset.birthdayPct) : ((APP.config && APP.config.loyalty && APP.config.loyalty.birthday_discount_percent) || 0)) : 0;
  return Math.max(0, afterDiscounts - afterDiscounts*birthdayPct/100);
}
async function finishPaymentFull(method){
  const bg = document.getElementById('payModalBg');
  const orderId = bg.dataset.orderId;
  const itemQtys = buildPayItemQtys();
  if(itemQtys.length===0){ alert('Ödeme almak için en az bir ürün/adet seçin'); return; }
  const total = Math.round(payFinalTotal()*100)/100;
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const amountWithTip = Math.round((total+tip)*100)/100;
  const customerId = bg.dataset.customerId || null;
  const redeemPoints = parseFloat(bg.dataset.redeemPoints||0);
  if(method==='gift_card'){
    const code = bg.dataset.giftCardCode;
    const balance = parseFloat(bg.dataset.giftCardBalance||0);
    if(!code){ alert('Önce bir hediye kartı sorgulayın'); return; }
    if(balance < amountWithTip){ alert('Hediye kartında yeterli bakiye yok (bakiye: '+money(balance)+', gereken: '+money(amountWithTip)+')'); return; }
    await finishPayment(orderId, method, total, 0, 0, parseFloat(bg.dataset.discountAmount||0), itemQtys, tip, customerId, redeemPoints, code, amountWithTip);
    return;
  }
  await finishPayment(orderId, method, total, method==='cash'?amountWithTip:0, method==='card'?amountWithTip:0, parseFloat(bg.dataset.discountAmount||0), itemQtys, tip, customerId, redeemPoints);
}
function openSplitPay(){
  const bg = document.getElementById('payModalBg');
  const orderId = bg.dataset.orderId;
  if(buildPayItemQtys().length===0){ alert('Ödeme almak için en az bir ürün/adet seçin'); return; }
  const itemTotal = Math.round(payFinalTotal()*100)/100;
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const total = Math.round((itemTotal+tip)*100)/100;
  const discountAmount = parseFloat(bg.dataset.discountAmount||0);
  const customerId = bg.dataset.customerId || '';
  const redeemPoints = parseFloat(bg.dataset.redeemPoints||0);
  bg.remove();
  const sbg = document.createElement('div');
  sbg.id = 'splitPayBg';
  sbg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  sbg.onclick = (e) => { if(e.target===sbg) sbg.remove(); };
  sbg.innerHTML = `<div class="pay-modal" style="max-width:700px;">
    <div class="pay-modal-header">
      <h2>➗ Bölünmüş Ödeme</h2>
      <span class="pay-modal-close" onclick="document.getElementById('splitPayBg').remove()">✕</span>
    </div>
    <div class="pay-total-banner" style="margin-top:14px;">
      <span class="label">Ödenecek Tutar</span>
      <span class="amt">${money(total)}</span>
    </div>
    ${tip>0 ? `<p class="muted" style="text-align:center;font-size:12px;margin:-10px 0 14px;">(bahşiş dahil: ${money(tip)})</p>` : ''}

    <div class="pay-options-grid" style="margin-top:14px;">
      <div class="pay-option-card">
        <h4>👥 Kişi Sayısına Göre Hesapla <span class="muted" style="font-weight:400;text-transform:none;">(opsiyonel)</span></h4>
        <div class="field-row" style="margin-bottom:10px;">
          <input id="splitPeople" type="number" min="1" placeholder="Toplam kişi">
          <input id="splitCashPeople" type="number" min="0" placeholder="Nakit ödeyen">
        </div>
        <button style="margin:0;" onclick="calcSplitPay(${total})">Hesapla</button>
      </div>

      <div class="pay-option-card">
        <h4>💵 Nakit / 💳 Kart Dağılımı</h4>
        <label class="hint" style="display:block;margin-bottom:4px;">Nakit Tutar</label>
        <input id="splitCash" type="number" step="0.01" min="0" max="${total}" value="0" oninput="updateSplitPayPreview(${total})" style="margin-bottom:0;">
        <p id="splitCardPreview" class="hint" style="margin:8px 0 0;">Kredi Kartı: ${money(total)}</p>
      </div>

      <div class="pay-option-card">
        <h4>👥 Nakiti Birden Fazla Kişiye Böl <span class="muted" style="font-weight:400;text-transform:none;">(opsiyonel)</span></h4>
        <div class="field-row">
          <input id="cashChargeCount" type="number" min="1" value="1" style="flex:1;">
          <button style="width:auto;padding:0 16px;margin:0;" onclick="genCashCharges(${total})">Böl</button>
        </div>
        <div id="cashChargesBox" style="margin-top:8px;"></div>
      </div>

      <div class="pay-option-card">
        <h4>💳 Kartı Birden Fazla Çekime Böl <span class="muted" style="font-weight:400;text-transform:none;">(opsiyonel)</span></h4>
        <div class="field-row">
          <input id="cardChargeCount" type="number" min="1" value="1" style="flex:1;">
          <button style="width:auto;padding:0 16px;margin:0;" onclick="genCardCharges(${total})">Böl</button>
        </div>
        <div id="cardChargesBox" style="margin-top:8px;"></div>
      </div>
    </div>

    <button class="pay-method-btn cash" style="margin-top:6px;" onclick="confirmSplitPay('${orderId}',${total},${discountAmount},${tip},'${customerId}',${redeemPoints})">✅ Onayla</button>
  </div>`;
  document.body.appendChild(sbg);
}
function calcSplitPay(total){
  const tp = parseFloat(document.getElementById('splitPeople').value)||0;
  const cp = parseFloat(document.getElementById('splitCashPeople').value);
  if(tp<=0 || isNaN(cp) || cp<0 || cp>tp){ alert('Geçerli kişi sayıları girin'); return; }
  const cash = Math.round((total*cp/tp)*100)/100;
  document.getElementById('splitCash').value = cash;
  updateSplitPayPreview(total);
  const cardPeople = Math.round(tp-cp);
  if(cardPeople>0){ document.getElementById('cardChargeCount').value = cardPeople; genCardCharges(total); }
  if(cp>0){ document.getElementById('cashChargeCount').value = cp; genCashCharges(total); }
}
function updateSplitPayPreview(total){
  let cash = parseFloat(document.getElementById('splitCash').value)||0;
  if(cash<0) cash=0; if(cash>total) cash=total;
  document.getElementById('splitCardPreview').textContent = 'Kredi Kartı: '+money(total-cash);
  const cashBox = document.getElementById('cashChargesBox'); if(cashBox) cashBox.innerHTML = '';
  const cardBox = document.getElementById('cardChargesBox'); if(cardBox) cardBox.innerHTML = '';
}
function genCashCharges(total){
  let cash = parseFloat(document.getElementById('splitCash').value)||0;
  if(cash<0) cash=0; if(cash>total) cash=total;
  if(cash<=0){ alert('Bölünecek nakit tutar yok'); return; }
  const count = Math.max(1, parseInt(document.getElementById('cashChargeCount').value)||1);
  const base = Math.floor((cash/count)*100)/100;
  const charges = [];
  let sum=0;
  for(let i=0;i<count-1;i++){ charges.push(base); sum+=base; }
  charges.push(Math.round((cash-sum)*100)/100);
  document.getElementById('cashChargesBox').innerHTML = charges.map((c,i) =>
    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;"><span class="muted" style="width:50px;font-size:12px;">Nakit ${i+1}:</span><input class="cash-input" type="number" step="0.01" value="${c}" style="margin:0;" oninput="updateCashSum()"></div>`
  ).join('') + `<p id="cashSumInfo" class="muted" style="font-size:12px;margin-top:6px;"></p>`;
  updateCashSum(cash);
}
function updateCashSum(needed){
  const inputs = document.querySelectorAll('.cash-input');
  let sum=0; inputs.forEach(i => sum += parseFloat(i.value)||0);
  const info = document.getElementById('cashSumInfo'); if(!info) return;
  info.textContent = 'Nakit toplamı: '+money(sum)+(needed!=null?' / gerekli: '+money(needed):'');
}
function genCardCharges(total){
  const cash = parseFloat(document.getElementById('splitCash').value)||0;
  const cardTotal = Math.round((total-cash)*100)/100;
  if(cardTotal<=0){ alert('Bölünecek kredi kartı tutarı yok'); return; }
  const count = Math.max(1, parseInt(document.getElementById('cardChargeCount').value)||1);
  const base = Math.floor((cardTotal/count)*100)/100;
  const charges = [];
  let sum=0;
  for(let i=0;i<count-1;i++){ charges.push(base); sum+=base; }
  charges.push(Math.round((cardTotal-sum)*100)/100);
  document.getElementById('cardChargesBox').innerHTML = charges.map((c,i) =>
    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;"><span class="muted" style="width:50px;font-size:12px;">Kart ${i+1}:</span><input class="cc-input" type="number" step="0.01" value="${c}" style="margin:0;" oninput="updateCcSum()"></div>`
  ).join('') + `<p id="ccSumInfo" class="muted" style="font-size:12px;margin-top:6px;"></p>`;
  updateCcSum(cardTotal);
}
function updateCcSum(needed){
  const inputs = document.querySelectorAll('.cc-input');
  let sum=0; inputs.forEach(i => sum += parseFloat(i.value)||0);
  const info = document.getElementById('ccSumInfo'); if(!info) return;
  info.textContent = 'Çekimler toplamı: '+money(sum)+(needed!=null?' / gerekli: '+money(needed):'');
}
async function confirmSplitPay(orderId, total, discountAmount, tipAmount, customerId, redeemPoints){
  let cash = parseFloat(document.getElementById('splitCash').value)||0;
  if(cash<0) cash=0; if(cash>total) cash=total;
  const card = Math.round((total-cash)*100)/100;
  document.getElementById('splitPayBg').remove();
  await finishPayment(orderId, 'split', total, cash, card, discountAmount, buildPayItemQtys(), tipAmount, customerId||null, redeemPoints);
}
async function finishPayment(orderId, method, total, cash, card, discountAmount, itemQtys, tipAmount, customerId, redeemPoints, giftCardCode, giftCardAmount){
  // Aynı hesap için üst üste tıklama/çift dokunma pay_order_items'ı iki kez
  // tetikleyip aynı siparişi iki kez ödenmiş gibi işleyebiliyordu (aynı anda
  // giden iki istek de "henüz ödenmemiş" ürünleri görüp ikisi de işliyor).
  // Bu yüzden aynı sipariş için ödeme isteği tamamlanana kadar yenisi engellenir.
  if(!window._payInFlight) window._payInFlight = new Set();
  if(window._payInFlight.has(orderId)){ return; }
  window._payInFlight.add(orderId);
  let data, error;
  try{
    const session = getSession();
    ({ data, error } = await sb.rpc('pay_order_items', {
      p_token: session.session_token, p_order_id: orderId, p_payment_method: method,
      p_cash: cash, p_card: card, p_discount_amount: discountAmount||0, p_item_qtys: itemQtys||null,
      p_tip_amount: tipAmount||0, p_customer_id: customerId||null, p_redeem_points: redeemPoints||0,
      p_gift_card_code: giftCardCode||null, p_gift_card_amount: giftCardAmount||0
    }));
  } finally {
    window._payInFlight.delete(orderId);
  }
  const session = getSession();
  if(error){ alert('Ödeme kaydedilemedi: '+error.message); return; }
  const bg = document.getElementById('payModalBg'); if(bg) bg.remove();
  const { data: liveData } = await sb.rpc('get_live_orders', { p_token: session.session_token });
  APP.liveOrders = liveData || [];
  // Ödeme al(n)dığı an, arkadaki masa/paket kartlarının tutarı da hemen
  // güncellensin diye grid'i her durumda (kısmi/tam) yeniden çiziyoruz.
  if(APP.view==='payments') renderPayGrid();
  APP.lastPaidHistoryId = data && data.history_id;
  if(data && data.order_closed===false){
    // Kısmi ödeme: hesaptaki geri kalan ürünler için ödeme ekranı hemen tekrar açılır.
    showToast('Ödeme alındı ✓ (kalan ürünler için hesap açık kaldı)');
    const remainingOrder = APP.liveOrders.find(o => o.order_id===orderId);
    if(remainingOrder){
      openPayModal(orderId);
    } else if(APP.view!=='payments') {
      renderPaymentsView(document.getElementById('main'), session);
    }
  } else {
    const hid = data && data.history_id;
    // E-posta penceresi yalnızca ödeme ekranında "e-postayla gönder"
    // işaretlendiyse açılır (her hesapta tekrar sorulmaz).
    if(APP.payWantsEmail){ APP.payWantsEmail = false; openInvoiceEmailModal(hid); }
    else showToast('Ödeme alındı ✓');
    if(APP.view!=='payments') renderPaymentsView(document.getElementById('main'), session);
  }
}
/* --- Hesabı e-posta ile gönderme: ödeme sonrası toast'a dokununca açılır.
   Fatura/şirket bilgisi isteğe bağlıdır; e-fatura entegrasyonu açıksa
   kayıt resmi fatura kesilmek üzere kuyruğa alınır (bkz. email_invoice). --- */
function openInvoiceEmailModal(historyId){
  if(!historyId){ showToast('Ödeme alındı ✓'); return; }
  const bg = document.createElement('div');
  bg.id = 'invoiceEmailBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  const hasReview = !!(APP.config && APP.config.google_review_url);
  bg.innerHTML = `<div class="box" style="max-width:380px;width:100%;text-align:left;">
    <h2 style="margin-top:0;margin-bottom:4px;">✅ Ödeme Alındı</h2>
    <p class="muted" style="margin:0 0 12px;font-size:13px;">Hesabı müşteriye e-postayla göndermek ister misiniz?</p>
    <input id="invEmail" type="email" placeholder="Müşterinin e-posta adresi" autocapitalize="none" style="margin-bottom:8px;">
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:4px 0 8px;cursor:pointer;">
      <input type="checkbox" id="invCorporate" style="width:auto;margin:0;" onchange="document.getElementById('invCorpFields').style.display=this.checked?'block':'none'"> Fatura bilgisi ekle (şirket / şahıs)
    </label>
    <div id="invCorpFields" style="display:none;">
      <input id="invBuyerName" placeholder="Ad Soyad / Şirket Ünvanı" style="margin-bottom:8px;">
      <input id="invBuyerTax" placeholder="VKN / TCKN" inputmode="numeric" maxlength="11" style="margin-bottom:8px;">
      <input id="invBuyerOffice" placeholder="Vergi Dairesi" style="margin-bottom:8px;">
      <input id="invBuyerAddr" placeholder="Adres" style="margin-bottom:8px;">
    </div>
    <div class="error" id="invErr" style="text-align:left;"></div>
    <div class="field-row" style="gap:8px;margin-top:6px;">
      <button type="button" style="flex:1;margin:0;background:var(--panel2);color:var(--text);" onclick="document.getElementById('invoiceEmailBg').remove()">İptal</button>
      <button type="button" id="invSendBtn" style="flex:1;margin:0;" onclick="sendInvoiceEmail('${historyId}')">📧 Gönder</button>
    </div>
    ${hasReview ? `<button type="button" class="ghost-btn" style="width:100%;margin-top:10px;" onclick="document.getElementById('invoiceEmailBg').remove();showGoogleReviewQr()">⭐ Google yorum QR'ını göster</button>` : ''}
  </div>`;
  document.body.appendChild(bg);
  setTimeout(() => { const el = document.getElementById('invEmail'); if(el) el.focus(); }, 50);
}
async function sendInvoiceEmail(historyId){
  const email = document.getElementById('invEmail').value.trim();
  const err = document.getElementById('invErr'); err.textContent = '';
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ err.textContent = 'Geçerli bir e-posta adresi girin'; return; }
  const corp = document.getElementById('invCorporate').checked;
  const v = id => corp ? document.getElementById(id).value.trim() : null;
  const btn = document.getElementById('invSendBtn');
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  const session = getSession();
  const { data, error } = await sb.rpc('email_invoice', {
    p_token: session.session_token, p_history_id: historyId, p_email: email,
    p_buyer_name: v('invBuyerName'), p_buyer_tax_number: v('invBuyerTax'),
    p_buyer_tax_office: v('invBuyerOffice'), p_buyer_address: v('invBuyerAddr')
  });
  if(error){ err.textContent = error.message; btn.disabled = false; btn.textContent = 'Gönder'; return; }
  document.getElementById('invoiceEmailBg').remove();
  showToast(data && data.status==='efatura_queued'
    ? '📧 Gönderildi ('+data.number+') · e-Fatura kuyruğa alındı'
    : '📧 Hesap e-postayla gönderildi ('+(data&&data.number)+')');
}
/* --- Google Yorumları'na yönlendirme: hesap tamamen kapandığında (bkz.
   yukarısı) personele gösterilen toast'a dokununca, müşterinin telefonuyla
   okutabileceği bir QR kod açılır (bkz. Ayarlar > Entegrasyonlar). --- */
function showGoogleReviewQr(){
  const url = APP.config && APP.config.google_review_url;
  if(!url) return;
  const qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(url);
  const bg = document.createElement('div');
  bg.id = 'googleReviewQrBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:320px;width:100%;text-align:center;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">⭐ Bizi Değerlendirin</h2><span style="cursor:pointer;color:var(--muted);" onclick="document.getElementById('googleReviewQrBg').remove()">✕</span></div>
    <p class="muted" style="font-size:13px;">Müşteriye telefonuyla okutması için gösterin</p>
    <img src="${qrImgUrl}" alt="QR" style="width:100%;max-width:260px;margin:6px 0 14px;border-radius:8px;background:#fff;padding:8px;">
  </div>`;
  document.body.appendChild(bg);
}

async function openOrderView(){
  APP.view='order';
  render();
}
async function renderOrderView(main, session){
  main.innerHTML = `<h1>Sipariş Al</h1><div class="muted" id="orderStatus"></div><div id="customerReqBanner"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div class="tabs" id="zoneTabs" style="margin:16px 0 0;"></div>
      <div style="display:flex;gap:8px;">
        <button type="button" style="width:auto;padding:7px 12px;margin:0;background:transparent;border:1px solid var(--border);color:var(--text);box-shadow:none;font-size:12.5px;" onclick="openTableScanModal()">📷 Masa Tara</button>
        ${hasFeature('floorplan') ? `<button type="button" style="width:auto;padding:7px 12px;margin:0;background:transparent;border:1px solid var(--border);color:var(--text);box-shadow:none;font-size:12.5px;" onclick="toggleOrderTableViewMode()" id="tableViewModeBtn">${APP.orderTableViewMode==='floorplan'?'📋 Liste Görünümü':'🗺️ Kat Planı'}</button>` : ''}
      </div>
    </div>
    <div class="table-grid" id="tableGrid" style="margin-top:12px;"></div>
    <div id="tableFloorPlan" class="floorplan-canvas" style="display:none;margin-top:12px;padding:14px;"></div>`;
  const [cfgRes, liveRes] = await withLoadingOverlay(Promise.all([
    sb.rpc('get_restaurant_config', { p_token: session.session_token }),
    sb.rpc('get_live_orders', { p_token: session.session_token })
  ]));
  const statusEl = document.getElementById('orderStatus');
  if(cfgRes.error || liveRes.error){
    statusEl.textContent = 'Veri yüklenemedi: ' + ((cfgRes.error||liveRes.error).message);
    statusEl.style.color = 'var(--red)';
    return;
  }
  APP.config = cfgRes.data;
  APP.liveOrders = liveRes.data || [];
  statusEl.textContent = '';
  if(!APP.config.zones || APP.config.zones.length===0){
    document.getElementById('tableGrid').innerHTML = '<p class="muted">Henüz bölge/masa eklenmemiş.</p>';
    return;
  }
  APP.selectedZone = APP.selectedZone || APP.config.zones[0].id;
  renderZoneTabs();
  renderTableGrid();
  refreshCustomerOrderRequests(session);
  startOrderPolling(session);
}
function stopOrderPolling(){
  if(APP.orderPollInterval){ clearInterval(APP.orderPollInterval); APP.orderPollInterval=null; }
}
function startOrderPolling(session){
  stopOrderPolling();
  // Mutfaktan "Hazır" işaretlenince Sipariş Al ekranındaki masa kartları (X ürün
  // hazırlanıyor/hazır) başka bir cihazdan geldiği için otomatik yenilenmez -
  // bu yüzden burada da kitchen ekranındaki gibi periyodik arka plan yenileme var.
  APP.orderPollInterval = setInterval(() => {
    if(APP.view==='order' || APP.view==='packages') refreshOrderLiveStatus(session);
  }, 5000);
}
async function refreshOrderLiveStatus(session){
  const { data, error } = await sb.rpc('get_live_orders', { p_token: session.session_token });
  reportPollResult('orderLiveStatus', !error);
  if(error) return;
  APP.liveOrders = data || [];
  if(APP.view==='order') renderTableGrid();
  if(APP.view==='packages') renderPackageGrid();
  const bg = document.getElementById('tableModalBg');
  if(bg && bg.dataset.tableId) renderTableItems(bg.dataset.tableId);
  if(APP.view==='order') refreshCustomerOrderRequests(session);
}
/* Müşterinin /menu/ sayfasından gönderdiği sipariş istekleri (bkz.
   submit_customer_order_request) Sipariş Al ekranının üstünde bir
   bildirim şeridinde toplanır - personel onaylayana kadar mutfağa
   düşmez (bkz. approve_customer_order_request, fiyat/ürün her zaman
   sunucu tarafında products tablosundan doğrulanır, müşteriden gelen
   fiyat asla güvenilmez). Bu fonksiyon artık ekrana bakılmaksızın
   (bkz. startCustomerRequestPolling) 20 saniyede bir periyodik çağrılıyor:
   Sipariş Al ekranındaysa şerit güncellenir, değilse HENÜZ ONAYLANMAMIŞ
   her istek için her turda tekrar tekrar toast bildirimi gösterilir -
   personel onaylayana/reddedene kadar (tek seferlik değil, bilinçli
   olarak) - böylece başka bir ekranda olsa bile QR siparişini kaçırmaz. */
function customerRequestLabel(r){
  if(r.table_name) return escapeHtml(r.table_name);
  return r.order_type==='delivery' ? '🛵 Teslimat' : '🥡 Gel-Al';
}
async function refreshCustomerOrderRequests(session){
  const { data, error } = await sb.rpc('list_customer_order_requests', { p_token: session.session_token });
  reportPollResult('customerOrderRequests', !error);
  if(error) return;
  const rows = data || [];
  APP.customerRequests = rows;
  const banner = document.getElementById('customerReqBanner');
  if(banner){
    banner.innerHTML = rows.length===0 ? '' : `<div class="box" style="max-width:none;border-color:var(--accent);background:rgba(0,143,168,.08);">
    <h2 style="margin:0 0 8px;">📱 Müşteri Sipariş İstekleri (${rows.length})</h2>
    ${rows.map(r => `
      <div style="padding:8px 0;border-top:1px dashed var(--border);">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <b style="overflow-wrap:anywhere;word-break:break-word;">${customerRequestLabel(r)}${r.customer_name?' · '+escapeHtml(r.customer_name):''}</b>
          <span class="muted" style="font-size:12px;">${new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span>
        </div>
        ${(r.customer_phone||r.delivery_address) ? `<div class="muted" style="font-size:12px;margin-top:2px;overflow-wrap:anywhere;word-break:break-word;">${r.customer_phone?'📞 '+escapeHtml(r.customer_phone):''}${r.customer_phone&&r.delivery_address?' · ':''}${r.delivery_address?'📍 '+escapeHtml(r.delivery_address):''}</div>` : ''}
        <div style="font-size:13px;margin-top:4px;">
          ${r.items.map(it => `${it.qty}x ${escapeHtml(it.name||'?')}${it.note?' <span class="muted">('+escapeHtml(it.note)+')</span>':''}`).join(', ')}
        </div>
        <div style="margin-top:8px;">
          <button class="sbtn" style="background:var(--green);color:var(--btn-ink);" onclick="approveCustomerRequest('${r.id}')">✅ Onayla</button>
          <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="rejectCustomerRequest('${r.id}')">✕ Reddet</button>
        </div>
      </div>`).join('')}
  </div>`;
  }
  // Sipariş Al ekranındaki şerit görünür olsa bile bildirim AYRICA gösterilir
  // (ekran arka planda/simge durumunda/başka monitörde olabilir - şerit
  // görünür olması fiziksel olarak fark edildiği anlamına gelmez).
  if(rows.length>0){
    const labels = rows.map(r => (r.table_name || (r.order_type==='delivery'?'Teslimat':r.order_type==='pickup'?'Gel-Al':'Masa')) + (r.customer_name?' · '+r.customer_name:''));
    const shown = labels.slice(0,3).join(', ') + (labels.length>3 ? ' ve ' + (labels.length-3) + ' tane daha' : '');
    showToast('📱 Onay bekleyen müşteri sipariş isteği: ' + shown, 20000, null, () => goToView('order'), true);
  }
}
/* Sipariş Al ekranına girilmese bile QR sipariş isteklerinin fark
   edilmesi için oturum boyunca çalışan, ekrandan bağımsız arka plan
   döngüsü - sadece sipariş alma yetkisi olan personelde çalışır. */
let CUSTOMER_REQ_POLL_INTERVAL = null;
function startCustomerRequestPolling(session){
  stopCustomerRequestPolling();
  if(!hasPerm(session, 'order')) return;
  refreshCustomerOrderRequests(session);
  CUSTOMER_REQ_POLL_INTERVAL = setInterval(() => {
    const s = getSession();
    if(s) refreshCustomerOrderRequests(s);
  }, 20000);
}
/* --- Masadan garson çağrıları (QR menü > Garson Çağır): her ekranda sağ
   altta sabit bir kutuda listelenir; sipariş çağrıları 'order', ödeme
   çağrıları 'payments' izni olana gelir (bkz. list_waiter_calls). --- */
let WAITER_CALL_TIMER = null, WAITER_CALL_SEEN = new Set();
function startWaiterCallPolling(){
  if(WAITER_CALL_TIMER) clearInterval(WAITER_CALL_TIMER);
  refreshWaiterCalls();
  WAITER_CALL_TIMER = setInterval(refreshWaiterCalls, 10000);
}
async function refreshWaiterCalls(){
  const session = getSession();
  if(!session || (!hasPerm(session, 'order') && !hasPerm(session, 'payments'))){ const b = document.getElementById('waiterCallBox'); if(b) b.remove(); return; }
  const { data, error } = await sb.rpc('list_waiter_calls', { p_token: session.session_token });
  if(error) return;
  const rows = data || [];
  drawWaiterCallInline(rows);
  let box = document.getElementById('waiterCallBox');
  if(!rows.length){ if(box) box.remove(); return; }
  if(!box){ box = document.createElement('div'); box.id = 'waiterCallBox'; document.body.appendChild(box); }
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:90;max-width:min(340px,calc(100vw - 32px));background:var(--panel);border:2px solid var(--accent);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:12px 14px;';
  box.innerHTML = `<div style="font-weight:800;margin-bottom:6px;">🔔 Garson Çağrıları (${rows.length})</div>` + rows.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-top:1px dashed var(--border);">
      <span style="font-size:13.5px;overflow-wrap:anywhere;">${r.kind==='payment' ? '💳' : '🙋'} <b>${escapeHtml(r.table_name||'Masa')}</b> · ${r.kind==='payment' ? 'hesap istiyor' : 'sipariş verecek'}
        <span class="muted" style="font-size:11.5px;">${new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span></span>
      <button type="button" class="sbtn" style="width:auto;margin:0;background:var(--green);color:var(--btn-ink);white-space:nowrap;" onclick="resolveWaiterCall('${r.id}')">✓ Gittim</button>
    </div>`).join('');
  const fresh = rows.filter(r => !WAITER_CALL_SEEN.has(r.id));
  fresh.forEach(r => WAITER_CALL_SEEN.add(r.id));
  if(fresh.length){
    showToast('🔔 ' + fresh.map(r => (r.table_name||'Masa') + (r.kind==='payment' ? ' hesap istiyor' : ' garson çağırıyor')).join(', '), 15000);
    playPeyktanSound();
  }
}
// Sipariş Al ekranında sipariş çağrıları, Ödemeler ekranında hesap
// çağrıları sayfanın en üstünde de gösterilir (menüdeki rozetin karşılığı).
function drawWaiterCallInline(rows){
  const main = document.getElementById('main');
  const kind = APP.view==='payments' ? 'payment' : APP.view==='order' ? 'order' : null;
  let el = document.getElementById('waiterCallInline');
  const list = kind ? rows.filter(r => r.kind===kind) : [];
  if(!main || !list.length){ if(el) el.remove(); return; }
  if(!el || el.parentNode!==main){ if(el) el.remove(); el = document.createElement('div'); el.id = 'waiterCallInline'; main.prepend(el); }
  el.innerHTML = `<div class="box" style="max-width:none;border:2px solid var(--accent);background:rgba(0,143,168,.08);margin-bottom:14px;">
    <h2 style="margin:0 0 8px;">${kind==='payment' ? '💳 Hesap isteyen masalar' : '🙋 Garson çağıran masalar'} (${list.length})</h2>
    ${list.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px dashed var(--border);">
      <span><b>${escapeHtml(r.table_name||'Masa')}</b> <span class="muted" style="font-size:12px;">${new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span></span>
      <button type="button" class="sbtn" style="width:auto;margin:0;background:var(--green);color:var(--btn-ink);" onclick="resolveWaiterCall('${r.id}')">✓ Gittim</button></div>`).join('')}
  </div>`;
}
async function resolveWaiterCall(id){
  const session = getSession();
  const { error } = await sb.rpc('resolve_waiter_call', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  refreshWaiterCalls(); refreshNavBadges();
}
function stopCustomerRequestPolling(){
  if(CUSTOMER_REQ_POLL_INTERVAL){ clearInterval(CUSTOMER_REQ_POLL_INTERVAL); CUSTOMER_REQ_POLL_INTERVAL=null; }
}

/* --- Vardiya (personel giriş/çıkış) widget'ı: sidebar'da her ekranda
   görünür. İşletmede "yönetici onayı" açıksa (varsayılan) personelin
   başlatma isteği yönetici onaylayana kadar bekler ve vardiyayı sadece
   yönetici bitirebilir (bkz. clock_in/clock_out, manage_staff_shift). */
function shiftWidgetHtml(){
  const st = APP.shiftStatus;
  if(!st) return '<div class="shift-status">Vardiya durumu yükleniyor…</div>';
  if(st.pending){
    return `<div class="shift-status pending">🟡 <span class="label">Yönetici onayı bekleniyor</span></div>`
      + `<button class="sb-shift-btn out" onclick="doClockToggle()" title="Talebi Geri Çek">✕<span class="label"> Talebi Geri Çek</span></button>`;
  }
  if(st.clocked_in){
    const t = new Date(st.clock_in);
    const hh = String(t.getHours()).padStart(2,'0'), mm = String(t.getMinutes()).padStart(2,'0');
    return `<div class="shift-status on">🟢 <span class="label">Vardiyada (${hh}:${mm}'dan beri)</span></div>`
      + (st.can_end
        ? `<button class="sb-shift-btn out" onclick="doClockToggle()" title="Vardiyayı Bitir">⏹<span class="label"> Vardiyayı Bitir</span></button>`
        : st.end_requested
          ? `<div class="shift-status pending"><span class="label">🟡 Bitirme onayı bekleniyor</span></div><button class="sb-shift-btn" onclick="doClockToggle()" title="Bitirme Talebini Geri Çek">✕<span class="label"> Talebi Geri Çek</span></button>`
          : `<button class="sb-shift-btn out" onclick="doClockToggle()" title="Vardiyayı Bitirmeyi İste">⏹<span class="label"> Bitirmeyi İste</span></button>`);
  }
  const needsApproval = st.approval_required && !st.is_manager;
  return '<div class="shift-status">⚪ <span class="label">Vardiya Dışı</span></div>'
    + `<button class="sb-shift-btn in" onclick="doClockToggle()" title="${needsApproval?'Vardiya Başlatma İste':'Vardiyaya Başla'}">▶<span class="label"> ${needsApproval?'Vardiya Başlatma İste':'Vardiyaya Başla'}</span></button>`;
}
async function refreshShiftWidget(session){
  const { data, error } = await sb.rpc('get_my_shift_status', { p_token: session.session_token });
  reportPollResult('shiftStatus', !error);
  if(error) return;
  const wasGated = typeof shiftGateActive==='function' && shiftGateActive();
  APP.shiftStatus = data;
  // Vardiya kapısı durumu değiştiyse (vardiya başladı/bitti, ayar değişti) ekranı yeniden çiz.
  if(typeof shiftGateActive==='function' && wasGated !== shiftGateActive() && document.getElementById('main')) render();
  const el = document.getElementById('shiftWidget');
  if(el) el.innerHTML = shiftWidgetHtml();
}
async function doClockToggle(){
  const session = getSession(); if(!session) return;
  const st = APP.shiftStatus || {};
  const ending = !!(st.clocked_in || st.pending);
  const { data, error } = await withLoadingOverlay(sb.rpc(ending ? 'clock_out' : 'clock_in', { p_token: session.session_token }));
  if(error){ showToast(error.message); return; }
  if(data && data.end_requested) showToast('Bitirme talebiniz yöneticiye iletildi');
  else if(data && data.end_request_cancelled) showToast('Bitirme talebi geri çekildi');
  else if(ending) showToast(st.pending ? 'Vardiya talebi geri çekildi' : 'Vardiya bitti ✓');
  else showToast(data && data.pending ? (st.shift_required ? 'Talebiniz yöneticiye iletildi, çalışmaya başlayabilirsiniz ✓' : 'Talebiniz yöneticiye iletildi, onaylanınca vardiyanız başlar') : 'Vardiya başladı ✓');
  await refreshShiftWidget(session);
  refreshNavBadges();
}
async function approveCustomerRequest(id){
  const session = getSession();
  const { error } = await sb.rpc('approve_customer_order_request', { p_token: session.session_token, p_request_id: id });
  if(error){ alert(error.message); return; }
  showToast('Sipariş onaylandı, mutfağa iletildi ✓');
  refreshCustomerOrderRequests(session);
  refreshOrderLiveStatus(session);
}
async function rejectCustomerRequest(id){
  if(!confirm('Bu isteği reddetmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('reject_customer_order_request', { p_token: session.session_token, p_request_id: id });
  if(error){ alert(error.message); return; }
  refreshCustomerOrderRequests(session);
}
function renderZoneTabs(){
  const el = document.getElementById('zoneTabs'); if(!el) return;
  // Her bölge sekmesinde o bölgedeki açık (dolu) masa sayısı rozet olarak görünür.
  el.innerHTML = APP.config.zones.map(z => {
    const open = (z.tables||[]).filter(t => liveOrderForTable(t.id)).length;
    return `<div class="tab ${z.id===APP.selectedZone?'active':''}" onclick="selectZone('${z.id}')">${escapeHtml(z.name)}${open ? ` <span class="zone-badge" title="${open} açık masa">${open}</span>` : ''}</div>`;
  }).join('');
}
function selectZone(id){ APP.selectedZone = id; renderZoneTabs(); renderTableGrid(); }
/* ---- Masa QR'ını okutarak hızlı geçiş ----
   Her masanın QR kodu /menu/?t=<qr_token> linkini kodluyor (bkz.
   showTableQr, settings.js). Burada aynı QR personel tarafından
   getUserMedia + jsQR (CDN'den yüklenen küçük bir saf JS kütüphanesi) ile
   okutulup ilgili masa bulunarak, hangi ekrandan tetiklendiğine göre
   doğrudan o masanın sipariş ekranı (Sipariş Al) ya da hesap/ödeme
   penceresi (Ödemeler) açılır - masayı bölge sekmelerinde tek tek aramaya
   gerek kalmaz. Kamera erişimi
   standart bir web API'si (getUserMedia) olduğu için Capacitor'ün WebView
   köprüsü Android'de izni otomatik yönetiyor (bkz. AndroidManifest.xml'deki
   CAMERA izni) - ayrı bir native eklenti gerekmedi. */
let QR_SCAN_STREAM = null;
let QR_SCAN_RAF = null;
function loadJsQrLibrary(){
  if(window.jsQR) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('QR kütüphanesi yüklenemedi'));
    document.head.appendChild(s);
  });
}
async function openTableScanModal(){
  if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)){
    alert('Bu cihaz/tarayıcı kamera erişimini desteklemiyor.');
    return;
  }
  const bg = document.createElement('div');
  bg.id = 'qrScanModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) closeTableScanModal(); };
  bg.innerHTML = `<div style="background:var(--panel);border-radius:16px;padding:16px;max-width:380px;width:100%;text-align:center;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h2 style="margin:0;font-size:16px;">📷 Masa QR'ını Okutun</h2>
      <span style="cursor:pointer;color:var(--muted);font-size:20px;" onclick="closeTableScanModal()">✕</span>
    </div>
    <video id="qrScanVideo" playsinline autoplay muted style="width:100%;border-radius:10px;background:#000;"></video>
    <canvas id="qrScanCanvas" style="display:none;"></canvas>
    <p id="qrScanStatus" class="muted" style="font-size:12px;margin-top:10px;">Kamera başlatılıyor...</p>
  </div>`;
  document.body.appendChild(bg);
  const statusEl = document.getElementById('qrScanStatus');
  try{
    await loadJsQrLibrary();
  }catch(e){
    statusEl.textContent = '⚠️ ' + e.message;
    return;
  }
  try{
    QR_SCAN_STREAM = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  }catch(e){
    statusEl.textContent = '⚠️ Kameraya erişilemedi: izin verilmedi ya da kamera bulunamadı.';
    return;
  }
  const video = document.getElementById('qrScanVideo');
  if(!video){ closeTableScanModal(); return; } // modal bu sırada kapatılmış olabilir
  video.srcObject = QR_SCAN_STREAM;
  await video.play().catch(()=>{});
  statusEl.textContent = 'QR kodu kameraya gösterin...';
  scanQrFrame();
}
function closeTableScanModal(){
  if(QR_SCAN_RAF){ cancelAnimationFrame(QR_SCAN_RAF); QR_SCAN_RAF=null; }
  if(QR_SCAN_STREAM){ QR_SCAN_STREAM.getTracks().forEach(t => t.stop()); QR_SCAN_STREAM=null; }
  const bg = document.getElementById('qrScanModalBg'); if(bg) bg.remove();
}
function scanQrFrame(){
  const video = document.getElementById('qrScanVideo');
  const canvas = document.getElementById('qrScanCanvas');
  if(!video || !canvas || !QR_SCAN_STREAM) return;
  if(video.readyState === video.HAVE_ENOUGH_DATA){
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR(imageData.data, imageData.width, imageData.height);
    if(code && code.data){
      handleScannedTableQr(code.data);
      return;
    }
  }
  QR_SCAN_RAF = requestAnimationFrame(scanQrFrame);
}
function handleScannedTableQr(text){
  let token = text;
  try{
    const u = new URL(text);
    const t = u.searchParams.get('t');
    if(t) token = t;
  }catch(e){ /* URL değil - düz token olarak kabul edilir */ }
  let found = null, foundZone = null;
  (APP.config.zones||[]).forEach(z => {
    z.tables.forEach(t => { if(t.qr_token===token){ found = t; foundZone = z; } });
  });
  if(!found){
    const statusEl = document.getElementById('qrScanStatus');
    if(statusEl) statusEl.textContent = '⚠️ Bu QR kod bu işletmeye ait bir masa değil, tekrar deneyin.';
    QR_SCAN_RAF = requestAnimationFrame(scanQrFrame);
    return;
  }
  closeTableScanModal();
  // Ödemeler ekranında QR okutmak, o masanın sipariş ekranını değil,
  // doğrudan ödeme (hesap) penceresini açar - masada ödenecek açık bir
  // hesap yoksa kullanıcı bilgilendirilir (personel yanlış masayı
  // okutmuş ya da hesap zaten kapatılmış olabilir).
  if(APP.view==='payments'){
    const order = liveOrderForTable(found.id);
    const hasUnpaid = order && order.items.some(i => !i.paid);
    if(!hasUnpaid){
      alert('Bu masada ödenecek açık bir hesap yok: ' + found.name);
      return;
    }
    openPayModal(order.order_id);
    return;
  }
  APP.selectedZone = foundZone.id;
  if(APP.view==='order'){ renderZoneTabs(); renderTableGrid(); }
  openTableModal(found.id);
}
function liveOrderForTable(tableId){
  // Paket Servis siparişleri table_id'siz olduğu için sözde bir kimlikle
  // ('pkg_<order_id>') temsil ediliyor - bu durumda order_id ile eşleştirilir.
  if(typeof tableId==='string' && tableId.indexOf('pkg_')===0 && tableId!=='pkg_new'){
    const orderId = tableId.slice(4);
    return (APP.liveOrders||[]).find(o => o.order_id===orderId);
  }
  // Bekleme listesindeki müşterinin ön siparişi: 'wl_<waitlist_id>'.
  if(typeof tableId==='string' && tableId.indexOf('wl_')===0){
    const wlId = tableId.slice(3);
    return (APP.liveOrders||[]).find(o => o.kind==='waitlist' && o.waitlist_id===wlId);
  }
  return (APP.liveOrders||[]).find(o => o.table_id===tableId);
}
function tableStatus(t){
  const order = liveOrderForTable(t.id);
  const draft = (APP.draftCart && APP.draftCart[t.id]) || [];
  let sub = 'Boş';
  let occupied = false;
  if(order && order.items.length>0){
    occupied = true;
    const allReady = order.items.every(i => i.status==='ready');
    sub = order.items.length + ' ürün - ' + (allReady?'Hazır':'hazırlanıyor');
  }
  if(draft.length>0){ sub += (occupied?' + ':'') + draft.length+' üründe sepette'; occupied = true; }
  // Rezervasyondan oturtulan masa (henüz ürün yok): müşteri adıyla dolu görünür.
  if(order && order.customer_name){
    if(!occupied){ occupied = true; sub = '👤 ' + escapeHtml(order.customer_name); }
    else sub = '👤 ' + escapeHtml(order.customer_name) + '<br>' + sub;
  }
  return { sub, occupied };
}
/* İki görünüm var: basit liste (table-grid) ve sürükle-bırak ile
   yerleştirilmiş görsel kat planı (bkz. Ayarlar > Kat Planı ve
   update_table_positions RPC'si). Yönetici konumları belirlemediyse
   (hepsi varsayılan 20,20 ise) kat planı boş/üst üste görünür - bu
   yüzden buton her zaman görünür ama kat planı ayarlanmamışsa liste
   görünümü varsayılan kalır. */
function toggleOrderTableViewMode(){
  APP.orderTableViewMode = APP.orderTableViewMode==='floorplan' ? 'grid' : 'floorplan';
  const btn = document.getElementById('tableViewModeBtn');
  if(btn) btn.textContent = APP.orderTableViewMode==='floorplan' ? '📋 Liste Görünümü' : '🗺️ Kat Planı';
  renderTableGrid();
}
function renderTableGrid(){
  renderZoneTabs();
  const gridEl = document.getElementById('tableGrid');
  const fpEl = document.getElementById('tableFloorPlan');
  const zone = APP.config.zones.find(z => z.id===APP.selectedZone);
  if(APP.orderTableViewMode==='floorplan' && hasFeature('floorplan')){
    if(gridEl) gridEl.style.display = 'none';
    if(fpEl) fpEl.style.display = 'block';
    renderTableFloorPlan(zone, fpEl);
    return;
  }
  if(gridEl) gridEl.style.display = 'grid';
  if(fpEl) fpEl.style.display = 'none';
  const el = gridEl; if(!el) return;
  if(!zone || zone.tables.length===0){ el.innerHTML = '<p class="muted">Bu bölgede masa yok.</p>'; return; }
  // Masalar isme göre doğal sırada (Masa2 < Masa10) listelenir.
  const sorted = zone.tables.slice().sort((a,b) => String(a.name).localeCompare(String(b.name), 'tr', { numeric:true, sensitivity:'base' }));
  el.innerHTML = sorted.map(t => {
    const { sub, occupied } = tableStatus(t);
    return `<div class="table-cell" style="${occupied?'background:rgba(244,63,94,.14);border-color:var(--red);color:var(--red);':''}" onclick="openTableModal('${t.id}')">
      ${escapeHtml(t.name)}<div style="font-size:11px;margin-top:4px;font-weight:400;">${sub}</div></div>`;
  }).join('');
}
function renderTableFloorPlan(zone, el){
  if(!el) return;
  if(!zone || zone.tables.length===0){ el.innerHTML = '<p class="muted" style="padding:10px;">Bu bölgede masa yok.</p>'; return; }
  const { scale } = fpLayout(el, zone.tables);
  el.innerHTML = zone.tables.map(t => {
    const { sub, occupied } = tableStatus(t);
    return `<div class="floorplan-table ${occupied?'occupied':''}" style="left:${Number(t.pos_x||0)*scale}px;top:${Number(t.pos_y||0)*scale}px;" onclick="openTableModal('${t.id}')">
      ${escapeHtml(t.name)}<div class="fp-sub">${sub}</div></div>`;
  }).join('');
}

/* ---- Sipariş Etiketleri (Personel Yemeği, İkram vb.) - masa/paket penceresinde checkbox'lar ---- */
function orderFlagsHtml(pseudoId){
  const flags = APP.config.order_flags || [];
  if(flags.length===0) return '';
  if(!APP.orderFlagSelections) APP.orderFlagSelections = {};
  if(!APP.orderFlagSelections[pseudoId]){
    const existing = liveOrderForTable(pseudoId);
    APP.orderFlagSelections[pseudoId] = (existing && existing.tags) ? existing.tags.slice() : [];
  }
  const sel = APP.orderFlagSelections[pseudoId];
  return `<div style="margin-top:14px;padding:10px 12px;background:var(--panel2);border-radius:10px;">
    <p class="muted" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin:0 0 8px;">Sipariş Etiketleri</p>
    <div style="display:flex;flex-wrap:wrap;gap:12px;">
      ${flags.map(f => `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
        <input type="checkbox" style="width:auto;margin:0;" data-label="${escapeAttr(f.label)}" ${sel.includes(f.label)?'checked':''} onchange="toggleOrderFlag('${pseudoId}',this.dataset.label,this.checked)">
        ${escapeHtml(f.label)}
      </label>`).join('')}
    </div>
  </div>`;
}
function toggleOrderFlag(pseudoId, label, checked){
  if(!APP.orderFlagSelections) APP.orderFlagSelections = {};
  if(!APP.orderFlagSelections[pseudoId]) APP.orderFlagSelections[pseudoId] = [];
  const sel = APP.orderFlagSelections[pseudoId];
  const idx = sel.indexOf(label);
  if(checked && idx===-1) sel.push(label);
  else if(!checked && idx!==-1) sel.splice(idx,1);
}

/* Masadaki müşteri bilgisi: rezervasyondan gelir ya da elle girilir
   (bkz. set_table_customer - masa boşsa isimle açılır). */
function tableCustomerInfoHtml(tableId){
  if(String(tableId).indexOf('pkg_')===0 || String(tableId).indexOf('wl_')===0) return '';
  return `<div id="tableCustWrap">${tableCustomerInnerHtml(tableId)}</div>`;
}
function tableCustomerInnerHtml(tableId, editing){
  const o = liveOrderForTable(tableId);
  const name = (o && o.customer_name) || '', phone = (o && o.customer_phone) || '';
  if(editing){
    return `<div style="background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:12px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <input id="tableCustName" data-table="${tableId}" placeholder="Müşteri adı veya kayıtlı müşteri ara" autocomplete="off" value="${escapeAttr(name)}" style="margin:0;" oninput="tableCustSearch(this.value)" onchange="saveTableCustomer('${tableId}', true)">
        <input id="tableCustPhone" placeholder="Telefon (opsiyonel)" inputmode="tel" autocomplete="off" value="${escapeAttr(phone)}" style="margin:0;" oninput="tableCustSearch(this.value)" onchange="saveTableCustomer('${tableId}', true)">
      </div>
      <div id="tableCustSuggest"></div>
      <p class="muted" style="font-size:11.5px;margin:6px 2px 0;">Otomatik kaydedilir.</p>
    </div>`;
  }
  if(!o || !(name || phone || o.note)){
    return `<button type="button" class="ghost-btn" style="width:100%;margin:0 0 12px;" onclick="document.getElementById('tableCustWrap').innerHTML=tableCustomerInnerHtml('${tableId}', true);document.getElementById('tableCustName').focus()">👤 Müşteri Adı Ekle</button>`;
  }
  return `<div style="background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:13.5px;display:flex;gap:10px;align-items:flex-start;">
    <div style="flex:1;min-width:0;">
      ${name ? `<div><b>👤 ${escapeHtml(name)}</b>${phone ? ` · <a href="tel:${escapeAttr(phone)}" style="color:var(--accent);">${escapeHtml(phone)}</a>` : ''}</div>` : (phone ? `<div>📞 <a href="tel:${escapeAttr(phone)}" style="color:var(--accent);">${escapeHtml(phone)}</a></div>` : '')}
      ${o.note ? `<div class="muted" style="margin-top:3px;overflow-wrap:anywhere;">${escapeHtml(o.note)}</div>` : ''}
    </div>
    <button type="button" class="sbtn" style="width:auto;margin:0;" onclick="document.getElementById('tableCustWrap').innerHTML=tableCustomerInnerHtml('${tableId}', true)">✏️</button>
  </div>`;
}
/* Kayıtlı müşterilerden seçim: isim/telefon yazdıkça öneri listesi. */
let _tableCustTimer = null, _tableCustSeq = 0;
function tableCustSearch(q, prefix){
  prefix = prefix || 'tableCust';
  clearTimeout(_tableCustTimer);
  const box = document.getElementById(prefix + 'Suggest');
  if(!box) return;
  q = (q||'').trim();
  if(q.length < 2){ box.innerHTML = ''; return; }
  _tableCustTimer = setTimeout(async () => {
    const seq = ++_tableCustSeq;
    const { data } = await sb.rpc('search_customers_quick', { p_token: getSession().session_token, p_search: q });
    if(seq !== _tableCustSeq || !document.getElementById(prefix + 'Suggest')) return;
    APP.tableCustHits = data || [];
    box.innerHTML = APP.tableCustHits.length ? `<div style="margin-top:8px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--panel);">
      ${APP.tableCustHits.map((c,i) => `<div onclick="pickTableCustomer(${i}, '${prefix}')" style="padding:8px 12px;cursor:pointer;border-top:${i?'1px solid var(--border)':'0'};display:flex;justify-content:space-between;gap:8px;">
        <b>👤 ${escapeHtml(c.name||'')}</b><span class="muted">${escapeHtml(c.phone||'')}${c.email && prefix!=='tableCust' && prefix!=='pkgCust' ? ' · ' + escapeHtml(c.email) : ''}</span></div>`).join('')}
    </div>` : '';
  }, 250);
}
function pickTableCustomer(i, prefix){
  prefix = prefix || 'tableCust';
  const c = (APP.tableCustHits||[])[i]; if(!c) return;
  document.getElementById(prefix + 'Name').value = c.name || '';
  document.getElementById(prefix + 'Phone').value = c.phone || '';
  const emailEl = document.getElementById(prefix + 'Email');
  if(emailEl && c.email && !emailEl.value) emailEl.value = c.email;
  document.getElementById(prefix + 'Suggest').innerHTML = '';
  if(prefix !== 'tableCust') return;
  const t = document.getElementById('tableCustName').dataset.table;
  if(t) saveTableCustomer(t, true);
}
/* quiet: alanlardan çıkınca / sipariş gönderilirken sessizce kaydeder (düzenleme açık kalır).
   Değişiklik yoksa hiçbir şey yapmaz. */
async function saveTableCustomer(tableId, quiet){
  const nameEl = document.getElementById('tableCustName');
  if(!nameEl) return;
  const name = nameEl.value.trim();
  const phone = document.getElementById('tableCustPhone').value.trim();
  const o = liveOrderForTable(tableId);
  if(quiet && (o ? (o.customer_name||'') === name && (o.customer_phone||'') === phone : !name && !phone)) return;
  const session = getSession();
  if(quiet){
    const { error } = await sb.rpc('set_table_customer', { p_token: session.session_token, p_table_id: tableId, p_name: name || null, p_phone: phone || null });
    if(error){ showToast(error.message); return; }
    const { data } = await sb.rpc('get_live_orders', { p_token: session.session_token });
    if(data) APP.liveOrders = data;
    renderTableGrid();
    return;
  }
  const { error } = await withLoadingOverlay(sb.rpc('set_table_customer', { p_token: session.session_token, p_table_id: tableId, p_name: name || null, p_phone: phone || null }));
  if(error){ alert(error.message); return; }
  const { data } = await sb.rpc('get_live_orders', { p_token: session.session_token });
  if(data) APP.liveOrders = data;
  const wrap = document.getElementById('tableCustWrap');
  if(wrap) wrap.innerHTML = tableCustomerInnerHtml(tableId);
  renderTableGrid();
  showToast(name || phone ? 'Müşteri bilgisi kaydedildi ✓' : 'Müşteri bilgisi kaldırıldı');
}
/* ---- Masa penceresi: ürün ekle, sepete at, mutfağa gönder ---- */
function openTableModal(tableId){
  const tableName = tableNameForId(tableId);
  if(!APP.draftCart) APP.draftCart = {};
  if(!APP.draftCart[tableId]) APP.draftCart[tableId] = [];
  const bg = document.createElement('div');
  bg.id = 'tableModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:28px 16px 16px;overflow-y:auto;';
  bg.onclick = (e) => { if(e.target===bg) closeTableModal(); };
  bg.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:480px;width:100%;max-height:88vh;overflow:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;">${escapeHtml(tableName)}</h2>
        <span style="cursor:pointer;color:var(--muted);font-size:20px;" onclick="closeTableModal()">✕</span>
      </div>
      ${tableCustomerInfoHtml(tableId)}
      <div>
        <p style="font-weight:700;margin-bottom:8px;">Ürün Ekle</p>
        <div class="tabs" id="prodStationTabs"></div>
        <div id="prodPick" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;"></div>
      </div>
      <div id="sentItemsWrap" style="margin-top:14px;"></div>
      <div id="draftItemsWrap"></div>
      ${orderFlagsHtml(tableId)}
      ${(String(tableId).indexOf('pkg_')!==0 && String(tableId).indexOf('wl_')!==0 && liveOrderForTable(tableId)) ? `<button class="ghost-btn" style="width:100%;margin-top:12px;" onclick="openMoveTableModal('${tableId}')">🔀 Masayı Taşı / Birleştir</button>` : ''}
      <div class="modal-sticky-actions">
        <button class="ghost-btn" style="flex:1;margin-top:0;color:var(--red);border-color:var(--red);" onclick="cancelTableOrder('${tableId}')">🗑️ İptal Et</button>
        <button id="confirmBtn" style="flex:1;margin-top:0;" disabled onclick="confirmOrder('${tableId}')">✅ Onayla ve Gönder</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  bg.dataset.tableId = tableId;
  const stations = APP.config.stations;
  document.getElementById('prodStationTabs').innerHTML = stations.map((s,i) =>
    `<div class="tab ${i===0?'active':''}" data-st="${s.id}" onclick="pickStationTab('${s.id}')">${escapeHtml(s.name)}</div>`
  ).join('');
  renderProductPick(stations[0] ? stations[0].id : null, tableId);
  renderTableItems(tableId);
}
async function closeTableModal(){
  const bgEl = document.getElementById('tableModalBg');
  const tableId = bgEl ? bgEl.dataset.tableId : null;
  if(bgEl) bgEl.remove();
  if(tableId){
    await releaseDraftStock(tableId);
    // Pencere kapatılınca işaretli Sipariş Etiketleri de sıfırlanır - bir
    // sonraki açılışta (yeni sipariş için) baştan seçilmesi gerekir.
    delete APP.orderFlagSelections?.[tableId];
  }
  renderTableGrid();
}
/* Masa penceresi onaysız kapatılırsa, sepette kalan her şeyin stoğunu geri ekler. */
async function releaseDraftStock(tableId){
  const draft = APP.draftCart[tableId];
  if(!draft || draft.length===0) return;
  const session = getSession();
  const items = draft.slice();
  // Sepet ve stok göstergeleri anında (iyimser) güncellenir; sunucuya stok geri
  // ekleme istekleri paralel ve arka planda gider, işlemi bekletmez.
  APP.draftCart[tableId] = [];
  items.forEach(item => applyLocalStockDelta(item.product_id, -item.qty));
  Promise.all(items.map(item =>
    sb.rpc('adjust_stock', { p_token: session.session_token, p_product_id: item.product_id, p_delta: item.qty })
  )).then(results => {
    if(results.some(r => r.error)) console.error('Bazı stoklar geri eklenemedi, sunucu ile senkronize ediliyor.');
    scheduleConfigResync(tableId);
  }).catch(e => console.error(e));
}

/* ---- Açık hesap: ödenmeyen hesabı bir açık hesaba (kişi/firma) borç olarak aktarma ---- */
async function openOpenAccountTransfer(){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const order = APP.liveOrders.find(o => o.order_id===bg.dataset.orderId); if(!order) return;
  if(buildPayItemQtys().length===0){ alert('Aktarmak için en az bir ürün/adet seçin'); return; }
  if(payNotReadyItems(order).length){ alert('Mutfakta hazır olmayan ürün var. Önce tüm ürünler "Hazır" işaretlenmeli.'); return; }
  const { data, error } = await withLoadingOverlay(sb.rpc('list_open_accounts', { p_token: getSession().session_token }));
  if(error){ alert(error.message); return; }
  APP.openAccounts = data || [];
  const total = Math.round(payFinalTotal()*100)/100;
  const m = document.createElement('div');
  m.id = 'openAccModalBg'; m.className = 'modal-bg';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:140;padding:16px;';
  m.onclick = (e) => { if(e.target===m) m.remove(); };
  m.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:18px;max-width:440px;width:100%;max-height:90vh;overflow:auto;">
    <h2 style="margin:0 0 4px;">📒 Açık Hesaba At</h2>
    <p class="muted" style="margin:0 0 12px;font-size:13.5px;">Tutar: <b>${money(total)}</b> — seçilen hesaba borç olarak yazılır, masa kapanır.</p>
    <input id="oaSearch" placeholder="🔍 Açık hesap ara…" oninput="drawOpenAccountList(this.value)" style="margin:0 0 8px;">
    <div id="oaList" style="max-height:220px;overflow:auto;border:1px solid var(--border);border-radius:10px;"></div>
    <div class="add-row-panel" style="margin-top:12px;">
      <p>Yeni Açık Hesap</p>
      <input id="oaName" placeholder="Ad Soyad / Firma" style="margin-bottom:8px;">
      <input id="oaPhone" placeholder="Telefon (opsiyonel)" inputmode="tel" style="margin-bottom:8px;">
      <input id="oaNote" placeholder="Not (opsiyonel)" style="margin-bottom:8px;">
      <button type="button" onclick="createOpenAccountAndTransfer()">+ Oluştur ve Aktar</button>
    </div>
    <button type="button" class="ghost-btn" style="width:100%;margin-top:10px;" onclick="document.getElementById('openAccModalBg').remove()">Vazgeç</button>
  </div>`;
  document.body.appendChild(m);
  drawOpenAccountList('');
}
function drawOpenAccountList(q){
  const box = document.getElementById('oaList'); if(!box) return;
  q = String(q||'').trim().toLocaleLowerCase('tr');
  const rows = (APP.openAccounts||[]).filter(a => !q || a.name.toLocaleLowerCase('tr').includes(q) || String(a.phone||'').includes(q));
  box.innerHTML = rows.length ? rows.map(a => `<div onclick="transferToOpenAccount('${a.id}')" style="display:flex;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;">
      <span style="min-width:0;overflow-wrap:anywhere;"><b>${escapeHtml(a.name)}</b>${a.phone ? ' <span class="muted">' + escapeHtml(a.phone) + '</span>' : ''}</span>
      <span style="white-space:nowrap;color:${a.balance > 0 ? 'var(--red)' : 'var(--muted)'};">${money(a.balance)}</span></div>`).join('')
    : '<p class="muted" style="padding:10px;margin:0;">Açık hesap yok — aşağıdan yeni oluşturun.</p>';
}
async function createOpenAccountAndTransfer(){
  const name = document.getElementById('oaName').value.trim();
  if(!name){ alert('Açık hesap için ad girin'); return; }
  const { data, error } = await withLoadingOverlay(sb.rpc('create_open_account', { p_token: getSession().session_token, p_name: name,
    p_phone: document.getElementById('oaPhone').value.trim() || null, p_note: document.getElementById('oaNote').value.trim() || null }));
  if(error){ alert(error.message); return; }
  transferToOpenAccount(data, name);
}
async function transferToOpenAccount(accountId, nameHint){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const acc = (APP.openAccounts||[]).find(a => a.id===accountId);
  const total = Math.round(payFinalTotal()*100)/100;
  if(!confirm(money(total) + ' "' + ((acc && acc.name) || nameHint || 'açık hesap') + '" hesabına aktarılsın mı?')) return;
  const subtotal = parseFloat(bg.dataset.subtotal||0);
  const { data, error } = await withLoadingOverlay(sb.rpc('transfer_to_open_account', { p_token: getSession().session_token,
    p_order_id: bg.dataset.orderId, p_account_id: accountId, p_item_qtys: buildPayItemQtys(), p_discount_amount: Math.max(0, Math.round((subtotal - total)*100)/100) }));
  if(error){ alert(error.message); return; }
  const m = document.getElementById('openAccModalBg'); if(m) m.remove();
  bg.remove();
  showToast('📒 ' + money(data.amount) + ' "' + data.account + '" açık hesabına aktarıldı');
  const { data: lo } = await sb.rpc('get_live_orders', { p_token: getSession().session_token });
  if(lo) APP.liveOrders = lo;
  if(typeof renderPayGrid === 'function') renderPayGrid();
}
