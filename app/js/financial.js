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
        <p class="muted" id="rpFgOtpInfo" style="text-align:center;"></p>
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
    <div class="box" style="max-width:none;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span class="muted" style="white-space:nowrap;">Tarih Aralığı</span>
        <input type="date" id="reportDateInput" value="${APP.reportDate}" ${actOn('change','changeReportDate',['$value'])} style="width:auto;margin:0;">
        <span class="muted">–</span>
        <input type="date" id="reportDateToInput" value="${APP.reportDateTo}" ${actOn('change','changeReportDateTo',['$value'])} style="width:auto;margin:0;">
        <span style="width:1px;height:22px;background:var(--border);margin:0 2px;"></span>
        <button type="button" class="range-preset-btn" ${act('setReportDateRangeDays', 0)}>Bugün</button>
        <button type="button" class="range-preset-btn" ${act('setReportDateRangeDays', 6)}>Son 7 Gün</button>
        <button type="button" class="range-preset-btn" ${act('setReportDateRangeDays', 9)}>Son 10 Gün</button>
        <button type="button" class="range-preset-btn" ${act('setReportDateRangeDays', 29)}>Son 30 Gün</button>
        <span style="flex:1;"></span>
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
    stockf:'Ne zaman bitecek', zreport:'Z raporu, yazdır', waiters:'Personel performansı', journey:'Sadakat, kayıp müşteri', period:'Saatlik / günlük', vat:'Vergi dağılımı',
    products:'En çok satanlar', staff:'Personel ısı haritası', customers:'Müşteri harcamaları', tips:'Bahşiş dağılımı', waste:'Fire ve israf', cancel:'İptal masa ve ürünler',
    resv:'Rezervasyon performansı', openacc:'Veresiye bakiyeleri' };
  return [['summary','📊','Genel Özet'], ...AN_TABS, ['period','📈','Dönemsel Analiz'],['vat','🧾','KDV'],['products','📦','Ürün İstatistikleri'],['staff','👤','Personel Analizleri'],['customers','🧑‍🤝‍🧑','Müşteri Analizleri'],['tips','💰','Bahşiş Havuzu'],['waste','🔥','İsraf'],['cancel','❌','İptaller'],['resv','📅','Rezervasyon Analizi'],['openacc','📒','Açık Hesaplar']].map(t => [...t, dsc[t[0]] || '']);
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
  if(tab==='staff') return renderStaffAnalyticsContent(session);
  if(tab==='customers') return renderCustomerAnalyticsContent(session);
  if(tab==='tips') return renderTipPoolContent(session);
  if(tab==='waste') return renderWasteContent(session);
  if(tab==='cancel') return renderCancelReportContent(session);
  if(tab==='cockpit') return renderCockpitContent(session);
  if(tab==='channels') return renderChannelsContent(session);
  if(tab==='speed') return renderSpeedContent(session);
  if(tab==='menueng') return renderMenuEngContent(session);
  if(tab==='tablemap') return renderTableMapContent(session);
  if(tab==='heat') return renderHeatContent(session);
  if(tab==='stockf') return renderStockForecastContent(session);
  if(tab==='zreport') return renderZReportContent(session);
  if(tab==='waiters') return renderWaiterCardsContent(session);
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
  const wasteCost = (wasteRes.data && wasteRes.data.total_cost) || 0;

  // Sipariş Etiketleri (Personel Yemeği, İkram vb.) işaretlenmiş hesaplar ciro/net
  // kârdan hariç tutulur - stok yine düşmüş olsa da bunlar gerçek satış değildir.
  // Nakit/Kart toplamları ise kasa mutabakatı için TÜM hesaplardan (etiketli dahil)
  // hesaplanmaya devam eder.
  const untaggedHist = hist.filter(o => !o.tags || o.tags.length===0);
  const taggedHist = hist.filter(o => o.tags && o.tags.length>0);

  let totalRevenue=0, totalCost=0, totalCash=0, totalCard=0, totalGiftCard=0, totalDiscount=0, discountedCount=0, taggedTotal=0, totalTip=0, totalBirthdayDiscount=0, birthdayCount=0;
  const hourStats = {};
  untaggedHist.forEach(o => {
    totalRevenue += Number(o.total); totalCost += Number(o.cost);
    totalDiscount += Number(o.discount_amount||0);
    if(o.discount_amount>0) discountedCount++;
    if(o.birthday_discount_amount>0){ totalBirthdayDiscount += Number(o.birthday_discount_amount); birthdayCount++; }
    const hr = new Date(o.closed_at).getHours();
    if(!hourStats[hr]) hourStats[hr] = {count:0, revenue:0};
    hourStats[hr].count += 1;
    hourStats[hr].revenue += Number(o.total);
  });
  taggedHist.forEach(o => { taggedTotal += Number(o.total); });
  hist.forEach(o => { totalCash += Number(o.cash_amount||0); totalCard += Number(o.card_amount||0); totalGiftCard += Number(o.gift_card_amount||0); totalTip += Number(o.tip_amount||0); });
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
  const billLabel = (o) => (o.kind==='takeaway' ? '📦 Paket' : (o.table_name||'-'));
  const billTableOptions = [...new Set(hist.map(billLabel))].sort();
  const billHourOptions = [...new Set(hist.map(o => new Date(o.closed_at).getHours()))].sort((a,b)=>a-b);
  const METHOD_LABELS = { cash:'💵 Nakit', card:'💳 Kredi Kartı', gift_card:'🎁 Hediye Kartı', split:'➗ Bölünmüş', open_account:'📒 Açık Hesap' };
  const billMethodOptions = [...new Set(hist.map(o => o.payment_method))].filter(Boolean).sort();

  // Hesabın kaynağı: rezervasyondan / bekleme listesinden oturtulan masa,
  // doğrudan gelen (rezervasyonsuz) masa ya da paket.
  const billSource = (o) => o.from_reservation ? 'resv' : o.from_waitlist ? 'waitlist' : o.kind==='takeaway' ? 'takeaway' : 'walkin';
  const SOURCE_LABELS = { resv:'📅 Rezervasyonlu', waitlist:'⏳ Bekleme Listesi', walkin:'🚶 Rezervasyonsuz Masa', takeaway:'📦 Paket' };
  const billSourceCounts = {}; hist.forEach(o => { const k = billSource(o); billSourceCounts[k] = (billSourceCounts[k]||0) + 1; });
  const filteredBills = hist.filter(o => {
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
      : ((METHOD_LABELS[o.payment_method] || o.payment_method) + giftTxt);
    const discTxt = o.discount_amount>0 ? ('-'+money(o.discount_amount)) : '-';
    const tagBadge = (o.tags && o.tags.length>0)
      ? ` <span style="background:rgba(234,179,8,.15);color:#eab308;border-radius:6px;padding:2px 6px;font-size:11px;font-weight:700;">${o.tags.map(x=>escapeHtml(x)).join(', ')}</span>`
      : '';
    const srcBadge = o.from_reservation
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
    return `<tr><td style="white-space:nowrap;">${hmS(o.ordered_at)}${sameDay ? '' : `<div class="muted" style="font-size:11px;">${oD}</div>`}</td>
      <td style="white-space:nowrap;">${hmS(o.ready_at)}${prep!=null ? `<div class="muted" style="font-size:11px;">${prep} dk</div>` : ''}</td>
      <td style="white-space:nowrap;">${t}${stay!=null ? ` <span class="muted" style="font-size:11px;">(${stay} dk)</span>` : ''}<div class="muted" style="font-size:11px;">${dS}</div></td>
      <td class="col-name">${escapeHtml(billLabel(o))}${srcBadge}${tagBadge}</td>
      <td>${(o.waiters || o.order_taken_by_name) ? escapeHtml(o.waiters || o.order_taken_by_name) : '<span class="muted">—</span>'}${o.customer_name ? `<div style="font-size:12px;">${o.customer_id ? '⭐ ' : '👤 '}${escapeHtml(o.customer_name)}</div>${o.customer_phone ? `<div class="muted" style="font-size:11px;">${escapeHtml(o.customer_phone)}</div>` : ''}` : ''}</td>
      <td style="white-space:nowrap;"><b>${money(o.total)}</b>${o.discount_amount>0 ? `<div style="font-size:11px;color:var(--red);">${discTxt}</div>` : ''}</td>
      <td style="font-size:13px;">${methodLabel}</td>
      <td><button type="button" class="sbtn" style="width:auto;margin:0;padding:6px 10px;" title="Detay" ${act('openSaleDetailModal', o.id)}>🔍</button></td></tr>`;
  };
  const billsHtml = hist.length===0 ? '<p class="muted">Bu tarihte kapatılmış hesap yok.</p>'
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
        <div class="fs-line">${hist.length} kapatılan hesap${hist.length ? ' · ortalama '+money(totalRevenue/Math.max(1,untaggedHist.length)) : ''}</div>
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
        ${totalRevenue ? `<div class="fs-split">${[[totalCash,'var(--green)'],[totalCard,'var(--accent)'],[totalGiftCard,'var(--gift)']].map(([v,c]) => v>0 ? `<span style="flex:${v};background:${c};"></span>` : '').join('')}</div>` : ''}
        ${fsRow('<i class="fs-dot" style="background:var(--green);"></i>Nakit', money(totalCash), totalRevenue ? '%'+Math.round(totalCash/totalRevenue*100) : '')}
        ${fsRow('<i class="fs-dot" style="background:var(--accent);"></i>Kredi Kartı', money(totalCard), totalRevenue ? '%'+Math.round(totalCard/totalRevenue*100) : '')}
        ${fsRow('<i class="fs-dot" style="background:var(--gift);"></i>Hediye Kartı', money(totalGiftCard), totalRevenue ? '%'+Math.round(totalGiftCard/totalRevenue*100) : '')}
        ${fsRow('Bahşiş', money(totalTip), '')}
      </div>
      <div class="fs-panel" style="--t:#a78bfa;"><h3><i>🍽️</i>Servis</h3><div id="serviceMetrics"><p class="muted" style="font-size:13px;">Yükleniyor…</p></div></div>
      <div class="fs-panel" style="--t:#f59e0b;"><h3><i>🏷️</i>İndirim ve İkram</h3>
        ${fsRow('İndirim', money(totalDiscount), discountedCount+' hesap')}
        ${fsRow('Doğum günü indirimi', money(totalBirthdayDiscount), birthdayCount+' hesap')}
        ${fsRow('Personel / ikram', money(taggedTotal), taggedHist.length+' hesap')}
        <p class="fs-note">Personel / ikram hesapları ciroya dahil değildir.</p>
      </div>
    </div>
    <div class="ch-row">
      <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>📊</i>Saatlik Ciro${peakHour!==null?' <span class="muted" style="font-size:12px;font-weight:400;">en yoğun: '+(peakHour<10?'0'+peakHour:peakHour)+':00</span>':''}</h3>
        ${(() => { if(!hourKeys.length) return '<p class="muted">Bu tarihte veri yok.</p>'; const lo = Math.min(...hourKeys), hi = Math.max(...hourKeys); const hrs = []; for(let h = lo; h <= hi; h++) hrs.push(h);
          return svgBarChart(hrs.map(h => { const st = hourStats[h] || { revenue:0, count:0 }; return { label: (h<10?'0'+h:h)+':00', value: st.revenue, display: money(st.revenue) + ' · ' + st.count + ' sipariş' }; }), { title:'Saatlik ciro' }); })()}</div>
      <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🍩</i>Ödeme Türleri</h3>
        ${svgDonut([{ label:'Nakit', value: totalCash, color:'var(--c1)' }, { label:'Kart', value: totalCard, color:'var(--c2)' }, { label:'Hediye Kartı', value: totalGiftCard, color:'var(--c3)' }], { center: shortMoney(totalCash+totalCard+totalGiftCard), sub:'₺ toplam', title:'Ödeme türleri', money:true })}</div>
    </div>
    ${heatmapHtml(untaggedHist)}
    <details class="fs-panel pa-sec" style="--t:#f97316;"><summary style="cursor:pointer;"><h3 style="display:inline-flex;margin:0;"><i>⏰</i>Saatlik Yoğunluk Tablosu</h3></summary>${hourlyHtml}</details>
    <div class="fs-panel pa-sec" style="--t:#a78bfa;"><h3><i>👤</i>Personel Performansı</h3>${staffRowsHtml}</div>
    <div class="fs-panel pa-sec" style="--t:var(--green);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px;">
        <h3 style="margin:0;"><i>🧾</i>Kapatılan Hesaplar</h3>
        <span class="muted" style="font-size:12px;">${billsFilterActive ? (filteredBills.length+' / '+hist.length+' hesap') : (hist.length+' hesap')}</span>
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
        ${billsFilterActive ? `<button type="button" class="sbtn" style="width:auto;margin:0;" ${act('resetReportBillsFilter')}>✕ Filtreleri Temizle</button>` : ''}
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
      box.innerHTML =
        fsRow('Ortalama hesap', money(m.avg_check), m.checks+' hesap') +
        fsRow('Ort. masa hesabı', money(m.avg_check_dine_in), m.dine_in_checks+' hesap') +
        fsRow('Ort. paket hesabı', money(m.avg_check_takeaway), '') +
        fsRow('Masa devir hızı', m.table_count ? String(m.table_turnover).replace('.',',')+'×' : '—', m.table_count+' masa') +
        fsRow('Ort. oturma süresi', m.avg_seat_minutes ? m.avg_seat_minutes+' dk' : '—', '');
    });
  }
  loadFsExtras(session, totalRevenue);
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
      <span class="race-side">${APP.productStatsSort==='qty' ? money(r.revenue) : r.qty+' adet'}<small>${totalRev ? '%'+Math.round(Number(r.revenue)/totalRev*100)+' ciro' : ''}</small></span>
    </div>`; }).join('')}</div>${sorted.length > 10 ? `<button type="button" class="pc-btn" style="margin-top:10px;" ${act('setProductStatsOpt', 'productStatsAll', !APP.productStatsAll)}>${APP.productStatsAll ? 'İlk 10\'u göster' : 'Tümünü göster ('+sorted.length+')'}</button>` : ''}`;

  el.innerHTML = `
    ${statChips([['🍽️', filtered.length, 'Satılan ürün çeşidi', 'var(--c1)'], ['📦', totalQty, 'Toplam adet', 'var(--c2)'], ['💰', money(totalRev), 'Toplam ciro', 'var(--c3)'], ['🏆', top ? escapeHtml(top.name) : '-', 'En çok satan', 'var(--c4)']])}
    <div class="box" style="max-width:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <h2 style="margin:0;">Ürün Satışları</h2>
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
  `;
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
        <h2 style="margin:0;">Müşteri Analizleri</h2>
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
        ${shares.length===0?'<tr><td colspan="3" class="muted" style="text-align:center;">Bu tarihte vardiya kaydı yok.</td></tr>':''}
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
  main.innerHTML = `<h1>Satınalma</h1>
    <div class="box" style="max-width:none;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span class="muted" style="white-space:nowrap;">Tarih Aralığı</span>
        <input type="date" value="${APP.procFrom}" ${actOn('change','setProcDate',['from','$value'])} style="width:auto;margin:0;">
        <span class="muted">–</span>
        <input type="date" value="${APP.procTo}" ${actOn('change','setProcDate',['to','$value'])} style="width:auto;margin:0;">
        <span style="flex:1;"></span>
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
/* --- Dönemsel Analiz: aylık ve mevsimlik ciro, haftanın günleri, en çok çalışan masalar
   (bkz. get_period_analytics). Kısa aralıkta "Son 12 Ay" kısayolu önerilir. --- */
function setReportLast12Months(){
  const to = new Date(), from = new Date(); from.setMonth(from.getMonth()-11); from.setDate(1);
  const f = (d) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  APP.reportDate = f(from); APP.reportDateTo = f(to);
  const a = document.getElementById('reportDateInput'); if(a) a.value = APP.reportDate;
  const b = document.getElementById('reportDateToInput'); if(b) b.value = APP.reportDateTo;
  renderReportTabContent(getSession());
}
function setPeriodYear(y){ APP.periodYear = Number(y); renderPeriodAnalyticsContent(getSession()); }
async function renderPeriodAnalyticsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  // Bu sekme üstteki tarih aralığından bağımsız: seçilen yılın 12 ayı, 4 mevsimi ve haftanın 7 günü.
  const nowY = new Date().getFullYear();
  const year = APP.periodYear || nowY;
  const { data: d, error } = await withLoadingOverlay(sb.rpc('get_period_analytics', { p_token: session.session_token, p_date: year+'-01-01', p_date_to: year+'-12-31' }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const DOW = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
  const SEASONS = [
    { k:'Kış', ic:'❄️', m:[12,1,2], c:'#38bdf8' }, { k:'İlkbahar', ic:'🌱', m:[3,4,5], c:'#22c55e' },
    { k:'Yaz', ic:'☀️', m:[6,7,8], c:'#f59e0b' }, { k:'Sonbahar', ic:'🍂', m:[9,10,11], c:'#f97316' } ];
  const N = (v) => Number(v)||0;
  const byM = {}; (d.monthly||[]).forEach(r => { byM[Number(r.ym.split('-')[1])] = r; });
  const months = MONTHS.map((name, i) => { const r = byM[i+1] || {}; return { i: i+1, name, revenue:N(r.revenue), checks:N(r.checks), profit:N(r.profit), avg:N(r.avg_check) }; });
  const yearRev = months.reduce((t, m) => t + m.revenue, 0), yearChecks = months.reduce((t, m) => t + m.checks, 0), yearProfit = months.reduce((t, m) => t + m.profit, 0);
  const maxM = Math.max(1, ...months.map(m => m.revenue));
  const bestM = months.reduce((a, m) => m.revenue > a.revenue ? m : a, months[0]);
  const curM = year===nowY ? new Date().getMonth()+1 : 13;
  const pctChange = (cur, prev) => prev > 0 ? Math.round((cur-prev)/prev*100) : null;
  const monthCards = months.map((m, idx) => {
    const future = m.i > curM;
    const ch = idx > 0 ? pctChange(m.revenue, months[idx-1].revenue) : null;
    const mc = (SEASONS.find(se => se.m.includes(m.i)) || {}).c || 'var(--accent)';
    return `<div class="pm-card${m===bestM && m.revenue>0 ? ' pm-best':''}${future?' pm-future':''}" style="--mc:${mc};">
      <div class="pm-head"><span>${m.name}</span>${m===bestM && m.revenue>0 ? '<span title="En yüksek ay">🏆</span>' : ''}</div>
      <div class="pm-rev">${future ? '—' : money(m.revenue)}</div>
      <div class="pm-bar"><div style="width:${Math.round(m.revenue/maxM*100)}%;"></div></div>
      <div class="pm-meta"><span>🧾 ${m.checks} hesap</span>${m.checks ? `<span>Ort. ${money(m.avg)}</span>` : ''}</div>
      <div class="pm-meta"><span style="color:${m.profit>=0?'var(--green)':'var(--red)'};">Kâr ${money(m.profit)}</span>${ch!=null && !future ? `<span class="pm-ch ${ch>=0?'up':'down'}">${ch>=0?'▲':'▼'} %${Math.abs(ch)}</span>` : ''}</div>
    </div>`;
  }).join('');
  const seasons = SEASONS.map(se => {
    const ms = months.filter(m => se.m.includes(m.i));
    const rev = ms.reduce((t, m) => t + m.revenue, 0), checks = ms.reduce((t, m) => t + m.checks, 0), profit = ms.reduce((t, m) => t + m.profit, 0);
    return { ...se, rev, checks, profit, ms };
  });
  const bestS = seasons.reduce((a, x) => x.rev > a.rev ? x : a, seasons[0]);
  const seasonCards = seasons.map(se => `<div class="ps-card" style="--ps-c:${se.c};">
      <div class="ps-head"><span class="ps-ic">${se.ic}</span><b>${se.k}</b>${se===bestS && se.rev>0 ? ' <span title="En yoğun mevsim">🏆</span>' : ''}<span class="ps-share">%${yearRev ? Math.round(se.rev/yearRev*100) : 0}</span></div>
      <div class="ps-rev">${money(se.rev)}</div>
      <div class="ps-meta">🧾 ${se.checks} hesap · Kâr ${money(se.profit)}</div>
      <div class="ps-months">${se.ms.map(m => `<div><span>${m.name.slice(0,3)}</span><b>${m.i>curM ? '—' : money(m.revenue)}</b></div>`).join('')}</div>
    </div>`).join('');
  const wd = {}; (d.weekdays||[]).forEach(r => { wd[r.dow] = r; });
  const days = DOW.map((name, i) => { const r = wd[i+1] || {}; return { name, avg: N(r.days) ? N(r.revenue)/N(r.days) : 0, checks:N(r.checks), total:N(r.revenue) }; });
  const maxD = Math.max(1, ...days.map(x => x.avg)), bestD = days.reduce((a, x) => x.avg > a.avg ? x : a, days[0]);
  const dayCards = days.map((x, i) => `<div class="pd-card${x===bestD && x.avg>0?' pm-best':''}${i>=5?' pd-weekend':''}">
      <div class="pd-name">${x.name.slice(0,3)}</div>
      <div class="pd-col"><div style="height:${Math.max(4, Math.round(x.avg/maxD*100))}%;"></div></div>
      <div class="pd-val">${money(x.avg)}</div><div class="pd-sub">${x.checks} hesap</div></div>`).join('');
  const tables = d.tables || [];
  el.innerHTML = `
    <div class="box" style="max-width:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span class="muted">Yıl</span>
      ${[nowY-2, nowY-1, nowY].map(y => `<button type="button" class="range-preset-btn${y===year?' active':''}" ${act('setPeriodYear', y)}>${y}</button>`).join('')}
      <span class="muted" style="flex:1;text-align:right;font-size:12.5px;">Bu sekme üstteki tarih aralığından bağımsızdır.</span>
    </div>
    <div class="fs-hero">
      <div class="fs-hero-main"><div class="fs-cap">💰 ${year} Toplam Ciro</div><div class="fs-big">${money(yearRev)}</div><div class="fs-line">${yearChecks} hesap</div></div>
      <div class="fs-hero-side">
        <div class="fs-k" style="--k:${yearProfit<0?'var(--red)':'var(--green)'};"><div class="fs-cap">📈 Yıllık Kâr</div><div class="fs-mid">${money(yearProfit)}</div><div class="fs-line">${yearRev ? 'Marj %'+Math.round(yearProfit/yearRev*100) : '—'}</div></div>
        <div class="fs-k" style="--k:#a78bfa;"><div class="fs-cap">📊 Aylık Ortalama</div><div class="fs-mid">${money(yearRev / Math.max(1, Math.min(12, curM)))}</div><div class="fs-line">geçen aylar</div></div>
        <div class="fs-k" style="--k:#eab308;"><div class="fs-cap">🏆 En İyi Ay</div><div class="fs-mid">${bestM.revenue ? bestM.name : '—'}</div><div class="fs-line">${bestM.revenue ? money(bestM.revenue) : ''}</div></div>
      </div>
    </div>
    <div class="ch-row">
      <div class="fs-panel pa-sec" style="--t:#a78bfa;"><h3><i>🗓️</i>Haftanın Günleri <span class="muted" style="font-size:12px;font-weight:400;">günlük ortalama ciro</span></h3>${svgBarChart(days.map(x => ({ label: ({Pazartesi:'Pzt',Salı:'Sal',Çarşamba:'Çar',Perşembe:'Per',Cuma:'Cum',Cumartesi:'Cmt',Pazar:'Paz'})[x.name] || x.name.slice(0,3), value: x.avg, display: money(x.avg) + ' / gün · ' + x.checks + ' hesap' })), { title:'Haftanın günleri', height: 200 })}</div>
      <div class="fs-panel pa-sec" style="--t:#22c55e;"><h3><i>🍩</i>Mevsim Payları</h3>${svgDonut(seasons.map(se => ({ label: se.ic + ' ' + se.k, value: se.rev, color: se.c })), { center: shortMoney(yearRev), sub:'₺ ' + year, title:'Mevsim payları', money:true })}</div>
    </div>
    <div class="fs-panel pa-sec" style="--t:#22c55e;"><h3><i>🌦️</i>4 Mevsim</h3><div class="ps-grid">${seasonCards}</div></div>
    <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>📊</i>${year} Aylık Ciro</h3>${svgBarChart(months.map(m => ({ label: m.name.slice(0,3), value: m.revenue, display: money(m.revenue) + ' · ' + m.checks + ' hesap · kâr ' + money(m.profit) })), { title:'Aylık ciro', height: 240 })}</div>
    <div class="fs-panel pa-sec" style="--t:var(--accent);"><h3><i>📅</i>Aylar <span class="pa-legend">${SEASONS.map(se => `<span><b style="background:${se.c};"></b>${se.k}</span>`).join('')}</span></h3><div class="pm-grid">${monthCards}</div></div>
    <div class="fs-panel pa-sec" style="--t:#f59e0b;"><h3><i>🪑</i>En Çok Çalışan Masalar <span class="muted" style="font-size:12px;font-weight:400;">${year}</span></h3>
      ${tables.length ? `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>#</th><th>Masa</th><th>Hesap</th><th>Ciro</th><th>Ort. Hesap</th><th>Ort. Oturma</th></tr></thead><tbody>
        ${tables.map((t, i) => `<tr><td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td><td class="col-name">${escapeHtml(t.table_name)}</td><td>${t.checks}</td><td><b>${money(t.revenue)}</b></td><td>${money(t.avg_check)}</td><td>${t.avg_minutes!=null ? t.avg_minutes+' dk' : '—'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Bu yıl masa hesabı yok.</p>'}</div>`;
}
async function renderPurchaseReportContent(session){
  const host = document.getElementById('procContent'); if(!host) return;
  const sub = APP.purchRepSub || 'orders';
  host.innerHTML = `<div class="bx-tabs" id="purchRepTabs">
      <button type="button" class="bx-tab ${sub==='orders'?'on':''}" style="--sc:var(--c1);" data-tab="purchRepOrders" ${act('setPurchRepSub','orders')}><span class="bx-ic">🧾</span>Satınalma Siparişleri</button>
      <button type="button" class="bx-tab ${sub==='suppliers'?'on':''}" style="--sc:var(--c2);" data-tab="purchRepSuppliers" ${act('setPurchRepSub','suppliers')}><span class="bx-ic">🏭</span>Tedarikçiler</button>
    </div><div id="purchRepContent"></div>`;
  if(sub==='suppliers'){ APP.supplierTarget = 'purchRepContent'; return renderSuppliersContent(session); }
  const el = document.getElementById('purchRepContent');
  const { data, error } = await withLoadingOverlay(sb.rpc('get_purchase_report', { p_token: session.session_token, p_date: APP.procFrom, p_date_to: APP.procTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const rows = data || [];
  const live = rows.filter(p => p.status!=='draft' && p.status!=='cancelled');
  const total = live.reduce((t, p) => t + (Number(p.total_amount)||0), 0);
  const recv = live.reduce((t, p) => t + (Number(p.received_amount)||0), 0);
  const needPrice = (p) => p.status!=='draft' && p.status!=='cancelled' && (p.items||[]).some(i => !(Number(i.unit_cost)>0));
  const needRecv = (p) => p.status==='ordered';
  const cnt = { all: rows.length, price: rows.filter(needPrice).length, recv: rows.filter(needRecv).length, done: rows.filter(p => p.status==='received' && !needPrice(p)).length };
  const flt = APP.procFilter || 'all';
  const shown = rows.filter(p => flt==='price' ? needPrice(p) : flt==='recv' ? needRecv(p) : flt==='done' ? (p.status==='received' && !needPrice(p)) : true);
  const bySup = {};
  live.forEach(p => { const k = p.supplier_name || 'Tedarikçisiz'; bySup[k] = (bySup[k]||0) + (Number(p.total_amount)||0); });
  const statusOf = (p) => typeof poStatusBadge==='function' ? poStatusBadge(Object.assign({}, p, { ordered_total: (p.items||[]).reduce((t,i)=>t+Number(i.quantity||0),0), received_total: (p.items||[]).reduce((t,i)=>t+Math.min(Number(i.received||0),Number(i.quantity||0)),0) })) : escapeHtml(p.status);
  const CHIP_C = { all:'var(--accent)', price:'var(--red)', recv:'#f59e0b', done:'var(--green)' };
  const chip = (k, l) => `<button type="button" class="pc-chip${flt===k?' active':''}" style="--cc:${CHIP_C[k]};" ${act('setProcFilter', k)}>${l}<span>${cnt[k]}</span></button>`;
  const card = (p, idx) => {
    const tone = needPrice(p) ? 'var(--danger,#ef4444)' : needRecv(p) ? '#f59e0b' : p.status==='received' ? 'var(--ok,#22c55e)' : 'var(--muted)';
    const items = p.items || [];
    return `<div class="pc-card pc2" style="--pc:${tone};--i:${Math.min(idx||0,12)};">
      <div class="pc2-head">
        ${avatarHtml(p.supplier_name || 'T')}
        <div class="pc2-title"><b>${escapeHtml(p.supplier_name || 'Tedarikçisiz')}</b>
          <small>📅 ${new Date(p.order_date).toLocaleDateString('tr-TR')}${p.expected_date ? ' · 🎯 ' + new Date(p.expected_date).toLocaleDateString('tr-TR') : ''} · 👤 ${escapeHtml(p.created_by_name || '—')}</small></div>
        <div class="pc2-right"><span class="pc2-total">${money(p.total_amount)}</span>${statusOf(p)}</div>
      </div>
      <div class="pc2-items">
        ${items.map(i => { const q = Number(i.quantity)||0, c = Number(i.unit_cost)||0; return `<div class="pc2-it ${c>0?'':'nop'}">
          <span class="pc2-ic">🥕</span>
          <div class="pc2-nm"><b>${escapeHtml(i.name)}</b><small>${q} ${escapeHtml(i.unit||'')}${Number(i.received)>0 && Number(i.received)<q ? ` · teslim ${Number(i.received)}` : ''}</small></div>
          <label class="pc2-price"><input type="number" min="0" step="0.01" placeholder="Fiyat" value="${c>0 ? c : ''}" data-item-id="${i.id}" data-orig="${c>0 ? c : ''}" class="pc-cost ${c>0 ? '' : 'missing'}" ${actOn('input','markPcDirty',[p.id])}><span>₺/${escapeHtml(i.unit||'')}</span></label>
          <b class="pc2-line">${c>0 ? money(q*c) : '<span class="pchip warn">fiyat yok</span>'}</b></div>`; }).join('') || '<p class="muted">Kalem yok.</p>'}
      </div>
      <div class="pc2-foot">${p.notes ? `<div class="pc-note">📝 ${escapeHtml(p.notes)}</div>` : '<span></span>'}
        <div class="pc2-acts">${p.status==='ordered' ? `<button type="button" class="pc-btn" ${act('openReceivePOModal', p.id)}>📦 Teslim Al</button>` : ''}
          <button type="button" class="pc-save" id="pcSave_${p.id}" disabled ${act('savePoPrices', p.id)}>${ICON_SAVE}<span>Kaydet</span></button></div></div>
    </div>`;
  };
  el.innerHTML = `
    <div class="fs-hero">
      <div class="fs-hero-main"><div class="fs-cap">🧾 Sipariş Tutarı</div><div class="fs-big">${money(total)}</div><div class="fs-line">${live.length} sipariş</div></div>
      <div class="fs-hero-side">
        <div class="fs-k" style="--k:var(--green);"><div class="fs-cap">📦 Teslim Alınan</div><div class="fs-mid">${money(recv)}</div><div class="fs-line">${total ? '%'+Math.round(recv/total*100) : '—'}</div></div>
        <div class="fs-k" style="--k:#f59e0b;"><div class="fs-cap">⏳ Teslim Bekleyen</div><div class="fs-mid">${money(Math.max(0,total-recv))}</div><div class="fs-line">${cnt.recv} sipariş</div></div>
        <div class="fs-k fs-click" style="--k:${cnt.price?'var(--red)':'#a78bfa'};" ${act('setProcFilter','price')}><div class="fs-cap">🏷️ Fiyat Bekleyen</div><div class="fs-mid">${cnt.price}</div><div class="fs-line">sipariş · göster ›</div></div>
      </div>
    </div>
    <div class="pc-layout">
      <div>
        <div class="pc-chips">${chip('all','Tümü')}${chip('price','Fiyat bekleyen')}${chip('recv','Teslim bekleyen')}${chip('done','Tamamlanan')}</div>
        ${shown.length ? `<div class="pc2-grid">${shown.map((p, i) => card(p, i)).join('')}</div>` : '<div class="fs-panel"><p class="muted" style="margin:0;">Bu filtrede sipariş yok.</p></div>'}
      </div>
      <div class="fs-panel pc-side" style="--t:#a78bfa;"><h3><i>🚚</i>Tedarikçiye Göre</h3>
        ${total ? (() => { const e = Object.entries(bySup).sort((a,b)=>b[1]-a[1]); const top = e.slice(0,3), rest = e.slice(3).reduce((t,x)=>t+x[1],0);
          return svgDonut(top.map(([k,v], i) => ({ label:k, value:v, color:`var(--c${i+1})` })).concat(rest ? [{ label:'Diğer', value:rest, color:'var(--c4)' }] : []), { center: shortMoney(total), sub:'₺ toplam', title:'Tedarikçi payları', money:true }); })() : ''}
        ${Object.keys(bySup).length ? Object.entries(bySup).sort((a,b)=>b[1]-a[1]).map(([k,v]) => fsRow(escapeHtml(k), money(v), total ? '%'+Math.round(v/total*100) : '')).join('') : '<p class="muted" style="font-size:13px;">Veri yok.</p>'}
        <p class="fs-note">Fiyatı girilmemiş kalemler tutara katılmaz. Fiyatları yazdıktan sonra siparişin <b>Kaydet</b> düğmesine basın.</p>
      </div>
    </div>`;
}
function setProcFilter(k){ APP.procFilter = k; renderPurchaseReportContent(getSession()); }
function setPurchRepSub(sub){ APP.purchRepSub = sub; renderPurchaseReportContent(getSession()); }
/* Birim fiyatlar yazılınca otomatik kaydedilmez: siparişin Kaydet düğmesi açılır. */
function markPcDirty(poId){
  const card = document.getElementById('pcSave_'+poId); if(!card) return;
  const inputs = card.closest('.pc-card').querySelectorAll('.pc-cost');
  const dirty = [...inputs].filter(i => i.value !== i.dataset.orig).length;
  card.disabled = !dirty;
  card.querySelector('span').textContent = dirty ? `Kaydet (${dirty})` : 'Kaydet';
  card.closest('.pc-card').classList.toggle('dirty', !!dirty);
}
async function savePoPrices(poId){
  const btn = document.getElementById('pcSave_'+poId); if(!btn) return;
  const changed = [...btn.closest('.pc-card').querySelectorAll('.pc-cost')].filter(i => i.value !== i.dataset.orig);
  for(const inp of changed){
    const v = parseFloat(String(inp.value).replace(',', '.'));
    if(isNaN(v) || v < 0){ showToast('Geçerli bir birim fiyat girin'); inp.focus(); return; }
  }
  btn.disabled = true;
  const tok = getSession().session_token; const errs = [];
  await withLoadingOverlay((async () => {
    for(const inp of changed){
      const { error } = await sb.rpc('set_purchase_item_cost', { p_token: tok, p_item_id: inp.dataset.itemId, p_unit_cost: parseFloat(String(inp.value).replace(',', '.')) });
      if(error) errs.push(error.message);
    }
  })());
  if(errs.length) alert('Bazı fiyatlar kaydedilemedi:\n\n' + errs.join('\n')); else showToast(changed.length + ' birim fiyat kaydedildi ✓');
  renderPurchaseReportContent(getSession());
  if(typeof refreshNavBadges === 'function') refreshNavBadges();
}
async function savePurchaseItemCost(itemId, value){
  const v = parseFloat(String(value).replace(',', '.'));
  if(isNaN(v) || v < 0){ showToast('Geçerli bir birim fiyat girin'); return; }
  const { error } = await sb.rpc('set_purchase_item_cost', { p_token: getSession().session_token, p_item_id: itemId, p_unit_cost: v });
  if(error){ alert(error.message); return; }
  showToast('Birim fiyat kaydedildi ✓');
  renderPurchaseReportContent(getSession());
  if(typeof refreshNavBadges === 'function') refreshNavBadges();
}
/* İptaller: mutfağa gönderildikten sonra iptal edilen ürünler ve tamamen iptal edilen masalar. */
async function renderCancelReportContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_cancel_report', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const items = (data && data.items) || [], orders = (data && data.orders) || [];
  const itemTotal = items.reduce((t, r) => t + Number(r.total||0), 0);
  const orderTotal = orders.reduce((t, o) => t + Number(o.total||0), 0);
  const cancelledOrderIds = new Set(orders.map(o => o.id));
  const partialTotal = items.filter(r => !cancelledOrderIds.has(r.order_id)).reduce((t, r) => t + Number(r.total||0), 0);
  const byProd = {}, byStaff = {};
  items.forEach(r => { byProd[r.item_name] = (byProd[r.item_name]||0) + Number(r.qty||0); const k = r.cancelled_by || '—'; byStaff[k] = (byStaff[k]||0) + Number(r.total||0); });
  orders.forEach(o => { const k = o.cancelled_by || '—'; if(!items.some(r => r.order_id===o.id)) byStaff[k] = (byStaff[k]||0) + Number(o.total||0); });
  const dt = (iso) => new Date(iso).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  const orderItems = (o) => { const list = (o.items||[]).length ? o.items : items.filter(r => r.order_id===o.id).map(r => ({ name:r.item_name, qty:r.qty, price:r.price })); return list; };
  el.innerHTML = statChips([
      ['❌', orders.length, 'İptal edilen masa', 'var(--danger,#ef4444)'],
      ['🍽️', items.reduce((t, r) => t + Number(r.qty||0), 0), 'İptal edilen ürün (adet)', 'var(--c2)'],
      ['💸', money(orderTotal + partialTotal), 'İptal tutarı', 'var(--c3)'],
      ['👤', Object.keys(byStaff).length, 'İptal yapan personel', 'var(--c1)']
    ]) + (items.length || orders.length ? `<div class="ch-row">
      <div class="fs-panel pa-sec" style="--t:var(--danger,#ef4444);"><h3><i>🍽️</i>En Çok İptal Edilen Ürünler</h3>${items.length ? raceHtml(Object.entries(byProd).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v]) => ({ label:k, value:v, display:v+' adet' }))) : '<p class="muted">Ürün iptali yok.</p>'}</div>
      <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>👤</i>Personele Göre İptal Tutarı</h3>${raceHtml(Object.entries(byStaff).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v]) => ({ label:k, value:v, display:money(v) })))}</div>
    </div>` : '') + `
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--danger,#ef4444);">
      <h2>❌ İptal Edilen Masalar <small class="muted">${escapeHtml(reportDateRangeLabel())}</small></h2>
      ${orders.length ? `<div class="cx-grid">${orders.map((o, i) => { const li = orderItems(o); return `<div class="cx-card" style="--i:${Math.min(i,12)};">
        <div class="cx-top"><b>${escapeHtml(o.table_name||'—')}</b>${o.daily_number ? `<span class="pchip">#${o.daily_number}</span>` : ''}<span class="cx-amt">${money(o.total)}</span></div>
        <div class="cx-meta"><span>🕒 ${dt(o.at)}</span>${o.cancelled_by ? `<span>👤 ${escapeHtml(o.cancelled_by)}</span>` : ''}</div>
        ${li.length ? `<div class="cx-items">${li.map(x => `<span>${x.qty}× ${escapeHtml(x.name)}</span>`).join('')}</div>` : '<div class="cx-items muted"><span>Ürün girilmeden kapatıldı</span></div>'}
      </div>`; }).join('')}</div>` : '<p class="muted">Bu tarih aralığında iptal edilen masa yok.</p>'}
    </div>
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--c2);">
      <h2>🍽️ İptal Edilen Ürünler</h2>
      ${items.length ? `<div class="cx-list">${items.map(r => `<div class="cx-row">
        <span class="cx-q">${r.qty}×</span>
        <div class="cx-n"><b>${escapeHtml(r.item_name)}</b><small>${escapeHtml(r.table_name||'')} · ${dt(r.created_at)}${r.cancelled_by ? ' · 👤 ' + escapeHtml(r.cancelled_by) : ''}</small></div>
        <span class="pchip ${r.was_pending ? 'warn' : ''}">${r.was_pending ? '🍳 hazırlanırken' : '✓ hazırdı'}</span>
        <b class="cx-amt">${money(r.total)}</b></div>`).join('')}</div>` : '<p class="muted">Bu tarih aralığında iptal edilen ürün yok.</p>'}
    </div>`;
}
async function renderWasteContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('list_waste', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const rows = (data && data.rows) || [];
  const totalCost = (data && data.total_cost) || 0;
  el.innerHTML = `
    <div class="order-summary stat-chips" style="--n:3;"><div class="os-chip" style="--oc:var(--c1);"><span class="os-ic">🔥</span><div><b>${money(totalCost)}</b><small>Toplam İsraf Maliyeti</small></div></div><div class="os-chip" style="--oc:var(--c2);"><span class="os-ic">📦</span><div><b>${rows.reduce((s,r)=>s+Number(r.qty),0)}</b><small>İsraf Edilen Adet</small></div></div><div class="os-chip" style="--oc:var(--c3);"><span class="os-ic">🗂️</span><div><b>${rows.length}</b><small>Kayıt Sayısı</small></div></div></div>
    ${rows.length ? (() => { const g = {}, rs = {}; rows.forEach(r => { g[r.product_name] = (g[r.product_name]||0) + Number(r.total_cost||0); const k = r.reason || 'Belirtilmedi'; rs[k] = (rs[k]||0) + Number(r.total_cost||0); });
      return `<div class="ch-row"><div class="fs-panel pa-sec" style="--t:var(--danger,#ef4444);"><h3><i>🔥</i>En Çok İsraf Edilen</h3>${raceHtml(Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v]) => ({ label:k, value:v, display:money(v), side: v > 0 ? (totalCost ? '%'+Math.round(v/totalCost*100) : '') : '⚠️ maliyet yok' })))}${rows.some(r => !(Number(r.unit_cost) > 0)) ? '<p class="fs-note">⚠️ Maliyeti girilmemiş ürünlerin israfı 0 TL görünür. Ayarlar → Ürünler\'den ürünün maliyetini girin.</p>' : ''}</div>
        <div class="fs-panel pa-sec" style="--t:var(--c3);"><h3><i>❓</i>Sebeplere Göre</h3>${svgDonut(Object.entries(rs).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v], i) => ({ label:k, value:v, color:`var(--c${i+1})` })), { center: shortMoney(totalCost), sub:'₺ israf', money:true })}</div></div>`; })() : ''}
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--c1);">
      <h2>${escapeHtml(reportDateRangeLabel())} Tarihli İsraf Kayıtları</h2>
      <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>Ürün</th><th>Miktar</th><th>Birim Maliyet</th><th>Toplam Maliyet</th><th>Sebep</th><th>Personel</th><th>Tarih</th></tr></thead>
        <tbody>
        ${rows.map(r => `
          <tr>
            <td class="col-name">${escapeHtml(r.product_name)}</td>
            <td>${r.qty}</td>
            <td>${Number(r.unit_cost) > 0 ? money(r.unit_cost) : '<span class="pchip warn" title="Bu ürünün maliyeti girilmemiş; Ayarlar → Ürünler\'den maliyet girin">⚠️ maliyet yok</span>'}</td>
            <td style="color:var(--red);font-weight:700;">${money(r.total_cost)}</td>
            <td>${escapeHtml(r.reason||'-')}</td>
            <td>${escapeHtml(r.staff_name||'-')}</td>
            <td>${new Date(r.created_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}</td>
          </tr>`).join('')}
        ${rows.length===0?'<tr><td colspan="7" class="muted" style="text-align:center;">Bu tarih aralığında israf kaydı yok.</td></tr>':''}
        </tbody>
      </table>
      </div>
    </div>`;
}
async function saveTipPoolSettings(){
  const session = getSession();
  const enabled = document.getElementById('tipPoolEnabled').checked;
  const mode = document.getElementById('tipPoolMode').value;
  const { error } = await sb.rpc('update_tip_pool_settings', { p_token: session.session_token, p_enabled: enabled, p_mode: mode });
  if(error){ alert(error.message); return; }
  showToast('Bahşiş havuzu ayarları kaydedildi ✓');
  renderTipPoolContent(session);
}

/* --- Kapatılan hesap detayı: siparişin kalemleri, tutarlar ve fişi müşteriye
   fiş tasarımıyla e-posta gönderme (bkz. get_sale_detail, email_receipt). --- */
async function openSaleDetailModal(historyId){
  const session = getSession();
  const { data: d, error } = await withLoadingOverlay(sb.rpc('get_sale_detail', { p_token: session.session_token, p_history_id: historyId }));
  if(error){ alert(error.message); return; }
  const methods = { cash:'💵 Nakit', card:'💳 Kart', gift_card:'🎁 Hediye Kartı', split:'➗ Bölünmüş', open_account:'📒 Açık Hesap' };
  const label = d.kind==='takeaway' ? '📦 Paket' : (d.table_name || '-');
  const row = (k, v, strong) => `<div style="display:flex;justify-content:space-between;${strong?'font-weight:800;font-size:15px;margin-top:4px;':''}"><span>${k}</span><span>${v}</span></div>`;
  const bg = document.createElement('div');
  bg.id = 'saleDetailModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:300;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:420px;width:100%;max-height:88vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h2 style="margin:0;">${escapeHtml(label)}${d.order_no ? ' <span class="muted" style="font-size:13px;font-weight:600;">#'+d.order_no+'</span>' : ''}</h2>
      <span style="cursor:pointer;color:var(--muted);font-size:20px;" ${act('removeEl','saleDetailModalBg')}>✕</span>
    </div>
    <p class="muted" style="text-align:left;margin:4px 0 4px;font-size:12.5px;">🕒 Sipariş: ${d.ordered_at ? new Date(d.ordered_at).toLocaleString('tr-TR') : '—'} · ✓ Hazır: ${d.ready_at ? new Date(d.ready_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '—'} · 💳 Ödendi: ${new Date(d.closed_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</p>
    <p class="muted" style="text-align:left;margin:0 0 12px;font-size:12.5px;">${new Date(d.closed_at).toLocaleString('tr-TR')}${d.staff ? ' · 💳 Kasiyer: ' + escapeHtml(d.staff) : ''}${d.waiters ? ' · 👤 Garson: ' + escapeHtml(d.waiters) : ''}${d.customer ? ' · 👤 ' + escapeHtml(d.customer) : ''}</p>
    <div style="border-top:1px dashed var(--border);border-bottom:1px dashed var(--border);padding:8px 0;font-size:13.5px;">
      ${(d.items||[]).map(it => row(`${it.qty}x ${escapeHtml(it.name)}`, money(it.total))).join('') || '<p class="muted">Kalem bulunamadı.</p>'}
    </div>
    <div style="font-size:13.5px;padding-top:8px;">
      ${row('Ara Toplam', money(d.subtotal))}
      ${Number(d.discount)>0 ? row('İndirim', '-' + money(d.discount)) : ''}
      ${Number(d.tip)>0 ? row('Bahşiş', money(d.tip)) : ''}
      ${row('Toplam', money(d.total), true)}
      ${row('Ödeme', d.payment_method==='split' ? ('💵 ' + money(d.cash_amount||0) + ' + 💳 ' + money(d.card_amount||0)) : (methods[d.payment_method] || escapeHtml(d.payment_method||'')))}
    </div>
    ${(d.emails||[]).length ? `<p class="muted" style="text-align:left;font-size:12px;margin-top:10px;">Daha önce gönderildi: ${d.emails.map(e => escapeHtml(e.email)).join(', ')}</p>` : ''}
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;">
      <label style="font-size:12.5px;font-weight:700;color:var(--muted);">Fişi e-postayla gönder</label>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <input id="saleReceiptEmail" type="email" placeholder="musteri@ornek.com" autocapitalize="none" style="flex:1;margin:0;">
        <button type="button" id="saleReceiptBtn" style="width:auto;margin:0;" ${act('sendSaleReceipt', historyId)}>📧 Gönder</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(bg);
}
async function sendSaleReceipt(historyId){
  const email = document.getElementById('saleReceiptEmail').value.trim();
  if(!email){ showToast('E-posta adresi girin'); return; }
  const btn = document.getElementById('saleReceiptBtn');
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  const session = getSession();
  const { error } = await sb.rpc('email_receipt', { p_token: session.session_token, p_history_id: historyId, p_email: email });
  btn.disabled = false; btn.textContent = '📧 Gönder';
  if(error){ alert(error.message); return; }
  showToast('📧 Fiş ' + email + ' adresine gönderildi');
  const bg = document.getElementById('saleDetailModalBg'); if(bg) bg.remove();
}

/* --- Rezervasyon Analizi: seçilen tarih aralığındaki rezervasyonlar ve
   bekleme listesi — kaç kişi geldi, hangi masalar, rezervasyon saatine göre
   geliş, sipariş tutarları (bkz. get_reservation_analytics; ciro, rezervasyon
   ya da bekleme listesinden açılan masaların kapanan hesaplarından). --- */
async function renderReservationAnalyticsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_reservation_analytics', { p_token: session.session_token, p_from: APP.reportDate, p_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  APP.resvAn = data;
  APP.resvAnFilter = null;
  drawResvAnalytics();
}
function setResvAnSub(sub){ APP.resvAnSub = sub; APP.resvAnFilter = null; drawResvAnalytics(); }
function setResvAnFilter(key, label){
  APP.resvAnFilter = APP.resvAnFilter && APP.resvAnFilter.key===key ? null : { key, label };
  drawResvAnalytics();
  const list = document.getElementById('resvAnList');
  if(list && APP.resvAnFilter) list.scrollIntoView({ behavior:'smooth', block:'start' });
}
/* Tıklanabilir istatistik kartı: basınca alttaki liste o kayıtlarla filtrelenir. */
function resvAnCard(label, value, color, key){
  const active = APP.resvAnFilter && APP.resvAnFilter.key===key;
  return `<div class="os-chip os-click resv-an-card ${active?'active on':''}" style="--oc:${color||'var(--c1)'};" ${act('setResvAnFilter', key, label)} title="Listelemek için tıklayın">
    <div style="min-width:0;"><small>${escapeHtml(label)}</small><b style="${color?'color:'+color+';':''}">${value}</b><small class="resv-an-card-hint">${active ? '✓ Listeleniyor' : 'Listele ›'}</small></div>
  </div>`;
}
// Rezervasyon/bekleme kaydına bağlı kapanan hesap(lar)ın detayını açar.
function resvDetailBtn(r){
  const ids = r.history_ids || [];
  if(!ids.length) return '<span class="muted">-</span>';
  return `<button type="button" class="sbtn" style="width:auto;margin:0;white-space:nowrap;" ${act('openResvOrderDetail', ids)}>🔍 Detay${ids.length>1 ? ' ('+ids.length+')' : ''}</button>`;
}
function openResvOrderDetail(ids){
  if(ids.length === 1) return openSaleDetailModal(ids[0].id);
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  ov.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:420px;width:100%;max-height:88vh;overflow:auto;"><h2 style="margin-top:0;">Hesaplar</h2>
    ${ids.map(h => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span>${new Date(h.closed_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} · <b>${money(h.total)}</b></span>
      <button type="button" class="sbtn" style="width:auto;margin:0;" data-id="${escapeAttr(h.id)}">🔍 Detay</button></div>`).join('')}
    <button class="secondary" style="margin-top:12px;" data-close>Kapat</button></div>`;
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if(b){ ov.remove(); openSaleDetailModal(b.dataset.id); }
    else if(e.target === ov || e.target.closest('[data-close]')) ov.remove();
  });
  document.body.appendChild(ov);
}
function drawResvAnalytics(){
  const el = document.getElementById('reportContent'); const data = APP.resvAn; if(!el || !data) return;
  const sub = APP.resvAnSub || 'resv';
  const f = APP.resvAnFilter;
  const sm = data.summary || {}, wl = data.waitlist || {};
  const pct = (a, b) => b > 0 ? Math.round(a / b * 100) + '%' : '—';
  const hm = (iso) => iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : '-';
  const dt = (iso) => new Date(iso).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit' });
  const small = (t) => ` <span style="font-size:13px;font-weight:600;color:var(--muted);">${t}</span>`;
  const diffTxt = (d) => d==null ? '<span class="muted">-</span>'
    : d > 5 ? `<span style="color:var(--red);font-weight:700;">${d} dk geç</span>`
    : d < -5 ? `<span style="color:var(--green);font-weight:700;">${-d} dk erken</span>`
    : '<span style="color:var(--green);font-weight:700;">Zamanında</span>';
  const tabs = `<div class="sub-tabs">
    <div role="tab" tabindex="0" class="sub-tab ${sub==='resv'?'active':''}" ${act('setResvAnSub', 'resv')}><span class="sub-tab-ic">📅</span>Rezervasyonlar <span class="muted" style="font-weight:600;">${sm.total||0}</span></div>
    <div role="tab" tabindex="0" class="sub-tab ${sub==='wl'?'active':''}" ${act('setResvAnSub', 'wl')}><span class="sub-tab-ic">⏳</span>Bekleme Listesi <span class="muted" style="font-weight:600;">${wl.total||0}</span></div>
  </div>`;
  const filterBar = (count) => f ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px;">
      <span class="role-badge" style="color:var(--accent);border-color:var(--accent);">Filtre: ${escapeHtml(f.label)} · ${count} kayıt</span>
      <a href="#" style="color:var(--accent);font-size:13px;" ${act('setResvAnFilter', f.key)}>✕ Filtreyi kaldır</a></div>` : '';
  const head = `<p class="muted" style="text-align:left;margin:0 0 12px;">${escapeHtml(reportDateRangeLabel())} · Kartlara, saatlere ve masalara tıklayarak ilgili kayıtları listeleyin. Ciro, oturtulan masaların kapanan hesaplarından hesaplanır.</p>`;

  if(sub==='wl'){
    const all = data.waitlist_rows || [];
    const match = (r) => !f ? true
      : f.key==='seated' ? r.status==='seated'
      : f.key==='left' ? r.status==='cancelled'
      : f.key==='waiting' ? r.status==='waiting'
      : f.key==='late' ? (r.status==='seated' && r.quoted!=null && Number(r.waited) > Number(r.quoted))
      : f.key==='revenue' ? Number(r.revenue) > 0
      : f.key.startsWith('table:') ? (r.table_name||'—')===f.key.slice(6)
      : true;
    const rows = all.filter(match);
    el.innerHTML = head + tabs + `
      <div class="home-grid" style="margin-top:0;margin-bottom:18px;">
        ${resvAnCard('Listeye Alınan', wl.total||0, null, 'all')}
        ${resvAnCard('Oturan', (wl.seated||0) + small('(' + pct(wl.seated||0, wl.total||0) + ')'), 'var(--green)', 'seated')}
        ${resvAnCard('Beklemeden Ayrılan', wl.left||0, (wl.left||0) > 0 ? 'var(--red)' : null, 'left')}
        ${(wl.waiting||0) > 0 ? resvAnCard('Hâlâ Bekleyen', wl.waiting, null, 'waiting') : ''}
        ${resvAnCard('Oturan Misafir', (wl.guests_seated||0) + ' kişi', null, 'seated')}
        ${resvAnCard('Ort. Bekleme', wl.avg_wait!=null ? wl.avg_wait + ' dk' + (wl.avg_quoted!=null ? small('(tahmin ' + wl.avg_quoted + ')') : '') : '—', null, 'seated')}
        ${resvAnCard('Tahminden Geç Oturtulan', wl.late||0, (wl.late||0) > 0 ? 'var(--red)' : null, 'late')}
        ${resvAnCard('Bekleme Listesi Cirosu', money(wl.revenue||0), 'var(--accent)', 'revenue')}
      </div>
      <h3 id="resvAnList" style="margin:0 0 10px;">📋 Bekleme Listesi Kayıtları</h3>
      ${filterBar(rows.length)}
      ${rows.length ? `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Müşteri</th><th>Kişi</th><th>Katılım</th><th>Sonuç</th><th>Masa</th><th>Bekleme</th><th>Tahmine göre</th><th>Sipariş</th><th></th></tr></thead><tbody>
        ${rows.map(r => {
          const d = (r.status==='seated' && r.quoted!=null) ? Number(r.waited) - Number(r.quoted) : null;
          return `<tr>
          <td class="col-name">${escapeHtml(r.customer_name)}${r.phone ? `<div class="muted" style="font-size:11.5px;">${phoneHtml(r.phone)}</div>` : ''}</td>
          <td>${r.party_size}</td>
          <td>${dt(r.joined_at)} ${hm(r.joined_at)}</td>
          <td>${r.status==='seated' ? '✅ Oturdu ' + hm(r.seated_at) : r.status==='cancelled' ? `<span style="color:var(--red);">✕ Ayrıldı ${hm(r.left_at)}</span>` : '<span class="muted">Bekliyor</span>'}</td>
          <td>${r.table_name ? `<b>${escapeHtml(r.table_name)}</b>` : '<span class="muted">—</span>'}</td>
          <td>${r.waited!=null ? r.waited + ' dk' : '-'}${r.quoted!=null ? `<div class="muted" style="font-size:11px;">tahmin ${r.quoted}</div>` : ''}</td>
          <td>${d==null ? '<span class="muted">-</span>' : d > 0 ? `<span style="color:var(--red);font-weight:700;">${d} dk geç</span>` : d < 0 ? `<span style="color:var(--green);font-weight:700;">${-d} dk erken</span>` : '<span style="color:var(--green);font-weight:700;">Tam zamanında</span>'}</td>
          <td>${Number(r.revenue) > 0 ? money(r.revenue) : '<span class="muted">-</span>'}</td>
          <td>${resvDetailBtn(r)}</td>
        </tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">Kayıt yok.</p>'}`;
    return;
  }

  const all = data.rows || [];
  const match = (r) => !f ? true
    : f.key==='seated' ? r.status==='seated'
    : f.key==='missed' ? (r.status==='no_show' || r.status==='cancelled')
    : f.key==='upcoming' ? (r.status==='pending' || r.status==='confirmed')
    : f.key==='revenue' ? Number(r.revenue) > 0
    : f.key==='on_time' ? (r.arrival_diff!=null && Math.abs(r.arrival_diff) <= 5)
    : f.key==='early' ? r.arrival_diff < -5
    : f.key==='late' ? r.arrival_diff > 5
    : f.key.startsWith('hour:') ? new Date(r.reservation_time).getHours()===Number(f.key.slice(5))
    : f.key.startsWith('table:') ? (r.table_name||'—')===f.key.slice(6) && r.status==='seated'
    : true;
  const rows = all.filter(match);
  const byHour = data.by_hour || [];
  const maxH = Math.max(1, ...byHour.map(h => h.guests || 0));
  const statusTxt = { pending:'Bekliyor', confirmed:'Onaylı', seated:'✅ Geldi', cancelled:'✕ İptal', no_show:'🚫 Gelmedi' };
  const isF = (k) => f && f.key===k;
  el.innerHTML = head + tabs + `
    <div class="home-grid" style="margin-top:0;margin-bottom:16px;">
      ${resvAnCard('Toplam Rezervasyon', sm.total||0, null, 'all')}
      ${resvAnCard('Gelen', (sm.seated||0) + small('(' + pct(sm.seated||0, sm.total||0) + ')'), 'var(--green)', 'seated')}
      ${resvAnCard('Gelmedi / İptal', (sm.no_show||0) + ' / ' + (sm.cancelled||0), (sm.no_show||0) > 0 ? 'var(--red)' : null, 'missed')}
      ${(sm.pending||0) > 0 ? resvAnCard('Yaklaşan', sm.pending, null, 'upcoming') : ''}
      ${resvAnCard('Gelen Misafir', (sm.guests_seated||0) + small('/ ' + (sm.guests_booked||0) + ' kişi rezerve'), null, 'seated')}
      ${resvAnCard('Ort. Kişi', sm.avg_party ?? '—', null, 'all')}
      ${resvAnCard('Rezervasyon Cirosu', money(sm.revenue||0), 'var(--accent)', 'revenue')}
      ${resvAnCard('Ort. Sipariş (masa)', sm.avg_order!=null ? money(sm.avg_order) : '—', null, 'revenue')}
      ${resvAnCard('Kişi Başı Harcama', sm.avg_per_guest!=null ? money(sm.avg_per_guest) : '—', null, 'revenue')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:18px;">
      <div class="fs-panel pa-sec" style="--t:var(--c2);margin:0;">
        <h3 style="margin:0 0 10px;">⏰ Rezervasyon Saatine Göre Geliş</h3>
        <p style="margin:0 0 8px;">Ortalama: ${sm.avg_arrival_diff==null ? '<span class="muted">veri yok</span>' : diffTxt(sm.avg_arrival_diff)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:13px;">
          <span class="role-badge resv-an-chip ${isF('on_time')?'active':''}" style="color:var(--green);border-color:var(--green);" ${act('setResvAnFilter', 'on_time', 'Zamanında gelenler')}>Zamanında (±5 dk): ${sm.on_time||0}</span>
          <span class="role-badge resv-an-chip ${isF('early')?'active':''}" style="color:var(--green);border-color:var(--green);" ${act('setResvAnFilter', 'early', 'Erken gelenler')}>Erken: ${sm.early||0}</span>
          <span class="role-badge resv-an-chip ${isF('late')?'active':''}" style="color:var(--red);border-color:var(--red);" ${act('setResvAnFilter', 'late', 'Geç gelenler')}>Geç: ${sm.late||0}</span>
        </div>
        <p class="muted" style="font-size:11.5px;text-align:left;margin:8px 0 0;">Geliş saati, rezervasyon "Oturdu" yapıldığında kaydedilir.</p>
      </div>
      <div class="fs-panel pa-sec" style="--t:var(--c2);margin:0;">
        <h3 style="margin:0 0 10px;">🕐 Saatlere Göre Yoğunluk</h3>
        ${byHour.length ? `<div class="race">${byHour.map((h, i) => `<div class="race-row resv-an-row ${isF('hour:'+h.hour)?'active':''}" style="--i:${Math.min(i,15)};--sc:${RACE_COLORS[i%RACE_COLORS.length]};cursor:pointer;" ${act('setResvAnFilter', 'hour:'+h.hour, String(h.hour).padStart(2,'0')+':00 rezervasyonları')}>
          <span class="race-rank">🕐</span>
          <div class="race-main"><div class="race-label"><b>${String(h.hour).padStart(2,'0')}:00</b><small>${h.count} rezervasyon</small></div>
          <div class="race-track"><div class="race-bar" style="width:${Math.max(3, Math.round((h.guests||0)/maxH*100))}%;"><span>${h.guests} kişi</span></div></div></div>
          <span class="race-side">${h.count} rez<small>${h.guests} kişi</small></span></div>`).join('')}</div>` : '<p class="muted">Veri yok.</p>'}
      </div>
    </div>
    <h3 style="margin:0 0 10px;">🪑 Masalara Göre</h3>
    ${(data.by_table||[]).length ? `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Masa</th><th>Rezervasyon</th><th>Misafir</th><th>Ciro</th></tr></thead><tbody>
      ${data.by_table.map(t => `<tr class="resv-an-row ${isF('table:'+t.table)?'active':''}" ${act('setResvAnFilter', 'table:'+t.table, t.table + ' rezervasyonları')}><td class="col-name"><b>${escapeHtml(t.table)}</b> <span class="muted" style="font-size:11.5px;">Listele ›</span></td><td>${t.count}</td><td>${t.guests}</td><td>${money(t.revenue||0)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu aralıkta gelen rezervasyon yok.</p>'}
    <h3 id="resvAnList" style="margin:18px 0 10px;">📋 Rezervasyon Detayları</h3>
    ${filterBar(rows.length)}
    ${rows.length ? `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Müşteri</th><th>Kişi</th><th>Rezervasyon</th><th>Geliş</th><th>Saate göre</th><th>Masa</th><th>Durum</th><th>Sipariş</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td class="col-name">${escapeHtml(r.customer_name)}${r.phone ? `<div class="muted" style="font-size:11.5px;">${phoneHtml(r.phone)}</div>` : ''}${r.notes ? `<div class="muted" style="font-size:11px;overflow-wrap:anywhere;">${escapeHtml(r.notes)}</div>` : ''}</td>
        <td>${r.party_size}</td>
        <td>${dt(r.reservation_time)} ${hm(r.reservation_time)}</td>
        <td>${r.seated_at ? hm(r.seated_at) : '<span class="muted">-</span>'}</td>
        <td>${diffTxt(r.arrival_diff)}</td>
        <td>${r.table_name ? `<b>${escapeHtml(r.table_name)}</b>` : '<span class="muted">—</span>'}</td>
        <td>${statusTxt[r.status] || escapeHtml(r.status)}</td>
        <td>${Number(r.revenue) > 0 ? money(r.revenue) + (r.party_size ? `<div class="muted" style="font-size:11px;">kişi başı ${money(r.revenue / r.party_size)}</div>` : '') : '<span class="muted">-</span>'}</td>
        <td>${resvDetailBtn(r)}</td>
      </tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Kayıt yok.</p>'}`;
}

/* ---- Açık Hesaplar: toplam açık bakiye, dönemde açık hesaba yazılan / tahsil edilen,
   hesap bazında bakiye ve hareket geçmişi; buradan tahsilat da alınır. ---- */
async function renderOpenAccountsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_open_accounts_report', { p_token: session.session_token, p_from: APP.reportDate, p_to: APP.reportDateTo || APP.reportDate }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  APP.openAccReport = data;
  const accs = data.accounts || [];
  const open = accs.filter(a => a.balance > 0.009);
  const card = (label, val, color) => `<div class="box" style="flex:1;min-width:180px;margin:0;"><div class="muted" style="font-size:12.5px;">${label}</div><div style="font-size:24px;font-weight:800;${color ? 'color:'+color+';' : ''}">${val}</div></div>`;
  const methodTxt = m => m === 'cash' ? 'Nakit' : m === 'card' ? 'Kart' : m === 'open_account' ? 'Açık hesaba yazıldı' : (m || '');
  const maxBal = Math.max(1, ...accs.map(a => Number(a.balance)||0));
  el.innerHTML = statChips([['📒', money(data.total_balance), 'Toplam açık bakiye', data.total_balance > 0 ? 'var(--danger,#ef4444)' : 'var(--c1)'],
      ['✍️', money(data.period_charges), 'Bu dönemde yazılan', 'var(--c3)'], ['✅', money(data.period_payments), 'Bu dönemde tahsil', 'var(--ok,#22c55e)'],
      ['👥', open.length + ' / ' + accs.length, 'Borcu olan hesap', 'var(--c2)']]) + `
    <div class="fs-panel pa-sec" style="--t:var(--c1);">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;"><h3 style="margin:0;"><i>📒</i>Hesaplar</h3><span style="flex:1;"></span>
        <input class="list-search" placeholder="🔍 Hesap ara…" ${actOn('input','filterOpenAccRows',['$value'])} style="max-width:280px;margin:0;"></div>
      ${accs.length ? `<div class="oa-grid" id="openAccTable">${accs.slice().sort((x, y) => (y.balance||0) - (x.balance||0)).map((a, i) => { const debt = a.balance > 0.009;
        return `<div class="oa-card ${debt?'debt':'clear'}" data-oa="${escapeAttr(a.name.toLocaleLowerCase('tr') + ' ' + (a.phone||''))}" style="--i:${Math.min(i,12)};">
          <div class="cu-top">${avatarHtml(a.name)}<div class="cu-id"><b>${escapeHtml(a.name)}</b><small>${escapeHtml([a.phone, a.note].filter(Boolean).join(' · ') || 'Açık hesap')}</small></div>
            <span class="oa-st">${debt ? '● Borçlu' : '✓ Kapalı'}</span></div>
          <div class="oa-bal"><b>${money(a.balance)}</b><small>bakiye</small></div>
          <div class="pcard-mbar"><i style="width:${debt ? Math.max(4, Math.round(a.balance/maxBal*100)) : 0}%;background:var(--danger,#ef4444);"></i></div>
          <div class="pcard-chips">
            <span class="pchip">✍️ ${money(a.period_charges)}</span><span class="pchip">✅ ${money(a.period_payments)}</span>
            ${a.last_charge_at ? `<span class="pchip">📅 son yazım ${new Date(a.last_charge_at).toLocaleDateString('tr-TR')}</span>` : ''}
            ${a.last_payment_at ? `<span class="pchip">💵 son tahsilat ${new Date(a.last_payment_at).toLocaleDateString('tr-TR')}</span>` : ''}
          </div>
          <div class="pcard-acts">
            ${debt ? `<button type="button" class="pc-btn pc-edit" style="margin-left:0;" ${act('collectOpenAccount', a.id)}>₺ Tahsilat Al</button>` : ''}
            <button type="button" class="pc-btn" style="margin-left:auto;" ${act('showOpenAccEntries', a.id)}>🔍 Detay</button>
          </div>
        </div>`; }).join('')}</div>` : '<div class="empty-state"><div style="font-size:38px;">📒</div><p class="muted">Henüz açık hesap yok. Ödeme ekranında "📒 Açık Hesaba At" ile oluşturabilirsiniz.</p></div>'}
    </div>
    <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🕘</i>Dönem Hareketleri</h3>
      ${(data.entries||[]).length ? `<div class="sp-log">${data.entries.map((e, i) => { const ch = e.kind === 'charge';
        return `<div class="sp-li oa-li ${ch?'ch':'pay'}" style="--i:${Math.min(i,12)};"><span class="sp-dot"></span>
          <span class="oa-ic">${ch ? '📒' : '✅'}</span>
          <div class="cu-id"><b>${escapeHtml(e.account_name)} · ${ch ? 'Hesaba yazıldı' : 'Tahsilat (' + methodTxt(e.method) + ')'}</b>
            <small>${new Date(e.created_at).toLocaleString('tr-TR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })} · ${escapeHtml([e.table_name, e.note].filter(Boolean).join(' · ') || '—')} · ${escapeHtml(e.staff || '—')}</small></div>
          <b class="oa-amt">${ch ? '+' : '−'}${money(e.amount)}</b>
          ${e.sales_history_id ? `<button type="button" class="pc-btn" ${act('openSaleDetailModal', e.sales_history_id)}>🔍 Detay</button>` : ''}
        </div>`; }).join('')}</div>` : '<div class="empty-state"><div style="font-size:38px;">🕘</div><p class="muted">Bu dönemde hareket yok.</p></div>'}
    </div>`;
}
function filterOpenAccRows(q){
  q = String(q||'').trim().toLocaleLowerCase('tr');
  document.querySelectorAll('#openAccTable [data-oa]').forEach(tr => { tr.style.display = !q || tr.dataset.oa.includes(q) ? '' : 'none'; });
}
/* Hesap hareketleri (tüm zamanlar): her yazımda siparişin detayı açılabilir. */
async function showOpenAccEntries(id){
  const d = APP.openAccReport || {}; const a = (d.accounts||[]).find(x => x.id===id); if(!a) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_open_account_entries', { p_token: getSession().session_token, p_account_id: id }));
  if(error){ alert(error.message); return; }
  const rows = data || [];
  const charged = rows.filter(e => e.kind === 'charge').reduce((t, e) => t + Number(e.amount||0), 0);
  const paid = rows.filter(e => e.kind !== 'charge').reduce((t, e) => t + Number(e.amount||0), 0);
  const debt = a.balance > 0.009;
  const old = document.getElementById('oaEntriesModalBg'); if(old) old.remove();
  const w = document.createElement('div'); w.id = 'oaEntriesModalBg'; w.className = 'pdrawer-wrap';
  w.innerHTML = `<div class="pdrawer-bg" ${act('removeEl','oaEntriesModalBg')}></div>
    <aside class="pdrawer oa-drawer">
      <div class="pdrawer-head">${avatarHtml(a.name)}<div><small class="muted">Açık hesap</small><h3>${escapeHtml(a.name)}</h3>${a.phone ? `<small class="muted">${phoneHtml(a.phone)}</small>` : ''}</div>
        <button type="button" class="pdrawer-x" ${act('removeEl','oaEntriesModalBg')}>✕</button></div>
      <div class="pdrawer-body">
        <div class="oad-bal ${debt?'debt':''}"><small>Güncel bakiye</small><b>${money(a.balance)}</b><span>${debt ? '● Borçlu' : '✓ Hesap kapalı'}</span></div>
        <div class="oad-sum"><div><small>Toplam yazılan</small><b class="r">+${money(charged)}</b></div><div><small>Toplam tahsil</small><b class="g">−${money(paid)}</b></div><div><small>Hareket</small><b>${rows.length}</b></div></div>
        ${a.note ? `<div class="kc-note" style="margin:0 0 8px;">📝 ${escapeHtml(a.note)}</div>` : ''}
        <div class="rv-day-h" style="margin:8px 0 10px;">Hareketler<span class="muted">${rows.length}</span></div>
        ${rows.length ? `<div class="sp-log">${rows.map((e, i) => { const ch = e.kind === 'charge';
          return `<div class="sp-li oa-li ${ch?'ch':'pay'}" style="--i:${Math.min(i,12)};flex-wrap:wrap;"><span class="sp-dot"></span>
            <span class="oa-ic">${ch ? '📒' : '✅'}</span>
            <div class="cu-id"><b>${ch ? 'Hesaba yazıldı' + (e.item_count ? ' · ' + e.item_count + ' ürün' : '') : 'Tahsilat' + (e.method ? ' (' + (e.method==='cash'?'Nakit':e.method==='card'?'Kart':escapeHtml(e.method)) + ')' : '')}</b>
              <small>${new Date(e.created_at).toLocaleString('tr-TR', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}${e.table_name ? ' · ' + escapeHtml(e.table_name) : ''}${e.staff ? ' · ' + escapeHtml(e.staff) : ''}${e.note ? ' · ' + escapeHtml(e.note) : ''}</small></div>
            <b class="oa-amt">${ch ? '+' : '−'}${money(e.amount)}</b>
            ${e.sales_history_id ? `<button type="button" class="pc-btn oad-toggle" ${act('toggleOaSale', e.sales_history_id, 'oas_'+i)}>🧾 Ürünler</button><div class="oad-items" id="oas_${i}" hidden></div>` : ''}
          </div>`; }).join('')}</div>` : '<div class="empty-state"><div style="font-size:34px;">🕘</div><p class="muted">Hareket yok.</p></div>'}
      </div>
      <div class="pdrawer-foot">${debt ? `<button type="button" ${act('collectOpenAccount', a.id)}>₺ Tahsilat Al</button>` : ''}<button type="button" class="ghost-btn" ${act('removeEl','oaEntriesModalBg')}>Kapat</button></div>
    </aside>`;
  document.body.appendChild(w);
  requestAnimationFrame(() => w.classList.add('open'));
}
/* Açık hesap hareketinin sipariş kalemlerini panelin içinde açar/kapatır. */
async function toggleOaSale(historyId, boxId){
  const box = document.getElementById(boxId); if(!box) return;
  if(!box.hidden){ box.hidden = true; return; }
  if(!box.dataset.loaded){
    box.innerHTML = '<p class="muted" style="margin:0;">Yükleniyor…</p>'; box.hidden = false;
    const { data: d, error } = await sb.rpc('get_sale_detail', { p_token: getSession().session_token, p_history_id: historyId });
    if(error){ box.innerHTML = '<p class="muted" style="margin:0;">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
    box.dataset.loaded = '1';
    box.innerHTML = (d.items||[]).map(it => `<div><span>${it.qty}× ${escapeHtml(it.name)}</span><b>${money(it.total)}</b></div>`).join('')
      + (Number(d.discount) > 0 ? `<div class="muted"><span>İndirim</span><b>−${money(d.discount)}</b></div>` : '')
      + `<div class="oad-tot"><span>Toplam</span><b>${money(d.total)}</b></div>`
      + `<button type="button" class="pc-btn" style="margin-top:6px;" ${act('openSaleDetailModal', historyId)}>🔍 Tam fiş detayı</button>`;
  }
  box.hidden = false;
}
async function collectOpenAccount(id){
  { const dr = document.getElementById('oaEntriesModalBg'); if(dr) dr.remove(); }
  const a = ((APP.openAccReport||{}).accounts||[]).find(x => x.id===id); if(!a) return;
  const v = await uiPrompt('"' + a.name + '" hesabından tahsil edilecek tutar (bakiye ' + money(a.balance) + '):', String(Math.round(a.balance*100)/100));
  if(v === null) return;
  const amount = parseFloat(String(v).replace(',', '.'));
  if(!(amount > 0)){ alert('Geçerli bir tutar girin'); return; }
  const method = await uiConfirm('Tahsilat nasıl alındı?', { title:'Ödeme yöntemi', icon:'💳', okText:'💳 Kart', cancelText:'💵 Nakit' }) ? 'card' : 'cash';
  const { error } = await withLoadingOverlay(sb.rpc('collect_open_account', { p_token: getSession().session_token, p_account_id: id, p_amount: amount, p_method: method }));
  if(error){ alert(error.message); return; }
  showToast('✅ ' + money(amount) + ' tahsil edildi');
  renderOpenAccountsContent(getSession());
}

/* KDV raporu: seçili tarih aralığındaki satışlar KDV oranına göre (fiyatlar KDV dahil).
   İndirimler kalemlere orantılı dağıtılır, bahşiş KDV'ye dahil edilmez. Muhasebeciye
   ve beyanname için özet; resmi belge yerine geçmez. */
async function renderVatReportContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_vat_report', { p_token: session.session_token, p_from: APP.reportDate, p_to: APP.reportDateTo || APP.reportDate }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  APP.vatReport = data;
  const rates = data.rates || [];
  const gross = rates.reduce((s, r) => s + Number(r.gross), 0);
  el.innerHTML = `
    <div class="order-summary stat-chips" style="--n:4;"><div class="os-chip" style="--oc:var(--c1);"><span class="os-ic">🧾</span><div><b>${money(gross)}</b><small>KDV Dahil Satış</small></div></div><div class="os-chip" style="--oc:var(--c2);"><span class="os-ic">📄</span><div><b>${money(data.base_total)}</b><small>Matrah (KDV Hariç)</small></div></div><div class="os-chip" style="--oc:var(--c3);"><span class="os-ic">🏛️</span><div><b>${money(data.vat_total)}</b><small>Hesaplanan KDV</small></div></div><div class="os-chip" style="--oc:var(--c4);"><span class="os-ic">🍽️</span><div><b>${data.sales_count}</b><small>Satış (Adisyon)</small></div></div></div>
    ${rates.length ? `<div class="ch-row"><div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>🏛️</i>Orana Göre KDV</h3>${raceHtml(rates.map(r => ({ label:'%' + r.rate + ' KDV', value:Number(r.vat), display:money(r.vat), side:money(r.gross), sub:'matrah ' + money(r.base) })))}</div>
      <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🍩</i>Satış Dağılımı</h3>${svgDonut(rates.map((r, i) => ({ label:'%' + r.rate, value:Number(r.gross), color:`var(--c${i%4+1})` })), { center: shortMoney(gross), sub:'₺ KDV dahil', money:true })}</div></div>` : ''}
    <div class="fs-panel pa-sec rp-panel" style="--t:var(--c2);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <h2 style="margin:0;">KDV Oranlarına Göre · ${escapeHtml(reportDateRangeLabel())}</h2>
        <button type="button" class="ghost-btn" style="width:auto;margin:0;" ${act('exportVatReportCsv')}>⬇️ Dışa aktar</button>
      </div>
      <div class="settings-table-wrap" style="margin-top:10px;"><table class="settings-table">
        <thead><tr><th>KDV Oranı</th><th>KDV Dahil Tutar</th><th>Matrah</th><th>KDV</th></tr></thead>
        <tbody>${rates.map(r => `<tr><td><b>%${r.rate}</b></td><td>${money(r.gross)}</td><td>${money(r.base)}</td><td>${money(r.vat)}</td></tr>`).join('')}
        ${rates.length ? `<tr style="font-weight:800;"><td>Toplam</td><td>${money(gross)}</td><td>${money(data.base_total)}</td><td>${money(data.vat_total)}</td></tr>` : '<tr><td colspan="4" class="muted" style="text-align:center;">Bu tarihlerde satış yok.</td></tr>'}
        </tbody></table></div>
      <p class="muted" style="font-size:12px;text-align:left;margin:10px 0 0;">Fiyatlar KDV dahildir; indirimler ürünlere orantılı dağıtılır, bahşiş dahil edilmez. Ürün oranları <b>Ayarlar › Ürünler</b>'den belirlenir. Bu özet muhasebe içindir, resmi belge (ÖKC/e-Arşiv) yerine geçmez.</p>
    </div>`;
}
function exportVatReportCsv(){
  const d = APP.vatReport; if(!d) return;
  const n = (x) => Number(x).toFixed(2).replace('.', ','); // Türkçe Excel ondalık virgül bekler
  const rows = [['KDV Oranı','KDV Dahil Tutar','Matrah','KDV']].concat((d.rates||[]).map(r => ['%' + r.rate, n(r.gross), n(r.base), n(r.vat)]));
  rows.push(['Toplam', n((d.rates||[]).reduce((s, r) => s + Number(r.gross), 0)), n(d.base_total), n(d.vat_total)]);
  if(typeof downloadCsv === 'function') downloadCsv('kdv-' + d.from + (d.to !== d.from ? '_' + d.to : '') + '.csv', rows);
}

function setReportsGateScreen(s){ APP.reportsGateScreen = s; renderReportsGate(document.getElementById('main'), getSession()); }
function setReportBillsFilter(k, v){ APP.reportBillsFilter[k] = v; renderReportTabContent(getSession()); }
function resetReportBillsFilter(){ APP.reportBillsFilter = { hour:'', table:'', method:'', source:'' }; renderReportTabContent(getSession()); }
function setProductStatsOpt(k, v){ APP[k] = v; renderProductStatsContent(getSession()); }

/* Gün × saat yoğunluk ısı haritası (kapatılan hesapların kapanış saatine göre). */
function heatmapHtml(hist){
  if(!hist.length) return '';
  const DAYS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'], g = {}; let max = 0, lo = 23, hi = 0;
  hist.forEach(o => { const d = new Date(o.closed_at), dw = (d.getDay()+6)%7, h = d.getHours(), k = dw+'_'+h;
    g[k] = g[k] || { r:0, c:0 }; g[k].r += Number(o.total)||0; g[k].c++; max = Math.max(max, g[k].r); lo = Math.min(lo, h); hi = Math.max(hi, h); });
  const hrs = []; for(let h = lo; h <= hi; h++) hrs.push(h);
  const usedDays = DAYS.map((n, i) => i).filter(i => hrs.some(h => g[i+'_'+h]));
  return `<div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>🔥</i>Yoğunluk Haritası <span class="muted" style="font-size:12px;font-weight:400;">gün × saat · koyu = yoğun</span></h3>
    <div class="hm" style="--cols:${hrs.length};">
      <span></span>${hrs.map(h => `<span class="hm-h">${String(h).padStart(2,'0')}</span>`).join('')}
      ${usedDays.map((di, ri) => `<span class="hm-d">${DAYS[di]}</span>${hrs.map((h, ci) => { const c = g[di+'_'+h], v = c ? c.r/max : 0;
        return `<span class="hm-c ${ri===0?'hm-top':''}" tabindex="0" style="--v:${v.toFixed(3)};--i:${ri*hrs.length+ci};">${c ? `<em>${DAYS[di]} ${String(h).padStart(2,'0')}:00<br><b>${escapeHtml(money(c.r))}</b><br>${c.c} hesap</em>` : ''}</span>`; }).join('')}`).join('')}
    </div>
    <div class="hm-leg"><small>Az</small><i></i><small>Çok</small></div></div>`;
}
/* Genel Özet ekleri: önceki döneme göre değişim, son 7 gün mini grafiği ve günlük hedef halkası. */
async function loadFsExtras(session, curRevenue){
  const dstr = (d) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const from = new Date(APP.reportDate+'T00:00'), to = new Date((APP.reportDateTo||APP.reportDate)+'T00:00');
  const len = Math.round((to - from)/864e5) + 1;
  const prevFrom = new Date(from); prevFrom.setDate(prevFrom.getDate() - len);
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1);
  const sparkFrom = new Date(to); sparkFrom.setDate(sparkFrom.getDate() - 6);
  const extFrom = prevFrom < sparkFrom ? prevFrom : sparkFrom;
  const today = todayLocalDateStr();
  const [ext, goalRes, todayRes] = await Promise.all([
    sb.rpc('get_sales_history', { p_token: session.session_token, p_date: dstr(extFrom), p_date_to: dstr(to) }),
    sb.rpc('get_daily_goal', { p_token: session.session_token }),
    sb.rpc('get_sales_history', { p_token: session.session_token, p_date: today, p_date_to: today })
  ]);
  const rows = (ext.data || []).filter(o => !o.tags || !o.tags.length);
  const dayRev = {}; rows.forEach(o => { const k = dstr(new Date(o.closed_at)); dayRev[k] = (dayRev[k]||0) + (Number(o.total)||0); });
  let prev = 0; for(let d = new Date(prevFrom); d <= prevTo; d.setDate(d.getDate()+1)) prev += dayRev[dstr(d)] || 0;
  const pts = []; for(let d = new Date(sparkFrom); d <= to; d.setDate(d.getDate()+1)) pts.push({ k: dstr(d), v: dayRev[dstr(d)] || 0 });
  const tr = document.getElementById('fsTrend');
  if(tr){
    const ch = prev ? Math.round((curRevenue - prev) / prev * 100) : null;
    tr.innerHTML = `${ch === null ? '' : `<span class="fs-delta ${ch>=0?'up':'down'}" title="Önceki ${len} güne göre (${money(prev)})">${ch>=0?'▲':'▼'} %${Math.abs(ch)}<small> önceki ${len===1?'güne':len+' güne'} göre</small></span>`}
      ${sparklineSvg(pts)}`;
  }
  const gEl = document.getElementById('fsGoal');
  const goal = Number(goalRes.data) || 0, todayRev = (todayRes.data || []).filter(o => !o.tags || !o.tags.length).reduce((x, o) => x + (Number(o.total)||0), 0);
  if(gEl) gEl.innerHTML = goalRingHtml(todayRev, goal);
  if(goal && todayRev >= goal){
    let key = 'goalCelebrated_' + today, done = false;
    try{ done = localStorage.getItem(key) === '1'; localStorage.setItem(key, '1'); }catch(e){}
    if(!done) celebrate();
  }
}
function sparklineSvg(pts){
  if(pts.length < 2) return '';
  const W = 150, H = 40, max = Math.max(1, ...pts.map(p => p.v)), step = W / (pts.length - 1);
  const xy = pts.map((p, i) => [i*step, H - 4 - (p.v/max)*(H-10)]);
  const line = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Son 7 gün ciro">
    <path d="${line} L${W} ${H} L0 ${H} Z" class="spark-a"/><path d="${line}" class="spark-l"/>
    ${xy.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i===xy.length-1?3.5:2}" class="spark-d"><title>${new Date(pts[i].k+'T00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'short'})}: ${money(pts[i].v)}</title></circle>`).join('')}
  </svg><small class="spark-cap">son 7 gün</small>`;
}
function goalRingHtml(rev, goal){
  const C = 2*Math.PI*40, pct = goal ? Math.min(1, rev/goal) : 0, done = goal && rev >= goal;
  return `<div class="gr ${done?'done':''}" ${act('editDailyGoal', goal)} title="Günlük hedefi değiştir">
    <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" class="gr-t"/><circle cx="50" cy="50" r="40" class="gr-v" style="stroke-dasharray:${C};--off:${C*(1-pct)};--full:${C};"/></svg>
    <div class="gr-in">${goal ? `<b>%${Math.round(rev/goal*100)}</b><small>${done ? '🎉 hedef tamam' : 'bugünkü hedef'}</small>` : '<b>🎯</b><small>hedef koy</small>'}</div>
    <div class="gr-cap">${goal ? escapeHtml(shortMoney(rev)) + ' / ' + escapeHtml(shortMoney(goal)) + ' ₺' : 'Günlük ciro hedefi'}</div>
  </div>`;
}
function editDailyGoal(cur){
  const old = document.getElementById('dgModal'); if(old) old.remove();
  const bg = document.createElement('div'); bg.id = 'dgModal'; bg.className = 'dg-bg';
  const presets = [5000, 10000, 20000, 30000, 50000, 75000, 100000];
  bg.innerHTML = `<div class="dg-card">
    <button type="button" class="dg-x" ${act('closeDailyGoal')} title="Kapat">✕</button>
    <div class="dg-ic">🎯</div>
    <h2>Günlük Ciro Hedefi</h2>
    <p class="muted">Her gün ulaşmak istediğiniz ciroyu belirleyin; Genel Özet'teki halka buna göre dolar.</p>
    <div class="dg-input"><input id="dgVal" type="text" inputmode="numeric" placeholder="0" value="${cur ? Number(cur).toLocaleString('tr-TR') : ''}" ${actOn('input','dgFormat',['$value'])} ${actOn('keydown','onEnterKey',['$event','saveDailyGoal'])}><span>₺</span></div>
    <div class="dg-presets">${presets.map(v => `<button type="button" class="pc-btn" ${act('dgPick', v)}>${shortMoney(v)} ₺</button>`).join('')}</div>
    <div class="dg-acts">
      ${cur ? `<button type="button" class="pc-btn dg-del" ${act('saveDailyGoal', 'clear')}>🗑 Hedefi Kaldır</button>` : '<span></span>'}
      <div><button type="button" class="pc-btn" ${act('closeDailyGoal')}>Vazgeç</button>
      <button type="button" class="rg-btn dg-save" ${act('saveDailyGoal')}>Kaydet</button></div>
    </div>
  </div>`;
  bg.addEventListener('click', e => { if(e.target === bg) closeDailyGoal(); });
  document.body.appendChild(bg);
  setTimeout(() => { const i = document.getElementById('dgVal'); if(i){ i.focus(); i.select(); } }, 30);
}
function closeDailyGoal(){ const m = document.getElementById('dgModal'); if(m) m.remove(); }
function dgFormat(v){
  const i = document.getElementById('dgVal'); const d = String(v).replace(/\D/g, '');
  i.value = d ? Number(d).toLocaleString('tr-TR') : '';
}
function dgPick(v){ const i = document.getElementById('dgVal'); i.value = Number(v).toLocaleString('tr-TR'); i.focus(); }
async function saveDailyGoal(mode){
  const raw = mode === 'clear' ? '' : (document.getElementById('dgVal').value || '').replace(/\D/g, '');
  const n = raw === '' ? null : Number(raw);
  if(mode !== 'clear' && !n){ showToast('Geçerli bir tutar girin'); return; }
  const { error } = await sb.rpc('set_daily_goal', { p_token: getSession().session_token, p_goal: n });
  if(error){ alert(error.message); return; }
  closeDailyGoal();
  showToast(n ? 'Günlük hedef kaydedildi 🎯' : 'Günlük hedef kaldırıldı');
  renderReportTabContent(getSession());
}
/* Hedefe ulaşınca kısa konfeti efekti. */
function celebrate(){
  const box = document.createElement('div'); box.className = 'confetti';
  const colors = ['var(--c1)','var(--c2)','var(--c3)','var(--c4)','#facc15'];
  box.innerHTML = Array.from({ length: 70 }, (_, i) => `<i style="left:${Math.random()*100}%;background:${colors[i%5]};animation-delay:${(Math.random()*.6).toFixed(2)}s;animation-duration:${(1.8+Math.random()*1.4).toFixed(2)}s;transform:rotate(${Math.round(Math.random()*360)}deg);"></i>`).join('')
    + '<div class="confetti-msg">🎉 Günlük hedefe ulaşıldı!</div>';
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

/* Sıralı yatay çubuk listesi (en çok satanlar tarzı): [{label, value, display, side, sub}] */
const RACE_COLORS = ['#3b82f6','#f97316','#10b981','#eab308','#8b5cf6','#ec4899','#06b6d4','#ef4444','#84cc16','#6366f1','#14b8a6','#f59e0b'];
function raceHtml(items){
  if(!items.length) return '<p class="muted">Veri yok.</p>';
  const max = Math.max(1, ...items.map(x => x.value));
  return `<div class="race">${items.map((x, i) => `<div class="race-row" style="--i:${Math.min(i,15)};--sc:${RACE_COLORS[i%RACE_COLORS.length]};">
    <span class="race-rank ${i<3?'top':''}">${['🥇','🥈','🥉'][i] || (i+1)}</span>
    <div class="race-main"><div class="race-label"><b>${escapeHtml(x.label)}</b>${x.sub ? `<small>${escapeHtml(x.sub)}</small>` : ''}</div>
      <div class="race-track"><div class="race-bar" style="width:${Math.max(3, Math.round(x.value/max*100))}%;"><span>${escapeHtml(x.display)}</span></div></div></div>
    <span class="race-side">${escapeHtml(x.side||'')}</span></div>`).join('')}</div>`;
}
