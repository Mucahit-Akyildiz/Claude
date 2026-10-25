/* POS - Yazıcı ayarları + mutfak fişi tasarımı. Eski pos-core.js'ten bölündü; klasik <script src>, globaller
   paylaşılır ve dosyalar index.html'deki sırayla yüklenir (sıra önemli). */
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
    showWaiter: !!d.showWaiter,
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
    // Paket servis fişi: siparişin kime ait olduğu ve teslimat bilgileri (seçime bağlı).
    pkgShowName: d.pkgShowName !== false,
    pkgShowPhone: d.pkgShowPhone !== false,
    pkgShowAddress: d.pkgShowAddress !== false,
    pkgShowNote: d.pkgShowNote !== false,
  };
}
const TICKET_DESIGN_DEFAULTS = { width:'80', header:'', footer:'', fontFamily:'Courier New', bold:true, marginTop:4, marginRight:4, marginBottom:4, marginLeft:4, showOrderNumber:true, showItemTime:true, copies:1, timeFormat:'24', timeBold:true, showHeaderTime:false, showWaiter:false, colorTitle:'#000000', colorText:'#000000', colorNote:'#000000', colorTime:'#000000', sizeTitle:15, sizeText:13, sizeNote:11, sizeTime:11, transformTitle:'uppercase', transformText:'none', transformNote:'none', transformTime:'none', pkgShowName:true, pkgShowPhone:true, pkgShowAddress:true, pkgShowNote:true };
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
        <input type="color" id="td_color${key}" value="${design['color'+key]}" ${actOn('input','updateTicketPreview',[])} style="height:40px;padding:4px;">
      </div>
      <div class="field-group" style="margin:0;"><label>Boyut</label>
        <input type="number" id="td_size${key}" min="6" max="40" value="${design['size'+key]}" ${actOn('input','updateTicketPreview',[])} style="padding:9px 6px;text-align:center;">
      </div>
      <div class="field-group" style="margin:0;"><label>Harf Stili</label>
        <select id="td_transform${key}" ${actOn('input','updateTicketPreview',[])}>
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
    <button type="button" class="rte-btn" title="Kalın" data-keep-focus ${act('applyTicketRte', targetId, 'bold')}><b>K</b></button>
    <button type="button" class="rte-btn" title="İtalik" data-keep-focus ${act('applyTicketRte', targetId, 'italic')}><i>İ</i></button>
    <button type="button" class="rte-btn" title="Altı Çizili" data-keep-focus ${act('applyTicketRte', targetId, 'underline')}><u>A</u></button>
    <span class="rte-sep"></span>
    <button type="button" class="rte-btn" title="Sola Yasla" data-keep-focus ${act('applyTicketRte', targetId, 'justifyLeft')}>⯇</button>
    <button type="button" class="rte-btn" title="Ortala" data-keep-focus ${act('applyTicketRte', targetId, 'justifyCenter')}>☰</button>
    <button type="button" class="rte-btn" title="Sağa Yasla" data-keep-focus ${act('applyTicketRte', targetId, 'justifyRight')}>⯈</button>
    <span class="rte-sep"></span>
    <select class="rte-select" title="Yazı Tipi" data-keep-focus ${actOn('change','applyTicketRte',[targetId, 'fontName', '$value'])}>
      ${Object.keys(TICKET_FONTS).map(f => `<option value="${f}">${f}</option>`).join('')}
    </select>
    <select class="rte-select" title="Yazı Boyutu" data-keep-focus ${actOn('change','applyTicketRte',[targetId, 'fontSize', '$value'])}>
      <option value="2">Küçük</option>
      <option value="3" selected>Normal</option>
      <option value="5">Büyük</option>
      <option value="7">Çok Büyük</option>
    </select>
    <input type="color" class="rte-color" title="Yazı Rengi" value="#000000" data-keep-focus ${actOn('change','applyTicketRte',[targetId, 'foreColor', '$value'])}>
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
// Masaüstü uygulamasında Windows bildirimi denemesi (izin yoksa ister).
function testDesktopNotification(){
  if(!('Notification' in window)){ showToast('Bu cihaz bildirimleri desteklemiyor'); return; }
  if(Notification.permission==='denied'){ alert('Bildirimler Windows ayarlarında kapalı. Ayarlar → Sistem → Bildirimler bölümünden Peyktan için açın.'); return; }
  notifyDesktop('Test bildirimi: Windows bildirimleri çalışıyor ✓');
  showToast('Test bildirimi gönderildi — ekranın sağ altına bakın');
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
    const cur = getSession();
    if(bgAt && (Date.now() - Number(bgAt)) >= BG_AUTO_LOGOUT_MS && cur && !cur.remember) doLogout();
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
  // Peyktan sesli kanal: ses dosyası (res/raw/peyktan) uygulamanın 1.4
  // (build 11) sürümünden itibaren içinde. Eski sürümlerde dosya olmadığı için
  // bu kanal oluşturulmaz ve bildirimler 'default' kanaldan gelmeye devam eder.
  // Android'de kanalın sesi sonradan değiştirilemediği için kanal id'si sürümlü.
  APP.nativePushChannel = 'default';
  const AppPlugin = window.Capacitor.Plugins.App;
  APP.nativeChannelReady = (AppPlugin && AppPlugin.getInfo ? AppPlugin.getInfo() : Promise.resolve(null)).then(info => {
    if(info && parseInt(info.build, 10) >= 11){
      return PN.createChannel({
        id: 'peyktan_v1', name: 'Peyktan Bildirimleri', description: 'Sipariş, garson çağrısı ve mesaj bildirimleri',
        importance: 5, visibility: 1, vibration: true, lights: true, sound: 'peyktan.wav',
      }).then(() => { APP.nativePushChannel = 'peyktan_v1'; })
        .catch(e => reportClientError('push_channel', 'peyktan_v1 kanalı oluşturulamadı: ' + ((e && e.message) || e), 'build ' + info.build));
    }
    // Sesli kanal kullanılamıyorsa nedenini kayda geçir (Admin Paneli > Hatalar).
    reportClientError('push_channel', 'Eski uygulama sürümü: Peyktan sesi yok', 'build ' + (info && info.build) + ' / ' + (info && info.version));
  }).catch(e => reportClientError('push_channel', 'getInfo hatası: ' + ((e && e.message) || e), ''));
  PN.addListener('registration', (token) => {
    if(_fcmTokenResolve){ _fcmTokenResolve(token.value); _fcmTokenResolve = null; }
  });
  PN.addListener('registrationError', () => {
    if(_fcmTokenResolve){ _fcmTokenResolve(null); _fcmTokenResolve = null; }
  });
  // Uygulama AÇIKKEN gelen FCM bildirimini Android sistem çubuğunda
  // göstermiyor (1.3 öncesi sürümlerde presentationOptions yok); bu yüzden
  // ekranda da toast + zil ile gösteriyoruz. Vardiya bildirimlerinde
  // vardiya kutusu ve Vardiyalar ekranı hemen yenilenir.
  PN.addListener('pushNotificationReceived', (n) => {
    const title = (n && n.title) || 'Peyktan';
    const body = (n && n.body) || '';
    const data = (n && n.data) || {};
    showToast(title + (body ? ' — ' + body : ''), 6000, null, data.view ? () => openViewFromNotification(data.view, data.tag) : null);
    playPeyktanSound();
    refreshNavBadges();
    const session = getSession();
    if(session && String(data.tag||'').startsWith('shift')){
      refreshShiftWidget(session);
      if(APP.view==='settings' && APP.settingsTab==='shifts') renderShiftsTable(session);
    }
  });
  // Bildirime dokunulunca (uygulama arka planda/kapalıyken) ilgili ekrana
  // git - web tarafındaki service worker'ın notificationclick mesajıyla aynı iş.
  PN.addListener('pushNotificationActionPerformed', (action) => {
    const data = action && action.notification && action.notification.data;
    // Uygulama bildirimle soğuk açıldıysa ilk çizim bitsin diye kısa gecikmeyle geçilir.
    if(data && data.view) setTimeout(() => openViewFromNotification(data.view, data.tag), 400);
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
/* Sipariş veren cihazda anında fiş (varsayılan açık); yazıcısı olmayan cihazda etkisiz. */
function printEachItemEnabled(){ try{ return localStorage.getItem('rys_print_each_item') === '1'; }catch(e){ return false; } }
function setPrintEachItem(on){ try{ localStorage.setItem('rys_print_each_item', on ? '1' : '0'); }catch(e){} showToast(on ? 'Mutfak fişlerinde her ürün ayrı fişe basılacak' : 'Mutfak fişleri tek fişte toplu basılacak'); }
function printOnOrderEnabled(){ try{ return localStorage.getItem('rys_print_on_order') !== '0'; }catch(e){ return true; } }
function setPrintOnOrder(on){ try{ localStorage.setItem('rys_print_on_order', on ? '1' : '0'); }catch(e){} showToast(on ? 'Sipariş verilince fiş bu cihazda yazdırılacak' : 'Sipariş fişi bu cihazda otomatik yazdırılmayacak'); }
// Bu cihazda gerçekten sessiz yazdırabilen bir yazıcı tanımlı mı (masaüstü / USB / kiosk)?
function deviceHasSilentPrinter(){ return getPrinters().some(p => p.type==='electron' || p.type==='usb' || p.type==='silent-browser'); }
function resolvePrinterForStation(stationId){
  const printers = getPrinters();
  const map = getStationPrinterMap();
  if(stationId && map[stationId]){
    const p = printers.find(x => x.id===map[stationId]);
    if(p) return p;
  }
  return printers.find(p => p.id===getActivePrinterId()) || null;
}
/* Zil ayarları: library = yüklenen ses dosyaları [{id,name,data}] (her
   dosya bir kez saklanır); default/perStation[istasyon] = {preset:id} ya da
   {custom:libId}. Eski sürümde yüklenen ses doğrudan data URL olarak
   tutuluyordu - okurken kitaplığa taşınır. */
const BELL_LIBRARY_MAX = 6;
function getKitchenBellSounds(){
  let o;
  try{ o = JSON.parse(localStorage.getItem('rys_bell_sounds')) || {}; }catch(e){ o = {}; }
  o.perStation = o.perStation || {}; o.library = o.library || [];
  const migrate = (v) => {
    if(typeof v !== 'string' || !v) return v;
    let item = o.library.find(x => x.data === v);
    if(!item){ item = { id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2,6), name: 'Yüklenen ses', data: v }; o.library.push(item); }
    return { custom: item.id };
  };
  o.default = migrate(o.default) || null;
  Object.keys(o.perStation).forEach(k => { o.perStation[k] = migrate(o.perStation[k]); });
  return o;
}
function setKitchenBellSounds(obj){
  try{ localStorage.setItem('rys_bell_sounds', JSON.stringify(obj)); return true; }
  catch(e){ alert('Ses kaydedilemedi: tarayıcının depolama alanı doldu. Kullanmadığınız yüklü sesleri silip tekrar deneyin.'); return false; }
}
function resolveBellSetting(stationId){
  const sounds = getKitchenBellSounds();
  let v = (stationId && sounds.perStation[stationId]) || sounds.default || null;
  if(v && v.custom){
    const item = sounds.library.find(x => x.id === v.custom);
    return item ? item.data : null; // silinmiş sese bağlıysa varsayılan zil
  }
  return v;
}

const PR_TYPE = (t) => t==='usb' ? ['🔌','USB (doğrudan)'] : t==='silent-browser' ? ['🤫','Sessiz tarayıcı'] : t==='electron' ? ['💻','Masaüstü uygulaması'] : ['🖨️','Tarayıcı penceresi'];
function pickActivePrinter(id){ setActivePrinterId(id); document.querySelectorAll('.pp-card[data-pid], .pp-grid .pp-card:not(.pp-static)').forEach(c => c.classList.remove('on')); renderPrinterSettingsView(document.getElementById('main'), getSession()); showToast('Bu ekranın yazıcısı güncellendi ✓'); }
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
    <details class="pr-note">
      <summary style="cursor:pointer;font-weight:700;font-size:13px;">ℹ️ Fiş tasarımı tüm işletmede ortaktır; yazıcı seçimleri ise bu cihaza özeldir. <span class="muted" style="font-weight:500;">(ayrıntı)</span></summary>
      <p class="muted" style="margin:8px 0 0;text-align:left;font-size:12px;">⚠️ <b>Yazıcılar</b> ve <b>İstasyon → Yazıcı Eşleştirme</b> ise hâlâ <u>şu an bu ekranı açtığınız cihaza</u> özeldir (bir yazıcı fiziksel olarak hangi bilgisayara bağlıysa fiş oradan basılır, bu merkezi bir ayarla belirlenemez). Yeni bir kasa/mutfak bilgisayarı kurduğunuzda, o bilgisayarda da Yönetici olarak giriş yapıp yazıcı seçimini orada tekrar yapmanız gerekir.</p>
    </details>

    <div class="box" style="max-width:none;">
      <h2>Fiş Tasarımı</h2>
      <div class="td-layout">
        <div class="td-form">

          <div class="settings-section">
            <p class="settings-section-title">📄 Kağıt &amp; Yazı Tipi</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div class="field-group"><label>Kağıt Genişliği</label>
                <select id="td_width" ${actOn('input','updateTicketPreview',[])}>
                  <option value="58" ${design.width==='58'?'selected':''}>58mm</option>
                  <option value="80" ${design.width==='80'?'selected':''}>80mm</option>
                </select>
              </div>
              <div class="field-group"><label>Yazı Tipi (ürün satırları)</label>
                <select id="td_font" ${actOn('input','updateTicketPreview',[])}>
                  ${Object.keys(TICKET_FONTS).map(f => `<option value="${f}" ${design.fontFamily===f?'selected':''}>${f}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="toggle-row" style="border-bottom:none;padding-bottom:0;">
              <div><div class="toggle-label">Kalın Yazı (ürün satırları)</div><div class="toggle-desc">Çıktı silik/soluk çıkıyorsa açık bırakın — termal yazıcılarda ince yazı genelde net basmıyor.</div></div>
              <label class="toggle-switch"><input type="checkbox" id="td_bold" ${design.bold?'checked':''} ${actOn('input','updateTicketPreview',[])}><span class="slider"></span></label>
            </div>
          </div>

          <div class="settings-section td-wide">
            <p class="settings-section-title">✍️ Fiş İçeriği</p>
            <label style="display:block;font-size:12.5px;font-weight:700;color:var(--muted);">Fiş Başlığında Ek Not (opsiyonel)</label>
            <div class="rte-toolbar" data-target="td_header">${ticketRteToolbarHtml('td_header')}</div>
            <div id="td_header" class="rte-box" contenteditable="true" data-placeholder="örn. Şube: Merkez" ${actOn('input','updateTicketPreview',[])}>${sanitizeRichHtml(design.header||'')}</div>

            <label style="display:block;margin-top:14px;font-size:12.5px;font-weight:700;color:var(--muted);">Fiş Altında Ek Not (opsiyonel)</label>
            <div class="rte-toolbar" data-target="td_footer">${ticketRteToolbarHtml('td_footer')}</div>
            <div id="td_footer" class="rte-box" contenteditable="true" data-placeholder="örn. Afiyet olsun!" ${actOn('input','updateTicketPreview',[])}>${sanitizeRichHtml(design.footer||'')}</div>

            <div style="margin-top:14px;">
              <div class="toggle-row">
                <div class="toggle-label">Sipariş Numarasını Göster</div>
                <label class="toggle-switch"><input type="checkbox" id="td_showOrderNumber" ${design.showOrderNumber?'checked':''} ${actOn('input','updateTicketPreview',[])}><span class="slider"></span></label>
              </div>
              <div class="toggle-row">
                <div class="toggle-label">Ürün Saatlerini Göster</div>
                <label class="toggle-switch"><input type="checkbox" id="td_showItemTime" ${design.showItemTime?'checked':''} ${actOn('input','updateTicketPreview',[])}><span class="slider"></span></label>
              </div>
              <div class="toggle-row">
                <div class="toggle-label">Fişin Üstünde Saat Göster</div>
                <label class="toggle-switch"><input type="checkbox" id="td_showHeaderTime" ${design.showHeaderTime?'checked':''} ${actOn('input','updateTicketPreview',[])}><span class="slider"></span></label>
              </div>
              <div class="toggle-row">
                <div><div class="toggle-label">Garson Adını Göster</div><div class="toggle-desc">Siparişi alan garson(lar) fişin üstünde yazar.</div></div>
                <label class="toggle-switch"><input type="checkbox" id="td_showWaiter" ${design.showWaiter?'checked':''} ${actOn('input','updateTicketPreview',[])}><span class="slider"></span></label>
              </div>
              <div class="toggle-row" style="border-bottom:none;">
                <div><div class="toggle-label">Kopya Sayısı</div><div class="toggle-desc">Masaüstü uygulaması/USB yazıcıda her fiş bu kadar kez basılır.</div></div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <button type="button" class="chip-btn" style="padding:4px 12px;" ${act('stepTicketCopies', -1)}>−</button>
                  <span id="td_copiesVal" style="min-width:14px;text-align:center;font-weight:700;">${design.copies}</span>
                  <button type="button" class="chip-btn" style="padding:4px 12px;" ${act('stepTicketCopies', 1)}>+</button>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <p class="settings-section-title">⏰ Saat Ayarı</p>
            <div class="field-group"><label>Saat Formatı</label>
              <select id="td_timeFormat" ${actOn('input','updateTicketPreview',[])}>
                <option value="24" ${design.timeFormat==='24'?'selected':''}>24 Saat (17:05)</option>
                <option value="12" ${design.timeFormat==='12'?'selected':''}>12 Saat (05:05 ÖS)</option>
              </select>
            </div>
            <div class="toggle-row" style="border-bottom:none;">
              <div><div class="toggle-label">Saat Kalın Yazılsın</div><div class="toggle-desc">"Kalın Yazı" ürün adı ayarından bağımsız — saat silik çıkıyorsa açık bırakın.</div></div>
              <label class="toggle-switch"><input type="checkbox" id="td_timeBold" ${design.timeBold?'checked':''} ${actOn('input','updateTicketPreview',[])}><span class="slider"></span></label>
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
              <button type="button" class="chip-btn" ${act('applyMarginPreset', 2)}>Dar (2mm)</button>
              <button type="button" class="chip-btn" ${act('applyMarginPreset', 4)}>Normal (4mm)</button>
              <button type="button" class="chip-btn" ${act('applyMarginPreset', 8)}>Geniş (8mm)</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div class="field-group"><label>Üst</label><input id="td_mtop" type="number" min="0" max="30" step="0.5" value="${design.marginTop}" ${actOn('input','updateTicketPreview',[])}></div>
              <div class="field-group"><label>Alt</label><input id="td_mbottom" type="number" min="0" max="30" step="0.5" value="${design.marginBottom}" ${actOn('input','updateTicketPreview',[])}></div>
              <div class="field-group"><label>Sol</label><input id="td_mleft" type="number" min="0" max="30" step="0.5" value="${design.marginLeft}" ${actOn('input','updateTicketPreview',[])}></div>
              <div class="field-group"><label>Sağ</label><input id="td_mright" type="number" min="0" max="30" step="0.5" value="${design.marginRight}" ${actOn('input','updateTicketPreview',[])}></div>
            </div>
          </div>

          <div class="td-wide td-save">
            <button style="flex:1;margin-top:0;" ${act('saveTicketDesign')}>💾 Tasarımı Kaydet</button>
            <button class="ghost-btn" style="flex:1;margin-top:0;" ${act('resetTicketDesign')}>Varsayılana Sıfırla</button>
          </div>
        </div>
        <div class="td-prev">
          <p class="muted" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin:0 0 8px;">🧾 Canlı Önizleme</p>
          <div id="ticketPreviewWrap" style="background:#e9e9ec;border-radius:14px;padding:16px;display:flex;justify-content:center;overflow:auto;max-width:100%;">
            <div id="ticketPreview"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="box" style="max-width:none;">
      <h2>Bu Ekranın Yazıcısı</h2>
      <p class="muted" style="text-align:left;margin:0 0 14px;">Seçili yazıcıya fiş <b>doğrudan</b> (pencere açmadan) gönderilir; uygun yazıcı yoksa tarayıcının yazdırma penceresi açılır.</p>
      <div class="pp-grid">
        ${[{ id:'', name:'Tarayıcı Yazdırma Penceresi', type:'browser', def:true }].concat(printers).map((p, i) => { const [ic, tl] = PR_TYPE(p.type), on = (p.id||'') === (activeId||'');
          return `<button type="button" class="pp-card ${on?'on':''}" style="--sc:var(--c${i%4+1});" ${act('pickActivePrinter', p.id||'')}>
            <span class="pp-ic">${ic}</span><span class="pp-txt"><b>${escapeHtml(p.name)}</b><small>${p.def ? 'Varsayılan' : tl}</small></span><span class="pp-radio"></span></button>`; }).join('')}
      </div>
      <label class="sw-card" style="margin-top:14px !important;">
        <input type="checkbox" class="sw" ${printOnOrderEnabled()?'checked':''} ${actOn('change','setPrintOnOrder',['$checked'])}>
        <span><b>Sipariş verilince fişi hemen bu cihazdan yazdır</b><br><span class="muted" style="font-size:12.5px;">Sipariş Al / Paket Servis'te sipariş gönderilince fiş bu cihazın yazıcısına basılır. Fişi başka cihazdaki mutfak ekranı basıyorsa kapatın (çift fiş çıkmasın).</span></span>
      </label>
      <label class="sw-card" style="margin-top:10px !important;">
        <input type="checkbox" class="sw" ${printEachItemEnabled()?'checked':''} ${actOn('change','setPrintEachItem',['$checked'])}>
        <span><b>Ürünleri tek tek yazdır</b><br><span class="muted" style="font-size:12.5px;">Mutfak fişinde her ürün ayrı fişe basılır (örn. 3 Döner → 3 ayrı fiş). Paketleme ve etiketleme için kullanışlıdır. Bu cihazdaki tüm sipariş fişleri için geçerlidir.</span></span>
      </label>
    </div>

    <div class="box" style="max-width:none;">
      <div class="fsheet-bar" style="margin:0 0 12px;"><h2 style="margin:0;">Yazıcılar</h2>${sheetBtnHtml('printerSheet','+ Yeni Yazıcı')}</div>
      ${!usbSupported ? '<p class="muted" style="text-align:left;">⚠️ Bu tarayıcı USB yazıcı bağlantısını (WebUSB) desteklemiyor — Chrome veya Edge kullanmanız gerekiyor. Yine de "Tarayıcı Yazdırma Penceresi" tipinde yazıcı ekleyebilirsiniz.</p>' : ''}
      ${printers.length ? `<div class="pp-grid">${printers.map((p, i) => { const [ic, tl] = PR_TYPE(p.type);
        return `<div class="pp-card pp-static" style="--sc:var(--c${i%4+1});">
          <span class="pp-ic">${ic}</span><span class="pp-txt"><b>${escapeHtml(p.name)}</b><small>${tl}${p.type==='electron' && p.osPrinterName ? ' · '+escapeHtml(p.osPrinterName) : ''}</small></span>
          <span class="pp-acts">${p.type==='usb' ? `<button type="button" class="pc-btn" ${act('reconnectUsbPrinter', p.id)}>Bağlan</button>` : ''}
            <button type="button" class="pc-btn" ${act('testPrintPrinter', p.id)}>🖨️ Test</button>
            <button type="button" class="ico-btn danger" title="Sil" ${act('removePrinterEntry', p.id)}>🗑</button></span>
        </div>`; }).join('')}</div>` : '<div class="empty-state"><div style="font-size:38px;">🖨️</div><p class="muted">Henüz yazıcı eklenmedi. <b>+ Yeni Yazıcı</b> ile ekleyin.</p></div>'}
      ${!isDesktopApp() ? `<p class="muted" style="text-align:left;margin-top:10px;font-size:12px;background:var(--panel2);border-radius:8px;padding:10px;">💻 Bu ekran şu an tarayıcıda açık. <b>Masaüstü Uygulaması</b> (Windows/macOS) yazıcıya hiçbir pencere açmadan, ekstra ayara gerek kalmadan basabiliyor — kurulursa "Masaüstü Uygulaması" tipini seçebilirsiniz.</p>` : ''}
      ${sheetHtml('printerSheet', '🖨️', 'Yeni Yazıcı', `
        <div class="fsheet-grid">
          <div class="field-group wide"><label>Yazıcı Adı</label><input id="np_pname" placeholder="örn. Mutfak Yazıcısı"></div>
          <div class="field-group wide"><label>Bağlantı Türü</label>
            <select id="np_ptype" ${actOn('change','onNewPrinterTypeChange',[])}>
              <option value="electron" ${isDesktopApp()?'selected':''}>Masaüstü Uygulaması (sessiz, önerilir)</option>
              <option value="browser" ${isDesktopApp()?'':'selected'}>Tarayıcı Yazdırma Penceresi (her seferinde açılır)</option>
              <option value="usb" ${usbSupported?'':'disabled'}>USB (doğrudan, deneysel - küçük termal fiş yazıcıları için)</option>
              <option value="silent-browser">Sessiz Tarayıcı Yazdırma (normal/ofis yazıcıları için, kiosk-printing gerekir)</option>
            </select>
          </div>
        </div>
        <div id="npElectronWrap" class="field-group" style="margin-top:10px;"></div>
        <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','printerSheet')}>Vazgeç</button><button ${act('addPrinterEntry')}>+ Yazıcı Ekle</button></div>`, 'var(--c1)')}
      <details class="pr-help"><summary>❔ Hangi bağlantı türünü seçmeliyim?</summary><p class="muted" style="text-align:left;margin:8px 0 0;font-size:12px;">
        Not: <b>USB (doğrudan)</b> yalnızca standart bir USB arayüzü üzerinden ham komut kabul eden küçük termal
        fiş yazıcılarında çalışır — Xerox, HP, Canon gibi normal/ofis yazıcılarının USB arayüzü işletim sisteminin
        kendi sürücüsünde olduğu için tarayıcı (WebUSB) bu tür yazıcılara asla erişemez, "USB" tipini seçseniz bile
        çalışmaz. Normal bir yazıcınız varsa ve masaüstü uygulamasını kuramıyorsanız <b>"Sessiz Tarayıcı Yazdırma"</b>
        seçin ve o bilgisayarda şunları yapın: (1) bu yazıcıyı işletim sisteminde <b>varsayılan yazıcı</b> yapın,
        (2) Chrome/Edge'i <code>--kiosk-printing</code> bayrağıyla başlatın (kısayolun hedefine ekleyin, örn.
        <code>"...\chrome.exe" --kiosk-printing</code>). <b>Masaüstü Uygulaması</b> kuruluysa bu iki adıma hiç gerek
        kalmadan aynı şekilde sessizce basar.
      </p></details>
    </div>

    <div class="box" style="max-width:none;">
      <h2>İstasyon → Yazıcı Eşleştirme</h2>
      <p class="muted" style="text-align:left;">Her istasyonun ürünleri hangi yazıcıya basılsın? Örneğin Çayhane'nin ürünleri (çay, su, tiramisu gibi) bir yazıcıya, Izgara'nın ürünleri (döner, köfte gibi) başka bir yazıcıya gidebilir. Bir istasyona yazıcı seçmezseniz o istasyonun fişi "Bu Ekranın Yazıcısı" seçimini kullanır. Sipariş onaylandığında her istasyon için ayrı bir fiş kendi yazıcısına gönderilir.</p>
      <div class="sp-flow">${APP.config.stations.map((st, i) => `<div class="spf-card" style="--sc:${st.color||'var(--c'+(i%4+1)+')'};">
        <div class="spf-row"><span class="spf-st"><span class="spf-ic">${escapeHtml(st.icon||'🍳')}</span><b>${escapeHtml(st.name)}</b></span>
          <span class="spf-arrow">➜</span>
          <select class="spf-sel" ${actOn('change','setStationPrinter',[st.id, '$value'])}>
            <option value="">🖥️ Bu Ekranın Yazıcısı (varsayılan)</option>
            ${printers.map(p => `<option value="${p.id}" ${stationPrinterMap[st.id]===p.id?'selected':''}>${PR_TYPE(p.type)[0]} ${escapeHtml(p.name)}</option>`).join('')}
          </select></div>
        ${stationPrintProductsHtml(st)}
      </div>`).join('')}</div>
    </div>
    <div class="box" style="max-width:none;">
      <h2>🧾 Kasa Fişi</h2>
      <p class="muted" style="text-align:left;">Ödemeler ekranındaki <b>Kasa Fişi Yazdır</b> düğmesiyle basılan, ürün fiyatları ve toplam tutarı içeren hesap fişidir. Fiş Tasarımı'ndaki kağıt genişliği, yazı tipi, başlık ve alt notu kullanır; <b>Bu Ekranın Yazıcısı</b>na basılır.</p>
      <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;">
        <div class="cash-prev"><div id="cashReceiptPreview"></div></div>
        <div class="cash-info">
          <div class="cash-li">📐 <span>Kağıt genişliği, yazı tipi, başlık ve alt not <b>Fiş Tasarımı</b>'ndan gelir.</span></div>
          <div class="cash-li">🖨️ <span><b>Bu Ekranın Yazıcısı</b>'na basılır.</span></div>
          <div class="cash-li">💳 <span>Ödemeler ekranındaki <b>Kasa Fişi Yazdır</b> düğmesiyle basılır.</span></div>
          <button type="button" style="width:auto;margin:6px 0 0;" ${act('testCashReceipt')}>🖨️ Örnek Kasa Fişi Yazdır</button>
        </div>
      </div>
    </div>
  `;
  // Her bölüm ayrı sekmede (tek uzun sayfa yerine).
  const PR_TABS = [{ id:'design', ic:'🧾', label:'Fiş Tasarımı' }, { id:'cash', ic:'💵', label:'Kasa Fişi' }, { id:'device', ic:'💻', label:'Bu Ekranın Yazıcısı' }, { id:'printers', ic:'🖨️', label:'Yazıcılar' }, { id:'stations', ic:'🔀', label:'İstasyon → Yazıcı' }, { id:'pkg', ic:'📦', label:'Paket Servis Fişi' }, { id:'status', ic:'📡', label:'Durum ve Geçmiş' }];
  const PR_ORDER = ['design', 'device', 'printers', 'stations', 'cash']; // kutuların sayfadaki sırası
  const boxes = [...main.querySelectorAll(':scope > .box')];
  boxes.forEach((b, i) => { if(PR_ORDER[i]){ b.dataset.prtab = PR_ORDER[i]; b.classList.add('pr-pane'); } });
  const pkgBox = document.createElement('div'); pkgBox.className = 'box pr-pane'; pkgBox.style.maxWidth = 'none'; pkgBox.dataset.prtab = 'pkg';
  pkgBox.innerHTML = pkgTicketSettingsHtml(); boxes.push(pkgBox);
  const stBox = document.createElement('div'); stBox.className = 'box pr-pane'; stBox.style.maxWidth = 'none'; stBox.dataset.prtab = 'status';
  stBox.innerHTML = `<h2>📡 Yazıcı Durumu</h2><p class="muted" style="text-align:left;margin:0 0 12px;font-size:13px;">Bu cihazdan gönderilen fişlere göre her yazıcının son durumu. Kırmızı kart: son fiş basılamadı.</p>
    <div id="printerStatusCards" class="ps-grid"></div>
    <h2 style="margin-top:22px;display:flex;justify-content:space-between;align-items:center;gap:8px;">🕘 Yazdırma Geçmişi <button type="button" class="ghost-btn" style="width:auto;margin:0;padding:5px 12px;font-size:12.5px;" ${act('clearPrintLog')}>Temizle</button></h2>
    <div id="printLogBox">${printLogHtml()}</div>`;
  boxes.push(stBox);
  renderCashReceiptPreview();
  if(!PR_TABS.some(t => t.id === APP.printerTab)) APP.printerTab = 'design';
  const PR_DESC = { design:'Mutfak fişinin görünümü', cash:'Müşteri / kasa fişi', device:'Bu cihazda kullanılacak yazıcı', printers:'Tanımlı yazıcılar', stations:'Hangi istasyon hangi yazıcıya', pkg:'Müşteri, telefon, adres', status:'Yazıcı durumu, son basılan fişler' };
  const layout = document.createElement('div'); layout.className = 'set-layout pr-layout';
  layout.innerHTML = `<nav class="tabs settings-tabs set-nav">${PR_TABS.map((t, i) => `<div class="tab set-item" data-pr-tab="${t.id}" style="--i:${i};--sc:var(--c${i%4+1});" ${act('setPrinterTab', t.id)}><span class="set-ico">${t.ic}</span><span class="set-txt"><b>${t.label}</b><small>${PR_DESC[t.id]||''}</small></span></div>`).join('')}</nav><div class="set-content pr-content"></div>`;
  if(boxes[0]) main.insertBefore(layout, boxes[0]);
  const content = layout.querySelector('.pr-content'); boxes.forEach(b => content.appendChild(b));
  showPrinterPane();
  updateTicketPreview();
  renderPkgTicketPreview();
  renderPrinterStatusCards();
  onNewPrinterTypeChange();
}
/* Paket servis siparişlerinin mutfak fişinde basılacak müşteri/teslimat bilgileri. */
const PKG_SAMPLE = { name:'Ahmet Yılmaz', phone:'0555 123 45 67', address:'Atatürk Cad. No:12 D:4, Merkez', note:'Kapıda kartla ödeme' };
function pkgTicketSettingsHtml(){
  const d = getTicketDesign();
  const row = (k, ic, l, sub) => `<label class="sw-card pk-opt"><input type="checkbox" class="sw" ${d[k] ? 'checked' : ''} ${actOn('change','setPkgTicketOpt',[k, '$checked'])}><span><b>${ic} ${l}</b><br><span class="muted" style="font-size:12.5px;">${sub}</span></span></label>`;
  return `<h2>📦 Paket Servis Sipariş Fişi</h2>
    <p class="muted" style="text-align:left;margin:0 0 14px;font-size:13px;">Paket Servis'ten sipariş geldiğinde istasyon fişinin üstünde aşağıda seçtiğiniz bilgiler basılır. Masa siparişlerinde bu bölüm çıkmaz.</p>
    <div class="pk-wrap"><div class="pk-opts">
      ${row('pkgShowName', '👤', 'Sipariş kime ait', 'Müşteri adı')}
      ${row('pkgShowPhone', '📞', 'Telefon', 'Kuryenin araması için')}
      ${row('pkgShowAddress', '📍', 'Teslimat adresi', 'Paket formundaki adres')}
      ${row('pkgShowNote', '📝', 'Sipariş notu', 'Örn. kapıda kartla ödeme')}
    </div>
    <div class="pk-prev"><small class="muted">Önizleme</small><div id="pkgTicketPreview" class="ticket-paper"></div></div></div>`;
}
function renderPkgTicketPreview(){
  const el = document.getElementById('pkgTicketPreview'); if(!el) return;
  const design = Object.assign({}, getTicketDesign(), { pkg: PKG_SAMPLE });
  applyTicketDesignStyle(el, design, 'ticket-paper');
  const s = getSession();
  el.innerHTML = buildTicketHtml(s ? s.restaurant_name : 'İŞLETME ADI', '📦 Paket - Ahmet Yılmaz', [{ qty:2, name:'Lahmacun', added_at:new Date().toISOString() }, { qty:1, name:'Ayran', added_at:new Date().toISOString() }], design, 18);
}
async function setPkgTicketOpt(k, on){
  const d = Object.assign({}, (APP.config && APP.config.ticket_design) || {}); d[k] = !!on;
  if(await setTicketDesign(d)){ renderPkgTicketPreview(); showToast('Paket fişi ayarı kaydedildi ✓'); }
}
/* İstasyonun ürünleri: hangileri mutfak fişine basılsın (işaret kaldırılırsa fişe çıkmaz, ekranda görünür). */
function stationPrintProductsHtml(st){
  const prods = ((APP.config && APP.config.products) || []).filter(p => p.station_id === st.id);
  if(!prods.length) return '<p class="muted" style="margin:0;font-size:12.5px;">Bu istasyonda ürün yok.</p>';
  const off = prods.filter(p => p.print_ticket === false).length;
  // Ürünler menülerine göre gruplanır (Ayarlar → Menüler & İstasyonlar sırasıyla).
  const menus = (APP.config && APP.config.menus) || [];
  const groups = {};
  prods.forEach(p => { const k = p.menu_id || ''; (groups[k] = groups[k] || []).push(p); });
  const order = [...menus.map(m => m.id).filter(id => groups[id]), ...Object.keys(groups).filter(k => k && !menus.some(m => m.id===k)), ...(groups[''] ? [''] : [])];
  const menuName = (k) => k ? ((menus.find(m => m.id===k) || {}).name || 'Menü') : 'Menüsüz';
  return `<details ${APP.prOpenSt===st.id?'open':''} style="background:var(--panel2);border:1px solid var(--border);border-radius:10px;padding:8px 12px;">
    <summary style="cursor:pointer;font-size:13px;font-weight:700;">🧾 Fişe çıkacak ürünler · ${prods.length - off}/${prods.length}${off ? ` <span class="muted" style="font-weight:400;">(${off} ürün fişe çıkmaz)</span>` : ''}</summary>
    <div style="display:flex;gap:8px;margin:10px 0 6px;flex-wrap:wrap;">
      <button type="button" class="ghost-btn" style="width:auto;margin:0;padding:5px 12px;font-size:12.5px;" ${act('setStationPrintAll', st.id, true)}>Tümü fişe çıksın</button>
      <button type="button" class="ghost-btn" style="width:auto;margin:0;padding:5px 12px;font-size:12.5px;" ${act('setStationPrintAll', st.id, false)}>Hiçbiri çıkmasın</button>
    </div>
    ${order.map(k => `<div style="margin-top:10px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:8px 10px;"><div style="font-size:12px;font-weight:800;text-transform:uppercase;margin-bottom:6px;display:flex;justify-content:space-between;"><span>📋 ${escapeHtml(menuName(k))}</span><span class="muted" style="font-weight:600;">${groups[k].filter(p => p.print_ticket !== false).length}/${groups[k].length}</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px 14px;">${groups[k].map(p => `<label style="display:flex;align-items:center;gap:8px;font-size:13.5px;cursor:pointer;margin:0;"><input type="checkbox" style="width:auto;margin:0;" ${p.print_ticket === false ? '' : 'checked'} ${actOn('change','setProductPrint',[p.id, '$checked'])}>${escapeHtml(p.name)}</label>`).join('')}</div></div>`).join('')}
  </details>`;
}
async function setProductPrint(pid, on){
  const p = (APP.config.products || []).find(x => x.id === pid); if(!p) return;
  const { error } = await sb.rpc('set_product_options', { p_token: getSession().session_token, p_product_id: pid, p_category: p.category || null, p_print_ticket: !!on });
  if(error){ alert(error.message); renderPrinterSettingsView(document.getElementById('main'), getSession()); return; }
  p.print_ticket = !!on;
  showToast(on ? p.name + ' fişe çıkacak' : p.name + ' fişe çıkmayacak');
}
async function setStationPrintAll(stationId, on){
  const list = (APP.config.products || []).filter(p => p.station_id === stationId && (p.print_ticket !== false) !== on);
  if(!list.length) return;
  APP.prOpenSt = stationId;
  const s = getSession();
  await withLoadingOverlay(Promise.all(list.map(p => sb.rpc('set_product_options', { p_token: s.session_token, p_product_id: p.id, p_category: p.category || null, p_print_ticket: on }).then(r => { if(!r.error) p.print_ticket = on; }))));
  renderPrinterSettingsView(document.getElementById('main'), s);
}
const CASH_SAMPLE = [{ qty:2, name:'Izgara Köfte', price:320 }, { qty:1, name:'Ayran', price:40 }, { qty:1, name:'Künefe', price:150 }];
function renderCashReceiptPreview(){
  const el = document.getElementById('cashReceiptPreview'); if(!el) return;
  const design = Object.assign({}, getTicketDesign(), { priced: true, showItemTime: false, totals: { total: 790 } });
  applyTicketDesignStyle(el, design, 'ticket-paper');
  const s = getSession();
  el.innerHTML = buildTicketHtml(s ? s.restaurant_name : 'İŞLETME ADI', 'Masa 3', CASH_SAMPLE, design, 12);
}
function testCashReceipt(){ printCashReceipt('Masa 3', CASH_SAMPLE, 790, 12); }
function showPrinterPane(){
  document.querySelectorAll('#main .pr-pane').forEach(b => { b.style.display = b.dataset.prtab === APP.printerTab ? '' : 'none'; });
  document.querySelectorAll('#main [data-pr-tab]').forEach(t => { t.classList.toggle('active', t.dataset.prTab === APP.printerTab); t.classList.toggle('on', t.dataset.prTab === APP.printerTab); });
}
function setPrinterTab(t){ APP.printerTab = t; showPrinterPane(); }
/* Son 30 günde bu kullanıcıya gönderilen bildirimler (bkz. notification_log). Dokununca ilgili ekrana gider. */
async function loadNotificationHistory(){
  const box = document.getElementById('notifHistory'); if(!box) return;
  const { data, error } = await sb.rpc('list_my_notifications', { p_token: getSession().session_token });
  if(error){ box.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  const rows = data || [];
  if(!rows.length){ box.innerHTML = '<p class="muted">Henüz bildirim yok.</p>'; return; }
  box.innerHTML = '<div style="max-height:420px;overflow:auto;">' + rows.map(n => {
    const d = new Date(n.created_at);
    const when = d.toLocaleDateString('tr-TR', { day:'numeric', month:'short' }) + ' ' + d.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
    const go = n.view && NAV_ITEMS.some(i => i.view === n.view) ? `${act('goToView', n.view)}` : '';
    return `<div ${go} class="notif-row" style="display:flex;gap:10px;padding:10px 4px;border-bottom:1px solid var(--border);${n.read ? '' : 'font-weight:700;'}${go ? 'cursor:pointer;' : ''}">
      <div style="flex:1;min-width:0;overflow-wrap:anywhere;"><div>${escapeHtml(n.title)}</div>${n.body ? `<div class="muted" style="font-size:13px;font-weight:400;">${escapeHtml(n.body)}</div>` : ''}</div>
      <div class="muted" style="font-size:12px;white-space:nowrap;font-weight:400;">${when}</div></div>`;
  }).join('') + '</div>';
}
/* Bildirimler sayfası: bölümler (Kime Gitsin, Push, Sesli, Zil, Geçmiş) diğer
   ayar sayfaları gibi soldaki menüde; seçilen bölüm sağda gösterilir. */
const NOTIF_DESC = [[/Kime/, 'Hangi rol hangi bildirimi alır'], [/Windows/, 'Masaüstü uygulaması'], [/Push/, 'Uygulama kapalıyken de'], [/Sesli/, 'Zil ve sesli okuma, ses seçimi'], [/Zil/, 'Mutfak yeni sipariş zili'], [/Geçmiş/, 'Son 30 gün']];
function notifSideNav(part){
  if(!part) return;
  // Sayfa aynı DOM üzerinde ikinci kez kurulursa (ör. arka arkaya yenileme)
  // eski menüyü söküp kutuları geri koy; menü iki kez oluşmasın.
  part.querySelectorAll(':scope > .set-layout').forEach(l => {
    l.querySelectorAll('.nf-content > .box').forEach(b => { b.style.display = ''; delete b.dataset.nfIdx; l.before(b); });
    l.remove();
  });
  part.querySelectorAll('#notifHistory').forEach(h => { const b = h.closest('.box'); if(b) b.remove(); });
  const roles = part.querySelector('#notifRolesBox'); const firstBox = part.querySelector(':scope > .box');
  if(roles && firstBox && roles !== firstBox) part.insertBefore(roles, firstBox);
  const hist = document.createElement('div'); hist.className = 'box'; hist.style.maxWidth = 'none';
  hist.innerHTML = '<h2>🕘 Geçmiş Bildirimler</h2><div id="notifHistory"><p class="muted">Yükleniyor…</p></div>';
  part.appendChild(hist);
  const boxes = [...part.querySelectorAll(':scope > .box')].filter(b => b.querySelector(':scope > h2') && b.style.display !== 'none');
  const items = boxes.map(b => {
    const t = b.querySelector(':scope > h2').textContent.trim();
    const m = t.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*(.*)$/u);
    return { ic: m ? m[1] : '🔔', label: (m ? m[2] : t).replace(/\s*\(.*\)$/, ''), desc: (NOTIF_DESC.find(([r]) => r.test(t)) || [, ''])[1] };
  });
  let cur = items.findIndex(x => x.label === APP.notifPane); if(cur < 0) cur = 0;
  const layout = document.createElement('div'); layout.className = 'set-layout pr-layout';
  layout.innerHTML = `<nav class="tabs settings-tabs set-nav">${items.map((t, i) => `<div class="tab set-item" data-nf-tab="${i}" style="--i:${i};--sc:var(--c${i%4+1});" ${act('setNotifPane', i, t.label)}><span class="set-ico">${t.ic}</span><span class="set-txt"><b>${escapeHtml(t.label)}</b><small>${t.desc}</small></span></div>`).join('')}</nav><div class="set-content nf-content"></div>`;
  part.insertBefore(layout, boxes[0]);
  const content = layout.querySelector('.nf-content');
  boxes.forEach((b, i) => { b.dataset.nfIdx = i; content.appendChild(b); });
  setNotifPane(cur, items[cur].label);
}
function setNotifPane(idx, label){
  APP.notifPane = label;
  document.querySelectorAll('#main [data-nf-idx]').forEach(b => { b.style.display = Number(b.dataset.nfIdx) === idx ? '' : 'none'; });
  document.querySelectorAll('#main [data-nf-tab]').forEach(t => { const on = Number(t.dataset.nfTab) === idx; t.classList.toggle('active', on); t.classList.toggle('on', on); });
  if(/Geçmiş/.test(label)) loadNotificationHistory();
}
async function renderNotificationSettingsView(main, session){
  if(!APP.config){
    const { data, error } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token }));
    if(error){ main.innerHTML = '<h1>Bildirim Ayarları</h1><p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
    APP.config = data;
  }
  main.innerHTML = `
    <h1>Bildirimler</h1>
    <div id="notifSettingsPart">
    <p class="muted" style="text-align:left;">${session.isManager ? '<b>Kime Gitsin</b> bölümünden push ve sesli bildirimlerin hangi rollere gideceğini siz belirlersiniz; bu kural tüm personelin cihazına uygulanır. Diğer bölümler (ses seçimi, zil sesi) yalnızca bu cihaza özeldir.' : 'Hangi bildirimlerin size gideceğini yöneticiniz belirler (🔒 işaretli olanlar). Ses seçimi ve zil sesi gibi ayarlar yalnızca bu cihaza özeldir.'}</p>

    ${!hasFeature('push_notifications') ? `<div class="box" style="max-width:none;"><h2>📱 Push Bildirimleri (Uygulama Kapalıyken de)</h2>${lockedFeatureHtml()}</div>` : ''}
    ${isDesktopApp() && hasFeature('push_notifications') ? `<div class="box" style="max-width:none;">
      <h2>🖥️ Windows Bildirimleri</h2>
      <p class="muted" style="text-align:left;">Masaüstü uygulamasında bildirimler, uygulama açıkken (simge durumuna küçültülmüş ya da arka planda olsa bile) <b>Windows bildirimi</b> olarak gelir; ayrıca açmanız gerekmez. Windows'un kendi tarayıcı push altyapısı masaüstü uygulamasında çalışmadığı için uygulama tamamen kapalıyken bildirim gelmez — bunun için telefondaki Peyktan uygulamasında bildirimleri açın.</p>
      <button type="button" class="sbtn" style="width:auto;max-width:260px;" ${act('testDesktopNotification')}>🔔 Test Bildirimi Göster</button>
    </div>` : ''}
    <div class="box" style="max-width:none;${hasFeature('push_notifications') && !isDesktopApp()?'':'display:none;'}">
      <h2>📱 Push Bildirimleri (Uygulama Kapalıyken de)</h2>
      <p class="muted" style="text-align:left;">Açarsanız, hazır bekleyen siparişiniz olduğunda bu cihaza — tarayıcı/uygulama kapalı olsa bile — bildirim göndeririz.</p>
      <p id="pushStatusText" class="muted" style="font-size:13px;margin:10px 0;"></p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button id="pushToggleBtn" style="max-width:260px;" ${act('togglePushNotifications')}>Kontrol ediliyor...</button>
        <button id="testPushBtn" class="sbtn" style="width:auto;max-width:260px;" ${act('sendTestPush')}>🔔 Test Bildirimi Gönder</button>
      </div>
      <p id="testPushResult" class="muted" style="font-size:12px;margin-top:8px;"></p>
    </div>

    ${voiceSettingsHtml()}
    ${typeof birthdaySettingsHtml === 'function' ? birthdaySettingsHtml() : ''}
    <div class="box" style="max-width:none;">
      <h2>🔔 Bildirim Sesi (Yeni Sipariş Zili)</h2>
      <p class="muted" style="text-align:left;">Mutfağa yeni bir sipariş düştüğünde bu ekranda çalacak sesi özelleştirebilirsiniz. Bir istasyon seçip kendi ses dosyanızı yükleyerek o istasyona özel bir zil sesi de tanımlayabilirsiniz (örn. Izgara için ayrı, Çayhane için ayrı).</p>
      <div class="field-group" style="max-width:320px;"><label>Kapsam</label>
        <select id="bellScopeSelect" ${actOn('change','updateBellScopeStatus',[])}>
          <option value="">Varsayılan (istasyona özel ses yoksa kullanılır)</option>
          ${APP.config.stations.map(s => `<option value="${s.id}">${escapeHtml(s.icon||'🍳')} ${escapeHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <p id="bellScopeStatus" class="muted" style="margin:10px 0;font-size:13px;"></p>
      <div style="font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:6px;">Ses Düzeyi</div>
      <div style="display:flex;align-items:center;gap:12px;max-width:460px;margin-bottom:16px;">
        <span style="font-size:18px;">🔈</span>
        <input type="range" min="0" max="100" step="5" value="${getBellVolume()}" style="flex:1;margin:0;accent-color:var(--accent);"
          ${actOn('input','setBellVolume',['$value'])} ${actOn('change','testBellSound',[])}>
        <span style="font-size:18px;">🔊</span>
        <b id="bellVolumeLabel" style="min-width:52px;text-align:right;">${getBellVolume()===0?'Sessiz':'%'+getBellVolume()}</b>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
        <span style="font-size:12.5px;font-weight:700;color:var(--muted);">Yüklediğiniz Sesler <span style="font-weight:400;">(en fazla ${BELL_LIBRARY_MAX})</span></span>
        <label style="width:auto;cursor:pointer;display:inline-flex;align-items:center;margin:0;padding:9px 16px;border-radius:10px;background:var(--accent);color:var(--btn-ink);font-weight:700;font-size:13px;">
          ＋ Ses Dosyası Yükle
          <input id="bellFileInput" type="file" accept="audio/*" style="display:none;" ${act('clearValue','$this')} ${actOn('change','uploadBellSound',[])}>
        </label>
      </div>
      <div id="bellLibraryList" class="bell-grid" style="margin-bottom:14px;"></div>
      <div class="field-group"><label>Hazır Zil Sesleri</label></div>
      <div id="bellPresetList" class="bell-grid"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
        <button class="sbtn" style="width:auto;" ${act('testBellSound')}>▶️ Seçili Sesi Test Et</button>
        <button class="sbtn" style="width:auto;background:var(--red);color:var(--btn-ink);" ${act('resetBellSound')}>Sıfırla (Varsayılan Zil)</button>
      </div>
      <p class="muted" style="text-align:left;margin-top:14px;font-size:12px;">
        Not: Dosya boyutu en fazla 800KB olmalı (kısa bir bildirim sesi yeterlidir). Tarayıcılar otomatik ses çalmayı
        kısıtladığı için, bu ekranda bir istasyon seçtiğinizde (mutfak ekranında) ses izni otomatik olarak alınır —
        sekmeyi hiç tıklamadan açık bıraktıysanız ilk sipariş zili çalmayabilir.
      </p>
    </div>
    </div>
  `;
  if(session.isManager){
    const part = document.getElementById('notifSettingsPart');
    if(part){ part.querySelectorAll('#notifRolesBox').forEach(x => x.remove());
      const b = document.createElement('div'); b.id = 'notifRolesBox'; b.className = 'box'; b.style.maxWidth = 'none'; b.innerHTML = '<h2>👥 Kime Gitsin</h2><div id="notifRolesBody"><p class="muted">Yükleniyor…</p></div>';
      const first = part.querySelector(':scope > .box'); part.insertBefore(b, first); loadNotifRoles(); }
  }
  notifSideNav(document.getElementById('notifSettingsPart'));
  updateBellScopeStatus();
  initPushUI();
}

/* Bildirimler > Kime Gitsin: her bildirim türünün hangi rollere (push) gideceği. Ayar yoksa izne göre varsayılan. */
const NOTIF_TYPES = [
  { k:'customer_request', ic:'📱', t:'QR / online sipariş talebi', d:'Müşteri menüden sipariş gönderince', perm:'order' },
  { k:'reservation_reminder', ic:'📅', t:'Yaklaşan rezervasyon', d:'Rezervasyon saatine 4 saat kala', perm:'reservations' },
  { k:'idle_table', ic:'🪑', t:'Sipariş bekleyen masa', d:'Masaya oturan müşterinin siparişi girilmeyince', perm:'order' },
  { k:'waiter_order', ic:'🙋', t:'Garson çağrısı (sipariş)', d:'Masadan sipariş için garson çağrılınca', perm:'order' },
  { k:'waiter_payment', ic:'💳', t:'Garson çağrısı (hesap)', d:'Masadan hesap istenince', perm:'payments' },
  { k:'kitchen_late', ic:'⏰', t:'Geciken mutfak siparişi', d:'Ürün 15 dakikayı geçince', perm:'kitchen' },
  { k:'shift', ic:'🕐', t:'Vardiya talepleri', d:'Personel vardiya başlatmak/bitirmek isteyince', perm:'shifts' },
  { k:'purchase_order', ic:'🚚', t:'Satınalma siparişi', d:'Yeni satınalma siparişi verilince', perm:'purchasing_reports' },
];
async function loadNotifRoles(){
  const box = document.getElementById('notifRolesBody'); if(!box) return;
  const { data, error } = await sb.rpc('get_notification_roles', { p_token: getSession().session_token });
  if(error){ box.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  APP.notifRoles = data || {};
  await loadVoicePolicy();
  drawNotifRoles();
}
function notifRolesFor(type){
  const cfg = (APP.notifRoles || {})[type.k], roles = APP.config.roles || [];
  return Array.isArray(cfg) ? cfg : roles.filter(r => r.is_system || (r.permissions || []).includes(type.perm)).map(r => r.id);
}
function drawNotifRoles(){
  const box = document.getElementById('notifRolesBody'); if(!box) return;
  const roles = APP.config.roles || [], tab = APP.notifRolesTab || 'push';
  const allV = (APP.voicePolicy && APP.voicePolicy.all) || {};
  const head = `<tr><th class="nm-type">Bildirim</th>${roles.map(r => `<th>${escapeHtml(r.name)}</th>`).join('')}<th></th></tr>`;
  const cell = (on, fn, k, rid) => `<td><button type="button" role="switch" aria-checked="${on}" class="nm-sw ${on?'on':''}" title="${on?'Açık — kapatmak için dokunun':'Kapalı — açmak için dokunun'}" ${act(fn, k, rid)}><i></i></button></td>`;
  const rowsPush = NOTIF_TYPES.map(t => { const sel = notifRolesFor(t), custom = Array.isArray((APP.notifRoles||{})[t.k]);
    return `<tr><td class="nm-type"><span class="nm-ic">${t.ic}</span><div><b>${t.t}</b><small>${t.d}</small></div></td>${roles.map(r => cell(sel.includes(r.id), 'toggleNotifRole', t.k, r.id)).join('')}
      <td class="nm-act">${custom ? `<button type="button" class="nm-reset" title="İzne göre varsayılana dön" ${act('resetNotifRoles', t.k)}>↺</button>` : ''}${sel.length ? '' : '<span class="nm-warn" title="Kimseye gitmez">⚠️</span>'}</td></tr>`; }).join('');
  const rowsVoice = VOICE_TYPES.map(t => { const pol = allV[t.id], sel = pol ? (pol.roles || []) : [];
    return `<tr class="${pol?'':'nm-def'}"><td class="nm-type"><span class="nm-ic">${t.ic}</span><div><b>${escapeHtml(t.label)}</b><small>${pol ? '' : 'Varsayılan · her cihaz kendi ayarı'}</small></div></td>${roles.map(r => cell(sel.includes(r.id), 'toggleVoicePolicyRole', t.id, r.id)).join('')}
      <td class="nm-act">${pol ? `<select class="nm-mode" ${actOn('change','setVoicePolicyMode',[t.id,'$value'])}><option value="voice" ${pol.mode!=='sound'?'selected':''}>🗣️ Sesli oku</option><option value="sound" ${pol.mode==='sound'?'selected':''}>🔔 Sadece zil</option></select><button type="button" class="nm-reset" title="Varsayılana dön" ${act('resetVoicePolicy', t.id)}>↺</button>` : ''}</td></tr>`; }).join('');
  box.innerHTML = `<div class="seg nm-tabs">${[['push','📱 Push bildirimleri'],['voice','🔊 Sesli ve zilli']].map(([k, l]) => `<button type="button" class="${tab===k?'on':''}" ${act('setNotifRolesTab', k)}>${l}</button>`).join('')}</div>
    <p class="muted nm-help">${tab==='push' ? 'Telefona / masaüstüne gidecek bildirimler. Kutucuğa tıklayarak o role açıp kapatın; değişiklik hemen kaydedilir. Ekrandaki kırmızı rozetler yetkisi olan herkese görünmeye devam eder.' : 'Uygulama açıkken çalan zil ve sesli okuma. Bir role işaret koyduğunuzda kural başlar: işaretli rollerde seçtiğiniz şekilde (sesli / zil) çalar, diğerlerinde sessizdir ve personel bunu değiştiremez. ↺ ile varsayılana (cihaz ayarı) dönülür.'}</p>
    <div class="nm-wrap"><table class="nm-table">${head}${tab==='push' ? rowsPush : rowsVoice}</table></div>`;
}
function setNotifRolesTab(t){ APP.notifRolesTab = t; drawNotifRoles(); }
async function saveVoicePolicy(type, roles, mode){
  const { error } = await sb.rpc('set_voice_policy', { p_token: getSession().session_token, p_type: type, p_role_ids: roles, p_mode: mode });
  if(error){ alert(error.message); return; }
  await loadVoicePolicy(); drawNotifRoles(); showToast(roles ? 'Kaydedildi ✓' : 'Varsayılana döndü');
}
function toggleVoicePolicyRole(type, roleId){
  const pol = ((APP.voicePolicy && APP.voicePolicy.all) || {})[type];
  const cur = pol ? (pol.roles || []) : [], next = cur.includes(roleId) ? cur.filter(x => x !== roleId) : cur.concat(roleId);
  saveVoicePolicy(type, next, pol ? pol.mode : 'voice');
}
function setVoicePolicyMode(type, mode){ const pol = ((APP.voicePolicy && APP.voicePolicy.all) || {})[type]; saveVoicePolicy(type, pol ? pol.roles || [] : [], mode); }
function resetVoicePolicy(type){ saveVoicePolicy(type, null, null); }
async function toggleNotifRole(type, roleId){
  const t = NOTIF_TYPES.find(x => x.k === type); if(!t) return;
  const cur = notifRolesFor(t), next = cur.includes(roleId) ? cur.filter(x => x !== roleId) : cur.concat(roleId);
  const { error } = await sb.rpc('set_notification_roles', { p_token: getSession().session_token, p_type: type, p_role_ids: next });
  if(error){ alert(error.message); return; }
  APP.notifRoles = Object.assign({}, APP.notifRoles, { [type]: next }); drawNotifRoles(); showToast('Kaydedildi ✓');
}
async function resetNotifRoles(type){
  const { error } = await sb.rpc('set_notification_roles', { p_token: getSession().session_token, p_type: type, p_role_ids: null });
  if(error){ alert(error.message); return; }
  const n = Object.assign({}, APP.notifRoles); delete n[type]; APP.notifRoles = n; drawNotifRoles(); showToast('Varsayılana döndü');
}

/* Yazıcı Ayarları > Durum ve Geçmiş */
const PRINT_KIND = { kitchen:'🍳 Mutfak fişi', pkg:'📦 Paket fişi', cash:'💵 Kasa fişi' };
const agoTxt = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'az önce' : m < 60 ? m + ' dk önce' : m < 1440 ? Math.round(m / 60) + ' sa önce' : new Date(t).toLocaleDateString('tr-TR', { day:'numeric', month:'short' }); };
function renderPrinterStatusCards(){
  const box = document.getElementById('printerStatusCards'); if(!box) return;
  const log = getPrintLog(), printers = getPrinters();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if(!printers.length){ box.innerHTML = '<p class="muted">Tanımlı yazıcı yok — "Yazıcılar" sekmesinden ekleyin.</p>'; return; }
  box.innerHTML = printers.map(p => {
    const mine = log.filter(e => e.printerId === p.id), last = mine[0];
    const todayN = mine.filter(e => e.at >= today.getTime() && e.ok).length, fails = mine.filter(e => e.at >= today.getTime() && !e.ok).length;
    const state = !last ? 'idle' : last.ok ? 'ok' : 'err';
    const stations = ((APP.config && APP.config.stations) || []).filter(st => resolvePrinterForStation(st.id) && resolvePrinterForStation(st.id).id === p.id).map(st => (st.icon || '🍳') + ' ' + st.name);
    return `<div class="ps-card ${state}">
      <div class="ps-top"><span class="ps-dot"></span><b>${escapeHtml(p.name)}</b>${p.id === getActivePrinterId() ? '<span class="pchip">Bu ekran</span>' : ''}</div>
      <small class="muted">${escapeHtml({ usb:'USB (doğrudan)', electron:'Masaüstü uygulaması', 'silent-browser':'Sessiz tarayıcı', browser:'Tarayıcı penceresi' }[p.type] || p.type || '')}${stations.length ? ' · ' + escapeHtml(stations.join(', ')) : ''}</small>
      <div class="ps-stats"><span><b>${todayN}</b> bugün</span>${fails ? `<span class="bad"><b>${fails}</b> hata</span>` : ''}<span>${last ? 'Son: ' + agoTxt(last.at) : 'Henüz fiş yok'}</span></div>
      ${last && !last.ok ? `<div class="ps-err">⚠️ ${escapeHtml(last.err || 'Basılamadı')}</div>` : ''}
      <button type="button" class="sbtn" style="width:auto;margin:8px 0 0;padding:6px 12px;font-size:12.5px;" ${act('testPrintPrinter', p.id)}>🖨️ Test Yazdır</button>
    </div>`;
  }).join('');
}
function printLogHtml(){
  const log = getPrintLog();
  if(!log.length) return '<p class="muted">Bu cihazdan henüz fiş basılmadı.</p>';
  return '<div class="pl-list">' + log.map((e, i) => `<div class="pl-row ${e.ok ? '' : 'err'}">
    <span class="pl-ic">${e.ok ? '✅' : '❌'}</span>
    <span class="pl-main"><b>${escapeHtml(e.table || '')}${e.no ? ' #' + e.no : ''}</b> <span class="muted">· ${PRINT_KIND[e.kind] || 'Fiş'} · ${(e.items || []).reduce((n, x) => n + (Number(x.qty) || 0), 0)} ürün${e.auto ? ' · otomatik' : ''}</span>
      <small class="muted">${new Date(e.at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })} · ${escapeHtml(e.printerName || '')}${e.ok ? (e.note ? ' · ' + escapeHtml(e.note) : '') : ' · ' + escapeHtml(e.err || 'basılamadı')}</small></span>
    <button type="button" class="ghost-btn pl-re" title="Bu fişi tekrar yazdır" ${act('reprintFromLog', i)}>🔁 Tekrar</button></div>`).join('') + '</div>';
}
async function reprintFromLog(i){
  const e = getPrintLog()[i]; if(!e) return;
  const printer = e.printerId ? getPrinters().find(p => p.id === e.printerId) : null;
  await printKitchenTicket(e.table, e.items || [], printer || null, false, e.no, e.extra || undefined);
  showToast(PRINT_RESULT.ok ? '🖨️ Fiş tekrar gönderildi' : '⚠️ Basılamadı: ' + (PRINT_RESULT.err || ''));
}
async function clearPrintLog(){
  if(!await uiConfirm('Bu cihazdaki yazdırma geçmişi silinsin mi?')) return;
  try{ localStorage.removeItem(PRINT_LOG_KEY); }catch(e){}
  const box = document.getElementById('printLogBox'); if(box) box.innerHTML = printLogHtml();
  renderPrinterStatusCards();
}
