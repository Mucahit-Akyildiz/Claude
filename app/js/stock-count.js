/* ---- 📋 Stok Sayımı ----
   Personel (stock_count izni) rafta saydığı miktarları girer; sayım "onay bekliyor" olarak kaydedilir.
   Onay yetkisi (approvals) olan kişi onaylayınca stok, sayım anındaki farka göre düzeltilir
   (sayımdan sonraki satışlar korunur). Stok sayımı isteğe bağlıdır; gün sonuna bağlı değildir.
   Sunucu: submit_stock_count, list_stock_counts, decide_stock_count, set_ingredient_count_daily. */
function scCanCount(s){ s = s || getSession(); return !!s && (s.isManager || hasPerm(s, 'stock_count') || hasPerm(s, 'approvals')); }
function scCanApprove(s){ s = s || getSession(); return !!s && (s.isManager || hasPerm(s, 'approvals')); }
function stockCountBtnHtml(cls){
  if(!scCanCount()) return '';
  return `<button type="button" class="${cls || 'ghost-btn'} sc-open-btn" title="Rafta sayılan miktarları girin; yönetici onaylayınca stok düzeltilir" ${act('openStockCount')}><span>📋</span>Stok Sayımı</button>`;
}
function scFmt(n){ const v = Math.round((Number(n) || 0) * 1000) / 1000; return v.toLocaleString('tr-TR', { maximumFractionDigits: 3 }); }
async function openStockCount(tab){
  if(!scCanCount()){ uiAlert('Stok sayımı için yetkiniz yok. Yöneticiniz rolünüze "Stok Sayımı" iznini verebilir.'); return; }
  APP.scTab = tab || APP.scTab || 'count';
  if(APP.scTab === 'approve' && !scCanApprove()) APP.scTab = 'count';
  APP.scFilter = APP.scFilter || 'daily'; APP.scQ = ''; APP.scVals = APP.scVals || {};
  removeEl('stockCountBg');
  const bg = document.createElement('div'); bg.id = 'stockCountBg'; bg.className = 'modal-bg';
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  bg.innerHTML = `<div class="box sc-box"><div class="u-row-sb"><h2 class="u-m0">📋 Stok Sayımı</h2><span class="u-xclose" ${act('removeEl','stockCountBg')}>✕</span></div>
    <div class="seg sc-tabs"><button type="button" data-t="count" ${act('scSetTab','count')}>✍️ Sayım gir</button>${scCanApprove() ? `<button type="button" data-t="approve" ${act('scSetTab','approve')}>✅ Onaylar <span id="scPendN"></span></button>` : ''}<button type="button" data-t="history" ${act('scSetTab','history')}>🕘 Geçmiş</button></div>
    <div id="scBody"></div></div>`;
  document.body.appendChild(bg);
  await scLoadCounts();
  scRender();
}
async function scLoadCounts(){
  const { data, error } = await sb.rpc('list_stock_counts', { p_token: getSession().session_token, p_limit: 40 });
  APP.scCounts = error ? [] : (data || []);
  const n = APP.scCounts.filter(c => c.status === 'pending').length, el = document.getElementById('scPendN');
  if(el) el.innerHTML = n ? `<span class="ks-badge">${n}</span>` : '';
}
function scSetTab(t){ APP.scTab = t; scRender(); }
function scRender(){
  const body = document.getElementById('scBody'); if(!body) return;
  document.querySelectorAll('.sc-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === APP.scTab));
  if(APP.scTab === 'count') return scRenderCount(body);
  const list = (APP.scCounts || []).filter(c => APP.scTab === 'approve' ? c.status === 'pending' : true);
  body.innerHTML = list.length ? list.map(scCardHtml).join('') : `<div class="empty-state"><div style="font-size:34px;">${APP.scTab === 'approve' ? '✅' : '🕘'}</div><p class="muted">${APP.scTab === 'approve' ? 'Onay bekleyen sayım yok.' : 'Henüz sayım yok.'}</p></div>`;
}
function scIngs(){ return ((APP.config && APP.config.ingredients) || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr')); }
function scRenderCount(body){
  const all = scIngs(), daily = all.filter(i => i.count_daily);
  if(APP.scFilter === 'daily' && !daily.length) APP.scFilter = 'all';
  const q = (APP.scQ || '').toLocaleLowerCase('tr');
  const rows = (APP.scFilter === 'daily' ? daily : all).filter(i => !q || String(i.name).toLocaleLowerCase('tr').includes(q));
  const mgr = scCanApprove();
  body.innerHTML = `<p class="muted sc-hint">Rafta saydığınız miktarı yazın; boş bıraktıklarınız sayılmaz. Kaydedince ${mgr ? 'onay listesine düşer, oradan onaylayın' : 'yöneticinin onayına gider'}; onaylanınca stok düzelir.</p>
    <div class="sc-tools"><div class="seg"><button type="button" class="${APP.scFilter==='daily'?'on':''}" ${act('scSetFilter','daily')}>⭐ Günlük liste (${daily.length})</button><button type="button" class="${APP.scFilter==='all'?'on':''}" ${act('scSetFilter','all')}>Tümü (${all.length})</button></div>
      <input id="scQ" placeholder="🔍 Hammadde ara…" value="${escapeAttr(APP.scQ || '')}" ${actOn('input','scSearch',['$value'])}></div>
    ${!daily.length && mgr ? '<p class="muted sc-hint">İpucu: her gün saydığınız kalemleri ☆ ile işaretleyin, "Günlük liste"de yalnız onlar çıkar.</p>' : ''}
    <div class="sc-list">${rows.map(i => { const v = APP.scVals[i.id];
      return `<div class="sc-row" data-id="${i.id}">${mgr ? `<button type="button" class="sc-star ${i.count_daily ? 'on' : ''}" title="Günlük sayım listesine ekle/çıkar" ${act('scToggleDaily', i.id)}>${i.count_daily ? '⭐' : '☆'}</button>` : ''}
        <div class="sc-n"><b>${escapeHtml(i.name)}</b><small class="muted">Sistemde: ${scFmt(i.stock)} ${escapeHtml(i.unit || '')}</small></div>
        <input type="number" inputmode="decimal" step="any" min="0" placeholder="Sayılan" value="${v == null ? '' : escapeAttr(String(v))}" ${actOn('input','scSetVal',[i.id,'$value'])}>
        <span class="sc-u">${escapeHtml(i.unit || '')}</span><span class="sc-d" id="scd_${i.id}">${scDiffHtml(i, v)}</span></div>`; }).join('') || '<p class="muted">Kalem bulunamadı.</p>'}</div>
    <input id="scNote" placeholder="Not (isteğe bağlı)" maxlength="200" style="margin-top:10px;">
    <div class="sc-foot"><span id="scSum">${scSumHtml()}</span><button type="button" ${act('scSubmit')}>📨 Sayımı gönder</button></div>`;
}
function scDiffHtml(i, v){
  if(v == null || v === '') return '';
  const d = Number(v) - (Number(i.stock) || 0); if(Math.abs(d) < 0.0005) return '<b class="sc-ok">✓ tutuyor</b>';
  const tl = d * (Number(i.unit_cost) || 0);
  return `<b class="${d < 0 ? 'sc-neg' : 'sc-pos'}">${d > 0 ? '+' : ''}${scFmt(d)}${tl ? ' · ' + (tl > 0 ? '+' : '') + money(tl) : ''}</b>`;
}
function scSumHtml(){
  const ings = scIngs(); let n = 0, tl = 0;
  Object.entries(APP.scVals || {}).forEach(([id, v]) => { if(v === '' || v == null) return; const i = ings.find(x => x.id === id); if(!i) return; n++; tl += (Number(v) - (Number(i.stock) || 0)) * (Number(i.unit_cost) || 0); });
  return n ? `${n} kalem · fark <b class="${tl < 0 ? 'sc-neg' : tl > 0 ? 'sc-pos' : ''}">${tl > 0 ? '+' : ''}${money(tl)}</b>` : '<span class="muted">Henüz sayım girilmedi</span>';
}
function scSetVal(id, v){
  APP.scVals[id] = v === '' ? null : v;
  const i = scIngs().find(x => x.id === id), el = document.getElementById('scd_' + id); if(el && i) el.innerHTML = scDiffHtml(i, APP.scVals[id]);
  const s = document.getElementById('scSum'); if(s) s.innerHTML = scSumHtml();
}
function scSetFilter(f){ APP.scFilter = f; scRender(); }
function scSearch(v){ APP.scQ = v; const pos = v.length; scRender(); const el = document.getElementById('scQ'); if(el){ el.focus(); el.setSelectionRange(pos, pos); } }
async function scToggleDaily(id){
  const i = scIngs().find(x => x.id === id); if(!i) return;
  const on = !i.count_daily;
  const { error } = await sb.rpc('set_ingredient_count_daily', { p_token: getSession().session_token, p_ids: [id], p_on: on });
  if(error){ uiAlert(error.message); return; }
  (APP.config.ingredients || []).forEach(x => { if(x.id === id) x.count_daily = on; });
  scRender();
}
async function scSubmit(){
  const ings = scIngs();
  const lines = Object.entries(APP.scVals || {}).filter(([id, v]) => v !== '' && v != null && ings.some(i => i.id === id)).map(([id, v]) => ({ ingredient_id: id, counted: Number(v) }));
  if(!lines.length){ uiAlert('En az bir kalemin sayılan miktarını yazın'); return; }
  if(lines.some(l => !(l.counted >= 0))){ uiAlert('Sayılan miktar 0 veya daha büyük olmalı'); return; }
  const { error } = await withLoadingOverlay(sb.rpc('submit_stock_count', { p_token: getSession().session_token, p_lines: lines, p_note: (document.getElementById('scNote') || {}).value || null }));
  if(error){ uiAlert(error.message); return; }
  APP.scVals = {};
  showToast('📋 Sayım gönderildi' + (scCanApprove() ? ' — Onaylar sekmesinden onaylayın' : ' — yönetici onayı bekleniyor'));
  await scLoadCounts();
  APP.scTab = scCanApprove() ? 'approve' : 'history'; scRender();
}
function scCardHtml(c){
  const st = { pending: ['⏳ Onay bekliyor', 'pend'], approved: ['✅ Onaylandı', 'ok'], rejected: ['✖ Reddedildi', 'rej'] }[c.status] || ['', ''];
  const when = (t) => t ? new Date(t).toLocaleString('tr-TR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
  const dv = Number(c.diff_value) || 0;
  return `<div class="sc-card ${st[1]}"><div class="u-row-sb"><div><b>${when(c.created_at)} · ${escapeHtml(c.created_by || '')}</b>${c.note ? `<small class="muted"> · ${escapeHtml(c.note)}</small>` : ''}</div><span class="sc-st ${st[1]}">${st[0]}</span></div>
    <table class="sc-t"><tr><th>Kalem</th><th>Sistem</th><th>Sayılan</th><th>Fark</th></tr>${(c.lines || []).map(l => { const d = Number(l.diff) || 0;
      return `<tr><td>${escapeHtml(l.name)}</td><td>${scFmt(l.system_qty)} ${escapeHtml(l.unit || '')}</td><td>${scFmt(l.counted_qty)}</td><td class="${d < 0 ? 'sc-neg' : d > 0 ? 'sc-pos' : ''}">${Math.abs(d) < 0.0005 ? '✓' : (d > 0 ? '+' : '') + scFmt(d)}</td></tr>`; }).join('')}</table>
    <div class="u-row-sb sc-cfoot"><span>Toplam fark: <b class="${dv < 0 ? 'sc-neg' : dv > 0 ? 'sc-pos' : ''}">${dv > 0 ? '+' : ''}${money(dv)}</b></span>
      ${c.status === 'pending' && scCanApprove() ? `<span class="sc-acts"><button type="button" class="ghost-btn" ${act('scDecide', c.id, false)}>✖ Reddet</button><button type="button" ${act('scDecide', c.id, true)}>✅ Onayla, stoğu düzelt</button></span>`
        : c.decided_by ? `<small class="muted">${escapeHtml(c.decided_by)} · ${when(c.decided_at)}${c.decide_note ? ' · ' + escapeHtml(c.decide_note) : ''}</small>` : ''}</div></div>`;
}
async function scDecide(id, approve){
  let note = null;
  if(approve){ if(!await uiConfirm('Stoklar bu sayıma göre düzeltilsin mi? (Sayımdan sonraki satışlar korunur.)', { okText: 'Onayla', danger: false })) return; }
  else { note = await uiPrompt('Reddetme nedeni (isteğe bağlı)', ''); if(note === null) return; }
  const { data, error } = await withLoadingOverlay(sb.rpc('decide_stock_count', { p_token: getSession().session_token, p_id: id, p_approve: !!approve, p_note: note }));
  if(error){ uiAlert(error.message); return; }
  showToast(approve ? '✅ Sayım onaylandı · ' + (data.adjusted || 0) + ' kalemin stoğu düzeltildi' : '✖ Sayım reddedildi');
  if(approve && typeof refreshConfigKeepDraft === 'function') await refreshConfigKeepDraft(getSession());
  await scLoadCounts(); scRender();
}
