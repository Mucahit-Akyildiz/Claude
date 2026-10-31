/* Finansal Analiz ekranı - app/index.html'den çıkarıldı (modülerleştirme).
   Klasik <script src>, ES module değil - bkz. app/js/api.js'in üstündeki
   not. */
/* ================= FİNANSAL ANALİZ ================= */
/* Finansal Analiz ekranı yönetici için bile ayrı bir şifreyle korunuyor
   (bkz. kullanıcı isteği). Şifre işletme bazlı tek bir ortak sır olarak
   restaurants.reports_password_hash içinde tutuluyor (bkz.
   set_reports_password/verify_reports_password). Kilit APP.reportsUnlocked
   içinde bellekte tutulur - sayfa yenilenince veya çıkış yapılınca
   tekrar şifre istenir. */
function renderReportsGate(main, session){
  const passwordSet = APP.config && APP.config.license && APP.config.license.reports_password_set;
  if(!passwordSet) return renderReportsSetPasswordGate(main, session);
  if(APP.reportsGateScreen === 'forgot1' || APP.reportsGateScreen === 'forgot2') return renderReportsForgotGate(main, session);
  return renderReportsEnterGate(main, session);
}
function renderReportsEnterGate(main, session){
  main.innerHTML = `<h1>Finansal Analiz</h1>
    <div class="rg-wrap">
      <div class="rg-bg" aria-hidden="true">${['📊 Genel Özet','📈 Dönemsel Analiz','🧾 KDV','📦 Ürün İstatistikleri','👥 Personel','💰 Bahşiş','🔥 İsraf','📒 Açık Hesaplar'].map((t, i) => `<span style="--i:${i}">${t}</span>`).join('')}</div>
      <div class="rg-card">
        <div class="rg-lock"><span>🔒</span></div>
        <h2>Finansal veriler korumalı</h2>
        <p class="muted">Ciro, kâr ve personel raporlarını görmek için finansal analiz şifresini girin.</p>
        <div class="pw-field-wrap">
          <input type="password" id="rpEnterPass" placeholder="Şifre" autocomplete="current-password" ${actOn('keydown','onEnterKey',['$event','doUnlockReports'])}>
          <button type="button" class="pw-eye-btn" ${act('toggleReportsPassVisibility', 'rpEnterPass')} title="Şifreyi göster/gizle">👁️</button>
        </div>
        <button id="rpEnterBtn" class="rg-btn" ${act('doUnlockReports')}>🔓 Kilidi Aç</button>
        <div class="error" id="rpErr"></div>
        <a href="#" class="rg-forgot" ${act('setReportsGateScreen','forgot1')}>Şifremi Unuttum</a>
      </div>
    </div>`;
  setTimeout(() => { const i = document.getElementById('rpEnterPass'); if(i) i.focus(); }, 50);
}
async function doUnlockReports(){
  const session = getSession();
  const errBox = document.getElementById('rpErr');
  errBox.textContent = '';
  const password = document.getElementById('rpEnterPass').value;
  if(!password){ errBox.textContent = 'Şifre girin'; return; }
  const btn = document.getElementById('rpEnterBtn');
  btn.disabled = true; btn.textContent = 'Kontrol ediliyor...';
  const { data, error } = await sb.rpc('verify_reports_password', { p_token: session.session_token, p_password: password });
  btn.disabled = false; btn.textContent = '🔓 Kilidi Aç';
  if(error){ errBox.textContent = error.message; return; }
  if(!data){ errBox.textContent = 'Şifre hatalı'; const c = document.querySelector('.rg-card'); if(c){ c.classList.remove('rg-shake'); void c.offsetWidth; c.classList.add('rg-shake'); } return; }
  APP.reportsUnlocked = true;
  renderReportsView(document.getElementById('main'), session);
}
function rgShell(icon, title, desc, inner, steps){
  return `<h1>Finansal Analiz</h1>
    <div class="rg-wrap">
      <div class="rg-bg" aria-hidden="true">${['📊 Genel Özet','📈 Dönemsel Analiz','🧾 KDV','📦 Ürün İstatistikleri','👥 Personel','💰 Bahşiş','🔥 İsraf','📒 Açık Hesaplar'].map((t, i) => `<span style="--i:${i}">${t}</span>`).join('')}</div>
      <div class="rg-card">
        ${steps || ''}
        <div class="rg-lock"><span>${icon}</span></div>
        <h2>${title}</h2>
        <p class="muted">${desc}</p>
        ${inner}
      </div>
    </div>`;
}
function rgSteps(cur){
  return `<div class="rg-steps">${['E-posta','Kod & yeni şifre'].map((l, i) => `<span class="${i+1<cur?'done':i+1===cur?'on':''}"><b>${i+1<cur?'✓':i+1}</b>${l}</span>`).join('<i></i>')}</div>`;
}
function rgPassStrength(v, barId){
  const el = document.getElementById(barId || 'rgStrength'); if(!el) return;
  let sc = 0; if(v.length >= 4) sc++; if(v.length >= 8) sc++; if(/[A-ZÇĞİÖŞÜ]/.test(v) && /[a-zçğıöşü]/.test(v)) sc++; if(/\d/.test(v) && /[^\wçğıöşüÇĞİÖŞÜ]/.test(v)) sc++;
  el.dataset.s = v ? sc : '';
  el.querySelector('small').textContent = v ? ['Çok zayıf','Zayıf','Orta','İyi','Güçlü'][sc] : '';
}
function rgPassFields(id1, id2, btnId, btnLabel, fn){
  return `<div class="pw-field-wrap">
      <input type="password" id="${id1}" placeholder="Yeni şifre" autocomplete="new-password" ${actOn('input','rgPassStrength',['$value'])}>
      <button type="button" class="pw-eye-btn" ${act('toggleReportsPassVisibility', id1, id2)} title="Şifreyi göster/gizle">👁️</button>
    </div>
    <div class="rg-strength" id="rgStrength"><i></i><i></i><i></i><i></i><small></small></div>
    <div class="pw-field-wrap">
      <input type="password" id="${id2}" placeholder="Yeni şifre (tekrar)" autocomplete="new-password" ${actOn('keydown','onEnterKey',['$event',fn])}>
      <button type="button" class="pw-eye-btn" ${act('toggleReportsPassVisibility', id1, id2)} title="Şifreyi göster/gizle">👁️</button>
    </div>
    <button id="${btnId}" class="rg-btn" ${act(fn)}>${btnLabel}</button>`;
}
function renderReportsSetPasswordGate(main, session){
  main.innerHTML = rgShell('🛡️', 'Finansal analizi koruyun', 'Ciro ve kâr verilerini korumak için bir şifre belirleyin. Bu şifreyi bilen her yönetici raporları görebilir.',
    rgPassFields('rpSetPass', 'rpSetPass2', 'rpSetBtn', '🛡️ Şifreyi Belirle', 'doSetReportsPassword') + '<div class="error" id="rpErr"></div>');
  setTimeout(() => { const i = document.getElementById('rpSetPass'); if(i) i.focus(); }, 50);
}
async function doSetReportsPassword(){
  const session = getSession();
  const errBox = document.getElementById('rpErr');
  errBox.textContent = '';
  const p1 = document.getElementById('rpSetPass').value;
  const p2 = document.getElementById('rpSetPass2').value;
  if(!p1 || p1.length<4){ errBox.textContent = 'En az 4 karakter bir şifre girin'; return; }
  if(p1 !== p2){ errBox.textContent = 'Girdiğiniz şifreler eşleşmiyor'; return; }
  const btn = document.getElementById('rpSetBtn');
  btn.disabled = true; btn.textContent = 'Kaydediliyor...';
  const { error } = await sb.rpc('set_reports_password', { p_token: session.session_token, p_new_password: p1 });
  btn.disabled = false; btn.textContent = '🛡️ Şifreyi Belirle';
  if(error){ errBox.textContent = error.message; return; }
  APP.config.license.reports_password_set = true;
  APP.reportsUnlocked = true;
  renderReportsView(document.getElementById('main'), session);
}
function renderReportsForgotGate(main, session){
  const step = APP.reportsGateScreen === 'forgot2' ? 2 : 1;
  main.innerHTML = rgShell(step===1 ? '✉️' : '🔑', step===1 ? 'Şifreni mi unuttun?' : 'Yeni şifre belirle',
    `<span id="rpFgSub">${step===1 ? 'İşletmenizin kayıtlı e-postasına bir doğrulama kodu gönderelim.' : 'E-postanıza gönderilen kodu ve yeni şifrenizi girin.'}</span>`,
    `<div id="rpFgStep1" style="display:${step===1?'block':'none'};">
        <button id="rpFgSendBtn" class="rg-btn" ${act('doStartReportsPasswordReset')}>✉️ Kod Gönder</button>
      </div>
      <div id="rpFgStep2" style="display:${step===2?'block':'none'};">
        <p class="u-tc muted" id="rpFgOtpInfo"></p>
        <input id="rpFgOtp" class="rg-otp" placeholder="••••••" maxlength="6" inputmode="numeric" autocomplete="one-time-code">
        ${rgPassFields('rpFgNewPass', 'rpFgNewPass2', 'rpFgVerifyBtn', '🔑 Şifreyi Güncelle', 'doVerifyReportsPasswordReset')}
      </div>
      <div class="error" id="rpErr"></div>
      <a href="#" class="rg-forgot" ${act('setReportsGateScreen',null)}>← Şifreyle Gir</a>`, rgSteps(step));
}
function toggleReportsPassVisibility(id1, id2){
  const f1 = document.getElementById(id1);
  const f2 = id2 ? document.getElementById(id2) : null;
  const showing = f1.type === 'text';
  const nextType = showing ? 'password' : 'text';
  f1.type = nextType; if(f2) f2.type = nextType;
  const wrap = f1.closest('.box, .rg-card');
  if(wrap) wrap.querySelectorAll('.pw-eye-btn').forEach(b => {
    if(!f2 || b.closest('.pw-field-wrap').contains(f1) || b.closest('.pw-field-wrap').contains(f2)) b.textContent = showing ? '👁️' : '🙈';
  });
}
async function doStartReportsPasswordReset(){
  const session = getSession();
  const errBox = document.getElementById('rpErr');
  errBox.textContent = '';
  const btn = document.getElementById('rpFgSendBtn');
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  const { data, error } = await sb.rpc('start_reports_password_reset', { p_token: session.session_token });
  btn.disabled = false; btn.textContent = '✉️ Kod Gönder';
  if(error){ errBox.textContent = error.message; return; }
  APP.reportsGateScreen = 'forgot2';
  renderReportsGate(document.getElementById('main'), session);
  const otpInfo = document.getElementById('rpFgOtpInfo');
  if(data && data.sent){
    otpInfo.textContent = 'İşletmenizin kayıtlı e-postasına gönderilen 6 haneli kodu girin.';
  } else {
    otpInfo.innerHTML = 'E-posta gönderimi henüz ayarlanmadığı için test kodu: <b>' + escapeHtml((data||{}).test_otp||'') + '</b>';
  }
}
async function doVerifyReportsPasswordReset(){
  const session = getSession();
  const errBox = document.getElementById('rpErr');
  errBox.textContent = '';
  const otp = document.getElementById('rpFgOtp').value.trim();
  const newPass = document.getElementById('rpFgNewPass').value;
  const newPass2 = document.getElementById('rpFgNewPass2').value;
  if(!otp){ errBox.textContent = 'Kodu girin'; return; }
  if(!newPass || newPass.length<4){ errBox.textContent = 'En az 4 karakter bir şifre girin'; return; }
  if(newPass !== newPass2){ errBox.textContent = 'Girdiğiniz şifreler eşleşmiyor'; return; }
  const btn = document.getElementById('rpFgVerifyBtn');
  btn.disabled = true; btn.textContent = 'Güncelleniyor...';
  const { data, error } = await sb.rpc('verify_reports_password_reset', { p_token: session.session_token, p_otp: otp, p_new_password: newPass });
  btn.disabled = false; btn.textContent = '🔑 Şifreyi Güncelle';
  if(error){ errBox.textContent = error.message; return; }
  if(data === false){ errBox.textContent = 'Kod hatalı'; return; }
  APP.reportsGateScreen = null;
  APP.reportsUnlocked = true;
  showToast('Finansal analiz şifresi güncellendi ✓');
  renderReportsView(document.getElementById('main'), session);
}
async function renderReportsView(main, session){
  if(!APP.config){
    const { data } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token }));
    if(data) APP.config = data;
  }
  if(APP.reportTab==='purchase') APP.reportTab = 'summary';
  if(!APP.reportsUnlocked){
    renderReportsGate(main, session);
    return;
  }
  // Yenileme/geri ile doğrudan bu ekrana gelinince tarih boş kalıyordu (tüm
  // raporlar tarihsiz istek atıyordu): varsayılan bugün.
  if(!APP.reportDate) APP.reportDate = todayLocalDateStr();
  if(!APP.reportDateTo) APP.reportDateTo = APP.reportDate;
  main.innerHTML = `<h1>Finansal Analiz</h1>
    <div class="u-mwn box">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span class="u-nw muted">Tarih Aralığı</span>
        <input type="date" id="reportDateInput" value="${APP.reportDate}" ${actOn('change','changeReportDate',['$value'])} class="u-wa-m0">
        <span class="muted">–</span>
        <input type="date" id="reportDateToInput" value="${APP.reportDateTo}" ${actOn('change','changeReportDateTo',['$value'])} class="u-wa-m0">
        <span style="width:1px;height:22px;background:var(--border);margin:0 2px;"></span>
        <button type="button" class="range-preset-btn" ${act('setReportDateRangeDays', 0)}>Bugün</button>
        <button type="button" class="range-preset-btn" ${act('setReportDateRangeDays', 6)}>Son 7 Gün</button>
        <button type="button" class="range-preset-btn" ${act('setReportDateRangeDays', 9)}>Son 10 Gün</button>
        <button type="button" class="range-preset-btn" ${act('setReportDateRangeDays', 29)}>Son 30 Gün</button>
        <span class="u-f1"></span>
        <button type="button" class="range-preset-btn" ${act('exportAnalytics')} title="Bu sekmeyi Excel'de açılabilir dosya olarak indir">⬇ Excel</button>
        <button type="button" class="range-preset-btn" ${act('printAnalytics')} title="Yazdır veya PDF olarak kaydet">🖨️ PDF</button>
      </div>
      <div class="an-search-wrap"><input id="anSearch" class="an-search" placeholder="🔍 Raporlarda ara: ürün, masa, personel, hammadde ya da “nakit”, “stok”, “kâr”…" autocomplete="off" ${actOn('input','anSearch',['$value'])}><div id="anSearchRes" class="an-sres" hidden></div></div>
    </div>
    <div class="set-layout rp-layout">
      <nav class="tabs settings-tabs set-nav" id="reportTabs">
        ${reportTabList().map(([k, ic, l, dsc], i) => `<div class="tab set-item ${(APP.reportTab||'summary')===k?'active on':''}" data-tab="${k}" style="--i:${i};--sc:${RACE_COLORS[i%RACE_COLORS.length]};" ${act('setReportTab', k)}><span class="set-ico">${ic}</span><span class="set-txt"><b>${l}</b><small>${dsc}</small></span></div>`).join('')}
      </nav>
      <div id="reportContent" class="set-content"></div>
    </div>`;
  await renderReportTabContent(session);
}
function reportTabList(){
  const dsc = { summary:'Ciro, kâr, ödemeler', cockpit:'Karşılaştırma, tahmin, uyarılar', menueng:'Kârlılık haritası', tablemap:'Masa bazlı ciro', heat:'Gün × saat yoğunluğu', channels:'Masa, paket, gel-al, online', speed:'Hazırlama ve yanıt süreleri',
    stockf:'Ne zaman bitecek', zreport:'Z raporu, yazdır', waiters:'Kartlar, ciro, saatlik çalışma', journey:'Sadakat, kayıp müşteri', period:'Saatlik / günlük', vat:'Vergi dağılımı',
    products:'En çok satanlar', profit:'Maliyet, kâr, net getiri', staff:'Personel ısı haritası', customers:'Müşteri harcamaları', tips:'Bahşiş dağılımı', waste:'Fire ve israf', cancel:'İptaller, personel bazlı kayıp', loss:'Personel bazlı kayıp kontrolü',
    resv:'Rezervasyon performansı', openacc:'Veresiye bakiyeleri', payroll:'Çalışma saati, maaş, prim', dayclose:'Kapandı mı, kasa farkı', reviews:'Yıldız ve yorumlar' };
  return [['summary','📊','Genel Özet'], ...AN_TABS, ['period','📈','Dönemsel Analiz'],['vat','🧾','KDV'],['products','📦','Ürün İstatistikleri'],['profit','💹','Ürün Kârlılığı'],['customers','🧑‍🤝‍🧑','Müşteri Analizleri'],['payroll','💼','Puantaj & Prim'],['reviews','⭐','Müşteri Değerlendirmeleri'],['tips','💰','Bahşiş Havuzu'],['waste','🔥','İsraf'],['cancel','❌','İptal & İkram Kontrolü'],['resv','📅','Rezervasyon Analizi'],['openacc','📒','Açık Hesaplar']].map(t => [...t, dsc[t[0]] || '']);
}
function setReportTab(tab){
  if(tab !== APP.reportTab) pushScreen();
  APP.reportTab = tab;
  document.querySelectorAll('#reportTabs .tab').forEach(t => { t.classList.toggle('active', t.dataset.tab===tab); t.classList.toggle('on', t.dataset.tab===tab); });
  renderReportTabContent(getSession());
}
function changeReportDate(v){
  APP.reportDate = v;
  if(APP.reportDateTo < v) APP.reportDateTo = v;
  const toInput = document.getElementById('reportDateToInput'); if(toInput) toInput.value = APP.reportDateTo;
  renderReportTabContent(getSession());
}
function changeReportDateTo(v){
  APP.reportDateTo = v;
  if(APP.reportDate > v) APP.reportDate = v;
  const fromInput = document.getElementById('reportDateInput'); if(fromInput) fromInput.value = APP.reportDate;
  renderReportTabContent(getSession());
}
function reportDateRangeLabel(){
  if(!APP.reportDateTo || APP.reportDateTo===APP.reportDate) return APP.reportDate;
  return APP.reportDate + ' – ' + APP.reportDateTo;
}
function setReportDateRangeDays(daysBack){
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - daysBack);
  const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  APP.reportDate = fmt(from);
  APP.reportDateTo = fmt(to);
  const fromInput = document.getElementById('reportDateInput'); if(fromInput) fromInput.value = APP.reportDate;
  const toInput = document.getElementById('reportDateToInput'); if(toInput) toInput.value = APP.reportDateTo;
  renderReportTabContent(getSession());
}
function renderReportTabContent(session){
  const tab = APP.reportTab||'summary';
  if(tab==='period') return renderPeriodAnalyticsContent(session);
  if(tab==='vat') return renderVatReportContent(session);
  if(tab==='products') return renderProductStatsContent(session);
  if(tab==='profit') return renderProfitContent(session);
  if(tab==='customers') return renderCustomerAnalyticsContent(session);
  if(tab==='tips') return renderTipPoolContent(session);
  if(tab==='waste') return renderWasteContent(session);
  if(tab==='cancel' || tab==='loss') return renderMergedReport(session, [['❌', 'İptaller', renderCancelReportContent], ['🕵️', 'İptal & İkram Kontrolü (personel bazlı)', renderLossReportContent]]);
  if(tab==='cockpit') return renderCockpitContent(session);
  if(tab==='channels') return renderChannelsContent(session);
  if(tab==='speed') return renderSpeedContent(session);
  if(tab==='menueng') return renderMenuEngContent(session);
  if(tab==='tablemap') return renderTableMapContent(session);
  if(tab==='heat') return renderHeatContent(session);
  if(tab==='stockf') return renderStockForecastContent(session);
  if(tab==='zreport') return renderZReportContent(session);
  if(tab==='payroll') return renderPayrollContent(session);
  if(tab==='dayclose') return renderDayClosesContent(session);
  if(tab==='reviews') return renderReviewsReport(session);
  if(tab==='waiters' || tab==='staff') return renderMergedReport(session, [['🏅', 'Garson Kartları', renderWaiterCardsContent], ['⏰', 'Saatlik Çalışma', renderStaffAnalyticsContent]]);
  if(tab==='journey') return renderJourneyContent(session);
  if(tab==='resv') return renderReservationAnalyticsContent(session);
  if(tab==='openacc') return renderOpenAccountsContent(session);
  return renderReportContent(session);
}
/* Genel Özet panel satırı: solda etiket, sağda değer ve soluk açıklama. */
function fsRow(label, value, sub){
  return `<div class="fs-row"><span class="fs-l">${label}</span><span class="fs-v">${value}${sub ? `<small>${sub}</small>` : ''}</span></div>`;
}
/* Okunur istatistik kartı: üstte etiket, altta büyük değer ve açıklama; renk sol şeritte. */
function kpi(label, value, o){
  o = o || {};
  const click = o.click ? (() => { const [fn, arg] = o.click.split('|'); return act(fn, arg); })() : '';
  return `<div class="kpi${o.click?' kpi-click':''}" style="--kpi-c:${o.color||'var(--border)'};" ${click}>
    <div class="kpi-label">${label}</div>
    <div class="kpi-value" style="${o.color && o.color!=='var(--muted)' ? 'color:'+o.color+';' : ''}">${value}</div>
    ${o.sub ? `<div class="kpi-sub">${o.sub}</div>` : ''}
  </div>`;
}
async function renderReportContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const [{ data, error }, wasteRes] = await withLoadingOverlay(Promise.all([
    sb.rpc('get_sales_history', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }),
    sb.rpc('list_waste', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo })
  ]));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const hist = data || [];
  // Kapatılan Hesaplar için ayrı tarih: girilmişse liste oradan, değilse üstteki aralıktan beslenir.
  let billHist = hist;
  if(APP.billDate){
    const { data: bd } = await sb.rpc('get_sales_history', { p_token: session.session_token, p_date: APP.billDate, p_date_to: APP.billDateTo || APP.billDate });
    billHist = bd || [];
  }
  const wasteCost = (wasteRes.data && wasteRes.data.total_cost) || 0;

  // Sipariş Etiketleri (Personel Yemeği, İkram vb.) işaretlenmiş hesaplar ciro/net
  // kârdan hariç tutulur - stok yine düşmüş olsa da bunlar gerçek satış değildir.
  // Nakit/Kart toplamları ise kasa mutabakatı için TÜM hesaplardan (etiketli dahil)
  // hesaplanmaya devam eder.
  // Etiketli ama limit aşımı nedeniyle ödenmiş hesap (limitli hesap farkı) ciroya dahildir; yalnızca ödemesiz (comp) kapananlar ikramdır.
  const isComp = (o) => o.tags && o.tags.length>0 && (!o.payment_method || o.payment_method === 'comp');
  const untaggedHist = hist.filter(o => !isComp(o));
  const taggedHist = hist.filter(isComp);
  APP.fsHist = hist;

  let totalRevenue=0, totalCost=0, totalCash=0, totalCard=0, totalGiftCard=0, totalDiscount=0, discountedCount=0, taggedTotal=0, totalTip=0, totalBirthdayDiscount=0, birthdayCount=0, totalPoints=0, pointsCount=0;
  const hourStats = {};
  untaggedHist.forEach(o => {
    totalRevenue += Number(o.total); totalCost += Number(o.cost);
    totalDiscount += Number(o.discount_amount||0);
    if(o.discount_amount>0) discountedCount++;
    if(o.birthday_discount_amount>0){ totalBirthdayDiscount += Number(o.birthday_discount_amount); birthdayCount++; }
    if(Number(o.points_amount) > 0){ totalPoints += Number(o.points_amount); pointsCount++; }
    const hr = new Date(o.closed_at).getHours();
    if(!hourStats[hr]) hourStats[hr] = {count:0, revenue:0};
    hourStats[hr].count += 1;
    hourStats[hr].revenue += Number(o.total);
  });
  // İkram hesapları ödemesiz kapandığında tutarı 0 yazılır; ikram değeri ürünlerin toplamıdır (subtotal).
  taggedHist.forEach(o => { taggedTotal += Number(o.subtotal != null && Number(o.subtotal) > 0 ? o.subtotal : o.total) || 0; });
  hist.forEach(o => { totalCash += Number(o.cash_amount||0); totalCard += Number(o.card_amount||0); totalGiftCard += Number(o.gift_card_amount||0); totalTip += Number(o.tip_amount||0); });
  // Havale/EFT (banka banka) ve açık hesaba yazılan.
  let totalTransfer = 0, totalOpenAcc = 0, openAccCount = 0; const byBank = {};
  ((APP.config && APP.config.banks) || []).forEach(b => { byBank[b.bank_name || 'Banka'] = 0; });
  hist.forEach(o => { const tr = Number(o.transfer_amount||0); if(tr > 0){ totalTransfer += tr; const k = o.transfer_bank || 'Banka belirtilmemiş'; byBank[k] = (byBank[k] || 0) + tr; }
    if(o.payment_method === 'open_account'){ totalOpenAcc += Number(o.total||0); openAccCount++; } });
  const profit = totalRevenue - totalCost;

  // Personel bazlı: siparişi kim aldı (aynı siparişin kısmi ödemelerinde
  // tekrar sayılmasın diye order_id ile tekilleştirilir), bahşişi kim
  // topladı (ödemeyi alan kişi - bkz. pay_order_items'taki staff_user_id).
  const staffStats = {};
  const getStaffRow = (name) => {
    if(!staffStats[name]) staffStats[name] = { ordersTaken: new Set(), tipCollected: 0 };
    return staffStats[name];
  };
  hist.forEach(o => {
    if(o.order_taken_by_name) getStaffRow(o.order_taken_by_name).ordersTaken.add(o.order_id);
    if(o.staff_name && Number(o.tip_amount||0)>0) getStaffRow(o.staff_name).tipCollected += Number(o.tip_amount||0);
  });
  const staffNames = Object.keys(staffStats).sort((a,b) => staffStats[b].tipCollected-staffStats[a].tipCollected);
  const staffRowsHtml = staffNames.length===0 ? '<p class="muted">Bu tarihte veri yok.</p>' :
    `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Personel</th><th>Aldığı Sipariş</th><th>Topladığı Bahşiş</th></tr></thead><tbody>` +
    staffNames.map(name => `<tr><td class="col-name">${escapeHtml(name)}</td>
      <td>${staffStats[name].ordersTaken.size}</td>
      <td>${money(staffStats[name].tipCollected)}</td></tr>`).join('') + '</tbody></table></div>';

  const hourKeys = Object.keys(hourStats).map(Number).sort((a,b)=>a-b);
  let peakHour = null;
  hourKeys.forEach(h => { if(peakHour===null || hourStats[h].count>hourStats[peakHour].count) peakHour=h; });
  const maxCount = hourKeys.length ? Math.max(...hourKeys.map(h=>hourStats[h].count)) : 0;
  const hourlyHtml = hourKeys.length===0 ? '<p class="muted">Bu tarihte veri yok.</p>' :
    `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Saat</th><th>Sipariş</th><th>Ciro</th><th>Yoğunluk</th></tr></thead><tbody>` +
    hourKeys.map(h => {
      const hs = hourStats[h];
      const pct = maxCount ? Math.round(hs.count/maxCount*100) : 0;
      const isPeak = h===peakHour;
      const label = (h<10?'0'+h:h)+':00-'+((h+1)%24<10?'0'+((h+1)%24):(h+1)%24)+':00';
      return `<tr><td style="${isPeak?'font-weight:700;':''}">${label}${isPeak?' 🔥':''}</td>
        <td>${hs.count}</td>
        <td>${money(hs.revenue)}</td>
        <td><div style="background:var(--panel2);border-radius:999px;height:12px;min-width:70px;overflow:hidden;"><div style="width:${pct}%;height:100%;border-radius:999px;background:${isPeak?'linear-gradient(90deg,#f59e0b,#f97316)':'linear-gradient(90deg,color-mix(in srgb,#f97316 45%,transparent),#f97316)'};"></div></div></td></tr>`;
    }).join('') + '</tbody></table></div>';

  // Kapatılan Hesaplar listesi saat/masa/ödeme biçimine göre filtrelenebilir -
  // filtre seçenekleri o tarih aralığında GERÇEKTEN görülen değerlerden
  // türetilir (boş/alakasız seçenek çıkmasın diye).
  if(!APP.reportBillsFilter) APP.reportBillsFilter = { hour:'', table:'', method:'', source:'' };
  if(APP.reportBillsFilter.source==null) APP.reportBillsFilter.source = '';
  const bf = APP.reportBillsFilter;
  const billLabel = (o) => (o.source && o.source !== 'qr' ? '🌐 Online' : o.kind==='takeaway' ? '📦 Paket' : (o.table_name||'-'));
  const billTableOptions = [...new Set(billHist.map(billLabel))].sort();
  const billHourOptions = [...new Set(billHist.map(o => new Date(o.closed_at).getHours()))].sort((a,b)=>a-b);
  const METHOD_LABELS = { cash:'💵 Nakit', card:'💳 Kredi Kartı', gift_card:'🎁 Hediye Kartı', split:'➗ Bölünmüş', transfer:'🏦 Havale/EFT', open_account:'📒 Açık Hesap', comp:'🎁 İkram', points:'⭐ Puan' };
  const billMethodOptions = [...new Set(billHist.map(o => o.payment_method))].filter(Boolean).sort();

  // Hesabın kaynağı: rezervasyondan / bekleme listesinden oturtulan masa,
  // doğrudan gelen (rezervasyonsuz) masa ya da paket.
  const billSource = (o) => o.source && o.source !== 'qr' ? 'online' : o.from_reservation ? 'resv' : o.from_waitlist ? 'waitlist' : o.kind==='takeaway' ? 'takeaway' : 'walkin';
  const SOURCE_LABELS = { online:'🌐 Online Sipariş', resv:'📅 Rezervasyonlu', waitlist:'⏳ Bekleme Listesi', walkin:'🚶 Rezervasyonsuz Masa', takeaway:'📦 Paket' };
  const billSourceCounts = {}; billHist.forEach(o => { const k = billSource(o); billSourceCounts[k] = (billSourceCounts[k]||0) + 1; });
  const filteredBills = billHist.filter(o => {
    if(bf.hour!=='' && new Date(o.closed_at).getHours()!==Number(bf.hour)) return false;
    if(bf.table && billLabel(o)!==bf.table) return false;
    if(bf.method && o.payment_method!==bf.method) return false;
    if(bf.source && billSource(o)!==bf.source) return false;
    return true;
  });
  const billsFilterActive = bf.hour!=='' || bf.table!=='' || bf.method!=='' || bf.source!=='';

  const billRowHtml = (o) => {
    const t = new Date(o.closed_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
    const giftTxt = (o.payment_method!=='gift_card' && Number(o.gift_card_amount||0)>0) ? (' + 🎁 '+money(o.gift_card_amount)) : '';
    const methodLabel = o.payment_method==='split'
      ? ('Bölünmüş (💵 '+money(o.cash_amount||0)+' + 💳 '+money(o.card_amount||0)+giftTxt+')')
      : ((METHOD_LABELS[o.payment_method] || o.payment_method) + (o.payment_method === 'transfer' && o.transfer_bank ? ' · ' + escapeHtml(o.transfer_bank) : '') + giftTxt);
    const discTxt = o.discount_amount>0 ? ('-'+money(o.discount_amount)) : '-';
    const tagBadge = (o.tags && o.tags.length>0)
      ? ` <span style="background:rgba(234,179,8,.15);color:#eab308;border-radius:6px;padding:2px 6px;font-size:11px;font-weight:700;">${o.tags.map(x=>escapeHtml(x)).join(', ')}</span>`
      : '';
    const srcBadge = (o.source && o.source !== 'qr')
      ? ` <span style="background:rgba(16,185,129,.15);color:#10b981;border-radius:6px;padding:2px 6px;font-size:11px;font-weight:700;">🌐 ${o.source === 'online' ? 'Online Sipariş' : escapeHtml(o.source)}</span>`
      : o.from_reservation
      ? ' <span style="background:rgba(59,130,246,.15);color:#3b82f6;border-radius:6px;padding:2px 6px;font-size:11px;font-weight:700;">📅 Rezervasyonlu</span>'
      : o.from_waitlist
      ? ' <span style="background:rgba(168,85,247,.15);color:#a855f7;border-radius:6px;padding:2px 6px;font-size:11px;font-weight:700;">⏳ Bekleme Listesi</span>'
      : '';
    const hmS = (x) => x ? new Date(x).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '—';
    const mins = (a, b) => (a && b) ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null;
    const prep = mins(o.ordered_at, o.ready_at), stay = mins(o.ordered_at, o.closed_at);
    // Tarih = hesabın ödendiği (kapandığı) gün; sipariş başka bir gün verildiyse sipariş saatinin yanında o gün de yazılır.
    const dOpt = { day:'numeric', month:'short' };
    const dS = new Date(o.closed_at).toLocaleDateString('tr-TR', { ...dOpt, year:'numeric' });
    const oD = o.ordered_at ? new Date(o.ordered_at).toLocaleDateString('tr-TR', { ...dOpt, year:'numeric' }) : '—';
    // Tarih ve saat tek hücrede (tablo yatay kaymasın); aynı gün ise tarih yalnızca ödeme hücresinde.
    const sameDay = oD === dS;
    return `<tr><td class="u-nw">${hmS(o.ordered_at)}${sameDay ? '' : `<div class="u-fs11 muted">${oD}</div>`}</td>
      <td class="u-nw">${hmS(o.ready_at)}${prep!=null ? `<div class="u-fs11 muted">${prep} dk</div>` : ''}</td>
      <td class="u-nw">${t}${stay!=null ? ` <span class="u-fs11 muted">(${stay} dk)</span>` : ''}<div class="u-fs11 muted">${dS}</div></td>
      <td class="col-name">${escapeHtml(billLabel(o))}${srcBadge}${tagBadge}</td>
      <td>${(o.waiters || o.order_taken_by_name) ? escapeHtml(o.waiters || o.order_taken_by_name) : '<span class="muted">—</span>'}${o.customer_name ? `<div class="u-fs12">${o.customer_id ? '⭐ ' : '👤 '}${escapeHtml(o.customer_name)}</div>${o.customer_phone ? `<div class="u-fs11 muted">${escapeHtml(o.customer_phone)}</div>` : ''}` : ''}</td>
      <td class="u-nw"><b>${money(o.total)}</b>${o.discount_amount>0 ? `<div style="font-size:11px;color:var(--red);">${discTxt}</div>` : ''}${Number(o.points_amount) > 0 ? `<div style="font-size:11px;color:#f59e0b;">⭐ ${money(o.points_amount)} puan</div>` : ''}</td>
      <td class="u-fs13">${methodLabel}</td>
      <td><button type="button" class="sbtn" style="width:auto;margin:0;padding:6px 10px;" title="Detay" ${act('openSaleDetailModal', o.id)}>🔍</button></td></tr>`;
  };
  const billsHtml = billHist.length===0 ? '<p class="muted">Bu tarihte kapatılmış hesap yok.</p>'
    : filteredBills.length===0 ? '<p class="muted">Bu filtrede kapatılmış hesap yok.</p>'
    : `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Sipariş</th><th>Hazır</th><th>Ödeme</th><th>Masa</th><th>Garson / Müşteri</th><th>Tutar</th><th>Yöntem</th><th></th></tr></thead><tbody>` +
      filteredBills.map(billRowHtml).join('') + '</tbody></table></div>';
  // Ortalama süreler: sipariş → hazır (mutfak) ve sipariş → ödeme (masada kalış).
  const avgMin = (arr) => arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : null;
  const prepArr = filteredBills.filter(o => o.ordered_at && o.ready_at).map(o => (new Date(o.ready_at) - new Date(o.ordered_at)) / 60000);
  const stayArr = filteredBills.filter(o => o.ordered_at && o.closed_at).map(o => (new Date(o.closed_at) - new Date(o.ordered_at)) / 60000);
  const timingHtml = (prepArr.length || stayArr.length) ? `<p class="muted" style="text-align:left;margin:0 0 10px;font-size:13px;">⏱ Ort. hazırlanma: <b>${avgMin(prepArr) ?? '—'} dk</b> · Ort. sipariş → ödeme: <b>${avgMin(stayArr) ?? '—'} dk</b></p>` : '';

  el.innerHTML = `
    <div class="fs-hero">
      <div class="fs-hero-main">
        <div class="fs-cap">💰 Toplam Ciro</div>
        <div class="fs-big">${money(totalRevenue)}</div>
        <div class="fs-line">${hist.length} kapatılan hesap${hist.length ? ' · ortalama '+money(totalRevenue/Math.max(1,untaggedHist.length)) : ''}${(() => { const gh = untaggedHist.filter(o => Number(o.guest_count) > 0), g = gh.reduce((t, o) => t + Number(o.guest_count), 0); return g ? ` · 👥 ${g} kişi · kişi başı ${money(gh.reduce((t, o) => t + Number(o.total || 0), 0) / g)}` : ''; })()}</div>
        <div id="fsTrend" class="fs-trend"></div>
      </div>
      <div id="fsGoal" class="fs-goal"></div>
      <div class="fs-hero-side">
        <div class="fs-k" style="--k:${profit<0?'var(--red)':'var(--green)'};"><div class="fs-cap">📈 Net Kâr</div><div class="fs-mid">${money(profit)}</div><div class="fs-line">${totalRevenue ? 'Marj %'+Math.round(profit/totalRevenue*100) : '—'}</div></div>
        <div class="fs-k" style="--k:#f59e0b;"><div class="fs-cap">🧮 Maliyet</div><div class="fs-mid">${money(totalCost)}</div><div class="fs-line">${totalRevenue ? '%'+Math.round(totalCost/totalRevenue*100)+' ciro' : '—'}</div></div>
        <div class="fs-k fs-click" style="--k:var(--red);" ${act('setReportTab','waste')} title="İsraf detayı"><div class="fs-cap">🔥 İsraf</div><div class="fs-mid">${money(wasteCost)}</div><div class="fs-line">Detay ›</div></div>
      </div>
    </div>
    <div class="fs-panels">
      <div class="fs-panel" style="--t:var(--accent);"><h3><i>💳</i>Ödeme Dağılımı</h3>
        <div class="gx-rings">${[['💵','Nakit',totalCash,'#22c55e'],['💳','Kart',totalCard,'var(--accent)'],['🏦','Havale',totalTransfer,'#6366f1'],['📒','Açık hesap',totalOpenAcc,'#f59e0b'],['🎁','Hediye',totalGiftCard,'var(--gift,#a855f7)']].map(([ic, l, v, c], i) => { const pc = totalRevenue ? Math.round(v / totalRevenue * 100) : 0;
          return `<div class="gx-ring" style="--p:${pc};--c:${c};--i:${i};"><div class="gx-ring-c"><span>${ic}</span><b>%${pc}</b></div><small>${l}</small><em>${money(v)}</em></div>`; }).join('')}</div>
        ${Object.keys(byBank).length ? `<div class="gx-banks">${Object.entries(byBank).map(([k, v]) => `<div><span>🏦 ${escapeHtml(k)}</span><b>${money(v)}</b></div>`).join('')}</div>` : ''}
        ${openAccCount ? `<div class="gx-foot"><span>📒 Açık hesaba yazılan</span><b>${openAccCount} hesap · ${money(totalOpenAcc)}</b></div>` : ''}
        <div class="gx-foot"><span>💸 Bahşiş</span><b>${money(totalTip)}</b></div>
      </div>
      <div class="fs-panel" style="--t:#a78bfa;"><h3><i>🍽️</i>Servis</h3><div id="serviceMetrics"><p class="u-fs13 muted">Yükleniyor…</p></div></div>
      <div class="fs-panel" style="--t:#f59e0b;"><h3><i>🏷️</i>İndirim, Puan ve İkram</h3>
        ${(() => { const it = [['🏷️','İndirim',totalDiscount,discountedCount,'#f59e0b','discount'],['⭐','Puanla ödeme',totalPoints,pointsCount,'#eab308','points'],['🎂','Doğum günü',totalBirthdayDiscount,birthdayCount,'#ec4899','birthday'],['🍱','Personel / ikram',taggedTotal,taggedHist.length,'#14b8a6','comp']];
          const mx = Math.max(1, ...it.map(x => x[2]));
          return `<div class="gx-hbars">${it.map(([ic, l, v, n, c, k], i) => `<div class="gx-hb" style="--i:${i};--c:${c};"><div class="gx-hb-l"><span>${ic} ${l}</span><b>${money(v)}</b></div>
            <div class="gx-hb-t"><i style="width:${v ? Math.max(4, v / mx * 100) : 0}%;"></i></div>${n ? `<button type="button" class="fs-billlink" ${act('openFsBillList', k)}>${n} hesap · gör ›</button>` : '<small>0 hesap</small>'}</div>`).join('')}</div>`; })()}
        <p class="fs-note">Personel / ikram hesapları ciroya dahil değildir.</p>
      </div>
    </div>
    <div class="fs-panel pa-sec" id="fsAllowance" style="--t:#14b8a6;display:none;"></div>
    <div class="ch-row">
      <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>📊</i>Saatlik Ciro${peakHour!==null?' <span class="muted" style="font-size:12px;font-weight:400;">en yoğun: '+(peakHour<10?'0'+peakHour:peakHour)+':00</span>':''}</h3>
        ${(() => { if(!hourKeys.length) return '<p class="muted">Bu tarihte veri yok.</p>'; const lo = Math.min(...hourKeys), hi = Math.max(...hourKeys); const hrs = []; for(let h = lo; h <= hi; h++) hrs.push(h);
          return svgBarChart(hrs.map(h => { const st = hourStats[h] || { revenue:0, count:0 }; return { label: (h<10?'0'+h:h)+':00', value: st.revenue, display: money(st.revenue) + ' · ' + st.count + ' sipariş' }; }), { title:'Saatlik ciro' }); })()}</div>
      <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🍩</i>Ödeme Türleri</h3>
        ${svgDonut([{ label:'Nakit', value: totalCash, color:'var(--c1)' }, { label:'Kart', value: totalCard, color:'var(--c2)' }, { label:'Havale / EFT', value: totalTransfer, color:'#6366f1' }, { label:'Açık hesap', value: totalOpenAcc, color:'#f59e0b' }, { label:'Hediye Kartı', value: totalGiftCard, color:'var(--c3)' }].filter(x => x.value > 0 || ['Nakit','Kart'].includes(x.label)), { center: shortMoney(totalCash+totalCard+totalTransfer+totalOpenAcc+totalGiftCard), sub:'₺ toplam', title:'Ödeme türleri', money:true })}</div>
    </div>
    ${heatmapHtml(untaggedHist)}
    <details class="fs-panel pa-sec" style="--t:#f97316;"><summary style="cursor:pointer;"><h3 style="display:inline-flex;margin:0;"><i>⏰</i>Saatlik Yoğunluk Tablosu</h3></summary>${hourlyHtml}</details>
    <div class="fs-panel pa-sec" style="--t:#a78bfa;"><h3><i>👤</i>Personel Performansı</h3>${staffRowsHtml}</div>
    <div class="fs-panel pa-sec" style="--t:var(--green);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px;">
        <h3 class="u-m0"><i>🧾</i>Kapatılan Hesaplar</h3>
        <span class="u-fs12 muted">${billsFilterActive ? (filteredBills.length+' / '+billHist.length+' hesap') : (billHist.length+' hesap')}</span>
      </div>
      <div class="bill-dates">
        <span>📅 Liste tarihi</span>
        <input type="date" value="${escapeAttr(APP.billDate || '')}" ${actOn('change','setBillDate',['from','$value'])}>
        <span>–</span>
        <input type="date" value="${escapeAttr(APP.billDateTo || '')}" ${actOn('change','setBillDate',['to','$value'])}>
        ${APP.billDate ? `<button type="button" class="u-wa-m0 sbtn" ${act('setBillDate','clear','')}>✕ Üstteki tarihe dön</button><small class="muted">Bu liste kendi tarihinden besleniyor</small>` : `<small class="muted">Boşsa üstteki tarih aralığı kullanılır</small>`}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
        <select id="billHourFilter" style="width:auto;margin:0;padding:8px 12px;" ${actOn('change','setReportBillsFilter',['hour','$value'])}>
          <option value="">Tüm Saatler</option>
          ${billHourOptions.map(h => `<option value="${h}" ${bf.hour===String(h)?'selected':''}>${h<10?'0'+h:h}:00</option>`).join('')}
        </select>
        <select id="billTableFilter" style="width:auto;margin:0;padding:8px 12px;" ${actOn('change','setReportBillsFilter',['table','$value'])}>
          <option value="">Tüm Masalar</option>
          ${billTableOptions.map(tb => `<option value="${escapeAttr(tb)}" ${bf.table===tb?'selected':''}>${escapeHtml(tb)}</option>`).join('')}
        </select>
        <select id="billMethodFilter" style="width:auto;margin:0;padding:8px 12px;" ${actOn('change','setReportBillsFilter',['method','$value'])}>
          <option value="">Tüm Ödeme Biçimleri</option>
          ${billMethodOptions.map(m => `<option value="${m}" ${bf.method===m?'selected':''}>${METHOD_LABELS[m]||m}</option>`).join('')}
        </select>
        <select id="billSourceFilter" style="width:auto;margin:0;padding:8px 12px;" ${actOn('change','setReportBillsFilter',['source','$value'])}>
          <option value="">Tüm Kaynaklar</option>
          ${Object.keys(SOURCE_LABELS).map(k => `<option value="${k}" ${bf.source===k?'selected':''}>${SOURCE_LABELS[k]} (${billSourceCounts[k]||0})</option>`).join('')}
        </select>
        ${billsFilterActive ? `<button type="button" class="u-wa-m0 sbtn" ${act('resetReportBillsFilter')}>✕ Filtreleri Temizle</button>` : ''}
      </div>
      ${timingHtml}${billsHtml}
    </div>
  `;
  // Servis metrikleri (ortalama hesap, masa devir hızı, oturma süresi) ayrı
  // RPC'den gelir ve kart ızgarasının hemen altına eklenir.
  const box = el.querySelector('#serviceMetrics');
  if(box){
    sb.rpc('get_service_metrics', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }).then(({ data: m }) => {
      if(!document.getElementById('serviceMetrics')) return;
      if(!m){ box.innerHTML = '<p class="muted">Servis metrikleri yüklenemedi.</p>'; return; }
      box.innerHTML = `<div class="gx-tiles">${[['🧾','Ortalama hesap',money(m.avg_check),m.checks+' hesap'],['🪑','Ort. masa hesabı',money(m.avg_check_dine_in),m.dine_in_checks+' hesap'],
        ['📦','Ort. paket hesabı',money(m.avg_check_takeaway),''],['🔄','Masa devir hızı',m.table_count ? String(m.table_turnover).replace('.',',')+'×' : '—',m.table_count+' masa'],
        ['⏱','Ort. oturma',m.avg_seat_minutes ? m.avg_seat_minutes+' dk' : '—','']].map(([ic, l, v, sub], i) => `<div class="gx-tile" style="--i:${i};"><span>${ic}</span><b>${v}</b><small>${l}${sub ? ' · ' + sub : ''}</small></div>`).join('')}</div>`;
    });
  }
  loadFsExtras(session, totalRevenue);
  loadFsAllowance(session);
}
/* Limitli hesaplar: dönemde limitten karşılanan tutar ve limit aşımında tahsil edilen fark. Kayıt yoksa panel gizli kalır. */
async function loadFsAllowance(session){
  const { data: d } = await sb.rpc('allowance_report', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo });
  const box = document.getElementById('fsAllowance'); if(!box || !d || !(d.rows || []).length) return;
  const COL = ['#14b8a6', '#6366f1', '#f59e0b', '#ec4899', '#22c55e', '#0ea5e9', '#a855f7', '#ef4444'];
  const used = Number(d.total_used), rem = d.rows.reduce((x, r) => x + Number(r.remaining || 0), 0);
  const pct = used + rem ? Math.round(used / (used + rem) * 100) : 0;
  box.style.display = '';
  box.innerHTML = `<h3><i>💳</i>Limitli Hesaplar <small class="muted" style="font-weight:500;font-size:12px;">· ${escapeHtml(reportDateRangeLabel())}</small></h3>
    <div class="lx-top">
      <div class="lx-gauge">${svgGauge(pct, '#14b8a6', '%' + pct, 'limit kullanımı')}
        <div class="lx-g-leg"><span><i style="background:#14b8a6"></i>Harcanan ${money(used)}</span><span><i style="background:color-mix(in srgb,var(--muted) 35%,transparent)"></i>Kalan ${money(rem)}</span></div></div>
      <div class="lx-kpis">
        ${[['🍱', 'Limitten karşılanan', money(used), '#14b8a6'], ['💵', 'Limit aşımı · tahsil', money(d.paid_diff), '#f59e0b'], ['🧾', 'Hesap', d.orders, '#6366f1'], ['👥', 'Kişi / kullanıcı', d.rows.length, '#ec4899']]
          .map(([ic, l, v, c], i) => `<div class="lx-k" style="--c:${c};--i:${i};"><span>${ic}</span><b>${v}</b><small>${l}</small></div>`).join('')}
      </div>
      <div class="lx-donut">${svgDonut(d.rows.slice(0, 8).map((r, i) => ({ label: r.name, value: Number(r.used), color: COL[i % COL.length] })), { center: shortMoney(used), sub: '₺ limitten', money: true })}</div>
    </div>
    <div class="lx-cards">${d.rows.map((r, i) => { const cap = Number(r.used) + Number(r.remaining || 0); const p = cap ? Math.round(Number(r.used) / cap * 100) : 0;
      return `<div class="lx-card" style="--c:${COL[i % COL.length]};--p:${p};--i:${Math.min(i, 10)};">
        <div class="lx-ring"><span>${r.kind === 'person' ? '🎓' : '👔'}</span></div>
        <div class="lx-c-main"><b>${escapeHtml(r.name || '')}</b><small>${r.kind === 'person' ? 'Günlük' : r.period === 'monthly' ? 'Aylık' : 'Günlük ↻'}${r.flag_label ? ' · 🏷️ ' + escapeHtml(r.flag_label) : ''} · ${r.n} hesap</small>
          <div class="lx-c-bar"><i style="width:${p}%;"></i></div>
          <div class="lx-c-nums"><span><b>${money(r.used)}</b> harcadı</span><span>${money(r.remaining)} kaldı</span></div>
          ${Number(r.paid_diff) > 0 ? `<em class="lx-diff">+${money(r.paid_diff)} fark tahsil edildi</em>` : ''}</div></div>`; }).join('')}</div>
    <p class="fs-note">Limitten karşılanan tutar ciroya dahil değildir (Personel / ikram içinde sayılır); limit aşımında alınan fark ciroya dahildir.</p>`;
}
/* Yarım daire gösterge: pct 0-100. */
function svgGauge(pct, color, center, sub){
  const r = 70, c = Math.PI * r, v = Math.max(0, Math.min(100, pct)) / 100 * c;
  return `<svg class="lx-svg" viewBox="0 0 180 110" role="img" aria-label="${escapeAttr(sub + ' ' + center)}">
    <path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke="color-mix(in srgb,var(--muted) 22%,transparent)" stroke-width="16" stroke-linecap="round"/>
    <path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${v} ${c}" class="lx-arc" style="--len:${c};"/>
    <text x="90" y="82" text-anchor="middle" class="lx-gt">${escapeHtml(center)}</text><text x="90" y="102" text-anchor="middle" class="lx-gs">${escapeHtml(sub)}</text></svg>`;
}
/* --- Ürün İstatistikleri sekmesi: hangi üründen ne kadar satıldığı,
   istasyona göre filtrelenebilen, çoktan aza sıralı bar grafiği --- */
async function renderProductStatsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_product_sales', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const rows = data || [];
  const stations = (APP.config && APP.config.stations) || [];
  if(!APP.productStatsSort) APP.productStatsSort = 'revenue';
  if(APP.productStatsStation===undefined) APP.productStatsStation = '';

  const filtered = APP.productStatsStation ? rows.filter(r => r.station_id===APP.productStatsStation) : rows;
  const sorted = filtered.slice().sort((a,b) => APP.productStatsSort==='qty' ? b.qty-a.qty : Number(b.revenue)-Number(a.revenue));
  const totalQty = filtered.reduce((s,r) => s+r.qty, 0);
  const totalRev = filtered.reduce((s,r) => s+Number(r.revenue), 0);
  const maxVal = sorted.length ? (APP.productStatsSort==='qty' ? sorted[0].qty : Number(sorted[0].revenue)) : 0;
  const top = sorted[0];

  const barsHtml = sorted.length===0 ? '<p class="muted">Bu tarihte / bu filtrede satış yok.</p>' : `<div class="race">${sorted.slice(0, APP.productStatsAll ? 999 : 10).map((r, idx) => {
    const val = APP.productStatsSort==='qty' ? r.qty : Number(r.revenue);
    const pct = maxVal ? Math.max(3, Math.round(val/maxVal*100)) : 0;
    const medal = ['🥇','🥈','🥉'][idx] || (idx+1);
    return `<div class="race-row" style="--i:${Math.min(idx,15)};--sc:${RACE_COLORS[idx%RACE_COLORS.length]};">
      <span class="race-rank ${idx<3?'top':''}">${medal}</span>
      <div class="race-main"><div class="race-label"><b>${escapeHtml(r.name)}</b>${r.station_name ? `<small>${escapeHtml(r.station_name)}</small>` : ''}</div>
        <div class="race-track"><div class="race-bar" style="width:${pct}%;"><span>${APP.productStatsSort==='qty' ? r.qty+' adet' : money(r.revenue)}</span></div></div></div>
      <span class="race-side">${APP.productStatsSort==='qty' ? money(r.revenue) : r.qty+' adet'}<small>${totalRev ? '%'+Math.round(Number(r.revenue)/totalRev*100)+' ciro' : ''}</small>${r.tagged_qty ? `<small class="ps-tag" title="Personel / ikram / limitli hesap etiketli siparişler: ciroya ve kâr analizine katılmaz">🏷️ +${r.tagged_qty} etiketli · maliyet ${money(r.tagged_cost)} (hariç)</small>` : ''}</span>
    </div>`; }).join('')}</div>${sorted.length > 10 ? `<button type="button" class="pc-btn" style="margin-top:10px;" ${act('setProductStatsOpt', 'productStatsAll', !APP.productStatsAll)}>${APP.productStatsAll ? 'İlk 10\'u göster' : 'Tümünü göster ('+sorted.length+')'}</button>` : ''}`;

  el.innerHTML = `
    ${statChips([['🍽️', filtered.length, 'Satılan ürün çeşidi', 'var(--c1)'], ['📦', totalQty, 'Toplam adet', 'var(--c2)'], ['💰', money(totalRev), 'Toplam ciro', 'var(--c3)'], ['🏆', top ? escapeHtml(top.name) : '-', 'En çok satan', 'var(--c4)']])}
    ${tagCompareHtml(filtered.map(r => ({ qty: r.qty, rev: r.revenue, cost: r.cost, t_qty: r.tagged_qty, t_rev: r.tagged_revenue, t_cost: r.tagged_cost })))}
    <div class="u-mwn box">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <h2 class="u-m0">Ürün Satışları</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <select id="psStationFilter" style="width:auto;margin:0;padding:8px 12px;" ${actOn('change','setProductStatsOpt',['productStatsStation','$value'])}>
            <option value="">Tüm İstasyonlar</option>
            ${stations.map(s => `<option value="${s.id}" ${APP.productStatsStation===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
          <select id="psSortBy" style="width:auto;margin:0;padding:8px 12px;" ${actOn('change','setProductStatsOpt',['productStatsSort','$value'])}>
            <option value="revenue" ${APP.productStatsSort==='revenue'?'selected':''}>Ciroya Göre Sırala</option>
            <option value="qty" ${APP.productStatsSort==='qty'?'selected':''}>Adete Göre Sırala</option>
          </select>
        </div>
      </div>
      ${barsHtml}
    </div>
    <div id="psIngWrap"><p class="muted">Hammadde analizi yükleniyor…</p></div>
  `;
  loadIngredientUsage(session);
}
/* Ürün İstatistikleri › hammadde bazlı tüketim (net + fire), reçetesiz ve maliyetsiz ürünler. */
async function loadIngredientUsage(session){
  const box = document.getElementById('psIngWrap'); if(!box) return;
  let { data, error } = await sb.rpc('get_ingredient_usage_report', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo });
  if(error){ box.innerHTML = '<p class="muted">Hammadde analizi yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  data = data || {}; APP.ingUsage = data;
  const ings = data.ingredients || [], noRec = data.no_recipe || [], noCost = data.no_cost || [];
  const fmt = (v, u) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 3 }) + ' ' + escapeHtml(u || '');
  const mx = Math.max(1, ...ings.map(i => Number(i.gross)));
  const totFire = ings.filter(i => Number(i.waste_pct) > 0).length;
  box.innerHTML = `<div class="fs-panel pa-sec rp-panel" style="--t:var(--c2);margin-top:14px;"><h3><i>🥕</i>Hammadde Tüketimi <span class="muted" style="font-size:12px;font-weight:400;">satılan ürünlerin reçetesine göre · stoktan düşen = net + fire</span></h3>
      ${ings.length ? `<div class="iu-rep">${ings.map((i, n) => { const net = Number(i.net), gross = Number(i.gross), fire = gross - net;
        return `<details class="iu-r" style="--i:${Math.min(n, 12)};"><summary>
          <div class="iu-r-top"><b>${escapeHtml(i.name)}</b><span>${fmt(gross, i.unit)}</span></div>
          <div class="iu-r-bar"><i class="net" style="width:${net / mx * 100}%;"></i><i class="fire" style="width:${fire / mx * 100}%;"></i></div>
          <small>Net ${fmt(net, i.unit)}${fire > 0 ? ` · 🔥 fire ${fmt(fire, i.unit)} (%${Number(i.waste_pct)})` : ''} · ${i.products} üründe · kalan stok ${fmt(i.stock, i.unit)}</small></summary>
          <table class="settings-table iu-r-t"><thead><tr><th>Ürün</th><th>Satış</th><th>Net tüketim</th></tr></thead><tbody>${(i.by_product || []).map(b => `<tr><td>${escapeHtml(b.name)}</td><td>${b.qty} adet</td><td>${fmt(b.net, i.unit)}</td></tr>`).join('')}</tbody></table></details>`; }).join('')}</div>
        <div class="an-heatleg" style="margin-top:8px;"><span><i class="iu-lg net"></i> Net tüketim</span><span><i class="iu-lg fire"></i> Fire</span></div>`
      : '<p class="muted">Bu aralıkta reçeteli ürün satışı yok. Ürünlere reçete girildikçe burada kg / adet bazında tüketim ve fire görünür.</p>'}
    </div>
    <div class="ps-miss">
      <div class="fs-panel pa-sec" style="--t:#f59e0b;"><h3><i>📋</i>Reçetesi olmayan ürünler <em class="ps-n">${noRec.length}</em></h3>
        ${noRec.length ? `<div class="ps-chips">${noRec.map(p => `<button type="button" class="pchip" ${act('openRecipeModal', p.id)} title="Reçete gir">${escapeHtml(p.name)} ›</button>`).join('')}</div><p class="fs-note">Reçetesiz ürünlerde hammadde stoğu düşmez ve tüketim hesaplanmaz.</p>` : '<p class="muted">Tüm ürünlerin reçetesi var ✓</p>'}</div>
      <div class="fs-panel pa-sec" style="--t:#ef4444;"><h3><i>💸</i>Maliyeti girilmemiş ürünler <em class="ps-n">${noCost.length}</em></h3>
        ${noCost.length ? `<div class="ps-chips">${noCost.map(p => `<button type="button" class="pchip ${p.available === false ? 'off' : ''}" ${act('editProductRow', p.id)} title="Maliyet gir">${escapeHtml(p.name)}${p.available === false ? ' · kapalı' : ''} ›</button>`).join('')}</div><p class="fs-note">Maliyeti olmayan ürünlerde kâr %100 görünür; kâr analizleri yanıltıcı olur.</p>` : '<p class="muted">Tüm ürünlerin maliyeti girilmiş ✓</p>'}</div>
    </div>`;
}

/* --- Personel Analizleri sekmesi: hangi personel hangi saatte kaç sipariş
   aldı / kaç ödeme aldı - masa siparişleri ile ödemeler ayrı tablolarda --- */
function buildHourlyPivotTable(rows){
  const staffSet = new Set(); const hourSet = new Set();
  rows.forEach(r => { staffSet.add(r.staff_name); hourSet.add(r.hour); });
  const staffNames = [...staffSet].sort((a,b) => a.localeCompare(b,'tr'));
  const hours = [...hourSet].sort((a,b) => a-b);
  if(staffNames.length===0) return '<p class="muted">Bu tarihte veri yok.</p>';
  const lookup = {};
  rows.forEach(r => { lookup[r.staff_name+'_'+r.hour] = r.count; });
  const totalsByStaff = {}; staffNames.forEach(n => totalsByStaff[n]=0);
  const totalsByHour = {}; hours.forEach(h => totalsByHour[h]=0);
  let grandTotal = 0;
  rows.forEach(r => { totalsByStaff[r.staff_name]+=r.count; totalsByHour[r.hour]+=r.count; grandTotal+=r.count; });
  const hourLabel = h => (h<10?'0'+h:h)+':00-'+((h+1)%24<10?'0'+((h+1)%24):(h+1)%24)+':00';
  const max = Math.max(1, ...rows.map(r => r.count)), maxTot = Math.max(1, ...Object.values(totalsByStaff));
  const lo = Math.min(...hours), hi = Math.max(...hours), hrs = []; for(let h = lo; h <= hi; h++) hrs.push(h);
  return `<div class="hm st-hm" style="--cols:${hrs.length};grid-template-columns:150px repeat(var(--cols),minmax(26px,1fr)) 70px;">
      <span></span>${hrs.map(h => `<span class="hm-h">${String(h).padStart(2,'0')}</span>`).join('')}<span class="hm-h">Toplam</span>
      ${staffNames.slice().sort((x, y) => totalsByStaff[y] - totalsByStaff[x]).map((name, ri) => `<span class="st-who">${avatarHtml(name)}<b>${escapeHtml(name)}</b></span>${hrs.map((h, ci) => { const v = lookup[name+'_'+h]||0;
        return `<span class="hm-c st-c ${ri===0?'hm-top':''}" tabindex="0" style="--v:${(v/max).toFixed(3)};--i:${ri*hrs.length+ci};">${v ? `<i>${v}</i><em>${escapeHtml(name)} · ${hourLabel(h)}<br><b>${v}</b></em>` : ''}</span>`; }).join('')}
        <span class="st-tot"><b>${totalsByStaff[name]}</b><span class="st-tbar"><i style="width:${Math.round(totalsByStaff[name]/maxTot*100)}%;"></i></span></span>`).join('')}
      <span class="st-who"><b>Toplam</b></span>${hrs.map(h => `<span class="st-sum">${totalsByHour[h]||'·'}</span>`).join('')}<span class="st-tot"><b>${grandTotal}</b></span>
    </div>`;
}
async function renderStaffAnalyticsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_staff_hourly_stats', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const ordersByHour = (data && data.orders_by_hour) || [];
  const paymentsByHour = (data && data.payments_by_hour) || [];
  const sum = (arr) => arr.reduce((t, r) => t + (Number(r.count)||0), 0);
  const top = (arr) => { const m = {}; arr.forEach(r => { m[r.staff_name] = (m[r.staff_name]||0) + r.count; }); const e = Object.entries(m).sort((x, y) => y[1]-x[1])[0]; return e ? e[0] + ' (' + e[1] + ')' : '—'; };
  const peak = (arr) => { const m = {}; arr.forEach(r => { m[r.hour] = (m[r.hour]||0) + r.count; }); const e = Object.entries(m).sort((x, y) => y[1]-x[1])[0]; return e ? String(e[0]).padStart(2,'0') + ':00' : '—'; };
  el.innerHTML = statChips([['🍽️', sum(ordersByHour), 'Alınan sipariş', 'var(--c1)'], ['💳', sum(paymentsByHour), 'Alınan ödeme', 'var(--c2)'],
      ['🏆', escapeHtml(top(ordersByHour)), 'En çok sipariş alan', 'var(--c3)'], ['⏰', peak(ordersByHour), 'En yoğun saat', 'var(--c4)']]) + `
    <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>🍽️</i>Saatlik Sipariş Alma <span class="muted" style="font-size:12px;font-weight:400;">kim hangi saatte kaç sipariş aldı · koyu = çok</span></h3>
      ${buildHourlyPivotTable(ordersByHour)}</div>
    <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>💳</i>Saatlik Alınan Ödeme <span class="muted" style="font-size:12px;font-weight:400;">kim hangi saatte kaç hesap kapattı</span></h3>
      ${buildHourlyPivotTable(paymentsByHour)}</div>
  `;
}

/* --- Müşteri Analizleri sekmesi: Müşteriler'deki analiz özellikleri
   (arama, toplam harcama, son ziyaret, doğum günü, ziyaret sayısı) burada --- */
async function renderCustomerAnalyticsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_customer_analytics', { p_token: session.session_token, p_search: APP.customerAnalyticsSearch||null }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const rows = data || [];
  const totalSpent = rows.reduce((s,c) => s+Number(c.total_spent||0), 0);
  const totalVisits = rows.reduce((s,c) => s+Number(c.total_visits||0), 0);
  const avgSpent = rows.length ? totalSpent/rows.length : 0;
  el.innerHTML = `
    <div class="order-summary stat-chips" style="--n:4;"><div class="os-chip" style="--oc:var(--c1);"><span class="os-ic">👥</span><div><b>${rows.length}</b><small>Müşteri</small></div></div><div class="os-chip" style="--oc:var(--c2);"><span class="os-ic">💰</span><div><b>${money(totalSpent)}</b><small>Toplam Harcama</small></div></div><div class="os-chip" style="--oc:var(--c3);"><span class="os-ic">🧮</span><div><b>${money(avgSpent)}</b><small>Ortalama Harcama</small></div></div><div class="os-chip" style="--oc:var(--c4);"><span class="os-ic">🚪</span><div><b>${totalVisits}</b><small>Toplam Ziyaret</small></div></div></div>
    ${rows.length ? `<div class="fs-panel pa-sec" style="--t:var(--c3);"><h3><i>🏆</i>En Değerli Müşteriler</h3>${raceHtml(rows.slice().sort((a,b) => Number(b.total_spent||0) - Number(a.total_spent||0)).slice(0,8).map(c => ({ label:c.name, value:Number(c.total_spent||0), display:money(c.total_spent||0), side:(c.total_visits||0) + ' ziyaret', sub:c.phone ? maskPhone(c.phone) : '' })))}</div>` : ''}
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--c2);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
        <h2 class="u-m0">Müşteri Analizleri</h2>
        <input id="custAnalyticsSearchInput" placeholder="İsim veya telefon ara..." style="max-width:260px;" value="${escapeAttr(APP.customerAnalyticsSearch||'')}" ${actOn('input','debouncedCustomerAnalyticsSearch',['$value'])}>
      </div>
      ${rows.length ? `<div class="an-waiters">${rows.map((c, i) => { const pts = Number(c.points_balance)||0;
        const t = pts >= 1000 ? ['💎', 'Platin', '#a855f7'] : pts >= 500 ? ['🥇', 'Altın', '#f59e0b'] : pts >= 200 ? ['🥈', 'Gümüş', '#94a3b8'] : ['🥉', 'Bronz', '#c2410c'];
        const bd = c.birthday ? crmBirthdayInfo(c.birthday) : null;
        const ago = c.last_visit_at ? Math.round((Date.now() - new Date(c.last_visit_at).getTime()) / 86400000) : null;
        return `<div class="an-w an-click ${i === 0 && !APP.customerAnalyticsSearch ? 'mvp' : ''}" style="--i:${Math.min(i, 12)};" ${act('openCustomerDetail', c.id)}>
          ${bd && bd.days <= 7 ? `<div class="an-w-badge tip">🎂 ${bd.days === 0 ? 'Bugün doğum günü' : bd.days + ' gün sonra doğum günü'}</div>` : (i === 0 && !APP.customerAnalyticsSearch ? '<div class="an-w-badge">👑 En değerli</div>' : '')}
          <div class="an-w-top">${avatarHtml(c.name)}<div><b>${escapeHtml(c.name)}</b><small>${c.phone ? phoneHtml(c.phone) : 'telefon yok'}</small></div><span class="an-tier" style="--t:${t[2]};">${t[0]} ${t[1]}</span></div>
          <div class="an-w-rev"><b>${money(c.total_spent)}</b><small class="muted"> toplam harcama</small></div>
          <div class="an-w-grid"><div><b>${c.total_visits||0}</b><small>ziyaret</small></div><div><b>${money((Number(c.total_visits)||0) ? (Number(c.total_spent)||0) / Number(c.total_visits) : 0)}</b><small>ort. hesap</small></div><div><b>${pts.toLocaleString('tr-TR')}</b><small>puan</small></div>
            <div><b>${c.birthday ? new Date(c.birthday+'T00:00:00').toLocaleDateString('tr-TR', { day:'numeric', month:'short' }) : '—'}</b><small>doğum günü</small></div><div class="${ago != null && ago > 60 ? 'bad' : ''}"><b>${ago == null ? '—' : ago === 0 ? 'bugün' : ago + ' gün'}</b><small>son ziyaret</small></div><div><b>${c.created_at ? new Date(c.created_at).toLocaleDateString('tr-TR', { month:'short', year:'numeric' }) : '—'}</b><small>müşteri olalı</small></div></div>
          <div class="an-w-more">Detaylı kart için dokunun ›</div></div>`; }).join('')}</div>` : '<p class="muted">Müşteri yok.</p>'}
    </div>`;
}
let CUST_ANALYTICS_SEARCH_TIMER = null;
function debouncedCustomerAnalyticsSearch(v){
  APP.customerAnalyticsSearch = v;
  clearTimeout(CUST_ANALYTICS_SEARCH_TIMER);
  CUST_ANALYTICS_SEARCH_TIMER = setTimeout(async () => {
    await renderCustomerAnalyticsContent(getSession());
    const inp = document.getElementById('custAnalyticsSearchInput');
    if(inp){ inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }, 350);
}

/* --- Bahşiş Havuzu sekmesi: toplanan bahşişlerin, o gün vardiyada olan
   personel arasında eşit ya da çalışılan saate göre paylaştırılmasını
   gösterir (bkz. get_tip_pool_report / staff_shifts). Sadece raporlama
   amaçlıdır, gerçek ödeme/dağıtım işletme dışında yapılır. */
async function renderTipPoolContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_tip_pool_report', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const shares = data.shares || [];
  const modeLabel = data.mode==='by_hours' ? 'Çalışılan Saate Göre' : 'Eşit Paylaşım';
  el.innerHTML = `
    ${canManage(session, 'tips') ? `
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--c3);">
      <h2>Bahşiş Havuzu Ayarları</h2>
      <p class="muted" style="margin-top:-6px;">Açarsanız, toplanan tüm bahşişler burada seçtiğiniz kurala göre personel arasında paylaştırılır (sadece raporlama amaçlıdır - ödemeyi yine kendiniz yaparsınız).</p>
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-bottom:10px;">
        <input type="checkbox" id="tipPoolEnabled" ${data.enabled?'checked':''} style="width:auto;"> Bahşiş Havuzu Aktif
      </label>
      <div class="field-group" style="max-width:280px;"><label>Paylaşım Kuralı</label>
        <select id="tipPoolMode">
          <option value="equal" ${data.mode==='equal'?'selected':''}>Eşit Paylaşım</option>
          <option value="by_hours" ${data.mode==='by_hours'?'selected':''}>Çalışılan Saate Göre</option>
        </select>
      </div>
      <button style="margin-top:12px;max-width:220px;" ${act('saveTipPoolSettings')}>${ICON_SAVE}<span>Kaydet</span></button>
    </div>` : ''}
    <div class="order-summary stat-chips" style="--n:2;"><div class="os-chip" style="--oc:var(--c1);"><span class="os-ic">💰</span><div><b>${money(data.total_tip)}</b><small>Toplam Bahşiş</small></div></div><div class="os-chip" style="--oc:var(--c2);"><span class="os-ic">⚖️</span><div><b>${data.enabled ? modeLabel : 'Kapalı'}</b><small>Paylaşım Kuralı</small></div></div></div>
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--c4);">
      <h2>${escapeHtml(reportDateRangeLabel())} Tarihli Paylaşım</h2>
      ${shares.length ? raceHtml(shares.slice().sort((a,b) => Number(b.share_amount) - Number(a.share_amount)).map(x => ({ label:x.username, value:Number(x.share_amount), display:money(x.share_amount), side:formatShiftDuration(x.minutes) }))) : ''}
      ${!data.enabled ? '<p class="muted">Bahşiş havuzu kapalı. Yönetici açarsa burada personel payları görünecek.</p>' : ''}
      <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>Personel</th><th>Çalışma Süresi</th><th>Payı</th></tr></thead>
        <tbody>
        ${shares.map(s => `
          <tr>
            <td class="col-name">${escapeHtml(s.username)}</td>
            <td>${formatShiftDuration(s.minutes)}</td>
            <td>${money(s.share_amount)}</td>
          </tr>`).join('')}
        ${shares.length===0?'<tr><td colspan="3" class="u-tc muted">Bu tarihte vardiya kaydı yok.</td></tr>':''}
        </tbody>
      </table>
      </div>
    </div>`;
}
/* Mutfaktan bildirilen israf (yandı/düştü/bozuldu) kayıtları - bkz.
   report_waste (pos-core.js > openWasteModal/submitWaste). Maliyeti
   (unit_cost*qty) burada toplanıp gösteriliyor ki israfın kâr üzerindeki
   etkisi görünür olsun. */
/* --- Satınalma menüsü (ayrı ekran, izin purchasing_reports): tarih aralığı + alt sekmeler. --- */
async function renderProcurementView(main, session){
  if(!APP.procFrom){ const d = new Date(); d.setDate(d.getDate()-29); APP.procFrom = d.toISOString().slice(0,10); }
  if(!APP.procTo) APP.procTo = todayLocalDateStr();
  main.innerHTML = `<h1>Mal Kabul</h1><p class="muted page-sub">Tedarikçiden sipariş ettiğiniz malzemeler burada. Malzeme restorana gelince <b>📦 Teslim Al</b> deyin, gelen miktar stoğa eklenir. Tedarikçiyi seçin ve birim fiyatı girin. Yeni malzeme siparişi için <b>Malzeme Siparişi Ver</b> menüsü.</p>
    <div class="u-mwn box">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span class="u-nw muted">Tarih Aralığı</span>
        <input type="date" value="${APP.procFrom}" ${actOn('change','setProcDate',['from','$value'])} class="u-wa-m0">
        <span class="muted">–</span>
        <input type="date" value="${APP.procTo}" ${actOn('change','setProcDate',['to','$value'])} class="u-wa-m0">
        <span class="u-f1"></span>
        ${[[7,'Son 7 gün'],[30,'Son 30 gün'],[90,'Son 3 ay'],[365,'Son 1 yıl']].map(([d,l]) => `<button type="button" class="pc-btn" ${act('setProcRange', d)}>${l}</button>`).join('')}
      </div>
    </div>
    <div id="procContent"></div>`;
  applyNavBadges();
  await renderPurchaseReportContent(session);
}
function setProcRange(days){ const d = new Date(); d.setDate(d.getDate()-(days-1)); APP.procFrom = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); APP.procTo = todayLocalDateStr(); renderProcurementView(document.getElementById('main'), getSession()); }
function setProcDate(which, v){ if(!v) return; if(which==='from') APP.procFrom = v; else APP.procTo = v; renderPurchaseReportContent(getSession()); }
/* --- Satınalma: seçilen tarih aralığında Tedarik & Satınalma'dan verilen siparişler
   (bkz. get_purchase_report). Taslak ve iptaller toplamlara katılmaz. --- */

/* --- Ürün Kârlılığı: her ürünün cirosu, malzeme maliyeti (satış anındaki; yoksa güncel maliyet = tahmini),
   genel gider payı (Ayarlar › Ürünler › Maliyet & Giderler) ve net kârı. Satıra tıklayınca birim ekonomisi ve reçete dökümü. */
async function renderProfitContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_product_profit', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  APP.profitData = data || {}; renderProfitView();
}
function setProfitOpt(k, v){ APP[k] = v; renderProfitView(); }
function profitRows(){
  const d = APP.profitData || {}, oh = Number(d.overhead_pct) || 0;
  return (d.rows || []).map(r => {
    const rev = Number(r.revenue) || 0, cost = Number(r.cost) || 0, qty = Number(r.qty) || 0, ohv = rev * oh / 100;
    return Object.assign({}, r, { rev, cost, qty, oh: ohv, gross: rev - cost, net: rev - cost - ohv, gm: rev ? (rev - cost) / rev * 100 : 0, nm: rev ? (rev - cost - ohv) / rev * 100 : 0,
      unitPrice: qty ? rev / qty : 0, unitCost: qty ? cost / qty : 0, est: Number(r.est_qty) || 0, noc: Number(r.nocost_qty) || 0 });
  });
}
function renderProfitView(){
  const el = document.getElementById('reportContent'); if(!el) return;
  const d = APP.profitData || {}, oh = Number(d.overhead_pct) || 0, all = profitRows().filter(r => r.qty > 0);
  const sort = APP.profitSort || 'net', flt = APP.profitFilter || 'all';
  const T = all.reduce((a, r) => ({ rev: a.rev + r.rev, cost: a.cost + r.cost, oh: a.oh + r.oh, net: a.net + r.net, qty: a.qty + r.qty }), { rev: 0, cost: 0, oh: 0, net: 0, qty: 0 });
  const pct = (v, b) => b ? Math.round(v / b * 100) : 0;
  const loss = all.filter(r => r.net < 0), low = all.filter(r => r.net >= 0 && r.nm < 20), miss = all.filter(r => r.noc > 0 || r.est > 0);
  let rows = flt === 'loss' ? loss : flt === 'low' ? low : flt === 'miss' ? miss : all;
  const key = { net: r => r.net, rev: r => r.rev, nm: r => r.nm, qty: r => r.qty, cost: r => r.cost }[sort] || (r => r.net);
  rows = rows.slice().sort((a, b) => sort === 'nm_asc' ? a.nm - b.nm : key(b) - key(a));
  const best = all.slice().sort((a, b) => b.net - a.net)[0], worst = all.slice().sort((a, b) => a.nm - b.nm)[0];
  const maxRev = Math.max(1, ...rows.map(r => r.rev));
  const card = (k, ic, t, v, sub, tone) => `<div class="pf-ins ${flt === k ? 'on' : ''}" style="--t:${tone};" role="button" ${act('setProfitOpt', 'profitFilter', flt === k ? 'all' : k)}><span>${ic}</span><div><small>${t}</small><b>${v}</b><em>${sub}</em></div></div>`;
  el.innerHTML = `
    <div class="pf-kpis">
      <div class="pf-k"><small>Ciro</small><b>${money(T.rev)}</b><em>${Math.round(T.qty)} adet · ${all.length} ürün</em></div>
      <div class="pf-k"><small>Malzeme maliyeti</small><b>${money(T.cost)}</b><em>cironun %${pct(T.cost, T.rev)}'i</em></div>
      <div class="pf-k"><small>Brüt kâr</small><b>${money(T.rev - T.cost)}</b><em>%${pct(T.rev - T.cost, T.rev)} marj</em></div>
      <div class="pf-k"><small>Genel gider payı</small><b>${money(T.oh)}</b><em>${oh ? 'cironun %' + oh + "'i" : '<a href="#" ' + act('openOverheadsFromReport') + '>gider ekle</a>'}</em></div>
      <div class="pf-k hi ${T.net < 0 ? 'neg' : ''}"><small>Net kâr</small><b>${money(T.net)}</b><em>%${pct(T.net, T.rev)} net marj</em></div>
    </div>
    <div class="pf-bar" title="Ciro dağılımı"><i style="width:${pct(T.cost, T.rev)}%;background:var(--c3)"></i><i style="width:${pct(T.oh, T.rev)}%;background:var(--c2)"></i><i style="width:${Math.max(0, pct(T.net, T.rev))}%;background:var(--ok,#22c55e)"></i></div>
    <div class="pf-leg"><span><i style="background:var(--c3)"></i>Malzeme</span><span><i style="background:var(--c2)"></i>Genel gider</span><span><i style="background:var(--ok,#22c55e)"></i>Net kâr</span></div>
    ${tagCompareHtml((d.rows || []).map(r => ({ qty: r.qty, rev: r.revenue, cost: r.cost, t_qty: r.t_qty, t_rev: r.t_rev, t_cost: r.t_cost })))}
    <div class="pf-insights">
      ${best ? card('all', '🏆', 'En çok kazandıran', escapeHtml(best.name), money(best.net) + ' net kâr', 'var(--ok,#22c55e)') : ''}
      ${worst ? card('low', '📉', 'En düşük marj', escapeHtml(worst.name), '%' + Math.round(worst.nm) + ' net marj', 'var(--c3)') : ''}
      ${card('loss', '🔻', 'Zarar ettiren', loss.length + ' ürün', loss.length ? money(loss.reduce((a, r) => a + r.net, 0)) : 'yok 👍', 'var(--danger,#ef4444)')}
      ${card('miss', '⚠️', 'Maliyeti eksik / tahmini', miss.length + ' ürün', miss.length ? 'reçete veya maliyet girin' : 'hepsi tamam 👍', 'var(--c4,#a855f7)')}
    </div>
    <div class="u-mwn box">
      <div class="pf-toolbar"><h2 class="u-m0">💹 Ürün Kârlılığı</h2>
        <select style="width:auto;margin:0;" ${actOn('change','setProfitOpt',['profitSort','$value'])}>${[['net','Net kâra göre'],['rev','Ciroya göre'],['nm','Marja göre (yüksek)'],['nm_asc','Marja göre (düşük)'],['qty','Adete göre'],['cost','Maliyete göre']].map(([k, l]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>↕ ${l}</option>`).join('')}</select>
        ${flt !== 'all' ? `<button type="button" class="pc-btn" ${act('setProfitOpt', 'profitFilter', 'all')}>✕ Filtreyi kaldır</button>` : ''}</div>
      <div class="pf-head"><span>Ürün</span><span>Adet</span><span>Ciro</span><span>Maliyet</span><span>Net kâr</span><span>Net marj</span></div>
      ${rows.length ? rows.map(r => `<details class="pf-row ${r.net < 0 ? 'neg' : ''}"><summary>
          <span class="pf-n"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.category || r.station_name || '')}${r.cost_source === 'recipe' ? ' · 🧾 reçete' : ''}${r.noc ? ' · ⚠️ maliyetsiz' : r.est ? ' · ≈ tahmini maliyet' : ''}</small>${tagRowNote(r)}
            <span class="pf-mini" style="width:${Math.max(6, r.rev / maxRev * 100)}%"><i style="width:${pct(r.cost, r.rev)}%;background:var(--c3)"></i><i style="width:${pct(r.oh, r.rev)}%;background:var(--c2)"></i><i style="width:${Math.max(0, pct(r.net, r.rev))}%;background:var(--ok,#22c55e)"></i></span></span>
          <span data-l="Adet">${Math.round(r.qty * 100) / 100}</span><span data-l="Ciro">${money(r.rev)}</span><span data-l="Maliyet">${money(r.cost)}</span>
          <span data-l="Net kâr" class="${r.net < 0 ? 'neg' : 'pos'}"><b>${money(r.net)}</b></span><span data-l="Net marj">${r.noc >= r.qty ? '<b class="pf-pill low" title="Maliyet girilmediği için kâr hesaplanamıyor">maliyet yok</b>' : `<b class="pf-pill ${r.nm < 0 ? 'neg' : r.nm < 20 ? 'low' : 'ok'}">%${Math.round(r.nm)}</b>`}</span>
        </summary>${profitDetailHtml(r, oh)}</details>`).join('') : '<p class="muted">Bu dönemde / filtrede satış yok.</p>'}
      <div class="muted pf-note">Maliyet, ürünün <b>satıldığı andaki</b> maliyetidir; o an maliyet yoksa güncel maliyet kullanılır (≈ tahmini). Personel / ikram / limitli hesap etiketli siparişler hariçtir (üstteki kutudan dahil halini kıyaslayın). Genel gider payı = ciro × %${oh || 0}. Maliyeti girilmemiş ürünlerin kârı gerçekte daha düşüktür.</div>
    </div>`;
}
function profitDetailHtml(r, oh){
  const up = r.unitPrice, uc = r.unitCost, uo = up * oh / 100, un = up - uc - uo;
  const rec = r.recipe || [];
  return `<div class="pf-det">
    <div class="pf-unit">
      <div><small>Birim satış</small><b>${money(up)}</b></div><div><small>Birim malzeme</small><b>${money(uc)}</b><em>%${up ? Math.round(uc / up * 100) : 0}</em></div>
      <div><small>Birim genel gider</small><b>${money(uo)}</b><em>%${oh}</em></div><div class="${un < 0 ? 'neg' : ''}"><small>Birim net kâr</small><b>${money(un)}</b><em>%${up ? Math.round(un / up * 100) : 0}</em></div>
    </div>
    ${rec.length ? `<div class="pf-rec"><b>🧾 Reçete maliyeti (güncel)</b>${rec.map(x => `<div><span>${escapeHtml(x.name)} <small class="muted">${Number(x.qty)} ${escapeHtml(x.unit || '')}${Number(x.waste) ? ' · %' + Number(x.waste) + ' fire' : ''} × ${x.unit_cost ? money(x.unit_cost) : '<b style="color:var(--c3)">maliyet yok</b>'}</small></span><b>${money(x.line)}</b></div>`).join('')}
      <div class="pf-rec-t"><span>Toplam</span><b>${money(rec.reduce((a, x) => a + Number(x.line || 0), 0))}</b></div></div>` : `<p class="muted" style="margin:8px 0 0;">Reçete yok; maliyet elle girilmiş${!Number(r.cur_cost) ? ' (girilmemiş)' : ''}. Reçete eklerseniz hammadde maliyetlerinden otomatik hesaplanır.</p>`}
    ${Number(r.cur_price) && Number(r.cur_price) !== Math.round(up * 100) / 100 ? `<p class="muted" style="margin:6px 0 0;font-size:12px;">Güncel fiyat ${money(r.cur_price)} · güncel maliyet ${money(r.cur_cost)} → güncel net marj %${Math.round((Number(r.cur_price) - Number(r.cur_cost) - Number(r.cur_price) * oh / 100) / Number(r.cur_price) * 100)}</p>` : ''}
    ${r.net < 0 ? `<p class="pf-warn">🔻 Bu ürün her satışta <b>${money(-un)}</b> zarar ettiriyor. Fiyatı en az <b>${money((uc) / Math.max(0.01, 1 - oh / 100 - 0.2))}</b> yaparsanız %20 net marja ulaşırsınız.</p>` : r.nm < 20 ? `<p class="pf-warn low">📉 Net marj düşük. %20 net marj için önerilen fiyat: <b>${money(uc / Math.max(0.01, 1 - oh / 100 - 0.2))}</b>.</p>` : ''}
  </div>`;
}
function openOverheadsFromReport(){ if(typeof openOverheads === 'function') openOverheads(); }

/* Birleşik rapor sekmesi: mevcut rapor çizicileri sırayla kendi bölümlerine çizilir
   (her biri #reportContent'e yazdığı için çizim süresince bölüm geçici olarak o kimliği alır). */
async function renderMergedReport(session, parts){
  const host = document.getElementById('reportContent'); if(!host) return;
  const tok = (APP.mergeTok = (APP.mergeTok || 0) + 1);
  host.innerHTML = parts.map(([ic, t], i) => `<section class="mrg-sec"><h2 class="mrg-h"><span>${ic}</span>${escapeHtml(t)}</h2><div id="mrg_${i}"><p class="muted">Yükleniyor…</p></div></section>`).join('');
  for(let i = 0; i < parts.length; i++){
    if(tok !== APP.mergeTok || !host.isConnected) return;
    const slot = document.getElementById('mrg_' + i); if(!slot) return;
    host.id = 'reportContentHost'; slot.id = 'reportContent';
    try{ await parts[i][2](session); } catch(e){ slot.innerHTML = '<p class="muted">Yüklenemedi</p>'; }
    finally{ slot.id = 'mrg_' + i; host.id = 'reportContent'; }
  }
}
