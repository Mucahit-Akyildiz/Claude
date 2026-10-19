const SUPABASE_URL = 'https://dveybagnrgofxkqangvo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const RESTAURANT_CODE = new URLSearchParams(window.location.search).get('r');
const STATE = { info: null, day: null, time: '', party: 2 };

/* Online rezervasyon sayfası: müşteri gün, saat ve kişi sayısını seçip isteğini gönderir;
   istek işletmenin Rezervasyonlar ekranına "onay bekliyor" olarak düşer. */
const LANGS = [{ code:'tr', label:'TR' }, { code:'en', label:'EN' }];
const I18N = {
  tr: { title:'Online Rezervasyon', invalidTitle:'Geçersiz Bağlantı', invalidMsg:'Bu sayfaya işletmenin paylaştığı rezervasyon linkiyle ulaşmalısınız.', closedTitle:'Online rezervasyon kapalı', closedMsg:'Bu işletme şu anda online rezervasyon almıyor. Lütfen telefonla iletişime geçin.', errorTitle:'Sayfa yüklenemedi', errorMsg:'Bir hata oluştu, lütfen daha sonra tekrar deneyin.',
    day:'📅 Gün', time:'🕐 Saat', party:'👥 Kişi sayısı', you:'👤 Bilgileriniz', name:'Adınız Soyadınız', phone:'Telefon Numaranız', email:'E-posta (opsiyonel)', notes:'Not (opsiyonel) — örn. doğum günü, bebek sandalyesi', today:'Bugün', tomorrow:'Yarın', send:'📅 Rezervasyon İsteği Gönder', sending:'Gönderiliyor...',
    pick:'Gün ve saat seçin', people:'kişi', successTitle:'İsteğiniz alındı', successMsg:'Rezervasyon isteğiniz işletmeye iletildi. Onaylandığında sizinle iletişime geçilecek.', errName:'Adınızı girin', errPhone:'Telefon numaranızı girin', errTime:'Gün ve saat seçin', noTimes:'Bu gün için uygun saat kalmadı', other:'Diğer saat' },
  en: { title:'Online Reservation', invalidTitle:'Invalid Link', invalidMsg:'Please use the reservation link shared by the business.', closedTitle:'Online reservations closed', closedMsg:'This business is not accepting online reservations right now. Please call them.', errorTitle:'Page could not load', errorMsg:'Something went wrong, please try again later.',
    day:'📅 Day', time:'🕐 Time', party:'👥 Party size', you:'👤 Your details', name:'Full name', phone:'Phone number', email:'Email (optional)', notes:'Note (optional) — e.g. birthday, high chair', today:'Today', tomorrow:'Tomorrow', send:'📅 Send Reservation Request', sending:'Sending...',
    pick:'Choose a day and time', people:'people', successTitle:'Request received', successMsg:'Your reservation request was sent to the business. They will contact you once it is confirmed.', errName:'Please enter your name', errPhone:'Please enter your phone number', errTime:'Choose a day and time', noTimes:'No times left for this day', other:'Other time' },
};
function getLang(){ try{ const s = localStorage.getItem('rys_rez_lang'); if(s && I18N[s]) return s; }catch(e){} return (navigator.language||'tr').startsWith('tr') ? 'tr' : 'en'; }
STATE.lang = getLang();
function t(k){ return (I18N[STATE.lang] && I18N[STATE.lang][k]) || I18N.tr[k] || k; }
function setLang(code){ if(!I18N[code]) return; try{ localStorage.setItem('rys_rez_lang', code); }catch(e){} STATE.lang = code; document.documentElement.lang = code; render(); }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function iso(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
const TIMES = []; for(let h = 11; h <= 23; h++){ TIMES.push(String(h).padStart(2,'0') + ':00'); if(h < 23) TIMES.push(String(h).padStart(2,'0') + ':30'); }

function shell(inner){
  return `<header><span class="ic">📅</span><div class="titles"><h1>${escapeHtml(STATE.info ? STATE.info.name : t('title'))}</h1><p>${t('title')}</p></div>
    <div class="lang-picker">${LANGS.map(l => `<button type="button" class="lang-btn ${STATE.lang===l.code?'active':''}" ${act('setLang', l.code)}>${l.label}</button>`).join('')}</div></header>${inner}`;
}
function stateHtml(ic, title, msg){ return shell(`<div class="state"><div class="big">${ic}</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(msg)}</p></div>`); }
function setApp(html){ document.getElementById('app').innerHTML = html; }

async function init(){
  if(!RESTAURANT_CODE){ setApp(stateHtml('⚠️', t('invalidTitle'), t('invalidMsg'))); return; }
  const { data, error } = await sb.rpc('get_public_reservation_info', { p_restaurant_code: RESTAURANT_CODE });
  if(error){ setApp(stateHtml('⚠️', t('errorTitle'), t('errorMsg'))); return; }
  if(!data){ setApp(stateHtml('⚠️', t('invalidTitle'), t('invalidMsg'))); return; }
  STATE.info = data;
  document.title = data.name + ' · ' + t('title');
  STATE.day = iso(new Date());
  render();
}
function timesFor(day){
  // Bugün için en az 30 dakika sonrası seçilebilir (sunucu da kontrol eder).
  if(day !== iso(new Date())) return TIMES;
  const lim = new Date(Date.now() + 30*60000);
  return TIMES.filter(tm => { const [h, m] = tm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d >= lim; });
}
function render(){
  if(!STATE.info) return init();
  if(!STATE.info.enabled){ setApp(stateHtml('🔒', t('closedTitle'), t('closedMsg'))); return; }
  const d0 = new Date(); d0.setHours(0,0,0,0);
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(d0); d.setDate(d.getDate() + i); return d; });
  const loc = STATE.lang === 'tr' ? 'tr-TR' : 'en-GB';
  const times = timesFor(STATE.day);
  if(STATE.time && !times.includes(STATE.time)) STATE.time = '';
  const keep = (id) => { const el = document.getElementById(id); return el ? escapeHtml(el.value) : ''; };
  const vals = { name: keep('rzName'), phone: keep('rzPhone'), email: keep('rzEmail'), notes: document.getElementById('rzNotes') ? escapeHtml(document.getElementById('rzNotes').value) : '' };
  setApp(shell(`<main>
    <div class="card"><h2>${t('day')}</h2><div class="chips scroll">${days.map((d, i) => `<button type="button" class="chip ${STATE.day===iso(d)?'on':''}" ${act('pickDay', iso(d))}>${i===0 ? t('today') : i===1 ? t('tomorrow') : d.toLocaleDateString(loc, { weekday:'short' })}<small>${d.toLocaleDateString(loc, { day:'numeric', month:'short' })}</small></button>`).join('')}</div></div>
    <div class="card"><h2>${t('time')}</h2>${times.length ? `<div class="chips">${times.map(tm => `<button type="button" class="chip ${STATE.time===tm?'on':''}" ${act('pickTime', tm)}>${tm}</button>`).join('')}</div>` : `<p class="hint">${t('noTimes')}</p>`}</div>
    <div class="card"><h2>${t('party')}</h2><div class="chips">${[1,2,3,4,5,6,8,10].map(n => `<button type="button" class="chip ${STATE.party===n?'on':''}" ${act('pickParty', n)}>${n}</button>`).join('')}<input id="rzParty" class="party-in" type="number" min="1" max="30" value="${STATE.party}" ${actOn('input','typeParty',['$value'])}></div></div>
    <div class="card"><h2>${t('you')}</h2>
      <input id="rzName" placeholder="${t('name')}" autocomplete="name" value="${vals.name}">
      <div class="two"><input id="rzPhone" placeholder="${t('phone')}" inputmode="tel" autocomplete="tel" value="${vals.phone}"><input id="rzEmail" type="email" placeholder="${t('email')}" autocomplete="email" autocapitalize="none" value="${vals.email}"></div>
      <textarea id="rzNotes" placeholder="${t('notes')}">${vals.notes}</textarea>
    </div>
    <div class="summary" id="rzSummary"></div>
    <p class="err" id="rzErr"></p>
    <button type="button" class="btn" id="rzSend" ${act('sendReservation')}>${t('send')}</button>
  </main>`));
  updateSummary();
  // Giriş animasyonu yalnızca ilk açılışta; seçim yaptıkça kartlar yeniden soluklaşmasın.
  setTimeout(() => document.body.classList.add('ready'), 400);
}
function updateSummary(){
  const el = document.getElementById('rzSummary'); if(!el) return;
  if(!STATE.day || !STATE.time){ el.innerHTML = `<span>🗓️</span>${t('pick')}`; return; }
  const d = new Date(STATE.day + 'T' + STATE.time);
  el.innerHTML = `<span>✨</span>${d.toLocaleDateString(STATE.lang==='tr'?'tr-TR':'en-GB', { weekday:'long', day:'numeric', month:'long' })} · ${STATE.time} · ${STATE.party} ${t('people')}`;
}
function pickDay(d){ STATE.day = d; render(); }
function pickTime(tm){ STATE.time = tm; document.querySelectorAll('.chip').forEach(c => { if(/^\d\d:\d\d$/.test(c.textContent)) c.classList.toggle('on', c.textContent === tm); }); updateSummary(); }
function pickParty(n){ STATE.party = n; const i = document.getElementById('rzParty'); if(i) i.value = n; render(); }
function typeParty(v){ const n = parseInt(v); if(n >= 1 && n <= 30){ STATE.party = n; updateSummary(); } }
async function sendReservation(){
  const err = document.getElementById('rzErr'), btn = document.getElementById('rzSend');
  const name = document.getElementById('rzName').value.trim(), phone = document.getElementById('rzPhone').value.trim();
  const email = document.getElementById('rzEmail').value.trim(), notes = document.getElementById('rzNotes').value.trim();
  err.textContent = '';
  if(!STATE.time){ err.textContent = t('errTime'); return; }
  if(!name){ err.textContent = t('errName'); return; }
  if(!phone){ err.textContent = t('errPhone'); return; }
  btn.disabled = true; btn.textContent = t('sending');
  const { error } = await sb.rpc('submit_public_reservation', { p_restaurant_code: RESTAURANT_CODE, p_name: name, p_phone: phone, p_email: email || null,
    p_party: STATE.party, p_time: new Date(STATE.day + 'T' + STATE.time).toISOString(), p_notes: notes || null });
  btn.disabled = false; btn.textContent = t('send');
  if(error){ err.textContent = error.message; return; }
  setApp(stateHtml('✅', t('successTitle'), t('successMsg')));
}
document.documentElement.lang = STATE.lang;
init();
