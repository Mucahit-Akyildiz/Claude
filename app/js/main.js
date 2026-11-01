/* Kendi kendini onarma: tarayıcı önbelleğinden eski/yarım bir dosya gelip temel
   modüller (state.js / utils.js) yüklenemediyse önbelleği temizleyip bir kez yenile. */
if(typeof APP === 'undefined' || typeof escapeAttr === 'undefined' || typeof sb === 'undefined' || typeof renderSettingsView === 'undefined' || typeof renderReportsView === 'undefined' || typeof radioSync === 'undefined' || typeof renderTenantIntegrations === 'undefined'){
  try{
    if(!sessionStorage.getItem('pk_selfheal')){
      sessionStorage.setItem('pk_selfheal', '1');
      const done = () => location.reload();
      (window.caches ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : Promise.resolve()).then(done, done);
    }
  }catch(e){}
}
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
  // Masaüstü (Electron) uygulamasında web push yok; bildirimler Windows bildirimi olarak gelir.
  if(typeof isDesktopApp === 'function' && isDesktopApp()) return '';
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
    ${denied ? '' : `<button type="button" style="width:auto;margin:0;padding:8px 14px;font-size:13px;" ${act('togglePushNotifications')}>Bildirimleri Aç</button>`}
    <span style="cursor:pointer;color:var(--muted);font-size:16px;" ${act('dismissPushBanner')} title="Bu oturum için kapat">✕</span>
  </div>`;
}
function dismissPushBanner(){ APP.pushBannerDismissed = true; render(); }
// "Vardiya açmadan çalışılamasın" açıkken vardiyası olmayan personel bu
// ekranlarda vardiya başlatma ekranını görür (sunucu da ayrıca reddeder).
const SHIFT_GATED_VIEWS = ['order','packages','kitchen','payments','reservations','purchasing'];
function shiftGateActive(){
  const st = APP.shiftStatus;
  return !!(st && st.shift_required && !st.can_work && SHIFT_GATED_VIEWS.includes(APP.view));
}
function renderShiftGate(main){
  const st = APP.shiftStatus || {};
  main.innerHTML = `<div class="box" style="max-width:520px;margin:40px auto;text-align:center;">
    <div style="font-size:54px;">🕒</div>
    <h2 style="margin:8px 0;">Önce vardiyanızı başlatın</h2>
    <p class="muted">Bu işletmede çalışma ekranlarını kullanmak için açık bir vardiyanız olmalı.${st.approval_required ? ' Talebinizi gönderdiğiniz anda çalışmaya başlayabilirsiniz; yönetici sonradan onaylar.' : ''}</p>
    <button type="button" style="max-width:280px;margin:14px auto 0;font-size:16px;" ${act('doClockToggle')}>▶ ${st.approval_required ? 'Vardiya Başlatma İste' : 'Vardiyaya Başla'}</button>
  </div>`;
}
function renderMainView(main, session){
  if(shiftGateActive()){ renderShiftGate(main); return Promise.resolve(); }
  let p;
  if(APP.view==='home') p = renderHome(main, session);
  else if(APP.view==='order') p = renderOrderView(main, session);
  else if(APP.view==='packages') p = renderPackagesView(main, session);
  else if(APP.view==='kitchen') p = renderKitchenView(main, session);
  else if(APP.view==='payments') p = renderPaymentsView(main, session);
  else if(APP.view==='settings') p = renderSettingsView(main, session);
  else if(APP.view==='reports') p = renderReportsView(main, session);
  else if(APP.view==='printerSettings' || APP.view==='devicePrinters'){ APP.view = 'devicePrinters'; p = renderPrinterSettingsView(main, session); }
  else if(APP.view==='notificationSettings') p = renderNotificationSettingsView(main, session);
  else if(APP.view==='reservations') p = renderReservationsView(main, session);
  else if(APP.view==='crm') p = renderCrmView(main, session);
  else if(APP.view==='purchasing') p = renderPurchasingView(main, session);
  else if(APP.view==='procurement') p = renderProcurementView(main, session);
  else if(APP.view==='messages') p = renderMessagesView(main, session);
  else if(APP.view==='radio') p = renderRadioView(main, session);
  else if(APP.view==='help') p = renderHelpView(main, session);
  return Promise.resolve(p);
}
/* Giriş animasyonları yalnız ekrana ilk girişte oynar; periyodik yenilemelerde
   (masa/mutfak/ödeme listeleri) tekrar oynayıp ekranı titretmesin diye kapatılır. */
let ANIM_TIMER = null;
function armEntranceAnim(){
  if(APP.view === APP._animView) return;
  APP._animView = APP.view;
  document.body.classList.remove('anim-done');
  clearTimeout(ANIM_TIMER); ANIM_TIMER = setTimeout(() => document.body.classList.add('anim-done'), 900);
}
function render(){
  if(isAdminMode()){ renderAdminArea(); return; }
  armEntranceAnim();

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
    startWaiterCallPolling();
    maybeShowPushPrompt(session);
    refreshShiftWidget(session);
    // Müşteri doğum günleri: rozetler için yüklenir, açıksa günde bir kez kutlama kartı.
    if(typeof maybeShowBirthdayCard === 'function') setTimeout(() => { maybeShowBirthdayCard(); if(!APP.birthdays) loadBirthdays(); }, 2500);
  }
  const theme = getTheme();
  const collapsed = getSidebarCollapsed();
  const items = NAV_ITEMS.filter(i => navItemVisible(i, session));
  app.innerHTML = `
    <div class="app-shell">
      <div class="mobile-topbar">
        ${APP.view && APP.view!=='home' ? `<button class="mobile-menu-btn" ${act('goBack')} aria-label="Geri" title="Geri">←</button>` : ''}
        <button class="mobile-menu-btn" id="mobileMenuBtn" ${act('toggleMobileNav')} aria-label="Menü" style="position:relative;">☰</button>
        <img src="/assets/images/logo.webp" alt="Peyktan" class="mobile-topbar-logo">
        <div class="mobile-topbar-title">${escapeHtml(session.restaurant_name)}</div>
        <button class="mobile-menu-btn" ${act('refreshApp')} aria-label="Yenile" title="Yenile">↻</button>
      </div>
      <div class="sidebar-backdrop ${APP.mobileNavOpen?'show':''}" ${act('closeMobileNav')}></div>
      <aside class="sidebar ${collapsed?'collapsed':''} ${APP.mobileNavOpen?'mobile-open':''}">
        <div class="sb-head">
          <img src="/assets/images/logo.webp" alt="Peyktan" class="sb-head-logo" ${act('goHome')}>
          <div class="sb-head-txt label" ${act('goHome')}><b>Peyktan</b><small>${escapeHtml(session.restaurant_name)}</small></div>
          <button class="sb-collapse-btn" ${act('toggleSidebar')} title="Menüyü daralt/genişlet">${collapsed?'»':'«'}</button>
          <button class="sb-mobile-close" ${act('closeMobileNav')} aria-label="Menüyü kapat">✕</button>
        </div>
        <div class="sb-user sb-profile">
          ${avatarHtml(session.username)}
          <div class="sb-pinfo label">
            <div class="name">${escapeHtml(session.username)}</div>
            <div class="role">${escapeHtml((session.role_names||[]).join(' + ') || '')}</div>
          </div>
          <button type="button" class="sb-pdel label" title="Hesabımı Sil" aria-label="Hesabımı Sil" ${act('openDeleteAccountModal')}>🗑️</button>
        </div>
        <nav>
          ${items.map((i, k) => `<div class="sb-item ${APP.view===i.view?'active':''}" style="--sc:var(--c${k%4+1});" data-view="${i.view}" ${act('goToView', i.view)} title="${i.label}"><span class="ic">${i.icon}</span><span class="label">${i.label}</span></div>`).join('')}
        </nav>
        <div class="sb-bottom">
          <div id="shiftWidget" class="shift-widget">${shiftWidgetHtml()}</div>
          ${getCompanySession() ? `<button class="sb-logout" ${act('returnToCompanyPanel')} title="Şirket paneline dön">🏢<span class="label"> Şirkete Dön</span></button>` : ''}
          <div class="sb-actrow">
            <div class="theme-toggle">
              <button class="${theme==='dark'?'active':''}" ${act('setTheme', 'dark')} type="button" title="Koyu tema">🌙</button>
              <button class="${theme==='light'?'active':''}" ${act('setTheme', 'light')} type="button" title="Açık tema">☀️</button>
            </div>
            <button type="button" class="sb-ib" ${act('refreshApp')} title="Yenile (son değişiklikleri getir)">🔄</button>
            <button type="button" class="sb-ib danger" ${act('doLogout')} title="Çıkış Yap">🚪</button>
          </div>
        </div>
      </aside>
      <div class="content-area"><div class="content-inner ${(['settings','reports','kitchen','reservations','crm','purchasing','procurement','radio','messages','printerSettings','devicePrinters','notificationSettings'].includes(APP.view))?'content-inner-wide':''}">${pushReminderBannerHtml()}${APP.view && APP.view!=='home' ? `<button type="button" class="back-link" ${act('goBack')}>← Geri</button>` : ''}<main id="main"></main></div></div>
    </div>`;
  const main = document.getElementById('main');
  renderMainView(main, session);
  applyNavBadges();
  if(APP.view==='order' || APP.view==='payments') setTimeout(refreshWaiterCalls, 900);
}
/* ---- Bekleyen iş sayıları (rozetler): menüde ilgili ekranın yanında,
   ekran içi sekmelerde (Ayarlar > Vardiyalar, Satınalma Siparişleri) ve
   mobil ☰ butonunda toplam. 20 sn'de bir, push geldiğinde ve uygulamaya
   dönüldüğünde get_nav_badges ile tazelenir. ---- */
const NAV_BADGE_TABS = { settings: '#settingsContent', purchasing: '#purchTabs' };
function badgeHtml(n){ return n > 0 ? `<span class="nav-badge">${n > 99 ? '99+' : n}</span>` : ''; }
function badgeItems(view){ return ((APP.navBadges || {})._items || {})[view] || []; }
function applyNavBadges(){
  const b = APP.navBadges || {};
  document.querySelectorAll('.sb-item[data-view]').forEach(el => {
    el.querySelectorAll('.nav-badge').forEach(x => x.remove());
    const n = b[el.dataset.view] || 0;
    if(n > 0){
      el.insertAdjacentHTML('beforeend', badgeHtml(n));
      const bd = el.querySelector('.nav-badge');
      bd.title = badgeItems(el.dataset.view).map(x => x.label).join('\n');
      bd.onclick = (e) => { e.stopPropagation(); openBadgePopover(el.dataset.view, bd); };
    }
  });
  markBadgeRows();
  applyTabBadges();
  const btn = document.getElementById('mobileMenuBtn');
  if(btn){
    btn.querySelectorAll('.nav-badge').forEach(x => x.remove());
    const session = getSession();
    const total = session ? NAV_ITEMS.filter(i => navItemVisible(i, session) && i.view!==APP.view).reduce((t, i) => t + (b[i.view] || 0), 0) : 0;
    if(total > 0) btn.insertAdjacentHTML('beforeend', `<span class="nav-badge nav-badge-corner">${total > 99 ? '99+' : total}</span>`);
  }
}
// Ekran içi sekmeler: bekleyen iş başka sekmedeyse o sekmede sayı görünür;
// açık olan sekmede gösterilmez (satırlar zaten işaretli). Değişiklik yoksa
// DOM'a dokunmaz (MutationObserver döngüsü olmasın).
function applyTabBadges(){
  const b = APP.navBadges || {};
  // Mutfak istasyon seçimi: her istasyonun bekleyen ürün sayısı (istasyonsuz
  // ürünler her istasyonda görüldüğü gibi sayılır).
  const kItems = badgeItems('kitchen');
  document.querySelectorAll('[data-station-card]').forEach(el => {
    const n = kItems.filter(x => !x.station || x.station===el.dataset.stationCard).length;
    const cur = el.querySelector('.nav-badge');
    const want = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
    if((cur ? cur.textContent : '') === want) return;
    if(cur) cur.remove();
    if(n > 0) el.insertAdjacentHTML('beforeend', `<span class="nav-badge" style="position:absolute;top:12px;right:12px;min-width:24px;height:24px;font-size:12.5px;" title="${escapeAttr(kItems.filter(x => !x.station || x.station===el.dataset.stationCard).map(x => x.label).join('\n'))}">${want}</span>`);
  });
  const resvItems = badgeItems('reservations');
  const tabs = {
    users: b.settings || 0,
    shifts: b.settings || 0,
    purchRepOrders: b.procurement || 0,
    reviews: badgeItems('reports').filter(x => x.kind==='review').length,
    reservations: resvItems.filter(x => x.kind==='reservation').length,
    waitlist: resvItems.filter(x => x.kind==='waitlist').length,
  };
  // Üst sekmeler (data-tab) ve alt sekmeler (data-sub, örn. Kullanıcılar > Vardiyalar).
  document.querySelectorAll('.tabs .tab[data-tab], .sub-tab[data-sub]').forEach(el => {
    const key = el.dataset.tab || el.dataset.sub;
    if(!(key in tabs)) return;
    // Kullanıcılar & Vardiyalar üst sekmesi açıkken de sayı görünür; yalnızca Vardiyalar alt sekmesi açıksa gizlenir.
    const active = key==='users' ? (el.classList.contains('active') && (APP.usersSubTab||'list')==='shifts') : el.classList.contains('active');
    const want = active ? 0 : tabs[key];
    const cur = el.querySelector('.nav-badge');
    const curN = cur ? cur.textContent : '';
    const wantTxt = want > 0 ? (want > 99 ? '99+' : String(want)) : '';
    if(curN === wantTxt) return;
    if(cur) cur.remove();
    if(want > 0) el.insertAdjacentHTML('beforeend', badgeHtml(want));
  });
}
// Ekranlarda bekleyen kayıtları işaretle (data-badge-id taşıyan satır/kartlar).
function markBadgeRows(){
  applyTabBadges();
  const pendingIds = new Set(Object.values((APP.navBadges || {})._items || {}).flat().map(x => x.id));
  document.querySelectorAll('[data-badge-id]').forEach(el => {
    const on = pendingIds.has(el.dataset.badgeId);
    if(el.classList.contains('badge-row') !== on) el.classList.toggle('badge-row', on);
  });
}
// Ekran içerikleri sonradan (async) çizildiği için yeni satırlar da işaretlensin.
let BADGE_MARK_T = null;
new MutationObserver(() => { clearTimeout(BADGE_MARK_T); BADGE_MARK_T = setTimeout(markBadgeRows, 80); })
  .observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
/* Rozete basınca bekleyen kayıtların listesi; bir öğeye basınca ilgili ekrana gider. */
function openBadgePopover(view, anchor){
  document.querySelectorAll('.badge-popover').forEach(x => x.remove());
  const items = badgeItems(view);
  if(!items.length) return;
  const pop = document.createElement('div');
  pop.className = 'badge-popover';
  const r = anchor.getBoundingClientRect();
  pop.style.top = Math.min(r.bottom + 6, window.innerHeight - 60) + 'px';
  pop.style.left = Math.min(r.left, window.innerWidth - 290) + 'px';
  pop.innerHTML = `<div class="badge-popover-head">${escapeHtml((NAV_ITEMS.find(i => i.view===view)||{}).label || '')} · ${items.length} bekleyen</div>`
    + items.slice(0, 30).map(x => `<div class="badge-popover-item">${escapeHtml(x.label)}</div>`).join('')
    + (items.length > 30 ? `<div class="badge-popover-item muted">+${items.length-30} daha</div>` : '');
  pop.onclick = (e) => {
    e.stopPropagation(); pop.remove();
    if(view==='settings') APP.settingsTab = 'shifts';
    if(view==='reservations') APP.resvTab = items.every(x => x.kind==='waitlist') ? 'waitlist' : 'reservations';
    if(view==='purchasing') APP.purchTab = 'orders';
    if(view==='procurement') APP.purchRepSub = 'orders';
    goToView(view);
  };
  document.body.appendChild(pop);
  setTimeout(() => document.addEventListener('click', function close(){ pop.remove(); document.removeEventListener('click', close); }), 0);
}
let NAV_BADGE_TIMER = null;
async function refreshNavBadges(){
  const s = getSession(); if(!s) return;
  // Üst üste binen isteklerde eski cevap yenisinin üstüne yazılmasın (aynı bildirim iki kez okunmasın).
  const seq = (APP.navBadgeSeq = (APP.navBadgeSeq || 0) + 1);
  const { data, error } = await sb.rpc('get_nav_badges', { p_token: s.session_token });
  if(error || !data || seq !== APP.navBadgeSeq) return;
  APP.navBadges = data;
  applyNavBadges();
  handleDeliveryOffer(data.delivery_offer);
  if(APP.view==='home'){ homeFillBadges(); if(!APP.homeSumAt || Date.now() - APP.homeSumAt > 30000){ APP.homeSumAt = Date.now(); homeLoadSummary(s); } }
  // Uygulama simgesindeki sayı (kurulu web uygulamasında / destekleyen tarayıcıda).
  const visible = NAV_ITEMS.filter(i => navItemVisible(i, s));
  const total = visible.reduce((t, i) => t + (data[i.view] || 0), 0);
  try{ if(navigator.setAppBadge){ total > 0 ? navigator.setAppBadge(total) : navigator.clearAppBadge(); } }catch(e){}
  // Yeni bir bekleyen iş geldiyse Peyktan bildirim sesi (mutfak kendi zilini çalar).
  const soundTotal = visible.filter(i => i.view!=='kitchen').reduce((t, i) => t + (data[i.view] || 0), 0);
  const voiceSound = typeof processVoiceBadges === 'function' ? processVoiceBadges(data, visible.map(i => i.view)) : false;
  if(APP.lastSoundTotal != null && soundTotal > APP.lastSoundTotal && (voiceSound || !getVoicePrefs().enabled)) playPeyktanSound();
  APP.lastSoundTotal = soundTotal;
}
/* Peyktan'ın sabit bildirim sesi (assets/sounds/peyktan.wav - Android
   uygulamasında aynı dosya res/raw/peyktan olarak bildirim kanalının sesi).
   Cihazın/bilgisayarın varsayılan bildirim sesi yerine her yerde bu çalar.
   Art arda gelen bildirimlerde 5 sn içinde tekrar çalmaz. */
let PEYKTAN_SOUND_BUF = null, PEYKTAN_SOUND_LAST = 0;
// Tarayıcılar sesi ancak sayfaya bir kez dokunulduktan sonra çaldırır: ilk
// dokunuşta ses motoru açılır ve Peyktan sesi önceden yüklenir.
['pointerdown','keydown','touchstart'].forEach(ev => document.addEventListener(ev, function unlockPeyktanAudio(){
  try{
    KITCHEN_AUDIO_CTX = KITCHEN_AUDIO_CTX || new (window.AudioContext || window.webkitAudioContext)();
    if(KITCHEN_AUDIO_CTX.state==='suspended') KITCHEN_AUDIO_CTX.resume();
    if(!PEYKTAN_SOUND_BUF) fetch('/assets/sounds/peyktan.wav').then(r => r.arrayBuffer()).then(b => KITCHEN_AUDIO_CTX.decodeAudioData(b)).then(buf => { PEYKTAN_SOUND_BUF = buf; }).catch(() => {});
  }catch(e){}
}, { once: true, passive: true }));
async function playPeyktanSound(){
  // Aynı olay hem bildirim (push) hem rozet artışı olarak gelebilir; 5 sn içinde tek ses.
  if(Date.now() - PEYKTAN_SOUND_LAST < 5000) return;
  // Sesli okuma sürerken zil çalınmaz (üst üste binmesin).
  if(typeof voiceIsBusy === 'function' && voiceIsBusy()) return;
  // Kişinin kendi yaptığı işlemin (ör. mutfakta "hazır") doğurduğu bildirimde ses çalmaz.
  if(Date.now() < (APP.selfActionUntil || 0)) return;
  // Mobil uygulama arka plandayken (ör. telsiz açık olduğu için çalışmaya devam ederken)
  // Android/iOS bildirimi zaten kendi sesini çalar; ikinci kez çalınmaz.
  if(document.hidden && typeof isNativeApp === 'function' && isNativeApp()) return;
  PEYKTAN_SOUND_LAST = Date.now();
  // Bildirim Ayarları'nda bu cihaz için bir ses yüklendiyse/seçildiyse o çalar.
  try{
    const own = typeof getKitchenBellSounds==='function' ? getKitchenBellSounds().default : null;
    if(own && (own.custom || own.preset)){ playKitchenBell(null); return; }
  }catch(e){}
  try{
    KITCHEN_AUDIO_CTX = KITCHEN_AUDIO_CTX || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = KITCHEN_AUDIO_CTX;
    if(ctx.state==='suspended') await ctx.resume();
    if(!PEYKTAN_SOUND_BUF){
      const r = await fetch('/assets/sounds/peyktan.wav');
      PEYKTAN_SOUND_BUF = await ctx.decodeAudioData(await r.arrayBuffer());
    }
    const src = ctx.createBufferSource(); src.buffer = PEYKTAN_SOUND_BUF; src.connect(ctx.destination); src.start();
  }catch(e){ console.warn('Bildirim sesi çalınamadı:', e); }
}
function startNavBadges(){
  refreshNavBadges();
  startDataVersionWatch();
  radioSync();
  try{ maybeShowIosInstallHint(); }catch(e){}
  if(NAV_BADGE_TIMER) clearInterval(NAV_BADGE_TIMER);
  // Rozetler ve rol izinleri 20 sn'de bir tazelenir (Roller'deki değişiklik
  // açık ekranlara da yenileme gerekmeden yansısın).
  // Rozetler (ve onlara bağlı sesli bildirimler: 20 dk gecikme, gel-al saati, rezervasyon hatırlatma)
  // 10 sn'de bir; sekme arka plandayken de devam eder ki bildirim gecikmesin.
  const navTick = () => { if(!getSession()) return; refreshNavBadges(); if(document.visibilityState==='visible') syncMyPermissions(); };
  // Arka plan sekmesinde de zamanında çalışsın diye worker zamanlayıcısı; yoksa normal setInterval.
  try{
    if(!window.NAV_TICK_WORKER && window.Worker){ window.NAV_TICK_WORKER = new Worker('/app/js/tick-worker.js'); }
    if(window.NAV_TICK_WORKER){ window.NAV_TICK_WORKER.onmessage = navTick; window.NAV_TICK_WORKER.postMessage({ ms: 10000 }); }
    else NAV_BADGE_TIMER = setInterval(navTick, 10000);
  }catch(e){ NAV_BADGE_TIMER = setInterval(navTick, 10000); }
}
// Sekmeye geri dönülünce beklemeden güncel bildirimler alınır.
document.addEventListener('visibilitychange', () => { if(!document.hidden && getSession()) refreshNavBadges(); });
/* ---- Çoklu kullanımda canlı ekran: veritabanındaki her değişiklik işletmenin
   sayaç değerini artırır (bkz. _bump_data_version). Açık ekran 3 sn'de bir bu
   değere bakar; değişmişse rozetleri tazeler ve - kullanıcı bir form
   doldurmuyorsa/pencere açık değilse - mevcut ekranı sessizce yeniden çizer. ---- */
let DATA_VER_TIMER = null, DATA_VER_LAST = null, DATA_VER_BUSY = false;
let DATA_VER_CHANNEL = null, DATA_VER_PENDING = false;
function startDataVersionWatch(){
  if(DATA_VER_TIMER) clearInterval(DATA_VER_TIMER);
  // Anlık: sayaç değişince Supabase Realtime haber verir (sorgulamayı beklemeden).
  // Bağlantı koparsa/kurulamazsa aralıklı sorgulama yedek olarak çalışmaya devam eder.
  const session = getSession();
  if(DATA_VER_CHANNEL){ try{ sb.removeChannel(DATA_VER_CHANNEL); }catch(e){} DATA_VER_CHANNEL = null; }
  let live = false;
  if(session && session.restaurant_id && sb.channel){
    try{
      DATA_VER_CHANNEL = sb.channel('dv-' + session.restaurant_id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'data_versions', filter: 'restaurant_id=eq.' + session.restaurant_id }, (payload) => onDataVersionPush(payload))
        .subscribe(status => { live = status === 'SUBSCRIBED'; });
    }catch(e){ DATA_VER_CHANNEL = null; }
  }
  // Realtime bağlıyken sorgulama seyrekleşir (her 3 sn yerine 15 sn'de bir).
  let tick = 0;
  clearInterval(DATA_VER_TIMER);
  DATA_VER_TIMER = setInterval(() => { tick++; if(!live || tick % 5 === 0) checkDataVersion(); }, 3000);
}
// Realtime bildirimi yeni sayaç değerini zaten taşır: sunucuya tekrar sormadan ekran hemen tazelenir.
function onDataVersionPush(payload){
  const v = payload && payload.new && payload.new.v;
  const session = getSession();
  if(v == null || !session || document.visibilityState!=='visible'){ checkDataVersion(true); return; }
  if(DATA_VER_LAST === null){ DATA_VER_LAST = v; return; }
  if(v === DATA_VER_LAST) return;
  DATA_VER_LAST = v;
  if(APP.view==='messages') refreshMessagesView();
  refreshNavBadges(); refreshWaiterCalls(); refreshShiftWidget(session); radioSyncSoon();
  if(APP.view!=='messages') autoRefreshCurrentView(session);
}
async function checkDataVersion(fromRealtime){
  const session = getSession();
  if(!session || document.visibilityState!=='visible') return;
  // Sorgu sürerken gelen bildirim kaybolmasın: bittikten sonra bir kez daha bakılır.
  if(DATA_VER_BUSY){ if(fromRealtime) DATA_VER_PENDING = true; return; }
  DATA_VER_BUSY = true;
  try{
    const { data, error } = await sb.rpc('get_data_version', { p_token: session.session_token });
    if(error || data==null) return;
    const changed = DATA_VER_LAST!==null && data!==DATA_VER_LAST;
    DATA_VER_LAST = data;
    if(changed){ refreshNavBadges(); refreshWaiterCalls(); refreshShiftWidget(session); autoRefreshCurrentView(session); }
  } finally {
    DATA_VER_BUSY = false;
    if(DATA_VER_PENDING){ DATA_VER_PENDING = false; setTimeout(() => checkDataVersion(), 50); }
  }
}
// Kullanıcı bir şey yazıyor/seçiyorsa ya da açık bir pencere varsa ekranı ellemeyiz.
function uiBusyForAutoRefresh(){
  const ae = document.activeElement;
  if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type!=='checkbox' && ae.type!=='radio') return true;
  for(const el of document.body.children){
    if(el.id==='app') continue;
    const cs = getComputedStyle(el);
    if(cs.position==='fixed' && cs.display!=='none' && el.offsetWidth >= window.innerWidth*0.9 && el.offsetHeight >= window.innerHeight*0.9) return true;
  }
  const main = document.getElementById('main'); if(!main) return true;
  for(const el of main.querySelectorAll('input,textarea,select')){
    if(el.tagName==='SELECT'){ const di = [...el.options].findIndex(o => o.defaultSelected); if(!el.multiple && el.selectedIndex !== (di<0 ? 0 : di)) return true; }
    else if(el.type==='checkbox' || el.type==='radio'){ if(el.checked!==el.defaultChecked) return true; }
    else if(el.value!==el.defaultValue) return true;
  }
  return false;
}
const AUTO_REFRESH_SKIP = ['home','reports','settings','printerSettings','devicePrinters','notificationSettings','help'];
function autoRefreshCurrentView(session){
  if(APP.view==='kitchen'){ if(APP.kitchenStation) refreshKitchenItems(session); return; }
  if(APP.view==='order' || APP.view==='packages'){ refreshOrderLiveStatus(session); return; }
  if(APP.view==='messages'){ refreshMessagesView(); return; }
  // Rezervasyon/bekleme: ekran baştan çizilmez; veri sessizce çekilir, yalnız değiştiyse güncellenir.
  if(APP.view==='reservations'){ if(!uiBusyForAutoRefresh() && typeof renderResvTabContent === 'function') renderResvTabContent(session, true, true); return; }
  if(AUTO_REFRESH_SKIP.includes(APP.view) || uiBusyForAutoRefresh()) return;
  softRerender(session);
}
/* Çift tamponlu yeniden çizim (otomatik yenileme ve Yenile düğmesi). */
function softRerender(session, force){
  return new Promise(resolve => {
  // Çift tamponlu yenileme: ekranın o anki görüntüsü (kopya) yerinde kalır,
  // asıl içerik arka planda yeniden çizilir ve hazır olunca tek seferde
  // değiştirilir - "Yükleniyor…" yanıp sönmesi/sayfa zıplaması olmaz.
  const main = document.getElementById('main'); if(!main || main.dataset.refreshing){ resolve(); return; }
  const sc = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
  const ca = document.querySelector('.content-area'); const caTop = ca ? ca.scrollTop : 0;
  const snap = main.cloneNode(true);
  snap.removeAttribute('id'); snap.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  snap.style.pointerEvents = 'none'; snap.dataset.snap = '1';
  main.parentNode.insertBefore(snap, main);
  main.dataset.refreshing = '1'; main.style.display = 'none';
  APP.silentLoad = true;
  const finish = () => {
    APP.silentLoad = false;
    snap.remove(); main.style.display = ''; delete main.dataset.refreshing;
    if(document.scrollingElement) document.scrollingElement.scrollTop = sc;
    const ca2 = document.querySelector('.content-area'); if(ca2) ca2.scrollTop = caTop;
    applyNavBadges();
    resolve();
  };
  renderMainView(main, session).catch(() => {}).then(() => setTimeout(finish, 350));
  setTimeout(() => { if(main.dataset.refreshing) finish(); }, 4000);
  });
}
function todayLocalDateStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function goToView(view, fromHistory){
  // Geri tuşu/kaydırma için her ekran değişimi tarayıcı geçmişine yazılır
  // (bkz. goBack / popstate). Geçmişten gelinen geçişler tekrar yazılmaz.
  if(!fromHistory && view !== APP.view) pushScreen();
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

function goHome(){ goToView('home'); }

/* ---- Geri: Android geri tuşu, soldan sağa kaydırma ve ← butonu aynı
   sırayla çalışır: açık pencere varsa kapat → açık menüyü kapat → bir
   önceki ekrana dön → (ana ekrandaysa) native'de uygulamayı arka plana al. */
function closeTopModal(){
  const modals = document.querySelectorAll('[id$="ModalBg"], .modal-bg');
  if(!modals.length) return false;
  modals[modals.length-1].remove();
  return true;
}
/* Geri, uygulamanın kendi ekran yığınıyla (APP.viewStack) çalışır; Android
   WebView'de history.back()/popstate güvenilir olmadığı için tarayıcı
   geçmişine bağlı değildir. Tarayıcı geçmişi yalnızca masaüstü/mobil
   tarayıcının kendi geri tuşu için senkron tutulur. */
let IGNORE_NEXT_POPSTATE = false;
/* Ekran içi adımlar: geri önce bunları geri alır, ekran değiştirmez
   (örn. Mutfak'ta istasyon seçiliyse önce istasyon seçim listesine döner). */
const VIEW_BACK_STEPS = {
  kitchen: () => {
    if(!APP.kitchenStation) return false;
    APP.kitchenStation = null; stopKitchenPolling(); render();
    return true;
  },
};
function backWithinView(){
  const step = VIEW_BACK_STEPS[APP.view];
  return !!(step && step());
}
function goBack(){
  if(closeTopModal()) return;
  if(APP.mobileNavOpen){ closeMobileNav(); return; }
  if(backWithinView()) return;
  if(popScreen()){
    // Tarayıcı geçmişini de bir geri al (popstate tekrar işlenmesin).
    IGNORE_NEXT_POPSTATE = true;
    setTimeout(() => { IGNORE_NEXT_POPSTATE = false; }, 400);
    try{ history.back(); }catch(e){}
    return;
  }
  if(APP.view && APP.view !== 'home'){ goToView('home', true); saveNavState(); return; }
  const AppPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if(AppPlugin && AppPlugin.minimizeApp) AppPlugin.minimizeApp();
}
/* ---- Ekran yığını: menü ekranı + ekran içi sekmeler (Ayarlar/Raporlar/Rezervasyon/
   Satınalma sekmesi, Kullanıcılar alt sekmesi, açık sohbet, mutfak istasyonu). Geri her
   zaman bir önceki ekrana/sekmeye döner. Yığın sessionStorage'da tutulur; uygulama
   arka planda yeniden yüklense bile kaldığı ekrandan ve geri geçmişiyle açılır. */
const SCREEN_KEYS = ['view','settingsTab','reportTab','usersSubTab','resvTab','purchTab','notifPane','chatConv','kitchenStation'];
function screenSnapshot(){ const o = {}; SCREEN_KEYS.forEach(k => { if(APP[k] !== undefined) o[k] = APP[k]; }); o.view = o.view || 'home'; return o; }
function saveNavState(){ try{ sessionStorage.setItem('peyktan_nav', JSON.stringify({ cur: screenSnapshot(), stack: APP.viewStack || [] })); }catch(e){} }
function pushScreen(){
  APP.viewStack = (APP.viewStack || []).concat([screenSnapshot()]).slice(-40);
  try{ history.pushState({ nav: APP.viewStack.length }, ''); }catch(e){}
  setTimeout(saveNavState, 0);
}
function popScreen(){
  const stack = APP.viewStack || [];
  if(!stack.length) return false;
  let prev = stack.pop();
  if(typeof prev === 'string') prev = { view: prev };
  APP.viewStack = stack;
  const session = getSession();
  const item = NAV_ITEMS.find(i => i.view === prev.view);
  if(prev.view !== 'home' && !(item && session && navItemVisible(item, session))) prev = { view: 'home' };
  SCREEN_KEYS.forEach(k => { if(k !== 'view') APP[k] = prev[k]; });
  goToView(prev.view, true);
  saveNavState();
  return true;
}
function restoreNavState(){
  if(!getSession()) return;
  try{
    const st = JSON.parse(sessionStorage.getItem('peyktan_nav') || 'null');
    if(!st || !st.cur) return;
    const item = NAV_ITEMS.find(i => i.view === st.cur.view);
    if(st.cur.view !== 'home' && !(item && navItemVisible(item, getSession()))) return;
    SCREEN_KEYS.forEach(k => { if(st.cur[k] !== undefined) APP[k] = st.cur[k]; });
    APP.viewStack = Array.isArray(st.stack) ? st.stack.slice(-40) : [];
  }catch(e){}
}
function setupBackNavigation(){
  restoreNavState();
  try{ history.replaceState({ nav: 0 }, ''); }catch(e){}
  window.addEventListener('popstate', (e) => {
    if(IGNORE_NEXT_POPSTATE){ IGNORE_NEXT_POPSTATE = false; return; }
    if(!getSession()) return;
    // Pencere açıkken tarayıcı geri tuşu önce pencereyi kapatsın, ekran değişmesin.
    if(closeTopModal() || backWithinView()){ try{ history.pushState({ view: APP.view }, ''); }catch(err){} return; }
    if(!popScreen() && APP.view !== 'home'){ goToView('home', true); saveNavState(); }
  });
  const AppPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if(AppPlugin) AppPlugin.addListener('backButton', () => { if(getSession()) goBack(); else if(AppPlugin.minimizeApp) AppPlugin.minimizeApp(); });
  // Ekranın sol kenarından sağa kaydırma = geri.
  if('ontouchstart' in window){
    let sx = null, sy = 0;
    document.addEventListener('touchstart', (e) => {
      sx = null;
      if(e.touches.length !== 1 || !getSession()) return;
      if(e.target.closest && e.target.closest('.floorplan-editor')) return;
      const t = e.touches[0];
      if(t.clientX <= 28){ sx = t.clientX; sy = t.clientY; }
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if(sx === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
      sx = null;
      if(dx > 80 && dy < 60) goBack();
    });
  }
}


function renderHome(main, session){
  // Kişiye özel "Bugün" ekranı: yetkili olduğu bölümlerin kısayolları, anlık özet, vardiya ve (yetkiliyse) hızlı yönetim.
  const hr = new Date().getHours();
  const greet = hr < 6 ? 'İyi geceler' : hr < 12 ? 'Günaydın' : hr < 18 ? 'İyi günler' : 'İyi akşamlar';
  const skip = ['home','help','notificationSettings','printerSettings','devicePrinters','settings'];
  const items = NAV_ITEMS.filter(i => !skip.includes(i.view) && navItemVisible(i, session));
  const quick = [
    { tab:'products', ic:'🍽️', t:'Ürünler', d:'Fiyat, reçete, stok' },
    { tab:'zones', ic:'🪑', t:'Masalar', d:'Bölge ve masa planı' },
    { tab:'stations', ic:'📋', t:'Menüler', d:'Menüler ve istasyonlar' },
  ].filter(q => typeof SETTINGS_TABS !== 'undefined' && SETTINGS_TABS.some(t => t.tab===q.tab && settingsTabVisible(t, session)));
  main.innerHTML = `<h1>${greet} ${escapeHtml(session.username)} 👋</h1>
    <p class="u-tl muted hm-date">${new Date().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long' })}</p>
    ${setupWizardHtml(session)}
    <div id="homeShift" class="hm-shift"></div>
    <div id="homeMyPlan"></div>
    <div id="homeNow"></div>
    ${items.length ? `<h3 class="hq-title">🚀 Hızlı Başla</h3><div class="hm-grid">${items.map((it, i) => `<button type="button" class="hm-tile" data-hview="${it.view}" style="--sc:var(--c${i%4+1});" ${act('goToView', it.view)}><span class="hm-ic">${it.icon}</span><b>${escapeHtml(it.label)}</b><small class="hm-sub"></small></button>`).join('')}</div>` : ''}
    ${quick.length ? `<h3 class="hq-title">⚡ Hızlı Yönetim</h3><div class="hq-row">${quick.map((q, i) => `<button type="button" class="hq-card" style="--sc:var(--c${i+1});" ${act('goQuickManage', q.tab)}><span class="hq-ic">${q.ic}</span><span><b>${q.t}</b><small>${q.d}</small></span></button>`).join('')}</div>` : ''}
    ${discoverHtml(session)}`;
  homeFillBadges(); homeFillShift(); homeLoadSummary(session); homeMyPlan(session);
}
/* Bu haftaki planlı vardiyalarım (Vardiya Planı'ndan); plan yoksa hiçbir şey göstermez. */
async function homeMyPlan(session){
  if(typeof spWeekStart !== 'function') return;
  const wk = spWeekStart(todayLocalDateStr());
  const { data } = await sb.rpc('get_shift_plan', { p_token: session.session_token, p_week_start: wk });
  const el = document.getElementById('homeMyPlan'); if(!el || !data) return;
  const mine = (data.plan || []).filter(p => p.user_id === session.user_id).sort((a, b) => a.day < b.day ? -1 : 1);
  if(!mine.length){ el.innerHTML = ''; return; }
  const today = todayLocalDateStr(), names = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  el.innerHTML = `<h3 class="hq-title">📅 Bu haftaki vardiyalarım</h3><div class="sp-mine">${mine.map(p => `<div class="sp-mine-d ${p.day === today ? 'sp-today' : ''}"><b>${names[new Date(p.day + 'T12:00:00').getDay()]} ${p.day.slice(8)}</b><span class="sp-chip">${p.start}–${p.end}</span>${p.note ? `<small>${escapeHtml(p.note)}</small>` : ''}</div>`).join('')}</div>`;
}
/* Kurulum rehberi (yöneticiye, işletme hazır olana kadar ana ekranda): adımlar mevcut verilerden hesaplanır. */
function setupSteps(){
  const c = APP.config || {}, prods = c.products || [], tables = (c.zones || []).reduce((n, z) => n + (z.tables || []).length, 0);
  let printers = []; try{ printers = typeof getPrinters === 'function' ? getPrinters() : JSON.parse(localStorage.getItem('rys_printers') || '[]'); }catch(e){}
  return [
    { k:'menu', ic:'📋', t:'Menü ve istasyon', d:'Ürün gruplarınızı ve mutfak istasyonlarını oluşturun', ok: (c.menus || []).length > 0 && (c.stations || []).length > 0, go:['quick','stations'] },
    { k:'prod', ic:'🍔', t:'Ürünler', d:'En az 3 ürün ekleyin', ok: prods.length >= 3, go:['quick','products'] },
    { k:'cost', ic:'💸', t:'Maliyetler', d:'Kâr raporları için ürün maliyetlerini girin', ok: prods.length > 0 && prods.every(p => Number(p.cost) > 0), go:['quick','products'] },
    { k:'table', ic:'🪑', t:'Masalar', d:'Bölge ve masaları ekleyin', ok: tables > 0, go:['quick','zones'] },
    { k:'staff', ic:'👥', t:'Personel', d:'Garson / mutfak kullanıcılarını ekleyin', ok: (c.users || []).length > 1, go:['quick','users'] },
    { k:'print', ic:'🖨️', t:'Yazıcı', d:'Fiş ve mutfak yazıcısını bağlayın (isteğe bağlı)', ok: printers.length > 0, go:['view','devicePrinters'] },
  ];
}
function setupWizardHtml(session){
  if(!session.isManager) return '';
  let hidden = false; try{ hidden = localStorage.getItem('pk_setup_hidden') === '1'; }catch(e){}
  const st = setupSteps(), done = st.filter(x => x.ok).length;
  if(hidden || done === st.length) return '';
  const next = st.find(x => !x.ok);
  return `<div class="sk-card"><div class="sk-head"><div><b>🚀 İşletmenizi kuralım</b><small>${done}/${st.length} adım tamam</small></div>
      <button type="button" class="sk-x" title="Gizle" ${act('hideSetupWizard')}>✕</button></div>
    <div class="sk-bar"><i style="width:${Math.round(done / st.length * 100)}%"></i></div>
    <div class="sk-steps">${st.map(x => `<button type="button" class="sk-step ${x.ok ? 'ok' : ''} ${next === x ? 'next' : ''}" ${act('setupGo', x.go[0], x.go[1])}>
      <span class="sk-ic">${x.ok ? '✓' : x.ic}</span><span><b>${x.t}</b><small>${x.d}</small></span>${next === x ? '<em>Sıradaki →</em>' : ''}</button>`).join('')}</div></div>`;
}
function setupGo(kind, target){ if(kind === 'view') goToView(target); else if(kind === 'tab'){ APP.settingsTab = target; goToView('settings'); } else goQuickManage(target); }
/* Özellik keşfi: kullanıcının erişebildiği ama gözden kaçabilecek özellikler; kapatılan kart bir daha gösterilmez, en fazla 3 kart. */
const DISCOVER_TIPS = [
  { k:'plan', ic:'📅', t:'Vardiya Planı', d:'Haftalık vardiyaları planlayın, geçen haftayı tek tıkla kopyalayın.', ok: s => canManage(s, 'shifts'), go:['users','plan'] },
  { k:'qrpay', ic:'📱', t:'QR ile hesap ödeme', d:'Müşteri masadaki QR\'dan hesabını görüp kartla ödeyebilir.', ok: s => canManage(s, 'settings_integrations'), go:['integrations'] },
  { k:'winback', ic:'💛', t:'Müşteri geri kazanım', d:'Uzun süredir gelmeyen müşterilere tek tıkla SMS/e-posta.', ok: s => hasPerm(s, 'crm'), view:'crm' },
  { k:'res', ic:'🪑', t:'Rezervasyon & bekleme listesi', d:'"Masanız hazır" SMS\'i ve tahmini bekleme süresi.', ok: s => hasPerm(s, 'reservations'), view:'reservations' },
  { k:'radio', ic:'📻', t:'Peyk Bas-Konuş', d:'Mutfak ve salon arasında telsiz gibi anlık sesli iletişim.', ok: () => true, view:'radio' },
  { k:'stock', ic:'📦', t:'Kritik stok uyarısı', d:'Azalan hammaddeler için tek tıkla satınalma taslağı.', ok: s => canManage(s, 'settings_products'), go:['products','ingredients'] },
];
function discoverHtml(session){
  let seen = []; try{ seen = JSON.parse(localStorage.getItem('pk_discover_off') || '[]'); }catch(e){}
  const list = DISCOVER_TIPS.filter(t => !seen.includes(t.k) && (() => { try{ return t.ok(session); }catch(e){ return false; } })()).slice(0, 3);
  if(!list.length) return '';
  return `<h3 class="hq-title">✨ Bunları denediniz mi?</h3><div class="dc-row">${list.map(t => `<div class="dc-card" data-dc="${t.k}" ${act('discoverGo', t.k)}><span class="dc-ic">${t.ic}</span><span><b>${t.t}</b><small>${t.d}</small></span><span class="dc-x" title="Bir daha gösterme" ${actOn('click', 'discoverOff', [t.k, '$event'])}>✕</span></div>`).join('')}</div>`;
}
function discoverOff(k, ev){ if(ev) ev.stopPropagation(); let seen = []; try{ seen = JSON.parse(localStorage.getItem('pk_discover_off') || '[]'); seen.push(k); localStorage.setItem('pk_discover_off', JSON.stringify(seen)); }catch(e){} const el = document.querySelector(`.dc-card[data-dc="${k}"]`); if(el) el.remove(); }
function discoverGo(k){
  const t = DISCOVER_TIPS.find(x => x.k === k); if(!t) return;
  discoverOff(k);
  if(t.view) return goToView(t.view);
  APP.settingsTab = t.go[0]; if(t.go[0] === 'users') APP.usersSubTab = t.go[1]; if(t.go[0] === 'products') APP.productsSubTab = t.go[1];
  goToView('settings');
}
function hideSetupWizard(){ try{ localStorage.setItem('pk_setup_hidden', '1'); }catch(e){} const el = document.querySelector('.sk-card'); if(el) el.remove(); showToast('Kurulum rehberi gizlendi'); }
// Kısayol kartlarına bekleyen iş sayısı (menü rozetlerinden).
function homeFillBadges(){
  const b = APP.navBadges || {};
  document.querySelectorAll('.hm-tile[data-hview]').forEach(el => {
    const n = b[el.dataset.hview] || 0, sub = el.querySelector('.hm-sub');
    el.classList.toggle('has', n > 0); if(sub) sub.textContent = n > 0 ? n + ' bekliyor' : '';
  });
}
function homeFillShift(){
  const el = document.getElementById('homeShift'); if(!el) return;
  if(typeof shiftWidgetHtml !== 'function' || !APP.shiftStatus){ el.innerHTML = ''; return; }
  const st = APP.shiftStatus;
  let dur = '';
  if(st.clocked_in && st.clock_in){ const m = Math.max(0, Math.round((Date.now() - new Date(st.clock_in).getTime()) / 60000)); dur = `<span class="hm-dur">⏱ ${Math.floor(m/60)} sa ${m%60} dk</span>`; }
  el.innerHTML = `<div class="hm-shift-card"><span class="hm-shift-t">👤 Vardiyam</span>${shiftWidgetHtml()}${dur}</div>`;
}
async function homeLoadSummary(session){
  const el = document.getElementById('homeNow'); if(!el) return;
  let d = null;
  try{ const r = await sb.rpc('get_home_summary', { p_token: session.session_token }); if(!r.error) d = r.data; }catch(e){}
  if(typeof dayCloseCheck === 'function') await dayCloseCheck(session);
  if(!d || APP.view !== 'home' || !document.getElementById('homeNow')) return;
  const it = (APP.navBadges && APP.navBadges._items) || {};
  const ready = (it.payments || []).filter(x => x.kind==='ready').length;
  const calls = (it.order || []).filter(x => x.kind==='waiter_call').length + (it.payments || []).filter(x => x.kind==='waiter_call').length;
  const cards = [];
  const c = (ic, val, label, view, warn) => cards.push(`<button type="button" class="hm-stat ${warn?'warn':''}" ${view ? act('goToView', view) : ''}><span class="hm-sic">${ic}</span><span><b>${val}</b><small>${label}</small></span></button>`);
  if(d.open_tables != null) c('🪑', d.open_tables + (d.total_tables ? ' / ' + d.total_tables : ''), 'Dolu masa', 'order');
  if(d.open_tables != null && ready) c('✅', ready, 'Hazır, servis bekliyor', 'payments', true);
  if(d.open_tables != null && calls) c('🙋', calls, 'Garson çağıran masa', 'order', true);
  if(d.open_takeaway != null) c('📦', d.open_takeaway, 'Açık paket', 'packages');
  if(d.kitchen_pending != null) c('🍳', d.kitchen_pending, 'Mutfakta bekleyen ürün', 'kitchen');
  if(d.kitchen_late) c('⏰', d.kitchen_late, '20 dk+ geciken', 'kitchen', true);
  if(d.resv_today != null) c('📅', d.resv_today, 'Bugünkü rezervasyon', 'reservations');
  if(d.resv_next) c('⏭️', new Date(d.resv_next.time).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }), 'Sıradaki: ' + escapeHtml(d.resv_next.name || '') + (d.resv_next.party ? ' · ' + d.resv_next.party + ' kişi' : ''), 'reservations');
  if(d.waitlist) c('⏳', d.waitlist, 'Bekleme listesinde', 'reservations');
  if(d.revenue_today != null){
    const pct = d.goal ? Math.min(100, Math.round(d.revenue_today / d.goal * 100)) : null;
    c('💰', money(d.revenue_today), 'Bugünkü ciro · ' + d.bills_today + ' hesap' + (pct != null ? ' · hedefin %' + pct + "'i" : ''), null);
  }
  el.innerHTML = (typeof dayCloseBannerHtml === 'function' ? dayCloseBannerHtml() : '') + (cards.length ? `<h3 class="hq-title">📍 Şu an</h3><div class="hm-stats">${cards.join('')}</div>` : '');
}
function goQuickManage(tab){ APP.settingsTab = tab; if(tab==='products') APP.productsSubTab = 'products'; goToView('settings'); }
function notReadyYet(){ alert('Bu ekran bir sonraki adımda eklenecek.'); }







/* Push bildirimine (bkz. sw.js) ya da bir toast'a tıklanınca ilgili
   ekrana gidilsin diye (?view=order gibi) - sadece izin verilen bir
   NAV_ITEMS görünümüyse ve oturum varsa uygulanır, aksi halde sessizce
   yok sayılır. Hem sayfa ilk açılışında (uygulama zaten oturumluyken
   bir push linkiyle açılmışsa) hem başarılı girişten sonra kullanılır. */
/* Bildirime tıklanınca ilgili ekran: oturum varsa hemen geçilir, yoksa girişten sonra açılmak üzere saklanır. */
function openViewFromNotification(view, tag){
  if(!view) return;
  const session = getSession();
  if(!session){ try{ sessionStorage.setItem('peyk_pending_view', view); }catch(e){} return; }
  const item = NAV_ITEMS.find(i => i.view===view);
  if(!item || !navItemVisible(item, session)) return;
  if(view==='settings' && String(tag||'').startsWith('shift')) APP.settingsTab = 'shifts';
  try{ window.focus(); }catch(e){}
  goToView(view);
}
function applyDeepLinkView(){
  const session = getSession(); if(!session) return;
  let view = new URLSearchParams(window.location.search).get('view');
  if(!view){ try{ view = sessionStorage.getItem('peyk_pending_view'); sessionStorage.removeItem('peyk_pending_view'); }catch(e){} }
  if(!view) return;
  const item = NAV_ITEMS.find(i => i.view===view);
  if(item && navItemVisible(item, session)) APP.view = view;
}
/* ---- Yenile: sayfayı baştan yükler (en güncel kod + veriler), açık olan
   ekran ve Ayarlar sekmesi korunur. Oturum sessionStorage'da olduğu için
   yeniden giriş gerekmez. Mobilde ayrıca sayfanın en üstündeyken aşağı
   çekerek (pull-to-refresh) tetiklenir. ---- */
/* Yenile: sayfayı baştan yüklemek yerine verileri arka planda tazeler ve
   ekranı tek seferde günceller (bkz. softRerender). Sitede yeni bir sürüm
   yayınlanmışsa (index.html'in ETag'i değiştiyse) yeni kodun gelmesi için
   o zaman gerçekten yeniden yüklenir. */
let APP_BUILD_TAG = null;
async function currentBuildTag(){
  try{ const r = await fetch('/app/', { method:'HEAD', cache:'no-store' }); return r.headers.get('etag') || r.headers.get('last-modified'); }catch(e){ return null; }
}
currentBuildTag().then(t => { APP_BUILD_TAG = t; });
function hardReloadApp(){
  try{ sessionStorage.setItem('rys_restore_view', JSON.stringify({ view: APP.view, settingsTab: APP.settingsTab })); }catch(e){}
  window.location.reload();
}
async function refreshApp(){
  const session = getSession();
  const tag = await currentBuildTag();
  if(!session || (tag && APP_BUILD_TAG && tag !== APP_BUILD_TAG)){ hardReloadApp(); return; }
  document.querySelectorAll('.ptr-indicator').forEach(x => x.remove());
  try{
    const { data } = await sb.rpc('get_restaurant_config', { p_token: session.session_token });
    if(data) APP.config = data;
  }catch(e){}
  syncMyPermissions(); refreshNavBadges(); refreshShiftWidget(session); refreshWaiterCalls();
  await softRerender(session, true);
  showToast('Güncellendi ✓', 1500);
}
/* Rol/izin değişiklikleri (Ayarlar > Roller) oturuma sadece girişte
   yazılıyordu; artık açılışta, yenilemede ve uygulamaya geri dönüldüğünde
   sunucudan tazelenir (bkz. get_my_permissions). */
async function syncMyPermissions(){
  const s = getSession(); if(!s) return;
  if(typeof loadVoicePolicy === 'function') loadVoicePolicy();
  const { data, error } = await sb.rpc('get_my_permissions', { p_token: s.session_token });
  if(error || !data) return;
  const cur = getSession(); if(!cur || cur.session_token !== s.session_token) return;
  const next = { ...cur, permissions: data.permissions || [], role_names: data.role_names || [], isManager: !!data.is_manager };
  // Şirket sahibi şubeye girdiyse (🏢) rol adları/izinler şirket akışından gelir, dokunma.
  if(String(cur.username||'').startsWith('🏢')) return;
  const changed = JSON.stringify([...(cur.permissions||[])].sort()) !== JSON.stringify([...next.permissions].sort())
    || !!cur.isManager !== next.isManager || (cur.role_names||[]).join() !== next.role_names.join();
  if(!changed) return;
  setSession(next);
  const item = NAV_ITEMS.find(i => i.view===APP.view);
  if(item && !navItemVisible(item, next)) APP.view = 'home';
  render();
}
function restoreViewAfterRefresh(){
  let saved = null;
  try{ saved = JSON.parse(sessionStorage.getItem('rys_restore_view') || 'null'); sessionStorage.removeItem('rys_restore_view'); }catch(e){}
  const session = getSession();
  if(!saved || !session) return;
  const item = NAV_ITEMS.find(i => i.view===saved.view);
  if(item && navItemVisible(item, session)) APP.view = saved.view;
  if(saved.settingsTab) APP.settingsTab = saved.settingsTab;
}
function setupPullToRefresh(){
  if(!('ontouchstart' in window)) return;
  const PULL_TRIGGER = 90;
  let startY = null, dy = 0, ind = null;
  const blocked = (t) => !getSession() || !document.querySelector('.app-shell')
    || (t.closest && t.closest('.floorplan-editor, .sidebar, input, textarea, select, [id$="ModalBg"], [id$="Modal"]'))
    || document.querySelector('[id$="ModalBg"]')
    || (t.closest && t.closest('.chat-thread, .chat-list, .chat-tray'))
    || insideScrolledBox(t);
  // Kendi içinde kayan bir kutuda (sohbet, liste, tablo) yukarı kaydırılmışsa
  // aşağı çekmek o kutuyu kaydırmalı, sayfayı yenilememeli.
  function insideScrolledBox(el){
    for(let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement){
      const oy = getComputedStyle(n).overflowY;
      if((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 2 && n.scrollTop > 0) return true;
    }
    return false;
  }
  document.addEventListener('touchstart', (e) => {
    startY = null;
    if(e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) return;
    startY = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if(startY === null) return;
    dy = e.touches[0].clientY - startY;
    if(dy <= 10 || window.scrollY > 0){ if(ind){ ind.remove(); ind = null; } return; }
    if(!ind){ ind = document.createElement('div'); ind.className = 'ptr-indicator'; document.body.appendChild(ind); }
    const p = Math.min(dy, PULL_TRIGGER * 1.4);
    ind.style.transform = 'translate(-50%,' + (p * 0.6) + 'px)';
    ind.textContent = dy >= PULL_TRIGGER ? '↻ Bırakınca yenilenir' : '↓ Yenilemek için çekin';
    ind.classList.toggle('ready', dy >= PULL_TRIGGER);
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if(startY === null) return;
    const go = dy >= PULL_TRIGGER && window.scrollY <= 0;
    startY = null;
    if(ind){ if(go){ ind.textContent = '↻ Yenileniyor…'; } else { ind.remove(); ind = null; } }
    if(go) refreshApp();
  });
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
    const cur = getSession();
    if(cur && !cur.remember && idleFor >= IDLE_LOGOUT_MS){
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
  const curSession = getSession();
  const loggingOut = !!(getAdminSession() || (curSession && !curSession.remember));
  if(getAdminSession()) doAdminLogout();
  if(curSession && !curSession.remember) doLogout();
  if(loggingOut) alert('Uzun süre uzakta kaldığınız için oturumunuz güvenlik amacıyla kapatıldı. Lütfen tekrar giriş yapın.');
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
restoreViewAfterRefresh();
setupPullToRefresh();
setupBackNavigation();
initNativeAppMode();
consumeSupportHandoff();
render();
drawSupportBanner();
syncMyPermissions();
startNavBadges();
if(getSession() && typeof loadVoicePolicy === 'function') loadVoicePolicy();
// Hatırlanan oturumun sunucudaki süresini her açılışta tazele (girişte
// yazılamamış olsa bile kendini onarır).
{ const s0 = getSession(); if(s0 && s0.remember) sb.rpc('set_session_remember', { p_token: s0.session_token }); }
document.addEventListener('visibilitychange', () => { if(document.visibilityState==='visible'){ syncMyPermissions(); refreshNavBadges(); } });
/* Push bildirimine tıklanınca zaten açık olan bir sekme varsa (bkz.
   sw.js notificationclick), sayfa yeniden yüklenmeden ilgili ekrana
   geçmek için service worker'dan gelen mesaj burada dinlenir. */
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', (event) => {
    if(event.data && event.data.type==='peyktan-navigate' && event.data.view) openViewFromNotification(event.data.view, event.data.tag);
    if(event.data && event.data.type==='peyktan-sound'){
      // Sesli bildirim açıksa zil ayrıca çalınmaz: rozet yenilenince bildirim tek seferde (sesli) okunur.
      if(!(typeof getVoicePrefs === 'function' && getVoicePrefs().enabled)) playPeyktanSound();
      refreshNavBadges();
    }
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
// Açılış logosu tek ve kesintisiz: ilk veriler yüklenene kadar ekranda kalır (en az 700ms, en çok 8sn),
// arada ikinci bir "yükleniyor" logosu çıkmaz (bkz. startLoadingWatch).
(function(){
  const t0 = Date.now(), MIN = 700, MAX = 8000;
  const tick = () => {
    const sp = document.getElementById('splashScreen'); if(!sp) return;
    const busy = (typeof LOADING_WATCH_DEPTH !== 'undefined' && LOADING_WATCH_DEPTH > 0);
    const age = Date.now() - t0;
    if(age < MIN || (busy && age < MAX)) return setTimeout(tick, 100);
    sp.classList.add('splash-fade'); setTimeout(() => sp.remove(), 550);
  };
  setTimeout(tick, 100);
})();
/* "Yeni ... Ekle" panelleri (Ürünler, İstasyonlar, Hammaddeler vb.) listenin altında değil
   üstünde dursun: ekrana bir liste + ekleme paneli çizildiğinde panel, başlığın hemen altına
   taşınır. Her ekranı tek tek değiştirmek yerine tek yerden uygulanır. */
function liftAddPanels(root){
  (root.querySelectorAll ? root.querySelectorAll('.add-row-panel:not([data-lifted])') : []).forEach(panel => {
    panel.dataset.lifted = '1';
    const box = panel.parentElement; if(!box) return;
    const list = [...box.children].find(c => c !== panel && (c.tagName === 'TABLE' || c.classList.contains('list-search') || c.querySelector('table')));
    if(!list || !(list.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
    box.insertBefore(panel, list);
    panel.style.margin = '0 0 16px';
  });
  // Geniş ekranda, altında bir liste olan ekleme paneli kaydırınca üstte sabit kalır (bilgi kutuları ve
  // tekrarlanan bölüm kutuları sabitlenmez). Stil dosyası önbellekte eski kalsa da çalışsın diye satır içi.
  if(window.innerWidth > 820 && root.querySelectorAll) root.querySelectorAll('.add-row-panel:not([data-sticky-checked])').forEach(panel => {
    panel.dataset.stickyChecked = '1';
    const after = []; for(let n = panel.nextElementSibling; n; n = n.nextElementSibling) after.push(n);
    const hasList = after.some(n => n.tagName === 'TABLE' || n.matches('.settings-table-wrap') || n.querySelector('table, .settings-table-wrap'));
    if(!hasList || panel.closest('[style*="position:fixed"], .modal-bg')) return;
    panel.classList.add('is-sticky');
    Object.assign(panel.style, { position: 'sticky', top: '0', zIndex: '30', boxShadow: '0 8px 18px -12px rgba(0,0,0,.25)' });
  });
}
new MutationObserver(muts => {
  for(const m of muts) for(const n of m.addedNodes) if(n.nodeType === 1) liftAddPanels(n.parentElement || n);
}).observe(document.body, { childList: true, subtree: true });
/* ---- Yeni sürüm algılama: mobil (Capacitor) ve masaüstü (Electron) uygulamaları canlı siteyi
   açar ama sayfayı kendiliğinden yeniden yüklemez. Sayfadaki kod dosyalarının (js/css) ETag'leri
   birkaç dakikada bir ve uygulama öne geldiğinde kontrol edilir; değişmişse alttaki çubukla
   kullanıcıya bildirilir, uygulama arka plandan öne gelirken (bir şey yazılmıyorsa) kendiliğinden yenilenir. ---- */
const UPDATE_WATCH = { tags: null, ready: false, checking: false, last: 0 };
function updateWatchFiles(){
  return [...document.querySelectorAll('script[src], link[rel="stylesheet"][href]')]
    .map(e => e.getAttribute('src') || e.getAttribute('href'))
    .filter(u => u && !/^https?:/i.test(u));
}
async function fetchUpdateTags(){
  const out = {};
  await Promise.all(updateWatchFiles().map(async u => {
    try{
      const r = await fetch(u, { method: 'HEAD', cache: 'no-store' });
      if(r.ok) out[u] = r.headers.get('etag') || r.headers.get('last-modified') || '';
    }catch(e){}
  }));
  return out;
}
async function checkForAppUpdate(){
  if(UPDATE_WATCH.checking || UPDATE_WATCH.ready || !navigator.onLine) return;
  UPDATE_WATCH.checking = true; UPDATE_WATCH.last = Date.now();
  try{
    const tags = await fetchUpdateTags();
    if(!Object.keys(tags).length) return;
    if(!UPDATE_WATCH.tags){ UPDATE_WATCH.tags = tags; return; }
    const changed = Object.keys(tags).some(u => UPDATE_WATCH.tags[u] && tags[u] && UPDATE_WATCH.tags[u] !== tags[u]);
    if(changed){ UPDATE_WATCH.ready = true; showWebUpdateBar(); }
  } finally { UPDATE_WATCH.checking = false; }
}
function showWebUpdateBar(){
  if(document.getElementById('webUpdateBar')) return;
  const bar = document.createElement('div');
  bar.id = 'webUpdateBar';
  bar.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;background:var(--accent,#0e8fa3);color:#fff;border-radius:999px;padding:10px 18px;box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;font-weight:700;font-size:14px;max-width:calc(100% - 32px);';
  bar.innerHTML = '<span>🔄 Yeni sürüm hazır</span><button type="button" style="width:auto;margin:0;padding:6px 14px;border-radius:999px;background:#fff;color:var(--accent,#0e8fa3);font-weight:800;">Yenile</button>';
  bar.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(bar);
}
function maybeAutoReloadForUpdate(){
  // Yazılan bir şey ya da açık bir pencere yoksa (bkz. uiBusyForAutoRefresh) kendiliğinden yenilenir.
  if(UPDATE_WATCH.ready && !(typeof uiBusyForAutoRefresh === 'function' && uiBusyForAutoRefresh())) location.reload();
}
setTimeout(checkForAppUpdate, 5000);
setInterval(() => { if(document.visibilityState === 'visible') checkForAppUpdate(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible') return;
  if(UPDATE_WATCH.ready){ maybeAutoReloadForUpdate(); return; }
  if(Date.now() - UPDATE_WATCH.last > 60 * 1000) checkForAppUpdate().then(maybeAutoReloadForUpdate);
});

/* ---- Android uygulaması güncelleme uyarısı ----
   Uygulama ekranı her açılışta canlı siteden geldiği için bu uyarı, kendi içinde
   güncelleme kodu olmayan eski sürümlerde de çalışır. Kurulu sürüm kodu (App.getInfo().build)
   /assets/app-version.json'daki son sürümden eskiyse "Güncelle" çubuğu gösterilir ve
   Play Store sayfası açılır. Yeni sürüm Play'de yayınlanınca o dosyadaki 'latest' artırılır. */
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.peyktan.app';
async function checkAndroidAppUpdate(){
  try{
    const C = window.Capacitor;
    if(!C || !C.getPlatform || C.getPlatform() !== 'android' || !C.Plugins || !C.Plugins.App) return;
    const info = await C.Plugins.App.getInfo();
    const res = await fetch('/assets/app-version.json', { cache: 'no-store' });
    const v = (await res.json()).android || {};
    const installed = Number(info && info.build) || 0;
    if(!installed || !v.latest || installed >= v.latest) return;
    let dismissed = ''; try{ dismissed = localStorage.getItem('rys_upd_dismiss') || ''; }catch(e){}
    if(dismissed === v.latest + '|' + new Date().toDateString()) return; // "Sonra" denince o gün tekrar sorulmaz
    showAppUpdateBar(v);
  }catch(e){}
}
function showAppUpdateBar(v){
  // Önbellekteki eski bir sürüm argümansız çağırabiliyor: sürüm bilgisi yoksa çubuk gösterilmez.
  if(!v || !v.latest) return;
  if(document.getElementById('appUpdateBar')) return;
  const bar = document.createElement('div'); bar.id = 'appUpdateBar';
  bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:97;background:var(--accent);color:#fff;border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.3);font-size:13.5px;';
  bar.innerHTML = `<span class="u-f1">🔄 Peyktan'ın yeni sürümü (${escapeHtml(v.name || '')}) hazır.</span>
    <button type="button" style="margin:0;width:auto;padding:7px 14px;background:#fff;color:var(--accent);border:0;font-weight:800;" ${act('openPlayStoreUpdate')}>Güncelle</button>
    <button type="button" style="margin:0;width:auto;padding:7px 10px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);box-shadow:none;" ${act('dismissAppUpdate', v.latest)}>Sonra</button>`;
  document.body.appendChild(bar);
}
// Uygulama kendi alan adı dışındaki adresleri sistemde (Play Store uygulamasında) açar.
function openPlayStoreUpdate(){ location.href = PLAY_URL; }
function dismissAppUpdate(latest){ try{ localStorage.setItem('rys_upd_dismiss', latest + '|' + new Date().toDateString()); }catch(e){} removeEl('appUpdateBar'); }
setTimeout(checkAndroidAppUpdate, 4000);

/* ---- Destek modu (Platform Yönetimi > İşletmeler > "Destek olarak gir") ----
   Yönetim paneli oturumu localStorage'a bırakır; bu sekme bir kez okuyup siler (60 sn geçerli).
   Destek oturumu bu sekmeye özeldir (kalıcı kaydedilmez) ve en fazla 1 saat sürer. */
function consumeSupportHandoff(){
  try{
    if(!/[?&]support=1/.test(location.search)) return;
    // Tarayıcı yeni sekmeye açan sekmenin sessionStorage'ını kopyalayabiliyor: bu sekmedeki
    // yönetim paneli oturumu silinir (asıl yönetim sekmesi etkilenmez).
    try{ sessionStorage.removeItem('platform_admin_session'); }catch(_){}
    const raw = localStorage.getItem('rys_support_handoff');
    localStorage.removeItem('rys_support_handoff');
    history.replaceState(null, '', location.pathname);
    if(!raw) return;
    const h = JSON.parse(raw); const d = h && h.s;
    if(!d || !d.session_token || Date.now() - h.at > 60000) return;
    setSession({ session_token: d.session_token, user_id: d.user_id, restaurant_id: d.restaurant_id, role_names: d.role_names || [],
      permissions: d.permissions || [], isManager: true, restaurant_name: d.restaurant_name, username: 'Peyktan Destek',
      remember: false, isSupport: true, supportUntil: d.expires_at });
  }catch(e){}
}
function drawSupportBanner(){
  const s = getSession();
  let bar = document.getElementById('supportBanner');
  if(!s || !s.isSupport){ if(bar) bar.remove(); document.body.classList.remove('support-mode'); return; }
  if(!bar){
    bar = document.createElement('div'); bar.id = 'supportBanner';
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:500;background:#b45309;color:#fff;font-size:13px;font-weight:700;padding:6px 12px;display:flex;align-items:center;justify-content:center;gap:12px;';
    document.body.appendChild(bar);
    document.body.style.paddingTop = '34px';
  }
  const until = s.supportUntil ? new Date(s.supportUntil).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : '';
  bar.innerHTML = `<span>🛟 Peyktan destek modu · ${escapeHtml(s.restaurant_name || '')}${until ? ' · ' + until + "'e kadar" : ''}</span>
    <button type="button" style="margin:0;width:auto;padding:3px 12px;background:rgba(255,255,255,.2);border:0;color:#fff;box-shadow:none;" ${act('endSupportSession')}>Çık</button>`;
}
async function endSupportSession(){
  if(typeof doLogout === 'function') await doLogout();
  removeEl('supportBanner'); document.body.style.paddingTop = '';
  try{ window.close(); }catch(e){}
}
setInterval(drawSupportBanner, 30000);

/* Windows (masaüstü) uygulamasında bildirim izni ilk açılışta otomatik istenir;
   bildirimler ayrıca açılmadan gelir. */
setTimeout(() => {
  try{
    if(window.electronAPI && window.electronAPI.isElectron && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }catch(e){}
}, 3000);

// Arka plandan dönünce canlı ekranlar beklemeden tazelensin (yoklama gizliyken durduğu için).
document.addEventListener('visibilitychange', () => {
  const s = getSession(); if(document.hidden || !s) return;
  try{
    if(APP.view === 'kitchen' && APP.kitchenStation && typeof refreshKitchenItems === 'function') refreshKitchenItems(s);
    else if((APP.view === 'order' || APP.view === 'packages') && typeof refreshOrderLiveStatus === 'function') refreshOrderLiveStatus(s);
    refreshNavBadges();
  }catch(e){}
});
/* Uygulama ekrandayken bildirim merkezinde biriken eski Peyktan bildirimleri
   (ör. ödenmiş masanın "siparişi hazır" bildirimi) temizlenir; güncel durum zaten uygulamada görünür. */
function clearShownPushNotifications(){
  try{
    if(document.hidden) return;
    const PN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if(PN && PN.removeAllDeliveredNotifications) PN.removeAllDeliveredNotifications().catch(() => {});
    if(!navigator.serviceWorker) return;
    navigator.serviceWorker.getRegistration('/app/').then(reg => {
      if(!reg || !reg.getNotifications) return;
      reg.getNotifications().then(list => list.forEach(n => n.close()));
    }).catch(() => {});
  }catch(e){}
}
document.addEventListener('visibilitychange', clearShownPushNotifications);
window.addEventListener('focus', clearShownPushNotifications);
setInterval(clearShownPushNotifications, 60000);
clearShownPushNotifications();

/* ---- Kurye onayı: "Kuryeye Ver" ile seçilen kuryenin ekranına onay penceresi düşer (bildirim değil).
   "Siparişi aldım" deyince kurye sayfası açılır ve canlı konum kendiliğinden başlar. "Sonra" denirse pencere,
   restoran "Onayı tekrar gönder" diyene kadar (teklif zamanı değişene kadar) tekrar açılmaz. ---- */
function handleDeliveryOffer(o){
  const cur = document.getElementById('dofBg');
  if(!o){ if(cur) cur.remove(); return; }
  let dismissed = null; try{ dismissed = localStorage.getItem('dof_' + o.order_id); }catch(e){}
  if(dismissed === String(o.offer_at)){ if(cur) cur.remove(); return; }
  if(cur && cur.dataset.key === o.order_id + '|' + o.offer_at) return;
  if(cur) cur.remove();
  APP.deliveryOffer = o;
  const bg = document.createElement('div'); bg.id = 'dofBg'; bg.className = 'dof-bg dg-bg'; bg.dataset.key = o.order_id + '|' + o.offer_at;
  bg.innerHTML = `<div class="dof" role="dialog" aria-modal="true">
    <div class="dof-ic">🛵</div><h2>Yeni teslimat</h2><p class="muted">${o.by ? escapeHtml(o.by) + ' bu siparişi size verdi' : 'Bu sipariş size verildi'}</p>
    <div class="dof-card">
      <div class="dof-row"><span>👤</span><b>${escapeHtml(o.customer || '')}${o.no ? ' · #' + escapeHtml(String(o.no)) : ''}</b></div>
      ${o.address ? `<div class="dof-row"><span>📍</span><div>${escapeHtml(o.address)}</div></div>` : ''}
      ${o.note ? `<div class="dof-row"><span>📝</span><div>${escapeHtml(o.note)}</div></div>` : ''}
      <div class="dof-row"><span>💰</span><b>${money(o.total)}</b>${o.eta_min ? `<small class="muted" style="margin-left:auto;">🗺️ ~${o.eta_min} dk yol</small>` : ''}</div>
    </div>
    <button class="dof-ok" ${act('acceptDeliveryOffer')}>✅ Siparişi aldım</button>
    <p class="muted dof-n">Onaylayınca canlı konum paylaşımı otomatik başlar; müşteri varış süresini görür. Teslim edince kapanır.</p>
    <button type="button" class="ghost-btn dof-later" ${act('dismissDeliveryOffer')}>Sonra</button>
  </div>`;
  document.body.appendChild(bg);
  try{ playPeyktanSound(); }catch(e){}
  try{ if(navigator.vibrate) navigator.vibrate([200, 100, 200]); }catch(e){}
}
function dismissDeliveryOffer(){
  const o = APP.deliveryOffer; if(o){ try{ localStorage.setItem('dof_' + o.order_id, String(o.offer_at)); }catch(e){} }
  const el = document.getElementById('dofBg'); if(el) el.remove();
}
async function acceptDeliveryOffer(){
  const o = APP.deliveryOffer; if(!o) return;
  const btn = document.querySelector('.dof-ok'); if(btn){ btn.disabled = true; btn.textContent = 'Açılıyor…'; }
  const { data, error } = await sb.rpc('accept_delivery', { p_token: getSession().session_token, p_order_id: o.order_id });
  if(error){ alert(error.message); if(btn){ btn.disabled = false; btn.textContent = '✅ Siparişi aldım'; } return; }
  window.location.href = '/kurye/?t=' + data + '&auto=1';
}
