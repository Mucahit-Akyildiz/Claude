const SUPABASE_URL = 'https://dveybagnrgofxkqangvo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TOKEN = new URLSearchParams(window.location.search).get('t');
/* Kurye sayfası: "Yola Çıkar" denince kuryeye gelen link (uygulamada Paket Servis'ten de açılır).
   Konum paylaşımı açıkken telefonun konumu 15 sn'de bir gönderilir; müşteri takip linkinde ve restoranın
   Kuryeler haritasında görünür, adrese kalan süre haritadan hesaplanır. "Teslim ettim" deyince paylaşım biter.
   Peyktan Android uygulamasında ekran kilitliyken de devam eder (PeykLocation ön plan servisi). */
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
const hm = (t) => t ? new Date(t).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : '';
const money = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
const NATIVE = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PeykLocation;
// Uygulama içinden açıldıysa (Android uygulaması ya da /app/ sekmesinden) geri dönüş düğmesi gösterilir; konum servisi arka planda sürer.
const IN_APP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const FROM_APP = /\/app(\/|$|\?)/.test(document.referrer || '');
function backToApp(){ window.location.href = '/app/'; }
if(IN_APP){ try{ const A = window.Capacitor.Plugins.App; if(A) A.addListener('backButton', backToApp); }catch(e){} }
let JOB = null, WATCH = null, LAST = null, LAST_SENT = 0, SHARING = false, WAKE = null, MAP = null, ERR = '', TIMER = null;

function render(){
  const app = document.getElementById('app');
  if(!JOB){ return; }
  const j = JOB, done = !!j.delivered_at;
  const dest = j.dest_lat != null ? j.dest_lat + ',' + j.dest_lng : encodeURIComponent(j.address || '');
  const nav = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + dest;
  let eta = '';
  if(!done && j.eta_min != null && j.eta_at){ const arr = new Date(new Date(j.eta_at).getTime() + j.eta_min * 60000); eta = `<div class="tk-eta"><span>🕒</span><div><b>${Math.max(1, Math.round((arr - Date.now()) / 60000))} dk kaldı</b><small>Tahmini varış ${hm(arr)} · trafik dahil</small></div></div>`; }
  const share = done ? `<div class="kr-done">✅ Teslim edildi · ${hm(j.delivered_at)}<small>Konum paylaşımı kapandı. Bu sayfayı kapatabilirsiniz.</small></div>`
    : SHARING ? `<div class="kr-share on"><span class="kr-live"></span><div><b>Konumunuz paylaşılıyor</b><small>${LAST_SENT ? 'Son gönderim ' + new Date(LAST_SENT).toLocaleTimeString('tr-TR') : 'Konum bekleniyor…'}${NATIVE ? ' · ekran kilitliyken de devam eder' : ' · bu sayfayı açık tutun'}</small></div><button class="kr-ghost" ${act('stopShare')}>Durdur</button></div>`
    : OLD_APP ? `<button class="kr-big" ${act('openInChrome')}>📍 Konumu Chrome'da paylaş</button><p class="kr-hint">Uygulamanın bu sürümü konum paylaşamıyor; sayfa Chrome'da açılır. Uygulamayı Play Store'dan güncelleyince ekran kilitliyken de paylaşılır.</p>`
    : `<button class="kr-big" ${act('startShare')}>📍 Konumumu paylaş</button><p class="kr-hint">Müşteri ve restoran, adrese kalan süreyi ve yerinizi görür. Yalnızca bu teslimat sırasında paylaşılır.</p>`;
  const back = (IN_APP || FROM_APP) ? `<button class="kr-back" ${act('backToApp')}>← Uygulamaya dön</button>` : '';
  const html = `${back}<div class="kr-head"><small>${escapeHtml(j.restaurant)} · #${escapeHtml(j.no || '')}</small><h1>🛵 ${escapeHtml(j.customer || 'Paket')}</h1></div>
    ${ERR ? `<div class="kr-err">⚠️ ${escapeHtml(ERR)}</div>` : ''}
    ${share}${eta}
    <div class="tk-map" ${done ? 'hidden' : ''}><div id="tkMap"></div></div>
    <div class="card kr-card">
      <div class="kr-row"><span>📍</span><div><b>${escapeHtml(j.address || 'Adres yok')}</b>${j.note ? `<small>📝 ${escapeHtml(j.note)}</small>` : ''}</div></div>
      <div class="kr-row"><span>💰</span><div><b>${money(j.total)}</b><small>Sipariş tutarı</small></div></div>
      <div class="kr-btns"><a class="kr-btn" href="${nav}" target="_blank" rel="noopener">🧭 Yol tarifi</a>${j.phone ? `<a class="kr-btn" href="tel:${escapeHtml(String(j.phone).replace(/[^0-9+]/g, ''))}">📞 Müşteriyi ara</a>` : ''}</div>
    </div>
    ${done ? (back ? `<button class="kr-big" ${act('backToApp')}>← Uygulamaya dön</button>` : '') : `<button class="kr-big kr-ok" ${act('delivered')}>✅ Teslim ettim</button>`}`;
  let main = app.querySelector('main');
  // Haritayı koru: yalnızca harita dışındaki içerik yenilenir.
  const mapEl = MAP && document.getElementById('tkMap');
  main.innerHTML = html;
  if(mapEl && !done){ const slot = document.getElementById('tkMap'); slot.replaceWith(mapEl); }
  if(!done && window.LiveMap){
    if(!MAP) MAP = LiveMap.create(document.getElementById('tkMap'), { noWheel: true });
    if(MAP){ MAP.set([LAST ? { kind: 'courier', id: 'c', lat: LAST.lat, lng: LAST.lng, label: 'Siz' } : null, { kind: 'dest', id: 'd', lat: j.dest_lat, lng: j.dest_lng, label: j.customer }, { kind: 'rest', id: 'r', lat: j.rest_lat, lng: j.rest_lng }]); setTimeout(() => MAP.map.invalidateSize(), 50); }
  } else if(MAP && done){ MAP.destroy(); MAP = null; }
}
async function load(){
  if(!TOKEN || !/^[0-9a-f-]{36}$/i.test(TOKEN)){ document.getElementById('app').innerHTML = '<main><div class="big">⚠️</div><div class="center"><h1>Geçersiz bağlantı</h1></div></main>'; return; }
  const { data, error } = await sb.rpc('get_courier_job', { p_courier: TOKEN });
  if(error && !JOB){ document.getElementById('app').innerHTML = '<main><div class="big">⚠️</div><div class="center"><h1>Yüklenemedi</h1><p>Biraz sonra tekrar deneyin.</p></div></main>'; return; }
  if(!data){ document.getElementById('app').innerHTML = '<main><div class="big">🔍</div><div class="center"><h1>Teslimat bulunamadı</h1><p>Linkin süresi dolmuş olabilir.</p></div>' + ((IN_APP || FROM_APP) ? '<button class="kr-big" data-click="backToApp">← Uygulamaya dön</button>' : '') + '</main>'; stopShare(); return; }
  JOB = data;
  if(JOB.delivered_at) stopShare(true);
  render();
}
async function send(pos){
  LAST = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
  if(Date.now() - LAST_SENT < 14000) return;
  LAST_SENT = Date.now();
  const { data, error } = await sb.rpc('courier_ping', { p_courier: TOKEN, p_lat: LAST.lat, p_lng: LAST.lng, p_acc: LAST.acc });
  ERR = error ? 'Konum gönderilemedi: ' + error.message : '';
  if(data){ if(data.stop){ stopShare(true); await load(); return; } JOB.eta_min = data.eta_min; JOB.eta_at = data.eta_at; }
  render();
}
// Eski uygulama sürümü (konum servisi yok, WebView konum izni yok): sayfa Chrome'da açılır.
const OLD_APP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) && !NATIVE;
function openInChrome(){ window.location.href = 'intent://www.peyktan.com/kurye/?t=' + TOKEN + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(location.href) + ';end'; }
async function startShare(){
  ERR = '';
  if(OLD_APP){ openInChrome(); return; }
  if(NATIVE){
    try{
      await NATIVE.start({ url: SUPABASE_URL, key: SUPABASE_KEY, token: TOKEN, title: (JOB && JOB.customer) || 'Teslimat' });
      SHARING = true; try{ localStorage.setItem('kr_share_' + TOKEN, '1'); }catch(e){}
    }catch(e){ ERR = 'Konum izni verilmedi. Ayarlar → Uygulamalar → Peyktan → İzinler → Konum: "Her zaman izin ver".'; }
  }
  if(!navigator.geolocation){ if(!SHARING){ ERR = 'Bu cihaz konum paylaşımını desteklemiyor.'; render(); } return; }
  // Sayfa açıkken haritada kendi konumu da güncellensin (yerel servis zaten gönderiyor olabilir).
  WATCH = navigator.geolocation.watchPosition((p) => { if(NATIVE && SHARING){ LAST = { lat: p.coords.latitude, lng: p.coords.longitude }; LAST_SENT = Date.now(); render(); } else send(p); },
    (e) => { ERR = e.code === 1 ? 'Konum izni verilmedi. Tarayıcının adres çubuğundaki kilit simgesinden konuma izin verin.' : 'Konum alınamıyor (GPS açık mı?)'; if(!NATIVE) SHARING = false; render(); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  SHARING = true; try{ localStorage.setItem('kr_share_' + TOKEN, '1'); }catch(e){}
  try{ if('wakeLock' in navigator) WAKE = await navigator.wakeLock.request('screen'); }catch(e){}
  render();
}
function stopShare(silent){
  if(WATCH != null){ navigator.geolocation.clearWatch(WATCH); WATCH = null; }
  if(NATIVE){ try{ NATIVE.stop(); }catch(e){} }
  if(WAKE){ try{ WAKE.release(); }catch(e){} WAKE = null; }
  SHARING = false; try{ localStorage.removeItem('kr_share_' + TOKEN); }catch(e){}
  if(silent !== true) render();
}
async function delivered(){
  if(!confirm('Sipariş müşteriye teslim edildi mi?')) return;
  const { error } = await sb.rpc('courier_delivered', { p_courier: TOKEN });
  if(error){ alert(error.message); return; }
  stopShare(true); await load();
}
document.addEventListener('visibilitychange', async () => { if(document.visibilityState === 'visible') load(); if(document.visibilityState === 'visible' && SHARING && !WAKE){ try{ WAKE = await navigator.wakeLock.request('screen'); }catch(e){} } });
load().then(() => {
  let was = false; try{ was = localStorage.getItem('kr_share_' + TOKEN) === '1'; }catch(e){}
  if(was && JOB && !JOB.delivered_at) startShare();
  // Restoran "Teslim edildi" deyince kurye ekranı hemen kapansın: yoldayken 8 sn'de bir, teslimden sonra yoklanmaz.
  TIMER = setInterval(() => { if(!JOB || !JOB.delivered_at) load(); }, 8000);
});
