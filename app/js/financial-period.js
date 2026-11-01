// Dönemsel analiz, kapatılan hesap detayı, rezervasyon analizi (financial.js'ten ayrıldı; klasik script, fonksiyonlar global).

/* --- Dönemsel Analiz: aylık ve mevsimlik ciro, haftanın günleri, en çok çalışan masalar
   (bkz. get_period_analytics). Kısa aralıkta "Son 12 Ay" kısayolu önerilir. --- */
function setReportLast12Months(){
  const to = new Date(), from = new Date(); from.setMonth(from.getMonth()-11); from.setDate(1);
  const f = (d) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  APP.reportDate = f(from); APP.reportDateTo = f(to);
  const a = document.getElementById('reportDateInput'); if(a) a.value = APP.reportDate;
  const b = document.getElementById('reportDateToInput'); if(b) b.value = APP.reportDateTo;
  renderReportTabContent(getSession());
}
function setPeriodYear(y){ APP.periodYear = Number(y); renderPeriodAnalyticsContent(getSession()); }
async function renderPeriodAnalyticsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  // Bu sekme üstteki tarih aralığından bağımsız: seçilen yılın 12 ayı, 4 mevsimi ve haftanın 7 günü.
  const nowY = new Date().getFullYear();
  const year = APP.periodYear || nowY;
  const { data: d, error } = await withLoadingOverlay(sb.rpc('get_period_analytics', { p_token: session.session_token, p_date: year+'-01-01', p_date_to: year+'-12-31' }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const DOW = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
  const SEASONS = [
    { k:'Kış', ic:'❄️', m:[12,1,2], c:'#38bdf8' }, { k:'İlkbahar', ic:'🌱', m:[3,4,5], c:'#22c55e' },
    { k:'Yaz', ic:'☀️', m:[6,7,8], c:'#f59e0b' }, { k:'Sonbahar', ic:'🍂', m:[9,10,11], c:'#f97316' } ];
  const N = (v) => Number(v)||0;
  const byM = {}; (d.monthly||[]).forEach(r => { byM[Number(r.ym.split('-')[1])] = r; });
  const months = MONTHS.map((name, i) => { const r = byM[i+1] || {}; return { i: i+1, name, revenue:N(r.revenue), checks:N(r.checks), profit:N(r.profit), avg:N(r.avg_check) }; });
  const yearRev = months.reduce((t, m) => t + m.revenue, 0), yearChecks = months.reduce((t, m) => t + m.checks, 0), yearProfit = months.reduce((t, m) => t + m.profit, 0);
  const maxM = Math.max(1, ...months.map(m => m.revenue));
  const bestM = months.reduce((a, m) => m.revenue > a.revenue ? m : a, months[0]);
  const curM = year===nowY ? new Date().getMonth()+1 : 13;
  const pctChange = (cur, prev) => prev > 0 ? Math.round((cur-prev)/prev*100) : null;
  const monthCards = months.map((m, idx) => {
    const future = m.i > curM;
    const ch = idx > 0 ? pctChange(m.revenue, months[idx-1].revenue) : null;
    const mc = (SEASONS.find(se => se.m.includes(m.i)) || {}).c || 'var(--accent)';
    return `<div class="pm-card${m===bestM && m.revenue>0 ? ' pm-best':''}${future?' pm-future':''}" style="--mc:${mc};">
      <div class="pm-head"><span>${m.name}</span>${m===bestM && m.revenue>0 ? '<span title="En yüksek ay">🏆</span>' : ''}</div>
      <div class="pm-rev">${future ? '—' : money(m.revenue)}</div>
      <div class="pm-bar"><div style="width:${Math.round(m.revenue/maxM*100)}%;"></div></div>
      <div class="pm-meta"><span>🧾 ${m.checks} hesap</span>${m.checks ? `<span>Ort. ${money(m.avg)}</span>` : ''}</div>
      <div class="pm-meta"><span style="color:${m.profit>=0?'var(--green)':'var(--red)'};">Kâr ${money(m.profit)}</span>${ch!=null && !future ? `<span class="pm-ch ${ch>=0?'up':'down'}">${ch>=0?'▲':'▼'} %${Math.abs(ch)}</span>` : ''}</div>
    </div>`;
  }).join('');
  const seasons = SEASONS.map(se => {
    const ms = months.filter(m => se.m.includes(m.i));
    const rev = ms.reduce((t, m) => t + m.revenue, 0), checks = ms.reduce((t, m) => t + m.checks, 0), profit = ms.reduce((t, m) => t + m.profit, 0);
    return { ...se, rev, checks, profit, ms };
  });
  const bestS = seasons.reduce((a, x) => x.rev > a.rev ? x : a, seasons[0]);
  const seasonCards = seasons.map(se => `<div class="ps-card" style="--ps-c:${se.c};">
      <div class="ps-head"><span class="ps-ic">${se.ic}</span><b>${se.k}</b>${se===bestS && se.rev>0 ? ' <span title="En yoğun mevsim">🏆</span>' : ''}<span class="ps-share">%${yearRev ? Math.round(se.rev/yearRev*100) : 0}</span></div>
      <div class="ps-rev">${money(se.rev)}</div>
      <div class="ps-meta">🧾 ${se.checks} hesap · Kâr ${money(se.profit)}</div>
      <div class="ps-months">${se.ms.map(m => `<div><span>${m.name.slice(0,3)}</span><b>${m.i>curM ? '—' : money(m.revenue)}</b></div>`).join('')}</div>
    </div>`).join('');
  const wd = {}; (d.weekdays||[]).forEach(r => { wd[r.dow] = r; });
  const days = DOW.map((name, i) => { const r = wd[i+1] || {}; return { name, avg: N(r.days) ? N(r.revenue)/N(r.days) : 0, checks:N(r.checks), total:N(r.revenue) }; });
  const maxD = Math.max(1, ...days.map(x => x.avg)), bestD = days.reduce((a, x) => x.avg > a.avg ? x : a, days[0]);
  const dayCards = days.map((x, i) => `<div class="pd-card${x===bestD && x.avg>0?' pm-best':''}${i>=5?' pd-weekend':''}">
      <div class="pd-name">${x.name.slice(0,3)}</div>
      <div class="pd-col"><div style="height:${Math.max(4, Math.round(x.avg/maxD*100))}%;"></div></div>
      <div class="pd-val">${money(x.avg)}</div><div class="pd-sub">${x.checks} hesap</div></div>`).join('');
  const tables = d.tables || [];
  el.innerHTML = `
    <div class="box" style="max-width:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span class="muted">Yıl</span>
      ${[nowY-2, nowY-1, nowY].map(y => `<button type="button" class="range-preset-btn${y===year?' active':''}" ${act('setPeriodYear', y)}>${y}</button>`).join('')}
      <span class="muted" style="flex:1;text-align:right;font-size:12.5px;">Bu sekme üstteki tarih aralığından bağımsızdır.</span>
    </div>
    <div class="fs-hero">
      <div class="fs-hero-main"><div class="fs-cap">💰 ${year} Toplam Ciro</div><div class="fs-big">${money(yearRev)}</div><div class="fs-line">${yearChecks} hesap</div></div>
      <div class="fs-hero-side">
        <div class="fs-k" style="--k:${yearProfit<0?'var(--red)':'var(--green)'};"><div class="fs-cap">📈 Yıllık Kâr</div><div class="fs-mid">${money(yearProfit)}</div><div class="fs-line">${yearRev ? 'Marj %'+Math.round(yearProfit/yearRev*100) : '—'}</div></div>
        <div class="fs-k" style="--k:#a78bfa;"><div class="fs-cap">📊 Aylık Ortalama</div><div class="fs-mid">${money(yearRev / Math.max(1, Math.min(12, curM)))}</div><div class="fs-line">geçen aylar</div></div>
        <div class="fs-k" style="--k:#eab308;"><div class="fs-cap">🏆 En İyi Ay</div><div class="fs-mid">${bestM.revenue ? bestM.name : '—'}</div><div class="fs-line">${bestM.revenue ? money(bestM.revenue) : ''}</div></div>
      </div>
    </div>
    <div class="ch-row">
      <div class="fs-panel pa-sec" style="--t:#a78bfa;"><h3><i>🗓️</i>Haftanın Günleri <span class="muted" style="font-size:12px;font-weight:400;">günlük ortalama ciro</span></h3>${svgBarChart(days.map(x => ({ label: ({Pazartesi:'Pzt',Salı:'Sal',Çarşamba:'Çar',Perşembe:'Per',Cuma:'Cum',Cumartesi:'Cmt',Pazar:'Paz'})[x.name] || x.name.slice(0,3), value: x.avg, display: money(x.avg) + ' / gün · ' + x.checks + ' hesap' })), { title:'Haftanın günleri', height: 200 })}</div>
      <div class="fs-panel pa-sec" style="--t:#22c55e;"><h3><i>🍩</i>Mevsim Payları</h3>${svgDonut(seasons.map(se => ({ label: se.ic + ' ' + se.k, value: se.rev, color: se.c })), { center: shortMoney(yearRev), sub:'₺ ' + year, title:'Mevsim payları', money:true })}</div>
    </div>
    <div class="fs-panel pa-sec" style="--t:#22c55e;"><h3><i>🌦️</i>4 Mevsim</h3><div class="ps-grid">${seasonCards}</div></div>
    <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>📊</i>${year} Aylık Ciro</h3>${svgBarChart(months.map(m => ({ label: m.name.slice(0,3), value: m.revenue, display: money(m.revenue) + ' · ' + m.checks + ' hesap · kâr ' + money(m.profit) })), { title:'Aylık ciro', height: 240 })}</div>
    <div class="fs-panel pa-sec" style="--t:var(--accent);"><h3><i>📅</i>Aylar <span class="pa-legend">${SEASONS.map(se => `<span><b style="background:${se.c};"></b>${se.k}</span>`).join('')}</span></h3><div class="pm-grid">${monthCards}</div></div>
    <div class="fs-panel pa-sec" style="--t:#f59e0b;"><h3><i>🪑</i>En Çok Çalışan Masalar <span class="muted" style="font-size:12px;font-weight:400;">${year}</span></h3>
      ${tables.length ? `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>#</th><th>Masa</th><th>Hesap</th><th>Ciro</th><th>Ort. Hesap</th><th>Ort. Oturma</th></tr></thead><tbody>
        ${tables.map((t, i) => `<tr><td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td><td class="col-name">${escapeHtml(t.table_name)}</td><td>${t.checks}</td><td><b>${money(t.revenue)}</b></td><td>${money(t.avg_check)}</td><td>${t.avg_minutes!=null ? t.avg_minutes+' dk' : '—'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Bu yıl masa hesabı yok.</p>'}</div>`;
}
async function renderPurchaseReportContent(session){
  const host = document.getElementById('procContent'); if(!host) return;
  const sub = APP.purchRepSub || 'orders';
  // Diğer ekranlar gibi soldaki kartlı menü (mobilde üstte şerit).
  host.innerHTML = `<div class="set-layout">
      <nav class="tabs settings-tabs set-nav" id="purchRepTabs">
        <div class="tab set-item ${sub==='orders'?'active on':''}" style="--i:0;--sc:var(--c1);" data-tab="purchRepOrders" ${act('setPurchRepSub','orders')}><span class="set-ico">🧾</span><span class="set-txt"><b>Siparişler &amp; Fiyatlar</b><small>Tedarikçi, fiyat, teslim bekleyen</small></span></div>
        <div class="tab set-item ${sub==='suppliers'?'active on':''}" style="--i:1;--sc:var(--c2);" data-tab="purchRepSuppliers" ${act('setPurchRepSub','suppliers')}><span class="set-ico">🏭</span><span class="set-txt"><b>Tedarikçiler</b><small>Firma ve iletişim</small></span></div>
      </nav>
      <div id="purchRepContent" class="set-content"></div></div>`;
  if(sub==='suppliers'){ APP.supplierTarget = 'purchRepContent'; return renderSuppliersContent(session); }
  const el = document.getElementById('purchRepContent');
  const [{ data, error }, supRes] = await withLoadingOverlay(Promise.all([sb.rpc('get_purchase_report', { p_token: session.session_token, p_date: APP.procFrom, p_date_to: APP.procTo }), sb.rpc('list_suppliers', { p_token: session.session_token })]));
  APP.procSuppliers = (supRes && supRes.data) || [];
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const rows = data || [];
  APP.procRows = rows;
  const live = rows.filter(p => p.status!=='draft' && p.status!=='cancelled');
  const total = live.reduce((t, p) => t + (Number(p.total_amount)||0), 0);
  const recv = live.reduce((t, p) => t + (Number(p.received_amount)||0), 0);
  const needPrice = (p) => p.status!=='draft' && p.status!=='cancelled' && (p.items||[]).some(i => !(Number(i.unit_cost)>0) && !i.free);
  const needRecv = (p) => p.status==='ordered';
  const needSup = (p) => p.status!=='draft' && p.status!=='cancelled' && !p.supplier_id;
  const isDone = (p) => p.status==='received' && !needPrice(p) && !needSup(p);
  const cnt = { all: rows.length, sup: rows.filter(needSup).length, price: rows.filter(needPrice).length, recv: rows.filter(needRecv).length, done: rows.filter(isDone).length };
  const flt = APP.procFilter || 'all';
  const shown = rows.filter(p => flt==='sup' ? needSup(p) : flt==='price' ? needPrice(p) : flt==='recv' ? needRecv(p) : flt==='done' ? isDone(p) : true);
  const bySup = {};
  live.forEach(p => { const k = p.supplier_name || 'Tedarikçisiz'; bySup[k] = (bySup[k]||0) + (Number(p.total_amount)||0); });
  const statusOf = (p) => typeof poStatusBadge==='function' ? poStatusBadge(Object.assign({}, p, { ordered_total: (p.items||[]).reduce((t,i)=>t+Number(i.quantity||0),0), received_total: (p.items||[]).reduce((t,i)=>t+Math.min(Number(i.received||0),Number(i.quantity||0)),0) })) : escapeHtml(p.status);
  const CHIP_C = { all:'var(--accent)', sup:'#fb923c', price:'var(--red)', recv:'#f59e0b', done:'var(--green)' };
  const chip = (k, l) => `<button type="button" class="pc-chip${flt===k?' active':''}" style="--cc:${CHIP_C[k]};" ${act('setProcFilter', k)}>${l}<span>${cnt[k]}</span></button>`;
  const card = (p, idx) => {
    const tone = needPrice(p) ? 'var(--danger,#ef4444)' : needRecv(p) ? '#f59e0b' : p.status==='received' ? 'var(--ok,#22c55e)' : 'var(--muted)';
    const items = p.items || [];
    return `<div class="pc-card pc2" style="--pc:${tone};--i:${Math.min(idx||0,12)};">
      <div class="pc2-head">
        ${avatarHtml(p.supplier_name || 'T')}
        <div class="pc2-title"><select class="pc2-sup ${p.supplier_id ? '' : 'missing'}" title="Tedarikçi seç" data-po="${p.id}" data-orig="${p.supplier_id || ''}" ${actOn('change','markPcDirty',[p.id])}><option value="">⚠️ Tedarikçi seçin</option>${(APP.procSuppliers||[]).map(sp => `<option value="${sp.id}" ${sp.id===p.supplier_id?'selected':''}>${escapeHtml(sp.name)}</option>`).join('')}</select>
          <small>📅 ${new Date(p.order_date).toLocaleDateString('tr-TR')}${p.expected_date ? ' · 🎯 ' + new Date(p.expected_date).toLocaleDateString('tr-TR') : ''} · 👤 ${escapeHtml(p.created_by_name || '—')}</small></div>
        <div class="pc2-right"><span class="pc2-total">${money(p.total_amount)}</span>${statusOf(p)}</div>
      </div>
      <div class="pc2-items">
        ${items.length > 1 && p.status !== 'cancelled' ? `<label class="pc2-selall"><input type="checkbox" ${items.every(i => poSel().has(i.id)) ? 'checked' : ''} ${actOn('change','poSelCard',[p.id,'$checked'])}> Bu siparişin tüm kalemlerini seç</label>` : ''}
        ${items.map(i => { const q = Number(i.quantity)||0, c = Number(i.unit_cost)||0, ok = c>0 || i.free; return `<div class="pc2-it ${ok?'':'nop'} ${poSel().has(i.id) ? 'sel' : ''}">
          ${p.status !== 'cancelled' ? `<input type="checkbox" class="pc2-chk" title="Tedarikçi atamak için seç" data-po="${p.id}" data-item="${i.id}" ${poSel().has(i.id) ? 'checked' : ''} ${actOn('change','poSelItem',[i.id,'$checked'])}>` : ''}
          <span class="pc2-ic">🥕</span>
          <div class="pc2-nm"><b>${escapeHtml(i.name)}</b><small>${q} ${escapeHtml(i.unit||'')}${Number(i.received)>0 && Number(i.received)<q ? ` · teslim ${Number(i.received)}` : ''}</small></div>
          <label class="pc2-price"><input type="number" min="0" step="0.01" placeholder="Fiyat" value="${(APP.pcDrafts||{})[i.id] ?? (ok ? c : '')}" data-item-id="${i.id}" data-orig="${ok ? c : ''}" title="Bedelsiz (ücretsiz) gelen için 0 yazın" class="pc-cost ${ok ? '' : 'missing'}" ${actOn('input','markPcDirty',[p.id])}><span>₺/${escapeHtml(i.unit||'')}</span></label>
          <b class="pc2-line">${c>0 ? money(q*c) : i.free ? '<span class="pchip ok" title="Ücretsiz geldi; maliyete 0 TL olarak girer">🎁 Bedelsiz</span>' : '<span class="pchip warn">fiyat yok</span>'}</b></div>`; }).join('') || '<p class="muted">Kalem yok.</p>'}
      </div>
      <div class="pc2-foot">${p.notes ? `<div class="pc-note">📝 ${escapeHtml(p.notes)}</div>` : '<span></span>'}
        <div class="pc2-acts"><span class="pc2-share"><button type="button" class="pc-btn" title="PDF olarak indir" ${act('poExport', p.id, 'pdf')}>📄 PDF</button><button type="button" class="pc-btn" title="Yazdır" ${act('poExport', p.id, 'print')}>🖨️</button><button type="button" class="pc-btn" title="Tedarikçiye e-posta gönder" ${act('poSend', p.id, 'email')}>📧</button><button type="button" class="pc-btn" title="Tedarikçiye SMS gönder" ${act('poSend', p.id, 'sms')}>💬</button></span>${p.status==='ordered' ? `<button type="button" class="pc-btn" ${act('openReceivePOModal', p.id)}>📦 Malzemeyi Teslim Al</button>` : ''}${(p.status==='ordered' || p.status==='draft') && !(p.items || []).some(i => Number(i.received) > 0) ? `<button type="button" class="pc-btn rv-del" title="Siparişi iptal et" ${act('cancelPurchaseOrder', p.id)}>✕ İptal</button>` : ''}
          <button type="button" class="pc-save" id="pcSave_${p.id}" disabled ${act('savePoPrices', p.id)}>${ICON_SAVE}<span>Kaydet</span></button></div></div>
    </div>`;
  };
  el.innerHTML = `
    <div class="fs-hero">
      <div class="fs-hero-main"><div class="fs-cap">🧾 Sipariş Tutarı</div><div class="fs-big">${money(total)}</div><div class="fs-line">${live.length} sipariş</div></div>
      <div class="fs-hero-side">
        <div class="fs-k" style="--k:var(--green);"><div class="fs-cap">📦 Teslim Alınan</div><div class="fs-mid">${money(recv)}</div><div class="fs-line">${total ? '%'+Math.round(recv/total*100) : '—'}</div></div>
        <div class="fs-k" style="--k:#f59e0b;"><div class="fs-cap">⏳ Teslim Bekleyen</div><div class="fs-mid">${money(Math.max(0,total-recv))}</div><div class="fs-line">${cnt.recv} sipariş</div></div>
        <div class="fs-k fs-click" style="--k:${cnt.price?'var(--red)':'#a78bfa'};" ${act('setProcFilter','price')}><div class="fs-cap">🏷️ Fiyat Bekleyen</div><div class="fs-mid">${cnt.price}</div><div class="fs-line">sipariş · göster ›</div></div>
      </div>
    </div>
    <div class="pc-layout">
      <div>
        <div class="pc-chips">${chip('all','Tümü')}${chip('sup','Tedarikçi bekleyen')}${chip('price','Fiyat bekleyen')}${chip('recv','Teslim bekleyen')}${chip('done','Tamamlanan')}
          <button type="button" class="pc-save pc-save-all" id="pcSaveAll" hidden ${act('saveAllPoPrices')}>${ICON_SAVE}<span>Tümünü Kaydet</span></button></div>
        <div class="po-bulk" id="poBulk" ${poSel().size ? '' : 'hidden'}><b id="poBulkN">${poSel().size} kalem seçili</b>
          <select id="poBulkSup"><option value="">Tedarikçi seçin…</option>${(APP.procSuppliers||[]).map(sp => `<option value="${sp.id}">${escapeHtml(sp.name)}</option>`).join('')}</select>
          <button type="button" ${act('poBulkAssign')}>🚚 Tedarikçiyi ata</button><button type="button" class="ghost-btn" ${act('poSelClear')}>Seçimi kaldır</button></div>
        ${shown.length ? `<div class="pc2-grid">${shown.map((p, i) => card(p, i)).join('')}</div>` : '<div class="fs-panel"><p class="u-m0 muted">Bu filtrede sipariş yok.</p></div>'}
      </div>
      <div class="fs-panel pc-side" style="--t:#a78bfa;"><h3><i>🚚</i>Tedarikçiye Göre</h3>
        ${total ? (() => { const e = Object.entries(bySup).sort((a,b)=>b[1]-a[1]); const top = e.slice(0,3), rest = e.slice(3).reduce((t,x)=>t+x[1],0);
          return svgDonut(top.map(([k,v], i) => ({ label:k, value:v, color:`var(--c${i+1})` })).concat(rest ? [{ label:'Diğer', value:rest, color:'var(--c4)' }] : []), { center: shortMoney(total), sub:'₺ toplam', title:'Tedarikçi payları', money:true }); })() : ''}
        ${Object.keys(bySup).length ? Object.entries(bySup).sort((a,b)=>b[1]-a[1]).map(([k,v]) => fsRow(escapeHtml(k), money(v), total ? '%'+Math.round(v/total*100) : '')).join('') : '<p class="u-fs13 muted">Veri yok.</p>'}
        <p class="fs-note">Ücretsiz (bedelsiz) gelen kalem için fiyata <b>0</b> yazın; 🎁 Bedelsiz olarak işaretlenir ve maliyete 0 TL girer. Fiyatı girilmemiş kalemler tutara katılmaz. Fiyatları yazın; siparişin <b>Kaydet</b> düğmesiyle ya da üstteki <b>Tümünü Kaydet</b> ile hepsini birden kaydedin.</p>
      </div>
    </div>`;
  restorePcDrafts();
}
// Kaydedilmemiş fiyatlar (taslak) yeniden çizimde korunur; kartlar tekrar "kirli" işaretlenir.
function restorePcDrafts(){
  const ids = new Set();
  // Kaydedilmemiş tedarikçi seçimleri de korunur.
  document.querySelectorAll('.pc-card .pc2-sup').forEach(sel => { const d = (APP.pcSupDrafts || {})[sel.dataset.po]; if(d !== undefined && d !== sel.dataset.orig){ sel.value = d; ids.add(sel.dataset.po); } });
  document.querySelectorAll('.pc-card .pc-cost').forEach(i => { if(i.value !== i.dataset.orig){ const b = i.closest('.pc-card').querySelector('.pc-save'); if(b) ids.add(b.id.slice(7)); } });
  ids.forEach(id => markPcDirty(id));
  updatePcSaveAll();
}
function updatePcSaveAll(){
  const b = document.getElementById('pcSaveAll'); if(!b) return;
  const n = [...document.querySelectorAll('.pc-card .pc-cost, .pc-card .pc2-sup')].filter(i => i.value !== i.dataset.orig).length;
  b.hidden = !n; b.querySelector('span').textContent = `Tümünü Kaydet (${n})`;
}
async function saveAllPoPrices(){
  const inputs = [...document.querySelectorAll('.pc-card .pc-cost')].filter(i => i.value !== i.dataset.orig);
  const sups = [...document.querySelectorAll('.pc-card .pc2-sup')].filter(i => i.value !== i.dataset.orig);
  await savePcInputs(inputs, document.getElementById('pcSaveAll'), sups);
}
function setProcFilter(k){ APP.procFilter = k; renderPurchaseReportContent(getSession()); }
function setPurchRepSub(sub){ APP.purchRepSub = sub; renderPurchaseReportContent(getSession()); }
/* Birim fiyatlar yazılınca otomatik kaydedilmez: siparişin Kaydet düğmesi açılır. */
function markPcDirty(poId){
  const card = document.getElementById('pcSave_'+poId); if(!card) return;
  const inputs = card.closest('.pc-card').querySelectorAll('.pc-cost');
  const sel = card.closest('.pc-card').querySelector('.pc2-sup');
  if(!APP.pcSupDrafts) APP.pcSupDrafts = {};
  if(sel){ if(sel.value !== sel.dataset.orig) APP.pcSupDrafts[poId] = sel.value; else delete APP.pcSupDrafts[poId]; sel.classList.toggle('missing', !sel.value); }
  const dirty = [...inputs].filter(i => i.value !== i.dataset.orig).length + (sel && sel.value !== sel.dataset.orig ? 1 : 0);
  card.disabled = !dirty;
  card.querySelector('span').textContent = dirty ? `Kaydet (${dirty})` : 'Kaydet';
  card.closest('.pc-card').classList.toggle('dirty', !!dirty);
  if(!APP.pcDrafts) APP.pcDrafts = {};
  inputs.forEach(i => { if(i.value !== i.dataset.orig) APP.pcDrafts[i.dataset.itemId] = i.value; else delete APP.pcDrafts[i.dataset.itemId]; });
  updatePcSaveAll();
}
async function savePoPrices(poId){
  const btn = document.getElementById('pcSave_'+poId); if(!btn) return;
  const card = btn.closest('.pc-card');
  await savePcInputs([...card.querySelectorAll('.pc-cost')].filter(i => i.value !== i.dataset.orig), btn, [...card.querySelectorAll('.pc2-sup')].filter(i => i.value !== i.dataset.orig));
}
// Fiyatlar paralel kaydedilir; yalnızca kaydedilenlerin taslağı silinir, diğer kartlardaki yazılanlar korunur.
async function savePcInputs(changed, btn, sups){
  sups = sups || [];
  if(!changed.length && !sups.length) return;
  for(const inp of changed){
    const v = parseFloat(String(inp.value).replace(',', '.'));
    if(isNaN(v) || v < 0){ showToast('Geçerli bir birim fiyat girin'); inp.focus(); return; }
  }
  if(btn){ btn.disabled = true; btn.querySelector('span').textContent = 'Kaydediliyor…'; }
  const tok = getSession().session_token;
  // Tedarikçi seçimleri fiyatlarla birlikte, sayfa yeniden çizilmeden kaydedilir.
  const [res, supRes] = await Promise.all([
    Promise.all(changed.map(inp => sb.rpc('set_purchase_item_cost', { p_token: tok, p_item_id: inp.dataset.itemId, p_unit_cost: parseFloat(String(inp.value).replace(',', '.')) }))),
    Promise.all(sups.map(sel => sb.rpc('set_purchase_order_supplier', { p_token: tok, p_po_id: sel.dataset.po, p_supplier_id: sel.value || null })))]);
  const errs = [], cards = new Set();
  supRes.forEach((r, k) => {
    const sel = sups[k];
    if(r.error){ errs.push(r.error.message); return; }
    sel.dataset.orig = sel.value; if(APP.pcSupDrafts) delete APP.pcSupDrafts[sel.dataset.po];
    const card = sel.closest('.pc-card'); cards.add(card);
    const av = card && card.querySelector('.pc2-av'); const nm = sel.options[sel.selectedIndex] && sel.value ? sel.options[sel.selectedIndex].textContent : '';
    if(av && nm) av.textContent = nm.trim().charAt(0).toLocaleUpperCase('tr');
  });
  // Sayfa yeniden yüklenmez: kaydedilen kalemler yerinde güncellenir (satır tutarı, sipariş toplamı).
  res.forEach((r, k) => {
    const inp = changed[k];
    if(r.error){ errs.push(r.error.message); return; }
    const v = parseFloat(String(inp.value).replace(',', '.'));
    if(APP.pcDrafts) delete APP.pcDrafts[inp.dataset.itemId];
    inp.dataset.orig = String(v); inp.value = String(v); inp.classList.remove('missing');
    const row = inp.closest('.pc2-it'); if(row){ row.classList.remove('nop'); const q = parseFloat(row.querySelector('.pc2-nm small').textContent) || 0; const line = row.querySelector('.pc2-line'); if(line){ if(v > 0) line.textContent = money(q * v); else line.innerHTML = '<span class="pchip ok" title="Ücretsiz geldi; maliyete 0 TL olarak girer">🎁 Bedelsiz</span>'; } }
    cards.add(inp.closest('.pc-card'));
  });
  cards.forEach(card => {
    let t = 0; card.querySelectorAll('.pc2-it').forEach(row => { const q = parseFloat(row.querySelector('.pc2-nm small').textContent) || 0; const c = parseFloat(row.querySelector('.pc-cost').dataset.orig) || 0; t += q * c; });
    const tot = card.querySelector('.pc2-total'); if(tot) tot.textContent = money(t);
    const sb2 = card.querySelector('.pc-save'); if(sb2) markPcDirty(sb2.id.slice(7));
  });
  if(btn && btn.id === 'pcSaveAll') updatePcSaveAll();
  if(errs.length) await uiAlert('Bazı değişiklikler kaydedilemedi:\n\n' + errs.join('\n')); else showToast([changed.length ? changed.length + ' birim fiyat' : '', sups.length ? sups.length + ' tedarikçi' : ''].filter(Boolean).join(' ve ') + ' kaydedildi ✓');
  if(typeof refreshNavBadges === 'function') refreshNavBadges();
}
async function savePurchaseItemCost(itemId, value){
  const v = parseFloat(String(value).replace(',', '.'));
  if(isNaN(v) || v < 0){ showToast('Geçerli bir birim fiyat girin'); return; }
  const { error } = await sb.rpc('set_purchase_item_cost', { p_token: getSession().session_token, p_item_id: itemId, p_unit_cost: v });
  if(error){ alert(error.message); return; }
  showToast('Birim fiyat kaydedildi ✓');
  renderPurchaseReportContent(getSession());
  if(typeof refreshNavBadges === 'function') refreshNavBadges();
}
/* İptaller: mutfağa gönderildikten sonra iptal edilen ürünler ve tamamen iptal edilen masalar. */
async function renderCancelReportContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_cancel_report', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const items = (data && data.items) || [], orders = (data && data.orders) || [];
  const itemTotal = items.reduce((t, r) => t + Number(r.total||0), 0);
  const orderTotal = orders.reduce((t, o) => t + Number(o.total||0), 0);
  const cancelledOrderIds = new Set(orders.map(o => o.id));
  const partialTotal = items.filter(r => !cancelledOrderIds.has(r.order_id)).reduce((t, r) => t + Number(r.total||0), 0);
  const byProd = {}, byStaff = {};
  items.forEach(r => { byProd[r.item_name] = (byProd[r.item_name]||0) + Number(r.qty||0); const k = r.cancelled_by || '—'; byStaff[k] = (byStaff[k]||0) + Number(r.total||0); });
  orders.forEach(o => { const k = o.cancelled_by || '—'; if(!items.some(r => r.order_id===o.id)) byStaff[k] = (byStaff[k]||0) + Number(o.total||0); });
  const dt = (iso) => new Date(iso).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  const orderItems = (o) => { const list = (o.items||[]).length ? o.items : items.filter(r => r.order_id===o.id).map(r => ({ name:r.item_name, qty:r.qty, price:r.price })); return list; };
  el.innerHTML = statChips([
      ['❌', orders.length, 'İptal edilen masa', 'var(--danger,#ef4444)'],
      ['🍽️', items.reduce((t, r) => t + Number(r.qty||0), 0), 'İptal edilen ürün (adet)', 'var(--c2)'],
      ['💸', money(orderTotal + partialTotal), 'İptal tutarı', 'var(--c3)'],
      ['👤', Object.keys(byStaff).length, 'İptal yapan personel', 'var(--c1)']
    ]) + (items.length || orders.length ? `<div class="ch-row">
      <div class="fs-panel pa-sec" style="--t:var(--danger,#ef4444);"><h3><i>🍽️</i>En Çok İptal Edilen Ürünler</h3>${items.length ? raceHtml(Object.entries(byProd).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v]) => ({ label:k, value:v, display:v+' adet' }))) : '<p class="muted">Ürün iptali yok.</p>'}</div>
      <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>👤</i>Personele Göre İptal Tutarı</h3>${raceHtml(Object.entries(byStaff).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v]) => ({ label:k, value:v, display:money(v) })))}</div>
    </div>` : '') + `
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--danger,#ef4444);">
      <h2>❌ İptal Edilen Masalar <small class="muted">${escapeHtml(reportDateRangeLabel())}</small></h2>
      ${orders.length ? `<div class="cx-grid">${orders.map((o, i) => { const li = orderItems(o); return `<div class="cx-card" style="--i:${Math.min(i,12)};">
        <div class="cx-top"><b>${escapeHtml(o.table_name||'—')}</b>${o.daily_number ? `<span class="pchip">#${o.daily_number}</span>` : ''}<span class="cx-amt">${money(o.total)}</span></div>
        <div class="cx-meta"><span>🕒 ${dt(o.at)}</span>${o.cancelled_by ? `<span>👤 ${escapeHtml(o.cancelled_by)}</span>` : ''}</div>
        ${li.length ? `<div class="cx-items">${li.map(x => `<span>${x.qty}× ${escapeHtml(x.name)}</span>`).join('')}</div>` : '<div class="cx-items muted"><span>Ürün girilmeden kapatıldı</span></div>'}
      </div>`; }).join('')}</div>` : '<p class="muted">Bu tarih aralığında iptal edilen masa yok.</p>'}
    </div>
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--c2);">
      <h2>🍽️ İptal Edilen Ürünler</h2>
      ${items.length ? `<div class="cx-list">${items.map(r => `<div class="cx-row">
        <span class="cx-q">${r.qty}×</span>
        <div class="cx-n"><b>${escapeHtml(r.item_name)}</b><small>${escapeHtml(r.table_name||'')} · ${dt(r.created_at)}${r.cancelled_by ? ' · 👤 ' + escapeHtml(r.cancelled_by) : ''}</small></div>
        <span class="pchip ${r.was_pending ? 'warn' : ''}">${r.was_pending ? '🍳 hazırlanırken' : '✓ hazırdı'}</span>
        <b class="cx-amt">${money(r.total)}</b></div>`).join('')}</div>` : '<p class="muted">Bu tarih aralığında iptal edilen ürün yok.</p>'}
    </div>`;
}
/* İptal & İkram Kontrolü: kim ne kadar iptal / ikram / indirim yaptı (get_loss_report). Kartlar, personel satırları ve
   günlük grafik tıklanınca alttaki hareket listesi süzülür. */
async function renderLossReportContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_loss_report', { p_token: session.session_token, p_from: APP.reportDate, p_to: APP.reportDateTo || APP.reportDate }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  APP.loss = { data: data || {}, typ: '', who: '', day: '' };
  el.innerHTML = '<div id="lossBox"></div>'; // filtreler yalnızca bu kutuyu yeniden çizer (birleşik sekmede diğer bölüm silinmesin)
  drawLossReport();
}
const LOSS_T = { cancel:['❌','İptal','var(--danger,#ef4444)'], comp:['🍱','İkram','var(--c3,#14b8a6)'], disc:['🏷️','İndirim','#f59e0b'] };
function drawLossReport(){
  const el = document.getElementById('lossBox') || document.getElementById('reportContent'); if(!el || !APP.loss) return;
  const L = APP.loss, d = L.data, T = d.totals || {}, rev = Number(d.revenue) || 0, staff = d.by_staff || [];
  const pctOf = v => rev > 0 ? ' · cironun %' + (Number(v) / rev * 100).toFixed(1) : '';
  const card = (k, n, amt, sub) => `<button type="button" class="lr-card ${L.typ===k?'on':''}" style="--t:${LOSS_T[k][2]}" ${act('setLoss','typ',L.typ===k?'':k)}>
      <span class="lr-ic">${LOSS_T[k][0]}</span><small>${LOSS_T[k][1]}</small><b>${money(amt || 0)}</b><em>${n || 0} işlem${pctOf(amt)}</em>${sub || ''}</button>`;
  const days = d.by_day || [], max = Math.max(1, ...days.map(x => Number(x.c) + Number(x.p) + Number(x.x)));
  const smax = Math.max(1, ...staff.map(s => Number(s.ca) + Number(s.pa) + Number(s.da)));
  let rows = d.recent || [];
  if(L.typ) rows = rows.filter(r => r.typ === L.typ);
  if(L.who) rows = rows.filter(r => r.who === L.who);
  if(L.day) rows = rows.filter(r => new Date(r.at).toLocaleDateString('sv-SE') === L.day);
  const hours = d.by_hour || {}, hmax = Math.max(1, ...Object.values(hours));
  el.innerHTML = `<div class="lr-cards">
      ${card('cancel', T.cancel_n, T.cancel_amt, T.cancel_after_n ? `<i class="lr-warn">⚠️ ${T.cancel_after_n} tanesi hazırlandıktan sonra (${money(T.cancel_after_amt)})</i>` : '')}
      ${card('comp', T.comp_n, T.comp_amt)}
      ${card('disc', T.disc_n, T.disc_amt)}
    </div>
    <div class="sl-viz">
      <div class="sl-panel"><div class="sl-pt">Personele göre <span>tıklayınca hareketleri süzer</span></div>
        ${staff.length ? `<div class="lr-staff">${staff.map(s => { const tot = Number(s.ca) + Number(s.pa) + Number(s.da);
          return `<button type="button" class="lr-srow ${L.who===s.who?'on':''}" ${act('setLoss','who',L.who===s.who?'':s.who)}>
            <span class="lr-sn">👤 ${escapeHtml(s.who)}</span>
            <span class="lr-sbar" style="width:${tot / smax * 100}%">${Number(s.ca) ? `<i style="flex:${s.ca};background:${LOSS_T.cancel[2]}"></i>` : ''}${Number(s.pa) ? `<i style="flex:${s.pa};background:${LOSS_T.comp[2]}"></i>` : ''}${Number(s.da) ? `<i style="flex:${s.da};background:${LOSS_T.disc[2]}"></i>` : ''}</span>
            <span class="lr-sv"><b>${money(tot)}</b><small>${s.cn}❌ ${s.pn}🍱 ${s.dn}🏷️</small></span></button>`; }).join('')}</div>` : '<p class="muted">Bu dönemde kayıt yok.</p>'}
      </div>
      <div class="sl-panel"><div class="sl-pt">İptal edilen ürünler</div>
        ${(d.top_items || []).length ? `<div class="sl-hbars">${d.top_items.map(i => `<div class="sl-hbar"><span class="sl-hl">${escapeHtml(i.name)}</span><span class="sl-ht"><i style="width:${i.n / d.top_items[0].n * 100}%;background:${LOSS_T.cancel[2]}"></i></span><b>${i.n}</b></div>`).join('')}</div>` : '<p class="muted">İptal edilen ürün yok.</p>'}
        <div class="u-mt12 sl-pt">İptallerin saatlere dağılımı</div>
        <div class="lr-hours">${Array.from({ length: 24 }, (_, h) => `<span title="${String(h).padStart(2,'0')}:00 — ${hours[h] || 0} iptal" style="opacity:${hours[h] ? .25 + .75 * hours[h] / hmax : .08}"></span>`).join('')}</div>
        <div class="lr-hlbl"><small>00</small><small>06</small><small>12</small><small>18</small><small>23</small></div>
      </div>
    </div>
    ${days.length > 1 ? `<div class="sl-panel" style="margin-bottom:12px;"><div class="sl-pt">Günlük kayıp <span><i class="dot" style="background:${LOSS_T.cancel[2]}"></i>İptal <i class="dot" style="background:${LOSS_T.comp[2]};margin-left:6px"></i>İkram <i class="dot" style="background:${LOSS_T.disc[2]};margin-left:6px"></i>İndirim</span></div>
      <div class="sl-chart"><span class="sl-ymax">${money(max)}</span>${days.map((x, i) => { const tot = Number(x.c) + Number(x.p) + Number(x.x);
        return `<button type="button" class="sl-col ${L.day===x.d?'on':''}" title="${new Date(x.d).toLocaleDateString('tr-TR')}: iptal ${money(x.c)}, ikram ${money(x.p)}, indirim ${money(x.x)}" ${act('setLoss','day',L.day===x.d?'':x.d)}>
          <span class="sl-stack" style="height:${tot / max * 100}%">${Number(x.x) ? `<i style="flex:${x.x};background:${LOSS_T.disc[2]}"></i>` : ''}${Number(x.p) ? `<i style="flex:${x.p};background:${LOSS_T.comp[2]}"></i>` : ''}${Number(x.c) ? `<i style="flex:${x.c};background:${LOSS_T.cancel[2]}"></i>` : ''}</span>
          <small>${(i % Math.max(1, Math.ceil(days.length / 8)) === 0 || i === days.length - 1) ? new Date(x.d).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit' }) : ''}</small></button>`; }).join('')}</div></div>` : ''}
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--danger,#ef4444);">
      <h2>Hareketler ${[L.typ && LOSS_T[L.typ][1], L.who && '👤 ' + escapeHtml(L.who), L.day && new Date(L.day).toLocaleDateString('tr-TR')].filter(Boolean).map(x => `<span class="sl-chip">${x}</span>`).join('')}
        ${L.typ || L.who || L.day ? `<button type="button" class="ghost-btn" style="width:auto;margin:0 0 0 8px;padding:4px 10px;font-size:12px;" ${act('setLoss','reset','')}>Filtreleri temizle</button>` : ''}</h2>
      ${rows.length ? `<div class="cx-list">${rows.map(r => `<div class="cx-row">
        <span class="cx-q" style="color:${LOSS_T[r.typ][2]}">${LOSS_T[r.typ][0]}</span>
        <div class="cx-n"><b>${escapeHtml(r.what || '')}</b><small>${escapeHtml(r.table_name || '')} · ${new Date(r.at).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })} · 👤 ${escapeHtml(r.who)}${r.note ? ' · 📝 ' + escapeHtml(r.note) : ''}</small></div>
        ${r.info ? `<span class="pchip ${r.typ==='cancel' && r.info.startsWith('Hazırlandıktan') ? 'warn' : ''}">${escapeHtml(r.info)}</span>` : ''}
        <b class="cx-amt">${money(r.amt)}</b></div>`).join('')}</div>` : '<p class="muted">Bu filtrelerle hareket yok.</p>'}
    </div>`;
}
function setLoss(k, v){ if(!APP.loss) return; if(k === 'reset'){ APP.loss.typ = APP.loss.who = APP.loss.day = ''; } else APP.loss[k] = v; drawLossReport(); }
async function renderWasteContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('list_waste', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const rows = (data && data.rows) || [];
  const totalCost = (data && data.total_cost) || 0;
  el.innerHTML = `
    <div class="order-summary stat-chips" style="--n:3;"><div class="os-chip" style="--oc:var(--c1);"><span class="os-ic">🔥</span><div><b>${money(totalCost)}</b><small>Toplam İsraf Maliyeti</small></div></div><div class="os-chip" style="--oc:var(--c2);"><span class="os-ic">📦</span><div><b>${rows.reduce((s,r)=>s+Number(r.qty),0)}</b><small>İsraf Edilen Adet</small></div></div><div class="os-chip" style="--oc:var(--c3);"><span class="os-ic">🗂️</span><div><b>${rows.length}</b><small>Kayıt Sayısı</small></div></div></div>
    ${rows.length ? (() => { const g = {}, rs = {}; rows.forEach(r => { g[r.product_name] = (g[r.product_name]||0) + Number(r.total_cost||0); const k = r.reason || 'Belirtilmedi'; rs[k] = (rs[k]||0) + Number(r.total_cost||0); });
      return `<div class="ch-row"><div class="fs-panel pa-sec" style="--t:var(--danger,#ef4444);"><h3><i>🔥</i>En Çok İsraf Edilen</h3>${raceHtml(Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v]) => ({ label:k, value:v, display:money(v), side: v > 0 ? (totalCost ? '%'+Math.round(v/totalCost*100) : '') : '⚠️ maliyet yok' })))}${rows.some(r => !(Number(r.unit_cost) > 0)) ? '<p class="fs-note">⚠️ Maliyeti girilmemiş ürünlerin israfı 0 TL görünür. Ayarlar → Ürünler\'den ürünün maliyetini girin.</p>' : ''}</div>
        <div class="fs-panel pa-sec" style="--t:var(--c3);"><h3><i>❓</i>Sebeplere Göre</h3>${svgDonut(Object.entries(rs).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v], i) => ({ label:k, value:v, color:`var(--c${i+1})` })), { center: shortMoney(totalCost), sub:'₺ israf', money:true })}</div></div>`; })() : ''}
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--c1);">
      <h2>${escapeHtml(reportDateRangeLabel())} Tarihli İsraf Kayıtları</h2>
      <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>Ürün</th><th>Miktar</th><th>Birim Maliyet</th><th>Toplam Maliyet</th><th>Sebep</th><th>Personel</th><th>Tarih</th></tr></thead>
        <tbody>
        ${rows.map(r => `
          <tr>
            <td class="col-name">${escapeHtml(r.product_name)}</td>
            <td>${r.qty}</td>
            <td>${Number(r.unit_cost) > 0 ? money(r.unit_cost) : '<span class="pchip warn" title="Bu ürünün maliyeti girilmemiş; Ayarlar → Ürünler\'den maliyet girin">⚠️ maliyet yok</span>'}</td>
            <td style="color:var(--red);font-weight:700;">${money(r.total_cost)}</td>
            <td>${escapeHtml(r.reason||'-')}</td>
            <td>${escapeHtml(r.staff_name||'-')}</td>
            <td>${new Date(r.created_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}</td>
          </tr>`).join('')}
        ${rows.length===0?'<tr><td colspan="7" class="u-tc muted">Bu tarih aralığında israf kaydı yok.</td></tr>':''}
        </tbody>
      </table>
      </div>
    </div>`;
}
async function saveTipPoolSettings(){
  const session = getSession();
  const enabled = document.getElementById('tipPoolEnabled').checked;
  const mode = document.getElementById('tipPoolMode').value;
  const { error } = await sb.rpc('update_tip_pool_settings', { p_token: session.session_token, p_enabled: enabled, p_mode: mode });
  if(error){ alert(error.message); return; }
  showToast('Bahşiş havuzu ayarları kaydedildi ✓');
  renderTipPoolContent(session);
}

/* --- Kapatılan hesap detayı: siparişin kalemleri, tutarlar ve fişi müşteriye
   fiş tasarımıyla e-posta gönderme (bkz. get_sale_detail, email_receipt). --- */
async function openSaleDetailModal(historyId){
  const session = getSession();
  const { data: d, error } = await withLoadingOverlay(sb.rpc('get_sale_detail', { p_token: session.session_token, p_history_id: historyId }));
  if(error){ alert(error.message); return; }
  const methods = { cash:'💵 Nakit', card:'💳 Kart', gift_card:'🎁 Hediye Kartı', split:'➗ Bölünmüş', transfer:'🏦 Havale/EFT', open_account:'📒 Açık Hesap', comp:'🎁 İkram', points:'⭐ Puan' };
  const label = d.kind==='takeaway' ? '📦 Paket' : (d.table_name || '-');
  const row = (k, v, strong) => `<div style="display:flex;justify-content:space-between;${strong?'font-weight:800;font-size:15px;margin-top:4px;':''}"><span>${k}</span><span>${v}</span></div>`;
  const bg = document.createElement('div');
  bg.id = 'saleDetailModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:300;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:420px;width:100%;max-height:88vh;overflow:auto;">
    <div class="u-row-sb">
      <h2 class="u-m0">${escapeHtml(label)}${d.order_no ? ' <span class="muted" style="font-size:13px;font-weight:600;">#'+d.order_no+'</span>' : ''}</h2>
      <span class="u-xclose" ${act('removeEl','saleDetailModalBg')}>✕</span>
    </div>
    <p class="muted" style="text-align:left;margin:4px 0 4px;font-size:12.5px;">🕒 Sipariş: ${d.ordered_at ? new Date(d.ordered_at).toLocaleString('tr-TR') : '—'} · ✓ Hazır: ${d.ready_at ? new Date(d.ready_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '—'} · 💳 Ödendi: ${new Date(d.closed_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</p>
    <p class="muted" style="text-align:left;margin:0 0 12px;font-size:12.5px;">${new Date(d.closed_at).toLocaleString('tr-TR')}${d.staff ? ' · 💳 Kasiyer: ' + escapeHtml(d.staff) : ''}${d.waiters ? ' · 👤 Garson: ' + escapeHtml(d.waiters) : ''}${d.customer ? ' · 👤 ' + escapeHtml(d.customer) : ''}</p>
    <div style="border-top:1px dashed var(--border);border-bottom:1px dashed var(--border);padding:8px 0;font-size:13.5px;">
      ${(d.items||[]).map(it => row(`${it.qty}x ${escapeHtml(it.name)}`, money(it.total))).join('') || '<p class="muted">Kalem bulunamadı.</p>'}
    </div>
    <div style="font-size:13.5px;padding-top:8px;">
      ${row('Ara Toplam', money(d.subtotal))}
      ${Number(d.discount)>0 ? row('İndirim', '-' + money(d.discount)) : ''}
      ${Number(d.tip)>0 ? row('Bahşiş', money(d.tip)) : ''}
      ${row('Toplam', money(d.total), true)}
      ${row('Ödeme', d.payment_method==='split' ? ('💵 ' + money(d.cash_amount||0) + ' + 💳 ' + money(d.card_amount||0)) : (methods[d.payment_method] || escapeHtml(d.payment_method||'')))}
    </div>
    ${Date.now() - new Date(d.closed_at) < 48 * 3600000 ? `<button type="button" class="ghost-btn" style="width:100%;margin-top:10px;" ${act('openPackForSale', historyId)}>🛍️ Paket yap (kalanlar / sonradan paket)</button>` : ''}
    ${(d.emails||[]).length ? `<p class="muted" style="text-align:left;font-size:12px;margin-top:10px;">Daha önce gönderildi: ${d.emails.map(e => escapeHtml(e.email)).join(', ')}</p>` : ''}
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;">
      <label style="font-size:12.5px;font-weight:700;color:var(--muted);">Fişi e-postayla gönder</label>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <input id="saleReceiptEmail" type="email" placeholder="musteri@ornek.com" autocapitalize="none" class="u-f1-m0">
        <button type="button" id="saleReceiptBtn" class="u-wa-m0" ${act('sendSaleReceipt', historyId)}>📧 Gönder</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(bg);
}
async function sendSaleReceipt(historyId){
  const email = document.getElementById('saleReceiptEmail').value.trim();
  if(!email){ showToast('E-posta adresi girin'); return; }
  const btn = document.getElementById('saleReceiptBtn');
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  const session = getSession();
  const { error } = await sb.rpc('email_receipt', { p_token: session.session_token, p_history_id: historyId, p_email: email });
  btn.disabled = false; btn.textContent = '📧 Gönder';
  if(error){ alert(error.message); return; }
  showToast('📧 Fiş ' + email + ' adresine gönderildi');
  const bg = document.getElementById('saleDetailModalBg'); if(bg) bg.remove();
}

/* --- Rezervasyon Analizi: seçilen tarih aralığındaki rezervasyonlar ve
   bekleme listesi — kaç kişi geldi, hangi masalar, rezervasyon saatine göre
   geliş, sipariş tutarları (bkz. get_reservation_analytics; ciro, rezervasyon
   ya da bekleme listesinden açılan masaların kapanan hesaplarından). --- */
/* Rezervasyon görselleri: gelmeme oranı göstergesi, durum halkası, gün ve saat dağılımı, en çok gelmeyenler. */
async function loadResvViz(){
  const box = document.getElementById('resvViz'); if(!box) return;
  const { data: d } = await sb.rpc('reservation_report', { p_token: getSession().session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo });
  if(!d || !d.total || !document.getElementById('resvViz')) return;
  const st = d.by_status || {}, ns = Number(st.no_show || 0), cx = Number(st.cancelled || 0), se = Number(st.seated || 0);
  const closed = ns + cx + se, nsP = closed ? Math.round(ns / closed * 100) : 0;
  const nsCol = nsP >= 20 ? '#ef4444' : nsP >= 10 ? '#f59e0b' : '#22c55e';
  const DOW = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const dow = DOW.map((n, i) => { const x = (d.by_dow || []).find(r => r.dow === i + 1) || { n: 0, ns: 0 }; return { n, v: Number(x.n), ns: Number(x.ns) }; });
  const mxD = Math.max(1, ...dow.map(x => x.v));
  const hrs = d.by_hour || [], mxH = Math.max(1, ...hrs.map(x => Number(x.p)));
  box.innerHTML = `<div class="rvz-grid">
    <div class="fs-panel pa-sec" style="--t:${nsCol};"><h3><i>🚫</i>Gelmeme Oranı</h3>
      <div class="lx-gauge">${svgGauge(nsP, nsCol, '%' + nsP, ns + '/' + closed + ' gelmedi')}</div>
      <p class="fs-note">${nsP >= 20 ? '⚠️ Yüksek: hatırlatma SMS\'i ve onay araması önerilir.' : nsP >= 10 ? 'Orta seviye: 2 saat kala hatırlatma SMS\'i açık olsun.' : '👍 Gelmeme oranı düşük.'}</p></div>
    <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🍩</i>Sonuçlar</h3>${svgDonut([{ label: '🪑 Oturdu', value: se, color: '#22c55e' }, { label: '🚫 Gelmedi', value: ns, color: '#ef4444' }, { label: '✕ İptal', value: cx, color: '#94a3b8' }, { label: '⏳ Bekleyen/Onaylı', value: Number(st.pending || 0) + Number(st.confirmed || 0), color: '#f59e0b' }].filter(x => x.value), { center: String(d.total), sub: 'rezervasyon · ' + d.people + ' kişi' })}
      <div class="rvz-src">${Object.entries(d.by_source || {}).map(([k, v]) => `<span>${k === 'online' ? '🌐 Online' : '✍️ Personel'} <b>${v}</b></span>`).join('')}</div></div>
    <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>📆</i>Günlere Göre <small class="muted">· kırmızı: gelmeyen</small></h3>
      <div class="rvx-bars">${dow.map((x, i) => `<div class="rvx-b" style="--i:${i};"><span>${x.v || ''}</span><i class="rvz-stack" style="height:${x.v ? Math.max(8, x.v / mxD * 100) : 2}%;--ns:${x.v ? Math.round(x.ns / x.v * 100) : 0}%;"></i><small>${x.n}</small></div>`).join('')}</div></div>
    <div class="fs-panel pa-sec" style="--t:#a78bfa;"><h3><i>🕒</i>Saatlere Göre Kişi</h3>
      ${hrs.length ? `<div class="rvx-bars">${hrs.map((x, i) => `<div class="rvx-b" style="--i:${i};"><span>${x.p}</span><i style="height:${Math.max(8, Number(x.p) / mxH * 100)}%;background:linear-gradient(180deg,#a78bfa,#a78bfa44);"></i><small>${String(x.h).padStart(2, '0')}</small></div>`).join('')}</div>` : '<p class="muted">Veri yok.</p>'}</div>
    ${(d.no_show_people || []).length ? `<div class="fs-panel pa-sec" style="--t:#ef4444;"><h3><i>🙅</i>En Çok Gelmeyenler</h3><div class="crm-miss">${d.no_show_people.map(x => `<div class="crm-miss-r" style="cursor:default;"><b>${escapeHtml(x.name || '')}</b><span>${x.ph4 ? `<em>📞 ••• ${escapeHtml(x.ph4)}</em>` : ''}<em style="background:color-mix(in srgb,#ef4444 18%,transparent);">${x.n} kez</em></span></div>`).join('')}</div>
      <p class="fs-note">Sık gelmeyenlerden rezervasyonda kapora ya da onay araması istenebilir.</p></div>` : ''}
  </div>`;
}
async function renderReservationAnalyticsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_reservation_analytics', { p_token: session.session_token, p_from: APP.reportDate, p_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  APP.resvAn = data;
  APP.resvAnFilter = null;
  drawResvAnalytics();
}

function setResvAnSub(sub){ APP.resvAnSub = sub; APP.resvAnFilter = null; drawResvAnalytics(); }
function setResvAnFilter(key, label){
  APP.resvAnFilter = APP.resvAnFilter && APP.resvAnFilter.key===key ? null : { key, label };
  drawResvAnalytics();
  const list = document.getElementById('resvAnList');
  if(list && APP.resvAnFilter) list.scrollIntoView({ behavior:'smooth', block:'start' });
}
/* Tıklanabilir istatistik kartı: basınca alttaki liste o kayıtlarla filtrelenir. */
function resvAnCard(label, value, color, key){
  const active = APP.resvAnFilter && APP.resvAnFilter.key===key;
  return `<div class="os-chip os-click resv-an-card ${active?'active on':''}" style="--oc:${color||'var(--c1)'};" ${act('setResvAnFilter', key, label)} title="Listelemek için tıklayın">
    <div style="min-width:0;"><small>${escapeHtml(label)}</small><b style="${color?'color:'+color+';':''}">${value}</b><small class="resv-an-card-hint">${active ? '✓ Listeleniyor' : 'Listele ›'}</small></div>
  </div>`;
}
// Rezervasyon/bekleme kaydına bağlı kapanan hesap(lar)ın detayını açar.
function resvDetailBtn(r){
  const ids = r.history_ids || [];
  if(!ids.length) return '<span class="muted">-</span>';
  return `<button type="button" class="sbtn" style="width:auto;margin:0;white-space:nowrap;" ${act('openResvOrderDetail', ids)}>🔍 Detay${ids.length>1 ? ' ('+ids.length+')' : ''}</button>`;
}
function openResvOrderDetail(ids){
  if(ids.length === 1) return openSaleDetailModal(ids[0].id);
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  ov.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:420px;width:100%;max-height:88vh;overflow:auto;"><h2 style="margin-top:0;">Hesaplar</h2>
    ${ids.map(h => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span>${new Date(h.closed_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} · <b>${money(h.total)}</b></span>
      <button type="button" class="u-wa-m0 sbtn" data-id="${escapeAttr(h.id)}">🔍 Detay</button></div>`).join('')}
    <button class="u-mt12 secondary" data-close>Kapat</button></div>`;
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if(b){ ov.remove(); openSaleDetailModal(b.dataset.id); }
    else if(e.target === ov || e.target.closest('[data-close]')) ov.remove();
  });
  document.body.appendChild(ov);
}
function drawResvAnalytics(){ drawResvAnalyticsBase(); if((APP.resvAnSub || 'resv') === 'resv') loadResvViz(); else loadWlViz(); }
async function loadWlViz(){
  const { data } = await sb.rpc('waitlist_report', { p_token: getSession().session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo });
  const b = document.getElementById('wlViz'); if(b) b.innerHTML = wlStatsHtml(data, { title: reportDateRangeLabel(), analytics: true });
}
function drawResvAnalyticsBase(){
  const el = document.getElementById('reportContent'); const data = APP.resvAn; if(!el || !data) return;
  const sub = APP.resvAnSub || 'resv';
  const f = APP.resvAnFilter;
  const sm = data.summary || {}, wl = data.waitlist || {};
  const pct = (a, b) => b > 0 ? Math.round(a / b * 100) + '%' : '—';
  const hm = (iso) => iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : '-';
  const dt = (iso) => new Date(iso).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit' });
  const small = (t) => ` <span style="font-size:13px;font-weight:600;color:var(--muted);">${t}</span>`;
  const diffTxt = (d) => d==null ? '<span class="muted">-</span>'
    : d > 5 ? `<span style="color:var(--red);font-weight:700;">${d} dk geç</span>`
    : d < -5 ? `<span style="color:var(--green);font-weight:700;">${-d} dk erken</span>`
    : '<span style="color:var(--green);font-weight:700;">Zamanında</span>';
  const tabs = `<div class="sub-tabs">
    <div role="tab" tabindex="0" class="sub-tab ${sub==='resv'?'active':''}" ${act('setResvAnSub', 'resv')}><span class="sub-tab-ic">📅</span>Rezervasyonlar <span class="muted" style="font-weight:600;">${sm.total||0}</span></div>
    <div role="tab" tabindex="0" class="sub-tab ${sub==='wl'?'active':''}" ${act('setResvAnSub', 'wl')}><span class="sub-tab-ic">⏳</span>Bekleme Listesi <span class="muted" style="font-weight:600;">${wl.total||0}</span></div>
  </div>`;
  const filterBar = (count) => f ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px;">
      <span class="role-badge" style="color:var(--accent);border-color:var(--accent);">Filtre: ${escapeHtml(f.label)} · ${count} kayıt</span>
      <a href="#" style="color:var(--accent);font-size:13px;" ${act('setResvAnFilter', f.key)}>✕ Filtreyi kaldır</a></div>` : '';
  const head = `<p class="muted" style="text-align:left;margin:0 0 12px;">${escapeHtml(reportDateRangeLabel())} · Kartlara, saatlere ve masalara tıklayarak ilgili kayıtları listeleyin. Ciro, oturtulan masaların kapanan hesaplarından hesaplanır.</p>`;

  if(sub==='wl'){
    const all = data.waitlist_rows || [];
    const match = (r) => !f ? true
      : f.key==='seated' ? r.status==='seated'
      : f.key==='left' ? r.status==='cancelled'
      : f.key==='waiting' ? r.status==='waiting'
      : f.key==='late' ? (r.status==='seated' && r.quoted!=null && Number(r.waited) > Number(r.quoted))
      : f.key==='revenue' ? Number(r.revenue) > 0
      : f.key.startsWith('table:') ? (r.table_name||'—')===f.key.slice(6)
      : true;
    const rows = all.filter(match);
    el.innerHTML = head + tabs + `<div id="wlViz"></div>
      <div class="home-grid" style="margin-top:0;margin-bottom:18px;">
        ${resvAnCard('Listeye Alınan', wl.total||0, null, 'all')}
        ${resvAnCard('Oturan', (wl.seated||0) + small('(' + pct(wl.seated||0, wl.total||0) + ')'), 'var(--green)', 'seated')}
        ${resvAnCard('Beklemeden Ayrılan', wl.left||0, (wl.left||0) > 0 ? 'var(--red)' : null, 'left')}
        ${(wl.waiting||0) > 0 ? resvAnCard('Hâlâ Bekleyen', wl.waiting, null, 'waiting') : ''}
        ${resvAnCard('Oturan Misafir', (wl.guests_seated||0) + ' kişi', null, 'seated')}
        ${resvAnCard('Ort. Bekleme', wl.avg_wait!=null ? wl.avg_wait + ' dk' + (wl.avg_quoted!=null ? small('(tahmin ' + wl.avg_quoted + ')') : '') : '—', null, 'seated')}
        ${resvAnCard('Tahminden Geç Oturtulan', wl.late||0, (wl.late||0) > 0 ? 'var(--red)' : null, 'late')}
        ${resvAnCard('Bekleme Listesi Cirosu', money(wl.revenue||0), 'var(--accent)', 'revenue')}
      </div>
      <h3 id="resvAnList" class="u-mb10">📋 Bekleme Listesi Kayıtları</h3>
      ${filterBar(rows.length)}
      ${rows.length ? `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Müşteri</th><th>Kişi</th><th>Katılım</th><th>Sonuç</th><th>Masa</th><th>Bekleme</th><th>Tahmine göre</th><th>Sipariş</th><th></th></tr></thead><tbody>
        ${rows.map(r => {
          const d = (r.status==='seated' && r.quoted!=null) ? Number(r.waited) - Number(r.quoted) : null;
          return `<tr>
          <td class="col-name">${escapeHtml(r.customer_name)}${r.phone ? `<div class="muted" style="font-size:11.5px;">${phoneHtml(r.phone)}</div>` : ''}${r.created_by_name ? `<div class="u-fs11 muted">✍️ ${escapeHtml(r.created_by_name)}</div>` : (r.source==='online' ? '<div class="u-fs11 muted">🌐 Online</div>' : '')}</td>
          <td>${r.party_size}</td>
          <td>${dt(r.joined_at)} ${hm(r.joined_at)}</td>
          <td>${r.status==='seated' ? '✅ Oturdu ' + hm(r.seated_at) : r.status==='cancelled' ? `<span class="u-red">✕ Ayrıldı ${hm(r.left_at)}</span>` : '<span class="muted">Bekliyor</span>'}</td>
          <td>${r.table_name ? `<b>${escapeHtml(r.table_name)}</b>` : '<span class="muted">—</span>'}</td>
          <td>${r.waited!=null ? r.waited + ' dk' : '-'}${r.quoted!=null ? `<div class="u-fs11 muted">tahmin ${r.quoted}</div>` : ''}</td>
          <td>${d==null ? '<span class="muted">-</span>' : d > 0 ? `<span style="color:var(--red);font-weight:700;">${d} dk geç</span>` : d < 0 ? `<span style="color:var(--green);font-weight:700;">${-d} dk erken</span>` : '<span style="color:var(--green);font-weight:700;">Tam zamanında</span>'}</td>
          <td>${Number(r.revenue) > 0 ? money(r.revenue) : '<span class="muted">-</span>'}</td>
          <td>${resvDetailBtn(r)}</td>
        </tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">Kayıt yok.</p>'}`;
    return;
  }

  const all = data.rows || [];
  const match = (r) => !f ? true
    : f.key==='seated' ? r.status==='seated'
    : f.key==='missed' ? (r.status==='no_show' || r.status==='cancelled')
    : f.key==='upcoming' ? (r.status==='pending' || r.status==='confirmed')
    : f.key==='revenue' ? Number(r.revenue) > 0
    : f.key==='on_time' ? (r.arrival_diff!=null && Math.abs(r.arrival_diff) <= 5)
    : f.key==='early' ? r.arrival_diff < -5
    : f.key==='late' ? r.arrival_diff > 5
    : f.key.startsWith('hour:') ? new Date(r.reservation_time).getHours()===Number(f.key.slice(5))
    : f.key.startsWith('table:') ? (r.table_name||'—')===f.key.slice(6) && r.status==='seated'
    : true;
  const rows = all.filter(match);
  const byHour = data.by_hour || [];
  const maxH = Math.max(1, ...byHour.map(h => h.guests || 0));
  const statusTxt = { pending:'Bekliyor', confirmed:'Onaylı', seated:'✅ Geldi', cancelled:'✕ İptal', no_show:'🚫 Gelmedi' };
  const isF = (k) => f && f.key===k;
  el.innerHTML = head + tabs + `<div id="resvViz"></div>
    <div class="home-grid" style="margin-top:0;margin-bottom:16px;">
      ${resvAnCard('Toplam Rezervasyon', sm.total||0, null, 'all')}
      ${resvAnCard('Gelen', (sm.seated||0) + small('(' + pct(sm.seated||0, sm.total||0) + ')'), 'var(--green)', 'seated')}
      ${resvAnCard('Gelmedi / İptal', (sm.no_show||0) + ' / ' + (sm.cancelled||0), (sm.no_show||0) > 0 ? 'var(--red)' : null, 'missed')}
      ${(sm.pending||0) > 0 ? resvAnCard('Yaklaşan', sm.pending, null, 'upcoming') : ''}
      ${resvAnCard('Gelen Misafir', (sm.guests_seated||0) + small('/ ' + (sm.guests_booked||0) + ' kişi rezerve'), null, 'seated')}
      ${resvAnCard('Ort. Kişi', sm.avg_party ?? '—', null, 'all')}
      ${resvAnCard('Rezervasyon Cirosu', money(sm.revenue||0), 'var(--accent)', 'revenue')}
      ${resvAnCard('Ort. Sipariş (masa)', sm.avg_order!=null ? money(sm.avg_order) : '—', null, 'revenue')}
      ${resvAnCard('Kişi Başı Harcama', sm.avg_per_guest!=null ? money(sm.avg_per_guest) : '—', null, 'revenue')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:18px;">
      <div class="fs-panel pa-sec" style="--t:var(--c2);margin:0;">
        <h3 class="u-mb10">⏰ Rezervasyon Saatine Göre Geliş</h3>
        <p class="u-mb8">Ortalama: ${sm.avg_arrival_diff==null ? '<span class="muted">veri yok</span>' : diffTxt(sm.avg_arrival_diff)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:13px;">
          <span class="role-badge resv-an-chip ${isF('on_time')?'active':''}" style="color:var(--green);border-color:var(--green);" ${act('setResvAnFilter', 'on_time', 'Zamanında gelenler')}>Zamanında (±5 dk): ${sm.on_time||0}</span>
          <span class="role-badge resv-an-chip ${isF('early')?'active':''}" style="color:var(--green);border-color:var(--green);" ${act('setResvAnFilter', 'early', 'Erken gelenler')}>Erken: ${sm.early||0}</span>
          <span class="role-badge resv-an-chip ${isF('late')?'active':''}" style="color:var(--red);border-color:var(--red);" ${act('setResvAnFilter', 'late', 'Geç gelenler')}>Geç: ${sm.late||0}</span>
        </div>
        <p class="muted" style="font-size:11.5px;text-align:left;margin:8px 0 0;">Geliş saati, rezervasyon "Oturdu" yapıldığında kaydedilir.</p>
      </div>
      <div class="fs-panel pa-sec" style="--t:var(--c2);margin:0;">
        <h3 class="u-mb10">🕐 Saatlere Göre Yoğunluk</h3>
        ${byHour.length ? `<div class="race">${byHour.map((h, i) => `<div class="race-row resv-an-row ${isF('hour:'+h.hour)?'active':''}" style="--i:${Math.min(i,15)};--sc:${RACE_COLORS[i%RACE_COLORS.length]};cursor:pointer;" ${act('setResvAnFilter', 'hour:'+h.hour, String(h.hour).padStart(2,'0')+':00 rezervasyonları')}>
          <span class="race-rank">🕐</span>
          <div class="race-main"><div class="race-label"><b>${String(h.hour).padStart(2,'0')}:00</b><small>${h.count} rezervasyon</small></div>
          <div class="race-track"><div class="race-bar" style="width:${Math.max(3, Math.round((h.guests||0)/maxH*100))}%;"><span>${h.guests} kişi</span></div></div></div>
          <span class="race-side">${h.count} rez<small>${h.guests} kişi</small></span></div>`).join('')}</div>` : '<p class="muted">Veri yok.</p>'}
      </div>
    </div>
    <h3 class="u-mb10">🪑 Masalara Göre</h3>
    ${(data.by_table||[]).length ? `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Masa</th><th>Rezervasyon</th><th>Misafir</th><th>Ciro</th></tr></thead><tbody>
      ${data.by_table.map(t => `<tr class="resv-an-row ${isF('table:'+t.table)?'active':''}" ${act('setResvAnFilter', 'table:'+t.table, t.table + ' rezervasyonları')}><td class="col-name"><b>${escapeHtml(t.table)}</b> <span class="muted" style="font-size:11.5px;">Listele ›</span></td><td>${t.count}</td><td>${t.guests}</td><td>${money(t.revenue||0)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu aralıkta gelen rezervasyon yok.</p>'}
    <h3 id="resvAnList" style="margin:18px 0 10px;">📋 Rezervasyon Detayları</h3>
    ${filterBar(rows.length)}
    ${rows.length ? `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Müşteri</th><th>Kişi</th><th>Rezervasyon</th><th>Geliş</th><th>Saate göre</th><th>Masa</th><th>Durum</th><th>Sipariş</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td class="col-name">${escapeHtml(r.customer_name)}${r.phone ? `<div class="muted" style="font-size:11.5px;">${phoneHtml(r.phone)}</div>` : ''}${r.notes ? `<div class="muted" style="font-size:11px;overflow-wrap:anywhere;">${escapeHtml(r.notes)}</div>` : ''}${r.created_by_name ? `<div class="u-fs11 muted">✍️ ${escapeHtml(r.created_by_name)}</div>` : (r.source==='online' ? '<div class="u-fs11 muted">🌐 Online</div>' : '')}</td>
        <td>${r.party_size}</td>
        <td>${dt(r.reservation_time)} ${hm(r.reservation_time)}</td>
        <td>${r.seated_at ? hm(r.seated_at) : '<span class="muted">-</span>'}</td>
        <td>${diffTxt(r.arrival_diff)}</td>
        <td>${r.table_name ? `<b>${escapeHtml(r.table_name)}</b>` : '<span class="muted">—</span>'}</td>
        <td>${statusTxt[r.status] || escapeHtml(r.status)}</td>
        <td>${Number(r.revenue) > 0 ? money(r.revenue) + (r.party_size ? `<div class="u-fs11 muted">kişi başı ${money(r.revenue / r.party_size)}</div>` : '') : '<span class="muted">-</span>'}</td>
        <td>${resvDetailBtn(r)}</td>
      </tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Kayıt yok.</p>'}`;
}

/* Malzeme siparişi belgesi: ürün + adet. PDF = yazdırma penceresinde "PDF olarak kaydet"; yazdır = doğrudan yazıcı. */
function poDocHtml(p){
  const rest = (APP.config && (APP.config.restaurant_name || APP.config.name)) || 'Peyktan';
  const sup = (APP.procSuppliers || []).find(x => x.id === p.supplier_id) || {};
  const fq = (n) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Malzeme Siparişi - ${escapeHtml(sup.name || '')} - ${new Date(p.order_date).toLocaleDateString('tr-TR')}</title>
    <style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:32px;} h1{font-size:22px;margin:0 0 4px;} .m{color:#555;font-size:13px;margin:0 0 18px;} table{width:100%;border-collapse:collapse;font-size:14px;} th,td{padding:8px 10px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f4f4f4;} td.r,th.r{text-align:right;} .f{margin-top:24px;font-size:12px;color:#666;} @media print{body{margin:14mm;}}</style></head><body>
    <h1>Malzeme Siparişi</h1>
    <p class="m"><b>${escapeHtml(rest)}</b>${sup.name ? ' → <b>' + escapeHtml(sup.name) + '</b>' : ''}<br>Sipariş tarihi: ${new Date(p.order_date).toLocaleDateString('tr-TR')}${p.expected_date ? ' · Teslim: ' + new Date(p.expected_date).toLocaleDateString('tr-TR') : ''}${p.created_by_name ? ' · Hazırlayan: ' + escapeHtml(p.created_by_name) : ''}</p>
    <table><thead><tr><th>#</th><th>Ürün</th><th class="r">Adet / Miktar</th></tr></thead><tbody>
    ${(p.items || []).map((i, k) => `<tr><td>${k + 1}</td><td>${escapeHtml(i.name)}</td><td class="r"><b>${fq(i.quantity)}</b> ${escapeHtml(i.unit || '')}</td></tr>`).join('')}
    </tbody></table>${p.notes ? `<p><b>Not:</b> ${escapeHtml(p.notes)}</p>` : ''}
    <p class="f">Peyktan ile oluşturuldu · ${new Date().toLocaleString('tr-TR')}</p></body></html>`;
}
function poExport(poId, mode){
  const p = (APP.procRows || []).find(x => x.id === poId); if(!p) return;
  const w = window.open('', '_blank', 'width=820,height=900'); if(!w){ alert('Açılır pencere engellendi. Tarayıcıda bu site için açılır pencerelere izin verin.'); return; }
  w.document.open(); w.document.write(poDocHtml(p)); w.document.close();
  if(mode === 'pdf') showToast('📄 Açılan pencerede hedef olarak "PDF olarak kaydet"i seçin', 6000);
  setTimeout(() => { try{ w.focus(); w.print(); }catch(e){} }, 350);
}
async function poSend(poId, channel){
  const p = (APP.procRows || []).find(x => x.id === poId); if(!p) return;
  const tos = await poPickRecipients(p, channel);
  if(!tos || !tos.length) return;
  const ok = [], bad = [];
  for(const to of tos){
    const { data, error } = await sb.rpc('send_po_to_supplier', { p_token: getSession().session_token, p_po_id: poId, p_channel: channel, p_to: to });
    if(error) bad.push(to + ': ' + error.message); else ok.push((data && data.to) || to);
  }
  if(bad.length) alert('Gönderilemedi:\n' + bad.join('\n'));
  if(ok.length) showToast((channel === 'email' ? '📧 E-posta gönderildi: ' : '💬 SMS gönderildi: ') + ok.length + ' alıcı');
}
/* Alıcı seçimi: tedarikçiler ve kullanıcılar listeden işaretlenir, ayrıca elle (virgülle) adres/numara girilebilir. */
function poPickRecipients(p, channel){
  const isMail = channel === 'email';
  const opts = [];
  (APP.procSuppliers || []).forEach(x => { const v = isMail ? x.email : x.phone; if(v) opts.push({ v, l: '🏭 ' + (x.name || 'Tedarikçi'), def: x.id === p.supplier_id }); });
  ((APP.config && APP.config.users) || []).filter(u => u.is_active !== false && (isMail ? u.email : u.phone)).forEach(u => opts.push({ v: isMail ? u.email : u.phone, l: '👤 ' + u.username }));
  const seen = new Set(), list = opts.filter(o => !seen.has(o.v) && seen.add(o.v));
  const show = (v) => isMail ? v : (typeof maskPhone === 'function' ? maskPhone(v) : v);
  return new Promise(resolve => {
    const bg = document.createElement('div'); bg.className = 'dg-bg'; bg.style.zIndex = 3000;
    bg.innerHTML = `<div class="dg-card uc-card" style="max-width:440px;text-align:left;"><div class="dg-ic">${isMail ? '📧' : '💬'}</div>
      <div class="uc-msg"><p><b>${isMail ? 'Siparişi e-postayla gönder' : 'Siparişi SMS ile gönder'}</b></p></div>
      ${list.length ? `<div style="max-height:240px;overflow:auto;display:flex;flex-direction:column;gap:6px;margin:6px 0 10px;">${list.map((o, i) => `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;cursor:pointer;"><input type="checkbox" class="po-rc" value="${i}" ${o.def ? 'checked' : ''} style="width:auto;margin:0;"><span style="flex:1;font-weight:700;">${escapeHtml(o.l)}</span><small class="muted">${escapeHtml(show(o.v))}</small></label>`).join('')}</div>` : `<p class="muted" style="font-size:12.5px;">${isMail ? 'E-postası kayıtlı tedarikçi/kullanıcı yok.' : 'Telefonu kayıtlı tedarikçi/kullanıcı yok.'}</p>`}
      <label class="muted" style="font-size:12px;">${isMail ? 'Başka e-posta (virgülle birden fazla)' : 'Başka numara (virgülle birden fazla)'}</label>
      <input class="uc-in po-rc-manual" type="${isMail ? 'text' : 'tel'}" placeholder="${isMail ? 'ornek@firma.com' : '05XX XXX XX XX'}">
      <div class="uc-acts"><button type="button" class="pc-btn uc-no">Vazgeç</button><button type="button" class="uc-yes">Gönder</button></div></div>`;
    const done = (v) => { bg.remove(); resolve(v); };
    bg.addEventListener('click', e => { if(e.target === bg) done(null); });
    bg.querySelector('.uc-no').addEventListener('click', () => done(null));
    bg.querySelector('.uc-yes').addEventListener('click', () => {
      const picked = [...bg.querySelectorAll('.po-rc:checked')].map(c => list[+c.value].v);
      const manual = bg.querySelector('.po-rc-manual').value.split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
      const bad = manual.filter(x => isMail ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) : x.replace(/\D/g, '').length < 10);
      if(bad.length){ showToast('Geçersiz: ' + bad.join(', ')); return; }
      const all = [...new Set([...picked, ...manual])];
      if(!all.length){ showToast('En az bir alıcı seçin veya girin'); return; }
      done(all);
    });
    document.body.appendChild(bg);
  });
}

// Mal Kabul: teslim alınmamış siparişi iptal et (teslim alınmış kalem varsa iptal edilemez; stok zaten eklendi).
async function cancelPurchaseOrder(poId){
  if(!(await uiConfirm('Bu malzeme siparişi iptal edilsin mi?', { title: 'Siparişi iptal et', icon: '✕', okText: 'İptal et', cancelText: 'Vazgeç' }))) return;
  const { error } = await sb.rpc('set_purchase_order_status', { p_token: getSession().session_token, p_id: poId, p_status: 'cancelled' });
  if(error){ alert(error.message); return; }
  showToast('Sipariş iptal edildi');
  renderPurchaseReportContent(getSession());
  if(typeof refreshNavBadges === 'function') refreshNavBadges();
}

/* Mal Kabul: kalemleri satır satır seçip tedarikçiyi toplu ata. Bir siparişin bir kısmı seçilirse o kalemler
   seçilen tedarikçinin yeni siparişine taşınır (sipariş tedarikçi başına bölünür). */
function poSel(){ return APP.poItemSel || (APP.poItemSel = new Set()); }
function poBulkUpdate(){
  const n = poSel().size, b = document.getElementById('poBulk'); if(!b) return;
  b.hidden = !n; const t = document.getElementById('poBulkN'); if(t) t.textContent = n + ' kalem seçili';
}
function poSelItem(id, on){
  if(on) poSel().add(id); else poSel().delete(id);
  const cb = document.querySelector(`.pc2-chk[data-item="${id}"]`); if(cb) cb.closest('.pc2-it').classList.toggle('sel', on);
  poBulkUpdate();
}
function poSelCard(poId, on){
  document.querySelectorAll(`.pc2-chk[data-po="${poId}"]`).forEach(cb => { cb.checked = on; poSelItem(cb.dataset.item, on); });
}
function poSelClear(){ poSel().clear(); document.querySelectorAll('.pc2-chk, .pc2-selall input').forEach(cb => { cb.checked = false; const r = cb.closest('.pc2-it'); if(r) r.classList.remove('sel'); }); poBulkUpdate(); }
async function poBulkAssign(){
  const sup = (document.getElementById('poBulkSup') || {}).value;
  if(!sup){ showToast('Önce tedarikçi seçin'); return; }
  const ids = [...poSel()]; if(!ids.length) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('assign_po_items_supplier', { p_token: getSession().session_token, p_item_ids: ids, p_supplier_id: sup }));
  if(error){ alert(error.message); return; }
  const name = ((APP.procSuppliers || []).find(x => x.id === sup) || {}).name || '';
  poSel().clear();
  showToast(`🚚 ${ids.length} kalem ${name} tedarikçisine atandı${data && data.split ? ' · ' + data.split + ' sipariş bölündü' : ''}`);
  renderPurchaseReportContent(getSession());
  if(typeof refreshNavBadges === 'function') refreshNavBadges();
}
