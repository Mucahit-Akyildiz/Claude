/* ---- Müşteri doğum günü uyarıları ----
   Ayarlar cihaz bazında (Bildirimler ekranı): isteyen açar, istemeyen kapatır.
   - Günlük kutlama kartı: o gün doğum günü olan (ve isteğe bağlı yaklaşan) müşteriler rozetlerle, günde bir kez.
   - Sipariş penceresi rozeti: seçilen müşterinin bugün doğum günüyse 🎂 rozeti ve indirim hatırlatması. */
const BDAY_KEYS = { popup: 'peyk_bday_popup', badge: 'peyk_bday_badge', ahead: 'peyk_bday_ahead', seen: 'peyk_bday_seen' };
function bdayPref(k, def){ try{ const v = localStorage.getItem(BDAY_KEYS[k]); return v === null ? def : v; }catch(e){ return def; } }
function setBdayPref(k, v){ try{ localStorage.setItem(BDAY_KEYS[k], String(v)); }catch(e){} }
function bdayAheadDays(){ return Number(bdayPref('ahead', '3')) || 0; }

async function loadBirthdays(){
  const s = getSession(); if(!s) return [];
  const { data } = await sb.rpc('customer_birthdays', { p_token: s.session_token, p_days: Math.max(bdayAheadDays(), 0) });
  APP.birthdays = data || [];
  APP.birthdaysAt = Date.now();
  return APP.birthdays;
}
function bdayDiscountPct(){ const l = (APP.config && APP.config.loyalty) || {}; return l.enabled ? Number(l.birthday_discount_percent || 0) : 0; }
function bdayBadges(c){
  const t = typeof crmTier === 'function' ? crmTier(c) : null, pct = bdayDiscountPct();
  return [c.days === 0 ? '<span class="bd-b today">🎂 Bugün</span>' : `<span class="bd-b soon">📅 ${c.days === 1 ? 'Yarın' : c.days + ' gün sonra'}</span>`,
    c.age > 0 && c.age < 120 ? `<span class="bd-b age">🎈 ${c.age} yaş</span>` : '',
    t && t.rank ? `<span class="bd-b tier" style="--c:${t.color};">${t.icon} ${escapeHtml(t.name)}</span>` : '',
    c.days === 0 && pct ? `<span class="bd-b gift">🎁 %${pct} indirim</span>` : '',
    c.visits ? `<span class="bd-b visit">🔁 ${c.visits} ziyaret</span>` : ''].join('');
}
/* Uygulama açılışında günde bir kez kutlama kartı. */
async function maybeShowBirthdayCard(force){
  if(!force && bdayPref('popup', '1') !== '1') return;
  const today = new Date().toLocaleDateString('sv-SE');
  if(!force && bdayPref('seen', '') === today) return;
  const list = await loadBirthdays();
  if(!list.length){ if(force) showToast('Önümüzdeki günlerde doğum günü olan müşteri yok'); return; }
  setBdayPref('seen', today);
  const todays = list.filter(c => c.days === 0), soon = list.filter(c => c.days > 0);
  const old = document.getElementById('bdayCard'); if(old) old.remove();
  const ov = document.createElement('div'); ov.id = 'bdayCard'; ov.className = 'bd-bg';
  ov.innerHTML = `<div class="bd-card">
    <div class="bd-confetti">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i};--x:${(i * 53) % 100}%;--c:${['#f59e0b', '#ec4899', '#22c55e', '#6366f1', '#14b8a6', '#ef4444'][i % 6]};"></i>`).join('')}</div>
    <div class="bd-head"><span class="bd-cake">🎂</span><div><h2>${todays.length ? `Bugün ${todays.length} müşterinin doğum günü!` : 'Yaklaşan doğum günleri'}</h2>
      <small>${todays.length ? 'Kutlamayı unutmayın' + (bdayDiscountPct() ? ` — doğum günü indirimi %${bdayDiscountPct()}` : '') : `Önümüzdeki ${bdayAheadDays()} gün`}</small></div></div>
    <div class="bd-list">${[...todays, ...soon].map((c, i) => `<div class="bd-row ${c.days === 0 ? 'is-today' : ''}" style="--i:${i};">
      <span class="bd-av">${escapeHtml(String(c.name || '?').trim().charAt(0).toLocaleUpperCase('tr'))}</span>
      <div class="bd-main"><b>${escapeHtml(c.name || '')}</b><div class="bd-badges">${bdayBadges(c)}</div></div>
      ${c.phone ? `<span class="bd-ph">📞 ••• ${escapeHtml(String(c.phone).replace(/\D/g, '').slice(-4))}</span>` : ''}</div>`).join('')}</div>
    <div class="bd-foot"><button type="button" class="ghost-btn" ${act('closeBirthdayCard', true)}>Bir daha gösterme</button><button type="button" ${act('closeBirthdayCard')}>Tamam 🎉</button></div>
    <p class="bd-hint">Bu uyarıyı Bildirimler ekranından kapatabilirsiniz.</p>
  </div>`;
  ov.addEventListener('click', e => { if(e.target === ov) closeBirthdayCard(); });
  document.body.appendChild(ov);
}
function closeBirthdayCard(off){ const c = document.getElementById('bdayCard'); if(c) c.remove();
  if(off === true){ setBdayPref('popup', '0'); showToast('Doğum günü kartı kapatıldı · Bildirimler ekranından tekrar açabilirsiniz'); } }

/* Sipariş penceresi: müşterinin bugün doğum günüyse rozet. */
function birthdayFor(name, phone){
  if(bdayPref('badge', '1') !== '1') return null;
  const d = String(phone || '').replace(/\D/g, '').slice(-10), n = String(name || '').trim().toLocaleLowerCase('tr');
  return (APP.birthdays || []).find(c => c.days === 0 && ((d.length >= 10 && String(c.phone || '').replace(/\D/g, '').slice(-10) === d) || (n && String(c.name || '').trim().toLocaleLowerCase('tr') === n))) || null;
}
function birthdayBadgeHtml(name, phone){
  const c = birthdayFor(name, phone); if(!c) return '';
  const pct = bdayDiscountPct();
  return `<div class="bd-inline"><span class="bd-cake-s">🎂</span><div><b>Bugün ${escapeHtml(c.name)}'ın doğum günü!</b><small>${c.age > 0 && c.age < 120 ? c.age + ' yaşına giriyor · ' : ''}${pct ? `ödemede %${pct} doğum günü indirimi uygulanır` : 'küçük bir ikram güzel olur'}</small></div></div>`;
}

/* Bildirimler ekranı ayar kutusu */
function birthdaySettingsHtml(){
  const sw = (k, def, title, desc) => `<label class="al-req"><span class="oo-switch"><input type="checkbox" ${bdayPref(k, def) === '1' ? 'checked' : ''} ${actOn('change', 'setBdaySwitch', [k, '$checked'])}><span class="oo-track"><span class="oo-thumb"></span></span></span><span><b>${title}</b><small>${desc}</small></span></label>`;
  return `<div class="box ix-box" style="max-width:none;">
    <h2>🎂 Müşteri Doğum Günü Uyarıları</h2>
    ${sw('popup', '1', 'Günlük kutlama kartı', 'Uygulama açılınca günde bir kez, o gün doğum günü olan müşterileri rozetleriyle (yaş, seviye, indirim) gösterir.')}
    ${sw('badge', '1', 'Sipariş penceresinde rozet', 'Seçilen müşterinin bugün doğum günüyse sipariş penceresinde 🎂 rozeti ve indirim hatırlatması çıkar.')}
    <div class="ix-sec"><div class="ix-st">Yaklaşan doğum günlerini de göster</div>
      <div class="ix-tiles">${[['0', '🎂', 'Sadece bugün', ''], ['3', '📅', '3 gün', 'önceden'], ['7', '🗓️', '7 gün', 'önceden']].map(([v, ic, n, d]) => `<button type="button" class="ix-tile ${String(bdayAheadDays()) === v ? 'on' : ''}" ${act('setBdayAhead', v)} data-v="${v}"><span>${ic}</span><b>${n}</b><small>${d}</small></button>`).join('')}</div></div>
    <button type="button" class="sbtn" style="width:auto;margin-top:12px;" ${act('maybeShowBirthdayCard', true)}>🎉 Şimdi göster</button>
    <p class="ix-note">ℹ️ Bu ayarlar yalnızca bu cihaza özeldir; her personel kendi cihazında açıp kapatabilir.</p>
  </div>`;
}
function setBdaySwitch(k, on){ setBdayPref(k, on ? '1' : '0'); showToast(on ? 'Açıldı ✓' : 'Kapatıldı'); }
function setBdayAhead(v){ setBdayPref('ahead', v); document.querySelectorAll('.ix-tile[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); APP.birthdays = null; loadBirthdays(); }
