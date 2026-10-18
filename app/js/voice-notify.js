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
function voiceSpeak(text){
  try{
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
  const list = voiceList(), name = getVoicePrefs().voiceName;
  return list.find(v => v.name===name) || list[0] || null;
}
function setVoiceName(n){ const p = getVoicePrefs(); p.voiceName = n; setVoicePrefs(p); voiceSpeak('Masa 34 sipariş bekliyor'); }
try{ if(window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { const el = document.getElementById('voiceNameSel'); if(el) el.outerHTML = voiceSelectHtml(); }; }catch(e){}
function voiceSelectHtml(){
  const list = voiceList(), cur = (voicePick() || {}).name;
  if(!list.length) return '<select id="voiceNameSel" style="width:auto;" disabled><option>Türkçe ses bulunamadı</option></select>';
  return `<select id="voiceNameSel" style="width:auto;max-width:260px;" ${actOn('change','setVoiceName',['$value'])}>${list.map(v => `<option value="${escapeAttr(v.name)}" ${v.name===cur?'selected':''}>${escapeHtml(v.name.replace(/^(Microsoft|Google)\s*/,''))}${/natural|neural|online/i.test(v.name)?' ⭐':''}</option>`).join('')}</select>`;
}
function testVoice(type){ const t = VOICE_TYPES.find(x => x.id===type); if(t) voiceSpeak(t.sample); }
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
    <p class="muted" style="font-size:12.5px;text-align:left;margin-top:10px;">Sesler cihazın kendi Türkçe okuma motorundan gelir. ⭐ işaretli “doğal” sesler en iyisidir: Windows'ta Microsoft Edge ya da Ayarlar › Zaman ve Dil › Konuşma'dan <b>Emel / Ahmet (Natural)</b>, Android'de “Google Konuşma Hizmetleri” Türkçe paketi önerilir.</p>
  </div>`;
}
