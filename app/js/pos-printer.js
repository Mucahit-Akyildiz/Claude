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
    showToast(title + (body ? ' — ' + body : ''), 6000, null, data.view ? () => {
      const session = getSession(); const item = NAV_ITEMS.find(i => i.view===data.view);
      if(session && item && navItemVisible(item, session)){ APP.view = data.view; if(data.view==='settings') APP.settingsTab = 'shifts'; render(); }
    } : null);
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
    const session = getSession();
    if(data && data.view && session){
      const item = NAV_ITEMS.find(i => i.view===data.view);
      if(item && navItemVisible(item, session)){ APP.view = data.view; if(String(data.tag||'').startsWith('shift-request')) APP.settingsTab = 'shifts'; render(); }
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
              <button type="button" class="act-btn act-delete" onclick="removePrinterEntry('${p.id}')">${ICON_TRASH}<span>Sil</span></button>
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
    const go = n.view && NAV_ITEMS.some(i => i.view === n.view) ? `onclick="goToView('${escapeAttr(n.view)}')"` : '';
    return `<div ${go} class="notif-row" style="display:flex;gap:10px;padding:10px 4px;border-bottom:1px solid var(--border);${n.read ? '' : 'font-weight:700;'}${go ? 'cursor:pointer;' : ''}">
      <div style="flex:1;min-width:0;overflow-wrap:anywhere;"><div>${escapeHtml(n.title)}</div>${n.body ? `<div class="muted" style="font-size:13px;font-weight:400;">${escapeHtml(n.body)}</div>` : ''}</div>
      <div class="muted" style="font-size:12px;white-space:nowrap;font-weight:400;">${when}</div></div>`;
  }).join('') + '</div>';
}
function setNotifTab(t){
  if(t === (APP.notifTab || 'settings')) return;
  pushScreen();
  APP.notifTab = t;
  const h = document.getElementById('notifHistoryPart'), st = document.getElementById('notifSettingsPart');
  if(h) h.style.display = t==='history' ? '' : 'none';
  if(st) st.style.display = t==='settings' ? '' : 'none';
  document.querySelectorAll('#main .sub-tabs .sub-tab').forEach((el, i) => el.classList.toggle('active', (i===0) === (t==='settings')));
  if(t==='history') loadNotificationHistory();
}
async function renderNotificationSettingsView(main, session){
  if(!APP.config){
    const { data, error } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token }));
    if(error){ main.innerHTML = '<h1>Bildirim Ayarları</h1><p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
    APP.config = data;
  }
  const ntab = APP.notifTab || 'settings';
  if(ntab==='history') setTimeout(loadNotificationHistory, 0);
  main.innerHTML = `
    <h1>Bildirimler</h1>
    <div class="box sub-tabs-box" style="max-width:none;">
      <div class="sub-tabs">
        <div role="tab" tabindex="0" class="sub-tab ${ntab==='settings'?'active':''}" onclick="setNotifTab('settings')"><span class="sub-tab-ic">⚙️</span>Bildirim Ayarları</div>
        <div role="tab" tabindex="0" class="sub-tab ${ntab==='history'?'active':''}" onclick="setNotifTab('history')"><span class="sub-tab-ic">🕘</span>Geçmiş Bildirimler</div>
      </div>
    </div>
    <div class="box" id="notifHistoryPart" style="max-width:none;${ntab==='history'?'':'display:none;'}">
      <div id="notifHistory"><p class="muted">Yükleniyor…</p></div>
    </div>
    <div id="notifSettingsPart" style="${ntab==='settings'?'':'display:none;'}">
    <p class="muted" style="text-align:left;">Bu ayarlar sadece <b>bu ekrana/tarayıcıya</b> özeldir — her cihazda ayrı ayrı yapılandırılır, veritabanına kaydedilmez.</p>

    ${!hasFeature('push_notifications') ? `<div class="box" style="max-width:none;"><h2>📱 Push Bildirimleri (Uygulama Kapalıyken de)</h2>${lockedFeatureHtml()}</div>` : ''}
    <div class="box" style="max-width:none;${hasFeature('push_notifications')?'':'display:none;'}">
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
      <div style="font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:6px;">Ses Düzeyi</div>
      <div style="display:flex;align-items:center;gap:12px;max-width:460px;margin-bottom:16px;">
        <span style="font-size:18px;">🔈</span>
        <input type="range" min="0" max="100" step="5" value="${getBellVolume()}" style="flex:1;margin:0;accent-color:var(--accent);"
          oninput="setBellVolume(this.value)" onchange="testBellSound()">
        <span style="font-size:18px;">🔊</span>
        <b id="bellVolumeLabel" style="min-width:52px;text-align:right;">${getBellVolume()===0?'Sessiz':'%'+getBellVolume()}</b>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
        <span style="font-size:12.5px;font-weight:700;color:var(--muted);">Yüklediğiniz Sesler <span style="font-weight:400;">(en fazla ${BELL_LIBRARY_MAX})</span></span>
        <label style="width:auto;cursor:pointer;display:inline-flex;align-items:center;margin:0;padding:9px 16px;border-radius:10px;background:var(--accent);color:var(--btn-ink);font-weight:700;font-size:13px;">
          ＋ Ses Dosyası Yükle
          <input id="bellFileInput" type="file" accept="audio/*" style="display:none;" onclick="this.value=''" onchange="uploadBellSound()">
        </label>
      </div>
      <div id="bellLibraryList" class="bell-grid" style="margin-bottom:14px;"></div>
      <div class="field-group"><label>Hazır Zil Sesleri</label></div>
      <div id="bellPresetList" class="bell-grid"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
        <button class="sbtn" style="width:auto;" onclick="testBellSound()">▶️ Seçili Sesi Test Et</button>
        <button class="sbtn" style="width:auto;background:var(--red);color:var(--btn-ink);" onclick="resetBellSound()">Sıfırla (Varsayılan Zil)</button>
      </div>
      <p class="muted" style="text-align:left;margin-top:14px;font-size:12px;">
        Not: Dosya boyutu en fazla 800KB olmalı (kısa bir bildirim sesi yeterlidir). Tarayıcılar otomatik ses çalmayı
        kısıtladığı için, bu ekranda bir istasyon seçtiğinizde (mutfak ekranında) ses izni otomatik olarak alınır —
        sekmeyi hiç tıklamadan açık bıraktıysanız ilk sipariş zili çalmayabilir.
      </p>
    </div>
    </div>
  `;
  updateBellScopeStatus();
  initPushUI();
}
