/* ---- Çok dil (tr, en, ar, ru, de) ----
   Arayüz metinleri kodda Türkçe yazılı. Bu katman ekrana çizilen metin düğümlerini ve placeholder/title/aria-label
   özniteliklerini, i18n-dict.js sözlüğündeki birebir (boşluklar kırpılmış) Türkçe karşılığa göre seçili dile çevirir.
   Yeni çeviri = sözlüğe satır eklemek; ekran kodu değişmez. Sözlükte olmayan metin Türkçe kalır.
   Dil: kullanıcının seçimi (hesapta saklanır, set_my_lang) > cihazda son seçim > tarayıcı dili > tr. Arapça sağdan sola (dir=rtl). */
const APP_LANGS = [
  { code: 'tr', label: 'Türkçe', short: 'TR' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ar', label: 'العربية', short: 'AR' },
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'de', label: 'Deutsch', short: 'DE' },
];
function detectLang(){
  try{ const s = localStorage.getItem('peyk_lang'); if(s && APP_LANGS.some(l => l.code === s)) return s; }catch(e){}
  const n = String((navigator.languages && navigator.languages[0]) || navigator.language || 'tr').slice(0, 2).toLowerCase();
  return APP_LANGS.some(l => l.code === n) ? n : 'tr';
}
let APP_LANG = detectLang();
const I18N_ATTRS = ['placeholder', 'title', 'aria-label'];
function trDict(){ return window.I18N_DICT || {}; }
// Kodda metin üretirken de kullanılabilir: t('Kaydet')
function t(s){
  if(APP_LANG === 'tr' || s == null) return s;
  const k = String(s).trim(), d = trDict();
  let e = d[k];
  if(e && e[APP_LANG]) return String(s).replace(k, e[APP_LANG]);
  // Baştaki/sondaki simge, sayı ve noktalama (örn. "🧾 Sipariş", "Kaydet (3)") ayrılıp çekirdek metin çevrilir.
  const m = k.match(/^([^\p{L}]*)(.*?)([^\p{L}]*)$/u);
  if(!m || !m[2] || m[2] === k) return s;
  e = d[m[2]];
  if(!e || !e[APP_LANG]) return s;
  return String(s).replace(k, m[1] + e[APP_LANG] + m[3]);
}
function i18nNode(n){
  if(n.nodeType === 3){
    const v = n.nodeValue; if(!v || !v.trim()) return;
    if(n.__trSrc && v === n.__trOut) return; // zaten çevrildi
    const src = v, out = t(src);
    if(out !== src){ n.__trSrc = src; n.__trOut = out; n.nodeValue = out; }
    return;
  }
  if(n.nodeType !== 1) return;
  const tag = n.tagName; if(tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || n.isContentEditable || n.hasAttribute('data-no-tr')) return;
  for(const a of I18N_ATTRS){ const v = n.getAttribute(a); if(v){ const o = t(v); if(o !== v) n.setAttribute(a, o); } }
  if(tag === 'INPUT' && (n.type === 'button' || n.type === 'submit') && n.value){ const o = t(n.value); if(o !== n.value) n.value = o; }
  for(let c = n.firstChild; c; c = c.nextSibling) i18nNode(c);
}
let I18N_OBS = null;
function i18nStart(){
  document.documentElement.lang = APP_LANG;
  document.documentElement.dir = APP_LANG === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.classList.toggle('lang-rtl', APP_LANG === 'ar');
  if(I18N_OBS){ I18N_OBS.disconnect(); I18N_OBS = null; }
  if(APP_LANG === 'tr' || !document.body) return;
  i18nNode(document.body);
  I18N_OBS = new MutationObserver(ms => {
    for(const m of ms){
      if(m.type === 'characterData') i18nNode(m.target);
      else if(m.type === 'attributes') i18nNode(m.target);
      else m.addedNodes.forEach(i18nNode);
    }
  });
  I18N_OBS.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
}
async function setAppLang(code, noSave){
  if(!APP_LANGS.some(l => l.code === code)) return;
  APP_LANG = code;
  try{ localStorage.setItem('peyk_lang', code); }catch(e){}
  if(!noSave){ try{ const s = typeof getSession === 'function' && getSession(); if(s) sb.rpc('set_my_lang', { p_token: s.session_token, p_lang: code }).then(() => {}, () => {}); }catch(e){} }
  // Türkçeye dönüşte çevrilmiş düğümleri geri almak yerine ekranı baştan çiz.
  i18nStart();
  if(typeof render === 'function') render();
}
function langPickerOpen(){
  const bg = document.createElement('div'); bg.className = 'dg-bg'; bg.style.zIndex = 3600;
  bg.innerHTML = `<div class="dg-card uc-card" style="max-width:320px;"><div class="dg-ic">🌐</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">${APP_LANGS.map(l => `<button type="button" class="pc-btn lang-opt ${l.code === APP_LANG ? 'on' : ''}" data-l="${l.code}" style="justify-content:space-between;display:flex;padding:12px 14px;font-size:15px;" data-no-tr><span>${l.label}</span><b>${l.short}</b></button>`).join('')}</div></div>`;
  bg.addEventListener('click', e => { const b = e.target.closest('.lang-opt'); if(b){ bg.remove(); setAppLang(b.dataset.l); } else if(e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
}
function langBtnHtml(cls){ const l = APP_LANGS.find(x => x.code === APP_LANG) || APP_LANGS[0]; return `<button type="button" class="${cls || 'sb-ib'}" ${act('langPickerOpen')} title="Dil / Language" data-no-tr>🌐 ${l.short}</button>`; }
document.addEventListener('DOMContentLoaded', i18nStart);
if(document.readyState !== 'loading') i18nStart();
