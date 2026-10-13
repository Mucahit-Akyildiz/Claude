/* Telsiz (bas-konuş) - klasik <script src>.
   Kanallar ve üyeleri veritabanında (radio_channels / radio_channel_members).
   Ses, Supabase Realtime "broadcast" ile canlı akar; yayın kanalının adı her
   kanala özel gizli anahtardır (list_radio_channels sadece üyelere döner,
   üyelik değişince yenilenir). Ses 8 kHz / 8-bit µ-law PCM olarak ~120 ms'lik
   parçalar halinde gönderilir: her tarayıcıda (iOS dahil) aynı çalışır,
   gecikme düşüktür. Bağlantı, kullanıcı kapatana ya da çıkış yapana kadar
   ekranlar arası gezinmede ve sayfa yenilemede açık kalır. */
const RADIO = { channel:null, rt:null, ctx:null, mic:null, proc:null, src:null, talking:false,
  buf:[], seq:0, playAt:0, speakers:{}, online:[], status:'' };
const RADIO_RATE = 8000;

function radioStoreKey(session){ return session ? 'rys_radio_' + session.user_id + '_' + session.restaurant_id : null; }
function radioSaved(session){ try{ return localStorage.getItem(radioStoreKey(session)); }catch(e){ return null; } }
function radioSave(session, id){ try{ const k = radioStoreKey(session); if(!k) return; if(id) localStorage.setItem(k, id); else localStorage.removeItem(k); }catch(e){} }
function radioAllowed(session){ return !!session && (session.isManager || hasPerm(session, 'radio')); }

async function fetchRadioChannels(session){
  const { data, error } = await sb.rpc('list_radio_channels', { p_token: session.session_token });
  if(error) throw error;
  APP.radioChannels = data || [];
  radioNotifyNewMemberships(session, APP.radioChannels);
  return APP.radioChannels;
}
// Uygulama açıkken yeni bir kanala eklenen kullanıcıya ekranda haber ver
// (push bildirimi ayrıca sunucudan gider). İlk yüklemede sadece kayıt alınır.
function radioNotifyNewMemberships(session, list){
  const k = 'rys_radio_known_' + session.user_id;
  const mine = list.filter(c => c.is_member).map(c => c.id);
  let known = null; try{ known = JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){}
  try{ localStorage.setItem(k, JSON.stringify(mine)); }catch(e){}
  if(!Array.isArray(known)) return;
  const added = list.filter(c => c.is_member && !known.includes(c.id) && c.created_by !== session.user_id);
  if(!added.length) return;
  radioBeep(990);
  added.forEach(c => showToast('📻 "' + c.name + '" telsiz kanalına eklendiniz — Telsiz menüsünden bağlanabilirsiniz'));
}

/* ---- Ekran: kanal listesi / yönetimi ---- */
async function renderRadioView(main, session){
  main.innerHTML = '<h1>📻 Peyk Bas-Konuş</h1><div class="box" style="max-width:none;"><p class="muted">Yükleniyor…</p></div>';
  let list;
  try{ list = await fetchRadioChannels(session); }
  catch(e){ main.querySelector('.box').innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(e.message) + '</p>'; return; }
  const cur = RADIO.channel && RADIO.channel.id;
  main.innerHTML = `<h1>📻 Peyk Bas-Konuş</h1>
    <div class="box" style="max-width:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <h2 style="margin:0;">Kanallar</h2>
        <button type="button" style="margin:0;width:auto;" ${act('openRadioChannelEditor', null)}>＋ Yeni kanal</button>
      </div>
      <p class="muted" style="font-size:12.5px;text-align:left;margin:6px 0 12px;">Bir kanala bağlanın; alttaki telsiz paneli siz kapatana ya da çıkış yapana kadar tüm ekranlarda açık kalır. Konuşmak için <b>Bas-Konuş</b> düğmesini basılı tutun (bilgisayarda boşluk tuşu da çalışır).</p>
      ${list.length ? `<div class="rd-grid">${list.map((c, i) => { const on = c.id===cur;
        return `<div class="rd-card ${on?'on':''} ${c.is_member?'':'locked'}" style="--sc:var(--c${i%4+1});--i:${Math.min(i,12)};">
          <div class="rd-top"><span class="rd-ic">📻${on ? '<i></i>' : ''}</span><div class="cu-id"><b>${escapeHtml(c.name)}</b><small>${(c.members||[]).length} üye${on ? ' · <span style="color:var(--ok,#22c55e);font-weight:700;">● Bağlı</span>' : ''}</small></div>
            ${c.can_edit ? `<button type="button" class="ico-btn" title="Düzenle" ${act('openRadioChannelEditor', c.id)}>✏️</button><button type="button" class="ico-btn danger" title="Sil" ${act('removeRadioChannel', c.id)}>🗑</button>` : ''}</div>
          <div class="rd-mem" ${on ? 'data-radio-members="1"' : ''}>${radioMembersHtml(c, on)}</div>
          ${c.is_member ? (on
            ? `<button type="button" class="rd-btn leave" ${act('radioDisconnect', true)}>⏏ Kanaldan Ayrıl</button>`
            : `<button type="button" class="rd-btn" ${act('radioConnect', c.id)}>📻 Bağlan</button>`) : '<div class="rd-lock">🔒 Bu kanalın üyesi değilsiniz</div>'}
        </div>`; }).join('')}</div>`
        : '<div class="empty-state"><div style="font-size:42px;">📻</div><p class="muted">Henüz kanal yok. “Yeni kanal” ile oluşturun.</p></div>'}
    </div>`;
}
async function openRadioChannelEditor(id){
  const session = getSession();
  const c = id ? (APP.radioChannels||[]).find(x => x.id===id) : null;
  const { data, error } = await sb.rpc('list_chat_conversations', { p_token: session.session_token });
  if(error){ alert(error.message); return; }
  const people = (data.items||[]).filter(x => !x.is_all && !x.is_group);
  const memberIds = c ? (c.members||[]).map(m => m.id) : [];
  const ov = document.createElement('div'); ov.id = 'radioEditBg';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:110;padding:16px;';
  ov.onclick = (e) => { if(e.target===ov) ov.remove(); };
  ov.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:18px;max-width:420px;width:100%;max-height:85vh;display:flex;flex-direction:column;">
    <h3 style="margin:0 0 10px;">${c ? 'Kanalı düzenle' : '📻 Yeni telsiz kanalı'}</h3>
    <input id="radioChName" placeholder="Kanal adı (örn. Salon)" value="${escapeAttr(c ? c.name : '')}" style="margin:0 0 10px;">
    <div class="muted" style="font-size:12.5px;margin-bottom:6px;text-align:left;">Üyeler (siz otomatik eklenirsiniz)</div>
    <div style="overflow:auto;flex:1;border:1px solid var(--border);border-radius:12px;padding:4px 8px;">
      ${people.map(p => `<label style="display:flex;gap:10px;align-items:center;padding:7px 2px;cursor:pointer;">
        <input type="checkbox" class="radioChMember" value="${p.conv}" style="width:auto;margin:0;" ${memberIds.includes(p.conv)?'checked':''}>
        <span style="flex:1;">${escapeHtml(p.name)} <span class="muted" style="font-size:11.5px;">${escapeHtml(p.roles||'')}</span></span></label>`).join('')}
    </div>
    <div style="display:flex;gap:10px;margin-top:12px;">
      <button type="button" class="ghost-btn" style="flex:1;margin:0;" ${act('removeEl', 'radioEditBg')}>Vazgeç</button>
      <button type="button" style="flex:1;margin:0;" ${act('saveRadioChannel', c ? c.id : null)}>${c ? 'Kaydet' : 'Oluştur'}</button>
    </div></div>`;
  document.body.appendChild(ov);
}
async function saveRadioChannel(id){
  const name = (document.getElementById('radioChName').value || '').trim();
  const members = [...document.querySelectorAll('.radioChMember:checked')].map(x => x.value);
  if(!name){ alert('Kanal adı girin'); return; }
  if(!members.length){ alert('En az bir üye seçin'); return; }
  const session = getSession();
  const { error } = await sb.rpc('save_radio_channel', { p_token: session.session_token, p_id: id, p_name: name, p_member_ids: members });
  if(error){ alert(error.message); return; }
  document.getElementById('radioEditBg').remove();
  showToast(id ? 'Kanal güncellendi ✓' : 'Kanal oluşturuldu ✓');
  await radioSync();
  if(APP.view==='radio') renderRadioView(document.getElementById('main'), session);
}
async function removeRadioChannel(id){
  if(!confirm('Bu telsiz kanalı silinsin mi?')) return;
  const session = getSession();
  const { error } = await sb.rpc('remove_radio_channel', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  if(RADIO.channel && RADIO.channel.id===id) radioDisconnect(true);
  renderRadioView(document.getElementById('main'), session);
}

/* ---- Bağlantı ---- */
function radioAudioCtx(){
  if(!RADIO.ctx){
    // iPhone: sessiz moddayken de çalsın, hoparlörden çıksın (Safari 17+).
    try{ if(navigator.audioSession && navigator.audioSession.type !== 'play-and-record') navigator.audioSession.type = 'playback'; }catch(e){}
    RADIO.ctx = new (window.AudioContext || window.webkitAudioContext)();
    // iOS bağlamı "interrupted" durumuna düşürebiliyor; tekrar çalışınca bekleyen sesler çalınır.
    RADIO.ctx.onstatechange = () => { if(RADIO.ctx.state === 'running') radioFlushPending(); drawRadioDock(); };
  }
  if(RADIO.ctx.state !== 'running' && RADIO.ctx.state !== 'closed') RADIO.ctx.resume().catch(()=>{});
  return RADIO.ctx;
}
async function radioConnect(id, silent){
  const session = getSession(); if(!radioAllowed(session)) return;
  let list = APP.radioChannels;
  if(!list || !list.find(c => c.id===id)){ try{ list = await fetchRadioChannels(session); }catch(e){ return; } }
  const c = list.find(x => x.id===id && x.is_member && x.secret);
  if(!c){ radioSave(session, null); if(!silent) alert('Bu kanala erişiminiz yok'); return; }
  radioDisconnect(false);
  radioAudioCtx(); // tıklama anında ses izni açılsın (otomatik bağlantıda ilk dokunuşta açılır)
  RADIO.channel = { id:c.id, name:c.name, secret:c.secret };
  RADIO.status = 'Bağlanıyor…';
  radioSave(session, c.id);
  const me = { user_id: session.user_id, name: session.username };
  const ch = RADIO.rt = sb.channel('radio-' + c.secret, { config: { broadcast: { self:false }, presence: { key: session.user_id } } })
    .on('broadcast', { event:'a' }, ({ payload }) => radioOnAudio(payload))
    .on('broadcast', { event:'s' }, ({ payload }) => radioOnFloor(payload))
    .on('broadcast', { event:'e' }, ({ payload }) => radioOnEnd(payload))
    .on('presence', { event:'sync' }, () => {
      const st = RADIO.rt ? RADIO.rt.presenceState() : {};
      RADIO.online = [...new Set(Object.values(st).map(a => a[0] && a[0].name).filter(Boolean))];
      drawRadioDock();
      radioRefreshOnlineMarks();
      if(document.getElementById('radioOnlineBg')) openRadioOnlineList();
    })
    .subscribe(status => {
      if(RADIO.rt !== ch) return; // yeniden bağlanırken kapatılan eski kanalın durumu yok sayılır
      RADIO.status = status==='SUBSCRIBED' ? '' : (status==='CLOSED' ? 'Bağlantı kapandı' : 'Yeniden bağlanıyor…');
      if(status==='SUBSCRIBED' && RADIO.rt) RADIO.rt.track(me).catch(()=>{});
      // Kanal hata verir / zaman aşımına uğrarsa birkaç saniye sonra yeniden bağlanılır.
      // CLOSED, kanalı kendimiz kapattığımızda (yeniden bağlanırken) da gelir; yeniden bağlanma sebebi sayılmaz.
      if(status==='CHANNEL_ERROR' || status==='TIMED_OUT') radioScheduleReconnect('durum ' + status);
      if(status==='SUBSCRIBED') RADIO_RECONNECT_FAILS = 0;
      drawRadioDock();
    });
  drawRadioDock();
  radioNative('start', c.name);
  if(APP.view==='radio') renderRadioView(document.getElementById('main'), session);
}
function radioDisconnect(forget){
  radioStopTalk();
  if(RADIO.rt){ try{ sb.removeChannel(RADIO.rt); }catch(e){} RADIO.rt = null; }
  if(RADIO.channel) radioNative('stop');
  RADIO.channel = null; RADIO.speakers = {}; RADIO.floor = null; RADIO.online = []; RADIO.status = '';
  if(forget){ radioSave(getSession(), null); if(APP.view==='radio') renderRadioView(document.getElementById('main'), getSession()); }
  drawRadioDock();
}
// Çıkışta tam kapanış: mikrofon da bırakılır.
function radioShutdown(){
  radioDisconnect(false);
  if(RADIO.mic){ releaseSharedMic(); RADIO.mic = null; }
  if(RADIO.src){ try{ RADIO.src.disconnect(); }catch(e){} RADIO.src = null; }
  APP.radioChannels = null;
}
// Uygulama açılışında / kullanıcı değişince kayıtlı kanala yeniden bağlan; üyelik
// değiştiyse (anahtar yenilendi, kanal silindi) bağlantıyı güncelle.
async function radioSync(){
  const session = getSession();
  if(!radioAllowed(session)){ if(RADIO.channel) radioShutdown(); return; }
  const want = radioSaved(session);
  let list; try{ list = await fetchRadioChannels(session); }catch(e){ return; }
  if(!want){ if(RADIO.channel) radioDisconnect(false); return; }
  const c = list.find(x => x.id===want && x.is_member);
  if(!c){ radioDisconnect(false); radioSave(session, null); showToast('Telsiz kanalına erişiminiz kaldırıldı'); return; }
  if(!RADIO.channel || RADIO.channel.id!==c.id || RADIO.channel.secret!==c.secret) radioConnect(c.id, true);
  else if(RADIO.channel.name!==c.name){ RADIO.channel.name = c.name; drawRadioDock(); }
}
let RADIO_SYNC_TIMER = null;
// Veri değişikliği bildirimlerinde en fazla 10 sn'de bir sorulur (yoğun sipariş anında gereksiz istek olmasın).
let RADIO_SYNC_LAST = 0;
function radioSyncSoon(){
  if(RADIO_SYNC_TIMER) return;
  const wait = Math.max(800, 10000 - (Date.now() - RADIO_SYNC_LAST));
  RADIO_SYNC_TIMER = setTimeout(() => { RADIO_SYNC_TIMER = null; RADIO_SYNC_LAST = Date.now(); radioSync(); }, wait);
}

/* ---- Konuşma (mikrofon -> 8 kHz µ-law -> broadcast) ---- */
function muLawEncode(s){
  const BIAS = 0x84, CLIP = 32635;
  let x = Math.max(-1, Math.min(1, s)) * 32767 | 0;
  const sign = x < 0 ? 0x80 : 0; if(sign) x = -x; if(x > CLIP) x = CLIP; x += BIAS;
  let exp = 7; for(let m = 0x4000; (x & m)===0 && exp > 0; m >>= 1) exp--;
  return ~(sign | (exp << 4) | ((x >> (exp + 3)) & 0x0F)) & 0xFF;
}
function muLawDecode(u){
  u = ~u & 0xFF; const sign = u & 0x80, exp = (u >> 4) & 7, man = u & 0x0F;
  let x = ((man << 3) + 0x84) << exp; x -= 0x84;
  return (sign ? -x : x) / 32768;
}
function bytesToB64(a){ let s = ''; for(let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
function b64ToBytes(b){ const s = atob(b), a = new Uint8Array(s.length); for(let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }

/* Söz hakkı (aynı anda tek konuşan): basan kişi önce 's' (başla) yayınlar.
   Kanalda başka biri konuşuyorsa düğme reddeder. İki kişi aynı anda basarsa
   herkes aynı kuralla karar verir: zaman damgası küçük olan (eşitse kullanıcı
   kimliği küçük olan) konuşur, diğeri otomatik susturulur. */
function radioFloorWins(a, b){ return a.t < b.t || (a.t === b.t && String(a.u) < String(b.u)); }
function radioBusyBy(){
  const me = getSession();
  return RADIO.floor && me && RADIO.floor.u !== me.user_id ? RADIO.floor : null;
}
const RADIO_BUILD = 'r9';
function radioLog(msg){ try{ if(typeof reportClientError === 'function') reportClientError('radio', msg + ' | ' + RADIO_BUILD, 'radio.js'); }catch(e){} }
async function radioStartTalk(){
  if(RADIO.talking) return;
  if(!RADIO.rt || !RADIO.channel){ radioLog('bas: FAIL kanala bağlı değil'); return; }
  if(!radioChannelHealthy()){ radioScheduleReconnect('konuşmadan önce bağlantı kopuk', 0); radioFlash('Bağlantı yenileniyor, tekrar basın'); return; }
  const session = getSession(); if(!session) return;
  const busy = radioBusyBy();
  if(busy){ radioBeep(330, 0.18); radioFlash((busy.n || 'Biri') + ' konuşuyor — kanal meşgul'); return; }
  const ctx = radioAudioCtx();
  RADIO.talking = true;
  RADIO.myFloor = { u: session.user_id, n: session.username, t: Date.now() };
  RADIO.floor = RADIO.myFloor; RADIO.seq = 0;
  RADIO.rt.send({ type:'broadcast', event:'s', payload: RADIO.myFloor });
  drawRadioDock();
  try{
    if(!RADIO.mic){
      // İzin penceresi açıkken/engelliyken kullanıcı ne olduğunu görsün; 8 sn'de yanıt yoksa uyar.
      RADIO.waitingMic = true; drawRadioDock();
      const t = setTimeout(() => { if(RADIO.waitingMic){ radioLog('bas: FAIL mikrofon izni yanıtsız'); radioFlash('🎤 Mikrofon izni bekleniyor — adres çubuğundaki 🔒 simgesinden izin verin'); } }, 8000);
      try{ RADIO.mic = await radioOpenMic(); }
      finally{ clearTimeout(t); RADIO.waitingMic = false; }
    }
  }catch(e){ radioLog('bas: FAIL mikrofon ' + (e && (e.name || e.message))); radioStopTalk(); alert('Mikrofona erişilemedi. Tarayıcı/uygulama ayarlarından mikrofon izni verin.'); return; }
  if(!RADIO.talking) return; // izin beklenirken bırakıldı / söz kaybedildi
  radioBeep(880);
  // Mikrofon ayrı bir ses bağlamında işlenir; iPhone'da mikrofon izninden ÖNCE kurulan
  // bağlam mikrofon karesi vermeyebiliyor, o yüzden gerekirse yenisi kurulur (bekçi).
  if(!RADIO.capCtx || RADIO.capCtx.state === 'closed') RADIO.capCtx = new (window.AudioContext || window.webkitAudioContext)();
  await radioAttachCapture(RADIO.capCtx);
  setTimeout(async () => {
    if(!RADIO.talking || !RADIO.diag || RADIO.diag.frames) return;
    radioLog('bas: mikrofon karesi yok, ses bağlamı yeniden kuruluyor (' + RADIO.capCtx.state + ')');
    radioDetachCapture();
    try{ RADIO.capCtx.close(); }catch(e){}
    RADIO.capCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(RADIO.talking) await radioAttachCapture(RADIO.capCtx, true);
  }, 700);
}
function radioDetachCapture(){
  if(RADIO.proc){ try{ RADIO.src.disconnect(RADIO.proc); RADIO.proc.disconnect(); }catch(e){} RADIO.proc = null; }
}
async function radioAttachCapture(ctx, retry){
  if(ctx.state !== 'running'){ try{ await ctx.resume(); }catch(e){} }
  if(!RADIO.talking) return;
  try{
    if(!RADIO.src || RADIO.src.context !== ctx) RADIO.src = ctx.createMediaStreamSource(RADIO.mic);
  }catch(e){ radioLog('bas: FAIL ses kaynağı ' + (e && (e.name || e.message))); radioStopTalk(true); return; }
  if(!retry || !RADIO.diag) RADIO.diag = { frames:0, chunks:0, errs:0, peak:0 };
  if(retry) RADIO.diag.retried = true;
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  const ratio = ctx.sampleRate / RADIO_RATE; let pos = 0;
  RADIO.buf = [];
  proc.onaudioprocess = (ev) => {
    if(!RADIO.talking) return;
    RADIO.diag.frames++;
    const inp = ev.inputBuffer.getChannelData(0);
    // Ortalamalı küçültme (8 kHz): her çıkış örneği kapsadığı giriş örneklerinin ortalaması.
    for(; pos < inp.length; pos += ratio){
      const a = Math.floor(pos), b = Math.min(inp.length, Math.floor(pos + ratio)); let sum = 0, n = 0;
      for(let i = a; i < b; i++){ sum += inp[i]; n++; }
      const v = n ? sum / n : inp[a];
      if(Math.abs(v) > RADIO.diag.peak) RADIO.diag.peak = Math.abs(v);
      if(Math.abs(v) > (RADIO.diag.cur || 0)) RADIO.diag.cur = Math.abs(v);
      RADIO.buf.push(muLawEncode(v));
    }
    pos -= inp.length;
    if(RADIO.buf.length >= 1600){ RADIO.diag.lvl = RADIO.diag.cur || 0; RADIO.diag.cur = 0; radioFlush(); drawRadioDock(); } // ~200 ms'lik parça (saniyede ~5 mesaj)
  };
  RADIO.src.connect(proc); proc.connect(ctx.destination); // bazı tarayıcılar çıkışa bağlanmadan işlemiyor (çıkış sessiz)
  RADIO.proc = proc;
}
function radioFlush(){
  if(!RADIO.buf.length || !RADIO.rt) return;
  const session = getSession();
  const d = bytesToB64(Uint8Array.from(RADIO.buf)); RADIO.buf = [];
  if(RADIO.diag) RADIO.diag.chunks++;
  radioRecordChunk({ u: session.user_id, n: 'Siz', t: RADIO.myFloor && RADIO.myFloor.t, d }); // kendi konuşmamı da tekrar dinleyebileyim
  Promise.resolve(RADIO.rt.send({ type:'broadcast', event:'a', payload:{ u: session.user_id, n: session.username, t: RADIO.myFloor && RADIO.myFloor.t, s: RADIO.seq++, d } }))
    .then(r => { if(r && r !== 'ok' && RADIO.diag){ RADIO.diag.errs++; RADIO.diag.lastErr = r; } }).catch(()=>{});
}
function radioStopTalk(lost){
  if(!RADIO.talking) return;
  RADIO.talking = false;
  if(RADIO.proc && !lost) radioFlush();
  radioDetachCapture();
  RADIO.buf = [];
  const session = getSession();
  if(RADIO.rt && session && !lost) RADIO.rt.send({ type:'broadcast', event:'e', payload:{ u: session.user_id } });
  if(session) radioFinishRecording(session.user_id);
  if(RADIO.floor && session && RADIO.floor.u === session.user_id) RADIO.floor = null;
  RADIO.myFloor = null;
  radioReportSend(lost);
  radioBeep(lost ? 330 : 660);
  drawRadioDock();
}

/* ---- Dinleme ---- */
function radioTakeFloor(p){
  // Başkası konuşmaya başladı: ben de konuşuyorsam kuralı uygula.
  if(RADIO.talking && RADIO.myFloor){
    if(radioFloorWins(RADIO.myFloor, p)) return false; // söz bende, karşı taraf susacak
    radioStopTalk(true); radioFlash((p.n || 'Biri') + ' önce bastı — kanal meşgul');
  }
  if(RADIO.floor && RADIO.floor.u !== p.u && radioFloorWins(RADIO.floor, p)) return false;
  clearTimeout(RADIO.floorTimer);
  RADIO.floor = { u: p.u, n: p.n, t: p.t };
  RADIO.floorTimer = setTimeout(() => radioOnEnd({ u: p.u }), 2500); // 'e' kaybolursa kanal kilitli kalmasın
  return true;
}
function radioOnFloor(p){ if(p && p.u){ radioTakeFloor(p); drawRadioDock(); } }
function radioOnAudio(p){
  if(!p || !p.d) return;
  if(!RADIO.floor || RADIO.floor.u !== p.u){
    if(!radioTakeFloor({ u: p.u, n: p.n, t: p.t || Date.now() })) return; // söz başkasında: bu sesi çalma
    drawRadioDock();
  } else {
    clearTimeout(RADIO.floorTimer);
    RADIO.floorTimer = setTimeout(() => radioOnEnd({ u: p.u }), 2500);
  }
  RADIO.rx = RADIO.rx || { chunks:0, played:0 }; RADIO.rx.chunks++;
  radioRecordChunk(p);
  if(RADIO.nativeAudio) return; // Android uygulaması sesi kendi çalıyor (ekran kapalıyken de)
  const ctx = radioAudioCtx();
  if(ctx.state !== 'running'){
    // Bağlam uyanana kadar en fazla ~3 sn'lik ses bekletilir (iPhone "interrupted").
    RADIO.pending = (RADIO.pending || []).concat([p.d]).slice(-15);
    RADIO.missed = true; drawRadioDock(); return;
  }
  radioPlayChunk(p.d);
}
function radioFlushPending(){
  const q = RADIO.pending || []; RADIO.pending = [];
  if(q.length){ RADIO.missed = false; q.forEach(radioPlayChunk); }
}
function radioPlayChunk(d){
  const ctx = RADIO.ctx; if(!ctx) return;
  if(RADIO.rx){ RADIO.rx.played++; }
  const bytes = b64ToBytes(d);
  const ab = ctx.createBuffer(1, bytes.length, RADIO_RATE), ch = ab.getChannelData(0);
  let pk = 0;
  for(let i = 0; i < bytes.length; i++){ ch[i] = muLawDecode(bytes[i]); if(Math.abs(ch[i]) > pk) pk = Math.abs(ch[i]); }
  if(RADIO.rx && pk > (RADIO.rx.peak || 0)) RADIO.rx.peak = pk;
  const src = ctx.createBufferSource(); src.buffer = ab; src.connect(ctx.destination);
  const now = ctx.currentTime;
  // Ağ dalgalanmasına karşı küçük tampon; gecikme birikirse yeniden hizala.
  if(RADIO.playAt < now || RADIO.playAt > now + 1.5) RADIO.playAt = now + 0.25;
  src.start(RADIO.playAt); RADIO.playAt += ab.duration;
}
function radioOnEnd(p){
  if(!p || !RADIO.floor || RADIO.floor.u !== p.u) return;
  clearTimeout(RADIO.floorTimer); RADIO.floor = null;
  radioFinishRecording(p.u);
  drawRadioDock();
  radioReportRecv();
}
/* Tanı kaydı (Admin Paneli > Hatalar, tür "radio"): ses gitmiyor / çalmıyor şikayetlerinde
   hangi adımın bozulduğunu görmek için. Başarılı (ok) durumlar kaydedilmez. Aynı durum tek satırda sayaçla toplanır. */
function radioReportSend(lost){
  const d = RADIO.diag; RADIO.diag = null;
  if(!d || lost || typeof reportClientError !== 'function') return;
  const ctx = RADIO.ctx;
  const st = !d.frames ? 'FAIL mikrofon karesi yok' : !d.chunks ? 'FAIL parça gönderilmedi' : d.errs ? 'FAIL gönderim hatası ' + d.lastErr : 'ok';
  const lvl = d.peak < 0.01 ? 'sessiz' : d.peak < 0.05 ? 'düşük' : 'iyi';
  if(st === 'ok') return; // yalnızca sorunlu gönderimler kaydedilir
  reportClientError('radio', RADIO_BUILD + ' gönder: ' + st + (d.frames ? ' ses=' + lvl : '') + (d.retried ? ' yeniden-kuruldu' : '') + ' | ctx=' + (RADIO.capCtx ? RADIO.capCtx.state + '/' + RADIO.capCtx.sampleRate : '-') + ' rt=' + (RADIO.status || 'bağlı'), 'radio.js');
}
function radioReportRecv(){
  const r = RADIO.rx; RADIO.rx = null;
  if(!r || typeof reportClientError !== 'function') return;
  const lvl = !r.played ? '' : (r.peak || 0) < 0.01 ? ' ses=sessiz' : (r.peak || 0) < 0.05 ? ' ses=düşük' : ' ses=iyi';
  const st = (RADIO.nativeAudio ? 'ok (Android yerel)' : r.played ? 'ok (web)' : 'FAIL alındı ama çalınmadı') + lvl;
  if(st.startsWith('ok')) return; // yalnızca sorunlu alımlar kaydedilir
  reportClientError('radio', RADIO_BUILD + ' al: ' + st + ' | ctx=' + (RADIO.ctx ? RADIO.ctx.state : '-') + ' görünür=' + document.visibilityState, 'radio.js');
}
function radioBeep(freq, dur){
  try{
    const ctx = radioAudioCtx(); if(ctx.state !== 'running') return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = 0.06; o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + (dur || 0.07));
  }catch(e){}
}
function radioFlash(msg){ RADIO.flash = msg; drawRadioDock(); clearTimeout(RADIO.flashT); RADIO.flashT = setTimeout(() => { RADIO.flash = ''; drawRadioDock(); }, 2500); }

/* Android uygulamasında arka planda çalışma: yerel ön plan servisi (bildirimde
   "Telsiz açık") uygulama arka plandayken / ekran kilitliyken de bağlantıyı ve sesi
   canlı tutar. Web/masaüstünde eklenti yoktur, çağrı sessizce atlanır. */
function radioNative(action, name){
  try{
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PeykRadio;
    if(!P) return;
    if(action==='start'){
      const session = getSession();
      P.start({ channel: name || '', url: SUPABASE_URL, key: SUPABASE_KEY, topic: 'radio-' + RADIO.channel.secret, user: session && session.user_id, name: session && session.username })
        .then(r => { RADIO.nativeAudio = !!(r && r.nativeAudio); drawRadioDock(); }).catch(()=>{});
    } else { RADIO.nativeAudio = false; P.stop().catch(()=>{}); }
  }catch(e){}
}

/* ---- Kalıcı telsiz paneli (tüm ekranlarda) ----
   Panel bir kez kurulur, sonra sadece yazı/renk güncellenir: konuşurken düğmeyi
   yeniden çizmek basılı tutmayı (pointer capture) koparıp konuşmayı kesiyordu. */
function drawRadioDock(){
  let dock = document.getElementById('radioDock');
  document.body.classList.toggle('has-radio', !!RADIO.channel);
  if(!RADIO.channel){ if(dock) dock.remove(); return; }
  if(!dock){
    dock = document.createElement('div'); dock.id = 'radioDock';
    dock.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:95;background:var(--panel);border:1px solid var(--border);border-radius:18px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:10px 12px;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);';
    dock.innerHTML = `
      <div id="radioInfo" style="min-width:0;flex:1;cursor:pointer;">
        <div id="radioTitle" style="font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
        <div id="radioLine" class="muted" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;"></div>
      </div>
      <button type="button" id="radioPtt" style="margin:0;width:auto;min-width:122px;padding:12px 14px;border-radius:999px;font-weight:800;touch-action:none;user-select:none;-webkit-user-select:none;"></button>
      <button type="button" id="radioReplayBtn" class="ghost-btn" style="margin:0;width:auto;padding:8px 10px;" title="Son konuşmayı tekrar dinle" disabled>🔁</button>
      <button type="button" id="radioMicBtn" class="ghost-btn" style="margin:0;width:auto;padding:8px 10px;" title="Mikrofon seç">🎤</button>
      <button type="button" id="radioClose" class="ghost-btn" style="margin:0;width:auto;padding:8px 10px;" title="Telsizi kapat">✕</button>`;
    document.body.appendChild(dock);
    // Mobilde mesaj yazma alanı telsiz çubuğunun altında kalmasın: yüksekliği CSS'e ver.
    const setH = () => document.documentElement.style.setProperty('--rdock-h', (dock.offsetHeight + 24) + 'px');
    setH(); if(window.ResizeObserver) new ResizeObserver(setH).observe(dock);
    dock.querySelector('#radioInfo').onclick = () => {
      const needAudio = !RADIO.nativeAudio && (!RADIO.ctx || RADIO.ctx.state !== 'running');
      radioAudioCtx(); RADIO.missed = false; setTimeout(drawRadioDock, 100);
      // Ses zaten açıksa dokunmak çevrim içi listesini gösterir.
      if(!needAudio) openRadioOnlineList();
    };
    dock.querySelector('#radioClose').onclick = () => radioDisconnect(true);
    dock.querySelector('#radioMicBtn').onclick = () => openRadioMicPicker();
    dock.querySelector('#radioReplayBtn').onclick = () => radioReplayLast();
    const b = dock.querySelector('#radioPtt');
    let held = false;
    const down = (e) => { e.preventDefault(); if(held) return; held = true; try{ b.setPointerCapture(e.pointerId); }catch(_){} radioStartTalk(); };
    const up = (e) => { if(!held) return; e.preventDefault(); held = false; radioStopTalk(); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('keydown', e => { if(e.code==='Space' || e.code==='Enter') e.preventDefault(); });
  }
  const busy = radioBusyBy();
  const suspended = !RADIO.nativeAudio && (!RADIO.ctx || RADIO.ctx.state !== 'running');
  const line = RADIO.flash || RADIO.status || (busy ? '🔊 ' + (busy.n || 'Biri') + ' konuşuyor'
    : (suspended || RADIO.missed) ? '🔇 Sesi açmak için buraya dokunun' : ('🟢 ' + RADIO.online.length + ' kişi çevrim içi · gör'));
  dock.querySelector('#radioTitle').textContent = '📻 ' + RADIO.channel.name;
  const ln = dock.querySelector('#radioLine'); ln.textContent = line; ln.title = RADIO.online.join(', ');
  ln.style.color = (suspended || RADIO.missed || RADIO.flash) && !busy ? 'var(--red)' : '';
  const b = dock.querySelector('#radioPtt');
  if(RADIO.talking && RADIO.waitingMic && !RADIO.flash) ln.textContent = '🎤 Mikrofon izni bekleniyor…';
  if(RADIO.talking && RADIO.diag){
    // Anlık mikrofon seviyesi: hiç çubuk yoksa mikrofon sessiz (yanlış cihaz / kapalı).
    const lv = RADIO.diag.lvl || 0, bars = lv < 0.01 ? 0 : lv < 0.03 ? 1 : lv < 0.08 ? 2 : lv < 0.2 ? 3 : 4;
    ln.textContent = '📤 ' + RADIO.diag.chunks + ' parça · mikrofon ' + (bars ? '▮'.repeat(bars) + '▯'.repeat(4 - bars) : '🔇 ses yok') + (RADIO.diag.frames ? '' : ' (bekleniyor)');
  }
  b.textContent = RADIO.talking ? '🎙️ Konuşuyor…' : busy ? '🔒 Meşgul' : '🎙️ Bas-Konuş';
  b.style.background = RADIO.talking ? '#dc2626' : busy ? 'var(--border)' : '';
  b.style.borderColor = RADIO.talking ? '#dc2626' : busy ? 'var(--border)' : '';
  b.style.color = RADIO.talking ? '#fff' : busy ? 'var(--muted)' : '';
  const rp = dock.querySelector('#radioReplayBtn');
  if(rp){
    const c = RADIO.lastClip;
    rp.disabled = !c || RADIO.talking;
    rp.title = c ? 'Son konuşmayı tekrar dinle: ' + (c.n || 'Biri') + ' (' + new Date(c.at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) + ')' : 'Henüz tekrar dinlenecek konuşma yok';
    rp.textContent = RADIO.replaying ? '⏹' : '🔁';
  }
}
// Bilgisayarda boşluk tuşu bas-konuş (yazı alanındayken devre dışı).
function radioIsTyping(e){ const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
let RADIO_KEY_HELD = false;
document.addEventListener('keydown', e => { if(e.code==='Space' && RADIO.channel && !radioIsTyping(e)){ e.preventDefault(); if(e.repeat || RADIO_KEY_HELD) return; RADIO_KEY_HELD = true; radioStartTalk(); } });
document.addEventListener('keyup', e => { if(e.code==='Space' && RADIO_KEY_HELD){ e.preventDefault(); RADIO_KEY_HELD = false; radioStopTalk(); } });
window.addEventListener('blur', () => { RADIO_KEY_HELD = false; radioStopTalk(); });
// Tarayıcı ses iznini ilk dokunuşta/tuşta açar (yenileme sonrası otomatik bağlantı için).
['pointerdown','keydown','touchstart'].forEach(ev => document.addEventListener(ev, () => {
  if(RADIO.channel && (!RADIO.ctx || RADIO.ctx.state !== 'running')){ const c = radioAudioCtx(); c.resume().then(() => { RADIO.missed = false; drawRadioDock(); }).catch(()=>{}); }
}, true));

/* ---- Mikrofon seçimi ----
   Bilgisayarda birden çok giriş (web kamerası, kulaklık, sanal cihaz) olduğunda tarayıcı
   sessiz olanı seçebiliyor; kullanıcı burada doğru mikrofonu seçer, seçim cihazda saklanır. */
const RADIO_MIC_KEY = 'rys_radio_mic';
/* Mikrofonu açar; olmazsa sırayla daha basit ayarlarla dener. iPhone'da kayıtlı mikrofon kimliği
   her açılışta değiştiği için seçili cihaz InvalidStateError/OverconstrainedError verebiliyor:
   o zaman seçim unutulup varsayılan mikrofon kullanılır. İzin reddi (NotAllowedError) tekrar denenmez. */
async function radioOpenMic(){
  const tries = [radioMicConstraints(), { echoCancellation:true, noiseSuppression:true, autoGainControl:true }, null];
  let last;
  for(let i = 0; i < tries.length; i++){
    if(i > 0 && JSON.stringify(tries[i]) === JSON.stringify(tries[i-1])) continue;
    try{ return await getSharedMic(tries[i]); }
    catch(e){
      last = e;
      radioLog('bas: mikrofon denemesi ' + (i + 1) + ' başarısız ' + (e && (e.name + ' ' + (e.message || ''))));
      if(e && e.name === 'NotAllowedError') break;
      if(i === 0){ try{ localStorage.removeItem(RADIO_MIC_KEY); }catch(_){} }
      releaseSharedMic();
    }
  }
  throw last;
}
function radioMicConstraints(){
  const c = { echoCancellation:true, noiseSuppression:true, autoGainControl:true };
  let id = ''; try{ id = localStorage.getItem(RADIO_MIC_KEY) || ''; }catch(e){}
  if(id) c.deviceId = { exact: id };
  return c;
}
async function openRadioMicPicker(){
  removeEl('radioMicBg');
  let devs = [];
  try{
    // Cihaz adları ancak mikrofon izni verildikten sonra görünür.
    if(!RADIO.mic && !sharedMicLive()) await getSharedMic();
    devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
  }catch(e){ alert('Mikrofon listesine erişilemedi. Tarayıcıdan mikrofon izni verin.'); return; }
  let cur = ''; try{ cur = localStorage.getItem(RADIO_MIC_KEY) || ''; }catch(e){}
  const inUse = RADIO.mic && RADIO.mic.getAudioTracks()[0] ? RADIO.mic.getAudioTracks()[0].getSettings().deviceId : '';
  const ov = document.createElement('div'); ov.id = 'radioMicBg'; ov.className = 'modal-bg';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.innerHTML = `<div class="box" style="max-width:420px;width:100%;margin:0;">
    <div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;">🎤 Mikrofon</h2><span style="cursor:pointer;color:var(--muted);font-size:20px;" ${act('removeEl','radioMicBg')}>✕</span></div>
    <p class="muted" style="text-align:left;font-size:12.5px;">Konuşurken panelde seviye çubuğu görünmüyorsa başka bir mikrofon seçin.</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button type="button" class="${cur ? 'ghost-btn' : ''}" style="margin:0;text-align:left;" ${act('setRadioMic', '')}>Varsayılan (sistem)</button>
      ${devs.map((d, i) => `<button type="button" class="${cur === d.deviceId ? '' : 'ghost-btn'}" style="margin:0;text-align:left;" ${act('setRadioMic', d.deviceId)}>${escapeHtml(d.label || ('Mikrofon ' + (i + 1)))}${!cur && inUse === d.deviceId ? ' <span class="muted">(kullanımda)</span>' : ''}</button>`).join('')}
    </div></div>`;
  ov.onclick = (e) => { if(e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
function setRadioMic(id){
  try{ if(id) localStorage.setItem(RADIO_MIC_KEY, id); else localStorage.removeItem(RADIO_MIC_KEY); }catch(e){}
  // Bir sonraki bas-konuşta yeni cihaz açılsın.
  if(!RADIO.talking){ releaseSharedMic(); RADIO.mic = null; }
  removeEl('radioMicBg');
  radioFlash('🎤 Mikrofon değiştirildi');
}

/* ---- Çevrim içi üyeler ----
   Bağlı kanalda kimin telsizi açık (presence) gösterilir: kanal listesinde yeşil nokta,
   panelde "N kişi çevrim içi"ye dokununca liste. */
function radioMembersHtml(c, connected){
  const members = (c.members || []).map(m => m.name);
  if(!connected) return escapeHtml(members.join(', '));
  const on = new Set(RADIO.online);
  return members.map(n => on.has(n)
    ? `<span style="white-space:nowrap;font-weight:700;">🟢 ${escapeHtml(n)}</span>`
    : `<span class="muted" style="white-space:nowrap;">⚪ ${escapeHtml(n)}</span>`).join(', ');
}
function radioRefreshOnlineMarks(){
  const td = document.querySelector('[data-radio-members]');
  if(!td || !RADIO.channel || !APP.radioChannels) return;
  const c = (APP.radioChannels || []).find(x => x.id === RADIO.channel.id);
  if(c) td.innerHTML = radioMembersHtml(c, true);
}
function openRadioOnlineList(){
  if(!RADIO.channel) return;
  removeEl('radioOnlineBg');
  const c = (APP.radioChannels || []).find(x => x.id === RADIO.channel.id);
  const on = new Set(RADIO.online);
  const members = c ? (c.members || []).map(m => m.name) : RADIO.online.slice();
  const online = members.filter(n => on.has(n)).concat(RADIO.online.filter(n => !members.includes(n)));
  const offline = members.filter(n => !on.has(n));
  const ov = document.createElement('div'); ov.id = 'radioOnlineBg';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:flex-end;justify-content:center;padding:16px;';
  ov.innerHTML = `<div class="box" style="max-width:420px;width:100%;margin:0 0 80px;max-height:70vh;overflow-y:auto;text-align:left;">
    <div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;">📻 ${escapeHtml(RADIO.channel.name)}</h2><span style="cursor:pointer;color:var(--muted);font-size:20px;" ${act('removeEl','radioOnlineBg')}>✕</span></div>
    <p style="font-weight:700;margin:12px 0 6px;">🟢 Çevrim içi (${online.length})</p>
    ${online.length ? online.map(n => `<div style="padding:6px 0;border-bottom:1px solid var(--border);">🟢 ${escapeHtml(n)}</div>`).join('') : '<p class="muted">Şu an kimse bağlı değil.</p>'}
    ${offline.length ? `<p style="font-weight:700;margin:14px 0 6px;" class="muted">⚪ Bağlı değil (${offline.length})</p>
      ${offline.map(n => `<div class="muted" style="padding:6px 0;border-bottom:1px solid var(--border);">⚪ ${escapeHtml(n)}</div>`).join('')}` : ''}
  </div>`;
  ov.onclick = (e) => { if(e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

/* ---- Bağlantı bekçisi ----
   Telefon uykuya geçince / uygulama arka plandayken gerçek zamanlı bağlantı sessizce kopabiliyor,
   ekranda ise kanal "bağlı" görünmeye devam ediyordu (ses gelmiyor, çıkıp girince düzeliyordu).
   Kanal 'joined' değilse ya da uygulama 5 dk'dan uzun arka planda kaldıysa bağlantı yeniden kurulur;
   yenilemeler en az 10 sn arayla yapılır (döngüye girmesin). */
let RADIO_RECONNECT_T = null, RADIO_HIDDEN_AT = 0, RADIO_LAST_RECONNECT = 0, RADIO_RECONNECT_FAILS = 0, RADIO_JOINING_SINCE = 0;
function radioChannelHealthy(){
  if(!RADIO.rt) return false;
  const st = RADIO.rt.state;
  // Bağlanma sürüyorsa 20 sn'ye kadar sağlıklı sayılır (aksi halde bekçi kendi bağlantısını bozar).
  if(st === 'joining'){ if(!RADIO_JOINING_SINCE) RADIO_JOINING_SINCE = Date.now(); return Date.now() - RADIO_JOINING_SINCE < 20000; }
  RADIO_JOINING_SINCE = 0;
  return st === 'joined' && (!sb.realtime || !sb.realtime.isConnected || sb.realtime.isConnected());
}
function radioScheduleReconnect(reason, delay){
  if(!RADIO.channel || RADIO.talking) return;
  clearTimeout(RADIO_RECONNECT_T);
  // Art arda yenileme döngüsüne karşı: en az 10 sn arayla, başarısız oldukça aralık uzar (en fazla 60 sn).
  const minGap = Math.min(60000, 10000 * Math.pow(2, RADIO_RECONNECT_FAILS));
  const wait = Math.max(delay == null ? 2500 : delay, RADIO_LAST_RECONNECT + minGap - Date.now());
  RADIO_RECONNECT_T = setTimeout(() => {
    if(!RADIO.channel || RADIO.talking) return;
    if(radioChannelHealthy() && !/ön plana|internet/.test(reason)) return; // bu arada düzeldiyse dokunma
    RADIO_LAST_RECONNECT = Date.now(); RADIO_RECONNECT_FAILS++; RADIO_JOINING_SINCE = 0;
    radioLog('bağlantı yenileniyor: ' + reason);
    radioConnect(RADIO.channel.id, true);
  }, wait);
}
setInterval(() => { if(RADIO.channel && !RADIO.talking && !radioChannelHealthy()) radioScheduleReconnect('bekçi: kanal ' + (RADIO.rt ? RADIO.rt.state : 'yok')); }, 15000);
document.addEventListener('visibilitychange', () => {
  if(document.hidden){ RADIO_HIDDEN_AT = Date.now(); return; }
  if(!RADIO.channel) return;
  const away = RADIO_HIDDEN_AT ? Date.now() - RADIO_HIDDEN_AT : 0;
  // Kopuksa hemen; görünürde bağlıysa ama uzun süre (5 dk+) arka planda kaldıysa bağlantı tazelenir.
  if(!radioChannelHealthy() || away > 300000) radioScheduleReconnect('ön plana dönüş (' + Math.round(away/1000) + ' sn)', 300);
});
window.addEventListener('online', () => { if(RADIO.channel) radioScheduleReconnect('internet geri geldi', 500); });

/* ---- Son konuşmayı tekrar dinle ----
   Kanaldan gelen her konuşma (başkalarının) bellekte tutulur; en sonuncusu 🔁 ile tekrar çalınır.
   En fazla ~60 sn saklanır, sunucuya kaydedilmez; sayfa yenilenince silinir. */
function radioRecordChunk(p){
  const r = RADIO.rec;
  if(!r || r.u !== p.u || (p.t && r.t !== p.t)) RADIO.rec = { u: p.u, n: p.n, t: p.t, at: Date.now(), chunks: [] };
  if(RADIO.rec.chunks.length < 300) RADIO.rec.chunks.push(p.d);
}
function radioFinishRecording(u){
  const r = RADIO.rec;
  if(r && r.u === u && r.chunks.length >= 2) RADIO.lastClip = r; // çok kısa (yanlışlıkla basma) kayıtlar atlanır
  RADIO.rec = null;
}
function radioReplayLast(){
  if(RADIO.replaying){ try{ RADIO.replaySrc && RADIO.replaySrc.stop(); }catch(e){} return; }
  const c = RADIO.lastClip; if(!c) return;
  if(RADIO.floor){ radioFlash('Kanal şu an meşgul — konuşma bitince tekrar dinleyin'); return; }
  const ctx = radioAudioCtx();
  const parts = c.chunks.map(b64ToBytes);
  const total = parts.reduce((n, a) => n + a.length, 0);
  const buf = ctx.createBuffer(1, total, RADIO_RATE), ch = buf.getChannelData(0);
  let o = 0; parts.forEach(a => { for(let i = 0; i < a.length; i++) ch[o++] = muLawDecode(a[i]); });
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
  RADIO.replaying = true; RADIO.replaySrc = src;
  src.onended = () => { RADIO.replaying = false; RADIO.replaySrc = null; drawRadioDock(); };
  const go = () => { src.start(); radioFlash('🔁 ' + (c.n || 'Son konuşma') + ' tekrar çalınıyor'); drawRadioDock(); };
  if(ctx.state !== 'running') ctx.resume().then(go).catch(() => { RADIO.replaying = false; }); else go();
}
