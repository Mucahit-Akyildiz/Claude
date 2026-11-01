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
async function renderAllowancesSettings(el, cached){
  if(!el) return;
  // cached: sunucuya gitmeden eldeki listeyle yeniden çiz (silme/pasife alma sonrası hızlı güncelleme).
  if(!cached || !APP.allowancesAll) el.innerHTML = '<p class="muted">Yükleniyor…</p>';
  const list = cached && APP.allowancesAll ? APP.allowancesAll : await loadAllowances();
  APP.alSel = new Set([...(APP.alSel || [])].filter(id => list.some(a => a.id === id)));
  const flags = (APP.config && APP.config.order_flags) || [];
  const users = ((APP.config && APP.config.users) || []).filter(u => u.is_active !== false);
  const flagSel = (id, cur) => `<select id="${id}"><option value="">— Etiket yok —</option>${flags.map(f => `<option value="${escapeAttr(f.label)}" ${cur===f.label?'selected':''}>${escapeHtml(f.label)}</option>`).join('')}</select>`;
  const bar = (a) => { const cap = a.period === 'monthly' || !a.carry_over ? Number(a.limit_amount) : Math.max(Number(a.limit_amount), Number(a.remaining));
    const pct = cap > 0 ? Math.min(100, Math.round(Number(a.remaining) / cap * 100)) : 0;
    return `<div class="al-bar"><span style="width:${pct}%;"></span></div>`; };
  const row = (a) => `<div class="al-row ${a.is_active ? '' : 'off'}" data-aid="${a.id}" data-q="${escapeAttr((String(a.name || '') + ' ' + String(a.phone || '').replace(/\D/g, '')).toLocaleLowerCase('tr'))}">
      <div class="al-top"><input type="checkbox" class="al-cb" ${APP.alSel && APP.alSel.has(a.id) ? 'checked' : ''} ${actOn('change','alSelToggle',[a.id, '$checked'])} title="Seç"><span class="al-av">${a.kind === 'person' ? '🎓' : '👔'}</span>
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
      <div class="al-h"><span>💳</span><div><b>Limitli hesaplar</b><small>Kişiler 🎓 ve kullanıcılar 👔 tek listede</small></div><em>${list.length}</em></div>
      <div class="al-bulk ${APP.alSel && APP.alSel.size ? 'on' : ''}" id="alBulk"><label class="al-bulk-all"><input type="checkbox" ${actOn('change','alSelAll',['$checked'])}> Tümü</label><b id="alBulkN">${APP.alSel && APP.alSel.size ? APP.alSel.size + ' seçili' : 'Seçerek toplu işlem yapın'}</b><span class="u-f1"></span>
        <button type="button" class="ghost-btn" ${act('alBulkActive', false)}>⏸ Pasife al</button><button type="button" class="ghost-btn" ${act('alBulkActive', true)}>▶️ Aktifleştir</button><button type="button" class="ghost-btn" style="color:var(--red);" ${act('alBulkDelete')}>🗑️ Sil</button></div>
      <div class="al-list al-list-grid">${list.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr')).map(row).join('') || '<p class="muted al-empty">Henüz limit yok</p>'}</div>
      <div class="al-form" id="alForm">
        ${(() => { const sel = (APP.alSelUsers || []).filter(id => free.some(u => u.id === id)), names = sel.map(id => (free.find(u => u.id === id) || {}).username);
          return `<div class="ix-form">
          ${sel.length ? `<div style="grid-column:1/-1;"><label>Seçilen kullanıcılar</label><div class="al-sel">${names.map(n => `<span class="al-chip">👔 ${escapeHtml(n)}</span>`).join('')}<button type="button" class="ghost-btn al-sel-b" ${act('openAlUserPicker')}>✏️ Değiştir</button><button type="button" class="ghost-btn al-sel-b" ${act('clearAlUsers')}>✕ Temizle</button></div></div>`
            : `<div><label>Ad soyad</label><input id="al_p_name" placeholder="ör. Ahmet Yılmaz" maxlength="60"></div>
               <div><label>Telefon</label><input id="al_p_phone" type="tel" inputmode="tel" placeholder="05xx xxx xx xx" maxlength="20"></div>
               <div style="grid-column:1/-1;"><div class="al-or"><span>veya</span></div><button type="button" class="al-pick-users" ${act('openAlUserPicker')} ${free.length ? '' : 'disabled'}><span class="al-pu-ic">👥</span><span class="al-pu-t"><b>Kullanıcı seç</b><small>Personele limit vermek için listeden bir veya birden fazla kullanıcı seçin</small></span><span class="al-pu-go">›</span></button></div>`}
          <div><label>Dönem</label><select id="al_period" ${actOn('change','alPeriodChange',['$value'])}><option value="daily">Günlük</option><option value="monthly">Aylık</option></select></div>
          <div><label>Kalan tutar</label><select id="al_carry"><option value="0" ${sel.length ? '' : 'selected'}>Devretmez</option><option value="1" ${sel.length ? 'selected' : ''}>Devreder</option></select></div>
          <div><label>Limit (₺)</label><input id="al_limit" type="number" min="0" step="1" inputmode="decimal" placeholder="250"></div>
          <div><label>Sipariş etiketi</label>${flagSel('al_flag', (flags.find(f => sel.length ? /personel/i.test(f.label) : /talebe|öğrenci/i.test(f.label)) || flags[0] || {}).label)}</div>
        </div>
        <button type="button" class="ix-save" ${act('saveAllowanceForm')}>＋ ${sel.length ? sel.length + ' kullanıcıya limit ekle' : 'Kişi ekle'}</button>`; })()}
      </div>
    </div>
    <p class="ix-note">ℹ️ Kişi seçildiğinde etiketi otomatik işaretlenir. Sipariş penceresinde kişi ya da kullanıcı adıyla aranıp seçilir; limitli bir etiket işaretlendiğinde seçim zorunludur (siparişi alan kendisi için de kendini seçer). ${flags.length ? '' : '<b>Önce Ayarlar → Sipariş Etiketleri\'nden bir etiket ekleyin.</b>'}</p>
  </div>`;
}
function alPeriodLabel(a){ return a.period === 'monthly' ? 'Aylık' : a.carry_over ? 'Günlük · devreder' : 'Günlük · devretmez'; }
function alPeriodChange(v){ const c = document.getElementById('al_carry'); if(c){ c.disabled = v === 'monthly'; if(v === 'monthly') c.value = '0'; } }
function clearAlUsers(){ APP.alSelUsers = []; renderAllowancesSettings(document.getElementById('usersSubContent'), true); }
/* Kullanıcı seç: limiti olmayan personelden çoklu seçim (ara, tümünü seç / kaldır). Seçim yapılırsa limit kullanıcılara, yapılmazsa adı girilen kişiye eklenir. */
function openAlUserPicker(){
  const lim = (APP.allowances || []).filter(a => a.kind === 'user').map(a => a.user_id);
  const free = ((APP.config && APP.config.users) || []).filter(u => u.is_active !== false && !lim.includes(u.id)).sort((a, b) => String(a.username).localeCompare(String(b.username), 'tr'));
  const sel = new Set(APP.alSelUsers || []);
  const bg = document.createElement('div'); bg.className = 'dg-bg'; bg.style.zIndex = 3000;
  bg.innerHTML = `<div class="dg-card uc-card" style="max-width:440px;text-align:left;"><div class="uc-msg"><p><b>👥 Kullanıcı seç</b></p><p class="muted u-fs12">Limiti olmayan personel listeleniyor.</p></div>
    <input class="uc-in alp-q" type="search" placeholder="🔍 Ara…" autocomplete="off">
    <div style="display:flex;gap:6px;margin:8px 0;"><button type="button" class="pc-btn alp-all">☑ Tümünü seç</button><button type="button" class="pc-btn alp-none">☐ Seçimi kaldır</button><span class="u-f1"></span><small class="muted alp-n"></small></div>
    <div class="alp-list" style="max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:4px;">${free.map(u => `<label class="alp-row" data-q="${escapeAttr(String(u.username).toLocaleLowerCase('tr'))}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;cursor:pointer;"><input type="checkbox" value="${u.id}" ${sel.has(u.id) ? 'checked' : ''} style="width:auto;margin:0;"><span style="flex:1;font-weight:700;">${escapeHtml(u.username)}</span><small class="muted">${escapeHtml((u.role_names || []).join(', '))}</small></label>`).join('') || '<p class="muted">Tüm kullanıcıların limiti var</p>'}</div>
    <div class="uc-acts"><button type="button" class="pc-btn uc-no">Vazgeç</button><button type="button" class="uc-yes">Seç</button></div></div>`;
  const boxes = () => [...bg.querySelectorAll('.alp-row')].filter(r => r.style.display !== 'none').map(r => r.querySelector('input'));
  const cnt = () => { bg.querySelector('.alp-n').textContent = bg.querySelectorAll('.alp-row input:checked').length + ' seçili'; };
  bg.querySelector('.alp-q').addEventListener('input', e => { const q = e.target.value.toLocaleLowerCase('tr'); bg.querySelectorAll('.alp-row').forEach(r => { r.style.display = r.dataset.q.includes(q) ? '' : 'none'; }); });
  bg.querySelector('.alp-all').addEventListener('click', () => { boxes().forEach(b => { b.checked = true; }); cnt(); });
  bg.querySelector('.alp-none').addEventListener('click', () => { bg.querySelectorAll('.alp-row input').forEach(b => { b.checked = false; }); cnt(); });
  bg.querySelector('.alp-list').addEventListener('change', cnt);
  bg.addEventListener('click', e => { if(e.target === bg) bg.remove(); });
  bg.querySelector('.uc-no').addEventListener('click', () => bg.remove());
  bg.querySelector('.uc-yes').addEventListener('click', () => { APP.alSelUsers = [...bg.querySelectorAll('.alp-row input:checked')].map(b => b.value); bg.remove(); renderAllowancesSettings(document.getElementById('usersSubContent'), true); });
  document.body.appendChild(bg); cnt();
}
async function saveAllowanceForm(){
  const v = (x) => ((document.getElementById(x) || {}).value || '').trim();
  const period = v('al_period') === 'monthly' ? 'monthly' : 'daily', carry = period === 'daily' && v('al_carry') === '1';
  const base = { period, carry_over: carry, limit_amount: v('al_limit'), flag_label: v('al_flag') };
  const ids = APP.alSelUsers || [];
  if(ids.length){
    if(!ids.length){ alert('En az bir kullanıcı seçin'); return; }
    const errs = [];
    await withLoadingOverlay((async () => { for(const uid of ids){
      const { error } = await sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: Object.assign({ kind: 'user', user_id: uid }, base) });
      if(error){ const u = ((APP.config && APP.config.users) || []).find(x => x.id === uid); errs.push((u ? u.username : uid) + ': ' + error.message); }
    } })());
    if(errs.length) alert('Bazı kullanıcılar eklenemedi:\n\n' + errs.join('\n'));
    if(errs.length < ids.length) showToast(`${ids.length - errs.length} kullanıcıya limit eklendi ✓`);
    APP.alSelUsers = [];
  } else {
    const { error } = await withLoadingOverlay(sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: Object.assign({ kind: 'person', name: v('al_p_name'), phone: v('al_p_phone') }, base) }));
    if(error){ alert(error.message); return; }
    showToast('Limit eklendi ✓');
  }
  renderAllowancesSettings(document.getElementById('usersSubContent'));
}
function editAllowance(id){
  const a = (APP.allowancesAll || []).find(x => x.id === id); if(!a) return;
  const flags = ((APP.config && APP.config.order_flags) || []).map(f => f.label);
  const isP = a.kind === 'person';
  const bg = document.createElement('div'); bg.className = 'dg-bg'; bg.style.zIndex = 3000;
  bg.innerHTML = `<div class="dg-card uc-card" style="max-width:440px;text-align:left;"><div class="uc-msg"><p><b>${isP ? '🎓' : '👔'} ${escapeHtml(a.name || '')} — limiti düzenle</b></p></div>
    <div class="ix-form" style="grid-template-columns:1fr 1fr;">
      ${isP ? `<div><label>Ad soyad</label><input id="ae_name" value="${escapeAttr(a.name || '')}" maxlength="60"></div><div><label>Telefon</label><input id="ae_phone" type="tel" value="${escapeAttr(a.phone || '')}" maxlength="20"></div>` : ''}
      <div><label>Dönem</label><select id="ae_period"><option value="daily" ${a.period !== 'monthly' ? 'selected' : ''}>Günlük</option><option value="monthly" ${a.period === 'monthly' ? 'selected' : ''}>Aylık</option></select></div>
      <div><label>Kalan tutar</label><select id="ae_carry" ${a.period === 'monthly' ? 'disabled' : ''}><option value="0" ${a.carry_over ? '' : 'selected'}>Devretmez</option><option value="1" ${a.carry_over ? 'selected' : ''}>Devreder</option></select></div>
      <div><label>Limit (₺)</label><input id="ae_limit" type="number" min="0" step="1" inputmode="decimal" value="${Number(a.limit_amount) || ''}"></div>
      <div><label>Sipariş etiketi</label><select id="ae_flag"><option value="">— Etiket yok —</option>${flags.map(f => `<option ${a.flag_label === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}</select></div>
    </div>
    <div class="uc-acts"><button type="button" class="pc-btn uc-no">Vazgeç</button><button type="button" class="uc-yes">Kaydet</button></div></div>`;
  const $ = (q) => bg.querySelector(q);
  $('#ae_period').addEventListener('change', e => { $('#ae_carry').disabled = e.target.value === 'monthly'; if(e.target.value === 'monthly') $('#ae_carry').value = '0'; });
  bg.addEventListener('click', e => { if(e.target === bg) bg.remove(); });
  $('.uc-no').addEventListener('click', () => bg.remove());
  $('.uc-yes').addEventListener('click', async () => {
    const period = $('#ae_period').value, carry_over = period === 'daily' && $('#ae_carry').value === '1';
    const data = { id, kind: a.kind, name: isP ? $('#ae_name').value.trim() : a.name, phone: isP ? $('#ae_phone').value.trim() : (a.phone || ''), user_id: a.user_id, period, carry_over, limit_amount: $('#ae_limit').value, flag_label: $('#ae_flag').value };
    const { error } = await sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: data });
    if(error){ alert(error.message); return; }
    bg.remove(); showToast('Limit güncellendi ✓');
    renderAllowancesSettings(alEl());
  });
  document.body.appendChild(bg);
}
const alEl = () => document.getElementById('usersSubContent');
function alRerender(){ renderAllowancesSettings(alEl(), true); }
function alSelToggle(id, on){ APP.alSel = APP.alSel || new Set(); if(on) APP.alSel.add(id); else APP.alSel.delete(id); alBulkSync(); }
function alSelAll(on){ APP.alSel = new Set(); document.querySelectorAll('.al-row').forEach(r => { const cb = r.querySelector('.al-cb'); if(!cb) return; const vis = r.style.display !== 'none'; cb.checked = on && vis; if(on && vis) APP.alSel.add(r.dataset.aid); }); alBulkSync(); }
function allowanceRowId(r){ return r.dataset.aid; }
function alBulkSync(){ const b = document.getElementById('alBulk'), n = APP.alSel ? APP.alSel.size : 0; if(b){ b.classList.toggle('on', !!n); b.querySelectorAll('button').forEach(x => { x.disabled = !n; }); } const t = document.getElementById('alBulkN'); if(t) t.textContent = n ? n + ' seçili' : 'Seçerek toplu işlem yapın'; }
async function alSetActive(a, on){ return sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: { id: a.id, kind: a.kind, name: a.name, user_id: a.user_id, period: a.period, limit_amount: a.limit_amount, flag_label: a.flag_label, is_active: on } }); }
async function toggleAllowance(id){
  const a = (APP.allowancesAll || []).find(x => x.id === id); if(!a) return;
  const { error } = await alSetActive(a, !a.is_active);
  if(error){ alert(error.message); return; }
  a.is_active = !a.is_active; alRerender();
}
async function deleteAllowance(id){
  const a = (APP.allowancesAll || []).find(x => x.id === id); if(!a || !(await uiConfirm('Kullanım geçmişi de silinir.', { title: `${a.name} limiti silinsin mi?` }))) return;
  const { error } = await sb.rpc('delete_allowance', { p_token: getSession().session_token, p_id: id });
  if(error){ alert(error.message); return; }
  APP.allowancesAll = APP.allowancesAll.filter(x => x.id !== id); if(APP.allowances) APP.allowances = APP.allowances.filter(x => x.id !== id);
  showToast('Limit silindi'); alRerender();
}
async function alBulkDelete(){
  const ids = [...(APP.alSel || [])]; if(!ids.length) return;
  if(!(await uiConfirm('Seçilen limitlerin kullanım geçmişi de silinir.', { title: ids.length + ' limit silinsin mi?' }))) return;
  const res = await withLoadingOverlay(Promise.all(ids.map(id => sb.rpc('delete_allowance', { p_token: getSession().session_token, p_id: id }))));
  const ok = ids.filter((_, k) => !res[k].error), bad = res.filter(r => r.error).length;
  APP.allowancesAll = APP.allowancesAll.filter(x => !ok.includes(x.id)); if(APP.allowances) APP.allowances = APP.allowances.filter(x => !ok.includes(x.id));
  APP.alSel = new Set(); showToast(ok.length + ' limit silindi' + (bad ? ' · ' + bad + ' silinemedi' : '')); alRerender();
}
async function alBulkActive(on){
  const list = (APP.allowancesAll || []).filter(a => APP.alSel && APP.alSel.has(a.id) && a.is_active !== on); if(!list.length){ showToast('Değişecek limit yok'); return; }
  const res = await withLoadingOverlay(Promise.all(list.map(a => alSetActive(a, on))));
  list.forEach((a, k) => { if(!res[k].error) a.is_active = on; });
  APP.alSel = new Set(); showToast(list.length + ' limit ' + (on ? 'aktifleştirildi' : 'pasife alındı')); alRerender();
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
