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
  if(CALL.state !== 'idle' || (typeof GCALL !== 'undefined' && GCALL.state !== 'idle')){ showToast('Zaten bir görüşmedesiniz'); return; }
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
  CALL.ringT = setTimeout(() => { if(CALL.state === 'calling'){ callSend('cancel'); callNotifyEnd(CALL.peer); callEnd('Cevap yok'); } }, 35000);
}

/* ---- Gelen sinyaller ---- */
async function callReceive(p){
  const session = getSession(); if(!session || !p) return;
  if(p.room && await gcallReceive(p)) return; // grup araması sinyalleri
  if(p.to !== session.user_id) return;
  if(p.type === 'invite'){
    if(CALL.state !== 'idle' || GCALL.state !== 'idle'){
      // Aynı aramanın tekrarlanan daveti yok sayılır; başka biri arıyorsa meşgul yanıtı.
      if(CALL.id !== p.id){ const keep = { peer: CALL.peer, id: CALL.id }; CALL.peer = p.from; CALL.id = p.id; callSend('busy'); CALL.peer = keep.peer; CALL.id = keep.id; }
      return;
    }
    Object.assign(CALL, { state: 'ringing', id: p.id, peer: p.from, peerName: p.fromName || 'Kişi', role: 'callee', pendingIce: [], muted: false });
    nativeCallNotif('cancelCallNotification'); // uygulama açık: telefonun arama bildirimi kapanır, uygulama çalar
    if(callTakeAutoAccept(p.from)){ callDrawUi(); acceptVoiceCall(); return; }
    callDrawUi(); callRing(true);
    CALL.ringT = setTimeout(() => { if(CALL.state === 'ringing') callEnd('Cevapsız arama'); }, 40000);
    return;
  }
  if(p.id !== CALL.id || p.from !== CALL.peer) return;
  if(p.type === 'accept' && CALL.state === 'calling'){
    clearInterval(CALL.inviteT); clearTimeout(CALL.ringT);
    CALL.state = 'connecting'; callAudioBegin(); callDrawUi();
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
    callApplySink();
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
  CALL.state = 'connecting'; callAudioBegin();
  callCreatePc(mic);
  callDrawUi();
  callSend('accept');
}
function declineVoiceCall(){ if(CALL.state === 'ringing'){ callSend('decline'); callEnd(); } }
function hangupVoiceCall(){
  if(CALL.state === 'calling'){ callSend('cancel'); callNotifyEnd(CALL.peer); }
  else if(CALL.state !== 'idle') callSend('end');
  callEnd();
}
function toggleCallMute(){
  CALL.muted = !CALL.muted;
  if(CALL.pc) CALL.pc.getSenders().forEach(s => { if(s.track) s.track.enabled = !CALL.muted; });
  callDrawUi();
}
function callEnd(msg){
  callAudioEnd();
  clearInterval(CALL.inviteT); clearTimeout(CALL.ringT); clearInterval(CALL.timer);
  callRing(false);
  if(CALL.pc){
    // Paylaşılan mikrofon akışı kapatılmaz (telsiz/sesli mesaj da kullanıyor); sadece sesi geri açılır.
    CALL.pc.getSenders().forEach(s => { if(s.track) s.track.enabled = true; });
    try{ CALL.pc.close(); }catch(e){}
  }
  if(CALL.remoteAudio){ CALL.remoteAudio.srcObject = null; CALL.remoteAudio.remove(); }
  Object.assign(CALL, { state: 'idle', id: null, peer: null, pc: null, role: null, remoteAudio: null, pendingIce: [], muted: false });
  removeEl('callUi'); removeEl('callPill'); CALL_MIN = false;
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

/* ---- Görüşmeyi küçültme: ekran küçük bir şeride iner, uygulama kullanılmaya devam eder ---- */
let CALL_MIN = false;
function minimizeCall(){ CALL_MIN = true; removeEl('callUi'); callRefreshUi(); }
function restoreCall(){ CALL_MIN = false; removeEl('callPill'); callRefreshUi(); }
function callRefreshUi(){ if(GCALL.state !== 'idle') gcallDrawUi(); else callDrawUi(); }
function callPillHangup(){ if(GCALL.state !== 'idle') leaveGroupCall(); else hangupVoiceCall(); }
function callDrawPill(title, status, muted){
  let p = document.getElementById('callPill');
  if(!p){
    p = document.createElement('div'); p.id = 'callPill';
    p.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);left:50%;transform:translateX(-50%);z-index:400;display:flex;align-items:center;gap:10px;background:#0f2b27;color:#fff;border-radius:999px;padding:6px 6px 6px 14px;box-shadow:0 8px 24px rgba(0,0,0,.35);max-width:calc(100vw - 32px);';
    document.body.appendChild(p);
  }
  p.innerHTML = `<button type="button" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;min-width:0;" title="Görüşmeye dön" ${act('restoreCall')}>
      <span style="width:8px;height:8px;border-radius:50%;background:#16a34a;flex:none;"></span>
      <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40vw;">${escapeHtml(title)}</span>
      <span style="opacity:.8;font-variant-numeric:tabular-nums;">${status}</span>${muted ? '<span>🔇</span>' : ''}
      <span style="font-size:12px;opacity:.7;">⌃ Dön</span></button>
    <button type="button" style="width:34px;height:34px;border-radius:50%;margin:0;padding:0;border:0;background:#dc2626;color:#fff;font-size:15px;flex:none;" title="Kapat" ${act('callPillHangup')}>✕</button>`;
}
function callMinBtn(){ return `<button type="button" style="position:absolute;top:calc(env(safe-area-inset-top,0px) + 14px);left:14px;margin:0;padding:8px 14px;border:0;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:14px;" title="Uygulamaya dön (görüşme devam eder)" ${act('minimizeCall')}>⌄ Küçült</button>`; }

/* ---- Arama ekranı ---- */
function callDrawUi(){
  if(CALL.state === 'idle'){ removeEl('callUi'); removeEl('callPill'); CALL_MIN = false; return; }
  let ui = document.getElementById('callUi');
  if(!ui){
    ui = document.createElement('div'); ui.id = 'callUi';
    ui.style.cssText = 'position:fixed;inset:0;z-index:400;background:linear-gradient(180deg,#0f2b27 0%,#0a1615 100%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:60px 20px 50px;';
    document.body.appendChild(ui);
  }
  const secs = CALL.state === 'active' ? Math.floor((Date.now() - CALL.startedAt) / 1000) : 0;
  const status = CALL.state === 'calling' ? 'Aranıyor…' : CALL.state === 'ringing' ? 'Sesli arama geliyor…'
    : CALL.state === 'connecting' ? 'Bağlanıyor…' : Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  if(CALL_MIN && CALL.state !== 'ringing'){ removeEl('callUi'); callDrawPill(CALL.peerName || '', status, CALL.muted); return; }
  removeEl('callPill');
  const btn = (bg, label, fn, ic) => `<button type="button" style="width:72px;height:72px;border-radius:50%;margin:0;padding:0;border:0;background:${bg};color:#fff;font-size:28px;box-shadow:0 8px 24px rgba(0,0,0,.35);" title="${label}" ${act(fn)}>${ic}</button>
    <div style="font-size:12px;margin-top:8px;opacity:.8;text-align:center;">${label}</div>`;
  const initial = escapeHtml((CALL.peerName || '?').trim().charAt(0).toLocaleUpperCase('tr'));
  ui.innerHTML = `${CALL.state !== 'ringing' ? callMinBtn() : ''}<div style="text-align:center;">
      <div style="width:110px;height:110px;border-radius:50%;margin:0 auto 18px;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:800;${CALL.state === 'ringing' || CALL.state === 'calling' ? 'animation:callPulse 1.6s infinite;' : ''}">${initial}</div>
      <div style="font-size:26px;font-weight:800;">${escapeHtml(CALL.peerName)}</div>
      <div style="font-size:15px;opacity:.8;margin-top:6px;">${status}</div>
    </div>
    <div style="display:flex;gap:44px;align-items:flex-start;">
      ${CALL.state === 'ringing'
        ? `<div>${btn('#dc2626', 'Reddet', 'declineVoiceCall', '✕')}</div><div>${btn('#16a34a', 'Kabul et', 'acceptVoiceCall', '📞')}</div>`
        : `${CALL.state === 'active' || CALL.state === 'connecting' ? `<div>${btn(CALL.muted ? '#f59e0b' : 'rgba(255,255,255,.18)', CALL.muted ? 'Sesi aç' : 'Sessiz', 'toggleCallMute', CALL.muted ? '🔇' : '🎙️')}</div><div>${btn(CALL_AUDIO.route === 'speaker' ? '#0891b2' : 'rgba(255,255,255,.18)', callRouteLabel(), 'openCallAudioPicker', callRouteIcon())}</div>` : ''}
           <div>${btn('#dc2626', 'Kapat', 'hangupVoiceCall', '✕')}</div>`}
    </div>
    <style>@keyframes callPulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.35)}70%{box-shadow:0 0 0 26px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}</style>`;
}
// Sayfa kapanırken açık görüşmeyi düzgün bitir.
window.addEventListener('pagehide', () => { if(CALL.state !== 'idle') hangupVoiceCall(); });

/* ---- Grup sesli araması (küçük gruplar için; her katılımcı diğerleriyle doğrudan bağlanır) ----
   Başlatan, grubun üyelerine davet yayınlar (35 sn boyunca 3 sn'de bir). Katılan kişi 'gjoin'
   yayınlar; odada zaten olan herkes yeni gelene teklif (offer) gönderir, böylece herkes herkesle
   bağlanır. Ayrılan 'gleave' yayınlar; son kişi ayrılınca görüşme biter. Cihaz başına ~6-8 kişiye
   kadar uygundur (her bağlantı ayrı ses akışı taşır). */
const GCALL = { state: 'idle', room: null, group: null, groupName: '', inviter: '', members: [], peers: {}, inviteT: null, ringT: null, muted: false, startedAt: 0, timer: null };
const GCALL_MAX = 8;

function gcallSend(type, data){
  const session = getSession(); const ch = callChannel();
  if(!ch || !session || !GCALL.room) return;
  try{ ch.send({ type: 'broadcast', event: 'c', payload: Object.assign({ type, room: GCALL.room, group: GCALL.group, from: session.user_id, fromName: session.username }, data || {}) }); }catch(e){}
}
function chatGroupMemberIds(conv){
  const c = (APP.chatItems || []).find(x => x.conv === conv); if(!c) return [];
  const names = String(c.roles || '').split(', ').filter(Boolean);
  return (APP.chatItems || []).filter(x => !x.is_all && !x.is_group && names.includes(x.name)).map(x => x.conv);
}
async function startGroupCall(conv, name){
  const session = getSession(); if(!session || !String(conv).startsWith('g:')) return;
  if(CALL.state !== 'idle' || GCALL.state !== 'idle'){ showToast('Zaten bir görüşmedesiniz'); return; }
  if(!window.RTCPeerConnection){ alert('Bu cihaz/tarayıcı sesli aramayı desteklemiyor.'); return; }
  const members = chatGroupMemberIds(conv).filter(id => id !== session.user_id);
  if(!members.length){ alert('Grupta aranacak başka üye yok.'); return; }
  if(members.length + 1 > GCALL_MAX){ alert('Grup araması en fazla ' + GCALL_MAX + ' kişiyle yapılabilir.'); return; }
  try{ await getSharedMic(); }catch(e){ alert('Mikrofona erişilemedi. Tarayıcı/uygulama ayarlarından mikrofon izni verin.'); return; }
  callChannel();
  Object.assign(GCALL, { state: 'active', room: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), group: conv, groupName: name || 'Grup', inviter: session.username, members, peers: {}, muted: false, startedAt: Date.now() });
  const invite = () => { if(GCALL.state === 'active') gcallSend('ginvite', { to: GCALL.members, groupName: GCALL.groupName }); };
  invite(); GCALL.inviteT = setInterval(invite, 3000);
  // 35 sn sonra davet durur; katılmayanların telefonundaki çalan arama bildirimi susturulur.
  const room = GCALL.room;
  setTimeout(() => { clearInterval(GCALL.inviteT); if(GCALL.room === room) members.filter(id => !GCALL.peers[id]).forEach(callNotifyEnd); }, 35000);
  members.forEach(id => sb.rpc('notify_call', { p_token: session.session_token, p_to: id, p_group_name: GCALL.groupName }).then(() => {}, () => {}));
  clearInterval(GCALL.timer); GCALL.timer = setInterval(gcallDrawUi, 1000);
  callAudioBegin();
  gcallDrawUi();
}
function gcallPeerPc(userId, name){
  let peer = GCALL.peers[userId];
  if(peer) return peer;
  const pc = new RTCPeerConnection({ iceServers: CALL_ICE });
  if(SHARED_MIC) SHARED_MIC.getAudioTracks().forEach(t => { pc.addTrack(t, SHARED_MIC); t.enabled = !GCALL.muted; });
  peer = GCALL.peers[userId] = { pc, name: name || 'Kişi', audio: null, pendingIce: [], state: 'connecting' };
  pc.onicecandidate = (e) => { if(e.candidate) gcallSend('gice', { to: userId, cand: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
  pc.ontrack = (e) => {
    if(!peer.audio){ peer.audio = document.createElement('audio'); peer.audio.autoplay = true; peer.audio.setAttribute('playsinline', ''); document.body.appendChild(peer.audio); }
    peer.audio.srcObject = e.streams[0] || new MediaStream([e.track]); peer.audio.play().catch(() => {}); callApplySink();
  };
  pc.onconnectionstatechange = () => {
    peer.state = pc.connectionState;
    if(pc.connectionState === 'failed' || pc.connectionState === 'closed') gcallDropPeer(userId);
    gcallDrawUi();
  };
  return peer;
}
function gcallDropPeer(userId){
  const p = GCALL.peers[userId]; if(!p) return;
  try{ p.pc.close(); }catch(e){}
  if(p.audio){ p.audio.srcObject = null; p.audio.remove(); }
  delete GCALL.peers[userId];
  gcallDrawUi();
}
async function gcallReceive(p){
  const session = getSession(); if(!session) return false;
  if(p.type === 'ginvite'){
    if(!Array.isArray(p.to) || !p.to.includes(session.user_id)) return true;
    if(GCALL.room === p.room) return true;
    if(CALL.state !== 'idle' || GCALL.state !== 'idle') return true;
    Object.assign(GCALL, { state: 'ringing', room: p.room, group: p.group, groupName: p.groupName || 'Grup', inviter: p.fromName || '', members: p.to.concat([p.from]).filter(id => id !== session.user_id), peers: {}, muted: false });
    nativeCallNotif('cancelCallNotification');
    if(callTakeAutoAccept(p.from)){ gcallDrawUi(); acceptGroupCall(); return true; }
    gcallDrawUi(); callRing(true);
    GCALL.ringT = setTimeout(() => { if(GCALL.state === 'ringing') gcallReset('Cevapsız grup araması: ' + GCALL.groupName); }, 40000);
    return true;
  }
  if(!String(p.type || '').startsWith('g')) return false;
  if(p.room !== GCALL.room || GCALL.state !== 'active' || p.from === session.user_id) return true;
  if(p.type === 'gjoin'){
    // Odaya yeni gelene, odada olan herkes teklif gönderir.
    const peer = gcallPeerPc(p.from, p.fromName);
    const offer = await peer.pc.createOffer({ offerToReceiveAudio: true });
    await peer.pc.setLocalDescription(offer);
    gcallSend('gsdp', { to: p.from, sdp: peer.pc.localDescription });
  } else if(p.type === 'gsdp' && p.to === session.user_id){
    const peer = gcallPeerPc(p.from, p.fromName);
    await peer.pc.setRemoteDescription(p.sdp);
    for(const c of peer.pendingIce.splice(0)){ try{ await peer.pc.addIceCandidate(c); }catch(e){} }
    if(p.sdp.type === 'offer'){
      const ans = await peer.pc.createAnswer(); await peer.pc.setLocalDescription(ans);
      gcallSend('gsdp', { to: p.from, sdp: peer.pc.localDescription });
    }
  } else if(p.type === 'gice' && p.to === session.user_id){
    const peer = GCALL.peers[p.from]; if(!peer) return true;
    if(peer.pc.remoteDescription){ try{ await peer.pc.addIceCandidate(p.cand); }catch(e){} } else peer.pendingIce.push(p.cand);
  } else if(p.type === 'gleave'){
    gcallDropPeer(p.from);
  }
  return true;
}
async function acceptGroupCall(){
  if(GCALL.state !== 'ringing') return;
  callRing(false); clearTimeout(GCALL.ringT);
  try{ await getSharedMic(); }catch(e){ gcallReset('Mikrofona erişilemedi'); return; }
  GCALL.state = 'active'; GCALL.startedAt = Date.now(); callAudioBegin();
  clearInterval(GCALL.timer); GCALL.timer = setInterval(gcallDrawUi, 1000);
  gcallDrawUi();
  gcallSend('gjoin');
}
function declineGroupCall(){ if(GCALL.state === 'ringing') gcallReset(); }
function leaveGroupCall(){ if(GCALL.state === 'active') gcallSend('gleave'); gcallReset(GCALL.state === 'active' ? 'Grup aramasından ayrıldınız' : ''); }
function toggleGroupMute(){
  GCALL.muted = !GCALL.muted;
  Object.values(GCALL.peers).forEach(p => p.pc.getSenders().forEach(s => { if(s.track) s.track.enabled = !GCALL.muted; }));
  if(!Object.keys(GCALL.peers).length && SHARED_MIC) SHARED_MIC.getAudioTracks().forEach(t => { t.enabled = !GCALL.muted; });
  gcallDrawUi();
}
function gcallReset(msg){
  callAudioEnd();
  clearInterval(GCALL.inviteT); clearTimeout(GCALL.ringT); clearInterval(GCALL.timer); callRing(false);
  Object.keys(GCALL.peers).forEach(gcallDropPeer);
  if(SHARED_MIC) SHARED_MIC.getAudioTracks().forEach(t => { t.enabled = true; });
  Object.assign(GCALL, { state: 'idle', room: null, group: null, members: [], peers: {}, muted: false });
  removeEl('callUi'); removeEl('callPill'); CALL_MIN = false;
  if(msg) showToast('📞 ' + msg);
}
function gcallDrawUi(){
  if(GCALL.state === 'idle'){ removeEl('callPill'); return; }
  let ui = document.getElementById('callUi');
  if(!ui){
    ui = document.createElement('div'); ui.id = 'callUi';
    ui.style.cssText = 'position:fixed;inset:0;z-index:400;background:linear-gradient(180deg,#0f2b27 0%,#0a1615 100%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:50px 20px 50px;';
    document.body.appendChild(ui);
  }
  const btn = (bg, label, fn, ic) => `<div><button type="button" style="width:72px;height:72px;border-radius:50%;margin:0;padding:0;border:0;background:${bg};color:#fff;font-size:28px;box-shadow:0 8px 24px rgba(0,0,0,.35);" title="${label}" ${act(fn)}>${ic}</button>
    <div style="font-size:12px;margin-top:8px;opacity:.8;text-align:center;">${label}</div></div>`;
  const secs = Math.floor((Date.now() - GCALL.startedAt) / 1000);
  const peers = Object.values(GCALL.peers);
  const connected = peers.filter(p => p.state === 'connected');
  const chip = (n, st) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:76px;">
      <div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;${st === 'connected' ? 'box-shadow:0 0 0 3px #16a34a;' : 'opacity:.6;'}">${escapeHtml((n || '?').trim().charAt(0).toLocaleUpperCase('tr'))}</div>
      <div style="font-size:12px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;">${escapeHtml(n)}</div></div>`;
  const status = GCALL.state === 'ringing' ? (escapeHtml(GCALL.inviter) + ' grup araması başlattı')
    : (connected.length ? connected.length + 1 + ' kişi görüşmede · ' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') : 'Diğer üyeler bekleniyor…');
  if(CALL_MIN && GCALL.state !== 'ringing'){ removeEl('callUi'); callDrawPill('👥 ' + (GCALL.groupName || ''), connected.length ? (connected.length + 1) + ' kişi · ' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') : 'Bekleniyor…', GCALL.muted); return; }
  removeEl('callPill');
  ui.innerHTML = `${GCALL.state !== 'ringing' ? callMinBtn() : ''}<div style="text-align:center;width:100%;">
      <div style="font-size:14px;opacity:.75;">👥 Grup araması</div>
      <div style="font-size:26px;font-weight:800;margin-top:4px;">${escapeHtml(GCALL.groupName)}</div>
      <div style="font-size:15px;opacity:.8;margin-top:6px;">${status}</div>
      ${GCALL.state === 'active' ? `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:28px;">${chip('Siz', 'connected')}${peers.map(p => chip(p.name, p.state)).join('')}</div>` : ''}
    </div>
    <div style="display:flex;gap:44px;align-items:flex-start;">
      ${GCALL.state === 'ringing'
        ? btn('#dc2626', 'Reddet', 'declineGroupCall', '✕') + btn('#16a34a', 'Katıl', 'acceptGroupCall', '📞')
        : btn(GCALL.muted ? '#f59e0b' : 'rgba(255,255,255,.18)', GCALL.muted ? 'Sesi aç' : 'Sessiz', 'toggleGroupMute', GCALL.muted ? '🔇' : '🎙️') + btn(CALL_AUDIO.route === 'speaker' ? '#0891b2' : 'rgba(255,255,255,.18)', callRouteLabel(), 'openCallAudioPicker', callRouteIcon()) + btn('#dc2626', 'Ayrıl', 'leaveGroupCall', '✕')}
    </div>`;
}
window.addEventListener('pagehide', () => { if(GCALL.state === 'active') gcallSend('gleave'); });

/* ---- Android: telefon araması gibi gelen bildirim ile bağlantı ----
   Uygulama kapalı/ekran kilitliyken arama, Android'de tam ekran çalan bir bildirim olarak gelir
   (PeykMessagingService). "Kabul et" ile açılınca bekleyen kabul burada alınır; arayanın davet
   tekrarı gelince arama kendiliğinden kabul edilir. Arayan vazgeçerse telefonun zili susturulur. */
let CALL_AUTO_ACCEPT = null;
function nativeCallPlugin(){ const C = window.Capacitor; return C && C.Plugins && C.Plugins.PeykRadio; }
function nativeCallNotif(method){ const P = nativeCallPlugin(); if(P && P[method]) P[method]().catch(() => {}); }
function callTakeAutoAccept(from){
  const a = CALL_AUTO_ACCEPT;
  if(!a || Date.now() > a.until || (a.from && a.from !== from)) return false;
  CALL_AUTO_ACCEPT = null;
  return true;
}
async function consumeNativePendingCall(){
  const P = nativeCallPlugin(); if(!P || !P.consumePendingCall) return;
  try{
    const r = await P.consumePendingCall();
    if(r && r.action === 'accept') CALL_AUTO_ACCEPT = { from: r.from || null, until: Date.now() + 25000 };
    if(r && r.action){ callChannel(); }
  }catch(e){}
}
function callNotifyEnd(userId){
  const session = getSession(); if(!session || !userId) return;
  sb.rpc('notify_call', { p_token: session.session_token, p_to: userId, p_end: true }).then(() => {}, () => {});
}
setTimeout(consumeNativePendingCall, 800);
document.addEventListener('visibilitychange', () => { if(!document.hidden) consumeNativePendingCall(); });

/* ---- Ses çıkışı: ahize / hoparlör / Bluetooth / kulaklık ----
   Android uygulamasında telefon görüşme süresince "arama moduna" alınır (varsayılan ahize; kulaklık
   bağlıysa o), buton ile değiştirilir. Bilgisayarda (Chrome/Edge) ses çıkış cihazı seçilir. */
const CALL_AUDIO = { route: 'earpiece', routes: [], sinkId: '' };
const CALL_ROUTE_TXT = { earpiece: ['Ahize', '📱'], speaker: ['Hoparlör', '🔊'], bluetooth: ['Bluetooth', '🎧'], wired: ['Kulaklık', '🎧'] };
function callRouteLabel(){ return isNativeApp() ? (CALL_ROUTE_TXT[CALL_AUDIO.route] || CALL_ROUTE_TXT.earpiece)[0] : 'Ses çıkışı'; }
function callRouteIcon(){ return isNativeApp() ? (CALL_ROUTE_TXT[CALL_AUDIO.route] || CALL_ROUTE_TXT.earpiece)[1] : '🔊'; }
function callAudioApply(r){ if(r){ CALL_AUDIO.route = r.route || CALL_AUDIO.route; CALL_AUDIO.routes = r.routes || CALL_AUDIO.routes; } if(CALL.state !== 'idle') callDrawUi(); else gcallDrawUi(); }
function callAudioBegin(){
  const P = nativeCallPlugin();
  if(P && P.callAudioStart) P.callAudioStart({ route: 'auto' }).then(callAudioApply).catch(() => {});
  else callApplySink();
}
function callAudioEnd(){ const P = nativeCallPlugin(); if(P && P.callAudioStop) P.callAudioStop().catch(() => {}); }
function callRemoteAudios(){
  const list = [];
  if(CALL.remoteAudio) list.push(CALL.remoteAudio);
  Object.values(GCALL.peers || {}).forEach(p => { if(p.audio) list.push(p.audio); });
  return list;
}
function callApplySink(){
  if(!CALL_AUDIO.sinkId) return;
  callRemoteAudios().forEach(a => { if(a.setSinkId) a.setSinkId(CALL_AUDIO.sinkId).catch(() => {}); });
}
async function openCallAudioPicker(){
  removeEl('callAudioBg');
  let items = [];
  const P = nativeCallPlugin();
  if(P && P.callAudioState){
    try{ callAudioApply(await P.callAudioState()); }catch(e){}
    items = (CALL_AUDIO.routes.length ? CALL_AUDIO.routes : ['earpiece', 'speaker']).map(r => ({ id: r, label: (CALL_ROUTE_TXT[r] || [r, '🔈'])[1] + ' ' + (CALL_ROUTE_TXT[r] || [r])[0], on: CALL_AUDIO.route === r }));
  } else if(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices && HTMLMediaElement.prototype.setSinkId){
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput');
    items = devs.map((d, i) => ({ id: d.deviceId, label: '🔈 ' + (d.label || ('Ses çıkışı ' + (i + 1))), on: (CALL_AUDIO.sinkId || 'default') === d.deviceId }));
  }
  if(!items.length){ showToast('Bu cihazda ses çıkışı tarayıcı/telefon tarafından seçilir (ses tuşlarıyla / kontrol merkezinden değiştirin).'); return; }
  const ov = document.createElement('div'); ov.id = 'callAudioBg';
  ov.style.cssText = 'position:fixed;inset:0;z-index:450;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;padding:16px;';
  ov.innerHTML = `<div class="box" style="max-width:380px;width:100%;margin:0 0 30px;text-align:left;">
    <h3 style="margin:0 0 10px;">Ses çıkışı</h3>
    ${items.map(it => `<button type="button" class="${it.on ? '' : 'ghost-btn'}" style="width:100%;margin:0 0 8px;text-align:left;" ${act('setCallAudioRoute', it.id)}>${escapeHtml(it.label)}${it.on ? ' ✓' : ''}</button>`).join('')}
  </div>`;
  ov.onclick = (e) => { if(e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
async function setCallAudioRoute(id){
  removeEl('callAudioBg');
  const P = nativeCallPlugin();
  if(P && P.callAudioRoute){ try{ callAudioApply(await P.callAudioRoute({ route: id })); }catch(e){} return; }
  CALL_AUDIO.sinkId = id; callApplySink(); callAudioApply();
}
