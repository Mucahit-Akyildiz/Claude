/* POS - Mutfak ekranı. Eski pos-core.js'ten bölündü; klasik <script src>, globaller
   paylaşılır ve dosyalar index.html'deki sırayla yüklenir (sıra önemli). */
/* ================= MUTFAK ================= */
async function openKitchenView(){ APP.view='kitchen'; APP.kitchenStation=null; render(); }
async function renderKitchenView(main, session){
  if(!APP.config){
    const { data } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token }));
    APP.config = data;
  }
  if(!APP.kitchenStation){
    stopKitchenPolling();
    main.innerHTML = `<h1>Mutfak Ekranı</h1><p class="muted">İstasyon seçin</p><div class="home-grid">` +
      APP.config.stations.map(s => `<div class="card" data-station-card="${s.id}" style="position:relative;border-left:4px solid ${s.color}" ${act('pickKitchenStation', s.id)}><div class="icon">${escapeHtml(s.icon||'🍳')}</div><h3>${escapeHtml(s.name)}</h3></div>`).join('') +
      `</div>`;
    return;
  }
  const station = APP.config.stations.find(s => s.id===APP.kitchenStation);
  main.innerHTML = `<div style="display:flex;justify-content:space-between;"><h1>${escapeHtml(station.icon||"🍳")} ${escapeHtml(station.name)}</h1>
    <div style="display:flex;gap:8px;align-items:flex-start;">
      <button class="ghost-btn" style="color:var(--red);" ${act('openManualWasteModal')} title="Siparişe bağlı olmayan israf (yanan, düşen, bozulan ürün)">🔥 İsraf Gir</button>
      <button class="ghost-btn" ${act('clearKitchenStation')}>İstasyon Değiştir</button>
    </div></div>
    <div id="kitchenWrap"></div>`;
  APP.kitchenSeenItemIds = null; // yeni istasyona gecince onceki urunler icin zil calmasin
  APP.kitchenLateWarned = new Set();
  await refreshKitchenItems(session);
  startKitchenPolling(session);
}
async function refreshKitchenItems(session){
  const [{ data, error }, cancRes] = await Promise.all([
    sb.rpc('get_live_orders', { p_token: session.session_token }),
    sb.rpc('list_kitchen_cancellations', { p_token: session.session_token })
  ]);
  const wrap = document.getElementById('kitchenWrap'); if(!wrap) return;
  if(error){ wrap.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  APP.liveOrders = data || [];
  const cards = [];
  APP.kitchenPendingByTable = {};
  const currentIds = new Set();
  // Yazicinin fiziksel olarak bu istasyonun kendi bilgisayarina bagli olabilmesi
  // (mutfak icin ayri bilgisayar, cayhane icin ayri bilgisayar gibi) nedeniyle fis
  // yazdirma artik siparis onaylanirken degil, burada - o istasyonun kendi ekraninda
  // yeni bir urun ilk kez gorundugunde - tetikleniyor (WebUSB sadece ayni cihaza
  // fiziksel olarak bagli yaziciya erisebilir).
  const isFirstLoad = !APP.kitchenSeenItemIds;
  const newItemsByTable = {};
  APP.liveOrders.forEach(o => {
    // Sadece bu istasyona ait ve henuz hazirlanmamis urunler - her siparisin bu
    // istasyona dusen urunleri tek bir kartta gruplanmis olarak gorunur. Kartlar
    // order_id ile anahtarlanir (table_id Paket Servis siparislerinde null/ortak
    // oldugu icin table_id kullanmak birden fazla paket siparisini karistirirdi).
    // station_id atanmamis (null) urunler hicbir ekranda kaybolmasin diye her istasyonda gosterilir.
    const pending = o.items.filter(i => i.status==='pending' && (i.station_id===APP.kitchenStation || i.station_id==null));
    if(pending.length===0) return;
    pending.forEach(it => currentIds.add(it.id));
    const tableName = orderDisplayName(o);
    APP.kitchenPendingByTable[o.order_id] = { tableName, items: pending, dailyNumber: o.daily_number, pkg: pkgInfoFromOrder(o) };
    if(!isFirstLoad){
      const freshItems = pending.filter(it => !APP.kitchenSeenItemIds.has(it.id));
      if(freshItems.length>0) newItemsByTable[o.order_id] = { tableName, dailyNumber: o.daily_number, items: freshItems, pkg: pkgInfoFromOrder(o) };
    }
    // En uzun bekleyen sipariş önce: kart, içindeki en eski bekleyen ürünün zamanına göre sıralanır.
    const oldest = Math.min(...pending.map(it => it.added_at ? new Date(it.added_at).getTime() : Infinity));
    cards.push({ at: isFinite(oldest) ? oldest : Infinity, html: `<div class="kitchen-card" data-order-id="${o.order_id}">
      <div class="kc-age"><i data-age-from="${isFinite(oldest) ? new Date(oldest).toISOString() : ''}"></i></div>
      <div class="kc-head">
        <div class="kc-title"><b>${escapeHtml(tableName)}</b>${o.daily_number ? `<span class="kc-no">#${o.daily_number}</span>` : ''}</div>
        <span class="kc-pill"></span>
        <button type="button" class="kc-print" ${act('reprintKitchenTicket', o.order_id)} title="Fişi tekrar yazdır">🖨️</button>
      </div>
      <div class="kc-meta">${orderWaiters(o).length ? '<span>👤 ' + escapeHtml(orderWaiters(o).join(', ')) + '</span>' : ''}<span class="kc-since"></span><span class="kc-late-badge">⏰ GECİKTİ</span></div>
      ${waitlistInfoHtml(o)}
      <div class="kc-items">
      ${kitchenGroupExtras(pending).map(({ it, extras }) => `<div class="kitchen-item-row kc-item">
        <span class="kc-qty">${it.qty}</span>
        <div class="kc-iname"><span class="kitchen-item-name">${escapeHtml(it.name)}</span>
          ${extras.length ? `<div class="kc-extras">${extras.map(x => `<span>+ ${x.qty}× ${escapeHtml(kitchenExtraName(x))}</span>`).join('')}</div>` : ''}
          ${it.note ? `<div class="kc-note">📝 ${escapeHtml(it.note)}</div>` : ''}</div>
        <span class="kc-ctrl"><span class="kitchen-timer kc-timer" data-added="${it.added_at||''}" data-id="${it.id}" data-name="${escapeAttr(tableName+' - '+it.qty+'x '+it.name)}">-</span>
        <button type="button" class="kc-waste" ${act('openWasteModal', it.id)} title="İsraf oldu (yandı/düştü/bozuldu)">🔥</button>
        <button type="button" class="kc-ok" ${act('markReadyGroup', [it.id, ...extras.map(x => x.id)].join(','))} title="Hazır">✓</button></span>
      </div>`).join('')}
      </div>
      <button type="button" class="kc-all" ${act('markAllReady', o.order_id)}>✅ Hepsi Hazır</button>
      </div>` });
  });
  cards.sort((x, y) => x.at - y.at);
  const cancelCards = kitchenCancelCards((cancRes && cancRes.data) || []);
  // align-items:start: her kart kendi içeriği kadar uzar (sıradaki en uzun karta göre esneyip boş alan bırakmaz).
  // Kanban: kartlar en eski bekleyen ürünün süresine göre Yeni / Bekliyor / Gecikti sütunlarında.
  const nowMs = Date.now();
  const age = (c) => isFinite(c.at) ? (nowMs - c.at) / 60000 : 0;
  const cols = [
    { k:'new', t:'🟢 Yeni', sub:'0–10 dk', list: cards.filter(c => age(c) < 10) },
    { k:'warn', t:'🟡 Bekliyor', sub:'10–20 dk', list: cards.filter(c => age(c) >= 10 && age(c) < 20) },
    { k:'late', t:'🔴 Gecikti', sub:'20 dk +', list: cards.filter(c => age(c) >= 20) },
  ];
  const itemsCount = Object.values(APP.kitchenPendingByTable).reduce((t, e) => t + e.items.reduce((x, i) => x + (Number(i.qty)||1), 0), 0);
  const avg = cards.length ? Math.round(cards.reduce((t, c) => t + age(c), 0) / cards.length) : 0;
  const stats = `<div class="kb-stats"><div><b>${cards.length}</b><small>sipariş</small></div><div><b>${itemsCount}</b><small>bekleyen ürün</small></div><div><b>${avg} dk</b><small>ort. bekleme</small></div><div class="${cols[2].list.length ? 'bad' : ''}"><b>${cols[2].list.length}</b><small>geciken</small></div></div>`;
  wrap.innerHTML = stats + `<div class="kb-legend"><span class="lg-new">🟢 Yeni 0–10 dk</span><span class="lg-warn">🟡 Bekliyor 10–20 dk</span><span class="lg-late">🔴 Gecikti 20 dk +</span><small>En eski sipariş en başta · kartlar yerinde renk değiştirir</small></div>`
    + (cards.length || cancelCards ? `<div class="kb-grid">${cancelCards}${cards.map(c => c.html).join('')}</div>` : '<div class="kb-none">🎉 Bekleyen sipariş yok</div>');
  updateKitchenTimers();

  // Daha once gorulmemis (yeni gelen) urun varsa zil calsin ve fisini bu istasyonun
  // kendi yazicisina yazdir. Ilk yuklemede (isFirstLoad) hicbiri tetiklenmez.
  const hasNew = Object.keys(newItemsByTable).length>0;
  if(hasNew){
    playKitchenBell(APP.kitchenStation);
    Object.values(newItemsByTable).forEach(entry => {
      // Bu cihazda sipariş verilirken zaten basılan ürünler tekrar basılmaz.
      const printed = APP.locallyPrintedItemIds || new Set();
      const toPrint = entry.items.filter(it => !printed.has(it.id));
      if(!toPrint.length) return;
      printKitchenTicketGrouped(entry.tableName, toPrint, true, entry.dailyNumber, entry.pkg)
        .catch(e => { console.error('Fiş yazdırma hatası:', e); showToast('⚠️ Fiş yazdırılırken beklenmeyen bir hata oluştu'); });
    });
  }
  APP.kitchenSeenItemIds = currentIds;
  updateKitchenTimers();
}
/* İptal edilen siparişler: bu istasyona ait iptaller 15 sn boyunca üstü çizili
   "İPTAL EDİLDİ" kartı olarak görünür ve bir kez istasyonun yazıcısına iptal fişi basılır. */
const KITCHEN_CANCEL_SHOW_MS = 15000;
function kitchenCancelCards(rows){
  rows = rows.filter(r => r.station_id===APP.kitchenStation || r.station_id==null);
  if(!APP.kitchenCancelSeen){ APP.kitchenCancelSeen = new Set(rows.map(r => r.id)); }
  const fresh = rows.filter(r => !APP.kitchenCancelSeen.has(r.id));
  fresh.forEach(r => APP.kitchenCancelSeen.add(r.id));
  if(fresh.length){
    playKitchenBell(APP.kitchenStation);
    const byOrder = {};
    fresh.forEach(r => { (byOrder[r.order_id] = byOrder[r.order_id] || []).push(r); });
    Object.values(byOrder).forEach(list => {
      const items = list.map(r => ({ product_id: r.product_id, station_id: r.station_id, name: '❌ İPTAL: ' + r.name, qty: r.qty, note: r.note }));
      printKitchenTicketGrouped('❌ İPTAL · ' + (list[0].table_name || ''), items, true, list[0].daily_number)
        .catch(e => console.error('İptal fişi yazdırılamadı:', e));
    });
  }
  const now = Date.now();
  const visible = rows.filter(r => now - new Date(r.created_at).getTime() < KITCHEN_CANCEL_SHOW_MS);
  const groups = {};
  visible.forEach(r => { (groups[r.order_id] = groups[r.order_id] || []).push(r); });
  return Object.values(groups).map(list => `<div class="kitchen-card kc-cancel">
      <div class="kc-cancel-x" aria-hidden="true"></div>
      <div class="kc-head"><div class="kc-title"><b>${escapeHtml(list[0].table_name || '')}</b>${list[0].daily_number ? `<span class="kc-no">#${list[0].daily_number}</span>` : ''}</div><span class="kc-pill">❌ İptal</span></div>
      <div class="kc-meta">${list[0].cancelled_by ? '<span>👤 ' + escapeHtml(list[0].cancelled_by) + '</span>' : ''}<span>${new Date(list[0].created_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}</span></div>
      <div class="kc-items">${list.map(r => `<div class="kitchen-item-row kc-item"><span class="kc-qty">${r.qty}</span><div class="kc-iname"><span class="kitchen-item-name">${escapeHtml(r.name)}</span></div></div>`).join('')}</div>
      <div class="kc-cancel-stamp">SİPARİŞ İPTAL EDİLDİ</div>
    </div>`).join('');
}
// Aynı adlı masa başka bölgede de varsa bölge adıyla gösterilir (Bahçe · Masa1).
function tableNameForId(tableId){
  const zones = APP.config.zones || [];
  for(const z of zones){
    const t = z.tables.find(t=>t.id===tableId);
    if(!t) continue;
    const key = String(t.name).trim().toLocaleLowerCase('tr');
    const dup = zones.some(z2 => z2.id !== z.id && z2.tables.some(x => String(x.name).trim().toLocaleLowerCase('tr') === key));
    return dup ? z.name + ' · ' + t.name : t.name;
  }
  return 'Masa';
}
/* Bekleme listesinden gelen sipariş: etiket + kişi sayısı + (süre verildiyse) tahmini oturma saati. */
function waitlistInfoHtml(o){
  if(!o.waitlist_id) return '';
  const w = o.waitlist || {};
  let eta = '';
  if(w.quoted_wait_minutes && w.joined_at){
    const t = new Date(new Date(w.joined_at).getTime() + w.quoted_wait_minutes * 60000);
    const left = Math.round((t - Date.now()) / 60000);
    eta = ' · 🪑 tahmini oturma ' + t.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) + (left > 0 ? ' (' + left + ' dk kaldı)' : ' (süre doldu)');
  }
  return `<div class="kc-wl">⏳ Bekleme listesinden${w.party_size ? ' · ' + w.party_size + ' kişi' : ''}${eta}</div>`;
}
function orderDisplayName(o){
  if(o.kind==='takeaway') return '📦 Paket' + (o.customer_name ? ' - '+o.customer_name : '');
  if(o.kind==='waitlist') return '⏳ ' + (o.customer_name || 'Bekleme Listesi');
  return tableNameForId(o.table_id);
}
async function pickKitchenStation(id){ primeKitchenAudio(); APP.kitchenStation=id; render(); }

/* ---- Mutfak: canli sayac + yeni siparis zili ---- */
function stopKitchenPolling(){
  if(APP.kitchenPollInterval){ clearInterval(APP.kitchenPollInterval); APP.kitchenPollInterval=null; }
  if(APP.kitchenTimerInterval){ clearInterval(APP.kitchenTimerInterval); APP.kitchenTimerInterval=null; }
  if(APP.kitchenReminderInterval){ clearInterval(APP.kitchenReminderInterval); APP.kitchenReminderInterval=null; }
}
function startKitchenPolling(session){
  stopKitchenPolling();
  // Yeni siparisleri yakalamak icin arka planda periyodik yenileme (websocket/canli
  // abonelik kurulmadigi icin en basit ve guvenilir yontem bu).
  APP.kitchenPollInterval = setInterval(() => {
    if(APP.view==='kitchen' && APP.kitchenStation) refreshKitchenItems(session);
  }, 2000);
  APP.kitchenTimerInterval = setInterval(updateKitchenTimers, 1000);
  // 20 dakikayi gecmis, hala hazir verilmemis siparisler icin sol tarafta
  // (sag ustteki tek seferlik uyaridan ayri) her 3 dakikada bir tekrarlanan
  // hatirlatma - mutfak ekranindan uzaklasilsa/personel gozden kacirsa bile
  // gec kalmis siparisler unutulmasin diye.
  APP.kitchenReminderInterval = setInterval(checkLateOrdersReminder, 180000);
}
function updateKitchenTimers(){
  if(!APP.kitchenLateWarned) APP.kitchenLateWarned = new Set();
  // Kartın üstündeki süre çubuğu 20 dakikaya doğru dolar.
  document.querySelectorAll('.kc-age i[data-age-from]').forEach(el => {
    const f = el.dataset.ageFrom; if(!f) return;
    const mins = (Date.now() - new Date(f).getTime()) / 60000;
    el.style.width = Math.min(100, mins / 20 * 100) + '%';
    const card = el.closest('.kitchen-card'); if(!card) return;
    const st = mins >= 20 ? 'late' : mins >= 10 ? 'warn' : 'new';
    card.classList.toggle('kc-new', st==='new'); card.classList.toggle('kc-warn', st==='warn'); card.classList.toggle('kc-late', st==='late');
    const pill = card.querySelector('.kc-pill'); if(pill) pill.textContent = st==='late' ? '🔴 Gecikti' : st==='warn' ? '🟡 Bekliyor' : '🟢 Yeni';
    const since = card.querySelector('.kc-since'); if(since) since.textContent = Math.floor(mins) + ' dk önce · ' + new Date(f).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
  });
  document.querySelectorAll('.kitchen-timer[data-added]').forEach(el => {
    const added = el.dataset.added;
    if(!added){ el.textContent='-'; return; }
    const secs = Math.max(0, Math.floor((Date.now() - new Date(added).getTime())/1000));
    const mm = Math.floor(secs/60), ss = secs%60;
    el.textContent = mm + ':' + String(ss).padStart(2,'0');
    // 0-10 dk yesil (varsayilan), 10-20 dk sari, 20 dk+ kirmizi.
    el.classList.toggle('kt-warn', secs>=600 && secs<1200);
    el.classList.toggle('kt-danger', secs>=1200);
    // Urun adi da (sadece sayac degil) ayni renge boyansin diye satirin
    // kendisine de ayni durum sinifi uygulanir.
    const row = el.closest('.kitchen-item-row');
    if(row){
      row.classList.toggle('ki-warn', secs>=600 && secs<1200);
      row.classList.toggle('ki-danger', secs>=1200);
    }
    // 20 dakikayi gectiginde, urun basina bir kez sag ustte uyari mesaji
    // goster - en az 30 saniye ekranda kalsin diye suresi acikca veriliyor.
    const itemId = el.dataset.id;
    if(secs>=1200 && itemId && !APP.kitchenLateWarned.has(itemId)){
      APP.kitchenLateWarned.add(itemId);
      showToast('⏰ ' + (el.dataset.name||'Bir sipariş') + ' 20 dakikayı geçti!', 30000, null, () => goToView('kitchen'), true);
    }
  });
  // Kartin arka plani, icindeki en gec kalmis urunun rengine gore hafifce tonlanir.
  document.querySelectorAll('.kitchen-card').forEach(card => {
    const timers = card.querySelectorAll('.kitchen-timer');
    let worst = 'ok';
    timers.forEach(t => {
      if(t.classList.contains('kt-danger')) worst = 'danger';
      else if(t.classList.contains('kt-warn') && worst!=='danger') worst = 'warn';
    });
    card.classList.toggle('kc-warn', worst==='warn');
    card.classList.toggle('kc-danger', worst==='danger');
  });
}
/* Hala hazir verilmemis (20 dk+ gecikmis) urunleri sol tarafta toplu bir
   bildirimle hatirlatir - startKitchenPolling icinde 3 dakikada bir cagrilir. */
function checkLateOrdersReminder(){
  if(APP.view!=='kitchen' || !APP.kitchenStation) return;
  const names = Array.from(document.querySelectorAll('.kitchen-timer.kt-danger[data-added]'))
    .map(el => el.dataset.name)
    .filter(Boolean);
  if(names.length===0) return;
  const shown = names.slice(0,3).join(', ') + (names.length>3 ? ' ve ' + (names.length-3) + ' tane daha' : '');
  showToast('⏰ Hâlâ hazır değil: ' + shown, 30000, 'left', () => goToView('kitchen'), true);
}
let KITCHEN_AUDIO_CTX = null;
/* Tarayicilar bir kullanici tiklamasi olmadan ses calmayi engeller; istasyon secimi
   gibi gercek bir tiklama aninda AudioContext'i "kilidini acmak" icin onceden calistirilir. */
function primeKitchenAudio(){
  try{
    KITCHEN_AUDIO_CTX = KITCHEN_AUDIO_CTX || new (window.AudioContext || window.webkitAudioContext)();
    if(KITCHEN_AUDIO_CTX.state==='suspended') KITCHEN_AUDIO_CTX.resume();
  }catch(e){}
  try{ const a = new Audio(); a.volume = 0; a.play().catch(()=>{}); }catch(e){}
}
/* Tüm zil ön ayarları 3 katmanlı, ÖLÇÜLÜ bir zincirden geçer.
   ÖNEMLİ: cızırtının asıl kaynağı bu zincir değil, kaynaktaki (osilatör)
   ses seviyesiydi - her nota 3 uyumlu kısmi (partial) üst üste bindiği için
   toplam tepe genliği kazanç*1.62'ye ulaşıyordu; kazanç 1.3-1.4 iken bu,
   dijital tavanın (1.0) iki katını buluyor ve compressor'ın tepki (attack)
   süresi yetişemeden gerçek kırpılmaya yol açıyordu. Şimdi kaynak
   seviyeleri (BELL_PRESETS içindeki kazanımlar) güvenli aralığa çekildi;
   buradaki zincir sadece o temiz sinyali biraz daha yükseltip son bir
   güvenlik limiteriyle korumaya devam ediyor. */
let BELL_CHAIN = null, BELL_CHAIN_CTX = null, BELL_VOLUME_NODE = null;
/* Zil ses düzeyi (0-100, bu cihaza özel): tüm zil sesleri limiterden sonra
   bu kazanç düğümünden geçer (bkz. Bildirim Ayarları > Ses Düzeyi). */
function getBellVolume(){
  try{ const v = parseInt(localStorage.getItem('rys_bell_volume'), 10); return isNaN(v) ? 100 : Math.max(0, Math.min(100, v)); }
  catch(e){ return 100; }
}
function setBellVolume(v){
  v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  try{ localStorage.setItem('rys_bell_volume', String(v)); }catch(e){}
  if(BELL_VOLUME_NODE) BELL_VOLUME_NODE.gain.value = v / 100;
  const lbl = document.getElementById('bellVolumeLabel'); if(lbl) lbl.textContent = v === 0 ? 'Sessiz' : ('%' + v);
}
function getBellCompressor(ctx){
  if(BELL_CHAIN && BELL_CHAIN_CTX===ctx) return BELL_CHAIN;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 4;
  comp.attack.value = 0.008; comp.release.value = 0.2;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.6;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1; limiter.knee.value = 3; limiter.ratio.value = 12;
  limiter.attack.value = 0.003; limiter.release.value = 0.15;
  const volume = ctx.createGain();
  volume.gain.value = getBellVolume() / 100;
  comp.connect(makeup); makeup.connect(limiter); limiter.connect(volume); volume.connect(ctx.destination);
  BELL_CHAIN = comp; BELL_CHAIN_CTX = ctx; BELL_VOLUME_NODE = volume;
  return comp;
}
/* Tek bir "çan" notası: temel ton + iki uyumlu üst kısmi (bell partial)
   katmanlanır. Tek başına kare/testere dalga yerine bu katmanlı sinüs/üçgen
   yapısı hem daha belirgin algılanıyor hem de kulağı yormuyor. */
function scheduleBellTone(ctx, freq, t0, dur, peakGain){
  const partials = [
    {ratio:1,    gain:1.0,  type:'sine'},
    {ratio:2.01, gain:0.4,  type:'sine'},
    {ratio:2.76, gain:0.22, type:'triangle'},
  ];
  partials.forEach(p => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = p.type;
    osc.frequency.value = freq*p.ratio;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0005, peakGain*p.gain), t0+0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    osc.connect(gain); gain.connect(getBellCompressor(ctx));
    osc.start(t0); osc.stop(t0+dur+0.05);
  });
}
const BELL_PRESETS = {
  classic: { name: 'Klasik Çan', icon: '🔔', play: (ctx) => {
    [880, 1320].forEach((f,i) => scheduleBellTone(ctx, f, ctx.currentTime+i*0.18, 0.45, 0.6));
  }},
  ding_dong: { name: 'Ding Dong', icon: '🛎️', play: (ctx) => {
    scheduleBellTone(ctx, 1046, ctx.currentTime, 0.6, 0.6);
    scheduleBellTone(ctx, 784, ctx.currentTime+0.4, 0.7, 0.6);
  }},
  triple_ding: { name: 'Üçlü Ding (Dikkat Çekici)', icon: '✨', play: (ctx) => {
    [0,0.15,0.3].forEach(d => scheduleBellTone(ctx, 1568, ctx.currentTime+d, 0.22, 0.6));
  }},
  chord: { name: 'Yumuşak Akor', icon: '🎹', play: (ctx) => {
    [523.25, 659.25, 784].forEach((f,i) => scheduleBellTone(ctx, f, ctx.currentTime+i*0.05, 0.7, 0.55));
  }},
  bell_run: { name: 'Çınlama', icon: '🎐', play: (ctx) => {
    [660, 880, 1100, 1320].forEach((f,i) => scheduleBellTone(ctx, f, ctx.currentTime+i*0.09, 0.35, 0.6));
  }},
  alert: { name: 'Dikkat Zili (Acil)', icon: '🚨', play: (ctx) => {
    [0,0.22,0.44,0.66].forEach((d,i) => scheduleBellTone(ctx, i%2===0?1318:988, ctx.currentTime+d, 0.24, 0.62));
  }},
  gong: { name: 'Güçlü Gong', icon: '🥁', play: (ctx) => {
    scheduleBellTone(ctx, 130.8, ctx.currentTime, 1.3, 0.6);
    scheduleBellTone(ctx, 196, ctx.currentTime, 1.1, 0.45);
  }},
  xylophone: { name: 'Ksilofon', icon: '🎼', play: (ctx) => {
    [988, 1319, 1568, 2093].forEach((f,i) => scheduleBellTone(ctx, f, ctx.currentTime+i*0.09, 0.25, 0.6));
  }},
  fanfare: { name: 'Trompet Çağrısı', icon: '📯', play: (ctx) => {
    [523, 523, 784].forEach((f,i) => scheduleBellTone(ctx, f, ctx.currentTime+i*0.14, i===2?0.55:0.14, 0.6));
  }},
  double_knock: { name: 'Çift Vuruş', icon: '👊', play: (ctx) => {
    [0,0.25].forEach(d => scheduleBellTone(ctx, 174.6, ctx.currentTime+d, 0.22, 0.6));
  }},
  // Ek sesler: hepsi aynı yumuşak çan sentezini (scheduleBellTone) farklı melodi ve
  // tınılarla kullanır; dosya indirmeye gerek yok, her cihazda aynı ve net çalar.
  marimba: { name: 'Marimba', icon: '🪘', play: (ctx) => bellSeq(ctx, [[523,0,.3],[659,.12,.3],[784,.24,.45]]) },
  harp: { name: 'Arp', icon: '🎶', play: (ctx) => bellSeq(ctx, [[392,0,.6],[494,.07,.6],[587,.14,.6],[784,.21,.8]], .5) },
  crystal: { name: 'Kristal', icon: '💎', play: (ctx) => bellSeq(ctx, [[2093,0,.5],[2637,.1,.6]], .45) },
  wind_chime: { name: 'Rüzgar Çanı', icon: '🎐', play: (ctx) => bellSeq(ctx, [[1760,0,.7],[2217,.11,.7],[1976,.2,.7],[2637,.33,.9]], .4) },
  music_box: { name: 'Müzik Kutusu', icon: '🎁', play: (ctx) => bellSeq(ctx, [[1319,0,.35],[1568,.16,.35],[1760,.32,.35],[2093,.48,.6]], .45) },
  happy: { name: 'Neşeli', icon: '😊', play: (ctx) => bellSeq(ctx, [[784,0,.18],[988,.12,.18],[1175,.24,.18],[1568,.36,.45]]) },
  soft_pop: { name: 'Yumuşak Pop', icon: '🫧', play: (ctx) => bellSeq(ctx, [[1200,0,.12],[1600,.09,.18]], .5) },
  elevator: { name: 'Asansör Gongu', icon: '🛗', play: (ctx) => bellSeq(ctx, [[659,0,.9],[523,.45,1.1]], .5) },
  doorbell: { name: 'Kapı Zili', icon: '🚪', play: (ctx) => bellSeq(ctx, [[784,0,.5],[622,.35,.5],[784,.7,.5],[622,1.05,.7]]) },
  sparkle: { name: 'Pırıltı', icon: '🌟', play: (ctx) => bellSeq(ctx, [[1568,0,.2],[2093,.06,.2],[2637,.12,.25],[3136,.18,.4]], .4) },
  calm: { name: 'Sakin', icon: '🌙', play: (ctx) => bellSeq(ctx, [[440,0,1],[554,.2,1],[659,.4,1.2]], .45) },
  bright: { name: 'Parlak', icon: '☀️', play: (ctx) => bellSeq(ctx, [[1047,0,.3],[1319,.1,.3],[1568,.2,.5]]) },
  cash: { name: 'Kasa (Ka-ching)', icon: '💰', play: (ctx) => bellSeq(ctx, [[2349,0,.12],[2794,.08,.12],[3136,.16,.5]], .5) },
  bubble: { name: 'Baloncuk', icon: '🫧', play: (ctx) => bellSeq(ctx, [[600,0,.12],[900,.1,.12],[1300,.2,.2]], .5) },
  victory: { name: 'Zafer', icon: '🏆', play: (ctx) => bellSeq(ctx, [[523,0,.15],[659,.15,.15],[784,.3,.15],[1047,.45,.7]]) },
  zen: { name: 'Zen Kasesi', icon: '🧘', play: (ctx) => bellSeq(ctx, [[293.7,0,2.2],[440,0,1.6]], .5) },
  notify_up: { name: 'Yükselen Bildirim', icon: '⬆️', play: (ctx) => bellSeq(ctx, [[880,0,.15],[1175,.1,.25]]) },
  notify_down: { name: 'İnen Bildirim', icon: '⬇️', play: (ctx) => bellSeq(ctx, [[1175,0,.15],[880,.1,.3]]) },
};
/* Nota dizisi: [frekans, başlangıç (sn), süre (sn)] - hepsi çan tınısıyla. */
function bellSeq(ctx, notes, gain){
  const t = ctx.currentTime;
  notes.forEach(([f, d, dur]) => scheduleBellTone(ctx, f, t + d, dur, gain || 0.55));
}
function playBellPresetById(id){
  try{
    KITCHEN_AUDIO_CTX = KITCHEN_AUDIO_CTX || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = KITCHEN_AUDIO_CTX;
    if(ctx.state==='suspended') ctx.resume();
    (BELL_PRESETS[id] || BELL_PRESETS.classic).play(ctx);
  }catch(e){ console.warn('Zil sesi çalınamadı:', e); }
}
/* Yüklenen zil sesi (data: URL) <audio> yerine Web Audio ile çözülüp
   çalınır: <audio> sitenin CSP'sindeki media-src kuralına ve dosyanın MIME
   etiketine bağlı (bazı tarayıcılar .m4a/.mp3'ü boş türle kaydeder ve
   çalamaz); decodeAudioData ise dosyanın içeriğine bakar. Çözülen ses
   önbelleğe alınır ki her siparişte yeniden çözülmesin. */
const BELL_BUFFER_CACHE = {};
function dataUrlToArrayBuffer(dataUrl){
  const b64 = String(dataUrl).split(',')[1] || '';
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
async function playUploadedBell(dataUrl){
  KITCHEN_AUDIO_CTX = KITCHEN_AUDIO_CTX || new (window.AudioContext || window.webkitAudioContext)();
  const ctx = KITCHEN_AUDIO_CTX;
  if(ctx.state==='suspended') await ctx.resume();
  const key = dataUrl.length + ':' + dataUrl.slice(-64);
  let buffer = BELL_BUFFER_CACHE[key];
  if(!buffer){
    buffer = await ctx.decodeAudioData(dataUrlToArrayBuffer(dataUrl));
    BELL_BUFFER_CACHE[key] = buffer;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  // Hazır zillerle aynı ses düzeyi düğümüne bağlanır.
  getBellCompressor(ctx);
  src.connect(BELL_VOLUME_NODE);
  src.start();
}
function playKitchenBell(stationId, onError){
  const setting = resolveBellSetting(stationId);
  if(typeof setting === 'string' && setting){
    playUploadedBell(setting).catch(e => {
      console.warn('Zil sesi çalınamadı:', e);
      if(onError) onError('Yüklediğiniz ses dosyası çalınamadı (dosya bozuk ya da desteklenmeyen bir formatta olabilir). Farklı bir dosya (mp3/ogg/wav) deneyin.');
      else playBellPresetById('classic');
    });
    return;
  }
  const presetId = (setting && setting.preset) || 'classic';
  playBellPresetById(presetId);
}
/* Ekstralar (örn. + 100 gr Döner) kendi ana ürününün satırında, altında küçük satır olarak gösterilir. */
function kitchenGroupExtras(items){
  const parentOf = (it) => { const p = typeof findProductAny==='function' ? findProductAny(it.product_id) : null; return p && p.parent_id; };
  const rows = items.filter(it => !parentOf(it)).map(it => ({ it, extras: [] }));
  items.filter(it => parentOf(it)).forEach(x => {
    const host = rows.find(r => r.it.product_id === parentOf(x));
    if(host) host.extras.push(x); else rows.push({ it: x, extras: [] });
  });
  return rows;
}
function kitchenExtraName(x){ const p = findProductAny(x.product_id); return p ? p.name : String(x.name||'').replace(/^\+\s*/, ''); }
async function markReadyGroup(ids){
  const list = String(ids).split(',').filter(Boolean);
  if(list.length === 1) return markReady(list[0]);
  const session = getSession();
  APP.selfActionUntil = Date.now() + 10000;
  const res = await Promise.all(list.map(id => sb.rpc('mark_item_ready', { p_token: session.session_token, p_order_item_id: id })));
  if(res.some(r => r.error)) alert('Bazı ürünler hazır işaretlenemedi.');
  await refreshKitchenItems(session);
}
async function markReady(itemId){
  const session = getSession();
  APP.selfActionUntil = Date.now() + 10000;
  const { error } = await sb.rpc('mark_item_ready', { p_token: session.session_token, p_order_item_id: itemId });
  if(error){ alert('Hata: '+error.message); return; }
  await refreshKitchenItems(session);
}
async function markAllReady(tableId){
  const entry = APP.kitchenPendingByTable && APP.kitchenPendingByTable[tableId];
  if(!entry || entry.items.length===0) return;
  APP.selfActionUntil = Date.now() + 10000;
  const session = getSession();
  const results = await Promise.all(entry.items.map(it =>
    sb.rpc('mark_item_ready', { p_token: session.session_token, p_order_item_id: it.id })
  ));
  const failed = results.some(r => r.error);
  if(failed) alert('Bazı ürünler hazır işaretlenemedi.');
  await refreshKitchenItems(session);
}
/* ---- Mutfak: israf bildirimi (yandı/düştü/bozuldu) ----
   Bir sipariş kalemi hazırlanırken kullanılamaz hale gelirse buradan
   bildirilir: report_waste RPC'si ilgili hammaddeyi/ürün stoğunu düşer,
   maliyetini waste_log'a yazar (Finansal Analiz > İsraf'ta görünür) ve
   israf edilen miktar kadar bu kalemi küçültür/siler - müşteriden o kısım
   için ücret alınmaz. */
const WASTE_REASONS = ['Yandı', 'Düştü', 'Bozuldu', 'Diğer'];
/* Mutfak kartı item.name/qty'yi onclick string'ine gömmek yerine (bkz. güvenlik
   notu) yalnızca item.id geçiyor; buradan APP.liveOrders üzerinde bulunuyor. */
function findLiveOrderItemById(itemId){
  for(const o of (APP.liveOrders||[])){
    const it = (o.items||[]).find(i => i.id===itemId);
    if(it) return it;
  }
  return null;
}
function openWasteModal(itemId){
  const it = findLiveOrderItemById(itemId);
  if(!it) return;
  const qty = it.qty, name = it.name;
  const bg = document.createElement('div');
  bg.id = 'wasteModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) closeWasteModal(); };
  bg.innerHTML = `<div class="box" style="max-width:340px;width:100%;text-align:left;">
    <h2 style="margin-top:0;">🔥 İsraf Bildir</h2>
    <p class="muted" style="margin:0 0 12px;">${escapeHtml(name)}</p>
    <label style="display:block;font-size:12.5px;font-weight:700;color:var(--muted);">Miktar</label>
    <input id="wasteQty" type="number" min="1" max="${qty}" step="1" value="${qty}" style="margin-bottom:10px;">
    <label style="display:block;font-size:12.5px;font-weight:700;color:var(--muted);">Sebep</label>
    <select id="wasteReason" style="margin-bottom:10px;">
      ${WASTE_REASONS.map(r => `<option value="${r}">${r}</option>`).join('')}
    </select>
    <input id="wasteNote" placeholder="Ek not (opsiyonel)" style="margin-bottom:14px;">
    <div class="field-row" style="gap:8px;">
      <button type="button" style="flex:1;margin:0;background:var(--panel2);color:var(--text);" ${act('closeWasteModal')}>Vazgeç</button>
      <button type="button" id="wasteSubmitBtn" style="flex:1;margin:0;background:var(--red);color:var(--btn-ink);" ${act('submitWaste', itemId)}>İsraf Olarak Kaydet</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
}
/* Siparişe bağlı olmayan israf (ör. hazırlıkta yanan/bozulan ürün): ürün
   seçilerek elle girilir; report_waste p_order_item_id olmadan çağrılır
   ve stok/maliyet aynı şekilde işlenir. Önce bu istasyonun ürünleri
   listelenir. */
function openManualWasteModal(){
  const all = (APP.config && APP.config.products) || [];
  if(!all.length){ alert('Kayıtlı ürün yok'); return; }
  const st = APP.kitchenStation;
  const sorted = [...all].sort((a,b) => ((b.station_id===st)-(a.station_id===st)) || String(a.name).localeCompare(String(b.name),'tr'));
  const bg = document.createElement('div');
  bg.id = 'wasteModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) closeWasteModal(); };
  bg.innerHTML = `<div class="box" style="max-width:360px;width:100%;text-align:left;">
    <h2 style="margin-top:0;">🔥 Manuel İsraf Gir</h2>
    <p class="muted" style="margin:0 0 12px;font-size:12.5px;">Siparişe bağlı olmayan israf; stoktan düşülür (stok yetmiyorsa kaydedilmez) ve Finansal Analiz &gt; İsraf'ta görünür.</p>
    <label style="display:block;font-size:12.5px;font-weight:700;color:var(--muted);">Ürün</label>
    <select id="wasteProduct" style="margin-bottom:10px;">
      ${sorted.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
    </select>
    <label style="display:block;font-size:12.5px;font-weight:700;color:var(--muted);">Miktar</label>
    <input id="wasteQty" type="number" min="0.01" step="any" value="1" style="margin-bottom:10px;">
    <label style="display:block;font-size:12.5px;font-weight:700;color:var(--muted);">Sebep</label>
    <select id="wasteReason" style="margin-bottom:10px;">
      ${WASTE_REASONS.map(r => `<option value="${r}">${r}</option>`).join('')}
    </select>
    <input id="wasteNote" placeholder="Ek not (opsiyonel)" style="margin-bottom:14px;">
    <div class="field-row" style="gap:8px;">
      <button type="button" style="flex:1;margin:0;background:var(--panel2);color:var(--text);" ${act('closeWasteModal')}>Vazgeç</button>
      <button type="button" id="wasteSubmitBtn" style="flex:1;margin:0;background:var(--red);color:var(--btn-ink);" ${act('submitManualWaste')}>İsraf Olarak Kaydet</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
}
async function submitManualWaste(){
  const productId = document.getElementById('wasteProduct').value;
  const qty = Number(document.getElementById('wasteQty').value) || 0;
  if(!productId){ alert('Ürün seçin'); return; }
  if(qty<=0){ alert('Geçerli bir miktar girin'); return; }
  const reason = document.getElementById('wasteReason').value;
  const note = document.getElementById('wasteNote').value.trim();
  const btn = document.getElementById('wasteSubmitBtn');
  btn.disabled = true; btn.textContent = 'Kaydediliyor...';
  const session = getSession();
  const { error } = await sb.rpc('report_waste', {
    p_token: session.session_token, p_order_item_id: null, p_product_id: productId, p_qty: qty,
    p_reason: note ? (reason+' - '+note) : reason
  });
  if(error){
    btn.disabled = false; btn.textContent = 'İsraf Olarak Kaydet';
    if(error.stockMax != null) return showWasteStockPopup(error.stockMax, qty, productId);
    alert('Hata: '+error.message); return;
  }
  closeWasteModal();
  showToast('🔥 İsraf kaydedildi, stoktan düşüldü');
}
/* Elle israf girerken stok yetmiyorsa: kalan stokla en fazla kaç adet
   karşılanabildiğini söyler; miktarı düşür / stoğu güncelle / farklı ürün seç. */
function showWasteStockPopup(maxQty, wanted, productId, remake){
  const prod = ((APP.config && APP.config.products) || []).find(p => p.id===productId);
  const hasRecipe = !!(prod && prod.recipe && prod.recipe.length);
  const session = getSession();
  const canEditStock = session && (session.isManager || hasPerm(session, hasRecipe ? 'settings_ingredients' : 'settings_products'));
  const bg = document.createElement('div');
  bg.id = 'wasteStockModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:120;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div class="box" style="max-width:360px;width:100%;text-align:left;">
    <h2 style="margin-top:0;">⚠️ Stok Yetersiz</h2>
    ${remake
      ? `<p style="margin:0 0 10px;font-size:14px;">${escapeHtml(prod ? prod.name : 'Bu ürün')} müşteriye yeniden hazırlanacak, ancak ${hasRecipe ? 'hammadde stoğunuz' : 'stoğunuz'} ${maxQty > 0 ? `<b>en fazla ${maxQty} adet</b> için yeterli` : '<b>yeniden hazırlamaya yetmiyor</b>'}.</p>
         <p class="muted" style="margin:0 0 14px;font-size:12.5px;text-align:left;">İsraf kaydedilmedi. Stoğu güncelleyin ya da müşteriye sorup farklı bir ürün verin.</p>`
      : `<p style="margin:0 0 10px;font-size:14px;">${escapeHtml(prod ? prod.name : 'Bu ürün')} için ${wanted} adet israf girmek istediniz, ancak ${hasRecipe ? 'hammadde stoğunuz' : 'stoğunuz'} <b>en fazla ${maxQty} adet</b> için yeterli.</p>
         <p class="muted" style="margin:0 0 14px;font-size:12.5px;text-align:left;">Miktarı düzeltin, stoğu güncelleyin ya da farklı bir ürün seçin.</p>`}
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${maxQty > 0 ? `<button type="button" style="margin:0;" ${act('wasteUseMaxQty', maxQty)}>Miktarı ${maxQty} yap</button>` : ''}
      ${canEditStock ? `<button type="button" class="ghost-btn" style="margin:0;" ${act('wasteGoStockSettings', hasRecipe ? 'ingredients' : 'products')}>📦 Stoğu Güncelle</button>` : ''}
      ${remake
        ? `<button type="button" class="ghost-btn" style="margin:0;" ${act('removeEl','wasteStockModalBg')}>Kapat</button>`
        : `<button type="button" class="ghost-btn" style="margin:0;" ${act('wastePickOtherProduct')}>Farklı Ürün Seç</button>`}
    </div>
  </div>`;
  document.body.appendChild(bg);
}
function closeWasteModal(){ const bg = document.getElementById('wasteModalBg'); if(bg) bg.remove(); }
async function submitWaste(itemId){
  const qty = parseInt(document.getElementById('wasteQty').value) || 0;
  if(qty<=0){ alert('Geçerli bir miktar girin'); return; }
  const reason = document.getElementById('wasteReason').value;
  const note = document.getElementById('wasteNote').value.trim();
  const fullReason = note ? (reason+' - '+note) : reason;
  const btn = document.getElementById('wasteSubmitBtn');
  btn.disabled = true; btn.textContent = 'Kaydediliyor...';
  const session = getSession();
  const { error } = await sb.rpc('report_waste', {
    p_token: session.session_token, p_order_item_id: itemId, p_qty: qty, p_reason: fullReason
  });
  if(error){
    btn.disabled = false; btn.textContent = 'İsraf Olarak Kaydet';
    const it = findLiveOrderItemById(itemId);
    if(error.stockMax != null) return showWasteStockPopup(error.stockMax, qty, it ? it.product_id : null, true);
    alert('Hata: '+error.message); return;
  }
  closeWasteModal();
  // İsraf edilen ürün müşteriye yeniden hazırlanır: malzeme stoktan yeniden
  // düşüldü, kalem mutfakta tekrar "bekliyor"a döndü.
  showToast('🔥 İsraf kaydedildi · ürün yeniden hazırlanacak, stoktan düşüldü');
  await refreshKitchenItems(session);
}

function clearKitchenStation(){ APP.kitchenStation = null; render(); }
function wasteUseMaxQty(q){ document.getElementById('wasteQty').value = q; removeEl('wasteStockModalBg'); }
function wasteGoStockSettings(tab){ removeEl('wasteStockModalBg'); closeWasteModal(); APP.settingsTab = 'products'; APP.productsSubTab = tab; goToView('settings'); }
function wastePickOtherProduct(){ removeEl('wasteStockModalBg'); const el = document.getElementById('wasteProduct'); if(el) el.focus(); }
