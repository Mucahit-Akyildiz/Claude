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
function radioAllowed(session){ return !!session && (session.isManager || hasPerm(session, 'messages')); }

async function fetchRadioChannels(session){
  const { data, error } = await sb.rpc('list_radio_channels', { p_token: session.session_token });
  if(error) throw error;
  APP.radioChannels = data || [];
  return APP.radioChannels;
}

/* ---- Ekran: kanal listesi / yönetimi ---- */
async function renderRadioView(main, session){
  main.innerHTML = '<h1>📻 Telsiz</h1><div class="box" style="max-width:none;"><p class="muted">Yükleniyor…</p></div>';
  let list;
  try{ list = await fetchRadioChannels(session); }
  catch(e){ main.querySelector('.box').innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(e.message) + '</p>'; return; }
  const cur = RADIO.channel && RADIO.channel.id;
  main.innerHTML = `<h1>📻 Telsiz</h1>
    <div class="box" style="max-width:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <h2 style="margin:0;">Kanallar</h2>
        <button type="button" style="margin:0;width:auto;" onclick="openRadioChannelEditor(null)">＋ Yeni kanal</button>
      </div>
      <p class="muted" style="font-size:12.5px;text-align:left;margin:6px 0 12px;">Bir kanala bağlanın; alttaki telsiz paneli siz kapatana ya da çıkış yapana kadar tüm ekranlarda açık kalır. Konuşmak için <b>Bas-Konuş</b> düğmesini basılı tutun (bilgisayarda boşluk tuşu da çalışır).</p>
      <div class="settings-table-wrap"><table class="settings-table">
        <thead><tr><th>Kanal</th><th>Üyeler</th><th></th></tr></thead>
        <tbody>
        ${list.map(c => `<tr>
          <td class="col-name">${escapeHtml(c.name)}${c.id===cur ? ' <span class="role-badge" style="color:var(--accent);border-color:var(--accent);">● Bağlı</span>' : ''}</td>
          <td style="font-size:12.5px;">${escapeHtml((c.members||[]).map(m => m.name).join(', '))}</td>
          <td style="white-space:nowrap;">
            ${c.is_member ? (c.id===cur
              ? `<button class="sbtn" onclick="radioDisconnect(true)">Ayrıl</button>`
              : `<button class="sbtn" onclick="radioConnect('${c.id}')">📻 Bağlan</button>`) : '<span class="muted" style="font-size:12px;">üye değilsiniz</span>'}
            ${c.can_edit ? `<button class="sbtn" onclick="openRadioChannelEditor('${c.id}')">Düzenle</button>
              <button type="button" class="act-btn act-delete" onclick="removeRadioChannel('${c.id}')">${ICON_TRASH}<span>Sil</span></button>` : ''}
          </td></tr>`).join('')}
        ${list.length ? '' : '<tr><td colspan="3" class="muted" style="text-align:center;">Henüz kanal yok. “Yeni kanal” ile oluşturun.</td></tr>'}
        </tbody></table></div>
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
      <button type="button" class="ghost-btn" style="flex:1;margin:0;" onclick="document.getElementById('radioEditBg').remove()">Vazgeç</button>
      <button type="button" style="flex:1;margin:0;" onclick="saveRadioChannel(${c ? `'${c.id}'` : 'null'})">${c ? 'Kaydet' : 'Oluştur'}</button>
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
  if(!RADIO.ctx) RADIO.ctx = new (window.AudioContext || window.webkitAudioContext)();
  if(RADIO.ctx.state==='suspended') RADIO.ctx.resume().catch(()=>{});
  return RADIO.ctx;
}
async function radioConnect(id, silent){
  const session = getSession(); if(!radioAllowed(session)) return;
  let list = APP.radioChannels;
  if(!list || !list.find(c => c.id===id)){ try{ list = await fetchRadioChannels(session); }catch(e){ return; } }
  const c = list.find(x => x.id===id && x.is_member && x.secret);
  if(!c){ radioSave(session, null); if(!silent) alert('Bu kanala erişiminiz yok'); return; }
  radioDisconnect(false);
  if(!silent) radioAudioCtx(); // tıklama anında ses izni açılsın
  RADIO.channel = { id:c.id, name:c.name, secret:c.secret };
  RADIO.status = 'Bağlanıyor…';
  radioSave(session, c.id);
  const me = { user_id: session.user_id, name: session.username };
  RADIO.rt = sb.channel('radio-' + c.secret, { config: { broadcast: { self:false }, presence: { key: session.user_id } } })
    .on('broadcast', { event:'a' }, ({ payload }) => radioOnAudio(payload))
    .on('broadcast', { event:'e' }, ({ payload }) => radioOnEnd(payload))
    .on('presence', { event:'sync' }, () => {
      const st = RADIO.rt ? RADIO.rt.presenceState() : {};
      RADIO.online = Object.values(st).map(a => a[0] && a[0].name).filter(Boolean);
      drawRadioDock();
    })
    .subscribe(status => {
      RADIO.status = status==='SUBSCRIBED' ? '' : (status==='CLOSED' ? 'Bağlantı kapandı' : 'Yeniden bağlanıyor…');
      if(status==='SUBSCRIBED' && RADIO.rt) RADIO.rt.track(me).catch(()=>{});
      drawRadioDock();
    });
  drawRadioDock();
  if(APP.view==='radio') renderRadioView(document.getElementById('main'), session);
}
function radioDisconnect(forget){
  radioStopTalk();
  if(RADIO.rt){ try{ sb.removeChannel(RADIO.rt); }catch(e){} RADIO.rt = null; }
  RADIO.channel = null; RADIO.speakers = {}; RADIO.online = []; RADIO.status = '';
  if(forget){ radioSave(getSession(), null); if(APP.view==='radio') renderRadioView(document.getElementById('main'), getSession()); }
  drawRadioDock();
}
// Çıkışta tam kapanış: mikrofon da bırakılır.
function radioShutdown(){
  radioDisconnect(false);
  if(RADIO.mic){ RADIO.mic.getTracks().forEach(t => t.stop()); RADIO.mic = null; }
  if(RADIO.src){ try{ RADIO.src.disconnect(); }catch(e){} RADIO.src = null; }
  APP.radioChannels = null;
}
// Uygulama açılışında / kullanıcı değişince kayıtlı kanala yeniden bağlan; üyelik
// değiştiyse (anahtar yenilendi, kanal silindi) bağlantıyı güncelle.
async function radioSync(){
  const session = getSession();
  if(!radioAllowed(session)){ if(RADIO.channel) radioShutdown(); return; }
  const want = radioSaved(session);
  if(!want){ if(RADIO.channel) radioDisconnect(false); return; }
  let list; try{ list = await fetchRadioChannels(session); }catch(e){ return; }
  const c = list.find(x => x.id===want && x.is_member);
  if(!c){ radioDisconnect(false); radioSave(session, null); showToast('Telsiz kanalına erişiminiz kaldırıldı'); return; }
  if(!RADIO.channel || RADIO.channel.id!==c.id || RADIO.channel.secret!==c.secret) radioConnect(c.id, true);
  else if(RADIO.channel.name!==c.name){ RADIO.channel.name = c.name; drawRadioDock(); }
}
let RADIO_SYNC_TIMER = null;
function radioSyncSoon(){ clearTimeout(RADIO_SYNC_TIMER); RADIO_SYNC_TIMER = setTimeout(radioSync, 800); }

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

async function radioStartTalk(){
  if(RADIO.talking || !RADIO.rt || !RADIO.channel) return;
  RADIO.talking = true; drawRadioDock();
  const ctx = radioAudioCtx();
  try{
    if(!RADIO.mic) RADIO.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true } });
  }catch(e){ RADIO.talking = false; drawRadioDock(); alert('Mikrofona erişilemedi. Tarayıcı/uygulama ayarlarından mikrofon izni verin.'); return; }
  if(!RADIO.talking) return; // izin beklenirken bırakıldı
  radioBeep(880);
  if(!RADIO.src) RADIO.src = ctx.createMediaStreamSource(RADIO.mic);
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  const ratio = ctx.sampleRate / RADIO_RATE; let pos = 0;
  RADIO.buf = []; RADIO.seq = 0;
  proc.onaudioprocess = (ev) => {
    if(!RADIO.talking) return;
    const inp = ev.inputBuffer.getChannelData(0);
    // Basit ortalamalı küçültme (8 kHz): her çıkış örneği, kapsadığı giriş örneklerinin ortalaması.
    for(; pos < inp.length; pos += ratio){
      const a = Math.floor(pos), b = Math.min(inp.length, Math.floor(pos + ratio)); let sum = 0, n = 0;
      for(let i = a; i < b; i++){ sum += inp[i]; n++; }
      RADIO.buf.push(muLawEncode(n ? sum / n : inp[a]));
    }
    pos -= inp.length;
    if(RADIO.buf.length >= 960) radioFlush();
  };
  RADIO.src.connect(proc); proc.connect(ctx.destination); // bazı tarayıcılar çıkışa bağlanmadan işlemiyor (çıkış sessiz)
  RADIO.proc = proc;
}
function radioFlush(){
  if(!RADIO.buf.length || !RADIO.rt) return;
  const session = getSession();
  const d = bytesToB64(Uint8Array.from(RADIO.buf)); RADIO.buf = [];
  RADIO.rt.send({ type:'broadcast', event:'a', payload:{ u: session.user_id, n: session.username, s: RADIO.seq++, d } });
}
function radioStopTalk(){
  if(!RADIO.talking) return;
  RADIO.talking = false;
  if(RADIO.proc){ radioFlush(); try{ RADIO.src.disconnect(RADIO.proc); RADIO.proc.disconnect(); }catch(e){} RADIO.proc = null; }
  const session = getSession();
  if(RADIO.rt && session) RADIO.rt.send({ type:'broadcast', event:'e', payload:{ u: session.user_id } });
  radioBeep(660);
  drawRadioDock();
}

/* ---- Dinleme ---- */
function radioOnAudio(p){
  if(!p || !p.d) return;
  const ctx = radioAudioCtx();
  const bytes = b64ToBytes(p.d);
  const ab = ctx.createBuffer(1, bytes.length, RADIO_RATE), ch = ab.getChannelData(0);
  for(let i = 0; i < bytes.length; i++) ch[i] = muLawDecode(bytes[i]);
  const src = ctx.createBufferSource(); src.buffer = ab; src.connect(ctx.destination);
  const now = ctx.currentTime;
  // Ağ dalgalanmasına karşı küçük tampon; çok gerideyse (gecikme birikti) yeniden hizala.
  if(RADIO.playAt < now || RADIO.playAt > now + 1.5) RADIO.playAt = now + 0.18;
  src.start(RADIO.playAt); RADIO.playAt += ab.duration;
  const was = RADIO.speakers[p.u];
  clearTimeout(was && was.t);
  RADIO.speakers[p.u] = { name: p.n, t: setTimeout(() => radioOnEnd({ u: p.u }), 1500) };
  if(!was) drawRadioDock();
}
function radioOnEnd(p){
  const sp = p && RADIO.speakers[p.u]; if(!sp) return;
  clearTimeout(sp.t); delete RADIO.speakers[p.u]; drawRadioDock();
}
function radioBeep(freq){
  try{
    const ctx = radioAudioCtx(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = 0.06; o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.07);
  }catch(e){}
}

/* ---- Kalıcı telsiz paneli (tüm ekranlarda) ---- */
function drawRadioDock(){
  let dock = document.getElementById('radioDock');
  if(!RADIO.channel){ if(dock) dock.remove(); return; }
  if(!dock){
    dock = document.createElement('div'); dock.id = 'radioDock';
    dock.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:95;background:var(--panel);border:1px solid var(--border);border-radius:18px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:10px 12px;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);';
    document.body.appendChild(dock);
  }
  const speaking = Object.values(RADIO.speakers).map(s => s.name);
  const suspended = RADIO.ctx && RADIO.ctx.state==='suspended';
  const line = RADIO.status || (speaking.length ? '🔊 ' + speaking.join(', ') + ' konuşuyor'
    : suspended ? '🔇 Sesi açmak için dokunun' : (RADIO.online.length + ' kişi çevrimiçi'));
  dock.innerHTML = `
    <div style="min-width:0;flex:1;cursor:pointer;" onclick="radioAudioCtx();drawRadioDock();" title="${escapeAttr(RADIO.online.join(', '))}">
      <div style="font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📻 ${escapeHtml(RADIO.channel.name)}</div>
      <div class="muted" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px;">${escapeHtml(line)}</div>
    </div>
    <button type="button" id="radioPtt" style="margin:0;width:auto;min-width:118px;padding:12px 14px;border-radius:999px;font-weight:800;touch-action:none;user-select:none;-webkit-user-select:none;${RADIO.talking ? 'background:#dc2626;border-color:#dc2626;color:#fff;' : speaking.length ? 'opacity:.85;' : ''}">${RADIO.talking ? '🎙️ Konuşuyor…' : '🎙️ Bas-Konuş'}</button>
    <button type="button" class="ghost-btn" style="margin:0;width:auto;padding:8px 10px;" title="Telsizi kapat" onclick="radioDisconnect(true)">✕</button>`;
  const b = document.getElementById('radioPtt');
  const down = (e) => { e.preventDefault(); try{ b.setPointerCapture(e.pointerId); }catch(_){} radioStartTalk(); };
  const up = (e) => { e.preventDefault(); radioStopTalk(); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  b.addEventListener('contextmenu', e => e.preventDefault());
}
// Bilgisayarda boşluk tuşu bas-konuş (yazı alanındayken devre dışı).
function radioIsTyping(e){ const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
document.addEventListener('keydown', e => { if(e.code==='Space' && RADIO.channel && !e.repeat && !radioIsTyping(e)){ e.preventDefault(); radioStartTalk(); } });
document.addEventListener('keyup', e => { if(e.code==='Space' && RADIO.talking){ e.preventDefault(); radioStopTalk(); } });
window.addEventListener('blur', () => radioStopTalk());
// Tarayıcı ses iznini ilk dokunuşta açar (yenileme sonrası otomatik bağlantı için).
document.addEventListener('pointerdown', () => { if(RADIO.channel && RADIO.ctx && RADIO.ctx.state==='suspended'){ RADIO.ctx.resume().then(drawRadioDock).catch(()=>{}); } }, true);
