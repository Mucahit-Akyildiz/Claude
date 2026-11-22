/* ---- 👨‍👩‍👧 Aile / çocuk bilgisi (rezervasyon) ----
   Yetişkin + çocuk sayacı (kişi sayısı otomatik), çocuk yaş grubu (0–2 · 3–6 · 7–12), yaşa göre önerilen
   ihtiyaçlar (mama sandalyesi, çocuk menüsü…), alerji. Oturunca masaya çocuk sayısı geçer; masa ikramı
   çocuk başına "çocuk servis oranı" kadar sayılır (Ayarlar: 🧒 Çocuk & Masa). Sunucu: set_reservation_family,
   set_table_kid_friendly, set_child_serving_pct, set_order_children. */
const FAM_AGES = [['0-2', '0–2 yaş'], ['3-6', '3–6 yaş'], ['7-12', '7–12 yaş']];
const FAM_NEEDS = [['high_chair', '🪑 Mama sandalyesi'], ['warmer', '🍼 Mama ısıtma'], ['kids_menu', '🧸 Çocuk menüsü'], ['coloring', '🖍️ Boyama seti'],
  ['kid_table', '🧒 Çocuk dostu masa'], ['wheelchair', '♿ Tekerlekli sandalye'], ['birthday', '🎂 Doğum günü'], ['quiet', '🤫 Sessiz köşe']];
function famNeedLabel(k){ return (FAM_NEEDS.find(x => x[0] === k) || [k, k])[1]; }
// Yaşa göre otomatik önerilen ihtiyaçlar.
function famSuggest(ages){
  const s = new Set();
  (ages || []).forEach(a => { if(a === '0-2'){ s.add('high_chair'); s.add('warmer'); } else { s.add('kids_menu'); if(a === '3-6') s.add('coloring'); } });
  if((ages || []).length) s.add('kid_table');
  return s;
}
function famNew(party){ return { adults: party || 2, kids: [], needs: [], women: null, men: null, allergy: '', detail: false, touched: false }; }
function famFromResv(r){
  return { adults: r.adults != null ? r.adults : Math.max(0, (r.party_size || 0) - (r.children || 0)), kids: (r.child_ages && r.child_ages.length ? r.child_ages.slice() : Array.from({ length: r.children || 0 }, () => '3-6')),
    needs: (r.needs || []).slice(), women: r.women, men: r.men, allergy: r.allergy || '', detail: r.women != null || r.men != null, touched: true };
}
// Form parçası: id öneki (ör. 'rvf' yeni rezervasyon, 'rgf' grup penceresi) ve durum nesnesi APP[key].
function famHtml(key){
  const F = APP[key];
  return `<div class="fam" id="${key}Box">
    <div class="fam-row"><span>👨 Yetişkin</span><span class="fam-step"><button type="button" ${act('famStep', key, 'adults', -1)}>−</button><b>${F.adults}</b><button type="button" ${act('famStep', key, 'adults', 1)}>+</button></span></div>
    <div class="fam-row"><span>🧒 Çocuk</span><span class="fam-step"><button type="button" ${act('famStep', key, 'kids', -1)}>−</button><b>${F.kids.length}</b><button type="button" ${act('famStep', key, 'kids', 1)}>+</button></span></div>
    ${F.kids.map((a, i) => `<div class="fam-kid"><small>${i + 1}. çocuk</small>${FAM_AGES.map(([v, l]) => `<button type="button" class="rvf-chip ${a === v ? 'on' : ''}" ${act('famAge', key, i, v)}>${l}</button>`).join('')}</div>`).join('')}
    <div class="fam-total">Toplam <b>${F.adults + F.kids.length} kişi</b>${F.kids.length ? ` · ${F.adults} yetişkin + ${F.kids.length} çocuk` : ''}<button type="button" class="xl-link" ${act('famDetail', key)}>${F.detail ? 'Kadın/erkek gizle' : 'Kadın / erkek ayrıntısı'}</button></div>
    ${F.detail ? `<div class="fam-2"><label>👩 Kadın<input type="number" min="0" inputmode="numeric" value="${F.women != null ? F.women : ''}" ${actOn('input','famSet',[key,'women','$value'])}></label><label>👨 Erkek<input type="number" min="0" inputmode="numeric" value="${F.men != null ? F.men : ''}" ${actOn('input','famSet',[key,'men','$value'])}></label></div>` : ''}
    <div class="fam-needs">${FAM_NEEDS.map(([k, l]) => `<button type="button" class="rvf-chip ${F.needs.includes(k) ? 'on' : ''}" ${act('famNeed', key, k)}>${l}</button>`).join('')}</div>
    <input class="fam-all" placeholder="🥜 Alerji / özel istek (isteğe bağlı)" maxlength="200" value="${escapeAttr(F.allergy || '')}" ${actOn('input','famSet',[key,'allergy','$value'])}>
  </div>`;
}
function famRedraw(key){
  const box = document.getElementById(key + 'Box'); if(!box) return;
  box.outerHTML = famHtml(key);
  if(key === 'rvFam'){ APP.rvForm.party = APP.rvFam.adults + APP.rvFam.kids.length; if(typeof rvMark === 'function') rvMark('rvParty', APP.rvForm.party); { const i = document.getElementById('rv_party'); if(i) i.value = APP.rvForm.party; } famMarkTables(); if(typeof rvSummary === 'function') rvSummary(); }
}
function famStep(key, what, d){
  const F = APP[key];
  if(what === 'adults') F.adults = Math.max(0, F.adults + d);
  else if(d > 0){ F.kids.push('3-6'); } else F.kids.pop();
  if(F.adults + F.kids.length < 1) F.adults = 1;
  famAutoNeeds(F); famRedraw(key);
}
function famAge(key, i, v){ const F = APP[key]; F.kids[i] = v; famAutoNeeds(F); famRedraw(key); }
// Öneriler: elle değiştirilmediyse çocuk yaşlarına göre işaretlenir.
function famAutoNeeds(F){ if(F.needsTouched) return; const keep = F.needs.filter(n => !['high_chair','warmer','kids_menu','coloring','kid_table'].includes(n)); F.needs = keep.concat([...famSuggest(F.kids)]); }
function famNeed(key, k){ const F = APP[key]; F.needsTouched = true; F.needs = F.needs.includes(k) ? F.needs.filter(x => x !== k) : F.needs.concat(k); famRedraw(key); }
function famDetail(key){ APP[key].detail = !APP[key].detail; famRedraw(key); }
function famSet(key, k, v){ const F = APP[key]; F[k] = k === 'allergy' ? v : (v === '' ? null : Math.max(0, parseInt(v, 10) || 0)); }
// Çocuklu rezervasyonda çocuk dostu masalar listede öne çıkar (🧒 işaretli).
function famMarkTables(){
  const sel = document.getElementById('rv_table'); if(!sel) return;
  const kids = APP.rvFam && APP.rvFam.kids.length > 0, kidIds = new Set(((APP.config && APP.config.zones) || []).flatMap(z => z.tables || []).filter(t => t.kid_friendly).map(t => t.id));
  [...sel.options].forEach(o => { if(!o.value) return; const base = o.textContent.replace(/^🧒 /, ''); o.textContent = (kids && kidIds.has(o.value) ? '🧒 ' : '') + base; });
}
async function famSave(id, F){
  const { error } = await sb.rpc('set_reservation_family', { p_token: getSession().session_token, p_id: id, p_adults: F.adults, p_women: F.detail ? F.women : null, p_men: F.detail ? F.men : null,
    p_child_ages: F.kids, p_needs: F.needs, p_allergy: F.allergy || null });
  return error;
}
// Kartta özet.
function famChipsHtml(r){
  const kids = Number(r.children) || 0, out = [];
  if(kids || r.adults != null) out.push(`<span class="pchip">👨 ${r.adults != null ? r.adults : Math.max(0, r.party_size - kids)}${kids ? ' · 🧒 ' + kids + ((r.child_ages || []).length ? ' (' + r.child_ages.join(', ') + ')' : '') : ''}</span>`);
  if(r.women || r.men) out.push(`<span class="pchip">${[r.women ? '👩 ' + r.women : '', r.men ? '👨 ' + r.men : ''].filter(Boolean).join(' · ')}</span>`);
  (r.needs || []).forEach(n => out.push(`<span class="pchip fam-need">${famNeedLabel(n)}</span>`));
  if(r.allergy) out.push(`<span class="pchip warn">🥜 ${escapeHtml(r.allergy)}</span>`);
  return out.join('');
}
// Günün hazırlık özeti: yetişkin, çocuk, ihtiyaç sayıları.
function famDaySummary(list){
  const a = list.reduce((x, r) => x + (r.adults != null ? r.adults : Math.max(0, (r.party_size || 0) - (r.children || 0))), 0), k = list.reduce((x, r) => x + (Number(r.children) || 0), 0);
  const nc = {}; list.forEach(r => (r.needs || []).forEach(n => { nc[n] = (nc[n] || 0) + (n === 'high_chair' ? Math.max(1, (r.child_ages || []).filter(x => x === '0-2').length) : 1); }));
  if(!k && !Object.keys(nc).length) return '';
  return `👨 ${a} yetişkin · 🧒 ${k} çocuk${Object.entries(nc).map(([n, c]) => ' · ' + famNeedLabel(n) + ' ×' + c).join('')}`;
}

/* Ayarlar: çocuk servis oranı + çocuk dostu masalar. */
function openFamilySettings(){
  removeEl('famSetBg');
  const pct = APP.config && APP.config.child_serving_pct != null ? Number(APP.config.child_serving_pct) : 50;
  const bg = document.createElement('div'); bg.id = 'famSetBg'; bg.className = 'modal-bg';
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  bg.innerHTML = `<div class="box sd-box"><div class="u-row-sb"><h2 class="u-m0">🧒 Çocuk & Masa Ayarları</h2><span class="u-xclose" ${act('removeEl','famSetBg')}>✕</span></div>
    <div class="sd-form"><label>Çocuk servis oranı</label>
      <div class="fam-pct"><input type="number" id="fam_pct" min="0" max="100" step="5" inputmode="numeric" value="${pct}"><span>%</span><button type="button" class="u-wa-m0" ${act('saveChildPct')}>💾 Kaydet</button></div>
      <small class="muted">Masa ikramı (meze) çocuk başına bu oranda sayılır. Örn. %50: 2 yetişkin + 1 çocuk = 2,5 → 3 porsiyon.</small>
      <label style="margin-top:12px;">🧒 Çocuk dostu masalar</label><small class="muted">Çocuklu rezervasyonda bu masalar listede 🧒 ile öne çıkar (geniş, köşe, cam kenarından uzak masalar).</small>
      ${((APP.config && APP.config.zones) || []).map(z => `<div class="fam-zone"><b>${escapeHtml(z.name)}</b><div class="sd-zones">${(z.tables || []).map(t => `<label class="sd-chk"><input type="checkbox" ${t.kid_friendly ? 'checked' : ''} ${actOn('change','toggleKidTable',[t.id,'$checked'])}> ${escapeHtml(t.name)}</label>`).join('')}</div></div>`).join('')}
    </div></div>`;
  document.body.appendChild(bg);
}
async function saveChildPct(){
  const v = parseFloat((document.getElementById('fam_pct') || {}).value);
  const { error } = await sb.rpc('set_child_serving_pct', { p_token: getSession().session_token, p_pct: v });
  if(error){ uiAlert(error.message); return; }
  if(APP.config) APP.config.child_serving_pct = v; showToast('🧒 Çocuk servis oranı %' + v);
}
async function toggleKidTable(id, on){
  const { error } = await sb.rpc('set_table_kid_friendly', { p_token: getSession().session_token, p_table: id, p_on: !!on });
  if(error){ uiAlert(error.message); return; }
  ((APP.config && APP.config.zones) || []).forEach(z => (z.tables || []).forEach(t => { if(t.id === id) t.kid_friendly = !!on; }));
}
