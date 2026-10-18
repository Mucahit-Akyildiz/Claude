/* ---- Sesli bildirimler: rozetlere yeni bekleyen iş düştüğünde (ve mutfakta
   bir ürün 20 dk'yı geçtiğinde) cihaz Türkçe konuşarak duyurur, ör.
   "Masa 34 sipariş bekliyor", "Masa 42: Adana, Köfte gecikti".
   Ayarlar kişiye/cihaza özeldir (localStorage), veritabanına yazılmaz. ---- */
const VOICE_TYPES = [
  { id:'kitchen',      ic:'🍳', label:'Mutfağa yeni sipariş', sample:'Masa 34 sipariş bekliyor' },
  { id:'late',         ic:'⏰', label:'Geciken mutfak siparişi', sample:'Masa 42: Adana, Köfte gecikti' },
  { id:'payments',     ic:'💳', label:'Ödeme / hesap bekleyen', sample:'Masa 12 hesap bekliyor' },
  { id:'packages',     ic:'📦', label:'Paket servis', sample:'Yeni paket siparişi' },
  { id:'reservations', ic:'📅', label:'Rezervasyon / bekleme listesi', sample:'Yeni rezervasyon' },
  { id:'messages',     ic:'💬', label:'Mesajlar', sample:'Yeni mesaj' },
  { id:'other',        ic:'🔔', label:'Diğer bildirimler', sample:'Yeni bildirim' },
];
const VOICE_LATE_MIN = 20;
const VOICE_KEY = 'peyk_voice_prefs';
function getVoicePrefs(){
  let p = {};
  try{ p = JSON.parse(localStorage.getItem(VOICE_KEY) || '{}') || {}; }catch(e){}
  const out = { enabled: p.enabled !== false, rate: p.rate || 1, voiceName: p.voiceName || '', types: {} };
  VOICE_TYPES.forEach(t => { const v = (p.types || {})[t.id] || {}; out.types[t.id] = { sound: v.sound !== false, voice: v.voice != null ? !!v.voice : (t.id==='kitchen' || t.id==='late') }; });
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
  fetch('/api/tts?voices=1').then(r => r.json()).then(j => {
    VOICE_LIST_ERR = j.error || '';
    const note = document.getElementById('voiceListErr'); if(note) note.textContent = VOICE_LIST_ERR ? 'Hesaptaki sesler alınamadı: ' + VOICE_LIST_ERR : '';
    const vs = (j.voices || []).filter(v => v.id && v.name);
    if(!vs.length) return;
    const known = new Set(VOICE_CLOUD_LIST.elevenlabs.map(([k]) => k));
    const extra = vs.filter(v => !VOICE_CLOUD_LIST.elevenlabs.some(([, l]) => l.split(' —')[0].toLowerCase()===String(v.name).split(' ')[0].toLowerCase()))
      .filter(v => !known.has(v.id))
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
      const r = await fetch('/api/tts', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ text, voice, rate: p.rate, token: s.session_token }) });
      if(!r.ok){ let m = 'tts ' + r.status; try{ m = (await r.json()).error || m; }catch(e){} throw new Error(m); }
      blob = await r.blob();
      try{ if(cache) await cache.put(cacheKey, new Response(blob, { headers:{ 'Content-Type':'audio/mpeg' } })); }catch(e){}
    }
    url = URL.createObjectURL(blob); VOICE_CLOUD_MEM.set(k, url);
  }
  voiceStop();
  const a = new Audio(url); a.volume = Math.max(0.2, (getBellVolume() || 100) / 100);
  VOICE_AUDIO = a;
  let started = false; a.addEventListener('playing', () => { started = true; }, { once: true });
  try{ await a.play(); }
  catch(e){ if(!started) throw e; }
}
// Çalan sesi/okumayı durdurur: yeni okuma eskisinin üstüne binmesin.
let VOICE_LAST_ERR = '', VOICE_SHOW_ERR = false;
let VOICE_AUDIO = null, VOICE_LAST = { t: '', at: 0 };
function voiceStop(){
  try{ if(VOICE_AUDIO){ VOICE_AUDIO.pause(); VOICE_AUDIO = null; } }catch(e){}
  try{ if(window.speechSynthesis) speechSynthesis.cancel(); }catch(e){}
}
function voiceSpeak(text){
  // Aynı cümle 4 sn içinde ikinci kez gelirse (ör. aynı anda iki tetikleme) tekrar okunmaz.
  if(text===VOICE_LAST.t && Date.now() - VOICE_LAST.at < 4000) return;
  VOICE_LAST = { t: text, at: Date.now() };
  const name = getVoicePrefs().voiceName;
  const cloud = name.startsWith('cloud:') ? name.slice(6) : (!name && VOICE_CLOUD ? 'emel' : null);
  if(cloud && VOICE_CLOUD !== false){ voiceCloudPlay(text, cloud).catch((e) => { VOICE_LAST_ERR = String((e && e.message) || e); voiceDeviceSpeak(text); if(VOICE_SHOW_ERR) showToast('⚠️ Doğal ses çalınamadı, cihaz sesi kullanıldı: ' + VOICE_LAST_ERR, 7000); }); return; }
  voiceDeviceSpeak(text);
}
function voiceDeviceSpeak(text){
  try{
    if(VOICE_AUDIO && !VOICE_AUDIO.paused) return;
    if(window.speechSynthesis) speechSynthesis.cancel();
    if(!window.speechSynthesis || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR'; u.rate = getVoicePrefs().rate;
    const v = voicePick();
    if(v) u.voice = v;
    speechSynthesis.speak(u);
  }catch(e){}
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
function setVoiceName(n){ const p = getVoicePrefs(); p.voiceName = n; setVoicePrefs(p); VOICE_LAST.t = ''; VOICE_SHOW_ERR = true; voiceSpeak('Masa 34 sipariş bekliyor'); setTimeout(() => { VOICE_SHOW_ERR = false; }, 8000); }
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
function testVoice(type){ const t = VOICE_TYPES.find(x => x.id===type); VOICE_LAST.t = ''; VOICE_SHOW_ERR = true; if(t) voiceSpeak(t.sample); setTimeout(() => { VOICE_SHOW_ERR = false; }, 8000); }
function voiceTypeOf(view){ return VOICE_TYPES.some(t => t.id===view) ? view : 'other'; }
function voiceTableName(x){ const t = String(x.table || '').trim(); return t ? (/^\d+$/.test(t) ? 'Masa ' + t : t) : ''; }
function voiceTextFor(type, items){
  if(type==='kitchen'){
    const tables = [...new Set(items.map(voiceTableName).filter(Boolean))];
    return tables.length ? tables.join(', ') + ' sipariş bekliyor' : 'Yeni mutfak siparişi';
  }
  if(type==='late'){
    const byT = {};
    items.forEach(x => { const k = voiceTableName(x) || 'Bir masa'; (byT[k] = byT[k] || []).push(x.name || 'ürün'); });
    return Object.entries(byT).map(([t, ns]) => t + ': ' + [...new Set(ns)].join(', ') + ' gecikti').join('. ');
  }
  const t = VOICE_TYPES.find(x => x.id===type);
  return items.length===1 && items[0].label ? items[0].label : (t ? t.sample : 'Yeni bildirim');
}
/* refreshNavBadges'ten her tazelemede çağrılır. İlk çağrı yalnızca mevcut
   durumu öğrenir (açılışta eski işleri okumasın). Dönüş: ses çalındıysa true. */
let VOICE_SEEN = null, VOICE_LATE_SEEN = new Set();
function processVoiceBadges(data, visibleViews){
  const items = (data && data._items) || {};
  const ids = new Set();
  const fresh = {};
  visibleViews.forEach(v => (items[v] || []).forEach(x => {
    const key = v + ':' + (x.id || x.label);
    ids.add(key);
    if(VOICE_SEEN && !VOICE_SEEN.has(key)) (fresh[voiceTypeOf(v)] = fresh[voiceTypeOf(v)] || []).push(x);
  }));
  const late = [];
  (items.kitchen || []).forEach(x => {
    if(!x.at || VOICE_LATE_SEEN.has(x.id)) return;
    if(Date.now() - new Date(x.at).getTime() >= VOICE_LATE_MIN * 60000){ VOICE_LATE_SEEN.add(x.id); if(VOICE_SEEN) late.push(x); }
  });
  if(late.length && visibleViews.includes('kitchen')) fresh.late = late;
  const first = !VOICE_SEEN;
  VOICE_SEEN = ids;
  if(first) return false;
  const p = getVoicePrefs();
  if(!p.enabled) return false;
  let sound = false;
  Object.entries(fresh).forEach(([type, list]) => {
    const tp = p.types[type]; if(!tp) return;
    if(tp.sound && type!=='kitchen') sound = true;
    if(tp.voice) voiceSpeak(voiceTextFor(type, list));
  });
  return sound;
}
function voiceSettingsHtml(){
  const p = getVoicePrefs();
  const sw = (type, key, on) => `<input type="checkbox" class="sw" ${on?'checked':''} ${actOn('change','setVoiceOpt',[type, key, '$checked'])}>`;
  return `<div class="box" style="max-width:none;">
    <h2>🗣️ Sesli ve Sesli Okunan Bildirimler</h2>
    <p class="muted" style="text-align:left;">Her bildirim türü için bu cihazda <b>zil sesi</b> çalınsın mı ve bildirim <b>sesli okunsun</b> mu (ör. “Masa 34 sipariş bekliyor”) seçin. Mutfakta ${VOICE_LATE_MIN} dakikayı geçen ürünler bir kez “gecikti” diye okunur.</p>
    <div style="display:flex;align-items:center;gap:10px;margin:10px 0 14px;flex-wrap:wrap;">${sw('*','enabled',p.enabled)}<b>Sesli bildirimler açık</b>
      <span class="muted" style="margin-left:auto;font-size:12.5px;">Ses</span>${voiceSelectHtml()}
      <span class="muted" style="font-size:12.5px;">Hız</span>
      <select style="width:auto;" ${actOn('change','setVoiceOpt',['*','rate','$value'])}>
        ${[[0.8,'Yavaş'],[1,'Normal'],[1.2,'Hızlı']].map(([v,l]) => `<option value="${v}" ${p.rate==v?'selected':''}>${l}</option>`).join('')}
      </select></div>
    <div class="vn-list">
      <div class="vn-row vn-head"><span>Bildirim</span><span>Zil</span><span>Sesli Oku</span><span></span></div>
      ${VOICE_TYPES.map(t => `<div class="vn-row">
        <span>${t.ic} ${escapeHtml(t.label)}<small class="muted">“${escapeHtml(t.sample)}”</small></span>
        <span>${t.id==='kitchen' ? '<small class="muted">Mutfak zili</small>' : sw(t.id,'sound',p.types[t.id].sound)}</span>
        <span>${sw(t.id,'voice',p.types[t.id].voice)}</span>
        <span><button type="button" class="sbtn" style="width:auto;padding:6px 12px;" ${act('testVoice', t.id)}>▶ Dinle</button></span>
      </div>`).join('')}
    </div>
    ${window.speechSynthesis ? '' : '<p class="muted" style="color:var(--danger);">Bu cihaz/tarayıcı sesli okumayı desteklemiyor.</p>'}
    <p id="voiceListErr" class="muted" style="font-size:12.5px;text-align:left;color:var(--danger);">${VOICE_LIST_ERR ? 'Hesaptaki sesler alınamadı: ' + escapeHtml(VOICE_LIST_ERR) : ''}</p>
    <p class="muted" style="font-size:12.5px;text-align:left;margin-top:10px;">⭐⭐ doğal bulut sesleridir (her cihazda aynı). Diğer sesler cihazın kendi Türkçe okuma motorundan gelir. ⭐ işaretli “doğal” sesler en iyisidir: Windows'ta Microsoft Edge ya da Ayarlar › Zaman ve Dil › Konuşma'dan <b>Emel / Ahmet (Natural)</b>, Android'de “Google Konuşma Hizmetleri” Türkçe paketi önerilir.</p>
  </div>`;
}
