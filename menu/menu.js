const SUPABASE_URL = 'https://dveybagnrgofxkqangvo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const QR_TOKEN = new URLSearchParams(window.location.search).get('t');
const STATE = { menu: null, cart: {} };

/* Çok dilli QR menü: ürün adları restoranın girdiği çevirilerden gelir
   (bkz. app/index.html > Ayarlar > Ürünler > 🌐 Çeviri, get_public_menu'nün
   döndürdüğü name_translations), arayüz metinleri ise burada sabit -
   seçilen dil tarayıcıda hatırlanır (localStorage), her masada/ziyarette
   tekrar sorulmaz. */
const LANGS = [
  { code:'tr', label:'TR' },
  { code:'en', label:'EN' },
  { code:'ar', label:'AR' },
  { code:'de', label:'DE' },
  { code:'ru', label:'RU' },
];
const I18N = {
  tr: { invalidTitle:'Geçersiz Bağlantı', invalidMsg:'Bu sayfaya masadaki QR kodu okutarak ulaşmalısınız.', errorTitle:'Menü Yüklenemedi', errorMsg:'Bir hata oluştu, lütfen personelden yardım isteyin.', emptyMenu:'Şu anda menüde satışa açık ürün yok.', other:'Diğer', all:'Tümü', sendCart:'Sepeti Gönder →', items:'ürün', checkoutTitle:'Siparişi Onayla', total:'Toplam', namePlaceholder:'Adınız (opsiyonel)', sendRequest:'İsteği Gönder', sending:'Gönderiliyor...', back:'Geri Dön', successTitle:'İsteğiniz Alındı', successMsg:'Siparişiniz personelimize iletildi, onaylandığında hazırlanmaya başlanacak. Afiyet olsun!', privacyNotice:'Adınızı girerseniz, siparişinizi iletmek amacıyla <a href="/gizlilik/" target="_blank" rel="noopener">Gizlilik Politikamız</a> kapsamında işlenir.' },
  en: { invalidTitle:'Invalid Link', invalidMsg:'Please scan the QR code on your table to reach this page.', errorTitle:'Menu Could Not Load', errorMsg:'Something went wrong, please ask a staff member for help.', emptyMenu:'There are no items available right now.', other:'Other', all:'All', sendCart:'Send Cart →', items:'items', checkoutTitle:'Confirm Order', total:'Total', namePlaceholder:'Your name (optional)', sendRequest:'Send Request', sending:'Sending...', back:'Go Back', successTitle:'Request Received', successMsg:'Your order has been sent to our staff and will be prepared once approved. Enjoy your meal!', privacyNotice:'If you enter your name, it will be processed to deliver your order under our <a href="/gizlilik/" target="_blank" rel="noopener">Privacy Policy</a>.' },
  ar: { invalidTitle:'رابط غير صالح', invalidMsg:'يرجى مسح رمز QR الموجود على طاولتك للوصول إلى هذه الصفحة.', errorTitle:'تعذر تحميل القائمة', errorMsg:'حدث خطأ ما، يرجى طلب المساعدة من أحد الموظفين.', emptyMenu:'لا توجد عناصر متاحة حاليًا.', other:'أخرى', all:'الكل', sendCart:'إرسال السلة ←', items:'عناصر', checkoutTitle:'تأكيد الطلب', total:'المجموع', namePlaceholder:'اسمك (اختياري)', sendRequest:'إرسال الطلب', sending:'جارٍ الإرسال...', back:'رجوع', successTitle:'تم استلام طلبك', successMsg:'تم إرسال طلبك إلى فريقنا وسيتم تحضيره بعد الموافقة. بالهناء والشفاء!', privacyNotice:'إذا أدخلت اسمك، فستتم معالجته لتوصيل طلبك بموجب <a href="/gizlilik/" target="_blank" rel="noopener">سياسة الخصوصية</a> الخاصة بنا.' },
  de: { invalidTitle:'Ungültiger Link', invalidMsg:'Bitte scannen Sie den QR-Code auf Ihrem Tisch, um diese Seite zu erreichen.', errorTitle:'Menü konnte nicht geladen werden', errorMsg:'Etwas ist schiefgelaufen, bitte fragen Sie das Personal um Hilfe.', emptyMenu:'Derzeit sind keine Artikel verfügbar.', other:'Sonstiges', all:'Alle', sendCart:'Warenkorb senden →', items:'Artikel', checkoutTitle:'Bestellung bestätigen', total:'Gesamt', namePlaceholder:'Ihr Name (optional)', sendRequest:'Anfrage senden', sending:'Wird gesendet...', back:'Zurück', successTitle:'Anfrage erhalten', successMsg:'Ihre Bestellung wurde an unser Personal gesendet und wird nach Bestätigung zubereitet. Guten Appetit!', privacyNotice:'Wenn Sie Ihren Namen eingeben, wird er zur Zustellung Ihrer Bestellung gemäß unserer <a href="/gizlilik/" target="_blank" rel="noopener">Datenschutzrichtlinie</a> verarbeitet.' },
  ru: { invalidTitle:'Недействительная ссылка', invalidMsg:'Пожалуйста, отсканируйте QR-код на вашем столике, чтобы попасть на эту страницу.', errorTitle:'Не удалось загрузить меню', errorMsg:'Что-то пошло не так, обратитесь за помощью к персоналу.', emptyMenu:'Сейчас нет доступных позиций.', other:'Другое', all:'Все', sendCart:'Отправить заказ →', items:'позиций', checkoutTitle:'Подтвердить заказ', total:'Итого', namePlaceholder:'Ваше имя (необязательно)', sendRequest:'Отправить запрос', sending:'Отправка...', back:'Назад', successTitle:'Запрос получен', successMsg:'Ваш заказ передан персоналу и будет готовиться после подтверждения. Приятного аппетита!', privacyNotice:'Если вы укажете своё имя, оно будет обработано для доставки заказа согласно нашей <a href="/gizlilik/" target="_blank" rel="noopener">Политике конфиденциальности</a>.' },
};
function getLang(){
  try {
    const saved = localStorage.getItem('rys_menu_lang');
    if(saved && I18N[saved]) return saved;
  } catch(e){}
  return 'tr';
}
function setLang(code){
  if(!I18N[code]) return;
  try { localStorage.setItem('rys_menu_lang', code); } catch(e){}
  STATE.lang = code;
  document.documentElement.setAttribute('lang', code);
  document.documentElement.setAttribute('dir', code==='ar' ? 'rtl' : 'ltr');
  if(STATE.menu) renderMenu(); else init();
}
function t(key){ return (I18N[STATE.lang||'tr'] && I18N[STATE.lang||'tr'][key]) || I18N.tr[key] || key; }
function productName(p){
  if(STATE.lang==='tr' || !STATE.lang) return p.name;
  return (p.name_translations && p.name_translations[STATE.lang]) || p.name;
}
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
  if(!QR_TOKEN){
    renderState(stateBoxHtml('⚠️', t('invalidTitle'), t('invalidMsg')));
    return;
  }
  const { data, error } = await sb.rpc('get_public_menu', { p_qr_token: QR_TOKEN });
  if(error || !data){
    renderState(stateBoxHtml('⚠️', t('errorTitle'), (error && error.message) || t('errorMsg')));
    return;
  }
  STATE.menu = data;
  renderMenu();
  checkTableReview();
  setInterval(checkTableReview, 60000);
  // Stok anlık: diğer masaların sepetleri/siparişleri düştükçe menü 5 sn'de bir yenilenir;
  // sepetteki ayırmalar dakikada bir tazelenir.
  setInterval(refreshMenuStock, 5000);
  setInterval(() => { if(!document.hidden) Object.keys(STATE.cart || {}).forEach(syncCartHold); }, 60000);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) refreshMenuStock(); });
}
async function refreshMenuStock(force){
  if((!force && document.hidden) || !STATE.menu || !document.querySelector('.qty-btn, .sold-badge, #checkoutBg')) return;
  const { data, error } = await sb.rpc('get_public_menu', { p_qr_token: QR_TOKEN });
  if(error || !data) return;
  if(JSON.stringify(data) === JSON.stringify(STATE.menu)) return;
  STATE.menu = data;
  const maxById = {};
  (data.products || []).forEach(p => { maxById[p.id] = p.max_qty; });
  let trimmed = false;
  Object.keys(STATE.cart || {}).forEach(id => {
    const m = maxById[id];
    if(m != null && m < 0){ trimmed = true; const n = STATE.cart[id] + m; if(n > 0) STATE.cart[id] = n; else delete STATE.cart[id]; }
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
function selectSection(i){ STATE.sec = i; STATE.cat = ''; renderMenu(); window.scrollTo(0, 0); }
// Başlıklar otomatik olarak işletmenin menüleridir (menü sırası); menüsüz ürünler "Diğer"de.
function menuSections(products){
  const map = {}; const out = [];
  products.forEach(p => { const k = p.category || ''; if(!map[k]){ map[k] = { name: k || t('other'), sort: k ? (p.menu_sort == null ? 9998 : p.menu_sort) : 9999, items: [] }; out.push(map[k]); } map[k].items.push(p); });
  return out.sort((a, b) => a.sort - b.sort);
}
function renderMenu(){
  // İşletmede "QR Menü ile Müşteri Siparişi" eklentisi yoksa menü sadece
  // görüntülenir; sepet/sipariş arayüzü gösterilmez.
  const canOrder = STATE.menu && STATE.menu.qr_ordering_enabled !== false;
  const m = STATE.menu;
  const products = m.products || [];
  if(products.length===0){
    renderState(headerHtml() + '<main><p class="empty-msg">'+escapeHtml(t('emptyMenu'))+'</p></main>');
    return;
  }
  // Menüler sekme olarak (işletmenin menü sırası).
  const sections = menuSections(products);
  // 0 = Tümü (bütün menüler başlıklarıyla alt alta), 1.. = tek menü.
  if(STATE.sec == null || STATE.sec > sections.length) STATE.sec = 0;
  const tabs = sections.length > 1 ? `<nav class="sec-tabs"><div class="sec-tabs-in">${[t('all'), ...sections.map(sec => sec.name)].map((name, i) => `<button type="button" class="${i===STATE.sec?'active':''}" ${act('selectSection', i)}>${escapeHtml(name)}</button>`).join('')}</div></nav>` : '';
  const shown = (sections.length > 1 && STATE.sec > 0) ? [sections[STATE.sec - 1]] : sections;
  const cardHtml = (list) => list.map(p => `
      <div class="product-card ${p.max_qty===0 && !STATE.cart[p.id]?'sold-out':''}">
        ${p.image ? `<img class="product-thumb" src="${p.image}" alt="" loading="lazy" ${act('zoomProductImage', p.image)}>` : ''}
        <div class="product-name">${escapeHtml(productName(p))}${p.description ? `<div class="product-desc">${escapeHtml(p.description)}</div>` : ''}<div class="product-price">${money(p.price)}${p.max_qty!=null && p.max_qty>0 && p.max_qty<=5 ? ` · <span class="stock-left">${escapeHtml(stockTxt('left', p.max_qty))}</span>` : ''}</div></div>
        ${p.max_qty===0 && !STATE.cart[p.id] ? `<span class="sold-badge">${escapeHtml(stockTxt('sold'))}</span>` : canOrder ? `<button class="qty-btn" ${act('stepCart', p.id, -1)}>-</button>
        <span class="qty-val" id="qty_${p.id}">${STATE.cart[p.id]||0}</span>
        <button class="qty-btn" ${act('stepCart', p.id, 1)}>+</button>` : ''}
      </div>`).join('');
  const body = shown.map(sec => `<div class="station-title">${escapeHtml(sec.name)}</div>${cardHtml(sec.items)}`).join('');
  renderState(headerHtml() + tabs + `<main>${body}</main>
    ${!canOrder ? '' : `<div class="cartbar" id="cartbar">
      <div class="cartbar-row">
        <span class="cartbar-total" id="cartTotal">${money(0)}</span>
        <button ${act('openCheckout')}>${escapeHtml(t('sendCart'))}</button>
      </div>
    </div>`}`);
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
const WAITER_I18N = {
  tr: { title:'Garson Çağır', order:'🙋 Sipariş için', payment:'💳 Hesap / Ödeme için', ok:'Garsonunuz geliyor, teşekkürler!', already:'Garsonunuz zaten çağrıldı, birazdan yanınızda.' },
  en: { title:'Call Waiter', order:'🙋 To order', payment:'💳 For the bill', ok:'Your waiter is on the way, thank you!', already:'Your waiter has already been called.' },
  ar: { title:'استدعاء النادل', order:'🙋 للطلب', payment:'💳 للحساب', ok:'النادل في الطريق إليك، شكراً!', already:'تم استدعاء النادل بالفعل.' },
  de: { title:'Kellner rufen', order:'🙋 Zum Bestellen', payment:'💳 Zum Bezahlen', ok:'Ihr Kellner kommt gleich, danke!', already:'Ihr Kellner wurde bereits gerufen.' },
  ru: { title:'Вызвать официанта', order:'🙋 Сделать заказ', payment:'💳 Попросить счёт', ok:'Официант уже идёт, спасибо!', already:'Официант уже вызван.' },
};
function wt(key){ return (WAITER_I18N[STATE.lang||'tr']||WAITER_I18N.tr)[key] || WAITER_I18N.tr[key]; }
function waiterHtml(){
  return `<div class="waiter-bar"><span>${escapeHtml(wt('title'))}</span>
    <div class="waiter-btns"><button type="button" ${act('callWaiter', 'order', '$this')}>${escapeHtml(wt('order'))}</button>
    <button type="button" ${act('callWaiter', 'payment', '$this')}>${escapeHtml(wt('payment'))}</button>
    <button type="button" class="bill-btn" ${act('openBill')}>${escapeHtml(bt('bill'))}</button></div></div>`;
}
/* Hesabım: masanın açık hesabını görme ve (işletme online ödemeyi açtıysa) kartla ödeme. */
const BILL_I18N = {
  tr: { bill:'🧾 Hesabım', title:'Masa hesabı', empty:'Bu masada açık hesap yok.', total:'Toplam', payable:'Ödenebilir', pay:'💳 Kartla öde', pending:'{n} ürün henüz hazırlanıyor; hazır olunca ödenebilir.', nopay:'Ödeme için garsonu çağırabilirsiniz.', paid:'Ödemeniz alındı, teşekkür ederiz! 🙏', fail:'Ödeme tamamlanamadı. Tekrar deneyebilir ya da garsonu çağırabilirsiniz.', close:'Kapat' },
  en: { bill:'🧾 My bill', title:'Table bill', empty:'No open bill at this table.', total:'Total', payable:'Payable', pay:'💳 Pay by card', pending:'{n} item(s) still being prepared; you can pay once ready.', nopay:'Please call your waiter to pay.', paid:'Payment received, thank you! 🙏', fail:'Payment could not be completed. Please try again or call your waiter.', close:'Close' },
};
function bt(k){ return (BILL_I18N[STATE.lang||'tr'] || BILL_I18N.en)[k] || BILL_I18N.tr[k]; }
const tl = n => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
async function openBill(){
  const { data, error } = await sb.rpc('get_table_bill', { p_qr_token: QR_TOKEN });
  if(error){ alert(error.message); return; }
  const d = data || {}, items = d.items || [];
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'billBg';
  bg.innerHTML = `<div class="modal"><h2>${escapeHtml(bt('title'))} · ${escapeHtml(d.table || '')}</h2>
    ${items.length ? items.map(i => `<div class="item-row"><span>${i.qty}× ${escapeHtml(i.name)}${i.ready ? '' : ' ⏳'}</span><b>${tl(i.qty * i.price)}</b></div>`).join('') : `<p>${escapeHtml(bt('empty'))}</p>`}
    ${items.length ? `<div class="item-row bill-total"><span>${escapeHtml(bt('total'))}</span><b>${tl(d.total)}</b></div>` : ''}
    ${d.pending ? `<p class="bill-note">${escapeHtml(bt('pending').replace('{n}', d.pending))}</p>` : ''}
    ${items.length && d.pay && d.pay.enabled && d.payable > 0 ? `<button type="button" class="bill-pay" ${act('payBill', '$this')}>${escapeHtml(bt('pay'))} · ${tl(d.payable)}</button>` : items.length ? `<p class="bill-note">${escapeHtml(bt('nopay'))}</p>` : ''}
    <button type="button" class="bill-close" ${act('closeBill')}>${escapeHtml(bt('close'))}</button></div>`;
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.body.appendChild(bg);
}
function closeBill(){ const b = document.getElementById('billBg'); if(b) b.remove(); }
async function payBill(btn){
  if(btn) btn.disabled = true;
  const { data: pid, error } = await sb.rpc('start_table_payment', { p_qr_token: QR_TOKEN });
  if(error){ alert(error.message); if(btn) btn.disabled = false; return; }
  try{
    const r = await fetch('/api/order-pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_id: pid }) });
    const j = await r.json();
    if(j.url){ location.href = j.url; return; }
    alert(j.error || bt('fail'));
  }catch(e){ alert(bt('fail')); }
  if(btn) btn.disabled = false;
}
async function callWaiter(kind, btn){
  if(btn) btn.disabled = true;
  const { data, error } = await sb.rpc('call_waiter', { p_qr_token: QR_TOKEN, p_kind: kind });
  setTimeout(() => { if(btn) btn.disabled = false; }, 8000);
  if(error){ alert(error.message); if(btn) btn.disabled = false; return; }
  alert(data && data.already ? wt('already') : wt('ok'));
}
function headerHtml(){
  const m = STATE.menu;
  return `<header>
    <img src="/assets/images/logo.webp" alt="Peyktan">
    <div class="titles"><h1>${escapeHtml(m.restaurant_name)}</h1><p>${escapeHtml(m.table_name)}</p></div>
    ${langPickerHtml()}
  </header>` + waiterHtml() + trustHtml();
}
const STOCK_I18N = { sold: {"tr": "Tükendi", "en": "Sold out", "ar": "نفد", "de": "Ausverkauft", "ru": "Нет в наличии"}, changed: {"tr": "Bazı ürünlerin stoğu azaldı, sepetiniz güncellendi.", "en": "Some items are running low; your cart was updated.", "ar": "انخفض مخزون بعض المنتجات وتم تحديث سلتك.", "de": "Einige Artikel sind knapp; Ihr Warenkorb wurde aktualisiert.", "ru": "Некоторых товаров стало меньше, корзина обновлена."}, left: {"tr": "Son {n}", "en": "{n} left", "ar": "متبقي {n}", "de": "Noch {n}", "ru": "Осталось {n}"} };
function stockTxt(k, n){ const d = STOCK_I18N[k]; return (d[STATE.lang||'tr'] || d.tr).replace('{n}', n); }
// Seçilebilecek en fazla adet: herkese kalan + kendi sepetimizde zaten ayrılmış olan.
function maxQtyOf(productId){ const p = ((STATE.menu||{}).products||[]).find(x => x.id===productId); return p && p.max_qty != null ? Math.max(0, p.max_qty) + (STATE.cart[productId]||0) : 20; }
const CLIENT_ID = (() => { try{ let c = localStorage.getItem('peyktan_cart_client'); if(!c){ c = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('peyktan_cart_client', c); } return c; }catch(e){ return 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36); } })();
let CART_HOLD_SEQ = {};
/* Sepetteki adet sunucuda ayrılır (15 dk); diğer masaların ekranında kalan adet anında düşer. */
async function syncCartHold(productId){
  const want = STATE.cart[productId] || 0;
  const seq = CART_HOLD_SEQ[productId] = (CART_HOLD_SEQ[productId] || 0) + 1;
  const { data, error } = await sb.rpc('set_qr_cart_hold', { p_qr_token: QR_TOKEN, p_client: CLIENT_ID, p_product_id: productId, p_qty: want });
  if(seq !== CART_HOLD_SEQ[productId] || error) return;
  if(typeof data === 'number' && data < want){
    if(data > 0) STATE.cart[productId] = data; else delete STATE.cart[productId];
    const el = document.getElementById('qty_'+productId); if(el) el.textContent = data;
    updateCartBar();
    alert(stockTxt('changed'));
  }
  refreshMenuStock(true);
}
function stepCart(productId, delta){
  // Stokta kalandan fazlası seçilemez (bkz. max_qty: hammadde/ürün stoğu).
  const next = Math.max(0, Math.min(20, maxQtyOf(productId), (STATE.cart[productId]||0) + delta));
  if(next===0) delete STATE.cart[productId]; else STATE.cart[productId] = next;
  const el = document.getElementById('qty_'+productId);
  if(el) el.textContent = next;
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
    ${rows.map(r => `<div class="item-row"><span>${r.qty}x ${escapeHtml(productName(r.p))}</span><span>${money(r.p.price*r.qty)}</span></div>`).join('')}
    <div class="u-total item-row"><span>${escapeHtml(t('total'))}</span><span>${money(total)}</span></div>
    <input class="u-mt14" id="ckName" placeholder="${escapeHtml(t('namePlaceholder'))}">
    <p class="u-fine muted">${t('privacyNotice')}</p>
    <div class="err" id="ckErr"></div>
    <button class="primary" id="ckSendBtn" ${act('sendCustomerOrder')}>${escapeHtml(t('sendRequest'))}</button>
    <button class="ghost" ${act('removeEl','checkoutBg')}>${escapeHtml(t('back'))}</button>
  </div>`;
  document.body.appendChild(bg);
}
async function sendCustomerOrder(){
  const ids = Object.keys(STATE.cart);
  const items = ids.map(id => ({ product_id: id, qty: STATE.cart[id] }));
  const name = document.getElementById('ckName').value.trim();
  const btn = document.getElementById('ckSendBtn');
  const errEl = document.getElementById('ckErr');
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = t('sending');
  const { error } = await sb.rpc('submit_customer_order_request', { p_qr_token: QR_TOKEN, p_customer_name: name||null, p_items: items, p_client_id: CLIENT_ID });
  btn.disabled = false; btn.textContent = t('sendRequest');
  if(error){ errEl.textContent = error.message; refreshMenuStock(true); return; }
  STATE.cart = {};
  const bg = document.getElementById('checkoutBg'); if(bg) bg.remove();
  renderState(stateBoxHtml('✅', t('successTitle'), t('successMsg')));
}
init();
// iyzico dönüşü: ödeme sonucu bildirilir ve adres temizlenir.
(function(){ const q = new URLSearchParams(location.search); if(q.get('paid') === '1' || q.get('payfail') === '1'){
  setTimeout(() => alert(q.get('paid') === '1' ? bt('paid') : bt('fail')), 400);
  q.delete('paid'); q.delete('payfail'); history.replaceState(null, '', location.pathname + '?' + q.toString()); } })();

// Ürün fotoğrafına dokununca büyük gösterilir; dokununca kapanır.
function zoomProductImage(src){
  if(!src) return;
  const ov = document.createElement('div'); ov.className = 'img-zoom';
  const img = document.createElement('img'); img.src = src; img.alt = '';
  ov.appendChild(img); ov.addEventListener('click', () => ov.remove());
  document.body.appendChild(ov);
}

/* Masa QR menüsünde en üstte "Bizi değerlendirin" bandı her zaman çıkar: açık hesap ya da son 2 saatte
   ödenmiş hesap varsa ona, yoksa masaya bağlı değerlendirmeye gider (değerlendirme yapılınca kaybolur). */
const RV_TXT = { tr: ['⭐ Bizi değerlendirmek ister misiniz?', 'Değerlendir'], en: ['⭐ Would you like to rate us?', 'Rate us'],
  ar: ['⭐ هل ترغب في تقييمنا؟', 'قيّمنا'], de: ['⭐ Möchten Sie uns bewerten?', 'Bewerten'], ru: ['⭐ Хотите оценить нас?', 'Оценить'] };
async function checkTableReview(){
  if(document.hidden) return;
  const { data } = await sb.rpc('get_table_review', { p_qr_token: QR_TOKEN });
  const old = document.getElementById('rvBanner');
  if(!data || !data.token){ if(old) old.remove(); return; }
  if(old) return;
  const tx = RV_TXT[STATE.lang] || RV_TXT.tr;
  const a = document.createElement('a');
  a.id = 'rvBanner'; a.className = 'rv-banner';
  a.href = '/degerlendirme/?t=' + encodeURIComponent(data.token);
  a.innerHTML = `<span>${escapeHtml(tx[0])}</span><b>${escapeHtml(tx[1])} →</b>`;
  document.body.prepend(a);
}
