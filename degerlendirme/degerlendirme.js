const SUPABASE_URL = 'https://dveybagnrgofxkqangvo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TOKEN = new URLSearchParams(window.location.search).get('t');
const STATE = { info: null, rating: 0, photos: [] };  // photos: [{ blob, url }] (en fazla 3, gönderimde sıkıştırılmış JPEG)
/* Müşteri değerlendirmesi: ödeme sonrası verilen linkle 1-5 yıldız ve yorum.
   Puan ne olursa olsun müşteriye işletmenin Google yorum linki önerilir (Google, yalnızca memnunlara yorum istemeyi yasaklar). */
const LABELS = ['', 'Çok kötü 😞', 'Kötü 😕', 'Fena değil 😐', 'İyi 🙂', 'Mükemmel 🤩'];
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function setApp(h){ document.getElementById('app').innerHTML = `<main>${h}</main>`; }
function stateHtml(ic, title, msg, extra){ return `<div class="big">${ic}</div><h1>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(msg)}</p>${extra||''}`; }
function googleBtn(url){ return url && /^https:\/\//.test(url) ? `<a class="btn google" href="${escapeHtml(url)}" target="_blank" rel="noopener">⭐ Google'da da paylaşır mısınız?</a>` : ''; }
async function init(){
  if(!TOKEN || !/^[0-9a-f-]{36}$/i.test(TOKEN)){ setApp(stateHtml('⚠️', 'Geçersiz bağlantı', 'Bu sayfaya işletmenin gönderdiği değerlendirme linkiyle ulaşmalısınız.')); return; }
  const { data, error } = await sb.rpc('get_public_review', { p_review_token: TOKEN });
  if(error){ setApp(stateHtml('⚠️', 'Sayfa yüklenemedi', 'Lütfen daha sonra tekrar deneyin.')); return; }
  if(!data){ setApp(stateHtml('⚠️', 'Geçersiz bağlantı', 'Bu değerlendirme linki bulunamadı.')); return; }
  STATE.info = data; document.title = data.name + ' · Değerlendirme';
  if(data.rated){ setApp(stateHtml('💛', 'Teşekkürler!', 'Bu hesap için değerlendirmeniz alındı.', googleBtn(data.google_url))); return; }
  render();
}
function render(){
  setApp(`<div class="logo">🍽️</div><h1>${escapeHtml(STATE.info.name)}</h1><p class="sub">Deneyiminizi nasıl buldunuz? Görüşünüz bizim için çok değerli.</p>
    <div class="card">
      <div class="stars">${[1,2,3,4,5].map(n => `<button type="button" class="star ${n <= STATE.rating ? 'on' : ''}" aria-label="${n} yıldız" ${act('pickStar', n)}>★</button>`).join('')}</div>
      <p class="label" id="rvLabel">${LABELS[STATE.rating] || 'Yıldızlara dokunun'}</p>
      <textarea id="rvComment" placeholder="${STATE.rating && STATE.rating <= 3 ? 'Neyi daha iyi yapabilirdik? (opsiyonel)' : 'Yorumunuz (opsiyonel)'}" maxlength="1000"></textarea>
      <div class="ct-box ${STATE.rating && STATE.rating <= 3 ? 'ct-low' : ''}">
        <p class="ct-h">${STATE.rating && STATE.rating <= 3 ? '📞 Üzgünüz! Size dönüş yapalım mı?' : '📞 İletişim (isteğe bağlı)'}</p>
        ${STATE.rating && STATE.rating <= 3 ? '<p class="ct-sub">Numaranızı bırakırsanız işletme yetkilisi sizi arayıp yaşadığınız sorunu dinlemek ister.</p>' : ''}
        <input id="rvName" maxlength="80" placeholder="Adınız" autocomplete="name">
        <input id="rvPhone" type="tel" inputmode="tel" maxlength="16" placeholder="Telefon (05xx xxx xx xx)" autocomplete="tel">
        <label class="ct-ok"><input type="checkbox" id="rvConsent"> <span>Kampanya ve fırsatlardan SMS ile haberdar olmak istiyorum.</span></label>
        <small>Numaranız görüşünüzle ilgili size dönüş yapmak için kullanılır; kampanya mesajı yalnızca yukarıdaki kutuyu işaretlerseniz gönderilir.</small>
      </div>
      <div class="ph-row" id="rvPhotos">${photosHtml()}</div>
      <p class="err" id="rvErr"></p>
      <button type="button" class="btn" id="rvSend" ${STATE.rating ? '' : 'disabled'} ${act('sendReview')}>Gönder</button>
    </div>`);
}
function photosHtml(){
  return STATE.photos.map((p, i) => `<div class="ph"><img src="${p.url}" alt=""><button type="button" class="ph-x" aria-label="Kaldır" ${act('removePhoto', i)}>✕</button></div>`).join('')
    + (STATE.photos.length < 3 ? `<label class="ph ph-add" for="rvFile">📷<small>Fotoğraf ekle</small></label><input type="file" id="rvFile" accept="image/*" multiple hidden ${actOn('change', 'addPhotos', ['$event'])}>` : '');
}
function drawPhotos(){ const el = document.getElementById('rvPhotos'); if(el) el.innerHTML = photosHtml(); }
// Fotoğraf telefonda büyük olabilir: en uzun kenar 1600 px, JPEG %82 (yükleme sınırı 1,5 MB).
function shrink(file){
  return new Promise((resolve) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); c.toBlob(b => resolve(b), 'image/jpeg', 0.82); };
    img.onerror = () => { URL.revokeObjectURL(u); resolve(null); };
    img.src = u;
  });
}
async function addPhotos(ev){
  const files = [...((ev && ev.target && ev.target.files) || [])].filter(f => /^image\//.test(f.type)).slice(0, 3 - STATE.photos.length);
  for(const f of files){ const b = await shrink(f); if(b && b.size <= 1.5 * 1024 * 1024) STATE.photos.push({ blob: b, url: URL.createObjectURL(b) }); }
  drawPhotos();
}
function removePhoto(i){ const p = STATE.photos.splice(i, 1)[0]; if(p) URL.revokeObjectURL(p.url); drawPhotos(); }
async function uploadPhotos(){
  let failed = 0;
  for(const p of STATE.photos){
    try{ const r = await fetch('/api/review-photo', { method:'POST', headers:{ 'x-review-token': TOKEN, 'x-mime': 'image/jpeg' }, body: p.blob }); if(!r.ok) failed++; }catch(e){ failed++; }
  }
  return failed;
}
function pickStar(n){
  const keep = {}; ['rvComment','rvName','rvPhone'].forEach(id => { const e = document.getElementById(id); if(e) keep[id] = e.value; });
  const ok = (document.getElementById('rvConsent') || {}).checked;
  STATE.rating = n; render();
  Object.keys(keep).forEach(id => { const e = document.getElementById(id); if(e) e.value = keep[id]; });
  if(ok) document.getElementById('rvConsent').checked = true;
  if(n <= 3){ const b = document.querySelector('.ct-box'); if(b) b.scrollIntoView({ behavior:'smooth', block:'center' }); }
}
async function sendReview(){
  const btn = document.getElementById('rvSend'), err = document.getElementById('rvErr');
  if(!STATE.rating) return;
  const phv = ((document.getElementById('rvPhone') || {}).value || '').replace(/\D/g, '').slice(-10);
  if(phv && !/^5\d{9}$/.test(phv)){ err.textContent = 'Telefon numarasını 05xx xxx xx xx biçiminde girin.'; return; }
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  const { data, error } = await sb.rpc('submit_public_review', { p_review_token: TOKEN, p_rating: STATE.rating, p_comment: document.getElementById('rvComment').value });
  if(error){ err.textContent = error.message; btn.disabled = false; btn.textContent = 'Gönder'; return; }
  const nm = (document.getElementById('rvName') || {}).value || '', ph = (document.getElementById('rvPhone') || {}).value || '';
  if(nm.trim() || ph.trim()){
    const { error: cErr } = await sb.rpc('save_review_contact', { p_review_token: TOKEN, p_name: nm, p_phone: ph, p_consent: !!(document.getElementById('rvConsent') || {}).checked });
    if(cErr) alert(cErr.message + ' — değerlendirmeniz alındı, iletişim bilgisi kaydedilemedi.');
  }
  if(STATE.photos.length){ btn.textContent = 'Fotoğraflar yükleniyor...'; const f = await uploadPhotos(); if(f) alert(f + ' fotoğraf yüklenemedi; değerlendirmeniz yine de alındı.'); }
  setApp(STATE.rating >= 4 ? stateHtml('🤩', 'Çok teşekkürler!', 'Bizi tercih ettiğiniz için mutluyuz. Deneyiminizi Google\'da da paylaşırsanız çok seviniriz.', googleBtn(data && data.google_url))
    : stateHtml('🙏', 'Teşekkürler', 'Geri bildiriminiz işletme yönetimine iletildi. Bir dahaki ziyaretinizde daha iyisini yapacağız. Dilerseniz görüşünüzü Google\'da da paylaşabilirsiniz.', googleBtn(data && data.google_url).replace('⭐ Google\'da da paylaşır mısınız?', 'Google\'da değerlendir')));
}
init();
