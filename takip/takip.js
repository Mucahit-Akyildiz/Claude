const SUPABASE_URL = 'https://dveybagnrgofxkqangvo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TOKEN = new URLSearchParams(window.location.search).get('t');
/* Sipariş takibi: kurye siparişi yola çıkardığında müşteriye SMS ile gelen link.
   Durum 15 saniyede bir yenilenir; yoldayken kalan süre ve kuryenin konumu haritada gösterilir; teslim edilince yenileme durur. */
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
const hm = (t) => t ? new Date(t).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : '';
let TIMER = null;
let MAP = null;
function setApp(h, mapPoints){
  const app = document.getElementById('app');
  if(!app.querySelector('main')) app.innerHTML = '<main><div id="info"></div><div id="tkMapWrap" class="tk-map" hidden><div id="tkMap"></div></div><div id="info2"></div></main>';
  const parts = String(h).split('<!--MAP-->');
  document.getElementById('info').innerHTML = parts[0]; document.getElementById('info2').innerHTML = parts[1] || '';
  const wrap = document.getElementById('tkMapWrap');
  if(mapPoints && mapPoints.length && window.LiveMap){
    wrap.hidden = false;
    if(!MAP) MAP = LiveMap.create(document.getElementById('tkMap'), { noWheel: true });
    if(MAP) MAP.set(mapPoints);
  } else { wrap.hidden = true; if(MAP){ MAP.destroy(); MAP = null; } }
}
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
  // Yoldayken: kuryenin anlık konumundan haritadan hesaplanan kalan süre ve harita.
  const onWay = data.status === 'on_the_way';
  let eta = '';
  if(onWay && data.eta_min != null){
    const arr = new Date(new Date(data.eta_at).getTime() + data.eta_min * 60000);
    const left = Math.max(1, Math.round((arr - Date.now()) / 60000));
    eta = `<div class="tk-eta"><span>🕒</span><div><b>Yaklaşık ${left} dk</b><small>Tahmini varış ${hm(arr)} · trafik dahil</small></div></div>`;
  } else if(onWay && data.live) eta = `<div class="tk-eta"><span>🛵</span><div><b>Kuryeniz yolda</b><small>Varış süresi hesaplanıyor…</small></div></div>`;
  const pts = onWay && data.live ? [
    { kind: 'courier', id: 'c', lat: data.courier_lat, lng: data.courier_lng, label: data.courier || 'Kurye' },
    { kind: 'dest', id: 'd', lat: data.dest_lat, lng: data.dest_lng },
  ] : null;
  setApp(`<div class="hero"><div class="ic ${data.status==='on_the_way'?'moving':''}">${head[0]}</div><h1>${escapeHtml(head[1])}</h1><p>${escapeHtml(head[2])}</p></div>${eta}<!--MAP-->
    <div class="card"><ul class="steps">${steps.map((s, i) => `<li class="step ${state(i)}"><span class="dot">${state(i)==='done' ? '✓' : s[0]}</span><div><b>${s[1]}</b><small>${escapeHtml(s[2])}</small></div></li>`).join('')}</ul>
      <div class="meta"><span>${escapeHtml(data.restaurant)}${data.no ? ' · #' + data.no : ''}</span><span>${data.items} ürün</span></div></div>`, pts);
  if(data.status === 'delivered'){ clearInterval(TIMER); TIMER = 1; }
}
load().then(() => { if(TIMER !== 1) TIMER = setInterval(load, 15000); });
