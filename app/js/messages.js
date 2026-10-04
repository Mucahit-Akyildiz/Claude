/* ================= MESAJLAR (uygulama içi mesajlaşma) =================
   İşletmedeki personel arasında birebir mesajlar ve herkesin gördüğü
   "Genel" kanal. Yeni mesajlar değişiklik sayacı (bkz. checkDataVersion)
   ile birkaç saniye içinde gelir; yazılan mesaj kutusu yenilemede silinmez.
   WhatsApp benzeri: gruplar, yanıtlama (alıntı), sesli mesaj, kamerayla
   anlık fotoğraf, dosya gönderme, herkesten silme, okundu (✓✓), tepkiler,
   emoji, hazır yanıtlar ve sesle yazma. Okunmamış sayısı menü rozetinde. */
const CHAT_EMOJI = {
  '😀': '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 🥵 🥶 😱 😨 😰 🤗 🤔 🤭 🤫 😶 😐 😑 😬 🙄 😴 🤤 😪 😵 🤐 🤢 🤮 🤧 😷 🤒 🤕',
  '👍': '👍 👎 👌 ✌️ 🤞 🤟 🤘 👏 🙌 👐 🙏 🤝 💪 👋 ✋ 👊 ✊ 👈 👉 👆 👇 ☝️ 🫡 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💯 ✅ ❌ ⚠️ ❗ ❓ 🔥 ⭐ ✨ 🎉 🎊 💤 💬',
  '🍔': '🍕 🍔 🍟 🌭 🥪 🌮 🌯 🥙 🧆 🥚 🍳 🥘 🍲 🥗 🍿 🧈 🥩 🍗 🍖 🥓 🍝 🍜 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🥠 🍢 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍩 🍪 🍦 🍨 ☕ 🍵 🥤 🧃 🍺 🍻 🥂 🍷 🍸 🍹 🧊 🍽️ 🔪 🥄',
  '💩': '💩 🤡 👻 💀 ☠️ 👽 👾 🤖 🎃 😈 👿 👹 👺 🙈 🙉 🙊 🤠 🥸 🤓 🧐 😺 😸 😹 😻 😼 😽 🙀 😿 😾 🫠 🫣 🫢 🫥 🤥 🤑 😮‍💨 🥴 🤬 🖕 💅 🤳 🦄 🐸 🐵 🐒 🐔 🐧 🐷 🐮 🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐍 🐢 🐙 🦀 🐟 🐬 🦋 🐌 🐞 🐜 🪳 🦟 🍆 🍑 🍌 🌶️ 🧄 🧅',
  '🎉': '🎉 🎊 🎈 🎁 🏆 🥇 🥈 🥉 ⚽ 🏀 🏐 🎮 🎲 🎯 🎵 🎶 🎤 🎧 📸 🎬 🚀 ✈️ 🏖️ 🌙 ☀️ 🌧️ ⛈️ ❄️ 🌈 🌹 🌸 🌻 🍀 💐 💎 💸 🔔 📢 💡 🔋 🧨 💣 🪄 🧿',
  '⏰': '⏰ ⏳ ⌛ 🕐 📅 📌 📍 🚚 🛵 🚗 🏃 🧾 💳 💵 💰 🧹 🧽 🧺 📦 🛒 📞 📱 💻 🖨️ 🔔 🔕 🔑 🚪 🪑 🛎️',
};
const CHAT_QUICK = ['👍 Tamamdır', '🙏 Teşekkürler', '⏳ 5 dk geliyorum', '🔥 Acil!', '🍽️ Sipariş hazır', '🧾 Hesap istendi', '🧹 Masa temizlensin', '❓ Neredesin?', '✅ Hallettim', '😂', '🎉', '❤️'];

function chatColor(name){
  let h = 0; for(const ch of String(name||'')) h = (h*31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 46%)`;
}
function chatAvatar(c, size){
  const s = size || 42;
  if(c.is_all) return `<div class="chat-avatar" style="width:${s}px;height:${s}px;background:linear-gradient(135deg,var(--accent),#7c5cff);color:#fff;">📢</div>`;
  if(c.is_group) return `<div class="chat-avatar" style="width:${s}px;height:${s}px;background:${chatColor(c.name)};color:#fff;">👥</div>`;
  return `<div class="chat-avatar" style="width:${s}px;height:${s}px;background:${chatColor(c.name)};color:#fff;">${escapeHtml((c.name||'?').slice(0,1).toLocaleUpperCase('tr'))}${c.online ? '<span class="chat-online"></span>' : ''}</div>`;
}
async function renderMessagesView(main, session){
  main.innerHTML = `<div class="chat-shell ${APP.chatConv ? 'has-conv' : ''}">
      <div class="chat-list-wrap">
        <div class="chat-list-head"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><h1 style="margin:0;">💬 Mesajlar</h1>
          <button type="button" class="chat-newgroup" onclick="openChatGroupEditor()" title="Yeni grup">👥＋ Grup</button></div>
          <input id="chatSearch" placeholder="🔍 Kişi ara…" value="${escapeAttr(APP.chatSearch||'')}" oninput="APP.chatSearch=this.value;drawChatList()"></div>
        <div class="chat-list" id="chatList"><p class="muted">Yükleniyor…</p></div>
      </div>
      <div class="chat-pane" id="chatPane">${APP.chatConv ? '' : chatEmptyPaneHtml()}</div>
    </div>`;
  await refreshChatList();
  if(APP.chatConv) openChatConv(APP.chatConv, true);
}
function chatEmptyPaneHtml(){
  return '<div class="chat-empty"><div style="font-size:54px;">💬</div><b>Ekibinizle mesajlaşın</b><p class="muted">Soldan bir kişi ya da Genel kanalı seçin.</p></div>';
}
async function refreshChatList(){
  const session = getSession(); const el = document.getElementById('chatList'); if(!session || !el) return;
  const { data, error } = await sb.rpc('list_chat_conversations', { p_token: session.session_token });
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  APP.chatItems = data.items || [];
  drawChatList();
}
function drawChatList(){
  const el = document.getElementById('chatList'); if(!el) return;
  const q = (APP.chatSearch||'').trim().toLocaleLowerCase('tr');
  const items = (APP.chatItems||[]).filter(c => !q || (c.name||'').toLocaleLowerCase('tr').includes(q));
  el.innerHTML = items.map(c => `
    <div class="chat-item ${APP.chatConv===c.conv?'active':''} ${c.unread>0?'unread':''}" data-conv="${c.conv}" onclick="openChatConv('${c.conv}')">
      ${chatAvatar(c)}
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;gap:6px;align-items:baseline;"><span class="chat-name">${escapeHtml(c.name)}</span>${c.last_at ? `<span class="chat-when">${chatTime(c.last_at)}</span>` : ''}</div>
        <div style="display:flex;justify-content:space-between;gap:6px;align-items:center;">
          <span class="chat-last">${c.last_body ? escapeHtml(c.last_body) : `<i>${escapeHtml(c.roles || (c.is_all ? 'Tüm ekip' : ''))}</i>`}</span>
          ${c.unread > 0 ? `<span class="chat-unread">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
        </div>
      </div>
    </div>`).join('') || '<p class="muted" style="padding:12px;">Kişi bulunamadı.</p>';
}
function chatTime(iso){
  const d = new Date(iso), now = new Date();
  return d.toDateString()===now.toDateString() ? d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'});
}
async function openChatConv(conv, keepDraft){
  const pane = document.getElementById('chatPane'); if(!pane) return;
  const changed = APP.chatConv !== conv;
  APP.chatConv = conv;
  const shell = document.querySelector('.chat-shell'); if(shell) shell.classList.add('has-conv');
  const c = (APP.chatItems||[]).find(x => x.conv===conv) || { name: 'Sohbet' };
  if(changed || !document.getElementById('chatThread')){
    pane.innerHTML = `<div class="chat-head">
        <button type="button" class="chat-back" onclick="closeChatConv()" aria-label="Geri">←</button>
        ${chatAvatar(c, 38)}
        <div style="min-width:0;flex:1;"><div class="chat-name">${escapeHtml(c.name)}</div>
          <div class="chat-sub">${c.is_all ? 'Tüm ekip bu kanalı görür' : c.is_group ? escapeHtml(c.roles || '') : (c.online ? '<span style="color:var(--green);">● Çevrimiçi</span>' : 'Çevrimdışı') + (c.roles ? ' · ' + escapeHtml(c.roles) : '')}</div></div>
        ${c.is_group ? `<button type="button" class="chat-ic" title="Grup ayarları" onclick="openChatGroupMenu('${conv}')">⋮</button>` : ''}
      </div>
      <div class="chat-thread" id="chatThread"><p class="muted">Yükleniyor…</p></div>
      <div class="chat-reply-bar" id="chatReplyBar"></div>
      <div class="chat-tray" id="chatTray"></div>
      <div class="chat-rec-bar" id="chatRecBar"></div>
      <form class="chat-input" id="chatInputForm" onsubmit="sendChatMessage();return false;">
        <button type="button" class="chat-ic" title="Emoji" onclick="toggleChatTray('emoji')">😊</button>
        <button type="button" class="chat-ic" title="Ekle: kamera, fotoğraf, dosya, hazır yanıt" onclick="toggleChatTray('attach')">📎</button>
        <textarea id="chatText" rows="1" placeholder="Mesaj yazın…" maxlength="4000"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px';updateChatSendBtn()"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMessage();}"></textarea>
        <button type="button" class="chat-send" id="chatSendBtn" title="Sesli mesaj kaydet" onclick="onChatSendBtn()">🎙️</button>
      </form>
      <input type="file" id="chatFileImage" accept="image/*" style="display:none;" onchange="sendChatImage(this)">
      <input type="file" id="chatFileAny" style="display:none;" onchange="sendChatFile(this)">`;
    APP.chatReply = null;
  }
  document.querySelectorAll('.chat-item').forEach(el => el.classList.toggle('active', el.dataset.conv===conv));
  await refreshChatThread();
  refreshChatList(); refreshNavBadges();
  if(!keepDraft){ const t = document.getElementById('chatText'); if(t && window.innerWidth > 760) t.focus(); }
}
function closeChatConv(){
  stopChatDictation();
  APP.chatConv = null;
  const shell = document.querySelector('.chat-shell'); if(shell) shell.classList.remove('has-conv');
  const pane = document.getElementById('chatPane'); if(pane) pane.innerHTML = chatEmptyPaneHtml();
  refreshChatList();
}
const CHAT_ONLY_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u;
async function refreshChatThread(){
  const session = getSession(); const el = document.getElementById('chatThread');
  if(!session || !el || !APP.chatConv) return;
  const { data, error } = await sb.rpc('get_chat_messages', { p_token: session.session_token, p_conv: APP.chatConv });
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  const isAll = APP.chatConv==='all';
  const isGroup = String(APP.chatConv).startsWith('g:');
  const rows = data || [];
  APP.chatRows = rows;
  let lastDay = '';
  el.innerHTML = rows.length ? rows.map((m, i) => {
    const day = new Date(m.created_at).toLocaleDateString('tr-TR', { day:'numeric', month:'long', weekday:'long' });
    const sep = day!==lastDay ? `<div class="chat-day"><span>${day}</span></div>` : ''; lastDay = day;
    const prev = rows[i-1], next = rows[i+1];
    const first = !prev || prev.sender_id!==m.sender_id || sep;
    const last = !next || next.sender_id!==m.sender_id;
    const jumbo = !m.deleted && !m.attachment_kind && m.body && m.body.length <= 12 && CHAT_ONLY_EMOJI.test(m.body);
    const showSender = (isAll || isGroup) && !m.mine;
    const tick = !m.mine ? '' : m.read === true || (m.read_count != null && m.member_count > 0 && m.read_count >= m.member_count)
      ? '<span class="chat-tick read" title="Okundu">✓✓</span>'
      : m.read_count > 0 ? `<span class="chat-tick" title="${m.read_count}/${m.member_count} kişi okudu">✓✓</span>`
      : (m.read === false || m.read_count === 0) ? '<span class="chat-tick" title="Gönderildi">✓</span>' : '';
    let content = '';
    if(m.deleted) content = `<div class="chat-body chat-deleted">🚫 Bu mesaj silindi</div>`;
    else {
      if(m.reply) content += `<div class="chat-quote" onclick="event.stopPropagation();scrollToChatMessage('${m.reply.id}')"><b style="color:${chatColor(m.reply.sender_name)};">${escapeHtml(m.reply.sender_name)}</b><div>${escapeHtml(m.reply.preview||'')}</div></div>`;
      if(m.attachment_kind==='image' && m.attachment) content += `<img class="chat-img" src="${m.attachment}" alt="" loading="lazy" onclick="openChatImage(this.src)">`;
      if(m.attachment_kind==='audio') content += `<div class="chat-audio" data-att="${m.id}"><button type="button" class="chat-audio-play" onclick="event.stopPropagation();loadChatAudio('${m.id}', this)">▶</button><span>🎤 Sesli mesaj</span></div>`;
      if(m.attachment_kind==='file') content += `<button type="button" class="chat-file" onclick="event.stopPropagation();downloadChatFile('${m.id}')"><span class="chat-file-ic">📄</span><span style="min-width:0;"><b>${escapeHtml(m.attachment_name||'Dosya')}</b><small>${chatFileSize(m.attachment_size)} · indir</small></span></button>`;
      if(m.body) content += `<div class="chat-body">${escapeHtml(m.body)}</div>`;
    }
    return sep + `<div class="chat-row ${m.mine?'mine':''} ${last?'last':''}" data-mid="${m.id}">
      ${showSender ? (last ? chatAvatar({ name: m.sender_name }, 28) : '<div style="width:28px;flex-shrink:0;"></div>') : ''}
      <div class="chat-msg ${jumbo?'jumbo':''} ${m.attachment_kind==='image' && !m.body && !m.reply ? 'media' : ''}" ondblclick="startChatReply('${m.id}')">
        ${showSender && first ? `<div class="chat-sender" style="color:${chatColor(m.sender_name)};">${escapeHtml(m.sender_name)}</div>` : ''}
        ${content}
        <div class="chat-time">${new Date(m.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} ${tick}</div>
        ${(m.reactions||[]).length ? `<div class="chat-reacts">${m.reactions.map(r => `<button type="button" class="chat-react ${r.mine?'mine':''}" title="${escapeAttr(r.names||'')}" onclick="event.stopPropagation();toggleChatReaction('${m.id}','${r.emoji}')">${r.emoji}${r.count>1?` <b>${r.count}</b>`:''}</button>`).join('')}</div>` : ''}
      </div>
      ${m.deleted ? '' : `<button type="button" class="chat-react-open" title="Seçenekler" onclick="event.stopPropagation();openReactionBar(this,'${m.id}')">⌄</button>`}
    </div>`;
  }).join('') : `<div class="chat-empty"><div style="font-size:46px;">👋</div><b>Henüz mesaj yok</b><p class="muted">İlk mesajı siz yazın.</p></div>`;
  if(atBottom || !el.dataset.loaded){ el.scrollTop = el.scrollHeight; el.dataset.loaded = '1'; }
  el.querySelectorAll('img.chat-img').forEach(img => img.addEventListener('load', () => { if(el.dataset.stick!=='0') el.scrollTop = el.scrollHeight; }, { once:true }));
}
function toggleChatTray(kind){
  const tray = document.getElementById('chatTray'); if(!tray) return;
  if(tray.dataset.kind===kind && tray.classList.contains('open')){ tray.classList.remove('open'); tray.dataset.kind=''; return; }
  tray.dataset.kind = kind; tray.classList.add('open');
  if(kind==='attach'){
    tray.innerHTML = `<div class="chat-attach">
      <button type="button" onclick="openChatCamera()"><span style="background:#e91e63;">📷</span>Kamera</button>
      <button type="button" onclick="document.getElementById('chatFileImage').click()"><span style="background:#7c4dff;">🖼️</span>Galeri</button>
      <button type="button" onclick="document.getElementById('chatFileAny').click()"><span style="background:#3f51b5;">📄</span>Dosya</button>
      <button type="button" onclick="toggleChatTray('quick')"><span style="background:#ff9800;">⚡</span>Hazır yanıt</button>
      ${chatSpeechSupported() ? `<button type="button" onclick="toggleChatTray('attach');toggleChatDictation()"><span style="background:#009688;">🗣️</span>Sesle yaz</button>` : ''}
    </div>`;
    return;
  }
  if(kind==='quick'){
    tray.innerHTML = `<div class="chat-quick">${CHAT_QUICK.map(q => `<button type="button" onclick="sendChatQuick(${escapeAttr(JSON.stringify(q))})">${escapeHtml(q)}</button>`).join('')}</div>`;
    return;
  }
  const cat = APP.chatEmojiCat || Object.keys(CHAT_EMOJI)[0];
  tray.innerHTML = `<div class="chat-emoji-tabs">${Object.keys(CHAT_EMOJI).map(k => `<button type="button" class="${k===cat?'active':''}" onclick="APP.chatEmojiCat='${k}';document.getElementById('chatTray').dataset.kind='';toggleChatTray('emoji')">${k}</button>`).join('')}</div>
    <div class="chat-emoji-grid">${CHAT_EMOJI[cat].split(' ').map(e => `<button type="button" onclick="insertChatEmoji('${e}')">${e}</button>`).join('')}</div>`;
}
function insertChatEmoji(e){
  const t = document.getElementById('chatText'); if(!t) return;
  const s = t.selectionStart ?? t.value.length, en = t.selectionEnd ?? t.value.length;
  t.value = t.value.slice(0, s) + e + t.value.slice(en);
  t.selectionStart = t.selectionEnd = s + e.length;
  t.focus();
}
async function postChat(body, attachment, kind, name){
  const session = getSession();
  const reply = APP.chatReply;
  const { error } = await sb.rpc('send_chat_message', { p_token: session.session_token, p_conv: APP.chatConv, p_body: body || '', p_attachment: attachment || null,
    p_kind: kind || null, p_name: name || null, p_reply_to: reply ? reply.id : null });
  if(error){ alert(error.message); return false; }
  cancelChatReply();
  const el = document.getElementById('chatThread'); if(el) delete el.dataset.loaded;
  await refreshChatThread();
  refreshChatList();
  return true;
}
async function sendChatMessage(){
  const t = document.getElementById('chatText'); if(!t) return;
  const body = t.value.trim(); if(!body || !APP.chatConv) return;
  stopChatDictation();
  t.value = ''; t.style.height = 'auto'; updateChatSendBtn();
  if(!(await postChat(body))){ t.value = body; updateChatSendBtn(); }
  t.focus();
}
async function sendChatQuick(text){
  const tray = document.getElementById('chatTray'); if(tray) tray.classList.remove('open');
  await postChat(text);
}
// GIF'ler animasyonu bozulmasın diye olduğu gibi (≤1 MB) gönderilir; diğer görseller küçültülür.
async function sendChatImage(input){
  const file = input.files && input.files[0]; input.value = '';
  if(!file || !APP.chatConv) return;
  let dataUrl;
  try{
    if(file.type==='image/gif'){
      if(file.size > 1000000){ alert('GIF en fazla 1 MB olabilir.'); return; }
      dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    } else {
      dataUrl = await resizeImageToDataUrl(file, 1024);
    }
  }catch(e){ alert('Görsel okunamadı'); return; }
  const t = document.getElementById('chatText');
  const caption = t ? t.value.trim() : '';
  if(await withLoadingOverlay(postChat(caption, dataUrl, 'image')) && t){ t.value = ''; updateChatSendBtn(); }
  const tray = document.getElementById('chatTray'); if(tray) tray.classList.remove('open');
}
function openChatImage(src){
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:120;padding:16px;cursor:zoom-out;';
  ov.onclick = () => ov.remove();
  ov.innerHTML = `<img src="${src}" style="max-width:100%;max-height:100%;border-radius:12px;">`;
  document.body.appendChild(ov);
}
/* Sesle yazma: Web Speech API (Chrome/Edge/Safari). Desteklenmiyorsa buton gizlenir. */
let CHAT_REC = null;
function chatSpeechSupported(){ return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function toggleChatDictation(){
  if(CHAT_REC){ stopChatDictation(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if(!SR) return;
  const t = document.getElementById('chatText'); if(!t) return;
  const base = t.value ? t.value.replace(/\s*$/, ' ') : '';
  const rec = new SR(); rec.lang = 'tr-TR'; rec.interimResults = true; rec.continuous = true;
  rec.onresult = (e) => { let txt = ''; for(let i=0;i<e.results.length;i++) txt += e.results[i][0].transcript; t.value = base + txt; };
  rec.onerror = (e) => { if(e.error==='not-allowed') alert('Mikrofon izni verilmedi.'); stopChatDictation(); };
  rec.onend = () => stopChatDictation();
  try{ rec.start(); }catch(e){ return; }
  CHAT_REC = rec;
  const mic = document.getElementById('chatMic'); if(mic) mic.classList.add('rec');
}
function stopChatDictation(){
  if(CHAT_REC){ const r = CHAT_REC; CHAT_REC = null; try{ r.stop(); }catch(e){} }
  const mic = document.getElementById('chatMic'); if(mic) mic.classList.remove('rec');
}
/* Mesaja tepki: mesajın üstüne gelince (mobilde dokununca) çıkan 😊 ile
   kalp, beğeni vb. bırakılır; aynı tepkiye tekrar basmak geri alır. */
const CHAT_REACTIONS = ['❤️','👍','😂','😮','😢','🙏','👌','🔥'];
function openReactionBar(btn, messageId){
  document.querySelectorAll('.chat-react-bar').forEach(b => b.remove());
  const bar = document.createElement('div'); bar.className = 'chat-react-bar';
  const m = (APP.chatRows||[]).find(x => x.id===messageId) || {};
  const canDelete = m.mine && (Date.now() - new Date(m.created_at).getTime()) < 24*3600*1000;
  bar.innerHTML = `<div class="chat-react-row">${CHAT_REACTIONS.map(e => `<button type="button" onclick="event.stopPropagation();toggleChatReaction('${messageId}','${e}');document.querySelectorAll('.chat-react-bar').forEach(b=>b.remove());">${e}</button>`).join('')}</div>
    <div class="chat-menu">
      <button type="button" onclick="event.stopPropagation();startChatReply('${messageId}')">↩️ Yanıtla</button>
      ${m.body ? `<button type="button" onclick="event.stopPropagation();copyChatMessage('${messageId}')">📋 Kopyala</button>` : ''}
      ${canDelete ? `<button type="button" class="danger" onclick="event.stopPropagation();deleteChatMessage('${messageId}')">🗑️ Herkesten sil</button>` : ''}
    </div>`;
  const row = btn.closest('.chat-row'); row.appendChild(bar);
  // Üstte yer yoksa (sohbetin ilk mesajları) çubuk mesajın altında açılır.
  const thread = document.getElementById('chatThread');
  if(thread && row.getBoundingClientRect().top - thread.getBoundingClientRect().top < 52) bar.classList.add('below');
  setTimeout(() => document.addEventListener('click', function close(){ bar.remove(); document.removeEventListener('click', close); }), 0);
}
async function toggleChatReaction(messageId, emoji){
  const session = getSession();
  const { error } = await sb.rpc('toggle_chat_reaction', { p_token: session.session_token, p_message_id: messageId, p_emoji: emoji });
  if(error){ alert(error.message); return; }
  refreshChatThread();
}
/* ---- Yanıtlama (alıntı) ---- */
function startChatReply(messageId){
  document.querySelectorAll('.chat-react-bar').forEach(b => b.remove());
  const m = (APP.chatRows||[]).find(x => x.id===messageId); if(!m || m.deleted) return;
  const preview = m.body || (m.attachment_kind==='audio' ? '🎤 Sesli mesaj' : m.attachment_kind==='file' ? '📎 ' + (m.attachment_name||'Dosya') : '📷 Fotoğraf');
  APP.chatReply = { id: m.id, sender_name: m.mine ? 'Siz' : m.sender_name, preview };
  const bar = document.getElementById('chatReplyBar');
  if(bar){ bar.classList.add('open'); bar.innerHTML = `<div class="chat-quote"><b style="color:${chatColor(m.sender_name)};">↩️ ${escapeHtml(APP.chatReply.sender_name)}</b><div>${escapeHtml(preview.slice(0,140))}</div></div><button type="button" class="chat-ic" onclick="cancelChatReply()">✕</button>`; }
  const t = document.getElementById('chatText'); if(t) t.focus();
}
function cancelChatReply(){
  APP.chatReply = null;
  const bar = document.getElementById('chatReplyBar'); if(bar){ bar.classList.remove('open'); bar.innerHTML = ''; }
}
function scrollToChatMessage(id){
  const el = document.querySelector(`.chat-row[data-mid="${id}"]`); if(!el) return;
  el.scrollIntoView({ behavior:'smooth', block:'center' });
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400);
}
function copyChatMessage(id){
  document.querySelectorAll('.chat-react-bar').forEach(b => b.remove());
  const m = (APP.chatRows||[]).find(x => x.id===id); if(!m || !m.body) return;
  try{ navigator.clipboard.writeText(m.body); showToast('Kopyalandı ✓', 1500); }catch(e){}
}
async function deleteChatMessage(id){
  document.querySelectorAll('.chat-react-bar').forEach(b => b.remove());
  if(!confirm('Bu mesaj herkesten silinsin mi?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_chat_message', { p_token: session.session_token, p_message_id: id });
  if(error){ alert(error.message); return; }
  refreshChatThread(); refreshChatList();
}
/* ---- Ses ve dosya ekleri: listeyle gelmez, dokununca çekilir ---- */
const CHAT_ATT_CACHE = {};
async function fetchChatAttachment(id){
  if(CHAT_ATT_CACHE[id]) return CHAT_ATT_CACHE[id];
  const session = getSession();
  const { data, error } = await sb.rpc('get_chat_attachment', { p_token: session.session_token, p_message_id: id });
  if(error){ alert(error.message); return null; }
  CHAT_ATT_CACHE[id] = data; return data;
}
async function loadChatAudio(id, btn){
  btn.disabled = true; btn.textContent = '…';
  const att = await fetchChatAttachment(id);
  const box = btn.closest('.chat-audio'); if(!att || !box) { btn.disabled = false; btn.textContent = '▶'; return; }
  box.innerHTML = `<audio controls autoplay src="${att.data}" style="max-width:240px;height:36px;"></audio>`;
}
async function downloadChatFile(id){
  const att = await withLoadingOverlay(fetchChatAttachment(id)); if(!att) return;
  const a = document.createElement('a'); a.href = att.data; a.download = att.name || 'dosya'; document.body.appendChild(a); a.click(); a.remove();
}
function chatFileSize(n){ if(!n) return ''; return n > 1048576 ? (n/1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n/1024)) + ' KB'; }
function readFileAsDataUrl(file){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
async function sendChatFile(input){
  const file = input.files && input.files[0]; input.value = '';
  if(!file || !APP.chatConv) return;
  if(file.size > 5*1024*1024){ alert('Dosya en fazla 5 MB olabilir.'); return; }
  if(file.type.startsWith('image/') && file.type !== 'image/gif'){ const fake = { files:[file], value:'' }; return sendChatImage(fake); }
  let data; try{ data = await readFileAsDataUrl(file); }catch(e){ alert('Dosya okunamadı'); return; }
  if(!/^data:[^;,]+;base64,/.test(data)) data = data.replace(/^data:;base64,/, 'data:application/octet-stream;base64,');
  const tray = document.getElementById('chatTray'); if(tray) tray.classList.remove('open');
  await withLoadingOverlay(postChat('', data, 'file', file.name));
}
/* ---- Gönder / sesli mesaj düğmesi (WhatsApp gibi: yazı yoksa mikrofon) ---- */
function updateChatSendBtn(){
  const t = document.getElementById('chatText'), b = document.getElementById('chatSendBtn'); if(!t || !b) return;
  const hasText = t.value.trim().length > 0;
  b.textContent = hasText ? '➤' : '🎙️'; b.title = hasText ? 'Gönder' : 'Sesli mesaj kaydet';
}
function onChatSendBtn(){
  const t = document.getElementById('chatText');
  if(t && t.value.trim()) sendChatMessage(); else startChatVoice();
}
let CHAT_VOICE = null;
async function startChatVoice(){
  if(CHAT_VOICE) return;
  if(!navigator.mediaDevices || !window.MediaRecorder){ alert('Bu cihaz/tarayıcı ses kaydını desteklemiyor.'); return; }
  let stream;
  try{ stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch(e){ alert('Mikrofon izni verilmedi.'); return; }
  const type = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
  const chunks = []; rec.ondataavailable = (e) => { if(e.data && e.data.size) chunks.push(e.data); };
  CHAT_VOICE = { rec, stream, chunks, start: Date.now(), send: false, timer: null };
  rec.onstop = async () => {
    stream.getTracks().forEach(tr => tr.stop());
    const v = CHAT_VOICE; CHAT_VOICE = null; clearInterval(v.timer);
    const bar = document.getElementById('chatRecBar'); if(bar){ bar.classList.remove('open'); bar.innerHTML = ''; }
    document.getElementById('chatInputForm') && document.getElementById('chatInputForm').classList.remove('recording');
    if(!v.send || !chunks.length) return;
    const blob = new Blob(chunks, { type: (rec.mimeType || 'audio/webm').split(';')[0] });
    if(blob.size > 3*1024*1024){ alert('Sesli mesaj çok uzun (en fazla ~3 MB).'); return; }
    const data = await readFileAsDataUrl(blob);
    const secs = Math.round((Date.now() - v.start)/1000);
    await postChat('', data, 'audio', 'Sesli mesaj ' + Math.floor(secs/60) + ':' + String(secs%60).padStart(2,'0'));
  };
  rec.start();
  const bar = document.getElementById('chatRecBar');
  if(bar){
    bar.classList.add('open');
    bar.innerHTML = `<span class="chat-rec-dot"></span><span id="chatRecTime">0:00</span><span class="muted" style="flex:1;">Kaydediliyor…</span>
      <button type="button" class="chat-ic" title="İptal" onclick="stopChatVoice(false)">🗑️</button>
      <button type="button" class="chat-send" title="Gönder" onclick="stopChatVoice(true)">➤</button>`;
  }
  document.getElementById('chatInputForm') && document.getElementById('chatInputForm').classList.add('recording');
  CHAT_VOICE.timer = setInterval(() => {
    const el = document.getElementById('chatRecTime'); if(!el || !CHAT_VOICE) return;
    const s = Math.round((Date.now() - CHAT_VOICE.start)/1000);
    el.textContent = Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
    if(s >= 300) stopChatVoice(true); // en fazla 5 dk
  }, 500);
}
function stopChatVoice(send){ if(!CHAT_VOICE) return; CHAT_VOICE.send = send; try{ CHAT_VOICE.rec.stop(); }catch(e){} }
/* ---- Kamera: tarayıcıda canlı önizleme ile anlık fotoğraf; desteklenmiyorsa telefonun kamerası açılır ---- */
let CHAT_CAM = null;
async function openChatCamera(){
  const tray = document.getElementById('chatTray'); if(tray) tray.classList.remove('open');
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ chatCameraFallback(); return; }
  const ov = document.createElement('div'); ov.id = 'chatCamBg';
  ov.innerHTML = `<div class="chat-cam"><video id="chatCamVideo" autoplay playsinline muted></video>
    <div class="chat-cam-bar">
      <button type="button" class="chat-ic" style="color:#fff;" onclick="closeChatCamera()">✕</button>
      <button type="button" class="chat-cam-shot" onclick="takeChatPhoto()" title="Çek"></button>
      <button type="button" class="chat-ic" style="color:#fff;" onclick="switchChatCamera()" title="Kamerayı çevir">🔄</button>
    </div></div>`;
  document.body.appendChild(ov);
  CHAT_CAM = { facing: 'environment', stream: null };
  await startChatCameraStream();
}
async function startChatCameraStream(){
  if(!CHAT_CAM) return;
  if(CHAT_CAM.stream) CHAT_CAM.stream.getTracks().forEach(t => t.stop());
  try{
    CHAT_CAM.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: CHAT_CAM.facing, width: { ideal: 1280 } }, audio: false });
    const v = document.getElementById('chatCamVideo'); if(v) v.srcObject = CHAT_CAM.stream;
  }catch(e){ closeChatCamera(); chatCameraFallback(); }
}
function switchChatCamera(){ if(!CHAT_CAM) return; CHAT_CAM.facing = CHAT_CAM.facing==='environment' ? 'user' : 'environment'; startChatCameraStream(); }
function closeChatCamera(){
  if(CHAT_CAM && CHAT_CAM.stream) CHAT_CAM.stream.getTracks().forEach(t => t.stop());
  CHAT_CAM = null; const ov = document.getElementById('chatCamBg'); if(ov) ov.remove();
}
async function takeChatPhoto(){
  const v = document.getElementById('chatCamVideo'); if(!v || !v.videoWidth) return;
  const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth*k); c.height = Math.round(v.videoHeight*k);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', 0.8);
  closeChatCamera();
  const t = document.getElementById('chatText'); const caption = t ? t.value.trim() : '';
  if(await withLoadingOverlay(postChat(caption, data, 'image')) && t){ t.value = ''; updateChatSendBtn(); }
}
function chatCameraFallback(){
  const inp = document.getElementById('chatFileImage'); if(!inp) return;
  inp.setAttribute('capture', 'environment'); inp.click(); setTimeout(() => inp.removeAttribute('capture'), 1000);
}
/* ---- Gruplar ---- */
function openChatGroupEditor(conv){
  const c = conv ? (APP.chatItems||[]).find(x => x.conv===conv) : null;
  const people = (APP.chatItems||[]).filter(x => !x.is_all && !x.is_group);
  const memberNames = c ? String(c.roles||'').split(', ') : [];
  const ov = document.createElement('div'); ov.id = 'chatGroupBg';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:110;padding:16px;';
  ov.onclick = (e) => { if(e.target===ov) ov.remove(); };
  ov.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:18px;max-width:420px;width:100%;max-height:85vh;display:flex;flex-direction:column;">
    <h3 style="margin:0 0 10px;">${c ? 'Grubu düzenle' : '👥 Yeni grup'}</h3>
    <input id="chatGroupName" placeholder="Grup adı (örn. Mutfak Ekibi)" value="${escapeAttr(c ? c.name : '')}" style="margin:0 0 10px;">
    <div class="muted" style="font-size:12.5px;margin-bottom:6px;text-align:left;">Üyeler</div>
    <div style="overflow:auto;flex:1;border:1px solid var(--border);border-radius:12px;padding:4px 8px;">
      ${people.map(p => `<label style="display:flex;gap:10px;align-items:center;padding:7px 2px;cursor:pointer;">
        <input type="checkbox" class="chatGroupMember" value="${p.conv}" style="width:auto;margin:0;" ${memberNames.includes(p.name)?'checked':''}>
        ${chatAvatar(p, 30)}<span style="flex:1;">${escapeHtml(p.name)} <span class="muted" style="font-size:11.5px;">${escapeHtml(p.roles||'')}</span></span></label>`).join('')}
    </div>
    <div style="display:flex;gap:10px;margin-top:12px;">
      <button type="button" class="ghost-btn" style="flex:1;margin:0;" onclick="document.getElementById('chatGroupBg').remove()">Vazgeç</button>
      <button type="button" style="flex:1;margin:0;" onclick="saveChatGroup(${c ? `'${c.conv}'` : 'null'})">${c ? 'Kaydet' : 'Oluştur'}</button>
    </div></div>`;
  document.body.appendChild(ov);
}
async function saveChatGroup(conv){
  const name = (document.getElementById('chatGroupName').value || '').trim();
  const members = [...document.querySelectorAll('.chatGroupMember:checked')].map(x => x.value);
  if(!name){ alert('Grup adı girin'); return; }
  if(!members.length){ alert('En az bir üye seçin'); return; }
  const session = getSession();
  let res;
  if(conv) res = await sb.rpc('update_chat_group', { p_token: session.session_token, p_group_id: conv.slice(2), p_name: name, p_member_ids: members });
  else res = await sb.rpc('create_chat_group', { p_token: session.session_token, p_name: name, p_member_ids: members });
  if(res.error){ alert(res.error.message); return; }
  document.getElementById('chatGroupBg').remove();
  await refreshChatList();
  if(!conv && res.data) openChatConv('g:' + res.data); else if(conv){ APP.chatConv = null; openChatConv(conv); }
}
function openChatGroupMenu(conv){
  const c = (APP.chatItems||[]).find(x => x.conv===conv); if(!c) return;
  document.querySelectorAll('.chat-group-menu').forEach(x => x.remove());
  const menu = document.createElement('div'); menu.className = 'chat-menu chat-group-menu';
  menu.innerHTML = `<div class="muted" style="font-size:12px;padding:6px 10px;">${c.member_count} üye: ${escapeHtml(c.roles||'')}</div>
    ${c.can_manage ? `<button type="button" onclick="openChatGroupEditor('${conv}')">✏️ Grubu düzenle</button>` : ''}
    <button type="button" class="danger" onclick="leaveChatGroup('${conv}')">🚪 Gruptan çık</button>`;
  const head = document.querySelector('.chat-head'); if(!head) return;
  head.appendChild(menu);
  setTimeout(() => document.addEventListener('click', function close(){ menu.remove(); document.removeEventListener('click', close); }), 0);
}
async function leaveChatGroup(conv){
  if(!confirm('Bu gruptan çıkılsın mı?')) return;
  const session = getSession();
  const { error } = await sb.rpc('leave_chat_group', { p_token: session.session_token, p_group_id: conv.slice(2) });
  if(error){ alert(error.message); return; }
  closeChatConv();
}
// Değişiklik sayacı tetiklediğinde: liste ve açık sohbet yazılan metne dokunmadan tazelenir.
function refreshMessagesView(){
  refreshChatList();
  // Sesli mesaj çalarken ya da seçenek menüsü açıkken sohbet yeniden çizilmez (sonraki yenilemede güncellenir).
  const thread = document.getElementById('chatThread');
  const busy = thread && ([...thread.querySelectorAll('audio')].some(a => !a.paused) || thread.querySelector('.chat-react-bar'));
  if(APP.chatConv && !busy) refreshChatThread().then(() => refreshNavBadges());
}
