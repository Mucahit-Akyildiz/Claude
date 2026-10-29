// Hesabı e-postayla gönderme, Google yorum yönlendirme, garson çağrıları, vardiya widget'ı (pos-payments.js'ten ayrıldı; klasik script, fonksiyonlar global).

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
      <input type="checkbox" id="invCorporate" class="u-wa-m0" ${actOn('change','toggleInvCorpFields',['$checked'])}> Fatura bilgisi ekle (şirket / şahıs)
    </label>
    <div id="invCorpFields" style="display:none;">
      <input id="invBuyerName" placeholder="Ad Soyad / Şirket Ünvanı" style="margin-bottom:8px;">
      <input id="invBuyerTax" placeholder="VKN / TCKN" inputmode="numeric" maxlength="11" style="margin-bottom:8px;">
      <input id="invBuyerOffice" placeholder="Vergi Dairesi" style="margin-bottom:8px;">
      <input id="invBuyerAddr" placeholder="Adres" style="margin-bottom:8px;">
    </div>
    <div class="u-tl error" id="invErr"></div>
    <div class="field-row" style="gap:8px;margin-top:6px;">
      <button type="button" style="flex:1;margin:0;background:var(--panel2);color:var(--text);" ${act('removeEl','invoiceEmailBg')}>İptal</button>
      <button type="button" id="invSendBtn" class="u-f1-m0" ${act('sendInvoiceEmail', historyId)}>📧 Gönder</button>
    </div>
    ${hasReview ? `<button type="button" class="ghost-btn" style="width:100%;margin-top:10px;" ${act('showGoogleReviewQrFromInvoice')}>⭐ Google yorum QR'ını göster</button>` : ''}
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
  if(!corp){
    const { error } = await sb.rpc('email_receipt', { p_token: session.session_token, p_history_id: historyId, p_email: email });
    if(error){ err.textContent = error.message; btn.disabled = false; btn.textContent = '📧 Gönder'; return; }
    document.getElementById('invoiceEmailBg').remove();
    showToast('📧 Fiş ' + email + ' adresine gönderildi');
    return;
  }
  const { data, error } = await sb.rpc('email_invoice', {
    p_token: session.session_token, p_history_id: historyId, p_email: email,
    p_buyer_name: v('invBuyerName'), p_buyer_tax_number: v('invBuyerTax'),
    p_buyer_tax_office: v('invBuyerOffice'), p_buyer_address: v('invBuyerAddr')
  });
  if(error){ err.textContent = error.message; btn.disabled = false; btn.textContent = 'Gönder'; return; }
  document.getElementById('invoiceEmailBg').remove();
  showToast('📧 Hesap e-postayla gönderildi ('+(data&&data.number)+')');
}
/* --- Google Yorumları'na yönlendirme: hesap tamamen kapandığında (bkz.
   yukarısı) personele gösterilen toast'a dokununca, müşterinin telefonuyla
   okutabileceği bir QR kod açılır (bkz. Ayarlar > Entegrasyonlar). --- */
/* Ödeme sonrası kısa süre görünen kart: müşteriden değerlendirme istemek için
   QR göster ya da (kayıtlı müşteri telefonu varsa) SMS ile link gönder. */
function showAfterPayCard(historyId, customerId){
  removeEl('afterPayCard');
  if(!historyId){ showToast('Ödeme alındı ✓'); return; }
  const el = document.createElement('div');
  el.id = 'afterPayCard'; el.className = 'ap-card';
  el.innerHTML = `<div class="ap-h"><span>✅</span><b>Ödeme alındı</b><button type="button" class="ap-x" ${act('removeEl','afterPayCard')}>✕</button></div>
    <div class="ap-acts"><button type="button" ${act('showReviewQr', historyId)}>⭐ Değerlendirme QR</button>${customerId ? `<button type="button" class="ghost-btn" ${act('sendReviewSms', historyId)}>📱 SMS ile iste</button>` : ''}</div>`;
  document.body.appendChild(el);
  clearTimeout(window._apT); window._apT = setTimeout(() => removeEl('afterPayCard'), 15000);
}
async function showReviewQr(historyId){
  removeEl('afterPayCard');
  const { data, error } = await sb.rpc('create_review_link', { p_token: getSession().session_token, p_history_id: historyId, p_send_sms: false });
  if(error){ alert(error.message); return; }
  const url = window.location.origin + '/degerlendirme/?t=' + data.token;
  const bg = document.createElement('div');
  bg.id = 'reviewQrBg'; bg.className = 'rq-bg';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div class="rq-box"><div class="rq-h"><h2>⭐ Bizi Değerlendirin</h2><button type="button" class="ap-x" ${act('removeEl','reviewQrBg')}>✕</button></div>
    <p class="muted">Müşteriye telefonuyla okutması için gösterin. Müşteri masadaki QR menüyü açtığında da 2 saat boyunca "Bizi değerlendirin" bandı çıkar. Puanı ne olursa olsun herkese Google'da paylaşma seçeneği sunulur; düşük puanlar size ayrıca bildirilir.</p>
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}" alt="QR">
    <button type="button" class="ghost-btn" ${act('copyText', url, 'Link kopyalandı ✓')}>🔗 Linki Kopyala</button></div>`;
  document.body.appendChild(bg);
}
async function sendReviewSms(historyId){
  removeEl('afterPayCard');
  const { error } = await sb.rpc('create_review_link', { p_token: getSession().session_token, p_history_id: historyId, p_send_sms: true });
  if(error){ alert(error.message); return; }
  showToast('📱 Değerlendirme linki SMS ile gönderildi ✓');
}
function showGoogleReviewQr(){
  const url = APP.config && APP.config.google_review_url;
  if(!url) return;
  const qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(url);
  const bg = document.createElement('div');
  bg.id = 'googleReviewQrBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:320px;width:100%;text-align:center;">
    <div style="display:flex;justify-content:space-between;"><h2 class="u-m0">⭐ Bizi Değerlendirin</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','googleReviewQrBg')}>✕</span></div>
    <p class="u-fs13 muted">Müşteriye telefonuyla okutması için gösterin</p>
    <img src="${qrImgUrl}" alt="QR" style="width:100%;max-width:260px;margin:6px 0 14px;border-radius:8px;background:#fff;padding:8px;">
  </div>`;
  document.body.appendChild(bg);
}

async function openOrderView(){
  APP.view='order';
  render();
}
async function renderOrderView(main, session){
  // Doğum günü rozeti için liste tazelenir; değiştiyse masa ızgarası yeniden çizilir.
  if(typeof ensureBirthdays === 'function'){ const before = APP.birthdaysAt; ensureBirthdays().then(() => { if(APP.birthdaysAt !== before && APP.view === 'order' && typeof renderTableGrid === 'function') renderTableGrid(); }); }
  main.innerHTML = `<h1>Sipariş Al</h1><div class="muted" id="orderStatus"></div><div class="order-summary" id="orderSummary"></div><div id="customerReqBanner"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div class="tabs" id="zoneTabs" style="margin:16px 0 0;"></div>
      <div style="display:flex;gap:8px;">
        <button type="button" style="width:auto;padding:7px 12px;margin:0;background:transparent;border:1px solid var(--border);color:var(--text);box-shadow:none;font-size:12.5px;" ${act('openTableScanModal')}>📷 Masa Tara</button>
        ${hasFeature('floorplan') ? `<button type="button" style="width:auto;padding:7px 12px;margin:0;background:transparent;border:1px solid var(--border);color:var(--text);box-shadow:none;font-size:12.5px;" ${act('toggleOrderTableViewMode')} id="tableViewModeBtn">${APP.orderTableViewMode==='floorplan'?'📋 Liste Görünümü':'🗺️ Kat Planı'}</button>` : ''}
      </div>
    </div>
    <div class="u-mt12 table-grid" id="tableGrid"></div>
    <div id="tableFloorPlan" class="floorplan-canvas" style="display:none;margin-top:12px;padding:14px;"></div>`;
  const [cfgRes, liveRes] = await withLoadingOverlay(Promise.all([
    sb.rpc('get_restaurant_config', { p_token: session.session_token }),
    sb.rpc('get_live_orders', { p_token: session.session_token })
  ]));
  const statusEl = document.getElementById('orderStatus');
  // Veri gelene kadar başka ekrana geçildiyse (eleman artık yok) çizimden vazgeç.
  if(!statusEl) return;
  if(cfgRes.error || liveRes.error){
    statusEl.textContent = 'Veri yüklenemedi: ' + ((cfgRes.error||liveRes.error).message);
    statusEl.style.color = 'var(--red)';
    return;
  }
  APP.config = cfgRes.data;
  APP.liveOrders = liveRes.data || [];
  if(!statusEl || !statusEl.isConnected) return; // yanıt gelmeden başka ekrana geçildi
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
  // Sekme arka plandayken (başka sekme/uygulama simge durumunda) sorgu atılmaz; geri gelince hemen yenilenir.
  APP.orderPollInterval = setInterval(() => {
    if(document.hidden) return;
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
    <h2 class="u-mb8">📱 Müşteri Sipariş İstekleri (${rows.length})</h2>
    ${rows.map(r => `
      <div style="padding:8px 0;border-top:1px dashed var(--border);">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <b style="overflow-wrap:anywhere;word-break:break-word;">${customerRequestLabel(r)}${r.customer_name?' · '+escapeHtml(r.customer_name):''}</b>
          <span class="u-fs12 muted">${new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span>
        </div>
        ${r.payment_status==='paid' ? `<div style="margin-top:4px;"><span class="pchip" style="background:color-mix(in srgb,var(--ok,#22c55e) 18%,transparent);color:var(--ok,#16a34a);font-weight:800;">💳 Online ödendi${r.paid_amount ? ' · ' + money(r.paid_amount) : ''}</span></div>` : ''}
        ${(r.customer_phone||r.delivery_address) ? `<div class="muted" style="font-size:12px;margin-top:2px;overflow-wrap:anywhere;word-break:break-word;">${r.customer_phone?'📞 '+escapeHtml(r.customer_phone):''}${r.customer_phone&&r.delivery_address?' · ':''}${r.delivery_address?'📍 '+escapeHtml(r.delivery_address):''}</div>` : ''}
        <div style="font-size:13px;margin-top:4px;">
          ${r.items.map(it => `${it.qty}x ${escapeHtml(it.name||'?')}${it.note?' <span class="muted">('+escapeHtml(it.note)+')</span>':''}`).join(', ')}
        </div>
        <div style="margin-top:8px;">
          <button class="sbtn" style="background:var(--green);color:var(--btn-ink);" ${act('approveCustomerRequest', r.id)}>✅ Onayla</button>
          <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" ${act('rejectCustomerRequest', r.id)}>✕ Reddet</button>
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
      <button type="button" class="sbtn" style="width:auto;margin:0;background:var(--green);color:var(--btn-ink);white-space:nowrap;" ${act('resolveWaiterCall', r.id)}>✓ Gittim</button>
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
    <h2 class="u-mb8">${kind==='payment' ? '💳 Hesap isteyen masalar' : '🙋 Garson çağıran masalar'} (${list.length})</h2>
    ${list.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px dashed var(--border);">
      <span><b>${escapeHtml(r.table_name||'Masa')}</b> <span class="u-fs12 muted">${new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span></span>
      <button type="button" class="sbtn" style="width:auto;margin:0;background:var(--green);color:var(--btn-ink);" ${act('resolveWaiterCall', r.id)}>✓ Gittim</button></div>`).join('')}
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
      + `<button class="sb-shift-btn out" ${act('doClockToggle')} title="Talebi Geri Çek">✕<span class="label"> Talebi Geri Çek</span></button>`;
  }
  if(st.clocked_in){
    const t = new Date(st.clock_in);
    const hh = String(t.getHours()).padStart(2,'0'), mm = String(t.getMinutes()).padStart(2,'0');
    return `<div class="shift-status on">🟢 <span class="label">Vardiyada (${hh}:${mm}'dan beri)</span></div>`
      + (st.can_end
        ? `<button class="sb-shift-btn out" ${act('doClockToggle')} title="Vardiyayı Bitir">⏹<span class="label"> Vardiyayı Bitir</span></button>`
        : st.end_requested
          ? `<div class="shift-status pending"><span class="label">🟡 Bitirme onayı bekleniyor</span></div><button class="sb-shift-btn" ${act('doClockToggle')} title="Bitirme Talebini Geri Çek">✕<span class="label"> Talebi Geri Çek</span></button>`
          : `<button class="sb-shift-btn out" ${act('doClockToggle')} title="Vardiyayı Bitirmeyi İste">⏹<span class="label"> Bitirmeyi İste</span></button>`);
  }
  const needsApproval = st.approval_required && !st.is_manager;
  return '<div class="shift-status">⚪ <span class="label">Vardiya Dışı</span></div>'
    + `<button class="sb-shift-btn in" ${act('doClockToggle')} title="${needsApproval?'Vardiya Başlatma İste':'Vardiyaya Başla'}">▶<span class="label"> ${needsApproval?'Vardiya Başlatma İste':'Vardiyaya Başla'}</span></button>`;
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
  if(APP.view==='home' && typeof homeFillShift==='function') homeFillShift();
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
  if(!await uiConfirm('Bu isteği reddetmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('reject_customer_order_request', { p_token: session.session_token, p_request_id: id });
  if(error){ alert(error.message); return; }
  refreshCustomerOrderRequests(session);
}
function renderZoneTabs(){
  const el = document.getElementById('zoneTabs'); if(!el) return;
  // Bölge sekmesi: gri "dolu/toplam" bilgisi + yalnızca ilgilenilmesi gereken masa varsa (sipariş bekleyen) kırmızı rozet.
  if(!APP.config || !APP.config.zones){ el.innerHTML = ''; return; }
  el.innerHTML = APP.config.zones.map(z => {
    const ts = z.tables || [], open = ts.filter(t => liveOrderForTable(t.id)).length;
    const need = ts.filter(t => { const o = liveOrderForTable(t.id); return o && !(o.items || []).length; }).length;
    return `<div class="tab ${z.id===APP.selectedZone && !APP.orderStateFilter?'active':''}" ${act('selectZone', z.id)}>${escapeHtml(z.name)}<span class="zone-occ" title="${open} dolu / ${ts.length} masa">${open}/${ts.length}</span>${need ? `<span class="zone-badge" title="${need} masada sipariş bekleniyor">${need}</span>` : ''}</div>`;
  }).join('');
}
function selectZone(id){ APP.selectedZone = id; APP.orderStateFilter = null; renderZoneTabs(); renderTableGrid(); }

/* ---- Uygulama içi mağaza değerlendirmesi (Android, Google Play In-App Review) ----
   Bu cihazda 10 ödeme alındıktan sonra bir kez, sonra en erken 60 günde bir istenir. Pencereyi Google gösterir
   (kotası doluysa hiç göstermeyebilir); kullanıcı mağazaya gitmeden puan verir. Web/masaüstünde çalışmaz. */
function maybeAskStoreReview(){
  try{
    const RV = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.InAppReview;
    if(!RV || !isNativeApp()) return;
    const n = Number(localStorage.getItem('pk_rv_pays') || 0) + 1; localStorage.setItem('pk_rv_pays', String(n));
    const last = Number(localStorage.getItem('pk_rv_asked') || 0);
    if(n < 10 || Date.now() - last < 60 * 864e5) return;
    localStorage.setItem('pk_rv_asked', String(Date.now()));
    setTimeout(() => { RV.requestReview().catch(() => {}); }, 1500);
  }catch(e){}
}
