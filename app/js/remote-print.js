/* Uzaktan yazdırma: bir cihaz kendi yazıcısını "paylaşır"; diğer cihazlar o yazıcıyı kendi listelerinde
   "🌐 Uzak yazıcı" olarak görür ve seçer. Fiş sunucuya bırakılır (submit_print_job), paylaşan cihaz birkaç
   saniyede bir sıradakileri alıp (claim_print_jobs) kendi yazıcısından basar ve sonucu bildirir.
   Paylaşan cihazda uygulamanın açık olması gerekir (masaüstü uygulaması arka planda da çalışır). */
const RP_SHARED_KEY = 'peyk_shared_printer_ids', RP_REMOTE_KEY = 'peyk_remote_printers', RP_DEVICE_KEY = 'peyk_device_id', RP_DEVNAME_KEY = 'peyk_device_name';
function rpDeviceId(){
  try{
    let id = localStorage.getItem(RP_DEVICE_KEY);
    if(!id){ id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)); localStorage.setItem(RP_DEVICE_KEY, id); }
    return id;
  }catch(e){ return 'nodevice'; }
}
function rpDeviceName(){
  try{ const n = localStorage.getItem(RP_DEVNAME_KEY); if(n) return n; }catch(e){}
  const ua = navigator.userAgent || '';
  return (typeof isDesktopApp === 'function' && isDesktopApp()) ? 'Masaüstü (' + (/Mac/.test(ua) ? 'Mac' : 'Windows') + ')' : /Android/.test(ua) ? 'Android cihaz' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows bilgisayar' : /Mac/.test(ua) ? 'Mac' : 'Cihaz';
}
async function renameThisDevice(){
  const v = prompt('Bu cihazın adı (diğer cihazlarda yazıcının yanında görünür):', rpDeviceName());
  if(v == null) return;
  try{ localStorage.setItem(RP_DEVNAME_KEY, v.trim().slice(0, 40) || rpDeviceName()); }catch(e){}
  await rpResyncShares();
  if(typeof renderPrinterSettingsView === 'function') renderPrinterSettingsView(document.getElementById('main'), getSession());
}
function rpSharedIds(){ try{ return JSON.parse(localStorage.getItem(RP_SHARED_KEY) || '[]') || []; }catch(e){ return []; } }
function rpSetSharedIds(ids){ try{ localStorage.setItem(RP_SHARED_KEY, JSON.stringify(ids)); }catch(e){} }
function isPrinterShared(localId){ return rpSharedIds().includes(localId); }
async function toggleSharePrinter(localId){
  const s = getSession(); if(!s) return;
  const p = getPrinters().find(x => x.id === localId); if(!p) return;
  const on = !isPrinterShared(localId);
  // Masaüstü türü yazıcı yalnız masaüstü uygulamasından basabilir; tarayıcıdan paylaşılırsa gelen fişler basılamaz.
  if(on && p.type === 'electron' && !(typeof isDesktopApp === 'function' && isDesktopApp())){
    await uiAlert('Bu yazıcı "Masaüstü Uygulaması" türünde; tarayıcıdan paylaşılamaz. Paylaşımı Peyktan masaüstü uygulamasının içinden yapın.', { icon: '🔗' }); return;
  }
  const { error } = await withLoadingOverlay(sb.rpc('share_printer', { p_token: s.session_token, p_device_id: rpDeviceId(), p_device_name: rpDeviceName(), p_printer_id: localId, p_printer_name: p.name, p_on: on }));
  if(error){ alert(error.message); return; }
  const ids = rpSharedIds().filter(x => x !== localId); if(on) ids.push(localId); rpSetSharedIds(ids);
  showToast(on ? '🔗 "' + p.name + '" diğer cihazlarla paylaşıldı' : 'Paylaşım kapatıldı');
  if(typeof renderPrinterSettingsView === 'function') renderPrinterSettingsView(document.getElementById('main'), s);
}
// Paylaşılan yazıcı silinirse paylaşım da kalkar; cihaz adı değişince sunucudaki kayıt güncellenir.
async function rpResyncShares(){
  const s = getSession(); if(!s) return;
  const local = getPrinters();
  for(const id of rpSharedIds()){
    const p = local.find(x => x.id === id);
    const usable = !!p && !(p.type === 'electron' && !(typeof isDesktopApp === 'function' && isDesktopApp()));
    await sb.rpc('share_printer', { p_token: s.session_token, p_device_id: rpDeviceId(), p_device_name: rpDeviceName(), p_printer_id: id, p_printer_name: p ? p.name : '', p_on: usable });
  }
  const isDesk = typeof isDesktopApp === 'function' && isDesktopApp();
  rpSetSharedIds(rpSharedIds().filter(id => local.some(x => x.id === id && !(x.type === 'electron' && !isDesk))));
}
/* Diğer cihazların paylaştığı yazıcılar (bu cihazınkiler hariç). */
function getRemotePrinters(){ try{ return JSON.parse(localStorage.getItem(RP_REMOTE_KEY) || '[]') || []; }catch(e){ return []; } }
function getAllPrinters(){ return getPrinters().concat(getRemotePrinters()); }
async function refreshRemotePrinters(){
  const s = getSession(); if(!s) return;
  const { data, error } = await sb.rpc('list_shared_printers', { p_token: s.session_token });
  if(error || !Array.isArray(data)) return;
  const me = rpDeviceId();
  const list = data.filter(x => x.device_id !== me).map(x => ({ id: 'remote:' + x.id, shareId: x.id, type: 'remote', name: x.printer_name + ' · ' + x.device_name, online: !!x.online }));
  try{ localStorage.setItem(RP_REMOTE_KEY, JSON.stringify(list)); }catch(e){}
}
/* Fişi uzak yazıcıya gönderir ve basılana kadar (en fazla ~20 sn) bekler. Sonuç {ok, err}. */
async function sendRemotePrint(printer, payload){
  const s = getSession(); if(!s) return { ok: false, err: 'Oturum yok' };
  const { data: id, error } = await sb.rpc('submit_print_job', { p_token: s.session_token, p_target: printer.shareId, p_payload: payload });
  if(error || !id) return { ok: false, err: (error && error.message) || 'Gönderilemedi' };
  for(let i = 0; i < 20; i++){
    await new Promise(r => setTimeout(r, 1000));
    const { data } = await sb.rpc('get_print_job_status', { p_token: s.session_token, p_id: id });
    if(data && data.status === 'done') return { ok: true, err: '', note: 'Uzak yazıcıdan basıldı' };
    if(data && data.status === 'failed') return { ok: false, err: data.error || 'Basılamadı' };
  }
  return { ok: true, err: '', note: 'Uzak yazıcıya gönderildi (onay bekleniyor)' };
}
/* Paylaşan cihaz: sıradaki fişleri alıp kendi yazıcısından basar. */
let RP_HOST_BUSY = false;
async function rpHostTick(){
  const s = getSession(); if(!s || RP_HOST_BUSY || !rpSharedIds().length) return;
  RP_HOST_BUSY = true;
  try{
    const { data, error } = await sb.rpc('claim_print_jobs', { p_token: s.session_token, p_device_id: rpDeviceId() });
    if(error || !Array.isArray(data)) return;
    for(const j of data){
      const pr = getPrinters().find(x => x.id === j.printer_id), p = j.payload || {};
      let ok = false, err = '';
      if(!pr){ err = 'Yazıcı bu cihazda artık tanımlı değil'; }
      else{
        try{ await printKitchenTicket(p.table, p.items || [], pr, true, p.no, Object.assign({}, p.extra || {}, { remoteFrom: p.from || '' })); ok = !!PRINT_RESULT.ok; err = PRINT_RESULT.err || ''; }
        catch(e){ err = e.message || String(e); }
      }
      await sb.rpc('finish_print_job', { p_token: s.session_token, p_id: j.id, p_ok: ok, p_error: err || null });
    }
  }finally{ RP_HOST_BUSY = false; }
}
setInterval(rpHostTick, 2000);
setInterval(() => { if(getSession() && document.visibilityState === 'visible') refreshRemotePrinters(); }, 60000);
setTimeout(() => { if(getSession()){ refreshRemotePrinters(); if(rpSharedIds().length) rpResyncShares(); } }, 2500);

/* ---- Arka planda mutfak fişi (yalnız masaüstü uygulaması) ----
   Seçilen istasyonların yeni siparişleri, sipariş hangi cihazdan verilirse verilsin, bu bilgisayarın
   istasyon yazıcısından basılır. Mutfak ekranının açık olması gerekmez; uygulama açık (küçültülmüş olabilir) olmalı. */
const BG_KEY = 'peyk_bg_print_stations', BG_SEEN_KEY = 'peyk_bg_print_seen';
function bgStations(){ try{ return JSON.parse(localStorage.getItem(BG_KEY) || '[]') || []; }catch(e){ return []; } }
function bgSetStations(a){ try{ localStorage.setItem(BG_KEY, JSON.stringify(a)); }catch(e){} }
function bgSeen(){ try{ return JSON.parse(localStorage.getItem(BG_SEEN_KEY) || '{}') || {}; }catch(e){ return {}; } }
function bgSaveSeen(m){
  const cut = Date.now() - 24 * 3600e3; Object.keys(m).forEach(k => { if(m[k] < cut) delete m[k]; });
  try{ localStorage.setItem(BG_SEEN_KEY, JSON.stringify(m)); }catch(e){}
}
function bgPrintBoxHtml(){
  if(!(typeof isDesktopApp === 'function' && isDesktopApp())) return '';
  const st = (APP.config && APP.config.stations) || [], on = bgStations();
  return `<div class="sw-card bgp-box" style="margin-top:10px !important;display:block;">
    <b>🖨️ Arka planda mutfak fişi bas</b><br><span class="u-fs125 muted">Seçilen istasyonların yeni sipariş fişleri, sipariş hangi cihazdan (tablet, telefon, başka bilgisayar) verilirse verilsin bu bilgisayardan basılır. Mutfak ekranını açmanız gerekmez; uygulama açık (küçültülmüş) kalsın. Fiş, <b>İstasyon → Yazıcı</b>'da o istasyona seçilen yazıcıdan çıkar. Çift fiş çıkmaması için siparişi veren cihazlarda "Sipariş verilince fişi hemen bu cihazdan yazdır"ı kapatın.</span>
    <div class="bgp-st">${st.map(x => `<label class="bgp-chip ${on.includes(x.id) ? 'on' : ''}"><input type="checkbox" ${on.includes(x.id) ? 'checked' : ''} ${actOn('change','bgToggleStation',[x.id,'$checked'])}> ${escapeHtml(x.name)}</label>`).join('') || '<span class="muted u-fs12">İstasyon tanımlı değil.</span>'}</div></div>`;
}
function bgToggleStation(id, on){
  const a = bgStations().filter(x => x !== id); if(on) a.push(id); bgSetStations(a);
  APP.bgPrimed = false; // açılan istasyonun mevcut siparişleri yeniden basılmasın
  showToast(on ? '🖨️ Bu istasyonun fişleri bu bilgisayardan arka planda basılacak' : 'Arka plan yazdırma kapatıldı');
  document.querySelectorAll('.bgp-chip input').forEach(i => i.closest('.bgp-chip').classList.toggle('on', i.checked));
}
let BG_BUSY = false;
async function bgPrintTick(){
  if(BG_BUSY || !(typeof isDesktopApp === 'function' && isDesktopApp())) return;
  const s = getSession();
  // Mutfak ekranı açıksa o istasyonun fişini mutfak ekranı basar (çift fiş olmasın).
  const on = bgStations().filter(id => !(APP.view === 'kitchen' && APP.kitchenStation === id));
  if(!s || !on.length) return;
  BG_BUSY = true;
  try{
    if(!APP.config){ const { data } = await sb.rpc('get_restaurant_config', { p_token: s.session_token }); if(data) APP.config = data; }
    const { data, error } = await _sbRpcRaw('get_live_orders', { p_token: s.session_token });
    if(error || !Array.isArray(data)) return;
    const seen = bgSeen(), now = Date.now(), first = !APP.bgPrimed;
    APP.bgPrimed = true;
    APP.locallyPrintedItemIds = APP.locallyPrintedItemIds || new Set();
    for(const o of data){
      const fresh = (o.items || []).filter(i => i.status === 'pending' && on.includes(i.station_id) && !seen[i.id] && !APP.locallyPrintedItemIds.has(i.id));
      fresh.forEach(i => { seen[i.id] = now; });
      if(!fresh.length || first) continue; // ilk açılışta mevcut siparişler basılmaz, yalnız yenileri
      fresh.forEach(i => APP.locallyPrintedItemIds.add(i.id));
      try{ await printKitchenTicketGrouped(typeof orderDisplayName === 'function' ? orderDisplayName(o) : (o.table_name || ''), fresh, true, o.daily_number, typeof pkgInfoFromOrder === 'function' ? pkgInfoFromOrder(o) : null, o.tags || []); }
      catch(e){ console.error('Arka plan fiş hatası', e); }
    }
    bgSaveSeen(seen);
  }finally{ BG_BUSY = false; }
}
setInterval(bgPrintTick, 3000);
