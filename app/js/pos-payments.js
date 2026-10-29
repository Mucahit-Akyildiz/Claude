/* POS - Ödemeler + masa penceresi + sipariş etiketleri. Eski pos-core.js'ten bölündü; klasik <script src>, globaller
   paylaşılır ve dosyalar index.html'deki sırayla yüklenir (sıra önemli). */
/* ================= ÖDEMELER ================= */
async function openPaymentsView(){ APP.view='payments'; render(); }
/* ---- Zorunlu gün sonu kapanışı: önceki iş gününün kasa sayımı yapılmadıysa rapor yetkilisi
   (yönetici/kasa) Ödemeler'i açmadan önce sayımı kaydeder ya da "Kasa sayılamadı" gerekçesi yazar.
   Diğer personel engellenmez, yalnızca uyarı bandı görür. ---- */
async function dayCloseCheck(session, force){
  const dc = APP.dayClose;
  if(!force && dc && Date.now() - dc.at < 60000) return dc;
  try{ const { data, error } = await sb.rpc('get_day_close_status', { p_token: session.session_token }); if(!error && data) APP.dayClose = Object.assign({ at: Date.now() }, data); }catch(e){}
  return APP.dayClose || null;
}
function dayCloseBlocks(){ const d = APP.dayClose; return !!(d && d.pending && d.can_close); }
function dayCloseDateTxt(d){ try{ return new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { day:'numeric', month:'long', weekday:'long' }); }catch(e){ return d; } }
function openDayCloseSheet(){
  const d = APP.dayClose; if(!d) return;
  let host = document.getElementById('dayCloseHost');
  if(!host){ host = document.createElement('div'); host.id = 'dayCloseHost'; document.body.appendChild(host); }
  host.innerHTML = sheetHtml('dayCloseSheet', '🧾', 'Gün sonu kapanışı', `
    <p class="muted" style="text-align:left;margin:0 0 12px;"><b>${escapeHtml(dayCloseDateTxt(d.date))}</b> gününün kasa sayımı yapılmadı. Ödeme almadan önce kapatın.</p>
    <div class="dc-sum"><span>🧾 ${d.bills} hesap</span><span>💵 Beklenen nakit: <b>${money(d.expected_cash)}</b></span></div>
    <div id="dcCountBox">
      <label>Kasada sayılan nakit (₺)</label><input type="number" id="dcCounted" min="0" step="0.01" inputmode="decimal" placeholder="Örn. ${Math.round(Number(d.expected_cash)||0)}">
      <label>Not (isteğe bağlı)</label><input id="dcNote" maxlength="200" placeholder="Açılış nakdi, fark açıklaması…">
      <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('dayCloseToggleSkip', true)}>Kasa sayılamadı</button><button type="button" ${act('submitDayClose')}>✓ Kaydet ve kapat</button></div>
    </div>
    <div id="dcSkipBox" style="display:none;">
      <label>Kasa neden sayılamadı? (zorunlu)</label><textarea id="dcReason" rows="3" maxlength="300" placeholder="Örn. kasa sorumlusu erken çıktı"></textarea>
      <p class="muted" style="font-size:12px;text-align:left;margin:4px 0 0;">Bu kayıt Gün Sonu raporunda kırmızı uyarı olarak görünür.</p>
      <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('dayCloseToggleSkip', false)}>← Geri</button><button type="button" ${act('submitDayCloseSkip')}>Gerekçeyle kapat</button></div>
    </div>`, 'var(--c3)');
  openSheet('dayCloseSheet');
}
function dayCloseToggleSkip(on){ const a = document.getElementById('dcCountBox'), b = document.getElementById('dcSkipBox'); if(a) a.style.display = on ? 'none' : ''; if(b) b.style.display = on ? '' : 'none'; }
async function dayCloseDone(msg){
  closeSheet('dayCloseSheet'); APP.dayClose = null; showToast(msg);
  const s = getSession(); if(s) await dayCloseCheck(s, true);
  render();
}
async function submitDayClose(){
  const d = APP.dayClose, s = getSession(); if(!d || !s) return;
  const raw = (document.getElementById('dcCounted')||{}).value;
  if(raw === '' || raw == null){ alert('Lütfen kasada sayılan nakdi girin.'); return; }
  const { error } = await withLoadingOverlay(sb.rpc('save_cash_count', { p_token: s.session_token, p_date: d.date, p_expected: Number(d.expected_cash)||0, p_counted: Number(raw), p_note: (document.getElementById('dcNote')||{}).value || null }));
  if(error){ alert(error.message); return; }
  dayCloseDone('Gün sonu kapandı ✓');
}
async function submitDayCloseSkip(){
  const d = APP.dayClose, s = getSession(); if(!d || !s) return;
  const reason = ((document.getElementById('dcReason')||{}).value || '').trim();
  if(reason.length < 3){ alert('Lütfen kasanın neden sayılamadığını yazın.'); return; }
  const { error } = await withLoadingOverlay(sb.rpc('skip_cash_count', { p_token: s.session_token, p_date: d.date, p_reason: reason }));
  if(error){ alert(error.message); return; }
  dayCloseDone('Gün sonu gerekçeyle kapatıldı');
}
function dayCloseBannerHtml(){
  const d = APP.dayClose; if(!d || !d.pending) return '';
  return d.can_close
    ? `<button type="button" class="dc-banner" ${act('openDayCloseSheet')}>🧾 <span><b>${escapeHtml(dayCloseDateTxt(d.date))}</b> gün sonu kapanışı yapılmadı.</span><b class="dc-go">Şimdi kapat →</b></button>`
    : `<div class="dc-banner info">🧾 <span>Dünün gün sonu kapanışı yapılmadı. Yönetici/kasa sorumlusu kapatmalı.</span></div>`;
}
async function renderPaymentsView(main, session){
  // Gün sonu kapanmadıysa rapor yetkilisi önce kapatır.
  await dayCloseCheck(session);
  if(dayCloseBlocks()){
    main.innerHTML = `<h1>Ödemeler</h1><div class="dc-gate"><div style="font-size:46px;">🧾</div><b>Önce gün sonunu kapatın</b><p class="muted">${escapeHtml(dayCloseDateTxt(APP.dayClose.date))} gününün kasa sayımı yapılmadı. Kapattıktan sonra ödeme alabilirsiniz.</p><button type="button" ${act('openDayCloseSheet')}>🧾 Gün sonunu kapat</button></div>`;
    openDayCloseSheet();
    return;
  }
  const [cfgRes, liveRes] = await withLoadingOverlay(Promise.all([
    APP.config ? {data:APP.config} : sb.rpc('get_restaurant_config', { p_token: session.session_token }),
    sb.rpc('get_live_orders', { p_token: session.session_token })
  ]));
  if(!APP.config) APP.config = cfgRes.data;
  APP.liveOrders = liveRes.data || [];
  main.innerHTML = `<h1>Ödemeler <button class="sbtn" style="width:auto;display:inline-flex;vertical-align:middle;margin-left:10px;" ${act('openTableScanModal')}>📷 Masa Tara</button></h1>${dayCloseBannerHtml()}<div class="muted" id="payStatus"></div><div class="order-summary pay-summary" id="paySummary"></div><div class="pk-grid" id="payGrid"></div>`;
  renderPayGrid();
}
/* --- Hediye Kartları: yeni kart oluşturma (kod üretimi) ve mevcut
   kartları arama/görme, bkz. issue_gift_card / list_gift_cards. Ayarlar
   sekmesi olarak yaşar - kart OLUŞTURMA burada yapılır, ödeme alırken
   kart bakiyesiyle ÖDEME ise Ödemeler ekranındaki hesap penceresinden
   (bkz. openPayModal > lookupPayGiftCard/finishPaymentFull). */
async function renderGiftCardsSettings(el, session){
  el.innerHTML = `<div class="u-mwn box">
    <h2>🎁 Hediye Kartları</h2>
    <p class="muted" style="text-align:left;margin:-8px 0 16px;">Burada yeni hediye kartı oluşturup mevcut kartların bakiyesini görebilirsiniz. Bir kartı ödeme olarak kullanmak için Ödemeler ekranında hesabı açıp "Hediye Kartı" alanına kodu girin.</p>
    <div class="fsheet-bar" style="margin:0 0 4px;"><span></span>${sheetBtnHtml('gcSheet','+ Yeni Hediye Kartı')}</div>
    ${sheetHtml('gcSheet', '🎁', 'Yeni Hediye Kartı', `
      <div class="rvf-t">💰 Tutar</div>
      <div class="rvf-chips">${[100,200,250,500,1000].map(n => `<button type="button" class="rvf-chip" ${act('setGcAmount', n, '$this')}>${n} ₺</button>`).join('')}</div>
      <div class="fsheet-grid" style="margin-top:10px;">
        <div class="field-group"><label>Tutar (₺)</label><input id="gcNewAmount" type="number" min="0" step="0.01" placeholder="örn. 200"></div>
        <div class="field-group"><label>Not (opsiyonel)</label><input id="gcNewNote" placeholder="örn. doğum günü hediyesi"></div>
      </div>
      <div id="gcNewResult" style="margin-top:10px;"></div>
      <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','gcSheet')}>Kapat</button><button ${act('createGiftCard')}>🎁 Kart Oluştur</button></div>`, 'var(--c4)')}
    <div style="margin-top:18px;">
      <input id="gcSearchInput" placeholder="Kod, müşteri adı veya telefon ara..." ${actOn('input','debouncedGiftCardSearch',['$value'])}>
    </div>
    <div id="gcListWrap" style="margin-top:10px;"><p class="muted">Yükleniyor…</p></div>
  </div>`;
  await refreshGiftCardList(session);
}
function setGcAmount(n, btn){
  document.getElementById('gcNewAmount').value = n;
  btn.parentNode.querySelectorAll('.rvf-chip').forEach(b => b.classList.toggle('on', b === btn));
}
async function createGiftCard(){
  const session = getSession();
  const amount = parseFloat(document.getElementById('gcNewAmount').value);
  const note = document.getElementById('gcNewNote').value.trim();
  if(!amount || amount<=0){ alert('Geçerli bir tutar girin'); return; }
  const { data, error } = await sb.rpc('issue_gift_card', { p_token: session.session_token, p_amount: amount, p_customer_id: null, p_note: note||null });
  if(error){ alert(error.message); return; }
  document.getElementById('gcNewResult').innerHTML = `<div style="background:var(--panel2);border-radius:10px;padding:12px;text-align:center;">
    <div class="u-fs12 muted">Yeni Kart Kodu</div>
    <div style="font-size:22px;font-weight:800;letter-spacing:2px;margin:4px 0;">${escapeHtml(data.code)}</div>
    <div class="u-fs12 muted">Bakiye: ${money(data.balance)}</div>
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
          <td class="col-name" style="font-weight:700;letter-spacing:1px;">${escapeHtml(g.code)}${!g.is_active?' <span class="u-fw4 muted">(iptal)</span>':''}</td>
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
  // Açık hesaplar adisyon görünümünde kartlar: ürün özeti, hazır durumu, büyük tutar, Hesabı Al.
  const card = (o, name) => {
    const unpaid = o.items.filter(i => !i.paid);
    const total = unpaid.reduce((x, i) => x + i.price * i.qty, 0);
    const ready = unpaid.filter(i => i.status === 'ready').length, allReady = ready === unpaid.length;
    const mins = o.created_at ? Math.max(0, Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000)) : 0;
    const lines = unpaid.slice(0, 3).map(i => `<div class="pk-line"><span>${i.qty}× ${escapeHtml(i.name)}</span><span>${money(i.price * i.qty)}</span></div>`).join('');
    // İkram (Personel/Talebe gibi sipariş etiketi): hazır olunca 15 sn ekranda kalır, sonra ödemesiz kapanır.
    const cov = typeof allowanceCovers === 'function' ? allowanceCovers(o) : null;
    const comp = (o.tags || []).length > 0 && cov !== false;
    const alNote = cov === false ? `<div class="pk-comp pk-al-over">💳 ${escapeHtml(o.allowance_name || 'Limit')} · limit ${money(o.allowance_remaining || 0)} düşülecek, fark ${money(Math.max(0, total - Number(o.allowance_remaining || 0)))}</div>` : '';
    // Geri sayım sunucudaki hazır olma anından hesaplanır (ekran sonradan açılsa da kaldığı yerden); kapanışı sunucu da yapar.
    if(comp && allReady && unpaid.length){ APP.compAt = APP.compAt || {};
      const rt = Math.max(...unpaid.map(i => new Date(i.ready_at || i.added_at || Date.now()).getTime()).filter(x => !isNaN(x)));
      APP.compAt[o.order_id] = (isFinite(rt) ? rt : Date.now()) + 15000; }
    const compRibbon = alNote || (comp ? `<div class="pk-comp">${o.allowance_id ? '💳 ' + escapeHtml(o.allowance_name || '') + ' · limitten' : '🎁 İkram'} · ${escapeHtml(o.tags.join(', '))}${allReady && unpaid.length ? ` <span class="pk-comp-cd" data-comp-until="${APP.compAt[o.order_id]}">${Math.max(0, Math.ceil((APP.compAt[o.order_id] - Date.now()) / 1000))}</span> sn sonra ödemesiz kapanır` : ' · hazır olunca ödemesiz kapanır'}</div>` : '');
    return `<div class="pk ${allReady ? 'pk-ready' : 'pk-busy'} ${comp ? 'pk-is-comp' : ''}" data-badge-id="${o.order_id}" ${act('openPayModal', o.order_id)}>
      ${compRibbon}
      <div class="pk-head"><b>${name}</b><span class="pk-time">⏱ ${mins} dk</span></div>
      <div class="pk-status">${allReady ? '✅ Hepsi hazır' : '🔥 ' + ready + '/' + unpaid.length + ' hazır'}${waitersLine(o) ? ' · ' + waitersLine(o) : ''}</div>
      <div class="pk-lines">${lines}${unpaid.length > 3 ? `<div class="pk-more">+${unpaid.length - 3} ürün daha</div>` : ''}</div>
      <div class="pk-foot"><span class="pk-total">${comp ? '<s class="muted" style="font-size:.7em;">' + money(total) + '</s> 0,00 TL' : money(total)}</span><span class="pk-btn">${comp ? '🎁 İkram' : '💳 Hesabı Al'}</span></div>
    </div>`;
  };
  const orders = [];
  ((APP.config && APP.config.zones) || []).flatMap(z => z.tables || []).forEach(t => { const o = liveOrderForTable(t.id); if(o && o.items.some(i => !i.paid)) orders.push({ o, name: escapeHtml(tableNameForId(t.id)) }); });
  (APP.liveOrders || []).filter(o => o.kind === 'takeaway' && o.items.some(i => !i.paid)).forEach(o => orders.push({ o, name: '📦 ' + escapeHtml(o.customer_name || ('Paket #' + (o.daily_number || ''))) }));
  const due = (o) => { const t = o.items.filter(i => !i.paid).reduce((y, i) => y + i.price * i.qty, 0);
    if(o.allowance_id) return Math.max(0, t - Number(o.allowance_remaining || 0));
    return (o.tags || []).length ? 0 : t; };
  const sum = orders.reduce((x, r) => x + due(r.o), 0);
  const readyN = orders.filter(r => r.o.items.filter(i => !i.paid).every(i => i.status === 'ready')).length;
  const strip = document.getElementById('paySummary');
  if(strip) strip.innerHTML = `<div class="os-chip os-busy"><span class="os-ic">🧾</span><div><b>${orders.length}</b><small>Açık hesap</small></div></div><div class="os-chip os-ready"><span class="os-ic">✅</span><div><b>${readyN}</b><small>Hazır · ödeme bekliyor</small></div></div><div class="os-chip os-money"><span class="os-ic">💰</span><div><b>${money(sum)}</b><small>Tahsil edilecek toplam</small></div></div>`
    + (orders.length ? (() => { const p = Math.round(readyN / orders.length * 100);
      const old = orders.map(r => ({ n: r.name, m: r.o.created_at ? Math.floor((Date.now() - new Date(r.o.created_at).getTime()) / 60000) : 0 })).sort((a, b) => b.m - a.m).slice(0, 3);
      return `<div class="os-chip os-viz"><div class="gx-ring-c" style="--p:${p};--c:#22c55e;width:46px;max-width:46px;"><b style="margin:0;font-size:12px;">%${p}</b></div><div><b>${readyN}/${orders.length}</b><small>hazır oranı</small></div></div>
        <div class="os-chip os-viz os-old"><span class="os-ic">⏳</span><div class="os-old-l">${old.map(x => `<span class="${x.m >= 60 ? 'bad' : x.m >= 30 ? 'warn' : ''}"><b>${x.n}</b> ${x.m} dk</span>`).join('')}<small>en uzun açık kalan hesaplar</small></div></div>`; })() : '');
  orders.sort((x, y) => new Date(x.o.created_at || 0) - new Date(y.o.created_at || 0));
  grid.className = 'pk-grid';
  grid.innerHTML = orders.length ? orders.map(r => card(r.o, r.name)).join('') : '<div class="kb-none">🎉 Açık hesap yok</div>';
  startCompTicker();
}
/* İkram geri sayımı: süresi dolan ikram siparişi close_comp_order ile ödemesiz kapanır
   (Finansal Analiz'de ikram olarak; ciroya girmez). Aynı anda başka cihaz kapatırsa hata yok sayılır. */
let COMP_TICKER = null;
function startCompTicker(){
  if(COMP_TICKER) return;
  COMP_TICKER = setInterval(async () => {
    const els = document.querySelectorAll('[data-comp-until]');
    if(!els.length && APP.view !== 'payments'){ clearInterval(COMP_TICKER); COMP_TICKER = null; return; }
    for(const el of els){
      const left = Math.ceil((Number(el.dataset.compUntil) - Date.now()) / 1000);
      el.textContent = Math.max(0, left);
      const card = el.closest('[data-badge-id]'), oid = card && card.dataset.badgeId;
      if(left <= 0 && oid && !(APP.compClosing || {})[oid]){
        APP.compClosing = APP.compClosing || {}; APP.compClosing[oid] = true;
        if(document.getElementById('payModalBg')) { APP.compClosing[oid] = false; continue; } // ödeme penceresi açıkken bekle
        const { error } = await sb.rpc('close_comp_order', { p_token: getSession().session_token, p_order_id: oid });
        if(!error){ card.classList.add('pk-comp-done'); showToast('🎁 İkram kaydedildi, hesap kapandı'); }
        delete APP.compAt[oid];
        const { data: lo } = await sb.rpc('get_live_orders', { p_token: getSession().session_token });
        if(lo) APP.liveOrders = lo;
        setTimeout(() => { if(typeof renderPayGrid === 'function') renderPayGrid(); }, 400);
      }
    }
  }, 1000);
}
/* Ödenecek ürünler adet bazında seçilebilir (örn. 4 Izgara Köfte'den sadece
   1'i) - sadece seçilen adetlerin tutarı için ödeme alınır, geri kalanı
   hesapta açık kalır (kısmi/ürün-adet bazlı ödeme). itemId -> seçili adet. */
let PAY_SELECTED_QTYS = {};
/* tableName artık ikinci parametre olarak değil (serbest metin olduğundan
   satır içi olay koduna gömülmesi tırnak-kaçışı XSS'ine açıktı, bkz. güvenlik notu),
   order bulunduktan sonra buradan türetiliyor. */
function openPayModal(orderId){
  if(dayCloseBlocks()){ openDayCloseSheet(); return; }
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
        <span class="pm-name">${avatarHtml(it.name)}<span><b>${escapeHtml(it.name)}</b><small>${money(it.price)} / adet</small></span></span>
        <span class="pay-item-subtotal" data-item-id="${it.id}" style="font-weight:700;">${money(it.price*it.qty)}</span>
      </div>
      <div class="row-bottom">
        <button type="button" class="qty-btn" ${act('stepPayItemQty', it.id, -1)}>-</button>
        <span class="pay-item-qty" data-item-id="${it.id}" style="min-width:20px;text-align:center;font-weight:700;">${it.qty}</span>
        <button type="button" class="qty-btn" ${act('stepPayItemQty', it.id, 1)}>+</button>
        <span class="u-fs11 muted">/ ${it.qty} adet</span>
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
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;padding-top:max(16px,6vh) !important;overflow:auto;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div class="pay-modal pm2">
    <div class="pay-modal-header">
      <div class="pm-title"><span class="pm-tic">💳</span><div><h2>${escapeHtml(tableName)}</h2><small>${unpaidItems.length} kalem · ${unpaidItems.reduce((s, i) => s + i.qty, 0)} adet ödenecek</small></div></div>
      <span class="pay-modal-close" ${act('removeEl','payModalBg')}>✕</span>
    </div>
    <div class="pay-body">
    <div class="pay-col-left">
    ${unpaidItems.length>1 ? `<div class="pay-select-all-row"><button class="pay-select-all-btn" ${act('toggleAllPayItems')}>Tümünü Seç/Kaldır</button></div>` : ''}
    <div class="pay-items-card" id="payItemsWrap">${itemsHtml}</div>
    <div class="pay-subtotal-row" id="paySubtotalLine"><span>Ara Toplam</span><span>${money(subtotal)}</span></div>

    <div class="pay-opt-tabs">
      <button type="button" class="pay-opt-tab" data-opt="disc" ${act('togglePayOpt','disc')}>🏷️ İndirim</button>
      <button type="button" class="pay-opt-tab" data-opt="tip" ${act('togglePayOpt','tip')}>💸 Bahşiş</button>
      <button type="button" class="pay-opt-tab" data-opt="cust" ${act('togglePayOpt','cust')}>🧑 Müşteri</button>
      <button type="button" class="pay-opt-tab" data-opt="gift" ${act('togglePayOpt','gift')}>🎁 Hediye Kartı</button>
    </div>
    <div class="pay-options-grid">
      <div class="pay-option-card" data-opt="disc" hidden>
        <h4>🏷️ İndirim</h4>
        <div class="field-row">
          <input id="discValue" type="number" min="0" step="0.01" placeholder="0" class="u-f1">
          <select id="discType" style="width:66px;padding:0 4px;">
            <option value="percent">%</option>
            <option value="amount">₺</option>
          </select>
          <button style="width:auto;padding:0 14px;margin:0;" ${act('applyPayDiscount')}>Uygula</button>
        </div>
        <p id="discInfo" class="hint">İndirim yok</p>
        <div class="field-row cp-row">
          <input id="couponCode" placeholder="🎟️ Kupon kodu" autocapitalize="characters" autocomplete="off" style="flex:1;text-transform:uppercase;">
          <button type="button" class="ghost-btn" style="width:auto;padding:0 14px;margin:0;" ${act('applyCoupon')}>Kuponu Uygula</button>
        </div>
        <div id="promoChips" class="pay-chip-row"></div>
      </div>
      <div class="pay-option-card" data-opt="tip" hidden>
        <h4>💸 Bahşiş</h4>
        <div class="pay-chip-row">
          <button type="button" class="pay-chip" ${act('applyTipPercent', 5)}>%5</button>
          <button type="button" class="pay-chip" ${act('applyTipPercent', 10)}>%10</button>
          <button type="button" class="pay-chip" ${act('applyTipPercent', 15)}>%15</button>
          <input id="tipValue" type="number" min="0" step="0.01" placeholder="Tutar" style="flex:1;min-width:80px;margin:0;" ${actOn('input','applyTipAmount',['$value'])}>
        </div>
        <p id="tipInfo" class="hint">Bahşiş yok</p>
        <div style="border-top:1px dashed var(--border);margin-top:10px;padding-top:10px;">
          <label class="hint" style="display:block;margin-bottom:4px;">Alınan nakit — üstü bahşiş olur</label>
          <input id="cashReceivedInput" type="number" min="0" step="0.01" placeholder="örn. 5000" class="u-m0" ${actOn('input','handleCashReceivedInput',['$value'])}>
        </div>
      </div>
      <div class="pay-option-card" data-opt="cust" hidden>
        <h4>🧑 Müşteri</h4>
        <div class="field-row">
          <input id="payCustomerPhone" placeholder="Ad veya telefon ile ara" autocomplete="off" class="u-f1" ${actOn('input','tableCustSearch',['$value','payCust'])}>
          <button style="width:auto;padding:0 14px;margin:0;" ${act('lookupPayCustomer')}>Bul</button>
        </div>
        <div id="payCustSuggest"></div>
        <p id="payCustomerInfo" class="hint">Müşteri seçilmedi</p>
        <div id="payRedeemWrap" style="display:none;margin-top:8px;">
          <input id="payRedeemPoints" type="number" min="0" step="1" placeholder="Kullanılacak puan" class="u-m0" ${actOn('input','applyRedeemPoints',['$value'])}>
          <div id="payPointsBox" class="pts-box" hidden></div>
        </div>
      </div>
      <div class="pay-option-card" data-opt="gift" hidden>
        <h4>🎁 Hediye Kartı</h4>
        <div class="field-row">
          <input id="payGiftCardCode" placeholder="Kart kodu" style="flex:1;text-transform:uppercase;">
          <button style="width:auto;padding:0 14px;margin:0;" ${act('lookupPayGiftCard')}>Sorgula</button>
        </div>
        <p id="payGiftCardInfo" class="hint">Kart seçilmedi</p>
        <div id="payGiftCardPartialActions" style="display:none;margin-top:8px;">
          <p class="hint" style="margin:0 0 6px;">Bakiye yetersiz — kartın tamamı düşülür, kalanı seçin:</p>
          <div class="field-row" style="gap:8px;">
            <button style="width:auto;padding:0 12px;margin:0;flex:1;" ${act('finishGiftCardPartial', 'cash')}>💵 Kalanı Nakit</button>
            <button style="width:auto;padding:0 12px;margin:0;flex:1;" ${act('finishGiftCardPartial', 'card')}>💳 Kalanı Kart</button>
          </div>
        </div>
      </div>
    </div>

    </div>
    <div class="pay-col-right">
    <div class="pay-total-banner">
      <span class="label">Ödenecek</span>
      <span class="amt" id="payFinalTotal">${money(subtotal)}</span>
    </div>
    <div class="pay-method-grid">
      <button class="pay-method-btn cash" id="payCashBtn" ${act('finishPaymentFull', 'cash')}><kbd class="sc-k">F2</kbd><span class="pm-ic">💵</span><b>Nakit</b><small>Tam ödeme</small></button>
      <button class="pay-method-btn card" id="payCardBtn" ${act('finishPaymentFull', 'card')}><kbd class="sc-k">F3</kbd><span class="pm-ic">💳</span><b>Kredi Kartı</b><small>POS cihazı</small></button>
    </div>
    <div class="pay-method-grid secondary">
      <button class="pay-method-btn gift" id="payGiftCardPayBtn" disabled ${act('finishPaymentFull', 'gift_card')}>🎁 Hediye Kartı ile Öde</button>
      <button class="pay-method-btn split" id="paySplitBtn" ${act('openSplitPay')}><kbd class="sc-k">F4</kbd>➗ Bölünmüş Ödeme</button>
    </div>
    <button type="button" class="pay-method-btn split" id="payOpenAccBtn" style="width:100%;margin-top:10px;" ${act('openOpenAccountTransfer')}><kbd class="sc-k">F8</kbd>📒 Açık Hesaba At</button>
    <div class="pay-extra-row">
    <button type="button" class="ghost-btn" ${act('printPayReceipt')}>🧾 Kasa Fişi Yazdır (fiyatlı)</button>
    <label class="pay-email-toggle ${APP.payWantsEmail?'on':''}">
      <input type="checkbox" id="payEmailInvoice" ${APP.payWantsEmail?'checked':''} ${actOn('change','setPayWantsEmail',['$this'])}>
      <span class="pet-icon">📧</span>
      <span class="pet-text"><b>Hesabı e-postayla gönder</b><small>Ödemeden sonra müşterinin e-posta adresi sorulur</small></span>
      <span class="pet-switch"></span>
    </label>
    </div>
    </div>
    </div>
  </div>`;
  document.body.appendChild(bg);
  // Limitli hesap: kalan limit indirim olarak uygulanır, fark tahsil edilir (kullanım sunucuda kaydedilir).
  if(order.allowance_id && Number(order.allowance_remaining) > 0){
    bg.dataset.discountType = 'amount'; bg.dataset.discountValue = String(Number(order.allowance_remaining));
    bg.dataset.promoName = '💳 Limit · ' + (order.allowance_name || '');
    recomputePaySelection();
  }
  // Ödeme düğmesine arama bitmeden basılırsa müşteri kaybolmasın: ödeme bu aramayı bekler (bkz. finishPaymentFull).
  window._payCustP = autoSelectPayCustomer(order).catch(() => {});
  loadActivePromos();
  updatePayReadiness();
}
/* Masaya girilmiş müşteri kayıtlıysa ödeme ekranında otomatik seçilir
   (telefon varsa telefonla, yoksa isimle tek ve birebir eşleşmede; telefonsuz kayıtlar id ile). */
async function autoSelectPayCustomer(order){
  const input = document.getElementById('payCustomerPhone');
  if(!input) return;
  let phone = (order.customer_phone || '').trim();
  const name = (order.customer_name || '').trim();
  if(!phone && name.length >= 2){
    const { data } = await sb.rpc('search_customers_quick', { p_token: getSession().session_token, p_search: name });
    const exact = (data || []).filter(c => (c.name || '').trim().toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));
    if(exact.length === 1){
      if(exact[0].phone) phone = exact[0].phone;
      else { if(!document.getElementById('payModalBg') || input.value) return; input.value = exact[0].name; return lookupPayCustomer(exact[0]); }
    }
  }
  if(!phone || !document.getElementById('payModalBg') || input.value) return;
  input.value = phone;
  return lookupPayCustomer();
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
async function lookupPayCustomer(picked){
  const bg = document.getElementById('payModalBg');
  let phone = document.getElementById('payCustomerPhone').value.trim();
  // Telefonu olmayan kayıtlı müşteri listeden seçildiyse id ile getirilir.
  let byId = picked && picked.id ? picked.id : null;
  const infoEl = document.getElementById('payCustomerInfo');
  const redeemWrap = document.getElementById('payRedeemWrap');
  if(!phone && !byId){ infoEl.textContent = 'Ad veya telefon girin'; return; }
  // İsimle yazıldıysa: tek eşleşme varsa o müşteri seçilir, birden fazlaysa liste gösterilir.
  if(!byId && /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(phone)){
    const { data: hits } = await sb.rpc('search_customers_quick', { p_token: getSession().session_token, p_search: phone });
    const list = hits || [];
    if(list.length === 1){ byId = list[0].id; if(list[0].phone){ phone = list[0].phone; document.getElementById('payCustomerPhone').value = phone; } }
    else { tableCustSearch(phone, 'payCust'); infoEl.textContent = list.length ? 'Listeden müşteriyi seçin' : 'Kayıtlı müşteri bulunamadı'; return; }
  }
  const session = getSession();
  const { data, error } = byId
    ? await sb.rpc('get_customer_by_id', { p_token: session.session_token, p_id: byId })
    : await sb.rpc('get_customer_by_phone', { p_token: session.session_token, p_phone: phone });
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
  infoEl.textContent = data.name + (data.phone || phone ? ' · 📞 ' + (data.phone || phone) : '') + ' · ' + data.points_balance + ' puan' + (data.custom_loyalty ? ' · ⭐ özel sadakat' : '') +
    (data.is_birthday_today && birthdayPct>0 ? ' · 🎂 Bugün doğum günü! %'+birthdayPct+' indirim uygulanacak' : '');
  // Sadakat seviyesi: rozet + seviye indirimi (başka indirim yoksa otomatik uygulanır).
  const tier = data.tier;
  if(tier){ infoEl.textContent += ' · ' + (tier.icon||'⭐') + ' ' + tier.name + (Number(tier.mult) > 1 ? ' (x' + Number(tier.mult) + ' puan)' : ''); }
  if(tier && Number(tier.disc) > 0 && !(parseFloat(bg.dataset.discountValue||0) > 0)){
    bg.dataset.discountType = 'percent'; bg.dataset.discountValue = String(Number(tier.disc));
    clearPromo(bg); bg.dataset.promoName = (tier.icon||'⭐') + ' ' + tier.name + ' üye indirimi';
    showToast((tier.icon||'⭐') + ' ' + tier.name + ' üye: %' + Number(tier.disc) + ' indirim uygulandı');
  }
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
  updatePointsBox();
}
/* Puan girilince: puan değeri hesabı karşılıyorsa "⭐ Puanla Öde" (ödeme yöntemi: puan),
   karşılamıyorsa kalan tutarın nakit/kartla alınacağı gösterilir. Puan indirimden ayrı kaydedilir. */
function updatePointsBox(){
  const bg = document.getElementById('payModalBg'), box = document.getElementById('payPointsBox'); if(!bg || !box) return;
  const pts = parseFloat(bg.dataset.redeemPoints || 0);
  if(!(pts > 0)){ box.hidden = true; return; }
  const pv = bg.dataset.pointValue ? Number(bg.dataset.pointValue) : ((APP.config && APP.config.loyalty && APP.config.loyalty.point_value) || 1);
  const left = Math.round(payFinalTotal() * 100) / 100;
  box.hidden = false;
  box.innerHTML = `<div class="pts-line">⭐ ${pts} puan = <b>${money(pts * pv)}</b></div>` + (left <= 0.009
    ? `<button type="button" class="pts-pay" ${act('payWithPoints')}>⭐ Puanla Öde</button>`
    : `<div class="pts-left">Kalan <b>${money(left)}</b> nakit veya kartla alınır</div>`);
}
async function payWithPoints(){
  if(Math.round(payFinalTotal() * 100) / 100 > 0.009){ showToast('Puan hesabı karşılamıyor'); return; }
  await finishPaymentFull('points');
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
  if(!(await waitPayCustomer())) return;
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
// Ödeme ekranındaki seçili ürünlerle fiyatlı kasa fişi basar (toplam: indirim/bahşiş sonrası ekrandaki tutar).
function printPayReceipt(){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const order = (APP.liveOrders||[]).find(o => o.order_id === bg.dataset.orderId); if(!order) return;
  const items = order.items.filter(i => !i.paid && (PAY_SELECTED_QTYS[i.id]||0) > 0).map(i => Object.assign({}, i, { qty: PAY_SELECTED_QTYS[i.id], note: null }));
  if(!items.length){ showToast('Fişe basılacak ürün seçili değil'); return; }
  const totEl = document.getElementById('payFinalTotal');
  const total = totEl ? parseFloat(String(totEl.textContent).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',', '.')) : null;
  const name = order.kind === 'takeaway' ? ('Paket ' + (order.customer_name || '#' + (order.daily_number||''))) : tableNameForId(order.table_id);
  printCashReceipt(name, items, isNaN(total) ? null : total, order.daily_number);
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
  document.getElementById('paySubtotalLine').innerHTML = '<span>Ara Toplam</span><span>'+money(subtotal)+'</span>';
  // İndirim varsa yeni seçime göre yeniden hesaplanır (yüzdeyse orana göre, tutarsa ara toplamı geçmeyecek şekilde).
  const discType = bg.dataset.discountType;
  const discValue = parseFloat(bg.dataset.discountValue||0);
  let discAmount = 0;
  if(discType==='percent') discAmount = subtotal*discValue/100;
  else if(discType==='amount') discAmount = discValue;
  if(discAmount>subtotal) discAmount = subtotal;
  bg.dataset.discountAmount = String(discAmount);
  const discInfo = document.getElementById('discInfo');
  if(bg.dataset.promoId && subtotal < (Number(bg.dataset.promoMin)||0)){
    // Seçim azaltılınca kampanyanın alt limiti tutmuyorsa kampanya kaldırılır.
    showToast('Kampanya kaldırıldı: en az ' + money(Number(bg.dataset.promoMin)) + ' gerekli');
    bg.dataset.discountType = ''; bg.dataset.discountValue = '0'; clearPromo(bg); discAmount = 0; bg.dataset.discountAmount = '0';
  }
  if(discInfo) discInfo.textContent = discAmount>0 ? ((bg.dataset.promoName ? '🎟️ ' + bg.dataset.promoName + ' · ' : '') + 'İndirim: -'+money(discAmount)+(bg.dataset.discountType==='percent'?' (%'+discValue+')':'')) : 'İndirim yok';
  updatePayFinalTotalLine();
}
function applyPayDiscount(){
  const bg = document.getElementById('payModalBg');
  const type = document.getElementById('discType').value;
  let val = parseFloat(document.getElementById('discValue').value)||0;
  if(val<0) val=0;
  bg.dataset.discountType = type;
  bg.dataset.discountValue = String(val);
  clearPromo(bg);
  recomputePaySelection();
}
/* --- Kampanya / kupon: kupon kodu ya da şu an geçerli otomatik kampanya (happy hour vb.)
   indirim olarak uygulanır; ödeme tamamlanınca kullanım kaydedilir (redeem_promotion). --- */
function clearPromo(bg){ delete bg.dataset.promoId; delete bg.dataset.promoName; delete bg.dataset.promoMin; document.querySelectorAll('#promoChips .pay-chip').forEach(c => c.classList.remove('on')); }
function setPromo(p){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  bg.dataset.discountType = p.disc_type; bg.dataset.discountValue = String(p.disc_value);
  bg.dataset.promoId = p.id; bg.dataset.promoName = p.name; bg.dataset.promoMin = String(p.min_total || 0);
  document.querySelectorAll('#promoChips .pay-chip').forEach(c => c.classList.toggle('on', c.dataset.pid === p.id));
  recomputePaySelection();
  showToast('🎟️ ' + p.name + ' uygulandı');
}
async function applyCoupon(){
  const bg = document.getElementById('payModalBg'), code = document.getElementById('couponCode').value.trim();
  if(!code){ showToast('Kupon kodunu yazın'); return; }
  const { data, error } = await sb.rpc('check_coupon', { p_token: getSession().session_token, p_code: code, p_subtotal: parseFloat(bg.dataset.subtotal)||0 });
  if(error){ alert(error.message); return; }
  setPromo(data);
}
async function loadActivePromos(){
  const box = document.getElementById('promoChips'); if(!box) return;
  const { data } = await sb.rpc('list_active_promotions', { p_token: getSession().session_token });
  APP.activePromos = data || [];
  if(!document.getElementById('promoChips')) return;
  box.innerHTML = APP.activePromos.map(p => `<button type="button" class="pay-chip promo-chip" data-pid="${p.id}" title="${p.min_total > 0 ? 'En az ' + escapeAttr(money(p.min_total)) : ''}" ${act('applyActivePromo', p.id)}>🎉 ${escapeHtml(p.name)} · ${p.disc_type==='percent' ? '%' + p.disc_value : money(p.disc_value)}</button>`).join('');
  const tab = document.querySelector('.pay-opt-tab[data-opt="disc"]');
  if(tab && APP.activePromos.length) tab.classList.add('has-promo');
}
function applyActivePromo(id){
  const p = (APP.activePromos||[]).find(x => x.id === id); if(!p) return;
  const bg = document.getElementById('payModalBg');
  if((parseFloat(bg.dataset.subtotal)||0) < (Number(p.min_total)||0)){ alert('Bu kampanya için en az ' + money(p.min_total) + ' harcama gerekli'); return; }
  setPromo(p);
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
// Ödeme ekranında masadaki müşterinin otomatik aranması bitmeden ödeme kaydedilmesin (müşteri ve e-postası kaybolmasın).
async function waitPayCustomer(){ if(window._payCustP){ await Promise.race([window._payCustP, new Promise(r => setTimeout(r, 4000))]); window._payCustP = null; } return !!document.getElementById('payModalBg'); }
async function finishPaymentFull(method){
  const bg = document.getElementById('payModalBg');
  const orderId = bg.dataset.orderId;
  const itemQtys = buildPayItemQtys();
  if(itemQtys.length===0){ alert('Ödeme almak için en az bir ürün/adet seçin'); return; }
  if(!(await waitPayCustomer())) return;
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
async function openSplitPay(){
  const bg = document.getElementById('payModalBg');
  const orderId = bg.dataset.orderId;
  if(buildPayItemQtys().length===0){ alert('Ödeme almak için en az bir ürün/adet seçin'); return; }
  if(!(await waitPayCustomer())) return;
  const itemTotal = Math.round(payFinalTotal()*100)/100;
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const total = Math.round((itemTotal+tip)*100)/100;
  const discountAmount = parseFloat(bg.dataset.discountAmount||0);
  const customerId = bg.dataset.customerId || '';
  const redeemPoints = parseFloat(bg.dataset.redeemPoints||0);
  bg.remove();
  const sbg = document.createElement('div');
  sbg.id = 'splitPayBg';
  sbg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:max(16px,4vh) 16px 16px;overflow:auto;';
  sbg.onclick = (e) => { if(e.target===sbg) sbg.remove(); };
  sbg.innerHTML = `<div class="pay-modal pm2 sp2" style="max-width:720px;">
    <div class="pay-modal-header">
      <div class="pm-title"><span class="pm-tic">➗</span><div><h2>Bölünmüş Ödeme</h2><small>Hesabı kişilere, nakit ve karta dağıtın</small></div></div>
      <span class="pay-modal-close" ${act('removeEl','splitPayBg')}>✕</span>
    </div>
    <div class="pay-total-banner" style="margin-top:14px;">
      <span class="label">Ödenecek Tutar</span>
      <span class="amt">${money(total)}</span>
    </div>
    ${tip>0 ? `<p class="muted" style="text-align:center;font-size:12px;margin:-10px 0 14px;">(bahşiş dahil: ${money(tip)})</p>` : ''}

    <div class="pay-options-grid" style="margin-top:14px;">
      <div class="pay-option-card" data-opt="people">
        <h4>👥 Kişi Sayısına Göre Hesapla <span class="muted" style="font-weight:400;text-transform:none;">(opsiyonel)</span></h4>
        <div class="u-mbb10 field-row">
          <input id="splitPeople" type="number" min="1" placeholder="Toplam kişi">
          <input id="splitCashPeople" type="number" min="0" placeholder="Nakit ödeyen">
        </div>
        <button class="u-m0" ${act('calcSplitPay', total)}>Hesapla</button>
      </div>

      <div class="pay-option-card" data-opt="mix">
        <h4>💵 Nakit / 💳 Kart Dağılımı</h4>
        <label class="hint" style="display:block;margin-bottom:4px;">Nakit Tutar</label>
        <input id="splitCash" type="number" step="0.01" min="0" max="${total}" value="0" ${actOn('input','updateSplitPayPreview',[total])} style="margin-bottom:0;">
        <p id="splitCardPreview" class="hint" style="margin:8px 0 0;">Kredi Kartı: ${money(total)}</p>
      </div>

      <div class="pay-option-card" data-opt="cashn">
        <h4>👥 Nakiti Birden Fazla Kişiye Böl <span class="muted" style="font-weight:400;text-transform:none;">(opsiyonel)</span></h4>
        <div class="field-row">
          <input id="cashChargeCount" type="number" min="1" value="1" class="u-f1">
          <button style="width:auto;padding:0 16px;margin:0;" ${act('genCashCharges', total)}>Böl</button>
        </div>
        <div id="cashChargesBox" style="margin-top:8px;"></div>
      </div>

      <div class="pay-option-card" data-opt="cardn">
        <h4>💳 Kartı Birden Fazla Çekime Böl <span class="muted" style="font-weight:400;text-transform:none;">(opsiyonel)</span></h4>
        <div class="field-row">
          <input id="cardChargeCount" type="number" min="1" value="1" class="u-f1">
          <button style="width:auto;padding:0 16px;margin:0;" ${act('genCardCharges', total)}>Böl</button>
        </div>
        <div id="cardChargesBox" style="margin-top:8px;"></div>
      </div>
    </div>

    <button class="pay-method-btn cash sp-ok" ${act('confirmSplitPay', orderId, total, discountAmount, tip, customerId, redeemPoints)}>✅ Onayla</button>
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
    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;"><span class="muted" style="width:50px;font-size:12px;">Nakit ${i+1}:</span><input class="u-m0 cash-input" type="number" step="0.01" value="${c}" ${actOn('input','updateCashSum',[])}></div>`
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
    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;"><span class="muted" style="width:50px;font-size:12px;">Kart ${i+1}:</span><input class="u-m0 cc-input" type="number" step="0.01" value="${c}" ${actOn('input','updateCcSum',[])}></div>`
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
  // Bölme penceresi açıkken müşteri sonradan seçildiyse güncel müşteri kullanılır.
  const pbg = document.getElementById('payModalBg'); if(pbg && pbg.dataset.customerId) customerId = pbg.dataset.customerId;
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
  const bg = document.getElementById('payModalBg');
  if(bg && bg.dataset.promoId && (discountAmount||0) > 0){
    sb.rpc('redeem_promotion', { p_token: session.session_token, p_id: bg.dataset.promoId, p_history_id: (data && data.history_id) || null, p_amount: discountAmount });
  }
  if(bg) bg.remove();
  const { data: liveData } = await sb.rpc('get_live_orders', { p_token: session.session_token });
  APP.liveOrders = liveData || [];
  // Ödeme al(n)dığı an, arkadaki masa/paket kartlarının tutarı da hemen
  // güncellensin diye grid'i her durumda (kısmi/tam) yeniden çiziyoruz.
  if(APP.view==='payments') renderPayGrid();
  APP.lastPaidHistoryId = data && data.history_id;
  if(typeof maybeAskStoreReview === 'function') maybeAskStoreReview();
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
    else showAfterPayCard(hid, customerId);
    if(APP.view!=='payments') renderPaymentsView(document.getElementById('main'), session);
  }
}
