/* Ana router (render/goToView/goHome), ana ekran (renderHome), deep-link
   ve uygulama baslangic (bootstrap) kodu - app/index.html'den cikarildi.
   Diger TUM modullerden SONRA yuklenmeli (her bolumun render*View
   fonksiyonunu cagiriyor) - index.html'deki <script src> sirasinda
   bu yuzden en sonda. Klasik <script src>. */
/* Bildirim izni açık değilse (geciken sipariş/müşteri isteği gibi push
   bildirimlerini kaçırmamak için) hangi ekranda olursa olsun her render'da
   görünen ısrarcı bir hatırlatma şeridi - maybeShowPushPrompt girişte SADECE
   BİR KEZ otomatik izin istiyor (bkz. pos-core.js); kullanıcı o sistem
   diyaloğunu kapatır/reddederse ya da daha önce reddetmişse bir daha asla
   sorulmaz, bu yüzden burada manuel bir hatırlatma/tekrar deneme yolu
   sunuluyor. Kapatma (✕) sadece bu oturum için geçerli - sayfa yenilenince/
   tekrar giriş yapılınca (APP sıfırlandığı için) tekrar görünür. */
function pushReminderBannerHtml(){
  if(APP.pushBannerDismissed) return '';
  if(!hasFeature('push_notifications')) return '';
  let state;
  if(isNativeApp()){
    state = APP.nativePushPermState;
    if(!state) return ''; // ilk checkPermissions sonucu henüz gelmedi
  } else {
    if(!('Notification' in window)) return '';
    state = Notification.permission;
  }
  if(state==='granted') return '';
  const denied = state==='denied';
  const msg = denied
    ? '🔕 Bildirimler bu cihazda engellenmiş. Geciken sipariş ve önemli uyarıları kaçırmayasınız diye tarayıcı/telefon ayarlarından bu uygulama için bildirimlere izin verin.'
    : '🔔 Bildirimler kapalı! Geciken sipariş ve müşteri istekleri gibi önemli uyarıları, hangi ekranda olursanız olun (hatta uygulama kapalıyken bile) kaçırmamak için bildirimleri açın.';
  return `<div class="push-reminder-banner" style="background:rgba(234,179,8,.12);border:1px solid #eab308;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <span style="flex:1;min-width:200px;font-size:13px;">${msg}</span>
    ${denied ? '' : `<button type="button" style="width:auto;margin:0;padding:8px 14px;font-size:13px;" onclick="togglePushNotifications()">Bildirimleri Aç</button>`}
    <span style="cursor:pointer;color:var(--muted);font-size:16px;" onclick="dismissPushBanner()" title="Bu oturum için kapat">✕</span>
  </div>`;
}
function dismissPushBanner(){ APP.pushBannerDismissed = true; render(); }
function render(){
  if(isAdminMode()){ renderAdminArea(); return; }

  const app = document.getElementById('app');
  const session = getSession();
  if(!session){
    const companySession = getCompanySession();
    if(companySession){ renderCompanyPanel(app, companySession); return; }
    if(APP.authScreen==='signup') renderSignupScreen(app);
    else if(APP.authScreen==='expired') renderExpiredScreen(app);
    else if(APP.authScreen==='forgot') renderForgotPasswordScreen(app);
    else if(APP.authScreen==='companyLogin') renderCompanyLoginScreen(app);
    else renderLoginScreen(app);
    return;
  }

  if(!APP.customerReqPollStarted){
    APP.customerReqPollStarted = true;
    startCustomerRequestPolling(session);
    maybeShowPushPrompt(session);
    refreshShiftWidget(session);
  }
  const theme = getTheme();
  const collapsed = getSidebarCollapsed();
  const items = NAV_ITEMS.filter(i => navItemVisible(i, session));
  app.innerHTML = `
    <div class="app-shell">
      <div class="mobile-topbar">
        <button class="mobile-menu-btn" onclick="toggleMobileNav()" aria-label="Menü">☰</button>
        <img src="/assets/images/logo.webp" alt="Peyktan" class="mobile-topbar-logo">
        <div class="mobile-topbar-title">${escapeHtml(session.restaurant_name)}</div>
      </div>
      <div class="sidebar-backdrop ${APP.mobileNavOpen?'show':''}" onclick="closeMobileNav()"></div>
      <aside class="sidebar ${collapsed?'collapsed':''} ${APP.mobileNavOpen?'mobile-open':''}">
        <div class="app-brand-row"><img src="/assets/images/logo.webp" alt="Peyktan" class="app-brand-logo"><span class="app-brand-text">Peyktan</span></div>
        <div class="sb-top">
          <div class="sb-brand" onclick="goHome()"><span class="label">${escapeHtml(session.restaurant_name)}</span></div>
          <button class="sb-collapse-btn" onclick="toggleSidebar()" title="Menüyü daralt/genişlet">${collapsed?'»':'«'}</button>
          <button class="sb-mobile-close" onclick="closeMobileNav()" aria-label="Menüyü kapat">✕</button>
        </div>
        <div class="sb-user">
          <div class="name">${escapeHtml(session.username)}</div>
          <div class="role">${escapeHtml((session.role_names||[]).join(' + ') || '')}</div>
          <a href="#" class="label" style="font-size:11px;color:var(--muted);text-decoration:underline;" onclick="openDeleteAccountModal();return false;">Hesabımı Sil</a>
        </div>
        <nav>
          ${items.map(i => `<div class="sb-item ${APP.view===i.view?'active':''}" onclick="goToView('${i.view}')" title="${i.label}"><span class="ic">${i.icon}</span><span class="label">${i.label}</span></div>`).join('')}
        </nav>
        <div class="sb-bottom">
          <div id="shiftWidget" class="shift-widget">${shiftWidgetHtml()}</div>
          ${getCompanySession() ? '<button class="sb-logout" onclick="returnToCompanyPanel()" title="Şirket paneline dön">🏢<span class="label"> Şirkete Dön</span></button>' : ''}
          <div class="theme-toggle">
            <button class="${theme==='dark'?'active':''}" onclick="setTheme('dark')" type="button">🌙 <span class="label">Koyu</span></button>
            <button class="${theme==='light'?'active':''}" onclick="setTheme('light')" type="button">☀️ <span class="label">Açık</span></button>
          </div>
          <button class="sb-logout" onclick="doLogout()" title="Çıkış Yap">🚪<span class="label"> Çıkış Yap</span></button>
        </div>
      </aside>
      <div class="content-area"><div class="content-inner ${(APP.view==='settings'||APP.view==='reports')?'content-inner-wide':''}">${pushReminderBannerHtml()}<main id="main"></main></div></div>
    </div>`;
  const main = document.getElementById('main');
  if(APP.view==='home') renderHome(main, session);
  else if(APP.view==='order') renderOrderView(main, session);
  else if(APP.view==='packages') renderPackagesView(main, session);
  else if(APP.view==='kitchen') renderKitchenView(main, session);
  else if(APP.view==='payments') renderPaymentsView(main, session);
  else if(APP.view==='settings') renderSettingsView(main, session);
  else if(APP.view==='reports') renderReportsView(main, session);
  else if(APP.view==='printerSettings') renderPrinterSettingsView(main, session);
  else if(APP.view==='notificationSettings') renderNotificationSettingsView(main, session);
  else if(APP.view==='reservations') renderReservationsView(main, session);
  else if(APP.view==='crm') renderCrmView(main, session);
  else if(APP.view==='purchasing') renderPurchasingView(main, session);
}
function todayLocalDateStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function goToView(view){
  APP.view = view;
  // Finansal Analiz'e her girişte, en son baktiginiz tarihi hatirlamak yerine
  // dogrudan bugunun raporunu getirir - farkli bir tarihe bakmak isterseniz
  // ekrandaki tarih seciciden degistirebilirsiniz.
  if(view==='reports'){ APP.reportDate = todayLocalDateStr(); APP.reportDateTo = todayLocalDateStr(); }
  // Mutfak ekranindan cikinca arka plandaki yenileme/sayac calismaya devam etmesin.
  if(view!=='kitchen') stopKitchenPolling();
  if(view!=='order' && view!=='packages') stopOrderPolling();
  if(view!=='reservations') stopWaitlistTimerInterval();
  // Telefonda bir menü öğesine dokununca kayar menü otomatik kapansın.
  APP.mobileNavOpen = false;
  render();
}

function goHome(){ APP.view='home'; APP.mobileNavOpen = false; render(); }


function renderHome(main, session){
  main.innerHTML = `<h1>Merhaba ${escapeHtml(session.username)} 👋</h1><p class="muted" style="text-align:left;">Sol taraftaki menüden bir bölüm seçin.</p>`;
}
function notReadyYet(){ alert('Bu ekran bir sonraki adımda eklenecek.'); }







/* Push bildirimine (bkz. sw.js) ya da bir toast'a tıklanınca ilgili
   ekrana gidilsin diye (?view=order gibi) - sadece izin verilen bir
   NAV_ITEMS görünümüyse ve oturum varsa uygulanır, aksi halde sessizce
   yok sayılır. Hem sayfa ilk açılışında (uygulama zaten oturumluyken
   bir push linkiyle açılmışsa) hem başarılı girişten sonra kullanılır. */
function applyDeepLinkView(){
  const session = getSession(); if(!session) return;
  const view = new URLSearchParams(window.location.search).get('view');
  if(!view) return;
  const item = NAV_ITEMS.find(i => i.view===view);
  if(item && navItemVisible(item, session)) APP.view = view;
}
/* Tanıtım sitesinden (/) "Ücretsiz Dene" butonuyla gelenler doğrudan kayıt
   ekranında açılsın diye (?signup=1) - normal ?admin=1 gibi tek seferlik
   bir URL parametresi, oturum durumuyla ilgisi yok. */
/* ---- 1 saat hiç işlem yapılmazsa otomatik çıkış (web/masaüstü/mobil -
   hepsi aynı kodu WebView içinde çalıştırdığı için TEK bir JS zamanlayıcı
   üç platformu da kapsıyor). "Hiç işlem yapılmadı" gerçek kullanıcı
   etkileşimi (tık/tuş/dokunma/kaydırma) anlamına gelir - arka plandaki
   otomatik polling/render'lar aktivite sayılmaz, aksi halde ekran açık
   kalsa bile hiç kapanmazdı. Uygulama arka plana atılıp geri dönüldüğünde
   zaten ayrı bir 15 dk'lık kontrol var (bkz. checkNativeBackgroundTimeout) -
   bu ikisi birbirini tamamlıyor: biri "arka planda kapalıyken geçen süre",
   diğeri "ekran açıkken hiç dokunulmayan süre". */
const IDLE_LOGOUT_MS = 60*60*1000;
// Platform Yönetimi (?admin=1) çok daha hassas bir alan (tüm işletmelerin
// verisine erişim) olduğu için personel oturumundan çok daha kısa, 15
// dakikalık bir boşta kalma süresiyle kapatılıyor.
const ADMIN_IDLE_LOGOUT_MS = 15*60*1000;
let lastActivityAt = Date.now();
function markUserActivity(){ lastActivityAt = Date.now(); }
function startIdleLogoutWatch(){
  ['click','keydown','touchstart','mousemove','scroll'].forEach(evt =>
    window.addEventListener(evt, markUserActivity, { passive: true }));
  setInterval(() => {
    const idleFor = Date.now() - lastActivityAt;
    if(getAdminSession() && idleFor >= ADMIN_IDLE_LOGOUT_MS){
      doAdminLogout();
      alert('Uzun süre işlem yapılmadığı için yönetici oturumunuz güvenlik amacıyla otomatik olarak kapatıldı.');
      return;
    }
    if(getSession() && idleFor >= IDLE_LOGOUT_MS){
      doLogout();
      alert('Uzun süre işlem yapılmadığı için oturumunuz güvenlik amacıyla otomatik olarak kapatıldı.');
    }
  }, 30000);
}
startIdleLogoutWatch();

/* ---- Web: sayfadan ayrılıp 30 dk sonra dönülünce otomatik çıkış ----
   Mobildeki arka plan kuralının (checkNativeBackgroundTimeout) web karşılığı:
   sekme gizlenince/sayfa kapanınca zaman damgası yazılır; geri dönüldüğünde
   (sekmeye dönüş, yeniden yükleme ya da tarayıcının oturumu geri yüklemesi)
   aradan 30 dk geçmişse oturum kapatılır - çıkış yapmayı unutan kullanıcının
   hesabı açık kalmasın diye. sessionStorage kullanılıyor: sekmeye özel ve
   oturumla aynı ömürde (başka bir sekmedeki aktivite bu sekmeyi etkilemez). */
const WEB_AWAY_LOGOUT_MS = 30*60*1000;
function markWebAway(){
  if(isNativeApp()) return;
  try{ sessionStorage.setItem('rys_web_away_at', String(Date.now())); }catch(e){}
}
function checkWebAwayTimeout(){
  if(isNativeApp()) return;
  let awayAt = 0;
  try{ awayAt = Number(sessionStorage.getItem('rys_web_away_at')) || 0; sessionStorage.removeItem('rys_web_away_at'); }catch(e){}
  if(!awayAt || (Date.now() - awayAt) < WEB_AWAY_LOGOUT_MS) return;
  const hadSession = !!(getSession() || getAdminSession());
  if(getAdminSession()) doAdminLogout();
  if(getSession()) doLogout();
  if(hadSession) alert('Uzun süre uzakta kaldığınız için oturumunuz güvenlik amacıyla kapatıldı. Lütfen tekrar giriş yapın.');
}
document.addEventListener('visibilitychange', () => {
  if(document.hidden) markWebAway(); else checkWebAwayTimeout();
});
window.addEventListener('pagehide', markWebAway);
// Başka bir siteye gidip tarayıcının "geri" tuşuyla dönülünce sayfa
// bfcache'ten (yeniden yüklenmeden) geri gelir; bu durumda visibilitychange
// her tarayıcıda tetiklenmediği için pageshow'da da kontrol edilir.
window.addEventListener('pageshow', (e) => { if(e.persisted) checkWebAwayTimeout(); });
checkWebAwayTimeout();

if(!getSession() && new URLSearchParams(window.location.search).get('signup')==='1') APP.authScreen = 'signup';
applyDeepLinkView();
initNativeAppMode();
render();
/* Push bildirimine tıklanınca zaten açık olan bir sekme varsa (bkz.
   sw.js notificationclick), sayfa yeniden yüklenmeden ilgili ekrana
   geçmek için service worker'dan gelen mesaj burada dinlenir. */
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', (event) => {
    if(event.data && event.data.type==='peyktan-navigate' && event.data.view) goToView(event.data.view);
  });
}
// Servis çalışanı izin istemeden erkenden kaydedilir (bildirim izni ayrı,
// kullanıcının Bildirim Ayarları'ndaki butona tıklamasıyla istenir) - böylece
// push aboneliği daha önce açılmışsa ilk andan itibaren hazır olur.
if('serviceWorker' in navigator) registerServiceWorker();
/* Açılış ekranı (splash): render() içerik arkada hazırlanırken kısa bir
   marka anı göstermek için en az ~700ms ekranda kalır, sonra solarak kaybolur.
   Native uygulamada bu ekrandan ÖNCE zaten Android'in kendi açılış ekranı
   (aynı tasarım - bkz. mobile/resources/splash.png) sayfa yüklenene kadar
   gösteriliyor; o yüzden burada AYRICA 700ms'lik bir marka bekletmesi
   yapmak "aynı ekranı art arda iki kez görmüş" hissi veriyordu. Native'de
   render() zaten yukarıda tamamlandığı için içerik hazır - splash'i hemen,
   sadece ani bir sıçrama olmasın diye kısa bir soluşla kaldırıyoruz. */
if(isNativeApp()){
  const sp = document.getElementById('splashScreen');
  if(sp){ sp.classList.add('splash-fade'); setTimeout(() => sp.remove(), 500); }
} else {
  setTimeout(() => {
    const sp = document.getElementById('splashScreen');
    if(!sp) return;
    sp.classList.add('splash-fade');
    setTimeout(() => sp.remove(), 550);
  }, 700);
}
