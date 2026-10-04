/* ================= MESAJLAR (uygulama içi mesajlaşma) =================
   İşletmedeki personel arasında birebir mesajlar ve herkesin gördüğü
   "Genel" kanal. Yeni mesajlar değişiklik sayacı (bkz. checkDataVersion)
   ile birkaç saniye içinde gelir; yazılan mesaj kutusu yenilemede silinmez.
   Okunmamış sayısı menüdeki "Mesajlar" rozetinde görünür. */
async function renderMessagesView(main, session){
  main.innerHTML = `<h1>💬 Mesajlar</h1>
    <div class="chat-shell ${APP.chatConv ? 'has-conv' : ''}">
      <div class="chat-list" id="chatList"><p class="muted">Yükleniyor…</p></div>
      <div class="chat-pane" id="chatPane">${APP.chatConv ? '' : '<div class="chat-empty muted">Soldan bir kişi ya da Genel kanalı seçin.</div>'}</div>
    </div>`;
  await refreshChatList();
  if(APP.chatConv) openChatConv(APP.chatConv, true);
}
async function refreshChatList(){
  const session = getSession(); const el = document.getElementById('chatList'); if(!session || !el) return;
  const { data, error } = await sb.rpc('list_chat_conversations', { p_token: session.session_token });
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  APP.chatItems = data.items || [];
  el.innerHTML = APP.chatItems.map(c => `
    <div class="chat-item ${APP.chatConv===c.conv?'active':''}" onclick="openChatConv('${c.conv}')">
      <div class="chat-avatar">${c.is_all ? '📢' : escapeHtml((c.name||'?').slice(0,1).toLocaleUpperCase('tr'))}${!c.is_all && c.online ? '<span class="chat-online"></span>' : ''}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;gap:6px;"><b class="chat-name">${escapeHtml(c.name)}</b>${c.last_at ? `<span class="muted" style="font-size:11px;white-space:nowrap;">${chatTime(c.last_at)}</span>` : ''}</div>
        <div class="muted chat-last">${c.last_body ? escapeHtml(c.last_body) : (c.roles ? escapeHtml(c.roles) : '')}</div>
      </div>
      ${c.unread > 0 ? `<span class="nav-badge" style="position:static;">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
    </div>`).join('');
}
function chatTime(iso){
  const d = new Date(iso), now = new Date();
  return d.toDateString()===now.toDateString() ? d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'});
}
async function openChatConv(conv, keepDraft){
  const pane = document.getElementById('chatPane'); if(!pane) return;
  const changed = APP.chatConv !== conv;
  APP.chatConv = conv;
  document.querySelector('.chat-shell') && document.querySelector('.chat-shell').classList.add('has-conv');
  const c = (APP.chatItems||[]).find(x => x.conv===conv) || { name: 'Sohbet' };
  if(changed || !document.getElementById('chatThread')){
    pane.innerHTML = `<div class="chat-head">
        <button type="button" class="chat-back" onclick="closeChatConv()">←</button>
        <b>${escapeHtml(c.name)}</b>${c.roles ? ` <span class="muted" style="font-size:12px;">${escapeHtml(c.roles)}</span>` : ''}
      </div>
      <div class="chat-thread" id="chatThread"><p class="muted">Yükleniyor…</p></div>
      <form class="chat-input" onsubmit="sendChatMessage();return false;">
        <textarea id="chatText" rows="1" placeholder="Mesaj yazın…" maxlength="2000" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMessage();}"></textarea>
        <button type="submit" style="width:auto;margin:0;">Gönder</button>
      </form>`;
  }
  document.querySelectorAll('.chat-item').forEach(el => el.classList.toggle('active', el.getAttribute('onclick')===`openChatConv('${conv}')`));
  await refreshChatThread();
  refreshChatList(); refreshNavBadges();
  if(!keepDraft){ const t = document.getElementById('chatText'); if(t && window.innerWidth > 760) t.focus(); }
}
function closeChatConv(){
  APP.chatConv = null;
  const shell = document.querySelector('.chat-shell'); if(shell) shell.classList.remove('has-conv');
  const pane = document.getElementById('chatPane'); if(pane) pane.innerHTML = '<div class="chat-empty muted">Soldan bir kişi ya da Genel kanalı seçin.</div>';
  refreshChatList();
}
async function refreshChatThread(){
  const session = getSession(); const el = document.getElementById('chatThread');
  if(!session || !el || !APP.chatConv) return;
  const { data, error } = await sb.rpc('get_chat_messages', { p_token: session.session_token, p_conv: APP.chatConv });
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  const isAll = APP.chatConv==='all';
  let lastDay = '';
  el.innerHTML = (data||[]).length ? data.map(m => {
    const day = new Date(m.created_at).toLocaleDateString('tr-TR', { day:'numeric', month:'long' });
    const sep = day!==lastDay ? `<div class="chat-day">${day}</div>` : ''; lastDay = day;
    return sep + `<div class="chat-msg ${m.mine?'mine':''}">
      ${isAll && !m.mine ? `<div class="chat-sender">${escapeHtml(m.sender_name)}</div>` : ''}
      <div class="chat-body">${escapeHtml(m.body)}</div>
      <div class="chat-time">${new Date(m.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</div>
    </div>`;
  }).join('') : '<div class="chat-empty muted">Henüz mesaj yok. İlk mesajı siz yazın.</div>';
  if(atBottom || !el.dataset.loaded){ el.scrollTop = el.scrollHeight; el.dataset.loaded = '1'; }
}
async function sendChatMessage(){
  const t = document.getElementById('chatText'); if(!t) return;
  const body = t.value.trim(); if(!body || !APP.chatConv) return;
  const session = getSession();
  t.value = '';
  const { error } = await sb.rpc('send_chat_message', { p_token: session.session_token, p_conv: APP.chatConv, p_body: body });
  if(error){ t.value = body; alert(error.message); return; }
  const el = document.getElementById('chatThread'); if(el) delete el.dataset.loaded;
  await refreshChatThread();
  refreshChatList();
  t.focus();
}
// Değişiklik sayacı tetiklediğinde: liste ve açık sohbet yazılan metne dokunmadan tazelenir.
function refreshMessagesView(){
  refreshChatList();
  if(APP.chatConv) refreshChatThread().then(() => refreshNavBadges());
}
