/* POS core: Mutfak + Odemeler + Masa/Siparis arayuzu + Paket Servis +
   Yazici Ayarlari/Mutfak Fisi - app/index.html'den cikarildi. Bilincli
   olarak TEK dosyada tutuluyor (bkz. modulerlestirme plani): bu
   bolumler APP.liveOrders gibi paylasilan mutable state uzerinden
   gercekten ic ice gecmis durumda (ör. printKitchenTicket siparis
   gecmisi satirlarindan cagriliyor) - zorla ayirmak ekstra risk katardi.
   Klasik <script src>. */
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
      APP.config.stations.map(s => `<div class="card" style="border-left:4px solid ${s.color}" onclick="pickKitchenStation('${s.id}')"><div class="icon">${escapeHtml(s.icon||'🍳')}</div><h3>${escapeHtml(s.name)}</h3></div>`).join('') +
      `</div>`;
    return;
  }
  const station = APP.config.stations.find(s => s.id===APP.kitchenStation);
  main.innerHTML = `<div style="display:flex;justify-content:space-between;"><h1>🍳 ${escapeHtml(station.name)}</h1>
    <button class="ghost-btn" onclick="APP.kitchenStation=null;render();">İstasyon Değiştir</button></div>
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
        <div style="display:grid;grid-template-columns:1fr 64px auto;align-items:center;gap:10px;">
          <span class="kitchen-item-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.qty}x ${escapeHtml(it.name)}</span>
          <span class="kitchen-timer" data-added="${it.added_at||''}" data-id="${it.id}" data-name="${escapeHtml(tableName+' - '+it.qty+'x '+it.name)}" style="text-align:center;">-</span>
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
let BELL_CHAIN = null, BELL_CHAIN_CTX = null;
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
  comp.connect(makeup); makeup.connect(limiter); limiter.connect(ctx.destination);
  BELL_CHAIN = comp; BELL_CHAIN_CTX = ctx;
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
function playKitchenBell(stationId){
  const setting = resolveBellSetting(stationId);
  if(typeof setting === 'string' && setting){
    try{
      const audio = new Audio(setting);
      audio.volume = 1.0;
      audio.play().catch(e => console.warn('Zil sesi çalınamadı:', e));
      return;
    }catch(e){ console.warn('Zil sesi çalınamadı:', e); }
  }
  const presetId = (setting && setting.preset) || 'classic';
  playBellPresetById(presetId);
}
async function markReady(itemId){
  const session = getSession();
  const { error } = await sb.rpc('mark_item_ready', { p_token: session.session_token, p_order_item_id: itemId });
  if(error){ alert('Hata: '+error.message); return; }
  await refreshKitchenItems(session);
}
async function markAllReady(tableId){
  const entry = APP.kitchenPendingByTable && APP.kitchenPendingByTable[tableId];
  if(!entry || entry.items.length===0) return;
  const session = getSession();
  const results = await Promise.all(entry.items.map(it =>
    sb.rpc('mark_item_ready', { p_token: session.session_token, p_order_item_id: it.id })
  ));
  const failed = results.some(r => r.error);
  if(failed) alert('Bazı ürünler hazır işaretlenemedi.');
  await refreshKitchenItems(session);
}

/* ================= ÖDEMELER ================= */
async function openPaymentsView(){ APP.view='payments'; render(); }
async function renderPaymentsView(main, session){
  const [cfgRes, liveRes] = await withLoadingOverlay(Promise.all([
    APP.config ? {data:APP.config} : sb.rpc('get_restaurant_config', { p_token: session.session_token }),
    sb.rpc('get_live_orders', { p_token: session.session_token })
  ]));
  if(!APP.config) APP.config = cfgRes.data;
  APP.liveOrders = liveRes.data || [];
  main.innerHTML = `<h1>Ödemeler</h1><div class="muted" id="payStatus"></div><div class="table-grid" id="payGrid"></div>`;
  renderPayGrid();
}
/* --- Hediye Kartları: yeni kart oluşturma (kod üretimi) ve mevcut
   kartları arama/görme, bkz. issue_gift_card / list_gift_cards. Ayarlar
   sekmesi olarak yaşar - kart OLUŞTURMA burada yapılır, ödeme alırken
   kart bakiyesiyle ÖDEME ise Ödemeler ekranındaki hesap penceresinden
   (bkz. openPayModal > lookupPayGiftCard/finishPaymentFull). */
async function renderGiftCardsSettings(el, session){
  el.innerHTML = `<div class="box" style="max-width:none;">
    <h2>🎁 Hediye Kartları</h2>
    <p class="muted" style="text-align:left;margin:-8px 0 16px;">Burada yeni hediye kartı oluşturup mevcut kartların bakiyesini görebilirsiniz. Bir kartı ödeme olarak kullanmak için Ödemeler ekranında hesabı açıp "Hediye Kartı" alanına kodu girin.</p>
    <div class="add-row-panel">
      <p>Yeni Hediye Kartı Oluştur</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="field-group"><label>Tutar</label><input id="gcNewAmount" type="number" min="0" step="0.01" placeholder="örn. 200"></div>
        <div class="field-group"><label>Not (opsiyonel)</label><input id="gcNewNote" placeholder="örn. hediye"></div>
      </div>
      <button style="margin-top:12px;max-width:220px;" onclick="createGiftCard()">+ Kart Oluştur</button>
      <div id="gcNewResult" style="margin-top:10px;"></div>
    </div>
    <div style="margin-top:18px;">
      <input id="gcSearchInput" placeholder="Kod, müşteri adı veya telefon ara..." oninput="debouncedGiftCardSearch(this.value)">
    </div>
    <div id="gcListWrap" style="margin-top:10px;"><p class="muted">Yükleniyor…</p></div>
  </div>`;
  await refreshGiftCardList(session);
}
async function createGiftCard(){
  const session = getSession();
  const amount = parseFloat(document.getElementById('gcNewAmount').value);
  const note = document.getElementById('gcNewNote').value.trim();
  if(!amount || amount<=0){ alert('Geçerli bir tutar girin'); return; }
  const { data, error } = await sb.rpc('issue_gift_card', { p_token: session.session_token, p_amount: amount, p_customer_id: null, p_note: note||null });
  if(error){ alert(error.message); return; }
  document.getElementById('gcNewResult').innerHTML = `<div style="background:var(--panel2);border-radius:10px;padding:12px;text-align:center;">
    <div class="muted" style="font-size:12px;">Yeni Kart Kodu</div>
    <div style="font-size:22px;font-weight:800;letter-spacing:2px;margin:4px 0;">${escapeHtml(data.code)}</div>
    <div class="muted" style="font-size:12px;">Bakiye: ${money(data.balance)}</div>
  </div>`;
  document.getElementById('gcNewAmount').value = '';
  document.getElementById('gcNewNote').value = '';
  showToast('Hediye kartı oluşturuldu ✓');
  refreshGiftCardList(session);
}
let GC_SEARCH_TIMER = null;
function debouncedGiftCardSearch(v){
  clearTimeout(GC_SEARCH_TIMER);
  GC_SEARCH_TIMER = setTimeout(() => refreshGiftCardList(getSession(), v), 350);
}
async function refreshGiftCardList(session, search){
  const wrap = document.getElementById('gcListWrap'); if(!wrap) return;
  const { data, error } = await sb.rpc('list_gift_cards', { p_token: session.session_token, p_search: search||null });
  if(error){ wrap.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const rows = data || [];
  if(!rows.length){ wrap.innerHTML = '<p class="muted">Hediye kartı yok.</p>'; return; }
  wrap.innerHTML = `<div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Kod</th><th>Bakiye</th><th>Müşteri</th><th>Oluşturma</th></tr></thead>
      <tbody>
      ${rows.map(g => `
        <tr>
          <td class="col-name" style="font-weight:700;letter-spacing:1px;">${escapeHtml(g.code)}${!g.is_active?' <span class="muted" style="font-weight:400;">(iptal)</span>':''}</td>
          <td>${money(g.balance)} / ${money(g.initial_balance)}</td>
          <td>${g.customer_name ? escapeHtml(g.customer_name) : '<span class="muted">-</span>'}</td>
          <td>${new Date(g.created_at).toLocaleDateString('tr-TR')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}
/* Grid'i (masa/paket kartları + tutarları) APP.liveOrders'tan yeniden çizer -
   sunucuya yeniden sormadan, herhangi bir ödeme al(n)dığında hemen
   çağrılabilir (örn. ödeme modalı açıkken arkadaki kartın tutarı da güncellensin diye). */
function renderPayGrid(){
  const grid = document.getElementById('payGrid'); if(!grid) return;
  const allTables = APP.config.zones.flatMap(z => z.tables);
  const tableRows = allTables.map(t => {
    const order = liveOrderForTable(t.id);
    const unpaid = order ? order.items.filter(i=>!i.paid) : [];
    if(unpaid.length===0) return null;
    const total = unpaid.reduce((s,i) => s+i.price*i.qty, 0);
    return `<div class="table-cell" style="cursor:pointer;background:rgba(244,63,94,.14);border-color:var(--red);color:var(--red);" onclick="openPayModal('${order.order_id}','${escapeHtml(t.name)}')">
      ${escapeHtml(t.name)}<div style="font-size:11px;margin-top:4px;font-weight:400;">${money(total)}</div></div>`;
  }).filter(Boolean);
  const pkgRows = (APP.liveOrders||[]).filter(o => o.kind==='takeaway' && o.items.filter(i=>!i.paid).length>0).map(o => {
    const unpaid = o.items.filter(i=>!i.paid);
    const total = unpaid.reduce((s,i)=>s+i.price*i.qty,0);
    const label = o.customer_name || ('Paket #'+(o.daily_number||''));
    return `<div class="table-cell" style="cursor:pointer;background:rgba(244,63,94,.14);border-color:var(--red);color:var(--red);overflow-wrap:anywhere;word-break:break-word;" onclick="openPayModal('${o.order_id}','${escapeHtml('📦 '+label)}')">
      📦 ${escapeHtml(label)}<div style="font-size:11px;margin-top:4px;font-weight:400;">${money(total)}</div></div>`;
  });
  const occupiedRows = tableRows.concat(pkgRows);
  grid.innerHTML = occupiedRows.length ? occupiedRows.join('') : '<p class="muted">Açık hesap yok.</p>';
}
/* Ödenecek ürünler adet bazında seçilebilir (örn. 4 Izgara Köfte'den sadece
   1'i) - sadece seçilen adetlerin tutarı için ödeme alınır, geri kalanı
   hesapta açık kalır (kısmi/ürün-adet bazlı ödeme). itemId -> seçili adet. */
let PAY_SELECTED_QTYS = {};
function openPayModal(orderId, tableName){
  const order = APP.liveOrders.find(o => o.order_id===orderId);
  if(!order) return;
  const unpaidItems = order.items.filter(i => !i.paid);
  PAY_SELECTED_QTYS = {};
  unpaidItems.forEach(i => { PAY_SELECTED_QTYS[i.id] = i.qty; });
  const subtotal = unpaidItems.reduce((s,i)=>s+i.price*i.qty,0);
  const itemsHtml = unpaidItems.map(it => `
    <div class="pay-item-row">
      <div class="row-top">
        <span>${escapeHtml(it.name)} <span class="muted" style="font-size:11px;">(${money(it.price)}/adet)</span></span>
        <span class="pay-item-subtotal" data-item-id="${it.id}" style="font-weight:700;">${money(it.price*it.qty)}</span>
      </div>
      <div class="row-bottom">
        <button type="button" class="qty-btn" onclick="stepPayItemQty('${it.id}',-1)">-</button>
        <span class="pay-item-qty" data-item-id="${it.id}" style="min-width:20px;text-align:center;font-weight:700;">${it.qty}</span>
        <button type="button" class="qty-btn" onclick="stepPayItemQty('${it.id}',1)">+</button>
        <span class="muted" style="font-size:11px;">/ ${it.qty} adet</span>
      </div>
    </div>`).join('');
  const bg = document.createElement('div');
  bg.id = 'payModalBg';
  bg.dataset.orderId = orderId;
  bg.dataset.tableName = tableName;
  bg.dataset.subtotal = String(subtotal);
  bg.dataset.discountAmount = '0';
  bg.dataset.tipAmount = '0';
  bg.dataset.redeemPoints = '0';
  bg.dataset.customerId = '';
  bg.dataset.customerPoints = '0';
  bg.dataset.isBirthdayToday = '0';
  bg.dataset.giftCardCode = '';
  bg.dataset.giftCardBalance = '0';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div class="pay-modal">
    <div class="pay-modal-header">
      <h2>${escapeHtml(tableName)}</h2>
      <span class="pay-modal-close" onclick="document.getElementById('payModalBg').remove()">✕</span>
    </div>
    ${unpaidItems.length>1 ? `<div class="pay-select-all-row"><button class="pay-select-all-btn" onclick="toggleAllPayItems()">Tümünü Seç/Kaldır</button></div>` : ''}
    <div class="pay-items-card" id="payItemsWrap">${itemsHtml}</div>
    <div class="pay-subtotal-row" id="paySubtotalLine"><span>Ara Toplam</span><span>${money(subtotal)}</span></div>

    <div class="pay-options-grid">
      <div class="pay-option-card">
        <h4>🏷️ İndirim</h4>
        <div class="field-row">
          <input id="discValue" type="number" min="0" step="0.01" placeholder="0" style="flex:1;">
          <select id="discType" style="width:66px;padding:0 4px;">
            <option value="percent">%</option>
            <option value="amount">₺</option>
          </select>
          <button style="width:auto;padding:0 14px;margin:0;" onclick="applyPayDiscount()">Uygula</button>
        </div>
        <p id="discInfo" class="hint">İndirim yok</p>
      </div>
      <div class="pay-option-card">
        <h4>💸 Bahşiş</h4>
        <div class="pay-chip-row">
          <button type="button" class="pay-chip" onclick="applyTipPercent(5)">%5</button>
          <button type="button" class="pay-chip" onclick="applyTipPercent(10)">%10</button>
          <button type="button" class="pay-chip" onclick="applyTipPercent(15)">%15</button>
          <input id="tipValue" type="number" min="0" step="0.01" placeholder="Tutar" style="flex:1;min-width:80px;margin:0;" oninput="applyTipAmount(this.value)">
        </div>
        <p id="tipInfo" class="hint">Bahşiş yok</p>
        <div style="border-top:1px dashed var(--border);margin-top:10px;padding-top:10px;">
          <label class="hint" style="display:block;margin-bottom:4px;">Alınan nakit — üstü bahşiş olur</label>
          <input id="cashReceivedInput" type="number" min="0" step="0.01" placeholder="örn. 5000" style="margin:0;" oninput="handleCashReceivedInput(this.value)">
        </div>
      </div>
      <div class="pay-option-card">
        <h4>🧑 Müşteri</h4>
        <div class="field-row">
          <input id="payCustomerPhone" placeholder="Telefon ile ara" style="flex:1;">
          <button style="width:auto;padding:0 14px;margin:0;" onclick="lookupPayCustomer()">Bul</button>
        </div>
        <p id="payCustomerInfo" class="hint">Müşteri seçilmedi</p>
        <div id="payRedeemWrap" style="display:none;margin-top:8px;">
          <input id="payRedeemPoints" type="number" min="0" step="1" placeholder="Kullanılacak puan" style="margin:0;" oninput="applyRedeemPoints(this.value)">
        </div>
      </div>
      <div class="pay-option-card">
        <h4>🎁 Hediye Kartı</h4>
        <div class="field-row">
          <input id="payGiftCardCode" placeholder="Kart kodu" style="flex:1;text-transform:uppercase;">
          <button style="width:auto;padding:0 14px;margin:0;" onclick="lookupPayGiftCard()">Sorgula</button>
        </div>
        <p id="payGiftCardInfo" class="hint">Kart seçilmedi</p>
        <div id="payGiftCardPartialActions" style="display:none;margin-top:8px;">
          <p class="hint" style="margin:0 0 6px;">Bakiye yetersiz — kartın tamamı düşülür, kalanı seçin:</p>
          <div class="field-row" style="gap:8px;">
            <button style="width:auto;padding:0 12px;margin:0;flex:1;" onclick="finishGiftCardPartial('cash')">💵 Kalanı Nakit</button>
            <button style="width:auto;padding:0 12px;margin:0;flex:1;" onclick="finishGiftCardPartial('card')">💳 Kalanı Kart</button>
          </div>
        </div>
      </div>
    </div>

    <div class="pay-total-banner">
      <span class="label">Ödenecek</span>
      <span class="amt" id="payFinalTotal">${money(subtotal)}</span>
    </div>
    <div class="pay-method-grid">
      <button class="pay-method-btn cash" onclick="finishPaymentFull('cash')">💵 Nakit</button>
      <button class="pay-method-btn card" onclick="finishPaymentFull('card')">💳 Kredi Kartı</button>
    </div>
    <div class="pay-method-grid secondary">
      <button class="pay-method-btn gift" id="payGiftCardPayBtn" disabled onclick="finishPaymentFull('gift_card')">🎁 Hediye Kartı ile Öde</button>
      <button class="pay-method-btn split" onclick="openSplitPay()">➗ Bölünmüş Ödeme</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
}
function applyTipPercent(pct){
  const bg = document.getElementById('payModalBg');
  const subtotal = parseFloat(bg.dataset.subtotal);
  const discAmount = parseFloat(bg.dataset.discountAmount||0);
  const base = Math.max(0, subtotal-discAmount);
  const tip = Math.round(base*pct/100*100)/100;
  bg.dataset.tipAmount = String(tip);
  document.getElementById('tipValue').value = tip;
  document.getElementById('tipInfo').textContent = 'Bahşiş: '+money(tip)+' (%'+pct+')';
  syncCashReceivedFromTip();
  updatePayFinalTotalLine();
}
function applyTipAmount(v){
  const bg = document.getElementById('payModalBg');
  let tip = parseFloat(v)||0;
  if(tip<0) tip=0;
  bg.dataset.tipAmount = String(tip);
  document.getElementById('tipInfo').textContent = tip>0 ? 'Bahşiş: '+money(tip) : 'Bahşiş yok';
  syncCashReceivedFromTip();
  updatePayFinalTotalLine();
}
/* "Müşteriden Alınan Nakit" alanı ile bahşiş alanı birbirini senkronize
   eder - hangisine yazılırsa diğeri ona göre güncellenir, ikisi de aynı
   şeyi (bahşiş tutarını) farklı bir açıdan ifade ediyor. */
function syncCashReceivedFromTip(){
  const bg = document.getElementById('payModalBg');
  const receivedInput = document.getElementById('cashReceivedInput');
  if(!receivedInput || document.activeElement===receivedInput) return;
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const due = payFinalTotal();
  receivedInput.value = tip>0 ? (Math.round((due+tip)*100)/100) : '';
}
function handleCashReceivedInput(v){
  const bg = document.getElementById('payModalBg');
  const received = parseFloat(v)||0;
  const due = payFinalTotal();
  const tip = received>due ? Math.round((received-due)*100)/100 : 0;
  bg.dataset.tipAmount = String(tip);
  const tipValueInput = document.getElementById('tipValue');
  if(tipValueInput && document.activeElement!==tipValueInput) tipValueInput.value = tip || '';
  document.getElementById('tipInfo').textContent = tip>0 ? 'Bahşiş: '+money(tip)+' (alınan nakitten hesaplandı)' : 'Bahşiş yok';
  updatePayFinalTotalLine();
}
async function lookupPayCustomer(){
  const bg = document.getElementById('payModalBg');
  const phone = document.getElementById('payCustomerPhone').value.trim();
  const infoEl = document.getElementById('payCustomerInfo');
  const redeemWrap = document.getElementById('payRedeemWrap');
  if(!phone){ infoEl.textContent = 'Telefon girin'; return; }
  const session = getSession();
  const { data, error } = await sb.rpc('get_customer_by_phone', { p_token: session.session_token, p_phone: phone });
  if(error || !data){
    infoEl.textContent = 'Müşteri bulunamadı';
    bg.dataset.customerId = '';
    bg.dataset.customerPoints = '0';
    bg.dataset.redeemPoints = '0';
    bg.dataset.isBirthdayToday = '0';
    redeemWrap.style.display = 'none';
    updatePayFinalTotalLine();
    return;
  }
  bg.dataset.customerId = data.id;
  bg.dataset.customerPoints = String(data.points_balance||0);
  bg.dataset.isBirthdayToday = data.is_birthday_today ? '1' : '0';
  const loyalty = (APP.config && APP.config.loyalty) || {};
  const birthdayPct = loyalty.birthday_discount_percent || 0;
  infoEl.textContent = data.name + ' · ' + data.points_balance + ' puan' +
    (data.is_birthday_today && birthdayPct>0 ? ' · 🎂 Bugün doğum günü! %'+birthdayPct+' indirim uygulanacak' : '');
  if(loyalty.enabled && data.points_balance>0){
    redeemWrap.style.display = 'block';
    document.getElementById('payRedeemPoints').max = data.points_balance;
  } else {
    redeemWrap.style.display = 'none';
  }
  recomputePaySelection();
}
function applyRedeemPoints(v){
  const bg = document.getElementById('payModalBg');
  let pts = parseFloat(v)||0;
  const maxPts = parseFloat(bg.dataset.customerPoints||0);
  if(pts<0) pts=0; if(pts>maxPts) pts=maxPts;
  bg.dataset.redeemPoints = String(pts);
  recomputePaySelection();
}
async function lookupPayGiftCard(){
  const bg = document.getElementById('payModalBg');
  const code = document.getElementById('payGiftCardCode').value.trim();
  const infoEl = document.getElementById('payGiftCardInfo');
  const payBtn = document.getElementById('payGiftCardPayBtn');
  const partialBox = document.getElementById('payGiftCardPartialActions');
  if(!code){ infoEl.textContent = 'Kart kodu girin'; return; }
  const session = getSession();
  const { data, error } = await sb.rpc('check_gift_card', { p_token: session.session_token, p_code: code });
  if(error || !data){
    infoEl.textContent = error ? error.message : 'Kart bulunamadı';
    bg.dataset.giftCardCode = '';
    bg.dataset.giftCardBalance = '0';
    if(payBtn) payBtn.disabled = true;
    if(partialBox) partialBox.style.display = 'none';
    return;
  }
  bg.dataset.giftCardCode = data.code;
  bg.dataset.giftCardBalance = String(data.balance);
  const total = Math.round(payFinalTotal()*100)/100;
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const amountWithTip = Math.round((total+tip)*100)/100;
  const remaining = Math.round((amountWithTip - data.balance)*100)/100;
  if(remaining > 0){
    // Bakiye yetmiyor: tam ödeme butonu yerine, kartın tamamını düşüp
    // kalanı nakit/kartla tamamlayan iki kısa yol gösterilir.
    infoEl.textContent = data.code + ' · Bakiye: ' + money(data.balance) + ' (yetersiz — kalan ' + money(remaining) + ')';
    if(payBtn) payBtn.disabled = true;
    if(partialBox){
      partialBox.style.display = '';
      partialBox.querySelector('p').textContent = 'Bakiye yetersiz — ' + money(data.balance) + ' düşülür, kalan ' + money(remaining) + ' için seçin:';
    }
  } else {
    infoEl.textContent = data.code + ' · Bakiye: ' + money(data.balance);
    if(payBtn) payBtn.disabled = false;
    if(partialBox) partialBox.style.display = 'none';
  }
}
async function finishGiftCardPartial(method){
  const bg = document.getElementById('payModalBg');
  const orderId = bg.dataset.orderId;
  const code = bg.dataset.giftCardCode;
  const balance = parseFloat(bg.dataset.giftCardBalance||0);
  if(!code){ alert('Önce bir hediye kartı sorgulayın'); return; }
  const itemQtys = buildPayItemQtys();
  if(itemQtys.length===0){ alert('Ödeme almak için en az bir ürün/adet seçin'); return; }
  const total = Math.round(payFinalTotal()*100)/100;
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const amountWithTip = Math.round((total+tip)*100)/100;
  const giftAmount = Math.min(balance, amountWithTip);
  const remaining = Math.round((amountWithTip - giftAmount)*100)/100;
  const customerId = bg.dataset.customerId || null;
  const redeemPoints = parseFloat(bg.dataset.redeemPoints||0);
  await finishPayment(orderId, 'split', total, method==='cash'?remaining:0, method==='card'?remaining:0, parseFloat(bg.dataset.discountAmount||0), itemQtys, tip, customerId, redeemPoints, code, giftAmount);
}
function updatePayFinalTotalLine(){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const net = payFinalTotal();
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const el = document.getElementById('payFinalTotal');
  if(el) el.innerHTML = money(net+tip)+(tip>0?' <span style="font-size:12px;font-weight:600;color:var(--muted);">(bahşiş dahil)</span>':'');
}
function stepPayItemQty(itemId, delta){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const order = APP.liveOrders.find(o => o.order_id===bg.dataset.orderId);
  const item = order && order.items.find(i => i.id===itemId);
  if(!item) return;
  const next = Math.max(0, Math.min(item.qty, (PAY_SELECTED_QTYS[itemId]||0) + delta));
  PAY_SELECTED_QTYS[itemId] = next;
  const qtyEl = document.querySelector('.pay-item-qty[data-item-id="'+itemId+'"]');
  if(qtyEl) qtyEl.textContent = next;
  const subEl = document.querySelector('.pay-item-subtotal[data-item-id="'+itemId+'"]');
  if(subEl) subEl.textContent = money(item.price*next);
  recomputePaySelection();
}
function toggleAllPayItems(){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const order = APP.liveOrders.find(o => o.order_id===bg.dataset.orderId);
  const unpaid = order.items.filter(i => !i.paid);
  const allSelected = unpaid.every(i => (PAY_SELECTED_QTYS[i.id]||0) === i.qty);
  unpaid.forEach(i => {
    PAY_SELECTED_QTYS[i.id] = allSelected ? 0 : i.qty;
    const qtyEl = document.querySelector('.pay-item-qty[data-item-id="'+i.id+'"]');
    if(qtyEl) qtyEl.textContent = PAY_SELECTED_QTYS[i.id];
    const subEl = document.querySelector('.pay-item-subtotal[data-item-id="'+i.id+'"]');
    if(subEl) subEl.textContent = money(i.price*PAY_SELECTED_QTYS[i.id]);
  });
  recomputePaySelection();
}
function buildPayItemQtys(){
  return Object.keys(PAY_SELECTED_QTYS)
    .filter(id => PAY_SELECTED_QTYS[id]>0)
    .map(id => ({ item_id: id, qty: PAY_SELECTED_QTYS[id] }));
}
function recomputePaySelection(){
  const bg = document.getElementById('payModalBg'); if(!bg) return;
  const order = APP.liveOrders.find(o => o.order_id===bg.dataset.orderId);
  const subtotal = order.items.reduce((s,i) => s + i.price*(PAY_SELECTED_QTYS[i.id]||0), 0);
  bg.dataset.subtotal = String(subtotal);
  document.getElementById('paySubtotalLine').textContent = 'Ara Toplam: '+money(subtotal);
  // İndirim varsa yeni seçime göre yeniden hesaplanır (yüzdeyse orana göre, tutarsa ara toplamı geçmeyecek şekilde).
  const discType = bg.dataset.discountType;
  const discValue = parseFloat(bg.dataset.discountValue||0);
  let discAmount = 0;
  if(discType==='percent') discAmount = subtotal*discValue/100;
  else if(discType==='amount') discAmount = discValue;
  if(discAmount>subtotal) discAmount = subtotal;
  bg.dataset.discountAmount = String(discAmount);
  const discInfo = document.getElementById('discInfo');
  if(discInfo) discInfo.textContent = discAmount>0 ? ('İndirim: -'+money(discAmount)+(discType==='percent'?' (%'+discValue+')':'')) : 'İndirim yok';
  updatePayFinalTotalLine();
}
function applyPayDiscount(){
  const bg = document.getElementById('payModalBg');
  const type = document.getElementById('discType').value;
  let val = parseFloat(document.getElementById('discValue').value)||0;
  if(val<0) val=0;
  bg.dataset.discountType = type;
  bg.dataset.discountValue = String(val);
  recomputePaySelection();
}
function payFinalTotal(){
  const bg = document.getElementById('payModalBg');
  const subtotal = parseFloat(bg.dataset.subtotal);
  const discountAmount = parseFloat(bg.dataset.discountAmount||0);
  const redeemPoints = parseFloat(bg.dataset.redeemPoints||0);
  const pointValue = (APP.config && APP.config.loyalty && APP.config.loyalty.point_value) || 1;
  const afterDiscounts = Math.max(0, subtotal - discountAmount - redeemPoints*pointValue);
  const birthdayPct = bg.dataset.isBirthdayToday==='1' ? ((APP.config && APP.config.loyalty && APP.config.loyalty.birthday_discount_percent) || 0) : 0;
  return Math.max(0, afterDiscounts - afterDiscounts*birthdayPct/100);
}
async function finishPaymentFull(method){
  const bg = document.getElementById('payModalBg');
  const orderId = bg.dataset.orderId;
  const itemQtys = buildPayItemQtys();
  if(itemQtys.length===0){ alert('Ödeme almak için en az bir ürün/adet seçin'); return; }
  const total = Math.round(payFinalTotal()*100)/100;
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const amountWithTip = Math.round((total+tip)*100)/100;
  const customerId = bg.dataset.customerId || null;
  const redeemPoints = parseFloat(bg.dataset.redeemPoints||0);
  if(method==='gift_card'){
    const code = bg.dataset.giftCardCode;
    const balance = parseFloat(bg.dataset.giftCardBalance||0);
    if(!code){ alert('Önce bir hediye kartı sorgulayın'); return; }
    if(balance < amountWithTip){ alert('Hediye kartında yeterli bakiye yok (bakiye: '+money(balance)+', gereken: '+money(amountWithTip)+')'); return; }
    await finishPayment(orderId, method, total, 0, 0, parseFloat(bg.dataset.discountAmount||0), itemQtys, tip, customerId, redeemPoints, code, amountWithTip);
    return;
  }
  await finishPayment(orderId, method, total, method==='cash'?amountWithTip:0, method==='card'?amountWithTip:0, parseFloat(bg.dataset.discountAmount||0), itemQtys, tip, customerId, redeemPoints);
}
function openSplitPay(){
  const bg = document.getElementById('payModalBg');
  const orderId = bg.dataset.orderId;
  if(buildPayItemQtys().length===0){ alert('Ödeme almak için en az bir ürün/adet seçin'); return; }
  const itemTotal = Math.round(payFinalTotal()*100)/100;
  const tip = parseFloat(bg.dataset.tipAmount||0);
  const total = Math.round((itemTotal+tip)*100)/100;
  const discountAmount = parseFloat(bg.dataset.discountAmount||0);
  const customerId = bg.dataset.customerId || '';
  const redeemPoints = parseFloat(bg.dataset.redeemPoints||0);
  bg.remove();
  const sbg = document.createElement('div');
  sbg.id = 'splitPayBg';
  sbg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  sbg.onclick = (e) => { if(e.target===sbg) sbg.remove(); };
  sbg.innerHTML = `<div class="pay-modal" style="max-width:700px;">
    <div class="pay-modal-header">
      <h2>➗ Bölünmüş Ödeme</h2>
      <span class="pay-modal-close" onclick="document.getElementById('splitPayBg').remove()">✕</span>
    </div>
    <div class="pay-total-banner" style="margin-top:14px;">
      <span class="label">Ödenecek Tutar</span>
      <span class="amt">${money(total)}</span>
    </div>
    ${tip>0 ? `<p class="muted" style="text-align:center;font-size:12px;margin:-10px 0 14px;">(bahşiş dahil: ${money(tip)})</p>` : ''}

    <div class="pay-options-grid" style="margin-top:14px;">
      <div class="pay-option-card">
        <h4>👥 Kişi Sayısına Göre Hesapla <span class="muted" style="font-weight:400;text-transform:none;">(opsiyonel)</span></h4>
        <div class="field-row" style="margin-bottom:10px;">
          <input id="splitPeople" type="number" min="1" placeholder="Toplam kişi">
          <input id="splitCashPeople" type="number" min="0" placeholder="Nakit ödeyen">
        </div>
        <button style="margin:0;" onclick="calcSplitPay(${total})">Hesapla</button>
      </div>

      <div class="pay-option-card">
        <h4>💵 Nakit / 💳 Kart Dağılımı</h4>
        <label class="hint" style="display:block;margin-bottom:4px;">Nakit Tutar</label>
        <input id="splitCash" type="number" step="0.01" min="0" max="${total}" value="0" oninput="updateSplitPayPreview(${total})" style="margin-bottom:0;">
        <p id="splitCardPreview" class="hint" style="margin:8px 0 0;">Kredi Kartı: ${money(total)}</p>
      </div>

      <div class="pay-option-card">
        <h4>👥 Nakiti Birden Fazla Kişiye Böl <span class="muted" style="font-weight:400;text-transform:none;">(opsiyonel)</span></h4>
        <div class="field-row">
          <input id="cashChargeCount" type="number" min="1" value="1" style="flex:1;">
          <button style="width:auto;padding:0 16px;margin:0;" onclick="genCashCharges(${total})">Böl</button>
        </div>
        <div id="cashChargesBox" style="margin-top:8px;"></div>
      </div>

      <div class="pay-option-card">
        <h4>💳 Kartı Birden Fazla Çekime Böl <span class="muted" style="font-weight:400;text-transform:none;">(opsiyonel)</span></h4>
        <div class="field-row">
          <input id="cardChargeCount" type="number" min="1" value="1" style="flex:1;">
          <button style="width:auto;padding:0 16px;margin:0;" onclick="genCardCharges(${total})">Böl</button>
        </div>
        <div id="cardChargesBox" style="margin-top:8px;"></div>
      </div>
    </div>

    <button class="pay-method-btn cash" style="margin-top:6px;" onclick="confirmSplitPay('${orderId}',${total},${discountAmount},${tip},'${customerId}',${redeemPoints})">✅ Onayla</button>
  </div>`;
  document.body.appendChild(sbg);
}
function calcSplitPay(total){
  const tp = parseFloat(document.getElementById('splitPeople').value)||0;
  const cp = parseFloat(document.getElementById('splitCashPeople').value);
  if(tp<=0 || isNaN(cp) || cp<0 || cp>tp){ alert('Geçerli kişi sayıları girin'); return; }
  const cash = Math.round((total*cp/tp)*100)/100;
  document.getElementById('splitCash').value = cash;
  updateSplitPayPreview(total);
  const cardPeople = Math.round(tp-cp);
  if(cardPeople>0){ document.getElementById('cardChargeCount').value = cardPeople; genCardCharges(total); }
  if(cp>0){ document.getElementById('cashChargeCount').value = cp; genCashCharges(total); }
}
function updateSplitPayPreview(total){
  let cash = parseFloat(document.getElementById('splitCash').value)||0;
  if(cash<0) cash=0; if(cash>total) cash=total;
  document.getElementById('splitCardPreview').textContent = 'Kredi Kartı: '+money(total-cash);
  const cashBox = document.getElementById('cashChargesBox'); if(cashBox) cashBox.innerHTML = '';
  const cardBox = document.getElementById('cardChargesBox'); if(cardBox) cardBox.innerHTML = '';
}
function genCashCharges(total){
  let cash = parseFloat(document.getElementById('splitCash').value)||0;
  if(cash<0) cash=0; if(cash>total) cash=total;
  if(cash<=0){ alert('Bölünecek nakit tutar yok'); return; }
  const count = Math.max(1, parseInt(document.getElementById('cashChargeCount').value)||1);
  const base = Math.floor((cash/count)*100)/100;
  const charges = [];
  let sum=0;
  for(let i=0;i<count-1;i++){ charges.push(base); sum+=base; }
  charges.push(Math.round((cash-sum)*100)/100);
  document.getElementById('cashChargesBox').innerHTML = charges.map((c,i) =>
    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;"><span class="muted" style="width:50px;font-size:12px;">Nakit ${i+1}:</span><input class="cash-input" type="number" step="0.01" value="${c}" style="margin:0;" oninput="updateCashSum()"></div>`
  ).join('') + `<p id="cashSumInfo" class="muted" style="font-size:12px;margin-top:6px;"></p>`;
  updateCashSum(cash);
}
function updateCashSum(needed){
  const inputs = document.querySelectorAll('.cash-input');
  let sum=0; inputs.forEach(i => sum += parseFloat(i.value)||0);
  const info = document.getElementById('cashSumInfo'); if(!info) return;
  info.textContent = 'Nakit toplamı: '+money(sum)+(needed!=null?' / gerekli: '+money(needed):'');
}
function genCardCharges(total){
  const cash = parseFloat(document.getElementById('splitCash').value)||0;
  const cardTotal = Math.round((total-cash)*100)/100;
  if(cardTotal<=0){ alert('Bölünecek kredi kartı tutarı yok'); return; }
  const count = Math.max(1, parseInt(document.getElementById('cardChargeCount').value)||1);
  const base = Math.floor((cardTotal/count)*100)/100;
  const charges = [];
  let sum=0;
  for(let i=0;i<count-1;i++){ charges.push(base); sum+=base; }
  charges.push(Math.round((cardTotal-sum)*100)/100);
  document.getElementById('cardChargesBox').innerHTML = charges.map((c,i) =>
    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;"><span class="muted" style="width:50px;font-size:12px;">Kart ${i+1}:</span><input class="cc-input" type="number" step="0.01" value="${c}" style="margin:0;" oninput="updateCcSum()"></div>`
  ).join('') + `<p id="ccSumInfo" class="muted" style="font-size:12px;margin-top:6px;"></p>`;
  updateCcSum(cardTotal);
}
function updateCcSum(needed){
  const inputs = document.querySelectorAll('.cc-input');
  let sum=0; inputs.forEach(i => sum += parseFloat(i.value)||0);
  const info = document.getElementById('ccSumInfo'); if(!info) return;
  info.textContent = 'Çekimler toplamı: '+money(sum)+(needed!=null?' / gerekli: '+money(needed):'');
}
async function confirmSplitPay(orderId, total, discountAmount, tipAmount, customerId, redeemPoints){
  let cash = parseFloat(document.getElementById('splitCash').value)||0;
  if(cash<0) cash=0; if(cash>total) cash=total;
  const card = Math.round((total-cash)*100)/100;
  document.getElementById('splitPayBg').remove();
  await finishPayment(orderId, 'split', total, cash, card, discountAmount, buildPayItemQtys(), tipAmount, customerId||null, redeemPoints);
}
async function finishPayment(orderId, method, total, cash, card, discountAmount, itemQtys, tipAmount, customerId, redeemPoints, giftCardCode, giftCardAmount){
  // Aynı hesap için üst üste tıklama/çift dokunma pay_order_items'ı iki kez
  // tetikleyip aynı siparişi iki kez ödenmiş gibi işleyebiliyordu (aynı anda
  // giden iki istek de "henüz ödenmemiş" ürünleri görüp ikisi de işliyor).
  // Bu yüzden aynı sipariş için ödeme isteği tamamlanana kadar yenisi engellenir.
  if(!window._payInFlight) window._payInFlight = new Set();
  if(window._payInFlight.has(orderId)){ return; }
  window._payInFlight.add(orderId);
  let data, error;
  try{
    const session = getSession();
    ({ data, error } = await sb.rpc('pay_order_items', {
      p_token: session.session_token, p_order_id: orderId, p_payment_method: method,
      p_cash: cash, p_card: card, p_discount_amount: discountAmount||0, p_item_qtys: itemQtys||null,
      p_tip_amount: tipAmount||0, p_customer_id: customerId||null, p_redeem_points: redeemPoints||0,
      p_gift_card_code: giftCardCode||null, p_gift_card_amount: giftCardAmount||0
    }));
  } finally {
    window._payInFlight.delete(orderId);
  }
  const session = getSession();
  if(error){ alert('Ödeme kaydedilemedi: '+error.message); return; }
  const bg = document.getElementById('payModalBg'); if(bg) bg.remove();
  const { data: liveData } = await sb.rpc('get_live_orders', { p_token: session.session_token });
  APP.liveOrders = liveData || [];
  // Ödeme al(n)dığı an, arkadaki masa/paket kartlarının tutarı da hemen
  // güncellensin diye grid'i her durumda (kısmi/tam) yeniden çiziyoruz.
  if(APP.view==='payments') renderPayGrid();
  if(data && data.order_closed===false){
    // Kısmi ödeme: hesaptaki geri kalan ürünler için ödeme ekranı hemen tekrar açılır.
    showToast('Ödeme alındı ✓ (kalan ürünler için hesap açık kaldı)');
    const remainingOrder = APP.liveOrders.find(o => o.order_id===orderId);
    if(remainingOrder){
      const label = remainingOrder.kind==='takeaway'
        ? ('📦 '+(remainingOrder.customer_name || ('Paket #'+(remainingOrder.daily_number||''))))
        : tableNameForId(remainingOrder.table_id);
      openPayModal(orderId, label);
    } else if(APP.view!=='payments') {
      renderPaymentsView(document.getElementById('main'), session);
    }
  } else {
    if(APP.config && APP.config.google_review_url){
      showToast('Ödeme alındı ✓ · Google yorumu için QR göstermek üzere dokunun', 8000, null, () => showGoogleReviewQr());
    } else {
      showToast('Ödeme alındı ✓');
    }
    if(APP.view!=='payments') renderPaymentsView(document.getElementById('main'), session);
  }
}
/* --- Google Yorumları'na yönlendirme: hesap tamamen kapandığında (bkz.
   yukarısı) personele gösterilen toast'a dokununca, müşterinin telefonuyla
   okutabileceği bir QR kod açılır (bkz. Ayarlar > Entegrasyonlar). --- */
function showGoogleReviewQr(){
  const url = APP.config && APP.config.google_review_url;
  if(!url) return;
  const qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(url);
  const bg = document.createElement('div');
  bg.id = 'googleReviewQrBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:320px;width:100%;text-align:center;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">⭐ Bizi Değerlendirin</h2><span style="cursor:pointer;color:var(--muted);" onclick="document.getElementById('googleReviewQrBg').remove()">✕</span></div>
    <p class="muted" style="font-size:13px;">Müşteriye telefonuyla okutması için gösterin</p>
    <img src="${qrImgUrl}" alt="QR" style="width:100%;max-width:260px;margin:6px 0 14px;border-radius:8px;background:#fff;padding:8px;">
  </div>`;
  document.body.appendChild(bg);
}

async function openOrderView(){
  APP.view='order';
  render();
}
async function renderOrderView(main, session){
  main.innerHTML = `<h1>Sipariş Al</h1><div class="muted" id="orderStatus"></div><div id="customerReqBanner"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div class="tabs" id="zoneTabs" style="margin:16px 0 0;"></div>
      <button type="button" style="width:auto;padding:7px 12px;margin:0;background:transparent;border:1px solid var(--border);color:var(--text);box-shadow:none;font-size:12.5px;" onclick="toggleOrderTableViewMode()" id="tableViewModeBtn">${APP.orderTableViewMode==='floorplan'?'📋 Liste Görünümü':'🗺️ Kat Planı'}</button>
    </div>
    <div class="table-grid" id="tableGrid" style="margin-top:12px;"></div>
    <div id="tableFloorPlan" class="floorplan-canvas" style="display:none;margin-top:12px;padding:14px;"></div>`;
  const [cfgRes, liveRes] = await withLoadingOverlay(Promise.all([
    sb.rpc('get_restaurant_config', { p_token: session.session_token }),
    sb.rpc('get_live_orders', { p_token: session.session_token })
  ]));
  const statusEl = document.getElementById('orderStatus');
  if(cfgRes.error || liveRes.error){
    statusEl.textContent = 'Veri yüklenemedi: ' + ((cfgRes.error||liveRes.error).message);
    statusEl.style.color = 'var(--red)';
    return;
  }
  APP.config = cfgRes.data;
  APP.liveOrders = liveRes.data || [];
  statusEl.textContent = '';
  if(!APP.config.zones || APP.config.zones.length===0){
    document.getElementById('tableGrid').innerHTML = '<p class="muted">Henüz bölge/masa eklenmemiş.</p>';
    return;
  }
  APP.selectedZone = APP.selectedZone || APP.config.zones[0].id;
  renderZoneTabs();
  renderTableGrid();
  refreshCustomerOrderRequests(session);
  startOrderPolling(session);
}
function stopOrderPolling(){
  if(APP.orderPollInterval){ clearInterval(APP.orderPollInterval); APP.orderPollInterval=null; }
}
function startOrderPolling(session){
  stopOrderPolling();
  // Mutfaktan "Hazır" işaretlenince Sipariş Al ekranındaki masa kartları (X ürün
  // hazırlanıyor/hazır) başka bir cihazdan geldiği için otomatik yenilenmez -
  // bu yüzden burada da kitchen ekranındaki gibi periyodik arka plan yenileme var.
  APP.orderPollInterval = setInterval(() => {
    if(APP.view==='order' || APP.view==='packages') refreshOrderLiveStatus(session);
  }, 5000);
}
async function refreshOrderLiveStatus(session){
  const { data, error } = await sb.rpc('get_live_orders', { p_token: session.session_token });
  if(error) return;
  APP.liveOrders = data || [];
  if(APP.view==='order') renderTableGrid();
  if(APP.view==='packages') renderPackageGrid();
  const bg = document.getElementById('tableModalBg');
  if(bg && bg.dataset.tableId) renderTableItems(bg.dataset.tableId);
  if(APP.view==='order') refreshCustomerOrderRequests(session);
}
/* Müşterinin /menu/ sayfasından gönderdiği sipariş istekleri (bkz.
   submit_customer_order_request) Sipariş Al ekranının üstünde bir
   bildirim şeridinde toplanır - personel onaylayana kadar mutfağa
   düşmez (bkz. approve_customer_order_request, fiyat/ürün her zaman
   sunucu tarafında products tablosundan doğrulanır, müşteriden gelen
   fiyat asla güvenilmez). Bu fonksiyon artık ekrana bakılmaksızın
   (bkz. startCustomerRequestPolling) 20 saniyede bir periyodik çağrılıyor:
   Sipariş Al ekranındaysa şerit güncellenir, değilse HENÜZ ONAYLANMAMIŞ
   her istek için her turda tekrar tekrar toast bildirimi gösterilir -
   personel onaylayana/reddedene kadar (tek seferlik değil, bilinçli
   olarak) - böylece başka bir ekranda olsa bile QR siparişini kaçırmaz. */
function customerRequestLabel(r){
  if(r.table_name) return escapeHtml(r.table_name);
  return r.order_type==='delivery' ? '🛵 Teslimat' : '🥡 Gel-Al';
}
async function refreshCustomerOrderRequests(session){
  const { data, error } = await sb.rpc('list_customer_order_requests', { p_token: session.session_token });
  if(error) return;
  const rows = data || [];
  APP.customerRequests = rows;
  const banner = document.getElementById('customerReqBanner');
  if(banner){
    banner.innerHTML = rows.length===0 ? '' : `<div class="box" style="max-width:none;border-color:var(--accent);background:rgba(0,143,168,.08);">
    <h2 style="margin:0 0 8px;">📱 Müşteri Sipariş İstekleri (${rows.length})</h2>
    ${rows.map(r => `
      <div style="padding:8px 0;border-top:1px dashed var(--border);">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <b style="overflow-wrap:anywhere;word-break:break-word;">${customerRequestLabel(r)}${r.customer_name?' · '+escapeHtml(r.customer_name):''}</b>
          <span class="muted" style="font-size:12px;">${new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span>
        </div>
        ${(r.customer_phone||r.delivery_address) ? `<div class="muted" style="font-size:12px;margin-top:2px;overflow-wrap:anywhere;word-break:break-word;">${r.customer_phone?'📞 '+escapeHtml(r.customer_phone):''}${r.customer_phone&&r.delivery_address?' · ':''}${r.delivery_address?'📍 '+escapeHtml(r.delivery_address):''}</div>` : ''}
        <div style="font-size:13px;margin-top:4px;">
          ${r.items.map(it => `${it.qty}x ${escapeHtml(it.name||'?')}${it.note?' <span class="muted">('+escapeHtml(it.note)+')</span>':''}`).join(', ')}
        </div>
        <div style="margin-top:8px;">
          <button class="sbtn" style="background:var(--green);color:var(--btn-ink);" onclick="approveCustomerRequest('${r.id}')">✅ Onayla</button>
          <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="rejectCustomerRequest('${r.id}')">✕ Reddet</button>
        </div>
      </div>`).join('')}
  </div>`;
  }
  // Sipariş Al ekranındaki şerit görünür olsa bile bildirim AYRICA gösterilir
  // (ekran arka planda/simge durumunda/başka monitörde olabilir - şerit
  // görünür olması fiziksel olarak fark edildiği anlamına gelmez).
  if(rows.length>0){
    const labels = rows.map(r => (r.table_name || (r.order_type==='delivery'?'Teslimat':r.order_type==='pickup'?'Gel-Al':'Masa')) + (r.customer_name?' · '+r.customer_name:''));
    const shown = labels.slice(0,3).join(', ') + (labels.length>3 ? ' ve ' + (labels.length-3) + ' tane daha' : '');
    showToast('📱 Onay bekleyen müşteri sipariş isteği: ' + shown, 20000, null, () => goToView('order'), true);
  }
}
/* Sipariş Al ekranına girilmese bile QR sipariş isteklerinin fark
   edilmesi için oturum boyunca çalışan, ekrandan bağımsız arka plan
   döngüsü - sadece sipariş alma yetkisi olan personelde çalışır. */
let CUSTOMER_REQ_POLL_INTERVAL = null;
function startCustomerRequestPolling(session){
  stopCustomerRequestPolling();
  if(!hasPerm(session, 'order')) return;
  refreshCustomerOrderRequests(session);
  CUSTOMER_REQ_POLL_INTERVAL = setInterval(() => {
    const s = getSession();
    if(s) refreshCustomerOrderRequests(s);
  }, 20000);
}
function stopCustomerRequestPolling(){
  if(CUSTOMER_REQ_POLL_INTERVAL){ clearInterval(CUSTOMER_REQ_POLL_INTERVAL); CUSTOMER_REQ_POLL_INTERVAL=null; }
}

/* --- Vardiya (personel giriş/çıkış) widget'ı: sidebar'da her ekranda
   görünür, herhangi bir personel kendi vardiyasını başlatıp bitirebilir. */
function shiftWidgetHtml(){
  const st = APP.shiftStatus;
  if(!st) return '<div class="shift-status">Vardiya durumu yükleniyor…</div>';
  if(st.clocked_in){
    const t = new Date(st.clock_in);
    const hh = String(t.getHours()).padStart(2,'0'), mm = String(t.getMinutes()).padStart(2,'0');
    return `<div class="shift-status on">🟢 <span class="label">Vardiyada (${hh}:${mm}'dan beri)</span></div>`
      + `<button class="sb-shift-btn out" onclick="doClockToggle()" title="Vardiyayı Bitir">⏹<span class="label"> Vardiyayı Bitir</span></button>`;
  }
  return '<div class="shift-status">⚪ <span class="label">Vardiya Dışı</span></div>'
    + '<button class="sb-shift-btn in" onclick="doClockToggle()" title="Vardiyaya Başla">▶<span class="label"> Vardiyaya Başla</span></button>';
}
async function refreshShiftWidget(session){
  const { data, error } = await sb.rpc('get_my_shift_status', { p_token: session.session_token });
  if(error) return;
  APP.shiftStatus = data;
  const el = document.getElementById('shiftWidget');
  if(el) el.innerHTML = shiftWidgetHtml();
}
async function doClockToggle(){
  const session = getSession(); if(!session) return;
  const wasClockedIn = !!(APP.shiftStatus && APP.shiftStatus.clocked_in);
  const { error } = await withLoadingOverlay(sb.rpc(wasClockedIn ? 'clock_out' : 'clock_in', { p_token: session.session_token }));
  if(error){ showToast(error.message); return; }
  showToast(wasClockedIn ? 'Vardiya bitti ✓' : 'Vardiya başladı ✓');
  await refreshShiftWidget(session);
}
async function approveCustomerRequest(id){
  const session = getSession();
  const { error } = await sb.rpc('approve_customer_order_request', { p_token: session.session_token, p_request_id: id });
  if(error){ alert(error.message); return; }
  showToast('Sipariş onaylandı, mutfağa iletildi ✓');
  refreshCustomerOrderRequests(session);
  refreshOrderLiveStatus(session);
}
async function rejectCustomerRequest(id){
  if(!confirm('Bu isteği reddetmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('reject_customer_order_request', { p_token: session.session_token, p_request_id: id });
  if(error){ alert(error.message); return; }
  refreshCustomerOrderRequests(session);
}
function renderZoneTabs(){
  const el = document.getElementById('zoneTabs'); if(!el) return;
  el.innerHTML = APP.config.zones.map(z =>
    `<div class="tab ${z.id===APP.selectedZone?'active':''}" onclick="selectZone('${z.id}')">${escapeHtml(z.name)}</div>`
  ).join('');
}
function selectZone(id){ APP.selectedZone = id; renderZoneTabs(); renderTableGrid(); }
function liveOrderForTable(tableId){
  // Paket Servis siparişleri table_id'siz olduğu için sözde bir kimlikle
  // ('pkg_<order_id>') temsil ediliyor - bu durumda order_id ile eşleştirilir.
  if(typeof tableId==='string' && tableId.indexOf('pkg_')===0 && tableId!=='pkg_new'){
    const orderId = tableId.slice(4);
    return (APP.liveOrders||[]).find(o => o.order_id===orderId);
  }
  return (APP.liveOrders||[]).find(o => o.table_id===tableId);
}
function tableStatus(t){
  const order = liveOrderForTable(t.id);
  const draft = (APP.draftCart && APP.draftCart[t.id]) || [];
  let sub = 'Boş';
  let occupied = false;
  if(order && order.items.length>0){
    occupied = true;
    const allReady = order.items.every(i => i.status==='ready');
    sub = order.items.length + ' ürün - ' + (allReady?'Hazır':'hazırlanıyor');
  }
  if(draft.length>0){ sub += (occupied?' + ':'') + draft.length+' üründe sepette'; occupied = true; }
  return { sub, occupied };
}
/* İki görünüm var: basit liste (table-grid) ve sürükle-bırak ile
   yerleştirilmiş görsel kat planı (bkz. Ayarlar > Kat Planı ve
   update_table_positions RPC'si). Yönetici konumları belirlemediyse
   (hepsi varsayılan 20,20 ise) kat planı boş/üst üste görünür - bu
   yüzden buton her zaman görünür ama kat planı ayarlanmamışsa liste
   görünümü varsayılan kalır. */
function toggleOrderTableViewMode(){
  APP.orderTableViewMode = APP.orderTableViewMode==='floorplan' ? 'grid' : 'floorplan';
  const btn = document.getElementById('tableViewModeBtn');
  if(btn) btn.textContent = APP.orderTableViewMode==='floorplan' ? '📋 Liste Görünümü' : '🗺️ Kat Planı';
  renderTableGrid();
}
function renderTableGrid(){
  const gridEl = document.getElementById('tableGrid');
  const fpEl = document.getElementById('tableFloorPlan');
  const zone = APP.config.zones.find(z => z.id===APP.selectedZone);
  if(APP.orderTableViewMode==='floorplan'){
    if(gridEl) gridEl.style.display = 'none';
    if(fpEl) fpEl.style.display = 'block';
    renderTableFloorPlan(zone, fpEl);
    return;
  }
  if(gridEl) gridEl.style.display = 'grid';
  if(fpEl) fpEl.style.display = 'none';
  const el = gridEl; if(!el) return;
  if(!zone || zone.tables.length===0){ el.innerHTML = '<p class="muted">Bu bölgede masa yok.</p>'; return; }
  el.innerHTML = zone.tables.map(t => {
    const { sub, occupied } = tableStatus(t);
    return `<div class="table-cell" style="${occupied?'background:rgba(244,63,94,.14);border-color:var(--red);color:var(--red);':''}" onclick="openTableModal('${t.id}','${escapeHtml(t.name)}')">
      ${escapeHtml(t.name)}<div style="font-size:11px;margin-top:4px;font-weight:400;">${sub}</div></div>`;
  }).join('');
}
function renderTableFloorPlan(zone, el){
  if(!el) return;
  if(!zone || zone.tables.length===0){ el.innerHTML = '<p class="muted" style="padding:10px;">Bu bölgede masa yok.</p>'; return; }
  const maxX = Math.max(200, ...zone.tables.map(t => Number(t.pos_x||0)+110));
  const maxY = Math.max(300, ...zone.tables.map(t => Number(t.pos_y||0)+110));
  el.style.minWidth = maxX+'px';
  el.style.minHeight = maxY+'px';
  el.innerHTML = zone.tables.map(t => {
    const { sub, occupied } = tableStatus(t);
    return `<div class="floorplan-table ${occupied?'occupied':''}" style="left:${Number(t.pos_x||0)}px;top:${Number(t.pos_y||0)}px;" onclick="openTableModal('${t.id}','${escapeHtml(t.name)}')">
      ${escapeHtml(t.name)}<div class="fp-sub">${sub}</div></div>`;
  }).join('');
}

/* ---- Sipariş Etiketleri (Personel Yemeği, İkram vb.) - masa/paket penceresinde checkbox'lar ---- */
function orderFlagsHtml(pseudoId){
  const flags = APP.config.order_flags || [];
  if(flags.length===0) return '';
  if(!APP.orderFlagSelections) APP.orderFlagSelections = {};
  if(!APP.orderFlagSelections[pseudoId]){
    const existing = liveOrderForTable(pseudoId);
    APP.orderFlagSelections[pseudoId] = (existing && existing.tags) ? existing.tags.slice() : [];
  }
  const sel = APP.orderFlagSelections[pseudoId];
  return `<div style="margin-top:14px;padding:10px 12px;background:var(--panel2);border-radius:10px;">
    <p class="muted" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin:0 0 8px;">Sipariş Etiketleri</p>
    <div style="display:flex;flex-wrap:wrap;gap:12px;">
      ${flags.map(f => `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
        <input type="checkbox" style="width:auto;margin:0;" ${sel.includes(f.label)?'checked':''} onchange="toggleOrderFlag('${pseudoId}','${escapeHtml(f.label)}',this.checked)">
        ${escapeHtml(f.label)}
      </label>`).join('')}
    </div>
  </div>`;
}
function toggleOrderFlag(pseudoId, label, checked){
  if(!APP.orderFlagSelections) APP.orderFlagSelections = {};
  if(!APP.orderFlagSelections[pseudoId]) APP.orderFlagSelections[pseudoId] = [];
  const sel = APP.orderFlagSelections[pseudoId];
  const idx = sel.indexOf(label);
  if(checked && idx===-1) sel.push(label);
  else if(!checked && idx!==-1) sel.splice(idx,1);
}

/* ---- Masa penceresi: ürün ekle, sepete at, mutfağa gönder ---- */
function openTableModal(tableId, tableName){
  if(!APP.draftCart) APP.draftCart = {};
  if(!APP.draftCart[tableId]) APP.draftCart[tableId] = [];
  const bg = document.createElement('div');
  bg.id = 'tableModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:28px 16px 16px;overflow-y:auto;';
  bg.onclick = (e) => { if(e.target===bg) closeTableModal(); };
  bg.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:480px;width:100%;max-height:88vh;overflow:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;">${escapeHtml(tableName)}</h2>
        <span style="cursor:pointer;color:var(--muted);font-size:20px;" onclick="closeTableModal()">✕</span>
      </div>
      <div>
        <p style="font-weight:700;margin-bottom:8px;">Ürün Ekle</p>
        <div class="tabs" id="prodStationTabs"></div>
        <div id="prodPick" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;"></div>
      </div>
      <div id="sentItemsWrap" style="margin-top:14px;"></div>
      <div id="draftItemsWrap"></div>
      ${orderFlagsHtml(tableId)}
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="ghost-btn" style="flex:1;margin-top:0;color:var(--red);border-color:var(--red);" onclick="cancelTableOrder('${tableId}')">🗑️ İptal Et</button>
        <button id="confirmBtn" style="flex:1;margin-top:0;" disabled onclick="confirmOrder('${tableId}')">✅ Onayla ve Gönder</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  bg.dataset.tableId = tableId;
  const stations = APP.config.stations;
  document.getElementById('prodStationTabs').innerHTML = stations.map((s,i) =>
    `<div class="tab ${i===0?'active':''}" data-st="${s.id}" onclick="pickStationTab('${s.id}')">${escapeHtml(s.name)}</div>`
  ).join('');
  renderProductPick(stations[0] ? stations[0].id : null, tableId);
  renderTableItems(tableId);
}
async function closeTableModal(){
  const bgEl = document.getElementById('tableModalBg');
  const tableId = bgEl ? bgEl.dataset.tableId : null;
  if(bgEl) bgEl.remove();
  if(tableId){
    await releaseDraftStock(tableId);
    // Pencere kapatılınca işaretli Sipariş Etiketleri de sıfırlanır - bir
    // sonraki açılışta (yeni sipariş için) baştan seçilmesi gerekir.
    delete APP.orderFlagSelections?.[tableId];
  }
  renderTableGrid();
}
/* Masa penceresi onaysız kapatılırsa, sepette kalan her şeyin stoğunu geri ekler. */
async function releaseDraftStock(tableId){
  const draft = APP.draftCart[tableId];
  if(!draft || draft.length===0) return;
  const session = getSession();
  const items = draft.slice();
  // Sepet ve stok göstergeleri anında (iyimser) güncellenir; sunucuya stok geri
  // ekleme istekleri paralel ve arka planda gider, işlemi bekletmez.
  APP.draftCart[tableId] = [];
  items.forEach(item => applyLocalStockDelta(item.product_id, -item.qty));
  Promise.all(items.map(item =>
    sb.rpc('adjust_stock', { p_token: session.session_token, p_product_id: item.product_id, p_delta: item.qty })
  )).then(results => {
    if(results.some(r => r.error)) console.error('Bazı stoklar geri eklenemedi, sunucu ile senkronize ediliyor.');
    scheduleConfigResync(tableId);
  }).catch(e => console.error(e));
}
/* ================= PAKET SERVİS ================= */
/* Masa siparişleriyle aynı sepet/ürün-seçim/mutfağa-gönderme altyapısını
   kullanır - tek fark "tableId" yerine 'pkg_new' (yeni sipariş) veya
   'pkg_<order_id>' (mevcut açık paket sipariş) sözde kimliği kullanılması.
   liveOrderForTable, renderProductPick, renderTableItems, addToDraft,
   changeDraftQty, cancelTableOrder, clearDraftCart bu kimliklerle zaten
   generic çalışıyor - bkz. liveOrderForTable. */
async function renderPackagesView(main, session){
  main.innerHTML = `<h1>📦 Paket Servis</h1><div class="muted" id="pkgStatus"></div><div class="table-grid" id="packageGrid"></div>`;
  const [cfgRes, liveRes] = await withLoadingOverlay(Promise.all([
    APP.config ? Promise.resolve({data:APP.config}) : sb.rpc('get_restaurant_config', { p_token: session.session_token }),
    sb.rpc('get_live_orders', { p_token: session.session_token })
  ]));
  const statusEl = document.getElementById('pkgStatus');
  if(cfgRes.error || liveRes.error){
    statusEl.textContent = 'Veri yüklenemedi: ' + ((cfgRes.error||liveRes.error).message);
    statusEl.style.color = 'var(--red)';
    return;
  }
  if(!APP.config) APP.config = cfgRes.data;
  APP.liveOrders = liveRes.data || [];
  statusEl.textContent = '';
  renderPackageGrid();
  startOrderPolling(session);
}
function renderPackageGrid(){
  const el = document.getElementById('packageGrid'); if(!el) return;
  const pkgOrders = (APP.liveOrders||[]).filter(o => o.kind==='takeaway');
  const cards = pkgOrders.map(o => {
    const total = o.items.reduce((s,i) => s+i.price*i.qty, 0);
    const allReady = o.items.length>0 && o.items.every(i => i.status==='ready');
    const label = o.customer_name || ('Paket #'+(o.daily_number||''));
    return `<div class="table-cell" style="cursor:pointer;background:rgba(244,63,94,.14);border-color:var(--red);color:var(--red);overflow-wrap:anywhere;word-break:break-word;" onclick="openPackageModal('pkg_${o.order_id}')">
      📦 ${escapeHtml(label)}<div style="font-size:11px;margin-top:4px;font-weight:400;">${o.items.length} ürün - ${allReady?'Hazır':'hazırlanıyor'} · ${money(total)}</div></div>`;
  });
  cards.push(`<div class="table-cell" style="cursor:pointer;" onclick="openPackageModal('pkg_new')">➕<div style="font-size:11px;margin-top:4px;font-weight:400;">Yeni Paket Sipariş</div></div>`);
  el.innerHTML = cards.join('');
}
function openPackageModal(pseudoId){
  if(!APP.draftCart) APP.draftCart = {};
  if(!APP.draftCart[pseudoId]) APP.draftCart[pseudoId] = [];
  const existing = pseudoId==='pkg_new' ? null : liveOrderForTable(pseudoId);
  const bg = document.createElement('div');
  bg.id = 'tableModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:28px 16px 16px;overflow-y:auto;';
  bg.onclick = (e) => { if(e.target===bg) closeTableModal(); };
  bg.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:480px;width:100%;max-height:88vh;overflow:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;overflow-wrap:anywhere;word-break:break-word;">📦 ${existing ? escapeHtml(existing.customer_name || ('Paket #'+(existing.daily_number||''))) : 'Yeni Paket Sipariş'}</h2>
        <span style="cursor:pointer;color:var(--muted);font-size:20px;" onclick="closeTableModal()">✕</span>
      </div>
      <div class="field-group"><label>Müşteri Adı</label><input id="pkgCustName" placeholder="örn. Ahmet Bey" value="${escapeHtml((existing&&existing.customer_name)||'')}"></div>
      <div class="field-group"><label>Telefon</label><input id="pkgCustPhone" placeholder="örn. 5551234567" value="${escapeHtml((existing&&existing.customer_phone)||'')}"></div>
      <div class="field-group"><label>Not</label><input id="pkgNote" placeholder="örn. Yan sokak, 2. kat" value="${escapeHtml((existing&&existing.note)||'')}"></div>
      <div style="margin-top:10px;">
        <p style="font-weight:700;margin-bottom:8px;">Ürün Ekle</p>
        <div class="tabs" id="prodStationTabs"></div>
        <div id="prodPick" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;"></div>
      </div>
      <div id="sentItemsWrap" style="margin-top:14px;"></div>
      <div id="draftItemsWrap"></div>
      ${orderFlagsHtml(pseudoId)}
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="ghost-btn" style="flex:1;margin-top:0;color:var(--red);border-color:var(--red);" onclick="cancelTableOrder('${pseudoId}')" ${existing?'':'disabled'}>🗑️ İptal Et</button>
        <button id="confirmBtn" style="flex:1;margin-top:0;" disabled onclick="confirmOrder('${pseudoId}')">✅ Onayla ve Gönder</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  bg.dataset.tableId = pseudoId;
  const stations = APP.config.stations;
  document.getElementById('prodStationTabs').innerHTML = stations.map((s,i) =>
    `<div class="tab ${i===0?'active':''}" data-st="${s.id}" onclick="pickStationTab('${s.id}')">${escapeHtml(s.name)}</div>`
  ).join('');
  renderProductPick(stations[0] ? stations[0].id : null, pseudoId);
  renderTableItems(pseudoId);
}

function pickStationTab(stId){
  document.querySelectorAll('#prodStationTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.st===stId));
  const tableId = document.getElementById('tableModalBg').dataset.tableId;
  renderProductPick(stId, tableId);
}
function effectiveStock(p){
  if(p.recipe && p.recipe.length>0) return p.available_qty;
  return p.stock;
}
function renderProductPick(stationId, tableId){
  const el = document.getElementById('prodPick'); if(!el) return;
  const prods = APP.config.products.filter(p => p.station_id===stationId);
  el.innerHTML = prods.length ? prods.map(p => {
    const stock = effectiveStock(p);
    const off = p.available===false || (stock!=null && stock<=0);
    let badge = '';
    if(p.available===false) badge = '<div style="margin-top:4px;font-size:11px;color:var(--red);">Satışta Değil</div>';
    else if(stock!=null && stock<=0) badge = '<div style="margin-top:4px;font-size:11px;color:var(--red);">Stok Yok</div>';
    else if(stock!=null && stock<=10) badge = '<div style="margin-top:4px;font-size:11px;color:var(--accent);">Son '+stock+' porsiyon</div>';
    return `
    <div class="prod-pick-card" style="background:var(--panel2);border:1px solid var(--border);border-radius:10px;padding:12px 10px;font-size:13.5px;${off?'opacity:.4;cursor:not-allowed;':'cursor:pointer;'}" ${off?'':`onclick="addToDraft('${tableId}','${p.id}')"`}>
      <div style="font-weight:700;">${escapeHtml(p.name)}</div><div class="muted" style="font-size:12px;">${money(p.price)}</div>${badge}
    </div>`;
  }).join('') : '<p class="muted">Bu istasyonda ürün yok.</p>';
}
async function refreshConfigKeepDraft(session){
  const { data } = await sb.rpc('get_restaurant_config', { p_token: session.session_token });
  if(data) APP.config = data;
}
/* Sunucudaki get_restaurant_config'in stok hesabını (floor(min(hammadde stok/oran))) client tarafında
   birebir tekrar üretir, böylece her tıklamada tam config'i yeniden çekmeye gerek kalmaz. */
function applyLocalStockDelta(productId, delta){
  const prod = APP.config.products.find(p => p.id===productId);
  if(!prod) return;
  if(prod.recipe && prod.recipe.length>0){
    const touchedIngredientIds = new Set();
    prod.recipe.forEach(r => {
      const ing = APP.config.ingredients.find(i => i.id===r.ingredient_id);
      if(ing){ ing.stock -= r.qty_per_unit*delta; touchedIngredientIds.add(ing.id); }
    });
    APP.config.products.forEach(p => {
      if(!p.recipe || !p.recipe.some(r => touchedIngredientIds.has(r.ingredient_id))) return;
      let minQty = null;
      p.recipe.forEach(r => {
        if(r.qty_per_unit<=0) return;
        const ing = APP.config.ingredients.find(i => i.id===r.ingredient_id);
        if(!ing) return;
        const q = Math.floor(ing.stock / r.qty_per_unit);
        if(minQty===null || q<minQty) minQty = q;
      });
      p.available_qty = minQty;
    });
  } else if(prod.stock!=null){
    prod.stock -= delta;
  }
}
let _configResyncTimer = null;
function scheduleConfigResync(tableId){
  clearTimeout(_configResyncTimer);
  _configResyncTimer = setTimeout(async () => {
    const session = getSession();
    if(!session) return;
    await refreshConfigKeepDraft(session);
    const bg = document.getElementById('tableModalBg');
    if(bg && bg.dataset.tableId===tableId){
      const activeTab = document.querySelector('#prodStationTabs .tab.active');
      if(activeTab) renderProductPick(activeTab.dataset.st, tableId);
    }
  }, 1500);
}
function addToDraft(tableId, productId){
  const prod = APP.config.products.find(p => p.id===productId);
  if(!prod) return;
  if(prod.available===false){ alert('Bu ürün şu anda satışta değil'); return; }
  const stock = effectiveStock(prod);
  if(stock!=null && stock<=0){ alert('Bu üründe stok kalmadı'); return; }
  const draft = APP.draftCart[tableId];
  const existing = draft.find(i => i.product_id===productId);
  if(existing){ existing.qty += 1; }
  else{ draft.push({ product_id:productId, name:prod.name, price:prod.price, cost:prod.cost, station_id:prod.station_id, qty:1, note:'' }); }
  applyLocalStockDelta(productId, 1);
  renderTableItems(tableId);
  const activeTab = document.querySelector('#prodStationTabs .tab.active');
  if(activeTab) renderProductPick(activeTab.dataset.st, tableId);
  // Sepete ekleme ekranda anında görünür; stok düşümü arka planda sunucuya gönderilir.
  const session = getSession();
  sb.rpc('adjust_stock', { p_token: session.session_token, p_product_id: productId, p_delta: -1 }).then(({error}) => {
    if(!error){ scheduleConfigResync(tableId); return; }
    alert('Ürün eklenemedi, sepetten çıkarıldı: '+error.message);
    const d = APP.draftCart[tableId];
    const it = d.find(i => i.product_id===productId);
    if(it){ it.qty -= 1; if(it.qty<=0) d.splice(d.indexOf(it),1); }
    applyLocalStockDelta(productId, -1);
    renderTableItems(tableId);
    const t = document.querySelector('#prodStationTabs .tab.active');
    if(t) renderProductPick(t.dataset.st, tableId);
  });
}
async function changeDraftQty(tableId, idx, delta){
  const draft = APP.draftCart[tableId];
  if(!draft[idx]) return;
  const item = draft[idx];
  const productId = item.product_id;
  item.qty += delta;
  if(item.qty<=0) draft.splice(idx,1);
  applyLocalStockDelta(productId, delta);
  renderTableItems(tableId);
  const activeTab = document.querySelector('#prodStationTabs .tab.active');
  if(activeTab) renderProductPick(activeTab.dataset.st, tableId);
  const session = getSession();
  const { error } = await sb.rpc('adjust_stock', { p_token: session.session_token, p_product_id: productId, p_delta: -delta });
  if(error){
    alert(error.message);
    const d = APP.draftCart[tableId];
    const existing = d.find(i => i.product_id===productId);
    if(existing){ existing.qty -= delta; if(existing.qty<=0) d.splice(d.indexOf(existing),1); }
    else if(delta<0){ d.push({ ...item, qty:-delta }); }
    applyLocalStockDelta(productId, -delta);
    renderTableItems(tableId);
    const t = document.querySelector('#prodStationTabs .tab.active');
    if(t) renderProductPick(t.dataset.st, tableId);
    return;
  }
  scheduleConfigResync(tableId);
}
function renderTableItems(tableId){
  const sentWrap = document.getElementById('sentItemsWrap');
  const draftWrap = document.getElementById('draftItemsWrap');
  const order = liveOrderForTable(tableId);
  const draft = APP.draftCart[tableId] || [];
  if(order && order.items.length>0){
    sentWrap.innerHTML = `<p style="font-weight:700;">Mutfağa Gönderilen</p>` + order.items.map(it => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span>${escapeHtml(it.name)} x${it.qty} ${it.status==='ready'?'<span style="color:var(--green);">✓ Hazır</span>':'<span class="muted">Hazırlanıyor</span>'}</span>
      </div>`).join('');
  } else { sentWrap.innerHTML = ''; }
  // Sepet (draftCart) tamamen yerel/gönderilmemiş bir durum, başka bir
  // cihazdan değişmez - bu yüzden kullanıcı şu an bir not alanına
  // yazıyorsa (bkz. arka plan canlı durum yenilemesi, refreshOrderLiveStatus,
  // 5 saniyede bir bu fonksiyonu çağırıyor) sepeti yeniden çizip
  // imleci/odağı kaybetmeyelim - yazması bitince zaten bir sonraki
  // yenilemede veya bir sepet işlemiyle güncellenir.
  if(draftWrap.contains(document.activeElement) && document.activeElement.tagName==='INPUT'){
    const confirmBtn = document.getElementById('confirmBtn');
    if(confirmBtn) confirmBtn.disabled = draft.length===0;
    return;
  }
  if(draft.length===0){
    draftWrap.innerHTML = order && order.items.length>0 ? '' : '<p class="muted">Henüz ürün eklenmedi.</p>';
  } else {
    let total=0;
    draftWrap.innerHTML = `<div style="border:1px dashed var(--accent);border-radius:10px;padding:10px;margin:10px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <p style="font-weight:700;color:var(--accent);margin:0;">Sepet (Gönderilmedi)</p>
        <button style="width:auto;padding:4px 10px;margin:0;font-size:12px;background:transparent;border:1px solid var(--red);color:var(--red);box-shadow:none;" onclick="clearDraftCart('${tableId}')">Sepeti Boşalt</button>
      </div>` +
      draft.map((it,idx) => { total += it.price*it.qty; return `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13.5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div>${escapeHtml(it.name)}</div>
              <div class="muted" style="font-size:12px;">${money(it.price*it.qty)}</div>
            </div>
            <span style="display:flex;align-items:center;gap:8px;">
              <button class="qty-btn" onclick="changeDraftQty('${tableId}',${idx},-1)">-</button>
              <span style="min-width:16px;text-align:center;font-weight:700;">${it.qty}</span>
              <button class="qty-btn" onclick="changeDraftQty('${tableId}',${idx},1)">+</button>
            </span>
          </div>
          <input type="text" placeholder="Not ekle (örn. az pişmiş, acısız...)" value="${escapeHtml(it.note||'')}" style="margin:6px 0 0;font-size:12px;padding:6px 10px;" oninput="updateDraftItemNote('${tableId}',${idx},this.value)">
        </div>`; }).join('') +
      `<div style="text-align:right;font-weight:700;margin-top:8px;">Toplam: ${money(total)}</div>
      </div>`;
  }
  const confirmBtn = document.getElementById('confirmBtn');
  if(confirmBtn) confirmBtn.disabled = draft.length===0;
}
/* Not girilirken her tuş vuruşunda tüm sepeti yeniden çizmiyoruz (yazarken
   imleç/odak kaybolmasın diye) - sadece draft dizisindeki değeri güncelliyor. */
function updateDraftItemNote(tableId, idx, value){
  const draft = APP.draftCart[tableId];
  if(draft && draft[idx]) draft[idx].note = value;
}
async function confirmOrder(tableId){
  const draft = APP.draftCart[tableId];
  if(!draft || draft.length===0) return;
  const btn = document.getElementById('confirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }
  const session = getSession();
  const items = draft.map(d => ({ product_id:d.product_id, name:d.name, price:d.price, cost:d.cost, station_id:d.station_id, qty:d.qty, note:d.note||'' }));
  const tags = (APP.orderFlagSelections && APP.orderFlagSelections[tableId]) || [];
  const isPkg = typeof tableId==='string' && tableId.indexOf('pkg_')===0;
  let error;
  if(isPkg){
    const existingOrderId = tableId==='pkg_new' ? null : tableId.slice(4);
    const nameEl = document.getElementById('pkgCustName');
    const phoneEl = document.getElementById('pkgCustPhone');
    const noteEl = document.getElementById('pkgNote');
    const res = await sb.rpc('send_takeaway_order', {
      p_token: session.session_token, p_order_id: existingOrderId, p_items: items,
      p_customer_name: nameEl ? (nameEl.value.trim()||null) : null,
      p_customer_phone: phoneEl ? (phoneEl.value.trim()||null) : null,
      p_note: noteEl ? (noteEl.value.trim()||null) : null,
      p_tags: tags
    });
    error = res.error;
  } else {
    const res = await sb.rpc('send_order', { p_token: session.session_token, p_table_id: tableId, p_items: items, p_tags: tags });
    error = res.error;
  }
  if(error){
    alert('Sipariş gönderilemedi: ' + error.message);
    if(btn){ btn.disabled = false; btn.textContent = '✅ Siparişi Onayla ve Mutfağa Gönder'; }
    return;
  }
  APP.draftCart[tableId] = [];
  // Not: Fis burada (siparis alan cihazda) degil, ilgili istasyonun kendi mutfak
  // ekraninda (yazicisi ona fiziksel olarak bagli oldugu icin) otomatik yazdiriliyor
  // - bkz. refreshKitchenItems. Farkli fiziksel bilgisayarlara bagli birden fazla
  // yazici oldugunda WebUSB sadece o an acik olan cihaza takili yaziciya erisebilir.
  const [liveRes, cfgRes] = await Promise.all([
    sb.rpc('get_live_orders', { p_token: session.session_token }),
    sb.rpc('get_restaurant_config', { p_token: session.session_token })
  ]);
  APP.liveOrders = liveRes.data || [];
  if(cfgRes.data) APP.config = cfgRes.data;
  await closeTableModal();
  if(isPkg && APP.view==='packages') renderPackagesView(document.getElementById('main'), session);
}
/* ================= YAZICI AYARLARI + MUTFAK FİŞİ ================= */
/* Yazıcı ve tasarım ayarları bu CİHAZA/tarayıcıya özeldir (localStorage) - her
   ekranın kendi fiziksel yazıcısı olabileceği için kasıtlı olarak veritabanında
   değil, sadece bu cihazda tutuluyor. */
const TICKET_FONTS = {
  'Courier New': "'Courier New', Courier, monospace",
  'Consolas': "Consolas, 'Courier New', monospace",
  'Arial': "Arial, Helvetica, sans-serif",
  'Verdana': "Verdana, Geneva, sans-serif",
  'Tahoma': "Tahoma, Geneva, sans-serif",
};
function ticketFontStack(key){ return TICKET_FONTS[key] || TICKET_FONTS['Courier New']; }
/* Fiş Tasarımı artık veritabanında, restoran genelinde tek bir ayar olarak
   tutuluyor (bkz. restaurants.ticket_design, get_restaurant_config,
   update_ticket_design) - sadece Yönetici değiştirebiliyor, ama her cihazda/
   her personelin bastığı fişte aynı şekilde uygulanıyor. Yazıcı SEÇİMİ ve
   istasyon eşleştirmesi ise (getPrinters/getStationPrinterMap) hâlâ cihaza
   özel localStorage'da kalıyor - fiziksel olarak hangi yazıcının o
   bilgisayara bağlı olduğu merkezi bir ayarla belirlenemez. */
function getTicketDesign(){
  const d = (APP.config && APP.config.ticket_design) || {};
  return {
    width: d.width || '80',
    header: d.header || '',
    footer: d.footer || '',
    fontFamily: d.fontFamily && TICKET_FONTS[d.fontFamily] ? d.fontFamily : 'Courier New',
    // Termal yazıcılarda ince/normal ağırlıklı yazı çoğunlukla silik/soluk
    // çıkıyor - bu yüzden aksi (false) kaydedilmediği sürece varsayılan kalın.
    bold: d.bold !== false,
    // Yazıcının kağıda basacağı kenarlıklar (mm) - içerik bu kadar boşluktan
    // sonra başlar/biter.
    marginTop: d.marginTop!=null ? d.marginTop : 4,
    marginRight: d.marginRight!=null ? d.marginRight : 4,
    marginBottom: d.marginBottom!=null ? d.marginBottom : 4,
    marginLeft: d.marginLeft!=null ? d.marginLeft : 4,
    showOrderNumber: d.showOrderNumber !== false,
    showItemTime: d.showItemTime !== false,
    copies: d.copies!=null ? Math.max(1, Math.min(5, d.copies)) : 1,
    // Saat ayarları: ürün satırındaki saatin biçimi/kalınlığı, genel "Kalın
    // Yazı"dan bağımsız olarak ayrıca ayarlanabiliyor.
    timeFormat: d.timeFormat==='12' ? '12' : '24',
    timeBold: d.timeBold !== false,
    showHeaderTime: !!d.showHeaderTime,
    // Fişin farklı bölümlerinin yazı renkleri (hepsi termal yazıcıda net
    // basması için varsayılan olarak tam siyah), boyutları (px) ve harf
    // stilleri (normal/BÜYÜK/küçük/İlk Harf Büyük) - tam özelleştirme.
    colorTitle: d.colorTitle || '#000000',
    colorText: d.colorText || '#000000',
    colorNote: d.colorNote || '#000000',
    colorTime: d.colorTime || '#000000',
    sizeTitle: d.sizeTitle!=null ? d.sizeTitle : 15,
    sizeText: d.sizeText!=null ? d.sizeText : 13,
    sizeNote: d.sizeNote!=null ? d.sizeNote : 11,
    sizeTime: d.sizeTime!=null ? d.sizeTime : 11,
    transformTitle: d.transformTitle || 'uppercase',
    transformText: d.transformText || 'none',
    transformNote: d.transformNote || 'none',
    transformTime: d.transformTime || 'none',
  };
}
const TICKET_DESIGN_DEFAULTS = { width:'80', header:'', footer:'', fontFamily:'Courier New', bold:true, marginTop:4, marginRight:4, marginBottom:4, marginLeft:4, showOrderNumber:true, showItemTime:true, copies:1, timeFormat:'24', timeBold:true, showHeaderTime:false, colorTitle:'#000000', colorText:'#000000', colorNote:'#000000', colorTime:'#000000', sizeTitle:15, sizeText:13, sizeNote:11, sizeTime:11, transformTitle:'uppercase', transformText:'none', transformNote:'none', transformTime:'none' };
async function setTicketDesign(d){
  const session = getSession();
  const { error } = await sb.rpc('update_ticket_design', { p_token: session.session_token, p_design: d });
  if(error){ alert(error.message); return false; }
  if(!APP.config) APP.config = {};
  APP.config.ticket_design = d;
  return true;
}
function applyTicketDesignStyle(el, design, baseClass){
  let cls = baseClass || '';
  if(design.width==='58') cls += (cls?' ':'')+'pw58';
  if(design.bold) cls += (cls?' ':'')+'ticket-bold';
  el.className = cls;
  el.style.fontFamily = ticketFontStack(design.fontFamily);
  const mt = design.marginTop!=null ? design.marginTop : 4;
  const mr = design.marginRight!=null ? design.marginRight : 4;
  const mb = design.marginBottom!=null ? design.marginBottom : 4;
  const ml = design.marginLeft!=null ? design.marginLeft : 4;
  el.style.padding = mt+'mm '+mr+'mm '+mb+'mm '+ml+'mm';
}
/* Fiş başlığı/altı notu için Word tarzı basit zengin metin araç çubuğu.
   document.execCommand eski/deprecated ama Chromium tabanlı tüm hedeflerde
   (Chrome/Edge/Electron) hâlâ çalışıyor ve tek-dosya mimariye ek kütüphane
   eklemeden bold/italic/hizalama/yazı tipi/boyut/renk desteği veriyor. */
let TICKET_RTE_SAVED_RANGE = {};
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if(!sel || sel.rangeCount===0) return;
  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const startEl = node.nodeType===1 ? node : node.parentElement;
  const box = startEl && startEl.closest ? startEl.closest('.rte-box') : null;
  if(box) TICKET_RTE_SAVED_RANGE[box.id] = range.cloneRange();
});
/* Fişin bir bölümü (Başlık/Genel Metin/Ürün Notu/Saat) için renk+boyut+harf
   stili kontrollerini tek satırda üretir - "tasarımı komple özelleştirebilme" isteği. */
function ticketTypographyRowHtml(design, key, label, isLast){
  const t = design['transform'+key] || 'none';
  return `
    <div style="display:grid;grid-template-columns:1fr 70px 1fr;gap:8px;align-items:end;padding:10px 0;${isLast?'':'border-bottom:1px solid var(--border);'}">
      <div class="field-group" style="margin:0;"><label>${label}</label>
        <input type="color" id="td_color${key}" value="${design['color'+key]}" oninput="updateTicketPreview()" style="height:40px;padding:4px;">
      </div>
      <div class="field-group" style="margin:0;"><label>Boyut</label>
        <input type="number" id="td_size${key}" min="6" max="40" value="${design['size'+key]}" oninput="updateTicketPreview()" style="padding:9px 6px;text-align:center;">
      </div>
      <div class="field-group" style="margin:0;"><label>Harf Stili</label>
        <select id="td_transform${key}" oninput="updateTicketPreview()">
          <option value="none" ${t==='none'?'selected':''}>Normal</option>
          <option value="uppercase" ${t==='uppercase'?'selected':''}>BÜYÜK HARF</option>
          <option value="lowercase" ${t==='lowercase'?'selected':''}>küçük harf</option>
          <option value="capitalize" ${t==='capitalize'?'selected':''}>İlk Harf Büyük</option>
        </select>
      </div>
    </div>`;
}
function ticketRteToolbarHtml(targetId){
  return `
    <button type="button" class="rte-btn" title="Kalın" onmousedown="event.preventDefault()" onclick="applyTicketRte('${targetId}','bold')"><b>K</b></button>
    <button type="button" class="rte-btn" title="İtalik" onmousedown="event.preventDefault()" onclick="applyTicketRte('${targetId}','italic')"><i>İ</i></button>
    <button type="button" class="rte-btn" title="Altı Çizili" onmousedown="event.preventDefault()" onclick="applyTicketRte('${targetId}','underline')"><u>A</u></button>
    <span class="rte-sep"></span>
    <button type="button" class="rte-btn" title="Sola Yasla" onmousedown="event.preventDefault()" onclick="applyTicketRte('${targetId}','justifyLeft')">⯇</button>
    <button type="button" class="rte-btn" title="Ortala" onmousedown="event.preventDefault()" onclick="applyTicketRte('${targetId}','justifyCenter')">☰</button>
    <button type="button" class="rte-btn" title="Sağa Yasla" onmousedown="event.preventDefault()" onclick="applyTicketRte('${targetId}','justifyRight')">⯈</button>
    <span class="rte-sep"></span>
    <select class="rte-select" title="Yazı Tipi" onmousedown="event.preventDefault()" onchange="applyTicketRte('${targetId}','fontName',this.value)">
      ${Object.keys(TICKET_FONTS).map(f => `<option value="${f}">${f}</option>`).join('')}
    </select>
    <select class="rte-select" title="Yazı Boyutu" onmousedown="event.preventDefault()" onchange="applyTicketRte('${targetId}','fontSize',this.value)">
      <option value="2">Küçük</option>
      <option value="3" selected>Normal</option>
      <option value="5">Büyük</option>
      <option value="7">Çok Büyük</option>
    </select>
    <input type="color" class="rte-color" title="Yazı Rengi" value="#000000" onmousedown="event.preventDefault()" onchange="applyTicketRte('${targetId}','foreColor',this.value)">
  `;
}
function applyTicketRte(targetId, cmd, value){
  const el = document.getElementById(targetId);
  if(!el) return;
  el.focus();
  const saved = TICKET_RTE_SAVED_RANGE[targetId];
  if(saved){
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(saved);
  }
  document.execCommand(cmd, false, value);
  updateTicketPreview();
}
function getPrinters(){
  try{ return JSON.parse(localStorage.getItem('rys_printers')) || []; }catch(e){ return []; }
}
function setPrinters(list){ try{ localStorage.setItem('rys_printers', JSON.stringify(list)); }catch(e){} }
function getActivePrinterId(){ try{ return localStorage.getItem('rys_active_printer_id') || ''; }catch(e){ return ''; } }
function setActivePrinterId(id){ try{ localStorage.setItem('rys_active_printer_id', id||''); }catch(e){} }
function getStationPrinterMap(){
  try{ return JSON.parse(localStorage.getItem('rys_station_printers')) || {}; }catch(e){ return {}; }
}
function setStationPrinterMap(map){ try{ localStorage.setItem('rys_station_printers', JSON.stringify(map)); }catch(e){} }
function setStationPrinter(stationId, printerId){
  const map = getStationPrinterMap();
  if(printerId) map[stationId] = printerId; else delete map[stationId];
  setStationPrinterMap(map);
  showToast('Kaydedildi ✓');
}
function printerTypeLabel(type){
  if(type==='usb') return 'USB - doğrudan';
  if(type==='silent-browser') return 'Sessiz Tarayıcı Yazdırma (kiosk-printing)';
  if(type==='electron') return 'Masaüstü Uygulaması (sessiz)';
  return 'Tarayıcı penceresi';
}
function isDesktopApp(){ return !!(window.electronAPI && window.electronAPI.isElectron); }
/* Android/iOS Capacitor kabuğu tespiti - masaüstünden ayrı, çünkü sadece
   telefon ekranında tabloların kart görünümüne dönmesini istiyoruz
   (bkz. .native-app CSS kuralları ve applyNativeTableLabels). Web'de
   window.Capacitor hiç tanımlı olmadığı için bu her zaman false döner,
   web tarafında davranış değişmez. */
function isNativeApp(){ return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
/* Native uygulamada her <table class="settings-table"> için <thead>'deki
   sütun başlıklarını okuyup ilgili <td>'lere data-label ekler - CSS'teki
   ::before kuralı bunu dar ekranda satırın üstünde etiket olarak gösterir
   (bkz. yukarıdaki .native-app medya sorgusu). Uygulama tek bir merkezi
   render() üzerinden değil, ~20 farklı ekran fonksiyonunda ayrı ayrı
   innerHTML atayarak tablo bastığı için her birine tek tek dokunmak yerine
   DOM'u izleyen tek bir gözlemci kullanılıyor - yeni eklenen her tablo da
   otomatik kapsanır. colspan'lı özet/boş-durum satırları (hücre sayısı
   başlık sayısıyla uyuşmuyorsa) etiketlenmeden atlanır. */
function applyNativeTableLabels(root){
  root.querySelectorAll('table.settings-table:not([data-labeled])').forEach(table => {
    const heads = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    if(heads.length===0) return;
    table.setAttribute('data-labeled','1');
    table.querySelectorAll('tbody tr').forEach(tr => {
      const cells = tr.children;
      if(cells.length !== heads.length) return;
      Array.from(cells).forEach((td, i) => td.setAttribute('data-label', heads[i]));
    });
  });
}
function initNativeAppMode(){
  if(!isNativeApp()) return;
  document.documentElement.classList.add('native-app');
  applyNativeTableLabels(document.body);
  const observer = new MutationObserver(() => applyNativeTableLabels(document.body));
  observer.observe(document.body, { childList: true, subtree: true });
  if(window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications) setupNativeFcmListeners();
  setupNativeBackgroundTimeout();
}
/* ---- Arka planda 15 dk kullanılmazsa otomatik çıkış (native) ----
   "rys_bg_at" (localStorage - sessionStorage'ın aksine uygulama tamamen
   kapatılıp/öldürülüp yeniden açılsa bile kalıcı) uygulama arka plana her
   geçtiğinde şimdiki zamanla güncellenir. Öne her dönüşte (App plugin'inin
   'appStateChange' olayı YA DA soğuk başlangıç - ikisi de aynı fonksiyonu
   çağırır) aradan 15 dk'dan fazla geçmişse doLogout() tetiklenir - bu,
   kullanıcı uygulamayı swipe ile kapatıp süreç tamamen öldürülse bile
   çalışır, çünkü kontrol her yeni açılışta da yapılıyor. */
const BG_AUTO_LOGOUT_MS = 15*60*1000;
function checkNativeBackgroundTimeout(){
  try{
    const bgAt = localStorage.getItem('rys_bg_at');
    localStorage.removeItem('rys_bg_at');
    if(bgAt && (Date.now() - Number(bgAt)) >= BG_AUTO_LOGOUT_MS && getSession()) doLogout();
  }catch(e){}
}
function setupNativeBackgroundTimeout(){
  checkNativeBackgroundTimeout();
  const AppPlugin = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if(!AppPlugin) return;
  AppPlugin.addListener('appStateChange', ({ isActive }) => {
    if(isActive){ checkNativeBackgroundTimeout(); }
    else { try{ localStorage.setItem('rys_bg_at', String(Date.now())); }catch(e){} }
  });
}
/* ---- Native (Android/iOS) push bildirimleri: Firebase Cloud Messaging ----
   Web Push (VAPID) Android'in WebView'inde çalışmıyor (gerçek Chrome değil,
   sınırlı bir bileşen) - bu yüzden native uygulamada tamamen ayrı bir yol
   kullanılır: @capacitor/push-notifications ile cihaz bir FCM token alır,
   bu token push_subscriptions tablosuna platform='android-fcm' olarak
   kaydedilir (bkz. save_fcm_token). Sunucu tarafında dispatch-ready-pushes.js
   bu platformu görünce web-push yerine FCM HTTP v1 API'siyle gönderir.
   Token'ı almak zaman alabileceği (native köprü + Google sunucusu) için
   register() çağrısı ile 'registration' event'i arasında bir Promise
   köprüsü kuruluyor; dinleyiciler initNativeAppMode'da BİR KEZ eklenir. */
let _fcmTokenResolve = null;
function setupNativeFcmListeners(){
  const PN = window.Capacitor.Plugins.PushNotifications;
  // FCM mesajı sunucuda 'default' kanalına gönderiliyor (bkz. api/_fcm.js) -
  // ama Android'de kanal cihazda ÖNCEDEN oluşturulmamışsa bildirim sessizce
  // hiç gösterilmiyor (channel_id vermeden Firebase'in kendi otomatik
  // kanalını kullandığımızda da bildirim görünüyordu ama o kanalda ses/
  // titreşim ayarı yoktu). Burada importance=5 (HIGH) ve vibration:true ile
  // KENDİ 'default' kanalımızı oluşturup sunucu tarafında yine bu kanal
  // id'sini kullanıyoruz - hem görünür hem sesli/titreşimli olsun diye.
  // createChannel var olan bir kanalı günceller (id aynıysa), o yüzden her
  // native başlangıçta çağırmak güvenli/idempotent.
  PN.createChannel({
    id: 'default',
    name: 'Bildirimler',
    description: 'Sipariş ve müşteri talebi bildirimleri',
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
  }).catch(() => {});
  PN.addListener('registration', (token) => {
    if(_fcmTokenResolve){ _fcmTokenResolve(token.value); _fcmTokenResolve = null; }
  });
  PN.addListener('registrationError', () => {
    if(_fcmTokenResolve){ _fcmTokenResolve(null); _fcmTokenResolve = null; }
  });
  // Bildirime dokunulunca (uygulama arka planda/kapalıyken) ilgili ekrana
  // git - web tarafındaki service worker'ın notificationclick mesajıyla aynı iş.
  PN.addListener('pushNotificationActionPerformed', (action) => {
    const data = action && action.notification && action.notification.data;
    const session = getSession();
    if(data && data.view && session){
      const item = NAV_ITEMS.find(i => i.view===data.view);
      if(item && navItemVisible(item, session)){ APP.view = data.view; render(); }
    }
  });
}
function requestNativeFcmToken(){
  const PN = window.Capacitor.Plugins.PushNotifications;
  return new Promise(resolve => {
    _fcmTokenResolve = resolve;
    PN.register();
    setTimeout(() => { if(_fcmTokenResolve){ _fcmTokenResolve(null); _fcmTokenResolve = null; } }, 10000);
  });
}
function getSavedFcmToken(){ try{ return localStorage.getItem('rys_fcm_token')||''; }catch(e){ return ''; } }
function setSavedFcmToken(t){ try{ if(t) localStorage.setItem('rys_fcm_token', t); else localStorage.removeItem('rys_fcm_token'); }catch(e){} }
function resolvePrinterForStation(stationId){
  const printers = getPrinters();
  const map = getStationPrinterMap();
  if(stationId && map[stationId]){
    const p = printers.find(x => x.id===map[stationId]);
    if(p) return p;
  }
  return printers.find(p => p.id===getActivePrinterId()) || null;
}
function getKitchenBellSounds(){
  try{ return JSON.parse(localStorage.getItem('rys_bell_sounds')) || { default:null, perStation:{} }; }
  catch(e){ return { default:null, perStation:{} }; }
}
function setKitchenBellSounds(obj){
  try{ localStorage.setItem('rys_bell_sounds', JSON.stringify(obj)); }
  catch(e){ alert('Ses kaydedilemedi (depolama alanı yetersiz olabilir): '+e.message); }
}
function resolveBellSetting(stationId){
  const sounds = getKitchenBellSounds();
  if(stationId && sounds.perStation && sounds.perStation[stationId]) return sounds.perStation[stationId];
  return sounds.default || null;
}

async function renderPrinterSettingsView(main, session){
  // Mutfak rolündeki kullanıcıların menüsünde "Sipariş Al"/"Ayarlar" yok -
  // bu yüzden APP.config hiç yüklenmemiş olabilir (istasyon listesi burada
  // kullanılıyor). Eksikse burada da yüklenir; önceden bu eksiklik sayfanın
  // hiç açılmamasına/"geç gelmesine" yol açıyordu.
  if(!APP.config){
    const { data, error } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token }));
    if(error){ main.innerHTML = '<h1>Yazıcı Ayarları</h1><p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
    APP.config = data;
  }
  const design = getTicketDesign();
  const printers = getPrinters();
  const activeId = getActivePrinterId();
  const stationPrinterMap = getStationPrinterMap();
  const usbSupported = !!(navigator.usb);
  main.innerHTML = `
    <h1>Yazıcı Ayarları <span class="role-badge" style="margin-left:6px;vertical-align:middle;">Sadece Yönetici</span></h1>
    <div style="background:rgba(0,143,168,.1);border:1.5px solid var(--accent);border-radius:10px;padding:12px 14px;margin-bottom:16px;text-align:left;">
      <p style="margin:0;font-weight:700;font-size:13px;">✓ Fiş Tasarımı artık tüm işletmede ortak — burada kaydettiğiniz tasarım, hangi cihazdan/kim basarsa bassın her fişte aynı şekilde uygulanır.</p>
      <p class="muted" style="margin:8px 0 0;text-align:left;font-size:12px;">⚠️ <b>Yazıcılar</b> ve <b>İstasyon → Yazıcı Eşleştirme</b> ise hâlâ <u>şu an bu ekranı açtığınız cihaza</u> özeldir (bir yazıcı fiziksel olarak hangi bilgisayara bağlıysa fiş oradan basılır, bu merkezi bir ayarla belirlenemez). Yeni bir kasa/mutfak bilgisayarı kurduğunuzda, o bilgisayarda da Yönetici olarak giriş yapıp yazıcı seçimini orada tekrar yapmanız gerekir.</p>
    </div>

    <div class="box" style="max-width:none;">
      <h2>Fiş Tasarımı</h2>
      <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;">
        <div style="flex:1;min-width:280px;">

          <div class="settings-section">
            <p class="settings-section-title">📄 Kağıt &amp; Yazı Tipi</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div class="field-group"><label>Kağıt Genişliği</label>
                <select id="td_width" oninput="updateTicketPreview()">
                  <option value="58" ${design.width==='58'?'selected':''}>58mm</option>
                  <option value="80" ${design.width==='80'?'selected':''}>80mm</option>
                </select>
              </div>
              <div class="field-group"><label>Yazı Tipi (ürün satırları)</label>
                <select id="td_font" oninput="updateTicketPreview()">
                  ${Object.keys(TICKET_FONTS).map(f => `<option value="${f}" ${design.fontFamily===f?'selected':''}>${f}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="toggle-row" style="border-bottom:none;padding-bottom:0;">
              <div><div class="toggle-label">Kalın Yazı (ürün satırları)</div><div class="toggle-desc">Çıktı silik/soluk çıkıyorsa açık bırakın — termal yazıcılarda ince yazı genelde net basmıyor.</div></div>
              <label class="toggle-switch"><input type="checkbox" id="td_bold" ${design.bold?'checked':''} oninput="updateTicketPreview()"><span class="slider"></span></label>
            </div>
          </div>

          <div class="settings-section">
            <p class="settings-section-title">✍️ Fiş İçeriği</p>
            <label style="display:block;font-size:12.5px;font-weight:700;color:var(--muted);">Fiş Başlığında Ek Not (opsiyonel)</label>
            <div class="rte-toolbar" data-target="td_header">${ticketRteToolbarHtml('td_header')}</div>
            <div id="td_header" class="rte-box" contenteditable="true" data-placeholder="örn. Şube: Merkez" oninput="updateTicketPreview()">${sanitizeRichHtml(design.header||'')}</div>

            <label style="display:block;margin-top:14px;font-size:12.5px;font-weight:700;color:var(--muted);">Fiş Altında Ek Not (opsiyonel)</label>
            <div class="rte-toolbar" data-target="td_footer">${ticketRteToolbarHtml('td_footer')}</div>
            <div id="td_footer" class="rte-box" contenteditable="true" data-placeholder="örn. Afiyet olsun!" oninput="updateTicketPreview()">${sanitizeRichHtml(design.footer||'')}</div>

            <div style="margin-top:14px;">
              <div class="toggle-row">
                <div class="toggle-label">Sipariş Numarasını Göster</div>
                <label class="toggle-switch"><input type="checkbox" id="td_showOrderNumber" ${design.showOrderNumber?'checked':''} oninput="updateTicketPreview()"><span class="slider"></span></label>
              </div>
              <div class="toggle-row">
                <div class="toggle-label">Ürün Saatlerini Göster</div>
                <label class="toggle-switch"><input type="checkbox" id="td_showItemTime" ${design.showItemTime?'checked':''} oninput="updateTicketPreview()"><span class="slider"></span></label>
              </div>
              <div class="toggle-row">
                <div class="toggle-label">Fişin Üstünde Saat Göster</div>
                <label class="toggle-switch"><input type="checkbox" id="td_showHeaderTime" ${design.showHeaderTime?'checked':''} oninput="updateTicketPreview()"><span class="slider"></span></label>
              </div>
              <div class="toggle-row" style="border-bottom:none;">
                <div><div class="toggle-label">Kopya Sayısı</div><div class="toggle-desc">Masaüstü uygulaması/USB yazıcıda her fiş bu kadar kez basılır.</div></div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <button type="button" class="chip-btn" style="padding:4px 12px;" onclick="stepTicketCopies(-1)">−</button>
                  <span id="td_copiesVal" style="min-width:14px;text-align:center;font-weight:700;">${design.copies}</span>
                  <button type="button" class="chip-btn" style="padding:4px 12px;" onclick="stepTicketCopies(1)">+</button>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <p class="settings-section-title">⏰ Saat Ayarı</p>
            <div class="field-group"><label>Saat Formatı</label>
              <select id="td_timeFormat" oninput="updateTicketPreview()">
                <option value="24" ${design.timeFormat==='24'?'selected':''}>24 Saat (17:05)</option>
                <option value="12" ${design.timeFormat==='12'?'selected':''}>12 Saat (05:05 ÖS)</option>
              </select>
            </div>
            <div class="toggle-row" style="border-bottom:none;">
              <div><div class="toggle-label">Saat Kalın Yazılsın</div><div class="toggle-desc">"Kalın Yazı" ürün adı ayarından bağımsız — saat silik çıkıyorsa açık bırakın.</div></div>
              <label class="toggle-switch"><input type="checkbox" id="td_timeBold" ${design.timeBold?'checked':''} oninput="updateTicketPreview()"><span class="slider"></span></label>
            </div>
          </div>

          <div class="settings-section">
            <p class="settings-section-title">🎨 Yazı Tipi Özelleştirme</p>
            <p class="muted" style="text-align:left;font-size:11.5px;margin:0 0 4px;">Fişin her bölümü için renk, boyut ve harf stilini ayrı ayrı belirleyin.</p>
            ${ticketTypographyRowHtml(design,'Title','Başlık (işletme adı)')}
            ${ticketTypographyRowHtml(design,'Text','Genel Metin (tarih, masa, ürünler)')}
            ${ticketTypographyRowHtml(design,'Note','Ürün Notu')}
            ${ticketTypographyRowHtml(design,'Time','Saat', true)}
            <p class="muted" style="text-align:left;font-size:11.5px;margin-top:10px;">Renkleri koyu, boyutları makul tutun — termal yazıcılar açık/pastel renkleri veya çok büyük yazıları net basamayabilir.</p>
          </div>

          <div class="settings-section">
            <p class="settings-section-title">📐 Yazıcı Kenar Boşlukları</p>
            <div class="chip-row" style="margin-bottom:10px;">
              <button type="button" class="chip-btn" onclick="applyMarginPreset(2)">Dar (2mm)</button>
              <button type="button" class="chip-btn" onclick="applyMarginPreset(4)">Normal (4mm)</button>
              <button type="button" class="chip-btn" onclick="applyMarginPreset(8)">Geniş (8mm)</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div class="field-group"><label>Üst</label><input id="td_mtop" type="number" min="0" max="30" step="0.5" value="${design.marginTop}" oninput="updateTicketPreview()"></div>
              <div class="field-group"><label>Alt</label><input id="td_mbottom" type="number" min="0" max="30" step="0.5" value="${design.marginBottom}" oninput="updateTicketPreview()"></div>
              <div class="field-group"><label>Sol</label><input id="td_mleft" type="number" min="0" max="30" step="0.5" value="${design.marginLeft}" oninput="updateTicketPreview()"></div>
              <div class="field-group"><label>Sağ</label><input id="td_mright" type="number" min="0" max="30" step="0.5" value="${design.marginRight}" oninput="updateTicketPreview()"></div>
            </div>
          </div>

          <div style="display:flex;gap:10px;margin-top:16px;">
            <button style="flex:1;margin-top:0;" onclick="saveTicketDesign()">Tasarımı Kaydet</button>
            <button class="ghost-btn" style="flex:1;margin-top:0;" onclick="resetTicketDesign()">Varsayılana Sıfırla</button>
          </div>
        </div>
        <div style="position:sticky;top:16px;">
          <p class="muted" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin:0 0 8px;">Önizleme</p>
          <div id="ticketPreviewWrap" style="background:#e9e9ec;border-radius:10px;padding:16px;display:flex;justify-content:center;">
            <div id="ticketPreview"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="box" style="max-width:none;">
      <h2>Bu Ekranın Yazıcısı</h2>
      <p class="muted" style="text-align:left;">Hangi yazıcı seçiliyse, mutfağa sipariş gönderildiğinde fiş <b>doğrudan ona</b> (pencere açmadan) gönderilmeye çalışılır. Uygun bir USB yazıcı bulunamazsa otomatik olarak tarayıcının yazdırma penceresine döner.</p>
      <select id="activePrinterSelect" onchange="setActivePrinterId(this.value)" style="max-width:320px;">
        <option value="" ${!activeId?'selected':''}>Tarayıcı Yazdırma Penceresi (varsayılan)</option>
        ${printers.map(p => `<option value="${p.id}" ${p.id===activeId?'selected':''}>${escapeHtml(p.name)} (${printerTypeLabel(p.type)})</option>`).join('')}
      </select>
    </div>

    <div class="box" style="max-width:none;">
      <h2>Yazıcılar</h2>
      ${!usbSupported ? '<p class="muted" style="text-align:left;">⚠️ Bu tarayıcı USB yazıcı bağlantısını (WebUSB) desteklemiyor — Chrome veya Edge kullanmanız gerekiyor. Yine de "Tarayıcı Yazdırma Penceresi" tipinde yazıcı ekleyebilirsiniz.</p>' : ''}
      <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>Ad</th><th>Tür</th><th></th></tr></thead>
        <tbody>
        ${printers.map(p => `
          <tr>
            <td class="col-name">${escapeHtml(p.name)}</td>
            <td class="col-name">${p.type==='usb' ? '🔌 USB (doğrudan)' : (p.type==='silent-browser' ? '🤫 Sessiz Tarayıcı Yazdırma' : (p.type==='electron' ? '💻 Masaüstü Uygulaması' : '🖨️ Tarayıcı penceresi'))}${p.type==='electron' && p.osPrinterName ? ' <span class="muted">('+escapeHtml(p.osPrinterName)+')</span>' : ''}</td>
            <td style="white-space:nowrap;">
              ${p.type==='usb' ? `<button class="sbtn" onclick="reconnectUsbPrinter('${p.id}')">Bağlan</button>` : ''}
              <button class="sbtn" onclick="testPrintPrinter('${p.id}')">Test Yazdır</button>
              <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="removePrinterEntry('${p.id}')">Sil</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
      ${!isDesktopApp() ? `<p class="muted" style="text-align:left;margin-top:10px;font-size:12px;background:var(--panel2);border-radius:8px;padding:10px;">💻 Bu ekran şu an tarayıcıda açık. <b>Masaüstü Uygulaması</b> (Windows/macOS) yazıcıya hiçbir pencere açmadan, ekstra ayara gerek kalmadan basabiliyor — kurulursa "Masaüstü Uygulaması" tipini seçebilirsiniz.</p>` : ''}
      <div class="add-row-panel">
        <p>Yeni Yazıcı Ekle</p>
        <div style="display:grid;grid-template-columns:2fr 1.4fr auto;gap:10px;align-items:end;">
          <div class="field-group"><label>Yazıcı Adı</label><input id="np_pname" placeholder="örn. Mutfak Yazıcısı"></div>
          <div class="field-group"><label>Bağlantı Türü</label>
            <select id="np_ptype" onchange="onNewPrinterTypeChange()">
              <option value="electron" ${isDesktopApp()?'selected':''}>Masaüstü Uygulaması (sessiz, önerilir)</option>
              <option value="browser" ${isDesktopApp()?'':'selected'}>Tarayıcı Yazdırma Penceresi (her seferinde açılır)</option>
              <option value="usb" ${usbSupported?'':'disabled'}>USB (doğrudan, deneysel - küçük termal fiş yazıcıları için)</option>
              <option value="silent-browser">Sessiz Tarayıcı Yazdırma (normal/ofis yazıcıları için, kiosk-printing gerekir)</option>
            </select>
          </div>
          <button style="width:auto;" onclick="addPrinterEntry()">+ Ekle</button>
        </div>
        <div id="npElectronWrap" class="field-group" style="margin-top:10px;"></div>
      </div>
      <p class="muted" style="text-align:left;margin-top:14px;font-size:12px;">
        Not: <b>USB (doğrudan)</b> yalnızca standart bir USB arayüzü üzerinden ham komut kabul eden küçük termal
        fiş yazıcılarında çalışır — Xerox, HP, Canon gibi normal/ofis yazıcılarının USB arayüzü işletim sisteminin
        kendi sürücüsünde olduğu için tarayıcı (WebUSB) bu tür yazıcılara asla erişemez, "USB" tipini seçseniz bile
        çalışmaz. Normal bir yazıcınız varsa ve masaüstü uygulamasını kuramıyorsanız <b>"Sessiz Tarayıcı Yazdırma"</b>
        seçin ve o bilgisayarda şunları yapın: (1) bu yazıcıyı işletim sisteminde <b>varsayılan yazıcı</b> yapın,
        (2) Chrome/Edge'i <code>--kiosk-printing</code> bayrağıyla başlatın (kısayolun hedefine ekleyin, örn.
        <code>"...\chrome.exe" --kiosk-printing</code>). <b>Masaüstü Uygulaması</b> kuruluysa bu iki adıma hiç gerek
        kalmadan aynı şekilde sessizce basar.
      </p>
    </div>

    <div class="box" style="max-width:none;">
      <h2>İstasyon → Yazıcı Eşleştirme</h2>
      <p class="muted" style="text-align:left;">Her istasyonun ürünleri hangi yazıcıya basılsın? Örneğin Çayhane'nin ürünleri (çay, su, tiramisu gibi) bir yazıcıya, Izgara'nın ürünleri (döner, köfte gibi) başka bir yazıcıya gidebilir. Bir istasyona yazıcı seçmezseniz o istasyonun fişi "Bu Ekranın Yazıcısı" seçimini kullanır. Sipariş onaylandığında her istasyon için ayrı bir fiş kendi yazıcısına gönderilir.</p>
      <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>İstasyon</th><th>Yazıcı</th></tr></thead>
        <tbody>
        ${APP.config.stations.map(s => `
          <tr>
            <td class="col-name">${escapeHtml(s.icon||'🍳')} ${escapeHtml(s.name)}</td>
            <td>
              <select onchange="setStationPrinter('${s.id}', this.value)">
                <option value="">Varsayılan (Bu Ekranın Yazıcısı)</option>
                ${printers.map(p => `<option value="${p.id}" ${stationPrinterMap[s.id]===p.id?'selected':''}>${escapeHtml(p.name)} (${printerTypeLabel(p.type)})</option>`).join('')}
              </select>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>
  `;
  updateTicketPreview();
  onNewPrinterTypeChange();
}
async function renderNotificationSettingsView(main, session){
  if(!APP.config){
    const { data, error } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token }));
    if(error){ main.innerHTML = '<h1>Bildirim Ayarları</h1><p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
    APP.config = data;
  }
  main.innerHTML = `
    <h1>Bildirim Ayarları</h1>
    <p class="muted" style="text-align:left;">Bu ayarlar sadece <b>bu ekrana/tarayıcıya</b> özeldir — her cihazda ayrı ayrı yapılandırılır, veritabanına kaydedilmez.</p>

    <div class="box" style="max-width:none;">
      <h2>📱 Push Bildirimleri (Uygulama Kapalıyken de)</h2>
      <p class="muted" style="text-align:left;">Açarsanız, hazır bekleyen siparişiniz olduğunda bu cihaza — tarayıcı/uygulama kapalı olsa bile — bildirim göndeririz.</p>
      <p id="pushStatusText" class="muted" style="font-size:13px;margin:10px 0;"></p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button id="pushToggleBtn" style="max-width:260px;" onclick="togglePushNotifications()">Kontrol ediliyor...</button>
        <button id="testPushBtn" class="sbtn" style="width:auto;max-width:260px;" onclick="sendTestPush()">🔔 Test Bildirimi Gönder</button>
      </div>
      <p id="testPushResult" class="muted" style="font-size:12px;margin-top:8px;"></p>
    </div>

    <div class="box" style="max-width:none;">
      <h2>🔔 Bildirim Sesi (Yeni Sipariş Zili)</h2>
      <p class="muted" style="text-align:left;">Mutfağa yeni bir sipariş düştüğünde bu ekranda çalacak sesi özelleştirebilirsiniz. Bir istasyon seçip kendi ses dosyanızı yükleyerek o istasyona özel bir zil sesi de tanımlayabilirsiniz (örn. Izgara için ayrı, Çayhane için ayrı).</p>
      <div class="field-group" style="max-width:320px;"><label>Kapsam</label>
        <select id="bellScopeSelect" onchange="updateBellScopeStatus()">
          <option value="">Varsayılan (istasyona özel ses yoksa kullanılır)</option>
          ${APP.config.stations.map(s => `<option value="${s.id}">${escapeHtml(s.icon||'🍳')} ${escapeHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <p id="bellScopeStatus" class="muted" style="margin:10px 0;font-size:13px;"></p>
      <div class="field-group"><label>Hazır Zil Sesleri</label></div>
      <div id="bellPresetList" class="bell-grid"></div>
      <p class="muted" style="font-size:12px;margin:14px 0 6px;">İsterseniz kendi ses dosyanızı da yükleyebilirsiniz (yukarıdaki hazır seslerin yerine kullanılır):</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <label class="sbtn" style="width:auto;cursor:pointer;display:inline-flex;align-items:center;">
          🎵 Ses Dosyası Yükle
          <input id="bellFileInput" type="file" accept="audio/*" style="display:none;" onchange="uploadBellSound()">
        </label>
        <button class="sbtn" style="width:auto;" onclick="testBellSound()">▶️ Seçili Sesi Test Et</button>
        <button class="sbtn" style="width:auto;background:var(--red);color:var(--btn-ink);" onclick="resetBellSound()">Sıfırla (Varsayılan Zil)</button>
      </div>
      <p class="muted" style="text-align:left;margin-top:14px;font-size:12px;">
        Not: Dosya boyutu en fazla 800KB olmalı (kısa bir bildirim sesi yeterlidir). Tarayıcılar otomatik ses çalmayı
        kısıtladığı için, bu ekranda bir istasyon seçtiğinizde (mutfak ekranında) ses izni otomatik olarak alınır —
        sekmeyi hiç tıklamadan açık bıraktıysanız ilk sipariş zili çalmayabilir.
      </p>
    </div>
  `;
  updateBellScopeStatus();
  initPushUI();
}
/* ---- Web Push: uygulama/tarayıcı kapalıyken de bildirim ---- */
function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i=0;i<rawData.length;i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
async function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return null;
  try{ return await navigator.serviceWorker.register('/app/sw.js'); }
  catch(e){ return null; }
}
async function initPushUI(){
  const btn = document.getElementById('pushToggleBtn');
  const statusText = document.getElementById('pushStatusText');
  if(!btn || !statusText) return;
  if(isNativeApp()){
    const PN = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if(!PN){
      statusText.textContent = 'Bu uygulama sürümü bildirim desteklemiyor, lütfen güncelleyin.';
      btn.style.display = 'none';
      return;
    }
    const perm = await PN.checkPermissions();
    if(perm.receive === 'denied'){
      statusText.textContent = 'Bildirim izni engellenmiş. Telefonun Ayarlar > Uygulamalar > Peyktan > Bildirimler kısmından izin vermeniz gerekiyor.';
      btn.style.display = 'none';
      return;
    }
    updatePushUI(perm.receive==='granted' && !!getSavedFcmToken());
    return;
  }
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    statusText.textContent = 'Bu tarayıcı/cihaz push bildirimlerini desteklemiyor.';
    btn.style.display = 'none';
    return;
  }
  if(Notification.permission === 'denied'){
    statusText.textContent = 'Bildirim izni engellenmiş. Tarayıcı/site ayarlarından izin vermeniz gerekiyor.';
    btn.style.display = 'none';
    return;
  }
  const reg = await registerServiceWorker();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  updatePushUI(!!sub);
}
function updatePushUI(subscribed){
  const btn = document.getElementById('pushToggleBtn');
  const statusText = document.getElementById('pushStatusText');
  if(!btn || !statusText) return;
  if(subscribed){
    statusText.textContent = '✓ Bu cihazda push bildirimleri açık.';
    btn.textContent = 'Bildirimleri Kapat';
  } else {
    statusText.textContent = 'Bu cihazda push bildirimleri kapalı.';
    btn.textContent = 'Bildirimleri Aç';
  }
}
async function togglePushNotifications(){
  const statusText = document.getElementById('pushStatusText');
  // pushStatusText sadece Bildirim Ayarları ekranında var - bu fonksiyon
  // artık girişten hemen sonra otomatik da çağrılabildiği için (bkz.
  // maybeShowPushPrompt), o ekranda değilken hata/durum mesajları toast
  // olarak gösterilir.
  const setStatus = (msg) => { if(statusText) statusText.textContent = msg; else showToast(msg); };
  const session = getSession();
  if(isNativeApp()){
    const PN = window.Capacitor.Plugins.PushNotifications;
    const saved = getSavedFcmToken();
    if(saved){
      await sb.rpc('remove_push_subscription', { p_token: session.session_token, p_endpoint: saved });
      setSavedFcmToken('');
      updatePushUI(false);
      showToast('Push bildirimleri kapatıldı');
      return;
    }
    const permReq = await PN.requestPermissions();
    if(permReq.receive !== 'granted'){ setStatus('Bildirim izni verilmedi.'); return; }
    const token = await requestNativeFcmToken();
    if(!token){ setStatus('Cihaz kaydı alınamadı, lütfen tekrar deneyin.'); return; }
    const { error } = await sb.rpc('save_fcm_token', { p_token: session.session_token, p_fcm_token: token });
    if(error){ setStatus('Kaydedilemedi: ' + error.message); return; }
    setSavedFcmToken(token);
    updatePushUI(true);
    showToast('Push bildirimleri açıldı ✓');
    return;
  }
  const reg = await registerServiceWorker();
  if(!reg){ setStatus('Servis çalışanı (service worker) kaydedilemedi.'); return; }
  const existing = await reg.pushManager.getSubscription();
  if(existing){
    await sb.rpc('remove_push_subscription', { p_token: session.session_token, p_endpoint: existing.endpoint });
    await existing.unsubscribe();
    updatePushUI(false);
    showToast('Push bildirimleri kapatıldı');
    return;
  }
  const permission = await Notification.requestPermission();
  if(permission !== 'granted'){
    setStatus('Bildirim izni verilmedi.');
    return;
  }
  let sub;
  try{
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }catch(e){
    setStatus('Abonelik oluşturulamadı: ' + e.message);
    return;
  }
  const subJson = sub.toJSON();
  const { error } = await sb.rpc('save_push_subscription', {
    p_token: session.session_token,
    p_endpoint: subJson.endpoint,
    p_p256dh: subJson.keys.p256dh,
    p_auth: subJson.keys.auth
  });
  if(error){ setStatus('Kaydedilemedi: ' + error.message); return; }
  updatePushUI(true);
  showToast('Push bildirimleri açıldı ✓');
}
/* Cron'un 5 dk'lık döngüsünü beklemeden aninda bir test push'u tetikler -
   "gönderildi ama cihaza gelmedi" durumunda sorunun sunucu tarafında mı
   (abonelik/VAPID) yoksa cihaz/işletim sistemi bildirim izninde mi olduğunu
   ayırt etmeye yarar. */
async function sendTestPush(){
  const resultEl = document.getElementById('testPushResult');
  const btn = document.getElementById('testPushBtn');
  const session = getSession();
  // Kendi cihazının abonelik uç noktasını (native'de FCM token, webte
  // PushSubscription.endpoint) sunucuya gönderiyoruz ki test bildirimi SADECE
  // bu cihaza gitsin - aksi halde aynı kullanıcının başka bir cihazda (örn.
  // hâlâ açık bir tarayıcı sekmesi) kayıtlı eski aboneliği de bildirimi alır
  // ve "telefondan gönderdim ama tarayıcıya geldi" yanılgısına yol açar.
  const deviceEndpoint = isNativeApp()
    ? getSavedFcmToken()
    : await registerServiceWorker().then(reg => reg ? reg.pushManager.getSubscription() : null).then(sub => sub ? sub.endpoint : '');
  if(!deviceEndpoint){
    resultEl.textContent = 'Bu cihazda push bildirimleri açık değil - önce "Bildirimleri Aç" butonuna basın.';
    return;
  }
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  resultEl.textContent = '';
  const { error } = await sb.rpc('send_test_push', { p_token: session.session_token, p_endpoint: deviceEndpoint });
  btn.disabled = false; btn.textContent = '🔔 Test Bildirimi Gönder';
  if(error){ resultEl.textContent = 'Gönderilemedi: ' + error.message; return; }
  resultEl.textContent = 'Test isteği gönderildi ✓ Birkaç saniye içinde bir bildirim görmelisiniz. Gelmezse: tarayıcının/işletim sisteminin bu site için bildirim iznini (kilit simgesi → Bildirimler → İzin Ver) ve bilgisayarınızın "Rahatsız Etmeyin/Odaklanma" modunun kapalı olduğunu kontrol edin.';
}
/* ---- Girişten sonra bildirimleri otomatik açmayı dene ----
   Ayarlar > Bildirimler'e gidip butona basmayı ya da bizim kendi
   "açmak ister misiniz?" banner'ımıza tıklamayı beklemek yerine, karar
   verilmemişse (izin durumu hâlâ 'default'/'prompt') girişten hemen sonra
   doğrudan izin isteğini (tarayıcı/işletim sisteminin KENDİ Aç/Reddet
   diyaloğu) tetikleyip aboneliği açıyoruz - bizim ekstra bir onay adımımız
   yok, tek adım o sistem diyaloğu. İzin zaten verilmişse (daha önce açılmış)
   yine de sunucudaki kaydı SESSİZCE tazeliyoruz (izin tekrar sorulmadan) -
   çünkü aynı kullanıcıyla başka bir cihazdan giriş yapılınca login_staff
   artık BÜTÜN push_subscriptions satırlarını temizliyor ("başka yerden
   giriş yapılınca diğer cihaz bildirim almasın" isteği), bu da mevcut
   cihazın kendi kaydını da siler - o kayıt burada geri yüklenmezse cihaz
   izni açık göründüğü hâlde sessizce bildirim almaz duruma düşerdi. İzin
   reddedilmişse hiç dokunulmaz. Electron'da da (window.Notification
   destekli) aynı şekilde çalışır. */
function maybeShowPushPrompt(session){
  if(!session) return;
  if(isNativeApp()){
    const PN = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if(!PN) return;
    PN.checkPermissions().then(perm => {
      if(perm.receive === 'granted'){ resyncNativePushSubscription(session); return; }
      if(perm.receive !== 'prompt' && perm.receive !== 'prompt-with-rationale') return;
      togglePushNotifications();
    });
    return;
  }
  if(!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  if(Notification.permission === 'granted'){ resyncWebPushSubscription(session); return; }
  if(Notification.permission !== 'default') return;
  togglePushNotifications();
}
async function resyncNativePushSubscription(session){
  const token = await requestNativeFcmToken();
  if(!token) return;
  const { error } = await sb.rpc('save_fcm_token', { p_token: session.session_token, p_fcm_token: token });
  if(!error) setSavedFcmToken(token);
}
async function resyncWebPushSubscription(session){
  const reg = await registerServiceWorker();
  if(!reg) return;
  let sub = await reg.pushManager.getSubscription();
  if(!sub){
    try{ sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }); }
    catch(e){ return; }
  }
  const subJson = sub.toJSON();
  await sb.rpc('save_push_subscription', { p_token: session.session_token, p_endpoint: subJson.endpoint, p_p256dh: subJson.keys.p256dh, p_auth: subJson.keys.auth });
}
function currentBellScope(){ const el = document.getElementById('bellScopeSelect'); return el ? el.value : ''; }
function updateBellScopeStatus(){
  const statusEl = document.getElementById('bellScopeStatus'); if(!statusEl) return;
  const scope = currentBellScope();
  const sounds = getKitchenBellSounds();
  const val = scope ? sounds.perStation[scope] : sounds.default;
  let text;
  if(!val) text = 'Bu kapsam için varsayılan zil ("' + BELL_PRESETS.classic.name + '") çalınacak.';
  else if(typeof val==='string') text = '✓ Bu kapsam için yüklediğiniz özel ses dosyası çalınacak.';
  else text = '✓ Bu kapsam için "' + (BELL_PRESETS[val.preset] ? BELL_PRESETS[val.preset].name : val.preset) + '" sesi seçili.';
  statusEl.textContent = text;
  renderBellPresetList();
}
function renderBellPresetList(){
  const el = document.getElementById('bellPresetList'); if(!el) return;
  const scope = currentBellScope();
  const sounds = getKitchenBellSounds();
  const val = scope ? sounds.perStation[scope] : sounds.default;
  const isCustomActive = typeof val==='string' && !!val;
  const activePresetId = isCustomActive ? null : ((val && typeof val==='object' && val.preset) ? val.preset : (!val ? 'classic' : null));
  const customCardHtml = isCustomActive ? `<div class="bell-card active">
      <span class="bell-card-check">✓</span>
      <div class="bell-card-icon">🎵</div>
      <div class="bell-card-name">Yüklediğiniz Ses Dosyası</div>
      <button type="button" class="bell-card-play" onclick="event.stopPropagation();testBellSound()" title="Dinle">▶</button>
    </div>` : '';
  el.innerHTML = customCardHtml + Object.keys(BELL_PRESETS).map(id => {
    const p = BELL_PRESETS[id];
    const active = id===activePresetId;
    return `<div class="bell-card ${active?'active':''}" onclick="selectBellPreset('${id}')">
      ${active?'<span class="bell-card-check">✓</span>':''}
      <div class="bell-card-icon">${p.icon||'🔔'}</div>
      <div class="bell-card-name">${escapeHtml(p.name)}</div>
      <button type="button" class="bell-card-play" onclick="event.stopPropagation();playBellPresetById('${id}')" title="Dinle">▶</button>
    </div>`;
  }).join('');
}
function selectBellPreset(presetId){
  const sounds = getKitchenBellSounds();
  const scope = currentBellScope();
  if(!sounds.perStation) sounds.perStation = {};
  const val = { preset: presetId };
  if(scope) sounds.perStation[scope] = val; else sounds.default = val;
  setKitchenBellSounds(sounds);
  updateBellScopeStatus();
  showToast('Kaydedildi ✓');
}
function uploadBellSound(){
  const input = document.getElementById('bellFileInput');
  const file = input.files[0];
  if(!file) return;
  if(file.size > 800*1024){ alert('Ses dosyası çok büyük (maks. 800KB). Daha kısa/küçük bir dosya seçin.'); input.value=''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    const sounds = getKitchenBellSounds();
    const scope = currentBellScope();
    if(!sounds.perStation) sounds.perStation = {};
    if(scope) sounds.perStation[scope] = reader.result;
    else sounds.default = reader.result;
    setKitchenBellSounds(sounds);
    updateBellScopeStatus();
    input.value = '';
    showToast('Kaydedildi ✓');
  };
  reader.readAsDataURL(file);
}
function resetBellSound(){
  const scope = currentBellScope();
  const sounds = getKitchenBellSounds();
  if(scope){ if(sounds.perStation) delete sounds.perStation[scope]; }
  else sounds.default = null;
  setKitchenBellSounds(sounds);
  updateBellScopeStatus();
}
function testBellSound(){ playKitchenBell(currentBellScope() || null); }
/* Başlık/Genel Metin/Ürün Notu/Saat için renk+boyut+harf-stili alanlarını
   tek seferde okur (Kaydet ve canlı önizleme ikisi de kullanıyor). */
function readTicketTypography(){
  const out = {};
  ['Title','Text','Note','Time'].forEach(key => {
    out['color'+key] = document.getElementById('td_color'+key).value;
    out['size'+key] = parseInt(document.getElementById('td_size'+key).value) || undefined;
    out['transform'+key] = document.getElementById('td_transform'+key).value;
  });
  return out;
}
async function saveTicketDesign(){
  const ok = await setTicketDesign({
    width: document.getElementById('td_width').value,
    header: sanitizeRichHtml(document.getElementById('td_header').innerHTML.trim()),
    footer: sanitizeRichHtml(document.getElementById('td_footer').innerHTML.trim()),
    fontFamily: document.getElementById('td_font').value,
    bold: document.getElementById('td_bold').checked,
    marginTop: parseFloat(document.getElementById('td_mtop').value) || 0,
    marginRight: parseFloat(document.getElementById('td_mright').value) || 0,
    marginBottom: parseFloat(document.getElementById('td_mbottom').value) || 0,
    marginLeft: parseFloat(document.getElementById('td_mleft').value) || 0,
    showOrderNumber: document.getElementById('td_showOrderNumber').checked,
    showItemTime: document.getElementById('td_showItemTime').checked,
    copies: parseInt(document.getElementById('td_copiesVal').textContent) || 1,
    showHeaderTime: document.getElementById('td_showHeaderTime').checked,
    timeFormat: document.getElementById('td_timeFormat').value,
    timeBold: document.getElementById('td_timeBold').checked,
    ...readTicketTypography(),
  });
  if(ok) showToast('Kaydedildi ✓ (tüm cihazlarda geçerli)');
}
async function resetTicketDesign(){
  if(!confirm('Fiş tasarımı varsayılan ayarlara sıfırlansın mı?')) return;
  await setTicketDesign(TICKET_DESIGN_DEFAULTS);
  renderPrinterSettingsView(document.getElementById('main'), getSession());
  showToast('Varsayılana sıfırlandı ✓');
}
function stepTicketCopies(delta){
  const el = document.getElementById('td_copiesVal');
  const next = Math.max(1, Math.min(5, (parseInt(el.textContent)||1) + delta));
  el.textContent = next;
  updateTicketPreview();
}
function applyMarginPreset(mm){
  ['td_mtop','td_mbottom','td_mleft','td_mright'].forEach(id => { document.getElementById(id).value = mm; });
  updateTicketPreview();
}
let ELECTRON_PRINTERS_CACHE = null;
async function getElectronPrintersCached(forceRefresh){
  if(ELECTRON_PRINTERS_CACHE && !forceRefresh) return ELECTRON_PRINTERS_CACHE;
  ELECTRON_PRINTERS_CACHE = await window.electronAPI.listPrinters();
  return ELECTRON_PRINTERS_CACHE;
}
async function onNewPrinterTypeChange(forceRefresh){
  const type = document.getElementById('np_ptype').value;
  const wrap = document.getElementById('npElectronWrap');
  if(!wrap) return;
  if(type!=='electron'){ wrap.innerHTML=''; return; }
  if(!isDesktopApp()){
    wrap.innerHTML = '<p class="muted" style="font-size:12px;">Bu seçenek sadece Masaüstü Uygulaması içinde çalışır. Şu an tarayıcıdasınız — yine de ekleyebilirsiniz, uygulamayı kurup o bilgisayarda giriş yaptığınızda devreye girer.</p><label>İşletim Sistemi Yazıcısı Adı (opsiyonel)</label><input id="np_osprinter" placeholder="örn. POS-80C">';
    return;
  }
  // Yazici listesi (Electron IPC ile isletim sistemine sorulur) bir kez
  // cache'lenir - menu her acildiginda yeniden sormak gecikme hissi
  // yaratiyordu. "Yenile" ile elle tazelenebilir.
  const cached = ELECTRON_PRINTERS_CACHE;
  wrap.innerHTML = '<label>İşletim Sistemi Yazıcısı</label><div style="display:flex;gap:8px;"><select id="np_osprinter" style="flex:1;">'+(cached?'':'<option value="">Yükleniyor...</option>')+'</select><button type="button" class="sbtn" style="width:auto;" onclick="onNewPrinterTypeChange(true)">🔄 Yenile</button></div>';
  if(cached){
    const sel = document.getElementById('np_osprinter');
    sel.innerHTML = cached.length ? cached.map(p => `<option value="${escapeHtml(p.name)}" ${p.isDefault?'selected':''}>${escapeHtml(p.displayName||p.name)}${p.isDefault?' (varsayılan)':''}</option>`).join('') : '<option value="">Yazıcı bulunamadı</option>';
  }
  try{
    const list = await getElectronPrintersCached(forceRefresh);
    const sel = document.getElementById('np_osprinter');
    if(!sel) return;
    sel.innerHTML = list.length ? list.map(p => `<option value="${escapeHtml(p.name)}" ${p.isDefault?'selected':''}>${escapeHtml(p.displayName||p.name)}${p.isDefault?' (varsayılan)':''}</option>`).join('') : '<option value="">Yazıcı bulunamadı</option>';
  }catch(e){
    const sel = document.getElementById('np_osprinter');
    if(sel) sel.innerHTML = '<option value="">Yazıcı listesi alınamadı</option>';
  }
}
async function addPrinterEntry(){
  const name = document.getElementById('np_pname').value.trim();
  const type = document.getElementById('np_ptype').value;
  if(!name){ alert('Yazıcı adı girin'); return; }
  const id = 'p_' + Date.now();
  let usbInfo = null;
  let osPrinterName = null;
  if(type==='usb'){
    try{
      const device = await navigator.usb.requestDevice({ filters: [] });
      usbInfo = { vendorId: device.vendorId, productId: device.productId };
    }catch(e){
      alert('USB yazıcı seçilmedi/eşleştirilemedi: ' + e.message);
      return;
    }
  } else if(type==='electron'){
    const osSel = document.getElementById('np_osprinter');
    osPrinterName = osSel ? osSel.value.trim() : '';
  }
  const printers = getPrinters();
  const isFirstPrinter = printers.length===0;
  printers.push({ id, name, type, usbInfo, osPrinterName: osPrinterName || null });
  setPrinters(printers);
  // Ilk eklenen yazici otomatik olarak "Bu Ekranin Yazicisi" yapilir, boylece
  // sadece listeye eklenip hicbir yerde secilmedigi icin sessizce kullanilmama
  // durumu (kullanici siparis verdiginde hicbir sey basmadan gecmesi) onlenir.
  if(isFirstPrinter) setActivePrinterId(id);
  renderSettingsFromCurrentSession();
  showToast(isFirstPrinter ? 'Yazıcı eklendi ve bu ekranın yazıcısı yapıldı ✓' : 'Yazıcı eklendi ✓');
}
function removePrinterEntry(id){
  if(!confirm('Bu yazıcıyı silmek istediğinize emin misiniz?')) return;
  setPrinters(getPrinters().filter(p => p.id!==id));
  if(getActivePrinterId()===id) setActivePrinterId('');
  renderSettingsFromCurrentSession();
}
async function reconnectUsbPrinter(id){
  const printers = getPrinters();
  const p = printers.find(x => x.id===id);
  if(!p) return;
  try{
    const device = await navigator.usb.requestDevice({ filters: [] });
    p.usbInfo = { vendorId: device.vendorId, productId: device.productId };
    setPrinters(printers);
    alert('Yazıcı eşleştirildi: ' + device.productName || 'USB Yazıcı');
  }catch(e){
    alert('Eşleştirilemedi: ' + e.message);
  }
}
function testPrintPrinter(id){
  const printers = getPrinters();
  const p = printers.find(x => x.id===id);
  if(!p) return;
  printKitchenTicket('TEST', [{ qty:1, name:'Test Ürünü', note:'Bu bir test fişidir', added_at:new Date().toISOString() }], p, false, 0);
}
function renderSettingsFromCurrentSession(){
  const session = getSession();
  if(session) renderPrinterSettingsView(document.getElementById('main'), session);
}

/* ---- ESC/POS ham komut olusturma (WebUSB dogrudan yazdirma icin) ---- */
function escposEncodeText(text){
  // Basit yaklasim: UTF-8 byte'lari gonderiyoruz. Turkce ozel karakterler
  // (ç,ğ,ı,ö,ş,ü) bazi yazici modellerinde/kod sayfalarinda hatali cikabilir -
  // yaziciniz farkli bir kod sayfasi gerektiriyorsa bildirin, ona gore ayarlarim.
  return new TextEncoder().encode(text);
}
/* Fiş başlığı/altı notu artık zengin metin (execCommand'in ürettiği
   <div>/<b>/<font> vb. HTML) olarak saklanıyor - USB (ESC/POS) yazdırma ham
   metin bekliyor, HTML biçimlendirmeyi gösteremiyor. Etiketleri atıp satır
   sonlarını koruyarak düz metne çeviriyoruz. */
function ticketRichToPlainText(html){
  if(!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('div,p').forEach(el => el.insertAdjacentText('beforeend', '\n'));
  tmp.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
  return (tmp.textContent || '').replace(/\n+$/, '').trim();
}
function buildEscPosTicket(restaurantName, tableName, items, design, dailyNumber){
  const chunks = [];
  const push = (arr) => chunks.push(arr instanceof Uint8Array ? arr : new Uint8Array(arr));
  const lineWidth = design.width==='58' ? 32 : 48;
  const headerText = ticketRichToPlainText(design.header);
  const footerText = ticketRichToPlainText(design.footer);
  push([0x1B, 0x40]); // init
  push([0x1B, 0x61, 0x01]); // center
  push([0x1B, 0x45, 0x01]); // bold on
  push(escposEncodeText((restaurantName||'').toUpperCase() + '\n'));
  push([0x1B, 0x45, 0x00]); // bold off
  if(headerText) push(escposEncodeText(headerText + '\n'));
  const now = new Date();
  const showOrderNumber = design.showOrderNumber !== false;
  const showItemTime = design.showItemTime !== false;
  const headerDateLine = now.toLocaleDateString('tr-TR') + (design.showHeaderTime ? (' ' + formatItemTime({added_at: now.toISOString()}, design)) : '');
  push(escposEncodeText(((showOrderNumber && dailyNumber) ? ('Sipariş No: '+dailyNumber+' · ') : '') + tableName + '\n'));
  push(escposEncodeText(headerDateLine + '\n'));
  push([0x1B, 0x61, 0x00]); // left align
  // Termal yazıcılarda ince yazı çoğunlukla silik/soluk çıkıyor - Kalın Yazı
  // ayarı açıksa ürün satırları da bold basılır (bkz. Yazıcı Ayarları > Fiş Tasarımı).
  if(design.bold) push([0x1B, 0x45, 0x01]);
  push(escposEncodeText('-'.repeat(lineWidth) + '\n'));
  items.forEach(it => {
    const timeStr = showItemTime ? formatItemTime(it, design) : '';
    const left = it.qty + 'x ' + it.name;
    const pad = Math.max(1, lineWidth - left.length - timeStr.length);
    push(escposEncodeText(left + (showItemTime ? (' '.repeat(pad) + timeStr) : '') + '\n'));
    if(it.note) push(escposEncodeText('  Not: ' + it.note + '\n'));
  });
  push(escposEncodeText('-'.repeat(lineWidth) + '\n'));
  if(design.bold) push([0x1B, 0x45, 0x00]);
  if(footerText){
    push([0x1B, 0x61, 0x01]);
    push(escposEncodeText(footerText + '\n'));
  }
  push(escposEncodeText('\n\n\n'));
  push([0x1D, 0x56, 0x42, 0x00]); // kagit kes
  let total = 0; chunks.forEach(c => total += c.length);
  const out = new Uint8Array(total);
  let off = 0; chunks.forEach(c => { out.set(c, off); off += c.length; });
  return out;
}
let _usbPrintQueue = Promise.resolve();
/* Ayni USB yaziciya esZamanli (concurrent) erisim denemeleri "interface claim
   edilemedi" hatasina yol acabiliyor (ozellikle art arda gelen siparislerde) -
   tum yazdirma istekleri burada siraya alinip tek tek isleniyor. */
function sendToUsbPrinter(printer, bytes){
  const task = _usbPrintQueue.then(() => sendToUsbPrinterNow(printer, bytes));
  _usbPrintQueue = task.catch(() => {});
  return task;
}
let LAST_USB_ERROR = null;
async function sendToUsbPrinterNow(printer, bytes){
  if(!navigator.usb){ LAST_USB_ERROR = 'Bu tarayıcı WebUSB desteklemiyor'; return false; }
  if(!printer.usbInfo){ LAST_USB_ERROR = 'Bu yazıcı için USB eşleştirme bilgisi yok'; return false; }
  let device = null;
  try{
    const devices = await navigator.usb.getDevices();
    device = devices.find(d => d.vendorId===printer.usbInfo.vendorId && d.productId===printer.usbInfo.productId);
    if(!device){ LAST_USB_ERROR = 'Yazıcı bu tarayıcıda yetkilendirilmemiş görünüyor (Yazıcılar listesinde "Bağlan"a tekrar basın)'; return false; }
    await device.open();
    if(device.configuration === null) await device.selectConfiguration(1);
    const iface = device.configuration.interfaces[0];
    await device.claimInterface(iface.interfaceNumber);
    const endpoint = iface.alternate.endpoints.find(e => e.direction==='out');
    if(!endpoint){ LAST_USB_ERROR = 'Yazıcıda veri gönderme ucu (OUT endpoint) bulunamadı'; await device.close(); return false; }
    await device.transferOut(endpoint.endpointNumber, bytes);
    await device.close();
    LAST_USB_ERROR = null;
    return true;
  }catch(e){
    LAST_USB_ERROR = (e && e.message) ? e.message : String(e);
    console.error('USB yazdirma basarisiz:', e);
    // Cihaz acik kalip sonraki denemeleri de kilitlemesin diye elden geldigince kapat.
    if(device && device.opened){ try{ await device.close(); }catch(e2){} }
    return false;
  }
}

/* ---- Mutfak fişi yazdırma (ana giris noktasi) ---- */
function reprintKitchenTicket(tableId){
  const entry = APP.kitchenPendingByTable && APP.kitchenPendingByTable[tableId];
  if(!entry){ alert('Bu masa için bekleyen ürün kalmadı.'); return; }
  printKitchenTicketGrouped(entry.tableName, entry.items, false, entry.dailyNumber);
}
/* Ürünleri istasyona göre gruplar, her istasyonun fişini o istasyona atanmış
   yazıcıya (atanmamışsa "Bu Ekranın Yazıcısı"na) ayrı ayrı gönderir. */
async function printKitchenTicketGrouped(tableName, items, silent, dailyNumber){
  const groups = {};
  items.forEach(it => {
    const key = it.station_id || '';
    if(!groups[key]) groups[key] = [];
    groups[key].push(it);
  });
  for(const key of Object.keys(groups)){
    const printer = resolvePrinterForStation(key || null);
    await printKitchenTicket(tableName, groups[key], printer, silent, dailyNumber);
  }
}
async function printKitchenTicket(tableName, items, printerOverride, silent, dailyNumber){
  const session = getSession();
  const restaurantName = session ? session.restaurant_name : '';
  const design = getTicketDesign();
  const printers = getPrinters();
  const printer = printerOverride || printers.find(p => p.id===getActivePrinterId());

  const copies = Math.max(1, Math.min(5, design.copies||1));

  if(printer && printer.type==='electron' && isDesktopApp()){
    // Masaustu uygulamasinin native yazdirma koprusu - herhangi bir isletim
    // sistemi yazicisina (Windows/macOS), hicbir pencere/onay gostermeden,
    // WebUSB veya kiosk-printing bayragina gerek kalmadan basar.
    const el = document.getElementById('printArea');
    applyTicketDesignStyle(el, design);
    el.innerHTML = buildTicketHtml(restaurantName, tableName, items, design, dailyNumber);
    await new Promise(r => setTimeout(r, 80));
    for(let c=0;c<copies;c++){
      const result = await window.electronAPI.silentPrint(printer.osPrinterName);
      if(!result || !result.success){
        console.warn('Masaustu uygulamasi yazdirma basarisiz:', result && result.errorType);
        if(silent) showToast('⚠️ "'+printer.name+'" yazıcısına fiş gönderilemedi'+(result&&result.errorType?' — '+result.errorType:'')+'. Yazıcı bağlantısını kontrol edin');
        return;
      }
    }
    return;
  } else if(printer && printer.type==='usb'){
    let bytes = buildEscPosTicket(restaurantName, tableName, items, design, dailyNumber);
    if(copies>1){
      const single = bytes;
      const combined = new Uint8Array(single.length*copies);
      for(let c=0;c<copies;c++) combined.set(single, c*single.length);
      bytes = combined;
    }
    const ok = await sendToUsbPrinter(printer, bytes);
    if(ok) return; // basarili - tarayici penceresi ACILMADI
    console.warn('USB yaziciya ulasilamadi.');
    if(silent) showToast('⚠️ "'+printer.name+'" yazıcısına fiş gönderilemedi'+(LAST_USB_ERROR?' — '+LAST_USB_ERROR:'')+'. Bağlantıyı kontrol edin');
  } else if(printer && printer.type==='silent-browser'){
    // Normal bir isletim sistemi yazicisi (Xerox, HP vb. - USB arayuzu zaten
    // isletim sisteminin kendi surucusunde oldugu icin WebUSB'nin asla
    // erisemeyecegi tur bir yazici). Chrome/Edge --kiosk-printing bayragiyla
    // acilip bu yazici o bilgisayarda VARSAYILAN yazici yapilirsa,
    // window.print() hicbir pencere/onay gostermeden dogrudan basar.
    const el = document.getElementById('printArea');
    applyTicketDesignStyle(el, design);
    el.innerHTML = buildTicketHtml(restaurantName, tableName, items, design, dailyNumber);
    setTimeout(() => window.print(), 100);
    return;
  } else if(!printer && silent){
    showToast('⚠️ Fiş yazdırılamadı: bu ekran/istasyon için yazıcı seçili değil');
  } else if(printer && printer.type==='browser' && silent){
    showToast('⚠️ "'+printer.name+'" sessiz/otomatik yazdırma için ayarlanmamış (bu tür her seferinde yazdırma penceresi açar) — Yazıcı Ayarları\'ndan "Masaüstü Uygulaması", "Sessiz Tarayıcı Yazdırma (kiosk-printing)" veya USB tipini kullanın');
  }

  // silent=true (siparis onaylaninca otomatik cagri): yazici yoksa/basarisizsa
  // ASLA tarayici penceresi acilmaz, sessizce vazgecilir. Sadece manuel
  // "yeniden yazdir" / "test yazdir" gibi bilincli tiklamalarda pencereye dusulur.
  if(silent) return;

  const el = document.getElementById('printArea');
  applyTicketDesignStyle(el, design);
  el.innerHTML = buildTicketHtml(restaurantName, tableName, items, design, dailyNumber);
  setTimeout(() => window.print(), 100);
}
function formatItemTime(it, design){
  const t = it.added_at ? new Date(it.added_at) : new Date();
  const hour12 = !!(design && design.timeFormat==='12');
  return t.toLocaleTimeString('tr-TR', hour12 ? {hour:'2-digit', minute:'2-digit', hour12:true} : {hour:'2-digit', minute:'2-digit'});
}
/* Fişin bir bölümü için renk/boyut/harf-stili özelleştirmesini tek bir
   inline style dizgesine çevirir - hepsi !important, çünkü .ticket-bold
   gibi genel kurallar da !important kullanıyor ve inline stil bunlardan
   önceliklidir (aksi halde örn. Kalın Yazı açıkken renk/boyut geçersiz kalırdı). */
function ticketPartStyle(design, key){
  const color = design['color'+key] || '#000000';
  const size = design['size'+key];
  const transform = design['transform'+key] || 'none';
  return `color:${color} !important;`+(size?`font-size:${size}px !important;`:'')+`text-transform:${transform} !important;`;
}
function buildTicketHtml(restaurantName, tableName, items, design, dailyNumber){
  const now = new Date();
  const showOrderNumber = design.showOrderNumber !== false;
  const showItemTime = design.showItemTime !== false;
  const showHeaderTime = !!design.showHeaderTime;
  const timeWeight = design.timeBold===false ? '400' : '700';
  const dateLine = now.toLocaleDateString('tr-TR') + (showHeaderTime ? (' ' + formatItemTime({added_at: now.toISOString()}, design)) : '');
  return `
    <div class="ticket-title" style="${ticketPartStyle(design,'Title')}">${escapeHtml(restaurantName)}</div>
    ${design.header ? `<div class="ticket-meta ticket-rich">${sanitizeRichHtml(design.header)}</div>` : ''}
    <div class="ticket-meta" style="${ticketPartStyle(design,'Text')}">${(showOrderNumber && dailyNumber)?('Sipariş No: '+dailyNumber+' · '):''}${escapeHtml(tableName)}</div>
    <div class="ticket-meta" style="${ticketPartStyle(design,'Text')}">${dateLine}</div>
    <div class="ticket-line"></div>
    ${items.map(it => `
      <div class="ticket-item" style="${ticketPartStyle(design,'Text')}"><span><span class="qty">${it.qty}x</span>${escapeHtml(it.name)}</span>${showItemTime?`<span class="ticket-time" style="${ticketPartStyle(design,'Time')}font-weight:${timeWeight} !important;">${formatItemTime(it, design)}</span>`:''}</div>
      ${it.note ? `<div class="ticket-note" style="${ticketPartStyle(design,'Note')}">Not: ${escapeHtml(it.note)}</div>` : ''}
    `).join('')}
    <div class="ticket-line"></div>
    ${design.footer ? `<div class="ticket-meta ticket-rich">${sanitizeRichHtml(design.footer)}</div>` : ''}
  `;
}
function updateTicketPreview(){
  const el = document.getElementById('ticketPreview');
  if(!el) return;
  const width = document.getElementById('td_width').value;
  const header = document.getElementById('td_header').innerHTML.trim();
  const footer = document.getElementById('td_footer').innerHTML.trim();
  const fontFamily = document.getElementById('td_font').value;
  const bold = document.getElementById('td_bold').checked;
  const marginTop = parseFloat(document.getElementById('td_mtop').value) || 0;
  const marginRight = parseFloat(document.getElementById('td_mright').value) || 0;
  const marginBottom = parseFloat(document.getElementById('td_mbottom').value) || 0;
  const marginLeft = parseFloat(document.getElementById('td_mleft').value) || 0;
  const showOrderNumber = document.getElementById('td_showOrderNumber').checked;
  const showItemTime = document.getElementById('td_showItemTime').checked;
  const showHeaderTime = document.getElementById('td_showHeaderTime').checked;
  const timeFormat = document.getElementById('td_timeFormat').value;
  const timeBold = document.getElementById('td_timeBold').checked;
  const typography = readTicketTypography();
  const session = getSession();
  const t1 = new Date(Date.now() - 6*60000).toISOString();
  const t2 = new Date().toISOString();
  const sampleItems = [
    { qty:2, name:'Izgara Köfte', note:'Az pişmiş', added_at:t1 },
    { qty:1, name:'Ayran', added_at:t1 },
    { qty:1, name:'Mevsim Salata', note:'Sossuz', added_at:t2 },
  ];
  applyTicketDesignStyle(el, { width, fontFamily, bold, marginTop, marginRight, marginBottom, marginLeft }, 'ticket-paper');
  el.innerHTML = buildTicketHtml(session ? session.restaurant_name : 'İŞLETME ADI', 'Masa 3', sampleItems, { header, footer, showOrderNumber, showItemTime, showHeaderTime, timeFormat, timeBold, ...typography }, 12);
}
async function cancelTableOrder(tableId){
  if(!confirm('Bu masadaki siparişi (mutfağa gönderilenler dahil) tamamen iptal etmek istediğinize emin misiniz?')) return;
  const session = getSession();
  // Sepette henüz gönderilmemiş ürün varsa stoğunu geri ekle (aksi halde iptal ile birlikte kalıcı kaybolur).
  await releaseDraftStock(tableId);
  const order = liveOrderForTable(tableId);
  if(order){
    const { error } = await sb.rpc('cancel_order', { p_token: session.session_token, p_order_id: order.order_id });
    if(error){ alert('İptal edilemedi: '+error.message); return; }
  }
  const [liveRes, cfgRes] = await Promise.all([
    sb.rpc('get_live_orders', { p_token: session.session_token }),
    sb.rpc('get_restaurant_config', { p_token: session.session_token })
  ]);
  APP.liveOrders = liveRes.data || [];
  if(cfgRes.data) APP.config = cfgRes.data;
  await closeTableModal();
  if(typeof tableId==='string' && tableId.indexOf('pkg_')===0 && APP.view==='packages') renderPackagesView(document.getElementById('main'), session);
}
/* Sadece henüz mutfağa gönderilmemiş sepeti boşaltır; masaya ait onaylı/gönderilmiş sipariş etkilenmez. */
async function clearDraftCart(tableId){
  const draft = APP.draftCart[tableId];
  if(!draft || draft.length===0) return;
  if(!confirm('Henüz gönderilmemiş sepetteki ürünler temizlensin mi?')) return;
  await releaseDraftStock(tableId);
  renderTableItems(tableId);
  const activeTab = document.querySelector('#prodStationTabs .tab.active');
  if(activeTab) renderProductPick(activeTab.dataset.st, tableId);
}

async function doLogin(){
  const code = document.getElementById('codeInput').value.trim();
  const username = document.getElementById('userInput').value.trim();
  const password = document.getElementById('passInput').value;
  const errBox = document.getElementById('errBox');
  const btn = document.getElementById('loginBtn');
  errBox.textContent = '';
  if(!code || !username || !password){
    errBox.textContent = 'Tüm alanları doldurun';
    return;
  }
  btn.disabled = true; btn.textContent = 'Giriş yapılıyor...';
  // Kimlik bilgileri doğruysa ama deneme/abonelik süresi dolmuşsa, sb.rpc
  // sarmalayıcısı otomatik olarak "Abonelik Süresi Doldu" ekranına
  // yönlendirir - bu bilgiler orada önceden doldurulmuş görünsün diye
  // istek atılmadan önce hazırlanıyor.
  APP.expiredPrefill = { code, username };
  try{
    const { data, error } = await sb.rpc('login_staff', {
      p_code: code, p_username: username, p_password: password
    });
    if(error){
      if(error.message === 'ABONELIK_SURESI_DOLDU') return; // ekran zaten değişti (sb.rpc sarmalayıcısı)
      console.error(error);
      errBox.textContent = 'Bağlantı hatası: ' + error.message;
      return;
    }
    if(!data || data.length === 0){
      errBox.textContent = 'İşletme kodu, kullanıcı adı veya şifre hatalı';
      return;
    }
    const row = data[0];
    setSession({
      session_token: row.session_token,
      user_id: row.user_id,
      restaurant_id: row.restaurant_id,
      role_names: row.role_names || [],
      permissions: row.permissions || [],
      isManager: !!row.is_manager,
      restaurant_name: row.restaurant_name,
      username: username
    });
    APP.reportsUnlocked = false;
    APP.reportsGateScreen = null;
    APP.config = null;
    applyDeepLinkView();
    render();
  }catch(err){
    console.error(err);
    errBox.textContent = 'Beklenmeyen bir hata oluştu';
  }finally{
    btn.disabled = false; btn.textContent = 'Giriş Yap';
  }
}
/* push_subscriptions satırı session_token'dan bağımsız, kullanıcıya kalıcı
   olarak bağlı - logout sadece staff_sessions'ı siler, aboneliği silmezse
   o cihaz (ya da o tarayıcı) çıkış yapıldıktan sonra da bildirim almaya
   devam eder. Bu yüzden çıkışta, o cihazın kendi aboneliğini de kaldırıyoruz. */
async function unsubscribePushOnLogout(session){
  if(!session || !session.session_token) return;
  try{
    if(isNativeApp()){
      const saved = getSavedFcmToken();
      if(saved){
        await sb.rpc('remove_push_subscription', { p_token: session.session_token, p_endpoint: saved });
        setSavedFcmToken('');
      }
      return;
    }
    if(!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if(sub){
      await sb.rpc('remove_push_subscription', { p_token: session.session_token, p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  }catch(e){}
}
async function doLogout(){
  const session = getSession();
  stopKitchenPolling();
  stopCustomerRequestPolling();
  APP.customerReqPollStarted = false;
  APP.shiftStatus = null;
  clearSession();
  render();
  if(session && session.session_token){
    await unsubscribePushOnLogout(session);
    try{ await sb.rpc('logout_staff', { p_token: session.session_token }); }catch(e){}
  }
}
