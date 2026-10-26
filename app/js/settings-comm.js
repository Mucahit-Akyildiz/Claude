/* İletişim ayarları: SMS ve e-posta şablonları, gönderim geçmişleri ve işletmenin kendi
   SMS / e-posta / online ödeme hesapları (Ayarlar › Entegrasyonlar) - settings.js'ten ayrıldı.
   Klasik <script src>; settings.js'ten SONRA yüklenir. */
async function sendTestSms(){
  const ph = (document.getElementById('ti_sms_testphone') || {}).value || '', res = document.getElementById('ti_sms_testres');
  const { data, error } = await sb.rpc('send_test_sms', { p_token: getSession().session_token, p_phone: ph });
  if(error){ if(res) res.textContent = '⚠️ ' + error.message; return; }
  const st = { dispatched: '✅ SMS firmasına iletildi — telefonunuza birkaç saniye içinde gelmeli. Gelmezse firmanın panelindeki Raporlar\'a bakın (başlık onayı / bakiye).', no_provider: '⚠️ SMS firması bilgileri eksik (anahtar/şifre). Kaydet\'e basıp tekrar deneyin.', skipped: '⚠️ Gönderim sınırına takıldı (aynı numaraya saatte en fazla 10 SMS).' };
  if(res) res.textContent = st[data && data.status] || ('Durum: ' + (data && data.status || '?'));
}
/* SMS şablonları: her mesaj türü açılıp kapatılır ve metni düzenlenir; sunucu gönderirken bu metni kullanır. */
const SMS_TPL = [
  { k:'reservation_confirm', ic:'📅', t:'Rezervasyon onayı', w:'Rezervasyon onaylanınca', v:['isletme','ad','tarih','saat','kisi'], d:'{isletme}: {tarih} {saat} tarihli {kisi} kisilik rezervasyonunuz onaylandi.' },
  { k:'reservation_created', ic:'📝', t:'Rezervasyon alındı', w:'Rezervasyon oluşturulunca', v:['isletme','ad','tarih','saat','kisi','telefon'], d:'{isletme}: {tarih} {saat} icin {kisi} kisilik rezervasyonunuz alindi. Tel: {telefon}' },
  { k:'reservation_pending', ic:'⏳', t:'Rezervasyon onay bekliyor', w:'Online rezervasyon gelince', v:['isletme','ad','tarih','saat','kisi','telefon'], d:'{isletme}: {tarih} {saat} rezervasyonunuz onay bekliyor, onaylaninca bilgi verecegiz.' },
  { k:'reservation_updated', ic:'✏️', t:'Rezervasyon güncellendi', w:'Saat / kişi değişince', v:['isletme','ad','tarih','saat','kisi','telefon'], d:'{isletme}: Rezervasyonunuz guncellendi: {tarih} {saat}, {kisi} kisi.' },
  { k:'reservation_cancelled', ic:'❌', t:'Rezervasyon iptal', w:'Rezervasyon iptal edilince', v:['isletme','ad','tarih','saat','kisi','telefon'], d:'{isletme}: {tarih} {saat} rezervasyonunuz iptal edildi. Tel: {telefon}' },
  { k:'reservation_no_show', ic:'🚫', t:'Rezervasyona gelinmedi', w:'Gelmedi işaretlenince', v:['isletme','ad','tarih','saat','kisi','telefon'], d:'{isletme}: {tarih} {saat} rezervasyonunuza gelmediginiz kaydedildi.' },
  { k:'waitlist_joined', ic:'🧾', t:'Bekleme listesine alındı', w:'Bekleme listesine eklenince', v:['isletme','ad','kisi','dakika','saat'], d:'{isletme}: {kisi} kisi olarak bekleme listesine alindiniz. Tahmini: {dakika} dk ({saat}).' },
  { k:'waitlist_updated', ic:'🔄', t:'Bekleme süresi güncellendi', w:'Tahmini süre değişince', v:['isletme','ad','dakika','saat'], d:'{isletme}: Yeni tahmini bekleme sureniz {dakika} dk ({saat}).' },
  { k:'waitlist_soon', ic:'🔔', t:'Sıranız yaklaşıyor', w:'Masaya az kalınca', v:['isletme','ad','dakika','saat'], d:'{isletme}: Masaniza yaklasik {dakika} dk kaldi ({saat}). Lutfen yakin olun.' },
  { k:'reservation_reminder', ic:'⏰', t:'Rezervasyon hatırlatma', w:'Rezervasyona 2–4 saat kala', v:['isletme','ad','saat','kisi'], d:'{isletme}: Hatirlatma - bugun saat {saat} icin rezervasyonunuz var. Sizi bekliyoruz!' },
  { k:'waitlist_ready', ic:'⏳', t:'Masanız hazır', w:'Bekleme listesinde “Masa Hazır” basılınca', v:['isletme','ad','kisi'], d:'{isletme}: Masaniz hazir! Lutfen girise gelin.' },
  { k:'takeaway_ready', ic:'📦', t:'Siparişiniz hazır', w:'Paket / gel-al siparişi hazır olunca', v:['isletme','ad','no'], d:'{isletme}: Siparisiniz hazir (No: {no}). Afiyet olsun!' },
  { k:'delivery_dispatched', ic:'🛵', t:'Sipariş yola çıktı', w:'Sipariş kuryeye verilince', v:['isletme','ad','kurye','kurye_tel','takip'], d:'{isletme}: Siparisiniz yola cikti! Kurye: {kurye} Tel: {kurye_tel} Takip: {takip}' },
  { k:'payment', ic:'💳', t:'Ödeme alındı', w:'Hesaba müşteri girildiyse ödeme alınınca', v:['isletme','ad','tutar','link'], d:'{isletme}: {ad}, odemeniz alindi. Tutar: {tutar} TL. Tesekkur ederiz! Bizi degerlendirin: {link}' },
  { k:'review_request', ic:'⭐', t:'Değerlendirme isteği', w:'Hesaptan değerlendirme linki gönderilince', v:['isletme','link'], d:'{isletme}: Bizi degerlendirir misiniz? {link}' },
  { k:'staff_login', ic:'👤', t:'Personel giriş bilgileri', w:'Kullanıcılar › SMS Gönder ile', v:['isletme','kod','kullanici','sifre','android','web'], d:'{isletme} - Peyktan giris bilgileriniz: Isletme kodu: {kod} Kullanici: {kullanici} Sifre: {sifre} Android: {android} iPhone/Web: {web}' },
];
const SMS_VAR_LBL = { kod:'İşletme kodu', kullanici:'Kullanıcı adı', sifre:'Geçici şifre', android:'Android linki', web:'iPhone/Web linki', kurye:'Kurye adı', kurye_tel:'Kurye telefonu', isletme:'İşletme adı', ad:'Müşteri adı', telefon:'İşletme telefonu', dakika:'Kalan dakika', tarih:'Tarih', saat:'Saat', kisi:'Kişi sayısı', no:'Sipariş no', tutar:'Tutar', takip:'Takip linki', link:'Değerlendirme linki' };
/* İletişim kutularında (SMS / E-posta) üst sekmeler: Bağlantı · Mesajlar · Gönderilenler. */
function ctTabsHtml(grp, tabs){
  const cur = (APP.ctTab || {})[grp] || 'conn';
  return `<div class="ct-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-ct="${k}" class="${cur===k?'on':''}" ${act('setCtTab', grp, k)}>${l}</button>`).join('')}</div>`;
}
function setCtTab(grp, k){
  APP.ctTab = Object.assign({}, APP.ctTab, { [grp]: k });
  const box = document.querySelector('[data-ctgrp="' + grp + '"]'); if(!box) return;
  box.dataset.ct = k; box.querySelectorAll('.ct-tabs [data-ct]').forEach(b => b.classList.toggle('on', b.dataset.ct === k));
}
const TPL_CATS = [['', 'Tümü'], ['resv', '📅 Rezervasyon'], ['wl', '⏳ Bekleme listesi'], ['order', '📦 Sipariş'], ['pay', '💳 Ödeme & yorum'], ['staff', '👤 Personel']];
const TPL_ORD = ['resv','wl','order','pay','staff'];
function tplSort(list){ return list.slice().sort((a, b) => TPL_ORD.indexOf(tplCat(a.k)) - TPL_ORD.indexOf(tplCat(b.k))); }
function tplCat(k){ return /^(reservation|resv)/.test(k) ? 'resv' : /^(waitlist|wl)/.test(k) ? 'wl' : /^(takeaway|delivery)/.test(k) ? 'order' : /^(payment|review)/.test(k) ? 'pay' : 'staff'; }
function tplCatChips(grp, list, isOn){
  const cur = (APP.tplCat || {})[grp] || '';
  return `<div class="ct-cats">${TPL_CATS.filter(([c]) => !c || list.some(t => tplCat(t.k) === c)).map(([c, l]) => { const items = list.filter(t => !c || tplCat(t.k) === c), on = items.filter(isOn).length;
    return `<button type="button" class="${cur===c?'on':''}" ${act('setTplCat', grp, c)}>${l} <small>${on}/${items.length}</small></button>`; }).join('')}</div>`;
}
function setTplCat(grp, c){ APP.tplCat = Object.assign({}, APP.tplCat, { [grp]: c }); grp === 'sms' ? drawSmsTemplates() : drawMailTemplates(); }
/* --- Gönderilen SMS'ler: işletmenin kendi gönderim geçmişi (get_sms_log) --- */
const SMS_ST = { dispatched:['Gönderildi','ok'], no_provider:['Sağlayıcı bağlı değil','warn'], failed:['Hata','bad'], error:['Hata','bad'], pending:['Bekliyor','wait'], disabled:['Kapalı','warn'] };
const SMS_EXTRA_LBL = { test:'Test mesajı', otp:'Doğrulama kodu', reservation_confirm:'Rezervasyon onayı' };
function smsPhone(p){ const d = String(p || '').replace(/\D/g, ''), m = d.match(/^90(\d{3})(\d{3})(\d{2})(\d{2})$/); return m ? '0' + m[1] + ' ' + m[2] + ' ' + m[3] + ' ' + m[4] : (p || '—'); }
function smsPurposeLbl(k){ const t = SMS_TPL.find(x => x.k === k); return t ? t.ic + ' ' + t.t : (SMS_EXTRA_LBL[k] || k || '—'); }
async function loadSmsLog(more){
  const box = document.getElementById('smsLogBox'); if(!box) return;
  const L = APP.smsLog, from = L.day || new Date(Date.now() - (L.days - 1) * 864e5).toLocaleDateString('sv-SE');
  const { data, error } = await sb.rpc('get_sms_log', { p_token: getSession().session_token, p_from: from, p_to: L.day || null,
    p_purpose: L.purpose || null, p_status: L.status || null, p_q: L.q || null, p_limit: 50, p_offset: more ? L.rows.length : 0 });
  if(error){ box.innerHTML = `<p class="muted">SMS geçmişi yüklenemedi: ${escapeHtml(error.message)}</p>`; return; }
  L.data = data; L.rows = more ? L.rows.concat(data.rows || []) : (data.rows || []);
  drawSmsLog();
}
function drawSmsLog(){
  const box = document.getElementById('smsLogBox'); if(!box) return;
  const L = APP.smsLog, d = L.data || {}, st = d.stats || {}, bp = d.by_purpose || {};
  const opt = (v, cur, l) => `<option value="${v}" ${cur===v?'selected':''}>${escapeHtml(l)}</option>`;
  // Seçili dönemin her günü (boş günler 0), gönderilen/gönderilemeyen yığılmış çubuk
  const byD = {}; (d.by_day || []).forEach(x => { byD[x.d] = x; });
  const days = L.day ? [] : Array.from({ length: L.days }, (_, i) => { const k = new Date(Date.now() - (L.days - 1 - i) * 864e5).toLocaleDateString('sv-SE'), x = byD[k] || {}; return { d: k, n: x.n || 0, s: x.s || 0, f: x.f || 0 }; });
  const max = Math.max(1, ...days.map(x => x.n)), every = L.days <= 7 ? 1 : L.days <= 30 ? 5 : 15;
  const purp = Object.entries(bp).sort((a, b) => b[1] - a[1]), pmax = Math.max(1, ...purp.map(x => x[1]));
  const card = (k, cls, label, val, extra) => `<button type="button" class="sl-stat ${cls} ${L.status===k?'on':''}" ${act('setSmsLog','status',k)}><small>${label}</small><b>${val}</b>${extra||''}</button>`;
  const pct = st.all ? Math.round((st.sent || 0) / st.all * 100) : 0;
  box.innerHTML = `<div class="sl-wrap">
    <div class="sl-head"><h3>Gönderilen SMS'ler${L.day ? ` <span class="sl-chip">${new Date(L.day).toLocaleDateString('tr-TR')} <button type="button" ${act('setSmsLog','day','')}>✕</button></span>` : ''}</h3>
      <div class="seg sl-seg">${[7,30,90].map(n => `<button type="button" class="${L.days===n&&!L.day?'on':''}" ${act('setSmsLog','days',n)}>Son ${n} gün</button>`).join('')}</div></div>
    <div class="sl-stats">
      ${card('', '', 'Toplam', st.all||0)}
      ${card('dispatched', 'ok', 'Gönderildi', st.sent||0, `<i class="sl-bar"><span style="width:${pct}%"></span></i><em>%${pct} başarı</em>`)}
      ${card('__failed', 'bad', 'Gönderilemedi', st.failed||0, st.failed ? '<em>Nedenini görmek için tıklayın</em>' : '')}
      <div class="sl-stat"><small>Harcanan SMS kredisi</small><b>${st.segments||0}</b><em>uzun mesajlar birden fazla kredi sayılır</em></div>
    </div>
    <div class="sl-viz">
      ${days.length ? `<div class="sl-panel"><div class="sl-pt">Günlük gönderim <span><i class="dot ok"></i>Gönderildi <i class="dot bad"></i>Gönderilemedi</span></div>
        <div class="sl-chart"><span class="sl-ymax">${max}</span>${days.map((x, i) => `<button type="button" class="sl-col" title="${new Date(x.d).toLocaleDateString('tr-TR')}: ${x.s} gönderildi${x.f ? ', ' + x.f + ' gönderilemedi' : ''}" ${x.n ? act('setSmsLog','day',x.d) : 'disabled'}>
          <span class="sl-stack" style="height:${x.n / max * 100}%">${x.f ? `<i class="bad" style="flex:${x.f}"></i>` : ''}${x.s ? `<i class="ok" style="flex:${x.s}"></i>` : ''}</span>
          <small>${(i % every === 0 || i === days.length - 1) ? new Date(x.d).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit' }) : ''}</small></button>`).join('')}</div></div>` : ''}
      ${purp.length ? `<div class="sl-panel"><div class="sl-pt">Türlere göre</div><div class="sl-hbars">${purp.map(([k, n]) => `<button type="button" class="sl-hbar ${L.purpose===k?'on':''}" ${act('setSmsLog','purpose',L.purpose===k?'':k)}>
          <span class="sl-hl">${escapeHtml(smsPurposeLbl(k))}</span><span class="sl-ht"><i style="width:${n / pmax * 100}%"></i></span><b>${n}</b></button>`).join('')}</div></div>` : ''}
    </div>
    <div class="sl-filters">
      <select ${actOn('change','setSmsLog',['purpose','$value'])}>${opt('', L.purpose, 'Tüm türler')}${Object.keys(bp).map(k => opt(k, L.purpose, smsPurposeLbl(k).replace(/^\S+ /, '') + ' (' + bp[k] + ')')).join('')}</select>
      <select ${actOn('change','setSmsLog',['status','$value'])}>${opt('', L.status, 'Tüm durumlar')}${opt('__failed', L.status, 'Gönderilemeyenler (tümü)')}${Object.keys(SMS_ST).filter(k => k !== 'error').map(k => opt(k, L.status, SMS_ST[k][0])).join('')}</select>
      <input type="search" placeholder="🔍 Telefon veya mesajda ara" value="${escapeAttr(L.q)}" ${actOn('change','setSmsLog',['q','$value'])}>
    </div>
    ${!L.rows.length ? '<p class="muted sl-empty">Bu filtrelerle gönderilmiş SMS yok.</p>' : `<div class="sl-list">${L.rows.map(r => { const sx = SMS_ST[r.status] || [r.status || '—', 'wait'], open = L.open === r.id, len = smsLen(r.message || '');
      return `<div class="sl-row ${open?'open':''}" ${act('toggleSmsLogRow', r.id)}>
        <div class="sl-when">${new Date(r.created_at).toLocaleDateString('tr-TR')}<small>${new Date(r.created_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}</small></div>
        <div class="sl-main"><div class="sl-top"><b>${escapeHtml(smsPhone(r.phone))}</b><span class="sl-type">${escapeHtml(smsPurposeLbl(r.purpose))}</span></div>
          <div class="sl-msg">${escapeHtml(r.message || '')}</div>
          ${open ? `<div class="sl-meta">${len.n} karakter · ${len.sms} SMS kredisi${len.uni ? ' · Türkçe karakter içeriyor' : ''}${r.provider ? ' · Sağlayıcı: ' + escapeHtml(r.provider) : ''}${r.dispatched_at ? ' · Gönderim: ' + new Date(r.dispatched_at).toLocaleString('tr-TR') : ''}${r.status === 'no_provider' ? '<br>⚠️ Bu SMS gönderilmedi çünkü o sırada SMS firması bağlı değildi. Bağlantı sekmesinden firmanızı seçip kaydedin.' : ''}</div>` : ''}</div>
        <span class="sl-st ${sx[1]}">${sx[0]}</span></div>`; }).join('')}</div>
      ${L.rows.length < (d.total || 0) ? `<button type="button" class="ghost-btn sl-more" ${act('loadSmsLog', true)}>Daha fazla göster (${L.rows.length} / ${d.total})</button>` : `<p class="muted sl-count">${d.total || 0} SMS gösteriliyor</p>`}`}
  </div>`;
}
function setSmsLog(k, v){ const L = APP.smsLog; if(k === 'status' && L.status === v) v = ''; L[k] = k === 'days' ? Number(v) : v; if(k === 'days') L.day = ''; L.open = null; loadSmsLog(); }
function toggleSmsLogRow(id){ APP.smsLog.open = APP.smsLog.open === id ? null : id; drawSmsLog(); }
/* --- Gönderilen e-postalar (get_mail_log) — SMS geçmişiyle aynı düzen --- */
const MAIL_ST = { sent:['Gönderildi','ok'], queued:['Gönderiliyor','wait'], failed:['Hata','bad'], no_provider:['Servis bağlı değil','warn'] };
const MAIL_EXTRA_LBL = { receipt:'🧾 Fiş', invoice:'📄 Fatura', other:'✉️ Diğer' };
function mailPurposeLbl(k){ const t = MAIL_TPL.find(x => x.k === k); return t ? t.ic + ' ' + t.t : (MAIL_EXTRA_LBL[k] || k || '—'); }
async function loadMailLog(more){
  const box = document.getElementById('mailLogBox'); if(!box) return;
  const L = APP.mailLog, from = L.day || new Date(Date.now() - (L.days - 1) * 864e5).toLocaleDateString('sv-SE');
  const { data, error } = await sb.rpc('get_mail_log', { p_token: getSession().session_token, p_from: from, p_to: L.day || null,
    p_purpose: L.purpose || null, p_status: L.status || null, p_q: L.q || null, p_limit: 50, p_offset: more ? L.rows.length : 0 });
  if(error){ box.innerHTML = `<p class="muted">E-posta geçmişi yüklenemedi: ${escapeHtml(error.message)}</p>`; return; }
  L.data = data; L.rows = more ? L.rows.concat(data.rows || []) : (data.rows || []);
  drawMailLog();
}
function drawMailLog(){
  const box = document.getElementById('mailLogBox'); if(!box) return;
  const L = APP.mailLog, d = L.data || {}, st = d.stats || {}, bp = d.by_purpose || {};
  const opt = (v, cur, l) => `<option value="${v}" ${cur===v?'selected':''}>${escapeHtml(l)}</option>`;
  const byD = {}; (d.by_day || []).forEach(x => { byD[x.d] = x; });
  const days = L.day ? [] : Array.from({ length: L.days }, (_, i) => { const k = new Date(Date.now() - (L.days - 1 - i) * 864e5).toLocaleDateString('sv-SE'), x = byD[k] || {}; return { d: k, n: x.n || 0, s: x.s || 0, f: x.f || 0 }; });
  const max = Math.max(1, ...days.map(x => x.n)), every = L.days <= 7 ? 1 : L.days <= 30 ? 5 : 15;
  const purp = Object.entries(bp).sort((a, b) => b[1] - a[1]), pmax = Math.max(1, ...purp.map(x => x[1]));
  const card = (k, cls, label, val, extra) => `<button type="button" class="sl-stat ${cls} ${L.status===k?'on':''}" ${act('setMailLog','status',k)}><small>${label}</small><b>${val}</b>${extra||''}</button>`;
  const pct = st.all ? Math.round((st.sent || 0) / st.all * 100) : 0;
  box.innerHTML = `<div class="sl-wrap">
    <div class="sl-head"><h3>Gönderilen e-postalar${L.day ? ` <span class="sl-chip">${new Date(L.day).toLocaleDateString('tr-TR')} <button type="button" ${act('setMailLog','day','')}>✕</button></span>` : ''}</h3>
      <div class="seg sl-seg">${[7,30,90].map(n => `<button type="button" class="${L.days===n&&!L.day?'on':''}" ${act('setMailLog','days',n)}>Son ${n} gün</button>`).join('')}</div></div>
    <div class="sl-stats">
      ${card('', '', 'Toplam', st.all||0)}
      ${card('sent', 'ok', 'Gönderildi', st.sent||0, `<i class="sl-bar"><span style="width:${pct}%"></span></i><em>%${pct} başarı</em>`)}
      ${card('__failed', 'bad', 'Gönderilemedi', st.failed||0, st.failed ? '<em>Nedenini görmek için tıklayın</em>' : '')}
      ${card('queued', '', 'Yolda', st.queued||0, '<em>Servis yanıtı bekleniyor</em>')}
    </div>
    <div class="sl-viz">
      ${days.length ? `<div class="sl-panel"><div class="sl-pt">Günlük gönderim <span><i class="dot ok"></i>Gönderildi <i class="dot bad"></i>Gönderilemedi</span></div>
        <div class="sl-chart"><span class="sl-ymax">${max}</span>${days.map((x, i) => `<button type="button" class="sl-col" title="${new Date(x.d).toLocaleDateString('tr-TR')}: ${x.s} gönderildi${x.f ? ', ' + x.f + ' gönderilemedi' : ''}" ${x.n ? act('setMailLog','day',x.d) : 'disabled'}>
          <span class="sl-stack" style="height:${x.n / max * 100}%">${x.f ? `<i class="bad" style="flex:${x.f}"></i>` : ''}${x.s ? `<i class="ok" style="flex:${x.s}"></i>` : ''}</span>
          <small>${(i % every === 0 || i === days.length - 1) ? new Date(x.d).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit' }) : ''}</small></button>`).join('')}</div></div>` : ''}
      ${purp.length ? `<div class="sl-panel"><div class="sl-pt">Türlere göre</div><div class="sl-hbars">${purp.map(([k, n]) => `<button type="button" class="sl-hbar ${L.purpose===k?'on':''}" ${act('setMailLog','purpose',L.purpose===k?'':k)}>
          <span class="sl-hl">${escapeHtml(mailPurposeLbl(k))}</span><span class="sl-ht"><i style="width:${n / pmax * 100}%"></i></span><b>${n}</b></button>`).join('')}</div></div>` : ''}
    </div>
    <div class="sl-filters">
      <select ${actOn('change','setMailLog',['purpose','$value'])}>${opt('', L.purpose, 'Tüm türler')}${Object.keys(bp).map(k => opt(k, L.purpose, mailPurposeLbl(k).replace(/^\S+ /, '') + ' (' + bp[k] + ')')).join('')}</select>
      <select ${actOn('change','setMailLog',['status','$value'])}>${opt('', L.status, 'Tüm durumlar')}${opt('__failed', L.status, 'Gönderilemeyenler (tümü)')}${Object.keys(MAIL_ST).map(k => opt(k, L.status, MAIL_ST[k][0])).join('')}</select>
      <input type="search" placeholder="🔍 E-posta adresi veya konuda ara" value="${escapeAttr(L.q)}" ${actOn('change','setMailLog',['q','$value'])}>
    </div>
    ${!L.rows.length ? '<p class="muted sl-empty">Bu filtrelerle gönderilmiş e-posta yok. (Kayıt bu güncellemeden itibaren tutuluyor.)</p>' : `<div class="sl-list">${L.rows.map(r => { const sx = MAIL_ST[r.status] || [r.status || '—', 'wait'], open = L.open === r.id;
      return `<div class="sl-row ${open?'open':''}" ${act('toggleMailLogRow', r.id)}>
        <div class="sl-when">${new Date(r.created_at).toLocaleDateString('tr-TR')}<small>${new Date(r.created_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}</small></div>
        <div class="sl-main"><div class="sl-top"><b>${escapeHtml(r.to_email)}</b><span class="sl-type">${escapeHtml(mailPurposeLbl(r.purpose))}</span></div>
          <div class="sl-msg">${escapeHtml(r.subject || '')}</div>
          ${open ? `<div class="sl-meta">${r.provider ? 'Servis: ' + escapeHtml(r.provider) : ''}${r.finished_at ? ' · Sonuç: ' + new Date(r.finished_at).toLocaleString('tr-TR') : ''}${r.error ? '<br>⚠️ Hata: ' + escapeHtml(r.error) : ''}${r.status === 'no_provider' ? '<br>⚠️ Bu e-posta gönderilmedi çünkü o sırada e-posta servisi bağlı değildi. Bağlantı sekmesinden servisinizi kaydedin.' : ''}</div>` : ''}</div>
        <span class="sl-st ${sx[1]}">${sx[0]}</span></div>`; }).join('')}</div>
      ${L.rows.length < (d.total || 0) ? `<button type="button" class="ghost-btn sl-more" ${act('loadMailLog', true)}>Daha fazla göster (${L.rows.length} / ${d.total})</button>` : `<p class="muted sl-count">${d.total || 0} e-posta gösteriliyor</p>`}`}
  </div>`;
}
function setMailLog(k, v){ const L = APP.mailLog; if(k === 'status' && L.status === v) v = ''; L[k] = k === 'days' ? Number(v) : v; if(k === 'days') L.day = ''; L.open = null; loadMailLog(); }
function toggleMailLogRow(id){ APP.mailLog.open = APP.mailLog.open === id ? null : id; drawMailLog(); }
async function loadSmsTemplates(){
  const box = document.getElementById('smsTplBox'); if(!box) return;
  const { data } = await sb.rpc('get_sms_templates', { p_token: getSession().session_token });
  APP.smsTpl = data || {}; drawSmsTemplates();
}
function smsLen(t){ const uni = /[çğıöşüÇĞİÖŞÜ€]/.test(t); const per = uni ? 70 : 160, n = t.length; return { n, sms: n <= per ? 1 : Math.ceil(n / (uni ? 67 : 153)), uni }; }
function drawSmsTemplates(){
  const box = document.getElementById('smsTplBox'); if(!box) return;
  const fill = (t, txt) => txt.replace(/\{(\w+)\}/g, (m, v) => `<i class="st-var">${escapeHtml(SMS_VAR_LBL[v] || v)}</i>`);
  const onN = SMS_TPL.filter(t => (APP.smsTpl[t.k] || {}).enabled !== false).length;
  const cat = (APP.tplCat || {}).sms || '';
  box.innerHTML = `<div class="ix-sec"><div class="ix-st">Mesajlar <span class="pchip">${onN}/${SMS_TPL.length} açık</span></div>
    <p class="muted st-help">Anahtarla mesajı açıp kapatın; metni değiştirmek için karta dokunun.</p>
    ${tplCatChips('sms', SMS_TPL, t => (APP.smsTpl[t.k] || {}).enabled !== false)}
    <div class="st-list st-grid">${tplSort(SMS_TPL).filter(t => !cat || tplCat(t.k) === cat).map(t => { const c = APP.smsTpl[t.k] || {}, on = c.enabled !== false, txt = c.text || t.d, L = smsLen(txt), open = APP.smsTplOpen === t.k;
      return `<div class="st-row ${on?'':'off'} ${open?'open':''}" data-tpl="${t.k}">
        <div class="st-head">
          <button type="button" class="st-hit" ${act('toggleSmsTplOpen', t.k)}><span class="st-ic">${t.ic}</span><span class="st-t"><b>${t.t}${c.text ? ' <em class="st-custom">özel</em>' : ''}</b><small>${t.w}</small><span class="st-prev">${fill(t, escapeHtml(txt))}</span></span><span class="st-chev">${open?'▴':'▾'}</span></button>
          <button type="button" role="switch" aria-checked="${on}" class="nm-sw ${on?'on':''}" title="${on?'Gönderiliyor':'Kapalı'}" ${act('toggleSmsTpl', t.k, !on)}><i></i></button>
        </div>
        ${open ? `<div class="st-edit"><textarea id="tpl_${t.k}" rows="3" maxlength="480" ${actOn('input','smsTplInput',[t.k])}>${escapeHtml(txt)}</textarea>
        <div class="st-foot"><span class="st-vars">${t.v.map(v => `<button type="button" class="pchip" ${act('insertSmsVar', t.k, v)}>+ ${SMS_VAR_LBL[v]}</button>`).join('')}</span></div>
        <div class="st-foot"><small class="muted" id="tplLen_${t.k}">${L.n} karakter · ${L.sms} SMS${L.uni ? ' · Türkçe karakter' : ''}</small><span style="flex:1"></span>
          <button type="button" class="ghost-btn st-btn" ${act('resetSmsTpl', t.k)}>↺ Varsayılan</button>
          <button type="button" class="st-save" id="tplSave_${t.k}" disabled ${act('saveSmsTpl', t.k)}>${ICON_SAVE}<span>Kaydet</span></button></div></div>` : ''}
      </div>`; }).join('')}</div></div>`;
}
/* E-posta şablonları: SMS'teki gibi her e-posta açılıp kapatılır, konu ve metni değiştirilebilir (boş = varsayılan). */
const MAIL_TPL = [
  { k:'resv_created', ic:'📅', t:'Rezervasyon alındı', w:'Rezervasyon oluşturulunca', s:'{isletme} - Rezervasyonunuz alındı', d:'Merhaba {ad},\n\n{isletme} için {tarih_saat} tarihli {kisi} kişilik rezervasyonunuz oluşturuldu.\n\nDeğişiklik için bizi arayabilirsiniz: {telefon}\nSizi bekliyoruz!' },
  { k:'resv_confirmed', ic:'✅', t:'Rezervasyon onaylandı', w:'Rezervasyon onaylanınca', s:'{isletme} - Rezervasyonunuz onaylandı', d:'Merhaba {ad},\n\n{tarih_saat} tarihli {kisi} kişilik rezervasyonunuz onaylandı.\n\nSizi bekliyoruz!' },
  { k:'resv_pending', ic:'⏳', t:'Rezervasyon onay bekliyor', w:'Online rezervasyon gelince', s:'{isletme} - Rezervasyonunuz onay bekliyor', d:'Merhaba {ad},\n\n{tarih_saat} tarihli rezervasyonunuz onay bekliyor; onaylanınca size haber vereceğiz.' },
  { k:'resv_updated', ic:'✏️', t:'Rezervasyon güncellendi', w:'Saat / kişi değişince', s:'{isletme} - Rezervasyonunuz güncellendi', d:'Merhaba {ad},\n\nRezervasyon bilgileriniz güncellendi: {tarih_saat}, {kisi} kişi.' },
  { k:'resv_reminder', ic:'⏰', t:'Rezervasyon hatırlatma', w:'Rezervasyona birkaç saat kala', s:'{isletme} - Rezervasyon hatırlatması', d:'Merhaba {ad},\n\nBugün {tarih_saat} için {kisi} kişilik rezervasyonunuz var. Sizi bekliyoruz!' },
  { k:'resv_cancelled', ic:'❌', t:'Rezervasyon iptal', w:'Rezervasyon iptal edilince', s:'{isletme} - Rezervasyonunuz iptal edildi', d:'Merhaba {ad},\n\n{tarih_saat} tarihli rezervasyonunuz iptal edildi. Yeni rezervasyon için bizi arayabilirsiniz: {telefon}' },
  { k:'resv_no_show', ic:'🚫', t:'Rezervasyona gelinmedi', w:'Gelmedi işaretlenince', s:'{isletme} - Rezervasyonunuza gelinmedi', d:'Merhaba {ad},\n\n{tarih_saat} tarihli rezervasyonunuza gelmediğiniz kaydedildi.' },
  { k:'wl_joined', ic:'🧾', t:'Bekleme listesine alındı', w:'Bekleme listesine eklenince', s:'{isletme} - Bekleme listesine alındınız', d:'Merhaba {ad},\n\n{isletme} bekleme listesine {kisi} kişi olarak alındınız. Tahmini bekleme: {dakika} dakika (yaklaşık {saat}).' },
  { k:'wl_updated', ic:'🔄', t:'Bekleme süresi güncellendi', w:'Tahmini süre değişince', s:'{isletme} - Bekleme süreniz güncellendi', d:'Merhaba {ad},\n\nYeni tahmini bekleme süreniz: {dakika} dakika (yaklaşık {saat}).' },
  { k:'wl_soon', ic:'🔔', t:'Sıranız yaklaşıyor', w:'Masaya az kalınca', s:'{isletme} - Masanıza {dakika} dakika kaldı', d:'Merhaba {ad},\n\nMasanızın hazır olmasına yaklaşık {dakika} dakika kaldı ({saat}). Lütfen restorana yakın olun.' },
  { k:'wl_ready', ic:'🍽️', t:'Masanız hazır', w:'Bekleme listesinde “Masa Hazır” basılınca', v:['isletme','ad','kisi'], s:'{isletme} - Masanız hazır', d:'Merhaba {ad},\n\nMasanız hazır! Lütfen girişe gelin.' },
  { k:'takeaway_ready', ic:'📦', t:'Siparişiniz hazır', w:'Paket / gel-al siparişi hazır olunca', v:['isletme','ad','no'], s:'{isletme} - Siparişiniz hazır', d:'Merhaba {ad},\n\n{no} numaralı siparişiniz hazır. Afiyet olsun!' },
  { k:'delivery_dispatched', ic:'🛵', t:'Sipariş yola çıktı', w:'Sipariş kuryeye verilince', v:['isletme','ad','kurye','kurye_tel','takip'], s:'{isletme} - Siparişiniz yola çıktı', d:'Merhaba {ad},\n\nSiparişiniz yola çıktı!\nKurye: {kurye}\nTelefon: {kurye_tel}\nTakip: {takip}' },
  { k:'payment', ic:'💳', t:'Ödeme alındı', w:'Hesaba müşteri girildiyse ödeme alınınca', v:['isletme','ad','tutar','link'], s:'{isletme} - Ödemeniz alındı', d:'Merhaba {ad},\n\n{tutar} TL tutarındaki ödemeniz alındı. Teşekkür ederiz!\n\nBizi değerlendirin: {link}' },
  { k:'review_request', ic:'⭐', t:'Değerlendirme isteği', w:'Hesaptan değerlendirme linki gönderilince', v:['isletme','link'], s:'{isletme} - Bizi değerlendirir misiniz?', d:'Merhaba,\n\nDeneyiminizi değerlendirir misiniz?\n{link}' },
];
const MAIL_VAR_LBL = { isletme:'İşletme adı', ad:'Müşteri adı', tarih_saat:'Tarih / saat', kisi:'Kişi sayısı', telefon:'İşletme telefonu', dakika:'Kalan dakika', saat:'Tahmini saat', no:'Sipariş no', kurye:'Kurye adı', kurye_tel:'Kurye telefonu', takip:'Takip linki', tutar:'Tutar', link:'Değerlendirme linki' };
const MAIL_VARS = { resv:['isletme','ad','tarih_saat','kisi','telefon'], wl:['isletme','ad','kisi','dakika','saat','telefon'] };
async function loadMailTemplates(){
  const box = document.getElementById('mailTplBox'); if(!box) return;
  const { data } = await sb.rpc('get_mail_templates', { p_token: getSession().session_token });
  APP.mailTpl = data || {}; drawMailTemplates();
}
function drawMailTemplates(){
  const box = document.getElementById('mailTplBox'); if(!box) return;
  const fill = (txt) => escapeHtml(txt).replace(/\{(\w+)\}/g, (m, v) => `<i class="st-var">${escapeHtml(MAIL_VAR_LBL[v] || v)}</i>`);
  const onN = MAIL_TPL.filter(t => (APP.mailTpl[t.k] || {}).enabled !== false).length;
  const cat = (APP.tplCat || {}).mail || '';
  box.innerHTML = `<div class="ix-sec"><div class="ix-st">E-postalar <span class="pchip">${onN}/${MAIL_TPL.length} açık</span></div>
    <p class="muted st-help">Anahtarla e-postayı açıp kapatın; konu ve metni değiştirmek için karta dokunun. Fiş ve fatura e-postaları belge içeriği olduğu için burada değil.</p>
    ${tplCatChips('mail', MAIL_TPL, t => (APP.mailTpl[t.k] || {}).enabled !== false)}
    <div class="st-list st-grid">${tplSort(MAIL_TPL).filter(t => !cat || tplCat(t.k) === cat).map(t => { const c = APP.mailTpl[t.k] || {}, on = c.enabled !== false, subj = c.subject || t.s, body = c.body || t.d, open = APP.mailTplOpen === t.k, vars = t.v || MAIL_VARS[t.k.split('_')[0]];
      return `<div class="st-row ${on?'':'off'} ${open?'open':''}">
        <div class="st-head">
          <button type="button" class="st-hit" ${act('toggleMailTplOpen', t.k)}><span class="st-ic">${t.ic}</span><span class="st-t"><b>${t.t}${(c.subject || c.body) ? ' <em class="st-custom">özel</em>' : ''}</b><small>${t.w}</small><span class="st-prev">✉️ ${fill(subj)}</span></span><span class="st-chev">${open?'▴':'▾'}</span></button>
          <button type="button" role="switch" aria-checked="${on}" class="nm-sw ${on?'on':''}" ${act('saveMailTpl', t.k, !on)}><i></i></button>
        </div>
        ${open ? `<div class="st-edit">
          <label class="mt-lbl">Konu</label><input id="mts_${t.k}" maxlength="200" value="${escapeAttr(subj)}" ${actOn('input','mailTplDirty',[t.k])}>
          <label class="mt-lbl">Metin</label><textarea id="mtb_${t.k}" rows="6" maxlength="4000" ${actOn('input','mailTplDirty',[t.k])} ${actOn('focus','setMailFocus',[t.k,'b'])}>${escapeHtml(body)}</textarea>
          <div class="st-foot"><span class="st-vars">${vars.map(v => `<button type="button" class="pchip" ${act('insertMailVar', t.k, v)}>+ ${MAIL_VAR_LBL[v]}</button>`).join('')}</span></div>
          <div class="st-foot"><small class="muted">E-posta, işletme logonuz ve renklerinizle hazır şablon içinde gönderilir.</small><span style="flex:1"></span>
            <button type="button" class="ghost-btn st-btn" ${act('resetMailTpl', t.k)}>↺ Varsayılan</button>
            <button type="button" class="st-save" id="mtSave_${t.k}" disabled ${act('saveMailTpl', t.k)}>${ICON_SAVE}<span>Kaydet</span></button></div></div>` : ''}
      </div>`; }).join('')}</div></div>`;
}
function toggleMailTplOpen(k){ APP.mailTplOpen = APP.mailTplOpen === k ? null : k; drawMailTemplates(); }
function mailTplDirty(k){ const b = document.getElementById('mtSave_' + k); if(b) b.disabled = false; }
function insertMailVar(k, v){ const ta = document.getElementById('mtb_' + k); if(!ta) return; const p = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, p) + '{' + v + '}' + ta.value.slice(ta.selectionEnd ?? p); ta.focus(); mailTplDirty(k); }
function setMailFocus(){}
function resetMailTpl(k){ const t = MAIL_TPL.find(x => x.k === k); const a = document.getElementById('mts_' + k), b = document.getElementById('mtb_' + k); if(a) a.value = t.s; if(b) b.value = t.d; mailTplDirty(k); }
async function saveMailTpl(k, enabledOverride){
  const t = MAIL_TPL.find(x => x.k === k), cur = APP.mailTpl[k] || {};
  const enabled = enabledOverride != null ? enabledOverride : cur.enabled !== false;
  const a = document.getElementById('mts_' + k), b = document.getElementById('mtb_' + k);
  let subj = a ? a.value.trim() : (cur.subject || ''), body = b ? b.value.trim() : (cur.body || '');
  if(subj === t.s) subj = ''; if(body === t.d) body = '';
  const { error } = await sb.rpc('set_mail_template', { p_token: getSession().session_token, p_key: k, p_enabled: enabled, p_subject: subj || null, p_body: body || null });
  if(error){ alert(error.message); return; }
  APP.mailTpl[k] = { enabled, subject: subj || null, body: body || null }; drawMailTemplates();
  showToast(enabledOverride != null ? (enabled ? t.t + ' açıldı ✓' : t.t + ' kapatıldı') : 'E-posta kaydedildi ✓');
}
function toggleSmsTplOpen(k){ APP.smsTplOpen = APP.smsTplOpen === k ? null : k; drawSmsTemplates(); const ta = document.getElementById('tpl_' + k); if(ta) ta.focus(); }
function smsTplInput(k){ const ta = document.getElementById('tpl_' + k), L = smsLen(ta.value); document.getElementById('tplLen_' + k).textContent = `${L.n} karakter · ${L.sms} SMS${L.uni ? ' · Türkçe karakter' : ''}`; document.getElementById('tplSave_' + k).disabled = false; }
function insertSmsVar(k, v){ const ta = document.getElementById('tpl_' + k); if(!ta || ta.disabled) return; const p = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, p) + '{' + v + '}' + ta.value.slice(ta.selectionEnd ?? p); ta.focus(); smsTplInput(k); }
async function saveSmsTpl(k, enabledOverride){
  const t = SMS_TPL.find(x => x.k === k), ta = document.getElementById('tpl_' + k), cur = APP.smsTpl[k] || {};
  const enabled = enabledOverride != null ? enabledOverride : cur.enabled !== false;
  let text = ta ? ta.value.trim() : (cur.text || '');
  if(text === t.d) text = '';
  const { error } = await sb.rpc('set_sms_template', { p_token: getSession().session_token, p_purpose: k, p_enabled: enabled, p_text: text || null });
  if(error){ alert(error.message); return; }
  APP.smsTpl[k] = { enabled, text: text || null }; drawSmsTemplates(); showToast(enabledOverride != null ? (enabled ? t.t + ' açıldı ✓' : t.t + ' kapatıldı') : 'Mesaj kaydedildi ✓');
}
function toggleSmsTpl(k, on){ saveSmsTpl(k, !!on); }
function resetSmsTpl(k){ const t = SMS_TPL.find(x => x.k === k), ta = document.getElementById('tpl_' + k); if(ta){ ta.value = t.d; smsTplInput(k); } }
async function saveSmsOnPayment(on){
  const { error } = await sb.rpc('set_sms_on_payment', { p_token: getSession().session_token, p_on: on });
  if(error){ alert(error.message); return; }
  showToast(on ? 'Ödeme alınınca müşteriye SMS gönderilecek ✓' : 'Ödeme SMS\'i kapatıldı');
}
async function saveSmsSettings(enabled){
  const session = getSession();
  const { error } = await sb.rpc('update_sms_settings', { p_token: session.session_token, p_enabled: enabled });
  if(error){ alert(error.message); return; }
  const sw = document.getElementById('int_sms_enabled'); if(sw){ const em = sw.closest('.oo-switch').querySelector('em'); if(em) em.textContent = enabled ? 'Açık' : 'Kapalı'; const h = sw.closest('.oo-hero'); if(h) h.classList.toggle('on', !!enabled); }
  showToast(enabled ? 'SMS bildirimleri açıldı ✓' : 'SMS bildirimleri kapatıldı');
}

/* ---- İşletmenin kendi hesapları: SMS, e-posta, online ödeme. Gizli anahtarlar sunucuda saklanır,
   buraya yalnızca son 4 hanesi gelir; boş bırakılan gizli alan mevcut değeri korur. ---- */
// Desteklenen SMS sağlayıcıları: alan adları ve nereden alınacağı.
const TI_SMS = {
  netgsm: { ic:'🟧', d:'En yaygın', n:'NetGSM', u:'Kullanıcı kodu (850xxxxxxx)', p:'API alt kullanıcı şifresi', h:'NetGSM panelinde <b>Abonelik İşlemleri → API İşlemleri</b>\'nden API alt kullanıcısı oluşturun.' },
  iletimerkezi: { ic:'🟦', d:'Kurumsal SMS', n:'İleti Merkezi', u:'API Anahtarı', p:'Hash', h:'İleti Merkezi panelinde <b>Ayarlar → API → API Anahtarları</b>\'ndan oluşturun. Gönderen başlığı onaylanana kadar <b>APITEST</b> yazın.' },
  verimor: { ic:'🟩', d:'Bulut santral + SMS', n:'Verimor', u:'Kullanıcı adı (908501234567)', p:'API şifresi', h:'Verimor OİM panelinde <b>SMS → API Ayarları</b>\'ndan API şifresi belirleyin.' },
  other: { ic:'➕', d:'Başka firma (HTTP API)', n:'Diğer', u:'Kullanıcı adı (isteğe bağlı)', p:'Şifre / API anahtarı (isteğe bağlı)', h:'Firmanızın "HTTP GET ile SMS gönder" adresini yazın; <b>{phone}</b>, <b>{message}</b> zorunlu, <b>{user}</b> <b>{pass}</b> <b>{header}</b> isteğe bağlı. Ör: https://api.firma.com/send?user={user}&pass={pass}&to={phone}&text={message}&from={header}' },
  vatansms: { ic:'🟥', d:'Uygun fiyatlı', n:'VatanSMS', u:'API ID', p:'API Key', h:'VatanSMS panelinde <b>Hesabım → API Bilgileri</b> sayfasında bulunur.' },
};
function tiSmsProv(v){ const c = TI_SMS[v] || TI_SMS.netgsm; const set = (id, h) => { const e = document.getElementById(id); if(e) e.innerHTML = h; };
  set('ti_sms_ul', c.u); set('ti_sms_pl', c.p); set('ti_sms_h', 'ℹ️ ' + c.h); }
function tiSmsPick(id, v){ ixPick(id, v); tiSmsProv(v); const w = document.getElementById('ti_sms_urlw'); if(w) w.style.display = v === 'other' ? '' : 'none'; }
function tiMailPick(id, v){ ixPick(id, v); const o = v === 'other'; const w = document.getElementById('ti_mail_otherw'), f = document.getElementById('ti_mail_fields'); if(w) w.style.display = o ? '' : 'none'; if(f) f.style.display = o ? 'none' : ''; }
async function renderTenantIntegrations(session){
  const bs = document.getElementById('tiSms'), bm = document.getElementById('tiMail'), bp = document.getElementById('tiPay'); if(!bs && !bm && !bp) return;
  const { data, error } = await sb.rpc('get_tenant_integrations', { p_token: session.session_token });
  if(error){ [bs, bm, bp].forEach(x => { if(x) x.innerHTML = `<p class="muted">Entegrasyon ayarları yüklenemedi: ${escapeHtml(error.message)}</p>`; }); return; }
  const sm = data.sms || {}, ml = data.mail || {}, py = data.pay || {};
  const opt = (v, cur, l) => `<option value="${v}" ${cur===v?'selected':''}>${l}</option>`;
  const st = (ok, txt) => `<span class="ti-st ${ok?'ok':''}">${ok ? '● Bağlı' : '○ ' + txt}</span>`;
  const tiles = (id, cur, list, fn) => `<input type="hidden" id="${id}" value="${escapeAttr(cur||'')}"><div class="ix-tiles">${list.map(([v, ic, n, d]) =>
      `<button type="button" class="ix-tile ${cur===v?'on':''}" ${act(fn, id, v)} data-v="${v}"><span>${ic}</span><b>${n}</b><small>${d}</small></button>`).join('')}</div>`;
  const mailWait = ml.provider === 'other';
  const smsOk = !!(sm.provider === 'other' ? sm.url : (sm.provider && sm.user && sm.has_pass)), mailOk = !!(ml.provider && ml.key_tail && ml.from);
  APP.intLive = { sms: smsOk, mail: mailOk && !mailWait };
  [['sms', smsOk && !!(document.getElementById('int_sms_enabled') || {}).checked], ['mail', mailOk && !mailWait]].forEach(([id, ok]) => {
    const r = document.querySelector('.int-row[data-int-tab="' + id + '"]'); if(!r || r.classList.contains('st-lock')) return;
    r.classList.toggle('st-ok', ok); r.classList.toggle('st-off', !ok); const e = r.querySelector('.int-st'); if(e) e.textContent = ok ? '● Aktif' : '○ Kapalı'; });
  const sc = TI_SMS[sm.provider] || TI_SMS.netgsm;
  const cards = [`<div class="ix-sec"><div class="ix-st">1 · SMS firmanızı seçin <span class="ti-st ${smsOk?'ok':''}">${smsOk?'● Bağlı':sm.provider && sm.provider!=='other' ? '⚠️ ' + (sc.p || 'Şifre') + ' eksik — gönderilmez' : '○ Bağlı değil — gönderilmez'}</span></div>
      ${tiles('ti_sms_provider', sm.provider, [['', '🚫', 'Bağlı değil', 'SMS gönderilmez'], ...Object.keys(TI_SMS).sort((a, b) => (a==='other') - (b==='other')).map(k => [k, TI_SMS[k].ic, TI_SMS[k].n, TI_SMS[k].d])], 'tiSmsPick')}</div>
    <div class="ix-sec"><div class="ix-st">2 · Hesap bilgileri</div>
      <div class="ix-form">
        <div><label id="ti_sms_ul">${sc.u}</label><input id="ti_sms_user" value="${escapeAttr(sm.user || '')}" autocomplete="off"></div>
        <div><label id="ti_sms_pl">${sc.p}</label><input id="ti_sms_pass" type="password" class="${sm.provider && sm.provider!=='other' && !sm.has_pass ? 'ti-missing' : ''}" placeholder="${sm.has_pass ? '•••••••• kayıtlı — değiştirmek için yazın' : sm.provider ? 'Girilmedi — SMS gönderilemez' : ''}" autocomplete="new-password"></div>
        <div><label>Gönderen başlığı</label><input id="ti_sms_header" value="${escapeAttr(sm.header || '')}" placeholder="ÖRN. LEZZETSOFR" maxlength="11"></div>
        <div id="ti_sms_urlw" style="grid-column:1/-1;${sm.provider==='other'?'':'display:none;'}"><label>🌐 API adresi</label><input id="ti_sms_url" value="${escapeAttr(sm.url || '')}" placeholder="https://api.firma.com/send?to={phone}&text={message}"></div>
      </div></div>
    <p class="ix-note" id="ti_sms_h">ℹ️ ${sc.h}</p>
    <button class="ix-save" type="button" ${act('saveTenantInt', 'sms')}>${ICON_SAVE}<span>Kaydet</span></button>
    ${sm.provider ? `<div class="ix-sec ti-test"><div class="ix-st">3 · Test et</div><div class="ti-test-row"><input id="ti_sms_testphone" inputmode="tel" placeholder="05XX XXX XX XX"><button type="button" class="ghost-btn" ${act('sendTestSms')}>📨 Test SMS gönder</button></div><small class="muted" id="ti_sms_testres"></small></div>` : ''}`,
  `<div class="oo-hero ${mailOk?'on':''}"><div class="oo-hero-ic">✉️</div>
      <div class="oo-hero-t"><b>Kendi alan adınızdan e-posta</b><small>Fiş, fatura, rezervasyon ve bekleme listesi e-postaları ör. info@restoraniniz.com adresinden gider. Bağlamazsanız müşterilere e-posta gönderilmez.</small></div>
      <span class="ti-st ${mailOk&&!mailWait?'ok':''}">${mailWait?'⏳ Ekleniyor':mailOk?'● Bağlı':'○ Bağlı değil'}</span></div>
    <div class="ix-sec"><div class="ix-st">1 · E-posta servisinizi seçin</div>
      ${tiles('ti_mail_provider', ml.provider, [['', '🚫', 'Bağlı değil', 'E-posta gönderilmez'], ['resend', '⚡', 'Resend', 'Geliştirici dostu, hızlı'], ['brevo', '💙', 'Brevo', 'Sendinblue, ücretsiz kota'], ['sendgrid', '🔷', 'SendGrid', 'Twilio SendGrid'], ['postmark', '📮', 'Postmark', 'Yüksek teslim oranı'], ['other', '➕', 'Diğer', 'Başka firma']], 'tiMailPick')}</div>
    <div class="ix-sec" id="ti_mail_otherw" style="${ml.provider==='other'?'':'display:none;'}"><div class="ix-st">2 · Hangi firmayı kullanıyorsunuz?</div>
      <div class="ix-form"><div><label>Firma adı</label><input id="ti_mail_other" value="${escapeAttr(ml.other || '')}" placeholder="ör. Mailgun, Amazon SES, Yandex"></div></div>
      <p class="ix-note">⏳ Kaydedin, firmanızı listeye ekleyelim. Eklenene kadar müşterilere e-posta gönderilmez.</p></div>
    <div class="ix-sec" id="ti_mail_fields" style="${ml.provider==='other'?'display:none;':''}"><div class="ix-st">2 · Gönderim bilgileri</div>
      <div class="ix-form">
        <div><label>🔑 API anahtarı</label><input id="ti_mail_key" type="password" placeholder="${ml.key_tail ? '••••' + escapeAttr(ml.key_tail) + ' kayıtlı — değiştirmek için yazın' : 'API anahtarı'}" autocomplete="new-password"></div>
        <div><label>Gönderen e-posta</label><input id="ti_mail_from" type="email" value="${escapeAttr(ml.from || '')}" placeholder="info@restoraniniz.com"></div>
        <div><label>Gönderen adı</label><input id="ti_mail_from_name" value="${escapeAttr(ml.from_name || '')}" placeholder="Restoran adınız"></div>
      </div></div>
    <p class="ix-note">ℹ️ Alan adınızı seçtiğiniz serviste doğrulamanız gerekir (DNS kayıtları). Resend: <b>Domains</b>, Brevo: <b>Senders & Domains</b>, SendGrid: <b>Sender Authentication</b>, Postmark: <b>Sender Signatures</b>.</p>
    <button class="ix-save" type="button" ${act('saveTenantInt', 'mail')}>${ICON_SAVE}<span>Kaydet</span></button>`, `<div class="ti-card">
      <div class="ti-h"><span>💳</span><b>Online ödeme</b>${st((py.mode||'off')!=='off', 'Kapıda ödeme')}</div>
      <p class="muted ti-d">Açarsanız online sipariş sayfasında müşteri kartla ödeyebilir; para doğrudan <b>sizin</b> sanal POS hesabınıza geçer. Kapalıyken müşteri kapıda öder.</p>
      <label>Sipariş sayfasında ödeme</label>
      <div class="ti-modes">
        ${[['off','💵 Kapıda ödeme','Kart istenmez; müşteri teslimde öder. Sipariş hemen düşer.'],['optional','🔀 Müşteri seçsin','Kapıda veya online kartla. Online seçerse sipariş ödeme sonrası düşer.'],['required','💳 Önce online ödeme','Her sipariş önce kartla ödenir; ödeme başarılı olunca size düşer.']].map(([k, l, d]) => `<label class="ti-mode ${(py.mode||'off')===k?'on':''}"><input type="radio" name="ti_pay_mode" value="${k}" ${(py.mode||'off')===k?'checked':''} ${actOn('change','tiPayToggle',[k])}><b>${l}</b><small>${d}</small></label>`).join('')}
      </div>
      <div id="tiPayFields" style="${(py.mode||'off')!=='off'?'':'display:none;'}">
        <label>Sağlayıcı</label><select id="ti_pay_provider">${opt('iyzico', py.provider || 'iyzico', 'iyzico')}<option value="paytr" disabled>PayTR (yakında)</option></select>
        <label>API anahtarı (Merchant key / API key)</label><input id="ti_pay_key" type="password" placeholder="${py.key_tail ? '••••' + escapeAttr(py.key_tail) + ' (kayıtlı)' : 'API anahtarı'}" autocomplete="new-password">
        <label>Gizli anahtar (Secret / Merchant salt)</label><input id="ti_pay_secret" type="password" placeholder="${py.has_secret ? '•••••• (kayıtlı)' : 'Gizli anahtar'}" autocomplete="new-password">
        <label class="ti-sw"><input type="checkbox" id="ti_pay_sandbox" ${py.sandbox!==false?'checked':''}> Test modu (gerçek para çekilmez)</label>
      </div>
      <button type="button" ${act('saveTenantInt', 'pay')}>💾 Kaydet</button>
    </div>`];
  if(bs) bs.innerHTML = cards[0];
  if(bm) bm.innerHTML = cards[1];
  if(bp) bp.innerHTML = `<div class="ti-one">${cards[2]}</div>`;
}
function tiPayToggle(mode){
  const f = document.getElementById('tiPayFields'); if(f) f.style.display = mode !== 'off' ? '' : 'none';
  document.querySelectorAll('.ti-mode').forEach(l => l.classList.toggle('on', l.querySelector('input').value === mode));
}
async function saveTenantInt(kind){
  const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
  const c = (id) => !!(document.getElementById(id) || {}).checked;
  const data = kind==='sms' ? { provider: v('ti_sms_provider'), user: v('ti_sms_user'), pass: v('ti_sms_pass'), header: v('ti_sms_header'), url: v('ti_sms_url') }
    : kind==='mail' ? { provider: v('ti_mail_provider'), key: v('ti_mail_key'), from: v('ti_mail_from'), from_name: v('ti_mail_from_name'), other: v('ti_mail_other') }
    : { mode: (document.querySelector('input[name=ti_pay_mode]:checked') || {}).value || 'off', provider: v('ti_pay_provider'), key: v('ti_pay_key'), secret: v('ti_pay_secret'), sandbox: c('ti_pay_sandbox') };
  const s = getSession();
  const { error } = await withLoadingOverlay(sb.rpc('save_tenant_integration', { p_token: s.session_token, p_kind: kind, p_data: data }));
  if(error){ alert(error.message); return; }
  showToast({ sms:'SMS', mail:'E-posta', pay:'Online ödeme' }[kind] + ' ayarları kaydedildi ✓');
  renderTenantIntegrations(s);
}
