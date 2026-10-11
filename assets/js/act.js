/* Peyktan - ortak olay dağıtıcısı (uygulama + site sayfaları).
   Güvenlik politikası satır içi JavaScript'e izin vermez ('unsafe-inline' yok);
   HTML'de satır içi olay kodu yerine data-click="fonksiyon" (+ data-click-args='[...]') kullanılır. */
function _actEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
/* ---- Satır içi kodsuz olay bağlama (güvenlik politikasından 'unsafe-inline'ı kaldırmak için) ----
   HTML'de satır içi olay kodu yerine:  <button ${act('fonksiyon', arg1, arg2)}>
   Değişim/giriş için:            <input ${actOn('change', 'fonksiyon', '$value')}>
   Yayılımı durdurmak için:       ${actStop('fonksiyon', arg)}
   Özel argümanlar: '$this' (öğe), '$value' (öğe değeri), '$checked', '$event', '$file' (seçilen ilk dosya).
   Merkezi dinleyici, çağrılacak fonksiyonu adından bulur; HTML'e JavaScript kodu yazılmaz. */
function actOn(ev, fn, args, stop){
  return ` data-${ev}="${_actEsc(fn)}"${args && args.length ? ` data-${ev}-args="${_actEsc(JSON.stringify(args))}"` : ''}${stop ? ` data-${ev}-stop="1"` : ''}`;
}
function act(fn, ...args){ return actOn('click', fn, args); }
function actStop(fn, ...args){ return actOn('click', fn, args, true); }
// Sık kullanılan küçük işlemler (eskiden satır içi yazılıyordu)
function removeEl(id){ const el = document.getElementById(id); if(el) el.remove(); }
(function(){
  const EVENTS = ['click', 'change', 'input', 'keydown', 'submit', 'dblclick', 'paste', 'drop'];
  const resolveArg = (a, el, e) => a === '$this' ? el : a === '$value' ? el.value : a === '$checked' ? el.checked : a === '$event' ? e : a === '$src' ? el.src : (typeof a === 'string' && a.startsWith('$data.')) ? el.dataset[a.slice(6)] : a === '$file' ? (el.files && el.files[0]) : a;
  EVENTS.forEach(ev => document.addEventListener(ev, (e) => {
    const el = e.target && e.target.closest ? e.target.closest(`[data-${ev}]`) : null;
    if(!el) return;
    const fn = window[el.getAttribute(`data-${ev}`)];
    if(typeof fn !== 'function') return;
    if(el.hasAttribute(`data-${ev}-stop`)) e.stopPropagation();
    if(ev === 'submit' || (el.tagName === 'A' && el.getAttribute('href') === '#')) e.preventDefault();
    let args = [];
    try{ args = JSON.parse(el.getAttribute(`data-${ev}-args`) || '[]'); }catch(_){}
    fn.apply(el, args.map(a => resolveArg(a, el, e)));
  }));
})();

// Biçim araç çubuğu gibi butonlarda tıklanınca odak (seçili metin) kaybolmasın.
document.addEventListener('mousedown', (e) => { if(e.target && e.target.closest && e.target.closest('[data-keep-focus]')) e.preventDefault(); });
function clearValue(el){ el.value = ''; }
// Sürükle-bırak alanı: dragover varsayılanı engellenmezse drop olayı gelmez.
document.addEventListener('dragover', (e) => { if(e.target && e.target.closest && e.target.closest('[data-allow-drop]')) e.preventDefault(); });
