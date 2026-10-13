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
  // Otomatik (arka plan) yenilemede yükleniyor perdesi gösterilmez.
  if(APP.silentLoad) return await promise;
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

/* Tırnaklar da kaçırılır: değer bir HTML attribute'u içine
   (value="..." gibi) basıldığında attribute'tan çıkıp onfocus vb. eklenemez. */
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
/* Satır içi olay koduna inline JS attribute'larına metin argümanı basmak
   için: escapeHtml burada yetmez (tarayıcı &#39;'yi JS çalışmadan önce
   tekrar ' yapar). Tırnaklı bir JS string literal'i üretir; tüm riskli
   karakterler \xNN/\uNNNN olarak kaçırıldığı için ne attribute'tan ne de
   string'den çıkılabilir. */
function jsArg(s){
  return "'" + String(s==null?'':s).replace(/[\\'"<>&\r\n\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4,'0')) + "'";
}
/* escapeHtml yalnızca metin düğümü (text node) bağlamı için güvenli - tırnak
   işaretlerini kaçırmaz, çünkü HTML metin içeriğinde tırnağın özel bir anlamı
   yoktur. Bir değer bir HTML ATTRIBUTE'una (value="...", data-x="...") gömülecekse
   onun yerine BU fonksiyon kullanılmalı - aksi halde değer içindeki bir çift/tek
   tırnak attribute'u erken kapatıp yanına örn. bir olay özniteliği ve autofocus gibi
   yeni bir attribute enjekte edebilir (tıklama bile gerektirmeyen stored XSS). */
function escapeAttr(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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


/* Satır içi işlem butonları (Kaydet/Sil): her ekranda aynı görünüm -
   çizgi ikon + altında küçük yazı (bkz. app.css .act-btn). */
const ICON_SAVE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M8 3v5h7V3"/><rect x="8" y="13" width="8" height="6" rx="1"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/></svg>';
function actBtn(kind, fn, ...args){
  const icon = kind==='delete' ? ICON_TRASH : ICON_SAVE;
  const label = kind==='delete' ? 'Sil' : 'Kaydet';
  return `<button type="button" class="act-btn act-${kind==='delete'?'delete':'save'}" ${act(fn, ...args)}>${icon}<span>${label}</span></button>`;
}

/* Kat planı ölçekleme: masa konumları (pos_x/pos_y) sabit bir mantıksal
   koordinat düzleminde saklanır; ekranda kanvas genişliğine sığacak şekilde
   orantılı küçültülür (gerekirse yatay kaydırma ile). Böylece masaüstünde yerleştirilen plan telefonda da
   tamamen görünür ve sürüklenebilir (sürüklemede piksel farkı ölçeğe
   bölünerek mantıksal koordinata çevrilir). */
const FP_TABLE_SIZE = 86;
function fpLayout(canvas, tables){
  const maxX = Math.max(0, ...tables.map(t => Number(t.pos_x||0)));
  const maxY = Math.max(0, ...tables.map(t => Number(t.pos_y||0)));
  const logicalW = Math.max(600, maxX + FP_TABLE_SIZE + 20);
  const avail = canvas.clientWidth || logicalW;
  // Çok geniş planlarda masalar okunamayacak kadar küçülmesin: alt sınır
  // 0.55, kalan kısım kanvas içinde yatay kaydırılır.
  const scale = Math.max(0.55, Math.min(1, avail / logicalW));
  canvas.style.setProperty('--fp-s', scale);
  canvas.style.height = Math.max(200, Math.round((maxY + FP_TABLE_SIZE + 24) * scale) + 40) + 'px';
  // Sürükleme sınırı: görünen kanvasın tamamı (masaüstünde sağa doğru
  // genişletmeye izin verir).
  return { scale, logicalW: Math.max(logicalW, Math.floor(avail / scale)) };
}
/* Tek satırlık form düzeni (stil dosyası önbellekte eski kalsa da çalışsın diye satır içi stil):
   alanlar yan yana dizilir, sığmazsa alt satıra kayar. */
const INLINE_ROW = 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;';
function fgStyle(basis, grow){ return `margin:0;min-width:0;width:auto;flex:${grow || 1} 1 ${basis || 120}px;`; }
const INLINE_BTN = 'width:auto;margin:0;white-space:nowrap;flex:0 0 auto;padding-left:18px;padding-right:18px;';
function onEnterKey(e, fnName){ if(e.key === 'Enter' && typeof window[fnName] === 'function') window[fnName](); }
function clickEl(id){ const el = document.getElementById(id); if(el) el.click(); }
function onEnterCall(e, fnName, ...args){ if(e.key === 'Enter' && typeof window[fnName] === 'function') window[fnName](...args); }
function copyText(text, msg){ if(navigator.clipboard) navigator.clipboard.writeText(text).then(() => showToast(msg || 'Kopyalandı ✓')); }
/* ---- Ortak mikrofon akışı ----
   iPhone/iPad (özellikle ana ekrana eklenmiş uygulama) mikrofon iznini kalıcı saklamaz:
   akış her kapatılıp yeniden istendiğinde izin penceresi tekrar çıkar. Bu yüzden telsiz ve
   sesli mesaj aynı akışı paylaşır; akış kullanılmadığında 10 dk sonra bırakılır. */
let SHARED_MIC = null, SHARED_MIC_KEY = '', SHARED_MIC_TIMER = null;
function sharedMicLive(){ return !!(SHARED_MIC && SHARED_MIC.getAudioTracks().some(t => t.readyState === 'live')); }
async function getSharedMic(constraints){
  const key = JSON.stringify(constraints || true);
  if(sharedMicLive() && (key === SHARED_MIC_KEY || !constraints || !constraints.deviceId)){ touchSharedMic(); return SHARED_MIC; }
  releaseSharedMic();
  // iPhone: ses oturumu yalnızca 'çalma' modundaysa (telsiz sessiz modda da çalsın diye 'playback')
  // mikrofon "AudioSession category is not compatible with audio capture" (InvalidStateError) ile
  // açılmaz; kayıt için 'play-and-record' moduna geçilir.
  try{ if(navigator.audioSession && navigator.audioSession.type !== 'play-and-record') navigator.audioSession.type = 'play-and-record'; }catch(e){}
  SHARED_MIC = await navigator.mediaDevices.getUserMedia({ audio: constraints || true });
  SHARED_MIC_KEY = key;
  touchSharedMic();
  return SHARED_MIC;
}
function adoptSharedMic(stream){ if(!sharedMicLive() && stream && stream.getAudioTracks().length){ SHARED_MIC = new MediaStream(stream.getAudioTracks()); SHARED_MIC_KEY = 'true'; touchSharedMic(); return true; } return false; }
function touchSharedMic(){ clearTimeout(SHARED_MIC_TIMER); SHARED_MIC_TIMER = setTimeout(() => { if(typeof RADIO !== 'undefined' && (RADIO.channel || RADIO.talking)) return touchSharedMic(); if(typeof CHAT_VOICE !== 'undefined' && CHAT_VOICE) return touchSharedMic(); releaseSharedMic(); }, 10 * 60 * 1000); }
function releaseSharedMic(){ clearTimeout(SHARED_MIC_TIMER);
  // Mikrofon bırakılınca sessiz modda da çalabilmek için tekrar 'çalma' moduna dönülür.
  if(SHARED_MIC){ SHARED_MIC.getTracks().forEach(t => t.stop()); try{ if(navigator.audioSession && navigator.audioSession.type === 'play-and-record') navigator.audioSession.type = 'playback'; }catch(e){} } SHARED_MIC = null; SHARED_MIC_KEY = ''; if(typeof RADIO !== 'undefined' && RADIO.mic && RADIO.mic.getAudioTracks().every(t => t.readyState !== 'live')) RADIO.mic = null; }

/* ---- Hafif SVG grafikler (harici kütüphane yok, CSP uyumlu) ----
   Renkler CSS değişkenlerinden (--c1..--c4) gelir; açık/koyu temada ayrı tonlar. */
function svgBarChart(data, o){
  // HTML/CSS sütun grafiği: keskin yazı, yatay kılavuz çizgileri, gradyan sütunlar, üzerine gelince ayrıntı.
  o = o || {};
  if(!data.length) return '<p class="muted">Veri yok.</p>';
  const max = Math.max(...data.map(d => Number(d.value)||0)) || 1;
  const step = niceStep(max / 4), top = Math.ceil(max / step) * step || 1;
  const ticks = [4,3,2,1,0].map(i => top * i / 4);
  const peak = data.reduce((a, d) => (Number(d.value)||0) > (Number(a.value)||0) ? d : a, data[0]);
  const showVals = data.length <= 12;
  return `<div class="bc" style="--bc-h:${o.height || 220}px;" role="img" aria-label="${escapeAttr(o.title||'Grafik')}">
    <div class="bc-y">${ticks.map(t => `<span>${shortMoney(t)}</span>`).join('')}</div>
    <div class="bc-plot">
      <div class="bc-grid">${ticks.map(() => '<i></i>').join('')}</div>
      <div class="bc-cols">${data.map(d => { const v = Number(d.value)||0, pct = v / top * 100, pk = d === peak && v > 0;
        return `<div class="bc-col${pk ? ' peak' : ''}${v ? '' : ' zero'}" tabindex="0">
          <div class="bc-bar" style="height:${Math.max(v ? 2 : 0, pct)}%;"><div class="bc-tip"><b>${escapeHtml(d.label)}</b>${escapeHtml(d.display || String(v))}</div>${(showVals || pk) && v ? `<span class="bc-v">${escapeHtml(d.short || shortMoney(v))}</span>` : ''}</div>
          <span class="bc-x">${escapeHtml(d.label)}</span></div>`; }).join('')}</div>
    </div></div>`;
}
function niceStep(x){ if(x <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(x))); const f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function svgDonut(segs, o){
  o = o || {};
  const total = segs.reduce((t, s) => t + (Number(s.value)||0), 0);
  if(!total) return '<p class="muted">Veri yok.</p>';
  const R = 52, C = 2 * Math.PI * R; let off = 0;
  const arcs = segs.filter(s => s.value > 0).map(s => {
    const len = (s.value / total) * C, gap = segs.filter(x => x.value > 0).length > 1 ? 2 : 0;
    const el = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${s.color}" stroke-width="18" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${escapeHtml(s.label + ': %' + Math.round(s.value/total*100))}</title></circle>`;
    off += len; return el;
  }).join('');
  return `<div class="ch-donut"><svg viewBox="0 0 140 140" role="img" aria-label="${escapeAttr(o.title||'Dağılım')}"><circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--panel2)" stroke-width="18"></circle>${arcs}<text x="70" y="66" text-anchor="middle" class="ch-dc-big">${escapeHtml(o.center||'')}</text><text x="70" y="84" text-anchor="middle" class="ch-dc-sm">${escapeHtml(o.sub||'')}</text></svg>
    <div class="ch-legend">${segs.map(s => `<div><i style="background:${s.color}"></i><span>${escapeHtml(s.label)}</span><b>%${Math.round((Number(s.value)||0)/total*100)}</b></div>`).join('')}</div></div>`;
}
function shortMoney(v){ v = Number(v)||0; if(v >= 1e6) return (v/1e6).toLocaleString('tr-TR',{maximumFractionDigits:1})+' mn'; if(v >= 1e4) return Math.round(v/1000).toLocaleString('tr-TR')+' bin'; return Math.round(v).toLocaleString('tr-TR'); }
