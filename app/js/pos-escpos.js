/* POS - ESC/POS ve mutfak fişi yazdırma. Eski pos-core.js'ten bölündü; klasik <script src>, globaller
   paylaşılır ve dosyalar index.html'deki sırayla yüklenir (sıra önemli). */
/* ---- ESC/POS ham komut olusturma (WebUSB dogrudan yazdirma icin) ---- */
function escposEncodeText(text){
  // Basit yaklasim: UTF-8 byte'lari gonderiyoruz. Turkce ozel karakterler
  // (ç,ğ,ı,ö,ş,ü) bazi yazici modellerinde/kod sayfalarinda hatali cikabilir -
  // yaziciniz farkli bir kod sayfasi gerektiriyorsa bildirin, ona gore ayarlarim.
  return new TextEncoder().encode(text);
}
/* Fiş başlığı/altı notu artık zengin metin (execCommand'in ürettiği
   <div>/<b>/<font> vb. HTML) olarak saklanıyor - USB (ESC/POS) yazdırma ham
   metin bekliyor, HTML biçimlendirmeyi gösteremiyor. Etiketleri atıp satır
   sonlarını koruyarak düz metne çeviriyoruz. */
function ticketRichToPlainText(html){
  if(!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('div,p').forEach(el => el.insertAdjacentText('beforeend', '\n'));
  tmp.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
  return (tmp.textContent || '').replace(/\n+$/, '').trim();
}
function buildEscPosTicket(restaurantName, tableName, items, design, dailyNumber){
  const chunks = [];
  const push = (arr) => chunks.push(arr instanceof Uint8Array ? arr : new Uint8Array(arr));
  const lineWidth = design.width==='58' ? 32 : 48;
  const headerText = ticketRichToPlainText(design.header);
  const footerText = ticketRichToPlainText(design.footer);
  push([0x1B, 0x40]); // init
  push([0x1B, 0x61, 0x01]); // center
  push([0x1B, 0x45, 0x01]); // bold on
  push(escposEncodeText((restaurantName||'').toUpperCase() + '\n'));
  push([0x1B, 0x45, 0x00]); // bold off
  if(headerText) push(escposEncodeText(headerText + '\n'));
  const now = new Date();
  const showOrderNumber = design.showOrderNumber !== false;
  const showItemTime = design.showItemTime !== false;
  const headerDateLine = now.toLocaleDateString('tr-TR') + (design.showHeaderTime ? (' ' + formatItemTime({added_at: now.toISOString()}, design)) : '');
  push(escposEncodeText(((showOrderNumber && dailyNumber) ? ('Sipariş No: '+dailyNumber+' · ') : '') + tableName + '\n'));
  push(escposEncodeText(headerDateLine + '\n'));
  push([0x1B, 0x61, 0x00]); // left align
  // Termal yazıcılarda ince yazı çoğunlukla silik/soluk çıkıyor - Kalın Yazı
  // ayarı açıksa ürün satırları da bold basılır (bkz. Yazıcı Ayarları > Fiş Tasarımı).
  if(design.bold) push([0x1B, 0x45, 0x01]);
  push(escposEncodeText('-'.repeat(lineWidth) + '\n'));
  items.forEach(it => {
    const timeStr = showItemTime ? formatItemTime(it, design) : '';
    const left = it.qty + 'x ' + it.name;
    const pad = Math.max(1, lineWidth - left.length - timeStr.length);
    push(escposEncodeText(left + (showItemTime ? (' '.repeat(pad) + timeStr) : '') + '\n'));
    if(it.note) push(escposEncodeText('  Not: ' + it.note + '\n'));
  });
  push(escposEncodeText('-'.repeat(lineWidth) + '\n'));
  if(design.bold) push([0x1B, 0x45, 0x00]);
  if(footerText){
    push([0x1B, 0x61, 0x01]);
    push(escposEncodeText(footerText + '\n'));
  }
  push(escposEncodeText('\n\n\n'));
  push([0x1D, 0x56, 0x42, 0x00]); // kagit kes
  let total = 0; chunks.forEach(c => total += c.length);
  const out = new Uint8Array(total);
  let off = 0; chunks.forEach(c => { out.set(c, off); off += c.length; });
  return out;
}
let _usbPrintQueue = Promise.resolve();
/* Ayni USB yaziciya esZamanli (concurrent) erisim denemeleri "interface claim
   edilemedi" hatasina yol acabiliyor (ozellikle art arda gelen siparislerde) -
   tum yazdirma istekleri burada siraya alinip tek tek isleniyor. */
function sendToUsbPrinter(printer, bytes){
  const task = _usbPrintQueue.then(() => sendToUsbPrinterNow(printer, bytes));
  _usbPrintQueue = task.catch(() => {});
  return task;
}
let LAST_USB_ERROR = null;
async function sendToUsbPrinterNow(printer, bytes){
  if(!navigator.usb){ LAST_USB_ERROR = 'Bu tarayıcı WebUSB desteklemiyor'; return false; }
  if(!printer.usbInfo){ LAST_USB_ERROR = 'Bu yazıcı için USB eşleştirme bilgisi yok'; return false; }
  let device = null;
  try{
    const devices = await navigator.usb.getDevices();
    device = devices.find(d => d.vendorId===printer.usbInfo.vendorId && d.productId===printer.usbInfo.productId);
    if(!device){ LAST_USB_ERROR = 'Yazıcı bu tarayıcıda yetkilendirilmemiş görünüyor (Yazıcılar listesinde "Bağlan"a tekrar basın)'; return false; }
    await device.open();
    if(device.configuration === null) await device.selectConfiguration(1);
    const iface = device.configuration.interfaces[0];
    await device.claimInterface(iface.interfaceNumber);
    const endpoint = iface.alternate.endpoints.find(e => e.direction==='out');
    if(!endpoint){ LAST_USB_ERROR = 'Yazıcıda veri gönderme ucu (OUT endpoint) bulunamadı'; await device.close(); return false; }
    await device.transferOut(endpoint.endpointNumber, bytes);
    await device.close();
    LAST_USB_ERROR = null;
    return true;
  }catch(e){
    LAST_USB_ERROR = (e && e.message) ? e.message : String(e);
    console.error('USB yazdirma basarisiz:', e);
    // Cihaz acik kalip sonraki denemeleri de kilitlemesin diye elden geldigince kapat.
    if(device && device.opened){ try{ await device.close(); }catch(e2){} }
    return false;
  }
}

/* ---- Mutfak fişi yazdırma (ana giris noktasi) ---- */
function reprintKitchenTicket(tableId){
  const entry = APP.kitchenPendingByTable && APP.kitchenPendingByTable[tableId];
  if(!entry){ alert('Bu masa için bekleyen ürün kalmadı.'); return; }
  printKitchenTicketGrouped(entry.tableName, entry.items, false, entry.dailyNumber);
}
/* Ürünleri istasyona göre gruplar, her istasyonun fişini o istasyona atanmış
   yazıcıya (atanmamışsa "Bu Ekranın Yazıcısı"na) ayrı ayrı gönderir. */
async function printKitchenTicketGrouped(tableName, items, silent, dailyNumber){
  const groups = {};
  items.forEach(it => {
    const key = it.station_id || '';
    if(!groups[key]) groups[key] = [];
    groups[key].push(it);
  });
  for(const key of Object.keys(groups)){
    const printer = resolvePrinterForStation(key || null);
    await printKitchenTicket(tableName, groups[key], printer, silent, dailyNumber);
  }
}
async function printKitchenTicket(tableName, items, printerOverride, silent, dailyNumber){
  const session = getSession();
  const restaurantName = session ? session.restaurant_name : '';
  const design = getTicketDesign();
  const printers = getPrinters();
  const printer = printerOverride || printers.find(p => p.id===getActivePrinterId());

  const copies = Math.max(1, Math.min(5, design.copies||1));

  if(printer && printer.type==='electron' && isDesktopApp()){
    // Masaustu uygulamasinin native yazdirma koprusu - herhangi bir isletim
    // sistemi yazicisina (Windows/macOS), hicbir pencere/onay gostermeden,
    // WebUSB veya kiosk-printing bayragina gerek kalmadan basar.
    const el = document.getElementById('printArea');
    applyTicketDesignStyle(el, design);
    el.innerHTML = buildTicketHtml(restaurantName, tableName, items, design, dailyNumber);
    await new Promise(r => setTimeout(r, 80));
    for(let c=0;c<copies;c++){
      const result = await window.electronAPI.silentPrint(printer.osPrinterName);
      if(!result || !result.success){
        console.warn('Masaustu uygulamasi yazdirma basarisiz:', result && result.errorType);
        if(silent) showToast('⚠️ "'+printer.name+'" yazıcısına fiş gönderilemedi'+(result&&result.errorType?' — '+result.errorType:'')+'. Yazıcı bağlantısını kontrol edin');
        return;
      }
    }
    return;
  } else if(printer && printer.type==='usb'){
    let bytes = buildEscPosTicket(restaurantName, tableName, items, design, dailyNumber);
    if(copies>1){
      const single = bytes;
      const combined = new Uint8Array(single.length*copies);
      for(let c=0;c<copies;c++) combined.set(single, c*single.length);
      bytes = combined;
    }
    const ok = await sendToUsbPrinter(printer, bytes);
    if(ok) return; // basarili - tarayici penceresi ACILMADI
    console.warn('USB yaziciya ulasilamadi.');
    if(silent) showToast('⚠️ "'+printer.name+'" yazıcısına fiş gönderilemedi'+(LAST_USB_ERROR?' — '+LAST_USB_ERROR:'')+'. Bağlantıyı kontrol edin');
  } else if(printer && printer.type==='silent-browser'){
    // Normal bir isletim sistemi yazicisi (Xerox, HP vb. - USB arayuzu zaten
    // isletim sisteminin kendi surucusunde oldugu icin WebUSB'nin asla
    // erisemeyecegi tur bir yazici). Chrome/Edge --kiosk-printing bayragiyla
    // acilip bu yazici o bilgisayarda VARSAYILAN yazici yapilirsa,
    // window.print() hicbir pencere/onay gostermeden dogrudan basar.
    const el = document.getElementById('printArea');
    applyTicketDesignStyle(el, design);
    el.innerHTML = buildTicketHtml(restaurantName, tableName, items, design, dailyNumber);
    setTimeout(() => window.print(), 100);
    return;
  } else if(!printer && silent){
    showToast('⚠️ Fiş yazdırılamadı: bu ekran/istasyon için yazıcı seçili değil');
  } else if(printer && printer.type==='browser' && silent){
    showToast('⚠️ "'+printer.name+'" sessiz/otomatik yazdırma için ayarlanmamış (bu tür her seferinde yazdırma penceresi açar) — Yazıcı Ayarları\'ndan "Masaüstü Uygulaması", "Sessiz Tarayıcı Yazdırma (kiosk-printing)" veya USB tipini kullanın');
  }

  // silent=true (siparis onaylaninca otomatik cagri): yazici yoksa/basarisizsa
  // ASLA tarayici penceresi acilmaz, sessizce vazgecilir. Sadece manuel
  // "yeniden yazdir" / "test yazdir" gibi bilincli tiklamalarda pencereye dusulur.
  if(silent) return;

  const el = document.getElementById('printArea');
  applyTicketDesignStyle(el, design);
  el.innerHTML = buildTicketHtml(restaurantName, tableName, items, design, dailyNumber);
  setTimeout(() => window.print(), 100);
}
function formatItemTime(it, design){
  const t = it.added_at ? new Date(it.added_at) : new Date();
  const hour12 = !!(design && design.timeFormat==='12');
  return t.toLocaleTimeString('tr-TR', hour12 ? {hour:'2-digit', minute:'2-digit', hour12:true} : {hour:'2-digit', minute:'2-digit'});
}
/* Fişin bir bölümü için renk/boyut/harf-stili özelleştirmesini tek bir
   inline style dizgesine çevirir - hepsi !important, çünkü .ticket-bold
   gibi genel kurallar da !important kullanıyor ve inline stil bunlardan
   önceliklidir (aksi halde örn. Kalın Yazı açıkken renk/boyut geçersiz kalırdı). */
function ticketPartStyle(design, key){
  const color = design['color'+key] || '#000000';
  const size = design['size'+key];
  const transform = design['transform'+key] || 'none';
  return `color:${color} !important;`+(size?`font-size:${size}px !important;`:'')+`text-transform:${transform} !important;`;
}
function buildTicketHtml(restaurantName, tableName, items, design, dailyNumber){
  const now = new Date();
  const showOrderNumber = design.showOrderNumber !== false;
  const showItemTime = design.showItemTime !== false;
  const showHeaderTime = !!design.showHeaderTime;
  const timeWeight = design.timeBold===false ? '400' : '700';
  const dateLine = now.toLocaleDateString('tr-TR') + (showHeaderTime ? (' ' + formatItemTime({added_at: now.toISOString()}, design)) : '');
  return `
    <div class="ticket-title" style="${ticketPartStyle(design,'Title')}">${escapeHtml(restaurantName)}</div>
    ${design.header ? `<div class="ticket-meta ticket-rich">${sanitizeRichHtml(design.header)}</div>` : ''}
    <div class="ticket-meta" style="${ticketPartStyle(design,'Text')}">${(showOrderNumber && dailyNumber)?('Sipariş No: '+dailyNumber+' · '):''}${escapeHtml(tableName)}</div>
    <div class="ticket-meta" style="${ticketPartStyle(design,'Text')}">${dateLine}</div>
    <div class="ticket-line"></div>
    ${items.map(it => `
      <div class="ticket-item" style="${ticketPartStyle(design,'Text')}"><span><span class="qty">${it.qty}x</span>${escapeHtml(it.name)}</span>${showItemTime?`<span class="ticket-time" style="${ticketPartStyle(design,'Time')}font-weight:${timeWeight} !important;">${formatItemTime(it, design)}</span>`:''}</div>
      ${it.note ? `<div class="ticket-note" style="${ticketPartStyle(design,'Note')}">Not: ${escapeHtml(it.note)}</div>` : ''}
    `).join('')}
    <div class="ticket-line"></div>
    ${design.footer ? `<div class="ticket-meta ticket-rich">${sanitizeRichHtml(design.footer)}</div>` : ''}
  `;
}
function updateTicketPreview(){
  const el = document.getElementById('ticketPreview');
  if(!el) return;
  const width = document.getElementById('td_width').value;
  const header = document.getElementById('td_header').innerHTML.trim();
  const footer = document.getElementById('td_footer').innerHTML.trim();
  const fontFamily = document.getElementById('td_font').value;
  const bold = document.getElementById('td_bold').checked;
  const marginTop = parseFloat(document.getElementById('td_mtop').value) || 0;
  const marginRight = parseFloat(document.getElementById('td_mright').value) || 0;
  const marginBottom = parseFloat(document.getElementById('td_mbottom').value) || 0;
  const marginLeft = parseFloat(document.getElementById('td_mleft').value) || 0;
  const showOrderNumber = document.getElementById('td_showOrderNumber').checked;
  const showItemTime = document.getElementById('td_showItemTime').checked;
  const showHeaderTime = document.getElementById('td_showHeaderTime').checked;
  const timeFormat = document.getElementById('td_timeFormat').value;
  const timeBold = document.getElementById('td_timeBold').checked;
  const typography = readTicketTypography();
  const session = getSession();
  const t1 = new Date(Date.now() - 6*60000).toISOString();
  const t2 = new Date().toISOString();
  const sampleItems = [
    { qty:2, name:'Izgara Köfte', note:'Az pişmiş', added_at:t1 },
    { qty:1, name:'Ayran', added_at:t1 },
    { qty:1, name:'Mevsim Salata', note:'Sossuz', added_at:t2 },
  ];
  applyTicketDesignStyle(el, { width, fontFamily, bold, marginTop, marginRight, marginBottom, marginLeft }, 'ticket-paper');
  el.innerHTML = buildTicketHtml(session ? session.restaurant_name : 'İŞLETME ADI', 'Masa 3', sampleItems, { header, footer, showOrderNumber, showItemTime, showHeaderTime, timeFormat, timeBold, ...typography }, 12);
}
/* Masa taşıma/birleştirme: boş masaya seçilirse hesap oraya taşınır, dolu
   masaya seçilirse ödenmemiş ürünler o masanın hesabına eklenir (bkz.
   move_table_order). */
function openMoveTableModal(fromTableId){
  const zones = (APP.config && APP.config.zones) || [];
  const opts = zones.map(z => {
    const ts = z.tables.filter(t => t.id !== fromTableId);
    if(!ts.length) return '';
    return `<optgroup label="${escapeHtml(z.name)}">${ts.map(t => `<option value="${t.id}">${escapeHtml(t.name)}${liveOrderForTable(t.id)?' (dolu - birleştir)':''}</option>`).join('')}</optgroup>`;
  }).join('');
  if(!opts){ alert('Taşınabilecek başka masa yok'); return; }
  const bg = document.createElement('div');
  bg.id = 'moveTableBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:110;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div class="box" style="max-width:340px;width:100%;text-align:left;">
    <h2 style="margin-top:0;">🔀 Masayı Taşı / Birleştir</h2>
    <p class="muted" style="font-size:12.5px;margin:0 0 10px;">${escapeHtml(tableNameForId(fromTableId))} → hedef masa. Dolu bir masa seçerseniz ödenmemiş ürünler o masanın hesabına eklenir.</p>
    <select id="moveTarget" style="margin-bottom:14px;">${opts}</select>
    <div class="field-row" style="gap:8px;">
      <button type="button" style="flex:1;margin:0;background:var(--panel2);color:var(--text);" onclick="document.getElementById('moveTableBg').remove()">Vazgeç</button>
      <button type="button" id="moveBtn" style="flex:1;margin:0;" onclick="confirmMoveTable('${fromTableId}')">Taşı</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
}
async function confirmMoveTable(fromTableId){
  const to = document.getElementById('moveTarget').value;
  if((APP.draftCart && (APP.draftCart[fromTableId]||[]).length) && !confirm('Henüz gönderilmemiş sepet ürünleri taşınmaz, önce gönderin. Yine de devam edilsin mi?')) return;
  const btn = document.getElementById('moveBtn'); btn.disabled = true;
  const session = getSession();
  const { data, error } = await sb.rpc('move_table_order', { p_token: session.session_token, p_from_table_id: fromTableId, p_to_table_id: to });
  if(error){ alert(error.message); btn.disabled = false; return; }
  document.getElementById('moveTableBg').remove();
  await releaseDraftStock(fromTableId);
  const { data: live } = await sb.rpc('get_live_orders', { p_token: session.session_token });
  APP.liveOrders = live || [];
  await closeTableModal();
  showToast(data && data.mode==='merged' ? '🔀 Masalar birleştirildi ✓' : '🔀 Masa taşındı ✓');
  render();
}
async function cancelTableOrder(tableId){
  if(!confirm('Bu masadaki siparişi (mutfağa gönderilenler dahil) tamamen iptal etmek istediğinize emin misiniz?')) return;
  const session = getSession();
  // Sepette henüz gönderilmemiş ürün varsa stoğunu geri ekle (aksi halde iptal ile birlikte kalıcı kaybolur).
  await releaseDraftStock(tableId);
  const order = liveOrderForTable(tableId);
  if(order){
    const { error } = await sb.rpc('cancel_order', { p_token: session.session_token, p_order_id: order.order_id });
    if(error){ alert('İptal edilemedi: '+error.message); return; }
  }
  const [liveRes, cfgRes] = await Promise.all([
    sb.rpc('get_live_orders', { p_token: session.session_token }),
    sb.rpc('get_restaurant_config', { p_token: session.session_token })
  ]);
  APP.liveOrders = liveRes.data || [];
  if(cfgRes.data) APP.config = cfgRes.data;
  await closeTableModal();
  if(typeof tableId==='string' && tableId.indexOf('pkg_')===0 && APP.view==='packages') renderPackagesView(document.getElementById('main'), session);
  if(typeof tableId==='string' && tableId.indexOf('wl_')===0 && APP.view==='reservations') renderWaitlistContent(session, true);
}
/* Sadece henüz mutfağa gönderilmemiş sepeti boşaltır; masaya ait onaylı/gönderilmiş sipariş etkilenmez. */
async function clearDraftCart(tableId){
  const draft = APP.draftCart[tableId];
  if(!draft || draft.length===0) return;
  if(!confirm('Henüz gönderilmemiş sepetteki ürünler temizlensin mi?')) return;
  await releaseDraftStock(tableId);
  renderTableItems(tableId);
  const activeTab = document.querySelector('#prodStationTabs .tab.active');
  if(activeTab) renderProductPick(activeTab.dataset.st, tableId);
}

function lastLoginInfo(){
  try{ return JSON.parse(localStorage.getItem('rys_last_login')) || { code:'', username:'' }; }catch(e){ return { code:'', username:'' }; }
}
async function doLogin(){
  const code = document.getElementById('codeInput').value.trim();
  const username = document.getElementById('userInput').value.trim();
  const password = document.getElementById('passInput').value;
  const errBox = document.getElementById('errBox');
  const btn = document.getElementById('loginBtn');
  errBox.textContent = '';
  if(!code || !username || !password){
    errBox.textContent = 'Tüm alanları doldurun';
    return;
  }
  btn.disabled = true; btn.textContent = 'Giriş yapılıyor...';
  // Kimlik bilgileri doğruysa ama deneme/abonelik süresi dolmuşsa, sb.rpc
  // sarmalayıcısı otomatik olarak "Abonelik Süresi Doldu" ekranına
  // yönlendirir - bu bilgiler orada önceden doldurulmuş görünsün diye
  // istek atılmadan önce hazırlanıyor.
  APP.expiredPrefill = { code, username };
  try{
    const { data, error } = await sb.rpc('login_staff', {
      p_code: code, p_username: username, p_password: password
    });
    if(error){
      if(error.message === 'ABONELIK_SURESI_DOLDU') return; // ekran zaten değişti (sb.rpc sarmalayıcısı)
      console.error(error);
      errBox.textContent = /pasif/i.test(error.message) ? error.message : 'Bağlantı hatası: ' + error.message;
      return;
    }
    if(!data || data.length === 0){
      errBox.textContent = 'İşletme kodu, kullanıcı adı veya şifre hatalı';
      return;
    }
    const row = data[0];
    const remember = !!(document.getElementById('rememberInput') || {}).checked;
    setSession({
      session_token: row.session_token,
      user_id: row.user_id,
      restaurant_id: row.restaurant_id,
      role_names: row.role_names || [],
      permissions: row.permissions || [],
      isManager: !!row.is_manager,
      restaurant_name: row.restaurant_name,
      username: username,
      remember
    });
    try{ localStorage.setItem('rys_last_login', JSON.stringify({ code, username })); }catch(e){}
    if(remember) await sb.rpc('set_session_remember', { p_token: row.session_token });
    APP.reportsUnlocked = false;
    APP.reportsGateScreen = null;
    APP.config = null;
    applyDeepLinkView();
    render();
  }catch(err){
    console.error(err);
    errBox.textContent = 'Beklenmeyen bir hata oluştu';
  }finally{
    btn.disabled = false; btn.textContent = 'Giriş Yap';
  }
}
/* push_subscriptions satırı session_token'dan bağımsız, kullanıcıya kalıcı
   olarak bağlı - logout sadece staff_sessions'ı siler, aboneliği silmezse
   o cihaz (ya da o tarayıcı) çıkış yapıldıktan sonra da bildirim almaya
   devam eder. Bu yüzden çıkışta, o cihazın kendi aboneliğini de kaldırıyoruz. */
async function unsubscribePushOnLogout(session){
  if(!session || !session.session_token) return;
  try{
    if(isNativeApp()){
      const saved = getSavedFcmToken();
      if(saved){
        await sb.rpc('remove_push_subscription', { p_token: session.session_token, p_endpoint: saved });
        setSavedFcmToken('');
      }
      return;
    }
    if(!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if(sub){
      await sb.rpc('remove_push_subscription', { p_token: session.session_token, p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  }catch(e){}
}
async function doLogout(){
  const session = getSession();
  stopKitchenPolling();
  stopCustomerRequestPolling();
  APP.customerReqPollStarted = false;
  APP.shiftStatus = null;
  clearSession();
  render();
  if(session && session.session_token){
    await unsubscribePushOnLogout(session);
    try{ await sb.rpc('logout_staff', { p_token: session.session_token }); }catch(e){}
  }
}
