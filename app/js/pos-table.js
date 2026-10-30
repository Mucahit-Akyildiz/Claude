// Masa QR hızlı geçiş, sipariş etiketleri, masa penceresi, açık hesaba aktarma (pos-payments.js'ten ayrıldı; klasik script, fonksiyonlar global).

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
    s.src = '/assets/vendor/jsQR.js';
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
      <span class="u-xclose" ${act('closeTableScanModal')}>✕</span>
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
  ((APP.config && APP.config.zones) || []).forEach(z => {
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
  // Rezervasyonun ön siparişi: 'rs_<reservation_id>'.
  if(typeof tableId==='string' && tableId.indexOf('rs_')===0){
    const rsId = tableId.slice(3);
    return (APP.liveOrders||[]).find(o => o.kind==='waitlist' && o.reservation_id===rsId);
  }
  return (APP.liveOrders||[]).find(o => o.table_id===tableId);
}
// Siparişle ilgilenen garsonlar (ürünü ekleyenler; eski kayıtlarda siparişi açan).
function orderWaiters(order){
  if(!order) return [];
  const names = [];
  (order.items || []).forEach(i => { if(i.added_by_name && !names.includes(i.added_by_name)) names.push(i.added_by_name); });
  if(!names.length && order.created_by_name) names.push(order.created_by_name);
  return names;
}
function waitersLine(order){ const w = orderWaiters(order); return w.length ? '👤 ' + escapeHtml(w.join(', ')) : ''; }
function tableStatus(t){
  const order = liveOrderForTable(t.id);
  const draft = (APP.draftCart && APP.draftCart[t.id]) || [];
  let sub = 'Boş';
  let occupied = false;
  if(order && order.items.length>0){
    occupied = true;
    const allReady = order.items.every(i => i.status==='ready');
    sub = order.items.length + ' ürün - ' + (allReady?'Hazır':'hazırlanıyor');
    const w = waitersLine(order); if(w) sub += '<br>' + w;
  }
  if(draft.length>0){ sub += (occupied?' + ':'') + draft.length+' üründe sepette'; occupied = true; }
  const pendingOut = typeof outboxCountFor === 'function' ? outboxCountFor(t.id) : 0;
  if(pendingOut){ sub += (occupied?'<br>':'') + '<b style="color:var(--amber, #f59e0b);">⏳ ' + pendingOut + ' ürün gönderilmeyi bekliyor</b>'; occupied = true; }
  // Rezervasyondan oturtulan masa (henüz ürün yok): müşteri adıyla dolu görünür.
  if(order && order.customer_name){
    if(!occupied){
      occupied = true; sub = '👤 ' + escapeHtml(order.customer_name);
      // Oturtulmuş ama sipariş girilmemiş: 2 dk sonra uyarı (garsonlara bildirim de gider, bkz. _cron_idle_tables).
      const mins = order.created_at ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000) : 0;
      if(!order.items.length && mins >= 2) sub += '<br><b style="color:var(--amber, #f59e0b);">⏳ Sipariş bekleniyor · ' + mins + ' dk</b>';
    }
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
  if(!APP.config || !APP.config.zones) return;
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
  // Üstteki göstergeye tıklandıysa: tüm bölgelerden o durumdaki masalar (Tümü = hepsi), bölge başlıklarıyla.
  const f = APP.orderStateFilter;
  if(f){
    const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'tr', { numeric:true, sensitivity:'base' });
    const groups = (APP.config.zones || []).map(z => ({ z, list: (z.tables || []).filter(t => f==='all' || tableCardInfo(t).state===f).sort(byName) })).filter(g => g.list.length);
    el.innerHTML = groups.length ? groups.map(g => `<div class="tc-zone-h"><b>${escapeHtml(g.z.name)}</b><span>${g.list.length} masa</span></div>${g.list.map(t => tableCardHtml(t)).join('')}`).join('')
      : '<div class="tc-zone-h" style="justify-content:center;"><span>Bu durumda masa yok.</span></div>';
    renderOrderSummary();
    return;
  }
  if(!zone || zone.tables.length===0){ el.innerHTML = '<p class="muted">Bu bölgede masa yok.</p>'; return; }
  // Masalar isme göre doğal sırada (Masa2 < Masa10) listelenir.
  const sorted = zone.tables.slice().sort((a,b) => String(a.name).localeCompare(String(b.name), 'tr', { numeric:true, sensitivity:'base' }));
  el.innerHTML = sorted.map(t => tableCardHtml(t)).join('');
  renderOrderSummary();
}
/* Sipariş Al · masa kartı: durum rengi (boş / sipariş var / hazır / bekliyor), süre, tutar,
   hazırlık ilerleme çubuğu ve garson baş harfleri. */
function tableCardInfo(t){
  const order = liveOrderForTable(t.id);
  const draft = (APP.draftCart && APP.draftCart[t.id]) || [];
  const items = (order && order.items) || [];
  const unpaid = items.filter(i => !i.paid);
  const ready = unpaid.filter(i => i.status==='ready').length;
  const total = unpaid.reduce((x, i) => x + (Number(i.price)||0) * (Number(i.qty)||0), 0);
  const mins = order && order.created_at ? Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)) : 0;
  const outbox = typeof outboxCountFor === 'function' ? outboxCountFor(t.id) : 0;
  let state = 'empty';
  if(order || draft.length || outbox){
    state = 'busy';
    if(unpaid.length && ready === unpaid.length) state = 'ready';
    if(order && !items.length) state = 'wait';
    if(outbox) state = 'wait';
  }
  return { order, draft, unpaid, ready, total, mins, outbox, state };
}
function tableCardHtml(t){
  const c = tableCardInfo(t);
  const waiters = c.order ? orderWaiters(c.order) : [];
  const initials = waiters.slice(0, 2).map(w => `<span class="tc-av" title="${escapeAttr(w)}">${escapeHtml(String(w).trim().split(/\s+/).map(x => x[0]).join('').slice(0,2).toUpperCase())}</span>`).join('');
  const pct = c.unpaid.length ? Math.round(c.ready / c.unpaid.length * 100) : 0;
  const label = { empty:'Boş', busy:'Hazırlanıyor', ready:'Hazır · ödeme', wait: c.outbox ? 'Gönderilmeyi bekliyor' : 'Sipariş bekleniyor' }[c.state];
  const timeTxt = c.mins >= 60 ? Math.floor(c.mins/60) + 's ' + (c.mins%60) + 'dk' : c.mins + ' dk';
  return `<div class="tc tc-${c.state}" ${c.order && !c.order.items?.length ? `data-badge-id="${c.order.order_id}"` : ""} ${act('openTableModal', t.id)}>
    <div class="tc-top"><span class="tc-name">${escapeHtml(t.name)}</span>${c.order ? `<span class="tc-time">⏱ ${timeTxt}</span>` : ''}</div>
    ${c.state === 'empty' ? `<div class="tc-cta">＋ Sipariş al</div>` : `
      ${c.order && c.order.guest_count ? `<div class="tc-cust">👥 ${c.order.guest_count} kişi</div>` : (c.order && (c.order.items || []).length && !String(c.order.table_id || '').startsWith('pkg') && c.order.kind !== 'takeaway' && c.order.kind !== 'waitlist' && guestReminderOn() ? `<div class="tc-cust tc-noguest" title="Masayı açıp Kişi sayısı −/+ ile girin">👥 Kişi sayısı girilmedi</div>` : '')}
      ${c.order && c.order.customer_name ? (typeof birthdayFor === 'function' && birthdayFor(c.order.customer_name, c.order.customer_phone) ? `<div class="tc-cust tc-bday">🎂 ${escapeHtml(c.order.customer_name)} <b>Doğum günü!</b></div>` : `<div class="tc-cust">👤 ${escapeHtml(c.order.customer_name)}</div>`) : ''}
      <div class="tc-total">${c.total ? c.unpaid.length + ' kalem' : (c.draft.length ? c.draft.length + ' ürün sepette' : '—')}</div>
      ${c.unpaid.length ? `<div class="tc-prog"><i style="width:${pct}%"></i></div><div class="tc-meta"><span>${c.ready}/${c.unpaid.length} hazır</span>${initials}</div>` : `<div class="tc-meta"><span>${label}</span>${initials}</div>`}`}
    <span class="tc-state">${label}</span>
  </div>`;
}
function setOrderStateFilter(k){ APP.orderStateFilter = APP.orderStateFilter===k ? null : k; if(APP.orderStateFilter) APP.orderTableViewMode = 'grid'; renderTableGrid(); }
/* Sipariş Al üst özet şeridi: tüm bölgelerdeki masaların anlık durumu (tıklanınca filtreler). */
function renderOrderSummary(){
  const el = document.getElementById('orderSummary'); if(!el) return;
  const all = (APP.config.zones || []).flatMap(z => z.tables || []);
  const infos = all.map(tableCardInfo);
  const cnt = (s) => infos.filter(i => i.state === s).length;
  const f = APP.orderStateFilter;
  const chip = (cls, ic, n, l) => `<div class="os-chip os-click os-${cls} ${f===cls?'on':''}" role="button" title="${f===cls ? 'Filtreyi kaldır' : 'Bu masaları göster'}" ${act('setOrderStateFilter', cls)}><span class="os-ic">${ic}</span><div><b>${n}</b><small>${l}</small></div></div>`;
  el.style.setProperty('--n', 5);
  el.innerHTML = chip('all','🍽️', all.length, 'Tüm masalar') + chip('empty','🪑', cnt('empty'), 'Boş masa') + chip('wait','🕒', cnt('wait'), 'Sipariş bekleniyor') + chip('busy','🔥', cnt('busy'), 'Hazırlanıyor') + chip('ready','✅', cnt('ready'), 'Hazır · ödeme bekliyor');
}
function renderTableFloorPlan(zone, el){
  if(!el) return;
  if(!zone || zone.tables.length===0){ el.innerHTML = '<p class="muted" style="padding:10px;">Bu bölgede masa yok.</p>'; return; }
  const { scale } = fpLayout(el, zone.tables);
  el.innerHTML = zone.tables.map(t => {
    const { sub, occupied } = tableStatus(t);
    return `<div class="floorplan-table ${occupied?'occupied':''}" style="left:${Number(t.pos_x||0)*scale}px;top:${Number(t.pos_y||0)*scale}px;" ${act('openTableModal', t.id)}>
      ${escapeHtml(t.name)}<div class="fp-sub">${sub}</div></div>`;
  }).join('');
}

/* ---- Sipariş Etiketleri (Personel Yemeği, İkram vb.) - masa/paket penceresinde checkbox'lar ---- */
/* Masaya oturan kişi sayısı: sipariş varsa hemen kaydedilir, yoksa ilk gönderimde. */
function guestPickHtml(tableId){
  if(/^(pkg|wl|rs)_/.test(String(tableId))) return '';
  if(!APP.guestSel) APP.guestSel = {};
  const o = liveOrderForTable(tableId);
  if(APP.guestSel[tableId] == null && o && o.guest_count) APP.guestSel[tableId] = o.guest_count;
  const n = APP.guestSel[tableId] || 0;
  return `<div class="gp-box" data-gp="1"><span>👥 Kişi sayısı</span>
    <div class="gp-step"><button type="button" ${act('stepGuests', tableId, -1)} ${n ? '' : 'disabled'}>−</button><b>${n || '—'}</b><button type="button" ${act('stepGuests', tableId, 1)}>+</button></div></div>`;
}
function guestReminderOn(){ return !APP.config || APP.config.guest_reminder !== false; }
// Yalnızca yönetici: Bildirimler ekranındaki işletme geneli ayar.
function guestReminderSettingHtml(){
  const on = guestReminderOn();
  return `<div class="box" style="max-width:none;" id="guestRemBox"><h2>👥 Kişi Sayısı Hatırlatması</h2>
    <p class="u-tl muted">Masaya sipariş girilip kişi sayısı girilmediğinde siparişi alana, ödeme yetkisi olanlara ve yöneticiye bildirim, rozet ve masada uyarı gösterilir. Tüm işletme için geçerlidir; yalnızca yönetici değiştirebilir.</p>
    <label class="switch-row" style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:700;"><input type="checkbox" ${on ? 'checked' : ''} style="width:auto;margin:0;" ${actOn('change', 'toggleGuestReminder')}> ${on ? 'Açık' : 'Kapalı'}</label></div>`;
}
async function toggleGuestReminder(){
  const on = !guestReminderOn();
  const { error } = await sb.rpc('set_guest_reminder', { p_token: getSession().session_token, p_on: on });
  if(error){ showToast(error.message); return; }
  if(APP.config) APP.config.guest_reminder = on;
  const box = document.getElementById('guestRemBox'); if(box) box.outerHTML = guestReminderSettingHtml();
  showToast(on ? 'Kişi sayısı hatırlatması açıldı' : 'Kişi sayısı hatırlatması kapatıldı');
}
let GUEST_SAVE_T = null;
function stepGuests(tableId, d){
  if(!APP.guestSel) APP.guestSel = {};
  const n = Math.max(0, Math.min(99, (APP.guestSel[tableId] || 0) + Number(d)));
  APP.guestSel[tableId] = n;
  // Kişi sayısı hem sepette (masaüstü) hem mobilde Onayla düğmesinin üstünde; ikisi de güncellenir.
  document.querySelectorAll('.gp-box[data-gp]').forEach(el => { el.outerHTML = guestPickHtml(tableId); });
  const o = liveOrderForTable(tableId);
  if(o){ clearTimeout(GUEST_SAVE_T); GUEST_SAVE_T = setTimeout(() => saveOrderGuests(o.order_id, n), 600); }
}
async function saveOrderGuests(orderId, n){
  const { error } = await sb.rpc('set_order_guests', { p_token: getSession().session_token, p_order_id: orderId, p_count: n || null });
  if(error){ showToast('Kişi sayısı kaydedilemedi: ' + error.message); return; }
  const o = (APP.liveOrders || []).find(x => x.order_id === orderId); if(o) o.guest_count = n || null;
  if(typeof renderTableGrid === 'function') renderTableGrid();
}
function orderFlagsHtml(pseudoId){
  const flags = APP.config.order_flags || [];
  if(flags.length===0) return '';
  if(!APP.orderFlagSelections) APP.orderFlagSelections = {};
  if(!APP.orderFlagSelections[pseudoId]){
    const existing = liveOrderForTable(pseudoId);
    APP.orderFlagSelections[pseudoId] = (existing && existing.tags) ? existing.tags.slice() : [];
  }
  const sel = APP.orderFlagSelections[pseudoId];
  // Limitli kişi seçiliyse etiket o kişinin limitinden gelir ve değiştirilemez (kişi kaldırılınca açılır).
  const lockAl = typeof orderAllowanceFor === 'function' ? orderAllowanceFor(pseudoId) : null, lock = lockAl && lockAl.flag_label ? lockAl.flag_label : '';
  // Etiketler dokunmalı çipler: seçili etiket mor yanar; ikram etiketi hesabı ödemesiz kapatır.
  return `<div class="of-box ${lock ? 'of-locked' : ''}" data-of-pid="${escapeAttr(String(pseudoId))}">
    <div class="of-head"><span>🏷️ Sipariş Etiketleri</span><small>${lock ? '🔒 ' + escapeHtml(lockAl.name || 'Limitli kişi') + ' seçili: etiket değiştirilemez' : 'İkram: ödemesiz kapanır'}</small></div>
    <div class="of-chips">
      ${flags.map(f => `<label class="of-chip">
        <input type="checkbox" data-label="${escapeAttr(f.label)}" ${sel.includes(f.label)?'checked':''} ${lock ? 'disabled' : ''} ${actOn('change','toggleOrderFlag',[pseudoId, f.label, '$checked'])}>
        <span>${/personel/i.test(f.label) ? '👔' : /talebe|öğrenci|ogrenci/i.test(f.label) ? '🎓' : '🎁'} ${escapeHtml(f.label)}</span>
      </label>`).join('')}
    </div>
  </div>`;
}
function refreshOrderFlagsBox(pseudoId){
  document.querySelectorAll('.of-box[data-of-pid]').forEach(b => { if(b.dataset.ofPid === String(pseudoId)) b.outerHTML = orderFlagsHtml(pseudoId); });
}
function toggleOrderFlag(pseudoId, label, checked){
  if(!APP.orderFlagSelections) APP.orderFlagSelections = {};
  if(!APP.orderFlagSelections[pseudoId]) APP.orderFlagSelections[pseudoId] = [];
  const sel = APP.orderFlagSelections[pseudoId];
  // Tek etiket: yenisi seçilince diğerleri kaldırılır.
  if(checked){
    sel.splice(0, sel.length, label);
    document.querySelectorAll('.of-chip input[type=checkbox]').forEach(cb => { if(cb.dataset.label !== label) cb.checked = false; });
  } else { const idx = sel.indexOf(label); if(idx!==-1) sel.splice(idx,1); }
}

/* Masadaki müşteri bilgisi: rezervasyondan gelir ya da elle girilir
   (bkz. set_table_customer - masa boşsa isimle açılır). */
function tableCustomerInfoHtml(tableId){
  if(/^(pkg|wl|rs)_/.test(String(tableId))) return '';
  return `<div id="tableCustWrap">${tableCustomerInnerHtml(tableId)}</div>`;
}
function tableCustomerInnerHtml(tableId, editing){
  const o = liveOrderForTable(tableId);
  const name = (o && o.customer_name) || '', phone = (o && o.customer_phone) || '';
  if(editing){
    return `<div style="background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:12px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <input id="tableCustName" data-table="${tableId}" placeholder="Ad: müşteri, limitli kişi veya kullanıcı ara" autocomplete="off" value="${escapeAttr(name)}" class="u-m0" ${actOn('input','tableCustSearch',['$value'])} ${actOn('change','saveTableCustomer',[tableId, true])}>
        <input id="tableCustPhone" placeholder="Telefon (opsiyonel)" inputmode="tel" autocomplete="off" value="${escapeAttr(phone)}" class="u-m0" ${actOn('input','tableCustSearch',['$value'])} ${actOn('change','saveTableCustomer',[tableId, true])}>
      </div>
      <div id="tableCustSuggest"></div>
      <p class="muted" style="font-size:11.5px;margin:6px 2px 0;">Otomatik kaydedilir.</p>
    </div>`;
  }
  if(!o || !(name || phone || o.note)){
    // Buton yok: doğrudan arama. Ad ya da telefon yazılır; müşteri, limitli kişi ve kullanıcı birlikte önerilir.
    return `<div class="om-csearch"><span class="om-cs-ic">🔍</span>
      <input id="tableCustName" data-table="${tableId}" placeholder="Müşteri, limitli kişi veya kullanıcı ara — ad / telefon" autocomplete="off" ${actOn('input','tableCustSearch',['$value'])} ${actOn('change','saveTableCustomer',[tableId, true])}>
      <input id="tableCustPhone" type="hidden" value=""></div>
      <div id="tableCustSuggest" class="om-cs-sug"></div>`;
  }
  return (typeof birthdayBadgeHtml === 'function' ? birthdayBadgeHtml(name, phone) : '') + `<div style="background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:13.5px;display:flex;gap:10px;align-items:flex-start;">
    <div style="flex:1;min-width:0;">
      ${name ? `<div><b>👤 ${escapeHtml(name)}</b>${phone ? ` · ${phoneHtml(phone)}` : ''}</div>` : (phone ? `<div>${phoneHtml(phone)}</div>` : '')}
      ${o.note ? `<div class="muted" style="margin-top:3px;overflow-wrap:anywhere;">${escapeHtml(o.note)}</div>` : ''}
    </div>
    <button type="button" class="u-wa-m0 sbtn" ${act('editTableCustomer', tableId, false)}>✏️</button>
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
  // Sipariş penceresinde tek arama: limitli kişi/kullanıcılar da (yerel listeden) aynı öneride çıkar.
  const withAl = (prefix === 'tableCust' || prefix === 'pkgCust') && typeof allowanceSearchHits === 'function';
  _tableCustTimer = setTimeout(async () => {
    const seq = ++_tableCustSeq;
    const { data } = await sb.rpc('search_customers_quick', { p_token: getSession().session_token, p_search: q });
    if(seq !== _tableCustSeq || !document.getElementById(prefix + 'Suggest')) return;
    APP.tableCustHits = data || [];
    const alHits = withAl ? allowanceSearchHits(q) : [];
    box.innerHTML = APP.tableCustHits.length || alHits.length ? `<div style="margin-top:8px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--panel);">
      ${alHits.map((a, i) => `<div class="al-hit2" ${act('pickAllowanceFromCust', a.id, prefix)} style="border-top:${i?'1px solid var(--border)':'0'};">
        <b>${a.kind === 'user' ? '👔' : '🎓'} ${escapeHtml(a.name || '')}</b><span class="muted">💳 ${money(a.remaining)} limit${a.phone ? ' · ' + escapeHtml(maskPhoneAl(a.phone)) : ''}</span></div>`).join('')}
      ${APP.tableCustHits.map((c,i) => `<div ${act('pickTableCustomer', i, prefix)} style="padding:8px 12px;cursor:pointer;border-top:${i||alHits.length?'1px solid var(--border)':'0'};display:flex;justify-content:space-between;gap:8px;">
        <b>👤 ${escapeHtml(c.name||'')}</b><span class="muted">${escapeHtml(c.phone||'')}${c.email && prefix!=='tableCust' && prefix!=='pkgCust' ? ' · ' + escapeHtml(c.email) : ''}</span></div>`).join('')}
    </div>` : '';
  }, 250);
}
function pickTableCustomer(i, prefix){
  prefix = prefix || 'tableCust';
  const c = (APP.tableCustHits||[])[i]; if(!c) return;
  // Ödeme ekranı: seçilen müşterinin telefonuyla sadakat bilgisi getirilir.
  if(prefix === 'payCust'){
    document.getElementById('payCustomerPhone').value = c.phone || c.name || '';
    document.getElementById('payCustSuggest').innerHTML = '';
    lookupPayCustomer(c);
    return;
  }
  document.getElementById(prefix + 'Name').value = c.name || '';
  document.getElementById(prefix + 'Phone').value = c.phone || '';
  // Paket siparişte kayıtlı adres otomatik doldurulur (boşsa).
  if(prefix === 'pkgCust' && c.address){ const ad = document.getElementById('pkgAddress'); if(ad && !ad.value.trim()){ ad.value = c.address; showToast('📍 Kayıtlı adres dolduruldu'); } }
  const emailEl = document.getElementById(prefix + 'Email');
  if(emailEl && c.email && !emailEl.value) emailEl.value = c.email;
  document.getElementById(prefix + 'Suggest').innerHTML = '';
  if(typeof autoAllowanceForCustomer === 'function') autoAllowanceForCustomer(c.name, c.phone);
  if(typeof checkCustomerBirthday === 'function'){ const bg = document.getElementById('tableModalBg'); checkCustomerBirthday(c.name, c.phone, bg ? bg.dataset.tableId : null); }
  if(prefix !== 'tableCust') return;
  const t = document.getElementById('tableCustName').dataset.table;
  if(t) saveTableCustomer(t, true);
}
/* quiet: alanlardan çıkınca / sipariş gönderilirken sessizce kaydeder (düzenleme açık kalır).
   Değişiklik yoksa hiçbir şey yapmaz. */
async function saveTableCustomer(tableId, quiet){
  const nameEl = document.getElementById('tableCustName');
  if(!nameEl) return;
  let name = nameEl.value.trim();
  let phone = document.getElementById('tableCustPhone').value.trim();
  // Tek arama kutusuna telefon yazıldıysa telefon olarak kaydedilir.
  if(!phone && /^[\d\s+()-]{7,}$/.test(name)){ phone = name; name = ''; }
  if(typeof autoAllowanceForCustomer === 'function') autoAllowanceForCustomer(name, phone);
  if(typeof checkCustomerBirthday === 'function' && (name || phone)) checkCustomerBirthday(name, phone, tableId);
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
  // Masada kayıtlı müşteri varsa doğum günü kontrolü (liste tazelenir).
  if(typeof checkCustomerBirthday === 'function') setTimeout(() => { const o = liveOrderForTable(tableId); if(o && (o.customer_name || o.customer_phone)) checkCustomerBirthday(o.customer_name, o.customer_phone, tableId); else ensureBirthdays(); }, 0);
  if(typeof refreshOrderAllowancePick === 'function') setTimeout(refreshOrderAllowancePick, 0);
  APP.prodSearch = '';
  const tableName = tableNameForId(tableId);
  if(!APP.draftCart) APP.draftCart = {};
  if(!APP.draftCart[tableId]) APP.draftCart[tableId] = [];
  const bg = document.createElement('div');
  bg.id = 'tableModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:7vh 16px 16px;overflow-y:auto;';
  bg.onclick = (e) => { if(e.target===bg) closeTableModal(); };
  bg.innerHTML = `
    <div class="order-modal om-table">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 class="u-m0">${escapeHtml(tableName)}</h2>
        <span class="u-xclose" ${act('closeTableModal')}>✕</span>
      </div>
      <div class="order-modal-grid">
        <div class="order-modal-menu">
          <div class="tabs" id="prodStationTabs" style="margin-top:0;"></div>
          <div id="prodPick"></div>
        </div>
        <div class="order-modal-cart">
          <div class="om-cart-head">🧾 Sipariş<span class="om-cart-total"></span></div>
          ${guestPickHtml(tableId)}${tableCustomerInfoHtml(tableId)}
          <div id="sentItemsWrap"></div>
          <div id="draftItemsWrap"></div>
          ${orderAllowanceHtml(tableId)}${orderFlagsHtml(tableId)}
          ${(String(tableId).indexOf('pkg_')!==0 && String(tableId).indexOf('wl_')!==0 && liveOrderForTable(tableId)) ? `<button class="ghost-btn" style="width:100%;margin-top:12px;" ${act('openMoveTableModal', tableId)}>🔀 Masayı Taşı / Birleştir</button>` : ''}
        </div>
      </div>
      ${guestPickHtml(tableId) ? `<div class="om-guest-m">${guestPickHtml(tableId)}</div>` : ''}
      ${omMobileBarHtml(tableId)}
      <div class="modal-sticky-actions">
        <button class="ghost-btn" style="flex:1;margin-top:0;color:var(--red);border-color:var(--red);" ${act('cancelTableOrder', tableId)}>🗑️ İptal Et</button>
        <button id="confirmBtn" style="flex:1;margin-top:0;" disabled ${act('confirmOrder', tableId)}><kbd class="sc-k">F9</kbd>✅ Onayla ve Gönder</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  bg.dataset.tableId = tableId;
  // İstasyon sekmesi yok: tüm menüler tek listede; sipariş/fiş ürünün istasyonuna gider.
  const stTabs = document.getElementById('prodStationTabs'); if(stTabs) stTabs.style.display = 'none';
  renderProductPick(null, tableId);
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
    delete APP.orderFlagSelections?.[tableId]; delete APP.guestSel?.[tableId];
    delete APP.orderAllowance?.[tableId];
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
  // Çevrimdışı eklenen (stoğu hiç ayrılmamış) adet iade edilmez; iade ağ hatasıyla
  // gönderilemezse kuyruğa alınır (bkz. offline.js).
  Promise.all(items.filter(item => item.qty - (item.unreserved || 0) > 0).map(item => {
    const qty = item.qty - (item.unreserved || 0);
    return sb.rpc('adjust_stock', { p_token: session.session_token, p_product_id: item.product_id, p_delta: qty })
      .then(r => { if(r.error && isNetworkError(r.error)){ queueStockReturn(item.product_id, qty); return { error: null }; } return r; });
  })).then(results => {
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
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;z-index:140;padding:max(16px,5vh) 16px 16px;overflow:auto;';
  m.onclick = (e) => { if(e.target===m) m.remove(); };
  m.innerHTML = `<div class="pay-modal pm2 oa2">
    <div class="pay-modal-header">
      <div class="pm-title"><span class="pm-tic" style="background:linear-gradient(135deg,#eab308,#f97316);">📒</span><div><h2>Açık Hesaba At</h2><small>Borç olarak yazılır, masa kapanır</small></div></div>
      <span class="pay-modal-close" ${act('removeEl','openAccModalBg')}>✕</span>
    </div>
    <div class="oa-total"><div><small>Aktarılacak tutar</small><b>${money(total)}</b></div><span style="font-size:30px;">🧾</span></div>
    <input id="oaSearch" placeholder="🔍 Açık hesap ara (ad / telefon)…" ${actOn('input','drawOpenAccountList',['$value'])} style="margin:0 0 10px;border-radius:12px;">
    <div id="oaList"></div>
    <div class="oa-new">
      <p>➕ Yeni Açık Hesap</p>
      <input id="oaName" maxlength="60" placeholder="Ad Soyad / Firma — kayıtlı müşteri ara" autocomplete="off" ${actOn('input','tableCustSearch',['$value','oa'])}>
      <input id="oaPhone" placeholder="Telefon (opsiyonel)" inputmode="tel" autocomplete="off" ${actOn('input','tableCustSearch',['$value','oa'])}>
      <div id="oaSuggest" style="margin:-4px 0 8px;"></div>
      <small class="muted" style="display:block;margin:-2px 0 8px;font-size:11.5px;">Kayıtlı müşteri değilse Müşteriler'e otomatik eklenir.</small>
      <input id="oaNote" placeholder="Not (opsiyonel)">
      <button type="button" ${act('createOpenAccountAndTransfer')}>Oluştur ve Aktar</button>
    </div>
    <button type="button" class="ghost-btn" style="width:100%;margin-top:10px;" ${act('removeEl','openAccModalBg')}>Vazgeç</button>
  </div>`;
  document.body.appendChild(m);
  drawOpenAccountList('');
}
function drawOpenAccountList(q){
  const box = document.getElementById('oaList'); if(!box) return;
  q = String(q||'').trim().toLocaleLowerCase('tr');
  const rows = (APP.openAccounts||[]).filter(a => !q || a.name.toLocaleLowerCase('tr').includes(q) || String(a.phone||'').includes(q));
  box.innerHTML = rows.length ? rows.map(a => `<div class="oa-row" ${act('transferToOpenAccount', a.id)}>${avatarHtml(a.name)}
      <span class="oa-n"><b>${escapeHtml(a.name)}</b>${a.phone ? '<small>' + phoneHtml(a.phone) + '</small>' : ''}</span>
      <span class="oa-b ${a.balance > 0 ? 'debt' : ''}">${money(a.balance)}</span></div>`).join('')
    : '<p class="muted" style="padding:10px;margin:0;">Açık hesap yok — aşağıdan yeni oluşturun.</p>';
}
async function createOpenAccountAndTransfer(){
  const name = document.getElementById('oaName').value.trim();
  if(!name){ alert('Açık hesap için ad girin'); return; }
  // Seçilen müşterinin zaten açık hesabı varsa yenisi açılmaz, mevcut hesaba aktarılır.
  const same = (APP.openAccounts||[]).find(a => a.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));
  if(same){ transferToOpenAccount(same.id, same.name); return; }
  const { data, error } = await withLoadingOverlay(sb.rpc('create_open_account', { p_token: getSession().session_token, p_name: name,
    p_phone: document.getElementById('oaPhone').value.trim() || null, p_note: document.getElementById('oaNote').value.trim() || null }));
  if(error){ alert(error.message); return; }
  transferToOpenAccount(data, name);
}
async function transferToOpenAccount(accountId, nameHint){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const acc = (APP.openAccounts||[]).find(a => a.id===accountId);
  const total = Math.round(payFinalTotal()*100)/100;
  if(!await uiConfirm(money(total) + ' "' + ((acc && acc.name) || nameHint || 'açık hesap') + '" hesabına aktarılsın mı?')) return;
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

/* Ödeme ekranındaki indirim/bahşiş/müşteri/hediye kartı panelleri sekme
   düğmeleriyle açılıp kapanır; ekran sade kalır. */
function togglePayOpt(key){
  const card = document.querySelector('.pay-option-card[data-opt="'+key+'"]');
  const tab = document.querySelector('.pay-opt-tab[data-opt="'+key+'"]');
  if(!card) return;
  card.hidden = !card.hidden;
  if(tab) tab.classList.toggle('active', !card.hidden);
  if(!card.hidden){ const inp = card.querySelector('input'); if(inp) inp.focus(); }
}
function setPayWantsEmail(el){ APP.payWantsEmail = el.checked; const w = el.closest('.pay-email-toggle'); if(w) w.classList.toggle('on', el.checked); }
function toggleInvCorpFields(on){ document.getElementById('invCorpFields').style.display = on ? 'block' : 'none'; }
function showGoogleReviewQrFromInvoice(){ removeEl('invoiceEmailBg'); showGoogleReviewQr(); }
function editTableCustomer(tableId, focus){ document.getElementById('tableCustWrap').innerHTML = tableCustomerInnerHtml(tableId, true); if(focus){ const el = document.getElementById('tableCustName'); if(el) el.focus(); } }
