/* ---- Limitli hesaplar ----
   Kişi: günlük limit (devretmez), bir sipariş etiketine bağlı; siparişte seçilince etiket işaretlenir.
   Kullanıcı: günlük (kullanılmayan devreder) ya da aylık limit; siparişi alan kullanıcı kendi etiketini
   seçerse kendi limitinden düşer. Limit içindeki hesap hazır olunca ikram gibi 15 sn sonra ödemesiz kapanır;
   limiti aşan hesap Ödemeler'e normal düşer ve kalan limit kadar indirim uygulanır (bkz. allowance_usage). */
async function loadAllowances(){
  const s = getSession(); if(!s) return [];
  const { data } = await sb.rpc('list_allowances', { p_token: s.session_token });
  APP.allowances = data || [];
  return APP.allowances;
}
function allowanceById(id){ return (APP.allowances || []).find(a => a.id === id); }

/* Ayarlar > Kullanıcılar & Vardiyalar > Limitler */
async function renderAllowancesSettings(el){
  el.innerHTML = '<p class="muted">Yükleniyor…</p>';
  const list = await loadAllowances();
  const flags = (APP.config && APP.config.order_flags) || [];
  const users = ((APP.config && APP.config.users) || []).filter(u => u.is_active !== false);
  const flagSel = (id, cur) => `<select id="${id}"><option value="">— Etiket yok —</option>${flags.map(f => `<option value="${escapeAttr(f.label)}" ${cur===f.label?'selected':''}>${escapeHtml(f.label)}</option>`).join('')}</select>`;
  const bar = (a) => { const cap = a.period === 'monthly' || a.kind === 'person' ? Number(a.limit_amount) : Math.max(Number(a.limit_amount), Number(a.remaining));
    const pct = cap > 0 ? Math.min(100, Math.round(Number(a.remaining) / cap * 100)) : 0;
    return `<div class="al-bar"><span style="width:${pct}%;"></span></div>`; };
  const row = (a) => `<div class="al-row ${a.is_active ? '' : 'off'}">
      <div class="al-top"><span class="al-av">${a.kind === 'person' ? '🎓' : '👔'}</span>
        <div class="al-main"><b>${escapeHtml(a.name || '')}</b>
          <small>${a.kind === 'person' ? 'Günlük · devretmez' : a.period === 'monthly' ? 'Aylık' : 'Günlük · devreder'} · ${money(a.limit_amount)}${a.flag_label ? ' · 🏷️ ' + escapeHtml(a.flag_label) : ''}${a.is_active ? '' : ' · pasif'}</small></div>
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
  el.innerHTML = `<div class="al-wrap ix-box">
    <div class="oo-hero on"><div class="oo-hero-ic">💳</div>
      <div class="oo-hero-t"><b>Limitli hesaplar</b><small>Kişilere günlük, kullanıcılara günlük ya da aylık harcama limiti verin. Limit içindeki hesap hazır olunca 15 sn sonra kendiliğinden kapanır ve Finansal Analiz'e işlenir; limiti aşan hesapta fark Ödemeler'den alınır.</small></div></div>
    ${typeof excelBarHtml === 'function' ? excelBarHtml('allowances') : ''}
    <div class="al-grid">
      <div class="al-card">
        <div class="al-h"><span>🎓</span><div><b>Kişiler</b><small>Günlük limit · ertesi güne aktarılmaz</small></div><em>${persons.length}</em></div>
        <div class="al-list">${persons.map(row).join('') || '<p class="muted al-empty">Henüz kişi yok</p>'}</div>
        <div class="al-form" id="alPersonForm">
          <div class="ix-form">
            <div><label>Ad soyad</label><input id="al_p_name" placeholder="ör. Ahmet Yılmaz" maxlength="60"></div>
            <div><label>Günlük limit (₺)</label><input id="al_p_limit" type="number" min="0" step="1" inputmode="decimal" placeholder="250"></div>
            <div><label>Sipariş etiketi</label>${flagSel('al_p_flag', (flags.find(f => /talebe|öğrenci/i.test(f.label)) || flags[0] || {}).label)}</div>
          </div>
          <button type="button" class="ix-save" ${act('saveAllowanceForm', 'person')}>＋ Kişi ekle</button>
        </div>
      </div>
      <div class="al-card">
        <div class="al-h"><span>👔</span><div><b>Kullanıcılar</b><small>Günlük (devreder) veya aylık limit</small></div><em>${ulist.length}</em></div>
        <div class="al-list">${ulist.map(row).join('') || '<p class="muted al-empty">Henüz kullanıcı limiti yok</p>'}</div>
        <div class="al-form" id="alUserForm">
          <div class="ix-form">
            <div style="grid-column:1/-1;"><label>Kullanıcılar <small class="muted" id="alUCount">(birden fazla seçebilirsiniz)</small></label>
              ${free.length ? `<div class="al-users"><button type="button" class="al-uall" ${act('alToggleAllUsers')}>Tümünü seç</button>${free.map(u => `<label class="al-u"><input type="checkbox" value="${u.id}" ${actOn('change','alUserCount',[])}><span>${escapeHtml(u.username)}</span></label>`).join('')}</div>` : '<p class="muted al-empty">Tüm kullanıcıların limiti var</p>'}</div>
            <div><label>Dönem</label><select id="al_u_period"><option value="daily">Günlük · devreder</option><option value="monthly">Aylık</option></select></div>
            <div><label>Limit (₺)</label><input id="al_u_limit" type="number" min="0" step="1" inputmode="decimal" placeholder="150"></div>
            <div><label>Sipariş etiketi</label>${flagSel('al_u_flag', (flags.find(f => /personel/i.test(f.label)) || flags[0] || {}).label)}</div>
          </div>
          <button type="button" class="ix-save" ${act('saveAllowanceForm', 'user')}>＋ Seçilenlere limit ekle</button>
        </div>
      </div>
    </div>
    <p class="ix-note">ℹ️ Kişi seçildiğinde etiketi otomatik işaretlenir. Kullanıcı limiti, siparişi alan kullanıcı kendi etiketini seçtiğinde kendi limitinden düşer. ${flags.length ? '' : '<b>Önce Ayarlar → Sipariş Etiketleri\'nden bir etiket ekleyin.</b>'}</p>
  </div>`;
}
async function saveAllowanceForm(kind, id){
  const v = (x) => ((document.getElementById(x) || {}).value || '').trim();
  if(kind === 'user' && !id){
    const ids = [...document.querySelectorAll('.al-users input:checked')].map(i => i.value);
    if(!ids.length){ alert('En az bir kullanıcı seçin'); return; }
    const errs = [];
    await withLoadingOverlay((async () => { for(const uid of ids){
      const { error } = await sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: { kind, user_id: uid, period: v('al_u_period'), limit_amount: v('al_u_limit'), flag_label: v('al_u_flag') } });
      if(error){ const u = ((APP.config && APP.config.users) || []).find(x => x.id === uid); errs.push((u ? u.username : uid) + ': ' + error.message); }
    } })());
    if(errs.length) alert('Bazı kullanıcılar eklenemedi:\n\n' + errs.join('\n'));
    if(errs.length < ids.length) showToast(`${ids.length - errs.length} kullanıcıya limit eklendi ✓`);
    renderAllowancesSettings(document.getElementById('usersSubContent'));
    return;
  }
  const p = kind === 'person'
    ? { id: id || null, kind, name: v('al_p_name'), limit_amount: v('al_p_limit'), flag_label: v('al_p_flag') }
    : { id: id || null, kind, user_id: v('al_u_user'), period: v('al_u_period'), limit_amount: v('al_u_limit'), flag_label: v('al_u_flag') };
  const { error } = await withLoadingOverlay(sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: p }));
  if(error){ alert(error.message); return; }
  showToast(id ? 'Limit güncellendi ✓' : 'Limit eklendi ✓');
  renderAllowancesSettings(document.getElementById('usersSubContent'));
}
async function editAllowance(id){
  const a = allowanceById(id); if(!a) return;
  const lim = prompt(`${a.name} için ${a.kind === 'user' && a.period === 'monthly' ? 'aylık' : 'günlük'} limit (₺):`, a.limit_amount);
  if(lim === null) return;
  const flags = ((APP.config && APP.config.order_flags) || []).map(f => f.label);
  let flag = a.flag_label || '';
  if(flags.length){ const f = prompt('Sipariş etiketi (boş bırakılabilir):\n' + flags.join(', '), flag); if(f === null) return; flag = f.trim(); }
  const { error } = await sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: { id, kind: a.kind, name: a.name, user_id: a.user_id, period: a.period, limit_amount: lim, flag_label: flag } });
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
  const a = allowanceById(id); if(!a || !confirm(`${a.name} limiti silinsin mi? Kullanım geçmişi de silinir.`)) return;
  const { error } = await sb.rpc('delete_allowance', { p_token: getSession().session_token, p_id: id });
  if(error){ alert(error.message); return; }
  renderAllowancesSettings(document.getElementById('usersSubContent'));
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
  const persons = (APP.allowances || []).filter(a => a.kind === 'person' && a.is_active);
  if(!persons.length) return '';
  APP.orderAllowance = APP.orderAllowance || {};
  if(!(pseudoId in APP.orderAllowance)){ const ex = liveOrderForTable(pseudoId); APP.orderAllowance[pseudoId] = (ex && ex.allowance_id) || null; }
  const cur = APP.orderAllowance[pseudoId];
  return `<div class="of-box al-pick">
    <div class="of-head"><span>🎓 Limitli kişi</span><small>Seçince etiketi işaretlenir</small></div>
    <div class="of-chips">${persons.map(a => `<button type="button" class="al-chip ${cur === a.id ? 'on' : ''}" data-aid="${a.id}" ${act('pickOrderAllowance', pseudoId, a.id)}>
      <b>${escapeHtml(a.name)}</b><small>${money(a.remaining)} kaldı</small></button>`).join('')}</div>
  </div>`;
}
function pickOrderAllowance(pseudoId, id){
  APP.orderAllowance = APP.orderAllowance || {};
  const prev = allowanceById(APP.orderAllowance[pseudoId]);
  const next = APP.orderAllowance[pseudoId] === id ? null : id;
  APP.orderAllowance[pseudoId] = next;
  document.querySelectorAll('.al-pick .al-chip').forEach(b => b.classList.toggle('on', b.dataset.aid === next));
  const setFlag = (label, on) => { if(!label) return; toggleOrderFlag(pseudoId, label, on);
    document.querySelectorAll('.of-chip input[data-label]').forEach(i => { if(i.dataset.label === label) i.checked = on; }); };
  if(prev && prev.flag_label && (!next || allowanceById(next).flag_label !== prev.flag_label)) setFlag(prev.flag_label, false);
  if(next) setFlag(allowanceById(next).flag_label, true);
}
/* Siparişe hangi limit uygulanır: seçilen kişi, yoksa siparişi alan kullanıcının etiketi seçiliyse kendi limiti. */
function orderAllowanceFor(pseudoId){
  const picked = APP.orderAllowance && APP.orderAllowance[pseudoId];
  if(picked) return allowanceById(picked);
  const tags = (APP.orderFlagSelections && APP.orderFlagSelections[pseudoId]) || [];
  const me = getSession() && getSession().user_id;
  return (APP.allowances || []).find(a => a.kind === 'user' && a.is_active && a.user_id === me && a.flag_label && tags.includes(a.flag_label)) || null;
}
/* Gönderimden önce: hesap limiti aşıyorsa siparişi alana uyarı (sipariş yine gönderilir). */
function allowanceWarnBeforeSend(pseudoId, draftTotal){
  const a = orderAllowanceFor(pseudoId); if(!a) return true;
  const ex = liveOrderForTable(pseudoId);
  const open = ex ? ex.items.filter(i => !i.paid).reduce((s, i) => s + i.price * i.qty, 0) : 0;
  const total = open + draftTotal;
  if(total <= Number(a.remaining)) return true;
  return confirm(`⚠️ ${a.name} limiti aşılıyor\n\nHesap: ${money(total)}\nKalan limit: ${money(a.remaining)}\nFark: ${money(total - Number(a.remaining))}\n\nSipariş gönderilecek; fark Ödemeler'den tahsil edilmeli. Devam edilsin mi?`);
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
