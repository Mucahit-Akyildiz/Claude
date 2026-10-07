/* POS - Web Push / native bildirimler. Eski pos-core.js'ten bölündü; klasik <script src>, globaller
   paylaşılır ve dosyalar index.html'deki sırayla yüklenir (sıra önemli). */
/* ---- Web Push: uygulama/tarayıcı kapalıyken de bildirim ---- */
function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i=0;i<rawData.length;i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
async function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return null;
  try{ return await navigator.serviceWorker.register('/app/sw.js'); }
  catch(e){ return null; }
}
async function initPushUI(){
  const btn = document.getElementById('pushToggleBtn');
  const statusText = document.getElementById('pushStatusText');
  if(!btn || !statusText) return;
  if(isNativeApp()){
    const PN = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if(!PN){
      statusText.textContent = 'Bu uygulama sürümü bildirim desteklemiyor, lütfen güncelleyin.';
      btn.style.display = 'none';
      return;
    }
    const perm = await PN.checkPermissions();
    if(perm.receive === 'denied'){
      statusText.textContent = 'Bildirim izni engellenmiş. Telefonun Ayarlar > Uygulamalar > Peyktan > Bildirimler kısmından izin vermeniz gerekiyor.';
      btn.style.display = 'none';
      return;
    }
    updatePushUI(perm.receive==='granted' && !!getSavedFcmToken());
    return;
  }
  if(isIosBrowserTab()){
    statusText.textContent = 'iPhone/iPad\'de bildirimler için önce Peyktan\'ı ana ekrana ekleyin: Safari\'de Paylaş (⬆️) > "Ana Ekrana Ekle", sonra ana ekrandaki simgeden açıp buradan bildirimleri açın (iOS 16.4 ve üzeri).';
    btn.style.display = 'none';
    return;
  }
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    statusText.textContent = 'Bu tarayıcı/cihaz push bildirimlerini desteklemiyor.';
    btn.style.display = 'none';
    return;
  }
  if(Notification.permission === 'denied'){
    statusText.textContent = 'Bildirim izni engellenmiş. Tarayıcı/site ayarlarından izin vermeniz gerekiyor.';
    btn.style.display = 'none';
    return;
  }
  const reg = await registerServiceWorker();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  updatePushUI(!!sub);
}
function updatePushUI(subscribed){
  const btn = document.getElementById('pushToggleBtn');
  const statusText = document.getElementById('pushStatusText');
  if(!btn || !statusText) return;
  if(subscribed){
    statusText.textContent = '✓ Bu cihazda push bildirimleri açık.';
    btn.textContent = 'Bildirimleri Kapat';
  } else {
    statusText.textContent = 'Bu cihazda push bildirimleri kapalı.';
    btn.textContent = 'Bildirimleri Aç';
  }
}
async function togglePushNotifications(){
  const statusText = document.getElementById('pushStatusText');
  // pushStatusText sadece Bildirim Ayarları ekranında var - bu fonksiyon
  // artık girişten hemen sonra otomatik da çağrılabildiği için (bkz.
  // maybeShowPushPrompt), o ekranda değilken hata/durum mesajları toast
  // olarak gösterilir.
  const setStatus = (msg) => { if(statusText) statusText.textContent = msg; else showToast(msg); };
  const session = getSession();
  if(isNativeApp()){
    const PN = window.Capacitor.Plugins.PushNotifications;
    const saved = getSavedFcmToken();
    if(saved){
      await sb.rpc('remove_push_subscription', { p_token: session.session_token, p_endpoint: saved });
      setSavedFcmToken('');
      updatePushUI(false);
      showToast('Push bildirimleri kapatıldı');
      return;
    }
    const permReq = await PN.requestPermissions();
    APP.nativePushPermState = permReq.receive;
    if(permReq.receive !== 'granted'){ setStatus('Bildirim izni verilmedi.'); render(); return; }
    const token = await requestNativeFcmToken();
    if(!token){ setStatus('Cihaz kaydı alınamadı, lütfen tekrar deneyin.'); return; }
    await APP.nativeChannelReady;
    const { error } = await sb.rpc('save_fcm_token', { p_token: session.session_token, p_fcm_token: token, p_channel: APP.nativePushChannel || 'default' });
    if(error){ setStatus('Kaydedilemedi: ' + error.message); return; }
    setSavedFcmToken(token);
    updatePushUI(true);
    showToast('Push bildirimleri açıldı ✓');
    render();
    return;
  }
  const reg = await registerServiceWorker();
  if(!reg){ setStatus('Servis çalışanı (service worker) kaydedilemedi.'); return; }
  const existing = await reg.pushManager.getSubscription();
  if(existing){
    await sb.rpc('remove_push_subscription', { p_token: session.session_token, p_endpoint: existing.endpoint });
    await existing.unsubscribe();
    updatePushUI(false);
    showToast('Push bildirimleri kapatıldı');
    return;
  }
  const permission = await Notification.requestPermission();
  if(permission !== 'granted'){
    setStatus('Bildirim izni verilmedi.');
    render();
    return;
  }
  let sub;
  try{
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }catch(e){
    setStatus('Abonelik oluşturulamadı: ' + e.message);
    return;
  }
  const subJson = sub.toJSON();
  const { error } = await sb.rpc('save_push_subscription', {
    p_token: session.session_token,
    p_endpoint: subJson.endpoint,
    p_p256dh: subJson.keys.p256dh,
    p_auth: subJson.keys.auth
  });
  if(error){ setStatus('Kaydedilemedi: ' + error.message); return; }
  updatePushUI(true);
  showToast('Push bildirimleri açıldı ✓');
  render();
}
/* Cron'un 5 dk'lık döngüsünü beklemeden aninda bir test push'u tetikler -
   "gönderildi ama cihaza gelmedi" durumunda sorunun sunucu tarafında mı
   (abonelik/VAPID) yoksa cihaz/işletim sistemi bildirim izninde mi olduğunu
   ayırt etmeye yarar. */
async function sendTestPush(){
  const resultEl = document.getElementById('testPushResult');
  const btn = document.getElementById('testPushBtn');
  const session = getSession();
  // Kendi cihazının abonelik uç noktasını (native'de FCM token, webte
  // PushSubscription.endpoint) sunucuya gönderiyoruz ki test bildirimi SADECE
  // bu cihaza gitsin - aksi halde aynı kullanıcının başka bir cihazda (örn.
  // hâlâ açık bir tarayıcı sekmesi) kayıtlı eski aboneliği de bildirimi alır
  // ve "telefondan gönderdim ama tarayıcıya geldi" yanılgısına yol açar.
  const deviceEndpoint = isNativeApp()
    ? getSavedFcmToken()
    : await registerServiceWorker().then(reg => reg ? reg.pushManager.getSubscription() : null).then(sub => sub ? sub.endpoint : '');
  if(!deviceEndpoint){
    resultEl.textContent = 'Bu cihazda push bildirimleri açık değil - önce "Bildirimleri Aç" butonuna basın.';
    return;
  }
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  resultEl.textContent = '';
  const { error } = await sb.rpc('send_test_push', { p_token: session.session_token, p_endpoint: deviceEndpoint });
  btn.disabled = false; btn.textContent = '🔔 Test Bildirimi Gönder';
  if(error){ resultEl.textContent = 'Gönderilemedi: ' + error.message; return; }
  resultEl.textContent = 'Test isteği gönderildi ✓ Birkaç saniye içinde bir bildirim görmelisiniz. Gelmezse: tarayıcının/işletim sisteminin bu site için bildirim iznini (kilit simgesi → Bildirimler → İzin Ver) ve bilgisayarınızın "Rahatsız Etmeyin/Odaklanma" modunun kapalı olduğunu kontrol edin.';
}
/* ---- Girişten sonra bildirimleri otomatik açmayı dene ----
   Ayarlar > Bildirimler'e gidip butona basmayı ya da bizim kendi
   "açmak ister misiniz?" banner'ımıza tıklamayı beklemek yerine, karar
   verilmemişse (izin durumu hâlâ 'default'/'prompt') girişten hemen sonra
   doğrudan izin isteğini (tarayıcı/işletim sisteminin KENDİ Aç/Reddet
   diyaloğu) tetikleyip aboneliği açıyoruz - bizim ekstra bir onay adımımız
   yok, tek adım o sistem diyaloğu. İzin zaten verilmişse (daha önce açılmış)
   yine de sunucudaki kaydı SESSİZCE tazeliyoruz (izin tekrar sorulmadan) -
   çünkü aynı kullanıcıyla başka bir cihazdan giriş yapılınca login_staff
   artık BÜTÜN push_subscriptions satırlarını temizliyor ("başka yerden
   giriş yapılınca diğer cihaz bildirim almasın" isteği), bu da mevcut
   cihazın kendi kaydını da siler - o kayıt burada geri yüklenmezse cihaz
   izni açık göründüğü hâlde sessizce bildirim almaz duruma düşerdi. İzin
   reddedilmişse hiç dokunulmaz. Electron'da da (window.Notification
   destekli) aynı şekilde çalışır. */
async function maybeShowPushPrompt(session){
  if(!session) return;
  // Anlık bildirimler bir eklenti: satın alınmamışsa izin de istenmez.
  if(!APP.config){
    const { data } = await sb.rpc('get_restaurant_config', { p_token: session.session_token });
    if(data){ APP.config = data; render(); }
  }
  if(!hasFeature('push_notifications')) return;
  if(isNativeApp()){
    const PN = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if(!PN) return;
    PN.checkPermissions().then(perm => {
      APP.nativePushPermState = perm.receive;
      render(); // ısrarcı bildirim banner'ı (bkz. pushReminderBannerHtml) ilk bilinen duruma göre güncellensin
      if(perm.receive === 'granted'){ resyncNativePushSubscription(session); return; }
      if(perm.receive !== 'prompt' && perm.receive !== 'prompt-with-rationale') return;
      togglePushNotifications();
    });
    return;
  }
  if(!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  if(Notification.permission === 'granted'){ resyncWebPushSubscription(session); return; }
  if(Notification.permission !== 'default') return;
  togglePushNotifications();
}
async function resyncNativePushSubscription(session){
  const token = await requestNativeFcmToken();
  if(!token) return;
  await APP.nativeChannelReady;
    const { error } = await sb.rpc('save_fcm_token', { p_token: session.session_token, p_fcm_token: token, p_channel: APP.nativePushChannel || 'default' });
  if(!error) setSavedFcmToken(token);
}
async function resyncWebPushSubscription(session){
  const reg = await registerServiceWorker();
  if(!reg) return;
  let sub = await reg.pushManager.getSubscription();
  if(!sub){
    try{ sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }); }
    catch(e){ return; }
  }
  const subJson = sub.toJSON();
  await sb.rpc('save_push_subscription', { p_token: session.session_token, p_endpoint: subJson.endpoint, p_p256dh: subJson.keys.p256dh, p_auth: subJson.keys.auth });
}
function currentBellScope(){ const el = document.getElementById('bellScopeSelect'); return el ? el.value : ''; }
function updateBellScopeStatus(){
  const statusEl = document.getElementById('bellScopeStatus'); if(!statusEl) return;
  const scope = currentBellScope();
  const sounds = getKitchenBellSounds();
  const val = scope ? sounds.perStation[scope] : sounds.default;
  const lib = val && val.custom ? sounds.library.find(x => x.id === val.custom) : null;
  let text;
  if(!val || (val.custom && !lib)) text = 'Bu kapsam için varsayılan zil ("' + BELL_PRESETS.classic.name + '") çalınacak.';
  else if(lib) text = '✓ Bu kapsam için yüklediğiniz "' + lib.name + '" sesi çalınacak.';
  else text = '✓ Bu kapsam için "' + (BELL_PRESETS[val.preset] ? BELL_PRESETS[val.preset].name : val.preset) + '" sesi seçili.';
  statusEl.textContent = text;
  renderBellPresetList();
}
function renderBellPresetList(){
  const el = document.getElementById('bellPresetList'); if(!el) return;
  const scope = currentBellScope();
  const sounds = getKitchenBellSounds();
  const val = scope ? sounds.perStation[scope] : sounds.default;
  const activeCustom = val && val.custom && sounds.library.some(x => x.id === val.custom) ? val.custom : null;
  const activePresetId = activeCustom ? null : ((val && val.preset) ? val.preset : 'classic');
  const libEl = document.getElementById('bellLibraryList');
  if(libEl){
    libEl.innerHTML = sounds.library.length ? sounds.library.map(item => {
      const active = item.id === activeCustom;
      return `<div class="bell-card ${active?'active':''}" onclick="selectBellCustom('${item.id}')">
        ${active?'<span class="bell-card-check">✓</span>':''}
        <button type="button" title="Sil" onclick="event.stopPropagation();deleteBellCustom('${item.id}')" style="position:absolute;top:6px;left:6px;width:24px;height:24px;padding:0;margin:0;border-radius:50%;background:var(--panel);color:var(--red);border:1px solid var(--border);font-size:12px;line-height:1;">✕</button>
        <div class="bell-card-icon">🎵</div>
        <div class="bell-card-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
        <button type="button" class="bell-card-play" onclick="event.stopPropagation();previewBellCustom('${item.id}')" title="Dinle">▶</button>
      </div>`;
    }).join('') : '<p class="muted" style="font-size:12.5px;margin:0;">Henüz ses yüklemediniz.</p>';
  }
  el.innerHTML = Object.keys(BELL_PRESETS).map(id => {
    const p = BELL_PRESETS[id];
    const active = id===activePresetId;
    return `<div class="bell-card ${active?'active':''}" onclick="selectBellPreset('${id}')">
      ${active?'<span class="bell-card-check">✓</span>':''}
      <div class="bell-card-icon">${p.icon||'🔔'}</div>
      <div class="bell-card-name">${escapeHtml(p.name)}</div>
      <button type="button" class="bell-card-play" onclick="event.stopPropagation();playBellPresetById('${id}')" title="Dinle">▶</button>
    </div>`;
  }).join('');
}
function assignBellValue(val){
  const sounds = getKitchenBellSounds();
  const scope = currentBellScope();
  if(scope) sounds.perStation[scope] = val; else sounds.default = val;
  if(setKitchenBellSounds(sounds)){ updateBellScopeStatus(); showToast('Kaydedildi ✓'); }
}
function selectBellCustom(id){ assignBellValue({ custom: id }); }
function previewBellCustom(id){
  const item = getKitchenBellSounds().library.find(x => x.id === id);
  if(item) playUploadedBell(item.data).catch(() => alert('Bu ses dosyası çalınamadı (bozuk ya da desteklenmeyen format olabilir).'));
}
function deleteBellCustom(id){
  const sounds = getKitchenBellSounds();
  const item = sounds.library.find(x => x.id === id);
  if(!item || !confirm('"' + item.name + '" sesi silinsin mi? Bu sesi kullanan istasyonlar varsayılan zile döner.')) return;
  sounds.library = sounds.library.filter(x => x.id !== id);
  if(sounds.default && sounds.default.custom === id) sounds.default = null;
  Object.keys(sounds.perStation).forEach(k => { if(sounds.perStation[k] && sounds.perStation[k].custom === id) delete sounds.perStation[k]; });
  if(setKitchenBellSounds(sounds)){ updateBellScopeStatus(); showToast('Silindi'); }
}
function selectBellPreset(presetId){ assignBellValue({ preset: presetId }); }
function uploadBellSound(){
  const input = document.getElementById('bellFileInput');
  const file = input.files[0];
  input.value = ''; // aynı dosya tekrar seçilebilsin
  if(!file) return;
  if(file.size > 800*1024){ alert('Ses dosyası çok büyük (maks. 800KB). Daha kısa/küçük bir dosya seçin.'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    const data = reader.result;
    // Kaydetmeden önce gerçekten çözülebildiğini doğrula.
    try{ await playUploadedBell(data); }
    catch(e){ alert('Bu dosya çalınamadı (bozuk ya da desteklenmeyen format). mp3 veya wav deneyin.'); return; }
    const sounds = getKitchenBellSounds();
    if(sounds.library.length >= BELL_LIBRARY_MAX){ alert('En fazla ' + BELL_LIBRARY_MAX + ' ses yükleyebilirsiniz. Önce kullanmadığınız bir sesi silin.'); return; }
    let item = sounds.library.find(x => x.data === data);
    if(!item){
      item = { id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2,6), name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Yüklenen ses', data };
      sounds.library.push(item);
    }
    const scope = currentBellScope();
    if(scope) sounds.perStation[scope] = { custom: item.id }; else sounds.default = { custom: item.id };
    if(setKitchenBellSounds(sounds)){ updateBellScopeStatus(); showToast('🎵 "' + item.name + '" eklendi ve seçildi'); }
  };
  reader.readAsDataURL(file);
}
function resetBellSound(){
  const scope = currentBellScope();
  const sounds = getKitchenBellSounds();
  if(scope){ if(sounds.perStation) delete sounds.perStation[scope]; }
  else sounds.default = null;
  setKitchenBellSounds(sounds);
  updateBellScopeStatus();
}
function testBellSound(){ playKitchenBell(currentBellScope() || null, (msg) => alert(msg)); }
/* Başlık/Genel Metin/Ürün Notu/Saat için renk+boyut+harf-stili alanlarını
   tek seferde okur (Kaydet ve canlı önizleme ikisi de kullanıyor). */
function readTicketTypography(){
  const out = {};
  ['Title','Text','Note','Time'].forEach(key => {
    out['color'+key] = document.getElementById('td_color'+key).value;
    out['size'+key] = parseInt(document.getElementById('td_size'+key).value) || undefined;
    out['transform'+key] = document.getElementById('td_transform'+key).value;
  });
  return out;
}
async function saveTicketDesign(){
  const ok = await setTicketDesign({
    width: document.getElementById('td_width').value,
    header: sanitizeRichHtml(document.getElementById('td_header').innerHTML.trim()),
    footer: sanitizeRichHtml(document.getElementById('td_footer').innerHTML.trim()),
    fontFamily: document.getElementById('td_font').value,
    bold: document.getElementById('td_bold').checked,
    marginTop: parseFloat(document.getElementById('td_mtop').value) || 0,
    marginRight: parseFloat(document.getElementById('td_mright').value) || 0,
    marginBottom: parseFloat(document.getElementById('td_mbottom').value) || 0,
    marginLeft: parseFloat(document.getElementById('td_mleft').value) || 0,
    showOrderNumber: document.getElementById('td_showOrderNumber').checked,
    showItemTime: document.getElementById('td_showItemTime').checked,
    copies: parseInt(document.getElementById('td_copiesVal').textContent) || 1,
    showHeaderTime: document.getElementById('td_showHeaderTime').checked,
    timeFormat: document.getElementById('td_timeFormat').value,
    timeBold: document.getElementById('td_timeBold').checked,
    ...readTicketTypography(),
  });
  if(ok) showToast('Kaydedildi ✓ (tüm cihazlarda geçerli)');
}
async function resetTicketDesign(){
  if(!confirm('Fiş tasarımı varsayılan ayarlara sıfırlansın mı?')) return;
  await setTicketDesign(TICKET_DESIGN_DEFAULTS);
  renderPrinterSettingsView(document.getElementById('main'), getSession());
  showToast('Varsayılana sıfırlandı ✓');
}
function stepTicketCopies(delta){
  const el = document.getElementById('td_copiesVal');
  const next = Math.max(1, Math.min(5, (parseInt(el.textContent)||1) + delta));
  el.textContent = next;
  updateTicketPreview();
}
function applyMarginPreset(mm){
  ['td_mtop','td_mbottom','td_mleft','td_mright'].forEach(id => { document.getElementById(id).value = mm; });
  updateTicketPreview();
}
let ELECTRON_PRINTERS_CACHE = null;
async function getElectronPrintersCached(forceRefresh){
  if(ELECTRON_PRINTERS_CACHE && !forceRefresh) return ELECTRON_PRINTERS_CACHE;
  ELECTRON_PRINTERS_CACHE = await window.electronAPI.listPrinters();
  return ELECTRON_PRINTERS_CACHE;
}
async function onNewPrinterTypeChange(forceRefresh){
  const type = document.getElementById('np_ptype').value;
  const wrap = document.getElementById('npElectronWrap');
  if(!wrap) return;
  if(type!=='electron'){ wrap.innerHTML=''; return; }
  if(!isDesktopApp()){
    wrap.innerHTML = '<p class="muted" style="font-size:12px;">Bu seçenek sadece Masaüstü Uygulaması içinde çalışır. Şu an tarayıcıdasınız — yine de ekleyebilirsiniz, uygulamayı kurup o bilgisayarda giriş yaptığınızda devreye girer.</p><label>İşletim Sistemi Yazıcısı Adı (opsiyonel)</label><input id="np_osprinter" placeholder="örn. POS-80C">';
    return;
  }
  // Yazici listesi (Electron IPC ile isletim sistemine sorulur) bir kez
  // cache'lenir - menu her acildiginda yeniden sormak gecikme hissi
  // yaratiyordu. "Yenile" ile elle tazelenebilir.
  const cached = ELECTRON_PRINTERS_CACHE;
  wrap.innerHTML = '<label>İşletim Sistemi Yazıcısı</label><div style="display:flex;gap:8px;"><select id="np_osprinter" style="flex:1;">'+(cached?'':'<option value="">Yükleniyor...</option>')+'</select><button type="button" class="sbtn" style="width:auto;" onclick="onNewPrinterTypeChange(true)">🔄 Yenile</button></div>';
  if(cached){
    const sel = document.getElementById('np_osprinter');
    sel.innerHTML = cached.length ? cached.map(p => `<option value="${escapeAttr(p.name)}" ${p.isDefault?'selected':''}>${escapeHtml(p.displayName||p.name)}${p.isDefault?' (varsayılan)':''}</option>`).join('') : '<option value="">Yazıcı bulunamadı</option>';
  }
  try{
    const list = await getElectronPrintersCached(forceRefresh);
    const sel = document.getElementById('np_osprinter');
    if(!sel) return;
    sel.innerHTML = list.length ? list.map(p => `<option value="${escapeAttr(p.name)}" ${p.isDefault?'selected':''}>${escapeHtml(p.displayName||p.name)}${p.isDefault?' (varsayılan)':''}</option>`).join('') : '<option value="">Yazıcı bulunamadı</option>';
  }catch(e){
    const sel = document.getElementById('np_osprinter');
    if(sel) sel.innerHTML = '<option value="">Yazıcı listesi alınamadı</option>';
  }
}
async function addPrinterEntry(){
  const name = document.getElementById('np_pname').value.trim();
  const type = document.getElementById('np_ptype').value;
  if(!name){ alert('Yazıcı adı girin'); return; }
  const id = 'p_' + Date.now();
  let usbInfo = null;
  let osPrinterName = null;
  if(type==='usb'){
    try{
      const device = await navigator.usb.requestDevice({ filters: [] });
      usbInfo = { vendorId: device.vendorId, productId: device.productId };
    }catch(e){
      alert('USB yazıcı seçilmedi/eşleştirilemedi: ' + e.message);
      return;
    }
  } else if(type==='electron'){
    const osSel = document.getElementById('np_osprinter');
    osPrinterName = osSel ? osSel.value.trim() : '';
  }
  const printers = getPrinters();
  const isFirstPrinter = printers.length===0;
  printers.push({ id, name, type, usbInfo, osPrinterName: osPrinterName || null });
  setPrinters(printers);
  // Ilk eklenen yazici otomatik olarak "Bu Ekranin Yazicisi" yapilir, boylece
  // sadece listeye eklenip hicbir yerde secilmedigi icin sessizce kullanilmama
  // durumu (kullanici siparis verdiginde hicbir sey basmadan gecmesi) onlenir.
  if(isFirstPrinter) setActivePrinterId(id);
  renderSettingsFromCurrentSession();
  showToast(isFirstPrinter ? 'Yazıcı eklendi ve bu ekranın yazıcısı yapıldı ✓' : 'Yazıcı eklendi ✓');
}
function removePrinterEntry(id){
  if(!confirm('Bu yazıcıyı silmek istediğinize emin misiniz?')) return;
  setPrinters(getPrinters().filter(p => p.id!==id));
  if(getActivePrinterId()===id) setActivePrinterId('');
  renderSettingsFromCurrentSession();
}
async function reconnectUsbPrinter(id){
  const printers = getPrinters();
  const p = printers.find(x => x.id===id);
  if(!p) return;
  try{
    const device = await navigator.usb.requestDevice({ filters: [] });
    p.usbInfo = { vendorId: device.vendorId, productId: device.productId };
    setPrinters(printers);
    alert('Yazıcı eşleştirildi: ' + device.productName || 'USB Yazıcı');
  }catch(e){
    alert('Eşleştirilemedi: ' + e.message);
  }
}
function testPrintPrinter(id){
  const printers = getPrinters();
  const p = printers.find(x => x.id===id);
  if(!p) return;
  printKitchenTicket('TEST', [{ qty:1, name:'Test Ürünü', note:'Bu bir test fişidir', added_at:new Date().toISOString() }], p, false, 0);
}
function renderSettingsFromCurrentSession(){
  const session = getSession();
  if(session) renderPrinterSettingsView(document.getElementById('main'), session);
}

/* iPhone/iPad: Safari sekmesinde (ana ekrana eklenmeden) açık mı? Ana ekrandan
   açılınca standalone olur; web push da ancak o zaman çalışır. */
function isIosDevice(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints > 1); }
function isStandaloneApp(){ return window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches); }
function isIosBrowserTab(){ return !isNativeApp() && isIosDevice() && !isStandaloneApp(); }
// Girişten sonra iOS Safari'de bir kez "Ana Ekrana Ekle" ipucu (kapatılınca 30 gün gösterilmez).
function maybeShowIosInstallHint(){
  if(!isIosBrowserTab() || document.getElementById('iosInstallHint')) return;
  try{ const t = +localStorage.getItem('rys_ios_hint_closed') || 0; if(Date.now() - t < 30*864e5) return; }catch(e){}
  const el = document.createElement('div'); el.id = 'iosInstallHint';
  el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:96;background:var(--panel);border:1px solid var(--border);border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:12px 14px;display:flex;gap:12px;align-items:center;font-size:13.5px;';
  el.innerHTML = '<img src="/assets/images/apple-touch-icon.png" alt="" style="width:40px;height:40px;border-radius:10px;flex:0 0 auto;">'
    + '<div style="flex:1;text-align:left;"><b>Peyktan\'ı ana ekrana ekleyin</b><br><span class="muted">Safari\'de alttaki Paylaş <b>⬆️</b> düğmesine, sonra <b>"Ana Ekrana Ekle"</b>ye dokunun. Tam ekran açılır, bildirim alırsınız.</span></div>'
    + '<button type="button" class="ghost-btn" style="margin:0;width:auto;padding:6px 10px;" aria-label="Kapat">✕</button>';
  el.querySelector('button').onclick = () => { try{ localStorage.setItem('rys_ios_hint_closed', String(Date.now())); }catch(e){} el.remove(); };
  document.body.appendChild(el);
}
