// Açık hesaplar ve gün sonu kapanışları (financial.js'ten ayrıldı; klasik script, fonksiyonlar global).

/* ---- Açık Hesaplar: toplam açık bakiye, dönemde açık hesaba yazılan / tahsil edilen,
   hesap bazında bakiye ve hareket geçmişi; buradan tahsilat da alınır. ---- */
async function renderOpenAccountsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_open_accounts_report', { p_token: session.session_token, p_from: APP.reportDate, p_to: APP.reportDateTo || APP.reportDate }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  APP.openAccReport = data;
  const accs = data.accounts || [];
  const open = accs.filter(a => a.balance > 0.009);
  const card = (label, val, color) => `<div class="box" style="flex:1;min-width:180px;margin:0;"><div class="u-fs125 muted">${label}</div><div style="font-size:24px;font-weight:800;${color ? 'color:'+color+';' : ''}">${val}</div></div>`;
  const methodTxt = m => m === 'cash' ? 'Nakit' : m === 'card' ? 'Kart' : m === 'open_account' ? 'Açık hesaba yazıldı' : (m || '');
  const maxBal = Math.max(1, ...accs.map(a => Number(a.balance)||0));
  el.innerHTML = statChips([['📒', money(data.total_balance), 'Toplam açık bakiye', data.total_balance > 0 ? 'var(--danger,#ef4444)' : 'var(--c1)'],
      ['✍️', money(data.period_charges), 'Bu dönemde yazılan', 'var(--c3)'], ['✅', money(data.period_payments), 'Bu dönemde tahsil', 'var(--ok,#22c55e)'],
      ['👥', open.length + ' / ' + accs.length, 'Borcu olan hesap', 'var(--c2)']]) + `
    <div class="fs-panel pa-sec" style="--t:var(--c1);">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;"><h3 class="u-m0"><i>📒</i>Hesaplar</h3><span class="u-f1"></span>
        <input class="list-search" placeholder="🔍 Hesap ara…" ${actOn('input','filterOpenAccRows',['$value'])} style="max-width:280px;margin:0;"></div>
      ${accs.length ? `<div class="oa-grid" id="openAccTable">${accs.slice().sort((x, y) => (y.balance||0) - (x.balance||0)).map((a, i) => { const debt = a.balance > 0.009;
        return `<div class="oa-card ${debt?'debt':'clear'}" data-oa="${escapeAttr(a.name.toLocaleLowerCase('tr') + ' ' + (a.phone||''))}" style="--i:${Math.min(i,12)};">
          <div class="cu-top">${avatarHtml(a.name)}<div class="cu-id"><b>${escapeHtml(a.name)}</b><small>${escapeHtml([a.phone, a.note].filter(Boolean).join(' · ') || 'Açık hesap')}</small></div>
            <span class="oa-st">${debt ? '● Borçlu' : '✓ Kapalı'}</span></div>
          <div class="oa-bal"><b>${money(a.balance)}</b><small>bakiye</small></div>
          <div class="pcard-mbar"><i style="width:${debt ? Math.max(4, Math.round(a.balance/maxBal*100)) : 0}%;background:var(--danger,#ef4444);"></i></div>
          <div class="pcard-chips">
            <span class="pchip">✍️ ${money(a.period_charges)}</span><span class="pchip">✅ ${money(a.period_payments)}</span>
            ${a.last_charge_at ? `<span class="pchip">📅 son yazım ${new Date(a.last_charge_at).toLocaleDateString('tr-TR')}</span>` : ''}
            ${a.last_payment_at ? `<span class="pchip">💵 son tahsilat ${new Date(a.last_payment_at).toLocaleDateString('tr-TR')}</span>` : ''}
          </div>
          <div class="pcard-acts">
            ${debt ? `<button type="button" class="pc-btn pc-edit" style="margin-left:0;" ${act('collectOpenAccount', a.id)}>₺ Tahsilat Al</button>` : ''}
            <button type="button" class="pc-btn" style="margin-left:auto;" ${act('showOpenAccEntries', a.id)}>🔍 Detay</button>
          </div>
        </div>`; }).join('')}</div>` : '<div class="empty-state"><div style="font-size:38px;">📒</div><p class="muted">Henüz açık hesap yok. Ödeme ekranında "📒 Açık Hesaba At" ile oluşturabilirsiniz.</p></div>'}
    </div>
    <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🕘</i>Dönem Hareketleri</h3>
      ${(data.entries||[]).length ? `<div class="sp-log">${data.entries.map((e, i) => { const ch = e.kind === 'charge';
        return `<div class="sp-li oa-li ${ch?'ch':'pay'}" style="--i:${Math.min(i,12)};"><span class="sp-dot"></span>
          <span class="oa-ic">${ch ? '📒' : '✅'}</span>
          <div class="cu-id"><b>${escapeHtml(e.account_name)} · ${ch ? 'Hesaba yazıldı' : 'Tahsilat (' + methodTxt(e.method) + ')'}</b>
            <small>${new Date(e.created_at).toLocaleString('tr-TR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })} · ${escapeHtml([e.table_name, e.note].filter(Boolean).join(' · ') || '—')} · ${escapeHtml(e.staff || '—')}</small></div>
          <b class="oa-amt">${ch ? '+' : '−'}${money(e.amount)}</b>
          ${e.sales_history_id ? `<button type="button" class="pc-btn" ${act('openSaleDetailModal', e.sales_history_id)}>🔍 Detay</button>` : ''}
        </div>`; }).join('')}</div>` : '<div class="empty-state"><div style="font-size:38px;">🕘</div><p class="muted">Bu dönemde hareket yok.</p></div>'}
    </div>`;
}
function filterOpenAccRows(q){
  q = String(q||'').trim().toLocaleLowerCase('tr');
  document.querySelectorAll('#openAccTable [data-oa]').forEach(tr => { tr.style.display = !q || tr.dataset.oa.includes(q) ? '' : 'none'; });
}
/* Hesap hareketleri (tüm zamanlar): her yazımda siparişin detayı açılabilir. */
async function showOpenAccEntries(id){
  const d = APP.openAccReport || {}; const a = (d.accounts||[]).find(x => x.id===id); if(!a) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_open_account_entries', { p_token: getSession().session_token, p_account_id: id }));
  if(error){ alert(error.message); return; }
  const rows = data || [];
  const charged = rows.filter(e => e.kind === 'charge').reduce((t, e) => t + Number(e.amount||0), 0);
  const paid = rows.filter(e => e.kind !== 'charge').reduce((t, e) => t + Number(e.amount||0), 0);
  const debt = a.balance > 0.009;
  const old = document.getElementById('oaEntriesModalBg'); if(old) old.remove();
  const w = document.createElement('div'); w.id = 'oaEntriesModalBg'; w.className = 'pdrawer-wrap';
  w.innerHTML = `<div class="pdrawer-bg" ${act('removeEl','oaEntriesModalBg')}></div>
    <aside class="pdrawer oa-drawer">
      <div class="pdrawer-head">${avatarHtml(a.name)}<div><small class="muted">Açık hesap</small><h3>${escapeHtml(a.name)}</h3>${a.phone ? `<small class="muted">${phoneHtml(a.phone)}</small>` : ''}</div>
        <button type="button" class="pdrawer-x" ${act('removeEl','oaEntriesModalBg')}>✕</button></div>
      <div class="pdrawer-body">
        <div class="oad-bal ${debt?'debt':''}"><small>Güncel bakiye</small><b>${money(a.balance)}</b><span>${debt ? '● Borçlu' : '✓ Hesap kapalı'}</span></div>
        <div class="oad-sum"><div><small>Toplam yazılan</small><b class="r">+${money(charged)}</b></div><div><small>Toplam tahsil</small><b class="g">−${money(paid)}</b></div><div><small>Hareket</small><b>${rows.length}</b></div></div>
        ${a.note ? `<div class="u-mb8 kc-note">📝 ${escapeHtml(a.note)}</div>` : ''}
        <div class="rv-day-h" style="margin:8px 0 10px;">Hareketler<span class="muted">${rows.length}</span></div>
        ${rows.length ? `<div class="sp-log">${rows.map((e, i) => { const ch = e.kind === 'charge';
          return `<div class="sp-li oa-li ${ch?'ch':'pay'}" style="--i:${Math.min(i,12)};flex-wrap:wrap;"><span class="sp-dot"></span>
            <span class="oa-ic">${ch ? '📒' : '✅'}</span>
            <div class="cu-id"><b>${ch ? 'Hesaba yazıldı' + (e.item_count ? ' · ' + e.item_count + ' ürün' : '') : 'Tahsilat' + (e.method ? ' (' + (e.method==='cash'?'Nakit':e.method==='card'?'Kart':escapeHtml(e.method)) + ')' : '')}</b>
              <small>${new Date(e.created_at).toLocaleString('tr-TR', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}${e.table_name ? ' · ' + escapeHtml(e.table_name) : ''}${e.staff ? ' · ' + escapeHtml(e.staff) : ''}${e.note ? ' · ' + escapeHtml(e.note) : ''}</small></div>
            <b class="oa-amt">${ch ? '+' : '−'}${money(e.amount)}</b>
            ${e.sales_history_id ? `<button type="button" class="pc-btn oad-toggle" ${act('toggleOaSale', e.sales_history_id, 'oas_'+i)}>🧾 Ürünler</button><div class="oad-items" id="oas_${i}" hidden></div>` : ''}
          </div>`; }).join('')}</div>` : '<div class="empty-state"><div style="font-size:34px;">🕘</div><p class="muted">Hareket yok.</p></div>'}
      </div>
      <div class="pdrawer-foot">${debt ? `<button type="button" ${act('collectOpenAccount', a.id)}>₺ Tahsilat Al</button>` : ''}<button type="button" class="ghost-btn" ${act('removeEl','oaEntriesModalBg')}>Kapat</button></div>
    </aside>`;
  document.body.appendChild(w);
  requestAnimationFrame(() => w.classList.add('open'));
}
/* Açık hesap hareketinin sipariş kalemlerini panelin içinde açar/kapatır. */
async function toggleOaSale(historyId, boxId){
  const box = document.getElementById(boxId); if(!box) return;
  if(!box.hidden){ box.hidden = true; return; }
  if(!box.dataset.loaded){
    box.innerHTML = '<p class="u-m0 muted">Yükleniyor…</p>'; box.hidden = false;
    const { data: d, error } = await sb.rpc('get_sale_detail', { p_token: getSession().session_token, p_history_id: historyId });
    if(error){ box.innerHTML = '<p class="u-m0 muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
    box.dataset.loaded = '1';
    box.innerHTML = (d.items||[]).map(it => `<div><span>${it.qty}× ${escapeHtml(it.name)}</span><b>${money(it.total)}</b></div>`).join('')
      + (Number(d.discount) > 0 ? `<div class="muted"><span>İndirim</span><b>−${money(d.discount)}</b></div>` : '')
      + `<div class="oad-tot"><span>Toplam</span><b>${money(d.total)}</b></div>`
      + `<button type="button" class="pc-btn" style="margin-top:6px;" ${act('openSaleDetailModal', historyId)}>🔍 Tam fiş detayı</button>`;
  }
  box.hidden = false;
}
async function collectOpenAccount(id){
  { const dr = document.getElementById('oaEntriesModalBg'); if(dr) dr.remove(); }
  const a = ((APP.openAccReport||{}).accounts||[]).find(x => x.id===id); if(!a) return;
  const v = await uiPrompt('"' + a.name + '" hesabından tahsil edilecek tutar (bakiye ' + money(a.balance) + '):', String(Math.round(a.balance*100)/100));
  if(v === null) return;
  const amount = parseFloat(String(v).replace(',', '.'));
  if(!(amount > 0)){ alert('Geçerli bir tutar girin'); return; }
  const method = await uiConfirm('Tahsilat nasıl alındı?', { title:'Ödeme yöntemi', icon:'💳', okText:'💳 Kart', cancelText:'💵 Nakit' }) ? 'card' : 'cash';
  const { error } = await withLoadingOverlay(sb.rpc('collect_open_account', { p_token: getSession().session_token, p_account_id: id, p_amount: amount, p_method: method }));
  if(error){ alert(error.message); return; }
  showToast('✅ ' + money(amount) + ' tahsil edildi');
  renderOpenAccountsContent(getSession());
}

/* KDV raporu: seçili tarih aralığındaki satışlar KDV oranına göre (fiyatlar KDV dahil).
   İndirimler kalemlere orantılı dağıtılır, bahşiş KDV'ye dahil edilmez. Muhasebeciye
   ve beyanname için özet; resmi belge yerine geçmez. */
async function renderVatReportContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_vat_report', { p_token: session.session_token, p_from: APP.reportDate, p_to: APP.reportDateTo || APP.reportDate }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  APP.vatReport = data;
  const rates = data.rates || [];
  const gross = rates.reduce((s, r) => s + Number(r.gross), 0);
  el.innerHTML = `
    <div class="order-summary stat-chips" style="--n:4;"><div class="os-chip" style="--oc:var(--c1);"><span class="os-ic">🧾</span><div><b>${money(gross)}</b><small>KDV Dahil Satış</small></div></div><div class="os-chip" style="--oc:var(--c2);"><span class="os-ic">📄</span><div><b>${money(data.base_total)}</b><small>Matrah (KDV Hariç)</small></div></div><div class="os-chip" style="--oc:var(--c3);"><span class="os-ic">🏛️</span><div><b>${money(data.vat_total)}</b><small>Hesaplanan KDV</small></div></div><div class="os-chip" style="--oc:var(--c4);"><span class="os-ic">🍽️</span><div><b>${data.sales_count}</b><small>Satış (Adisyon)</small></div></div></div>
    ${rates.length ? `<div class="ch-row"><div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>🏛️</i>Orana Göre KDV</h3>${raceHtml(rates.map(r => ({ label:'%' + r.rate + ' KDV', value:Number(r.vat), display:money(r.vat), side:money(r.gross), sub:'matrah ' + money(r.base) })))}</div>
      <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🍩</i>Satış Dağılımı</h3>${svgDonut(rates.map((r, i) => ({ label:'%' + r.rate, value:Number(r.gross), color:`var(--c${i%4+1})` })), { center: shortMoney(gross), sub:'₺ KDV dahil', money:true })}</div></div>` : ''}
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--c2);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <h2 class="u-m0">KDV Oranlarına Göre · ${escapeHtml(reportDateRangeLabel())}</h2>
        <button type="button" class="u-wa-m0 ghost-btn" ${act('exportVatReportCsv')}>⬇️ Dışa aktar</button>
      </div>
      <div class="settings-table-wrap" style="margin-top:10px;"><table class="settings-table">
        <thead><tr><th>KDV Oranı</th><th>KDV Dahil Tutar</th><th>Matrah</th><th>KDV</th></tr></thead>
        <tbody>${rates.map(r => `<tr><td><b>%${r.rate}</b></td><td>${money(r.gross)}</td><td>${money(r.base)}</td><td>${money(r.vat)}</td></tr>`).join('')}
        ${rates.length ? `<tr style="font-weight:800;"><td>Toplam</td><td>${money(gross)}</td><td>${money(data.base_total)}</td><td>${money(data.vat_total)}</td></tr>` : '<tr><td colspan="4" class="u-tc muted">Bu tarihlerde satış yok.</td></tr>'}
        </tbody></table></div>
      <p class="muted" style="font-size:12px;text-align:left;margin:10px 0 0;">Fiyatlar KDV dahildir; indirimler ürünlere orantılı dağıtılır, bahşiş dahil edilmez. Ürün oranları <b>Ayarlar › Ürünler</b>'den belirlenir. Bu özet muhasebe içindir, resmi belge (ÖKC/e-Arşiv) yerine geçmez.</p>
    </div>`;
}
function exportVatReportCsv(){
  const d = APP.vatReport; if(!d) return;
  const n = (x) => Number(x).toFixed(2).replace('.', ','); // Türkçe Excel ondalık virgül bekler
  const rows = [['KDV Oranı','KDV Dahil Tutar','Matrah','KDV']].concat((d.rates||[]).map(r => ['%' + r.rate, n(r.gross), n(r.base), n(r.vat)]));
  rows.push(['Toplam', n((d.rates||[]).reduce((s, r) => s + Number(r.gross), 0)), n(d.base_total), n(d.vat_total)]);
  if(typeof downloadCsv === 'function') downloadCsv('kdv-' + d.from + (d.to !== d.from ? '_' + d.to : '') + '.csv', rows);
}

function setReportsGateScreen(s){ APP.reportsGateScreen = s; renderReportsGate(document.getElementById('main'), getSession()); }
function setBillDate(which, v){
  if(which === 'clear'){ APP.billDate = null; APP.billDateTo = null; }
  else if(which === 'from'){ APP.billDate = v || null; if(APP.billDateTo && v && APP.billDateTo < v) APP.billDateTo = v; }
  else { APP.billDateTo = v || null; if(v && !APP.billDate) APP.billDate = v; }
  APP.reportBillsFilter = { hour:'', table:'', method:'', source:'' };
  renderReportTabContent(getSession());
}
function setReportBillsFilter(k, v){ APP.reportBillsFilter[k] = v; renderReportTabContent(getSession()); }
function resetReportBillsFilter(){ APP.reportBillsFilter = { hour:'', table:'', method:'', source:'' }; renderReportTabContent(getSession()); }
function setProductStatsOpt(k, v){ APP[k] = v; redrawReportPart(renderProductStatsContent, getSession()); }

/* Gün × saat yoğunluk ısı haritası (kapatılan hesapların kapanış saatine göre). */
function heatmapHtml(hist){
  if(!hist.length) return '';
  const DAYS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'], g = {}; let max = 0, lo = 23, hi = 0;
  hist.forEach(o => { const d = new Date(o.closed_at), dw = (d.getDay()+6)%7, h = d.getHours(), k = dw+'_'+h;
    g[k] = g[k] || { r:0, c:0 }; g[k].r += Number(o.total)||0; g[k].c++; max = Math.max(max, g[k].r); lo = Math.min(lo, h); hi = Math.max(hi, h); });
  const hrs = []; for(let h = lo; h <= hi; h++) hrs.push(h);
  const usedDays = DAYS.map((n, i) => i).filter(i => hrs.some(h => g[i+'_'+h]));
  return `<div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🔥</i>Yoğunluk Haritası <span class="muted" style="font-size:12px;font-weight:400;">gün × saat · koyu = yoğun</span></h3>
    <div class="hm" style="--cols:${hrs.length};">
      <span></span>${hrs.map(h => `<span class="hm-h">${String(h).padStart(2,'0')}</span>`).join('')}
      ${usedDays.map((di, ri) => `<span class="hm-d">${DAYS[di]}</span>${hrs.map((h, ci) => { const c = g[di+'_'+h], v = c ? c.r/max : 0;
        return `<span class="hm-c ${ri===0?'hm-top':''}" tabindex="0" style="--v:${v.toFixed(3)};--i:${ri*hrs.length+ci};">${c ? `<em>${DAYS[di]} ${String(h).padStart(2,'0')}:00<br><b>${escapeHtml(money(c.r))}</b><br>${c.c} hesap</em>` : ''}</span>`; }).join('')}`).join('')}
    </div>
    <div class="hm-leg"><small>Az</small><i></i><small>Çok</small></div></div>`;
}
/* Genel Özet ekleri: önceki döneme göre değişim, son 7 gün mini grafiği ve günlük hedef halkası. */
async function loadFsExtras(session, curRevenue){
  const dstr = (d) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const from = new Date(APP.reportDate+'T00:00'), to = new Date((APP.reportDateTo||APP.reportDate)+'T00:00');
  const len = Math.round((to - from)/864e5) + 1;
  const prevFrom = new Date(from); prevFrom.setDate(prevFrom.getDate() - len);
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1);
  const sparkFrom = new Date(to); sparkFrom.setDate(sparkFrom.getDate() - 6);
  const extFrom = prevFrom < sparkFrom ? prevFrom : sparkFrom;
  const today = todayLocalDateStr();
  const [ext, goalRes, todayRes] = await Promise.all([
    sb.rpc('get_sales_history', { p_token: session.session_token, p_date: dstr(extFrom), p_date_to: dstr(to) }),
    sb.rpc('get_daily_goal', { p_token: session.session_token }),
    sb.rpc('get_sales_history', { p_token: session.session_token, p_date: today, p_date_to: today })
  ]);
  const rows = (ext.data || []).filter(o => !o.tags || !o.tags.length);
  const dayRev = {}; rows.forEach(o => { const k = dstr(new Date(o.closed_at)); dayRev[k] = (dayRev[k]||0) + (Number(o.total)||0); });
  let prev = 0; for(let d = new Date(prevFrom); d <= prevTo; d.setDate(d.getDate()+1)) prev += dayRev[dstr(d)] || 0;
  const pts = []; for(let d = new Date(sparkFrom); d <= to; d.setDate(d.getDate()+1)) pts.push({ k: dstr(d), v: dayRev[dstr(d)] || 0 });
  const tr = document.getElementById('fsTrend');
  if(tr){
    const ch = prev ? Math.round((curRevenue - prev) / prev * 100) : null;
    tr.innerHTML = `${ch === null ? '' : `<span class="fs-delta ${ch>=0?'up':'down'}" title="Önceki ${len} güne göre (${money(prev)})">${ch>=0?'▲':'▼'} %${Math.abs(ch)}<small> önceki ${len===1?'güne':len+' güne'} göre</small></span>`}
      ${sparklineSvg(pts)}`;
  }
  const gEl = document.getElementById('fsGoal');
  const goal = Number(goalRes.data) || 0, todayRev = (todayRes.data || []).filter(o => !o.tags || !o.tags.length).reduce((x, o) => x + (Number(o.total)||0), 0);
  if(gEl) gEl.innerHTML = goalRingHtml(todayRev, goal);
  if(goal && todayRev >= goal){
    let key = 'goalCelebrated_' + today, done = false;
    try{ done = localStorage.getItem(key) === '1'; localStorage.setItem(key, '1'); }catch(e){}
    if(!done) celebrate();
  }
}
function sparklineSvg(pts){
  if(pts.length < 2) return '';
  const W = 150, H = 40, max = Math.max(1, ...pts.map(p => p.v)), step = W / (pts.length - 1);
  const xy = pts.map((p, i) => [i*step, H - 4 - (p.v/max)*(H-10)]);
  const line = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Son 7 gün ciro">
    <path d="${line} L${W} ${H} L0 ${H} Z" class="spark-a"/><path d="${line}" class="spark-l"/>
    ${xy.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i===xy.length-1?3.5:2}" class="spark-d"><title>${new Date(pts[i].k+'T00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'short'})}: ${money(pts[i].v)}</title></circle>`).join('')}
  </svg><small class="spark-cap">son 7 gün</small>`;
}
function goalRingHtml(rev, goal){
  const C = 2*Math.PI*40, pct = goal ? Math.min(1, rev/goal) : 0, done = goal && rev >= goal;
  return `<div class="gr ${done?'done':''}" ${act('editDailyGoal', goal)} title="Günlük hedefi değiştir">
    <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" class="gr-t"/><circle cx="50" cy="50" r="40" class="gr-v" style="stroke-dasharray:${C};--off:${C*(1-pct)};--full:${C};"/></svg>
    <div class="gr-in">${goal ? `<b>%${Math.round(rev/goal*100)}</b><small>${done ? '🎉 hedef tamam' : 'bugünkü hedef'}</small>` : '<b>🎯</b><small>hedef koy</small>'}</div>
    <div class="gr-cap">${goal ? escapeHtml(shortMoney(rev)) + ' / ' + escapeHtml(shortMoney(goal)) + ' ₺' : 'Günlük ciro hedefi'}</div>
  </div>`;
}
function editDailyGoal(cur){
  const old = document.getElementById('dgModal'); if(old) old.remove();
  const bg = document.createElement('div'); bg.id = 'dgModal'; bg.className = 'dg-bg';
  const presets = [5000, 10000, 20000, 30000, 50000, 75000, 100000];
  bg.innerHTML = `<div class="dg-card">
    <button type="button" class="dg-x" ${act('closeDailyGoal')} title="Kapat">✕</button>
    <div class="dg-ic">🎯</div>
    <h2>Günlük Ciro Hedefi</h2>
    <p class="muted">Her gün ulaşmak istediğiniz ciroyu belirleyin; Genel Özet'teki halka buna göre dolar.</p>
    <div class="dg-input"><input id="dgVal" type="text" inputmode="numeric" placeholder="0" value="${cur ? Number(cur).toLocaleString('tr-TR') : ''}" ${actOn('input','dgFormat',['$value'])} ${actOn('keydown','onEnterKey',['$event','saveDailyGoal'])}><span>₺</span></div>
    <div class="dg-presets">${presets.map(v => `<button type="button" class="pc-btn" ${act('dgPick', v)}>${shortMoney(v)} ₺</button>`).join('')}</div>
    <div class="dg-acts">
      ${cur ? `<button type="button" class="pc-btn dg-del" ${act('saveDailyGoal', 'clear')}>🗑 Hedefi Kaldır</button>` : '<span></span>'}
      <div><button type="button" class="pc-btn" ${act('closeDailyGoal')}>Vazgeç</button>
      <button type="button" class="rg-btn dg-save" ${act('saveDailyGoal')}>Kaydet</button></div>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if(e.target === bg) closeDailyGoal(); });
  document.body.appendChild(bg);
  setTimeout(() => { const i = document.getElementById('dgVal'); if(i){ i.focus(); i.select(); } }, 30);
}
function closeDailyGoal(){ const m = document.getElementById('dgModal'); if(m) m.remove(); }
function dgFormat(v){
  const i = document.getElementById('dgVal'); const d = String(v).replace(/\D/g, '');
  i.value = d ? Number(d).toLocaleString('tr-TR') : '';
}
function dgPick(v){ const i = document.getElementById('dgVal'); i.value = Number(v).toLocaleString('tr-TR'); i.focus(); }
async function saveDailyGoal(mode){
  const raw = mode === 'clear' ? '' : (document.getElementById('dgVal').value || '').replace(/\D/g, '');
  const n = raw === '' ? null : Number(raw);
  if(mode !== 'clear' && !n){ showToast('Geçerli bir tutar girin'); return; }
  const { error } = await sb.rpc('set_daily_goal', { p_token: getSession().session_token, p_goal: n });
  if(error){ alert(error.message); return; }
  closeDailyGoal();
  showToast(n ? 'Günlük hedef kaydedildi 🎯' : 'Günlük hedef kaldırıldı');
  renderReportTabContent(getSession());
}
/* Hedefe ulaşınca kısa konfeti efekti. */
function celebrate(){
  const box = document.createElement('div'); box.className = 'confetti';
  const colors = ['var(--c1)','var(--c2)','var(--c3)','var(--c4)','#facc15'];
  box.innerHTML = Array.from({ length: 70 }, (_, i) => `<i style="left:${Math.random()*100}%;background:${colors[i%5]};animation-delay:${(Math.random()*.6).toFixed(2)}s;animation-duration:${(1.8+Math.random()*1.4).toFixed(2)}s;transform:rotate(${Math.round(Math.random()*360)}deg);"></i>`).join('')
    + '<div class="confetti-msg">🎉 Günlük hedefe ulaşıldı!</div>';
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

/* Sıralı yatay çubuk listesi (en çok satanlar tarzı): [{label, value, display, side, sub}] */
const RACE_COLORS = ['#3b82f6','#f97316','#10b981','#eab308','#8b5cf6','#ec4899','#06b6d4','#ef4444','#84cc16','#6366f1','#14b8a6','#f59e0b'];
function raceHtml(items){
  if(!items.length) return '<p class="muted">Veri yok.</p>';
  const max = Math.max(1, ...items.map(x => x.value));
  return `<div class="race">${items.map((x, i) => `<div class="race-row" style="--i:${Math.min(i,15)};--sc:${RACE_COLORS[i%RACE_COLORS.length]};">
    <span class="race-rank ${i<3?'top':''}">${['🥇','🥈','🥉'][i] || (i+1)}</span>
    <div class="race-main"><div class="race-label"><b>${escapeHtml(x.label)}</b>${x.sub ? `<small>${escapeHtml(x.sub)}</small>` : ''}</div>
      <div class="race-track"><div class="race-bar" style="width:${Math.max(3, Math.round(x.value/max*100))}%;"><span>${escapeHtml(x.display)}</span></div></div></div>
    <span class="race-side">${escapeHtml(x.side||'')}</span></div>`).join('')}</div>`;
}

/* ---- Gün Sonu Kapanışları: son N iş gününün kapanış durumu (takvim şeridi), kasa farkı grafiği ve liste. ---- */
function setDayCloseRange(n){ APP.dayCloseRange = n; redrawReportPart(renderDayClosesContent, getSession()); }
async function renderDayClosesContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const n = APP.dayCloseRange || 30;
  el.innerHTML = '<p class="muted">Yükleniyor…</p>';
  const { data, error } = await sb.rpc('list_day_closes', { p_token: session.session_token, p_days: n });
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  const rows = (data || []).slice().reverse(); // eskiden yeniye
  const st = (r) => !r.past ? (r.closed_at ? (r.skipped ? 'skip' : 'ok') : 'today') : r.closed_at ? (r.skipped ? 'skip' : 'ok') : (Number(r.bills) > 0 ? 'open' : 'none');
  const ST = { ok:['✓','Kapandı','dc-ok'], skip:['!','Sayılmadı','dc-skip'], open:['✕','Kapanmadı','dc-open'], none:['–','Satış yok','dc-none'], today:['…','Bugün (açık)','dc-today'] };
  const cnt = (k) => rows.filter(r => st(r)===k).length;
  const withSales = rows.filter(r => r.past && Number(r.bills) > 0).length;
  const counted = rows.filter(r => st(r)==='ok');
  const totDiff = counted.reduce((t, r) => t + (Number(r.diff)||0), 0);
  const rate = withSales ? Math.round(cnt('ok') / withSales * 100) : 0;
  const dTxt = (d, o) => new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', o || { day:'numeric', month:'short' });
  const tile = (ic, v, l, tone, num, fmt) => `<div class="dcx-kpi" style="--sc:${tone};"><span>${ic}</span><b ${num != null ? `data-count="${num}" data-fmt="${fmt||''}"` : ''}>${v}</b><small>${l}</small></div>`;
  // Günlük nakit grafiği: çubuk = beklenen nakit, renk = kapanış durumu; kapanan günlerde üstte kasa farkı.
  const maxCash = Math.max(1, ...rows.map(r => Number(r.expected_cash)||0));
  const step = Math.max(1, Math.ceil(rows.length / 10));
  const cols = rows.map((r, i) => {
    const k = st(r), cash = Number(r.expected_cash)||0, h = cash ? Math.max(4, cash / maxCash * 100) : 0, diff = Number(r.diff)||0;
    const tip = dTxt(r.d, { day:'numeric', month:'long', weekday:'short' }) + ' · ' + ST[k][1] + (Number(r.bills) ? ' · ' + r.bills + ' hesap · beklenen nakit ' + money(cash) : '') + (k==='ok' ? ' · sayılan ' + money(r.counted) + ' · fark ' + (diff > 0 ? '+' : '') + money(diff) : '');
    return `<div class="dcx-col ${ST[k][2]}" style="--i:${i};" data-tip="${escapeAttr(tip)}">
      <span class="dcx-diffw">${k==='ok' && diff ? `<span class="dcx-diff ${diff < 0 ? 'neg' : 'pos'}">${diff > 0 ? '+' : ''}${Math.round(diff)}</span>` : ''}</span>
      <div class="dcx-colv">${h ? `<i style="height:${h}%;"></i>` : '<i class="dcx-empty"></i>'}</div>
      <span class="dcx-ic">${ST[k][0]}</span>
      <small class="dcx-dl">${i % step === 0 || i === rows.length - 1 ? dTxt(r.d) : ''}</small></div>`;
  }).join('');
  el.innerHTML = `<div class="report-card">
      <div class="dcx-head"><h3 class="u-m0">🧾 Gün Sonu Kapanışları</h3>
        <div class="dcx-range">${[14,30,60,90].map(k => `<button type="button" class="${n===k?'on':''}" ${act('setDayCloseRange', k)}>${k} gün</button>`).join('')}</div></div>
      <div class="dcx-kpis">
        ${tile('✅', cnt('ok'), 'Kapandı', 'var(--ok,#22c55e)', cnt('ok'))}
        ${tile('⛔', cnt('open'), 'Kapanmadı', 'var(--danger,#ef4444)', cnt('open'))}
        ${tile('⚠️', cnt('skip'), 'Kasa sayılmadı', 'var(--amber,#f59e0b)', cnt('skip'))}
        ${tile('📈', '%' + rate, 'Kapanış oranı (satışlı günler)', 'var(--c1)', rate, 'pct')}
        ${tile('💵', (totDiff > 0 ? '+' : '') + money(totDiff), 'Toplam kasa farkı', totDiff < 0 ? 'var(--danger,#ef4444)' : 'var(--ok,#22c55e)', totDiff, 'money')}
      </div>
      <h4 class="dcx-t">Takvim</h4>
      <div class="dcx-cal">${rows.map(r => { const k = st(r), t = ST[k]; return `<div class="dcx-day ${t[2]}" style="--i:${rows.indexOf(r)};" title="${escapeAttr(dTxt(r.d, { day:'numeric', month:'long', weekday:'long' }) + ' · ' + t[1] + (Number(r.bills) ? ' · ' + r.bills + ' hesap · ' + money(r.revenue) : ''))}"><b>${t[0]}</b><small>${dTxt(r.d, { day:'numeric' })}</small></div>`; }).join('')}</div>
      <div class="dcx-legend">${['ok','open','skip','none','today'].map(k => `<span><i class="${ST[k][2]}">${ST[k][0]}</i>${ST[k][1]}</span>`).join('')}</div>
      <h4 class="dcx-t">Günlük nakit ve kapanış</h4>
      <div class="dcx-bars"><div class="dcx-y"><span>${money(maxCash)}</span><span>${money(maxCash/2)}</span><span>0</span></div><div class="dcx-plot" id="dcxPlot">${cols}<div class="dcx-tip" id="dcxTip"></div></div></div>
      <p class="fs-note">Çubuk yüksekliği o günün beklenen nakdi; renk kapanış durumu. Kapanan günlerde üstteki sayı kasa farkı (₺). Ayrıntı için çubuğun üzerine gelin.</p>
      <h4 class="dcx-t">Günler</h4>
      <div class="dcx-list">${(data || []).map(r => { const k = st(r), t = ST[k]; return `<div class="dcx-row">
          <span class="dcx-badge ${t[2]}">${t[0]} ${t[1]}</span>
          <span class="dcx-d"><b>${escapeHtml(dTxt(r.d, { day:'numeric', month:'long', weekday:'short' }))}</b><small>${Number(r.bills) ? r.bills + ' hesap · ' + money(r.revenue) : 'Satış yok'}</small></span>
          <span class="dcx-n">${k==='ok' ? `Beklenen ${money(r.expected_cash)} · Sayılan <b>${money(r.counted)}</b> · <b class="${Number(r.diff) < 0 ? 'neg' : Number(r.diff) > 0 ? 'pos' : ''}">${Number(r.diff) > 0 ? '+' : ''}${money(r.diff)}</b>` : k==='skip' ? escapeHtml(r.note || '') : k==='open' ? `Beklenen nakit ${money(r.expected_cash)}` : ''}</span>
          <span class="dcx-by">${r.closed_by ? escapeHtml(r.closed_by) + ' · ' + new Date(r.closed_at).toLocaleString('tr-TR', { dateStyle:'short', timeStyle:'short' }) : ''}</span>
        </div>`; }).join('')}</div>
    </div>`;
  dcxAnimate();
}
// Sayıların yukarı doğru sayması ve grafik ipucu (çubuğun üzerine gelince kart).
function dcxAnimate(){
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.dcx-kpi b[data-count]').forEach(b => {
    const end = Number(b.dataset.count)||0, fmt = b.dataset.fmt, show = (v) => fmt==='money' ? (end > 0 ? '+' : '') + money(v) : fmt==='pct' ? '%' + Math.round(v) : String(Math.round(v));
    if(reduce || !end){ b.textContent = show(end); return; }
    const t0 = performance.now(), dur = 900;
    const tick = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); b.textContent = show(end * e); if(p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const plot = document.getElementById('dcxPlot'), tip = document.getElementById('dcxTip');
  if(plot && tip){
    plot.addEventListener('mousemove', (e) => {
      const col = e.target.closest && e.target.closest('.dcx-col'); if(!col){ tip.classList.remove('on'); return; }
      tip.innerHTML = escapeHtml(col.dataset.tip || '').split(' · ').map((x, i) => i ? `<span>${x}</span>` : `<b>${x}</b>`).join('');
      const pr = plot.getBoundingClientRect(), cr = col.getBoundingClientRect();
      tip.style.left = Math.min(pr.width - 200, Math.max(0, cr.left - pr.left + cr.width / 2 - 100)) + 'px';
      tip.classList.add('on');
    });
    plot.addEventListener('mouseleave', () => tip.classList.remove('on'));
  }
}

/* Genel Özet › İndirim, Puan ve İkram: "N hesap"a tıklayınca o hesapların masa listesi. */
function openFsBillList(kind){
  const isComp = (o) => o.tags && o.tags.length>0 && (!o.payment_method || o.payment_method === 'comp');
  const T = { discount: ['🏷️ İndirimli hesaplar', o => !isComp(o) && Number(o.discount_amount) > 0, o => o.discount_amount],
    points: ['⭐ Puanla ödenen hesaplar', o => !isComp(o) && Number(o.points_amount) > 0, o => o.points_amount],
    birthday: ['🎂 Doğum günü indirimli hesaplar', o => !isComp(o) && Number(o.birthday_discount_amount) > 0, o => o.birthday_discount_amount],
    comp: ['🍱 Personel / ikram hesapları', isComp, o => o.subtotal] }[kind];
  if(!T) return;
  const rows = (APP.fsHist || []).filter(T[1]).sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at));
  const bg = document.createElement('div'); bg.id = 'fsBillBg'; bg.className = 'modal-bg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:120;padding:7vh 16px 16px;overflow-y:auto;';
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  const byTable = {}; rows.forEach(o => { const k = o.kind === 'takeaway' ? '📦 Paket' : (o.table_name || '-'); byTable[k] = (byTable[k] || 0) + 1; });
  bg.innerHTML = `<div class="order-modal fs-billmodal">
    <div class="u-row-sb"><h2 class="u-m0">${T[0]}</h2><span class="u-xclose" ${act('removeEl', 'fsBillBg')}>✕</span></div>
    <p class="muted" style="margin:6px 0 10px;">${rows.length} hesap · ${escapeHtml(typeof reportDateRangeLabel === 'function' ? reportDateRangeLabel() : '')}</p>
    <div class="fs-billchips">${Object.entries(byTable).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<span class="pchip">🪑 ${escapeHtml(t)} · ${n}</span>`).join('')}</div>
    <div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Saat</th><th>Masa</th><th>Personel</th><th>Etiket</th><th>Tutar</th><th>${kind === 'comp' ? 'Değer' : 'Kullanılan'}</th><th></th></tr></thead><tbody>
    ${rows.map(o => `<tr><td>${new Date(o.closed_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td class="col-name">${escapeHtml(o.kind === 'takeaway' ? '📦 Paket' : (o.table_name || '-'))}</td><td>${escapeHtml(o.staff_username || o.staff_name || '—')}</td><td>${escapeHtml((o.tags || []).join(', ') || '—')}</td><td>${money(o.total)}</td><td><b>${money(T[2](o) || 0)}</b></td><td>${o.id ? `<button type="button" class="pc-btn" ${act('openSaleDetailModal', o.id)}>🔍 Detay</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  document.body.appendChild(bg);
}

/* Satınalma: siparişin tedarikçisini satınalma sorumlusu seçer. */
async function setPoSupplier(poId, supplierId){
  const { error } = await sb.rpc('set_purchase_order_supplier', { p_token: getSession().session_token, p_po_id: poId, p_supplier_id: supplierId || null });
  if(error){ alert(error.message); return; }
  showToast(supplierId ? 'Tedarikçi kaydedildi ✓' : 'Tedarikçi kaldırıldı');
  renderPurchaseReportContent(getSession());
}
