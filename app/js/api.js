/* Supabase client, RPC sarmalayıcısı ve oturum (session) depolama
   yardımcıları - app/index.html'den çıkarıldı (modülerleştirme,
   bkz. güvenlik denetimi sonrası refactor planı). Bu dosya app/index.html
   içindeki asıl uygulama script'inden ÖNCE klasik bir <script src> olarak
   yüklenir; ES module değildir, burada tanımlanan her şey (bugünkü tek
   dosya davranışıyla birebir aynı şekilde) global scope'ta kalır. */
/* ====== BURAYI KENDİ SUPABASE BİLGİLERİNİZLE DOLDURUN ====== */
const SUPABASE_URL = 'https://dveybagnrgofxkqangvo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8';
/* Aylık abonelik yenileme ödemesini başlatan uç nokta (Vercel /api).
   Kayıt sırasında artık ödeme yok (7 günlük ücretsiz deneme) - bu sadece
   Ayarlar'daki "Öde / Yenile" akışında, oturum token'ı ile kullanılıyor. */
const PAYMENT_RENEW_URL = '/api/payment-initialize';
/* Web Push için genel (public) VAPID anahtarı - gizli değil, tarayıcıya
   push aboneliği açarken kullanılır. Özel anahtar sadece Vercel'deki
   /api/dispatch-ready-pushes fonksiyonunda (ortam değişkeni olarak). */
const VAPID_PUBLIC_KEY = 'BKpcu5qzPNhqv04tRdQKxs8j9PSAKoLIIS4AdVEqwWKMfV-c9wu9l7n64bFdisvQDxTpzjvODlaYk7DjOsSG8Dg';
/* ============================================================ */

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
/* Bizim RPC'lerimizin kendi hata mesajlari her zaman Turkce (RAISE EXCEPTION
   ile elle yazilir); bu yuzden Ingilizce teknik terimler/sema adlari iceren
   bir mesaj, kacan/beklenmedik bir Postgres hatasina isaret eder. */
function _looksLikeRawDbError(msg){
  return /column|relation|constraint|duplicate key|violates|syntax error|invalid input syntax|permission denied|null value in column|jsonb?_/i.test(msg);
}
/* Her RPC çağrısının ortak geçiş noktası: sunucu tarafında (_session_check)
   işletmenin deneme/abonelik süresi dolduğu tespit edilirse tüm RPC'ler
   'ABONELIK_SURESI_DOLDU' hatasıyla döner. Burada tek bir yerden yakalanıp
   uygulama genelinde (hangi ekranda olursa olsun) "Abonelik Süresi Doldu"
   ekranına yönlendirilir - her sb.rpc çağrısına tek tek eklemek yerine. */
const _sbRpcRaw = sb.rpc.bind(sb);
/* ---- Ekranlar arası hızlı geçiş: okuma RPC'leri kısa süre önbelleğe alınır ----
   Aynı veri sürümü (bkz. checkDataVersion / DATA_VER_LAST) içinde ve 60 sn'den
   yeniyse sonuç sunucuya gitmeden döner; böylece menüler arası geçişte bekleme
   (yükleme ekranı) olmaz. Herhangi bir yazma RPC'si (listede olmayan her çağrı)
   önbelleği tamamen temizler, yani kendi değişikliğiniz hemen görünür; başka
   cihazdaki değişiklik veri sürümünü artırdığı için önbellek kendiliğinden geçersizleşir. */
const RPC_CACHEABLE = new Set(['get_restaurant_config','get_live_orders','list_suppliers','list_purchase_orders','list_reservations',
  'list_waitlist','list_customers','list_staff_shifts','list_gift_cards','list_invoices','get_integration_settings','get_online_menu_admin',
  'list_waste','get_sales_history','list_active_staff','get_bank_transfer_status','get_addon_purchase_info']);
const RPC_NO_INVALIDATE = new Set(['get_data_version','get_nav_badges','get_my_permissions','get_my_shift_status','log_client_error',
  'list_waiter_calls','list_customer_order_requests','list_chat_conversations','get_chat_messages','get_chat_attachment','search_customers_quick',
  'get_customer_by_phone','check_gift_card']);
const RPC_CACHE = new Map();
function clearRpcCache(){ RPC_CACHE.clear(); }
function _sbRpc(fn, args){
  if(RPC_CACHEABLE.has(fn)){
    const key = fn + '|' + JSON.stringify(args || {});
    let ver = null; try{ ver = DATA_VER_LAST; }catch(e){}
    const hit = RPC_CACHE.get(key);
    if(hit && hit.ver === ver && Date.now() - hit.at < 60000){
      // Çağıran sonucu değiştirebilir; her seferinde kopya verilir.
      return hit.promise.then(res => res && !res.error ? { ...res, data: structuredClone(res.data) } : res);
    }
    // Supabase sorgu nesnesi her .then() çağrısında isteği yeniden atar; tek seferlik Promise'e çevrilir.
    const promise = Promise.resolve(_sbRpcRaw(fn, args));
    RPC_CACHE.set(key, { ver, at: Date.now(), promise });
    promise.then(res => { if(!res || res.error) RPC_CACHE.delete(key); }, () => RPC_CACHE.delete(key));
    return promise.then(res => res && !res.error ? { ...res, data: structuredClone(res.data) } : res);
  }
  if(!RPC_NO_INVALIDATE.has(fn)) RPC_CACHE.clear();
  return _sbRpcRaw(fn, args);
}
sb.rpc = function(fn, args){
  return _sbRpc(fn, args).then(res => {
    if(res && res.error && res.error.message === 'ABONELIK_SURESI_DOLDU'){
      handleSubscriptionExpired();
    } else if(res && res.error && res.error.message === 'Oturum geçersiz veya süresi dolmuş, tekrar giriş yapın'){
      handleSessionInvalidated();
    } else if(res && res.error && /^STOK_YETERSIZ:\d+/.test(res.error.message || '')){
      // Stok yetersiz: sayı ayrı alanda (stockMax), mesaj okunur Türkçe olur.
      res.error.stockMax = Number(res.error.message.split(':')[1]) || 0;
      res.error.message = res.error.stockMax > 0
        ? 'Stok yetersiz: kalan stok en fazla ' + res.error.stockMax + ' adet için yeterli.'
        : 'Stok yetersiz: bu ürün için yeterli stok kalmadı.';
    } else if(res && res.error && res.error.message === 'VARDIYA_GEREKLI'){
      res.error.message = 'Çalışmak için önce vardiyanızı başlatın.';
      if(typeof refreshShiftWidget==='function'){ const s = getSession(); if(s) refreshShiftWidget(s); }
    } else if(res && res.error && res.error.message === 'HAZIR_DEGIL'){
      res.error.message = 'Mutfakta henüz hazır olmayan ürün var. Ödeme almak için önce tüm ürünler "Hazır" işaretlenmeli.';
    } else if(res && res.error && res.error.message === 'PAKET_OZELLIK_YOK'){
      // Paketinizde olmayan bir ozelligi acmaya calistiniz (bkz. _session_check'teki
      // paket katmani) - ham hata metni yerine anlasilir bir mesaj gosterilsin.
      res.error.message = 'Bu özellik paketinizde bulunmuyor. Yükseltmek için destek ile iletişime geçin.';
    } else if(res && res.error && res.error.message && _looksLikeRawDbError(res.error.message)){
      // RPC'lerimizin kendi RAISE EXCEPTION mesajlari Turkce ve kullaniciya
      // gosterilmek uzere yazilir; ama beklenmeyen bir Postgres hatasi
      // (constraint/tip donusumu/syntax vb.) olursa tablo/sutun adlari gibi
      // dahili semayi ifsa eden ham, teknik bir Ingilizce mesaj gelebiliyordu.
      // Bunlar tek merkezden yakalanip genel bir mesajla degistirilir.
      console.error('Beklenmeyen veritabani hatasi:', res.error.message);
      reportClientError('rpc', fn + ': ' + res.error.message, fn);
      res.error.message = 'Beklenmeyen bir hata oluştu, lütfen tekrar deneyin.';
    }
    return res;
  });
};

/* ---- Hata izleme: yakalanmayan JavaScript hataları ve beklenmeyen
   veritabanı hataları log_client_error ile kaydedilir (Admin Paneli >
   Hatalar). Aynı hata sayfada tekrar tekrar gönderilmez (30 sn). ---- */
const _reportedErrors = {};
function reportClientError(kind, message, source){
  try{
    const msg = String(message || '').slice(0, 500);
    if(!msg) return;
    const key = kind + '|' + msg;
    if(_reportedErrors[key] && Date.now() - _reportedErrors[key] < 30000) return;
    _reportedErrors[key] = Date.now();
    let token = null;
    try{ const s = JSON.parse(sessionStorage.getItem('staff_session') || localStorage.getItem('staff_session_persist') || 'null'); token = s && s.session_token; }catch(e){}
    // Supabase sorgu nesnesinde .catch yok (sadece .then): Promise'e çevrilmeden çağrılınca
    // TypeError fırlatıyor ve hiçbir hata kaydı sunucuya ulaşmıyordu.
    Promise.resolve(_sbRpc('log_client_error', { p_token: token, p_kind: kind, p_message: msg, p_source: String(source || '').slice(0, 300),
      p_view: (window.APP && APP.view) || null, p_user_agent: navigator.userAgent, p_url: location.pathname + location.search })).catch(() => {});
  }catch(e){}
}
window.addEventListener('error', (e) => {
  // Tarayıcı eklentileri ve dış kaynaklı (çapraz köken) "Script error." gürültüsü kaydedilmez.
  if(!e || !e.message || e.message === 'Script error.') return;
  reportClientError('js', e.message, (e.filename || '').replace(location.origin, '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0));
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  const msg = r && (r.message || String(r));
  if(!msg || /Failed to fetch|NetworkError|Load failed|AbortError/i.test(msg)) return;
  reportClientError('promise', msg, r && r.stack ? String(r.stack).split('\n')[1] || '' : '');
});

/* "Beni hatırla" (session.remember): oturum localStorage'da da tutulur,
   uygulama/tarayıcı kapatılıp açılınca tekrar giriş gerekmez; sunucuda
   oturum kullanıldıkça 30 gün uzar (bkz. set_session_remember). */
function getSession(){
  try{
    const s = sessionStorage.getItem('staff_session');
    if(s) return JSON.parse(s);
    const p = localStorage.getItem('staff_session_persist');
    if(p){ sessionStorage.setItem('staff_session', p); return JSON.parse(p); }
    return null;
  }catch(e){ return null; }
}
function setSession(s){
  try{ if(typeof ensureChatOwner === 'function') ensureChatOwner(s); }catch(e){}
  try{
    sessionStorage.setItem('staff_session', JSON.stringify(s));
    if(s && s.remember) localStorage.setItem('staff_session_persist', JSON.stringify(s));
    else localStorage.removeItem('staff_session_persist');
  }catch(e){}
}
function clearSession(){
  try{ sessionStorage.removeItem('staff_session'); localStorage.removeItem('staff_session_persist'); }catch(e){}
  // Önceki kullanıcıya ait önbellekler (mesajlar, sorgu sonuçları) sonraki kullanıcıya kalmasın.
  try{ if(typeof resetChatCaches === 'function') resetChatCaches(); }catch(e){}
  try{ clearRpcCache(); }catch(e){}
  try{ if(typeof radioShutdown === 'function') radioShutdown(); }catch(e){}
}
/* Şirket oturumu (şube sahibi/zincir hesabı) - şube personel oturumundan
   (staff_session) ayrı ve bağımsız tutulur. Bir şirket sahibi bir şubeye
   girdiğinde (bkz. enterBranch/switch_to_branch), o an için hem şirket
   oturumu hem de normal şube personel oturumu aynı anda sessionStorage'da
   bulunur - sidebar'daki "Şirkete Dön" butonu bunu kontrol eder. */
function getCompanySession(){
  try{ return JSON.parse(sessionStorage.getItem('company_session')||'null'); }
  catch(e){ return null; }
}
function setCompanySession(s){ sessionStorage.setItem('company_session', JSON.stringify(s)); }
function clearCompanySession(){ sessionStorage.removeItem('company_session'); }

function getAdminSession(){
  try{ return JSON.parse(sessionStorage.getItem('platform_admin_session')||'null'); }
  catch(e){ return null; }
}
function setAdminSession(s){ sessionStorage.setItem('platform_admin_session', JSON.stringify(s)); }
function clearAdminSession(){ sessionStorage.removeItem('platform_admin_session'); }
function isAdminMode(){
  return new URLSearchParams(window.location.search).get('admin')==='1' || !!getAdminSession();
}

