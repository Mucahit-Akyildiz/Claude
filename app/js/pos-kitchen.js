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
      APP.config.stations.map(s => `<div class="card" data-station-card="${s.id}" style="position:relative;border-left:4px solid ${s.color}" onclick="pickKitchenStation('${s.id}')"><div class="icon">${escapeHtml(s.icon||'🍳')}</div><h3>${escapeHtml(s.name)}</h3></div>`).join('') +
      `</div>`;
    return;
  }
  const station = APP.config.stations.find(s => s.id===APP.kitchenStation);
  main.innerHTML = `<div style="display:flex;justify-content:space-between;"><h1>${escapeHtml(station.icon||"🍳")} ${escapeHtml(station.name)}</h1>
    <div style="display:flex;gap:8px;align-items:flex-start;">
      <button class="ghost-btn" style="color:var(--red);" onclick="openManualWasteModal()" title="Siparişe bağlı olmayan israf (yanan, düşen, bozulan ürün)">🔥 İsraf Gir</button>
      <button class="ghost-btn" onclick="APP.kitchenStation=null;render();">İstasyon Değiştir</button>
    </div></div>
    <div id="kitchenWrap"></div>`;
  APP.kitchenSeenItemIds = null; // yeni istasyona gecince onceki urunler icin zil calmasin
  APP.kitchenLateWarned = new Set();
  await refreshKitchenItems(session);
  startKitchenPolling(session);
}
async function refreshKitchenItems(session){
  const { data, error } = await sb.rpc('get_live_orders', { p_token: session.session_token });
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
    APP.kitchenPendingByTable[o.order_id] = { tableName, items: pending, dailyNumber: o.daily_number };
    if(!isFirstLoad){
      const freshItems = pending.filter(it => !APP.kitchenSeenItemIds.has(it.id));
      if(freshItems.length>0) newItemsByTable[o.order_id] = { tableName, dailyNumber: o.daily_number, items: freshItems };
    }
    cards.push(`<div class="kitchen-card" data-order-id="${o.order_id}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <b>${escapeHtml(tableName)}${o.daily_number?' <span class="muted" style="font-weight:400;font-size:12px;">#'+o.daily_number+'</span>':''}<span class="kc-late-badge">⏰ GECİKTİ</span></b>
        <span style="cursor:pointer;color:var(--muted);font-size:16px;" onclick="reprintKitchenTicket('${o.order_id}')" title="Fişi tekrar yazdır">🖨️</span>
      </div>
      ${pending.map(it => `<div class="kitchen-item-row" style="padding:10px 0;border-top:1px dashed var(--border);">
        <div style="display:grid;grid-template-columns:1fr 64px auto auto;align-items:center;gap:10px;">
          <span class="kitchen-item-name" style="min-width:0;overflow-wrap:anywhere;line-height:1.3;">${it.qty}x ${escapeHtml(it.name)}</span>
          <span class="kitchen-timer" data-added="${it.added_at||''}" data-id="${it.id}" data-name="${escapeAttr(tableName+' - '+it.qty+'x '+it.name)}" style="text-align:center;">-</span>
          <button style="width:auto;padding:8px 10px;font-size:14px;background:var(--red);color:var(--btn-ink);" onclick="openWasteModal('${it.id}')" title="İsraf oldu (yandı/düştü/bozuldu)">🔥</button>
          <button style="width:auto;padding:8px 14px;font-size:14px;background:var(--green);color:var(--btn-ink);" onclick="markReady('${it.id}')">Hazır</button>
        </div>
        ${it.note?'<div class="muted" style="font-size:12px;font-style:italic;margin-top:4px;overflow-wrap:anywhere;word-break:break-word;">Not: '+escapeHtml(it.note)+'</div>':''}
      </div>`).join('')}
      <button style="margin-top:10px;background:var(--green);color:var(--btn-ink);" onclick="markAllReady('${o.order_id}')">✅ Hepsi Hazır</button>
      </div>`);
  });
  wrap.innerHTML = cards.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;">${cards.join('')}</div>` : '<p class="muted">Bekleyen sipariş yok.</p>';

  // Daha once gorulmemis (yeni gelen) urun varsa zil calsin ve fisini bu istasyonun
  // kendi yazicisina yazdir. Ilk yuklemede (isFirstLoad) hicbiri tetiklenmez.
  const hasNew = Object.keys(newItemsByTable).length>0;
  if(hasNew){
    playKitchenBell(APP.kitchenStation);
    Object.values(newItemsByTable).forEach(entry => {
      printKitchenTicketGrouped(entry.tableName, entry.items, true, entry.dailyNumber)
        .catch(e => { console.error('Fiş yazdırma hatası:', e); showToast('⚠️ Fiş yazdırılırken beklenmeyen bir hata oluştu'); });
    });
  }
  APP.kitchenSeenItemIds = currentIds;
  updateKitchenTimers();
}
function tableNameForId(tableId){
  for(const z of APP.config.zones){ const t = z.tables.find(t=>t.id===tableId); if(t) return t.name; }
  return 'Masa';
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
  // 15 dakikayi gecmis, hala hazir verilmemis siparisler icin sol tarafta
  // (sag ustteki tek seferlik uyaridan ayri) her 3 dakikada bir tekrarlanan
  // hatirlatma - mutfak ekranindan uzaklasilsa/personel gozden kacirsa bile
  // gec kalmis siparisler unutulmasin diye.
  APP.kitchenReminderInterval = setInterval(checkLateOrdersReminder, 180000);
}
function updateKitchenTimers(){
  if(!APP.kitchenLateWarned) APP.kitchenLateWarned = new Set();
  document.querySelectorAll('.kitchen-timer[data-added]').forEach(el => {
    const added = el.dataset.added;
    if(!added){ el.textContent='-'; return; }
    const secs = Math.max(0, Math.floor((Date.now() - new Date(added).getTime())/1000));
    const mm = Math.floor(secs/60), ss = secs%60;
    el.textContent = mm + ':' + String(ss).padStart(2,'0');
    // 0-10 dk yesil (varsayilan), 10-15 dk sari, 15 dk+ kirmizi.
    el.classList.toggle('kt-warn', secs>=600 && secs<900);
    el.classList.toggle('kt-danger', secs>=900);
    // Urun adi da (sadece sayac degil) ayni renge boyansin diye satirin
    // kendisine de ayni durum sinifi uygulanir.
    const row = el.closest('.kitchen-item-row');
    if(row){
      row.classList.toggle('ki-warn', secs>=600 && secs<900);
      row.classList.toggle('ki-danger', secs>=900);
    }
    // 15 dakikayi gectiginde, urun basina bir kez sag ustte uyari mesaji
    // goster - en az 30 saniye ekranda kalsin diye suresi acikca veriliyor.
    const itemId = el.dataset.id;
    if(secs>=900 && itemId && !APP.kitchenLateWarned.has(itemId)){
      APP.kitchenLateWarned.add(itemId);
      showToast('⏰ ' + (el.dataset.name||'Bir sipariş') + ' 15 dakikayı geçti!', 30000, null, () => goToView('kitchen'), true);
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
/* Hala hazir verilmemis (15 dk+ gecikmis) urunleri sol tarafta toplu bir
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
};
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
      <button type="button" style="flex:1;margin:0;background:var(--panel2);color:var(--text);" onclick="closeWasteModal()">Vazgeç</button>
      <button type="button" id="wasteSubmitBtn" style="flex:1;margin:0;background:var(--red);color:var(--btn-ink);" onclick="submitWaste('${itemId}')">İsraf Olarak Kaydet</button>
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
      <button type="button" style="flex:1;margin:0;background:var(--panel2);color:var(--text);" onclick="closeWasteModal()">Vazgeç</button>
      <button type="button" id="wasteSubmitBtn" style="flex:1;margin:0;background:var(--red);color:var(--btn-ink);" onclick="submitManualWaste()">İsraf Olarak Kaydet</button>
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
      ${maxQty > 0 ? `<button type="button" style="margin:0;" onclick="document.getElementById('wasteQty').value=${maxQty};document.getElementById('wasteStockModalBg').remove()">Miktarı ${maxQty} yap</button>` : ''}
      ${canEditStock ? `<button type="button" class="ghost-btn" style="margin:0;" onclick="document.getElementById('wasteStockModalBg').remove();closeWasteModal();APP.settingsTab='${hasRecipe ? 'ingredients' : 'products'}';goToView('settings')">📦 Stoğu Güncelle</button>` : ''}
      ${remake
        ? `<button type="button" class="ghost-btn" style="margin:0;" onclick="document.getElementById('wasteStockModalBg').remove()">Kapat</button>`
        : `<button type="button" class="ghost-btn" style="margin:0;" onclick="document.getElementById('wasteStockModalBg').remove();document.getElementById('wasteProduct').focus()">Farklı Ürün Seç</button>`}
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
