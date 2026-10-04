/* ================= MESAJLAR (uygulama içi mesajlaşma) =================
   İşletmedeki personel arasında birebir mesajlar ve herkesin gördüğü
   "Genel" kanal. Yeni mesajlar değişiklik sayacı (bkz. checkDataVersion)
   ile birkaç saniye içinde gelir; yazılan mesaj kutusu yenilemede silinmez.
   Emoji, hazır yanıtlar, cihazdan fotoğraf/GIF ve sesle yazma (tarayıcı
   destekliyorsa) vardır. Okunmamış sayısı menüdeki rozette görünür. */
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
  return `<div class="chat-avatar" style="width:${s}px;height:${s}px;background:${chatColor(c.name)};color:#fff;">${escapeHtml((c.name||'?').slice(0,1).toLocaleUpperCase('tr'))}${c.online ? '<span class="chat-online"></span>' : ''}</div>`;
}
async function renderMessagesView(main, session){
  main.innerHTML = `<div class="chat-shell ${APP.chatConv ? 'has-conv' : ''}">
      <div class="chat-list-wrap">
        <div class="chat-list-head"><h1 style="margin:0;">💬 Mesajlar</h1>
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
        <div style="min-width:0;"><div class="chat-name">${escapeHtml(c.name)}</div>
          <div class="chat-sub">${c.is_all ? 'Tüm ekip bu kanalı görür' : (c.online ? '<span style="color:var(--green);">● Çevrimiçi</span>' : 'Çevrimdışı') + (c.roles ? ' · ' + escapeHtml(c.roles) : '')}</div></div>
      </div>
      <div class="chat-thread" id="chatThread"><p class="muted">Yükleniyor…</p></div>
      <div class="chat-tray" id="chatTray"></div>
      <form class="chat-input" onsubmit="sendChatMessage();return false;">
        <button type="button" class="chat-ic" title="Emoji" onclick="toggleChatTray('emoji')">😊</button>
        <button type="button" class="chat-ic" title="Hazır yanıtlar" onclick="toggleChatTray('quick')">⚡</button>
        <label class="chat-ic" title="Fotoğraf / GIF gönder">🖼️<input type="file" accept="image/*" style="display:none;" onchange="sendChatImage(this)"></label>
        <textarea id="chatText" rows="1" placeholder="Mesaj yazın…" maxlength="2000"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMessage();}"></textarea>
        ${chatSpeechSupported() ? `<button type="button" class="chat-ic" id="chatMic" title="Sesle yaz" onclick="toggleChatDictation()">🎤</button>` : ''}
        <button type="submit" class="chat-send" title="Gönder">➤</button>
      </form>`;
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
  const rows = data || [];
  let lastDay = '';
  el.innerHTML = rows.length ? rows.map((m, i) => {
    const day = new Date(m.created_at).toLocaleDateString('tr-TR', { day:'numeric', month:'long', weekday:'long' });
    const sep = day!==lastDay ? `<div class="chat-day"><span>${day}</span></div>` : ''; lastDay = day;
    const prev = rows[i-1], next = rows[i+1];
    const first = !prev || prev.sender_id!==m.sender_id || sep;
    const last = !next || next.sender_id!==m.sender_id;
    const jumbo = !m.attachment && m.body && m.body.length <= 12 && CHAT_ONLY_EMOJI.test(m.body);
    return sep + `<div class="chat-row ${m.mine?'mine':''} ${last?'last':''}">
      ${!m.mine && isAll ? (last ? chatAvatar({ name: m.sender_name }, 28) : '<div style="width:28px;flex-shrink:0;"></div>') : ''}
      <div class="chat-msg ${jumbo?'jumbo':''} ${m.attachment && !m.body ? 'media' : ''}">
        ${isAll && !m.mine && first ? `<div class="chat-sender" style="color:${chatColor(m.sender_name)};">${escapeHtml(m.sender_name)}</div>` : ''}
        ${m.attachment ? `<img class="chat-img" src="${m.attachment}" alt="" loading="lazy" onclick="openChatImage(this.src)">` : ''}
        ${m.body ? `<div class="chat-body">${escapeHtml(m.body)}</div>` : ''}
        <div class="chat-time">${new Date(m.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</div>
        ${(m.reactions||[]).length ? `<div class="chat-reacts">${m.reactions.map(r => `<button type="button" class="chat-react ${r.mine?'mine':''}" title="${escapeAttr(r.names||'')}" onclick="event.stopPropagation();toggleChatReaction('${m.id}','${r.emoji}')">${r.emoji}${r.count>1?` <b>${r.count}</b>`:''}</button>`).join('')}</div>` : ''}
      </div>
      <button type="button" class="chat-react-open" title="Tepki ver" onclick="event.stopPropagation();openReactionBar(this,'${m.id}')">😊</button>
    </div>`;
  }).join('') : `<div class="chat-empty"><div style="font-size:46px;">👋</div><b>Henüz mesaj yok</b><p class="muted">İlk mesajı siz yazın.</p></div>`;
  if(atBottom || !el.dataset.loaded){ el.scrollTop = el.scrollHeight; el.dataset.loaded = '1'; }
  el.querySelectorAll('img.chat-img').forEach(img => img.addEventListener('load', () => { if(el.dataset.stick!=='0') el.scrollTop = el.scrollHeight; }, { once:true }));
}
function toggleChatTray(kind){
  const tray = document.getElementById('chatTray'); if(!tray) return;
  if(tray.dataset.kind===kind && tray.classList.contains('open')){ tray.classList.remove('open'); tray.dataset.kind=''; return; }
  tray.dataset.kind = kind; tray.classList.add('open');
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
async function postChat(body, attachment){
  const session = getSession();
  const { error } = await sb.rpc('send_chat_message', { p_token: session.session_token, p_conv: APP.chatConv, p_body: body || '', p_attachment: attachment || null });
  if(error){ alert(error.message); return false; }
  const el = document.getElementById('chatThread'); if(el) delete el.dataset.loaded;
  await refreshChatThread();
  refreshChatList();
  return true;
}
async function sendChatMessage(){
  const t = document.getElementById('chatText'); if(!t) return;
  const body = t.value.trim(); if(!body || !APP.chatConv) return;
  stopChatDictation();
  t.value = ''; t.style.height = 'auto';
  if(!(await postChat(body))) t.value = body;
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
  if(await withLoadingOverlay(postChat(caption, dataUrl)) && t){ t.value = ''; }
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
  bar.innerHTML = CHAT_REACTIONS.map(e => `<button type="button" onclick="event.stopPropagation();toggleChatReaction('${messageId}','${e}');this.parentNode.remove();">${e}</button>`).join('');
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
// Değişiklik sayacı tetiklediğinde: liste ve açık sohbet yazılan metne dokunmadan tazelenir.
function refreshMessagesView(){
  refreshChatList();
  if(APP.chatConv) refreshChatThread().then(() => refreshNavBadges());
}
