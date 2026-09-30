/* Giris/kayit/sirket paneli/abonelik suresi dolmus/sifremi unuttum
   ekranlari - app/index.html'den cikarildi. Klasik <script src>. */
function renderLoginScreen(app){
  const odemeParam = new URLSearchParams(window.location.search).get('odeme');
  const odemeMsgs = {
    basarili: { text: '✅ Ödemeniz alındı, aboneliğiniz uzatıldı.', color: 'var(--green)' },
    basarisiz: { text: '❌ Ödeme tamamlanamadı, tekrar deneyebilirsiniz.', color: 'var(--red)' },
    hata: { text: '⚠️ Ödeme sırasında bir hata oluştu, tekrar deneyin.', color: 'var(--red)' },
    eksik: { text: '⚠️ Ödeme bilgisi eksik geldi, tekrar deneyin.', color: 'var(--red)' },
    bulunamadi: { text: '⚠️ Ödeme kaydı bulunamadı, tekrar deneyin.', color: 'var(--red)' },
  };
  const odemeBanner = odemeParam && odemeMsgs[odemeParam]
    ? `<p style="text-align:center;font-weight:700;font-size:13.5px;color:${odemeMsgs[odemeParam].color};margin:0 0 14px;">${odemeMsgs[odemeParam].text}</p>`
    : '';
  const kickedBanner = APP.sessionKicked
    ? `<p style="text-align:center;font-weight:700;font-size:13.5px;color:var(--red);margin:0 0 14px;">⚠️ Bu hesapla başka bir cihazdan giriş yapıldığı için oturumunuz kapatıldı.</p>`
    : '';
  APP.sessionKicked = false;
  app.innerHTML = `
    <div class="center-wrap">
    <div>
    <div class="auth-brand"><img src="/assets/images/logo.webp" alt="Peyktan" class="auth-brand-logo"><span class="name">Peyktan</span></div>
    <div class="box">
      <h1>Giriş Yapın</h1>
      <p class="muted">İşletme kodu, kullanıcı adı ve şifrenizle giriş yapın</p>
      ${odemeBanner}
      ${kickedBanner}
      <input id="codeInput" placeholder="İşletme kodu (örn. test123)" autocapitalize="none">
      <input id="userInput" placeholder="Kullanıcı adı" autocapitalize="none">
      <input id="passInput" type="password" placeholder="Şifre">
      <button id="loginBtn" onclick="doLogin()">Giriş Yap</button>
      <div class="error" id="errBox"></div>
      <p class="muted" style="text-align:center;margin-top:14px;font-size:13px;">
        <a href="#" style="color:var(--accent);" onclick="APP.authScreen='forgot';APP.forgotStep=1;render();return false;">Şifremi Unuttum</a>
      </p>
      <p class="muted" style="text-align:center;margin-top:2px;font-size:13px;">Yeni işletme misiniz?
        <a href="#" style="color:var(--accent);" onclick="APP.authScreen='signup';render();return false;">Kayıt Ol / Paket Seç</a>
      </p>
      <p class="muted" style="text-align:center;margin-top:2px;font-size:13px;">Şubeleri olan bir firma mısınız?
        <a href="#" style="color:var(--accent);" onclick="APP.authScreen='companyLogin';render();return false;">🏢 Şirket Girişi</a>
      </p>
    </div>
    </div>
    </div>`;
  document.getElementById('passInput').addEventListener('keydown', function(e){
    if(e.key==='Enter') doLogin();
  });
}
/* --- Şirket (birden fazla şubesi olan zincir) girişi --- */
function renderCompanyLoginScreen(app){
  app.innerHTML = `
    <div class="center-wrap">
    <div>
    <div class="auth-brand"><img src="/assets/images/logo.webp" alt="Peyktan" class="auth-brand-logo"><span class="name">Peyktan</span></div>
    <div class="box">
      <h1>🏢 Şirket Girişi</h1>
      <p class="muted">Birden fazla şubesi olan firmalar için - şirket kodu ve şifrenizle giriş yapın, ardından şubeler arasında geçiş yapabilirsiniz.</p>
      <input id="companyCodeInput" placeholder="Şirket kodu" autocapitalize="none">
      <input id="companyPassInput" type="password" placeholder="Şifre">
      <button id="companyLoginBtn" onclick="doCompanyLogin()">Giriş Yap</button>
      <div class="error" id="companyErrBox"></div>
      <p class="muted" style="text-align:center;margin-top:16px;font-size:13px;">
        <a href="#" style="color:var(--accent);" onclick="APP.authScreen='login';render();return false;">← Normal Girişe Dön</a>
      </p>
    </div>
    </div>
    </div>`;
  document.getElementById('companyPassInput').addEventListener('keydown', function(e){
    if(e.key==='Enter') doCompanyLogin();
  });
}
async function doCompanyLogin(){
  const code = document.getElementById('companyCodeInput').value.trim();
  const password = document.getElementById('companyPassInput').value;
  const errBox = document.getElementById('companyErrBox');
  const btn = document.getElementById('companyLoginBtn');
  errBox.textContent = '';
  if(!code || !password){ errBox.textContent = 'Tüm alanları doldurun'; return; }
  btn.disabled = true; btn.textContent = 'Giriş yapılıyor...';
  try{
    const { data, error } = await sb.rpc('login_company', { p_code: code, p_password: password });
    if(error){ errBox.textContent = 'Bağlantı hatası: ' + error.message; return; }
    if(!data || data.length === 0){ errBox.textContent = 'Şirket kodu veya şifre hatalı'; return; }
    const row = data[0];
    setCompanySession({ session_token: row.session_token, company_id: row.company_id, company_name: row.company_name, package_id: row.package_id });
    APP.authScreen = 'login';
    render();
  }catch(err){
    console.error(err);
    errBox.textContent = 'Beklenmeyen bir hata oluştu';
  }finally{
    btn.disabled = false; btn.textContent = 'Giriş Yap';
  }
}
function doCompanyLogout(){
  clearCompanySession();
  render();
}
/* --- Şirket Paneli: şube listesi, konsolide rapor, yeni şube ekleme --- */
async function renderCompanyPanel(app, companySession){
  const theme = getTheme();
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">🏢 ${escapeHtml(companySession.company_name)}</div>
      <div class="right">
        <div class="theme-toggle" style="width:150px;background:var(--panel2);border:1px solid var(--border);">
          <button class="${theme==='dark'?'active':''}" style="color:${theme==='dark'?'':'var(--muted)'};background:${theme==='dark'?'var(--accent)':'transparent'};box-shadow:none;" onclick="setTheme('dark')" type="button">🌙 Koyu</button>
          <button class="${theme==='light'?'active':''}" style="color:${theme==='light'?'':'var(--muted)'};background:${theme==='light'?'var(--accent)':'transparent'};box-shadow:none;" onclick="setTheme('light')" type="button">☀️ Açık</button>
        </div>
        <button class="ghost-btn" onclick="doCompanyLogout()">Çıkış</button>
      </div>
    </header>
    <div class="content-inner content-inner-wide">
      <div id="companyPanelContent"><p class="muted">Yükleniyor…</p></div>
    </div>`;
  await renderCompanyPanelContent(companySession);
}
async function renderCompanyPanelContent(companySession){
  const el = document.getElementById('companyPanelContent'); if(!el) return;
  if(!APP.companyDashboardDate) APP.companyDashboardDate = todayLocalDateStr();
  if(!APP.companyDashboardDateTo) APP.companyDashboardDateTo = APP.companyDashboardDate;
  if(APP.companyDashboardBranch===undefined) APP.companyDashboardBranch = '';
  const branchFilter = APP.companyDashboardBranch || null;
  const [branchesRes, dashRes, multiBranchRes] = await withLoadingOverlay(Promise.all([
    sb.rpc('list_company_branches', { p_company_token: companySession.session_token }),
    sb.rpc('get_company_dashboard', { p_company_token: companySession.session_token, p_date: APP.companyDashboardDate, p_date_to: APP.companyDashboardDateTo, p_branch_id: branchFilter }),
    sb.rpc('company_check_entitlement', { p_company_token: companySession.session_token, p_feature_id: 'multi_branch' })
  ]));
  if(branchesRes.error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+branchesRes.error.message+'</p>'; return; }
  if(dashRes.error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+dashRes.error.message+'</p>'; return; }
  const branches = branchesRes.data || [];
  const hasMultiBranch = !!multiBranchRes.data;
  const dash = dashRes.data || { branches: [], daily: [], grand_total: 0, grand_cost: 0 };
  const grandProfit = Number(dash.grand_total||0) - Number(dash.grand_cost||0);
  const isSingleBranch = !!branchFilter;

  const summaryRowsHtml = (dash.branches||[]).map(b => {
    const profit = Number(b.total||0) - Number(b.cost||0);
    return `<tr>
      <td class="col-name">${escapeHtml(b.name)}</td>
      <td>${b.order_count}</td>
      <td>${money(b.total)}</td>
      <td style="color:${profit>=0?'var(--green)':'var(--red)'};font-weight:700;">${money(profit)}</td>
    </tr>`;
  }).join('');
  const dailyRowsHtml = (dash.daily||[]).map(d => {
    const profit = Number(d.total||0) - Number(d.cost||0);
    return `<tr>
      <td class="col-name">${new Date(d.day).toLocaleDateString('tr-TR')}</td>
      <td>${d.order_count}</td>
      <td>${money(d.total)}</td>
      <td style="color:${profit>=0?'var(--green)':'var(--red)'};font-weight:700;">${money(profit)}</td>
    </tr>`;
  }).join('');
  const rowsHtml = isSingleBranch ? dailyRowsHtml : summaryRowsHtml;
  const emptyText = isSingleBranch ? 'Bu tarih aralığında satış yok.' : 'Bu tarih aralığında satış yok.';

  el.innerHTML = `
    <div class="box" style="max-width:none;">
      <h2>Şubeler (${branches.length})</h2>
      <div class="table-grid">
        ${branches.map(b => `
          <div class="table-cell" style="cursor:pointer;text-align:left;padding:14px;" onclick="enterBranch('${b.id}')">
            <div style="font-weight:800;font-size:14px;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(b.name)}</div>
            <div class="muted" style="font-size:11px;margin-top:2px;">${escapeHtml(b.code)} · ${b.staff_count} personel</div>
            <div style="font-size:12px;margin-top:6px;color:var(--accent);font-weight:700;">${money(b.revenue_today)} (bugün)</div>
          </div>`).join('')}
        ${hasMultiBranch
          ? `<div class="table-cell" style="cursor:pointer;display:flex;align-items:center;justify-content:center;" onclick="openCreateBranchModal()">➕<div style="font-size:11px;margin-top:4px;font-weight:400;">Yeni Şube Ekle</div></div>`
          : `<div class="table-cell" style="display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:.65;cursor:default;text-align:center;padding:10px;" title="Birden fazla şube açma bir eklentidir">🔒<div style="font-size:11px;margin-top:4px;font-weight:400;">Şube Eklentisi Gerekli</div></div>`}
      </div>
    </div>
    <div class="box" style="max-width:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
        <h2 style="margin:0;">Konsolide Satış Raporu</h2>
        <select id="companyDashboardBranchSel" onchange="changeCompanyDashboardBranch(this.value)" style="max-width:220px;">
          <option value="" ${!branchFilter?'selected':''}>Tüm Şubeler</option>
          ${branches.map(b => `<option value="${b.id}" ${branchFilter===b.id?'selected':''}>${escapeHtml(b.name)}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <span class="muted">Tarih Aralığı</span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input type="date" id="companyDashboardDateInput" value="${APP.companyDashboardDate}" onchange="changeCompanyDashboardDate(this.value)">
          <span class="muted">–</span>
          <input type="date" id="companyDashboardDateToInput" value="${APP.companyDashboardDateTo}" onchange="changeCompanyDashboardDateTo(this.value)">
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
        <button type="button" class="range-preset-btn" onclick="setCompanyDashboardRangeDays(0)">Bugün</button>
        <button type="button" class="range-preset-btn" onclick="setCompanyDashboardRangeDays(6)">Son 7 Gün</button>
        <button type="button" class="range-preset-btn" onclick="setCompanyDashboardRangeDays(9)">Son 10 Gün</button>
        <button type="button" class="range-preset-btn" onclick="setCompanyDashboardRangeDays(29)">Son 30 Gün</button>
      </div>
      <div class="settings-table-wrap">
        <table class="settings-table">
          <thead><tr><th>${isSingleBranch?'Tarih':'Şube'}</th><th>Sipariş Sayısı</th><th>Ciro</th><th>Kâr</th></tr></thead>
          <tbody>
          ${rowsHtml}
          ${rowsHtml===''?'<tr><td colspan="4" class="muted" style="text-align:center;">'+emptyText+'</td></tr>':''}
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:24px;margin-top:10px;">
        <div style="text-align:right;font-weight:800;font-size:16px;">Toplam Ciro: ${money(dash.grand_total)}</div>
        <div style="text-align:right;font-weight:800;font-size:16px;color:${grandProfit>=0?'var(--green)':'var(--red)'};">Toplam Kâr: ${money(grandProfit)}</div>
      </div>
    </div>`;
}
function changeCompanyDashboardDate(v){
  APP.companyDashboardDate = v;
  if(APP.companyDashboardDateTo < v) APP.companyDashboardDateTo = v;
  renderCompanyPanelContent(getCompanySession());
}
function changeCompanyDashboardDateTo(v){
  APP.companyDashboardDateTo = v;
  if(APP.companyDashboardDate > v) APP.companyDashboardDate = v;
  renderCompanyPanelContent(getCompanySession());
}
function setCompanyDashboardRangeDays(daysBack){
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - daysBack);
  const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  APP.companyDashboardDate = fmt(from);
  APP.companyDashboardDateTo = fmt(to);
  renderCompanyPanelContent(getCompanySession());
}
function changeCompanyDashboardBranch(v){
  APP.companyDashboardBranch = v;
  renderCompanyPanelContent(getCompanySession());
}
function openCreateBranchModal(){
  const bg = document.createElement('div');
  bg.id = 'createBranchBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:380px;width:100%;">
    <div style="display:flex;justify-content:space-between;"><h2 style="margin:0;">Yeni Şube Ekle</h2><span style="cursor:pointer;color:var(--muted);" onclick="document.getElementById('createBranchBg').remove()">✕</span></div>
    <input id="newBranchName" placeholder="Şube adı (örn. Kadıköy Şubesi)" style="margin-top:14px;">
    <input id="newBranchCode" placeholder="Şube kodu (örn. kadikoy2026)" autocapitalize="none">
    <div class="error" id="newBranchErr"></div>
    <button id="newBranchBtn" onclick="createBranchSubmit()">Şubeyi Oluştur</button>
  </div>`;
  document.body.appendChild(bg);
}
async function createBranchSubmit(){
  const companySession = getCompanySession(); if(!companySession) return;
  const name = document.getElementById('newBranchName').value.trim();
  const code = document.getElementById('newBranchCode').value.trim();
  const errEl = document.getElementById('newBranchErr');
  const btn = document.getElementById('newBranchBtn');
  errEl.textContent = '';
  if(!name || !code){ errEl.textContent = 'Şube adı ve kodu gerekli'; return; }
  btn.disabled = true; btn.textContent = 'Oluşturuluyor...';
  const { error } = await sb.rpc('create_branch', { p_company_token: companySession.session_token, p_name: name, p_code: code });
  btn.disabled = false; btn.textContent = 'Şubeyi Oluştur';
  if(error){ errEl.textContent = error.message; return; }
  const bg = document.getElementById('createBranchBg'); if(bg) bg.remove();
  showToast('Şube oluşturuldu ✓');
  renderCompanyPanelContent(companySession);
}
async function enterBranch(restaurantId){
  const companySession = getCompanySession(); if(!companySession) return;
  const { data, error } = await withLoadingOverlay(sb.rpc('switch_to_branch', { p_company_token: companySession.session_token, p_restaurant_id: restaurantId }));
  if(error){ alert(error.message); return; }
  if(!data || data.length===0){ alert('Şubeye giriş yapılamadı'); return; }
  const row = data[0];
  setSession({
    session_token: row.session_token,
    user_id: row.user_id,
    restaurant_id: row.restaurant_id,
    role_names: row.role_names || [],
    permissions: row.permissions || [],
    isManager: !!row.is_manager,
    restaurant_name: row.restaurant_name,
    username: '🏢 ' + companySession.company_name
  });
  APP.reportsUnlocked = false;
  APP.reportsGateScreen = null;
  APP.config = null;
  APP.view = 'home';
  APP.customerReqPollStarted = false;
  render();
}
async function returnToCompanyPanel(){
  const session = getSession();
  stopKitchenPolling();
  stopOrderPolling();
  stopCustomerRequestPolling();
  APP.customerReqPollStarted = false;
  APP.shiftStatus = null;
  clearSession();
  render();
  if(session && session.session_token){
    try{ await sb.rpc('logout_staff', { p_token: session.session_token }); }catch(e){}
  }
}

/* Deneme/abonelik süresi dolan işletmeler buraya düşer - hem doLogin()
   girişte ABONELIK_SURESI_DOLDU yakalarsa (bkz. login_staff), hem de zaten
   içerideyken bir işlem sırasında süre dolarsa (bkz. sb.rpc sarmalayıcısı,
   handleSubscriptionExpired). Artık oturum yok, bu yüzden ödeme başlatmak
   için kod+kullanıcı adı+şifre yeniden istenir (verify_restaurant_credentials
   ile sahiplik doğrulanır, aktif/süresi-dolmuş olması önemli değil). */
function renderExpiredScreen(app){
  const prefill = APP.expiredPrefill || {};
  // Play Billing politikası: native uygulamada ödeme akışı gösterilmez.
  if(isNativeApp()){
    app.innerHTML = `
      <div class="center-wrap"><div>
      <div class="auth-brand"><img src="/assets/images/logo.webp" alt="Peyktan" class="auth-brand-logo"><span class="name">Peyktan</span></div>
      <div class="box">
        <h1>⏰ Aboneliğiniz Sona Erdi</h1>
        <p class="muted">Abonelik işlemleri bu uygulama üzerinden yapılamaz. Lütfen bir bilgisayar veya tarayıcıdan hesabınıza giriş yapın; işlem tamamlandığında buradan tekrar giriş yapabilirsiniz.</p>
        <p class="muted" style="text-align:center;margin-top:16px;font-size:13px;">
          <a href="#" style="color:var(--accent);" onclick="APP.authScreen='login';render();return false;">← Girişe Dön</a>
        </p>
      </div></div></div>`;
    APP.expiredPrefill = null;
    return;
  }
  app.innerHTML = `
    <div class="center-wrap">
    <div>
    <div class="auth-brand"><img src="/assets/images/logo.webp" alt="Peyktan" class="auth-brand-logo"><span class="name">Peyktan</span></div>
    <div class="box">
      <h1>⏰ Deneme Süreniz / Aboneliğiniz Sona Erdi</h1>
      <p class="muted">Devam etmek için işletme bilgilerinizle ödemenizi tamamlayın - onaylanır onaylanmaz tekrar giriş yapabilirsiniz.</p>
      <input id="exCode" placeholder="İşletme kodu" autocapitalize="none" value="${escapeHtml(prefill.code||'')}">
      <input id="exUser" placeholder="Yönetici kullanıcı adı" autocapitalize="none" value="${escapeHtml(prefill.username||'')}">
      <input id="exPass" type="password" placeholder="Yönetici şifresi">
      <button id="exPayBtn" onclick="startRenewalPayment()">💳 Ödemeye Geç</button>
      <div class="error" id="exErr"></div>
      <p class="muted" style="text-align:center;margin-top:16px;font-size:13px;">
        <a href="#" style="color:var(--accent);" onclick="APP.authScreen='login';render();return false;">← Girişe Dön</a>
      </p>
    </div>
    </div>
    </div>`;
  APP.expiredPrefill = null;
}
async function startRenewalPayment(){
  const code = document.getElementById('exCode').value.trim();
  const username = document.getElementById('exUser').value.trim();
  const password = document.getElementById('exPass').value;
  const errBox = document.getElementById('exErr');
  const btn = document.getElementById('exPayBtn');
  errBox.textContent = '';
  if(!code || !username || !password){ errBox.textContent = 'Tüm alanları doldurun'; return; }
  btn.disabled = true; btn.textContent = 'Yönlendiriliyor...';
  try{
    const res = await fetch(PAYMENT_RENEW_URL, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ p_code: code, p_username: username, p_password: password })
    });
    const result = await res.json();
    if(!res.ok || !result.paymentPageUrl){
      errBox.textContent = result.errorMessage || 'Ödeme başlatılamadı';
      btn.disabled = false; btn.textContent = '💳 Ödemeye Geç';
      return;
    }
    window.location.href = result.paymentPageUrl;
  }catch(e){
    errBox.textContent = 'Beklenmeyen bir hata oluştu';
    btn.disabled = false; btn.textContent = '💳 Ödemeye Geç';
  }
}

/* ---- Şifremi Unuttum ----
   1. adım: işletme kodu + kullanıcı adı -> işletmenin kayıtlı e-postasına
   6 haneli kod gönderilir (start_password_reset, start_registration'daki
   Resend gönderimiyle birebir aynı mekanizma).
   2. adım: kod + yeni şifre (iki kez, göster/gizle ile) -> doğrulanıp
   şifre güncellenir, kullanıcının tüm oturumları kapatılır. */
function renderForgotPasswordScreen(app){
  const step = APP.forgotStep || 1;
  app.innerHTML = `
    <div class="center-wrap">
    <div>
    <div class="auth-brand"><img src="/assets/images/logo.webp" alt="Peyktan" class="auth-brand-logo"><span class="name">Peyktan</span></div>
    <div class="box">
      <h1>Şifremi Unuttum</h1>
      <p class="muted" id="forgotSub">${step===1
        ? 'İşletme kodunuzu ve kullanıcı adınızı girin, kayıtlı e-postanıza doğrulama kodu gönderelim.'
        : 'E-postanıza gönderilen kodu ve yeni şifrenizi girin.'}</p>
      <div id="forgotStep1" style="display:${step===1?'block':'none'};">
        <input id="fpCode" placeholder="İşletme kodu (örn. test123)" autocapitalize="none" value="${escapeHtml((APP.pendingReset||{}).code||'')}">
        <input id="fpUser" placeholder="Kullanıcı adı" autocapitalize="none" value="${escapeHtml((APP.pendingReset||{}).username||'')}">
        <button id="fpSendBtn" onclick="doStartPasswordReset()">Kod Gönder</button>
      </div>
      <div id="forgotStep2" style="display:${step===2?'block':'none'};">
        <p class="muted" id="fpOtpInfo" style="text-align:center;"></p>
        <input id="fpOtp" placeholder="6 haneli kod" maxlength="6" style="text-align:center;font-size:20px;letter-spacing:4px;">
        <div class="pw-field-wrap">
          <input type="password" id="fpNewPass" placeholder="Yeni şifre">
          <button type="button" class="pw-eye-btn" onclick="toggleForgotPassVisibility()" title="Şifreyi göster/gizle">👁️</button>
        </div>
        <div class="pw-field-wrap">
          <input type="password" id="fpNewPass2" placeholder="Yeni şifre (tekrar)">
          <button type="button" class="pw-eye-btn" onclick="toggleForgotPassVisibility()" title="Şifreyi göster/gizle">👁️</button>
        </div>
        <button id="fpVerifyBtn" onclick="doVerifyPasswordReset()">Şifreyi Güncelle</button>
        <button class="ghost-btn" style="width:100%;margin-top:10px;" onclick="APP.forgotStep=1;render();">← Bilgileri Düzenle</button>
      </div>
      <div class="error" id="fpErr"></div>
      <p class="muted" style="text-align:center;margin-top:14px;font-size:13px;">
        <a href="#" style="color:var(--accent);" onclick="APP.authScreen='login';render();return false;">← Girişe Dön</a>
      </p>
    </div>
    </div>
    </div>`;
}
function toggleForgotPassVisibility(){
  const f1 = document.getElementById('fpNewPass');
  const f2 = document.getElementById('fpNewPass2');
  const showing = f1.type === 'text';
  const nextType = showing ? 'password' : 'text';
  f1.type = nextType; f2.type = nextType;
  document.querySelectorAll('#forgotStep2 .pw-eye-btn').forEach(b => b.textContent = showing ? '👁️' : '🙈');
}
async function doStartPasswordReset(){
  const errBox = document.getElementById('fpErr');
  errBox.textContent = '';
  const code = document.getElementById('fpCode').value.trim();
  const username = document.getElementById('fpUser').value.trim();
  if(!code || !username){ errBox.textContent = 'İşletme kodu ve kullanıcı adı gerekli'; return; }
  const btn = document.getElementById('fpSendBtn');
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  const { data, error } = await sb.rpc('start_password_reset', { p_code: code, p_username: username });
  btn.disabled = false; btn.textContent = 'Kod Gönder';
  if(error){ errBox.textContent = error.message; return; }
  APP.pendingReset = { code, username };
  APP.forgotStep = 2;
  render();
  const otpInfo = document.getElementById('fpOtpInfo');
  if(data && data.sent){
    otpInfo.textContent = 'İşletmenizin kayıtlı e-postasına gönderilen 6 haneli kodu girin.';
  } else {
    // Resend API anahtarı henüz ayarlanmadıysa (bkz. platform_settings.resend_api_key)
    // e-posta gerçekten gönderilmez, test kodu burada gösterilir.
    otpInfo.innerHTML = 'E-posta gönderimi henüz ayarlanmadığı için test kodu: <b>' + escapeHtml((data||{}).test_otp||'') + '</b>';
  }
}
async function doVerifyPasswordReset(){
  const errBox = document.getElementById('fpErr');
  errBox.textContent = '';
  const pending = APP.pendingReset || {};
  const otp = document.getElementById('fpOtp').value.trim();
  const newPass = document.getElementById('fpNewPass').value;
  const newPass2 = document.getElementById('fpNewPass2').value;
  if(!otp){ errBox.textContent = 'Kodu girin'; return; }
  if(!newPass || newPass.length<4){ errBox.textContent = 'En az 4 karakter bir şifre girin'; return; }
  if(newPass !== newPass2){ errBox.textContent = 'Girdiğiniz şifreler eşleşmiyor'; return; }
  const btn = document.getElementById('fpVerifyBtn');
  btn.disabled = true; btn.textContent = 'Güncelleniyor...';
  const { data, error } = await sb.rpc('verify_password_reset', {
    p_code: pending.code, p_username: pending.username, p_otp: otp, p_new_password: newPass
  });
  btn.disabled = false; btn.textContent = 'Şifreyi Güncelle';
  if(error){ errBox.textContent = error.message; return; }
  if(data === false){ errBox.textContent = 'Kod hatalı'; return; }
  APP.pendingReset = null;
  APP.authScreen = 'login';
  showToast('Şifreniz güncellendi, şimdi giriş yapabilirsiniz ✓');
  render();
}

function renderSignupScreen(app){
  app.innerHTML = `
    <div class="center-wrap">
    <div>
    <div class="auth-brand"><img src="/assets/images/logo.webp" alt="Peyktan" class="auth-brand-logo"><span class="name">Peyktan</span></div>
    <div class="box" style="max-width:560px;">
      <h1 id="signupTitle">Yeni İşletme Kaydı</h1>
      <p class="muted" id="signupSub">İşletmenizi kaydedip paketinizi seçin.</p>
      <div id="signupStep1">
        <input id="suName" placeholder="İşletme adı (örn. Lezzet Durağı)">
        <input id="suCode" placeholder="İşletme kodu (giriş için kullanılacak, örn. lezzet2024)" autocapitalize="none">
        <input id="suEmail" type="email" placeholder="E-posta adresi" autocapitalize="none">
        <input id="suPhone" type="tel" placeholder="Telefon (örn. 5551234567)">
        <input id="suAdminUser" placeholder="Yönetici kullanıcı adı" autocapitalize="none">
        <input id="suAdminPass" type="password" placeholder="Yönetici şifresi">
        <input id="suIdentityNumber" placeholder="T.C. Kimlik Numarası (fatura için)" inputmode="numeric" maxlength="11">
        <input id="suPromo" placeholder="İndirim kodu (varsa)" autocapitalize="none" style="text-transform:uppercase;">
        <div id="pkgCards" class="pkg-grid"></div>
        <div id="addonPicks" style="margin-top:14px;"></div>
        <div id="cartTotal" style="margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;font-size:13.5px;"></div>
        <label style="display:flex;align-items:flex-start;gap:8px;margin-top:14px;font-size:12.5px;line-height:1.4;cursor:pointer;">
          <input id="suPrivacyConsent" type="checkbox" style="width:auto;margin:2px 0 0;flex-shrink:0;">
          <span><a href="/gizlilik/" target="_blank" rel="noopener" style="color:var(--accent);">Gizlilik Politikası</a>'nı okudum, işletme ve yönetici bilgilerimin belirtilen amaçlarla işlenmesini kabul ediyorum.</span>
        </label>
        <button style="margin-top:16px;" onclick="doStartSignup()" id="signupBtn">🛒 Satın Al ve Hesabı Oluştur</button>
        <p class="muted" style="text-align:center;font-size:11.5px;margin-top:6px;">İlk 7 gün ücretsiz; kart bilgisi istenmez. Süre sonunda sepetinizdeki paket ve eklentilerin ücretiyle devam edersiniz. Yalnızca seçtiğiniz eklentiler hesabınıza açılır.</p>
      </div>
      <div id="signupStep2" style="display:none;">
        <p class="muted" id="otpInfo" style="text-align:center;"></p>
        <input id="suOtp" placeholder="6 haneli kod" maxlength="6" style="text-align:center;font-size:20px;letter-spacing:4px;">
        <button style="margin-top:10px;" onclick="doVerifySignup()" id="verifyBtn">Doğrula ve Kaydı Tamamla</button>
        <button class="ghost-btn" style="width:100%;margin-top:10px;" onclick="backToSignupForm()">← Bilgileri Düzenle</button>
      </div>
      <div class="error" id="suErr"></div>
      <p class="muted" style="text-align:center;margin-top:14px;font-size:13px;">
        Zaten hesabınız var mı? <a href="#" style="color:var(--accent);" onclick="APP.authScreen='login';render();return false;">Giriş Yap</a>
      </p>
    </div>
    </div>
    </div>`;
  loadPackagesThenRenderCards();
}
/* Paketler platform admin ekranından eklenip/silinebildiği için sabit
   değil - kayıt ekranı her açıldığında canlı okunur (bkz. list_packages). */
function readCartParams(){
  if(APP._cartParamsRead) return; APP._cartParamsRead = true;
  const q = new URLSearchParams(window.location.search);
  if(q.get('pkg')) APP.selectedPackage = q.get('pkg');
  APP.selectedAddons = new Set((q.get('addons')||'').split(',').map(x=>x.trim()).filter(Boolean));
  APP.signupCycle = q.get('cycle')==='yearly' ? 'yearly' : 'monthly';
}
async function loadPackagesThenRenderCards(){
  readCartParams();
  if(!APP.selectedAddons) APP.selectedAddons = new Set();
  await loadPackages(true);
  try{
    const { data } = await sb.rpc('list_addons');
    APP.signupAddons = Array.isArray(data) ? data : [];
  }catch(e){ APP.signupAddons = []; }
  const valid = new Set(APP.signupAddons.map(a=>a.id));
  APP.selectedAddons = new Set([...APP.selectedAddons].filter(id=>valid.has(id)));
  if(!APP.selectedPackage || !PACKAGES_BY_ID[APP.selectedPackage]){
    const popular = PACKAGES.find(p => p.is_popular);
    APP.selectedPackage = (popular || PACKAGES[0] || {}).id || null;
  }
  renderPkgCards();
}
function toggleSignupAddon(id){
  if(APP.selectedAddons.has(id)) APP.selectedAddons.delete(id); else APP.selectedAddons.add(id);
  renderPkgCards();
}
function renderSignupAddons(){
  const el = document.getElementById('addonPicks'); if(!el) return;
  const list = APP.signupAddons || [];
  if(!list.length){ el.innerHTML=''; return; }
  el.innerHTML = `<div style="font-weight:700;font-size:13.5px;margin-bottom:6px;">🧩 Eklentiler <span class="muted" style="font-weight:400;">(isteğe bağlı — seçmezseniz yalnızca paket özellikleri açılır)</span></div>` +
    list.map(a => `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;cursor:pointer;">
      <input type="checkbox" style="width:auto;margin:0;" ${APP.selectedAddons.has(a.id)?'checked':''} onchange="toggleSignupAddon('${escapeHtml(a.id)}')">
      <span style="flex:1;">${escapeHtml(a.label||a.id)}</span><b>+${money(Number(a.price)||0)}/ay</b></label>`).join('');
}
function renderCartTotal(){
  const el = document.getElementById('cartTotal'); if(!el) return;
  const p = PACKAGES_BY_ID[APP.selectedPackage];
  if(!p){ el.innerHTML=''; return; }
  const yearly = APP.signupCycle==='yearly';
  const addons = (APP.signupAddons||[]).filter(a=>APP.selectedAddons.has(a.id));
  const addonM = addons.reduce((t,a)=>t+(Number(a.price)||0),0);
  const pkgAmt = yearly ? (Number(p.price_yearly)||Number(p.price)*12) : Number(p.price)||0;
  const total = pkgAmt + (yearly ? addonM*12 : addonM);
  el.innerHTML = `🛒 <b>${escapeHtml(p.name)}</b>${addons.length?' + '+addons.map(a=>escapeHtml(a.label||a.id)).join(', '):''}
    <div style="margin-top:4px;">Toplam: <b>${money(total)}</b> / ${yearly?'yıl':'ay'}
    <a href="#" style="color:var(--accent);margin-left:8px;font-size:12px;" onclick="APP.signupCycle='${yearly?'monthly':'yearly'}';renderPkgCards();return false;">${yearly?'Aylığa geç':'Yıllığa geç'}</a></div>`;
}
function renderPkgCards(){
  renderSignupAddons(); renderCartTotal();
  const el = document.getElementById('pkgCards'); if(!el) return;
  if(PACKAGES.length===0){ el.innerHTML = '<p class="muted">Şu anda seçilebilecek bir paket yok.</p>'; return; }
  el.innerHTML = PACKAGES.map(p => {
    return `<div class="pkg-card ${APP.selectedPackage===p.id?'selected':''}" onclick="APP.selectedPackage='${p.id}';renderPkgCards();">
      <div class="pkg-icon">${APP.selectedPackage===p.id?'✅':'📦'}</div>
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.description)}</p>
      <div class="pkg-price">${p.price?money(p.price):'—'}<br><small>/ay (7 gün ücretsiz)</small></div>
    </div>`;
  }).join('');
}
function backToSignupForm(){
  document.getElementById('signupStep1').style.display='block';
  document.getElementById('signupStep2').style.display='none';
  document.getElementById('signupTitle').textContent='Yeni İşletme Kaydı';
  document.getElementById('signupSub').textContent='İşletmenizi kaydedip paketinizi seçin.';
  document.getElementById('suErr').textContent='';
}
function isValidTcKimlikNo(num){
  if(!/^[1-9][0-9]{10}$/.test(num)) return false;
  const d = num.split('').map(Number);
  const odd = d[0]+d[2]+d[4]+d[6]+d[8];
  const even = d[1]+d[3]+d[5]+d[7];
  const d10 = ((odd*7) - even) % 10;
  if(((d10%10+10)%10) !== d[9]) return false;
  const sum10 = d.slice(0,10).reduce((a,b)=>a+b,0);
  if((sum10 % 10) !== d[10]) return false;
  return true;
}
async function doStartSignup(){
  const errBox = document.getElementById('suErr');
  errBox.textContent = '';
  const name = document.getElementById('suName').value.trim();
  const code = document.getElementById('suCode').value.trim().toLowerCase();
  const email = document.getElementById('suEmail').value.trim();
  const phone = document.getElementById('suPhone').value.trim().replace(/\s+/g,'');
  const adminUser = document.getElementById('suAdminUser').value.trim();
  const adminPass = document.getElementById('suAdminPass').value;
  const identityNumber = document.getElementById('suIdentityNumber').value.trim();
  const promo = document.getElementById('suPromo').value.trim();
  if(!name || !code || !email || !phone || !adminUser || !adminPass || !identityNumber){ errBox.textContent = 'Tüm alanları doldurun'; return; }
  if(!email.includes('@')){ errBox.textContent = 'Geçerli bir e-posta girin'; return; }
  if(phone.length<10){ errBox.textContent = 'Geçerli bir telefon numarası girin'; return; }
  if(!isValidTcKimlikNo(identityNumber)){ errBox.textContent = 'Geçerli bir T.C. Kimlik Numarası girin'; return; }
  if(!APP.selectedPackage){ errBox.textContent = 'Bir paket seçin'; return; }
  if(!document.getElementById('suPrivacyConsent').checked){ errBox.textContent = 'Devam etmek için Gizlilik Politikası\'nı kabul etmeniz gerekiyor'; return; }
  const btn = document.getElementById('signupBtn');
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  const { data, error } = await sb.rpc('start_registration', { p_email: email, p_phone: phone });
  btn.disabled = false; btn.textContent = 'Doğrulama Kodu Gönder';
  if(error){ errBox.textContent = error.message; return; }
  APP.pendingSignup = { name, code, email, phone, adminUser, adminPass, identityNumber, promo };
  document.getElementById('signupStep1').style.display='none';
  document.getElementById('signupStep2').style.display='block';
  document.getElementById('signupTitle').textContent='E-postanızı Doğrulayın';
  document.getElementById('signupSub').textContent = email+' adresine gönderilen 6 haneli kodu girin.';
  const otpInfo = document.getElementById('otpInfo');
  if(data && data.sent===false){
    otpInfo.innerHTML = '⚠️ TEST MODU: E-posta sağlayıcısı henüz ayarlanmamış. Kodunuz: <b>'+data.test_otp+'</b>';
  } else {
    otpInfo.textContent = 'Kod birkaç saniye içinde e-postanıza ulaşacaktır (gelen kutusunu ve spam klasörünü kontrol edin).';
  }
}
async function doVerifySignup(){
  const errBox = document.getElementById('suErr');
  errBox.textContent = '';
  const otp = document.getElementById('suOtp').value.trim();
  if(!otp){ errBox.textContent = 'Kodu girin'; return; }
  const p = APP.pendingSignup;
  if(!p){ errBox.textContent = 'Bir hata oluştu, baştan deneyin'; backToSignupForm(); return; }
  const btn = document.getElementById('verifyBtn');
  btn.disabled = true; btn.textContent = 'Doğrulanıyor...';
  const { data, error } = await sb.rpc('verify_registration_otp', {
    p_phone: p.phone, p_otp: otp,
    p_name: p.name, p_code: p.code, p_package_id: APP.selectedPackage, p_email: p.email,
    p_admin_username: p.adminUser, p_admin_password: p.adminPass,
    p_identity_number: p.identityNumber,
    p_addons: [...(APP.selectedAddons||[])]
  });
  btn.disabled = false; btn.textContent = 'Doğrula ve Kaydı Tamamla';
  if(error){ errBox.textContent = error.message; return; }
  if(!data || data.length===0){ errBox.textContent = 'Kod hatalı'; return; }
  const code = p.code;
  APP.pendingSignup = null;
  // Hesap artik odeme beklemeden 7 gunluk ucretsiz deneme ile direkt aktif aciliyor.
  APP.authScreen = 'login';
  render();
  alert('Kaydınız oluşturuldu! 7 günlük ücretsiz deneme süreniz başladı.\n\nİşletme kodu: ' + code + '\nŞimdi giriş yapabilirsiniz.');
}

/* ---- Hesabımı Sil (Google Play hesap silme şartı) ----
   Personel ya da başka yöneticisi olan bir yönetici: sadece kendi kullanıcısı
   silinir. İşletmenin TEK yöneticisi: işletme ve tüm verileri kalıcı olarak
   silinir - bu yüzden onay için işletme kodunu yazması istenir. Karar
   sunucuda verilir (bkz. delete_my_account / _delete_account_core). */
function openDeleteAccountModal(){
  const session = getSession(); if(!session) return;
  const bg = document.createElement('div');
  bg.id = 'deleteAccountModalBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) closeDeleteAccountModal(); };
  bg.innerHTML = `<div class="box" style="max-width:420px;width:100%;text-align:left;">
    <h2 style="margin-top:0;">🗑️ Hesabımı Sil</h2>
    <p class="muted" style="margin:0 0 10px;font-size:13px;">Bu işlem geri alınamaz.</p>
    ${session.isManager ? `
      <p style="font-size:13px;margin:0 0 10px;">İşletmenizin <b>tek yöneticisi</b> sizseniz, <b>işletmenin tamamı</b> (menü, siparişler, satış geçmişi, müşteriler, personel hesapları dahil tüm veriler) kalıcı olarak silinir. Başka bir yönetici varsa yalnızca sizin kullanıcınız silinir.</p>
      <input id="delAccConfirmCode" placeholder="Onay için işletme kodunuzu yazın" autocapitalize="none" style="margin-bottom:10px;">
    ` : `
      <p style="font-size:13px;margin:0 0 10px;">Yalnızca sizin kullanıcı hesabınız silinir. İşletmenin kayıtları (siparişler, satışlar) işletmede kalır, ancak artık sizinle ilişkilendirilmez.</p>
    `}
    <input id="delAccPassword" type="password" placeholder="Şifreniz" style="margin-bottom:10px;">
    <div class="error" id="delAccErr" style="text-align:left;"></div>
    <div class="field-row" style="gap:8px;margin-top:6px;">
      <button type="button" style="flex:1;margin:0;background:var(--panel2);color:var(--text);" onclick="closeDeleteAccountModal()">Vazgeç</button>
      <button type="button" id="delAccBtn" style="flex:1;margin:0;background:var(--red);color:var(--btn-ink);" onclick="submitDeleteAccount()">Kalıcı Olarak Sil</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
}
function closeDeleteAccountModal(){ const bg = document.getElementById('deleteAccountModalBg'); if(bg) bg.remove(); }
async function submitDeleteAccount(){
  const session = getSession(); if(!session) return;
  const errBox = document.getElementById('delAccErr');
  const password = document.getElementById('delAccPassword').value;
  const codeEl = document.getElementById('delAccConfirmCode');
  errBox.textContent = '';
  if(!password){ errBox.textContent = 'Şifrenizi girin'; return; }
  if(!confirm('Hesabınız kalıcı olarak silinecek. Emin misiniz?')) return;
  const btn = document.getElementById('delAccBtn');
  btn.disabled = true; btn.textContent = 'Siliniyor...';
  const { data, error } = await sb.rpc('delete_my_account', {
    p_token: session.session_token, p_password: password, p_confirm_code: codeEl ? codeEl.value.trim() : null
  });
  btn.disabled = false; btn.textContent = 'Kalıcı Olarak Sil';
  if(error){ errBox.textContent = error.message; return; }
  if(!data || !data.ok){ errBox.textContent = (data && data.error) || 'Silinemedi'; return; }
  closeDeleteAccountModal();
  // Oturum sunucuda zaten silindi (cascade) - burada sadece yerel temizlik
  // yapılır; doLogout'taki logout_staff/push RPC'leri geçersiz token'la
  // "oturum sonlandı" uyarısı tetikleyeceği için çağrılmıyor.
  stopKitchenPolling();
  stopOrderPolling();
  stopCustomerRequestPolling();
  APP.customerReqPollStarted = false;
  APP.shiftStatus = null;
  if(isNativeApp()) setSavedFcmToken('');
  clearSession();
  APP.authScreen = 'login';
  render();
  alert(data.scope==='restaurant'
    ? 'İşletmeniz ve tüm verileri kalıcı olarak silindi.'
    : 'Kullanıcı hesabınız kalıcı olarak silindi.');
}
