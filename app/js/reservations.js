/* Rezervasyonlar & Bekleme Listesi - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= REZERVASYONLAR & BEKLEME LİSTESİ ================= */
async function renderReservationsView(main, session){
  // Bu görünüme her girişte önbellek sıfırlanır; sekmeler arası geçişte de
  // (bkz. setResvTab) her zaman yeniden çekiliyor - böylece başka bir
  // cihazdan/personelden gelen değişiklik (yeni rezervasyon, durum
  // güncellemesi) her zaman görünür.
  APP.reservationsCache = null;
  APP.waitlistCache = null;
  // Diğer ayar/rapor sayfaları gibi bölümler soldaki menüde (mobilde üstte kaydırılabilir şerit).
  const cur = APP.resvTab || 'reservations';
  const RESV_TABS = [['reservations','📅','Rezervasyonlar','Yaklaşan, yeni ve geçmiş'], ['waitlist','⏳','Bekleme Listesi','Sıra, tahmini süre, masa hazır']];
  main.innerHTML = `<h1>Rezervasyonlar ve Bekleme Listesi</h1>
    <div class="set-layout">
      <nav class="tabs settings-tabs set-nav" id="resvTabs">
        ${RESV_TABS.map(([k, ic, l, d], i) => `<div class="tab set-item ${cur===k?'active on':''}" data-tab="${k}" style="--i:${i};--sc:var(--c${i+1});" ${act('setResvTab', k)}><span class="set-ico">${ic}</span><span class="set-txt"><b>${l}</b><small>${d}</small></span></div>`).join('')}
      </nav>
      <div id="resvContent" class="set-content"></div>
    </div>`;
  await renderResvTabContent(session);
  setTimeout(() => prefetchOtherResvTab(session), 300);
}
function setResvTab(tab){
  if(tab !== APP.resvTab) pushScreen();
  setTimeout(applyNavBadges, 0);
  APP.resvTab = tab;
  document.querySelectorAll('#resvTabs .tab').forEach(t => { const on = t.dataset.tab===tab; t.classList.toggle('active', on); t.classList.toggle('on', on); });
  // Önbellek sekmeler arasında korunuyordu (yalnızca görünüme YENİDEN
  // girişte sıfırlanıyordu) - bu da aynı görünümü açık tutup sekme
  // değiştiren personelin, başka bir cihazdan/başka bir personelden gelen
  // güncellemeyi (yeni rezervasyon, durum değişikliği vb.) görememesine
  // yol açıyordu. Rezervasyon/bekleme listesi az sayıda satır içerdiği için
  // her sekme tıklamasında yeniden çekmenin maliyeti ihmal edilebilir.
  // Önce eldeki veriyle sekme anında çizilir, ardından güncel veri arka planda çekilip yeniden çizilir
  // (ağ yanıtı beklenirken eski sekme ekranda kalıyordu).
  const session = getSession();
  const cached = tab==='waitlist' ? APP.waitlistCache : APP.reservationsCache;
  if(cached) renderResvTabContent(session, false).then(() => { if(APP.resvTab===tab) renderResvTabContent(session, true, true); });
  else {
    // Veri yokken eski sekme ekranda kalmasın: yeni sekmenin iskeleti hemen gösterilir.
    const el = document.getElementById('resvContent'); if(el) el.innerHTML = resvSkeletonHtml(tab);
    renderResvTabContent(session, true, true);
  }
}
function resvSkeletonHtml(tab){
  const chip = '<div class="sk-chip"></div>';
  return `<div class="sk-wrap"><div class="sk-row">${chip.repeat(tab === 'waitlist' ? 5 : 4)}</div>
    <div class="sk-row"><div class="sk-panel"></div><div class="sk-panel"></div><div class="sk-panel"></div></div>
    <div class="sk-panel tall"></div><p class="muted" style="text-align:center;margin:10px 0 0;">${tab === 'waitlist' ? '⏳ Bekleme listesi yükleniyor…' : '📅 Rezervasyonlar yükleniyor…'}</p></div>`;
}
/* Diğer sekmenin verisi arka planda önceden çekilir; sekme değişince anında açılır. */
async function prefetchOtherResvTab(session){
  const other = (APP.resvTab || 'reservations') === 'waitlist' ? 'reservations' : 'waitlist';
  try{
    if(other === 'waitlist' && !APP.waitlistCache){
      const [w, l, e, t] = await Promise.all([sb.rpc('list_waitlist', { p_token: session.session_token }), sb.rpc('get_live_orders', { p_token: session.session_token }),
        sb.rpc('get_waitlist_estimate', { p_token: session.session_token }).catch(() => ({})), fetchWlToday()]);
      if(!w.error && !APP.waitlistCache){ APP.waitlistCache = w.data || []; APP.wlTodayCache = t; if(e && e.data) APP.wlEstimate = e.data; if(l && !l.error) APP.liveOrders = l.data || [];
        APP.wlSig = JSON.stringify([w.data, e && e.data, t]); }
    } else if(other === 'reservations' && !APP.reservationsCache){
      const [r, rc] = await Promise.all([sb.rpc('list_reservations', { p_token: session.session_token, p_date: null }), fetchResvRecent()]);
      if(!r.error && !APP.reservationsCache){ APP.reservationsCache = r.data || []; APP.rvRecentCache = rc; APP.resvSig = JSON.stringify([r.data, rc]); }
    }
  }catch(e){}
}
function renderResvTabContent(session, forceRefresh, quiet){
  return (APP.resvTab||'reservations')==='waitlist' ? renderWaitlistContent(session, forceRefresh, quiet) : renderReservationsContent(session, forceRefresh, quiet);
}
const RESV_STATUS_LABELS = { pending:'Bekliyor', confirmed:'Onaylandı', seated:'Oturdu', cancelled:'İptal', no_show:'Gelmedi' };
async function renderReservationsContent(session, forceRefresh, quiet){
  const el = document.getElementById('resvContent'); if(!el) return;
  if(!APP.config){ const { data } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token })); if(data) APP.config = data; }
  if(forceRefresh || !APP.reservationsCache){
    // Liste ve "son 7 gün" özeti birlikte çekilir; ekran tek seferde, eksiksiz çizilir.
    const req = Promise.all([sb.rpc('list_reservations', { p_token: session.session_token, p_date: null }), fetchResvRecent()]);
    const [{ data, error }, recent] = await (quiet ? req : withLoadingOverlay(req));
    // Yanıt gelene kadar başka sekmeye geçildiyse o sekmenin içeriği ezilmez.
    if((APP.resvTab||'reservations')!=='reservations' || APP.view!=='reservations') return;
    if(error){ if(!quiet || el.querySelector('.sk-wrap')) el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
    const sig = JSON.stringify([data, recent]);
    // Arka plan yenilemesinde veri değişmediyse ekran yeniden çizilmez (göz kırpma/animasyon tekrarı olmaz).
    if(quiet && sig === APP.resvSig && el.querySelector('.rvz-grid, .rv-day, .rv-empty')) return;
    APP.resvSig = sig; APP.reservationsCache = data || []; APP.rvRecentCache = recent;
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
        <div class="rv-meta"><span class="pchip">👥 ${r.party_size} kişi</span><span class="pchip">🪑 ${escapeHtml(r.table_name||'Masa seçilmedi')}</span>${r.source==='online' ? '<span class="pchip rv-online" title="Müşteri online rezervasyon sayfasından gönderdi">🌐 Online</span>' : ''}${r.created_by_name ? `<span class="pchip by-chip" title="Kaydı oluşturan">✍️ ${escapeHtml(r.created_by_name)}</span>` : (r.source==='online' ? '' : '')}${late ? '<span class="pchip warn">⏰ saati geçti</span>' : ''}${soon ? `<span class="pchip rv-soon">⏳ ${mins} dk kaldı</span>` : ''}</div>
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
    ], '', 'resv') + resvTodayVisual(todays, rows) + `${sheetHtml('rvSheet', '📅', 'Yeni Rezervasyon', rvFormHtml(), 'var(--c1)')}
  <div class="box" style="max-width:none;">
    <div class="fsheet-bar" style="margin:0 0 12px;"><h2 style="margin:0;">Yaklaşan Rezervasyonlar</h2><div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="ghost-btn" style="width:auto;margin:0;" ${act('openOnlineResvSheet')} title="Müşterilerin kendisi rezervasyon yapabileceği sayfa">🌐 Online Rezervasyon</button>${sheetBtnHtml('rvSheet','+ Yeni Rezervasyon')}</div></div>
    ${sheetHtml('onlineResvSheet', '🌐', 'Online Rezervasyon', '<div id="onlineResvBody"><p class="muted">Yükleniyor…</p></div>', 'var(--c2)')}<div data-cf-scope="resv">
    ${days.length ? days.map(k => `<div class="rv-day" data-cf-tags="${[...new Set(sorted.filter(r => dkey(r)===k).flatMap(r => rvTags(r).split(' ')))].join(' ')}"><div class="rv-day-h">${dayLabel(k)}<span class="muted">${sorted.filter(r => dkey(r)===k).length} rezervasyon</span></div>
      <div class="rv-list">${sorted.filter(r => dkey(r)===k).map(card).join('')}</div></div>`).join('')
      : '<div class="empty-state rv-empty"><div class="om-empty-ic">📅</div><b>Yaklaşan rezervasyon yok</b><p class="muted">Yukarıdaki formdan birkaç dokunuşla yeni rezervasyon ekleyebilirsiniz.</p></div>'}
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
          <div class="rv-meta"><span class="pchip">🕒 ${hm(r.reservation_time)}</span><span class="pchip">👥 ${r.party_size} kişi</span><span class="pchip">🪑 ${r.table_name ? escapeHtml(r.table_name) : '—'}</span>${r.created_by_name ? `<span class="pchip by-chip" title="Kaydı oluşturan">✍️ ${escapeHtml(r.created_by_name)}</span>` : (r.source==='online' ? '' : '')}${diffTxt}</div>
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
  if(!name || !timeVal){ alert(!name ? 'Müşteri adını yazın' : 'Gün ve saat seçin'); return; }
  const { error } = await sb.rpc('upsert_reservation', { p_token: session.session_token, p_id: null, p_customer_name: name, p_phone: phone||null, p_party_size: party, p_reservation_time: new Date(timeVal).toISOString(), p_table_id: tableId, p_notes: notes||null, p_email: email||null });
  if(error){ alert(error.message); return; }
  APP.rvForm = null;
  closeSheet('rvSheet');
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
  if(!await uiConfirm('Bu rezervasyonu silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_reservation', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  renderReservationsContent(session, true);
}
async function renderWaitlistContent(session, forceRefresh, quiet){
  const el = document.getElementById('resvContent'); if(!el) return;
  if(forceRefresh || !APP.waitlistCache){
    // Liste, canlı siparişler, sistem tahmini ve günlük özet birlikte çekilir; ekran tek seferde çizilir.
    const req = Promise.all([
      sb.rpc('list_waitlist', { p_token: session.session_token }),
      sb.rpc('get_live_orders', { p_token: session.session_token }),
      sb.rpc('get_waitlist_estimate', { p_token: session.session_token }).catch(() => ({})),
      fetchWlToday()
    ]);
    const [{ data, error }, live, estR, today] = await (quiet ? req : withLoadingOverlay(req));
    if(APP.resvTab!=='waitlist' || APP.view!=='reservations') return;
    if(error){ if(!quiet || el.querySelector('.sk-wrap')) el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
    const sig = JSON.stringify([data, estR && estR.data, today]);
    if(quiet && sig === APP.wlSig && el.querySelector('.wl-stats, .wl-note, .rv-empty, .rv-list')) return;
    APP.wlSig = sig; APP.waitlistCache = data || []; APP.wlTodayCache = today;
    if(live && !live.error) APP.liveOrders = live.data || [];
    if(estR && !estR.error && estR.data) APP.wlEstimate = estR.data;
  }
  if(APP.resvTab!=='waitlist' || APP.view!=='reservations') return;
  const est = APP.wlEstimate || null;
  const estFor = (i) => est && est.per_position ? est.per_position[i] : null;
  const estTxt = (m) => m == null ? '' : (m <= 0 ? 'hemen (boş masa var)' : '≈ ' + m + ' dk');
  const rows = APP.waitlistCache;
  const hasOrder = (w) => (APP.liveOrders||[]).some(o => o.kind==='waitlist' && o.waitlist_id===w.id);
  const avgWait = rows.length ? Math.round(rows.reduce((x, w) => x + (Date.now() - new Date(w.joined_at).getTime())/60000, 0) / rows.length) : 0;
  el.innerHTML = statChips([
      ['🧍', rows.length, 'Sırada bekleyen', 'var(--c1)', 'all'],
      ['👥', rows.reduce((x, w) => x + (Number(w.party_size)||0), 0), 'Toplam kişi', 'var(--c2)'],
      ['⏱', avgWait + ' dk', 'Ortalama bekleme', 'var(--c3)'],
      ['🍽️', rows.filter(hasOrder).length, 'Beklerken sipariş veren', 'var(--c4)', 'ordered'],
      ...(est ? [['🎯', est.next <= 0 ? 'Hemen' : '≈ ' + est.next + ' dk', 'Yeni gelen için tahmini', 'var(--c1)']] : [])
    ], '', 'wl') + wlVisual(rows, est) + wlTodayHtml(APP.wlTodayCache) + `<div class="box" style="max-width:none;">
    <div class="fsheet-bar" style="margin:0 0 12px;"><h2 style="margin:0;">Bekleme Listesi</h2>${sheetBtnHtml('wlSheet','+ Sıraya Ekle')}</div>
    ${sheetHtml('wlSheet', '🧍', 'Bekleme Listesine Ekle', `
      <div class="rvf-sec">
        <div class="rvf-t">👤 Müşteri</div>
        <input id="wlCustName" placeholder="Ad veya kayıtlı müşteri ara" autocomplete="off" ${actOn('input','tableCustSearch',['$value', 'wlCust'])}>
        <div id="wlCustSuggest"></div>
        <div class="rvf-2"><input id="wlCustPhone" placeholder="Telefon (SMS için)" inputmode="tel" autocomplete="off" ${actOn('input','tableCustSearch',['$value', 'wlCust'])}><input id="wlCustEmail" type="email" placeholder="E-posta (opsiyonel)" autocapitalize="none"></div>
      </div>
      <div class="rvf-sec">
        <div class="rvf-t">👥 Kaç kişi</div>
        <div class="rvf-chips">${[1,2,3,4,5,6,8].map(n => `<button type="button" class="rvf-chip rvf-n wl-pn ${n===2?'on':''}" ${act('setWlChip','wl_party',n,'$this')}>${n}</button>`).join('')}<input id="wl_party" class="rvf-pin" type="number" min="1" value="2"></div>
      </div>
      <div class="rvf-sec">
        <div class="rvf-t">⏱ Tahmini bekleme (dk)${est ? ` <span class="muted" style="font-weight:400;">· sistem tahmini: ${est.next <= 0 ? 'hemen' : '≈ ' + est.next + ' dk'}</span>` : ''}</div>
        <div class="rvf-chips">${[5,10,15,20,30,45].map(n => `<button type="button" class="rvf-chip rvf-n ${est && est.next===n?'on':''}" ${act('setWlChip','wl_wait',n,'$this')}>${n}</button>`).join('')}<input id="wl_wait" class="rvf-pin" type="number" min="0" placeholder="${est && est.next != null ? est.next : 15}" value="${est && est.next > 0 ? est.next : ''}"></div>
      </div>
      <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','wlSheet')}>Vazgeç</button><button ${act('addWaitlistEntry')}>🧍 Sıraya Ekle</button></div>`, 'var(--c2)')}
    ${rows.length ? `<div class="wl-list" data-cf-scope="wl">${rows.map((w, i) => `
      <div class="wl-card" data-cf-tags="${hasOrder(w) ? 'ordered' : 'noorder'}" data-badge-id="${w.id}" style="--i:${i};">
        <div class="wl-no">${i+1}</div>
        <div class="rv-who">${avatarHtml(w.customer_name)}<div><b>${escapeHtml(w.customer_name)}</b><small>${w.phone ? phoneHtml(w.phone) : ''}${w.email ? ' ' + emailHtml(w.email) : ''}</small></div></div>
        <div class="wl-info">
          <span class="pchip">👥 ${w.party_size} kişi</span>${w.created_by_name ? `<span class="pchip by-chip" title="Kaydı oluşturan">✍️ ${escapeHtml(w.created_by_name)}</span>` : (w.source==='online' ? '' : '')}
          <span class="pchip">🕐 ${new Date(w.joined_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} katıldı</span>
          ${w.quoted_wait_minutes!=null ? `<span class="pchip">🎯 ${new Date(new Date(w.joined_at).getTime() + w.quoted_wait_minutes*60000).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} tahmini</span>` : ''}
          ${estFor(i) != null ? `<span class="pchip" title="Boş masalar ve masaların ortalama kalış süresine göre">🤖 ${estTxt(estFor(i))}</span>` : ''}
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
      : `<div class="empty-state rv-empty"><div class="om-empty-ic">🧍</div><b>Sırada bekleyen yok</b><p class="muted">Masa boşalmasını bekleyen müşteriyi eklemek için <b>+ Sıraya Ekle</b>.</p></div>`}
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
          <div class="rv-meta"><span class="pchip">🕒 ${hm(r.joined_at)} katıldı</span><span class="pchip">👥 ${r.party_size} kişi</span><span class="pchip">🪑 ${r.table_name ? escapeHtml(r.table_name) : '—'}</span><span class="pchip">⏳ ${waited} dk${q!=null ? ' (tahmin ' + q + ')' : ''}</span>${r.created_by_name ? `<span class="pchip by-chip" title="Kaydı oluşturan">✍️ ${escapeHtml(r.created_by_name)}</span>` : (r.source==='online' ? '' : '')}${diffTxt}</div>
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
function setWlChip(id, n, btn){
  const inp = document.getElementById(id); if(inp) inp.value = n;
  if(btn && btn.parentNode) btn.parentNode.querySelectorAll('.rvf-chip').forEach(b => b.classList.toggle('on', b === btn));
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
  closeSheet('wlSheet');
  renderWaitlistContent(session, true);
  showToast(email ? 'Bekleme listesine eklendi, müşteriye e-posta gönderildi ✓' : 'Bekleme listesine eklendi ✓');
}
/* Kalan bekleme süresini güncelle: e-posta varsa müşteriye bildirilir; 15 ve 5 dk kala
   hatırlatmalar yeni süreye göre tekrar gönderilir (bkz. update_waitlist_wait). */
async function updateWaitlistWait(id){
  const w = (APP.waitlistCache||[]).find(x => x.id===id); if(!w) return;
  const left = w.quoted_wait_minutes!=null ? Math.max(0, Math.round((new Date(w.joined_at).getTime() + w.quoted_wait_minutes*60000 - Date.now())/60000)) : 15;
  const v = await uiPrompt(`${w.customer_name} için kalan bekleme süresi (dakika):${w.email ? '\n\nMüşteriye e-posta ile bildirilecek.' : ''}`, String(left));
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

/* ---- Yeni rezervasyon formu: adım adım kartlar, gün / saat / kişi çipleri ---- */
const RV_TIMES = ['12:00','13:00','14:00','18:00','19:00','19:30','20:00','20:30','21:00','22:00'];
function rvFormHtml(){
  const d0 = new Date(); d0.setHours(0,0,0,0);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(d0); d.setDate(d.getDate() + i); return d; });
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const dl = (d, i) => i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : d.toLocaleDateString('tr-TR', { weekday:'short' });
  APP.rvForm = APP.rvForm || { day: iso(days[0]), time: '', party: 2 };
  const f = APP.rvForm;
  return `<div class="rvf">
    <div class="rvf-head"><span class="rvf-ic">✨</span><div><b>Yeni Rezervasyon</b><small>Gün, saat ve kişi sayısını seçin; müşteri bilgisini yazın</small></div></div>
    <div class="rvf-grid">
      <div class="rvf-sec">
        <div class="rvf-t">👤 Müşteri</div>
        <input id="rvCustName" placeholder="Ad Soyad veya kayıtlı müşteri ara" autocomplete="off" ${actOn('input','tableCustSearch',['$value', 'rvCust'])} ${actOn('change','rvSummary',[])}>
        <div id="rvCustSuggest"></div>
        <div class="rvf-2"><input id="rvCustPhone" placeholder="📞 Telefon" inputmode="tel" autocomplete="off" ${actOn('input','tableCustSearch',['$value', 'rvCust'])}>
          <input id="rvCustEmail" type="email" placeholder="✉️ E-posta (hatırlatma)" autocapitalize="none"></div>
      </div>
      <div class="rvf-sec">
        <div class="rvf-t">📅 Ne zaman?</div>
        <div class="rvf-chips" id="rvDays">${days.map((d, i) => `<button type="button" class="rvf-chip rvf-day ${f.day===iso(d)?'on':''}" data-v="${iso(d)}" ${act('setRvDay', iso(d))}><b>${dl(d, i)}</b><small>${d.getDate()} ${d.toLocaleDateString('tr-TR',{month:'short'})}</small></button>`).join('')}</div>
        <div class="rvf-chips" id="rvTimes">${RV_TIMES.map(t => `<button type="button" class="rvf-chip ${f.time===t?'on':''}" data-v="${t}" ${act('setRvTime', t)}>${t}</button>`).join('')}</div>
        <div class="rvf-row"><span class="muted">veya</span><input id="rv_time" type="datetime-local" ${actOn('change','rvFromInput',['$value'])}></div>
      </div>
      <div class="rvf-sec">
        <div class="rvf-t">👥 Kaç kişi?</div>
        <div class="rvf-chips" id="rvParty">${[1,2,3,4,5,6,8,10].map(n => `<button type="button" class="rvf-chip rvf-n ${f.party===n?'on':''}" data-v="${n}" ${act('setRvParty', n)}>${n}</button>`).join('')}
          <input id="rv_party" type="number" min="1" value="${f.party}" class="rvf-pin" ${actOn('input','setRvParty',['$value'])}></div>
        <div class="rvf-t" style="margin-top:12px;">🪑 Masa ve not</div>
        <div class="rvf-2"><select id="rv_table" ${actOn('change','rvSummary',[])}><option value="">Masa seçilmedi</option>${tableOptionsHtml(null)}</select>
          <input id="rv_notes" placeholder="📝 Not (doğum günü, cam kenarı…)"></div>
      </div>
    </div>
    <div class="rvf-foot"><div id="rvSummary" class="rvf-sum"></div><button type="button" class="rvf-save" ${act('addReservation')}>📅 Rezervasyonu Kaydet</button></div>
  </div>`;
}
function rvApplyTime(){
  const f = APP.rvForm || {}; const inp = document.getElementById('rv_time');
  if(inp && f.day && f.time) inp.value = f.day + 'T' + f.time;
  rvSummary();
}
function rvMark(boxId, v){ document.querySelectorAll('#' + boxId + ' .rvf-chip').forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); }
function setRvDay(v){ APP.rvForm.day = v; rvMark('rvDays', v); rvApplyTime(); }
function setRvTime(v){ APP.rvForm.time = v; rvMark('rvTimes', v); rvApplyTime(); }
function setRvParty(v){ const n = parseInt(v, 10); if(!(n > 0)) return; APP.rvForm.party = n; rvMark('rvParty', n); const i = document.getElementById('rv_party'); if(i && String(i.value) !== String(n)) i.value = n; rvSummary(); }
function rvFromInput(v){ if(!v) return; const [d, t] = v.split('T'); APP.rvForm.day = d; APP.rvForm.time = (t || '').slice(0, 5); rvMark('rvDays', d); rvMark('rvTimes', APP.rvForm.time); rvSummary(); }
function rvSummary(){
  const el = document.getElementById('rvSummary'); if(!el) return;
  const f = APP.rvForm || {}, name = (document.getElementById('rvCustName') || {}).value || '';
  const tSel = document.getElementById('rv_table'), tName = tSel && tSel.value ? tSel.options[tSel.selectedIndex].text : '';
  const when = f.day && f.time ? new Date(f.day + 'T' + f.time).toLocaleString('tr-TR', { weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' }) : '';
  el.innerHTML = [name.trim() ? '👤 <b>' + escapeHtml(name.trim()) + '</b>' : '', when ? '📅 ' + escapeHtml(when) : '<span class="muted">Saat seçin</span>', '👥 ' + (f.party || 2) + ' kişi', tName ? '🪑 ' + escapeHtml(tName) : ''].filter(Boolean).join(' · ');
}

/* Online rezervasyon: müşteri /rezervasyon/?r=KOD sayfasından istek gönderir; istek
   "onay bekliyor" olarak listeye ve menü rozetine düşer. */
async function openOnlineResvSheet(){ openSheet('onlineResvSheet'); await renderOnlineResvBody(); }
async function renderOnlineResvBody(){
  const body = document.getElementById('onlineResvBody'); if(!body) return;
  const { data, error } = await sb.rpc('get_online_reservation_settings', { p_token: getSession().session_token });
  if(error || !data){ body.innerHTML = '<p class="muted">Yüklenemedi' + (error ? ': ' + escapeHtml(error.message) : '') + '</p>'; return; }
  const url = window.location.origin + '/rezervasyon/?r=' + encodeURIComponent(data.code || '');
  const qr = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(url);
  body.innerHTML = `<p class="muted" style="text-align:left;margin:0 0 12px;font-size:13px;">Müşterileriniz bu sayfadan gün, saat ve kişi sayısı seçip rezervasyon isteği gönderir. İstekler <b>Onay bekliyor</b> olarak listeye ve menü rozetine düşer; siz onaylarsınız.</p>
    <label class="olr-toggle ${data.enabled ? 'on' : ''}"><input type="checkbox" ${data.enabled ? 'checked' : ''} ${actOn('change','toggleOnlineResv',['$checked'])}><span class="olr-sw"></span><b>${data.enabled ? 'Online rezervasyon açık' : 'Online rezervasyon kapalı'}</b></label>
    ${data.enabled ? `<div class="olr-link"><img src="${qr}" alt="QR"><div><p class="muted" style="margin:0 0 6px;font-size:12px;">Instagram bio'nuza, Google İşletme profilinize, web sitenize ya da masa standına koyun.</p>
      <p style="font-size:13px;overflow-wrap:anywhere;margin:0 0 10px;">${escapeHtml(url)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" style="width:auto;margin:0;" ${act('copyText', url, 'Link kopyalandı ✓')}>🔗 Linki Kopyala</button><a class="ghost-btn" style="width:auto;margin:0;display:inline-flex;align-items:center;padding:10px 14px;border-radius:12px;text-decoration:none;" href="${url}" target="_blank" rel="noopener">👁 Sayfayı Aç</a></div></div></div>` : ''}`;
}
async function toggleOnlineResv(on){
  const { error } = await sb.rpc('set_online_reservations', { p_token: getSession().session_token, p_enabled: on });
  if(error){ alert(error.message); }
  else showToast(on ? 'Online rezervasyon açıldı ✓' : 'Online rezervasyon kapatıldı');
  renderOnlineResvBody();
}

/* Rezervasyon ekranı (operasyon): bugün hangi saatte kaç kişi gelecek, durumlar. Geçmiş analiz Finansal Analiz'de. */
function resvTodayVisual(todays, rows){
  const now = new Date(), act_ = (r) => !['cancelled', 'no_show'].includes(r.status);
  // Önümüzdeki 7 gün: günlük kişi sayısı (iptal/gelmedi hariç)
  const days = []; for(let i = 0; i < 7; i++){ const d = new Date(now); d.setDate(d.getDate() + i); days.push(d); }
  const key = (d) => d.toLocaleDateString('sv-SE');
  const per = days.map(d => { const rs = rows.filter(r => act_(r) && key(new Date(r.reservation_time)) === key(d)); return { d, n: rs.length, p: rs.reduce((x, r) => x + (Number(r.party_size) || 0), 0) }; });
  if(!per.some(x => x.n) && !todays.length){ const rc = resvRecentHtml(APP.rvRecentCache); return rc ? `<div class="rvz-grid">${rc}</div>` : ''; }
  const mxP = Math.max(1, ...per.map(x => x.p));
  const week = `<div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🗓️</i>Önümüzdeki 7 Gün</h3>
    <div class="rvx-bars">${per.map((x, i) => `<div class="rvx-b ${i === 0 ? 'now' : ''}" style="--i:${i};" title="${x.n} rezervasyon · ${x.p} kişi"><span>${x.p || ''}</span><i style="height:${x.p ? Math.max(8, x.p / mxP * 100) : 2}%;"></i><small>${i === 0 ? 'Bugün' : x.d.toLocaleDateString('tr-TR', { weekday: 'short' })}</small></div>`).join('')}</div>
    <p class="fs-note">Çubuklar beklenen kişi sayısı · toplam ${per.reduce((x, y) => x + y.n, 0)} rezervasyon, ${per.reduce((x, y) => x + y.p, 0)} kişi</p></div>`;
  let today = '';
  if(todays.length){
    const hrs = {}; todays.filter(act_).forEach(r => { const h = new Date(r.reservation_time).getHours(); hrs[h] = (hrs[h] || 0) + (Number(r.party_size) || 0); });
    const ks = Object.keys(hrs).map(Number); const nowH = now.getHours();
    const lo = ks.length ? Math.min(...ks) : nowH, hi = ks.length ? Math.max(...ks) : nowH;
    const list = []; for(let h = lo; h <= hi; h++) list.push({ h, v: hrs[h] || 0 }); const mx = Math.max(1, ...list.map(x => x.v));
    const st = (k) => todays.filter(r => r.status === k).length;
    const segs = [{ label: '✓ Onaylı', value: st('confirmed'), color: '#22c55e' }, { label: '⏳ Bekliyor', value: st('pending'), color: '#f59e0b' }, { label: '🪑 Oturdu', value: st('seated'), color: '#6366f1' }, { label: '✕ Gelmedi/İptal', value: st('no_show') + st('cancelled'), color: '#ef4444' }].filter(x => x.value);
    today = `<div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>🕒</i>Bugün Saat Saat Gelecek Kişi</h3>
        <div class="rvx-bars">${list.map((x, i) => `<div class="rvx-b ${x.h === nowH ? 'now' : ''} ${x.h < nowH ? 'past' : ''}" style="--i:${i};"><span>${x.v || ''}</span><i style="height:${x.v ? Math.max(8, x.v / mx * 100) : 2}%;"></i><small>${String(x.h).padStart(2, '0')}</small></div>`).join('')}</div></div>
      <div class="fs-panel pa-sec" style="--t:var(--c4);"><h3><i>🍩</i>Bugünün Durumu</h3>${segs.length ? svgDonut(segs, { center: String(todays.length), sub: 'rezervasyon' }) : '<p class="muted">—</p>'}</div>`;
  } else {
    const nxt = rows.filter(r => act_(r) && new Date(r.reservation_time) >= now).sort((a, b) => new Date(a.reservation_time) - new Date(b.reservation_time)).slice(0, 4);
    today = `<div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>⏭️</i>Sıradaki Rezervasyonlar</h3>
      ${nxt.length ? `<div class="rvz-next">${nxt.map((r, i) => { const t = new Date(r.reservation_time); return `<div class="rvz-n" style="--i:${i};"><div class="rvz-t"><b>${t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</b><small>${t.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}</small></div><div><b>${escapeHtml(r.customer_name || '')}</b><small>👥 ${r.party_size || 1} kişi${r.status === 'pending' ? ' · ⏳ onay bekliyor' : ''}</small></div></div>`; }).join('')}</div>` : '<p class="muted">Yaklaşan rezervasyon yok.</p>'}
      <p class="fs-note">Bugün rezervasyon yok.</p></div>`;
  }
  return `<div class="rvz-grid">${today}${week}${resvRecentHtml(APP.rvRecentCache)}</div>`;
}
/* Son 7 günün sonuçları (oturdu / gelmedi / iptal). Yetki yoksa (reservation_report hata verir) gösterilmez. */
async function fetchResvRecent(){
  const to = new Date().toLocaleDateString('sv-SE'), from = new Date(Date.now() - 6 * 864e5).toLocaleDateString('sv-SE');
  try{ const { data, error } = await sb.rpc('reservation_report', { p_token: getSession().session_token, p_date: from, p_date_to: to }); return error ? null : data; }catch(e){ return null; }
}
function resvRecentHtml(d){
  if(!d || !d.total) return '';
  const st = d.by_status || {}, se = Number(st.seated || 0), ns = Number(st.no_show || 0), cx = Number(st.cancelled || 0), cl = se + ns + cx;
  const ring = (v, l, c, i) => { const p = cl ? Math.round(v / cl * 100) : 0; return `<div class="gx-ring" style="--p:${p};--c:${c};--i:${i};"><div class="gx-ring-c"><b style="margin:0;">%${p}</b></div><small>${l}</small><em>${v}</em></div>`; };
  return `<div class="fs-panel pa-sec" style="--t:#22c55e;"><h3><i>📈</i>Son 7 Gün Sonuçları</h3>
    <div class="gx-rings">${ring(se, 'Geldi', '#22c55e', 0)}${ring(ns, 'Gelmedi', '#ef4444', 1)}${ring(cx, 'İptal', '#94a3b8', 2)}</div>
    <p class="fs-note">${d.total} rezervasyon · ${d.people} kişi${ns ? ' · gelmeyenler için 2 saat kala hatırlatma SMS\'i açık olsun' : ''}</p></div>`;
}
/* Bekleme listesi (operasyon): kim ne kadar süredir bekliyor, tahmini süreye göre renkli. */
function wlVisual(rows, est){
  if(!rows.length) return '';
  const now = Date.now(), list = rows.map((w, i) => ({ w, m: Math.round((now - new Date(w.joined_at).getTime()) / 60000), e: est && est.per_position ? est.per_position[i] : null }));
  const mx = Math.max(15, ...list.map(x => x.m));
  return `<div class="fs-panel pa-sec" style="--t:var(--c3);margin:12px 0;"><h3><i>⏱</i>Bekleme Süreleri</h3>
    <div class="gx-hbars">${list.map((x, i) => { const c = x.m >= 30 ? '#ef4444' : x.m >= 15 ? '#f59e0b' : '#22c55e';
      return `<div class="gx-hb" style="--i:${i};--c:${c};"><div class="gx-hb-l"><span>${i + 1}. ${escapeHtml(x.w.customer_name || '')} · 👥 ${x.w.party_size || 1}</span><b>⏳ ${x.m} dk bekliyor${x.e != null ? ` <small class="muted">· 🪑 masa ${x.e <= 0 ? 'hazır' : '≈ ' + x.e + ' dk sonra'}</small>` : ''}</b></div><div class="gx-hb-t"><i style="width:${Math.max(4, x.m / mx * 100)}%;"></i></div></div>`; }).join('')}</div>
    <p class="fs-note">🟢 15 dk altı · 🟠 15–30 dk · 🔴 30 dk üstü</p></div>`;
}

/* Bekleme listesi istatistikleri (ekranda bugün, Finansal Analiz'de seçili dönem). */
function wlStatsHtml(d, opt){
  opt = opt || {};
  if(!d || !d.total) return opt.empty ? `<div class="fs-panel pa-sec" style="--t:var(--c3);margin:12px 0;"><h3><i>📋</i>${opt.title || 'Bugün'}</h3><p class="muted">${opt.empty}</p></div>` : '';
  const done = Number(d.seated) + Number(d.left), leftP = done ? Math.round(Number(d.left) / done * 100) : 0;
  const aw = Number(d.avg_wait || 0), aq = Number(d.avg_quoted || 0);
  const awCol = aw >= 30 ? '#ef4444' : aw >= 15 ? '#f59e0b' : '#22c55e';
  const fitP = Number(d.with_quote) ? Math.round(Number(d.on_time) / Number(d.with_quote) * 100) : null;
  const hrs = d.by_hour || [], mx = Math.max(1, ...hrs.map(x => Number(x.n)));
  const PG = { 1: '1–2 kişi', 2: '3–4 kişi', 3: '5–6 kişi', 4: '7+ kişi' }, bp = d.by_party || [], mxP = Math.max(1, ...bp.map(x => Number(x.aw || 0)));
  return `<div class="rvz-grid wl-stats">
    <div class="fs-panel pa-sec" style="--t:${awCol};"><h3><i>⏱</i>Ortalama Bekleme <small class="muted">· ${opt.title || 'bugün'}</small></h3>
      <div class="lx-gauge">${svgGauge(Math.min(100, Math.round(aw / 60 * 100)), awCol, aw + ' dk', 'en uzun ' + (d.max_wait || 0) + ' dk')}</div>
      <p class="fs-note">${aq ? `Söylenen ortalama ${aq} dk${fitP != null ? ` · tahmine uyum <b>%${fitP}</b>` : ''}` : 'Tahmini süre girilmemiş.'}</p></div>
    <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🍩</i>Sonuçlar</h3>${svgDonut([{ label: '🪑 Oturtuldu', value: Number(d.seated), color: '#22c55e' }, { label: '🚶 Ayrıldı', value: Number(d.left), color: '#ef4444' }, { label: '⏳ Bekliyor', value: Number(d.waiting), color: '#f59e0b' }].filter(x => x.value), { center: String(d.total), sub: 'grup · ' + d.people + ' kişi' })}
      <p class="fs-note">Beklemeden ayrılma oranı: <b style="color:${leftP >= 20 ? '#ef4444' : 'inherit'}">%${leftP}</b></p></div>
    <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>🕒</i>Saatlere Göre Gelen</h3>
      ${hrs.length ? `<div class="rvx-bars">${hrs.map((x, i) => `<div class="rvx-b" style="--i:${i};" title="${x.n} grup · ${x.p} kişi${x.aw != null ? ' · ort. ' + x.aw + ' dk bekleme' : ''}"><span>${x.n}</span><i style="height:${Math.max(8, Number(x.n) / mx * 100)}%;"></i><small>${String(x.h).padStart(2, '0')}</small></div>`).join('')}</div>` : '<p class="muted">Veri yok.</p>'}</div>
    ${opt.analytics && bp.length ? `<div class="fs-panel pa-sec" style="--t:#a78bfa;"><h3><i>👥</i>Grup Büyüklüğüne Göre Bekleme</h3><div class="gx-hbars">${bp.map((x, i) => `<div class="gx-hb" style="--i:${i};--c:#a78bfa;"><div class="gx-hb-l"><span>${PG[x.g]} · ${x.n} grup</span><b>${x.aw != null ? x.aw + ' dk' : '—'}</b></div><div class="gx-hb-t"><i style="width:${x.aw ? Math.max(4, Number(x.aw) / mxP * 100) : 0}%;"></i></div></div>`).join('')}</div>
      <p class="fs-note">Kalabalık gruplar daha uzun bekliyorsa büyük masaları ayırmayı düşünün.</p></div>` : ''}
  </div>`;
}
async function fetchWlToday(){
  const tok = getSession().session_token, today = new Date().toLocaleDateString('sv-SE');
  try{
    let { data } = await sb.rpc('waitlist_report', { p_token: tok, p_date: today, p_date_to: today });
    let title = 'bugün', days = 0;
    // Bugün kayıt yoksa ekran boş kalmasın: son 7, o da yoksa son 30 günün özeti.
    for(const n of [7, 30]){
      if(data && data.total) break;
      const from = new Date(Date.now() - (n - 1) * 864e5).toLocaleDateString('sv-SE');
      ({ data } = await sb.rpc('waitlist_report', { p_token: tok, p_date: from, p_date_to: today }));
      title = 'son ' + n + ' gün'; days = n;
    }
    return { data, title, days };
  }catch(e){ return null; }
}
function wlTodayHtml(t){
  if(!t) return '';
  const note = t.days ? `<p class="wl-note">📋 Bugün henüz bekleme listesine kimse eklenmedi — son ${t.days} günün özeti gösteriliyor.</p>` : '';
  return note + wlStatsHtml(t.data, { title: t.title, empty: 'Son 30 günde bekleme listesi kaydı yok. Sıraya eklenenler, oturtulanlar ve bekleme süreleri burada görünecek.' });
}
