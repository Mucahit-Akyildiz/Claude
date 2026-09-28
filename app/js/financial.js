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
    <div class="box" style="max-width:420px;">
      <p class="muted">Bu ekrana erişmek için finansal analiz şifresini girin.</p>
      <div class="pw-field-wrap">
        <input type="password" id="rpEnterPass" placeholder="Şifre" onkeydown="if(event.key==='Enter')doUnlockReports();">
        <button type="button" class="pw-eye-btn" onclick="toggleReportsPassVisibility('rpEnterPass')" title="Şifreyi göster/gizle">👁️</button>
      </div>
      <button id="rpEnterBtn" onclick="doUnlockReports()">Görüntüle</button>
      <div class="error" id="rpErr"></div>
      <p class="muted" style="text-align:center;margin-top:14px;font-size:13px;">
        <a href="#" style="color:var(--accent);" onclick="APP.reportsGateScreen='forgot1';renderReportsGate(document.getElementById('main'),getSession());return false;">Şifremi Unuttum</a>
      </p>
    </div>`;
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
  btn.disabled = false; btn.textContent = 'Görüntüle';
  if(error){ errBox.textContent = error.message; return; }
  if(!data){ errBox.textContent = 'Şifre hatalı'; return; }
  APP.reportsUnlocked = true;
  renderReportsView(document.getElementById('main'), session);
}
function renderReportsSetPasswordGate(main, session){
  main.innerHTML = `<h1>Finansal Analiz</h1>
    <div class="box" style="max-width:420px;">
      <p class="muted">Bu ekranı korumak için bir şifre belirleyin. Bu şifreyi bilen herhangi bir yönetici finansal verileri görüntüleyebilir.</p>
      <div class="pw-field-wrap">
        <input type="password" id="rpSetPass" placeholder="Yeni şifre">
        <button type="button" class="pw-eye-btn" onclick="toggleReportsPassVisibility('rpSetPass','rpSetPass2')" title="Şifreyi göster/gizle">👁️</button>
      </div>
      <div class="pw-field-wrap">
        <input type="password" id="rpSetPass2" placeholder="Yeni şifre (tekrar)">
        <button type="button" class="pw-eye-btn" onclick="toggleReportsPassVisibility('rpSetPass','rpSetPass2')" title="Şifreyi göster/gizle">👁️</button>
      </div>
      <button id="rpSetBtn" onclick="doSetReportsPassword()">Şifreyi Belirle</button>
      <div class="error" id="rpErr"></div>
    </div>`;
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
  btn.disabled = false; btn.textContent = 'Şifreyi Belirle';
  if(error){ errBox.textContent = error.message; return; }
  APP.config.license.reports_password_set = true;
  APP.reportsUnlocked = true;
  renderReportsView(document.getElementById('main'), session);
}
function renderReportsForgotGate(main, session){
  const step = APP.reportsGateScreen === 'forgot2' ? 2 : 1;
  main.innerHTML = `<h1>Finansal Analiz</h1>
    <div class="box" style="max-width:420px;">
      <p class="muted" id="rpFgSub">${step===1
        ? 'İşletmenizin kayıtlı e-postasına bir doğrulama kodu gönderelim.'
        : 'E-postanıza gönderilen kodu ve yeni şifrenizi girin.'}</p>
      <div id="rpFgStep1" style="display:${step===1?'block':'none'};">
        <button id="rpFgSendBtn" onclick="doStartReportsPasswordReset()">Kod Gönder</button>
      </div>
      <div id="rpFgStep2" style="display:${step===2?'block':'none'};">
        <p class="muted" id="rpFgOtpInfo" style="text-align:center;"></p>
        <input id="rpFgOtp" placeholder="6 haneli kod" maxlength="6" style="text-align:center;font-size:20px;letter-spacing:4px;">
        <div class="pw-field-wrap">
          <input type="password" id="rpFgNewPass" placeholder="Yeni şifre">
          <button type="button" class="pw-eye-btn" onclick="toggleReportsPassVisibility('rpFgNewPass','rpFgNewPass2')" title="Şifreyi göster/gizle">👁️</button>
        </div>
        <div class="pw-field-wrap">
          <input type="password" id="rpFgNewPass2" placeholder="Yeni şifre (tekrar)">
          <button type="button" class="pw-eye-btn" onclick="toggleReportsPassVisibility('rpFgNewPass','rpFgNewPass2')" title="Şifreyi göster/gizle">👁️</button>
        </div>
        <button id="rpFgVerifyBtn" onclick="doVerifyReportsPasswordReset()">Şifreyi Güncelle</button>
      </div>
      <div class="error" id="rpErr"></div>
      <p class="muted" style="text-align:center;margin-top:14px;font-size:13px;">
        <a href="#" style="color:var(--accent);" onclick="APP.reportsGateScreen=null;renderReportsGate(document.getElementById('main'),getSession());return false;">← Şifreyle Gir</a>
      </p>
    </div>`;
}
function toggleReportsPassVisibility(id1, id2){
  const f1 = document.getElementById(id1);
  const f2 = id2 ? document.getElementById(id2) : null;
  const showing = f1.type === 'text';
  const nextType = showing ? 'password' : 'text';
  f1.type = nextType; if(f2) f2.type = nextType;
  const wrap = f1.closest('.box');
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
  btn.disabled = false; btn.textContent = 'Kod Gönder';
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
  const { error } = await sb.rpc('verify_reports_password_reset', { p_token: session.session_token, p_otp: otp, p_new_password: newPass });
  btn.disabled = false; btn.textContent = 'Şifreyi Güncelle';
  if(error){ errBox.textContent = error.message; return; }
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
  if(!APP.reportsUnlocked){
    renderReportsGate(main, session);
    return;
  }
  if(!APP.reportDateTo) APP.reportDateTo = APP.reportDate;
  main.innerHTML = `<h1>Finansal Analiz</h1>
    <div class="box" style="max-width:none;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span class="muted" style="white-space:nowrap;">Tarih Aralığı</span>
        <input type="date" id="reportDateInput" value="${APP.reportDate}" onchange="changeReportDate(this.value)" style="width:auto;margin:0;">
        <span class="muted">–</span>
        <input type="date" id="reportDateToInput" value="${APP.reportDateTo}" onchange="changeReportDateTo(this.value)" style="width:auto;margin:0;">
        <span style="width:1px;height:22px;background:var(--border);margin:0 2px;"></span>
        <button type="button" class="range-preset-btn" onclick="setReportDateRangeDays(0)">Bugün</button>
        <button type="button" class="range-preset-btn" onclick="setReportDateRangeDays(6)">Son 7 Gün</button>
        <button type="button" class="range-preset-btn" onclick="setReportDateRangeDays(9)">Son 10 Gün</button>
        <button type="button" class="range-preset-btn" onclick="setReportDateRangeDays(29)">Son 30 Gün</button>
      </div>
    </div>
    <div class="tabs" id="reportTabs">
      <div class="tab ${(APP.reportTab||'summary')==='summary'?'active':''}" data-tab="summary" onclick="setReportTab('summary')">Genel Özet</div>
      <div class="tab ${APP.reportTab==='products'?'active':''}" data-tab="products" onclick="setReportTab('products')">📦 Ürün İstatistikleri</div>
      <div class="tab ${APP.reportTab==='staff'?'active':''}" data-tab="staff" onclick="setReportTab('staff')">👤 Personel Analizleri</div>
      <div class="tab ${APP.reportTab==='customers'?'active':''}" data-tab="customers" onclick="setReportTab('customers')">🧑‍🤝‍🧑 Müşteri Analizleri</div>
      <div class="tab ${APP.reportTab==='tips'?'active':''}" data-tab="tips" onclick="setReportTab('tips')">💰 Bahşiş Havuzu</div>
    </div>
    <div id="reportContent"></div>`;
  await renderReportTabContent(session);
}
function setReportTab(tab){
  APP.reportTab = tab;
  document.querySelectorAll('#reportTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
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
  if(tab==='products') return renderProductStatsContent(session);
  if(tab==='staff') return renderStaffAnalyticsContent(session);
  if(tab==='customers') return renderCustomerAnalyticsContent(session);
  if(tab==='tips') return renderTipPoolContent(session);
  return renderReportContent(session);
}
async function renderReportContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_sales_history', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const hist = data || [];

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
        <td><div style="background:var(--panel);border-radius:6px;height:14px;min-width:70px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${isPeak?'var(--accent)':'var(--accent2)'};"></div></div></td></tr>`;
    }).join('') + '</tbody></table></div>';

  // Kapatılan Hesaplar listesi saat/masa/ödeme biçimine göre filtrelenebilir -
  // filtre seçenekleri o tarih aralığında GERÇEKTEN görülen değerlerden
  // türetilir (boş/alakasız seçenek çıkmasın diye).
  if(!APP.reportBillsFilter) APP.reportBillsFilter = { hour:'', table:'', method:'' };
  const bf = APP.reportBillsFilter;
  const billLabel = (o) => (o.kind==='takeaway' ? '📦 Paket' : (o.table_name||'-'));
  const billTableOptions = [...new Set(hist.map(billLabel))].sort();
  const billHourOptions = [...new Set(hist.map(o => new Date(o.closed_at).getHours()))].sort((a,b)=>a-b);
  const METHOD_LABELS = { cash:'💵 Nakit', card:'💳 Kredi Kartı', gift_card:'🎁 Hediye Kartı', split:'➗ Bölünmüş' };
  const billMethodOptions = [...new Set(hist.map(o => o.payment_method))].filter(Boolean).sort();

  const filteredBills = hist.filter(o => {
    if(bf.hour!=='' && new Date(o.closed_at).getHours()!==Number(bf.hour)) return false;
    if(bf.table && billLabel(o)!==bf.table) return false;
    if(bf.method && o.payment_method!==bf.method) return false;
    return true;
  });
  const billsFilterActive = bf.hour!=='' || bf.table!=='' || bf.method!=='';

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
    return `<tr><td>${t}</td>
      <td class="col-name">${escapeHtml(billLabel(o))}${tagBadge}</td>
      <td>${money(o.total)}</td>
      <td>${discTxt}</td>
      <td>${methodLabel}</td></tr>`;
  };
  const billsHtml = hist.length===0 ? '<p class="muted">Bu tarihte kapatılmış hesap yok.</p>'
    : filteredBills.length===0 ? '<p class="muted">Bu filtrede kapatılmış hesap yok.</p>'
    : `<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Saat</th><th>Masa</th><th>Tutar</th><th>İndirim</th><th>Ödeme</th></tr></thead><tbody>` +
      filteredBills.map(billRowHtml).join('') + '</tbody></table></div>';

  el.innerHTML = `
    <div class="stat-grid">
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;">${hist.length}</div><div class="muted" style="font-size:12px;">Kapatılan Hesap</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;">${money(totalRevenue)}</div><div class="muted" style="font-size:12px;">Toplam Ciro</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;">${money(totalCost)}</div><div class="muted" style="font-size:12px;">Toplam Maliyet</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;color:${profit>=0?'var(--green)':'var(--red)'};">${money(profit)}</div><div class="muted" style="font-size:12px;">Net Kâr</div></div>
    </div>
    <div class="stat-grid">
      <div class="box" style="text-align:center;"><div style="font-size:20px;font-weight:800;color:var(--green);">${money(totalCash)}</div><div class="muted" style="font-size:12px;">💵 Nakit${totalRevenue?' ('+Math.round(totalCash/totalRevenue*100)+'%)':''}</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:20px;font-weight:800;color:var(--accent2);">${money(totalCard)}</div><div class="muted" style="font-size:12px;">💳 Kredi Kartı${totalRevenue?' ('+Math.round(totalCard/totalRevenue*100)+'%)':''}</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:20px;font-weight:800;color:var(--gift);">${money(totalGiftCard)}</div><div class="muted" style="font-size:12px;">🎁 Hediye Kartı${totalRevenue?' ('+Math.round(totalGiftCard/totalRevenue*100)+'%)':''}</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:20px;font-weight:800;color:var(--accent);">${money(totalDiscount)}</div><div class="muted" style="font-size:12px;">🏷️ İndirim (${discountedCount} hesap)</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:20px;font-weight:800;color:#eab308;">${money(taggedTotal)}</div><div class="muted" style="font-size:12px;">🏷️ Personel/İkram (${taggedHist.length} hesap, ciroya dahil değil)</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:20px;font-weight:800;color:var(--accent);">${money(totalTip)}</div><div class="muted" style="font-size:12px;">💰 Bahşiş</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:20px;font-weight:800;color:var(--accent2);">${money(totalBirthdayDiscount)}</div><div class="muted" style="font-size:12px;">🎂 Doğum Günü İndirimi (${birthdayCount} hesap)</div></div>
    </div>
    <div class="box" style="max-width:none;"><h2>Saatlik Yoğunluk${peakHour!==null?' <span class="muted" style="font-size:12px;font-weight:400;">(en yoğun: '+(peakHour<10?'0'+peakHour:peakHour)+':00 🔥)</span>':''}</h2>${hourlyHtml}</div>
    <div class="box" style="max-width:none;"><h2>👤 Personel Performansı</h2>${staffRowsHtml}</div>
    <div class="box" style="max-width:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px;">
        <h2 style="margin:0;">Kapatılan Hesaplar</h2>
        <span class="muted" style="font-size:12px;">${billsFilterActive ? (filteredBills.length+' / '+hist.length+' hesap') : (hist.length+' hesap')}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
        <select id="billHourFilter" style="width:auto;margin:0;padding:8px 12px;" onchange="APP.reportBillsFilter.hour=this.value;renderReportTabContent(getSession());">
          <option value="">Tüm Saatler</option>
          ${billHourOptions.map(h => `<option value="${h}" ${bf.hour===String(h)?'selected':''}>${h<10?'0'+h:h}:00</option>`).join('')}
        </select>
        <select id="billTableFilter" style="width:auto;margin:0;padding:8px 12px;" onchange="APP.reportBillsFilter.table=this.value;renderReportTabContent(getSession());">
          <option value="">Tüm Masalar</option>
          ${billTableOptions.map(tb => `<option value="${escapeHtml(tb)}" ${bf.table===tb?'selected':''}>${escapeHtml(tb)}</option>`).join('')}
        </select>
        <select id="billMethodFilter" style="width:auto;margin:0;padding:8px 12px;" onchange="APP.reportBillsFilter.method=this.value;renderReportTabContent(getSession());">
          <option value="">Tüm Ödeme Biçimleri</option>
          ${billMethodOptions.map(m => `<option value="${m}" ${bf.method===m?'selected':''}>${METHOD_LABELS[m]||m}</option>`).join('')}
        </select>
        ${billsFilterActive ? `<button type="button" class="sbtn" style="width:auto;margin:0;" onclick="APP.reportBillsFilter={hour:'',table:'',method:''};renderReportTabContent(getSession());">✕ Filtreleri Temizle</button>` : ''}
      </div>
      ${billsHtml}
    </div>
  `;
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

  const barsHtml = sorted.length===0 ? '<p class="muted">Bu tarihte / bu filtrede satış yok.</p>' : sorted.map((r,idx) => {
    const val = APP.productStatsSort==='qty' ? r.qty : Number(r.revenue);
    const pct = maxVal ? Math.round(val/maxVal*100) : 0;
    const isTop = idx===0;
    return `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin-bottom:4px;gap:8px;">
        <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${isTop?'🏆 ':''}${escapeHtml(r.name)}${r.station_name?' <span class="muted" style="font-weight:400;font-size:11px;">('+escapeHtml(r.station_name)+')</span>':''}</span>
        <span class="muted" style="white-space:nowrap;">${r.qty} adet · ${money(r.revenue)}</span>
      </div>
      <div style="background:var(--panel2);border-radius:6px;height:16px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${isTop?'var(--accent)':'var(--accent2)'};transition:width .3s ease;"></div>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="stat-grid">
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;">${filtered.length}</div><div class="muted" style="font-size:12px;">Satılan Ürün Çeşidi</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;">${totalQty}</div><div class="muted" style="font-size:12px;">Toplam Adet</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;">${money(totalRev)}</div><div class="muted" style="font-size:12px;">Toplam Ciro</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${top?escapeHtml(top.name):'-'}</div><div class="muted" style="font-size:12px;">🏆 En Çok Satan</div></div>
    </div>
    <div class="box" style="max-width:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <h2 style="margin:0;">Ürün Satışları</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <select id="psStationFilter" style="width:auto;margin:0;padding:8px 12px;" onchange="APP.productStatsStation=this.value;renderProductStatsContent(getSession());">
            <option value="">Tüm İstasyonlar</option>
            ${stations.map(s => `<option value="${s.id}" ${APP.productStatsStation===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
          <select id="psSortBy" style="width:auto;margin:0;padding:8px 12px;" onchange="APP.productStatsSort=this.value;renderProductStatsContent(getSession());">
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
  return `<div class="settings-table-wrap"><table class="settings-table" style="font-size:13px;">
    <thead><tr><th>Personel</th>${hours.map(h => `<th style="text-align:center;">${hourLabel(h)}</th>`).join('')}<th style="text-align:center;font-weight:800;">Toplam</th></tr></thead>
    <tbody>
    ${staffNames.map(name => `<tr><td class="col-name">${escapeHtml(name)}</td>${hours.map(h => {
      const v = lookup[name+'_'+h]||0;
      return `<td style="text-align:center;${v?'':'color:var(--muted);'}">${v||'-'}</td>`;
    }).join('')}<td style="text-align:center;font-weight:700;">${totalsByStaff[name]}</td></tr>`).join('')}
    <tr style="border-top:2px solid var(--border);font-weight:700;"><td class="col-name">Toplam</td>${hours.map(h => `<td style="text-align:center;">${totalsByHour[h]}</td>`).join('')}<td style="text-align:center;">${grandTotal}</td></tr>
    </tbody>
  </table></div>`;
}
async function renderStaffAnalyticsContent(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_staff_hourly_stats', { p_token: session.session_token, p_date: APP.reportDate, p_date_to: APP.reportDateTo }));
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  const ordersByHour = (data && data.orders_by_hour) || [];
  const paymentsByHour = (data && data.payments_by_hour) || [];
  el.innerHTML = `
    <div class="box" style="max-width:none;">
      <h2>🍽️ Saatlik Sipariş Alma</h2>
      <p class="muted" style="font-size:12px;margin-top:-6px;">Personelin hangi saatte kaç masa/paket siparişi aldığı (siparişin oluşturulma saatine göre).</p>
      ${buildHourlyPivotTable(ordersByHour)}
    </div>
    <div class="box" style="max-width:none;">
      <h2>💳 Saatlik Alınan Ödeme</h2>
      <p class="muted" style="font-size:12px;margin-top:-6px;">Personelin hangi saatte kaç ödeme aldığı / hesap kapattığı.</p>
      ${buildHourlyPivotTable(paymentsByHour)}
    </div>
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
    <div class="stat-grid">
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;">${rows.length}</div><div class="muted" style="font-size:12px;">Müşteri</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;">${money(totalSpent)}</div><div class="muted" style="font-size:12px;">Toplam Harcama</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;">${money(avgSpent)}</div><div class="muted" style="font-size:12px;">Ortalama Harcama</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;">${totalVisits}</div><div class="muted" style="font-size:12px;">Toplam Ziyaret</div></div>
    </div>
    <div class="box" style="max-width:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
        <h2 style="margin:0;">Müşteri Analizleri</h2>
        <input id="custAnalyticsSearchInput" placeholder="İsim veya telefon ara..." style="max-width:260px;" value="${escapeHtml(APP.customerAnalyticsSearch||'')}" oninput="debouncedCustomerAnalyticsSearch(this.value)">
      </div>
      <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>Ad</th><th>Telefon</th><th>🎂 Doğum Günü</th><th>Puan</th><th>Ziyaret</th><th>Toplam Harcama</th><th>Son Ziyaret</th></tr></thead>
        <tbody>
        ${rows.map(c => `
          <tr>
            <td class="col-name">${escapeHtml(c.name)}</td>
            <td>${escapeHtml(c.phone||'-')}</td>
            <td>${c.birthday ? new Date(c.birthday+'T00:00:00').toLocaleDateString('tr-TR') : '-'}</td>
            <td>${c.points_balance}</td>
            <td>${c.total_visits}</td>
            <td>${money(c.total_spent)}</td>
            <td>${c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('tr-TR') : '-'}</td>
          </tr>`).join('')}
        ${rows.length===0?'<tr><td colspan="7" class="muted" style="text-align:center;">Müşteri yok.</td></tr>':''}
        </tbody>
      </table>
      </div>
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
    ${session.isManager ? `
    <div class="box" style="max-width:none;">
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
      <button style="margin-top:12px;max-width:220px;" onclick="saveTipPoolSettings()">Kaydet</button>
    </div>` : ''}
    <div class="stat-grid">
      <div class="box" style="text-align:center;"><div style="font-size:22px;font-weight:800;">${money(data.total_tip)}</div><div class="muted" style="font-size:12px;">Toplam Bahşiş</div></div>
      <div class="box" style="text-align:center;"><div style="font-size:15px;font-weight:800;">${data.enabled ? modeLabel : 'Kapalı'}</div><div class="muted" style="font-size:12px;">Paylaşım Kuralı</div></div>
    </div>
    <div class="box" style="max-width:none;">
      <h2>${escapeHtml(reportDateRangeLabel())} Tarihli Paylaşım</h2>
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
async function saveTipPoolSettings(){
  const session = getSession();
  const enabled = document.getElementById('tipPoolEnabled').checked;
  const mode = document.getElementById('tipPoolMode').value;
  const { error } = await sb.rpc('update_tip_pool_settings', { p_token: session.session_token, p_enabled: enabled, p_mode: mode });
  if(error){ alert(error.message); return; }
  showToast('Bahşiş havuzu ayarları kaydedildi ✓');
  renderTipPoolContent(session);
}
