const SUPABASE_URL = 'https://dveybagnrgofxkqangvo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const RESTAURANT_CODE = new URLSearchParams(window.location.search).get('r');
const STATE = { menu: null, cart: {}, orderType: 'pickup' };

/* menu/index.html'deki çok dilli QR menü deseninin birebir aynısı - arayüz
   metinleri burada sabit, seçilen dil tarayıcıda hatırlanır (localStorage).
   Anahtar menu/index.html'inkinden kasıtlı olarak farklı (rys_siparis_lang)
   ki iki sayfa aynı cihazda farklı dil tercihi tutabilsin. */
const LANGS = [
  { code:'tr', label:'TR' },
  { code:'en', label:'EN' },
  { code:'ar', label:'AR' },
  { code:'de', label:'DE' },
  { code:'ru', label:'RU' },
];
const I18N = {
  tr: { invalidTitle:'Geçersiz Bağlantı', invalidMsg:'Bu sayfaya işletmenin paylaştığı online sipariş linkiyle ulaşmalısınız.', errorTitle:'Menü Yüklenemedi', errorMsg:'Bir hata oluştu, lütfen daha sonra tekrar deneyin.', emptyMenu:'Şu anda menüde satışa açık ürün yok.', other:'Diğer', all:'Tümü', subtitle:'Online Sipariş — Gel-Al / Teslimat', sendCart:'Sepeti Gönder →', items:'ürün', checkoutTitle:'Siparişi Onayla', pickupTab:'🥡 Gel-Al', deliveryTab:'🛵 Teslimat', total:'Toplam', namePlaceholder:'Adınız Soyadınız', phonePlaceholder:'Telefon Numaranız', addressPlaceholder:'Teslimat Adresi', sendOrder:'Siparişi Gönder', sending:'Gönderiliyor...', back:'Geri Dön', successTitle:'Siparişiniz Alındı', successMsg:'Siparişiniz işletmeye iletildi, onaylandığında hazırlanmaya başlanacak. Afiyet olsun!', errName:'Adınızı girin', errPhone:'Telefon numaranızı girin', errAddress:'Teslimat adresini girin' },
  en: { invalidTitle:'Invalid Link', invalidMsg:'Please use the online ordering link shared by the business to reach this page.', errorTitle:'Menu Could Not Load', errorMsg:'Something went wrong, please try again later.', emptyMenu:'There are no items available right now.', other:'Other', all:'All', subtitle:'Online Order — Pickup / Delivery', sendCart:'Send Cart →', items:'items', checkoutTitle:'Confirm Order', pickupTab:'🥡 Pickup', deliveryTab:'🛵 Delivery', total:'Total', namePlaceholder:'Your Full Name', phonePlaceholder:'Your Phone Number', addressPlaceholder:'Delivery Address', sendOrder:'Send Order', sending:'Sending...', back:'Go Back', successTitle:'Order Received', successMsg:'Your order has been sent to the business and will be prepared once approved. Enjoy your meal!', errName:'Please enter your name', errPhone:'Please enter your phone number', errAddress:'Please enter the delivery address' },
  ar: { invalidTitle:'رابط غير صالح', invalidMsg:'يرجى استخدام رابط الطلب عبر الإنترنت الذي شاركته المنشأة للوصول إلى هذه الصفحة.', errorTitle:'تعذر تحميل القائمة', errorMsg:'حدث خطأ ما، يرجى المحاولة مرة أخرى لاحقًا.', emptyMenu:'لا توجد عناصر متاحة حاليًا.', other:'أخرى', all:'الكل', subtitle:'طلب عبر الإنترنت — استلام / توصيل', sendCart:'إرسال السلة ←', items:'عناصر', checkoutTitle:'تأكيد الطلب', pickupTab:'🥡 استلام', deliveryTab:'🛵 توصيل', total:'المجموع', namePlaceholder:'الاسم الكامل', phonePlaceholder:'رقم هاتفك', addressPlaceholder:'عنوان التوصيل', sendOrder:'إرسال الطلب', sending:'جارٍ الإرسال...', back:'رجوع', successTitle:'تم استلام طلبك', successMsg:'تم إرسال طلبك إلى المنشأة وسيتم تحضيره بعد الموافقة. بالهناء والشفاء!', errName:'يرجى إدخال اسمك', errPhone:'يرجى إدخال رقم هاتفك', errAddress:'يرجى إدخال عنوان التوصيل' },
  de: { invalidTitle:'Ungültiger Link', invalidMsg:'Bitte verwenden Sie den vom Betrieb geteilten Online-Bestelllink, um diese Seite zu erreichen.', errorTitle:'Menü konnte nicht geladen werden', errorMsg:'Etwas ist schiefgelaufen, bitte versuchen Sie es später erneut.', emptyMenu:'Derzeit sind keine Artikel verfügbar.', other:'Sonstiges', all:'Alle', subtitle:'Online-Bestellung — Abholung / Lieferung', sendCart:'Warenkorb senden →', items:'Artikel', checkoutTitle:'Bestellung bestätigen', pickupTab:'🥡 Abholung', deliveryTab:'🛵 Lieferung', total:'Gesamt', namePlaceholder:'Ihr vollständiger Name', phonePlaceholder:'Ihre Telefonnummer', addressPlaceholder:'Lieferadresse', sendOrder:'Bestellung senden', sending:'Wird gesendet...', back:'Zurück', successTitle:'Bestellung erhalten', successMsg:'Ihre Bestellung wurde an den Betrieb gesendet und wird nach Bestätigung zubereitet. Guten Appetit!', errName:'Bitte geben Sie Ihren Namen ein', errPhone:'Bitte geben Sie Ihre Telefonnummer ein', errAddress:'Bitte geben Sie die Lieferadresse ein' },
  ru: { invalidTitle:'Недействительная ссылка', invalidMsg:'Пожалуйста, используйте ссылку для онлайн-заказа, предоставленную заведением, чтобы попасть на эту страницу.', errorTitle:'Не удалось загрузить меню', errorMsg:'Что-то пошло не так, попробуйте позже.', emptyMenu:'Сейчас нет доступных позиций.', other:'Другое', all:'Все', subtitle:'Онлайн-заказ — Самовывоз / Доставка', sendCart:'Отправить заказ →', items:'позиций', checkoutTitle:'Подтвердить заказ', pickupTab:'🥡 Самовывоз', deliveryTab:'🛵 Доставка', total:'Итого', namePlaceholder:'Ваше полное имя', phonePlaceholder:'Ваш номер телефона', addressPlaceholder:'Адрес доставки', sendOrder:'Отправить заказ', sending:'Отправка...', back:'Назад', successTitle:'Заказ получен', successMsg:'Ваш заказ отправлен заведению и будет готовиться после подтверждения. Приятного аппетита!', errName:'Пожалуйста, введите ваше имя', errPhone:'Пожалуйста, введите ваш номер телефона', errAddress:'Пожалуйста, введите адрес доставки' },
};
function getLang(){
  try {
    const saved = localStorage.getItem('rys_siparis_lang');
    if(saved && I18N[saved]) return saved;
  } catch(e){}
  return 'tr';
}
function setLang(code){
  if(!I18N[code]) return;
  try { localStorage.setItem('rys_siparis_lang', code); } catch(e){}
  STATE.lang = code;
  document.documentElement.setAttribute('lang', code);
  document.documentElement.setAttribute('dir', code==='ar' ? 'rtl' : 'ltr');
  if(STATE.menu) renderMenu(); else init();
}
function t(key){ return (I18N[STATE.lang||'tr'] && I18N[STATE.lang||'tr'][key]) || I18N.tr[key] || key; }
STATE.lang = getLang();
document.documentElement.setAttribute('lang', STATE.lang);
document.documentElement.setAttribute('dir', STATE.lang==='ar' ? 'rtl' : 'ltr');

function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function money(n){ return (Math.round((n||0)*100)/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' TL'; }
function langPickerHtml(){
  return `<div class="lang-picker">${LANGS.map(l => `<button type="button" class="lang-btn ${STATE.lang===l.code?'active':''}" ${act('setLang', l.code)}>${l.label}</button>`).join('')}</div>`;
}

function renderState(html){ document.getElementById('app').innerHTML = html; }

async function init(){
  if(!RESTAURANT_CODE){
    renderState(stateBoxHtml('⚠️', t('invalidTitle'), t('invalidMsg')));
    return;
  }
  const { data, error } = await sb.rpc('get_public_order_menu', { p_restaurant_code: RESTAURANT_CODE });
  if(error || !data){
    renderState(stateBoxHtml('⚠️', t('errorTitle'), (error && error.message) || t('errorMsg')));
    return;
  }
  STATE.menu = data;
  renderMenu();
  // Stok (kalan porsiyon / tükendi) anlık güncellensin: başka müşterilerin ve
  // restoranın siparişleri ve diğer sepetler düştükçe stok 3 sn'de bir ve sekmeye dönünce yenilenir.
  setInterval(refreshMenuStock, 3000);
  // Sepetteki ayırmalar dakikada bir tazelenir (süresi dolmasın; başkası almışsa adet düzeltilir).
  setInterval(() => { if(!document.hidden) Object.keys(STATE.cart || {}).forEach(syncCartHold); }, 60000);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) refreshMenuStock(); });
}
async function refreshMenuStock(force){
  // Ayırma isteği sürerken eski stok gelip ekrandaki (anında düşülmüş) değeri geri almasın.
  if(!force && HOLD_INFLIGHT > 0) return;
  if((!force && document.hidden) || !STATE.menu || !document.querySelector('.qty-btn, .sold-badge, #checkoutBg')) return;
  // Sadece {ürün id: kalan adet} çekilir (fotoğraflı tam menü her seferinde indirilmez).
  const { data, error } = await sb.rpc('get_public_order_stock', { p_restaurant_code: RESTAURANT_CODE });
  if(error || !data) return;
  // Cevap beklenirken yeni +/- basıldıysa bu stok bilgisi eskidir; ekrandaki güncel değer korunur.
  if(HOLD_INFLIGHT > 0) return;
  const products = STATE.menu.products || [];
  const ids = Object.keys(data);
  // Menüye ürün eklendi / kaldırıldıysa tam menü bir kez yeniden alınır.
  if(ids.length !== products.length || products.some(p => !(p.id in data))){
    const full = await sb.rpc('get_public_order_menu', { p_restaurant_code: RESTAURANT_CODE });
    if(full.error || !full.data) return;
    STATE.menu = full.data;
  } else {
    let changed = false;
    products.forEach(p => { if(p.max_qty !== data[p.id]){ p.max_qty = data[p.id]; changed = true; } });
    if(!changed) return;
  }
  const maxById = {};
  (STATE.menu.products || []).forEach(p => { maxById[p.id] = p.max_qty; });
  let trimmed = false;
  Object.keys(STATE.cart || {}).forEach(id => {
    const m = maxById[id];
    // max_qty tüm sepetler düşülmüş kalandır; kendi sepetimiz sunucuda ayrılıdır.
    if(m === undefined){ trimmed = true; delete STATE.cart[id]; }
    else if(m != null && m < 0){ trimmed = true; const n = STATE.cart[id] + m; if(n > 0) STATE.cart[id] = n; else delete STATE.cart[id]; }
  });
  const ck = document.getElementById('checkoutBg');
  if(ck){ if(!trimmed) return; ck.remove(); }
  const y = window.scrollY;
  renderMenu();
  window.scrollTo(0, y);
  if(trimmed) alert(stockTxt('changed'));
}
function stateBoxHtml(icon, title, msg){
  return `<div class="u-langbar">${langPickerHtml()}</div>
    <div class="u-minh center-wrap"><div class="state-box"><div class="u-big-ic">${icon}</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(msg)}</p></div></div>`;
}

function selectSection(i){ STATE.sec = i; STATE.cat = ''; renderMenu(); window.scrollTo(0, 0); }
/* Alt menüler (istasyonun içindeki Çorbalar, Izgaralar…): seçili sekmenin ürünleri alt menü
   şeridiyle filtrelenir; "Tümü"nde alt menü başlıkları altında gruplu listelenir. */
function catGroups(items){
  const map = {}; const order = [];
  items.forEach(p => { const k = p.category || ''; if(!map[k]){ map[k] = { name: k, pos: p.cat_pos == null ? 9999 : p.cat_pos, items: [] }; order.push(map[k]); } map[k].items.push(p); });
  return order.sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || a.pos - b.pos);
}
function selectCat(c){ STATE.cat = c; renderMenu(); window.scrollTo(0, 0); }
function catBarHtml(groups){
  const named = groups.filter(g => g.name);
  if(!named.length) return '';
  const cur = STATE.cat && named.some(g => g.name === STATE.cat) ? STATE.cat : '';
  return `<div class="cat-bar">${[['', t('all')], ...named.map(g => [g.name, g.name])].map(([v, l]) => `<button type="button" class="${cur===v?'active':''}" ${act('selectCat', v)}>${escapeHtml(l)}</button>`).join('')}</div>`;
}

// Başlıklar otomatik olarak işletmenin menüleridir (menü sırası); menüsüz ürünler "Diğer"de.
function menuSections(products){
  const map = {}; const out = [];
  products.forEach(p => { const k = p.category || ''; if(!map[k]){ map[k] = { name: k || t('other'), sort: k ? (p.menu_sort == null ? 9998 : p.menu_sort) : 9999, items: [] }; out.push(map[k]); } map[k].items.push(p); });
  return out.sort((a, b) => a.sort - b.sort);
}
function renderMenu(){
  const m = STATE.menu;
  const products = m.products || [];
  if(products.length===0){
    renderState(headerHtml() + '<main><p class="empty-msg">'+escapeHtml(t('emptyMenu'))+'</p></main>');
    return;
  }
  const sections = menuSections(products);
  // Üstteki başlıklar sekme gibi çalışır: yalnızca seçilen başlığın ürünleri listelenir.
  if(STATE.sec == null || STATE.sec >= sections.length) STATE.sec = 0;
  const tabs = sections.length > 1 ? `<nav class="sec-tabs"><div class="sec-tabs-in">${sections.map((sec, i) => `<button type="button" class="${i===STATE.sec?'active':''}" ${act('selectSection', i)}>${escapeHtml(sec.name)}</button>`).join('')}</div></nav>` : '';
  const shown = sections.length > 1 ? [sections[STATE.sec]] : sections;
  const cardsHtml = (list) => list.map(p => {
      const sold = p.max_qty===0 && !STATE.cart[p.id];
      return `
      <div class="product-card ${sold?'sold-out':''}">
        <div class="product-media">${p.image ? `<img class="product-img" src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy" ${act('zoomProductImage', p.image)}>` : '🍽️'}
          ${sold ? `<span class="sold-badge">${escapeHtml(stockTxt('sold'))}</span>` : ''}</div>
        <div class="product-body">
          <div class="product-name">${escapeHtml(p.name)}</div>${p.description ? `<div class="product-desc">${escapeHtml(p.description)}</div>` : ''}
          <div class="product-price" data-price="${p.id}">${productPriceHtml(p)}</div>
        </div>
        <div class="product-foot">${sold ? '' : `<div class="qty"><button class="qty-btn" ${act('stepCart', p.id, -1)}>-</button>
          <span class="qty-val" data-qty="${p.id}">${STATE.cart[p.id]||0}</span>
          <button class="qty-btn" data-plus="${p.id}" ${p.max_qty===0 ? 'disabled' : ''} ${act('stepCart', p.id, 1)}>+</button></div>`}</div>
      </div>`; }).join('');
  const body = shown.map(sec => `<div class="station-title">${escapeHtml(sec.name)}</div><div class="product-grid">${cardsHtml(sec.items)}</div>`).join('');
  renderState(headerHtml() + tabs + `<main>${body}</main>
    <div class="cartbar" id="cartbar">
      <div class="cartbar-row">
        <span class="cartbar-total" id="cartTotal">${money(0)}</span>
        <button ${act('openCheckout')}>${escapeHtml(t('sendCart'))}</button>
      </div>
    </div>`);
  updateCartBar();
}
const TRUST_I18N = {
  tr: { verified:'✓ Doğrulanmış işletme', safety:'🔒 Bu sayfa hiçbir zaman kart, şifre veya kimlik bilgisi istemez. Ödemeyi işletme personeline yapın. Adres çubuğunda peyktan.com olduğundan emin olun.' },
  en: { verified:'✓ Verified business', safety:'🔒 This page never asks for card, password or ID details. Pay the restaurant staff directly. Make sure the address bar shows peyktan.com.' },
  ar: { verified:'✓ نشاط تجاري موثّق', safety:'🔒 هذه الصفحة لا تطلب أبدًا بيانات البطاقة أو كلمة المرور أو الهوية. ادفع لموظفي المطعم مباشرة. تأكد من أن شريط العنوان يعرض peyktan.com.' },
  de: { verified:'✓ Verifiziertes Unternehmen', safety:'🔒 Diese Seite fragt niemals nach Karten-, Passwort- oder Ausweisdaten. Bezahlen Sie direkt beim Personal. Achten Sie darauf, dass in der Adressleiste peyktan.com steht.' },
  ru: { verified:'✓ Проверенное заведение', safety:'🔒 Эта страница никогда не запрашивает данные карты, пароли или документы. Оплачивайте напрямую персоналу. Убедитесь, что в адресной строке указан peyktan.com.' }
};
function trt(k){ return (TRUST_I18N[STATE.lang] || TRUST_I18N.tr)[k] || TRUST_I18N.tr[k]; }
function trustHtml(){
  const m = STATE.menu || {};
  return `<div class="u-trust">
    ${m.restaurant_verified ? `<div class="u-trust-ok">${escapeHtml(trt('verified'))}${m.restaurant_title ? ' · '+escapeHtml(m.restaurant_title) : ''}</div>` : ''}
    ${m.restaurant_address ? `<div class="u-mb4">📍 ${escapeHtml(m.restaurant_address)}</div>` : ''}
    <div>${escapeHtml(trt('safety'))}</div>
  </div>`;
}
function headerHtml(){
  const m = STATE.menu;
  return `<header>
    <img src="/assets/images/logo.webp" alt="Peyktan">
    <div class="titles"><h1>${escapeHtml(m.restaurant_name)}</h1><p>${escapeHtml(t('subtitle'))}</p></div>
    ${langPickerHtml()}
  </header>` + trustHtml();
}
const STOCK_I18N = { sold: {"tr": "Tükendi", "en": "Sold out", "ar": "نفد", "de": "Ausverkauft", "ru": "Нет в наличии"}, changed: {"tr": "Bazı ürünlerin stoğu azaldı, sepetiniz güncellendi.", "en": "Some items are running low; your cart was updated.", "ar": "انخفض مخزون بعض المنتجات وتم تحديث سلتك.", "de": "Einige Artikel sind knapp; Ihr Warenkorb wurde aktualisiert.", "ru": "Некоторых товаров стало меньше, корзина обновлена."}, left: {"tr": "Son {n}", "en": "{n} left", "ar": "متبقي {n}", "de": "Noch {n}", "ru": "Осталось {n}"}, allIn: {"tr": "Kalanların hepsi sepetinizde", "en": "All remaining are in your cart", "ar": "كل المتبقي في سلتك", "de": "Alle restlichen im Warenkorb", "ru": "Все оставшиеся в корзине"} };
function stockTxt(k, n){ const d = STOCK_I18N[k]; return (d[STATE.lang||'tr'] || d.tr).replace('{n}', n); }
// Seçilebilecek en fazla adet: herkese kalan + kendi sepetimizde zaten ayrılmış olan.
function productPriceHtml(p){
  if(p.max_qty === 0 && STATE.cart[p.id]) return money(p.price) + ` · <span class="stock-left">${escapeHtml(stockTxt('allIn'))}</span>`;
  return money(p.price) + (p.max_qty!=null && p.max_qty>0 && p.max_qty<=5 ? ` · <span class="stock-left">${escapeHtml(stockTxt('left', p.max_qty))}</span>` : '');
}
// Kalan adet etiketi sunucu cevabı beklenmeden anında güncellenir.
function updateProductStockLabel(productId){
  const p = ((STATE.menu||{}).products||[]).find(x => x.id===productId); if(!p) return;
  document.querySelectorAll('[data-price="'+productId+'"]').forEach(el => el.innerHTML = productPriceHtml(p));
  // Kalanın hepsi sepetteyse '+' pasif olur (daha fazla eklenemez).
  document.querySelectorAll('[data-plus="'+productId+'"]').forEach(b => { b.disabled = p.max_qty === 0; });
}
let HOLD_INFLIGHT = 0;
function maxQtyOf(productId){ const p = ((STATE.menu||{}).products||[]).find(x => x.id===productId); return p && p.max_qty != null ? Math.max(0, p.max_qty) + (STATE.cart[productId]||0) : 20; }
const CLIENT_ID = (() => { try{ let c = localStorage.getItem('peyktan_cart_client'); if(!c){ c = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('peyktan_cart_client', c); } return c; }catch(e){ return 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36); } })();
/* Sepetteki adet sunucuda ayrılır (15 dk); böylece diğer müşterilerin ekranında kalan adet anında düşer.
   Hızlı art arda +/- basışlarında istekler sunucuya sırasız varıp yanlış adedi ayırabiliyordu;
   bu yüzden her ürün için aynı anda tek istek gider, biterken adet değiştiyse en güncel adet yeniden gönderilir. */
const HOLD_BUSY = {};
async function syncCartHold(productId){
  if(HOLD_BUSY[productId]){ HOLD_BUSY[productId] = 'again'; return; }
  HOLD_BUSY[productId] = true;
  HOLD_INFLIGHT++;
  let data, error, want;
  try{
    do {
      if(HOLD_BUSY[productId] === 'again') HOLD_BUSY[productId] = true;
      want = STATE.cart[productId] || 0;
      ({ data, error } = await sb.rpc('set_public_cart_hold', { p_restaurant_code: RESTAURANT_CODE, p_client: CLIENT_ID, p_product_id: productId, p_qty: want }));
    } while(HOLD_BUSY[productId] === 'again' || (!error && want !== (STATE.cart[productId] || 0)));
  } finally { HOLD_INFLIGHT--; delete HOLD_BUSY[productId]; }
  if(error) return;
  if(typeof data === 'number' && data < want){
    if(data > 0) STATE.cart[productId] = data; else delete STATE.cart[productId];
    document.querySelectorAll('[data-qty="'+productId+'"]').forEach(el => el.textContent = data);
    updateCartBar();
    alert(stockTxt('changed'));
  }
  // Başka bir ürünün ayırması sürerken tazeleme yapılmaz; o da bitince kendisi tazeler.
  if(HOLD_INFLIGHT === 0) refreshMenuStock(true);
}
function stepCart(productId, delta){
  // Stokta kalandan fazlası seçilemez (bkz. max_qty: hammadde/ürün stoğu).
  const prev = STATE.cart[productId]||0;
  const next = Math.max(0, Math.min(20, maxQtyOf(productId), prev + delta));
  if(next===0) delete STATE.cart[productId]; else STATE.cart[productId] = next;
  // max_qty, tüm sepetler (bizimki dahil) düşülmüş kalandır: kendi değişikliğimiz hemen yansıtılır,
  // sunucudaki ayırma birkaç yüz ms sonra aynı sonucu doğrular.
  const p = ((STATE.menu||{}).products||[]).find(x => x.id===productId);
  if(p && p.max_qty != null){ p.max_qty -= (next - prev); updateProductStockLabel(productId); }
  document.querySelectorAll('[data-qty="'+productId+'"]').forEach(el => el.textContent = next);
  updateCartBar();
  syncCartHold(productId);
}
function updateCartBar(){
  const bar = document.getElementById('cartbar'); if(!bar) return;
  const ids = Object.keys(STATE.cart);
  if(ids.length===0){ bar.classList.remove('show'); return; }
  bar.classList.add('show');
  const products = STATE.menu.products || [];
  let total = 0;
  ids.forEach(id => {
    const p = products.find(x => x.id===id);
    if(p) total += p.price * STATE.cart[id];
  });
  document.getElementById('cartTotal').textContent = money(total) + ' · ' + ids.reduce((s,id)=>s+STATE.cart[id],0) + ' ' + t('items');
}
function openCheckout(){
  const ids = Object.keys(STATE.cart);
  if(ids.length===0) return;
  const products = STATE.menu.products || [];
  const rows = ids.map(id => {
    const p = products.find(x => x.id===id);
    return p ? { p, qty: STATE.cart[id] } : null;
  }).filter(Boolean);
  const total = rows.reduce((s,r) => s+r.p.price*r.qty, 0);
  const bg = document.createElement('div');
  bg.id = 'checkoutBg';
  bg.className = 'modal-bg';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div class="modal">
    <h2>${escapeHtml(t('checkoutTitle'))}</h2>
    <div class="order-type-tabs">
      <div class="order-type-tab ${STATE.orderType==='pickup'?'active':''}" id="otPickup" ${act('setOrderType', 'pickup')}>${escapeHtml(t('pickupTab'))}</div>
      <div class="order-type-tab ${STATE.orderType==='delivery'?'active':''}" id="otDelivery" ${act('setOrderType', 'delivery')}>${escapeHtml(t('deliveryTab'))}</div>
    </div>
    ${rows.map(r => `<div class="item-row"><span>${r.qty}x ${escapeHtml(r.p.name)}</span><span>${money(r.p.price*r.qty)}</span></div>`).join('')}
    <div class="u-total item-row"><span>${escapeHtml(t('total'))}</span><span>${money(total)}</span></div>
    <input class="u-mt14" id="ckName" placeholder="${escapeHtml(t('namePlaceholder'))}">
    <input id="ckPhone" type="tel" placeholder="${escapeHtml(t('phonePlaceholder'))}">
    <input id="ckAddress" placeholder="${escapeHtml(t('addressPlaceholder'))}" ${STATE.orderType==='delivery'?'':'hidden'}>
    <div class="err" id="ckErr"></div>
    <button class="primary" id="ckSendBtn" ${act('sendPublicOrder')}>${escapeHtml(t('sendOrder'))}</button>
    <button class="ghost" ${act('removeEl','checkoutBg')}>${escapeHtml(t('back'))}</button>
  </div>`;
  document.body.appendChild(bg);
}
function setOrderType(type){
  STATE.orderType = type;
  const pickupTab = document.getElementById('otPickup');
  const deliveryTab = document.getElementById('otDelivery');
  if(pickupTab) pickupTab.classList.toggle('active', type==='pickup');
  if(deliveryTab) deliveryTab.classList.toggle('active', type==='delivery');
  const addrInput = document.getElementById('ckAddress');
  if(addrInput) addrInput.hidden = type!=='delivery';
}
async function sendPublicOrder(){
  const ids = Object.keys(STATE.cart);
  const items = ids.map(id => ({ product_id: id, qty: STATE.cart[id] }));
  const name = document.getElementById('ckName').value.trim();
  const phone = document.getElementById('ckPhone').value.trim();
  const address = document.getElementById('ckAddress').value.trim();
  const btn = document.getElementById('ckSendBtn');
  const errEl = document.getElementById('ckErr');
  errEl.textContent = '';
  if(!name){ errEl.textContent = t('errName'); return; }
  if(!phone){ errEl.textContent = t('errPhone'); return; }
  if(STATE.orderType==='delivery' && !address){ errEl.textContent = t('errAddress'); return; }
  btn.disabled = true; btn.textContent = t('sending');
  const { error } = await sb.rpc('submit_public_order', {
    p_restaurant_code: RESTAURANT_CODE, p_order_type: STATE.orderType, p_customer_name: name,
    p_customer_phone: phone, p_delivery_address: STATE.orderType==='delivery' ? address : null, p_items: items, p_client_id: CLIENT_ID
  });
  btn.disabled = false; btn.textContent = t('sendOrder');
  if(error){ errEl.textContent = error.message; refreshMenuStock(); return; }
  STATE.cart = {};
  const bg = document.getElementById('checkoutBg'); if(bg) bg.remove();
  renderState(stateBoxHtml('✅', t('successTitle'), t('successMsg')));
}
init();

// Ürün fotoğrafına dokununca tam ekran büyük gösterilir; tekrar dokununca kapanır.
function zoomProductImage(src){
  if(!src) return;
  const ov = document.createElement('div'); ov.className = 'img-zoom';
  const img = document.createElement('img'); img.src = src; img.alt = '';
  ov.appendChild(img);
  ov.onclick = () => ov.remove();
  document.body.appendChild(ov);
}
