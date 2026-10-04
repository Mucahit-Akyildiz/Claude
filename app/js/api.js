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
const _sbRpc = sb.rpc.bind(sb);
sb.rpc = function(fn, args){
  return _sbRpc(fn, args).then(res => {
    if(res && res.error && res.error.message === 'ABONELIK_SURESI_DOLDU'){
      handleSubscriptionExpired();
    } else if(res && res.error && res.error.message === 'Oturum geçersiz veya süresi dolmuş, tekrar giriş yapın'){
      handleSessionInvalidated();
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
      res.error.message = 'Beklenmeyen bir hata oluştu, lütfen tekrar deneyin.';
    }
    return res;
  });
};

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
  try{
    sessionStorage.setItem('staff_session', JSON.stringify(s));
    if(s && s.remember) localStorage.setItem('staff_session_persist', JSON.stringify(s));
    else localStorage.removeItem('staff_session_persist');
  }catch(e){}
}
function clearSession(){
  try{ sessionStorage.removeItem('staff_session'); localStorage.removeItem('staff_session_persist'); }catch(e){}
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

