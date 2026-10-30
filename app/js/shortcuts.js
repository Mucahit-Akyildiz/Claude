/* Kasa klavye kısayolları (masaüstü). Yazı alanındayken F tuşları yine çalışır,
   harf/rakam kısayolu yoktur; böylece arama ve not yazarken çakışma olmaz.
   Ödeme ekranı: F2 nakit, F3 kart, F4 bölünmüş, F8 açık hesap · Sipariş: F9 onayla ve gönder
   Ekranlar: F6 Sipariş Al, F7 Paket Servis, F10 Ödemeler, F11 Mutfak · Esc kapat · F1 yardım */
const SHORTCUTS = [
  ['F1', 'Kısayol listesini göster'],
  ['F2', 'Ödeme ekranında Nakit (tam ödeme)'],
  ['F3', 'Ödeme ekranında Kredi Kartı (tam ödeme)'],
  ['F4', 'Ödeme ekranında Bölünmüş Ödeme'],
  ['F8', 'Ödeme ekranında Açık Hesaba At'],
  ['F9', 'Sipariş penceresinde Onayla ve Gönder'],
  ['F6', 'Sipariş Al ekranı'],
  ['F7', 'Paket Servis ekranı'],
  ['F10', 'Ödemeler ekranı'],
  ['F11', 'Mutfak ekranı'],
  ['Esc', 'Açık pencereyi kapat'],
];
function scClick(sel){
  const b = document.querySelector(sel);
  if(!b || b.disabled || b.offsetParent === null) return false;
  b.click(); return true;
}
function scGo(view){
  const item = (typeof NAV_ITEMS !== 'undefined' ? NAV_ITEMS : []).find(i => i.view === view);
  const s = getSession();
  if(!s || !item || (typeof navItemVisible === 'function' && !navItemVisible(item, s))){ showToast('Bu ekran için yetkiniz yok'); return; }
  goToView(view);
}
function showShortcutHelp(){
  if(document.getElementById('scHelp')){ closeSheet('scHelp'); document.getElementById('scHelp').remove(); return; }
  document.body.insertAdjacentHTML('beforeend', sheetHtml('scHelp', '⌨️', 'Klavye Kısayolları', `<div class="sc-list">${SHORTCUTS.map(([k, d]) => `<div class="sc-row"><kbd>${k}</kbd><span>${d}</span></div>`).join('')}</div>
    <p class="muted" style="font-size:12px;text-align:left;margin:12px 0 0;">Kısayollar fiziksel klavyesi olan cihazlarda çalışır. Bir buton o anda pasifse (örn. ürünler hazır değilse) kısayol da çalışmaz.</p>`, 'var(--c1)'));
  openSheet('scHelp');
}
function scCloseTop(){
  // En üstteki pencereyi kapat: açılır form → ödeme alt pencereleri → ödeme / sipariş penceresi.
  if(document.querySelector('.fsheet.open')){ closeSheet(); return true; }
  // Üstte açılan popup'lar (Havale, banka ekle vb.) arkadaki pencereden önce kapanır; en son açılan önce.
  // Onay / uyarı popup'ları Esc'yi kendileri işler; açıksa arkadakine dokunulmaz.
  if(['uiConfirm', 'uiAlert', 'uiPrompt'].some(id => document.getElementById(id))) return true;
  const tops = [...document.querySelectorAll('body > .dg-bg')];
  if(tops.length){ tops[tops.length - 1].remove(); return true; }
  for(const id of ['reviewQrBg', 'googleReviewQrBg', 'invoiceEmailBg', 'splitPayBg', 'openAccModalBg', 'qrScanModalBg', 'payModalBg', 'tableModalBg']){
    const el = document.getElementById(id);
    if(el){ if(id === 'tableModalBg' && typeof closeTableModal === 'function') closeTableModal(); else el.remove(); return true; }
  }
  return false;
}
document.addEventListener('keydown', (e) => {
  if(e.ctrlKey || e.altKey || e.metaKey || !getSession()) return;
  const pay = document.getElementById('payModalBg'), split = document.getElementById('splitPayBg');
  const k = e.key;
  let done = false;
  if(k === 'Escape'){
    // Yazı alanındaysa önce alandan çık; tekrar Esc pencereyi kapatır.
    const t = e.target;
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.value){ t.blur(); return; }
    done = scCloseTop();
  }
  else if(k === 'F1'){ showShortcutHelp(); done = true; }
  else if(pay && !split && k === 'F2') done = scClick('#payCashBtn');
  else if(pay && !split && k === 'F3') done = scClick('#payCardBtn');
  else if(pay && !split && k === 'F4') done = scClick('#paySplitBtn');
  else if(pay && !split && k === 'F8') done = scClick('#payOpenAccBtn');
  else if(k === 'F9') done = scClick('#confirmBtn');
  else if(!pay && k === 'F6'){ scGo('order'); done = true; }
  else if(!pay && k === 'F7'){ scGo('packages'); done = true; }
  else if(!pay && k === 'F10'){ scGo('payments'); done = true; }
  else if(!pay && k === 'F11'){ scGo('kitchen'); done = true; }
  if(done || /^F(1|2|3|4|6|7|8|9|10|11)$/.test(k)) e.preventDefault();
});
