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
    await sb.rpc('share_printer', { p_token: s.session_token, p_device_id: rpDeviceId(), p_device_name: rpDeviceName(), p_printer_id: id, p_printer_name: p ? p.name : '', p_on: !!p });
  }
  rpSetSharedIds(rpSharedIds().filter(id => local.some(x => x.id === id)));
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
setInterval(rpHostTick, 3000);
setInterval(() => { if(getSession() && document.visibilityState === 'visible') refreshRemotePrinters(); }, 60000);
setTimeout(() => { if(getSession()){ refreshRemotePrinters(); if(rpSharedIds().length) rpResyncShares(); } }, 2500);
