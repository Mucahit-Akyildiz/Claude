/* ---- Sesli arama (birebir, WebRTC) ----
   Sinyalleşme işletmenin gerçek zamanlı kanalı üzerinden ('call-<restaurant_id>'), ses ise iki cihaz
   arasında doğrudan (WebRTC) akar; sunucuda kayıt tutulmaz. Bağlantı için ücretsiz STUN sunucuları
   kullanılır (bazı mobil operatörlerde bağlanamayabilir; gerekirse TURN eklenir).
   Arayan, karşı taraf açana kadar daveti 3 sn'de bir tekrarlar; böylece uygulaması kapalı olan kişi
   "X sizi arıyor" bildirimine dokunup uygulamayı açtığında da arama ekranı gelir. 35 sn'de cevap yoksa
   arama düşer. Olaylar: invite, accept, decline, cancel, busy, end, sdp, ice. */
const CALL_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const CALL = { ch: null, key: '', state: 'idle', id: null, peer: null, peerName: '', pc: null, role: null,
  startedAt: 0, timer: null, ringT: null, inviteT: null, remoteAudio: null, pendingIce: [], muted: false, ringCtx: null, ringOsc: null };

function callChannel(){
  const session = getSession(); if(!session || !session.restaurant_id) return null;
  const key = session.restaurant_id + '|' + session.user_id;
  if(CALL.ch && CALL.key === key) return CALL.ch;
  if(CALL.ch){ try{ sb.removeChannel(CALL.ch); }catch(e){} }
  CALL.key = key;
  CALL.ch = sb.channel('call-' + session.restaurant_id, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'c' }, ({ payload }) => callReceive(payload))
    .subscribe();
  return CALL.ch;
}
function callSend(type, data){
  const session = getSession(); const ch = callChannel();
  if(!ch || !session || !CALL.peer) return;
  try{ ch.send({ type: 'broadcast', event: 'c', payload: Object.assign({ type, id: CALL.id, from: session.user_id, fromName: session.username, to: CALL.peer }, data || {}) }); }catch(e){}
}
// Oturum açıkken kanala bağlı kal (gelen aramalar için); uygulama öne gelince kontrol et.
setInterval(() => { if(getSession() && typeof sb !== 'undefined') callChannel(); }, 10000);
document.addEventListener('visibilitychange', () => { if(!document.hidden && getSession()) callChannel(); });
setTimeout(() => { if(getSession()) callChannel(); }, 1500);

/* ---- Arama başlatma ---- */
async function startVoiceCall(userId, name){
  const session = getSession(); if(!session || !userId || userId === session.user_id) return;
  if(CALL.state !== 'idle'){ showToast('Zaten bir görüşmedesiniz'); return; }
  if(!window.RTCPeerConnection){ alert('Bu cihaz/tarayıcı sesli aramayı desteklemiyor.'); return; }
  let mic;
  try{ mic = await getSharedMic(); }
  catch(e){ alert('Mikrofona erişilemedi. Tarayıcı/uygulama ayarlarından mikrofon izni verin.'); return; }
  callChannel();
  Object.assign(CALL, { state: 'calling', id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), peer: userId, peerName: name || 'Kişi', role: 'caller', pendingIce: [], muted: false });
  callCreatePc(mic);
  callDrawUi();
  const invite = () => { if(CALL.state === 'calling') callSend('invite'); };
  invite();
  CALL.inviteT = setInterval(invite, 3000);
  // Karşı tarafın uygulaması kapalıysa "sizi arıyor" bildirimi gider.
  sb.rpc('notify_call', { p_token: session.session_token, p_to: userId }).then(() => {}, () => {});
  CALL.ringT = setTimeout(() => { if(CALL.state === 'calling'){ callSend('cancel'); callEnd('Cevap yok'); } }, 35000);
}

/* ---- Gelen sinyaller ---- */
async function callReceive(p){
  const session = getSession(); if(!session || !p || p.to !== session.user_id) return;
  if(p.type === 'invite'){
    if(CALL.state !== 'idle'){
      // Aynı aramanın tekrarlanan daveti yok sayılır; başka biri arıyorsa meşgul yanıtı.
      if(CALL.id !== p.id){ const keep = { peer: CALL.peer, id: CALL.id }; CALL.peer = p.from; CALL.id = p.id; callSend('busy'); CALL.peer = keep.peer; CALL.id = keep.id; }
      return;
    }
    Object.assign(CALL, { state: 'ringing', id: p.id, peer: p.from, peerName: p.fromName || 'Kişi', role: 'callee', pendingIce: [], muted: false });
    callDrawUi(); callRing(true);
    CALL.ringT = setTimeout(() => { if(CALL.state === 'ringing') callEnd('Cevapsız arama'); }, 40000);
    return;
  }
  if(p.id !== CALL.id || p.from !== CALL.peer) return;
  if(p.type === 'accept' && CALL.state === 'calling'){
    clearInterval(CALL.inviteT); clearTimeout(CALL.ringT);
    CALL.state = 'connecting'; callDrawUi();
    const offer = await CALL.pc.createOffer({ offerToReceiveAudio: true });
    await CALL.pc.setLocalDescription(offer);
    callSend('sdp', { sdp: CALL.pc.localDescription });
  } else if(p.type === 'sdp' && CALL.pc){
    await CALL.pc.setRemoteDescription(p.sdp);
    for(const c of CALL.pendingIce.splice(0)){ try{ await CALL.pc.addIceCandidate(c); }catch(e){} }
    if(p.sdp.type === 'offer'){
      const ans = await CALL.pc.createAnswer();
      await CALL.pc.setLocalDescription(ans);
      callSend('sdp', { sdp: CALL.pc.localDescription });
    }
  } else if(p.type === 'ice' && CALL.pc){
    if(CALL.pc.remoteDescription) { try{ await CALL.pc.addIceCandidate(p.cand); }catch(e){} }
    else CALL.pendingIce.push(p.cand);
  } else if(p.type === 'decline'){ callEnd('Arama reddedildi');
  } else if(p.type === 'busy'){ callEnd('Kişi şu an başka bir görüşmede');
  } else if(p.type === 'cancel'){ callEnd(CALL.state === 'ringing' ? 'Cevapsız arama: ' + CALL.peerName : 'Arama iptal edildi');
  } else if(p.type === 'end'){ callEnd('Görüşme bitti'); }
}

function callCreatePc(mic){
  const pc = new RTCPeerConnection({ iceServers: CALL_ICE });
  mic.getAudioTracks().forEach(t => pc.addTrack(t, mic));
  pc.onicecandidate = (e) => { if(e.candidate) callSend('ice', { cand: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
  pc.ontrack = (e) => {
    if(!CALL.remoteAudio){ CALL.remoteAudio = document.createElement('audio'); CALL.remoteAudio.autoplay = true; CALL.remoteAudio.setAttribute('playsinline', ''); document.body.appendChild(CALL.remoteAudio); }
    CALL.remoteAudio.srcObject = e.streams[0] || new MediaStream([e.track]);
    CALL.remoteAudio.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if(st === 'connected' && CALL.state !== 'active'){ CALL.state = 'active'; CALL.startedAt = Date.now(); clearInterval(CALL.timer); CALL.timer = setInterval(callDrawUi, 1000); callDrawUi(); }
    if(st === 'failed'){ callSend('end'); callEnd('Bağlantı kurulamadı (ağ kısıtlaması olabilir)'); }
    if(st === 'disconnected'){ setTimeout(() => { if(CALL.pc === pc && pc.connectionState === 'disconnected'){ callSend('end'); callEnd('Bağlantı koptu'); } }, 6000); }
  };
  CALL.pc = pc;
}

/* ---- Kullanıcı eylemleri ---- */
async function acceptVoiceCall(){
  if(CALL.state !== 'ringing') return;
  callRing(false); clearTimeout(CALL.ringT);
  let mic;
  try{ mic = await getSharedMic(); }
  catch(e){ callSend('decline'); callEnd('Mikrofona erişilemedi'); return; }
  CALL.state = 'connecting';
  callCreatePc(mic);
  callDrawUi();
  callSend('accept');
}
function declineVoiceCall(){ if(CALL.state === 'ringing'){ callSend('decline'); callEnd(); } }
function hangupVoiceCall(){
  if(CALL.state === 'calling') callSend('cancel');
  else if(CALL.state !== 'idle') callSend('end');
  callEnd();
}
function toggleCallMute(){
  CALL.muted = !CALL.muted;
  if(CALL.pc) CALL.pc.getSenders().forEach(s => { if(s.track) s.track.enabled = !CALL.muted; });
  callDrawUi();
}
function callEnd(msg){
  clearInterval(CALL.inviteT); clearTimeout(CALL.ringT); clearInterval(CALL.timer);
  callRing(false);
  if(CALL.pc){
    // Paylaşılan mikrofon akışı kapatılmaz (telsiz/sesli mesaj da kullanıyor); sadece sesi geri açılır.
    CALL.pc.getSenders().forEach(s => { if(s.track) s.track.enabled = true; });
    try{ CALL.pc.close(); }catch(e){}
  }
  if(CALL.remoteAudio){ CALL.remoteAudio.srcObject = null; CALL.remoteAudio.remove(); }
  Object.assign(CALL, { state: 'idle', id: null, peer: null, pc: null, role: null, remoteAudio: null, pendingIce: [], muted: false });
  removeEl('callUi');
  if(msg) showToast('📞 ' + msg);
}

/* ---- Zil sesi (gelen arama) ---- */
function callRing(on){
  try{
    if(!on){ if(CALL.ringOsc){ clearInterval(CALL.ringOsc); CALL.ringOsc = null; } if(navigator.vibrate) navigator.vibrate(0); return; }
    CALL.ringCtx = CALL.ringCtx || new (window.AudioContext || window.webkitAudioContext)();
    const beep = () => {
      const ctx = CALL.ringCtx; if(ctx.state === 'suspended') ctx.resume();
      [0, 0.35].forEach(dt => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime + dt);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dt + 0.3);
        o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + dt); o.stop(ctx.currentTime + dt + 0.32);
      });
      if(navigator.vibrate) navigator.vibrate([300, 200, 300]);
    };
    beep(); CALL.ringOsc = setInterval(beep, 2000);
  }catch(e){}
}

/* ---- Arama ekranı ---- */
function callDrawUi(){
  if(CALL.state === 'idle'){ removeEl('callUi'); return; }
  let ui = document.getElementById('callUi');
  if(!ui){
    ui = document.createElement('div'); ui.id = 'callUi';
    ui.style.cssText = 'position:fixed;inset:0;z-index:400;background:linear-gradient(180deg,#0f2b27 0%,#0a1615 100%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:60px 20px 50px;';
    document.body.appendChild(ui);
  }
  const secs = CALL.state === 'active' ? Math.floor((Date.now() - CALL.startedAt) / 1000) : 0;
  const status = CALL.state === 'calling' ? 'Aranıyor…' : CALL.state === 'ringing' ? 'Sesli arama geliyor…'
    : CALL.state === 'connecting' ? 'Bağlanıyor…' : Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  const btn = (bg, label, fn, ic) => `<button type="button" style="width:72px;height:72px;border-radius:50%;margin:0;padding:0;border:0;background:${bg};color:#fff;font-size:28px;box-shadow:0 8px 24px rgba(0,0,0,.35);" title="${label}" ${act(fn)}>${ic}</button>
    <div style="font-size:12px;margin-top:8px;opacity:.8;text-align:center;">${label}</div>`;
  const initial = escapeHtml((CALL.peerName || '?').trim().charAt(0).toLocaleUpperCase('tr'));
  ui.innerHTML = `<div style="text-align:center;">
      <div style="width:110px;height:110px;border-radius:50%;margin:0 auto 18px;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:800;${CALL.state === 'ringing' || CALL.state === 'calling' ? 'animation:callPulse 1.6s infinite;' : ''}">${initial}</div>
      <div style="font-size:26px;font-weight:800;">${escapeHtml(CALL.peerName)}</div>
      <div style="font-size:15px;opacity:.8;margin-top:6px;">${status}</div>
    </div>
    <div style="display:flex;gap:44px;align-items:flex-start;">
      ${CALL.state === 'ringing'
        ? `<div>${btn('#dc2626', 'Reddet', 'declineVoiceCall', '✕')}</div><div>${btn('#16a34a', 'Kabul et', 'acceptVoiceCall', '📞')}</div>`
        : `${CALL.state === 'active' || CALL.state === 'connecting' ? `<div>${btn(CALL.muted ? '#f59e0b' : 'rgba(255,255,255,.18)', CALL.muted ? 'Sesi aç' : 'Sessiz', 'toggleCallMute', CALL.muted ? '🔇' : '🎙️')}</div>` : ''}
           <div>${btn('#dc2626', 'Kapat', 'hangupVoiceCall', '✕')}</div>`}
    </div>
    <style>@keyframes callPulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.35)}70%{box-shadow:0 0 0 26px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}</style>`;
}
// Sayfa kapanırken açık görüşmeyi düzgün bitir.
window.addEventListener('pagehide', () => { if(CALL.state !== 'idle') hangupVoiceCall(); });
