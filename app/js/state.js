/* Uygulama genelindeki paylaşılan durum (APP), izin/paket sabitleri ve
   tema/sidebar/abonelik durumu yardımcıları - app/index.html'den çıkarıldı.
   api.js gibi klasik bir <script src>, ES module değil - global scope
   paylaşılır. */
/* Konfigüre edilebilir izin anahtarları - manager_upsert_role'daki izin
   listesiyle birebir aynı olmalı (bkz. Supabase migration). 'reports' ve
   rol yönetiminin kendisi kasıtlı olarak bu listede YOK: finansal analiz
   ekranı ayrı bir şifre kapısıyla korunuyor, rol yönetimi ise sadece
   Yönetici'ye (is_system) açık - hiçbir özel role verilemez. */
const PERMISSION_LABELS = {
  order: 'Sipariş Al',
  packages: 'Paket Servis',
  kitchen: 'Mutfak Ekranı',
  payments: 'Ödemeler',
  settings_stations: 'Ayarlar · İstasyonlar',
  settings_zones: 'Ayarlar · Bölgeler & Masalar',
  settings_products: 'Ayarlar · Ürünler',
  settings_ingredients: 'Ayarlar · Hammaddeler',
  settings_users: 'Ayarlar · Kullanıcılar',
  settings_flags: 'Ayarlar · Sipariş Etiketleri',
  crm: 'Müşteriler (CRM)',
  reservations: 'Rezervasyonlar',
  purchasing: 'Tedarikçi & Satın Alma',
  purchasing_orders: 'Satın Alma Siparişi Verme',
  purchasing_manage: 'Satın Alma Yönetimi',
  purchasing_suppliers: 'Tedarikçi Yönetimi',
  shifts: 'Vardiyalar',
};
function hasPerm(session, perm){ return (session.permissions||[]).includes(perm); }
/* Yönetici (işletme sahibi) her şeyi yapar; diğerleri ilgili izin rollerine verilmişse. */
function canManage(session, perm){ return !!session.isManager || hasPerm(session, perm); }
/* Tedarikçi & Satın Alma alt izinleri: purchasing_orders (sipariş verme),
   purchasing_manage (onay/teslim/iptal), purchasing_suppliers (tedarikçiler).
   Eski 'purchasing' izni ve Yönetici hepsini kapsar. */
function hasPurchPerm(session, sub){
  return !!session.isManager || hasPerm(session, 'purchasing') || hasPerm(session, 'purchasing_' + sub);
}

/* Tüm paketler AYNI 7 günlük ücretsiz deneme ile başlar (bkz.
   verify_registration_otp) - paketler arasındaki fark kullanıcı sayısı
   limiti ve deneme sonrası aylık fiyat. Paketler artık sabit kodlanmış
   değil, platform admin ekranından eklenip/silinebiliyor (bkz.
   list_packages, admin_list_packages, admin_upsert_package,
   admin_delete_package) - bu yüzden PACKAGES çalışma zamanında
   list_packages() ile doldurulan bir dizi/haritadır. */
let PACKAGES = [];
let PACKAGES_BY_ID = {};
async function loadPackages(force){
  if(PACKAGES.length && !force) return PACKAGES;
  try{
    const { data } = await sb.rpc('list_packages');
    PACKAGES = data || [];
  }catch(e){ PACKAGES = []; }
  PACKAGES_BY_ID = {};
  PACKAGES.forEach(p => { PACKAGES_BY_ID[p.id] = p; });
  return PACKAGES;
}

/* Herhangi bir RPC çağrısı 'ABONELIK_SURESI_DOLDU' ile dönerse (bkz. sb.rpc
   sarmalayıcısı) buradan tetiklenir - oturum aynı anda birden fazla istek
   başarısız olsa bile ekran sadece bir kez değişsin diye bayrakla korunur. */
let SUBSCRIPTION_EXPIRED_SHOWN = false;
function handleSubscriptionExpired(){
  if(SUBSCRIPTION_EXPIRED_SHOWN) return;
  SUBSCRIPTION_EXPIRED_SHOWN = true;
  clearSession();
  APP.authScreen = 'expired';
  render();
}
/* Bir kullanıcı aynı anda yalnızca bir cihazdan giriş yapabilir (bkz.
   login_staff) - başka bir cihazdan giriş yapılınca bu oturumun token'ı
   sunucuda silinir, bir sonraki RPC çağrısında _session_check bunu
   yakalar (bkz. sb.rpc sarmalayıcısı) ve buraya düşer. getSession() zaten
   boşsa (örn. az önce elle çıkış yapıldıysa) tekrar tekrar tetiklenmesin
   diye kontrol ediliyor. */
function handleSessionInvalidated(){
  if(!getSession()) return;
  clearSession();
  stopKitchenPolling();
  stopOrderPolling();
  stopCustomerRequestPolling();
  APP.customerReqPollStarted = false;
  APP.shiftStatus = null;
  APP.authScreen = 'login';
  APP.sessionKicked = true;
  render();
}

const APP = { view:'home', config:null, selectedZone:null, draftCart:{}, liveOrders:[], authScreen:'login', selectedPackage:null, pendingSignup:null, adminView:'promos', settingsTab:'stations', mobileNavOpen:false };

const NAV_ITEMS = [
  { view:'order', icon:'🍽️', label:'Sipariş Al', perm:'order' },
  { view:'packages', icon:'📦', label:'Paket Servis', perm:'packages' },
  { view:'kitchen', icon:'🧑‍🍳', label:'Mutfak Ekranı', perm:'kitchen' },
  { view:'reservations', icon:'📅', label:'Rezervasyonlar', perm:'reservations' },
  { view:'crm', icon:'👥', label:'Müşteriler', perm:'crm' },
  { view:'purchasing', icon:'🚚', label:'Tedarikçi & Satın Alma', perm:'purchasing' },
  { view:'printerSettings', icon:'🖨️', label:'Yazıcı Ayarları' },
  { view:'notificationSettings', icon:'🔔', label:'Bildirimler' },
  { view:'payments', icon:'💳', label:'Ödemeler', perm:'payments' },
  { view:'reports', icon:'📊', label:'Finansal Analiz' },
  { view:'messages', icon:'💬', label:'Mesajlar' },
  { view:'settings', icon:'⚙️', label:'Ayarlar' },
  { view:'help', icon:'❓', label:'Yardım' },
];
/* notificationSettings her personel için her zaman görünür (izin
   gerektirmez, cihaza özel). printerSettings ise artık SADECE Yönetici'ye
   açık - yazıcı seçimi/istasyon eşleştirme yine cihaza özel kalıyor (fiziksel
   bağlantı gerektirdiği için merkezi yapılamaz) ama kimin bu ayarları
   değiştirebileceği kısıtlandı; Fiş Tasarımı artık veritabanında saklanıyor
   ve sadece Yönetici değiştirebiliyor (bkz. update_ticket_design), böylece
   yöneticinin belirlediği tasarım her cihazda/fişte otomatik geçerli olur.
   reports sadece Yönetici'ye (is_manager) görünür - ayrıca içine girerken
   ayrı bir şifre istenir (bkz. renderReportsView). settings, en az bir
   settings_* iznine sahip herkese görünür; sekmeler içeride yine izne göre
   filtrelenir. */
/* İşletmenin etkin özellikleri (paket + satın alınan eklentiler), bkz.
   get_restaurant_config.features / _restaurant_features. Config henüz
   yüklenmediyse false döner - eklenti arayüzü config gelene kadar gizli kalır. */
function hasFeature(f){ return !!(APP.config && (APP.config.features||[]).includes(f)); }
function navItemVisible(item, session){
  if(item.view==='reports') return canManage(session, 'reports');
  if(item.view==='printerSettings') return canManage(session, 'printer_settings');
  // Mesajlaşma rol izniyle açılır (Ayarlar > Roller); Yönetici her zaman görür.
  if(item.view==='messages') return !!session.isManager || hasPerm(session, 'messages');
  if(item.view==='settings') return session.isManager || (session.permissions||[]).some(p => p.startsWith('settings_'));
  if(item.view==='purchasing') return ['orders','manage','suppliers'].some(x => hasPurchPerm(session, x));
  if(!item.perm) return true;
  return hasPerm(session, item.perm);
}
function getTheme(){ try{ return localStorage.getItem('rys_theme')||'light'; }catch(e){ return 'light'; } }
function setTheme(t){
  try{ localStorage.setItem('rys_theme', t); }catch(e){}
  document.documentElement.setAttribute('data-theme', t);
  if(getSession() || getAdminSession()) render();
}
function getSidebarCollapsed(){ try{ return localStorage.getItem('rys_sidebar')==='collapsed'; }catch(e){ return false; } }
function toggleSidebar(){
  const collapsed = !getSidebarCollapsed();
  try{ localStorage.setItem('rys_sidebar', collapsed?'collapsed':'open'); }catch(e){}
  render();
}
/* Telefonda sidebar sabit bir şerit yerine kayar bir menü (drawer) olarak
   açılıyor - açma/kapama sadece bellekte tutuluyor (localStorage'a yazmaya
   gerek yok, her sayfa yüklemesinde kapalı başlaması yeterli). */
function toggleMobileNav(){ APP.mobileNavOpen = !APP.mobileNavOpen; render(); }
function closeMobileNav(){ if(APP.mobileNavOpen){ APP.mobileNavOpen = false; render(); } }

