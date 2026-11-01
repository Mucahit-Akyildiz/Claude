/* ---- Limitli hesaplar ----
   Kişi: günlük limit (devretmez), bir sipariş etiketine bağlı; siparişte seçilince etiket işaretlenir.
   Kullanıcı: günlük (kullanılmayan devreder) ya da aylık limit; siparişi alan kullanıcı kendi etiketini
   seçerse kendi limitinden düşer. Limit içindeki hesap hazır olunca ikram gibi 15 sn sonra ödemesiz kapanır;
   limiti aşan hesap Ödemeler'e normal düşer ve kalan limit kadar indirim uygulanır (bkz. allowance_usage). */
async function loadAllowances(){
  const s = getSession(); if(!s) return [];
  const [{ data }, { data: st }] = await Promise.all([sb.rpc('list_allowances', { p_token: s.session_token }), sb.rpc('get_allowance_settings', { p_token: s.session_token })]);
  APP.allowancesEnabled = !!(st && st.enabled);
  APP.allowancesAll = data || [];
  // Özellik kapalıyken sipariş ve ödeme tarafında limit hiç kullanılmaz.
  APP.allowances = APP.allowancesEnabled ? APP.allowancesAll : [];
  APP.allowanceRequirePick = !st || st.require_pick !== false;
  return APP.allowancesAll;
}
function allowanceById(id){ return (APP.allowances || []).find(a => a.id === id); }

/* Ayarlar > Kullanıcılar & Vardiyalar > Limitler */
async function renderAllowancesSettings(el){
  el.innerHTML = '<p class="muted">Yükleniyor…</p>';
  const list = await loadAllowances();
  const flags = (APP.config && APP.config.order_flags) || [];
  const users = ((APP.config && APP.config.users) || []).filter(u => u.is_active !== false);
  const flagSel = (id, cur) => `<select id="${id}"><option value="">— Etiket yok —</option>${flags.map(f => `<option value="${escapeAttr(f.label)}" ${cur===f.label?'selected':''}>${escapeHtml(f.label)}</option>`).join('')}</select>`;
  const bar = (a) => { const cap = a.period === 'monthly' || !a.carry_over ? Number(a.limit_amount) : Math.max(Number(a.limit_amount), Number(a.remaining));
    const pct = cap > 0 ? Math.min(100, Math.round(Number(a.remaining) / cap * 100)) : 0;
    return `<div class="al-bar"><span style="width:${pct}%;"></span></div>`; };
  const row = (a) => `<div class="al-row ${a.is_active ? '' : 'off'}" data-q="${escapeAttr((String(a.name || '') + ' ' + String(a.phone || '').replace(/\D/g, '')).toLocaleLowerCase('tr'))}">
      <div class="al-top"><span class="al-av">${a.kind === 'person' ? '🎓' : '👔'}</span>
        <div class="al-main"><b>${escapeHtml(a.name || '')}</b>
          <small>${alPeriodLabel(a)} · ${money(a.limit_amount)}${a.flag_label ? ' · 🏷️ ' + escapeHtml(a.flag_label) : ''}${a.phone ? ' · 📞 ' + escapeHtml(maskPhoneAl(a.phone)) : ''}${a.is_active ? '' : ' · pasif'}</small></div>
        <div class="al-rem"><b>${money(a.remaining)}</b><small>kalan</small></div></div>
      ${bar(a)}
      <div class="al-bot"><small>Bugün harcanan: <b>${money(a.used_today)}</b></small>
        <div class="al-act">
          <button type="button" class="ghost-btn" title="Düzenle" ${act('editAllowance', a.id)}>✏️</button>
          <button type="button" class="ghost-btn" title="${a.is_active ? 'Pasife al' : 'Aktifleştir'}" ${act('toggleAllowance', a.id)}>${a.is_active ? '⏸' : '▶️'}</button>
          <button type="button" class="ghost-btn" title="Sil" ${act('deleteAllowance', a.id)}>🗑️</button>
        </div></div></div>`;
  const persons = list.filter(a => a.kind === 'person'), ulist = list.filter(a => a.kind === 'user');
  const free = users.filter(u => !ulist.some(a => a.user_id === u.id));
  const on = !!APP.allowancesEnabled;
  const hero = `<div class="oo-hero ${on ? 'on' : ''}"><div class="oo-hero-ic">💳</div>
      <div class="oo-hero-t"><b>Limitli hesaplar</b><small>Kişilere günlük, kullanıcılara günlük ya da aylık harcama limiti verin. Limit içindeki hesap hazır olunca 15 sn sonra kendiliğinden kapanır ve Finansal Analiz'e işlenir; limiti aşan hesapta fark Ödemeler'den alınır.</small></div>
      <label class="oo-switch" title="Limitli hesapları aç/kapat"><input type="checkbox" ${on ? 'checked' : ''} ${actOn('change','setAllowancesEnabled',['$checked'])}><span class="oo-track"><span class="oo-thumb"></span></span><em>${on ? 'Açık' : 'Kapalı'}</em></label></div>`;
  if(!on){
    el.innerHTML = `<div class="al-wrap ix-box">${hero}
      <div class="al-off">
        ${[['🎓','Kişilere günlük limit','Talebe, öğrenci, abone… her gün belirlediğiniz tutar kadar alışveriş; ertesi güne aktarılmaz.'],
           ['👔','Personele limit','Günlük (kullanılmayan devreder) ya da aylık personel yemeği limiti.'],
           ['⚡','Otomatik kapanış','Limit içindeki hesap hazır olunca 15 sn sonra kendiliğinden kapanır, Finansal Analiz\'e işlenir.'],
           ['📊','Raporlar','Kim ne aldı, ne kadar harcadı; Finansal Analiz ve garson kartlarında.']].map(([ic, t, d], i) => `<div class="al-off-c" style="--i:${i};"><span>${ic}</span><b>${t}</b><small>${d}</small></div>`).join('')}
      </div>
      ${list.length ? `<p class="ix-note">ℹ️ Kayıtlı ${list.length} limit var; açtığınızda kaldığı yerden devam eder.</p>` : ''}
      <button type="button" class="ix-save al-on-btn" ${act('setAllowancesEnabled', true)}>💳 Limitli hesapları kullanmaya başla</button>
    </div>`;
    return;
  }
  const act_ = list.filter(a => a.is_active), usedT = act_.reduce((x, a) => x + Number(a.used_today || 0), 0), remT = act_.reduce((x, a) => x + Number(a.remaining || 0), 0);
  const pT = usedT + remT ? Math.round(usedT / (usedT + remT) * 100) : 0;
  const top5 = act_.slice().sort((a, b) => Number(b.used_today) - Number(a.used_today)).filter(a => Number(a.used_today) > 0).slice(0, 5), mx5 = Math.max(1, ...top5.map(a => Number(a.used_today)));
  const overview = act_.length ? `<div class="al-ov">
      <div class="fs-panel pa-sec" style="--t:#14b8a6;"><h3><i>⏱</i>Bugün</h3><div class="lx-gauge">${typeof svgGauge === 'function' ? svgGauge(pT, '#14b8a6', money(usedT), 'bugün harcanan · %' + pT) : ''}<div class="lx-g-leg"><span><i style="background:#14b8a6"></i>Harcanan</span><span><i style="background:color-mix(in srgb,var(--muted) 35%,transparent)"></i>Kalan ${money(remT)}</span></div></div></div>
      <div class="fs-panel pa-sec" style="--t:#6366f1;"><h3><i>🍩</i>Dağılım</h3>${svgDonut([{ label: '🎓 Kişi', value: act_.filter(a => a.kind === 'person').length, color: '#14b8a6' }, { label: '👔 Kullanıcı', value: act_.filter(a => a.kind === 'user').length, color: '#6366f1' }, { label: '⏸ Pasif', value: list.length - act_.length, color: '#94a3b8' }].filter(x => x.value), { center: String(list.length), sub: 'limit' })}</div>
      <div class="fs-panel pa-sec" style="--t:#f59e0b;"><h3><i>🔥</i>Bugün En Çok Harcayan</h3>${top5.length ? `<div class="gx-hbars">${top5.map((a, i) => `<div class="gx-hb" style="--i:${i};--c:${a.kind === 'person' ? '#14b8a6' : '#6366f1'};"><div class="gx-hb-l"><span>${a.kind === 'person' ? '🎓' : '👔'} ${escapeHtml(a.name || '')}</span><b>${money(a.used_today)}</b></div><div class="gx-hb-t"><i style="width:${Math.max(4, Number(a.used_today) / mx5 * 100)}%;"></i></div></div>`).join('')}</div>` : '<p class="muted">Bugün henüz limitten harcama yok.</p>'}</div>
    </div>` : '';
  el.innerHTML = `<div class="al-wrap ix-box">
    ${hero}${overview}
    <label class="al-req"><span class="oo-switch"><input type="checkbox" ${APP.allowanceRequirePick !== false ? 'checked' : ''} ${actOn('change','setAllowanceRequire',['$checked'])}><span class="oo-track"><span class="oo-thumb"></span></span></span>
      <span><b>Limitli etikette kişi seçimi zorunlu</b><small>Açıkken Personel / Talebe gibi limite bağlı bir etiket işaretlenince, limitinden düşülecek kişi ya da kullanıcı seçilmeden sipariş gönderilemez. Kapalıyken seçim isteğe bağlıdır; kimse seçilmezse hesap limitten düşmez, normal ikram gibi kapanır.</small></span></label>
    <div class="al-top-bar"><input class="al-filter" type="search" placeholder="🔍 Ad veya telefonla ara…" autocomplete="off" ${actOn('input','alFilter',['$value'])}>
      ${typeof excelBarHtml === 'function' ? excelBarHtml('allowances') : ''}</div>
    <div class="al-card al-one">
      <div class="al-h"><span>💳</span><div><b>Limitli hesaplar</b><small>Kişiler 🎓 ve kullanıcılar 👔 tek listede · günlük (devreder / devretmez) veya aylık</small></div><em>${list.length}</em></div>
      <div class="al-list al-list-grid">${list.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr')).map(row).join('') || '<p class="muted al-empty">Henüz limit yok</p>'}</div>
      <div class="al-form" id="alForm">
        <div class="al-who">
          <button type="button" class="al-who-b ${APP.alWho !== 'user' ? 'on' : ''}" ${act('setAlWho', 'person')}>🎓 Kişi <small>giriş yapmayan (talebe, abone…)</small></button>
          <button type="button" class="al-who-b ${APP.alWho === 'user' ? 'on' : ''}" ${act('setAlWho', 'user')}>👔 Kullanıcı <small>personel hesabı</small></button>
        </div>
        <div class="ix-form">
          ${APP.alWho === 'user'
            ? `<div style="grid-column:1/-1;"><label>Kullanıcılar <small class="muted" id="alUCount">(birden fazla seçebilirsiniz)</small></label>
              ${free.length ? `<div class="al-users"><button type="button" class="al-uall" ${act('alToggleAllUsers')}>Tümünü seç</button>${free.map(u => `<label class="al-u"><input type="checkbox" value="${u.id}" ${actOn('change','alUserCount',[])}><span>${escapeHtml(u.username)}</span></label>`).join('')}</div>` : '<p class="muted al-empty">Tüm kullanıcıların limiti var</p>'}</div>`
            : `<div><label>Ad soyad</label><input id="al_p_name" placeholder="ör. Ahmet Yılmaz" maxlength="60"></div>
               <div><label>Telefon</label><input id="al_p_phone" type="tel" inputmode="tel" placeholder="05xx xxx xx xx" maxlength="20"></div>`}
          <div><label>Dönem</label><select id="al_period">
            <option value="daily" ${APP.alWho !== 'user' ? 'selected' : ''}>Günlük · devretmez (kalan ertesi güne geçmez)</option>
            <option value="carry" ${APP.alWho === 'user' ? 'selected' : ''}>Günlük · devreder (kullanılmayan birikir)</option>
            <option value="monthly">Aylık</option></select></div>
          <div><label>Limit (₺)</label><input id="al_limit" type="number" min="0" step="1" inputmode="decimal" placeholder="250"></div>
          <div><label>Sipariş etiketi</label>${flagSel('al_flag', (flags.find(f => APP.alWho === 'user' ? /personel/i.test(f.label) : /talebe|öğrenci/i.test(f.label)) || flags[0] || {}).label)}</div>
        </div>
        <button type="button" class="ix-save" ${act('saveAllowanceForm')}>＋ ${APP.alWho === 'user' ? 'Seçilenlere limit ekle' : 'Kişi ekle'}</button>
      </div>
    </div>
    <p class="ix-note">ℹ️ Kişi seçildiğinde etiketi otomatik işaretlenir. Sipariş penceresinde kişi ya da kullanıcı adıyla aranıp seçilir; limitli bir etiket işaretlendiğinde seçim zorunludur (siparişi alan kendisi için de kendini seçer). ${flags.length ? '' : '<b>Önce Ayarlar → Sipariş Etiketleri\'nden bir etiket ekleyin.</b>'}</p>
  </div>`;
}
function alPeriodLabel(a){ return a.period === 'monthly' ? 'Aylık' : a.carry_over ? 'Günlük · devreder' : 'Günlük · devretmez'; }
function setAlWho(w){ APP.alWho = w; renderAllowancesSettings(document.getElementById('usersSubContent')); }
async function saveAllowanceForm(){
  const v = (x) => ((document.getElementById(x) || {}).value || '').trim();
  const pv = v('al_period'), period = pv === 'monthly' ? 'monthly' : 'daily', carry = pv === 'carry';
  const base = { period, carry_over: carry, limit_amount: v('al_limit'), flag_label: v('al_flag') };
  if(APP.alWho === 'user'){
    const ids = [...document.querySelectorAll('.al-users input:checked')].map(i => i.value);
    if(!ids.length){ alert('En az bir kullanıcı seçin'); return; }
    const errs = [];
    await withLoadingOverlay((async () => { for(const uid of ids){
      const { error } = await sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: Object.assign({ kind: 'user', user_id: uid }, base) });
      if(error){ const u = ((APP.config && APP.config.users) || []).find(x => x.id === uid); errs.push((u ? u.username : uid) + ': ' + error.message); }
    } })());
    if(errs.length) alert('Bazı kullanıcılar eklenemedi:\n\n' + errs.join('\n'));
    if(errs.length < ids.length) showToast(`${ids.length - errs.length} kullanıcıya limit eklendi ✓`);
  } else {
    const { error } = await withLoadingOverlay(sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: Object.assign({ kind: 'person', name: v('al_p_name'), phone: v('al_p_phone') }, base) }));
    if(error){ alert(error.message); return; }
    showToast('Limit eklendi ✓');
  }
  renderAllowancesSettings(document.getElementById('usersSubContent'));
}
async function editAllowance(id){
  const a = allowanceById(id); if(!a) return;
  const cur = a.period === 'monthly' ? '3' : a.carry_over ? '2' : '1';
  const pc = prompt(`${a.name} — dönem:\n1 = Günlük · devretmez\n2 = Günlük · devreder\n3 = Aylık`, cur);
  if(pc === null) return;
  const period = pc.trim() === '3' ? 'monthly' : 'daily', carry_over = pc.trim() === '2';
  const lim = prompt(`${a.name} için ${period === 'monthly' ? 'aylık' : 'günlük'} limit (₺):`, a.limit_amount);
  if(lim === null) return;
  const flags = ((APP.config && APP.config.order_flags) || []).map(f => f.label);
  let flag = a.flag_label || '';
  if(flags.length){ const f = prompt('Sipariş etiketi (boş bırakılabilir):\n' + flags.join(', '), flag); if(f === null) return; flag = f.trim(); }
  let phone = a.phone || '';
  if(a.kind === 'person'){ const ph = prompt('Telefon (boş bırakılabilir):', phone); if(ph === null) return; phone = ph.trim(); }
  const { error } = await sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: { id, kind: a.kind, name: a.name, phone, user_id: a.user_id, period, carry_over, limit_amount: lim, flag_label: flag } });
  if(error){ alert(error.message); return; }
  showToast('Limit güncellendi ✓');
  renderAllowancesSettings(document.getElementById('usersSubContent'));
}
async function toggleAllowance(id){
  const a = allowanceById(id); if(!a) return;
  const { error } = await sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: { id, kind: a.kind, name: a.name, user_id: a.user_id, period: a.period, limit_amount: a.limit_amount, flag_label: a.flag_label, is_active: !a.is_active } });
  if(error){ alert(error.message); return; }
  renderAllowancesSettings(document.getElementById('usersSubContent'));
}
async function deleteAllowance(id){
  const a = allowanceById(id); if(!a || !(await uiConfirm('Kullanım geçmişi de silinir.', { title: `${a.name} limiti silinsin mi?` }))) return;
  const { error } = await sb.rpc('delete_allowance', { p_token: getSession().session_token, p_id: id });
  if(error){ alert(error.message); return; }
  renderAllowancesSettings(document.getElementById('usersSubContent'));
}

async function setAllowancesEnabled(on){
  const { error } = await withLoadingOverlay(sb.rpc('set_allowances_enabled', { p_token: getSession().session_token, p_enabled: !!on }));
  if(error){ alert(error.message); return; }
  showToast(on ? '💳 Limitli hesaplar açıldı' : 'Limitli hesaplar kapatıldı');
  renderAllowancesSettings(document.getElementById('usersSubContent'));
}
async function setAllowanceRequire(on){
  const { error } = await sb.rpc('set_allowance_settings', { p_token: getSession().session_token, p_require_pick: !!on });
  if(error){ alert(error.message); return; }
  APP.allowanceRequirePick = !!on;
  showToast(on ? 'Kişi seçimi zorunlu ✓' : 'Kişi seçimi isteğe bağlı ✓');
}
function alFilter(q){
  const t = String(q || '').trim().toLocaleLowerCase('tr'), d = t.replace(/\D/g, '');
  const key = d.length >= 3 && d.length === t.replace(/[\s()+-]/g, '').length ? d : t;
  document.querySelectorAll('.al-list').forEach(list => {
    let n = 0; list.querySelectorAll('.al-row').forEach(r => { const ok = !key || r.dataset.q.includes(key); r.style.display = ok ? '' : 'none'; if(ok) n++; });
    let e = list.querySelector('.al-nohit'); if(!e){ e = document.createElement('p'); e.className = 'muted al-empty al-nohit'; e.textContent = 'Eşleşen kayıt yok'; list.appendChild(e); }
    e.style.display = key && !n && list.querySelector('.al-row') ? '' : 'none';
  });
}
function alUserCount(){ const n = document.querySelectorAll('.al-users input:checked').length; const c = document.getElementById('alUCount'); if(c) c.textContent = n ? `(${n} seçili)` : '(birden fazla seçebilirsiniz)';
  const b = document.querySelector('.al-uall'); if(b) b.textContent = n && n === document.querySelectorAll('.al-users input').length ? 'Seçimi kaldır' : 'Tümünü seç'; }
function alToggleAllUsers(){ const all = [...document.querySelectorAll('.al-users input')]; const on = !all.every(i => i.checked); all.forEach(i => { i.checked = on; }); alUserCount(); }

/* ---- Sipariş penceresi: limitli kişi seçimi ---- */
function orderAllowanceHtml(pseudoId){ return `<div class="al-pick-wrap" data-pid="${escapeAttr(String(pseudoId))}">${orderAllowanceInner(pseudoId)}</div>`; }
/* Pencere açılınca kalan limitler tazelenir ve seçim kutusu yeniden çizilir. */
function refreshOrderAllowancePick(){
  loadAllowances().then(() => document.querySelectorAll('.al-pick-wrap').forEach(w => { w.innerHTML = orderAllowanceInner(w.dataset.pid); }));
}
function orderAllowanceInner(pseudoId){
  if(!(APP.allowances || []).some(a => a.is_active)) return '';
  APP.orderAllowance = APP.orderAllowance || {};
  if(!(pseudoId in APP.orderAllowance)){ const ex = liveOrderForTable(pseudoId); APP.orderAllowance[pseudoId] = (ex && ex.allowance_id) || null; }
  const cur = allowanceById(APP.orderAllowance[pseudoId]);
  // Masa ve pakette arama müşteri kutusunda birleşik; burada yalnızca seçilen limit gösterilir.
  if(!cur && !/^(wl|rs)_/.test(String(pseudoId))) return '';
  const pid = escapeAttr(String(pseudoId));
  return `<div class="of-box al-pick">
    <div class="of-head"><span>💳 Limit</span><small>${cur ? 'Bu hesap limitten düşer' : 'Ad (2 harf) veya telefonla arayın'}</small></div>
    ${cur && Number(cur.remaining) <= 0 ? `<div class="al-empty">⛔ <b>${escapeHtml(cur.name)}</b> kişisinin limiti bitmiş. Bu hesap limitten düşmez; tutarın tamamı Ödemeler'den tahsil edilmeli.</div>` : ''}
    ${cur ? `<div class="al-sel"><span class="al-sel-ic">${cur.kind === 'user' ? '👔' : '🎓'}</span><div><b>${escapeHtml(cur.name)}</b><small>${money(cur.remaining)} kaldı${cur.phone ? ' · ' + escapeHtml(maskPhoneAl(cur.phone)) : ''}${cur.flag_label ? ' · 🏷️ ' + escapeHtml(cur.flag_label) : ''}</small></div>
      <button type="button" class="al-x" title="Kaldır" ${act('pickOrderAllowance', pseudoId, cur.id)}>✕</button></div>`
    : !/^(wl|rs)_/.test(String(pseudoId)) ? '' : `<input class="al-search" type="search" placeholder="🔍 Kişi veya kullanıcı ara: ad / telefon" autocomplete="off" data-pid="${pid}" ${actOn('input','alSearch',[pseudoId, '$value'])}>
      <div class="al-results" id="alRes_${pid}"></div>`}
  </div>`;
}
// Telefonun yalnızca son 4 hanesi gösterilir (KVKK).
function allowanceSearchHits(q){
  const t = String(q || '').trim(), digits = t.replace(/\D/g, '');
  const byPhone = digits.length >= 3 && digits.length === t.replace(/[\s()+-]/g, '').length;
  const k = t.toLocaleLowerCase('tr');
  return (APP.allowances || []).filter(a => a.is_active && (byPhone ? String(a.phone || '').replace(/\D/g, '').includes(digits) : String(a.name || '').toLocaleLowerCase('tr').includes(k))).slice(0, 6);
}
/* Müşteri aramasından limitli kişi/kullanıcı seçildi: limit bağlanır, ad (ve telefon) müşteri alanına yazılır. */
function pickAllowanceFromCust(aid, prefix){
  const a = allowanceById(aid); if(!a) return;
  const bg = document.getElementById('tableModalBg'); const pid = bg ? bg.dataset.tableId : null; if(!pid) return;
  APP.orderAllowance = APP.orderAllowance || {};
  if(APP.orderAllowance[pid] !== aid) pickOrderAllowance(pid, aid);
  const n = document.getElementById(prefix + 'Name'), p = document.getElementById(prefix + 'Phone');
  if(n) n.value = a.name || '';
  if(p && a.phone && !p.value) p.value = a.phone;
  const box = document.getElementById(prefix + 'Suggest'); if(box) box.innerHTML = '';
  if(prefix === 'tableCust' && typeof saveTableCustomer === 'function') saveTableCustomer(pid, true);
  showToast((a.kind === 'user' ? '👔 ' : '🎓 ') + a.name + ' · limit bağlandı');
}
/* Müşteri seçilince/yazılınca eşleşen limitli kişi ya da kullanıcı varsa limit bağlanır ve etiketi otomatik işaretlenir.
   Eşleşme: telefon (son 10 hane) ya da ad; ad tam tutmazsa ilk kelimesi tek bir kayda denk geliyorsa. */
function autoAllowanceForCustomer(name, phone){
  const bg = document.getElementById('tableModalBg'); const pid = bg ? bg.dataset.tableId : null; if(!pid) return;
  if(APP.orderAllowance && APP.orderAllowance[pid]) return;
  const list = (APP.allowances || []).filter(a => a.is_active);
  const d = String(phone || '').replace(/\D/g, '').slice(-10), n = String(name || '').trim().toLocaleLowerCase('tr');
  let hit = d.length >= 10 ? list.find(a => String(a.phone || '').replace(/\D/g, '').slice(-10) === d) : null;
  if(!hit && n) hit = list.find(a => String(a.name || '').trim().toLocaleLowerCase('tr') === n);
  if(!hit && n){ const w = n.split(/\s+/)[0]; const m = list.filter(a => String(a.name || '').trim().toLocaleLowerCase('tr') === w || String(a.name || '').trim().toLocaleLowerCase('tr').split(/\s+/)[0] === w); if(m.length === 1) hit = m[0]; }
  if(!hit) return;
  pickOrderAllowance(pid, hit.id);
  showToast((hit.kind === 'user' ? '👔 ' : '🎓 ') + hit.name + ' · limit bağlandı' + (hit.flag_label ? ', ' + hit.flag_label + ' etiketi seçildi' : ''));
}
function maskPhoneAl(p){ const d = String(p || '').replace(/\D/g, ''); return d.length > 4 ? '••• ' + d.slice(-4) : d; }
function alSearch(pseudoId, q){
  const box = document.getElementById('alRes_' + pseudoId); if(!box) return;
  const t = String(q || '').trim(), digits = t.replace(/\D/g, '');
  const byPhone = digits.length >= 3 && digits.length === t.replace(/[\s()+-]/g, '').length;
  if(!byPhone && t.length < 2){ box.innerHTML = ''; return; }
  const k = t.toLocaleLowerCase('tr');
  const hits = (APP.allowances || []).filter(a => a.is_active && (byPhone ? String(a.phone || '').replace(/\D/g, '').includes(digits) : String(a.name || '').toLocaleLowerCase('tr').includes(k))).slice(0, 8);
  box.innerHTML = hits.length ? hits.map(a => `<button type="button" class="al-hit" ${act('pickOrderAllowance', pseudoId, a.id)}><b>${a.kind === 'user' ? '👔' : '🎓'} ${escapeHtml(a.name)}</b><small>${a.phone ? escapeHtml(maskPhoneAl(a.phone)) + ' · ' : ''}${money(a.remaining)} kaldı</small></button>`).join('')
    : '<p class="muted al-empty">Eşleşen kişi yok</p>';
}
function pickOrderAllowance(pseudoId, id){
  APP.orderAllowance = APP.orderAllowance || {};
  const prev = allowanceById(APP.orderAllowance[pseudoId]);
  const next = APP.orderAllowance[pseudoId] === id ? null : id;
  APP.orderAllowance[pseudoId] = next;
  document.querySelectorAll('.al-pick-wrap').forEach(w => { if(w.dataset.pid === String(pseudoId)) w.innerHTML = orderAllowanceInner(pseudoId); });
  const setFlag = (label, on) => { if(!label) return; toggleOrderFlag(pseudoId, label, on);
    document.querySelectorAll('.of-chip input[data-label]').forEach(i => { if(i.dataset.label === label) i.checked = on; }); };
  if(prev && prev.flag_label && (!next || allowanceById(next).flag_label !== prev.flag_label)) setFlag(prev.flag_label, false);
  if(next) setFlag(allowanceById(next).flag_label, true);
  if(next && Number(allowanceById(next).remaining) <= 0) showToast('⛔ ' + allowanceById(next).name + ' kişisinin limiti bitmiş: hesap limitten düşmeyecek');
  if(typeof refreshOrderFlagsBox === 'function') refreshOrderFlagsBox(pseudoId);
}
/* Siparişe hangi limit uygulanır: seçilen kişi, yoksa siparişi alan kullanıcının etiketi seçiliyse kendi limiti. */
function orderAllowanceFor(pseudoId){
  // Limit yalnızca açıkça seçilen kişi/kullanıcıdan düşer (siparişi alan kendisi de dahil, seçilmeli).
  const picked = APP.orderAllowance && APP.orderAllowance[pseudoId];
  return picked ? allowanceById(picked) : null;
}
/* Seçili etiketlerden biri bir limite bağlıysa kişi/kullanıcı seçimi zorunludur. */
function allowanceRequiredMissing(pseudoId){
  if(APP.allowanceRequirePick === false || orderAllowanceFor(pseudoId)) return null;
  const tags = (APP.orderFlagSelections && APP.orderFlagSelections[pseudoId]) || [];
  return tags.find(t => (APP.allowances || []).some(a => a.is_active && a.flag_label === t)) || null;
}
/* Gönderimden önce: hesap limiti aşıyorsa siparişi alana uyarı (sipariş yine gönderilir). */
async function allowanceWarnBeforeSend(pseudoId, draftTotal){
  const need = allowanceRequiredMissing(pseudoId);
  if(need){ alert(`🏷️ "${need}" etiketi seçili.\n\nLimitinden düşülecek kişiyi ya da kullanıcıyı (kendiniz dahil) üstteki arama kutusundan seçin.`); const i = document.getElementById('tableCustName') || document.getElementById('pkgCustName'); if(i) i.focus(); return false; }
  const a = orderAllowanceFor(pseudoId); if(!a) return true;
  const ex = liveOrderForTable(pseudoId);
  const open = ex ? ex.items.filter(i => !i.paid).reduce((s, i) => s + i.price * i.qty, 0) : 0;
  const total = open + draftTotal;
  if(total <= Number(a.remaining)) return true;
  return uiConfirm(`Hesap: ${money(total)}\nKalan limit: ${money(a.remaining)}\nFark: ${money(total - Number(a.remaining))}\n\nSipariş gönderilecek; fark Ödemeler'den tahsil edilmeli.`,
    { title: `${a.name} limiti aşılıyor`, icon: '⚠️', okText: 'Devam et, gönder', cancelText: 'Vazgeç', danger: false });
}
async function attachAllowanceAfterSend(pseudoId, prevOrderIds){
  const a = orderAllowanceFor(pseudoId);
  let o = liveOrderForTable(pseudoId);
  if(!o && pseudoId === 'pkg_new'){ const me = getSession().user_id;
    o = (APP.liveOrders || []).filter(x => x.kind === 'takeaway' && !prevOrderIds.has(x.order_id) && x.created_by === me).sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0]; }
  if(!o || (o.allowance_id || null) === (a ? a.id : null)) return;
  if(!a && !o.allowance_id) return;
  const { error } = await sb.rpc('set_order_allowance', { p_token: getSession().session_token, p_order_id: o.order_id, p_allowance_id: a ? a.id : null });
  if(error){ showToast('⚠️ Limit siparişe bağlanamadı: ' + error.message); return; }
  const { data } = await sb.rpc('get_live_orders', { p_token: getSession().session_token });
  if(data) APP.liveOrders = data;
  loadAllowances();
}
/* Ödemeler: limitli hesap limit içinde mi? (o.allowance_remaining sunucudan gelir) */
function allowanceCovers(o){
  if(!o.allowance_id) return null;
  const total = o.items.filter(i => !i.paid).reduce((s, i) => s + i.price * i.qty, 0);
  return total <= Number(o.allowance_remaining || 0);
}
