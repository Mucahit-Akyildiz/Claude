/* Finansal Analiz · gelişmiş görsel analizler (Kokpit, Menü Mühendisliği, Masa Haritası,
   Yoğunluk, Stok Tahmini, Gün Sonu, Garson Kartları, Müşteri Yolculuğu) + akıllı arama
   ve dışa aktarma. Veriler tek RPC'den (get_analytics_bundle) gelir ve tarih aralığı
   değişene kadar sekmeler arasında önbellekte tutulur. Klasik <script src>. */
const AN_TABS = [
  ['cockpit','🧭','Kokpit'], ['menueng','⭐','Menü Mühendisliği'], ['tablemap','🗺️','Masa Haritası'], ['heat','🔥','Yoğunluk'],
  ['channels','🛵','Satış Kanalları'], ['speed','⚡','Hizmet Hızı'],
  ['stockf','📦','Stok Tahmini'], ['zreport','🧾','Gün Sonu'], ['dayclose','📅','Gün Sonu Kapanışları'], ['waiters','🏅','Garson Kartları'], ['journey','🔁','Müşteri Yolculuğu']
];
async function anBundle(session, fresh, quiet){
  const key = APP.reportDate + '|' + APP.reportDateTo;
  if(!fresh && APP.anCache && APP.anCache.key === key && Date.now() - APP.anCache.at < 60000) return APP.anCache.data;
  const req = sb.rpc('get_analytics_bundle', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo });
  const { data, error } = await (quiet ? req : withLoadingOverlay(req));
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
  const mName = now.toLocaleDateString('tr-TR', { month: 'short' });
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
        <div class="an-chart-wrap" id="anProjChart">
        <svg class="an-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <defs><linearGradient id="anArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c1)" stop-opacity=".45"/><stop offset="1" stop-color="var(--c1)" stop-opacity="0"/></linearGradient></defs>
          ${monthGoal ? `<line x1="8" x2="${W - 8}" y1="${Y(monthGoal)}" y2="${Y(monthGoal)}" class="an-goal"/>` : ''}
          <path d="${area}" fill="url(#anArea)"/><path d="${line}" class="an-line"/><path d="${projLine}" class="an-projline"/>
          ${ptsA.length ? `<circle cx="${X(day)}" cy="${Y(cum)}" r="4.5" class="an-dot"/>` : ''}
          <line class="an-hover-line" y1="4" y2="${H - 10}" style="display:none;"/>
        </svg>
        <span class="an-hover-dot" style="display:none;"></span>
        <div class="an-tip" style="display:none;"></div>
        </div>
        <div class="an-axis">${[1, 8, 15, 22, dim].map(i => `<span style="left:${(X(i) / W * 100).toFixed(2)}%">${i} ${mName}</span>`).join('')}</div>
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
  anBindProjHover({ W, H, X, Y, dim, day, cum, proj, ptsA, monthGoal, now });
}
/* Ay sonu grafiği: üzerine gelince o günün tarihi ve kümülatif (gerçekleşen
   ya da tahmini) ciro gösterilir. */
function anBindProjHover(o){
  const wrap = document.getElementById('anProjChart'); if(!wrap || !o.ptsA.length) return;
  const svg = wrap.querySelector('svg'), ln = wrap.querySelector('.an-hover-line'), dot = wrap.querySelector('.an-hover-dot'), tip = wrap.querySelector('.an-tip');
  const valAt = (i) => i <= o.day ? o.ptsA[i - 1][1] : o.cum + (o.proj - o.cum) * (i - o.day) / Math.max(1, o.dim - o.day);
  const hide = () => { ln.style.display = dot.style.display = tip.style.display = 'none'; };
  wrap.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width * o.W;
    const i = Math.min(o.dim, Math.max(1, Math.round((fx - 8) / (o.W - 16) * (o.dim - 1) + 1)));
    const v = valAt(i), x = o.X(i), y = o.Y(v), future = i > o.day;
    ln.setAttribute('x1', x); ln.setAttribute('x2', x); ln.style.display = '';
    const px = x / o.W * r.width, py = y / o.H * r.height;
    dot.style.left = px + 'px'; dot.style.top = py + 'px'; dot.style.display = ''; dot.classList.toggle('proj', future);
    const date = new Date(o.now.getFullYear(), o.now.getMonth(), i).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' });
    tip.innerHTML = `<small>${date}${i === o.day ? ' · bugün' : ''}</small><b>${future ? '≈ ' : ''}${money(v)}</b><span class="muted">${future ? 'tahmini kümülatif' : 'gerçekleşen kümülatif'}</span>`
      + (o.monthGoal ? `<span class="muted">hedefin %${Math.round(v / o.monthGoal * 100)}'i</span>` : '');
    tip.style.display = '';
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(0, px - tw / 2), r.width - tw) + 'px';
    tip.style.top = Math.max(0, py - tip.offsetHeight - 12) + 'px';
  });
  wrap.addEventListener('pointerleave', hide);
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
// Gün Sonu her açılışta ve açıkken 30 sn'de bir güncel veriyle çizilir (önbellek yüzünden yeni ödemeler geç görünmesin).
let Z_REFRESH_T = null;
function zAutoRefresh(){
  clearInterval(Z_REFRESH_T);
  Z_REFRESH_T = setInterval(() => {
    const inp = document.getElementById('ccCounted');
    if(APP.view !== 'reports' || APP.reportTab !== 'zreport' || !inp){ clearInterval(Z_REFRESH_T); return; }
    if(document.hidden || inp.value !== '' || document.activeElement === inp || document.activeElement === document.getElementById('ccNote')) return;
    const s = getSession(); if(s) renderZReportContent(s, true);
  }, 30000);
}
async function renderZReportContent(session, quiet){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anBundle(session, true, quiet); } catch(e){ return quiet ? null : anErr(el, e); }
  if(APP.reportTab !== 'zreport' || !document.getElementById('reportContent')) return;
  zAutoRefresh();
  const k = d.kpi || {}, c = d.cancel || {};
  const gross = anN(k.revenue) + anN(k.discount);
  const rows = [
    ['Brüt satış (indirim öncesi)', money(gross)], ['İndirimler', '−' + money(anN(k.discount) - anN(k.birthday))], ['Doğum günü indirimi', '−' + money(k.birthday)],
    ['NET CİRO', money(k.revenue), 'big'], ['—'],
    ['💵 Nakit', money(k.cash)], ['💳 Kredi kartı', money(k.card)], ['🎁 Hediye kartı', money(k.gift)], ...(anN(k.points) ? [['⭐ Puanla ödeme', money(k.points)]] : []), ['—'],
    ['Hesap sayısı', k.checks || 0], ['Ortalama hesap', money(k.checks ? k.revenue / k.checks : 0)], ['Bahşiş', money(k.tips)], ['—'],
    ['🎁 İkram / personel (' + (k.comp_n || 0) + ' hesap)', money(k.comp)], ['❌ İptal edilen masa', c.orders || 0], ['❌ İptal edilen ürün tutarı', money(c.cur && c.cur.amount)], ['🔥 İsraf maliyeti', money(d.waste)], ['—'],
    ['Ürün maliyeti', money(k.cost)], ['BRÜT KÂR', money(anN(k.revenue) - anN(k.cost) - anN(d.waste)), 'big']];
  // Kasa sayımı: seçilen günün son sayımı rapora (fiş/PDF/Excel) eklenir.
  let counts = [];
  try{ const r = await sb.rpc('list_cash_counts', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo || APP.reportDate }); if(!r.error) counts = r.data || []; }catch(e){}
  const lastC = counts[0];
  if(lastC && lastC.skipped) rows.push(['—'], ['⚠️ Kasa sayılmadı', escapeHtml(lastC.note || ''), 'big']);
  else if(lastC) rows.push(['—'], ['🧮 Sayılan nakit', money(lastC.counted)], ['Kasa farkı', (anN(lastC.diff) > 0 ? '+' : '') + money(lastC.diff), 'big']);
  anSetExport('gun-sonu', ['Kalem', 'Tutar'], rows.filter(r => r.length > 1).map(r => [r[0], String(r[1]).replace(/<[^>]+>/g, '')]));
  APP.anZRows = rows;
  const s = getSession();
  const closed = lastC && !lastC.skipped, skipped = lastC && lastC.skipped;
  const fmtT = (t) => new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
  const stat = (ic, l, v, tone) => `<div class="zc-stat" style="--sc:${tone};"><span>${ic}</span><small>${l}</small><b>${v}</b></div>`;
  const statusHtml = closed
    ? `<div class="zc-status ok"><span class="zc-big">✅</span><div><b>Gün kapandı</b><small>${escapeHtml(lastC.username || '')} · ${fmtT(lastC.created_at)}</small></div>
        <div class="zc-res ${anN(lastC.diff) < 0 ? 'neg' : anN(lastC.diff) > 0 ? 'pos' : 'ok'}"><small>Kasa farkı</small><b>${anN(lastC.diff) === 0 ? 'Tam ✓' : (anN(lastC.diff) > 0 ? '+' : '') + money(lastC.diff)}</b></div></div>`
    : skipped
      ? `<div class="zc-status skip"><span class="zc-big">⚠️</span><div><b>Kasa sayılmadan kapatıldı</b><small>${escapeHtml(lastC.note || '')} · ${escapeHtml(lastC.username || '')} · ${fmtT(lastC.created_at)}</small></div></div>`
      : `<div class="zc-status wait"><span class="zc-big">🕒</span><div><b>Gün henüz kapanmadı</b><small>Kasadaki nakdi sayın, tutarı girin ve günü kapatın. Yaklaşık 30 saniye sürer.</small></div></div>`;
  el.innerHTML = `<div class="zc-wrap">
    <div class="zc-main">
      <div class="zc-head"><div><h3>🧾 Gün Sonu</h3><small>${escapeHtml(reportDateRangeLabel())}</small></div><button type="button" class="ghost-btn zc-hist" ${act('setReportTab', 'dayclose')}>📅 Geçmiş kapanışlar</button></div>
      ${statusHtml}
      <div class="zc-step"><span class="zc-n">1</span><div><b>Günün özetine bakın</b><small>Kasada olması gereken nakit, nakit ödemelerin toplamıdır.</small></div></div>
      <div class="zc-stats">
        ${stat('💰', 'Net ciro', money(k.revenue), 'var(--c1)')}
        ${stat('💵', 'Nakit (kasada olmalı)', money(k.cash), 'var(--ok,#22c55e)')}
        ${stat('💳', 'Kredi kartı', money(k.card), 'var(--c2)')}
        ${stat('🧾', 'Hesap sayısı', k.checks || 0, 'var(--c3)')}
      </div>
      <div class="zc-step"><span class="zc-n">2</span><div><b>Kasadaki nakdi sayın</b><small>Saydığınız toplamı yazın; fark anında hesaplanır.</small></div></div>
      <div class="zc-count">
        <div class="zc-exp"><small>Kasada olması gereken</small><b id="ccExpected" data-v="${anN(k.cash)}">${money(k.cash)}</b></div>
        <span class="zc-vs">→</span>
        <label class="zc-in"><small>Saydığınız nakit</small><span><input id="ccCounted" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" ${actOn('input','updateCashDiff',[])}><em>₺</em></span></label>
      </div>
      <div class="zc-msg" id="ccDiffBox"><span id="ccDiff">Tutarı girince sonuç burada görünür.</span></div>
      <input id="ccNote" class="zc-note" placeholder="Not (isteğe bağlı) — örn. açılış kasası 500 ₺ dahil">
      <div class="zc-step"><span class="zc-n">3</span><div><b>Günü kapatın</b><small>Kaydedince açık vardiyalar da kapanır ve gün raporlarda “Kapandı” olarak görünür.</small></div></div>
      <button type="button" class="zc-close" ${act('saveCashCount')}>🔒 ${closed ? 'Yeniden say ve kaydet' : 'Günü kapat'}</button>
      ${counts.length > 1 ? `<details class="zc-more"><summary>Bu günün tüm sayımları (${counts.length})</summary><div class="cc-list">${counts.map(c => `<div class="cc-row"><span>${fmtT(c.created_at)} · ${escapeHtml(c.username||'')}${c.note ? ' · ' + escapeHtml(c.note) : ''}</span>${c.skipped ? '<b class="neg">⚠️ Sayılmadı</b>' : `<b class="${anN(c.diff) < 0 ? 'neg' : anN(c.diff) > 0 ? 'pos' : ''}">${money(c.counted)} · ${anN(c.diff) > 0 ? '+' : ''}${money(c.diff)}</b>`}</div>`).join('')}</div></details>` : ''}
    </div>
    <div class="zc-side">
      <div class="zc-side-t">🧾 Rapor fişi</div>
      <div class="an-z" id="anZ">
        <div class="an-z-h"><b>${escapeHtml(s.restaurant_name || '')}</b><span>GÜN SONU RAPORU</span><small>${escapeHtml(reportDateRangeLabel())} · ${new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</small></div>
        ${rows.map(r => r.length === 1 ? '<div class="an-z-sep"></div>' : `<div class="an-z-r ${r[2] || ''}"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}
        <div class="an-z-f">Peyktan · ${escapeHtml(s.username || '')}</div>
      </div>
      <div class="zc-acts"><button type="button" ${act('printZToReceipt')}>🧾 Fişe yazdır</button><button type="button" class="ghost-btn" ${act('printZReport')}>🖨️ PDF</button><button type="button" class="ghost-btn" ${act('exportAnalytics')}>⬇ Excel</button></div>
    </div></div>`;
}
function updateCashDiff(){
  const exp = Number(document.getElementById('ccExpected').dataset.v) || 0, v = document.getElementById('ccCounted').value;
  const el = document.getElementById('ccDiff'), box = document.getElementById('ccDiffBox');
  if(v === ''){ el.textContent = 'Tutarı girince sonuç burada görünür.'; box.className = 'zc-msg'; return; }
  const d = Math.round(((Number(v) || 0) - exp) * 100) / 100;
  el.innerHTML = d === 0 ? '✅ <b>Kasa tam.</b> Sayım sistemle birebir tutuyor.'
    : d < 0 ? `🔻 Kasada <b>${money(-d)} eksik</b> var. Para üstü, unutulan fiş veya iade olup olmadığını kontrol edin; gerekirse not düşün.`
    : `🔺 Kasada <b>${money(d)} fazla</b> var. Açılış kasası veya girilmemiş bir ödeme olabilir; gerekirse not düşün.`;
  box.className = 'zc-msg ' + (d < 0 ? 'neg' : d > 0 ? 'pos' : 'ok');
}
async function saveCashCount(){
  const v = document.getElementById('ccCounted').value;
  if(v === ''){ alert('Sayılan nakit tutarını girin'); return; }
  const session = getSession();
  APP.dayClose = null;
  const { error } = await sb.rpc('save_cash_count', { p_token: session.session_token, p_date: APP.reportDateTo || APP.reportDate, p_expected: Number(document.getElementById('ccExpected').dataset.v) || 0, p_counted: Number(v), p_note: document.getElementById('ccNote').value });
  if(error){ alert(error.message); return; }
  showToast('Gün kapandı ✓');
  renderZReportContent(session);
}
/* Gün sonu raporunu kasa fişlerinin gittiği "Bu Ekranın Yazıcısı"na 80 mm fiş olarak basar. */
async function printZToReceipt(){
  const rows = APP.anZRows || []; if(!rows.length) return;
  const s = getSession(), printer = getPrinters().find(p => p.id===getActivePrinterId());
  if(!printer){ showToast('⚠️ Bu ekran için yazıcı seçili değil — Yazıcı Ayarları\'ndan seçin'); return; }
  const plain = (v) => String(v).replace(/<[^>]+>/g, '').replace(/[^\x20-\x7EçğıöşüÇĞİÖŞÜ₺−]/g, '').trim();
  const head = [s.restaurant_name || '', 'GUN SONU RAPORU', reportDateRangeLabel(), new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })];
  if(printer.type==='usb'){
    const W = 42, enc = (t) => escposEncodeText(t), parts = [];
    const push = (...b) => parts.push(new Uint8Array(b));
    push(0x1b, 0x40, 0x1b, 0x61, 1, 0x1b, 0x45, 1); parts.push(enc(head[0] + '\n' + head[1] + '\n')); push(0x1b, 0x45, 0); parts.push(enc(head[2] + '\n' + head[3] + '\n'));
    push(0x1b, 0x61, 0); parts.push(enc('-'.repeat(W) + '\n'));
    rows.forEach(r => {
      if(r.length === 1){ parts.push(enc('-'.repeat(W) + '\n')); return; }
      const l = plain(r[0]), v = plain(r[1]), line = l.slice(0, W - v.length - 1).padEnd(W - v.length) + v;
      if(r[2] === 'big'){ push(0x1b, 0x45, 1); parts.push(enc(line + '\n')); push(0x1b, 0x45, 0); } else parts.push(enc(line + '\n'));
    });
    push(0x1b, 0x61, 1); parts.push(enc('\nPeyktan - ' + (s.username || '') + '\n\n\n\n')); push(0x1d, 0x56, 0x42, 0x00);
    const total = parts.reduce((t, p) => t + p.length, 0), bytes = new Uint8Array(total); let o = 0; parts.forEach(p => { bytes.set(p, o); o += p.length; });
    const ok = await sendToUsbPrinter(printer, bytes);
    showToast(ok ? '🧾 Gün sonu raporu yazıcıya gönderildi' : '⚠️ Yazıcıya gönderilemedi' + (LAST_USB_ERROR ? ' — ' + LAST_USB_ERROR : ''));
    return;
  }
  const el = document.getElementById('printArea'); if(!el) return;
  applyTicketDesignStyle(el, getTicketDesign());
  el.innerHTML = `<div style="text-align:center;"><b style="font-size:1.15em;">${escapeHtml(head[0])}</b><br><b>GÜN SONU RAPORU</b><br><small>${escapeHtml(head[2])}<br>${escapeHtml(head[3])}</small></div><hr>`
    + rows.map(r => r.length === 1 ? '<hr style="border-style:dashed;">' : `<div style="display:flex;justify-content:space-between;gap:6px;${r[2]==='big'?'font-weight:800;font-size:1.1em;':''}"><span>${r[0]}</span><span style="white-space:nowrap;">${r[1]}</span></div>`).join('')
    + `<div style="text-align:center;margin-top:8px;"><small>Peyktan · ${escapeHtml(s.username || '')}</small></div>`;
  await new Promise(r => setTimeout(r, 80));
  if(printer.type==='electron' && isDesktopApp()){
    const res = await window.electronAPI.silentPrint(printer.osPrinterName);
    showToast(res && res.success ? '🧾 Gün sonu raporu yazıcıya gönderildi' : '⚠️ Yazıcıya gönderilemedi' + (res && res.errorType ? ' — ' + res.errorType : ''));
    return;
  }
  window.print();
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
    return `<div class="an-w an-click ${i === 0 ? 'mvp' : ''}" style="--i:${i};" title="Detaylı kartı aç" ${act('openStaffDetail', x.id)}>
      ${i === 0 ? '<div class="an-w-badge">🏆 Dönemin Garsonu</div>' : x === topTips && anN(x.tips) ? '<div class="an-w-badge tip">💸 Bahşiş Şampiyonu</div>' : ''}
      <div class="an-w-top">${avatarHtml(x.username)}<div><b>${escapeHtml(x.username)}</b><small>#${i + 1} sırada</small></div></div>
      <div class="an-w-rev"><b>${money(x.rev)}</b><div class="an-w-bar"><i style="width:${anN(x.rev) / maxR * 100}%"></i></div></div>
      <div class="an-w-grid"><div><b>${x.n}</b><small>hesap</small></div><div><b>${money(x.n ? x.rev / x.n : 0)}</b><small>ort. hesap</small></div>
        <div><b>${money(x.tips)}</b><small>bahşiş</small></div><div><b>${x.items}</b><small>ürün girdi</small></div>
        <div class="${cr > 10 ? 'bad' : ''}"><b>${x.cancels}</b><small>iptal${cr ? ' · %' + cr.toFixed(0) : ''}</small></div><div><b title="${escapeAttr(x.top_product || '')}">${escapeHtml(x.top_product || '—')}</b><small>en çok sattığı</small></div>
        <div><b>${x.shifts || 0}</b><small>vardiya</small></div></div>
      <div class="an-w-more">Detaylı kart için dokunun ›</div>
    </div>`; }).join('')}</div>`;
}

/* ---------- 🔁 MÜŞTERİ YOLCULUĞU ---------- */
async function renderJourneyContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anBundle(session); } catch(e){ return anErr(el, e); }
  const c = d.customers || {};
  const ret = anN(c.returning), nw = Math.max(0, anN(c.visits) - ret);
  const risk = c.at_risk || [];
  const { data: tops } = await sb.rpc('get_customer_cards', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo });
  const top = tops || [];
  const tier = (p) => anN(p) >= 1000 ? ['💎', 'Platin', '#a855f7'] : anN(p) >= 500 ? ['🥇', 'Altın', '#f59e0b'] : anN(p) >= 200 ? ['🥈', 'Gümüş', '#94a3b8'] : ['🥉', 'Bronz', '#c2410c'];
  anSetExport('musteri-yolculugu', ['Müşteri', 'Dönem ziyaret', 'Dönem harcama', 'Toplam ziyaret', 'Toplam harcama', 'En sevdiği'], top.map(x => [x.name, x.visits, x.rev, x.total_visits, x.total_spent, x.top_product || '']));
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
    </div>
    <div class="fs-panel pa-sec rp-panel" style="--t:#f59e0b;"><h3><i>👑</i>Bu Dönemin En Değerli Müşterileri <small class="muted">· detay için karta dokunun</small></h3>
      ${top.length ? `<div class="an-waiters">${top.map((x, i) => { const t = tier(x.points_balance);
        return `<div class="an-w an-click ${i === 0 ? 'mvp' : ''}" style="--i:${Math.min(i, 12)};" ${act('openCustomerDetail', x.id)}>
          ${i === 0 ? '<div class="an-w-badge">👑 Dönemin Müşterisi</div>' : ''}
          <div class="an-w-top">${avatarHtml(x.name)}<div><b>${escapeHtml(x.name)}</b><small>${x.phone ? phoneHtml(x.phone) : 'telefon yok'}</small></div><span class="an-tier" style="--t:${t[2]};">${t[0]} ${t[1]}</span></div>
          <div class="an-w-rev"><b>${money(x.rev)}</b><small class="muted"> bu dönem</small></div>
          <div class="an-w-grid"><div><b>${x.visits}</b><small>dönem ziyaret</small></div><div><b>${x.total_visits}</b><small>toplam ziyaret</small></div><div><b>${anN(x.points_balance).toLocaleString('tr-TR')}</b><small>puan</small></div>
            <div style="grid-column:span 2;"><b title="${escapeAttr(x.top_product || '')}">❤️ ${escapeHtml(x.top_product || '—')}</b><small>en sevdiği ürün</small></div><div><b>${money(x.total_spent)}</b><small>ömür boyu</small></div></div>
          <div class="an-w-more">Detaylı kart için dokunun ›</div></div>`; }).join('')}</div>` : '<p class="muted">Bu dönemde kayıtlı müşteriye satış yok. Ödemede müşteri seçildiğinde burada görünür.</p>'}
    </div>`;
}

/* ---------- Büyük detay kartları (personel / müşteri) ---------- */
function anModal(html, accent){
  const old = document.getElementById('anModal'); if(old) old.remove();
  const bg = document.createElement('div'); bg.id = 'anModal'; bg.className = 'dg-bg';
  bg.innerHTML = `<div class="an-modal" style="--t:${accent || 'var(--c1)'};"><button type="button" class="dg-x" ${act('closeAnModal')} title="Kapat">✕</button>${html}</div>`;
  bg.addEventListener('click', e => { if(e.target === bg) closeAnModal(); });
  document.body.appendChild(bg);
}
function closeAnModal(){ const m = document.getElementById('anModal'); if(m) m.remove(); }
function anMiniBars(list, labelFn, valFn, color, fmt){
  const max = Math.max(1, ...list.map(valFn));
  return `<div class="an-bars an-bars-sm">${list.map((x, i) => `<div class="an-bar" style="--i:${i};" title="${escapeAttr(labelFn(x) + ' · ' + (fmt ? fmt(valFn(x)) : valFn(x)))}"><span class="an-bar-v">${valFn(x) ? (fmt ? fmt(valFn(x)) : valFn(x)) : ''}</span><i style="height:${Math.max(3, valFn(x) / max * 100)}%;${color ? 'background:linear-gradient(180deg,' + color + ',' + color + '33);' : ''}"></i><small>${labelFn(x)}</small></div>`).join('')}</div>`;
}
const AN_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
async function openStaffDetail(id){
  const session = getSession();
  const { data: d, error } = await withLoadingOverlay(sb.rpc('get_staff_detail', { p_token: session.session_token, p_user: id, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error){ alert(error.message); return; }
  const sl = d.sales || {}, sh = d.shifts || {};
  const hrs = anN(sh.minutes) / 60, perHour = hrs ? anN(sl.rev) / hrs : 0;
  const hours = []; const hm = {}; (d.hours || []).forEach(h => { hm[h.h] = anN(h.qty); });
  const hk = Object.keys(hm).map(Number); if(hk.length) for(let h = Math.min(...hk); h <= Math.max(...hk); h++) hours.push({ h, q: hm[h] || 0 });
  anModal(`<div class="an-m-head">${avatarHtml(d.user.username)}<div><h2>${escapeHtml(d.user.username)}</h2><small>${escapeHtml(reportDateRangeLabel())} · personel performans kartı</small></div></div>
    <div class="an-m-kpis">
      ${[['💰', 'Ciro', money(sl.rev)], ['🧾', 'Hesap', sl.n || 0], ['📊', 'Ort. hesap', money(sl.n ? sl.rev / sl.n : 0)], ['💸', 'Bahşiş', money(sl.tips)],
         ['🕒', 'Vardiya', (sh.n || 0) + ' vardiya'], ['📅', 'Çalıştığı gün', (sh.days || 0) + ' gün'], ['⏱', 'Çalışma süresi', Math.floor(hrs) + ' sa ' + Math.round((hrs % 1) * 60) + ' dk'], ['⚡', 'Saatlik ciro', money(perHour)]]
        .map(([ic, l, v], i) => `<div class="an-m-k" style="--i:${i};"><span>${ic}</span><small>${l}</small><b>${v}</b></div>`).join('')}
    </div>
    <div class="an-m-grid">
      <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>🍽️</i>En Çok Sattığı Ürünler</h3>${(d.products || []).length ? raceHtml(d.products.map(x => ({ label: x.name, value: anN(x.qty), display: x.qty + ' adet', side: money(x.rev) }))) : '<p class="muted">Ürün yok.</p>'}</div>
      <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>📈</i>Günlük Ciro</h3>${(d.daily || []).length ? anMiniBars(d.daily, x => new Date(x.d + 'T12:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), x => anN(x.rev), 'var(--c2)', shortMoney) : '<p class="muted">Satış yok.</p>'}</div>
      <div class="fs-panel pa-sec" style="--t:#f97316;"><h3><i>⏰</i>Saatlere Göre Girdiği Ürün</h3>${hours.length ? anMiniBars(hours, x => String(x.h).padStart(2, '0'), x => x.q, '#f97316') : '<p class="muted">Veri yok.</p>'}</div>
      <div class="fs-panel pa-sec" style="--t:#06b6d4;"><h3><i>💳</i>Ödeme Dağılımı</h3>${anN(sl.cash) + anN(sl.card) ? svgDonut([{ label: 'Nakit', value: anN(sl.cash), color: '#22c55e' }, { label: 'Kart', value: anN(sl.card), color: '#3b82f6' }], { center: shortMoney(anN(sl.cash) + anN(sl.card)), sub: '₺', money: true }) : '<p class="muted">Ödeme yok.</p>'}</div>
      <div class="fs-panel pa-sec" style="--t:#22c55e;"><h3><i>🪑</i>En Çok Kazandırdığı Masalar</h3>${(d.tables || []).length ? raceHtml(d.tables.map(x => ({ label: x.table_name, value: anN(x.rev), display: money(x.rev), side: x.n + ' hesap' }))) : '<p class="muted">Masa yok.</p>'}
        ${sl.avg_min ? `<p class="fs-note">⏱ Masalarında ortalama oturma: <b>${sl.avg_min} dk</b> · İndirim verdiği: <b>${money(sl.discount)}</b></p>` : ''}</div>
      <div class="fs-panel pa-sec" style="--t:#ef4444;"><h3><i>❌</i>Son İptaller</h3>${(d.cancels || []).length ? `<div class="cx-list">${d.cancels.map(x => `<div class="cx-row"><span class="cx-q">${x.qty}×</span><div class="cx-n"><b>${escapeHtml(x.name)}</b><small>${new Date(x.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></div></div>`).join('')}</div>` : '<p class="muted">İptal yok 👍</p>'}</div>
    </div>`, 'var(--c1)');
}
async function openCustomerDetail(id){
  const session = getSession();
  const { data: d, error } = await withLoadingOverlay(sb.rpc('get_customer_detail', { p_token: session.session_token, p_customer: id }));
  if(error){ alert(error.message); return; }
  const c = d.customer || {}, st = d.stats || {};
  const dows = AN_DAYS.map((n, i) => ({ n, v: anN(((d.dows || []).find(x => x.dow === i + 1) || {}).n) }));
  const hm = {}; (d.hours || []).forEach(h => { hm[h.h] = anN(h.n); }); const hk = Object.keys(hm).map(Number); const hours = [];
  if(hk.length) for(let h = Math.min(...hk); h <= Math.max(...hk); h++) hours.push({ h, v: hm[h] || 0 });
  const favDay = dows.reduce((a, b) => b.v > a.v ? b : a, dows[0]);
  const favHour = hours.length ? hours.reduce((a, b) => b.v > a.v ? b : a) : null;
  const dt = (x) => x ? new Date(x).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  anModal(`<div class="an-m-head">${avatarHtml(c.name)}<div><h2>${escapeHtml(c.name)}</h2><small>${c.phone ? phoneHtml(c.phone) : ''}${c.email ? ' · ' + emailHtml(c.email) : ''}${c.birthday ? ' · 🎂 ' + new Date(c.birthday + 'T12:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : ''}</small></div></div>
    <div class="an-m-kpis">
      ${[['🔁', 'Ziyaret', st.n || 0], ['💰', 'Toplam harcama', money(st.rev)], ['📊', 'Ort. hesap', money(st.avg)], ['⭐', 'Puan', anN(c.points).toLocaleString('tr-TR')],
         ['💸', 'Bıraktığı bahşiş', money(st.tips)], ['🗓️', 'En sevdiği gün', favDay && favDay.v ? favDay.n : '—'], ['⏰', 'Genelde geldiği saat', favHour ? String(favHour.h).padStart(2, '0') + ':00' : '—'], ['🕒', 'Son ziyaret', st.last ? Math.round((Date.now() - new Date(st.last).getTime()) / 86400000) + ' gün önce' : '—']]
        .map(([ic, l, v], i) => `<div class="an-m-k" style="--i:${i};"><span>${ic}</span><small>${l}</small><b>${v}</b></div>`).join('')}
    </div>
    <div class="an-m-grid">
      <div class="fs-panel pa-sec" style="--t:#ef4444;"><h3><i>❤️</i>En Çok Seçtiği Ürünler</h3>${(d.products || []).length ? raceHtml(d.products.map(x => ({ label: x.name, value: anN(x.qty), display: x.qty + ' kez', side: money(x.rev) }))) : '<p class="muted">Ürün kaydı yok.</p>'}</div>
      <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🗓️</i>Haftanın Günleri</h3>${anMiniBars(dows, x => x.n, x => x.v, 'var(--c2)')}</div>
      <div class="fs-panel pa-sec" style="--t:#f97316;"><h3><i>⏰</i>Geliş Saatleri</h3>${hours.length ? anMiniBars(hours, x => String(x.h).padStart(2, '0'), x => x.v, '#f97316') : '<p class="muted">Veri yok.</p>'}</div>
      <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>🧾</i>Son Ziyaretler</h3>${(d.visits || []).length ? `<div class="an-tl">${d.visits.map(v => `<div class="an-tl-i"><i></i><div><b>${new Date(v.closed_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${v.table_name ? ' · ' + escapeHtml(v.table_name) : ''}</b><small>${escapeHtml(v.items || '')}</small></div><span>${money(v.total)}</span></div>`).join('')}</div>` : '<p class="muted">Ziyaret yok.</p>'}</div>
    </div>
    <p class="fs-note">İlk ziyaret: <b>${dt(st.first)}</b> · Kayıt: <b>${dt(c.created_at)}</b> · Kazandığı puan: <b>${anN(st.points_earned).toLocaleString('tr-TR')}</b> · Kullandığı: <b>${anN(st.points_redeemed).toLocaleString('tr-TR')}</b>${c.notes ? ' · 📝 ' + escapeHtml(c.notes) : ''}</p>`, '#f59e0b');
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

/* ---------- 🛵 SATIŞ KANALLARI ve ⚡ HİZMET HIZI ---------- */
async function anChannelSpeed(session){
  const key = APP.reportDate + '|' + APP.reportDateTo;
  if(APP.csCache && APP.csCache.key === key && Date.now() - APP.csCache.at < 60000) return APP.csCache.data;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_channel_speed_report', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo || null }));
  if(error) throw error;
  APP.csCache = { key, at: Date.now(), data };
  return data;
}
const CH_META = { table:['🍽️','Masa','var(--c1)'], waitlist:['⏳','Bekleme listesi','var(--c3)'], delivery:['🛵','Paket (teslimat)','var(--c2)'], pickup:['🥡','Gel-Al','#f59e0b'], online:['🌐','Online sipariş','#22c55e'] };
async function renderChannelsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anChannelSpeed(session); } catch(e){ return anErr(el, e); }
  const ch = d.channels || [], tot = ch.reduce((t, x) => t + anN(x.rev), 0), totN = ch.reduce((t, x) => t + anN(x.n), 0);
  anSetExport('satis-kanallari', ['Kanal', 'Hesap', 'Ciro', 'Ortalama sepet', 'Pay %'], ch.map(x => [(CH_META[x.ch] || [,x.ch])[1], x.n, x.rev, x.avg, tot ? (anN(x.rev) / tot * 100).toFixed(1) : 0]));
  if(!ch.length){ el.innerHTML = '<div class="empty-state"><div style="font-size:42px;">🛵</div><p class="muted">Bu aralıkta kapanan hesap yok.</p></div>'; return; }
  // Saatlik dağılım: her saat için kanallara göre yığılmış çubuk.
  const hours = d.hours || [], byH = {}; hours.forEach(x => { (byH[x.h] = byH[x.h] || {})[x.ch] = anN(x.rev); });
  const hs = Object.keys(byH).map(Number); const h0 = Math.min(...hs), h1 = Math.max(...hs);
  const maxH = Math.max(1, ...Object.values(byH).map(o => Object.values(o).reduce((a, b) => a + b, 0)));
  const order = ch.map(x => x.ch);
  const bars = []; for(let h = h0; h <= h1; h++){ const o = byH[h] || {}, sum = Object.values(o).reduce((a, b) => a + b, 0);
    bars.push(`<div class="cs-hbar" title="${String(h).padStart(2,'0')}:00 · ${money(sum)}"><div class="cs-hstack" style="height:${(sum / maxH * 100).toFixed(1)}%;">${order.filter(c => o[c]).map(c => `<i style="flex:${o[c]};background:${(CH_META[c] || [,,'var(--muted)'])[2]};" title="${(CH_META[c]||[,c])[1]} · ${money(o[c])}"></i>`).join('')}</div><small>${String(h).padStart(2,'0')}</small></div>`); }
  el.innerHTML = `
    <div class="an-kpis">
      ${ch.map(x => { const m = CH_META[x.ch] || ['•', x.ch, 'var(--c1)']; return anKpi(m[0], m[1], money(x.rev), `${x.n} hesap · ort. ${money(x.avg)}`, tot ? `<span class="an-d up">%${Math.round(anN(x.rev) / tot * 100)}</span>` : '', '', m[2]); }).join('')}
    </div>
    <div class="fs-panel pa-sec" style="--t:var(--c1);">
      <h3><i>📊</i>Kanal payları</h3>
      <div class="cs-share">${ch.map(x => `<i style="flex:${anN(x.rev)};background:${(CH_META[x.ch]||[,,'var(--muted)'])[2]};" title="${(CH_META[x.ch]||[,x.ch])[1]} · %${(anN(x.rev) / tot * 100).toFixed(1)}"></i>`).join('')}</div>
      <div class="an-legend">${ch.map(x => `<span><i style="background:${(CH_META[x.ch]||[,,'var(--muted)'])[2]};"></i>${(CH_META[x.ch]||[,x.ch])[1]} · %${(anN(x.rev) / tot * 100).toFixed(1)} · ${Math.round(anN(x.n) / totN * 100)}% hesap</span>`).join('')}</div>
    </div>
    <div class="fs-panel pa-sec" style="--t:var(--c2);">
      <h3><i>🕐</i>Saatlere göre kanal cirosu</h3>
      <div class="cs-hours">${bars.join('')}</div>
      <p class="fs-note">Çubuğun üzerine gelince saat ve kanal tutarı görünür. Paket ve gel-al yoğunluğuna göre kurye ve personel planlayabilirsiniz.</p>
    </div>`;
}
async function renderSpeedContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  let d; try { d = await anChannelSpeed(session); } catch(e){ return anErr(el, e); }
  const k = d.kitchen || {}, pk = d.pickup || {}, calls = d.calls || [], st = d.stations || [], slow = d.slow || [];
  const call = (kind) => calls.find(c => c.kind === kind) || {};
  const lateP = anN(k.n) ? Math.round(anN(k.late) / anN(k.n) * 100) : 0;
  anSetExport('hizmet-hizi', ['İstasyon', 'Ürün', 'Ort. dk', '%90 dk', '20 dk üstü'], st.map(x => [x.station, x.n, x.avg, x.p90, x.late]));
  const maxSt = Math.max(1, ...st.map(x => anN(x.p90)));
  const maxSl = Math.max(1, ...slow.map(x => anN(x.avg)));
  el.innerHTML = `
    <div class="an-kpis">
      ${anKpi('🍳', 'Ort. hazırlama', (k.avg ?? '—') + ' dk', `${k.n || 0} ürün`, '', '', 'var(--c1)')}
      ${anKpi('⏰', '20 dk üstü', '%' + lateP, `${k.late || 0} ürün geç hazırlandı`, '', '', lateP > 25 ? '#ef4444' : '#f59e0b')}
      ${anKpi('🙋', 'Garson çağrısı yanıtı', call('order').avg != null ? call('order').avg + ' dk' : '—', `${call('order').n || 0} çağrı`, '', '', 'var(--c2)')}
      ${anKpi('💳', 'Hesap isteği yanıtı', call('payment').avg != null ? call('payment').avg + ' dk' : '—', `${call('payment').n || 0} istek`, '', '', 'var(--c3)')}
      ${anKpi('🥡', 'Gel-al zamanında hazır', anN(pk.n) ? '%' + Math.round(anN(pk.on_time) / anN(pk.n) * 100) : '—', anN(pk.n) ? `${pk.on_time}/${pk.n} sipariş` : 'süre girilmiş gel-al yok', '', '', '#22c55e')}
    </div>
    <div class="ch-row">
      <div class="fs-panel pa-sec" style="--t:var(--c1);flex:1;">
        <h3><i>🏭</i>İstasyonlara göre hazırlama</h3>
        ${st.length ? st.map(x => `<div class="cs-row"><span class="cs-lbl">${escapeHtml(x.icon || '🍳')} ${escapeHtml(x.station)}<small>${x.n} ürün · ${x.late} geç</small></span>
          <span class="cs-track"><i class="cs-avg" style="width:${(anN(x.avg) / maxSt * 100).toFixed(1)}%;"></i><i class="cs-p90" style="left:${(anN(x.p90) / maxSt * 100).toFixed(1)}%;" title="Siparişlerin %90'ı bu sürede hazır"></i></span>
          <b>${x.avg} dk</b></div>`).join('') + '<p class="fs-note">Çubuk ortalama süre; ince çizgi siparişlerin %90\'ının hazır olduğu süre.</p>' : '<p class="muted">Veri yok.</p>'}
      </div>
      <div class="fs-panel pa-sec" style="--t:#ef4444;flex:1;">
        <h3><i>🐢</i>En yavaş hazırlanan ürünler</h3>
        ${slow.length ? slow.map(x => `<div class="cs-row"><span class="cs-lbl">${escapeHtml(x.name)}<small>${x.n} kez</small></span><span class="cs-track"><i class="cs-avg" style="width:${(anN(x.avg) / maxSl * 100).toFixed(1)}%;background:${anN(x.avg) > 20 ? '#ef4444' : 'var(--c2)'};"></i></span><b>${x.avg} dk</b></div>`).join('') : '<p class="muted">Veri yok.</p>'}
      </div>
    </div>`;
}

/* ---------- 💼 PUANTAJ & PRİM ----------
   Vardiya kayıtlarından çalışılan saat (mola düşülmüş), saatlik ücretle maaş; personelin
   ödemesini aldığı hesapların cirosundan prim. Bordro yerine geçmez, ön hesap içindir. */
async function renderPayrollContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_payroll', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error) return anErr(el, error);
  const rows = (data || []).filter(r => r.is_active !== false || anN(r.hours) || anN(r.sales)).map(r => {
    const wage = anN(r.hours) * anN(r.hourly_wage), prim = anN(r.sales) * anN(r.commission_pct) / 100;
    return Object.assign({}, r, { wage, prim, total: wage + prim });
  });
  APP.payrollRows = rows;
  const sum = (k) => rows.reduce((x, r) => x + anN(r[k]), 0);
  const h = (v) => { const m = Math.round(anN(v) * 60); return Math.floor(m / 60) + ' sa ' + String(m % 60).padStart(2, '0') + ' dk'; };
  anSetExport('puantaj-prim', ['Personel', 'Vardiya', 'Çalışma (saat)', 'Saatlik ücret', 'Maaş', 'Satış', 'Prim %', 'Prim', 'Bahşiş', 'Toplam (maaş+prim)'],
    rows.map(r => [r.username, r.shifts, anN(r.hours).toFixed(2), anN(r.hourly_wage), r.wage.toFixed(2), anN(r.sales).toFixed(2), anN(r.commission_pct), r.prim.toFixed(2), anN(r.tips).toFixed(2), r.total.toFixed(2)]));
  el.innerHTML = `${statChips([['⏱', h(sum('hours')), 'Toplam çalışma', 'var(--c1)'], ['💵', money(sum('wage')), 'Saatlik ücret toplamı', 'var(--c2)'], ['🎯', money(sum('prim')), 'Prim toplamı', 'var(--c3)'], ['💼', money(sum('total')), 'Ödenecek (maaş + prim)', 'var(--c4)']], '', 'pay')}
    <div class="fs-panel pa-sec" style="--t:var(--c4);">
      <h3><i>💼</i>Puantaj & Prim <span class="muted" style="font-weight:500;font-size:12px;margin-left:6px;">${escapeHtml(reportDateRangeLabel())}</span></h3>
      <p class="muted" style="text-align:left;font-size:12.5px;margin:0 0 12px;">Çalışma süresi onaylı vardiyalardan, molalar düşülerek hesaplanır. Prim, personelin ödemesini aldığı hesapların cirosu üzerinden. Ücret ve prim oranını satırdan girip <b>Kaydet</b>'e basın. Bordro yerine geçmez.</p>
      ${rows.length ? `<div class="pr-wrap"><table class="pr-tbl"><thead><tr><th>Personel</th><th>Çalışma</th><th>Saatlik ücret</th><th>Maaş</th><th>Satış</th><th>Prim %</th><th>Prim</th><th>Toplam</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr data-uid="${r.id}">
          <td data-l="Personel"><div class="pr-who">${avatarHtml(r.username)}<div><b>${escapeHtml(r.username)}</b><small>${r.shifts} vardiya · ${r.checks} hesap${anN(r.tips) ? ' · ' + money(r.tips) + ' bahşiş' : ''}</small></div></div></td>
          <td data-l="Çalışma">${h(r.hours)}</td>
          <td data-l="Saatlik ücret"><input class="pr-in pr-wage" type="number" min="0" step="0.5" value="${anN(r.hourly_wage) || ''}" placeholder="₺/saat"></td>
          <td data-l="Maaş"><b>${money(r.wage)}</b></td>
          <td data-l="Satış">${money(r.sales)}</td>
          <td data-l="Prim %"><input class="pr-in pr-pct" type="number" min="0" max="50" step="0.5" value="${anN(r.commission_pct) || ''}" placeholder="%"></td>
          <td data-l="Prim"><b>${money(r.prim)}</b></td>
          <td data-l="Toplam"><b class="pr-total">${money(r.total)}</b></td>
          <td><button type="button" class="pc-btn pc-edit" ${act('saveStaffPay', r.id, '$this')}>💾 Kaydet</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><div style="font-size:42px;">💼</div><p class="muted">Bu tarihlerde personel kaydı yok.</p></div>'}
    </div>`;
}
async function saveStaffPay(userId, btn){
  const tr = btn.closest('tr');
  const wage = Number(tr.querySelector('.pr-wage').value) || 0, pct = Number(tr.querySelector('.pr-pct').value) || 0;
  const { error } = await sb.rpc('set_staff_pay', { p_token: getSession().session_token, p_user_id: userId, p_hourly_wage: wage, p_commission_pct: pct });
  if(error){ alert(error.message); return; }
  showToast('Ücret ve prim kaydedildi ✓');
  renderPayrollContent(getSession());
}
