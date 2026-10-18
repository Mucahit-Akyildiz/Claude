/* ---- Çevrimdışı mod ----
   İnternet kesildiğinde:
   - Uygulama dosyaları service worker önbelleğinden açılır (bkz. /app/sw.js).
   - Son görülen masa/sipariş/ayar verisi cihazda saklanır, ekranlar onunla çizilir
     (OFFLINE_READS, api.js'teki sb.rpc sarmalayıcısında kullanılır).
   - Sipariş gönderimi (masa / paket / bekleme listesi) gönderilemezse cihazdaki
     kuyruğa (outbox) alınır; bağlantı gelince sırayla gönderilir. Her siparişin
     benzersiz bir kimliği vardır; sunucu (submit_offline_order) aynı siparişi iki kez
     işlemez, yani bağlantı gönderim sırasında koparsa çift sipariş oluşmaz.
   Ödeme almak, stok/ayar değişiklikleri vb. çevrimdışı yapılamaz. */
const OFFLINE_READS = new Set(['get_restaurant_config', 'get_live_orders', 'get_my_permissions', 'get_my_shift_status', 'get_nav_badges']);
const OUTBOX_KEY = 'rys_outbox';
const OFFLINE = { online: navigator.onLine, flushing: false, servedStale: false };

function isNetworkError(err){
  if(!navigator.onLine) return true;
  const m = String((err && (err.message || err)) || '');
  return /Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed|ERR_INTERNET|ERR_NETWORK/i.test(m);
}
function _offlineKey(fn){ const s = getSession(); return 'rys_off_' + (s ? s.restaurant_id || s.user_id || '' : '') + '_' + fn; }
function offlineSaveRead(fn, data){ try{ localStorage.setItem(_offlineKey(fn), JSON.stringify({ at: Date.now(), data })); }catch(e){} }
function offlineLoadRead(fn){ try{ const v = JSON.parse(localStorage.getItem(_offlineKey(fn)) || 'null'); return v ? v.data : undefined; }catch(e){ return undefined; } }

function outboxAll(){ try{ return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); }catch(e){ return []; } }
function outboxSave(list){
  try{ localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); }catch(e){}
  drawOfflineBar();
  const tm = document.getElementById('tableModalBg');
  if(tm && tm.dataset.tableId && typeof renderTableItems === 'function') renderTableItems(tm.dataset.tableId);
}
function newClientId(){ return (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2))); }
function outboxAdd(entry){ const list = outboxAll(); list.push(entry); outboxSave(list); }
// Masa kartında gösterilmek üzere: bu masa için gönderilmeyi bekleyen ürün sayısı.
function outboxCountFor(tableId){
  return outboxAll().filter(e => e.tableKey === tableId).reduce((n, e) => n + (e.args.p_items || []).reduce((a, it) => a + (Number(it.qty) || 1), 0), 0);
}

/* Çevrimdışıyken iade edilemeyen sepet stoğu: bağlantı gelince sunucuya geri eklenir. */
function queueStockReturn(productId, qty){
  if(!(qty > 0)) return;
  const p = APP.config && (APP.config.products || []).find(x => x.id === productId);
  outboxAdd({ id: newClientId(), kind: 'stock', args: { p_product_id: productId, p_delta: qty, p_items: [] }, label: 'Stok iadesi · ' + (p ? p.name : 'ürün') + ' +' + qty, at: Date.now() });
}

/* Siparişi gönderir; ağ hatasında kuyruğa alır. Dönüş: { ok, queued, error } */
async function submitOrderSafely(kind, args, tableKey, label){
  const session = getSession();
  const entry = { id: newClientId(), kind, args, tableKey, label, at: Date.now() };
  // Bu cihazın kendi gönderdiği sipariş sesli "sipariş bekliyor" diye okunmasın.
  if(typeof voiceMarkSelfOrder === 'function') voiceMarkSelfOrder(label);
  if(!navigator.onLine){ outboxAdd(entry); return { ok: true, queued: true }; }
  let res;
  try{ res = await sb.rpc('submit_offline_order', { p_token: session.session_token, p_client_id: entry.id, p_kind: kind, p_args: args }); }
  catch(e){ res = { error: e }; }
  if(res && res.error && isNetworkError(res.error)){ outboxAdd(entry); return { ok: true, queued: true }; }
  if(res && res.error) return { ok: false, error: res.error };
  return { ok: true, queued: false };
}

async function flushOutbox(){
  if(OFFLINE.flushing || !navigator.onLine) return;
  const session = getSession(); if(!session) return;
  let list = outboxAll(); if(!list.length) return;
  OFFLINE.flushing = true; drawOfflineBar();
  let sent = 0;
  try{
    for(const e of list.slice()){
      if(e.error) continue; // hatalı olanlar kullanıcı 'Tekrar dene' deyince gönderilir
      let res;
      try{ res = await sb.rpc('submit_offline_order', { p_token: session.session_token, p_client_id: e.id, p_kind: e.kind, p_args: e.args }); }
      catch(err){ res = { error: err }; }
      if(res && res.error && isNetworkError(res.error)) break; // bağlantı yine gitti; sonra tekrar denenir
      list = outboxAll();
      const i = list.findIndex(x => x.id === e.id);
      if(i < 0) continue;
      if(res && res.error){ list[i].error = res.error.message || String(res.error); }
      else { list.splice(i, 1); sent++; }
      outboxSave(list);
    }
  } finally { OFFLINE.flushing = false; drawOfflineBar(); }
  if(sent){
    showToast('📶 ' + sent + ' bekleyen sipariş gönderildi');
    if(typeof clearRpcCache === 'function') clearRpcCache();
    if(typeof render === 'function' && APP.view && ['tables','packages','kitchen','home'].includes(APP.view)) render();
  }
}

function drawOfflineBar(){
  let bar = document.getElementById('offlineBar');
  const list = outboxAll();
  const failed = list.filter(e => e.error).length;
  const orders = list.filter(e => e.kind !== 'stock').length;
  const show = !OFFLINE.online || list.length > 0;
  if(!show){ if(bar) bar.remove(); return; }
  if(!bar){
    bar = document.createElement('div'); bar.id = 'offlineBar';
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:8px;z-index:96;padding:7px 12px;border-radius:999px;font-size:12.5px;font-weight:700;display:flex;gap:10px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:calc(100vw - 24px);';
    document.body.appendChild(bar);
  }
  bar.style.background = !OFFLINE.online ? '#b45309' : failed ? 'var(--red)' : 'var(--accent)';
  bar.style.color = '#fff';
  const txt = !OFFLINE.online
    ? '📴 Çevrimdışı — siparişler cihazda bekletiliyor' + (orders ? ' · ' + orders + ' bekleyen sipariş' : '')
    : OFFLINE.flushing ? '📶 Bekleyen siparişler gönderiliyor…'
    : failed ? '⚠️ ' + failed + ' sipariş gönderilemedi'
    : orders ? '⏳ ' + orders + ' sipariş gönderilmeyi bekliyor' : '⏳ Stok iadeleri gönderilmeyi bekliyor';
  bar.innerHTML = `<span>${escapeHtml(txt)}</span>${list.length ? `<button type="button" style="margin:0;width:auto;padding:3px 10px;font-size:12px;background:rgba(255,255,255,.2);border:0;color:#fff;box-shadow:none;" ${act('openOutboxModal')}>Ayrıntı</button>` : ''}`;
}

function openOutboxModal(){
  removeEl('outboxBg');
  const list = outboxAll();
  const ov = document.createElement('div'); ov.id = 'outboxBg';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.innerHTML = `<div class="box" style="max-width:480px;width:100%;margin:0;max-height:85vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;">⏳ Bekleyen Siparişler</h2><span style="cursor:pointer;color:var(--muted);font-size:20px;" ${act('removeEl','outboxBg')}>✕</span></div>
    <p class="muted" style="text-align:left;font-size:12.5px;">Bu siparişler bu cihazda bekliyor; bağlantı gelince otomatik gönderilir. Mutfak ekranları siparişi ancak gönderildikten sonra görür.</p>
    ${list.length ? list.map(e => `<div style="border:1px solid var(--border);border-radius:10px;padding:8px 10px;margin-bottom:8px;text-align:left;">
      <div style="display:flex;justify-content:space-between;gap:8px;"><b>${escapeHtml(e.label || 'Sipariş')}</b><span class="muted" style="font-size:12px;">${new Date(e.at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span></div>
      <div style="font-size:12.5px;">${(e.args.p_items || []).map(it => escapeHtml((it.qty || 1) + '× ' + it.name)).join(', ')}</div>
      ${e.error ? `<div style="color:var(--red);font-size:12.5px;margin-top:4px;">Gönderilemedi: ${escapeHtml(e.error)}</div>
        <div style="display:flex;gap:8px;margin-top:6px;"><button type="button" class="sbtn" style="margin:0;width:auto;" ${act('retryOutboxEntry', e.id)}>Tekrar dene</button><button type="button" class="ghost-btn" style="margin:0;width:auto;color:var(--red);border-color:var(--red);" ${act('discardOutboxEntry', e.id)}>Sil</button></div>` : ''}
    </div>`).join('') : '<p class="muted">Bekleyen sipariş yok.</p>'}
    ${list.length && navigator.onLine ? `<button type="button" style="margin-top:6px;" ${act('flushOutboxNow')}>📶 Şimdi gönder</button>` : ''}
  </div>`;
  ov.onclick = (ev) => { if(ev.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
async function flushOutboxNow(){ await flushOutbox(); if(document.getElementById('outboxBg')) openOutboxModal(); }
async function retryOutboxEntry(id){ const list = outboxAll(); const e = list.find(x => x.id === id); if(e){ delete e.error; outboxSave(list); } await flushOutboxNow(); }
async function discardOutboxEntry(id){
  if(!await uiConfirm('Bu sipariş gönderilmeden silinsin mi?')) return;
  outboxSave(outboxAll().filter(x => x.id !== id)); openOutboxModal();
}

window.addEventListener('online', () => { OFFLINE.online = true; drawOfflineBar(); flushOutbox(); });
window.addEventListener('offline', () => { OFFLINE.online = false; drawOfflineBar(); });
setInterval(() => { if(outboxAll().some(e => !e.error)) flushOutbox(); }, 20000);
document.addEventListener('DOMContentLoaded', () => { drawOfflineBar(); setTimeout(flushOutbox, 3000); });
