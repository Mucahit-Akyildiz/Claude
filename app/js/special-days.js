/* ---- 🎉 Özel Günler ve grup rezervasyonları ----
   Özel gün: tek tarih (şirket etkinliği) ya da her hafta tekrar (Perşembe grup indirimi); saat aralığı,
   en az kişi ve indirim %'si. Uyan rezervasyon sunucuda kendiliğinden işaretlenir (special_day_id, discount_pct);
   oturunca hesapta indirim otomatik uygulanır. Grup: kurum adı, kadın/erkek/çocuk, katılımcı listesi
   (Müşteriler'e kaydedilir; yeni açılanlar kampanya onaysız). Sunucu: list_special_days, upsert_special_day,
   archive_special_day, save_reservation_group, list_reservation_participants, set_participant_arrived. */
const SD_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
async function loadSpecialDays(force){
  if(APP.specialDays && !force) return APP.specialDays;
  const { data } = await sb.rpc('list_special_days', { p_token: getSession().session_token });
  APP.specialDays = data || [];
  return APP.specialDays;
}
// Bir güne (YYYY-MM-DD) düşen özel günler.
function specialDaysOn(dkey){
  const d = new Date(dkey + 'T12:00'), wd = ((d.getDay() + 6) % 7) + 1;
  return (APP.specialDays || []).filter(s => s.on_date ? s.on_date === dkey : (s.weekday === wd && (!s.date_from || dkey >= s.date_from) && (!s.date_to || dkey <= s.date_to)));
}
function sdWhen(s){
  const t = s.time_from || s.time_to ? ' · ' + (s.time_from ? s.time_from.slice(0, 5) : '') + '–' + (s.time_to ? s.time_to.slice(0, 5) : '') : '';
  return (s.on_date ? new Date(s.on_date + 'T12:00').toLocaleDateString('tr-TR', { day:'numeric', month:'long', weekday:'long' }) : 'Her ' + SD_DAYS[(s.weekday || 1) - 1]) + t;
}
function sdRule(s){
  return [s.min_party ? s.min_party + '+ kişi' : '', Number(s.discount_pct) > 0 ? '%' + Number(s.discount_pct) + ' indirim' : ''].filter(Boolean).join(' · ');
}
function sdBooked(dkey){ return (APP.reservationsCache || []).filter(r => { const d = new Date(r.reservation_time); return ['pending','confirmed','seated'].includes(r.status) && (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')) === dkey; }).reduce((x, r) => x + (Number(r.party_size) || 0), 0); }
function sdZoneNames(s){ const zs = (APP.config && APP.config.zones) || []; return (s.zone_ids || []).map(id => (zs.find(z => z.id === id) || {}).name).filter(Boolean); }
function sdBadgeHtml(s, dkey){
  const cap = s.capacity && dkey ? sdBooked(dkey) + '/' + s.capacity + ' kişi' : '', zn = sdZoneNames(s);
  return `<span class="sd-badge" style="--sd:${escapeAttr(s.color || '#a855f7')}" title="${escapeAttr(sdWhen(s) + (s.note ? ' · ' + s.note : ''))}">🎉 ${escapeHtml(s.name)}${sdRule(s) ? ' · ' + escapeHtml(sdRule(s)) : ''}${cap ? ' · 👥 ' + cap : ''}${zn.length ? ' · 🔒 ' + escapeHtml(zn.join(', ')) : ''}</span>`;
}
// Kontenjan uyarısı (personel rezervasyon eklerken).
function sdCapacityWarning(dt, party){
  const dkey = dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
  const s = specialDaysOn(dkey).find(x => x.capacity && sdBooked(dkey) + (Number(party) || 0) > x.capacity);
  return s ? '"' + s.name + '" günü kontenjanı ' + s.capacity + ' kişi; şu an ' + sdBooked(dkey) + ' kişi kayıtlı. Bu rezervasyonla aşılıyor.' : '';
}
// Bölüm ayırma uyarısı: masa, o gün başka bir özel güne ayrılmış bölümdeyse.
function sdZoneWarning(r, tableId){
  const z = ((APP.config && APP.config.zones) || []).find(z => (z.tables || []).some(t => t.id === tableId)); if(!z) return '';
  const d = new Date(r.reservation_time), dkey = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const s = specialDaysOn(dkey).find(x => (x.zone_ids || []).includes(z.id) && x.id !== r.special_day_id);
  return s ? '"' + z.name + '" bölümü bu gün "' + s.name + '" için ayrılmış.' : '';
}

async function openSpecialDays(){
  await loadSpecialDays(true);
  removeEl('sdBg');
  const bg = document.createElement('div'); bg.id = 'sdBg'; bg.className = 'modal-bg';
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  bg.innerHTML = `<div class="box sd-box"><div class="u-row-sb"><h2 class="u-m0">🎉 Özel Günler</h2><span class="u-xclose" ${act('removeEl','sdBg')}>✕</span></div>
    <p class="muted u-fs13" style="margin:6px 0 12px;">Her hafta tekrar eden indirim günleri ya da tek seferlik etkinlikler. Uyan rezervasyonlar kendiliğinden işaretlenir, indirim hesapta otomatik uygulanır.</p>
    <div id="sdList"></div><button type="button" style="margin-top:10px;" ${act('editSpecialDay', '')}>➕ Yeni özel gün</button></div>`;
  document.body.appendChild(bg);
  drawSpecialDays();
}
function drawSpecialDays(){
  const el = document.getElementById('sdList'); if(!el) return;
  const rows = APP.specialDays || [];
  el.innerHTML = rows.length ? rows.map(s => `<div class="sd-row" style="--sd:${escapeAttr(s.color || '#a855f7')}">
      <div class="sd-main"><b>🎉 ${escapeHtml(s.name)}</b><small>${escapeHtml(sdWhen(s))}${sdRule(s) ? ' · ' + escapeHtml(sdRule(s)) : ''}${s.capacity ? ' · 👥 en fazla ' + s.capacity + ' kişi' : ''}${sdZoneNames(s).length ? ' · 🔒 ' + escapeHtml(sdZoneNames(s).join(', ')) : ''}${s.show_online === false ? ' · 🙈 online sayfada gizli' : ''}${s.upcoming ? ' · ' + s.upcoming + ' yaklaşan rezervasyon' : ''}</small>${s.note ? `<small class="muted">📝 ${escapeHtml(s.note)}</small>` : ''}
        ${s.stats && Number(s.stats.resv) > 0 ? `<small class="sd-stats">📊 Son 90 gün: ${s.stats.resv} grup · ${s.stats.guests} kişi · ciro ${money(s.stats.revenue)} · indirim ${money(s.stats.discount)}</small>` : ''}</div>
      <button type="button" class="pc-btn" ${act('editSpecialDay', s.id)}>✏️</button><button type="button" class="pc-btn rv-del" title="Kaldır" ${act('removeSpecialDay', s.id)}>🗑</button></div>`).join('')
    : '<div class="empty-state"><div style="font-size:34px;">🎉</div><p class="muted">Henüz özel gün yok. Örn. "Her Perşembe 10+ kişiye %15" ya da "25 Kasım ABC Şirketi etkinliği".</p></div>';
}
function editSpecialDay(id){
  const s = (APP.specialDays || []).find(x => x.id === id) || {};
  const once = !!s.on_date || (!s.id ? false : !s.weekday);
  removeEl('sdEditBg');
  const bg = document.createElement('div'); bg.id = 'sdEditBg'; bg.className = 'modal-bg'; bg.style.zIndex = 4300;
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  bg.innerHTML = `<div class="box sd-box"><div class="u-row-sb"><h2 class="u-m0">${s.id ? '✏️ Özel günü düzenle' : '➕ Yeni özel gün'}</h2><span class="u-xclose" ${act('removeEl','sdEditBg')}>✕</span></div>
    <div class="sd-form">
      <label>Ad</label><input id="sd_name" maxlength="80" value="${escapeAttr(s.name || '')}" placeholder="Perşembe Grup İndirimi / ABC Şirketi Etkinliği">
      <label>Ne zaman</label>
      <div class="seg sd-kind"><button type="button" class="${once ? '' : 'on'}" data-k="week" ${act('sdKind','week')}>🔁 Her hafta</button><button type="button" class="${once ? 'on' : ''}" data-k="once" ${act('sdKind','once')}>📅 Tek gün</button></div>
      <div id="sdWeek" ${once ? 'hidden' : ''}><select id="sd_weekday">${SD_DAYS.map((d, i) => `<option value="${i + 1}" ${s.weekday === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select>
        <div class="sd-2"><div><label>Başlangıç (isteğe bağlı)</label><input type="date" id="sd_from" value="${escapeAttr(s.date_from || '')}"></div><div><label>Bitiş (isteğe bağlı)</label><input type="date" id="sd_to" value="${escapeAttr(s.date_to || '')}"></div></div></div>
      <div id="sdOnce" ${once ? '' : 'hidden'}><input type="date" id="sd_date" value="${escapeAttr(s.on_date || '')}"></div>
      <div class="sd-2"><div><label>Saat başı (isteğe bağlı)</label><input type="time" id="sd_tf" value="${escapeAttr((s.time_from || '').slice(0, 5))}"></div><div><label>Saat sonu</label><input type="time" id="sd_tt" value="${escapeAttr((s.time_to || '').slice(0, 5))}"></div></div>
      <div class="sd-2"><div><label>En az kişi</label><input type="number" id="sd_min" min="1" inputmode="numeric" value="${escapeAttr(s.min_party || '')}" placeholder="örn. 10"></div><div><label>İndirim %</label><input type="number" id="sd_pct" min="0" max="100" step="0.5" inputmode="decimal" value="${escapeAttr(s.discount_pct != null ? String(Number(s.discount_pct)) : '')}" placeholder="örn. 15"></div></div>
      <div class="sd-2"><div><label>Kontenjan (kişi, isteğe bağlı)</label><input type="number" id="sd_cap" min="1" inputmode="numeric" value="${escapeAttr(s.capacity || '')}" placeholder="örn. 60"></div>
        <div><label>Online sayfada</label><label class="sd-chk"><input type="checkbox" id="sd_online" ${s.show_online === false ? '' : 'checked'}> Müşterilere göster</label></div></div>
      <label>Ayrılacak bölüm (isteğe bağlı)</label><div class="sd-zones">${((APP.config && APP.config.zones) || []).map(z => `<label class="sd-chk"><input type="checkbox" class="sd-z" value="${z.id}" ${(s.zone_ids || []).includes(z.id) ? 'checked' : ''}> ${escapeHtml(z.name)}</label>`).join('')}</div>
      <label>Not (isteğe bağlı)</label><input id="sd_note" maxlength="300" value="${escapeAttr(s.note || '')}" placeholder="örn. Set menü, Hanımlar Bölümü ayrılacak">
      <label>Renk</label><div class="sd-colors">${['#a855f7','#f59e0b','#22c55e','#3b82f6','#ef4444','#ec4899'].map(c => `<button type="button" class="sd-c ${ (s.color || '#a855f7') === c ? 'on' : ''}" data-c="${c}" style="background:${c}" ${act('sdColor', c)}></button>`).join('')}</div>
    </div>
    <div class="oa-edit-acts"><button type="button" class="ghost-btn" ${act('removeEl','sdEditBg')}>Vazgeç</button><button type="button" ${act('saveSpecialDay', s.id || '')}>💾 Kaydet</button></div></div>`;
  document.body.appendChild(bg);
  APP.sdColor = s.color || '#a855f7';
}
function sdKind(k){ document.querySelectorAll('.sd-kind button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); document.getElementById('sdWeek').hidden = k !== 'week'; document.getElementById('sdOnce').hidden = k !== 'once'; }
function sdColor(c){ APP.sdColor = c; document.querySelectorAll('.sd-c').forEach(b => b.classList.toggle('on', b.dataset.c === c)); }
async function saveSpecialDay(id){
  const v = (k) => ((document.getElementById(k) || {}).value || '').trim();
  const once = !document.getElementById('sdOnce').hidden;
  if(once && !v('sd_date')){ uiAlert('Tarih seçin'); return; }
  const data = { name: v('sd_name'), color: APP.sdColor, on_date: once ? v('sd_date') : '', weekday: once ? '' : v('sd_weekday'), date_from: once ? '' : v('sd_from'), date_to: once ? '' : v('sd_to'),
    time_from: v('sd_tf'), time_to: v('sd_tt'), min_party: v('sd_min'), discount_pct: v('sd_pct'), note: v('sd_note'),
    capacity: v('sd_cap'), show_online: !!(document.getElementById('sd_online') || {}).checked, zone_ids: [...document.querySelectorAll('.sd-z:checked')].map(x => x.value) };
  const { error } = await withLoadingOverlay(sb.rpc('upsert_special_day', { p_token: getSession().session_token, p_id: id || null, p_data: data }));
  if(error){ uiAlert(error.message); return; }
  removeEl('sdEditBg'); showToast('🎉 Özel gün kaydedildi · uyan rezervasyonlar işaretlendi');
  await loadSpecialDays(true); drawSpecialDays();
  if(APP.view === 'reservations' && typeof renderReservationsContent === 'function') renderReservationsContent(getSession(), true, true);
}
async function removeSpecialDay(id){
  if(!await uiConfirm('Bu özel gün kaldırılsın mı? Yaklaşan rezervasyonlardaki işareti ve indirimi de kalkar.', { danger: true })) return;
  const { error } = await withLoadingOverlay(sb.rpc('archive_special_day', { p_token: getSession().session_token, p_id: id }));
  if(error){ uiAlert(error.message); return; }
  await loadSpecialDays(true); drawSpecialDays();
  if(APP.view === 'reservations' && typeof renderReservationsContent === 'function') renderReservationsContent(getSession(), true, true);
}

/* ---- Grup bilgisi ve katılımcılar ---- */
async function openResvGroup(id){
  const r = (APP.reservationsCache || []).find(x => x.id === id); if(!r) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('list_reservation_participants', { p_token: getSession().session_token, p_id: id }));
  if(error){ uiAlert(error.message); return; }
  APP.rgParts = (data || []).map(p => ({ ...p }));
  APP.rgDepM = r.deposit_method || 'cash';
  APP.rgId = id;
  removeEl('rgBg');
  const bg = document.createElement('div'); bg.id = 'rgBg'; bg.className = 'modal-bg';
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  const num = (k, l, v) => `<div><label>${l}</label><input type="number" id="${k}" min="0" inputmode="numeric" value="${v != null ? escapeAttr(String(v)) : ''}"></div>`;
  bg.innerHTML = `<div class="box sd-box rg-box"><div class="u-row-sb"><h2 class="u-m0">👥 Grup · ${escapeHtml(r.customer_name)}</h2><span class="u-xclose" ${act('removeEl','rgBg')}>✕</span></div>
    <p class="muted u-fs13" style="margin:4px 0 10px;">${new Date(r.reservation_time).toLocaleString('tr-TR', { day:'numeric', month:'long', weekday:'long', hour:'2-digit', minute:'2-digit' })} · ${r.party_size} kişi${r.special_name ? ' · 🎉 ' + escapeHtml(r.special_name) + (Number(r.discount_pct) > 0 ? ' %' + Number(r.discount_pct) : '') : ''}</p>
    <div class="sd-form"><label>Kurum / grup adı</label><input id="rg_name" maxlength="100" value="${escapeAttr(r.group_name || '')}" placeholder="örn. ABC Şirketi">
      <div class="sd-3">${num('rg_w','👩 Kadın', r.women)}${num('rg_m','👨 Erkek', r.men)}${num('rg_c','🧒 Çocuk', r.children)}</div></div>
    <div class="rg-dep"><b>💰 Kapora</b><input type="number" id="rg_dep" min="0" step="0.01" inputmode="decimal" placeholder="Tutar" value="${Number(r.deposit_amount) > 0 ? escapeAttr(String(Number(r.deposit_amount))) : ''}">
      <div class="seg">${[['cash','💵 Nakit'],['card','💳 Kart'],['transfer','🏦 Havale']].map(([k, l]) => `<button type="button" class="rg-dm ${ (r.deposit_method || 'cash') === k ? 'on' : ''}" data-m="${k}" ${act('rgDepMethod', k)}>${l}</button>`).join('')}</div>
      ${r.deposit_at ? `<small class="muted">${new Date(r.deposit_at).toLocaleDateString('tr-TR')} tarihinde alındı</small>` : ''}</div>
    <div class="rg-head"><b>Katılımcılar <span class="muted" id="rgN"></span></b><span><button type="button" class="ghost-btn" ${act('rgAddRow')}>➕ Kişi ekle</button><button type="button" class="ghost-btn" ${act('rgImport')}>⬆️ Excel'den yükle</button><button type="button" class="xl-link" ${act('rgTemplate')}>📄 Şablon</button></span></div>
    <div id="rgList" class="rg-list"></div>
    <p class="muted u-fs12">Telefonu olan katılımcılar Müşteriler'e kaydedilir (zaten kayıtlıysa eşleşir). Yeni kaydedilenlere kampanya mesajı gitmez; yalnız bilgilendirme gönderilebilir.</p>
    <div class="oa-edit-acts"><button type="button" class="ghost-btn" ${act('removeEl','rgBg')}>Vazgeç</button><button type="button" ${act('saveResvGroup')}>💾 Kaydet</button></div></div>`;
  document.body.appendChild(bg);
  if(!APP.rgParts.length) APP.rgParts.push({ name:'', phone:'' });
  drawRgList();
}
function rgDepMethod(m){ APP.rgDepM = m; document.querySelectorAll('.rg-dm').forEach(b => b.classList.toggle('on', b.dataset.m === m)); }
function drawRgList(){
  const el = document.getElementById('rgList'); if(!el) return;
  el.innerHTML = APP.rgParts.map((p, i) => `<div class="rg-row">
    ${p.id ? `<label class="rg-arr" title="Geldi"><input type="checkbox" ${p.arrived ? 'checked' : ''} ${actOn('change','rgArrived',[i,'$checked'])}>✓</label>` : '<span class="rg-arr muted">·</span>'}
    <input placeholder="Ad soyad" maxlength="80" value="${escapeAttr(p.name || '')}" ${actOn('input','rgSet',[i,'name','$value'])}>
    <input placeholder="Telefon" inputmode="tel" maxlength="30" value="${escapeAttr(p.phone || '')}" ${actOn('input','rgSet',[i,'phone','$value'])}>
    <button type="button" class="pc-btn rv-del" title="Çıkar" ${act('rgDel', i)}>✕</button></div>`).join('');
  const n = document.getElementById('rgN'); if(n) n.textContent = '(' + APP.rgParts.filter(p => (p.name || '').trim()).length + ')';
}
function rgSet(i, k, v){ if(APP.rgParts[i]) APP.rgParts[i][k] = v; if(k === 'name'){ const n = document.getElementById('rgN'); if(n) n.textContent = '(' + APP.rgParts.filter(p => (p.name || '').trim()).length + ')'; } }
function rgAddRow(){ APP.rgParts.push({ name:'', phone:'' }); drawRgList(); const ins = document.querySelectorAll('#rgList .rg-row input:not([type=checkbox])'); if(ins.length > 1) ins[ins.length - 2].focus(); }
function rgDel(i){ const p = APP.rgParts[i]; if(p && p.arrived){ uiAlert('Gelmiş olarak işaretli kişi çıkarılamaz.'); return; } APP.rgParts.splice(i, 1); drawRgList(); }
async function rgArrived(i, on){
  const p = APP.rgParts[i]; if(!p || !p.id) return;
  const { error } = await sb.rpc('set_participant_arrived', { p_token: getSession().session_token, p_participant: p.id, p_arrived: !!on });
  if(error){ uiAlert(error.message); return; }
  p.arrived = !!on;
}
async function saveResvGroup(){
  const v = (k) => ((document.getElementById(k) || {}).value || '').trim(), n = (k) => v(k) === '' ? null : parseInt(v(k), 10);
  const parts = APP.rgParts.filter(p => (p.name || '').trim()).map(p => ({ id: p.id || null, name: p.name.trim(), phone: (p.phone || '').trim() }));
  const { data, error } = await withLoadingOverlay(sb.rpc('save_reservation_group', { p_token: getSession().session_token, p_id: APP.rgId, p_group_name: v('rg_name'), p_women: n('rg_w'), p_men: n('rg_m'), p_children: n('rg_c'), p_participants: parts }));
  if(error){ uiAlert(error.message); return; }
  const r0 = (APP.reservationsCache || []).find(x => x.id === APP.rgId) || {}, dep = parseFloat(v('rg_dep').replace(',', '.')) || 0;
  if(dep !== (Number(r0.deposit_amount) || 0) || (dep > 0 && APP.rgDepM !== r0.deposit_method)){
    const { error: e2 } = await sb.rpc('set_reservation_deposit', { p_token: getSession().session_token, p_id: APP.rgId, p_amount: dep, p_method: APP.rgDepM });
    if(e2){ uiAlert('Kapora kaydedilemedi: ' + e2.message); return; }
  }
  removeEl('rgBg'); showToast('👥 Grup kaydedildi · ' + (data.participants || 0) + ' katılımcı' + (dep > 0 ? ' · 💰 kapora ' + money(dep) : ''));
  renderReservationsContent(getSession(), true, true);
}
// Excel: A sütunu ad soyad, B sütunu telefon (ilk satır başlıksa atlanır).
async function rgTemplate(){
  try{ await loadXlsx(); }catch(e){ uiAlert(e.message); return; }
  const ws = XLSX.utils.aoa_to_sheet([['Ad Soyad', 'Telefon'], ['Ayşe Yılmaz', '05XX XXX XX XX']]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Katılımcılar'); XLSX.writeFile(wb, 'katilimci-sablonu.xlsx');
}
function rgImport(){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if(!f) return;
    try{
      await loadXlsx();
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const add = rows.filter((r, i) => !(i === 0 && /ad|isim|name/i.test(String(r[0])))).map(r => ({ name: String(r[0] || '').trim(), phone: String(r[1] || '').trim() })).filter(r => r.name);
      if(!add.length){ uiAlert('Dosyada katılımcı bulunamadı (A: ad soyad, B: telefon)'); return; }
      APP.rgParts = APP.rgParts.filter(p => (p.name || '').trim() || p.id).concat(add);
      drawRgList(); showToast('⬆️ ' + add.length + ' katılımcı eklendi · kaydetmeyi unutmayın');
    }catch(e){ uiAlert('Dosya okunamadı: ' + (e.message || e)); }
  };
  inp.click();
}
