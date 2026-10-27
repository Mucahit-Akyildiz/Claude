// Ayarlar: kullanıcılar, vardiyalar, aktif kullanıcılar, veri sıfırlama, roller, vardiya planı (settings.js'ten ayrıldı; klasik script, fonksiyonlar global).

/* --- Kullanıcılar --- */
/* Bir kullanıcıya en fazla 2 rol atanabilir (bkz. app_users.role_ids
   CHECK kısıtı ve create_staff_user/update_staff_user). Rol seçimi
   checkbox listesi olarak gösteriliyor, tek <select> yerine - çünkü
   artık roller sabit 3 tane değil, yöneticinin Roller sekmesinde
   tanımladığı sayıda ve isimde olabiliyor. */
function roleCheckboxes(idPrefix, selectedIds, disabled){
  // Yönetici (sistem) rolü yalnızca işletme sahibine aittir, başkasına atanamaz.
  const roles = (APP.config.roles||[]).filter(r => !r.is_system);
  return roles.map(r => `
    <label class="role-chk" style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:13px;margin-bottom:4px;">
      <input type="checkbox" id="${idPrefix}_role_${r.id}" value="${r.id}" data-roles-group="${idPrefix}" ${selectedIds.includes(r.id)?'checked':''} class="u-wa-m0" ${disabled?'disabled':''} ${actOn('change','enforceMaxTwoRoles',[idPrefix])}>
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
function isOwnerUser(u){
  const sys = (APP.config.roles||[]).filter(r => r.is_system).map(r => r.id);
  return (u.role_ids||[]).some(id => sys.includes(id));
}
/* Şifre alanı: mevcut şifreler geri çevrilemez biçimde (bcrypt) saklandığı için
   gösterilemez; alan •••••• ile "ayarlı" görünür. 👁 yazılanı gösterir, 🎲 rastgele
   şifre üretip görünür halde alana yazar (personele iletmek için). */
/* KVKK: telefon numarası varsayılan olarak maskeli (0538 *** ** 30); tıklanınca görünür ve düzenlenebilir olur. */
function revealPhone(el){ if(!el || el.dataset.masked !== '1') return; el.dataset.masked = ''; el.value = el.dataset.orig || ''; el.readOnly = false; el.style.cursor = ''; el.focus(); }
function passField(id, disabled, existing){
  const btn = 'flex:0 0 auto;width:auto;margin:0;padding:6px 9px;font-size:15px;line-height:1;';
  return `<div style="display:flex;gap:6px;align-items:center;">
    <input type="password" id="${id}" placeholder="${existing ? 'Kayıtlı (gizli) — yeni şifre yazın' : 'Şifre'}" autocomplete="new-password" style="flex:1;min-width:0;margin:0;" ${disabled?'disabled':''}>
    ${disabled ? '' : `<button type="button" class="ghost-btn" style="${btn}" title="${existing ? 'Mevcut şifreyi göster / yazılanı göster' : 'Göster / gizle'}" ${act('togglePassVisible', id, '$this')}>👁</button>
    <button type="button" class="ghost-btn" style="${btn}" title="Rastgele şifre üret" ${act('fillRandomPass', id)}>🎲</button>`}
  </div>`;
}
async function togglePassVisible(id, b){
  const el = document.getElementById(id); if(!el) return;
  // Kutu boşsa ve kayıtlı kullanıcıysa: mevcut şifre (yalnızca Yönetici, görüntüleme kayda geçer) kutunun altında gösterilir.
  const uid = id.startsWith('us_pass_') ? id.slice(8) : '';
  if(uid && !el.value){
    let tip = document.getElementById(id + '_cur');
    if(tip){ tip.remove(); if(b) b.style.opacity = ''; return; }
    const { data, error } = await sb.rpc('reveal_staff_password', { p_token: getSession().session_token, p_user_id: uid });
    if(error){ showToast(error.message); return; }
    tip = document.createElement('small'); tip.id = id + '_cur'; tip.className = 'pw-cur';
    tip.textContent = data ? '🔓 Mevcut şifre: ' + data : 'Bu şifre bu özellikten önce belirlendiği için gösterilemiyor — 🎲 ile yeni şifre üretip kaydedin.';
    el.parentElement.insertAdjacentElement('afterend', tip);
    if(b) b.style.opacity = '1';
    return;
  }
  el.type = el.type==='password' ? 'text' : 'password';
  if(b) b.style.opacity = el.type==='text' ? '1' : '';
}
function fillRandomPass(id){
  const el = document.getElementById(id); if(!el) return;
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const r = new Uint32Array(10); crypto.getRandomValues(r);
  el.value = Array.from(r, x => chars[x % chars.length]).join('');
  el.type = 'text';
  el.dispatchEvent(new Event('input', { bubbles:true }));
  el.focus(); el.select();
  showToast('Şifre üretildi — kaydetmeden önce not alın');
}
/* İşletme sahibi: Yönetici rolü sabit; hesabını yalnızca kendisi düzenleyebilir. */
function ownerUserRow(u, session){
  const self = u.id === session.user_id;
  return `<tr data-uid="${u.id}" data-owner="1">
    <td></td>
    <td class="col-name uc-name">${avatarHtml(u.username)}<input value="${escapeAttr(u.username)}" id="us_name_${u.id}" ${self?'':'disabled'}></td>
    <td class="col-name">${self ? `${passField('us_pass_'+u.id, false, true)}` : '<span class="muted">—</span>'}</td>
    <td class="col-name"><span class="role-badge">👑 İşletme Sahibi · Yönetici</span>${self ? '' : '<div class="muted" style="font-size:12px;margin-top:4px;">🔒 Değiştirilemez</div>'}</td>
  </tr>`;
}
/* "Kullanıcı Rollerini Değiştirme" izni olmayan: rol atayamaz, kullanıcı ekleyemez ve bu
   izne / vardiyasız çalışma iznine sahip kişilerin hesaplarını düzenleyemez (sunucu da reddeder). */
function userIsPrivileged(u){
  const roles = (APP.config.roles||[]).filter(r => (u.role_ids||[]).includes(r.id));
  return roles.some(r => (r.permissions||[]).includes('users_assign_roles') || (r.permissions||[]).includes('shift_exempt'));
}
function renderUsersSettings(el, session){
  const canAssign = canManage(session, 'users_assign_roles');
  const us = APP.config.users || [], lic = APP.config.license || {};
  el.innerHTML = statChips([['👥', us.length, 'Kullanıcı', 'var(--c1)', 'all'], ['✅', us.filter(u => u.is_active!==false).length, 'Aktif', 'var(--ok,#22c55e)', 'on'],
      ['⏸', us.filter(u => u.is_active===false).length, 'Pasif', 'var(--c3)', 'off'], ['🎫', lic.max_users ? Math.max(0, lic.max_users - us.length) : '—', 'Eklenebilir kullanıcı', 'var(--c2)']], '', 'users') + `<div class="u-mwn box">
    <div class="us-top"><h2 class="u-m0">Kullanıcılar</h2><span style="flex:1"></span>${canAssign && typeof excelBarHtml === 'function' ? excelBarHtml('users') : ''}${canAssign ? sheetBtnHtml('userSheet','+ Yeni Kullanıcı') : ''}</div>
    ${canAssign ? '' : '<p class="muted" style="text-align:left;font-size:12.5px;margin:-4px 0 12px;">🔒 Kullanıcı ekleme, rol değiştirme, pasife alma ve silme için <b>Kullanıcı Yönetimi</b> izni gerekir; yetkili kişilerin hesapları da kilitlidir. Diğer personelin adını ve şifresini değiştirebilirsiniz.</p>'}
    ${canAssign ? sheetHtml('userSheet', '👤', 'Yeni Kullanıcı', `
      <div class="fsheet-grid">
        <div class="field-group"><label>Kullanıcı Adı</label><input id="nu_name" placeholder="örn. ahmet" autocapitalize="none"></div>
        <div class="field-group"><label>Şifre</label>${passField('nu_pass', false, false)}</div>
        <div class="field-group"><label>Telefon (giriş bilgileri SMS'i için)</label><input id="nu_phone" inputmode="tel" placeholder="05XX XXX XX XX"></div>
        <div class="field-group wide"><label>Roller (en fazla 2)</label>${roleCheckboxes('nu', [])}</div>
      </div>
      <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','userSheet')}>Vazgeç</button><button ${act('addUser')}>+ Kullanıcı Ekle</button></div>`, 'var(--c1)') : ''}
    <div class="us-bar">
      <input id="userSearch" placeholder="🔍 Kullanıcı ara…" value="${escapeAttr(APP.userSearch||'')}" ${actOn('input','setUserSearch',['$value'])}>
      ${canAssign ? `<div class="us-sel"><button type="button" class="pc-btn" ${act('selectAllUsers', true)}>☑ Hepsini seç</button><button type="button" class="pc-btn" ${act('selectAllUsers', false)}>☐ Seçimi kaldır</button></div>` : ''}
      <small class="muted us-info" id="userSelInfo">${canAssign ? 'Kart seçerek toplu işlem yapın' : ''}</small>
      <span style="flex:1"></span>
      <div class="act-row" id="userBulkBar">
        <button type="button" class="act-btn act-save" id="userSaveAllBtn" ${act('saveAllUsers')} disabled>${ICON_SAVE}<span>Kaydet</span></button>
        <button type="button" class="act-btn act-open" title="Giriş bilgilerini SMS ile gönder" ${act('openStaffSmsModal')}><b>📱</b><span>SMS Gönder</span></button>
        ${canAssign ? `<button type="button" class="act-btn act-close" data-needs-sel ${act('bulkUserActive', false)} disabled title="Seçilenler giriş yapamaz, açık oturumları kapanır"><b>⏸</b><span>Pasife Al</span></button>
        <button type="button" class="act-btn act-open" data-needs-sel ${act('bulkUserActive', true)} disabled><b>✓</b><span>Aktifleştir</span></button>
        <button type="button" class="act-btn act-delete" data-needs-sel ${act('bulkDeleteUsers')} disabled>${ICON_TRASH}<span>Sil</span></button>` : ''}
      </div>
    </div>
    <div class="settings-table-wrap user-cards">
    <table class="settings-table">
      <thead><tr><th style="width:36px;">${canAssign ? `<input type="checkbox" id="userSelAll" class="u-wa-m0" title="Tümünü seç" ${actOn('change','selectAllUsers',['$checked'])}>` : ''}</th><th>Kullanıcı Adı</th><th>Telefon</th><th>Yeni Şifre</th><th>Roller (en fazla 2)</th></tr></thead>
      <tbody data-cf-scope="users" ${actOn('input','markUserDirty',['$event'])} ${actOn('change','markUserDirty',['$event'])}>
      ${APP.config.users.slice().sort((x, y) => String(x.username).localeCompare(String(y.username), 'tr', { sensitivity: 'base' }))
        .map(u => { const locked = !canAssign && userIsPrivileged(u); return (isOwnerUser(u) ? ownerUserRow(u, session) : `
        <tr data-uid="${u.id}" data-cf-tags="${u.is_active===false ? 'off' : 'on'}" style="${u.is_active===false?'opacity:.55;':''}">
          <td>${locked ? '<span title="Yetkili kullanıcı - düzenleme izniniz yok">🔒</span>' : !canAssign ? '' : `<input type="checkbox" class="u-wa-m0 user-sel" value="${u.id}" ${actOn('change','updateUserSelection',[])}>`}</td>
          <td class="col-name uc-name">${avatarHtml(u.username)}<input value="${escapeAttr(u.username)}" id="us_name_${u.id}" ${locked?'disabled':''}>${u.is_active===false?'<span class="role-badge" style="color:var(--red);border-color:var(--red);margin-top:6px;display:inline-block;">Pasif</span>':''}</td>
          <td class="col-name"><input id="us_phone_${u.id}" inputmode="tel" placeholder="05XX…" value="${escapeAttr(maskPhone(u.phone))}" data-orig="${escapeAttr(u.phone||'')}" data-masked="${u.phone ? '1' : ''}" ${u.phone ? 'readonly title="Görmek / değiştirmek için tıklayın (KVKK)"' : ''} ${actOn('click','revealPhone',['$this'])} ${locked?'disabled':''} style="min-width:130px;${u.phone ? 'cursor:pointer;' : ''}"></td>
          <td class="col-name">${passField('us_pass_'+u.id, locked, true)}</td>
          <td class="col-name">${roleCheckboxes('us_'+u.id, u.role_ids||[], !canAssign)}</td>
        </tr>`).replace('<tr', `<tr data-uname="${escapeAttr(String(u.username).toLocaleLowerCase('tr'))}"`); }).join('')}
      </tbody>
    </table>
    </div>
  </div>`;
  filterUserRows();
}
/* Kullanıcı listesinde ada göre anlık arama (liste zaten alfabetik sıralı). */
function filterUserRows(){
  const q = String(APP.userSearch||'').trim().toLocaleLowerCase('tr');
  document.querySelectorAll('tr[data-uname]').forEach(tr => { tr.style.display = !q || tr.dataset.uname.includes(q) ? '' : 'none'; });
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
  el.innerHTML = `<div class="u-mwn box">
    <h2>Vardiyalar</h2>
    <div id="shiftApprovalWrap"></div>
    <div id="shiftPendingWrap"></div>
    <div class="sh-date">
      <button type="button" class="ico-btn" title="Önceki gün" ${act('shiftDayStep', -1)}>‹</button>
      <input type="date" id="shiftsDateInput" value="${APP.shiftsDate}" ${actOn('change','changeShiftsDate',['$value'])}>
      <button type="button" class="ico-btn" title="Sonraki gün" ${act('shiftDayStep', 1)}>›</button>
      <button type="button" class="pc-btn" ${act('changeShiftsDate', todayLocalDateStr())}>Bugün</button>
    </div>
    <div id="shiftsTableWrap"><p class="muted">Yükleniyor…</p></div>
  </div>`;
  await renderShiftsTable(session);
  // Sekme açıkken yeni vardiya istekleri / değişiklikler 20 sn'de bir sessizce gelir (animasyonsuz, yanıp sönmeden).
  if(SHIFTS_TIMER) clearInterval(SHIFTS_TIMER);
  SHIFTS_TIMER = setInterval(() => {
    if(APP.view!=='settings' || !document.getElementById('shiftsTableWrap')){ clearInterval(SHIFTS_TIMER); SHIFTS_TIMER = null; return; }
    if(typeof uiBusyForAutoRefresh==='function' && uiBusyForAutoRefresh()) return;
    renderShiftsTable(getSession(), true);
  }, 20000);
}
let SHIFTS_TIMER = null;
function changeShiftsDate(v){ APP.shiftsDate = v; const i = document.getElementById('shiftsDateInput'); if(i) i.value = v; renderShiftsTable(getSession()); }
function shiftDayStep(d){ const x = new Date(APP.shiftsDate+'T12:00'); x.setDate(x.getDate()+d); changeShiftsDate(x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')); }
async function setDayEndHour(v){ const s = getSession(); const { error } = await sb.rpc('set_day_end_hour', { p_token: s.session_token, p_hour: parseInt(v, 10) }); if(error){ alert(error.message); return; } showToast('Gün sonu saati ' + String(v).padStart(2,'0') + ':00 ✓'); }
async function renderShiftsTable(session, quiet){
  const wrap = document.getElementById('shiftsTableWrap'); if(!wrap) return;
  const box = wrap.closest('.box');
  if(quiet){ if(box) box.dataset.snap = '1'; APP.silentLoad = true; } else if(box) delete box.dataset.snap;
  try { await renderShiftsTableInner(session, wrap); } finally { if(quiet) setTimeout(() => { APP.silentLoad = false; }, 0); }
}
async function renderShiftsTableInner(session, wrap){
  const { data, error } = await withLoadingOverlay(sb.rpc('list_staff_shifts', { p_token: session.session_token, p_date: APP.shiftsDate }));
  if(error){ wrap.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const approvalWrap = document.getElementById('shiftApprovalWrap');
  if(approvalWrap) approvalWrap.innerHTML = `
    <div class="sh-opts"><label class="sw-card">
      <input type="checkbox" class="sw" ${data.approval_required?'checked':''} ${canManage(session,'shifts')?'':'disabled'} ${actOn('change','toggleShiftApproval',['$checked'])}>
      <span><b>Vardiya başlatma yönetici onayına bağlı</b><br>
      <span class="u-fs125 muted">Açıkken personel vardiyayı sadece <i>isteyebilir</i>; siz onayladığınızda başlar ve vardiyayı yalnızca yönetici bitirebilir.${canManage(session,'shifts')?'':' (Bu ayarı Yönetici değiştirebilir.)'}</span></span>
    </label>
    <label class="sw-card">
      <input type="checkbox" class="sw" ${data.shift_required?'checked':''} ${canManage(session,'shifts')?'':'disabled'} ${actOn('change','toggleShiftRequired',['$checked'])}>
      <span><b>Vardiya açmadan çalışılamasın</b><br>
      <span class="u-fs125 muted">Açıkken personel vardiyasını başlatmadan Sipariş Al, Paket, Mutfak, Ödemeler, Rezervasyon ve Satınalma ekranlarını kullanamaz. Vardiya talebini gönderdiği anda çalışmaya başlayabilir; onayı siz sonradan verirsiniz. Yönetici ve <b>⏱ Vardiya Açmadan Çalışma</b> izni verilen roller (ör. Tam Yetkili, en fazla 3 kişi) bu kuraldan muaftır.</span></span>
    </label>
    <label class="sw-card">
      <span style="font-size:22px;">🌙</span>
      <span class="u-f1"><b>Gün sonu saati</b> <select style="width:auto;display:inline-block;margin:0 0 0 6px;padding:4px 8px;" ${canManage(session,'shifts')?'':'disabled'} ${actOn('change','setDayEndHour',['$value'])}>${Array.from({length:24},(_,h) => `<option value="${h}" ${Number(data.day_end_hour ?? 5)===h?'selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}</select><br>
      <span class="u-fs125 muted">Bu saatte açık kalan vardiyalar otomatik kapanır; herkes her gün vardiyasını yeniden açar. Bitiş saati olarak kişinin uygulamayı son kullandığı an yazılır. Gün Sonu kasa sayımı kaydedildiğinde de diğer personelin vardiyaları kapanır.</span></span>
    </label></div>`;
  const pendWrap = document.getElementById('shiftPendingWrap');
  const pending = data.pending || [];
  const endReqs = data.end_requests || [];
  if(pendWrap) pendWrap.innerHTML = (endReqs.length ? `
    <div style="border:1px solid #d9a400;border-radius:12px;padding:12px;margin-bottom:16px;">
      <b>🏁 Bitirme Talepleri (${endReqs.length})</b>
      ${endReqs.map(p => `<div data-badge-id="${p.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
        <span><b>${escapeHtml(p.username)}</b> <span class="muted">· ${formatShiftTime(p.clock_in)}'dan beri vardiyada, ${formatShiftTime(p.requested_at)}'de bitirmek istedi</span></span>
        <span style="display:flex;gap:8px;">
          <button class="u-wa-m0 actBtn" ${act('manageShift', p.id, 'approve_end')}>✓ Bitir</button>
          <button class="actBtn" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" ${act('manageShift', p.id, 'reject_end')}>✕ Reddet</button>
        </span></div>`).join('')}
    </div>` : '') + (pending.length ? `
    <div style="border:1px solid #d9a400;border-radius:12px;padding:12px;margin-bottom:16px;">
      <b>🟡 Onay Bekleyen Vardiya Talepleri (${pending.length})</b>
      ${pending.map(p => `<div data-badge-id="${p.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
        <span><b>${escapeHtml(p.username)}</b> <span class="muted">· ${formatShiftTime(p.requested_at)}'de istedi</span></span>
        <span style="display:flex;gap:8px;">
          <button class="u-wa-m0 actBtn" ${act('manageShift', p.id, 'approve')}>✓ Onayla</button>
          <button class="actBtn danger" style="width:auto;margin:0;background:var(--red);color:var(--btn-ink);" ${act('manageShift', p.id, 'reject')}>✕ Reddet</button>
        </span></div>`).join('')}
    </div>` : '');
  const rows = data.rows || [];
  if(!rows.length){ wrap.innerHTML = '<div class="empty-state"><div style="font-size:42px;">🕐</div><p class="muted">Bu tarihte vardiya kaydı yok.</p></div>'; return; }
  const dayStart = new Date(APP.shiftsDate+'T00:00').getTime(), pos = (t) => Math.max(0, Math.min(100, (t - dayStart) / 864e5 * 100));
  const nowPct = pos(Date.now()), totalMin = rows.reduce((x, r) => x + (Number(r.duration_minutes)||0), 0), live = rows.filter(r => !r.clock_out).length;
  wrap.innerHTML = statChips([['🧑‍🍳', rows.length, 'Vardiya', 'var(--c1)', 'all'], ['🟢', live, 'Devam eden', 'var(--ok,#22c55e)', 'live'],
      ['⏱', formatShiftDuration(totalMin), 'Toplam çalışma', 'var(--c2)', 'done'], ['⏸', rows.filter(r => r.is_paused).length, 'Duraklatılmış', 'var(--c3)', 'paused']], '', 'shifts') + `
    <div class="sh-tl" data-cf-scope="shifts">
      <div class="sh-axis"><span></span><div>${[0,3,6,9,12,15,18,21,24].map(h => `<i style="left:${h/24*100}%">${String(h).padStart(2,'0')}</i>`).join('')}</div><span></span></div>
      ${rows.map((r, i) => { const a = pos(new Date(r.clock_in).getTime()), b = r.clock_out ? pos(new Date(r.clock_out).getTime()) : nowPct;
        return `<div class="sh-row ${r.clock_out?'':'live'}" data-cf-tags="${r.clock_out ? 'done' : 'live'}${r.is_paused ? ' paused' : ''}" style="--i:${Math.min(i,12)};">
          <div class="sh-who">${avatarHtml(r.username)}<div><b>${escapeHtml(r.username)}</b><small>${r.approved_by && r.approved_by!==r.username ? 'Onaylayan: '+escapeHtml(r.approved_by) : formatShiftTime(r.clock_in)+' → '+(r.clock_out ? formatShiftTime(r.clock_out) : 'devam ediyor')}</small></div></div>
          <div class="sh-track">${nowPct>0 && nowPct<100 ? `<span class="sh-now" style="left:${nowPct}%"></span>` : ''}
            <div class="sh-bar ${r.is_paused?'paused':''}" style="left:${a}%;width:${Math.max(1.2, b-a)}%;" title="${formatShiftTime(r.clock_in)} - ${r.clock_out ? formatShiftTime(r.clock_out) : 'şimdi'}"><span>${formatShiftDuration(r.duration_minutes)}</span></div></div>
          <div class="sh-side">
            ${!r.clock_out && r.end_requested_at ? `<span class="pchip warn">🏁 ${formatShiftTime(r.end_requested_at)}'de bitirmek istedi</span>` : ''}
            ${r.is_paused ? '<span class="pchip warn">⏸ Duraklatıldı</span>' : ''}
            ${r.paused_minutes > 0 ? `<span class="pchip">${formatShiftDuration(r.paused_minutes)} pasif</span>` : ''}
            ${r.clock_out && r.auto_closed ? `<span class="pchip warn" title="Gün sonunda açık kaldığı için kapatıldı; bitiş saati kişinin son kullanım anıdır">⚠️ Otomatik kapandı</span>` : r.clock_out ? (r.ended_by && r.ended_by!==r.username ? `<span class="pchip">${escapeHtml(r.ended_by)} bitirdi</span>` : '<span class="pchip">✓ Bitti</span>') : `<button type="button" class="pc-btn rv-del" ${act('manageShift', r.id, 'end')}>⏹ Bitir</button>`}
          </div>
        </div>`; }).join('')}
    </div>`;
}
async function manageShift(id, action){
  if(action==='end' && !await uiConfirm('Bu personelin vardiyası şimdi bitirilsin mi?')) return;
  const session = getSession();
  const { error } = await withLoadingOverlay(sb.rpc('manage_staff_shift', { p_token: session.session_token, p_shift_id: id, p_action: action }));
  if(error){ showToast(error.message); return; }
  showToast({ approve:'Vardiya başlatıldı ✓', reject:'Talep reddedildi', approve_end:'Vardiya bitirildi ✓', reject_end:'Bitirme talebi reddedildi', end:'Vardiya bitirildi ✓' }[action] || 'Tamam');
  renderShiftsTable(session);
  refreshShiftWidget(session);
  refreshNavBadges();
}
async function toggleShiftRequired(on){
  const session = getSession();
  const { error } = await sb.rpc('set_shift_required', { p_token: session.session_token, p_value: on });
  if(error){ showToast(error.message); renderShiftsTable(session); return; }
  showToast(on ? 'Personel artık vardiya açmadan çalışamaz' : 'Vardiya zorunluluğu kapatıldı');
  refreshShiftWidget(session);
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
  el.innerHTML = `<div class="u-mwn box">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <h2 class="u-m0">🟢 Aktif Kullanıcılar</h2>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="u-fs13 muted">Son</span>
        <select id="activeUsersMinutes" class="u-wa-m0" ${actOn('change','setActiveUsersMinutes',['$value'])}>
          ${[5,15,60,1440].map(m => `<option value="${m}" ${APP.activeUsersMinutes===m?'selected':''}>${m===1440?'24 saat':m+' dakika'}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="au-legend">
      <span><i class="d on"></i>Çevrimiçi</span><span><i class="d idle"></i>Boşta · 2 dk+ işlem yok, vardiya sayacı durur</span><span><i class="d away"></i>Çevrimdışı · 30 dk+ işlem yok</span><span><i class="d off"></i>Çıkış yaptı</span>
      <span class="au-auto" title="Liste 20 saniyede bir kendiliğinden yenilenir">🔄 20 sn'de bir yenilenir</span>
    </div>
    <div id="activeUsersBody"><p class="muted">Yükleniyor...</p></div>
  </div>`;
  loadActiveUsers();
  if(ACTIVE_USERS_TIMER) clearInterval(ACTIVE_USERS_TIMER);
  ACTIVE_USERS_TIMER = setInterval(() => {
    if(APP.view!=='settings' || APP.settingsTab!=='users' || !document.getElementById('activeUsersBody')){ clearInterval(ACTIVE_USERS_TIMER); ACTIVE_USERS_TIMER = null; return; }
    loadActiveUsers(true);
  }, 20000);
}
async function loadActiveUsers(quiet){
  const session = getSession(); const body = document.getElementById('activeUsersBody');
  if(!session || !body) return;
  const { data, error } = await sb.rpc('list_active_staff', { p_token: session.session_token, p_minutes: APP.activeUsersMinutes || 5 });
  if(error){ body.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const rows = data.rows || [];
  const full = data.max_users && data.total_users >= data.max_users;
  // Otomatik yenilemede giriş animasyonları/sayaçlar tekrar oynamasın.
  if(quiet){ body.dataset.snap = '1'; APP.silentLoad = true; } else delete body.dataset.snap;
  body.innerHTML = statChips([['🟢', data.active_users, 'Aktif kullanıcı', 'var(--ok,#22c55e)', 'on'], ['🧑‍🍳', data.on_shift, 'Vardiyada', 'var(--c1)', 'shift'],
      ['📅', data.today_users, 'Bugün giren', 'var(--c2)', 'all'], ['🎫', (data.total_users ?? '—') + ' / ' + (data.max_users ?? '—'), data.max_users ? 'Lisans · ' + Math.max(0, data.max_users - data.total_users) + ' boş yer' + (data.total_users - data.enabled_users ? ' · ' + (data.total_users - data.enabled_users) + ' pasif' : '') : 'Kullanıcı / lisans', full ? 'var(--danger,#ef4444)' : 'var(--c3)']], '', 'active') + `
    ${!rows.length ? '<div class="empty-state"><div style="font-size:42px;">😴</div><p class="muted">Bu sürede aktif kullanıcı yok.</p></div>' : `<div class="au-grid" data-cf-scope="active">${rows.map((r, i) => {
      // 2 dk içinde işlem: çevrimiçi; 2–30 dk: boşta; 30 dk+ işlem yok ya da çıkış: çevrimdışı.
      const age = Date.now() - new Date(r.last_seen_at).getTime();
      const st = r.online===false ? 'off' : age < 120000 ? 'on' : age < 1800000 ? 'idle' : 'away';
      return `<div class="au-card au-${st}" data-cf-tags="${st}${r.on_shift ? ' shift' : ''}" style="--i:${Math.min(i,12)};">
        <div class="cu-top"><span class="au-av">${avatarHtml(r.username)}<i></i></span><div class="cu-id"><b>${escapeHtml(r.username)}</b><small>${escapeHtml(r.roles||'—')}</small></div>
          <span class="au-st">${st==='on' ? 'Çevrimiçi' : st==='idle' ? 'Boşta' : st==='away' ? 'Çevrimdışı' : 'Çıkış yaptı'}</span></div>
        <div class="pcard-chips">
          <span class="pchip">⚡ ${fmtRelativeTime(r.last_seen_at)}</span>
          <span class="pchip">🔑 ${new Date(r.login_at).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
          ${r.online===false && r.logged_out_at ? `<span class="pchip">🚪 ${new Date(r.logged_out_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span>` : ''}
        </div>
        ${r.on_shift ? `<div class="au-shift ${r.shift_paused?'paused':''}">${r.shift_paused ? '⏸ Vardiya durdu' : '🟢 Vardiyada'}${r.shift_minutes != null ? ' · '+formatShiftDuration(r.shift_minutes) : ''}</div>` : '<div class="au-shift none">Vardiyada değil</div>'}
      </div>`; }).join('')}</div>`}`;
  if(quiet) setTimeout(() => { APP.silentLoad = false; }, 0);
}

/* --- Veri Sıfırlama (yalnızca Yönetici): seçilen tarih aralığındaki işlem
   verilerini kalıcı olarak siler (bkz. reset_restaurant_data). Ürünler,
   masalar, kullanıcılar ve açık siparişler etkilenmez (müşteriler yalnızca seçilirse);
   e-faturası kesilmiş satışlar yasal kayıt olduğu için korunur. */
const RESET_CATEGORIES = [
  { id:'sales', label:'Satışlar ve kapanmış siparişler', hint:'Satış geçmişi, iptal/kapalı siparişler, faturalar (e-fatura hariç), online sipariş talepleri ve ödemeleri, mutfak iptalleri, kampanya kullanımları, SMS kayıtları' },
  { id:'waste', label:'Zayi / fire kayıtları' },
  { id:'shifts', label:'Vardiya kayıtları', hint:'Devam eden vardiyalar silinmez' },
  { id:'reservations', label:'Rezervasyonlar ve bekleme listesi' },
  { id:'purchases', label:'Satınalma siparişleri' },
  { id:'messages', label:'Mesajlar', hint:'Ekip içi mesajlar, fotoğraf ve sesli mesajlar', off:true },
  { id:'waiter_calls', label:'Garson çağrıları', hint:'QR menüden gelen tamamlanmış çağrılar', off:true },
  { id:'audit', label:'Değişiklik kaydı', hint:'Ayarlar → Güvenlik → Değişiklik Kaydı', off:true },
  { id:'cash_counts', label:'Kasa sayımları', off:true },
  { id:'reviews', label:'Müşteri değerlendirmeleri', hint:'Yıldız puanları ve yorumlar', off:true },
  { id:'notifications', label:'Bildirim geçmişi', hint:'Uygulama içi bildirim kayıtları ve hata kayıtları', off:true },
  { id:'users', label:'Kullanıcılar', hint:'Bu dönemde eklenen personel hesapları (siz ve Yönetici rolündekiler silinmez; işlem geçmişi olanlar pasife alınır)', off:true, warn:true },
  { id:'roles', label:'Roller', hint:'Bu dönemde eklenen roller (Yönetici rolü ve hâlâ bir kullanıcıya atanmış roller silinmez)', off:true, warn:true },
  { id:'customers', label:'Müşteriler', hint:'Bu dönemde eklenen müşteri kayıtları, sadakat puanlarıyla birlikte (satış geçmişi silinmez)', off:true, warn:true },
];
// Hiçbir seçenekle silinmeyen kalıcı veriler (kullanıcıya bilgi olarak gösterilir).
const RESET_KEPT = ['Ürünler, ekstralar ve reçeteler','Menüler ve istasyonlar','Hammaddeler ve stok miktarları','Bölgeler ve masalar','Yönetici rolü ve sizin hesabınız','Tedarikçiler','Hediye kartları ve bakiyeleri','Açık hesaplar ve borç kayıtları','Açık (ödenmemiş) siparişler ve devam eden vardiyalar','E-faturası kesilmiş satışlar (yasal kayıt)','Ayarlar, fiş tasarımı ve entegrasyonlar'];
const RESET_ICONS = { sales:'🧾', waste:'🔥', shifts:'🕐', reservations:'📅', purchases:'🚚', messages:'💬', waiter_calls:'🛎️', audit:'📜', customers:'👥', users:'👤', roles:'🔑', cash_counts:'💵', reviews:'⭐', notifications:'🔔' };
function renderDataResetSettings(el){
  const R = [['1m','1 ay'],['3m','3 ay'],['6m','6 ay'],['1y','1 yıl'],['all','Tümü'],['custom','Tarih seç']];
  el.innerHTML = `<div class="box" style="max-width:none;text-align:left;">
    <h2>🗑️ Verileri Sıfırla</h2>
    <p class="muted" style="margin:0 0 14px;">Seçtiğiniz dönemdeki işlem verilerini <b>kalıcı olarak</b> siler. Bu işlem geri alınamaz.</p>
    <div class="dr-layout">
      <div>
        <div class="dr-step"><span>1</span>Dönem</div>
        <select id="resetRange" style="display:none;" ${actOn('change','toggleResetCustom',['$value'])}>${R.map(([k,l]) => `<option value="${k}" ${k==='3m'?'selected':''}>${l}</option>`).join('')}</select>
        <div class="seg dr-seg">${R.map(([k,l]) => `<button type="button" data-rr="${k}" class="${k==='3m'?'on':''}" ${act('setResetRange', k)}>${k==='all'||k==='custom' ? l : 'Son ' + l}</button>`).join('')}</div>
        <div id="resetCustom" style="display:none;gap:10px;flex-wrap:wrap;margin-top:10px;">
          <div class="field-group" style="flex:1;min-width:140px;"><label>Başlangıç (tarih ve saat)</label><input type="datetime-local" id="resetFrom"></div>
          <div class="field-group" style="flex:1;min-width:140px;"><label>Bitiş (tarih ve saat)</label><input type="datetime-local" id="resetTo" value="${(() => { const d = new Date(); return todayLocalDateStr() + 'T' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); })()}"></div>
        </div>
        <div class="dr-step" style="margin-top:18px;"><span>2</span>Silinecek veriler <small class="muted" id="drCount"></small></div>
        <div class="dr-grid" ${actOn('change','updateResetCount',[])}>
          ${RESET_CATEGORIES.map(c => `<label class="dr-card ${c.warn?'warn':''}">
            <input type="checkbox" class="resetCat" value="${c.id}" ${c.off?'':'checked'}>
            <span class="dr-ic">${RESET_ICONS[c.id]||'🗂️'}</span>
            <span class="dr-txt"><b>${c.label}${c.warn?' <em>⚠️ dikkat</em>':''}</b>${c.hint?`<small>${c.hint}</small>`:''}</span>
            <span class="dr-chk"></span>
          </label>`).join('')}
        </div>
      </div>
      <div class="dr-side">
        <div class="dr-backup">
          <div class="dr-step"><span>💾</span>Yedekle / Geri yükle</div>
          <p class="muted" style="font-size:12.5px;margin:0 0 10px;">Silmeden önce tüm işletme verilerinizin bir kopyasını indirin; gerektiğinde aynı dosyayla geri yükleyin. Şifreler ve API anahtarları yedeğe eklenmez.</p>
          <input type="password" id="backupPassword" autocomplete="current-password" placeholder="Giriş şifreniz" class="u-mb10">
          <button type="button" class="dr-bk-btn" ${act('downloadBackup')}>⬇️ Yedeği İndir (.json)</button>
          <button type="button" class="dr-bk-btn dr-bk-up" ${act('restoreBackup')}>⬆️ Yedekten Geri Yükle</button>
          <input type="file" id="backupFile" accept=".json,application/json" style="display:none;" ${actOn('change','restoreBackupFile',['$file'])}>
        </div>
        <details class="dr-kept"><summary>🔒 Silinmeyecek veriler <small>(${RESET_KEPT.length})</small></summary>
          <ul>${RESET_KEPT.map(k => `<li>✓ ${k}</li>`).join('')}</ul></details>
        <div class="dr-danger">
          <div class="dr-step"><span>3</span>Onayla</div>
          <p class="muted" style="font-size:12.5px;margin:0 0 10px;">Silmeden önce son bir kez soracağız.</p>
          <label style="font-size:12.5px;font-weight:700;">Giriş şifreniz</label>
          <input type="password" id="resetPassword" autocomplete="current-password" placeholder="••••••••" style="margin:6px 0 12px;">
          <button type="button" class="dr-btn" ${act('doDataReset')}>🗑️ Verileri Kalıcı Olarak Sil</button>
        </div>
      </div>
    </div>
  </div>`;
  updateResetCount();
}
async function downloadBackup(){
  const el = document.getElementById('backupPassword'), pw = el ? el.value : '';
  if(!pw){ showToast('Yedek için şifrenizi girin'); return; }
  const { data, error } = await withLoadingOverlay(sb.rpc('export_restaurant_backup', { p_token: getSession().session_token, p_password: pw }));
  if(error){ showToast(error.message); return; }
  el.value = '';
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'peyktan-yedek-' + ((data && data.restaurant_code) || '') + '-' + todayLocalDateStr() + '.json';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  showToast('Yedek indirildi ✓');
}
function restoreBackup(){
  if(!(document.getElementById('backupPassword') || {}).value){ showToast('Geri yükleme için şifrenizi girin'); return; }
  const f = document.getElementById('backupFile'); f.value = ''; f.click();
}
async function restoreBackupFile(file){
  if(!file) return;
  let data; try{ data = JSON.parse(await file.text()); }catch(e){ alert('Dosya okunamadı: geçerli bir yedek (.json) değil.'); return; }
  if(!data || data.format !== 'peyktan-backup'){ alert('Bu dosya bir Peyktan yedeği değil.'); return; }
  const when = data.created_at ? new Date(data.created_at).toLocaleString('tr-TR') : '?';
  if(!await uiConfirm(when + ' tarihli yedek geri yüklenecek.\n\nYedekteki kayıtlar geri yazılır: silinenler geri gelir, mevcut kayıtlar yedekteki haline döner. Yedekten sonra eklenen kayıtlar silinmez. Geri gelen silinmiş kullanıcıların şifresini yeniden belirlemeniz gerekir.', { title:'Yedek geri yüklensin mi?', okText:'Evet, Geri Yükle', danger:true })) return;
  const pwEl = document.getElementById('backupPassword');
  const { data: r, error } = await withLoadingOverlay(sb.rpc('import_restaurant_backup', { p_token: getSession().session_token, p_password: pwEl.value, p_backup: data }));
  if(error){ alert('Geri yüklenemedi: ' + error.message); return; }
  pwEl.value = '';
  const n = Object.values((r && r.restored) || {}).reduce((a, b) => a + b, 0);
  showToast('Yedek geri yüklendi ✓ (' + n + ' kayıt)');
  const { data: cfg } = await sb.rpc('get_restaurant_config', { p_token: getSession().session_token }); if(cfg) APP.config = cfg;
}
function setResetRange(k){
  const sel = document.getElementById('resetRange'); if(!sel) return;
  sel.value = k; document.querySelectorAll('[data-rr]').forEach(b => b.classList.toggle('on', b.dataset.rr === k));
  toggleResetCustom(k);
}
function updateResetCount(){ const n = document.querySelectorAll('.resetCat:checked').length, el = document.getElementById('drCount'); if(el) el.textContent = n + ' / ' + RESET_CATEGORIES.length + ' seçili'; }
function resetRangeDates(){
  const v = document.getElementById('resetRange').value;
  const fmt = (x) => x ? x.replace('T', ' ') : '';
  if(v==='all') return { from:null, to:null, label:'TÜM ZAMANLARA ait' };
  if(v==='custom'){
    const from = document.getElementById('resetFrom').value || null, to = document.getElementById('resetTo').value || null;
    return { from, to, label: (fmt(from)||'en baştan') + ' – ' + (fmt(to)||'şu an') + ' arasındaki' };
  }
  const months = { '1m':1, '3m':3, '6m':6, '1y':12 }[v];
  const d = new Date(); d.setMonth(d.getMonth() - months);
  const from = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') + 'T00:00';
  return { from, to: null, label: document.getElementById('resetRange').selectedOptions[0].textContent + 'a ait' };
}
async function doDataReset(){
  const cats = Array.from(document.querySelectorAll('.resetCat:checked')).map(b => b.value);
  if(!cats.length){ showToast('En az bir veri türü seçin'); return; }
  const pw = document.getElementById('resetPassword').value;
  if(!pw){ showToast('Onay için şifrenizi girin'); return; }
  const r = resetRangeDates();
  if(document.getElementById('resetRange').value==='custom' && !r.from && !r.to){ showToast('Tarih aralığı seçin'); return; }
  const names = RESET_CATEGORIES.filter(c => cats.includes(c.id)).map(c => '• ' + c.label).join('\n');
  if(!await uiConfirm(r.label + ' şu veriler kalıcı olarak silinecek:\n\n' + names + '\n\nBu işlem GERİ ALINAMAZ. Devam edilsin mi?')) return;
  const session = getSession();
  const { data, error } = await withLoadingOverlay(sb.rpc('reset_restaurant_data_ts', { p_token: session.session_token, p_password: pw, p_from: r.from, p_to: r.to, p_categories: cats }));
  if(error){ showToast(error.message); return; }
  if(!data || !data.ok){ showToast((data && data.error) || 'Silinemedi'); return; }
  document.getElementById('resetPassword').value = '';
  const n = data.removed || {};
  showToast('Veriler silindi ✓ ' + Object.keys(n).map(k => (RESET_CATEGORIES.find(c => c.id===k)||{label:k==='users_deactivated'?'Pasife alınan kullanıcı':k}).label + ': ' + n[k]).join(', '));
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
        <a ${act('toggleRoleCategory', '$this', true)}>Tümü</a></div>
      <div class="perm-pills">${byCat[cat].map(p => `
        <label class="perm-pill"><input type="checkbox" value="${escapeAttr(p.id)}" data-perms-group="${idPrefix}" ${selectedPerms.includes(p.id)?'checked':''} ${actOn('change','markRoleDirty',[idPrefix])}>${escapeHtml(p.label)}</label>`).join('')}
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
  'Satınalma': ['purchasing_orders','purchasing_manage','purchasing_suppliers','purchasing_reports','settings_ingredients'],
  'Müdür Yardımcısı': ['order','packages','kitchen','payments','reservations','crm','shifts','purchasing_orders','purchasing_manage','purchasing_suppliers','settings_products','settings_ingredients','settings_zones','settings_flags']
};
function applyRoleTemplate(name){
  const perms = ROLE_TEMPLATES[name] || [];
  document.getElementById('new_role_name').value = name;
  document.querySelectorAll('input[data-perms-group="new_role"]').forEach(b => { b.checked = perms.includes(b.value); });
  markRoleDirty('new_role');
}
function roleCardHtml(r, i){
  const total = rolePermissionCatalog().length, sc = `var(--c${(i||0)%4+1})`;
  if(r.is_system) return `
    <div class="role-card role-sys" style="--sc:var(--c3);">
      <div class="role-head" style="cursor:default;">
        <div class="role-avatar">👑</div>
        <div class="role-title"><b>${escapeHtml(r.name)}</b> <span class="role-badge" style="margin-left:6px;font-size:11px;padding:3px 9px;">Sistem</span>
          <div class="role-sub">Yalnızca işletme sahibinde · tüm ekranlara erişir · değiştirilemez</div></div>
        <div class="role-meta"><span class="role-chip">${r.user_count} kullanıcı</span><span class="role-chip accent">Tüm izinler</span></div>
      </div>
    </div>`;
  const g = 'role_'+r.id, perms = r.permissions || [];
  return `
    <div class="role-card" data-role-card="${g}" style="--sc:${sc};">
      <div class="role-head" ${act('openSheet', 'rs_'+g)}>
        <div class="role-avatar">${escapeHtml((r.name||'?')[0].toLocaleUpperCase('tr'))}</div>
        <div class="role-title"><b>${escapeHtml(r.name)}</b>${r.shift_exempt ? ' <span class="role-badge" style="margin-left:6px;font-size:11px;padding:3px 9px;" title="Vardiya açmadan çalışabilir">⏱ Vardiyasız</span>' : ''}<div class="role-sub">${escapeHtml(rolePermSummary(perms))}</div></div>
        <div class="role-meta"><span class="role-chip">👥 ${r.user_count}</span><span class="role-pbar" title="İzin kapsamı"><i style="width:${Math.round(perms.filter(p => rolePermissionCatalog().some(c => c.id===p)).length/total*100)}%;"></i></span><span class="role-chip accent role-perm-count">${perms.filter(p => rolePermissionCatalog().some(c => c.id===p)).length} / ${total} izin</span></div>
        <span class="role-chevron">▶</span>
      </div>
    </div>
    ${sheetHtml('rs_'+g, escapeHtml((r.name||'?')[0].toLocaleUpperCase('tr')), escapeHtml(r.name) + ' rolü', `
        <div class="field-group" style="margin:0 0 6px;"><label>Rol Adı</label><input value="${escapeAttr(r.name)}" id="role_name_${r.id}" ${actOn('input','markRoleDirty',[g])}></div>
        ${permissionCheckboxes(g, perms)}
        <div class="role-actions">
          <button class="ghost-btn" style="width:auto;margin:0;color:var(--red);border-color:var(--red);" ${act('deleteRole', r.id)} ${r.user_count>0?`title="Bu role atanmış ${r.user_count} kullanıcı var"`:''}>${ICON_TRASH}<span>Rolü Sil</span></button>
          <span class="spacer"></span>
          <span class="role-dirty-note">● Kaydedilmemiş değişiklik</span>
          <button style="width:auto;margin:0;padding:10px 22px;" ${act('saveRole', r.id)}>${ICON_SAVE}<span>Kaydet</span></button>
        </div>
`, sc)}`;
}
function renderRolesSettings(el, session){
  const roles = APP.config.roles || [];
  const custom = roles.filter(r => !r.is_system);
  el.innerHTML = statChips([['🔑', roles.length, 'Rol', 'var(--c1)', 'all'], ['👥', roles.reduce((x, r) => x + (Number(r.user_count)||0), 0), 'Rol atanmış kullanıcı', 'var(--c2)', 'used'],
      ['⏱', custom.filter(r => r.shift_exempt).length, 'Vardiyasız rol', 'var(--c3)', 'exempt'], ['💤', custom.filter(r => !Number(r.user_count)).length, 'Kullanılmayan rol', 'var(--c4)', 'unused']], '', 'roles') + `<div class="u-mwn box">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div><h2 style="margin-bottom:4px;">Roller</h2>
        <p class="muted" style="margin:0 0 16px;">Bir role tıklayarak hangi ekranlara erişebileceğini seçin. Bir kullanıcıya en fazla 2 rol verilebilir; izinleri birleşir.</p></div>
      <button class="u-wa-m0" ${act('openNewRoleCard')}>+ Yeni Rol</button>
    </div>
    <div class="role-list" data-cf-scope="roles">${roles.map((r, i) => roleCardHtml(r, i).replace('<div class="role-card', `<div data-cf-tags="${Number(r.user_count) ? 'used' : 'unused'}${r.shift_exempt ? ' exempt' : ''}" class="role-card`)).join('')}</div>
    <div class="role-card" data-role-card="new_role" style="border-style:dashed;">
      <div class="role-head" ${act('openNewRoleCard')}>
        <div class="role-avatar">＋</div>
        <div class="role-title"><b>Yeni Rol Oluştur</b><div class="role-sub">Hazır şablonla başlayın ya da izinleri kendiniz seçin</div></div>
        <div class="role-meta"><span class="role-chip accent role-perm-count">0 / ${rolePermissionCatalog().length} izin</span></div>
        <span class="role-chevron">▶</span>
      </div>
    </div>
    ${sheetHtml('rs_new_role', '＋', 'Yeni Rol', `
        <div class="role-templates"><span class="muted" style="font-size:12px;align-self:center;">Şablon:</span>
          ${Object.keys(ROLE_TEMPLATES).map(t => `<button class="u-m0 sbtn" ${act('applyRoleTemplate', jsArg(t))}>${escapeHtml(t)}</button>`).join('')}
        </div>
        <div class="field-group" style="margin:10px 0 6px;"><label>Rol Adı</label><input id="new_role_name" placeholder="örn. Kasiyer" ${actOn('input','markRoleDirty',['new_role'])}></div>
        ${permissionCheckboxes('new_role', [])}
        <div class="role-actions"><span class="spacer"></span>
          <button style="width:auto;margin:0;padding:10px 22px;" ${act('createRole')}>+ Rolü Oluştur</button>
        </div>
`, 'var(--c1)')}
  </div>`;
}
async function saveRole(id){
  const session = getSession();
  const name = document.getElementById('role_name_'+id).value.trim();
  const perms = selectedPermissions('role_'+id);
  if(!name){ alert('Rol adı gerekli'); return; }
  const { error } = await sb.rpc('manager_upsert_role', { p_token: session.session_token, p_id: id, p_name: name, p_permissions: perms });
  if(error){ alert(error.message); return; }
  closeSheet();
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
  closeSheet();
  renderSettingsView(document.getElementById('main'), session);
}
async function deleteRole(id){
  if(!await uiConfirm('Bu rolü silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('manager_delete_role', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  closeSheet();
  renderSettingsView(document.getElementById('main'), session);
}

// ---- Haftalık vardiya planı: yönetici kullanıcı × gün ızgarasını doldurur, personel kendi haftasını görür ----
function spWeekStart(d){ const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); }
function spAddDays(d, n){ const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }
function spHours(a, b){ const m = (t) => { const [h, mi] = String(t).split(':').map(Number); return h * 60 + mi; }; let d = m(b) - m(a); if(d <= 0) d += 1440; return d / 60; }
async function renderShiftPlan(el){
  el = el || document.getElementById('usersSubContent'); if(!el) return;
  const session = getSession();
  if(!APP.spWeek) APP.spWeek = spWeekStart(todayLocalDateStr());
  const wk = APP.spWeek;
  const { data, error } = await sb.rpc('get_shift_plan', { p_token: session.session_token, p_week_start: wk });
  if(error){ el.innerHTML = `<div class="box"><p class="muted">${escapeHtml(error.message)}</p></div>`; return; }
  APP.spData = data;
  const days = Array.from({ length: 7 }, (_, i) => spAddDays(wk, i));
  const names = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const plan = {}; (data.plan || []).forEach(p => { plan[p.user_id + '|' + p.day] = p; });
  const today = todayLocalDateStr();
  const hrs = (data.users || []).map(u => ({ u, h: days.reduce((a, d) => { const p = plan[u.id + '|' + d]; return a + (p ? spHours(p.start, p.end) : 0); }, 0) }));
  const total = hrs.reduce((a, x) => a + x.h, 0), maxH = Math.max(1, ...hrs.map(x => x.h));
  const perDay = days.map(d => (data.users || []).filter(u => plan[u.id + '|' + d]).length);
  el.innerHTML = `<div class="u-mwn box">
    <h2>📅 Vardiya Planı</h2>
    <div class="sh-date">
      <button type="button" class="ico-btn" title="Önceki hafta" ${act('spStep', -7)}>‹</button>
      <b class="sp-wk">${days[0].split('-').reverse().join('.')} – ${days[6].split('-').reverse().join('.')}</b>
      <button type="button" class="ico-btn" title="Sonraki hafta" ${act('spStep', 7)}>›</button>
      <button type="button" class="pc-btn" ${act('spStep', 0)}>Bu hafta</button>
      ${data.manage ? `<button type="button" class="pc-btn" ${act('spCopyPrev')}>⧉ Geçen haftayı kopyala</button>` : ''}
    </div>
    <div class="sp-cards">
      <div class="sp-card"><span>${(data.plan || []).length}</span>Planlı vardiya</div>
      <div class="sp-card"><span>${total.toFixed(1)}</span>Toplam saat</div>
      <div class="sp-card"><span>${hrs.filter(x => x.h > 0).length}/${hrs.length}</span>Planlanan personel</div>
    </div>
    <div class="sp-wrap"><table class="sp-grid"><thead><tr><th>Personel</th>${days.map((d, i) => `<th class="${d === today ? 'sp-today' : ''}">${names[i]}<small>${d.slice(8)}.${d.slice(5, 7)} · ${perDay[i]} kişi</small></th>`).join('')}<th>Saat</th></tr></thead>
      <tbody>${hrs.map(({ u, h }) => `<tr><td class="sp-name">${escapeHtml(u.username)}</td>${days.map(d => { const p = plan[u.id + '|' + d];
        const inner = p ? `<span class="sp-chip">${p.start}–${p.end}</span>${p.note ? `<small>${escapeHtml(p.note)}</small>` : ''}` : (data.manage ? '<span class="sp-add">+</span>' : '<span class="muted">—</span>');
        return `<td class="sp-cell ${d === today ? 'sp-today' : ''}" ${data.manage ? act('spEdit', u.id, d) : ''}>${inner}</td>`; }).join('')}
        <td><div class="sp-bar"><i style="width:${(h / maxH * 100).toFixed(0)}%"></i></div><b>${h.toFixed(1)}</b></td></tr>`).join('') || `<tr><td colspan="9" class="muted">Personel yok</td></tr>`}</tbody></table></div>
    ${data.manage ? '<p class="u-fs125 muted">Bir hücreye tıklayıp saat girin; boş bırakıp kaydederseniz o günün planı silinir.</p>' : ''}
  </div>`;
}
function spStep(n){ APP.spWeek = n ? spAddDays(APP.spWeek, n) : spWeekStart(todayLocalDateStr()); renderShiftPlan(); }
async function spCopyPrev(){
  const { data, error } = await sb.rpc('copy_shift_plan_week', { p_token: getSession().session_token, p_week_start: APP.spWeek });
  if(error) return showToast(error.message, 'error');
  showToast(data ? data + ' vardiya kopyalandı' : 'Kopyalanacak vardiya yok (ya da zaten dolu)'); renderShiftPlan();
}
function spEdit(uid, day){
  const p = (APP.spData.plan || []).find(x => x.user_id === uid && x.day === day) || {};
  const u = (APP.spData.users || []).find(x => x.id === uid) || {};
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'spModal';
  const presets = [['08:00', '16:00'], ['09:00', '17:00'], ['12:00', '20:00'], ['16:00', '00:00']];
  bg.innerHTML = `<div class="box sp-modal"><h3>${escapeHtml(u.username || '')} · ${day.split('-').reverse().join('.')}</h3>
    <div class="sp-presets">${presets.map(([a, b]) => `<button type="button" class="pc-btn" ${act('spPreset', a, b)}>${a}–${b}</button>`).join('')}</div>
    <label>Başlangıç<input type="time" id="spStart" value="${p.start || ''}"></label>
    <label>Bitiş<input type="time" id="spEnd" value="${p.end || ''}"></label>
    <label>Not<input type="text" id="spNote" maxlength="60" value="${escapeAttr(p.note || '')}"></label>
    <div class="sp-actions"><button type="button" class="ghost-btn" ${act('spClose')}>Vazgeç</button>
      ${p.start ? `<button type="button" class="ghost-btn" ${act('spSave', uid, day, true)}>Sil</button>` : ''}
      <button type="button" class="sp-save" ${act('spSave', uid, day, false)}>Kaydet</button></div></div>`;
  document.body.appendChild(bg);
}
function spPreset(a, b){ document.getElementById('spStart').value = a; document.getElementById('spEnd').value = b; }
function spClose(){ const m = document.getElementById('spModal'); if(m) m.remove(); }
async function spSave(uid, day, del){
  const st = del ? '' : document.getElementById('spStart').value, en = del ? '' : document.getElementById('spEnd').value;
  const { error } = await sb.rpc('set_shift_plan', { p_token: getSession().session_token, p_user_id: uid, p_day: day, p_start: st, p_end: en, p_note: del ? '' : document.getElementById('spNote').value });
  if(error) return showToast(error.message, 'error');
  spClose(); renderShiftPlan();
}
