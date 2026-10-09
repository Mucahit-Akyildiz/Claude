/* Gizli Platform Yönetimi (?admin=1) - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= GİZLİ PLATFORM YÖNETİMİ (?admin=1) ================= */
function renderAdminArea(){
  const app = document.getElementById('app');
  const admin = getAdminSession();
  if(!admin){ renderAdminLogin(app); return; }
  const theme = getTheme();
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">🔒 Platform Yönetimi</div>
      <div class="right">
        <div class="theme-toggle" style="width:150px;background:var(--panel2);border:1px solid var(--border);">
          <button class="${theme==='dark'?'active':''}" style="color:${theme==='dark'?'':'var(--muted)'};background:${theme==='dark'?'var(--accent)':'transparent'};box-shadow:none;" onclick="setTheme('dark')" type="button">🌙 Koyu</button>
          <button class="${theme==='light'?'active':''}" style="color:${theme==='light'?'':'var(--muted)'};background:${theme==='light'?'var(--accent)':'transparent'};box-shadow:none;" onclick="setTheme('light')" type="button">☀️ Açık</button>
        </div>
        <button class="ghost-btn" onclick="doAdminLogout()">Çıkış</button>
      </div>
    </header>
    <div class="content-inner content-inner-wide">
      <div class="tabs" id="adminTabs">
        <div class="tab ${(APP.adminView||'promos')==='promos'?'active':''}" data-tab="promos" onclick="setAdminView('promos')">Promosyon Kodları</div>
        <div class="tab ${APP.adminView==='pricing'?'active':''}" data-tab="pricing" onclick="setAdminView('pricing')">💳 Paket Fiyatları</div>
        <div class="tab ${APP.adminView==='restaurants'?'active':''}" data-tab="restaurants" onclick="setAdminView('restaurants')">🏬 İşletmeler</div>
        <div class="tab ${APP.adminView==='companies'?'active':''}" data-tab="companies" onclick="setAdminView('companies')">🏢 Şirketler</div>
        <div class="tab ${APP.adminView==='banktransfers'?'active':''}" data-tab="banktransfers" onclick="setAdminView('banktransfers')">🏦 Havale Bildirimleri</div>
        <div class="tab ${APP.adminView==='allfeatures'?'active':''}" data-tab="allfeatures" onclick="setAdminView('allfeatures')">🗂️ Tüm Özellikler</div>
        <div class="tab ${APP.adminView==='addons'?'active':''}" data-tab="addons" onclick="setAdminView('addons')">🧩 Eklentiler</div>
        <div class="tab ${APP.adminView==='deleted'?'active':''}" data-tab="deleted" onclick="setAdminView('deleted')">🗑️ Silinen Hesaplar</div>
        <div class="tab ${APP.adminView==='sms'?'active':''}" data-tab="sms" onclick="setAdminView('sms')">📱 SMS</div>
        <div class="tab ${APP.adminView==='errors'?'active':''}" data-tab="errors" onclick="setAdminView('errors')">⚠️ Hatalar</div>
        <div class="tab ${APP.adminView==='support'?'active':''}" data-tab="support" onclick="setAdminView('support')">✉️ Destek <span id="supportBadge"></span></div>
        <div class="tab ${APP.adminView==='gif'?'active':''}" data-tab="gif" onclick="setAdminView('gif')">🎞️ GIF</div>
      </div>
      <main id="main"></main>
    </div>`;
  renderAdminTabContent(admin);
  refreshSupportBadge();
}
function setAdminView(v){
  APP.adminView = v;
  document.querySelectorAll('#adminTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab===v));
  renderAdminTabContent(getAdminSession());
}
function renderAdminTabContent(admin){
  const main = document.getElementById('main');
  if((APP.adminView||'promos')==='pricing') renderPricingAdmin(main, admin);
  else if(APP.adminView==='restaurants') renderRestaurantsAdmin(main, admin);
  else if(APP.adminView==='companies') renderCompaniesAdmin(main, admin);
  else if(APP.adminView==='banktransfers') renderBankTransfersAdmin(main, admin);
  else if(APP.adminView==='allfeatures') renderFeatureCatalogAdmin(main, admin);
  else if(APP.adminView==='addons') renderAddonsAdmin(main, admin);
  else if(APP.adminView==='deleted') renderDeletedAccountsAdmin(main, admin);
  else if(APP.adminView==='sms') renderSmsAdmin(main, admin);
  else if(APP.adminView==='errors') renderClientErrorsAdmin(main, admin);
  else if(APP.adminView==='support') renderSupportAdmin(main, admin);
  else if(APP.adminView==='gif') renderGifAdmin(main, admin);
  else renderPromoAdmin(main, admin);
}
/* Hatalar: uygulamada yakalanan JavaScript ve beklenmeyen veritabanı
   hataları (bkz. log_client_error) - aynı hata tek satırda, tekrar sayısıyla.
   Çözüldü işaretlenen hata tekrar olursa yeni satır olarak döner. */
async function renderClientErrorsAdmin(main, admin){
  const showAll = !!APP.adminErrorsAll;
  main.innerHTML = `<h1>⚠️ Hatalar</h1>
    <label style="display:flex;gap:8px;align-items:center;margin:0 0 12px;"><input type="checkbox" style="width:auto;margin:0;" ${showAll?'checked':''} onchange="APP.adminErrorsAll=this.checked;renderClientErrorsAdmin(document.getElementById('main'), getAdminSession())"> Çözülenleri de göster</label>
    <div id="errList"><p class="muted">Yükleniyor…</p></div>`;
  const { data, error } = await sb.rpc('admin_list_client_errors', { p_token: admin.session_token, p_show_resolved: showAll });
  const el = document.getElementById('errList'); if(!el) return;
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const rows = data || [];
  if(!rows.length){ el.innerHTML = '<p class="muted">Kayıtlı hata yok 🎉</p>'; return; }
  const ua = (u) => !u ? '-' : /Android/i.test(u) ? 'Android' : /iPhone|iPad/i.test(u) ? 'iOS' : /Windows/i.test(u) ? 'Windows' : /Mac/i.test(u) ? 'Mac' : 'Diğer';
  el.innerHTML = `<div class="settings-table-wrap"><table class="settings-table">
    <thead><tr><th>Hata</th><th>Tekrar</th><th>İşletme</th><th>Ekran</th><th>Cihaz</th><th>Son</th><th></th></tr></thead>
    <tbody>${rows.map(r => `<tr style="${r.resolved?'opacity:.55;':''}">
      <td class="col-name" style="max-width:420px;"><b style="overflow-wrap:anywhere;">${escapeHtml(r.message)}</b>
        <div class="muted" style="font-size:11.5px;overflow-wrap:anywhere;">${escapeHtml(r.kind)} · ${escapeHtml(r.source||'-')}</div></td>
      <td><b style="color:${r.count>=5?'var(--red)':'inherit'};">${r.count}</b></td>
      <td>${escapeHtml(r.restaurant_name||'-')}${r.restaurant_code?` <span class="muted" style="font-size:11px;">${escapeHtml(r.restaurant_code)}</span>`:''}</td>
      <td>${escapeHtml(r.view||'-')}</td>
      <td title="${escapeAttr(r.user_agent||'')}">${ua(r.user_agent)}</td>
      <td style="font-size:12px;white-space:nowrap;">${new Date(r.last_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
      <td>${r.resolved ? '<span class="muted">Çözüldü</span>' : `<button class="sbtn" style="width:auto;" onclick="resolveClientError(${r.id})">✓ Çözüldü</button>`}</td>
    </tr>`).join('')}</tbody></table></div>`;
}
async function resolveClientError(id){
  const admin = getAdminSession();
  const { error } = await sb.rpc('admin_resolve_client_error', { p_token: admin.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  renderClientErrorsAdmin(document.getElementById('main'), admin);
}
/* Silinen işletmeler (deleted_accounts): restaurants tablosundan silinen her
   kayıt bir tetikleyiciyle buraya yazılır; buradaki e-posta/telefonla
   yeniden kayıt açılamaz (bkz. _registration_blocked). "Engeli Kaldır"
   kaydı siler ve aynı bilgilerle tekrar kayıt mümkün olur. */
/* SMS sağlayıcısı platform genelindedir (işletmeler sadece aç/kapa yapar).
   Sağlayıcı tanımlı değilken mesajlar sms_outbox'a 'no_provider' olarak
   düşer; Netgsm bilgileri girilince gönderilmeye başlar. */
async function renderSmsAdmin(main, admin){
  main.innerHTML = '<p class="muted">Yükleniyor...</p>';
  const { data, error } = await sb.rpc('admin_get_sms', { p_token: admin.session_token });
  if(error){ main.innerHTML = '<p class="error">'+escapeHtml(error.message)+'</p>'; return; }
  const st = { queued:'Kuyrukta', dispatched:'Gönderildi', no_provider:'Sağlayıcı yok', skipped:'Limit' };
  main.innerHTML = `<h1>📱 SMS</h1>
    <div class="box" style="max-width:640px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="field-group"><label>Sağlayıcı</label><select id="smsProvider">
          <option value="">— Kapalı (sadece kayıt) —</option>
          <option value="netgsm" ${data.provider==='netgsm'?'selected':''}>Netgsm</option>
        </select></div>
        <div class="field-group"><label>Gönderici Başlığı</label><input id="smsHeader" value="${escapeAttr(data.header||'')}" placeholder="örn. PEYKTAN"></div>
        <div class="field-group"><label>Kullanıcı Kodu</label><input id="smsUser" value="${escapeAttr(data.username||'')}" autocapitalize="none"></div>
        <div class="field-group"><label>Şifre</label><input id="smsPass" type="password" placeholder="${data.password_set?'(kayıtlı - değiştirmek için yaz)':'Şifre'}"></div>
      </div>
      <button style="max-width:200px;margin-top:10px;" onclick="saveSmsAdmin()">${ICON_SAVE}<span>Kaydet</span></button>
    </div>
    <h3 style="margin-top:20px;">Son 50 SMS</h3>
    ${!(data.recent||[]).length ? '<p class="muted">Henüz SMS yok.</p>' : `<table class="settings-table"><thead><tr><th>Tarih</th><th>İşletme</th><th>Telefon</th><th>Tür</th><th>Mesaj</th><th>Durum</th></tr></thead><tbody>${
      data.recent.map(r => `<tr><td style="font-size:12px;">${new Date(r.created_at).toLocaleString('tr-TR')}</td><td>${escapeHtml(r.restaurant||'Platform')}</td><td>${escapeHtml(r.phone)}</td><td>${escapeHtml(r.purpose)}</td><td style="font-size:12px;white-space:normal;">${escapeHtml(r.purpose==='otp' ? '(doğrulama kodu gizli)' : r.message)}</td><td>${st[r.status]||escapeHtml(r.status)}</td></tr>`).join('')}</tbody></table>`}`;
}
async function saveSmsAdmin(){
  const admin = getAdminSession();
  const v = id => document.getElementById(id).value;
  const { error } = await sb.rpc('admin_set_sms', { p_token: admin.session_token, p_provider: v('smsProvider'), p_username: v('smsUser'), p_password: v('smsPass'), p_header: v('smsHeader') });
  if(error){ alert(error.message); return; }
  showToast('SMS ayarları kaydedildi ✓');
  renderAdminTabContent(admin);
}
async function renderDeletedAccountsAdmin(main, admin){
  main.innerHTML = '<p class="muted">Yükleniyor...</p>';
  const { data, error } = await sb.rpc('admin_list_deleted_accounts', { p_token: admin.session_token });
  if(error){ main.innerHTML = '<p class="error">'+escapeHtml(error.message)+'</p>'; return; }
  const rows = data || [];
  const fmt = d => d ? new Date(d).toLocaleString('tr-TR') : '—';
  main.innerHTML = `<p class="muted" style="font-size:13px;">Silinen işletmelerin e-posta ve telefonuyla yeniden hesap açılamaz. Tekrar kayda izin vermek için "Engeli Kaldır"a basın.</p>
    ${rows.length===0 ? '<p class="muted">Silinen hesap yok.</p>' : `
    <table class="settings-table">
      <thead><tr><th>İşletme</th><th>E-posta / Telefon</th><th>Paket</th><th>Açılış</th><th>Silinme</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><b>${escapeHtml(r.name||'—')}</b><div class="muted" style="font-size:11.5px;">${escapeHtml(r.code||'')}</div></td>
        <td style="font-size:12.5px;">${escapeHtml(r.email||'—')}<div class="muted">${escapeHtml(r.phone||'—')}</div></td>
        <td>${escapeHtml(r.package_id||'—')}</td>
        <td style="font-size:12px;">${fmt(r.created_at)}</td>
        <td style="font-size:12px;">${fmt(r.deleted_at)}</td>
        <td><button class="sbtn" onclick="releaseDeletedAccount('${r.id}')">Engeli Kaldır</button></td>
      </tr>`).join('')}</tbody>
    </table>`}`;
}
async function releaseDeletedAccount(id){
  if(!confirm('Bu kayıt kalıcı olarak silinecek ve aynı e-posta/telefonla yeniden hesap açılabilecek. Emin misiniz?')) return;
  const admin = getAdminSession();
  const { error } = await sb.rpc('admin_release_deleted_account', { p_token: admin.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  showToast('Engel kaldırıldı ✓');
  renderAdminTabContent(admin);
}
function renderAdminLogin(app){
  app.innerHTML = `<div class="center-wrap"><div class="box">
    <h1>Platform Yönetimi</h1>
    <p class="muted">Bu alan sadece size özeldir.</p>
    <input id="adminUser" placeholder="Kullanıcı adı" autocapitalize="none">
    <input id="adminPass" type="password" placeholder="Şifre">
    <input id="adminOtp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="Doğrulama kodu (6 hane)" style="display:none;">
    <button onclick="doAdminLogin()" id="adminLoginBtn">Giriş Yap</button>
    <div class="error" id="adminErr"></div>
  </div></div>`;
}
async function doAdminLogin(){
  const errBox = document.getElementById('adminErr');
  errBox.textContent = '';
  const u = document.getElementById('adminUser').value.trim();
  const p = document.getElementById('adminPass').value;
  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true; btn.textContent = 'Giriş yapılıyor...';
  const otpEl = document.getElementById('adminOtp');
  const otp = otpEl && otpEl.style.display !== 'none' ? otpEl.value.trim() : null;
  const { data, error } = await sb.rpc('platform_admin_login', { p_username: u, p_password: p, p_otp: otp || null });
  btn.disabled = false; btn.textContent = 'Giriş Yap';
  if(error && /OTP_GEREKLI/.test(error.message)){
    otpEl.style.display = ''; otpEl.focus();
    errBox.textContent = 'Telefonunuzdaki doğrulama uygulamasındaki 6 haneli kodu girin.'; return;
  }
  if(error && otp){ errBox.textContent = error.message; otpEl.value = ''; return; }
  if(error || !data || data.length===0){ errBox.textContent = 'Kullanıcı adı veya şifre hatalı'; return; }
  setAdminSession({ session_token: data[0].session_token, username: data[0].username });
  render();
}
function doAdminLogout(){ clearAdminSession(); render(); }

async function renderPromoAdmin(main, admin){
  main.innerHTML = `<h1>Promosyon Kodları</h1><div id="promoContent"></div>`;
  await withLoadingOverlay(refreshPromoList(admin));
}
/* Paketler artık sabit kodlanmış 3 tane değil - platform admin burada
   yeni paket ekleyebilir, mevcutları düzenleyebilir/pasif yapabilir ve
   hiçbir işletme kullanmıyorsa silebilir (bkz. admin_list_packages,
   admin_upsert_package, admin_delete_package). Web sitesi ve kayıt
   ekranı bunları list_packages() ile canlı okur. */
async function renderPricingAdmin(main, admin){
  main.innerHTML = `<h1>💳 Paket Fiyatları</h1><div id="pricingContent"></div>`;
  await withLoadingOverlay(refreshPackagesAdmin(admin));
}
async function refreshPackagesAdmin(admin){
  const el = document.getElementById('pricingContent'); if(!el) return;
  const [{ data, error }, { data: featData }] = await Promise.all([
    sb.rpc('admin_list_packages', { p_token: admin.session_token }),
    sb.rpc('admin_list_feature_catalog', { p_token: admin.session_token })
  ]);
  if(error){
    if(error.message.includes('geçersiz')){ clearAdminSession(); render(); return; }
    el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return;
  }
  APP.featureCatalog = featData || [];
  const packages = data || [];
  el.innerHTML = `
    <p class="muted" style="text-align:left;max-width:640px;">Bu fiyatlar, işletmelerin 7 günlük ücretsiz denemesi bittikten sonra
      ödeyeceği tutarlardır - web sitesi ve kayıt ekranında canlı olarak gösterilir. Yıllık fiyat boş bırakılırsa
      otomatik olarak aylık fiyatın 12 katı (indirimsiz) kullanılır; indirimli bir yıllık fiyat sunmak isterseniz
      buraya girin.</p>
    ${packages.length===0 ? '<p class="muted">Henüz paket yok.</p>' : `
    <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr>
          <th>Kimlik</th><th>Ad</th><th>Açıklama</th><th>Kullanıcı Limiti</th><th>Şube Limiti</th><th>Fiyat (TL/ay)</th><th>Fiyat (TL/yıl)</th>
          <th>Popüler</th><th>Aktif</th><th>İşletme</th><th></th>
        </tr></thead>
        <tbody>
        ${packages.map(p => `
          <tr>
            <td class="col-name"><code>${escapeHtml(p.id)}</code></td>
            <td class="col-name"><input value="${escapeAttr(p.name)}" id="pkg_name_${p.id}"></td>
            <td class="col-name"><input value="${escapeAttr(p.description)}" id="pkg_desc_${p.id}"></td>
            <td class="col-num" style="width:90px;"><input type="number" min="1" step="1" value="${p.max_users}" id="pkg_users_${p.id}"></td>
            <td class="col-num" style="width:90px;"><input type="number" min="1" step="1" value="${p.max_branches||1}" id="pkg_branches_${p.id}" title="Bu paketi seçen bir şirket en fazla kaç şube açabilir"></td>
            <td class="col-num" style="width:110px;"><input type="number" min="0" step="0.01" value="${p.price}" id="pkg_price_${p.id}"></td>
            <td class="col-num" style="width:110px;"><input type="number" min="0" step="0.01" value="${p.price_yearly!=null?p.price_yearly:''}" id="pkg_price_yearly_${p.id}" placeholder="${(p.price*12).toFixed(2)}"></td>
            <td style="text-align:center;"><input type="checkbox" id="pkg_popular_${p.id}" ${p.is_popular?'checked':''} style="width:18px;height:18px;"></td>
            <td style="text-align:center;"><input type="checkbox" id="pkg_active_${p.id}" ${p.active?'checked':''} style="width:18px;height:18px;"></td>
            <td class="col-name">${p.restaurant_count} işletme</td>
            <td style="white-space:nowrap;">
              <button type="button" class="act-btn act-save" onclick="savePackageRow('${p.id}')">${ICON_SAVE}<span>Kaydet</span></button>
              <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="deletePackageRow('${p.id}', ${p.restaurant_count})" title="${p.restaurant_count>0?'Bu paketi kullanan işletmeler var':''}">Sil</button>
            </td>
          </tr>
          <tr>
            <td colspan="11" style="padding:6px 8px 16px;border-top:none;white-space:normal;">
              <div style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;" onclick="togglePackageFeaturePanel('${p.id}')">
                <span id="pkgFeatToggle_${p.id}" class="muted" style="font-size:11px;">▸</span>
                <span class="muted" style="font-size:12px;font-weight:700;">Bu pakette hangi özellikler olacak <span style="font-weight:400;">(${(p.features||[]).length}/${(APP.featureCatalog||[]).length} seçili)</span></span>
              </div>
              <div id="pkgFeatPanel_${p.id}" style="display:none;margin-top:10px;">
                ${featureCheckboxesHtml('pkg_feat_'+p.id, p.features||[])}
                ${includedAddonsHtml('pkg_inc_'+p.id, p.included_addons||[])}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
    <div class="add-row-panel" style="margin-top:20px;">
      <p>Yeni Paket Oluştur</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr 0.8fr 0.8fr 0.8fr 0.8fr;gap:10px;align-items:end;">
        <div class="field-group"><label>Kimlik (benzersiz, örn. paket4)</label><input id="npkgId" placeholder="paket4" autocapitalize="none"></div>
        <div class="field-group"><label>Ad</label><input id="npkgName" placeholder="örn. Kurumsal"></div>
        <div class="field-group"><label>Açıklama</label><input id="npkgDesc" placeholder="örn. Çok şubeli zincirler için"></div>
        <div class="field-group"><label>Kullanıcı Limiti</label><input type="number" min="1" step="1" id="npkgUsers" placeholder="20"></div>
        <div class="field-group"><label>Şube Limiti</label><input type="number" min="1" step="1" id="npkgBranches" placeholder="1" value="1"></div>
        <div class="field-group"><label>Fiyat (TL/ay)</label><input type="number" min="0" step="0.01" id="npkgPrice" placeholder="1499"></div>
        <div class="field-group"><label>Fiyat (TL/yıl, opsiyonel)</label><input type="number" min="0" step="0.01" id="npkgPriceYearly" placeholder="örn. 14990"></div>
      </div>
      <div class="muted" style="font-size:12px;font-weight:700;margin:14px 0 6px;">Bu pakette hangi özellikler olacak:</div>
      ${featureCheckboxesHtml('npkg_feat', (APP.featureCatalog||[]).filter(f=>f.is_core).map(f=>f.id))}
      ${includedAddonsHtml('npkg_inc', [])}
      <button style="margin-top:12px;max-width:220px;" onclick="createPackage()">+ Paket Oluştur</button>
      <div class="error" id="pkgCreateErr" style="text-align:left;"></div>
    </div>`;
}
/* Paket düzenleme/oluşturma satırlarında ortak kullanılan özellik seçim
   ızgarası - feature_catalog'daki HER özelliği kategoriye göre gruplayıp
   gösterir (kataloğu "🗂️ Tüm Özellikler" sekmesinden yönetirsiniz);
   id'ler idPrefix+'_'+anahtar şeklinde, readPackageFeatures ile okunur. */
/* Pakete bilinçli olarak dahil edilen eklentiler (packages.included_addons):
   normal özellik ızgarasından ayrıdır, böylece eklenti yanlışlıkla pakete
   karışmaz; burada işaretlenen eklenti o paketteki herkese ücretsiz açılır
   (bkz. admin_set_package_addons). */
function includedAddonsHtml(idPrefix, selected){
  const sel = new Set(selected||[]);
  const addons = (APP.featureCatalog||[]).filter(f => f.is_addon);
  if(!addons.length) return '';
  return `<div style="margin-top:12px;background:var(--panel2);border:1px dashed var(--accent);border-radius:10px;padding:10px 12px;">
    <div style="font-size:12px;font-weight:800;margin-bottom:6px;">🧩 Pakete dahil eklentiler <span class="muted" style="font-weight:400;">(işaretlenen eklenti bu pakette ücretsiz gelir)</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px 16px;">
      ${addons.map(a => `<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:400;">
        <input type="checkbox" id="${idPrefix}_${a.id}" ${sel.has(a.id)?'checked':''} style="width:15px;height:15px;"> ${escapeHtml(a.label)}</label>`).join('')}
    </div></div>`;
}
function readIncludedAddons(idPrefix){
  return (APP.featureCatalog||[]).filter(f => f.is_addon)
    .filter(a => { const el = document.getElementById(idPrefix+'_'+a.id); return el && el.checked; }).map(a => a.id);
}
function featureCheckboxesHtml(idPrefix, selectedFeatures){
  const sel = new Set(selectedFeatures||[]);
  // Eklentiler paketlere dahil edilemez (ayrı satılır, işletme/şirkete
  // "🧩 Eklentiler" butonundan atanır) - burada hiç listelenmez; sunucu
  // (admin_upsert_package) da gönderilse bile ayıklar.
  const all = APP.featureCatalog || [];
  const features = all.filter(f => !f.is_addon);
  const addons = all.filter(f => f.is_addon);
  if(features.length===0) return '<p class="muted">Önce "🗂️ Tüm Özellikler" sekmesinden özellik tanımlayın.</p>';
  const byCat = {};
  features.forEach(f => { (byCat[f.category||'Diğer'] = byCat[f.category||'Diğer'] || []).push(f); });
  const addonNote = addons.length
    ? `<p class="muted" style="font-size:12px;margin:10px 0 0;">🧩 ${addons.length} eklenti (${addons.map(a => escapeHtml(a.label)).join(', ')}) burada listelenmez; işletmeye/şirkete "🧩 Eklentiler" butonundan atanır ya da aşağıdaki "Pakete dahil eklentiler" bölümünden bu pakete bilinçli olarak eklenir.</p>`
    : '';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;align-items:start;">
    ${Object.keys(byCat).map(cat => {
      const catId = idPrefix+'_cat_'+cat.replace(/[^a-zA-Z0-9]/g,'_');
      const catSelCount = byCat[cat].filter(f => sel.has(f.id)).length;
      return `
      <div style="background:var(--panel2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <div style="font-size:12px;font-weight:800;">${escapeHtml(cat)} <span class="muted" style="font-weight:400;">(${catSelCount}/${byCat[cat].length})</span></div>
          <div style="display:flex;gap:8px;flex-shrink:0;">
            <span style="font-size:11px;color:var(--accent);cursor:pointer;" onclick="toggleFeatureCategory('${catId}', true)">tümü</span>
            <span style="font-size:11px;color:var(--accent);cursor:pointer;" onclick="toggleFeatureCategory('${catId}', false)">temizle</span>
          </div>
        </div>
        <div id="${catId}" style="display:flex;flex-direction:column;gap:6px;">
          ${byCat[cat].map(f => `
            <label style="display:flex;align-items:flex-start;gap:6px;font-size:12.5px;font-weight:400;line-height:1.3;">
              <input type="checkbox" id="${idPrefix}_${f.id}" ${sel.has(f.id)?'checked':''} style="width:15px;height:15px;flex-shrink:0;margin-top:1px;">
              <span>${escapeHtml(f.label)}</span>
            </label>`).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>${addonNote}`;
}
function toggleFeatureCategory(catId, checked){
  document.querySelectorAll('#'+catId+' input[type=checkbox]').forEach(el => { el.checked = checked; });
}
function togglePackageFeaturePanel(id){
  const panel = document.getElementById('pkgFeatPanel_'+id);
  const arrow = document.getElementById('pkgFeatToggle_'+id);
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  arrow.textContent = open ? '▸' : '▾';
}
function readPackageFeatures(idPrefix){
  return (APP.featureCatalog||[]).map(f => f.id).filter(key => {
    const el = document.getElementById(idPrefix+'_'+key);
    return el && el.checked;
  });
}
async function savePackageRow(id){
  const admin = getAdminSession();
  const name = document.getElementById('pkg_name_'+id).value.trim();
  const desc = document.getElementById('pkg_desc_'+id).value.trim();
  const maxUsers = Number(document.getElementById('pkg_users_'+id).value);
  const maxBranches = Number(document.getElementById('pkg_branches_'+id).value);
  const price = Number(document.getElementById('pkg_price_'+id).value);
  const priceYearlyRaw = document.getElementById('pkg_price_yearly_'+id).value.trim();
  const priceYearly = priceYearlyRaw==='' ? null : Number(priceYearlyRaw);
  const popular = document.getElementById('pkg_popular_'+id).checked;
  const active = document.getElementById('pkg_active_'+id).checked;
  if(!name){ alert('Paket adı gerekli'); return; }
  if(!(maxUsers>=1)){ alert('Kullanıcı limiti en az 1 olmalı'); return; }
  if(!(maxBranches>=1)){ alert('Şube limiti en az 1 olmalı'); return; }
  if(!(price>=0)){ alert('Fiyat negatif olamaz'); return; }
  if(priceYearly!==null && !(priceYearly>=0)){ alert('Yıllık fiyat negatif olamaz'); return; }
  const features = readPackageFeatures('pkg_feat_'+id);
  const { error } = await sb.rpc('admin_upsert_package', {
    p_token: admin.session_token, p_id: id, p_name: name, p_description: desc,
    p_max_users: maxUsers, p_price: price, p_is_popular: popular, p_active: active, p_features: features,
    p_max_branches: maxBranches, p_price_yearly: priceYearly
  });
  if(error){ alert(error.message); return; }
  const { error: e2 } = await sb.rpc('admin_set_package_addons', { p_token: admin.session_token, p_id: id, p_addons: readIncludedAddons('pkg_inc_'+id) });
  if(e2){ alert(e2.message); return; }
  showToast('Paket kaydedildi ✓');
  refreshPackagesAdmin(admin);
}
async function deletePackageRow(id, restaurantCount){
  if(restaurantCount>0){ alert('Bu paketi kullanan '+restaurantCount+' işletme var, silmeden önce onları başka bir pakete taşıyın.'); return; }
  if(!confirm('"'+id+'" paketini silmek istediğinize emin misiniz?')) return;
  const admin = getAdminSession();
  const { error } = await sb.rpc('admin_delete_package', { p_token: admin.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  showToast('Paket silindi ✓');
  refreshPackagesAdmin(admin);
}
async function createPackage(){
  const admin = getAdminSession();
  const errBox = document.getElementById('pkgCreateErr');
  errBox.textContent = '';
  const id = document.getElementById('npkgId').value.trim().toLowerCase();
  const name = document.getElementById('npkgName').value.trim();
  const desc = document.getElementById('npkgDesc').value.trim();
  const maxUsers = Number(document.getElementById('npkgUsers').value);
  const maxBranches = Number(document.getElementById('npkgBranches').value) || 1;
  const price = Number(document.getElementById('npkgPrice').value);
  const priceYearlyRaw = document.getElementById('npkgPriceYearly').value.trim();
  const priceYearly = priceYearlyRaw==='' ? null : Number(priceYearlyRaw);
  if(!id || !/^[a-z0-9_-]+$/.test(id)){ errBox.textContent = 'Kimlik sadece küçük harf/rakam/tire içerebilir'; return; }
  if(!name){ errBox.textContent = 'Paket adı gerekli'; return; }
  if(!(maxUsers>=1)){ errBox.textContent = 'Kullanıcı limiti en az 1 olmalı'; return; }
  if(!(maxBranches>=1)){ errBox.textContent = 'Şube limiti en az 1 olmalı'; return; }
  if(!(price>=0)){ errBox.textContent = 'Fiyat negatif olamaz'; return; }
  if(priceYearly!==null && !(priceYearly>=0)){ errBox.textContent = 'Yıllık fiyat negatif olamaz'; return; }
  const features = readPackageFeatures('npkg_feat');
  const { error } = await sb.rpc('admin_upsert_package', {
    p_token: admin.session_token, p_id: id, p_name: name, p_description: desc,
    p_max_users: maxUsers, p_price: price, p_is_popular: false, p_active: true, p_features: features,
    p_max_branches: maxBranches, p_price_yearly: priceYearly
  });
  if(error){ errBox.textContent = error.message; return; }
  const inc = readIncludedAddons('npkg_inc');
  if(inc.length){
    const { error: e2 } = await sb.rpc('admin_set_package_addons', { p_token: admin.session_token, p_id: id, p_addons: inc });
    if(e2){ errBox.textContent = e2.message; return; }
  }
  showToast('Paket oluşturuldu ✓');
  refreshPackagesAdmin(admin);
}

/* ---- İşletmeler (tenant analiz/raporu): tüm işletmelerin kayıt tarihi,
   aktiflik durumu, paketi, son aktifliği ve ciro özetini tek ekranda
   gösterir; platform admin buradan işletmeleri aktif/pasif edebilir
   (bkz. admin_list_restaurants, admin_platform_summary,
   admin_set_restaurant_active, admin_restaurant_daily_stats). ---- */
function statCard(label, value, color){
  return `<div class="card" style="cursor:default;">
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;">${escapeHtml(label)}</div>
    <div style="font-size:22px;font-weight:800;margin-top:6px;${color?'color:'+color+';':''}">${value}</div>
  </div>`;
}
/* admin_*_stats fonksiyonları hiç aktivite yoksa 'epoch' (1970) döndürür -
   bu "hiç kullanılmadı" anlamına gelir, göreli zaman yerine "Hiç" yazılır. */
function fmtRelativeTime(iso){
  if(!iso) return 'Hiç';
  const d = new Date(iso);
  if(isNaN(d.getTime()) || d.getFullYear() < 2000) return 'Hiç';
  const diffMin = Math.floor((Date.now() - d.getTime())/60000);
  if(diffMin < 1) return 'Az önce';
  if(diffMin < 60) return diffMin+' dk önce';
  const diffH = Math.floor(diffMin/60);
  if(diffH < 24) return diffH+' sa önce';
  const diffD = Math.floor(diffH/24);
  if(diffD < 30) return diffD+' gün önce';
  return d.toLocaleDateString('tr-TR');
}
function renderDailyRevenueChart(days){
  const w = 760, h = 160, padBottom = 22, padTop = 10;
  const maxVal = Math.max(1, ...days.map(d => Number(d.revenue)||0));
  const gap = 3;
  const barW = (w/days.length) - gap;
  const bars = days.map((d,i) => {
    const val = Number(d.revenue)||0;
    const bh = maxVal>0 ? (val/maxVal) * (h-padTop-padBottom) : 0;
    const x = i*(barW+gap);
    const y = h - padBottom - bh;
    const dateLabel = new Date(d.day+'T00:00:00').toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'});
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(bh,1).toFixed(1)}" rx="3" fill="var(--accent)"><title>${dateLabel}: ${money(val)} (${d.order_count} sipariş)</title></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="140" preserveAspectRatio="none" style="overflow:visible;display:block;">
    <line x1="0" y1="${h-padBottom}" x2="${w}" y2="${h-padBottom}" stroke="var(--border)" stroke-width="1"/>
    ${bars}
  </svg>
  <div class="muted" style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px;">
    <span>${new Date(days[0].day+'T00:00:00').toLocaleDateString('tr-TR')}</span>
    <span>${new Date(days[days.length-1].day+'T00:00:00').toLocaleDateString('tr-TR')}</span>
  </div>`;
}
async function renderRestaurantsAdmin(main, admin){
  main.innerHTML = `<h1>🏬 İşletmeler</h1><div id="restContent"></div>`;
  await withLoadingOverlay(Promise.all([loadPackages(), refreshRestaurantsList(admin)]));
}
async function refreshRestaurantsList(admin){
  const el = document.getElementById('restContent'); if(!el) return;
  const [{ data: summary, error: sErr }, { data: list, error: lErr }] = await Promise.all([
    sb.rpc('admin_platform_summary', { p_token: admin.session_token }),
    sb.rpc('admin_list_restaurants', { p_token: admin.session_token })
  ]);
  const err = sErr || lErr;
  if(err){
    if(err.message.includes('geçersiz')){ clearAdminSession(); render(); return; }
    el.innerHTML = '<p class="muted">Yüklenemedi: '+err.message+'</p>'; return;
  }
  const s = summary || {};
  const restaurants = list || [];
  APP.adminRestaurants = restaurants;
  el.innerHTML = `
    <div class="home-grid" style="margin-top:0;margin-bottom:22px;">
      ${statCard('Toplam İşletme', s.total_restaurants)}
      ${statCard('Aktif', s.active_restaurants, 'var(--green)')}
      ${statCard('Pasif', s.inactive_restaurants, s.inactive_restaurants>0?'var(--red)':null)}
      ${statCard('Süresi Dolmuş', s.expired_restaurants, s.expired_restaurants>0?'var(--red)':null)}
      ${statCard('Bugün Yeni Kayıt', s.signups_today)}
      ${statCard('Son 7 Gün Yeni Kayıt', s.signups_7d)}
      ${statCard('Bugünkü Ciro (tüm işletmeler)', money(s.revenue_today))}
      ${statCard('Toplam Ciro (tüm zamanlar)', money(s.revenue_lifetime))}
    </div>
    ${restaurants.length===0 ? '<p class="muted">Henüz kayıtlı işletme yok.</p>' : `
    <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr>
          <th>İşletme</th><th>E-posta / Telefon</th><th>Paket</th><th>Durum</th>
          <th>Tarihler</th><th>Ciro</th><th></th>
        </tr></thead>
        <tbody>
        ${restaurants.map(r => {
          const pkg = PACKAGES_BY_ID[r.package_id];
          const expired = r.expires_at && new Date(r.expires_at) <= new Date();
          let statusBadge;
          if(!r.is_active) statusBadge = '<span class="role-badge" style="color:var(--red);border-color:var(--red);">Pasif</span>';
          else if(expired) statusBadge = '<span class="role-badge" style="color:var(--red);border-color:var(--red);">Süresi Dolmuş</span>';
          else statusBadge = '<span class="role-badge" style="color:var(--green);border-color:var(--green);">Aktif</span>';
          return `
          <tr>
            <td><b style="cursor:pointer;color:var(--accent);" onclick="showRestaurantDetail('${r.id}')" title="Günlük ciro grafiğini göster">${escapeHtml(r.name)}</b><div class="muted" style="font-size:12px;">${escapeHtml(r.code||'—')}</div></td>
            <td style="font-size:12.5px;word-break:break-all;">${r.email?`<a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a>`:'—'}${r.phone?`<div class="muted">${escapeHtml(r.phone)}</div>`:''}</td>
            <td style="font-size:13px;">${pkg?escapeHtml(pkg.name):escapeHtml(r.package_id)}<div class="muted" style="font-size:12px;">${r.user_count}/${r.max_users} kullanıcı</div><div style="font-size:12px;${expired?'color:var(--red);':''}">Bitiş: ${r.expires_at ? new Date(r.expires_at).toLocaleDateString('tr-TR') : 'Süresiz'}</div></td>
            <td>${statusBadge}</td>
            <td style="font-size:12.5px;white-space:nowrap;">Kayıt: ${new Date(r.created_at).toLocaleDateString('tr-TR')}<div class="muted">Son: ${fmtRelativeTime(r.last_activity)}</div></td>
            <td style="font-size:12.5px;white-space:nowrap;">Bugün: <b>${money(r.revenue_today)}</b><div class="muted">7 gün: ${money(r.revenue_7d)}</div><div class="muted">Toplam: ${money(r.revenue_lifetime)}</div></td>
            <td style="white-space:nowrap;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <button class="sbtn" style="margin:0;${r.is_active?'background:var(--red);color:var(--btn-ink);':''}" onclick="toggleRestaurantActive('${r.id}', ${!r.is_active})">${r.is_active?'Pasif Et':'Aktif Et'}</button>
                <button class="sbtn" style="margin:0;" data-name="${escapeAttr(r.name)}" onclick="openEntitlementsModal('restaurant', '${r.id}', this.dataset.name)">🧩 Eklentiler</button>
                <button class="sbtn" style="margin:0;" onclick="showRestaurantUsers('${r.id}')">👥 Kullanıcılar</button>
                <button class="sbtn" style="margin:0;" data-name="${escapeAttr(r.name)}" data-exp="${r.expires_at||''}" onclick="openExtendSubscription('${r.id}', this.dataset.name, this.dataset.exp)">⏳ Süre Uzat</button>
                <button type="button" class="act-btn act-delete" onclick="deleteRestaurantAdmin('${r.id}')">${ICON_TRASH}<span>Sil</span></button>
              </div>
            </td>
          </tr>
          <tr id="detail_${r.id}" style="display:none;"><td colspan="7" style="background:var(--panel);border-radius:12px;padding:0;white-space:normal;">
            <div id="detailBody_${r.id}"></div>
          </td></tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}
async function showRestaurantDetail(id){
  const row = document.getElementById('detail_'+id);
  if(!row) return;
  const body = document.getElementById('detailBody_'+id);
  const wasOpen = row.style.display !== 'none' && body.dataset.mode !== 'users';
  document.querySelectorAll('[id^="detail_"]').forEach(r => { if(r!==row) r.style.display = 'none'; });
  if(wasOpen){ row.style.display = 'none'; return; }
  row.style.display = 'table-row';
  body.dataset.mode = 'chart';
  body.innerHTML = '<p class="muted" style="padding:14px;">Yükleniyor...</p>';
  const admin = getAdminSession();
  const { data, error } = await sb.rpc('admin_restaurant_daily_stats', { p_token: admin.session_token, p_restaurant_id: id });
  if(error){ body.innerHTML = '<p class="muted" style="padding:14px;">Yüklenemedi: '+error.message+'</p>'; return; }
  const days = data || [];
  if(days.length===0){ body.innerHTML = '<p class="muted" style="padding:14px;">Veri yok.</p>'; return; }
  const totalRevenue = days.reduce((sum,d) => sum + Number(d.revenue||0), 0);
  const totalOrders = days.reduce((sum,d) => sum + Number(d.order_count||0), 0);
  const restaurant = (APP.adminRestaurants||[]).find(r => r.id===id);
  body.innerHTML = `
    <div style="padding:18px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;font-size:15px;">Son 30 Gün${restaurant?' - '+escapeHtml(restaurant.name):''}</h3>
        <span class="muted" style="font-size:13px;">${totalOrders} sipariş · ${money(totalRevenue)} toplam</span>
      </div>
      ${renderDailyRevenueChart(days)}
    </div>`;
}
/* İşletmedeki kullanıcı hesaplarını (rol, oluşturulma, son giriş) detay
   satırında listeler - bkz. admin_restaurant_users. Şifreler gösterilmez. */
async function showRestaurantUsers(id){
  const row = document.getElementById('detail_'+id);
  if(!row) return;
  const body = document.getElementById('detailBody_'+id);
  const wasUsers = row.style.display !== 'none' && body.dataset.mode === 'users';
  document.querySelectorAll('[id^="detail_"]').forEach(r => { r.style.display = 'none'; });
  if(wasUsers){ body.dataset.mode = ''; return; }
  row.style.display = 'table-row';
  body.dataset.mode = 'users';
  body.innerHTML = '<p class="muted" style="padding:14px;">Yükleniyor...</p>';
  const admin = getAdminSession();
  const { data, error } = await sb.rpc('admin_restaurant_users', { p_token: admin.session_token, p_restaurant_id: id });
  if(error){ body.innerHTML = '<p class="muted" style="padding:14px;">Yüklenemedi: '+escapeHtml(error.message)+'</p>'; return; }
  const users = data || [];
  const r = (APP.adminRestaurants||[]).find(x => x.id===id) || {};
  body.innerHTML = `
    <div style="padding:18px;">
      <h3 style="margin:0 0 6px;font-size:15px;">Kullanıcılar - ${escapeHtml(r.name||'')}</h3>
      <p class="muted" style="margin:0 0 12px;font-size:13px;">Kayıt e-postası: <b>${escapeHtml(r.email||'—')}</b>${r.phone?' · Telefon: <b>'+escapeHtml(r.phone)+'</b>':''}</p>
      ${users.length===0 ? '<p class="muted">Kullanıcı yok.</p>' : `
      <table class="settings-table">
        <thead><tr><th>Kullanıcı Adı</th><th>Roller</th><th>Oluşturulma</th><th>Son Giriş</th></tr></thead>
        <tbody>${users.map(u => `
          <tr>
            <td class="col-name"><b>${escapeHtml(u.username)}</b>${u.is_manager?' <span class="role-badge">Yönetici</span>':''}${u.is_company_owner?' <span class="role-badge">Şirket Sahibi</span>':''}</td>
            <td class="col-name">${escapeHtml((u.role_names||[]).join(', ')||'—')}</td>
            <td class="col-name">${new Date(u.created_at).toLocaleDateString('tr-TR')}</td>
            <td class="col-name">${fmtRelativeTime(u.last_login)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`}
    </div>`;
}
async function deleteRestaurantAdmin(id){
  const r = (APP.adminRestaurants||[]).find(x => x.id===id);
  if(!r) return;
  const code = prompt('"'+r.name+'" işletmesi ve TÜM verileri (menü, siparişler, satışlar, müşteriler, kullanıcılar) KALICI olarak silinecek. Bu işlem geri alınamaz.\n\nOnaylamak için işletme kodunu yazın: '+r.code);
  if(code===null) return;
  const admin = getAdminSession();
  const { error } = await sb.rpc('admin_delete_restaurant', { p_token: admin.session_token, p_restaurant_id: id, p_confirm_code: code.trim() });
  if(error){ alert(error.message); return; }
  showToast('İşletme kalıcı olarak silindi ✓');
  refreshRestaurantsList(admin);
}
async function toggleRestaurantActive(id, makeActive){
  const msg = makeActive
    ? 'Bu işletmeyi aktif etmek istediğinize emin misiniz?'
    : 'Bu işletmeyi pasif etmek istediğinize emin misiniz? Personel giriş yapamaz hale gelir.';
  if(!confirm(msg)) return;
  const admin = getAdminSession();
  const { error } = await sb.rpc('admin_set_restaurant_active', { p_token: admin.session_token, p_restaurant_id: id, p_active: makeActive });
  if(error){ alert(error.message); return; }
  showToast(makeActive ? 'İşletme aktif edildi ✓' : 'İşletme pasif edildi ✓');
  refreshRestaurantsList(admin);
}

/* --- Şirketler: birden fazla şubesi olan zincirler (bkz. companies
   tablosu). Şirket oluşturmak burada, platform yöneticisi tarafından
   yapılır - şirket sahibi kendi kendine kayıt olamaz (bkz. login_company). --- */
async function renderCompaniesAdmin(main, admin){
  main.innerHTML = `<h1>🏢 Şirketler</h1><div id="companiesContent"></div>`;
  await withLoadingOverlay(Promise.all([loadPackages(), refreshCompaniesList(admin)]));
}
async function refreshCompaniesList(admin){
  const el = document.getElementById('companiesContent'); if(!el) return;
  const { data, error } = await sb.rpc('admin_list_companies', { p_token: admin.session_token });
  if(error){
    if(error.message.includes('geçersiz')){ clearAdminSession(); render(); return; }
    el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return;
  }
  const companies = data || [];
  el.innerHTML = `
    <div class="add-row-panel" style="margin-bottom:22px;">
      <p>Yeni Şirket Oluştur</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;align-items:end;">
        <div class="field-group"><label>Şirket Adı</label><input id="newCompanyName" placeholder="örn. Köfteci Zincir A.Ş."></div>
        <div class="field-group"><label>Şirket Kodu</label><input id="newCompanyCode" placeholder="örn. koftecizincir" autocapitalize="none"></div>
        <div class="field-group"><label>Şifre</label><input id="newCompanyPass" placeholder="En az 4 karakter"></div>
        <div class="field-group"><label>Paket</label><select id="newCompanyPackage">${PACKAGES.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${p.max_branches||1} şube)</option>`).join('')}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
        <div class="field-group"><label>E-posta (opsiyonel)</label><input id="newCompanyEmail" placeholder="ornek@firma.com"></div>
        <div class="field-group"><label>Telefon (opsiyonel)</label><input id="newCompanyPhone" placeholder="05xx xxx xx xx"></div>
      </div>
      <div class="error" id="newCompanyErr" style="margin-top:6px;"></div>
      <button style="margin-top:12px;max-width:220px;" onclick="createCompanySubmit()">+ Şirket Oluştur</button>
    </div>
    ${companies.length===0 ? '<p class="muted">Henüz kayıtlı şirket yok.</p>' : `
    <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>Şirket</th><th>Kod</th><th>Paket</th><th>Şube</th><th>Durum</th><th>Kayıt Tarihi</th><th></th></tr></thead>
        <tbody>
        ${companies.map(c => {
          const pkg = PACKAGES_BY_ID[c.package_id];
          let statusBadge = c.is_active
            ? '<span class="role-badge" style="color:var(--green);border-color:var(--green);">Aktif</span>'
            : '<span class="role-badge" style="color:var(--red);border-color:var(--red);">Pasif</span>';
          return `
          <tr>
            <td class="col-name"><b>${escapeHtml(c.name)}</b></td>
            <td class="col-name">${escapeHtml(c.code)}</td>
            <td class="col-name">${pkg?escapeHtml(pkg.name):escapeHtml(c.package_id)}</td>
            <td class="col-name">${c.branch_count}${pkg&&pkg.max_branches?'/'+pkg.max_branches:''}</td>
            <td>${statusBadge}</td>
            <td class="col-name">${new Date(c.created_at).toLocaleDateString('tr-TR')}</td>
            <td style="white-space:nowrap;">
              <button class="sbtn" style="${c.is_active?'background:var(--red);color:var(--btn-ink);':''}" onclick="toggleCompanyActive('${c.id}', ${!c.is_active})">${c.is_active?'Pasif Et':'Aktif Et'}</button>
              <button class="sbtn" data-name="${escapeAttr(c.name)}" onclick="openEntitlementsModal('company', '${c.id}', this.dataset.name)">🧩 Eklentiler</button>
              <button type="button" class="act-btn act-delete" data-name="${escapeAttr(c.name)}" onclick="deleteCompany('${c.id}', this.dataset.name)">${ICON_TRASH}<span>Sil</span></button>
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}
async function createCompanySubmit(){
  const admin = getAdminSession();
  const name = document.getElementById('newCompanyName').value.trim();
  const code = document.getElementById('newCompanyCode').value.trim();
  const password = document.getElementById('newCompanyPass').value;
  const packageId = document.getElementById('newCompanyPackage').value;
  const email = document.getElementById('newCompanyEmail').value.trim();
  const phone = document.getElementById('newCompanyPhone').value.trim();
  const errEl = document.getElementById('newCompanyErr');
  errEl.textContent = '';
  if(!name || !code || !password){ errEl.textContent = 'Şirket adı, kodu ve şifre gerekli'; return; }
  const { error } = await sb.rpc('admin_create_company', {
    p_token: admin.session_token, p_name: name, p_code: code, p_password: password,
    p_package_id: packageId, p_email: email||null, p_phone: phone||null
  });
  if(error){ errEl.textContent = error.message; return; }
  showToast('Şirket oluşturuldu ✓');
  refreshCompaniesList(admin);
}
async function toggleCompanyActive(id, makeActive){
  const msg = makeActive
    ? 'Bu şirketi aktif etmek istediğinize emin misiniz?'
    : 'Bu şirketi pasif etmek istediğinize emin misiniz? Şirket ve tüm şubeleri giriş yapamaz hale gelir.';
  if(!confirm(msg)) return;
  const admin = getAdminSession();
  const { error } = await sb.rpc('admin_set_company_active', { p_token: admin.session_token, p_id: id, p_active: makeActive });
  if(error){ alert(error.message); return; }
  showToast(makeActive ? 'Şirket aktif edildi ✓' : 'Şirket pasif edildi ✓');
  refreshCompaniesList(admin);
}
async function deleteCompany(id, name){
  if(!confirm('"'+name+'" şirketini KALICI olarak silmek istediğinize emin misiniz?\n\nBu geri alınamaz. Bağlı şubeler silinmez, sadece şirketten ayrılıp kendi bağımsız paketlerine döner (varsa) - şirketin abonelik durumunu artık paylaşmazlar.')) return;
  const admin = getAdminSession();
  const { error } = await sb.rpc('admin_delete_company', { p_token: admin.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  showToast('Şirket silindi ✓');
  refreshCompaniesList(admin);
}

/* ---- Admin Paneli > Eklentiler: pakete bağlı olmayan, ayrı fiyatlandırılan
   modüller (örn. Muhasebe Entegrasyonu). Buradan kataloğu yönetip, İşletmeler/
   Şirketler listesindeki "🧩 Eklentiler" butonuyla tekil olarak açıp
   kapatabilirsiniz - bir eklentisi olan işletme, paketinde olmasa bile o
   özelliği kullanabilir (bkz. _session_check). ---- */
async function renderAddonsAdmin(main, admin){
  main.innerHTML = `<h1>🧩 Eklentiler</h1>
    <p class="muted" style="margin-top:-8px;">Eklenti olarak işaretlenmiş özelliklerin fiyat/aktiflik yönetimi. Bir özelliği eklenti yapmak ya da yeni bir özellik tanımlamak için "🗂️ Tüm Özellikler" sekmesini kullanın. Bir işletme/şirkete İşletmeler ya da Şirketler sekmesindeki "🧩 Eklentiler" butonundan tekil olarak atanır.</p>
    <div id="addonsContent"></div>`;
  await refreshAddonsList(admin);
}
async function refreshAddonsList(admin){
  const el = document.getElementById('addonsContent'); if(!el) return;
  const { data, error } = await sb.rpc('admin_list_feature_catalog', { p_token: admin.session_token });
  if(error){
    if(error.message.includes('geçersiz')){ clearAdminSession(); render(); return; }
    el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return;
  }
  APP.featureCatalog = data || [];
  const addons = (data || []).filter(f => f.is_addon);
  el.innerHTML = `
    ${addons.length===0 ? '<p class="muted">Henüz eklenti olarak işaretlenmiş özellik yok. "🗂️ Tüm Özellikler" sekmesinden bir özelliği eklenti yapabilirsiniz.</p>' : `
    <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>Kimlik</th><th>Ad</th><th>Açıklama</th><th>Fiyat (₺/ay)</th><th>Aktif</th><th></th></tr></thead>
        <tbody>
        ${addons.map(a => `
          <tr>
            <td class="col-name"><code>${escapeHtml(a.id)}</code></td>
            <td class="col-name"><input value="${escapeAttr(a.label)}" id="addon_name_${a.id}"></td>
            <td class="col-name"><input value="${escapeAttr(a.description||'')}" id="addon_desc_${a.id}"></td>
            <td class="col-num" style="width:110px;"><input type="number" min="0" step="0.01" value="${a.price}" id="addon_price_${a.id}"></td>
            <td style="text-align:center;"><input type="checkbox" id="addon_active_${a.id}" ${a.active?'checked':''} style="width:18px;height:18px;"></td>
            <td style="white-space:nowrap;">
              <button type="button" class="act-btn act-save" onclick="saveAddonRow('${a.id}')">${ICON_SAVE}<span>Kaydet</span></button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`;
}
async function saveAddonRow(id){
  const admin = getAdminSession();
  const feat = (APP.featureCatalog||[]).find(f => f.id===id);
  const name = document.getElementById('addon_name_'+id).value.trim();
  const desc = document.getElementById('addon_desc_'+id).value.trim();
  const price = parseFloat(document.getElementById('addon_price_'+id).value) || 0;
  const active = document.getElementById('addon_active_'+id).checked;
  if(!name){ alert('Ad gerekli'); return; }
  const { error } = await sb.rpc('admin_upsert_feature', { p_token: admin.session_token, p_id: id, p_label: name, p_category: (feat&&feat.category)||'Diğer', p_is_addon: true, p_price: price, p_description: desc||null, p_active: active });
  if(error){ alert(error.message); return; }
  showToast('Eklenti kaydedildi ✓');
  refreshAddonsList(admin);
}
/* ---- Admin Paneli > Tüm Özellikler: uygulamadaki HER özelliğin (temel
   paket özellikleri + eklentiler) tek yerden görüldüğü, "eklenti mi?"
   sınıflandırmasının yapıldığı ve yeni özellik tanımlanabildiği katalog
   ekranı. Temel (is_core) özellikler eklenti yapılamaz/silinemez -
   bunlar uygulamanın rol/izin sistemine bağlı yapısal özellikler. ---- */
async function renderFeatureCatalogAdmin(main, admin){
  main.innerHTML = `<h1>🗂️ Tüm Özellikler</h1>
    <p class="muted" style="margin-top:-8px;max-width:700px;">Uygulamadaki her özellik burada listelenir. Her birini "Eklenti mi?" kutusuyla siz işaretlersiniz: işaretlenirse Eklentiler sekmesinden fiyatlandırıp tekil satabilirsiniz, işaretlemezseniz sadece Paket Fiyatları'ndan paketlere dahil edersiniz. Temel işaretli (🔒) özellikler yanlışlıkla silinmesin diye korunur ama eklenti durumunu istediğiniz gibi değiştirebilirsiniz.</p>
    <div id="featureCatalogContent"></div>`;
  await refreshFeatureCatalogList(admin);
}
/* Uygulamada gerçekten var olan her özelliğin referans listesi - "Tüm
   Özellikler" sekmesindeki listeye/arama kutusuna kaynaklık eder, admin
   buradan işaretleyip kendi isteğiyle kataloğa (feature_catalog) ekler;
   elle kimlik/etiket yazmasına gerek kalmaz. Yeni bir özellik geliştirildiğinde
   bu listeye eklenir - admin ne zaman ekleyeceğine kendisi karar verir. */
const FEATURE_MASTER_LIST = [
  { id:'order', label:'Sipariş Al', category:'Temel', description:'Masa/bölge bazlı sipariş girişi ekranı.' },
  { id:'packages', label:'Paket Servis', category:'Temel', description:'Gel-al / paket teslimat siparişleri ekranı.' },
  { id:'kitchen', label:'Mutfak Ekranı', category:'Temel', description:'İstasyon bazlı canlı mutfak sipariş ekranı.' },
  { id:'payments', label:'Ödemeler', category:'Temel', description:'Hesap kapatma, nakit/kart/bölünmüş ödeme alma.' },
  { id:'settings_stations', label:'Ayarlar · İstasyonlar', category:'Temel', description:'Mutfak istasyonlarını tanımlama.' },
  { id:'settings_zones', label:'Ayarlar · Bölgeler & Masalar', category:'Temel', description:'Salon/bölge ve masa yönetimi.' },
  { id:'settings_products', label:'Ayarlar · Ürünler', category:'Temel', description:'Menü/ürün yönetimi.' },
  { id:'settings_ingredients', label:'Ayarlar · Hammaddeler', category:'Temel', description:'Reçete ve stok/hammadde yönetimi.' },
  { id:'settings_users', label:'Ayarlar · Kullanıcılar', category:'Temel', description:'Personel ve rol yönetimi.' },
  { id:'settings_flags', label:'Ayarlar · Sipariş Etiketleri', category:'Temel', description:'Personel yemeği/ikram gibi sipariş etiketleri.' },
  { id:'reports', label:'Finansal Analiz', category:'Temel', description:'Satış raporları, ürün/personel istatistikleri.' },
  { id:'shifts', label:'Vardiyalar', category:'Temel', description:'Personel vardiya/puantaj takibi.' },
  { id:'floorplan', label:'Görsel Kat Planı', category:'Temel', description:'Masaları sürükle-bırak ile yerleştirip Sipariş Al ekranında gerçek oturma düzenini görme.' },
  { id:'push_notifications', label:'Anlık Bildirimler (Web Push)', category:'Temel', description:'Hazır sipariş, yeni müşteri talebi gibi olaylarda uygulama kapalıyken de tarayıcı/PWA bildirimi.' },
  { id:'crm', label:'Müşteriler (CRM)', category:'Müşteri', description:'Müşteri listesi, sadakat puanı, doğum günü indirimi.' },
  { id:'reservations', label:'Rezervasyonlar', category:'Müşteri', description:'Rezervasyon ve bekleme listesi yönetimi.' },
  { id:'google_reviews', label:'Google Yorumlarına Yönlendirme', category:'Müşteri', description:'Ödeme tamamlanınca müşteriye Google Business yorum linkine giden bir QR kod gösterme.' },
  { id:'tips', label:'Bahşiş Yönetimi', category:'Ödeme', description:'Ödeme ekranında yüzde/tutar bazlı bahşiş alma, personel bazlı bahşiş raporlaması.' },
  { id:'giftcards', label:'Hediye Kartları', category:'Ödeme', description:'Hediye kartı satışı, bakiye takibi ve ödemede kısmi/tam kullanım.' },
  { id:'online_ordering', label:'Dışarıdan Online Sipariş', category:'Sipariş Kanalları', description:'Müşterilerin doğrudan telefonlarından erişebileceği online sipariş sayfası.' },
  { id:'qr_ordering', label:'QR Menü ile Müşteri Siparişi', category:'Sipariş Kanalları', description:'Müşterinin masadaki QR kodu okutup kendi telefonundan menüyü görüp sipariş isteği gönderebilmesi.' },
  { id:'multilang_menu', label:'Çok Dilli QR Menü', category:'Sipariş Kanalları', description:'QR menüde ürün adı/açıklamalarını birden fazla dilde gösterme.' },
  { id:'purchasing', label:'Tedarikçi & Satın Alma', category:'Tedarik', description:'Tedarikçi ve satın alma sipariş yönetimi.' },
  { id:'ticket_design', label:'Fiş Tasarımı Özelleştirme', category:'Yazıcı', description:'Fiş/makbuz üzerindeki başlık, yazı tipi, logo gibi görsel ayarları merkezi olarak özelleştirme.' },
  { id:'efatura', label:'ÖKC / e-Fatura Entegrasyonu', category:'Entegrasyonlar', description:'Foriba, İzibiz, Logo, Nesbilgi gibi e-fatura entegratörleriyle bağlantı.' },
  { id:'marketplace', label:'Pazaryeri Entegrasyonu', category:'Entegrasyonlar', description:'Yemeksepeti, Trendyol Yemek, Getir Yemek siparişlerini tek ekrandan almak.' },
  { id:'accounting', label:'Muhasebe Entegrasyonu', category:'Entegrasyonlar', description:'Logo/Mikro/Netsis gibi muhasebe yazılımlarına otomatik veri aktarımı.' },
  { id:'multi_branch', label:'Birden Fazla Şube', category:'Şirket', description:'Bir şirketin ikinci ve sonraki şubelerini kendi başına açabilmesi.' },
];
async function refreshFeatureCatalogList(admin){
  const el = document.getElementById('featureCatalogContent'); if(!el) return;
  const { data, error } = await sb.rpc('admin_list_feature_catalog', { p_token: admin.session_token });
  if(error){
    if(error.message.includes('geçersiz')){ clearAdminSession(); render(); return; }
    el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return;
  }
  const features = data || [];
  APP.featureCatalog = features;
  const byCat = {};
  features.forEach(f => { (byCat[f.category||'Diğer'] = byCat[f.category||'Diğer'] || []).push(f); });
  el.innerHTML = `
    ${Object.keys(byCat).map(cat => `
      <div style="margin-bottom:22px;">
        <div class="muted" style="font-size:13px;font-weight:800;margin-bottom:8px;">${escapeHtml(cat)}</div>
        <div class="settings-table-wrap">
          <table class="settings-table">
            <thead><tr><th>Kimlik</th><th>Ad</th><th>Açıklama</th><th>Kategori</th><th>Fiyat (₺/ay)</th><th>Aktif</th><th>Eklenti mi?</th><th></th></tr></thead>
            <tbody>
            ${byCat[cat].map(f => `
              <tr>
                <td class="col-name"><code>${escapeHtml(f.id)}</code>${f.is_core?' 🔒':''}</td>
                <td class="col-name"><input value="${escapeAttr(f.label)}" id="feat_label_${f.id}"></td>
                <td class="col-name"><input value="${escapeAttr(f.description||'')}" id="feat_desc_${f.id}"></td>
                <td class="col-name"><input value="${escapeAttr(f.category||'')}" id="feat_cat_${f.id}"></td>
                <td class="col-num" style="width:110px;"><input type="number" min="0" step="0.01" value="${f.price}" id="feat_price_${f.id}"></td>
                <td style="text-align:center;"><input type="checkbox" id="feat_active_${f.id}" ${f.active?'checked':''} style="width:18px;height:18px;"></td>
                <td style="text-align:center;"><input type="checkbox" id="feat_isaddon_${f.id}" ${f.is_addon?'checked':''} style="width:18px;height:18px;"></td>
                <td style="white-space:nowrap;">
                  <button type="button" class="act-btn act-save" onclick="saveFeatureRow('${f.id}')">${ICON_SAVE}<span>Kaydet</span></button>
                  ${f.is_core ? '' : `<button type="button" class="act-btn act-delete" onclick="deleteFeatureRow('${f.id}')">${ICON_TRASH}<span>Sil</span></button>`}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`).join('')}
    <div class="add-row-panel">
      <p>Kataloğa Özellik Ekle</p>
      <p class="muted" style="margin-top:-6px;font-size:12.5px;">Aşağıdaki listeden işaretleyip "Seçilenleri Ekle"ye basın - kendi seçtiğiniz zaman, kendi seçtiğiniz özellikler eklenir. Zaten ekli olanlar işaretli/pasif görünür.</p>
      <input id="featPickerSearch" placeholder="🔍 Özellik ara (ad, kategori)..." oninput="renderFeaturePickerList()" style="margin-bottom:10px;">
      <div id="featPickerList" style="display:flex;flex-direction:column;gap:2px;max-height:300px;overflow:auto;background:var(--panel2);border:1px solid var(--border);border-radius:10px;padding:8px 10px;"></div>
      <button style="margin-top:12px;max-width:220px;" onclick="addPickedFeatures()">+ Seçilenleri Ekle</button>
      <details style="margin-top:18px;">
        <summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--muted);">Listede yok mu? Özel özellik ekle</summary>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 0.7fr;gap:10px;align-items:end;margin-top:12px;">
          <div class="field-group"><label>Kimlik (benzersiz)</label><input id="newFeatId" placeholder="örn. loyalty_plus" autocapitalize="none"></div>
          <div class="field-group"><label>Ad</label><input id="newFeatLabel" placeholder="örn. Sadakat Plus"></div>
          <div class="field-group"><label>Açıklama</label><input id="newFeatDesc" placeholder="opsiyonel"></div>
          <div class="field-group"><label>Kategori</label><input id="newFeatCat" placeholder="örn. Entegrasyonlar"></div>
          <div class="field-group"><label>Fiyat (₺/ay)</label><input type="number" id="newFeatPrice" placeholder="0"></div>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:400;margin-top:10px;">
          <input type="checkbox" id="newFeatIsAddon" style="width:16px;height:16px;"> Eklenti olarak işaretle (tekil satılabilir)
        </label>
        <div class="error" id="newFeatErr"></div>
        <button style="margin-top:12px;max-width:220px;" onclick="createFeatureSubmit()">+ Özellik Ekle</button>
      </details>
    </div>`;
  renderFeaturePickerList();
}
function renderFeaturePickerList(){
  const listEl = document.getElementById('featPickerList'); if(!listEl) return;
  const q = (document.getElementById('featPickerSearch').value||'').trim().toLowerCase();
  const existingIds = new Set((APP.featureCatalog||[]).map(f => f.id));
  const items = FEATURE_MASTER_LIST.filter(f => !q || f.label.toLowerCase().includes(q) || f.category.toLowerCase().includes(q) || f.id.toLowerCase().includes(q));
  listEl.innerHTML = items.length===0 ? '<p class="muted" style="margin:6px 0;">Eşleşen özellik yok.</p>' : items.map(f => {
    const already = existingIds.has(f.id);
    return `<label style="display:flex;align-items:center;gap:10px;padding:6px 4px;border-radius:6px;${already?'opacity:.55;':''}cursor:${already?'default':'pointer'};">
      <input type="checkbox" data-feat-pick="${f.id}" ${already?'checked disabled':''} style="width:16px;height:16px;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;">${escapeHtml(f.label)} <span class="muted" style="font-weight:400;">· ${escapeHtml(f.category)}</span>${already?' <span class="muted" style="font-weight:400;">(zaten ekli)</span>':''}</div>
        ${f.description ? `<div class="muted" style="font-size:11.5px;">${escapeHtml(f.description)}</div>` : ''}
      </div>
    </label>`;
  }).join('');
}
async function addPickedFeatures(){
  const admin = getAdminSession();
  const picked = Array.from(document.querySelectorAll('#featPickerList input[data-feat-pick]:checked:not(:disabled)')).map(el => el.dataset.featPick);
  if(picked.length===0){ showToast('Önce en az bir özellik işaretleyin'); return; }
  const items = FEATURE_MASTER_LIST.filter(f => picked.includes(f.id));
  const results = await withLoadingOverlay(Promise.all(items.map(f =>
    sb.rpc('admin_upsert_feature', { p_token: admin.session_token, p_id: f.id, p_label: f.label, p_category: f.category, p_is_addon: false, p_price: 0, p_description: f.description||null, p_active: true })
  )));
  const failed = results.find(r => r.error);
  if(failed){ alert(failed.error.message); }
  showToast(items.length+' özellik eklendi ✓');
  refreshFeatureCatalogList(admin);
}
async function saveFeatureRow(id){
  const admin = getAdminSession();
  const label = document.getElementById('feat_label_'+id).value.trim();
  const desc = document.getElementById('feat_desc_'+id).value.trim();
  const cat = document.getElementById('feat_cat_'+id).value.trim() || 'Diğer';
  const price = parseFloat(document.getElementById('feat_price_'+id).value) || 0;
  const active = document.getElementById('feat_active_'+id).checked;
  const isAddon = document.getElementById('feat_isaddon_'+id).checked;
  if(!label){ alert('Ad gerekli'); return; }
  const prev = (APP.featureCatalog||[]).find(f => f.id===id);
  if(isAddon && prev && !prev.is_addon){
    if(!confirm('"'+label+'" eklentiye çevrilecek.\n\nBu özellik tüm paketlerden otomatik olarak çıkarılır. Şu an bu özelliği içeren bir paketi kullanan işletme/şirketlerin erişimi kaybolmaz: onlara eklenti olarak otomatik atanır.\n\nDevam edilsin mi?')) return;
  }
  const { error } = await sb.rpc('admin_upsert_feature', { p_token: admin.session_token, p_id: id, p_label: label, p_category: cat, p_is_addon: isAddon, p_price: price, p_description: desc||null, p_active: active });
  if(error){ alert(error.message); return; }
  showToast('Özellik kaydedildi ✓');
  refreshFeatureCatalogList(admin);
}
async function createFeatureSubmit(){
  const admin = getAdminSession();
  const id = document.getElementById('newFeatId').value.trim().toLowerCase();
  const label = document.getElementById('newFeatLabel').value.trim();
  const desc = document.getElementById('newFeatDesc').value.trim();
  const cat = document.getElementById('newFeatCat').value.trim() || 'Diğer';
  const price = parseFloat(document.getElementById('newFeatPrice').value) || 0;
  const isAddon = document.getElementById('newFeatIsAddon').checked;
  const errEl = document.getElementById('newFeatErr');
  errEl.textContent = '';
  if(!id || !/^[a-z0-9_-]+$/.test(id)){ errEl.textContent = 'Kimlik sadece küçük harf/rakam/tire içerebilir'; return; }
  if(!label){ errEl.textContent = 'Ad gerekli'; return; }
  const { error } = await sb.rpc('admin_upsert_feature', { p_token: admin.session_token, p_id: id, p_label: label, p_category: cat, p_is_addon: isAddon, p_price: price, p_description: desc||null, p_active: true });
  if(error){ errEl.textContent = error.message; return; }
  showToast('Özellik oluşturuldu ✓');
  refreshFeatureCatalogList(admin);
}
async function deleteFeatureRow(id){
  if(!confirm('Bu özelliği silmek istediğinize emin misiniz? Bu özelliğe sahip paketler ve eklenti atamaları etkilenir.')) return;
  const admin = getAdminSession();
  const { error } = await sb.rpc('admin_delete_feature', { p_token: admin.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  showToast('Özellik silindi ✓');
  refreshFeatureCatalogList(admin);
}
/* İşletmeler/Şirketler listesindeki "🧩 Eklentiler" butonu - bir hedefin
   (restaurant/company) hangi eklentilere sahip olduğunu gösterip
   açma/kapama sağlayan küçük bir pencere. */
async function openEntitlementsModal(targetType, targetId, targetName){
  const admin = getAdminSession();
  const [{ data: features, error: e1 }, { data: owned, error: e2 }] = await withLoadingOverlay(Promise.all([
    APP.featureCatalog ? Promise.resolve({ data: APP.featureCatalog, error: null }) : sb.rpc('admin_list_feature_catalog', { p_token: admin.session_token }),
    sb.rpc('admin_list_target_entitlements', { p_token: admin.session_token, p_target_type: targetType, p_target_id: targetId })
  ]));
  if(e1 || e2){ alert((e1||e2).message); return; }
  const addons = (features||[]).filter(f => f.is_addon);
  const ownedSet = new Set(owned || []);
  const bg = document.createElement('div');
  bg.id = 'entitlementsBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;';
  bg.onclick = (e) => { if(e.target===bg) bg.remove(); };
  bg.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:420px;width:100%;max-height:85vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;">🧩 Eklentiler</h2><span style="cursor:pointer;color:var(--muted);font-size:20px;" onclick="document.getElementById('entitlementsBg').remove()">✕</span></div>
    <p class="muted" style="margin-top:6px;">${escapeHtml(targetName)}</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
      ${addons.length===0 ? '<p class="muted">Henüz hiç eklenti tanımlanmamış.</p>' : addons.map(a => `
        <label style="display:flex;align-items:center;gap:10px;background:var(--panel2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;cursor:pointer;">
          <input type="checkbox" style="width:auto;margin:0;" ${ownedSet.has(a.id)?'checked':''} onchange="setEntitlement('${targetType}','${targetId}','${a.id}',this.checked,this)">
          <div style="flex:1;">
            <div style="font-weight:700;">${escapeHtml(a.label)}</div>
            <div class="muted" style="font-size:12px;">${escapeHtml(a.description||'')} ${a.price>0?'· '+money(a.price)+'/ay':''}</div>
          </div>
        </label>`).join('')}
    </div>
  </div>`;
  document.body.appendChild(bg);
}
async function setEntitlement(targetType, targetId, addonId, enabled, checkboxEl){
  const admin = getAdminSession();
  checkboxEl.disabled = true;
  const { error } = await sb.rpc('admin_set_entitlement', { p_token: admin.session_token, p_target_type: targetType, p_target_id: targetId, p_addon_id: addonId, p_enabled: enabled });
  checkboxEl.disabled = false;
  if(error){ alert(error.message); checkboxEl.checked = !enabled; return; }
  showToast(enabled ? 'Eklenti açıldı ✓' : 'Eklenti kapatıldı ✓');
}

/* ---- Admin Paneli > Havale Bildirimleri: iyzico ile kart ödemesi
   alamayan işletmelerin bildirdiği havale/EFT ödemelerini platform
   yöneticisinin onaylayıp aboneliği 30 gün uzatması. ---- */
async function renderBankTransfersAdmin(main, admin){
  main.innerHTML = `<h1>🏦 Havale Bildirimleri</h1>
    <div id="bankInfoPanel"></div>
    <div class="tabs" id="btStatusTabs">
      <div class="tab active" data-status="pending" onclick="setBtStatusFilter('pending')">Bekleyen</div>
      <div class="tab" data-status="approved" onclick="setBtStatusFilter('approved')">Onaylanan</div>
      <div class="tab" data-status="rejected" onclick="setBtStatusFilter('rejected')">Reddedilen</div>
    </div>
    <div id="btContent"></div>`;
  APP.btStatusFilter = 'pending';
  const { data: infoData } = await sb.rpc('admin_get_bank_transfer_info', { p_token: admin.session_token });
  APP.bankInfo = infoData || {};
  // Zaten kayıtlı bilgi varsa salt-okunur (görüntüleme) modda başlar,
  // yanlışlıkla değiştirilmesin diye - "Düzenle" ile açılır. İlk kurulumda
  // (hiçbir alan dolu değilken) doğrudan düzenlenebilir gelir.
  const hasSavedInfo = !!(infoData && (infoData.iban || infoData.account_name || infoData.bank_name || infoData.whatsapp_number));
  renderBankInfoPanel(!hasSavedInfo);
  refreshBankTransferList(admin);
}
function bankInfoFieldHtml(id, label, hint, value, placeholder, editMode){
  const v = escapeHtml(value || '');
  const hintHtml = hint ? ` <span class="muted" style="font-weight:400;">(${hint})</span>` : '';
  if(editMode){
    return `<div class="field-group"><label>${label}${hintHtml}</label><input id="${id}" placeholder="${placeholder||''}" value="${v}"${id==='bankIban'?' oninput="formatIbanInput(this)" maxlength="32"':''}></div>`;
  }
  return `<div class="field-group"><label>${label}${hintHtml}</label><div style="background:var(--panel);border:1.5px solid var(--border);border-radius:12px;padding:12px 14px;font-size:14.5px;min-height:20px;color:${value?'var(--text)':'var(--muted)'};">${v || '—'}</div></div>`;
}
function renderBankInfoPanel(editMode){
  const el = document.getElementById('bankInfoPanel'); if(!el) return;
  const info = APP.bankInfo || {};
  el.innerHTML = `
    <div class="add-row-panel" style="margin-bottom:22px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <p style="margin:0;">Banka Bilgileri <span class="muted" style="font-weight:400;">(işletmelere gösterilir)</span></p>
        ${editMode ? '' : '<button type="button" class="sbtn" style="width:auto;margin:0;" onclick="renderBankInfoPanel(true)">✏️ Düzenle</button>'}
      </div>
      <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:10px;align-items:end;margin-top:10px;">
        ${bankInfoFieldHtml('bankIban', 'IBAN', null, info.iban, 'TR00 0000 0000 0000 0000 0000 00', editMode)}
        ${bankInfoFieldHtml('bankAccountName', 'Hesap Adı', null, info.account_name, 'örn. Kopuzlar Grup Ltd. Şti.', editMode)}
        ${bankInfoFieldHtml('bankName', 'Banka', null, info.bank_name, 'örn. Ziraat Bankası', editMode)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:660px;margin-top:10px;">
        ${bankInfoFieldHtml('bankWhatsapp', 'Bildirim WhatsApp Numarası', '"Ödemeyi Yaptım" denince buraya yönlendirilir', info.whatsapp_number, '905xxxxxxxxx', editMode)}
        ${bankInfoFieldHtml('bankNotifyEmail', 'Bildirim E-postası', 'yeni bildirimde anında otomatik e-posta gider', info.notify_email, 'ornek@eposta.com', editMode)}
      </div>
      ${editMode ? `
        <div class="error" id="bankInfoErr"></div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button style="width:auto;max-width:220px;margin:0;" onclick="saveBankTransferInfo()">${ICON_SAVE}<span>Kaydet</span></button>
          ${info.iban || info.account_name || info.bank_name || info.whatsapp_number || info.notify_email ? `<button type="button" class="sbtn" style="width:auto;margin:0;" onclick="renderBankInfoPanel(false)">Vazgeç</button>` : ''}
        </div>
      ` : ''}
    </div>`;
}
function setBtStatusFilter(status){
  APP.btStatusFilter = status;
  document.querySelectorAll('#btStatusTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.status===status));
  refreshBankTransferList(getAdminSession());
}
/* IBAN'ı yazarken otomatik "TR00 0000 0000 0000 0000 0000 00" biçimine
   sokar - harfler büyütülür, rakam/harf olmayanlar atılır, 4'lü gruplara
   boşluk konur. İmleç her tuşta sona atlıyor (basit alan için kabul
   edilebilir bir ödün). */
function formatIbanInput(el){
  const raw = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 26);
  el.value = raw.replace(/(.{4})/g, '$1 ').trim();
}
async function saveBankTransferInfo(){
  const admin = getAdminSession();
  const iban = document.getElementById('bankIban').value.trim();
  const accountName = document.getElementById('bankAccountName').value.trim();
  const bankName = document.getElementById('bankName').value.trim();
  const whatsapp = document.getElementById('bankWhatsapp').value.trim();
  const notifyEmail = document.getElementById('bankNotifyEmail').value.trim();
  const errEl = document.getElementById('bankInfoErr');
  errEl.textContent = '';
  const { error } = await sb.rpc('admin_update_bank_transfer_info', {
    p_token: admin.session_token, p_iban: iban, p_account_name: accountName, p_bank_name: bankName, p_whatsapp_number: whatsapp, p_notify_email: notifyEmail
  });
  if(error){ errEl.textContent = error.message; return; }
  APP.bankInfo = { iban, account_name: accountName, bank_name: bankName, whatsapp_number: whatsapp, notify_email: notifyEmail };
  renderBankInfoPanel(false);
  showToast('Banka bilgileri kaydedildi ✓');
}
async function refreshBankTransferList(admin){
  const el = document.getElementById('btContent'); if(!el) return;
  const status = APP.btStatusFilter || 'pending';
  const { data, error } = await sb.rpc('admin_list_bank_transfer_notices', { p_token: admin.session_token, p_status: status });
  if(error){
    if(error.message.includes('geçersiz')){ clearAdminSession(); render(); return; }
    el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return;
  }
  const notices = data || [];
  if(notices.length===0){ el.innerHTML = '<p class="muted">Bu durumda bildirim yok.</p>'; return; }
  el.innerHTML = `
    <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>${status==='pending'?'Şube/Şirket':'İşletme'}</th><th>Kod</th><th>Paket</th><th>Tutar</th><th>Not</th><th>Tarih</th>${status==='pending'?'<th></th>':'<th>Admin Notu</th>'}</tr></thead>
        <tbody>
        ${notices.map(n => `
          <tr>
            <td class="col-name"><b>${escapeHtml(n.target_name)}</b> <span class="muted" style="font-size:11px;">(${n.target_type==='company'?'şirket':'işletme'})</span></td>
            <td class="col-name">${escapeHtml(n.target_code||'-')}</td>
            <td class="col-name">${n.addon_id ? '🧩 Eklenti: <b>' + escapeHtml(n.addon_label || n.addon_id) + '</b>' : escapeHtml(n.target_package_id)}</td>
            <td class="col-name">${money(n.amount)}</td>
            <td class="col-name">${n.note?escapeHtml(n.note):'-'}</td>
            <td class="col-name">${new Date(n.created_at).toLocaleString('tr-TR')}</td>
            ${status==='pending' ? `
            <td style="white-space:nowrap;">
              <button class="sbtn" onclick="reviewBankTransferNotice('${n.id}', true)">✅ Onayla</button>
              <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="reviewBankTransferNotice('${n.id}', false)">✕ Reddet</button>
            </td>` : `<td class="col-name">${n.admin_note?escapeHtml(n.admin_note):'-'}</td>`}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}
async function reviewBankTransferNotice(id, approve){
  const admin = getAdminSession();
  let adminNote = null;
  if(!approve){
    adminNote = prompt('Reddetme sebebi (opsiyonel):') || null;
  } else if(!confirm('Bu havale bildirimini onaylıyor musunuz? Onaylanınca abonelik uzatılır (eklenti bildirimiyse eklenti açılır).')){
    return;
  }
  const { error } = await sb.rpc('admin_review_bank_transfer_notice', {
    p_token: admin.session_token, p_notice_id: id, p_approve: approve, p_admin_note: adminNote
  });
  if(error){ alert(error.message); return; }
  showToast(approve ? 'Onaylandı, abonelik uzatıldı ✓' : 'Reddedildi');
  refreshBankTransferList(admin);
}

async function refreshPromoList(admin){
  const el = document.getElementById('promoContent'); if(!el) return;
  const { data, error } = await sb.rpc('list_promo_codes', { p_token: admin.session_token });
  if(error){
    if(error.message.includes('geçersiz')){ clearAdminSession(); render(); return; }
    el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return;
  }
  const codes = data || [];
  el.innerHTML = `
    <div class="settings-table-wrap">
    <table class="settings-table">
      <thead><tr><th>Kod</th><th>İndirim</th><th>Kullanım</th><th>Son Tarih</th><th>Durum</th><th></th></tr></thead>
      <tbody>
      ${codes.map(c => `
        <tr>
          <td class="col-name"><b>${escapeHtml(c.code)}</b></td>
          <td class="col-name">${c.discount_type==='percent' ? '%'+c.discount_value : money(c.discount_value)}</td>
          <td class="col-name">${c.used_count} / ${c.max_uses==null?'∞':c.max_uses}</td>
          <td class="col-name">${c.expires_at ? new Date(c.expires_at).toLocaleDateString('tr-TR') : 'Süresiz'}</td>
          <td>${c.active ? '<span class="role-badge" style="color:var(--green);border-color:var(--green);">Aktif</span>' : '<span class="role-badge" style="color:var(--red);border-color:var(--red);">Pasif</span>'}</td>
          <td style="white-space:nowrap;">
            <button class="sbtn" onclick="togglePromo('${c.id}')">${c.active?'Kapat':'Aç'}</button>
            <button type="button" class="act-btn act-delete" onclick="deletePromo('${c.id}')">${ICON_TRASH}<span>Sil</span></button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>
    <div class="add-row-panel">
      <p>Yeni Kod Oluştur</p>
      <div style="display:grid;grid-template-columns:1.2fr 0.8fr 0.8fr 0.8fr 1fr;gap:10px;align-items:end;">
        <div class="field-group"><label>Kod</label><input id="npCode" placeholder="örn. AHMET50" style="text-transform:uppercase;"></div>
        <div class="field-group"><label>Tür</label><select id="npType"><option value="percent">Yüzde (%)</option><option value="amount">Sabit (₺)</option></select></div>
        <div class="field-group"><label>Değer</label><input type="number" id="npValue" placeholder="20"></div>
        <div class="field-group"><label>Maks. Kullanım</label><input type="number" id="npMax" placeholder="Sınırsız"></div>
        <div class="field-group"><label>Son Tarih</label><input type="date" id="npExpires"></div>
      </div>
      <button style="margin-top:12px;max-width:220px;" onclick="createPromo()">+ Kod Oluştur</button>
    </div>
    <div class="add-row-panel" style="margin-top:20px;">
      <p>Kullanıcı Adınızı Değiştirin</p>
      <div style="display:flex;gap:10px;max-width:420px;">
        <input id="newAdminUsername" placeholder="Yeni kullanıcı adı" autocapitalize="none" value="${escapeAttr(admin.username||'')}" style="flex:1;margin:0;">
        <button style="width:auto;padding:10px 16px;margin:0;" onclick="changeAdminUsername()">Güncelle</button>
      </div>
      <div class="error" id="adminUsernameErr" style="text-align:left;margin:6px 0 0;min-height:0;"></div>
    </div>
    <div class="add-row-panel" style="margin-top:20px;">
      <p>Şifrenizi Değiştirin</p>
      <div style="display:flex;flex-direction:column;gap:10px;max-width:420px;">
        <div class="pw-field-wrap">
          <input type="password" id="newAdminPass" placeholder="Yeni şifre" style="margin:0;">
          <button type="button" class="pw-eye-btn" onclick="toggleAdminPassVisibility()" title="Şifreyi göster/gizle">👁️</button>
        </div>
        <div class="pw-field-wrap">
          <input type="password" id="newAdminPass2" placeholder="Yeni şifre (tekrar)" style="margin:0;">
          <button type="button" class="pw-eye-btn" onclick="toggleAdminPassVisibility()" title="Şifreyi göster/gizle">👁️</button>
        </div>
        <div class="error" id="adminPassErr" style="text-align:left;margin:0;min-height:0;"></div>
        <button style="width:auto;padding:10px 16px;margin:0;align-self:flex-start;" onclick="changeAdminPassword()">Güncelle</button>
      </div>
    </div>
    <div class="box" style="max-width:520px;margin-top:16px;text-align:left;" id="adminTotpBox"><p class="muted">Yükleniyor…</p></div>
  `;
  loadAdminTotpBox();
}
/* ---- 2 adımlı doğrulama (TOTP: Google/Microsoft Authenticator vb.) ---- */
async function loadAdminTotpBox(){
  const box = document.getElementById('adminTotpBox'); if(!box) return;
  const admin = getAdminSession();
  const { data, error } = await sb.rpc('admin_totp_status', { p_token: admin.session_token });
  if(error){ box.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  box.innerHTML = data.enabled ? `
    <h2 style="margin:0 0 6px;">🔐 2 Adımlı Doğrulama <span class="role-badge" style="color:var(--green);border-color:var(--green);">Açık</span></h2>
    <p class="muted" style="text-align:left;font-size:13px;">Girişte şifreden sonra telefonunuzdaki doğrulama uygulamasının ürettiği 6 haneli kod isteniyor.</p>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <input id="totpOffCode" inputmode="numeric" maxlength="6" placeholder="6 haneli kod" style="width:150px;margin:0;">
      <button type="button" class="ghost-btn" style="width:auto;margin:0;" onclick="disableAdminTotp()">Kapat</button>
    </div>
    <div class="error" id="totpErr" style="text-align:left;"></div>` : `
    <h2 style="margin:0 0 6px;">🔐 2 Adımlı Doğrulama <span class="role-badge" style="color:var(--red);border-color:var(--red);">Kapalı</span></h2>
    <p class="muted" style="text-align:left;font-size:13px;">Şifreniz ele geçirilse bile admin paneline girilemesin: girişte telefonunuzdaki <b>Google Authenticator</b>, <b>Microsoft Authenticator</b> gibi bir uygulamanın ürettiği kod da istensin.</p>
    <button type="button" style="width:auto;margin:0;" onclick="startAdminTotp()">Kurulumu Başlat</button>
    <div id="totpSetup"></div>`;
}
let QRCODE_LOADING = null;
function loadQrLib(){
  if(window.qrcode) return Promise.resolve();
  if(QRCODE_LOADING) return QRCODE_LOADING;
  QRCODE_LOADING = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    sc.integrity = 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k';
    sc.crossOrigin = 'anonymous'; sc.onload = res; sc.onerror = rej;
    document.head.appendChild(sc);
  });
  return QRCODE_LOADING;
}
async function startAdminTotp(){
  const admin = getAdminSession();
  const { data, error } = await sb.rpc('admin_totp_begin', { p_token: admin.session_token });
  if(error){ alert(error.message); return; }
  // QR kod tarayıcıda üretilir: gizli anahtar hiçbir dış servise gönderilmez.
  let qrHtml = '';
  try{ await loadQrLib(); const q = qrcode(0, 'M'); q.addData(data.uri); q.make(); qrHtml = q.createSvgTag({ cellSize: 5, margin: 3 }); }catch(e){}
  document.getElementById('totpSetup').innerHTML = `
    <ol style="text-align:left;font-size:13px;padding-left:18px;margin:12px 0;">
      <li>Telefonunuza <b>Google Authenticator</b> veya <b>Microsoft Authenticator</b> kurun.</li>
      <li>Uygulamada “+” → <b>QR kodu tara</b> ile aşağıdaki kodu okutun.</li>
      <li>Uygulamanın gösterdiği 6 haneli kodu girip <b>Etkinleştir</b>'e basın.</li>
    </ol>
    <div style="background:#fff;display:inline-block;border-radius:10px;">${qrHtml}</div>
    <div class="muted" style="font-size:12px;margin:8px 0;">QR okutamıyorsanız anahtarı elle girin: <code style="user-select:all;">${escapeHtml(data.secret.replace(/(.{4})/g, '$1 ').trim())}</code></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <input id="totpOnCode" inputmode="numeric" maxlength="6" placeholder="6 haneli kod" style="width:150px;margin:0;">
      <button type="button" style="width:auto;margin:0;" onclick="enableAdminTotp()">Etkinleştir</button>
    </div>
    <div class="error" id="totpErr" style="text-align:left;"></div>`;
}
async function enableAdminTotp(){
  const admin = getAdminSession();
  const { error } = await sb.rpc('admin_totp_enable', { p_token: admin.session_token, p_code: document.getElementById('totpOnCode').value.trim() });
  if(error){ document.getElementById('totpErr').textContent = error.message; return; }
  showToast('2 adımlı doğrulama açıldı ✓');
  loadAdminTotpBox();
}
async function disableAdminTotp(){
  if(!confirm('2 adımlı doğrulama kapatılsın mı? Admin girişi sadece şifreyle yapılır.')) return;
  const admin = getAdminSession();
  const { error } = await sb.rpc('admin_totp_disable', { p_token: admin.session_token, p_code: document.getElementById('totpOffCode').value.trim() });
  if(error){ document.getElementById('totpErr').textContent = error.message; return; }
  showToast('2 adımlı doğrulama kapatıldı');
  loadAdminTotpBox();
}
async function createPromo(){
  const admin = getAdminSession();
  const code = document.getElementById('npCode').value.trim();
  const type = document.getElementById('npType').value;
  const value = parseFloat(document.getElementById('npValue').value);
  const maxRaw = document.getElementById('npMax').value.trim();
  const max = maxRaw==='' ? null : parseInt(maxRaw,10);
  const expiresRaw = document.getElementById('npExpires').value;
  const expires = expiresRaw ? new Date(expiresRaw+'T23:59:59').toISOString() : null;
  if(!code || !value){ alert('Kod ve değer gerekli'); return; }
  const { error } = await sb.rpc('create_promo_code', { p_token: admin.session_token, p_code: code, p_discount_type: type, p_discount_value: value, p_max_uses: max, p_expires_at: expires });
  if(error){ alert(error.message); return; }
  refreshPromoList(admin);
}
async function togglePromo(id){
  const admin = getAdminSession();
  const { error } = await sb.rpc('toggle_promo_code', { p_token: admin.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  refreshPromoList(admin);
}
async function deletePromo(id){
  if(!confirm('Bu kodu silmek istediğinize emin misiniz?')) return;
  const admin = getAdminSession();
  const { error } = await sb.rpc('delete_promo_code', { p_token: admin.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  refreshPromoList(admin);
}
function toggleAdminPassVisibility(){
  const f1 = document.getElementById('newAdminPass');
  const f2 = document.getElementById('newAdminPass2');
  const showing = f1.type === 'text';
  const nextType = showing ? 'password' : 'text';
  f1.type = nextType; f2.type = nextType;
  document.querySelectorAll('.pw-eye-btn').forEach(b => b.textContent = showing ? '👁️' : '🙈');
}
async function changeAdminUsername(){
  const admin = getAdminSession();
  const errBox = document.getElementById('adminUsernameErr');
  errBox.textContent = '';
  const newUsername = document.getElementById('newAdminUsername').value.trim();
  if(!newUsername){ errBox.textContent = 'Kullanıcı adı boş olamaz'; return; }
  const { error } = await sb.rpc('change_platform_admin_username', { p_token: admin.session_token, p_new_username: newUsername });
  if(error){ errBox.textContent = error.message; return; }
  setAdminSession({ session_token: admin.session_token, username: newUsername });
  showToast('Kullanıcı adınız güncellendi ✓');
}
async function changeAdminPassword(){
  const admin = getAdminSession();
  const errBox = document.getElementById('adminPassErr');
  errBox.textContent = '';
  const newPass = document.getElementById('newAdminPass').value;
  const newPass2 = document.getElementById('newAdminPass2').value;
  if(!newPass || newPass.length<4){ errBox.textContent = 'En az 4 karakter bir şifre girin'; return; }
  if(newPass !== newPass2){ errBox.textContent = 'Girdiğiniz şifreler eşleşmiyor'; return; }
  const { error } = await sb.rpc('change_platform_admin_password', { p_token: admin.session_token, p_new_password: newPass });
  if(error){ errBox.textContent = error.message; return; }
  showToast('Şifreniz güncellendi ✓');
  document.getElementById('newAdminPass').value = '';
  document.getElementById('newAdminPass2').value = '';
}


/* Destek gelen kutusu: destek@peyktan.com'a gelen mailler Cloudflare Email
   Routing -> Email Worker ile hem Gmail'e iletilir hem de ingest_support_email
   ile buraya yazılır. Worker kodu bu sekmede gizli anahtarla birlikte üretilir. */
async function refreshSupportBadge(){
  const admin = getAdminSession(); if(!admin) return;
  const { data } = await sb.rpc('admin_support_unread_count', { p_token: admin.session_token });
  const el = document.getElementById('supportBadge');
  if(el) el.innerHTML = data ? `<b style="background:var(--red);color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;">${data}</b>` : '';
}
async function renderSupportAdmin(main, admin){
  main.innerHTML = '<p class="muted">Yükleniyor…</p>';
  const { data, error } = await sb.rpc('admin_list_support_emails', { p_token: admin.session_token });
  if(error){ main.innerHTML = '<p class="error">'+escapeHtml(error.message)+'</p>'; return; }
  APP.supportData = data;
  const items = data.items || [];
  const fmt = d => new Date(d).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  main.innerHTML = `<h1>✉️ Destek Gelen Kutusu</h1>
    <p class="muted" style="text-align:left;margin:0 0 14px;">destek@peyktan.com adresine gelen mailler. Okunmamış: <b>${data.unread||0}</b></p>
    ${!items.length ? '<p class="muted">Henüz mail yok. Kurulum için aşağıdaki adımları izleyin.</p>' : `<div style="display:flex;flex-direction:column;gap:8px;">${items.map(m => `
      <div class="box" style="max-width:none;padding:12px 14px;${m.is_read?'opacity:.7;':'border-left:4px solid var(--accent);'}">
        <div onclick="toggleSupportMail(${m.id})" style="cursor:pointer;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div style="min-width:0;"><b style="overflow-wrap:anywhere;">${escapeHtml(m.subject||'(konu yok)')}</b>
            <div class="muted" style="font-size:12px;overflow-wrap:anywhere;">${escapeHtml(m.from_name ? m.from_name + ' <' + m.from_addr + '>' : m.from_addr)}</div></div>
          <span class="muted" style="font-size:12px;white-space:nowrap;">${fmt(m.received_at)}</span>
        </div>
        <div id="supMail${m.id}" style="display:none;margin-top:10px;">
          <div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px;background:var(--bg);border-radius:8px;padding:10px;max-height:360px;overflow:auto;">${escapeHtml(m.body||'')}</div>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <a href="mailto:${escapeAttr(m.from_addr)}?subject=${encodeURIComponent('Re: ' + (m.subject||''))}"><button class="sbtn" style="width:auto;">↩️ Yanıtla</button></a>
            <button class="sbtn" style="width:auto;" onclick="markSupportMail(${m.id}, ${!m.is_read})">${m.is_read ? 'Okunmadı yap' : '✓ Okundu'}</button>
          </div>
        </div>
      </div>`).join('')}</div>`}
    <details style="margin-top:22px;"><summary style="cursor:pointer;font-weight:700;">⚙️ Kurulum (Cloudflare Email Worker)</summary>
      <ol style="line-height:1.7;font-size:14px;">
        <li>Cloudflare → <b>Compute → Workers &amp; Pages → Create → Worker</b>, adı örn. <code>peyktan-destek</code> → Deploy → <b>Edit code</b>.</li>
        <li>Aşağıya mailleri iletmek istediğiniz (Cloudflare'de doğrulanmış) Gmail adresini yazın, üretilen kodu kopyalayıp Worker'a yapıştırın → <b>Deploy</b>.</li>
        <li>Email Routing → <b>Routing rules</b> → destek@peyktan.com kuralını düzenleyin: Action = <b>Send to a Worker</b>, Worker = <code>peyktan-destek</code>.</li>
        <li>Deneme maili atın; birkaç saniye içinde hem Gmail'e hem bu listeye düşmeli.</li>
      </ol>
      <div class="field-group" style="max-width:420px;"><label>İletilecek Gmail adresi</label><input id="supFwd" type="email" autocapitalize="none" placeholder="ornek@gmail.com" oninput="drawSupportWorkerCode()"></div>
      <textarea id="supCode" readonly style="width:100%;height:260px;font-family:monospace;font-size:12px;margin-top:8px;"></textarea>
      <button class="sbtn" style="width:auto;margin-top:8px;" onclick="navigator.clipboard.writeText(document.getElementById('supCode').value).then(()=>showToast('Kod kopyalandı ✓'))">📋 Kodu Kopyala</button>
      <p class="muted" style="text-align:left;font-size:12px;">Kod gizli bir anahtar içerir; kimseyle paylaşmayın.</p>
    </details>`;
  drawSupportWorkerCode();
  refreshSupportBadge();
}
function toggleSupportMail(id){
  const el = document.getElementById('supMail'+id); if(!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? 'block' : 'none';
  const m = (APP.supportData && APP.supportData.items || []).find(x => x.id === id);
  if(open && m && !m.is_read) markSupportMail(id, true, true);
}
async function markSupportMail(id, read, quiet){
  const admin = getAdminSession();
  const { error } = await sb.rpc('admin_mark_support_email', { p_token: admin.session_token, p_id: id, p_read: read });
  if(error){ alert(error.message); return; }
  const m = (APP.supportData && APP.supportData.items || []).find(x => x.id === id);
  if(m) m.is_read = read;
  if(quiet) refreshSupportBadge(); else renderSupportAdmin(document.getElementById('main'), admin);
}
function drawSupportWorkerCode(){
  const ta = document.getElementById('supCode'); if(!ta) return;
  const fwd = (document.getElementById('supFwd').value || '').trim() || 'ORNEK@gmail.com';
  const secret = (APP.supportData && APP.supportData.secret) || '';
  ta.value = `// Peyktan destek maili: Gmail'e iletir + Peyktan admin paneline kaydeder.
const FORWARD_TO = ${JSON.stringify(fwd)};
const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
const SUPABASE_KEY = ${JSON.stringify(SUPABASE_KEY)};
const SECRET = ${JSON.stringify(secret)};

function decodeWords(s){
  return String(s||'').replace(/=\\?([^?]+)\\?([BbQq])\\?([^?]*)\\?=/g, (_, cs, enc, txt) => {
    try {
      const bytes = enc.toUpperCase() === 'B'
        ? Uint8Array.from(atob(txt), c => c.charCodeAt(0))
        : Uint8Array.from(txt.replace(/_/g,' ').replace(/=([0-9A-Fa-f]{2})/g, (m,h) => String.fromCharCode(parseInt(h,16))), c => c.charCodeAt(0));
      return new TextDecoder(cs).decode(bytes);
    } catch(e){ return txt; }
  });
}
function decodeBody(body, enc, cs){
  try {
    let bytes;
    if(/base64/i.test(enc)) bytes = Uint8Array.from(atob(body.replace(/\\s+/g,'')), c => c.charCodeAt(0));
    else if(/quoted-printable/i.test(enc)) bytes = Uint8Array.from(body.replace(/=\\r?\\n/g,'').replace(/=([0-9A-Fa-f]{2})/g, (m,h) => String.fromCharCode(parseInt(h,16))), c => c.charCodeAt(0));
    else bytes = Uint8Array.from(body, c => c.charCodeAt(0) & 255);
    return new TextDecoder(cs || 'utf-8').decode(bytes);
  } catch(e){ return body; }
}
function extractText(raw){
  const parts = raw.split(/\\r?\\n--[^\\r\\n]+/);
  let html = '';
  for(const p of parts){
    const i = p.search(/\\r?\\n\\r?\\n/); if(i < 0) continue;
    const head = p.slice(0, i), body = p.slice(i).replace(/^\\s+/, '');
    const type = (head.match(/content-type:\\s*([^;\\s]+)/i) || [])[1] || '';
    const enc = (head.match(/content-transfer-encoding:\\s*([^\\s;]+)/i) || [])[1] || '';
    const cs = (head.match(/charset="?([^";\\s]+)/i) || [])[1];
    if(/text\\/plain/i.test(type)) return decodeBody(body, enc, cs).trim();
    if(/text\\/html/i.test(type) && !html) html = decodeBody(body, enc, cs);
  }
  return html.replace(/<style[\\s\\S]*?<\\/style>/gi,'').replace(/<br\\s*\\/?>/gi,'\\n').replace(/<\\/p>/gi,'\\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim();
}

export default {
  async email(message, env, ctx) {
    await message.forward(FORWARD_TO);
    const raw = new TextDecoder('latin1').decode(await new Response(message.raw).arrayBuffer());
    const fromHdr = decodeWords(message.headers.get('from') || '');
    const name = (fromHdr.match(/^\\s*"?([^"<]*?)"?\\s*</) || [])[1] || null;
    ctx.waitUntil(fetch(SUPABASE_URL + '/rest/v1/rpc/ingest_support_email', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_secret: SECRET, p_from: message.from, p_from_name: name, p_to: message.to,
        p_subject: decodeWords(message.headers.get('subject') || ''), p_body: extractText(raw).slice(0, 20000) })
    }));
  }
};`;
}

/* GIF / Sticker (GIPHY): mesajlardaki GIF penceresi bu anahtarla çalışır. */
async function renderGifAdmin(main, admin){
  main.innerHTML = '<p class="muted">Yükleniyor…</p>';
  const { data: isSet, error } = await sb.rpc('admin_get_gif_key_set', { p_token: admin.session_token });
  if(error){ main.innerHTML = '<p class="error">'+escapeHtml(error.message)+'</p>'; return; }
  main.innerHTML = `<h1>🎞️ GIF ve Sticker</h1>
    <div class="box" style="max-width:640px;">
      <p style="text-align:left;margin-top:0;">Durum: ${isSet ? '<b style="color:var(--green);">✓ Anahtar kayıtlı — mesajlarda GIF / sticker açık</b>' : '<b style="color:var(--red);">Anahtar yok — mesajlarda GIF / sticker kapalı</b>'}</p>
      <ol style="text-align:left;line-height:1.7;font-size:14px;padding-left:18px;">
        <li><a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noopener">developers.giphy.com</a> adresinde ücretsiz hesap açın.</li>
        <li><b>Create an App</b> → <b>API</b> seçin → uygulama adı (örn. Peyktan) → oluşturun.</li>
        <li>Verilen <b>API Key</b>'i aşağıya yapıştırıp kaydedin.</li>
      </ol>
      <div class="field-group"><label>GIPHY API Key</label><input id="gifKeyInput" type="password" autocomplete="off" placeholder="${isSet ? '(kayıtlı - değiştirmek için yazın)' : 'API anahtarı'}"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button style="width:auto;" onclick="saveGifKey()">${ICON_SAVE}<span>Kaydet</span></button>
        ${isSet ? '<button class="ghost-btn" style="width:auto;color:var(--red);border-color:var(--red);" onclick="saveGifKey(true)">Anahtarı Kaldır</button>' : ''}
      </div>
    </div>`;
}
async function saveGifKey(remove){
  const admin = getAdminSession();
  const v = remove ? '' : document.getElementById('gifKeyInput').value.trim();
  if(!remove && !v){ alert('Anahtarı girin'); return; }
  const { error } = await sb.rpc('admin_set_gif_key', { p_token: admin.session_token, p_key: v });
  if(error){ alert(error.message); return; }
  showToast(remove ? 'Anahtar kaldırıldı' : 'Kaydedildi ✓');
  renderGifAdmin(document.getElementById('main'), admin);
}

/* ---- Abonelik süresini elle uzatma (havale, kampanya, deneme uzatma vb.) ---- */
function openExtendSubscription(id, name, exp){
  const ov = document.createElement('div'); ov.id = 'extendSubBg';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:110;padding:16px;';
  ov.onclick = (e) => { if(e.target===ov) ov.remove(); };
  const cur = exp ? new Date(exp) : null;
  const btn = 'flex:1 1 70px;margin:0;';
  ov.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:18px;max-width:420px;width:100%;text-align:left;">
    <h3 style="margin:0 0 4px;">⏳ Abonelik süresi</h3>
    <div class="muted" style="font-size:13px;margin-bottom:12px;"><b>${escapeHtml(name)}</b> · şu anki bitiş: <b>${cur ? cur.toLocaleDateString('tr-TR') : 'Süresiz'}</b>${cur && cur <= new Date() ? ' <span style="color:var(--red);">(dolmuş)</span>' : ''}</div>
    <div style="font-size:12.5px;font-weight:700;margin-bottom:6px;">Süre ekle <span class="muted" style="font-weight:400;">(bitişe, dolmuşsa bugüne eklenir)</span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
      ${[7,30,90,180,365].map(d => `<button type="button" class="sbtn" style="${btn}" onclick="doExtendSubscription('${id}', {p_days:${d}})">+${d === 365 ? '1 yıl' : d + ' gün'}</button>`).join('')}
    </div>
    <div style="font-size:12.5px;font-weight:700;margin-bottom:6px;">Veya bitiş tarihini belirle</div>
    <div style="display:flex;gap:6px;margin-bottom:12px;">
      <input type="date" id="extendUntil" style="margin:0;flex:1;" value="${cur ? cur.toISOString().slice(0,10) : ''}">
      <button type="button" class="sbtn" style="margin:0;" onclick="const v=document.getElementById('extendUntil').value; if(!v){alert('Tarih seçin');return;} doExtendSubscription('${id}', {p_until:v})">Ayarla</button>
    </div>
    <div style="display:flex;gap:8px;">
      <button type="button" class="ghost-btn" style="flex:1;margin:0;" onclick="if(confirm('Abonelik süresiz yapılsın mı?')) doExtendSubscription('${id}', {p_unlimited:true})">♾️ Süresiz yap</button>
      <button type="button" class="ghost-btn" style="flex:1;margin:0;" onclick="document.getElementById('extendSubBg').remove()">Kapat</button>
    </div></div>`;
  document.body.appendChild(ov);
}
async function doExtendSubscription(id, args){
  const admin = getAdminSession();
  const { data, error } = await sb.rpc('admin_extend_subscription', { p_token: admin.session_token, p_restaurant_id: id, ...args });
  if(error){ alert(error.message); return; }
  const bg = document.getElementById('extendSubBg'); if(bg) bg.remove();
  showToast('Yeni bitiş: ' + (data ? new Date(data).toLocaleDateString('tr-TR') : 'Süresiz') + ' ✓');
  render();
}
