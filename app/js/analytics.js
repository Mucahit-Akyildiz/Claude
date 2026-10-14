/* Finansal Analiz · gelişmiş görsel analizler (Kokpit, Menü Mühendisliği, Masa Haritası,
   Yoğunluk, Stok Tahmini, Gün Sonu, Garson Kartları, Müşteri Yolculuğu) + akıllı arama
   ve dışa aktarma. Veriler tek RPC'den (get_analytics_bundle) gelir ve tarih aralığı
   değişene kadar sekmeler arasında önbellekte tutulur. Klasik <script src>. */
const AN_TABS = [
  ['cockpit','🧭','Kokpit'], ['menueng','⭐','Menü Mühendisliği'], ['tablemap','🗺️','Masa Haritası'], ['heat','🔥','Yoğunluk'],
  ['stockf','📦','Stok Tahmini'], ['zreport','🧾','Gün Sonu'], ['waiters','🏅','Garson Kartları'], ['journey','🔁','Müşteri Yolculuğu']
];
async function anBundle(session){
  const key = APP.reportDate + '|' + APP.reportDateTo;
  if(APP.anCache && APP.anCache.key === key && Date.now() - APP.anCache.at < 60000) return APP.anCache.data;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_analytics_bundle', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error) throw error;
  APP.anCache = { key, at: Date.now(), data };
  return data;
}
const anN = (v) => Number(v) || 0;
function anDelta(cur, prev, invert){
  cur = anN(cur); prev = anN(prev);
  if(!prev) return cur ? '<span class="an-d up">yeni</span>' : '';
  const p = Math.round((cur - prev) / prev * 100);
  const good = invert ? p <= 0 : p >= 0;
  return `<span class="an-d ${good ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} %${Math.abs(p)}</span>`;
}
function anKpi(ic, label, value, sub, delta, tab, color){
  return `<div class="an-kpi ${tab ? 'an-click' : ''}" style="--k:${color||'var(--c1)'};" ${tab ? act('setReportTab', tab) : ''} ${tab ? 'title="Detayı aç"' : ''}>
    <div class="an-kpi-top"><span class="an-kpi-ic">${ic}</span><small>${label}</small>${delta||''}</div>
    <b>${value}</b>${sub ? `<div class="an-kpi-sub">${sub}</div>` : ''}${tab ? '<span class="an-go">›</span>' : ''}</div>`;
}
function anErr(el, e){ el.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml((e && e.message) || String(e)) + '</p>'; }
function anSetExport(name, header, rows){ APP.anExport = { tab: APP.reportTab, name, rows: [header, ...rows] }; }

/* ---------- 🧭 KOKPİT: karşılaştırma, anomaliler, tahmin, hedefler ---------- */
async function renderCockpitContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anBundle(session); } catch(e){ return anErr(el, e); }
  const k = d.kpi || {}, p = d.prev || {}, c = d.cancel || {};
  const avg = k.checks ? k.revenue / k.checks : 0, pavg = p.checks ? p.revenue / p.checks : 0;
  const profit = anN(k.revenue) - anN(k.cost) - anN(d.waste);
  const goalRes = await sb.rpc('get_daily_goal', { p_token: session.session_token });
  const goal = anN(goalRes.data);
  // Ay sonu tahmini
  const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), day = now.getDate();
  const month = (d.month || []).map(x => ({ d: x.d, v: anN(x.rev) }));
  const mtd = month.reduce((t, x) => t + x.v, 0), proj = day ? mtd / day * dim : 0;
  const monthGoal = goal * dim;
  // Anomaliler / uyarılar
  const al = [];
  const revP = p.revenue ? (k.revenue - p.revenue) / p.revenue * 100 : null;
  if(revP !== null && revP <= -20) al.push(['bad', '📉', `Ciro önceki döneme göre <b>%${Math.round(-revP)}</b> düştü.`, 'period']);
  if(revP !== null && revP >= 20) al.push(['good', '🚀', `Ciro önceki döneme göre <b>%${Math.round(revP)}</b> arttı.`, 'period']);
  if(anN(c.orders) >= 3 && anN(c.orders) > anN(c.prev_orders) * 2) al.push(['bad', '❌', `İptal edilen masa sayısı normalin üstünde (<b>${c.orders}</b>, önceki dönem ${c.prev_orders}).`, 'cancel']);
  if(k.revenue && anN(d.waste) / k.revenue > 0.04) al.push(['warn', '🔥', `İsraf cironun <b>%${(anN(d.waste) / k.revenue * 100).toFixed(1)}</b>'i — yüksek.`, 'waste']);
  if(k.revenue && anN(k.discount) / k.revenue > 0.08) al.push(['warn', '🏷️', `İndirimler cironun <b>%${(anN(k.discount) / k.revenue * 100).toFixed(1)}</b>'i.`, 'summary']);
  if(anN(k.comp_n)) al.push(['info', '🎁', `<b>${k.comp_n}</b> hesap ikram/personel olarak kapatıldı (${money(k.comp)}).`, 'zreport']);
  const low = (d.stock || []).filter(s => s.days_left != null && s.days_left < 3);
  if(low.length) al.push(['bad', '📦', `<b>${low.length}</b> hammadde 3 gün içinde bitecek: ${low.slice(0, 3).map(s => escapeHtml(s.name)).join(', ')}${low.length > 3 ? '…' : ''}`, 'stockf']);
  const noCost = (d.products || []).filter(x => anN(x.qty) && !anN(x.cost)).length;
  if(noCost) al.push(['warn', '⚠️', `<b>${noCost}</b> satılan ürünün maliyeti girilmemiş — kâr hesapları eksik çıkar.`, 'menueng']);
  // Kümülatif ay grafiği
  const W = 520, H = 150, maxV = Math.max(proj, monthGoal, mtd, 1);
  let cum = 0; const ptsA = []; const byDay = {}; month.forEach(x => { byDay[Number(x.d.slice(8, 10))] = x.v; });
  for(let i = 1; i <= day; i++){ cum += byDay[i] || 0; ptsA.push([i, cum]); }
  const X = (i) => 8 + (i - 1) / Math.max(1, dim - 1) * (W - 16), Y = (v) => H - 10 - v / maxV * (H - 24);
  const line = ptsA.map(([i, v], j) => (j ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  const area = ptsA.length ? line + ` L${X(day).toFixed(1)} ${H - 10} L${X(1).toFixed(1)} ${H - 10} Z` : '';
  const projLine = ptsA.length ? `M${X(day).toFixed(1)} ${Y(cum).toFixed(1)} L${X(dim).toFixed(1)} ${Y(proj).toFixed(1)}` : '';
  anSetExport('kokpit', ['Gösterge', 'Bu dönem', 'Önceki dönem'], [['Ciro', k.revenue, p.revenue], ['Hesap', k.checks, p.checks], ['Ortalama hesap', avg.toFixed(2), pavg.toFixed(2)], ['İndirim', k.discount, p.discount], ['Bahşiş', k.tips, p.tips], ['Maliyet', k.cost, p.cost]]);
  el.innerHTML = `
    <div class="an-cmp-note">⇄ Tüm oklar seçili aralığı <b>bir önceki aynı uzunluktaki dönemle</b> (${d.days} gün) karşılaştırır. Kartlara tıklayarak detaya inin.</div>
    <div class="an-kpis">
      ${anKpi('💰', 'Ciro', money(k.revenue), `${k.checks} hesap`, anDelta(k.revenue, p.revenue), 'period', 'var(--c1)')}
      ${anKpi('🧾', 'Ortalama hesap', money(avg), `ort. ${k.avg_min || 0} dk oturma`, anDelta(avg, pavg), 'tablemap', 'var(--c2)')}
      ${anKpi('📈', 'Brüt kâr', money(profit), k.revenue ? 'marj %' + Math.round(profit / k.revenue * 100) : '', '', 'menueng', '#22c55e')}
      ${anKpi('💸', 'Bahşiş', money(k.tips), '', anDelta(k.tips, p.tips), 'tips', '#f59e0b')}
      ${anKpi('🏷️', 'İndirim', money(k.discount), '', anDelta(k.discount, p.discount, true), 'zreport', '#a855f7')}
      ${anKpi('❌', 'İptal edilen masa', c.orders || 0, money(anN(c.cur && c.cur.amount)) + ' ürün iptali', anDelta(c.orders, c.prev_orders, true), 'cancel', '#ef4444')}
      ${anKpi('🔥', 'İsraf', money(d.waste), '', '', 'waste', '#f97316')}
      ${anKpi('💵', 'Nakit / Kart', money(k.cash), 'kart ' + money(k.card), '', 'zreport', '#06b6d4')}
    </div>
    <div class="ch-row">
      <div class="fs-panel pa-sec" style="--t:var(--c1);flex:2;">
        <h3><i>🔮</i>Ay Sonu Tahmini</h3>
        <div class="an-proj"><div><small>Ay başından beri</small><b>${money(mtd)}</b></div><div><small>Bu gidişle ay sonu</small><b class="an-grad">≈ ${money(proj)}</b></div>${monthGoal ? `<div><small>Aylık hedef</small><b>${money(monthGoal)}</b></div>` : ''}</div>
        <svg class="an-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <defs><linearGradient id="anArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c1)" stop-opacity=".45"/><stop offset="1" stop-color="var(--c1)" stop-opacity="0"/></linearGradient></defs>
          ${monthGoal ? `<line x1="8" x2="${W - 8}" y1="${Y(monthGoal)}" y2="${Y(monthGoal)}" class="an-goal"/>` : ''}
          <path d="${area}" fill="url(#anArea)"/><path d="${line}" class="an-line"/><path d="${projLine}" class="an-projline"/>
          ${ptsA.length ? `<circle cx="${X(day)}" cy="${Y(cum)}" r="4.5" class="an-dot"/>` : ''}
        </svg>
        <div class="an-legend"><span><i class="l1"></i>Gerçekleşen</span><span><i class="l2"></i>Tahmin</span>${monthGoal ? '<span><i class="l3"></i>Hedef</span>' : ''}</div>
      </div>
      <div class="fs-panel pa-sec" style="--t:#22c55e;">
        <h3><i>🎯</i>Hedefler</h3>
        <div class="an-rings">${anRing(goal ? (byDay[day] || 0) / goal : 0, 'Bugün', goal ? shortMoney(byDay[day] || 0) + ' / ' + shortMoney(goal) : 'hedef yok', '#22c55e')}
          ${anRing(goal ? (month.slice(-7).reduce((t, x) => t + x.v, 0)) / (goal * 7) : 0, 'Son 7 gün', goal ? shortMoney(goal * 7) + ' hedef' : '—', 'var(--c2)')}
          ${anRing(monthGoal ? mtd / monthGoal : 0, 'Bu ay', monthGoal ? shortMoney(monthGoal) + ' hedef' : '—', 'var(--c1)')}</div>
        ${goal ? '' : `<p class="fs-note">Hedef belirlemek için Genel Özet'teki 🎯 halkasına dokunun.</p>`}
      </div>
    </div>
    ${anDailyBars(d.daily || [])}
    <div class="fs-panel pa-sec rp-panel" style="--t:#ef4444;">
      <h3><i>🚨</i>Akıllı Uyarılar</h3>
      ${al.length ? `<div class="an-alerts">${al.map(([t, ic, txt, tab]) => `<div class="an-alert ${t} an-click" ${act('setReportTab', tab)}><span>${ic}</span><div>${txt}</div><span class="an-go">›</span></div>`).join('')}</div>` : '<div class="an-alert good"><span>✅</span><div>Her şey yolunda görünüyor — dikkat gerektiren bir durum yok.</div></div>'}
    </div>`;
}
function anDailyBars(daily){
  if(!daily.length) return '';
  const max = Math.max(1, ...daily.map(x => anN(x.rev))), best = daily.reduce((a, b) => anN(b.rev) > anN(a.rev) ? b : a);
  const dn = (s) => new Date(s + 'T12:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  return `<div class="fs-panel pa-sec rp-panel" style="--t:var(--c2);"><h3><i>📊</i>Günlük Ciro <small class="muted">en iyi gün: ${dn(best.d)} · ${money(best.rev)}</small></h3>
    <div class="an-bars">${daily.map((x, i) => `<div class="an-bar ${x === best ? 'best' : ''}" style="--i:${Math.min(i, 31)};" title="${dn(x.d)} · ${money(x.rev)} · ${x.n} hesap">
      <span class="an-bar-v">${shortMoney(x.rev)}</span><i style="height:${Math.max(3, anN(x.rev) / max * 100)}%"></i><small>${dn(x.d)}</small></div>`).join('')}</div></div>`;
}
function anRing(frac, label, sub, color){
  const f = Math.max(0, Math.min(1, frac || 0)), C = 2 * Math.PI * 34;
  return `<div class="an-ring" style="--rc:${color};"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" class="t"/><circle cx="40" cy="40" r="34" class="v" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - f)};"/></svg>
    <b>%${Math.round((frac || 0) * 100)}</b><small>${label}</small><em>${sub}</em></div>`;
}

/* ---------- ⭐ MENÜ MÜHENDİSLİĞİ (Kârlılık Haritası) ---------- */
async function renderMenuEngContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anBundle(session); } catch(e){ return anErr(el, e); }
  const ps = (d.products || []).filter(x => anN(x.qty) > 0).map(x => ({ name: x.name, qty: anN(x.qty), rev: anN(x.rev), cost: anN(x.cost), m: (anN(x.rev) - anN(x.cost)) / anN(x.qty) }));
  if(!ps.length){ el.innerHTML = '<div class="empty-state"><div style="font-size:42px;">⭐</div><p class="muted">Bu aralıkta satış yok.</p></div>'; return; }
  const avgQ = ps.reduce((t, x) => t + x.qty, 0) / ps.length;
  const avgM = ps.reduce((t, x) => t + x.m * x.qty, 0) / ps.reduce((t, x) => t + x.qty, 0);
  const cls = (x) => x.qty >= avgQ ? (x.m >= avgM ? 'star' : 'horse') : (x.m >= avgM ? 'puzzle' : 'dog');
  ps.forEach(x => x.c = cls(x));
  const Q = { star: ['⭐', 'Yıldızlar', 'Çok satan & kârlı — öne çıkarın, fiyatı koruyun', '#22c55e'], horse: ['🐴', 'İş Atları', 'Çok satan ama az kâr — maliyeti düşürün veya fiyatı biraz artırın', '#3b82f6'],
    puzzle: ['🧩', 'Bulmacalar', 'Kârlı ama az satan — menüde görünürlüğünü artırın', '#f59e0b'], dog: ['🐶', 'Zayıflar', 'Az satan & az kâr — menüden çıkarmayı düşünün', '#ef4444'] };
  const W = 560, H = 340, maxQ = Math.max(...ps.map(x => x.qty)) * 1.08, minM = Math.min(0, ...ps.map(x => x.m)), maxM = Math.max(...ps.map(x => x.m), 1) * 1.1;
  const X = (q) => 40 + q / maxQ * (W - 60), Y = (m) => H - 30 - (m - minM) / (maxM - minM) * (H - 50);
  anSetExport('menu-muhendisligi', ['Ürün', 'Grup', 'Adet', 'Ciro', 'Maliyet', 'Birim kâr'], ps.map(x => [x.name, Q[x.c][1], x.qty, x.rev.toFixed(2), x.cost.toFixed(2), x.m.toFixed(2)]));
  el.innerHTML = `${ps.some(x => !x.cost) ? '<div class="an-alert warn" style="margin-bottom:12px;"><span>⚠️</span><div>Maliyeti girilmemiş ürünler %100 kârlı görünür. Doğru sonuç için Ayarlar → Ürünler\'den maliyet girin.</div></div>' : ''}
    <div class="ch-row">
      <div class="fs-panel pa-sec" style="--t:var(--c1);flex:3;">
        <h3><i>🗺️</i>Kârlılık Haritası <small class="muted">· yatay: satış adedi, dikey: birim kâr</small></h3>
        <svg class="an-scatter" viewBox="0 0 ${W} ${H}">
          <rect x="${X(avgQ)}" y="10" width="${W - 20 - X(avgQ)}" height="${Y(avgM) - 10}" fill="#22c55e" opacity=".08"/>
          <rect x="40" y="10" width="${X(avgQ) - 40}" height="${Y(avgM) - 10}" fill="#f59e0b" opacity=".08"/>
          <rect x="${X(avgQ)}" y="${Y(avgM)}" width="${W - 20 - X(avgQ)}" height="${H - 30 - Y(avgM)}" fill="#3b82f6" opacity=".08"/>
          <rect x="40" y="${Y(avgM)}" width="${X(avgQ) - 40}" height="${H - 30 - Y(avgM)}" fill="#ef4444" opacity=".08"/>
          <line x1="${X(avgQ)}" x2="${X(avgQ)}" y1="10" y2="${H - 30}" class="an-axis"/><line x1="40" x2="${W - 20}" y1="${Y(avgM)}" y2="${Y(avgM)}" class="an-axis"/>
          <text x="${W - 24}" y="26" text-anchor="end" class="an-qt">⭐ Yıldız</text><text x="46" y="26" class="an-qt">🧩 Bulmaca</text>
          <text x="${W - 24}" y="${H - 38}" text-anchor="end" class="an-qt">🐴 İş atı</text><text x="46" y="${H - 38}" class="an-qt">🐶 Zayıf</text>
          ${ps.map((x, i) => `<g class="an-pt" style="--i:${Math.min(i, 30)};"><circle cx="${X(x.qty)}" cy="${Y(x.m)}" r="${Math.max(6, Math.min(16, 5 + Math.sqrt(x.rev) / 25))}" fill="${Q[x.c][3]}"><title>${escapeHtml(x.name)} · ${x.qty} adet · birim kâr ${money(x.m)} · ciro ${money(x.rev)}</title></circle></g>`).join('')}
        </svg>
      </div>
    </div>
    <div class="an-quads">${Object.entries(Q).map(([key, [ic, t, sub, col]]) => { const list = ps.filter(x => x.c === key).sort((a, b) => b.rev - a.rev);
      return `<div class="an-quad" style="--q:${col};"><div class="an-quad-h"><span>${ic}</span><div><b>${t}</b><small>${sub}</small></div><em>${list.length}</em></div>
        ${list.length ? list.slice(0, 8).map(x => `<div class="an-quad-row"><span>${escapeHtml(x.name)}</span><small>${x.qty} adet · ${money(x.m)} kâr/adet</small></div>`).join('') : '<p class="muted" style="margin:6px 0;">—</p>'}</div>`; }).join('')}</div>`;
}

/* ---------- 🗺️ MASA HARİTASI ---------- */
async function renderTableMapContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anBundle(session); } catch(e){ return anErr(el, e); }
  const rows = d.tables || [];
  const find = (name) => rows.find(r => r.table_name === name || String(r.table_name).endsWith(' · ' + name));
  const maxR = Math.max(1, ...rows.map(r => anN(r.rev)));
  const zones = (APP.config.zones || []);
  const best = rows.slice().sort((a, b) => anN(b.rev) - anN(a.rev))[0];
  const slow = rows.filter(r => anN(r.mins)).sort((a, b) => anN(b.mins) - anN(a.mins))[0];
  anSetExport('masa-haritasi', ['Masa', 'Ciro', 'Hesap', 'Ort. oturma (dk)'], rows.map(r => [r.table_name, r.rev, r.n, r.mins || '']));
  el.innerHTML = statChips([['🪑', rows.length, 'Kullanılan masa', 'var(--c1)'], ['🏆', best ? escapeHtml(best.table_name) : '—', best ? 'En kazançlı · ' + money(best.rev) : 'En kazançlı', '#22c55e'],
      ['⏱', (d.kpi && d.kpi.avg_min || 0) + ' dk', 'Ortalama oturma', 'var(--c2)'], ['🐢', slow ? escapeHtml(slow.table_name) : '—', slow ? 'En uzun oturma · ' + slow.mins + ' dk' : 'En uzun oturma', '#f59e0b']]) +
    `<div class="an-heatleg"><span>Az</span><i></i><span>Çok ciro</span></div>` +
    zones.map(z => `<div class="fs-panel pa-sec rp-panel" style="--t:var(--c2);"><h3><i>📍</i>${escapeHtml(z.name)}</h3><div class="an-tmap">${z.tables.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr', { numeric: true })).map(t => {
      const r = find(t.name), v = r ? anN(r.rev) / maxR : 0;
      return `<div class="an-tile ${r ? '' : 'idle'}" style="--h:${v.toFixed(3)};" title="${escapeAttr(t.name)}${r ? ' · ' + money(r.rev) + ' · ' + r.n + ' hesap' : ' · satış yok'}">
        <b>${escapeHtml(t.name)}</b>${r ? `<span>${shortMoney(r.rev)} ₺</span><small>${r.n} hesap${r.mins ? ' · ' + r.mins + ' dk' : ''}</small>` : '<small>satış yok</small>'}</div>`; }).join('')}</div></div>`).join('');
}

/* ---------- 🔥 YOĞUNLUK (Gün × Saat) ---------- */
async function renderHeatContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anBundle(session); } catch(e){ return anErr(el, e); }
  const metric = APP.anHeatMetric || 'rev';
  const cell = {}; (d.heat || []).forEach(h => { cell[h.dow + '-' + h.h] = h; });
  const val = (h) => !h ? 0 : metric === 'rev' ? anN(h.rev) : metric === 'n' ? anN(h.n) : (anN(h.n) ? anN(h.rev) / anN(h.n) : 0);
  const fmt = (v) => metric === 'n' ? Math.round(v) + ' hesap' : money(v);
  const hours = []; for(let i = 0; i < 24; i++) if([1,2,3,4,5,6,7].some(dw => cell[dw + '-' + i])) hours.push(i);
  const hs = hours.length ? Array.from({ length: Math.max(...hours) - Math.min(...hours) + 1 }, (_, i) => Math.min(...hours) + i) : [];
  const max = Math.max(1, ...Object.values(cell).map(val));
  const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const dayTot = [1,2,3,4,5,6,7].map(dw => hs.reduce((t, h) => t + val(cell[dw + '-' + h]), 0));
  const hourTot = hs.map(h => [1,2,3,4,5,6,7].reduce((t, dw) => t + val(cell[dw + '-' + h]), 0));
  const bestDay = dayTot.indexOf(Math.max(...dayTot)), bestHour = hs[hourTot.indexOf(Math.max(...hourTot))];
  anSetExport('yogunluk', ['Gün', ...hs.map(h => h + ':00')], days.map((dn, i) => [dn, ...hs.map(h => val(cell[(i + 1) + '-' + h]).toFixed(2))]));
  el.innerHTML = `<div class="an-seg">${[['rev', '💰 Ciro'], ['n', '🧾 Hesap sayısı'], ['avg', '📊 Ortalama hesap']].map(([k, l]) => `<button type="button" class="${metric === k ? 'on' : ''}" ${act('setAnHeatMetric', k)}>${l}</button>`).join('')}</div>
    ${hs.length ? `<div class="an-heat-sum"><div>🔥 En yoğun gün <b>${days[bestDay]}</b></div><div>⏰ En yoğun saat <b>${String(bestHour).padStart(2, '0')}:00</b></div><div>👥 Bu saatlerde personeli artırın</div></div>
    <div class="fs-panel pa-sec rp-panel" style="--t:#f97316;overflow-x:auto;"><div class="an-heat" style="--cols:${hs.length};">
      <span></span>${hs.map(h => `<span class="an-hh">${String(h).padStart(2, '0')}</span>`).join('')}<span class="an-hh">Toplam</span>
      ${days.map((dn, i) => `<span class="an-hd">${dn}</span>${hs.map(h => { const c = cell[(i + 1) + '-' + h], v = val(c);
        return `<span class="an-hc" style="--a:${(v / max).toFixed(3)};" title="${dn} ${String(h).padStart(2, '0')}:00 · ${c ? fmt(v) + ' · ' + c.n + ' hesap' : 'satış yok'}">${v && v / max > .35 ? (metric === 'n' ? Math.round(v) : shortMoney(v)) : ''}</span>`; }).join('')}<span class="an-ht">${metric === 'n' ? Math.round(dayTot[i]) : shortMoney(dayTot[i])}</span>`).join('')}
    </div></div>` : '<div class="empty-state"><div style="font-size:42px;">🔥</div><p class="muted">Bu aralıkta satış yok.</p></div>'}`;
}
function setAnHeatMetric(k){ APP.anHeatMetric = k; renderHeatContent(getSession()); }

/* ---------- 📦 STOK TAHMİNİ ---------- */
async function renderStockForecastContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anBundle(session); } catch(e){ return anErr(el, e); }
  const st = d.stock || [];
  const lvl = (s) => s.days_left == null ? 'none' : s.days_left < 3 ? 'bad' : s.days_left < 7 ? 'warn' : 'ok';
  const cnt = (l) => st.filter(s => lvl(s) === l).length;
  anSetExport('stok-tahmini', ['Hammadde', 'Stok', 'Birim', 'Günlük tüketim', 'Kalan gün'], st.map(s => [s.name, s.stock, s.unit || '', s.per_day, s.days_left ?? '']));
  el.innerHTML = statChips([['🔴', cnt('bad'), '3 gün içinde bitecek', '#ef4444', 'bad'], ['🟡', cnt('warn'), '1 hafta içinde bitecek', '#f59e0b', 'warn'],
      ['🟢', cnt('ok'), 'Yeterli', '#22c55e', 'ok'], ['💤', cnt('none'), 'Son 14 günde kullanılmadı', 'var(--c3)', 'none']], '', 'stockf') +
    `<p class="muted" style="text-align:left;font-size:12.5px;margin:4px 0 12px;">Tahmin, son 14 günde satılan ürünlerin reçetelerinden hesaplanan günlük ortalama tüketime göre yapılır.</p>
    ${st.length ? `<div class="an-stock" data-cf-scope="stockf">${st.map((s, i) => { const l = lvl(s), pct = s.days_left == null ? 100 : Math.min(100, s.days_left / 14 * 100);
      return `<div class="an-st ${l}" data-cf-tags="${l}" style="--i:${Math.min(i, 20)};"><div class="an-st-h"><b>${escapeHtml(s.name)}</b><span>${s.days_left == null ? '—' : s.days_left < 1 ? 'bugün bitiyor' : s.days_left + ' gün'}</span></div>
        <div class="an-st-bar"><i style="width:${pct}%"></i></div>
        <small>Stok: ${anN(s.stock).toLocaleString('tr-TR')} ${escapeHtml(s.unit || '')} · günde ~${anN(s.per_day).toLocaleString('tr-TR')} ${escapeHtml(s.unit || '')}</small></div>`; }).join('')}</div>`
    : '<div class="empty-state"><div style="font-size:42px;">📦</div><p class="muted">Hammadde tanımlı değil. Ayarlar → Ürünler & Hammaddeler\'den ekleyin.</p></div>'}`;
}

/* ---------- 🧾 GÜN SONU (Z raporu) ---------- */
async function renderZReportContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anBundle(session); } catch(e){ return anErr(el, e); }
  const k = d.kpi || {}, c = d.cancel || {};
  const gross = anN(k.revenue) + anN(k.discount);
  const rows = [
    ['Brüt satış (indirim öncesi)', money(gross)], ['İndirimler', '−' + money(anN(k.discount) - anN(k.birthday))], ['Doğum günü indirimi', '−' + money(k.birthday)],
    ['NET CİRO', money(k.revenue), 'big'], ['—'],
    ['💵 Nakit', money(k.cash)], ['💳 Kredi kartı', money(k.card)], ['🎁 Hediye kartı', money(k.gift)], ['—'],
    ['Hesap sayısı', k.checks || 0], ['Ortalama hesap', money(k.checks ? k.revenue / k.checks : 0)], ['Bahşiş', money(k.tips)], ['—'],
    ['🎁 İkram / personel (' + (k.comp_n || 0) + ' hesap)', money(k.comp)], ['❌ İptal edilen masa', c.orders || 0], ['❌ İptal edilen ürün tutarı', money(c.cur && c.cur.amount)], ['🔥 İsraf maliyeti', money(d.waste)], ['—'],
    ['Ürün maliyeti', money(k.cost)], ['BRÜT KÂR', money(anN(k.revenue) - anN(k.cost) - anN(d.waste)), 'big']];
  anSetExport('gun-sonu', ['Kalem', 'Tutar'], rows.filter(r => r.length > 1).map(r => [r[0], String(r[1]).replace(/<[^>]+>/g, '')]));
  const s = getSession();
  el.innerHTML = `<div class="an-z-wrap"><div class="an-z" id="anZ">
      <div class="an-z-h"><b>${escapeHtml(s.restaurant_name || '')}</b><span>GÜN SONU RAPORU</span><small>${escapeHtml(reportDateRangeLabel())} · ${new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</small></div>
      ${rows.map(r => r.length === 1 ? '<div class="an-z-sep"></div>' : `<div class="an-z-r ${r[2] || ''}"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}
      <div class="an-z-f">Peyktan · ${escapeHtml(s.username || '')}</div>
    </div>
    <div class="an-z-acts"><button type="button" ${act('printZReport')}>🖨️ Yazdır / PDF</button><button type="button" class="ghost-btn" ${act('exportAnalytics')}>⬇ Excel (CSV)</button></div></div>`;
}
function printZReport(){ document.body.classList.add('print-z'); window.print(); setTimeout(() => document.body.classList.remove('print-z'), 500); }

/* ---------- 🏅 GARSON KARTLARI ---------- */
async function renderWaiterCardsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anBundle(session); } catch(e){ return anErr(el, e); }
  const st = (d.staff || []).slice().sort((a, b) => anN(b.rev) - anN(a.rev));
  if(!st.length){ el.innerHTML = '<div class="empty-state"><div style="font-size:42px;">🏅</div><p class="muted">Bu aralıkta personel satışı yok.</p></div>'; return; }
  const maxR = Math.max(1, ...st.map(x => anN(x.rev)));
  const topTips = st.slice().sort((a, b) => anN(b.tips) - anN(a.tips))[0];
  anSetExport('garsonlar', ['Personel', 'Ciro', 'Hesap', 'Ort. hesap', 'Bahşiş', 'Ürün adedi', 'İptal', 'En çok sattığı'], st.map(x => [x.username, x.rev, x.n, x.n ? (x.rev / x.n).toFixed(2) : 0, x.tips, x.items, x.cancels, x.top_product || '']));
  el.innerHTML = `<div class="an-waiters">${st.map((x, i) => { const cr = anN(x.items) ? anN(x.cancels) / (anN(x.items) + anN(x.cancels)) * 100 : 0;
    return `<div class="an-w ${i === 0 ? 'mvp' : ''}" style="--i:${i};">
      ${i === 0 ? '<div class="an-w-badge">🏆 Dönemin Garsonu</div>' : x === topTips && anN(x.tips) ? '<div class="an-w-badge tip">💸 Bahşiş Şampiyonu</div>' : ''}
      <div class="an-w-top">${avatarHtml(x.username)}<div><b>${escapeHtml(x.username)}</b><small>#${i + 1} sırada</small></div></div>
      <div class="an-w-rev"><b>${money(x.rev)}</b><div class="an-w-bar"><i style="width:${anN(x.rev) / maxR * 100}%"></i></div></div>
      <div class="an-w-grid"><div><b>${x.n}</b><small>hesap</small></div><div><b>${money(x.n ? x.rev / x.n : 0)}</b><small>ort. hesap</small></div>
        <div><b>${money(x.tips)}</b><small>bahşiş</small></div><div><b>${x.items}</b><small>ürün girdi</small></div>
        <div class="${cr > 10 ? 'bad' : ''}"><b>${x.cancels}</b><small>iptal${cr ? ' · %' + cr.toFixed(0) : ''}</small></div><div><b title="${escapeAttr(x.top_product || '')}">${escapeHtml(x.top_product || '—')}</b><small>en çok sattığı</small></div></div>
    </div>`; }).join('')}</div>`;
}

/* ---------- 🔁 MÜŞTERİ YOLCULUĞU ---------- */
async function renderJourneyContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anBundle(session); } catch(e){ return anErr(el, e); }
  const c = d.customers || {};
  const ret = anN(c.returning), nw = Math.max(0, anN(c.visits) - ret);
  const risk = c.at_risk || [];
  anSetExport('musteri-yolculugu', ['Müşteri', 'Ziyaret', 'Toplam harcama', 'Son ziyaret'], risk.map(x => [x.name, x.total_visits, x.total_spent, x.last_visit_at]));
  el.innerHTML = statChips([['🆕', c.new || 0, 'Yeni kayıtlı müşteri', 'var(--c1)'], ['🔁', ret, 'Tekrar gelen müşteri', '#22c55e'],
      ['📆', c.avg_return_days ? c.avg_return_days + ' gün' : '—', 'Ortalama geri dönüş süresi', 'var(--c2)'], ['⚠️', risk.length, 'Kaybedilmek üzere', '#ef4444']]) +
    `<div class="ch-row">
      <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>🍩</i>Bu Dönem Gelen Kayıtlı Müşteriler</h3>
        ${anN(c.visits) ? svgDonut([{ label: 'Tekrar gelen', value: ret, color: '#22c55e' }, { label: 'İlk kez gelen', value: nw, color: 'var(--c1)' }], { center: String(c.visits), sub: 'müşteri' }) : '<p class="muted">Bu dönemde kayıtlı müşteriye satış yok.</p>'}
        <p class="fs-note">Sadakat oranı: <b>%${anN(c.visits) ? Math.round(ret / anN(c.visits) * 100) : 0}</b> — yüksek olması iyidir.</p></div>
      <div class="fs-panel pa-sec" style="--t:#ef4444;flex:2;"><h3><i>💔</i>Kaybedilmek Üzere Olan Sadık Müşteriler <small class="muted">· 3+ ziyaret, 60+ gündür gelmedi</small></h3>
        ${risk.length ? `<div class="an-risk">${risk.map(x => `<div class="an-risk-r">${avatarHtml(x.name)}<div><b>${escapeHtml(x.name)}</b><small>${x.phone ? phoneHtml(x.phone) : ''}</small></div>
          <span>${x.total_visits} ziyaret</span><span>${money(x.total_spent)}</span><em>${Math.round((Date.now() - new Date(x.last_visit_at).getTime()) / 86400000)} gün önce</em></div>`).join('')}</div>
          <p class="fs-note">💡 Bu müşterilere özel bir indirim veya kampanya ile geri dönmelerini sağlayabilirsiniz.</p>` : '<p class="muted">Harika — kaybedilmek üzere olan sadık müşteri yok.</p>'}</div>
    </div>`;
}

/* ---------- 🔍 Akıllı arama ve dışa aktarma ---------- */
async function anSearch(q){
  const box = document.getElementById('anSearchRes'); if(!box) return;
  q = String(q || '').trim().toLocaleLowerCase('tr');
  if(q.length < 2){ box.innerHTML = ''; box.hidden = true; return; }
  let d = null; try { d = await anBundle(getSession()); } catch(e){}
  const hit = (s) => String(s || '').toLocaleLowerCase('tr').includes(q);
  const tabs = [...AN_TABS, ['summary','📊','Genel Özet'], ['period','📈','Dönemsel Analiz'], ['vat','🧾','KDV'], ['products','📦','Ürün İstatistikleri'], ['staff','👤','Personel Analizleri'],
    ['customers','🧑‍🤝‍🧑','Müşteri Analizleri'], ['tips','💰','Bahşiş Havuzu'], ['waste','🔥','İsraf'], ['cancel','❌','İptaller'], ['resv','📅','Rezervasyon Analizi'], ['openacc','📒','Açık Hesaplar']];
  const kw = { nakit: 'zreport', kart: 'zreport', 'gün sonu': 'zreport', z: 'zreport', kâr: 'menueng', kar: 'menueng', stok: 'stockf', saat: 'heat', iptal: 'cancel', israf: 'waste', bahşiş: 'tips', hedef: 'cockpit', tahmin: 'cockpit', garson: 'waiters', masa: 'tablemap', kdv: 'vat' };
  const res = [];
  tabs.filter(t => hit(t[2])).forEach(t => res.push([t[1], t[2], 'Sekme', t[0]]));
  Object.entries(kw).filter(([w]) => w.startsWith(q) || q.startsWith(w)).forEach(([w, t]) => { const tb = tabs.find(x => x[0] === t); if(tb && !res.some(r => r[3] === t)) res.push([tb[1], tb[2], '“' + w + '” ile ilgili', t]); });
  if(d){
    (d.products || []).filter(x => hit(x.name)).slice(0, 6).forEach(x => res.push(['🍽️', x.name, anN(x.qty) + ' adet · ' + money(x.rev), 'menueng']));
    (d.tables || []).filter(x => hit(x.table_name)).slice(0, 5).forEach(x => res.push(['🪑', x.table_name, money(x.rev) + ' · ' + x.n + ' hesap', 'tablemap']));
    (d.staff || []).filter(x => hit(x.username)).slice(0, 5).forEach(x => res.push(['👤', x.username, money(x.rev) + ' · ' + x.n + ' hesap', 'waiters']));
    (d.stock || []).filter(x => hit(x.name)).slice(0, 4).forEach(x => res.push(['📦', x.name, x.days_left == null ? 'kullanılmadı' : x.days_left + ' gün yeter', 'stockf']));
    ((d.customers && d.customers.at_risk) || []).filter(x => hit(x.name)).slice(0, 4).forEach(x => res.push(['💔', x.name, 'kaybedilmek üzere', 'journey']));
  }
  box.hidden = false;
  box.innerHTML = res.length ? res.slice(0, 14).map(([ic, t, s, tab]) => `<div class="an-sr" ${act('anGo', tab)}><span>${ic}</span><div><b>${escapeHtml(t)}</b><small>${escapeHtml(s)}</small></div></div>`).join('')
    : '<div class="an-sr empty">Sonuç yok — ürün, masa, personel, hammadde veya “nakit”, “stok”, “kâr” gibi bir kelime deneyin.</div>';
}
function anGo(tab){ const i = document.getElementById('anSearch'); if(i) i.value = ''; const b = document.getElementById('anSearchRes'); if(b){ b.hidden = true; b.innerHTML = ''; } setReportTab(tab); }
function exportAnalytics(){
  let rows = null, name = APP.reportTab || 'rapor';
  if(APP.anExport && APP.anExport.tab === APP.reportTab) { rows = APP.anExport.rows; name = APP.anExport.name; }
  if(!rows){
    const root = document.getElementById('reportContent'); rows = [];
    root.querySelectorAll('table').forEach(t => { t.querySelectorAll('tr').forEach(tr => rows.push([...tr.children].map(td => td.innerText.trim()))); rows.push([]); });
    root.querySelectorAll('.race-row').forEach(r => rows.push([...r.querySelectorAll('.race-label b, .race-bar span, .race-side')].map(x => x.innerText.trim())));
    root.querySelectorAll('.os-chip').forEach(c => rows.push([c.querySelector('small') ? c.querySelector('small').innerText : '', c.querySelector('b') ? c.querySelector('b').innerText : '']));
  }
  if(!rows.length){ showToast('Bu sekmede dışa aktarılacak tablo yok'); return; }
  const csv = '﻿' + rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'peyktan-' + name + '-' + reportDateRangeLabel().replace(/\s/g, '') + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function printAnalytics(){ document.body.classList.add('print-report'); window.print(); setTimeout(() => document.body.classList.remove('print-report'), 500); }
