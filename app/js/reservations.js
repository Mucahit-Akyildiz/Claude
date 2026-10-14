/* Rezervasyonlar & Bekleme Listesi - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= REZERVASYONLAR & BEKLEME LİSTESİ ================= */
async function renderReservationsView(main, session){
  // Bu görünüme her girişte önbellek sıfırlanır; sekmeler arası geçişte de
  // (bkz. setResvTab) her zaman yeniden çekiliyor - böylece başka bir
  // cihazdan/personelden gelen değişiklik (yeni rezervasyon, durum
  // güncellemesi) her zaman görünür.
  APP.reservationsCache = null;
  APP.waitlistCache = null;
  main.innerHTML = `<h1>Rezervasyonlar ve Bekleme Listesi</h1>
    <div class="tabs" id="resvTabs">
      <div class="tab ${(APP.resvTab||'reservations')==='reservations'?'active':''}" data-tab="reservations" ${act('setResvTab', 'reservations')}>Rezervasyonlar</div>
      <div class="tab ${APP.resvTab==='waitlist'?'active':''}" data-tab="waitlist" ${act('setResvTab', 'waitlist')}>Bekleme Listesi</div>
    </div>
    <div id="resvContent"></div>`;
  await renderResvTabContent(session);
}
function setResvTab(tab){
  if(tab !== APP.resvTab) pushScreen();
  setTimeout(applyNavBadges, 0);
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
  const today = todayLocalDateStr(), dkey = (r) => { const d = new Date(r.reservation_time); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const sorted = [...rows].sort((x, y) => new Date(x.reservation_time) - new Date(y.reservation_time));
  const todays = sorted.filter(r => dkey(r) === today), next = sorted.find(r => new Date(r.reservation_time) >= new Date());
  const days = [...new Set(sorted.map(dkey))];
  const dayLabel = (k) => { const d = new Date(k+'T00:00'); const diff = Math.round((d - new Date(today+'T00:00'))/86400000);
    return (diff===0 ? 'Bugün' : diff===1 ? 'Yarın' : diff===-1 ? 'Dün' : '') + ' <small>' + d.toLocaleDateString('tr-TR',{weekday:'long', day:'numeric', month:'long'}) + '</small>'; };
  const rvTags = (r) => [dkey(r)===today ? 'today' : '', r.status==='pending' ? 'pending' : '', next && r.id===next.id ? 'next' : ''].filter(Boolean).join(' ') || 'none';
  const card = (r) => { const t = new Date(r.reservation_time), late = t < new Date() && r.status !== 'seated'; const mins = Math.round((t - new Date())/60000), soon = !late && mins <= 120 && mins >= 0;
    return `<div class="rv-card st-${r.status}${late?' late':''}${soon?' soon':''}" data-cf-tags="${rvTags(r)}" data-badge-id="${r.id}">
      <div class="rv-time"><b>${t.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</b><span class="rv-pill">${RESV_STATUS_LABELS[r.status]||r.status}</span></div>
      <div class="rv-main">
        <div class="rv-who">${avatarHtml(r.customer_name)}<div><b>${escapeHtml(r.customer_name)}</b><small>${r.phone ? phoneHtml(r.phone) : 'telefon yok'}</small></div></div>
        <div class="rv-meta"><span class="pchip">👥 ${r.party_size} kişi</span><span class="pchip">🪑 ${escapeHtml(r.table_name||'Masa seçilmedi')}</span>${late ? '<span class="pchip warn">⏰ saati geçti</span>' : ''}${soon ? `<span class="pchip rv-soon">⏳ ${mins} dk kaldı</span>` : ''}</div>
        ${r.notes ? `<div class="rv-note">📝 ${escapeHtml(r.notes)}</div>` : ''}
      </div>
      <div class="rv-acts">
        ${r.status==='pending' ? `<button type="button" class="pc-btn rv-ok" ${act('changeReservationStatus', r.id, 'confirmed')}>✓ Onayla</button>` : ''}
        <button type="button" class="pc-btn rv-seat" ${act('changeReservationStatus', r.id, 'seated')}>🪑 Oturdu</button>
        <button type="button" class="pc-btn" ${act('changeReservationStatus', r.id, 'no_show')}>Gelmedi</button>
        <button type="button" class="pc-btn" ${act('changeReservationStatus', r.id, 'cancelled')}>İptal</button>
        <button type="button" class="pc-btn rv-del" title="Sil" ${act('removeReservation', r.id)}>🗑</button>
      </div>
    </div>`; };
  el.innerHTML = statChips([
      ['📅', todays.length, 'Bugünkü rezervasyon', 'var(--c1)', 'today'],
      ['👥', todays.reduce((x, r) => x + (Number(r.party_size)||0), 0), 'Bugün beklenen kişi', 'var(--c2)', 'today'],
      ['⏳', rows.filter(r => r.status==='pending').length, 'Onay bekleyen', 'var(--c3)', 'pending'],
      ['⏭️', next ? new Date(next.reservation_time).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '—', next ? 'Sıradaki: '+escapeHtml(next.customer_name) : 'Sıradaki yok', 'var(--c4)', next ? 'next' : '']
    ], '', 'resv') + `<div class="box" style="max-width:none;">
    <h2>Rezervasyonlar</h2>
    <div class="add-row-panel" style="margin:0 0 16px;">
      <p>Yeni Rezervasyon</p>
      <div style="${INLINE_ROW}">
        <div class="field-group" style="${fgStyle(170, 2)}"><label>Müşteri Adı</label><input style="margin:0;" id="rvCustName" placeholder="Ad veya kayıtlı müşteri ara" autocomplete="off" ${actOn('input','tableCustSearch',['$value', 'rvCust'])}></div>
        <div class="field-group" style="${fgStyle(130)}"><label>Telefon</label><input style="margin:0;" id="rvCustPhone" placeholder="05xx..." inputmode="tel" autocomplete="off" ${actOn('input','tableCustSearch',['$value', 'rvCust'])}></div>
        <div class="field-group" style="${fgStyle(160)}"><label>E-posta (hatırlatma)</label><input style="margin:0;" id="rvCustEmail" type="email" placeholder="opsiyonel" autocapitalize="none"></div>
        <div class="field-group" style="${fgStyle(70)}"><label>Kişi</label><input style="margin:0;" id="rv_party" type="number" min="1" value="2"></div>
        <div class="field-group" style="${fgStyle(190)}"><label>Tarih & Saat</label><input style="margin:0;" id="rv_time" type="datetime-local"></div>
        <div class="field-group" style="${fgStyle(120)}"><label>Masa (opsiyonel)</label><select style="margin:0;" id="rv_table"><option value="">-</option>${tableOptionsHtml(null)}</select></div>
        <div class="field-group" style="${fgStyle(160, 2)}"><label>Not</label><input style="margin:0;" id="rv_notes" placeholder="opsiyonel"></div>
        <button style="${INLINE_BTN}" ${act('addReservation')}>+ Rezervasyon Ekle</button>
      </div>
      <div id="rvCustSuggest"></div>
    </div>
  </div>
  <div class="box" style="max-width:none;margin-top:18px;">
    <h2 style="margin:0 0 12px;">Yaklaşan Rezervasyonlar</h2><div data-cf-scope="resv">
    ${days.length ? days.map(k => `<div class="rv-day" data-cf-tags="${[...new Set(sorted.filter(r => dkey(r)===k).flatMap(r => rvTags(r).split(' ')))].join(' ')}"><div class="rv-day-h">${dayLabel(k)}<span class="muted">${sorted.filter(r => dkey(r)===k).length} rezervasyon</span></div>
      <div class="rv-list">${sorted.filter(r => dkey(r)===k).map(card).join('')}</div></div>`).join('')
      : '<div class="empty-state"><div style="font-size:42px;">📅</div><p class="muted">Bekleyen ya da onaylı rezervasyon yok.</p></div>'}
  </div></div>
  <div class="box" style="max-width:none;margin-top:18px;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
      <h2 style="margin:0;">Geçmiş</h2>
      <input type="date" id="rvHistDate" value="${APP.rvHistDate || todayLocalDateStr()}" style="width:auto;margin:0;" ${actOn('change','setRvHistDate',['$value'])}>
    </div>
    <div id="rvHistWrap" style="margin-top:12px;"><p class="muted">Yükleniyor…</p></div>
  </div>`;
  if(!APP.silentLoad) refreshNavBadges();
  await renderReservationHistory();
}
/* Rezervasyon geçmişi: seçilen günün oturan / iptal / gelmeyen
   rezervasyonları; oturanlarda rezervasyon saatine göre erken/geç. */
async function renderReservationHistory(){
  const wrap = document.getElementById('rvHistWrap'); if(!wrap) return;
  const session = getSession();
  const { data, error } = await sb.rpc('list_reservation_history', { p_token: session.session_token, p_date: APP.rvHistDate || todayLocalDateStr() });
  if(error){ wrap.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const rows = data || [];
  if(!rows.length){ wrap.innerHTML = '<p class="muted">Bu tarihte kayıt yok.</p>'; return; }
  const hm = (iso) => iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : '-';
  const cnt = (st) => rows.filter(r => r.status===st).length;
  wrap.innerHTML = `<p class="muted" style="text-align:left;margin:0 0 10px;font-size:13px;">${rows.length} kayıt · ${cnt('seated')} oturdu · ${cnt('cancelled')} iptal · ${cnt('no_show')} gelmedi</p>
    <div class="rh-grid">${rows.map((r, i) => {
        const d = r.seated_diff_minutes;
        const st = r.status==='seated' ? 'ok' : 'bad';
        const dur = (m) => m >= 1440 ? Math.round(m/1440) + ' gün' : m >= 60 ? Math.floor(m/60) + ' sa ' + (m%60) + ' dk' : m + ' dk';
        const diffTxt = d==null ? '' : d > 0 ? `<span class="pchip rh-bad">🐢 ${dur(d)} geç</span>` : d < 0 ? `<span class="pchip rh-good">⚡ ${dur(-d)} erken</span>` : '<span class="pchip rh-good">🎯 Tam zamanında</span>';
        const result = r.status==='seated' ? `✅ Oturdu${r.seated_at ? ' · ' + hm(r.seated_at) : ''}` : r.status==='cancelled' ? `✕ İptal${r.closed_at ? ' · ' + hm(r.closed_at) : ''}` : '🚫 Gelmedi';
        return `<div class="rh-card rh-${st}" style="--i:${Math.min(i,12)};">
          <div class="rh-top">${avatarHtml(r.customer_name)}<div class="rh-who"><b>${escapeHtml(r.customer_name)}</b><small>${r.phone ? phoneHtml(r.phone) : 'telefon yok'}</small></div><span class="rh-res">${result}</span></div>
          <div class="rv-meta"><span class="pchip">🕒 ${hm(r.reservation_time)}</span><span class="pchip">👥 ${r.party_size} kişi</span><span class="pchip">🪑 ${r.table_name ? escapeHtml(r.table_name) : '—'}</span>${diffTxt}</div>
          ${r.email ? `<div class="rh-note">${emailHtml(r.email)}</div>` : ''}${r.notes ? `<div class="rh-note">📝 ${escapeHtml(r.notes)}</div>` : ''}
          <button type="button" class="pc-btn rh-undo" title="Yaklaşan rezervasyonlara geri al" ${act('changeReservationStatus', r.id, 'confirmed')}>↩ Geri Al</button>
        </div>`;
      }).join('')}</div>`;
}
/* "Oturdu": rezervasyonun masası yoksa masa sorulur; müşteri adı, telefonu,
   kişi sayısı ve notu o masada açılan siparişe yazılır (bkz. seat_reservation),
   Sipariş Al ekranında masada görünür. */
async function openSeatReservationModal(id){
  // Dolu masaları doğru göstermek için açık siparişleri tazele.
  { const r = await sb.rpc('get_live_orders', { p_token: getSession().session_token }); if(r.data) APP.liveOrders = r.data; }
  const r = (APP.reservationsCache||[]).find(x => x.id===id); if(!r) return;
  const tables = (APP.config.zones||[]).flatMap(z => z.tables.map(t => ({ ...t, zone: z.name })));
  const busy = new Set((APP.liveOrders||[]).filter(o => o.table_id).map(o => o.table_id));
  const bg = document.createElement('div');
  bg.id = 'seatResvModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg){ bg.remove(); renderReservationsContent(getSession()); } };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:380px;width:100%;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">Masaya Oturt</h2><span style="cursor:pointer;color:var(--muted);" ${act('closeSeatResvModal')}>✕</span></div>
    <p class="muted" style="text-align:left;margin:8px 0 12px;"><b>${escapeHtml(r.customer_name)}</b> · ${r.party_size} kişi${r.phone ? ' · ' + phoneHtml(r.phone) : ''}</p>
    <div class="field-group"><label>Masa</label><select id="seatResvTable">
      ${tableOptionsHtml(r.table_id, busy)}
    </select></div>
    <button style="margin-top:12px;" ${act('confirmSeatReservation', id)}>✓ Masaya Oturt</button>
  </div>`;
  document.body.appendChild(bg);
}
async function confirmSeatReservation(id){
  const tableId = document.getElementById('seatResvTable').value;
  const session = getSession();
  const { error } = await withLoadingOverlay(sb.rpc('seat_reservation', { p_token: session.session_token, p_id: id, p_table_id: tableId }));
  if(error){ alert(error.message); return; }
  const bg = document.getElementById('seatResvModalBg'); if(bg) bg.remove();
  const r = (APP.reservationsCache||[]).find(x => x.id===id);
  renderReservationsContent(session, true);
  showToast((r ? r.customer_name + ' ' : '') + tableNameForId(tableId) + ' masasına oturtuldu ✓ Siparişe gitmek için dokunun', 6000, null, () => goToView('order'));
}
async function addReservation(){
  const session = getSession();
  const name = document.getElementById('rvCustName').value.trim();
  const phone = document.getElementById('rvCustPhone').value.trim();
  const email = document.getElementById('rvCustEmail').value.trim();
  const party = parseInt(document.getElementById('rv_party').value)||2;
  const timeVal = document.getElementById('rv_time').value;
  const tableId = document.getElementById('rv_table').value || null;
  const notes = document.getElementById('rv_notes').value.trim();
  if(!name || !timeVal){ alert('Müşteri adı ve zaman gerekli'); return; }
  const { error } = await sb.rpc('upsert_reservation', { p_token: session.session_token, p_id: null, p_customer_name: name, p_phone: phone||null, p_party_size: party, p_reservation_time: new Date(timeVal).toISOString(), p_table_id: tableId, p_notes: notes||null, p_email: email||null });
  if(error){ alert(error.message); return; }
  renderReservationsContent(session, true);
  showToast('Rezervasyon eklendi ✓');
}
async function changeReservationStatus(id, status){
  if(status==='seated') return openSeatReservationModal(id);
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
    const [{ data, error }, live] = await withLoadingOverlay(Promise.all([
      sb.rpc('list_waitlist', { p_token: session.session_token }),
      sb.rpc('get_live_orders', { p_token: session.session_token })
    ]));
    if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
    APP.waitlistCache = data || [];
    if(live && !live.error) APP.liveOrders = live.data || [];
  }
  const rows = APP.waitlistCache;
  const hasOrder = (w) => (APP.liveOrders||[]).some(o => o.kind==='waitlist' && o.waitlist_id===w.id);
  const avgWait = rows.length ? Math.round(rows.reduce((x, w) => x + (Date.now() - new Date(w.joined_at).getTime())/60000, 0) / rows.length) : 0;
  el.innerHTML = statChips([
      ['🧍', rows.length, 'Sırada bekleyen', 'var(--c1)', 'all'],
      ['👥', rows.reduce((x, w) => x + (Number(w.party_size)||0), 0), 'Toplam kişi', 'var(--c2)'],
      ['⏱', avgWait + ' dk', 'Ortalama bekleme', 'var(--c3)'],
      ['🍽️', rows.filter(hasOrder).length, 'Beklerken sipariş veren', 'var(--c4)', 'ordered']
    ], '', 'wl') + `<div class="box" style="max-width:none;">
    <h2>Bekleme Listesi</h2>
    <div class="add-row-panel" style="margin:0 0 16px;">
      <p>Bekleme Listesine Ekle</p>
      <div style="${INLINE_ROW}">
        <div class="field-group" style="${fgStyle(170, 2)}"><label>Müşteri Adı</label><input style="margin:0;" id="wlCustName" placeholder="Ad veya kayıtlı müşteri ara" autocomplete="off" ${actOn('input','tableCustSearch',['$value', 'wlCust'])}></div>
        <div class="field-group" style="${fgStyle(130)}"><label>Telefon</label><input style="margin:0;" id="wlCustPhone" placeholder="05xx..." inputmode="tel" autocomplete="off" ${actOn('input','tableCustSearch',['$value', 'wlCust'])}></div>
        <div class="field-group" style="${fgStyle(160)}"><label>E-posta (bildirim)</label><input style="margin:0;" id="wlCustEmail" type="email" placeholder="opsiyonel" autocapitalize="none"></div>
        <div class="field-group" style="${fgStyle(70)}"><label>Kişi</label><input style="margin:0;" id="wl_party" type="number" min="1" value="2"></div>
        <div class="field-group" style="${fgStyle(120)}"><label>Tahmini Bekleme (dk)</label><input style="margin:0;" id="wl_wait" type="number" min="0" placeholder="15"></div>
        <button style="${INLINE_BTN}" ${act('addWaitlistEntry')}>+ Ekle</button>
      </div>
      <div id="wlCustSuggest"></div>
    </div>
    ${rows.length ? `<div class="wl-list" data-cf-scope="wl">${rows.map((w, i) => `
      <div class="wl-card" data-cf-tags="${hasOrder(w) ? 'ordered' : 'noorder'}" data-badge-id="${w.id}" style="--i:${i};">
        <div class="wl-no">${i+1}</div>
        <div class="rv-who">${avatarHtml(w.customer_name)}<div><b>${escapeHtml(w.customer_name)}</b><small>${w.phone ? phoneHtml(w.phone) : ''}${w.email ? ' ' + emailHtml(w.email) : ''}</small></div></div>
        <div class="wl-info">
          <span class="pchip">👥 ${w.party_size} kişi</span>
          <span class="pchip">🕐 ${new Date(w.joined_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} katıldı</span>
          ${w.quoted_wait_minutes!=null ? `<span class="pchip">🎯 ${new Date(new Date(w.joined_at).getTime() + w.quoted_wait_minutes*60000).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} tahmini</span>` : ''}
          ${hasOrder(w) ? '<span class="pchip warn">🍽️ sipariş verdi</span>' : ''}
        </div>
        <div class="wl-timer"><span class="waitlist-timer" data-joined="${w.joined_at}" data-quoted="${w.quoted_wait_minutes||''}">-</span></div>
        <div class="rv-acts">
          ${w.phone ? `<button type="button" class="pc-btn" title="Müşteriye 'Masanız hazır' SMS'i gönder" ${act('notifyWaitlistReady', w.id)}>📱 Masa Hazır</button>` : ''}
          <button type="button" class="pc-btn" title="Kalan bekleme süresini güncelle" ${act('updateWaitlistWait', w.id)}>⏱ Süre</button>
          <button type="button" class="pc-btn" title="Beklerken sipariş al" ${act('openWaitlistOrderModal', w.id)}>🍽️ Sipariş${hasOrder(w) ? ' ✓' : ''}</button>
          <button type="button" class="pc-btn rv-seat" ${act('openSeatWaitlistModal', w.id)}>🪑 Oturdu</button>
          <button type="button" class="pc-btn rv-del" ${act('changeWaitlistStatus', w.id, 'cancelled')}>İptal</button>
        </div>
      </div>`).join('')}</div>`
      : '<div class="empty-state"><div style="font-size:42px;">🧍</div><p class="muted">Bekleyen müşteri yok.</p></div>'}
  </div>`;
  el.insertAdjacentHTML('beforeend', `<div class="box" style="max-width:none;margin-top:18px;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
      <h2 style="margin:0;">Geçmiş</h2>
      <input type="date" id="wlHistDate" value="${APP.wlHistDate || todayLocalDateStr()}" style="width:auto;margin:0;" ${actOn('change','setWlHistDate',['$value'])}>
    </div>
    <div id="wlHistWrap" style="margin-top:12px;"><p class="muted">Yükleniyor…</p></div>
  </div>`);
  if(!APP.silentLoad) refreshNavBadges();
  await renderWaitlistHistory();
  updateWaitlistTimers();
  startWaitlistTimerInterval();
}
/* Bekleme listesi geçmişi: seçilen günde listeye alınanlar, ne kadar
   bekledikleri (tahmine göre erken/geç), oturdukları masa ya da ayrıldıkları. */
async function renderWaitlistHistory(){
  const wrap = document.getElementById('wlHistWrap'); if(!wrap) return;
  const session = getSession();
  const { data, error } = await sb.rpc('list_waitlist_history', { p_token: session.session_token, p_date: APP.wlHistDate || todayLocalDateStr() });
  if(error){ wrap.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const rows = data || [];
  if(!rows.length){ wrap.innerHTML = '<p class="muted">Bu tarihte kayıt yok.</p>'; return; }
  const seated = rows.filter(r => r.status==='seated');
  const avg = seated.length ? Math.round(seated.reduce((t, r) => t + Number(r.waited_minutes||0), 0) / seated.length) : null;
  const hm = (iso) => iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : '-';
  wrap.innerHTML = `<p class="muted" style="text-align:left;margin:0 0 10px;font-size:13px;">${rows.length} kayıt · ${seated.length} oturdu · ${rows.length - seated.length} ayrıldı${avg!=null ? ' · ortalama bekleme ' + avg + ' dk' : ''}</p>
    <div class="rh-grid">${rows.map((r, i) => {
        const waited = Number(r.waited_minutes||0);
        const q = r.quoted_wait_minutes;
        const diff = (q!=null && r.status==='seated') ? waited - q : null;
        const diffTxt = diff==null ? '' : diff > 0 ? `<span class="pchip rh-bad">🐢 tahminden ${diff} dk geç</span>` : diff < 0 ? `<span class="pchip rh-good">⚡ tahminden ${-diff} dk erken</span>` : '<span class="pchip rh-good">🎯 Tam zamanında</span>';
        const ok = r.status==='seated';
        return `<div class="rh-card rh-${ok?'ok':'bad'}" style="--i:${Math.min(i,12)};">
          <div class="rh-top">${avatarHtml(r.customer_name)}<div class="rh-who"><b>${escapeHtml(r.customer_name)}</b><small>${r.phone ? phoneHtml(r.phone) : 'telefon yok'}</small></div><span class="rh-res">${ok ? '✅ Oturdu · ' + hm(r.seated_at) : '✕ Ayrıldı · ' + hm(r.left_at)}</span></div>
          <div class="rv-meta"><span class="pchip">🕒 ${hm(r.joined_at)} katıldı</span><span class="pchip">👥 ${r.party_size} kişi</span><span class="pchip">🪑 ${r.table_name ? escapeHtml(r.table_name) : '—'}</span><span class="pchip">⏳ ${waited} dk${q!=null ? ' (tahmin ' + q + ')' : ''}</span>${diffTxt}</div>
        </div>`;
      }).join('')}</div>`;
}
/* Bekleme listesinden "Oturdu": masa seçilir, masada müşteri adı/telefon ve
   bekleme notuyla sipariş açılır (bkz. seat_waitlist_entry). */
async function openSeatWaitlistModal(id){
  // Dolu masaları doğru göstermek için açık siparişleri tazele.
  { const r = await sb.rpc('get_live_orders', { p_token: getSession().session_token }); if(r.data) APP.liveOrders = r.data; }
  const w = (APP.waitlistCache||[]).find(x => x.id===id); if(!w) return;
  const tables = (APP.config.zones||[]).flatMap(z => z.tables.map(t => ({ ...t, zone: z.name })));
  const busy = new Set((APP.liveOrders||[]).filter(o => o.table_id).map(o => o.table_id));
  const bg = document.createElement('div');
  bg.id = 'seatWlModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:380px;width:100%;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">Masaya Oturt</h2><span style="cursor:pointer;color:var(--muted);" ${act('removeEl','seatWlModalBg')}>✕</span></div>
    <p class="muted" style="text-align:left;margin:8px 0 12px;"><b>${escapeHtml(w.customer_name)}</b> · ${w.party_size} kişi${w.phone ? ' · ' + phoneHtml(w.phone) : ''}</p>
    <div class="field-group"><label>Masa</label><select id="seatWlTable">
      ${tableOptionsHtml(null, busy)}
    </select></div>
    <button style="margin-top:12px;" ${act('confirmSeatWaitlist', id)}>✓ Masaya Oturt</button>
  </div>`;
  document.body.appendChild(bg);
  // İlk boş masayı seç.
  const firstFree = tables.find(t => !busy.has(t.id));
  if(firstFree) document.getElementById('seatWlTable').value = firstFree.id;
}
async function confirmSeatWaitlist(id){
  const tableId = document.getElementById('seatWlTable').value;
  const session = getSession();
  const { data, error } = await withLoadingOverlay(sb.rpc('seat_waitlist_entry', { p_token: session.session_token, p_id: id, p_table_id: tableId }));
  if(error){ alert(error.message); return; }
  const bg = document.getElementById('seatWlModalBg'); if(bg) bg.remove();
  const w = (APP.waitlistCache||[]).find(x => x.id===id);
  renderWaitlistContent(session, true);
  refreshNavBadges();
  showToast((w ? w.customer_name + ' ' : '') + tableNameForId(tableId) + ' masasına oturtuldu ✓ (' + (data && data.waited_minutes) + ' dk bekledi) Siparişe gitmek için dokunun', 6000, null, () => goToView('order'));
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
  const name = document.getElementById('wlCustName').value.trim();
  const phone = document.getElementById('wlCustPhone').value.trim();
  const party = parseInt(document.getElementById('wl_party').value)||2;
  const wait = document.getElementById('wl_wait').value ? parseInt(document.getElementById('wl_wait').value) : null;
  const email = document.getElementById('wlCustEmail').value.trim();
  if(!name){ alert('Müşteri adı gerekli'); return; }
  const { error } = await sb.rpc('add_waitlist_entry', { p_token: session.session_token, p_customer_name: name, p_phone: phone||null, p_party_size: party, p_quoted_wait_minutes: wait, p_email: email||null });
  if(error){ alert(error.message); return; }
  renderWaitlistContent(session, true);
  showToast(email ? 'Bekleme listesine eklendi, müşteriye e-posta gönderildi ✓' : 'Bekleme listesine eklendi ✓');
}
/* Kalan bekleme süresini güncelle: e-posta varsa müşteriye bildirilir; 15 ve 5 dk kala
   hatırlatmalar yeni süreye göre tekrar gönderilir (bkz. update_waitlist_wait). */
async function updateWaitlistWait(id){
  const w = (APP.waitlistCache||[]).find(x => x.id===id); if(!w) return;
  const left = w.quoted_wait_minutes!=null ? Math.max(0, Math.round((new Date(w.joined_at).getTime() + w.quoted_wait_minutes*60000 - Date.now())/60000)) : 15;
  const v = prompt(`${w.customer_name} için kalan bekleme süresi (dakika):${w.email ? '\n\nMüşteriye e-posta ile bildirilecek.' : ''}`, String(left));
  if(v === null) return;
  const mins = parseInt(v, 10);
  if(!(mins >= 0)){ alert('Geçerli bir dakika girin'); return; }
  const session = getSession();
  const { data, error } = await sb.rpc('update_waitlist_wait', { p_token: session.session_token, p_id: id, p_remaining_minutes: mins });
  if(error){ alert(error.message); return; }
  renderWaitlistContent(session, true);
  showToast('Bekleme süresi güncellendi' + (data && data.emailed ? ', müşteriye e-posta gönderildi ✓' : ' ✓'));
}
async function notifyWaitlistReady(id){
  const session = getSession();
  const { error } = await sb.rpc('notify_waitlist_ready', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  showToast('📱 "Masanız hazır" SMS\'i gönderildi');
}
async function changeWaitlistStatus(id, status){
  const session = getSession();
  const { error } = await sb.rpc('set_waitlist_status', { p_token: session.session_token, p_id: id, p_status: status });
  if(error){ alert(error.message); return; }
  renderWaitlistContent(session, true);
}

function setRvHistDate(v){ APP.rvHistDate = v; renderReservationHistory(); }
function setWlHistDate(v){ APP.wlHistDate = v; renderWaitlistHistory(); }
function closeSeatResvModal(){ removeEl('seatResvModalBg'); renderReservationsContent(getSession()); }
