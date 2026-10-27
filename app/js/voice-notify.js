/* ---- Sesli bildirimler: rozetlere yeni bekleyen iş düştüğünde (ve mutfakta
   bir ürün 20 dk'yı geçtiğinde) cihaz Türkçe konuşarak duyurur, ör.
   "12 numaralı masadan yeni sipariş geldi", "12 numaralı masanın Adana siparişi 20 dakikadır bekliyor".
   Ayarlar kişiye/cihaza özeldir (localStorage), veritabanına yazılmaz. ---- */
const VOICE_TYPES = [
  { id:'kitchen',      ic:'🍳', label:'Mutfağa yeni sipariş', sample:'12 numaralı masadan yeni sipariş geldi' },
  { id:'late',         ic:'⏰', label:'Bekleyen mutfak siparişi (20 dk, sonra 5 dk’da bir)', sample:'12 numaralı masanın Adana ve Köfte siparişi 20 dakikadır bekliyor' },
  { id:'qr',           ic:'📱', label:'QR menüden sipariş', sample:'12 numaralı masadan QR menü siparişi geldi, onay bekliyor' },
  { id:'online',       ic:'🛵', label:'Online sipariş', sample:'Ahmet Yılmaz adına online gel-al siparişi geldi' },
  { id:'waiter',       ic:'🙋', label:'Garson çağırma', sample:'12 numaralı masa garson çağırıyor' },
  { id:'bill',         ic:'💳', label:'Hesap isteme', sample:'12 numaralı masa hesap istiyor' },
  { id:'ready',        ic:'✅', label:'Sipariş hazır', sample:'12 numaralı masanın siparişi hazır' },
  { id:'idle',         ic:'🪑', label:'Sipariş bekleyen masa', sample:'12 numaralı masanın siparişi bekleniyor, misafir masada oturuyor' },
  { id:'guests',       ic:'👥', label:'Kişi sayısı girilmemiş masa (girilene kadar 2 dk’da bir)', sample:'12 numaralı masanın kişi sayısı girilmedi' },
  { id:'seated',       ic:'🪑', label:'Misafir masaya oturdu', sample:'Bekleme listesindeki Ahmet Bey 12 numaralı masaya oturdu' },
  { id:'resvsoon',     ic:'⏳', label:'Rezervasyon hatırlatma (15 dk)', sample:'Ahmet Bey adına 4 kişilik rezervasyon 15 dakika sonra, 12 numaralı masa' },
  { id:'pickup',       ic:'🥡', label:'Gel-al alış saati geldi', sample:'Hakan Bey adına gel-al siparişinin alış saati geldi' },
  { id:'reservations', ic:'📅', label:'Yeni rezervasyon / bekleme listesi', sample:'Yeni rezervasyon talebi var' },
  { id:'messages',     ic:'💬', label:'Mesajlar', sample:'Yeni mesajınız var' },
  { id:'other',        ic:'🔔', label:'Diğer bildirimler', sample:'Yeni bildiriminiz var' },
];
const VOICE_LATE_MIN = 20;
const VOICE_KEY = 'peyk_voice_prefs';
function getVoicePrefs(){
  let p = {};
  try{ p = JSON.parse(localStorage.getItem(VOICE_KEY) || '{}') || {}; }catch(e){}
  const out = { enabled: p.enabled !== false, rate: p.rate || 1, voiceName: p.voiceName || '', types: {} };
  VOICE_TYPES.forEach(t => { const v = (p.types || {})[t.id] || {}; out.types[t.id] = { sound: v.sound !== false, voice: v.voice != null ? !!v.voice : !['messages','other'].includes(t.id) }; });
  // Yöneticinin belirlediği kural (rol bazlı) cihaz ayarının önüne geçer.
  const mine = (APP.voicePolicy && APP.voicePolicy.mine) || {};
  Object.keys(mine).forEach(k => { if(!out.types[k]) return; const m = mine[k]; out.types[k] = { sound: m !== 'off', voice: m === 'voice', locked: m }; });
  return out;
}
function setVoicePrefs(p){ try{ localStorage.setItem(VOICE_KEY, JSON.stringify(p)); }catch(e){} }
function setVoiceOpt(type, key, on){
  const p = getVoicePrefs();
  if(type==='*') p[key] = key==='rate' ? Number(on) || 1 : !!on;
  else p.types[type][key] = !!on;
  setVoicePrefs(p);
}
/* Bulut ses (Azure Neural, /api/tts): sunucuda anahtar varsa varsayılan budur;
   üretilen ses cihazda saklanır, aynı cümle tekrar istenmez. Hata olursa
   cihazın kendi sesine düşülür. */
let VOICE_CLOUD = null; const VOICE_CLOUD_MEM = new Map();
let VOICE_CLOUD_PROVIDER = null;
const VOICE_CLOUD_LIST = {
  elevenlabs: [['sarah','Sarah — kadın, sıcak'],['rachel','Rachel — kadın, sakin'],['charlotte','Charlotte — kadın, net'],['alice','Alice — kadın, kendinden emin'],['matilda','Matilda — kadın, samimi'],['lily','Lily — kadın, yumuşak'],
    ['adam','Adam — erkek, derin'],['antoni','Antoni — erkek, dengeli'],['daniel','Daniel — erkek, haber spikeri'],['george','George — erkek, olgun'],['brian','Brian — erkek, tok'],['callum','Callum — erkek, genç']],
  azure: [['emel','Emel — kadın'],['ahmet','Ahmet — erkek']],
};
// ElevenLabs hesabındaki tüm sesleri (Voice Library'den eklenenler dahil) listeye katar.
let VOICE_LIST_ERR = '';
const VOICE_GENDER_TR = { female: 'kadın', male: 'erkek', neutral: 'nötr' };
function voiceLoadCloudList(){
  fetch('/api/tts?voices=1&token=' + encodeURIComponent((getSession() || {}).session_token || '')).then(r => r.json()).then(j => {
    VOICE_LIST_ERR = j.error || '';
    const note = document.getElementById('voiceListErr'); if(note) note.textContent = VOICE_LIST_ERR ? 'Hesaptaki sesler alınamadı: ' + VOICE_LIST_ERR : '';
    const vs = (j.voices || []).filter(v => v.id && v.name);
    if(!vs.length) return;
    const known = new Set(VOICE_CLOUD_LIST.elevenlabs.map(([k]) => k));
    const extra = vs.filter(v => !VOICE_CLOUD_LIST.elevenlabs.some(([, l]) => l.split(' —')[0].toLowerCase()===String(v.name).split(' ')[0].toLowerCase()))
      .filter(v => !known.has(v.id))
      // Ücretsiz plan API'de yalnızca hazır (premade) sesleri kullanabiliyor; kütüphane sesleri listelenmez.
      .filter(v => !v.category || v.category === 'premade')
      .map(v => [v.id, v.name.split(' - ')[0] + ' — ' + [VOICE_GENDER_TR[v.gender] || v.gender, v.desc].filter(Boolean).join(', ')]);
    VOICE_CLOUD_LIST.elevenlabs = VOICE_CLOUD_LIST.elevenlabs.concat(extra);
    const el = document.getElementById('voiceNameSel'); if(el) el.outerHTML = voiceSelectHtml();
  }).catch(() => {});
}
fetch('/api/tts').then(r => r.json()).then(j => { VOICE_CLOUD = !!j.enabled; VOICE_CLOUD_PROVIDER = j.provider || 'azure'; if(j.provider==='elevenlabs') voiceLoadCloudList(); const el = document.getElementById('voiceNameSel'); if(el) el.outerHTML = voiceSelectHtml(); }).catch(() => { VOICE_CLOUD = false; });
async function voiceCloudPlay(text, voice){
  const p = getVoicePrefs(), s = getSession(); if(!s) throw new Error('no session');
  const k = voice + '|' + p.rate + '|' + text;
  let url = VOICE_CLOUD_MEM.get(k);
  if(!url){
    const cacheKey = '/tts-cache/' + encodeURIComponent(k);
    let blob = null, cache = null;
    try{ cache = await caches.open('peyktan-tts'); const hit = await cache.match(cacheKey); if(hit) blob = await hit.blob(); }catch(e){}
    if(!blob){
      // Doğal ses 4 sn içinde gelmezse beklenmez, cihaz sesiyle hemen okunur (bildirim gecikmesin).
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const to = ctl ? setTimeout(() => ctl.abort(), 4000) : null;
      let r;
      try{ r = await fetch('/api/tts', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ text, voice, rate: p.rate, token: s.session_token }), signal: ctl ? ctl.signal : undefined }); }
      finally{ if(to) clearTimeout(to); }
      if(!r.ok){ let m = 'tts ' + r.status; try{ m = (await r.json()).error || m; }catch(e){} throw new Error(m); }
      blob = await r.blob();
      try{ if(cache) await cache.put(cacheKey, new Response(blob, { headers:{ 'Content-Type':'audio/mpeg' } })); }catch(e){}
    }
    url = URL.createObjectURL(blob); VOICE_CLOUD_MEM.set(k, url);
  }
  voiceStop();
  const vol = Math.max(0.2, (getBellVolume() || 100) / 100);
  // Önce Web Audio (ilk dokunuşta açılan ses motoru): iOS/Android uygulamaları ve
  // tabletler, dokunuş olmadan başlatılan <audio> çalmayı engelleyebiliyor.
  const ctx = typeof KITCHEN_AUDIO_CTX !== 'undefined' ? KITCHEN_AUDIO_CTX : null;
  if(ctx && ctx.state === 'running'){
    try{
      let buf = VOICE_BUF_MEM.get(k);
      if(!buf){ buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer()); VOICE_BUF_MEM.set(k, buf); }
      const src = ctx.createBufferSource(), g = ctx.createGain();
      g.gain.value = vol; src.buffer = buf; src.connect(g); g.connect(ctx.destination); src.start();
      VOICE_AUDIO = { pause(){ try{ src.stop(); }catch(e){} }, paused: false };
      src.onended = () => { if(VOICE_AUDIO) VOICE_AUDIO.paused = true; };
      return;
    }catch(e){ /* <audio> ile denenir */ }
  }
  const a = VOICE_AUDIO_EL || new Audio(); a.src = url; a.volume = vol;
  VOICE_AUDIO = a;
  let started = false; a.addEventListener('playing', () => { started = true; }, { once: true });
  try{ await a.play(); }
  catch(e){ if(!started) throw e; }
}
// Çalan sesi/okumayı durdurur: yeni okuma eskisinin üstüne binmesin.
let VOICE_LAST_ERR = '', VOICE_SHOW_ERR = false;
let VOICE_AUDIO = null, VOICE_LAST = { t: '', at: 0 };
const VOICE_BUF_MEM = new Map();
// Mobil/tablet: ilk dokunuşta tek bir <audio> öğesi ve cihaz okuma motoru "açılır";
// sonraki bildirimler aynı öğeyle dokunuş beklemeden çalar.
let VOICE_AUDIO_EL = null;
['pointerdown','touchend','keydown'].forEach(ev => document.addEventListener(ev, function unlockVoice(){
  try{
    if(!VOICE_AUDIO_EL){ VOICE_AUDIO_EL = new Audio(); VOICE_AUDIO_EL.setAttribute('playsinline', ''); }
    VOICE_AUDIO_EL.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    VOICE_AUDIO_EL.play().catch(() => {});
    if(window.speechSynthesis){ const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
  }catch(e){}
}, { once: true, passive: true }));
function voiceStop(){
  try{ if(VOICE_AUDIO){ VOICE_AUDIO.pause(); VOICE_AUDIO = null; } }catch(e){}
  try{ if(window.speechSynthesis) speechSynthesis.cancel(); }catch(e){}
}
// Bildirimler sıraya alınır: biri bitmeden diğeri başlamaz (üst üste binmesin).
const VOICE_QUEUE = []; let VOICE_BUSY = false;
function voiceSpeak(text){
  // Aynı cümle 4 sn içinde ikinci kez gelirse (ör. aynı anda iki tetikleme) tekrar okunmaz.
  if(!text || (text===VOICE_LAST.t && Date.now() - VOICE_LAST.at < 4000) || VOICE_QUEUE.includes(text)) return;
  // Uygulama birden fazla sekmede/pencerede açıksa aynı bildirimi yalnızca biri okur.
  if(voiceRecentAcrossTabs(text)) return;
  VOICE_LAST = { t: text, at: Date.now() };
  if(VOICE_QUEUE.length >= 6) VOICE_QUEUE.shift();
  VOICE_QUEUE.push(text);
  voiceNext();
}
const VOICE_TAB_ID = Math.random().toString(36).slice(2);
function voiceRecentAcrossTabs(text){
  try{
    const now = Date.now();
    const list = (JSON.parse(localStorage.getItem('peyk_voice_recent') || '[]') || []).filter(x => now - x.at < 20000);
    if(list.some(x => x.t === text)) return true;
    list.push({ t: text, at: now });
    localStorage.setItem('peyk_voice_recent', JSON.stringify(list.slice(-20)));
  }catch(e){}
  return false;
}
// Başka bir sekme şu an okuyorsa beklenir (sekmeler arası tek ses).
function voiceOtherTabBusy(){
  try{ const b = JSON.parse(localStorage.getItem('peyk_voice_busy') || 'null'); return !!(b && b.id !== VOICE_TAB_ID && b.until > Date.now()); }catch(e){ return false; }
}
function voiceSetBusy(ms){ try{ if(ms) localStorage.setItem('peyk_voice_busy', JSON.stringify({ id: VOICE_TAB_ID, until: Date.now() + ms })); else localStorage.removeItem('peyk_voice_busy'); }catch(e){} }
function voiceWillSpeak(type){ const p = getVoicePrefs(); return !!(p.enabled && p.types[type] && p.types[type].voice); }
function voiceIsBusy(){ return VOICE_BUSY || voiceOtherTabBusy(); }
async function voiceNext(){
  if(VOICE_BUSY || !VOICE_QUEUE.length) return;
  if(voiceOtherTabBusy()){ setTimeout(voiceNext, 500); return; }
  VOICE_BUSY = true;
  const text = VOICE_QUEUE.shift();
  voiceSetBusy(Math.max(8000, text.length * 150));
  try{ await voicePlayOne(text); }catch(e){}
  voiceSetBusy(0);
  setTimeout(() => { VOICE_BUSY = false; voiceNext(); }, 400);
}
async function voicePlayOne(text){
  const name = getVoicePrefs().voiceName;
  const cloud = name.startsWith('cloud:') ? name.slice(6) : (!name && VOICE_CLOUD ? 'emel' : null);
  if(cloud && VOICE_CLOUD !== false){
    try{ await voiceCloudPlay(text, cloud); return await voiceWaitEnd(30000); }
    catch(e){
      // Ses aslında çalmaya başladıysa (geç gelen hata) aynı cümle cihaz sesiyle tekrar okunmaz.
      if(VOICE_AUDIO && !VOICE_AUDIO.paused) return await voiceWaitEnd(30000);
      VOICE_LAST_ERR = String((e && e.message) || e); if(VOICE_SHOW_ERR) showToast('⚠️ Doğal ses çalınamadı, cihaz sesi kullanıldı: ' + VOICE_LAST_ERR, 7000); }
  }
  return voiceDeviceSpeak(text);
}
// Çalan bulut sesinin bitmesini bekler (en fazla ms).
function voiceWaitEnd(ms){
  return new Promise(res => {
    const t0 = Date.now();
    const iv = setInterval(() => { if(!VOICE_AUDIO || VOICE_AUDIO.paused || VOICE_AUDIO.ended || Date.now() - t0 > ms){ clearInterval(iv); res(); } }, 200);
  });
}
function voiceDeviceSpeak(text){
  return new Promise(res => {
    try{
      if(!window.speechSynthesis || !text) return res();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'tr-TR'; u.rate = getVoicePrefs().rate;
      const v = voicePick();
      if(v) u.voice = v;
      const done = () => { clearTimeout(to); res(); };
      const to = setTimeout(res, Math.max(6000, text.length * 120));
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
    }catch(e){ res(); }
  });
}
/* Cihazdaki Türkçe sesler; doğal (neural/online) sesler öne alınır. */
function voiceList(){
  try{
    const score = (v) => (/natural|neural|online/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : /microsoft/i.test(v.name) ? 2 : 3);
    return speechSynthesis.getVoices().filter(x => /^tr/i.test(x.lang)).sort((a, b) => score(a) - score(b));
  }catch(e){ return []; }
}
function voicePick(){
  const list = voiceList(), name = getVoicePrefs().voiceName.replace(/^cloud:.*/, '');
  return list.find(v => v.name===name) || list[0] || null;
}
function setVoiceName(n){ const p = getVoicePrefs(); p.voiceName = n; setVoicePrefs(p); VOICE_LAST.t = ''; VOICE_SHOW_ERR = true; voiceSpeak('12 numaralı masadan yeni sipariş geldi'); setTimeout(() => { VOICE_SHOW_ERR = false; }, 8000); }
try{ if(window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { const el = document.getElementById('voiceNameSel'); if(el) el.outerHTML = voiceSelectHtml(); }; }catch(e){}
function voiceSelectHtml(){
  const list = voiceList(), pn = getVoicePrefs().voiceName;
  const cloudCur = pn.startsWith('cloud:') ? pn : (!pn && VOICE_CLOUD ? 'cloud:emel' : '');
  const cur = cloudCur || (voicePick() || {}).name;
  const cl = VOICE_CLOUD_LIST[VOICE_CLOUD_PROVIDER] || [];
  // Eski "emel/ahmet" seçimi listedeki ilk kadın/erkek sese karşılık gelir.
  const curC = cur==='cloud:emel' && VOICE_CLOUD_PROVIDER==='elevenlabs' ? 'cloud:sarah' : cur==='cloud:ahmet' && VOICE_CLOUD_PROVIDER==='elevenlabs' ? 'cloud:adam' : cur;
  const cloudOpts = VOICE_CLOUD && cl.length ? `<optgroup label="⭐⭐ Doğal sesler (${cl.length})">${cl.map(([v,l]) => `<option value="cloud:${v}" ${curC==='cloud:'+v?'selected':''}>${l}</option>`).join('')}</optgroup>` : '';
  if(!list.length && !cloudOpts) return '<select id="voiceNameSel" style="width:auto;" disabled><option>Türkçe ses bulunamadı</option></select>';
  return `<select id="voiceNameSel" style="width:auto;max-width:260px;" ${actOn('change','setVoiceName',['$value'])}>${cloudOpts}${list.length && cloudOpts ? '<optgroup label="Cihaz sesleri">' : ''}${list.map(v => `<option value="${escapeAttr(v.name)}" ${v.name===cur?'selected':''}>${escapeHtml(v.name.replace(/^(Microsoft|Google)\s*/,''))}${/natural|neural|online/i.test(v.name)?' ⭐':''}</option>`).join('')}${list.length && cloudOpts ? '</optgroup>' : ''}</select>`;
}
function testVoice(type){ const t = VOICE_TYPES.find(x => x.id===type); VOICE_LAST.t = ''; try{ localStorage.removeItem('peyk_voice_recent'); }catch(e){} VOICE_SHOW_ERR = true; if(t) voiceSpeak(t.sample); setTimeout(() => { VOICE_SHOW_ERR = false; }, 8000); }
// Rozet öğesinin sesli bildirim türü.
function voiceTypeOf(view, x){
  const k = x && x.kind;
  if(view==='kitchen') return 'kitchen';
  if(view==='order') return k==='customer_request' ? (x.table ? 'qr' : 'online') : k==='waiter_call' ? 'waiter' : k==='idle_table' ? 'idle' : k==='no_guests' ? 'guests' : 'other';
  if(view==='payments') return k==='waiter_call' ? 'bill' : k==='ready' ? 'ready' : 'other';
  if(view==='reservations' || view==='messages') return view;
  return 'other';
}
// Masa adını cümleye uygun hale getirir: "12" -> "12 numaralı masa", "Bahçe 3" -> "Bahçe 3 masası", "Paket Ahmet" olduğu gibi.
function voiceMasa(tb, hal){
  let t = String(tb || '').trim().replace(/^masa\s*(?=\d)|^masa\s+/i, '');
  if(!t) return { nom:'bir masa', abl:'bir masadan', gen:'bir masanın', dat:'bir masaya' }[hal];
  if(/^paket\b/i.test(t)) return { nom:t, abl:t + ' için', gen:t, dat:t }[hal];
  if(/^\d+$/.test(t)) return t + ' numaralı ' + { nom:'masa', abl:'masadan', gen:'masanın', dat:'masaya' }[hal];
  return t + ' ' + { nom:'masası', abl:'masasından', gen:'masasının', dat:'masasına' }[hal];
}
const voiceList2 = (a) => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' ve ' + a[a.length - 1];
const voiceTables = (items) => [...new Set(items.map(x => String(x.table || '').trim()))];
function voiceTextFor(type, items){
  const T = voiceTables(items);
  switch(type){
    case 'kitchen': return T.map(t => voiceMasa(t, 'abl') + ' yeni sipariş geldi').join('. ');
    case 'late': {
      const byT = {}, minT = {}; items.forEach(x => { const k = String(x.table || '').trim(); (byT[k] = byT[k] || []).push(x.name || 'ürün'); minT[k] = Math.max(minT[k] || 0, x.lateMin || VOICE_LATE_MIN); });
      return Object.entries(byT).map(([t, ns]) => voiceMasa(t, 'gen') + ' ' + voiceList2([...new Set(ns)]) + ' siparişi ' + minT[t] + ' dakikadır bekliyor').join('. ');
    }
    case 'qr': return T.map(t => voiceMasa(t, 'abl') + ' QR menü siparişi geldi, onay bekliyor').join('. ');
    case 'online': return items.map(x => (x.name ? x.name + ' adına ' : 'Yeni ') + 'online ' + (x.otype==='delivery' ? 'teslimat' : x.otype==='pickup' ? 'gel-al' : '') + ' siparişi geldi').join('. ').replace(/\s+/g, ' ');
    case 'waiter': return T.map(t => voiceMasa(t, 'nom') + ' garson çağırıyor').join('. ');
    case 'bill': return T.map(t => voiceMasa(t, 'nom') + ' hesap istiyor').join('. ');
    case 'ready': return T.map(t => voiceMasa(t, 'gen') + ' siparişi hazır').join('. ');
    case 'seated': return items.map(x => (x.kind==='waitlist' ? 'Bekleme listesindeki ' : 'Rezervasyonlu ') + (x.name || 'misafir') + ' ' + voiceMasa(x.table, 'dat') + ' oturdu').join('. ');
    case 'pickup': return items.map(x => (x.name ? x.name + ' adına' : (x.no ? x.no + ' numaralı' : 'Bir')) + ' gel-al siparişinin alış saati geldi' + (x.ready ? '' : ', sipariş henüz hazır değil')).join('. ');
    case 'guests': return T.map(t => voiceMasa(t, 'gen') + ' kişi sayısı girilmedi').join('. ');
    case 'idle': return items.map(x => { const t = String(x.label || '').replace(/^🪑\s*/, '').split(' · ')[0]; return voiceMasa(t, 'gen') + ' siparişi bekleniyor, misafir masada oturuyor'; }).join('. ');
    case 'reservations': return items.map(x => {
      const name = x.name || String(x.label || '').replace(/^\W+/u, '').split(/ · | \(/)[0].trim();
      if(x.kind === 'waitlist') return 'Bekleme listesine yeni misafir eklendi' + (name ? ': ' + name : '');
      return /onay bekliyor/.test(x.label || '') ? 'Yeni rezervasyon talebi var' + (name ? ', ' + name + ' adına' : '') : (name ? name + ' adına rezervasyon yaklaşıyor' : 'Rezervasyon yaklaşıyor');
    }).join('. ');
    case 'messages': return 'Yeni mesajınız var';
    case 'other': return items.length === 1 && items[0].label ? String(items[0].label).replace(/^\W+/u, '') : 'Yeni bildiriminiz var';
    case 'resvsoon': return items.map(x => {
      const mins = Math.round((new Date(x.time).getTime() - Date.now()) / 60000);
      const when = mins > 1 ? mins + ' dakika sonra' : 'şimdi';
      return (x.name ? x.name + ' adına ' : '') + (x.party ? x.party + ' kişilik ' : '') + 'rezervasyon ' + when + (x.table ? ', ' + voiceMasa(x.table, 'nom') : '');
    }).join('. ');
  }
  const t = VOICE_TYPES.find(x => x.id===type);
  return t ? t.sample : 'Yeni bildiriminiz var';
}
/* refreshNavBadges'ten her tazelemede çağrılır. İlk çağrı yalnızca mevcut
   durumu öğrenir (açılışta eski işleri okumasın). Dönüş: ses çalındıysa true. */
// Kendi gönderdiğimiz siparişler: masa adı + zaman; mutfak sesli bildiriminde atlanır.
const VOICE_SELF = [];
function voiceMarkSelfOrder(label){ VOICE_SELF.push({ label: String(label || '').toLocaleLowerCase('tr'), at: Date.now() }); while(VOICE_SELF.length > 20) VOICE_SELF.shift(); }
function voiceIsSelf(x){
  // Sunucu saati ile cihaz saati farklı olabilir: ürünün eklenme saatine değil,
  // bu cihazın gönderimden sonraki 90 sn içinde gördüğü yeni ürünlere bakılır.
  const now = Date.now(), name = String(x.table || '').toLocaleLowerCase('tr').trim();
  return VOICE_SELF.some(s => now - s.at <= 90000 && (!s.label || !name || s.label.trim() === name || s.label.includes(name) || name.includes(s.label)));
}
let VOICE_SEEN = null, VOICE_LATE_SEEN = new Map(), VOICE_RESV_SEEN = new Set(), VOICE_GUEST_LAST = new Map();
const VOICE_GUEST_REPEAT_MS = 2 * 60 * 1000;
function processVoiceBadges(data, visibleViews){
  const items = (data && data._items) || {};
  const ids = new Set();
  const fresh = {};
  visibleViews.forEach(v => (items[v] || []).forEach(x => {
    const key = v + ':' + (x.id || x.label);
    ids.add(key);
    const ty = voiceTypeOf(v, x);
    if(ty && VOICE_SEEN && !VOICE_SEEN.has(key)) (fresh[ty] = fresh[ty] || []).push(x);
  }));
  // Alış saati gelen gel-al siparişleri (sunucudan _pickups): her sipariş bir kez.
  (data && data._pickups || []).forEach(x => {
    const key = 'pick:' + x.id + ':' + x.at; ids.add(key);
    if(VOICE_SEEN && !VOICE_SEEN.has(key)) (fresh.pickup = fresh.pickup || []).push(x);
  });
  // Yaklaşan rezervasyonlar (15 dk içinde, sunucudan _upcoming): her rezervasyon bir kez.
  (data && data._upcoming || []).forEach(x => {
    const key = 'soon:' + x.id; ids.add(key);
    if(!VOICE_RESV_SEEN.has(x.id)){ VOICE_RESV_SEEN.add(x.id); (fresh.resvsoon = fresh.resvsoon || []).push(x); }
  });
  // Masaya oturan bekleme listesi / rezervasyon misafirleri (son 5 dk, sunucudan _seated).
  (data && data._seated || []).forEach(x => {
    const key = 'seat:' + x.id; ids.add(key);
    if(VOICE_SEEN && !VOICE_SEEN.has(key)) (fresh.seated = fresh.seated || []).push(x);
  });
  // Kişi sayısı girilmemiş masalar: girilene kadar her 2 dakikada bir tekrar hatırlatılır.
  const now = Date.now(), gl = [];
  (items.order || []).filter(x => x.kind === 'no_guests').forEach(x => {
    const last = VOICE_GUEST_LAST.get(x.id);
    if(last == null){ VOICE_GUEST_LAST.set(x.id, now); return; } // ilk görülüşü yukarıdaki yeni-öğe akışı okur
    if(now - last >= VOICE_GUEST_REPEAT_MS){ VOICE_GUEST_LAST.set(x.id, now); gl.push(x); }
  });
  [...VOICE_GUEST_LAST.keys()].forEach(id => { if(!(items.order || []).some(x => x.id === id && x.kind === 'no_guests')) VOICE_GUEST_LAST.delete(id); });
  if(gl.length && visibleViews.includes('order')) fresh.guests = (fresh.guests || []).concat(gl.filter(x => !(fresh.guests || []).some(y => y.id === x.id)));
  const late = [];
  (items.kitchen || []).forEach(x => {
    if(!x.at) return;
    // 20. dakikada, sonra her 5 dakikada bir (25, 30, ...) yeniden okunur (telefon bildirimiyle aynı kademeler).
    const mins = (Date.now() - new Date(x.at).getTime()) / 60000;
    if(mins < VOICE_LATE_MIN) return;
    const stage = Math.floor((mins - VOICE_LATE_MIN) / 5);
    if(VOICE_LATE_SEEN.has(x.id) && VOICE_LATE_SEEN.get(x.id) >= stage) return;
    VOICE_LATE_SEEN.set(x.id, stage);
    if(VOICE_SEEN) late.push(Object.assign({}, x, { lateMin: VOICE_LATE_MIN + stage * 5 }));
  });
  if(late.length && visibleViews.includes('kitchen')) fresh.late = late;
  // Yazılı uyarı sesli okumayla aynı anda çıksın (mutfak ekranının kendi uyarısı bu ürünler için tekrar çıkmaz).
  if(late.length && visibleViews.includes('kitchen') && typeof kitchenLateWarnedSet === 'function'){
    const seen = kitchenLateWarnedSet();
    late.forEach(x => seen.add(String(x.id)));
    try{ sessionStorage.setItem('peyk_kitchen_late', JSON.stringify([...seen].slice(-500))); }catch(e){}
    const names = late.map(x => (x.table ? x.table + ' - ' : '') + (x.qty ? x.qty + 'x ' : '') + (x.name || 'ürün'));
    const maxMin = Math.max(...late.map(x => x.lateMin || VOICE_LATE_MIN));
    showToast('⏰ ' + names.slice(0, 3).join(', ') + (names.length > 3 ? ' ve ' + (names.length - 3) + ' ürün daha' : '') + ' ' + maxMin + ' dakikayı geçti!', 30000, null, () => goToView('kitchen'), true);
  }
  const first = !VOICE_SEEN;
  VOICE_SEEN = ids;
  // Uygulama ilk açıldığında eski bildirimler okunmaz; ama 15 dk içindeki rezervasyon yine hatırlatılır.
  if(first){ if(!fresh.resvsoon) return false; Object.keys(fresh).forEach(k => { if(k !== 'resvsoon') delete fresh[k]; }); }
  const p = getVoicePrefs();
  if(!p.enabled) return false;
  let sound = false;
  Object.entries(fresh).forEach(([type, list]) => {
    const tp = p.types[type]; if(!tp) return;
    // Sesli okunan bildirimde zil ayrıca çalınmaz; zil yalnızca sesli okuma kapalı türlerde.
    if(tp.sound && !tp.voice && type!=='kitchen') sound = true;
    if(tp.voice) voiceSpeak(voiceTextFor(type, list));
    // Uygulama arka plandaysa (başka pencere/sekme açık) bilgisayarda da bildirim kutusu çıksın.
    voiceDesktopNotify(type, list);
  });
  // Tekrar hatırlatmada rozet sayısı artmadığı için zil burada çalınır (sesli okuma kapalıysa).
  const tg = p.types.guests; if(gl.length && tg && tg.sound && !tg.voice && typeof playPeyktanSound === 'function') playPeyktanSound();
  return sound;
}
const VOICE_TYPE_VIEW = { kitchen:'kitchen', late:'kitchen', qr:'order', online:'order', waiter:'order', idle:'order', guests:'order', bill:'payments', ready:'payments',
  seated:'reservations', resvsoon:'reservations', reservations:'reservations', pickup:'packages', messages:'messages' };
function voiceDesktopNotify(type, list){
  try{
    if(!document.hidden && document.hasFocus()) return;
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    const t = VOICE_TYPES.find(x => x.id===type) || {};
    const n = new Notification('Peyktan · ' + (t.label || 'Bildirim'), { body: voiceTextFor(type, list), icon: '/assets/images/logo.webp', tag: 'peyk-' + type, renotify: true });
    const view = VOICE_TYPE_VIEW[type];
    n.onclick = () => { try{ window.focus(); if(window.electronAPI && window.electronAPI.focusWindow) window.electronAPI.focusWindow(); }catch(e){} n.close(); if(view) openViewFromNotification(view); };
  }catch(e){}
}
function voiceSettingsHtml(){
  const p = getVoicePrefs();
  const sw = (type, key, on) => `<input type="checkbox" class="sw" ${on?'checked':''} ${actOn('change','setVoiceOpt',[type, key, '$checked'])}>`;
  return `<div class="u-mwn box">
    <h2>🗣️ Sesli ve Sesli Okunan Bildirimler</h2>
    <p class="u-tl muted">Her bildirim türü için bu cihazda <b>zil sesi</b> çalınsın mı ve bildirim <b>sesli okunsun</b> mu (ör. “12 numaralı masadan yeni sipariş geldi”) seçin. Mutfakta ${VOICE_LATE_MIN} dakikayı geçen ürünler “… dakikadır bekliyor” diye okunur ve hazır olana kadar 5 dakikada bir tekrarlanır.</p>
    <div style="display:flex;align-items:center;gap:10px;margin:10px 0 14px;flex-wrap:wrap;">${sw('*','enabled',p.enabled)}<b>Sesli bildirimler açık</b>
      <span class="muted" style="margin-left:auto;font-size:12.5px;">Ses</span>${voiceSelectHtml()}
      <span class="u-fs125 muted">Hız</span>
      <select style="width:auto;" ${actOn('change','setVoiceOpt',['*','rate','$value'])}>
        ${[[0.8,'Yavaş'],[1,'Normal'],[1.2,'Hızlı']].map(([v,l]) => `<option value="${v}" ${p.rate==v?'selected':''}>${l}</option>`).join('')}
      </select></div>
    <div class="vn-list">
      <div class="vn-row vn-head"><span>Bildirim</span><span>Zil</span><span>Sesli Oku</span><span></span></div>
      ${VOICE_TYPES.map(t => `<div class="vn-row">
        <span>${t.ic} ${escapeHtml(t.label)}<small class="muted">“${escapeHtml(t.sample)}”</small></span>
        ${p.types[t.id].locked ? `<span style="grid-column:span 2;"><small class="pchip" title="Yönetici belirledi">🔒 ${{ voice:'Sesli okunur', sound:'Sadece zil', off:'Size gönderilmiyor' }[p.types[t.id].locked]}</small></span>` : `<span>${t.id==='kitchen' ? '<small class="muted">Mutfak zili</small>' : sw(t.id,'sound',p.types[t.id].sound)}</span>
        <span>${sw(t.id,'voice',p.types[t.id].voice)}</span>`}
        <span><button type="button" class="sbtn" style="width:auto;padding:6px 12px;" ${act('testVoice', t.id)}>▶ Dinle</button></span>
      </div>`).join('')}
    </div>
    ${window.speechSynthesis ? '' : '<p class="muted" style="color:var(--danger);">Bu cihaz/tarayıcı sesli okumayı desteklemiyor.</p>'}
    <p id="voiceListErr" class="muted" style="font-size:12.5px;text-align:left;color:var(--danger);">${VOICE_LIST_ERR ? 'Hesaptaki sesler alınamadı: ' + escapeHtml(VOICE_LIST_ERR) : ''}</p>
    <p class="muted" style="font-size:12.5px;text-align:left;margin-top:10px;">⭐⭐ doğal bulut sesleridir (her cihazda aynı). Diğer sesler cihazın kendi Türkçe okuma motorundan gelir. ⭐ işaretli “doğal” sesler en iyisidir: Windows'ta Microsoft Edge ya da Ayarlar › Zaman ve Dil › Konuşma'dan <b>Emel / Ahmet (Natural)</b>, Android'de “Google Konuşma Hizmetleri” Türkçe paketi önerilir.</p>
  </div>`;
}

/* Yöneticinin sesli bildirim kuralı: kim, hangi türü sesli/zil olarak alır (sunucudan, rol bazlı). */
async function loadVoicePolicy(){
  const s = getSession(); if(!s) return;
  const { data, error } = await sb.rpc('get_voice_policy', { p_token: s.session_token });
  if(!error && data) APP.voicePolicy = data;
}
