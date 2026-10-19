const SUPABASE_URL = 'https://dveybagnrgofxkqangvo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TOKEN = new URLSearchParams(window.location.search).get('t');
const STATE = { info: null, rating: 0 };
/* Müşteri değerlendirmesi: ödeme sonrası verilen linkle 1-5 yıldız ve yorum.
   4-5 yıldız verenlere işletmenin Google yorum linki önerilir. */
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
      <p class="err" id="rvErr"></p>
      <button type="button" class="btn" id="rvSend" ${STATE.rating ? '' : 'disabled'} ${act('sendReview')}>Gönder</button>
    </div>`);
}
function pickStar(n){
  const c = document.getElementById('rvComment'), keep = c ? c.value : '';
  STATE.rating = n; render();
  const c2 = document.getElementById('rvComment'); if(c2) c2.value = keep;
}
async function sendReview(){
  const btn = document.getElementById('rvSend'), err = document.getElementById('rvErr');
  if(!STATE.rating) return;
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  const { data, error } = await sb.rpc('submit_public_review', { p_review_token: TOKEN, p_rating: STATE.rating, p_comment: document.getElementById('rvComment').value });
  if(error){ err.textContent = error.message; btn.disabled = false; btn.textContent = 'Gönder'; return; }
  setApp(STATE.rating >= 4 ? stateHtml('🤩', 'Çok teşekkürler!', 'Bizi tercih ettiğiniz için mutluyuz. Deneyiminizi Google\'da da paylaşırsanız çok seviniriz.', googleBtn(data && data.google_url))
    : stateHtml('🙏', 'Teşekkürler', 'Geri bildiriminiz işletme yönetimine iletildi. Bir dahaki ziyaretinizde daha iyisini yapacağız.'));
}
init();
