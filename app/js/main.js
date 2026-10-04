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
        ${APP.view && APP.view!=='home' ? '<button class="mobile-menu-btn" onclick="goBack()" aria-label="Geri" title="Geri">←</button>' : ''}
        <button class="mobile-menu-btn" id="mobileMenuBtn" onclick="toggleMobileNav()" aria-label="Menü" style="position:relative;">☰</button>
        <img src="/assets/images/logo.webp" alt="Peyktan" class="mobile-topbar-logo">
        <div class="mobile-topbar-title">${escapeHtml(session.restaurant_name)}</div>
        <button class="mobile-menu-btn" onclick="refreshApp()" aria-label="Yenile" title="Yenile">↻</button>
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
          ${items.map(i => `<div class="sb-item ${APP.view===i.view?'active':''}" data-view="${i.view}" onclick="goToView('${i.view}')" title="${i.label}"><span class="ic">${i.icon}</span><span class="label">${i.label}</span></div>`).join('')}
        </nav>
        <div class="sb-bottom">
          <div id="shiftWidget" class="shift-widget">${shiftWidgetHtml()}</div>
          ${getCompanySession() ? '<button class="sb-logout" onclick="returnToCompanyPanel()" title="Şirket paneline dön">🏢<span class="label"> Şirkete Dön</span></button>' : ''}
          <div class="theme-toggle">
            <button class="${theme==='dark'?'active':''}" onclick="setTheme('dark')" type="button">🌙 <span class="label">Koyu</span></button>
            <button class="${theme==='light'?'active':''}" onclick="setTheme('light')" type="button">☀️ <span class="label">Açık</span></button>
          </div>
          <button class="sb-logout" onclick="refreshApp()" title="Yenile (son değişiklikleri getir)">🔄<span class="label"> Yenile</span></button>
          <button class="sb-logout" onclick="doLogout()" title="Çıkış Yap">🚪<span class="label"> Çıkış Yap</span></button>
        </div>
      </aside>
      <div class="content-area"><div class="content-inner ${(APP.view==='settings'||APP.view==='reports')?'content-inner-wide':''}">${pushReminderBannerHtml()}${APP.view && APP.view!=='home' ? '<button type="button" class="back-link" onclick="goBack()">← Geri</button>' : ''}<main id="main"></main></div></div>
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
  applyNavBadges();
}
/* ---- Bekleyen iş sayıları (rozetler): menüde ilgili ekranın yanında,
   ekran içi sekmelerde (Ayarlar > Vardiyalar, Satın Alma Siparişleri) ve
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
  const resvItems = badgeItems('reservations');
  const tabs = {
    shifts: b.settings || 0,
    orders: b.purchasing || 0,
    reservations: resvItems.filter(x => x.kind==='reservation').length,
    waitlist: resvItems.filter(x => x.kind==='waitlist').length,
  };
  document.querySelectorAll('.tabs .tab[data-tab]').forEach(el => {
    if(!(el.dataset.tab in tabs)) return;
    const want = el.classList.contains('active') ? 0 : tabs[el.dataset.tab];
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
    goToView(view);
  };
  document.body.appendChild(pop);
  setTimeout(() => document.addEventListener('click', function close(){ pop.remove(); document.removeEventListener('click', close); }), 0);
}
let NAV_BADGE_TIMER = null;
async function refreshNavBadges(){
  const s = getSession(); if(!s) return;
  const { data, error } = await sb.rpc('get_nav_badges', { p_token: s.session_token });
  if(error || !data) return;
  APP.navBadges = data;
  applyNavBadges();
}
function startNavBadges(){
  refreshNavBadges();
  if(NAV_BADGE_TIMER) clearInterval(NAV_BADGE_TIMER);
  // Rozetler ve rol izinleri 20 sn'de bir tazelenir (Roller'deki değişiklik
  // açık ekranlara da yenileme gerekmeden yansısın).
  NAV_BADGE_TIMER = setInterval(() => { if(getSession() && document.visibilityState==='visible'){ refreshNavBadges(); syncMyPermissions(); } }, 20000);
}
function todayLocalDateStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function goToView(view, fromHistory){
  // Geri tuşu/kaydırma için her ekran değişimi tarayıcı geçmişine yazılır
  // (bkz. goBack / popstate). Geçmişten gelinen geçişler tekrar yazılmaz.
  if(!fromHistory && view !== APP.view){
    APP.viewStack = (APP.viewStack || []).concat(APP.view || 'home').slice(-30);
    try{ history.pushState({ view }, ''); }catch(e){}
  }
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
  const stack = APP.viewStack || [];
  if(stack.length){
    const prev = stack.pop();
    APP.viewStack = stack;
    goToView(prev, true);
    // Tarayıcı geçmişini de bir geri al (popstate tekrar işlenmesin).
    IGNORE_NEXT_POPSTATE = true;
    setTimeout(() => { IGNORE_NEXT_POPSTATE = false; }, 400);
    try{ history.back(); }catch(e){}
    return;
  }
  if(APP.view && APP.view !== 'home'){ goToView('home', true); return; }
  const AppPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if(AppPlugin && AppPlugin.minimizeApp) AppPlugin.minimizeApp();
}
function setupBackNavigation(){
  try{ history.replaceState({ view: APP.view || 'home' }, ''); }catch(e){}
  window.addEventListener('popstate', (e) => {
    if(IGNORE_NEXT_POPSTATE){ IGNORE_NEXT_POPSTATE = false; return; }
    if(!getSession()) return;
    // Pencere açıkken tarayıcı geri tuşu önce pencereyi kapatsın, ekran değişmesin.
    if(closeTopModal() || backWithinView()){ try{ history.pushState({ view: APP.view }, ''); }catch(err){} return; }
    const view = (e.state && e.state.view) || 'home';
    const item = NAV_ITEMS.find(i => i.view===view);
    if(view==='home' || (item && navItemVisible(item, getSession()))){
      (APP.viewStack || []).pop();
      goToView(view, true);
    }
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
/* ---- Yenile: sayfayı baştan yükler (en güncel kod + veriler), açık olan
   ekran ve Ayarlar sekmesi korunur. Oturum sessionStorage'da olduğu için
   yeniden giriş gerekmez. Mobilde ayrıca sayfanın en üstündeyken aşağı
   çekerek (pull-to-refresh) tetiklenir. ---- */
function refreshApp(){
  try{ sessionStorage.setItem('rys_restore_view', JSON.stringify({ view: APP.view, settingsTab: APP.settingsTab })); }catch(e){}
  window.location.reload();
}
/* Rol/izin değişiklikleri (Ayarlar > Roller) oturuma sadece girişte
   yazılıyordu; artık açılışta, yenilemede ve uygulamaya geri dönüldüğünde
   sunucudan tazelenir (bkz. get_my_permissions). */
async function syncMyPermissions(){
  const s = getSession(); if(!s) return;
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
    || document.querySelector('[id$="ModalBg"]');
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
render();
syncMyPermissions();
startNavBadges();
// Hatırlanan oturumun sunucudaki süresini her açılışta tazele (girişte
// yazılamamış olsa bile kendini onarır).
{ const s0 = getSession(); if(s0 && s0.remember) sb.rpc('set_session_remember', { p_token: s0.session_token }); }
document.addEventListener('visibilitychange', () => { if(document.visibilityState==='visible'){ syncMyPermissions(); refreshNavBadges(); } });
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
