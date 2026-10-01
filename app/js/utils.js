/* Genel yardımcı fonksiyonlar (escapeHtml, money, showToast, HTML
   sanitizer, yükleniyor overlay'i) - app/index.html'den çıkarıldı. api.js
   ve state.js gibi klasik bir <script src>, ES module değil. */
/* Sayfa geçişlerinde/veri beklenirken tam ekran marka logosu (splash
   ekranıyla birebir aynı görsel) gösterir - AMA SADECE bekleme belirli bir
   eşiği (varsayılan 1000ms) aşarsa; kısa süren (çoğu) istekte hiç
   görünmeden biter, "yanıp sönme" olmaz. beginLoadingWatch/endLoadingWatch
   çifti her zaman birlikte çağrılmalı (withLoadingOverlay bunu otomatik
   yapar); iç içe/çakışan çağrılar bir sayaçla (LOADING_WATCH_DEPTH) takip
   edilir ki bir view başka bir view'i beklerken erken gizlemesin. */
/* Arka plan polling fonksiyonlari (mutfak/sipariş/vardiya canlı yenileme)
   ağ hatalarını sessizce yutuyordu - tek seferlik bir hata (kısa bir WiFi
   dalgalanması) için her 2-5 saniyede bir uyarı göstermek gereksiz gürültü
   olur, ama ART ARDA çok sayıda başarısız deneme gerçek bir bağlantı
   sorununa işaret eder ve personelin haberi olmalı (aksi halde ekranın
   "canlı" göründüğünü sanıp aslında saatlerdir güncellenmeyen veriye
   bakabilirler). Her polling noktası kendi anahtarıyla çağırır; art arda
   eşiği aşınca BİR KEZ toast gösterilir, başarılı bir denemede sayaç ve
   "gösterildi" bayrağı sıfırlanır.
   */
let POLL_FAILURE_COUNTS = {};
let POLL_FAILURE_WARNED = {};
function reportPollResult(key, ok, threshold){
  if(ok){
    POLL_FAILURE_COUNTS[key] = 0;
    POLL_FAILURE_WARNED[key] = false;
    return;
  }
  POLL_FAILURE_COUNTS[key] = (POLL_FAILURE_COUNTS[key]||0) + 1;
  if(!POLL_FAILURE_WARNED[key] && POLL_FAILURE_COUNTS[key] >= (threshold||3)){
    POLL_FAILURE_WARNED[key] = true;
    showToast('⚠️ Bağlantı sorunu: veriler güncellenemiyor, internet bağlantınızı kontrol edin', 6000);
  }
}
let LOADING_WATCH_TIMER = null, LOADING_WATCH_SHOWN = false, LOADING_WATCH_DEPTH = 0;
function beginLoadingWatch(delayMs){
  LOADING_WATCH_DEPTH++;
  if(LOADING_WATCH_TIMER || LOADING_WATCH_SHOWN) return;
  LOADING_WATCH_TIMER = setTimeout(() => {
    LOADING_WATCH_TIMER = null;
    if(LOADING_WATCH_DEPTH<=0) return;
    LOADING_WATCH_SHOWN = true;
    const el = document.getElementById('loadingOverlay');
    if(el) el.classList.add('show');
  }, delayMs==null?1000:delayMs);
}
function endLoadingWatch(){
  LOADING_WATCH_DEPTH = Math.max(0, LOADING_WATCH_DEPTH-1);
  if(LOADING_WATCH_DEPTH>0) return;
  if(LOADING_WATCH_TIMER){ clearTimeout(LOADING_WATCH_TIMER); LOADING_WATCH_TIMER = null; }
  if(LOADING_WATCH_SHOWN){
    LOADING_WATCH_SHOWN = false;
    const el = document.getElementById('loadingOverlay');
    if(el) el.classList.remove('show');
  }
}
async function withLoadingOverlay(promise, delayMs){
  beginLoadingWatch(delayMs);
  try{ return await promise; }
  finally{ endLoadingWatch(); }
}

function money(n){ return (Math.round((n||0)*100)/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' TL'; }

/* Varsayılan olarak sağ üstte, yeni bildirimler altta birikerek duran bir
   bildirim yığını (position:'left' verilirse sol üstte ayrı bir yığın
   kullanılır - örn. mutfakta gecikmiş sipariş hatırlatmaları). Hata/uyarı
   (⚠️ ile başlayanlar) varsayılan olarak en az 1 dakika ekranda kalır,
   başarı bildirimleri (Kaydedildi vb.) kısa süre sonra kendiliğinden
   kaybolur; durationMs verilirse bu varsayılanın yerine geçer. */
/* Masaüstü uygulamasında (Electron), tarayıcının Web Push'undan bağımsız
   olarak, işletim sisteminin kendi bildirim merkezinden/köşesinden çıkan
   GERÇEK bir bildirim gösterir - Electron'un penceresi arka planda/simge
   durumunda bile görülebilsin diye. Web Push'un aksine gerçek bir "kapalı
   uygulamaya bildirim" değil (Electron'da uygulama tamamen kapalıyken zaten
   hiçbir kod çalışmıyor) - amacı sadece uygulama açıkken ekranda ondan
   habersizken (başka pencerenin arkasında, simge durumunda) fark edilmesini
   sağlamak. preload.js'teki window.electronAPI varlığıyla tarayıcıdan
   ayırt ediliyor.
   'Peyktan' başlıklı isletim sistemi bildirimi tiklaninca pencereyi one
   getirir (window.electronAPI.focusWindow) ve varsa onClick'i cagirir. */
function notifyDesktop(msg, onClick){
  if(!(window.electronAPI && window.electronAPI.isElectron)) return;
  if(!('Notification' in window)) return;
  const fire = () => {
    const n = new Notification('Peyktan', { body: msg, icon: '/assets/images/logo.webp' });
    n.onclick = () => {
      if(window.electronAPI.focusWindow) window.electronAPI.focusWindow();
      if(onClick) onClick();
    };
  };
  if(Notification.permission==='granted') fire();
  else if(Notification.permission!=='denied') Notification.requestPermission().then(p => { if(p==='granted') fire(); });
}
function showToast(msg, durationMs, position, onClick, nativeNotify){
  if(nativeNotify) notifyDesktop(msg, onClick);
  const isLeft = position==='left';
  const stackId = isLeft ? 'notifStackLeft' : 'notifStack';
  let stack = document.getElementById(stackId);
  if(!stack){
    stack = document.createElement('div');
    stack.id = stackId;
    stack.style.cssText = 'position:fixed;top:16px;'+(isLeft?'left':'right')+':16px;z-index:400;display:flex;flex-direction:column;gap:8px;max-width:340px;width:calc(100vw - 32px);';
    document.body.appendChild(stack);
  }
  const isWarning = msg.indexOf('⚠️')===0 || msg.indexOf('⏰')===0;
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--panel);border:1px solid var(--border);border-left:4px solid '+(isWarning?'var(--red)':'var(--green)')+';border-radius:10px;padding:10px 30px 10px 14px;font-size:13px;line-height:1.4;box-shadow:0 4px 16px rgba(0,0,0,.35);position:relative;animation:'+(isLeft?'notifSlideInLeft':'notifSlideIn')+' .18s ease;'+(onClick?'cursor:pointer;':'');
  card.textContent = msg;
  if(onClick) card.onclick = () => { card.remove(); onClick(); };
  const closeBtn = document.createElement('span');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'position:absolute;top:8px;right:10px;cursor:pointer;color:var(--muted);font-size:13px;line-height:1;';
  closeBtn.onclick = (ev) => { ev.stopPropagation(); card.remove(); };
  card.appendChild(closeBtn);
  stack.appendChild(card);
  const dur = durationMs!=null ? durationMs : (isWarning ? 60000 : 4000);
  setTimeout(() => { if(card.parentNode) card.remove(); }, dur);
}

function escapeHtml(s){
  const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML;
}
/* Fiş başlığı/altı notu contenteditable'dan geldiği ve her cihazda innerHTML
   olarak basıldığı için (bkz. buildTicketHtml), kaydetmeden önce VE
   render ederken (savunma derinliği) burada beyaz listeye alınmadan asla
   kullanılmamalı - aksi halde kötü niyetli bir yönetici hesabı (veya ele
   geçirilmiş bir yönetici oturumu) buraya <img onerror=...> gibi bir kod
   yazıp her fişte/her cihazda çalışacak kalıcı bir stored XSS oluşturabilir. */
function sanitizeRichHtml(html){
  const ALLOWED_TAGS = new Set(['B','STRONG','I','EM','U','SPAN','BR','DIV']);
  const ALLOWED_STYLE_PROPS = new Set(['color','font-weight','font-style','text-decoration','text-align','font-size']);
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  function clean(node){
    for(const child of Array.from(node.childNodes)){
      if(child.nodeType === Node.TEXT_NODE) continue;
      if(child.nodeType !== Node.ELEMENT_NODE){ child.remove(); continue; }
      if(!ALLOWED_TAGS.has(child.tagName)){
        // İzin verilmeyen etiketi (script, img, a, iframe, svg vb.) düz metnine indirger, tamamen atmaz.
        const text = document.createTextNode(child.textContent || '');
        child.replaceWith(text);
        continue;
      }
      for(const attr of Array.from(child.attributes)){
        if(attr.name.toLowerCase() === 'style'){
          const safe = Array.from(child.style).filter(p => ALLOWED_STYLE_PROPS.has(p)).map(p => `${p}:${child.style.getPropertyValue(p)}`).join(';');
          if(safe) child.setAttribute('style', safe); else child.removeAttribute('style');
        } else {
          child.removeAttribute(attr.name);
        }
      }
      clean(child);
    }
  }
  clean(tpl.content);
  return tpl.innerHTML;
}

