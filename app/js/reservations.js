/* Rezervasyonlar & Bekleme Listesi - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= REZERVASYONLAR & BEKLEME LİSTESİ ================= */
async function renderReservationsView(main, session){
  // Bu görünüme her girişte önbellek sıfırlanır; sekmeler arası geçişte de
  // (bkz. setResvTab) her zaman yeniden çekiliyor - böylece başka bir
  // cihazdan/personelden gelen değişiklik (yeni rezervasyon, durum
  // güncellemesi) her zaman görünür.
  APP.reservationsCache = null;
  APP.waitlistCache = null;
  main.innerHTML = `<h1>Rezervasyonlar</h1>
    <div class="tabs" id="resvTabs">
      <div class="tab ${(APP.resvTab||'reservations')==='reservations'?'active':''}" data-tab="reservations" onclick="setResvTab('reservations')">Rezervasyonlar</div>
      <div class="tab ${APP.resvTab==='waitlist'?'active':''}" data-tab="waitlist" onclick="setResvTab('waitlist')">Bekleme Listesi</div>
    </div>
    <div id="resvContent"></div>`;
  await renderResvTabContent(session);
}
function setResvTab(tab){
  APP.resvTab = tab;
  document.querySelectorAll('#resvTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  // Önbellek sekmeler arasında korunuyordu (yalnızca görünüme YENİDEN
  // girişte sıfırlanıyordu) - bu da aynı görünümü açık tutup sekme
  // değiştiren personelin, başka bir cihazdan/başka bir personelden gelen
  // güncellemeyi (yeni rezervasyon, durum değişikliği vb.) görememesine
  // yol açıyordu. Rezervasyon/bekleme listesi az sayıda satır içerdiği için
  // her sekme tıklamasında yeniden çekmenin maliyeti ihmal edilebilir.
  renderResvTabContent(getSession(), true);
}
function renderResvTabContent(session, forceRefresh){
  return (APP.resvTab||'reservations')==='waitlist' ? renderWaitlistContent(session, forceRefresh) : renderReservationsContent(session, forceRefresh);
}
const RESV_STATUS_LABELS = { pending:'Bekliyor', confirmed:'Onaylandı', seated:'Oturdu', cancelled:'İptal', no_show:'Gelmedi' };
async function renderReservationsContent(session, forceRefresh){
  const el = document.getElementById('resvContent'); if(!el) return;
  if(!APP.config){ const { data } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token })); if(data) APP.config = data; }
  if(forceRefresh || !APP.reservationsCache){
    const { data, error } = await withLoadingOverlay(sb.rpc('list_reservations', { p_token: session.session_token, p_date: null }));
    if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
    APP.reservationsCache = data || [];
  }
  const rows = APP.reservationsCache;
  const allTables = (APP.config.zones||[]).flatMap(z => z.tables);
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Rezervasyonlar</h2>
    <div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Müşteri</th><th>Telefon</th><th>Kişi</th><th>Zaman</th><th>Masa</th><th>Durum</th><th></th></tr></thead>
      <tbody>
      ${rows.map(r => `
        <tr>
          <td class="col-name">${escapeHtml(r.customer_name)}${r.notes?'<div class="muted" style="font-size:11px;overflow-wrap:anywhere;word-break:break-word;">'+escapeHtml(r.notes)+'</div>':''}</td>
          <td>${escapeHtml(r.phone||'-')}</td>
          <td>${r.party_size}</td>
          <td>${new Date(r.reservation_time).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}</td>
          <td>${escapeHtml(r.table_name||'-')}</td>
          <td><select onchange="changeReservationStatus('${r.id}',this.value)">
            ${Object.keys(RESV_STATUS_LABELS).map(s => `<option value="${s}" ${r.status===s?'selected':''}>${RESV_STATUS_LABELS[s]}</option>`).join('')}
          </select></td>
          <td><button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="removeReservation('${r.id}')">Sil</button></td>
        </tr>`).join('')}
      ${rows.length===0?'<tr><td colspan="7" class="muted" style="text-align:center;">Yaklaşan rezervasyon yok.</td></tr>':''}
      </tbody>
    </table>
    </div>
    <div class="add-row-panel">
      <p>Yeni Rezervasyon</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 90px 1fr 1fr;gap:10px;align-items:end;">
        <div class="field-group"><label>Müşteri Adı</label><input id="rv_name" placeholder="örn. Zeynep Hanım"></div>
        <div class="field-group"><label>Telefon</label><input id="rv_phone" placeholder="05xx..."></div>
        <div class="field-group"><label>Kişi</label><input id="rv_party" type="number" min="1" value="2"></div>
        <div class="field-group"><label>Tarih & Saat</label><input id="rv_time" type="datetime-local"></div>
        <div class="field-group"><label>Masa (opsiyonel)</label><select id="rv_table"><option value="">-</option>${allTables.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></div>
      </div>
      <div class="field-group" style="margin-top:10px;"><label>Not</label><input id="rv_notes" placeholder="opsiyonel"></div>
      <button style="margin-top:12px;max-width:220px;" onclick="addReservation()">+ Rezervasyon Ekle</button>
    </div>
  </div>`;
}
async function addReservation(){
  const session = getSession();
  const name = document.getElementById('rv_name').value.trim();
  const phone = document.getElementById('rv_phone').value.trim();
  const party = parseInt(document.getElementById('rv_party').value)||2;
  const timeVal = document.getElementById('rv_time').value;
  const tableId = document.getElementById('rv_table').value || null;
  const notes = document.getElementById('rv_notes').value.trim();
  if(!name || !timeVal){ alert('Müşteri adı ve zaman gerekli'); return; }
  const { error } = await sb.rpc('upsert_reservation', { p_token: session.session_token, p_id: null, p_customer_name: name, p_phone: phone||null, p_party_size: party, p_reservation_time: new Date(timeVal).toISOString(), p_table_id: tableId, p_notes: notes||null });
  if(error){ alert(error.message); return; }
  renderReservationsContent(session, true);
  showToast('Rezervasyon eklendi ✓');
}
async function changeReservationStatus(id, status){
  const session = getSession();
  const { error } = await sb.rpc('set_reservation_status', { p_token: session.session_token, p_id: id, p_status: status });
  if(error){ alert(error.message); return; }
  // changeWaitlistStatus'un aksine burada eksikti: cache yenilenmediği için
  // (renderReservationsContent'in üstündeki forceRefresh mekanizması) durum
  // değişikliği ekranda görünmüyor, sekmeler arası geçince eski veri geri
  // geliyordu.
  renderReservationsContent(session, true);
  showToast('Durum güncellendi ✓');
}
async function removeReservation(id){
  if(!confirm('Bu rezervasyonu silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_reservation', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  renderReservationsContent(session, true);
}
async function renderWaitlistContent(session, forceRefresh){
  const el = document.getElementById('resvContent'); if(!el) return;
  if(forceRefresh || !APP.waitlistCache){
    const { data, error } = await withLoadingOverlay(sb.rpc('list_waitlist', { p_token: session.session_token }));
    if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
    APP.waitlistCache = data || [];
  }
  const rows = APP.waitlistCache;
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>Bekleme Listesi</h2>
    <div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Müşteri</th><th>Telefon</th><th>Kişi</th><th>Bekleme</th><th>Katılım</th><th></th></tr></thead>
      <tbody>
      ${rows.map(w => `
        <tr>
          <td class="col-name">${escapeHtml(w.customer_name)}</td>
          <td>${escapeHtml(w.phone||'-')}</td>
          <td>${w.party_size}</td>
          <td><span class="waitlist-timer" data-joined="${w.joined_at}" data-quoted="${w.quoted_wait_minutes||''}">-</span></td>
          <td>${new Date(w.joined_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</td>
          <td>
            <button class="sbtn" onclick="changeWaitlistStatus('${w.id}','seated')">Oturdu</button>
            <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="changeWaitlistStatus('${w.id}','cancelled')">İptal</button>
          </td>
        </tr>`).join('')}
      ${rows.length===0?'<tr><td colspan="6" class="muted" style="text-align:center;">Bekleyen müşteri yok.</td></tr>':''}
      </tbody>
    </table>
    </div>
    <div class="add-row-panel">
      <p>Bekleme Listesine Ekle</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 90px 120px;gap:10px;align-items:end;">
        <div class="field-group"><label>Müşteri Adı</label><input id="wl_name" placeholder="örn. Mehmet Bey"></div>
        <div class="field-group"><label>Telefon</label><input id="wl_phone" placeholder="05xx..."></div>
        <div class="field-group"><label>Kişi</label><input id="wl_party" type="number" min="1" value="2"></div>
        <div class="field-group"><label>Tahmini Bekleme (dk)</label><input id="wl_wait" type="number" min="0" placeholder="15"></div>
      </div>
      <button style="margin-top:12px;max-width:220px;" onclick="addWaitlistEntry()">+ Ekle</button>
    </div>
  </div>`;
  updateWaitlistTimers();
  startWaitlistTimerInterval();
}
/* Bekleme listesindeki "Bekleme" sütunu, katılım zamanı + tahmini bekleme
   süresinden canlı bir geri sayım olarak hesaplanır (kalan dakika azalır,
   süre dolunca kaç dakika geciktiği kırmızı gösterilir) - mutfak
   ekranındaki canlı sayaçla aynı desen (bkz. updateKitchenTimers). */
let WAITLIST_TIMER_INTERVAL = null;
function startWaitlistTimerInterval(){
  stopWaitlistTimerInterval();
  WAITLIST_TIMER_INTERVAL = setInterval(() => {
    if(APP.view==='reservations' && (APP.resvTab||'reservations')==='waitlist') updateWaitlistTimers();
    else stopWaitlistTimerInterval();
  }, 1000);
}
function stopWaitlistTimerInterval(){
  if(WAITLIST_TIMER_INTERVAL){ clearInterval(WAITLIST_TIMER_INTERVAL); WAITLIST_TIMER_INTERVAL=null; }
}
function updateWaitlistTimers(){
  document.querySelectorAll('.waitlist-timer[data-joined]').forEach(el => {
    const joined = el.dataset.joined;
    if(!joined){ el.textContent = '-'; return; }
    const elapsedMin = (Date.now() - new Date(joined).getTime())/60000;
    const quotedRaw = el.dataset.quoted;
    if(quotedRaw){
      const quoted = parseFloat(quotedRaw);
      const remaining = quoted - elapsedMin;
      if(remaining > 0){
        el.textContent = Math.ceil(remaining) + ' dk kaldı';
        el.style.color = remaining<=5 ? '#eab308' : '';
        el.style.fontWeight = remaining<=5 ? '700' : '';
      } else {
        el.textContent = Math.round(Math.abs(remaining)) + ' dk gecikti';
        el.style.color = 'var(--red)';
        el.style.fontWeight = '800';
      }
    } else {
      el.textContent = Math.round(elapsedMin) + ' dk bekliyor';
      el.style.color = '';
      el.style.fontWeight = '';
    }
  });
}
async function addWaitlistEntry(){
  const session = getSession();
  const name = document.getElementById('wl_name').value.trim();
  const phone = document.getElementById('wl_phone').value.trim();
  const party = parseInt(document.getElementById('wl_party').value)||2;
  const wait = document.getElementById('wl_wait').value ? parseInt(document.getElementById('wl_wait').value) : null;
  if(!name){ alert('Müşteri adı gerekli'); return; }
  const { error } = await sb.rpc('add_waitlist_entry', { p_token: session.session_token, p_customer_name: name, p_phone: phone||null, p_party_size: party, p_quoted_wait_minutes: wait });
  if(error){ alert(error.message); return; }
  renderWaitlistContent(session, true);
  showToast('Bekleme listesine eklendi ✓');
}
async function changeWaitlistStatus(id, status){
  const session = getSession();
  const { error } = await sb.rpc('set_waitlist_status', { p_token: session.session_token, p_id: id, p_status: status });
  if(error){ alert(error.message); return; }
  renderWaitlistContent(session, true);
}
