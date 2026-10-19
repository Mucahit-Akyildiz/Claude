const SUPABASE_URL = 'https://dveybagnrgofxkqangvo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TOKEN = new URLSearchParams(window.location.search).get('t');
/* Sipariş takibi: kurye siparişi yola çıkardığında müşteriye SMS ile gelen link.
   Durum 20 saniyede bir yenilenir; teslim edilince yenileme durur. */
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
const hm = (t) => t ? new Date(t).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : '';
let TIMER = null;
function setApp(h){ document.getElementById('app').innerHTML = `<main>${h}</main>`; }
async function load(){
  if(!TOKEN || !/^[0-9a-f-]{36}$/i.test(TOKEN)){ setApp(`<div class="big">⚠️</div><div class="center"><h1>Geçersiz bağlantı</h1><p>Bu sayfaya işletmenin gönderdiği takip linkiyle ulaşmalısınız.</p></div>`); return; }
  const { data, error } = await sb.rpc('get_public_tracking', { p_tracking: TOKEN });
  if(error){ if(!TIMER) setApp(`<div class="big">⚠️</div><div class="center"><h1>Yüklenemedi</h1><p>Lütfen biraz sonra tekrar deneyin.</p></div>`); return; }
  if(!data){ setApp(`<div class="big">🔍</div><div class="center"><h1>Sipariş bulunamadı</h1><p>Takip linkinin süresi dolmuş olabilir.</p></div>`); clearInterval(TIMER); return; }
  document.title = data.restaurant + ' · Sipariş Takibi';
  const order = ['preparing', 'ready', 'on_the_way', 'delivered'], cur = order.indexOf(data.status);
  const steps = [
    ['🧾', 'Sipariş alındı', hm(data.created_at)],
    ['👨‍🍳', 'Hazırlanıyor', cur === 0 ? 'Mutfakta hazırlanıyor' : ''],
    ['🛵', 'Yolda', data.dispatched_at ? hm(data.dispatched_at) + (data.courier ? ' · Kuryeniz ' + data.courier : '') : ''],
    ['✅', 'Teslim edildi', hm(data.delivered_at)],
  ];
  // Adım durumları: 0 = sipariş alındı her zaman tamam; hazırlanıyor, yolda, teslim mevcut duruma göre.
  const state = (i) => i === 0 ? 'done' : (i === 1 ? (cur >= 1 ? 'done' : 'now') : i === 2 ? (cur >= 3 ? 'done' : cur === 2 ? 'now' : 'todo') : (cur >= 3 ? 'done' : 'todo'));
  const head = { preparing: ['👨‍🍳', 'Siparişiniz hazırlanıyor', ''], ready: ['📦', 'Siparişiniz hazır', 'Kuryeye verilmek üzere'], on_the_way: ['🛵', 'Siparişiniz yolda!', data.courier ? 'Kuryeniz ' + data.courier + ' size doğru geliyor' : 'Size doğru geliyor'], delivered: ['🎉', 'Teslim edildi', 'Afiyet olsun!'] }[data.status];
  setApp(`<div class="hero"><div class="ic ${data.status==='on_the_way'?'moving':''}">${head[0]}</div><h1>${escapeHtml(head[1])}</h1><p>${escapeHtml(head[2])}</p></div>
    <div class="card"><ul class="steps">${steps.map((s, i) => `<li class="step ${state(i)}"><span class="dot">${state(i)==='done' ? '✓' : s[0]}</span><div><b>${s[1]}</b><small>${escapeHtml(s[2])}</small></div></li>`).join('')}</ul>
      <div class="meta"><span>${escapeHtml(data.restaurant)}${data.no ? ' · #' + data.no : ''}</span><span>${data.items} ürün</span></div></div>`);
  if(data.status === 'delivered'){ clearInterval(TIMER); TIMER = 1; }
}
load().then(() => { if(TIMER !== 1) TIMER = setInterval(load, 20000); });
