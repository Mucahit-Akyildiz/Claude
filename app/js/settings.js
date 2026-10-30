/* Ayarlar bölümü - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= AYARLAR ================= */
/* Her sekme ilgili settings_* iznini gerektirir; Roller sekmesi ise
   sadece Yönetici'ye (is_manager) açık - bir role bu yetkiyi vermek
   mümkün değil (bkz. manager_upsert_role'un izin backend'i). */
const SETTINGS_TABS = [
  { tab:'stations', perm:'settings_stations', label:'Menüler & İstasyonlar', ico:'🍳', desc:'Menüler, mutfak istasyonları' },
  { tab:'zones', perm:'settings_zones', label:'Bölgeler & Masalar', ico:'🪑', desc:'Salon, masa planı' },
  { tab:'products', label:'Ürünler & Hammaddeler', ico:'🍔', desc:'Fiyat, reçete, stok' }, // alt sekmeler: Ürünler, Hammaddeler
  { tab:'flags', perm:'settings_flags', label:'Sipariş Etiketleri', ico:'🏷️', desc:'Sipariş notu etiketleri' },
  { tab:'users', label:'Kullanıcılar & Vardiyalar', ico:'👥', desc:'Personel, vardiya' }, // alt sekmeler: Kullanıcılar, Aktif, Vardiyalar
  { tab:'roles', perm:'settings_roles', label:'Roller', ico:'🔑', desc:'Yetkiler' },
  { tab:'integrations', perm:'settings_integrations', label:'Entegrasyonlar', ico:'🔌', desc:'Platformlar, yazıcılar' },
  { tab:'billing', label:'Abonelik, Hediye Kartı & Kampanya', ico:'💳', desc:'Plan, fatura, kartlar, kuponlar' }, // alt sekmeler
  { tab:'notifs', label:'Bildirim Ayarları', ico:'🔔', desc:'Kime gitsin, hatırlatmalar' },
  { tab:'reports', label:'Özet E-postaları', ico:'📬', desc:'Gün sonu ve haftalık özet' },
  { tab:'security', label:'Güvenlik', ico:'🛡️', desc:'Destek, kayıt, sıfırlama' }, // alt sekmeler: Destek Erişimi, Değişiklik Kaydı, Veri Sıfırlama
];
function settingsTabVisible(t, session){
  if(t.feature && !hasFeature(t.feature)) return false;
  if(t.tab==='reports') return !!session.isManager;
  if(t.tab==='notifs') return true; // Kime Gitsin / hatırlatma yalnızca yöneticiye; doğum günü uyarıları cihaz ayarı, herkese
  if(t.tab==='users') return canManage(session, 'settings_users') || canManage(session, 'shifts');
  if(t.tab==='products') return canManage(session, 'settings_products') || canManage(session, 'settings_ingredients');
  if(t.tab==='security') return canManage(session, 'settings_support') || canManage(session, 'settings_audit') || canManage(session, 'settings_datareset');
  if(t.tab==='billing') return canManage(session, 'settings_billing') || canManage(session, 'giftcards') || hasPerm(session, 'payments') || canManage(session, 'crm');
  return t.managerOnly ? !!session.isManager : canManage(session, t.perm);
}
async function renderSettingsView(main, session){
  const { data, error } = await sb.rpc('get_restaurant_config', { p_token: session.session_token });
  if(error){ main.innerHTML = '<h1>Ayarlar</h1><p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  APP.config = data;
  // Eski sekme adları (bildirimden/kayıtlı ekrandan gelebilir) yeni sekme + alt sekmeye çevrilir.
  const LEGACY_TABS = { shifts:['users','usersSubTab','shifts'], ingredients:['products','productsSubTab','ingredients'], floorplan:['zones','zonesSubTab','floorplan'],
    giftcards:['billing','billingSubTab','giftcards'], promos:['billing','billingSubTab','promos'], datareset:['security','securitySubTab','datareset'], support:['security','securitySubTab','support'], audit:['security','securitySubTab','audit'] };
  const lg = LEGACY_TABS[APP.settingsTab]; if(lg){ APP.settingsTab = lg[0]; APP[lg[1]] = lg[2]; }
  const visibleTabs = SETTINGS_TABS.filter(t => settingsTabVisible(t, session));
  if(!visibleTabs.some(t => t.tab===APP.settingsTab)) APP.settingsTab = visibleTabs.length ? visibleTabs[0].tab : null;
  main.innerHTML = `<h1>Ayarlar</h1>
    <div class="set-layout">
      <nav class="tabs settings-tabs set-nav">
        ${visibleTabs.map((t, i) => `<div class="tab set-item ${APP.settingsTab===t.tab?'active':''}" data-tab="${t.tab}" style="--i:${i};--sc:var(--c${i%4+1});" ${act('setSettingsTab', t.tab)}><span class="set-ico">${t.ico||'⚙️'}</span><span class="set-txt"><b>${t.label}</b><small>${t.desc||''}</small></span></div>`).join('')}
      </nav>
      <div id="settingsContent" class="set-content"></div>
    </div>`;
  applyNavBadges();
  renderSettingsContent(session);
}
function setSettingsTab(tab){
  if(tab !== APP.settingsTab) pushScreen();
  setTimeout(applyNavBadges, 0);
  APP.settingsTab = tab;
  document.querySelectorAll('.tabs .tab[data-tab]').forEach(el => el.classList.toggle('active', el.dataset.tab===tab));
  renderSettingsContent(getSession());
}
/* Ürünler/Hammaddeler listelerinde ada göre anlık arama (satırdaki ilk kutu = ad).
   Eşleşen satırı kalmayan istasyon grupları da gizlenir. Yazılan arama yenilemede korunur. */
function listSearchHtml(key, ph){
  APP.listSearch = APP.listSearch || {};
  setTimeout(() => filterListRows(key), 0);
  return `<input class="list-search" placeholder="🔍 ${escapeAttr(ph)}" value="${escapeAttr(APP.listSearch[key]||'')}" ${actOn('input','setListSearch',[key,'$value'])} style="max-width:320px;margin:0 0 12px;">`;
}
function filterListRows(key){
  const box = document.querySelector('#settingsContent .box'); if(!box) return;
  const q = String((APP.listSearch||{})[key]||'').trim().toLocaleLowerCase('tr');
  box.querySelectorAll('.settings-table tbody tr').forEach(tr => {
    if(tr.classList.contains('prod-cat-row')){ tr.style.display = q ? 'none' : ''; return; }
    const inp = tr.querySelector('input:not([type=checkbox])'); const name = (inp ? inp.value : tr.textContent).toLocaleLowerCase('tr');
    tr.style.display = !q || name.includes(q) ? '' : 'none';
  });
  box.querySelectorAll('.pcard').forEach(c => { c.style.display = !q || (c.dataset.name||'').includes(q) ? '' : 'none'; });
  box.querySelectorAll('.pcard-grid').forEach(g => { const d = g.closest('.prod-grp'); if(d) d.style.display = !q || [...g.children].some(c => c.style.display !== 'none') ? '' : 'none'; });
  box.querySelectorAll('.settings-table').forEach(t => {
    const grp = t.closest('.settings-table-wrap'); const wrap = grp && grp.parentElement !== box ? grp.parentElement : grp;
    if(!wrap) return;
    const any = [...t.querySelectorAll('tbody tr')].some(tr => tr.style.display !== 'none');
    wrap.style.display = any || !q ? '' : 'none';
  });
}
function renderSettingsContent(session){
  const el = document.getElementById('settingsContent'); if(!el) return;
  if(!APP.settingsTab){ el.innerHTML = '<p class="muted">Görüntüleme yetkiniz olan bir ayar bölümü yok.</p>'; return; }
  if(APP.settingsTab==='stations') renderStationsSettings(el, session);
  else if(APP.settingsTab==='zones') renderZonesTabWithSubtabs(el, session);
  else if(APP.settingsTab==='products') renderProductsTabWithSubtabs(el, session);
  else if(APP.settingsTab==='flags') renderOrderFlagsSettings(el, session);
  else if(APP.settingsTab==='roles') renderRolesSettings(el, session);
  else if(APP.settingsTab==='integrations') renderIntegrationsSettings(el, session);
  else if(APP.settingsTab==='billing') renderBillingTabWithSubtabs(el, session);
  else if(APP.settingsTab==='security') renderSecuritySettings(el, session);
  else if(APP.settingsTab==='reports') renderOwnerReportSettings(el, session);
  else if(APP.settingsTab==='notifs') renderNotifAdminSettings(el, session);
  else renderUsersTabWithSubtabs(el, session);
}
/* Kullanıcılar sekmesi alt sekmeli: Kullanıcılar | Aktif Kullanıcılar | Vardiyalar (yetkiye göre). */
function renderUsersTabWithSubtabs(el, session){
  const tabs = [
    canManage(session, 'settings_users') ? { id:'list', ic:'👥', label:'Kullanıcılar' } : null,
    canManage(session, 'settings_users') ? { id:'active', ic:'🟢', label:'Aktif Kullanıcılar' } : null,
    hasPerm(session, 'shifts') || canManage(session, 'shifts') ? { id:'shifts', ic:'⏱️', label:'Vardiyalar' } : null,
    hasPerm(session, 'shifts') || canManage(session, 'shifts') ? { id:'plan', ic:'📅', label:'Vardiya Planı' } : null,
    canManage(session, 'settings_users') ? { id:'limits', ic:'💳', label:'Limitler' } : null,
  ].filter(Boolean);
  if(!tabs.length){ el.innerHTML = ''; return; }
  if(!tabs.some(t => t.id === APP.usersSubTab)) APP.usersSubTab = tabs[0].id;
  const sub = APP.usersSubTab;
  const draw = (box) => sub==='limits' ? renderAllowancesSettings(box) : sub==='active' ? renderActiveUsersSettings(box) : sub==='shifts' ? renderShiftsSettings(box, session) : sub==='plan' ? renderShiftPlan(box) : renderUsersSettings(box, session);
  if(tabs.length === 1){ el.innerHTML = '<div id="usersSubContent"></div>'; draw(document.getElementById('usersSubContent')); return; }
  // Alt sekmeler kartın içinde, üst menüden ayrışan altı çizili stilde.
  el.innerHTML = `<div class="u-mwn box sub-tabs-box">
      <div class="sub-tabs" id="usersSubTabs">${tabs.map(t => `<div role="tab" tabindex="0" class="sub-tab ${sub===t.id?'active':''}" data-sub="${t.id}" ${act('setUsersSubTab', t.id)}><span class="sub-tab-ic">${t.ic}</span>${t.label}</div>`).join('')}</div>
      <div id="usersSubContent" class="sub-tabs-content"></div>
    </div>`;
  draw(document.getElementById('usersSubContent'));
}
/* Güvenlik sekmesi iki alt sekmeli: Destek Erişimi | Değişiklik Kaydı (yetkiye göre). */
/* Yönetici özet e-postaları: gün sonu (her gün, gün sonu saatinde) ve haftalık (pazartesi) özet Peyktan'dan gönderilir. */
async function renderOwnerReportSettings(el, session){
  el.innerHTML = '<div class="u-mwn box ix-box"><p class="muted">Yükleniyor…</p></div>';
  const { data, error } = await sb.rpc('get_owner_report', { p_token: session.session_token });
  const box = el.firstElementChild;
  if(error){ box.innerHTML = `<p class="muted">Yüklenemedi: ${escapeHtml(error.message)}</p>`; return; }
  const c = data || {}, on = !!c.enabled, h = String(c.day_end_hour ?? 4).padStart(2, '0');
  const sw = (id, val, lbl, sub) => `<label class="or-opt"><input type="checkbox" id="${id}" ${val ? 'checked' : ''}><span><b>${lbl}</b><small>${sub}</small></span></label>`;
  box.innerHTML = `<h2>📬 Özet E-postaları</h2>
    <div class="oo-hero ${on?'on':''}"><div class="oo-hero-ic">📊</div>
      <div class="oo-hero-t"><b>İşletmenin özeti e-postanıza gelsin</b><small>Ciro (önceki döneme göre değişimiyle), hesap ve kişi sayısı, ödeme dağılımı, en çok satanlar, iptal / ikram / indirim ve kritik stok — her gün sonunda otomatik.</small></div>
      <label class="oo-switch"><input type="checkbox" id="or_enabled" ${on?'checked':''}><span class="oo-track"><span class="oo-thumb"></span></span><em>${on?'Açık':'Kapalı'}</em></label></div>
    <div class="ix-sec"><div class="ix-st">Ne zaman gönderilsin?</div>
      <div class="or-opts">${sw('or_daily', c.daily !== false, '🌙 Gün sonu özeti', `Her gün saat ${h}:00'da, biten iş gününün özeti`)}${sw('or_weekly', c.weekly !== false, '📅 Haftalık özet', `Her pazartesi ${h}:00'da, son 7 günün özeti`)}</div>
      <p class="ix-note">ℹ️ Gönderim saati, Ayarlar'daki gün sonu saatinizdir (${h}:00).</p></div>
    <div class="ix-sec"><div class="ix-st">Kimlere gitsin?</div>
      <div class="ix-form"><div style="grid-column:1/-1;"><label>E-posta adresleri (virgülle ayırın)</label><input id="or_emails" value="${escapeAttr(c.emails || c.default_email || '')}" placeholder="ornek@isletme.com, ortak@isletme.com"></div></div></div>
    <div class="or-actions"><button class="ix-save" type="button" ${act('saveOwnerReport')}>${ICON_SAVE}<span>Kaydet</span></button>
      <button type="button" class="ghost-btn" ${act('sendOwnerReportNow','daily')}>📨 Dünkü özeti şimdi gönder</button>
      <button type="button" class="ghost-btn" ${act('sendOwnerReportNow','weekly')}>📨 Haftalık özeti şimdi gönder</button></div>`;
}
async function saveOwnerReport(){
  const v = id => document.getElementById(id);
  const { error } = await withLoadingOverlay(sb.rpc('set_owner_report', { p_token: getSession().session_token, p_cfg: { enabled: v('or_enabled').checked, daily: v('or_daily').checked, weekly: v('or_weekly').checked, emails: v('or_emails').value } }));
  if(error){ alert(error.message); return; }
  showToast('Özet e-postası ayarları kaydedildi ✓');
  renderOwnerReportSettings(document.getElementById('settingsContent'), getSession());
}
async function sendOwnerReportNow(kind){
  await saveOwnerReport();
  const { data, error } = await withLoadingOverlay(sb.rpc('send_owner_report_now', { p_token: getSession().session_token, p_kind: kind }));
  if(error){ alert(error.message); return; }
  showToast(data ? data + ' adrese gönderildi ✓' : 'Geçerli bir e-posta adresi girin');
}
function renderSecuritySettings(el, session){
  const tabs = [
    canManage(session, 'settings_support') ? { id:'support', ic:'🛟', label:'Destek Erişimi' } : null,
    canManage(session, 'settings_audit') ? { id:'audit', ic:'📜', label:'Değişiklik Kaydı' } : null,
    canManage(session, 'settings_datareset') ? { id:'datareset', ic:'🗑️', label:'Veri Sıfırlama' } : null,
  ].filter(Boolean);
  if(!tabs.length){ el.innerHTML = ''; return; }
  if(!tabs.some(t => t.id === APP.securitySubTab)) APP.securitySubTab = tabs[0].id;
  el.innerHTML = `<div class="u-mwn box sub-tabs-box">
      ${tabs.length > 1 ? `<div class="sub-tabs">${tabs.map(t => `<div role="tab" tabindex="0" class="sub-tab ${APP.securitySubTab===t.id?'active':''}" ${act('setSecuritySubTab', t.id)}><span class="sub-tab-ic">${t.ic}</span>${t.label}</div>`).join('')}</div>` : ''}
      <div id="securitySubContent" class="sub-tabs-content"></div>
    </div>`;
  const box = document.getElementById('securitySubContent');
  if(APP.securitySubTab === 'audit') renderAuditLogSettings(box, session);
  else if(APP.securitySubTab === 'datareset') renderDataResetSettings(box);
  else renderSupportAccessSettings(box, session);
}
function setSecuritySubTab(t){
  if(t !== APP.securitySubTab) pushScreen();
  APP.securitySubTab = t;
  const el = document.getElementById('settingsContent');
  if(el) renderSecuritySettings(el, getSession());
}
function setUsersSubTab(t){
  if(t !== (APP.usersSubTab||'list')) pushScreen();
  APP.usersSubTab = t;
  const el = document.getElementById('settingsContent');
  if(el) renderUsersTabWithSubtabs(el, getSession());
}

/* --- Entegrasyonlar: ÖKC/e-Fatura ve pazaryeri (Yemeksepeti/Trendyol/Getir)
   API kimlik bilgileri burada sadece güvenli şekilde SAKLANIR - gerçek bir
   dış servis çağrısı yapılmıyor. Bir e-fatura entegratörüyle (Foriba,
   İzibiz, Logo, Nesbilgi vb.) sözleşme yapılıp API bilgileri elde
   edildiğinde veya pazaryerlerinden onaylı işletme/API erişimi
   sağlandığında, bu ekrandan girilen anahtarlar üzerinden gerçek
   bağlantı ayrıca kodlanmalı (backend'de sadece ayarları okuyan/yazan
   RPC'ler var: get_integration_settings/update_efatura_settings/
   update_marketplace_settings). */
async function renderIntegrationsSettings(el, session){
  const { data, error } = await sb.rpc('get_integration_settings', { p_token: session.session_token });
  if(error){ el.innerHTML = '<p class="muted">Yüklenemedi: '+error.message+'</p>'; return; }
  // Ortak görünüm: üst kart (ikon + açıklama + aç/kapa), sağlayıcı kutucukları, anahtar alanı.
  const hero = (ic, t, d, id, on, extra) => `<div class="oo-hero ${on?'on':''}"><div class="oo-hero-ic">${ic}</div>
      <div class="oo-hero-t"><b>${t}</b><small>${d}</small>${extra||''}</div>
      <label class="oo-switch"><input type="checkbox" id="${id}" ${on?'checked':''} ${actOn('change','ixSw',['$checked'])}><span class="oo-track"><span class="oo-thumb"></span></span><em>${on?'Açık':'Kapalı'}</em></label></div>`;
  const tiles = (sel, cur, list) => `<input type="hidden" id="${sel}" value="${escapeAttr(cur||'')}"><div class="ix-tiles">${list.map(([v, ic, n, d]) =>
      `<button type="button" class="ix-tile ${cur===v?'on':''}" ${act('ixPick', sel, v)} data-v="${v}"><span>${ic}</span><b>${n}</b><small>${d}</small></button>`).join('')}</div>`;
  const keyRow = (id, ok, ph) => `<div class="ix-key"><label>🔑 API anahtarı</label><div class="ix-key-in"><input id="${id}" type="password" autocomplete="new-password" placeholder="${ok ? '•••••••• kayıtlı — değiştirmek için yazın' : ph}">
      <span class="ti-st ${ok?'ok':''}">${ok?'● Kayıtlı':'○ Girilmedi'}</span></div></div>`;
  const note = (t) => `<p class="ix-note">ℹ️ ${t}</p>`;
  const save = (fn) => `<button class="ix-save" ${act(fn)}>${ICON_SAVE}<span>Kaydet</span></button>`;
  el.innerHTML = `<div class="u-mwn box ix-box">
    <h2>🧾 ÖKC / e-Fatura <span class="role-badge" style="font-weight:600;">Eklenti</span></h2>
    ${hero('🧾', 'Yazarkasa ve e-Fatura / e-Arşiv (yakında)', 'Entegratörünüzü ve API anahtarınızı şimdiden kaydedin. Otomatik e-Arşiv / e-Fatura kesimi henüz aktif değil; hazır olduğunda bu bilgilerle açılacak.', 'int_efatura_enabled', data.efatura_enabled)}
    <div class="ix-sec"><div class="ix-st">1 · Entegratörünüzü seçin</div>
    ${tiles('int_efatura_provider', data.efatura_provider, [['foriba','🟦','Foriba','Sovos e-Fatura'],['izibiz','🟩','İzibiz','e-Fatura / e-Arşiv'],['logo','🟥','Logo','Logo e-Dönüşüm'],['nesbilgi','🟪','Nesbilgi','NES e-Fatura'],['other','➕','Diğer','Başka entegratör']])}</div>
    <div class="ix-sec"><div class="ix-st">2 · Bağlantı bilgisi</div>${keyRow('int_efatura_key', data.efatura_configured, 'Entegratör panelinden alınan API anahtarı')}</div>
    ${note('Anahtarınız şifreli saklanır. Şu an fatura entegratöre gönderilmez; yalnızca bilgiler kaydedilir.')}
    ${save('saveEfaturaSettings')}
  </div>
  <div class="u-mwn box ix-box">
    <h2>🛍️ Pazaryeri <span class="role-badge" style="font-weight:600;">Eklenti</span></h2>
    ${hero('🛍️', 'Tüm platform siparişleri tek ekranda (yakında)', 'Platform API anahtarlarınızı şimdiden kaydedin. Sipariş çekme ve menü eşitleme henüz aktif değil; hazır olduğunda bu anahtarlarla açılacak.', 'int_marketplace_enabled', data.marketplace_enabled)}
    <div class="ix-mk">${[['int_ys_key','🍽️','Yemeksepeti','#fa0050',data.marketplace_yemeksepeti_configured],['int_ty_key','🧡','Trendyol Yemek','#f27a1a',data.marketplace_trendyol_configured],['int_gt_key','🛵','Getir Yemek','#5d3ebc',data.marketplace_getir_configured]].map(([id, ic, n, c, ok]) =>
      `<div class="ix-mk-c ${ok?'ok':''}" style="--mk:${c};"><div class="ix-mk-h"><span class="ix-mk-ic">${ic}</span><b>${n}</b><span class="ti-st ${ok?'ok':''}">${ok?'● Bağlı':'○ Bağlı değil'}</span></div>
        <input id="${id}" type="password" autocomplete="new-password" placeholder="${ok?'•••••••• kayıtlı':'API anahtarı'}"></div>`).join('')}</div>
    ${note('Şu an platformlardan sipariş çekilmez; anahtarlar yalnızca şifreli saklanır. Platformdan onaylı işletme / API erişimi gerekir.')}
    ${save('saveMarketplaceSettings')}
  </div>
  <div class="u-mwn box ix-box">
    <h2>📊 Muhasebe <span class="role-badge" style="font-weight:600;">Eklenti</span></h2>
    ${hero('📊', 'Satışlar muhasebe programınıza (yakında)', 'Programınızı ve API anahtarınızı şimdiden kaydedin. Satış ve KDV aktarımı henüz aktif değil; hazır olduğunda bu bilgilerle açılacak.', 'int_accounting_enabled', data.accounting_enabled)}
    <div class="ix-sec"><div class="ix-st">1 · Programınızı seçin</div>
    ${tiles('int_accounting_provider', data.accounting_provider, [['logo','🟥','Logo','Tiger / Go / İşbaşı'],['mikro','🟦','Mikro','Mikro Fly / Jump'],['netsis','🟨','Netsis','Logo Netsis'],['other','➕','Diğer','Başka program']])}</div>
    <div class="ix-sec"><div class="ix-st">2 · Bağlantı bilgisi</div>${keyRow('int_accounting_key', data.accounting_configured, 'Muhasebe programınızın API anahtarı')}</div>
    ${note('Şu an muhasebeye veri aktarılmaz; bilgiler yalnızca saklanır. Aktarım, yazılım firmasıyla entegrasyon onayından sonra açılır.')}
    ${save('saveAccountingSettings')}
  </div>
  <div class="u-mwn box ix-box">
    <h2>⭐ Google Yorumları</h2>
    <div class="oo-hero ${APP.config.google_review_url?'on':''}"><div class="oo-hero-ic">⭐</div>
      <div class="oo-hero-t"><b>Müşteri yorumları Google'a</b><small>Hesap tamamen ödenince personel bir QR gösterir; müşteri telefonuyla okutup Google'da yorum bırakır.</small></div>
      <span class="ti-st ${APP.config.google_review_url?'ok':''}">${APP.config.google_review_url?'● Bağlı':'○ Link girilmedi'}</span></div>
    <div class="ix-sec"><div class="ix-st">Google yorum linkiniz</div>
      <div class="ix-form"><div><label>🔗 "Yorum yaz" linki</label><input id="int_google_review_url" placeholder="https://g.page/r/..." value="${escapeAttr(APP.config.google_review_url||'')}"></div></div></div>
    <p class="ix-note">ℹ️ Google Business Profile → <b>Daha fazla yorum alın</b> butonundaki linki kopyalayıp buraya yapıştırın.</p>
    <button class="ix-save" ${act('saveGoogleReviewUrl')}>${ICON_SAVE}<span>Kaydet</span></button>
  </div>
  <div class="u-mwn box oo-box">
    <h2>🛵 Dışarıdan Online Sipariş</h2>
    <div class="oo-hero ${APP.config.online_ordering && APP.config.online_ordering.enabled?'on':''}">
      <div class="oo-hero-ic">🛵</div>
      <div class="oo-hero-t"><b>Kendi sipariş sayfanız</b><small>Müşteriler telefondan gel-al veya paket sipariş verir; istekler "Sipariş Al" şeridine düşer, onaylayınca Paket Servis'e geçer. Komisyon yok.</small></div>
      <label class="oo-switch" title="Sipariş sayfasını aç/kapat">
        <input type="checkbox" id="int_online_ordering_enabled" ${APP.config.online_ordering && APP.config.online_ordering.enabled?'checked':''} ${actOn('change','saveOnlineOrderingSettings',[])}>
        <span class="oo-track"><span class="oo-thumb"></span></span><em>${APP.config.online_ordering && APP.config.online_ordering.enabled?'Açık':'Kapalı'}</em>
      </label>
    </div>
    <div class="oo-grid">
      <div class="oo-col">${APP.config.online_ordering && APP.config.online_ordering.enabled ? onlineOrderingLinkHtml() : `<div class="oo-share oo-off"><span>🔒</span><b>Sayfa kapalı</b><small>Açtığınızda burada QR kodunuz ve paylaşım linkiniz çıkar.</small></div>`}
        <div class="oo-quick">
          <button type="button" class="oo-chip" ${act('goProductMedia')}><span>📷</span><b>Ürün fotoğrafları</b><small>Görsel & açıklama ekle</small></button>
          <div class="oo-chip oo-chip-info"><span>📚</span><b>Başlıklar = menüleriniz</b><small>Ayarlar → İstasyonlar → Menüler</small></div>
        </div>
      </div>
      <div class="oo-col" id="ooPayCol"></div>
    </div>
  </div>`;
  // Paketinizde/eklentilerinizde olmayan bölümler kilitli gösterilir
  // (sunucu da ilgili RPC'lerde PAKET_OZELLIK_YOK ile reddediyor).
  const boxFeatures = ['efatura','marketplace','accounting','google_reviews','online_ordering'];
  el.querySelectorAll(':scope > .box').forEach((box, i) => {
    const f = boxFeatures[i];
    if(!f || hasFeature(f)) return;
    const title = box.querySelector('h2') ? box.querySelector('h2').outerHTML : '';
    box.innerHTML = title + lockedFeatureHtml() + `<div class="addon-buy" data-addon="${f}"></div>`;
    loadAddonPurchaseBox(box.querySelector('.addon-buy'), f);
  });
  // Fatura bilgileri tüm paketlerde: ödeme sonrası e-postayla gönderilen
  // hesap/faturanın başlığında görünür (bkz. email_invoice).
  const inv = document.createElement('div');
  inv.className = 'box'; inv.style.maxWidth = 'none';
  inv.classList.add('ix-box');
  const invOk = !!(data.tax_number && (data.invoice_title || (APP.config && APP.config.restaurant_name)));
  inv.innerHTML = `<h2>🧾 Fatura Bilgileri</h2>
    <div class="oo-hero ${invOk?'on':''}"><div class="oo-hero-ic">🧾</div>
      <div class="oo-hero-t"><b>Faturanızın başlığı</b><small>Ödeme sonrası müşteriye e-postayla giden hesap/faturanın üstünde bu bilgiler görünür.</small></div>
      <span class="ti-st ${invOk?'ok':''}">${invOk?'● Tamam':'○ Eksik'}</span></div>
    <div class="ix-sec"><div class="ix-st">İşletme bilgileri</div>
    <div class="ix-form">
      <div><label>Ünvan</label><input id="inv_title" value="${escapeAttr(data.invoice_title||'')}" placeholder="${escapeAttr(APP.config&&APP.config.restaurant_name||'İşletme ünvanı')}"></div>
      <div><label>VKN / TCKN</label><input id="inv_tax" value="${escapeAttr(data.tax_number||'')}" inputmode="numeric" maxlength="11"></div>
      <div><label>Vergi Dairesi</label><input id="inv_office" value="${escapeAttr(data.tax_office||'')}"></div>
      <div><label>Adres</label><input id="inv_addr" value="${escapeAttr(data.invoice_address||'')}"></div>
    </div></div>
    <button class="ix-save" ${act('saveInvoiceSettings')}>${ICON_SAVE}<span>Kaydet</span></button>
    <div class="ix-st" style="margin-top:20px;">📨 Son 30 günde gönderilenler</div>
    <div id="invoiceList" class="u-fs13 muted">Yükleniyor...</div>`;
  el.appendChild(inv);
  const sms = document.createElement('div');
  sms.className = 'box'; sms.style.maxWidth = 'none';
  sms.classList.add('ix-box');
  sms.innerHTML = `<h2>📱 SMS Bildirimleri</h2>
    <div class="oo-hero ${data.sms_enabled?'on':''}"><div class="oo-hero-ic">📱</div>
      <div class="oo-hero-t"><b>Müşterilere otomatik SMS</b><small>Rezervasyon onayı ve 2 saat kala hatırlatma, paket siparişi hazır bildirimi, bekleme listesinde "Masa Hazır" mesajı, ödeme alındı bilgisi.</small></div>
      <label class="oo-switch"><input type="checkbox" id="int_sms_enabled" ${data.sms_enabled?'checked':''} ${actOn('change','saveSmsSettings',['$checked'])}><span class="oo-track"><span class="oo-thumb"></span></span><em>${data.sms_enabled?'Açık':'Kapalı'}</em></label></div>
    ${ctTabsHtml('sms', [['conn','🔌 Bağlantı'],['tpl','💬 Mesajlar'],['log','📨 Gönderilenler']])}
    <div class="ct-pane" data-pane="conn"><div id="tiSms"></div></div>
    <div class="ct-pane" data-pane="tpl"><div id="smsTplBox"></div></div>
    <div class="ct-pane" data-pane="log"><div id="smsLogBox"></div></div>`;
  sms.dataset.ctgrp = 'sms'; sms.dataset.ct = (APP.ctTab || {}).sms || 'conn';
  el.insertBefore(sms, inv);
  loadSmsTemplates();
  APP.smsLog = { days: 30, day: '', purpose: '', status: '', q: '', rows: [], open: null };
  loadSmsLog();
  const today = new Date(), from = new Date(Date.now()-29*864e5);
  const iso = d => d.toLocaleDateString('sv-SE');
  sb.rpc('list_invoices', { p_token: session.session_token, p_date: iso(from), p_date_to: iso(today) }).then(({ data: rows, error: e }) => {
    const box = document.getElementById('invoiceList'); if(!box) return;
    if(e){ box.textContent = e.message; return; }
    const st = { emailed:'E-posta', efatura_queued:'e-Fatura kuyrukta', efatura_issued:'e-Fatura kesildi', efatura_failed:'e-Fatura hata' };
    box.innerHTML = !(rows||[]).length ? 'Henüz gönderilen yok.' : `<table class="settings-table"><thead><tr><th>No</th><th>Tarih</th><th>E-posta</th><th>Alıcı</th><th>Tutar</th><th>Durum</th></tr></thead><tbody>${
      rows.map(r => `<tr><td>${escapeHtml(r.number)}</td><td>${new Date(r.created_at).toLocaleString('tr-TR')}</td><td>${escapeHtml(r.email||'')}</td><td>${escapeHtml(r.buyer_name||'—')}</td><td>${money(r.total)}</td><td>${st[r.status]||escapeHtml(r.status)}</td></tr>`).join('')}</tbody></table>`;
  });
  // Her entegrasyon ayrı alt sekmede (tek uzun sayfa yerine).
  const INT_TABS = [
    { id:'online', ic:'🛵', label:'Online Sipariş' }, { id:'google', ic:'⭐', label:'Google Yorumları' },
    { id:'sms', ic:'📱', label:'SMS' }, { id:'invoice', ic:'🧾', label:'Fatura Bilgileri' },
    { id:'mail', ic:'✉️', label:'E-posta' }, { id:'bank', ic:'🏦', label:'Banka / IBAN' },
    { id:'efatura', ic:'🧾', label:'ÖKC / e-Fatura' }, { id:'marketplace', ic:'🛍️', label:'Pazaryeri' }, { id:'accounting', ic:'📊', label:'Muhasebe' },
  ];
  const order = ['efatura','marketplace','accounting','google','online','sms','invoice'];
  const boxes = [...el.querySelectorAll(':scope > .box')];
  boxes.forEach((b, i) => { b.dataset.int = order[i]; b.classList.add('int-pane'); });
  // İşletmenin kendi e-posta ve online ödeme hesapları (bkz. renderTenantIntegrations).
  [['mail','✉️ E-posta Gönderimi','tiMail']].forEach(([k, t, id]) => {
    const b = document.createElement('div'); b.className = 'box int-pane ix-box'; b.style.maxWidth = 'none'; b.dataset.int = k;
    b.innerHTML = `<h2>${t}</h2>${ctTabsHtml('mail', [['conn','🔌 Bağlantı'],['tpl','✉️ E-postalar'],['log','📨 Gönderilenler']])}<div class="ct-pane" data-pane="conn"><div id="${id}"><p class="muted">Yükleniyor…</p></div></div><div class="ct-pane" data-pane="tpl"><div id="mailTplBox"></div></div><div class="ct-pane" data-pane="log"><div id="mailLogBox"></div></div>`;
    b.dataset.ctgrp = 'mail'; b.dataset.ct = (APP.ctTab || {}).mail || 'conn'; el.appendChild(b); boxes.push(b);
  });
  // Banka / IBAN: Havale/EFT ödemesinde müşteriye SMS / e-postayla gönderilir.
  { const bk = (APP.config && APP.config.bank) || {}, b = document.createElement('div'); b.className = 'box int-pane ix-box'; b.style.maxWidth = 'none'; b.dataset.int = 'bank';
    const ok = !!bk.bank_iban, mgr = !!session.isManager;
    b.innerHTML = `<h2>🏦 Banka / IBAN</h2>
      <div class="oo-hero ${ok?'on':''}"><div class="oo-hero-ic">🏦</div>
        <div class="oo-hero-t"><b>Havale / EFT ile ödeme</b><small>Ödeme ekranındaki <b>Havale / EFT</b> seçeneğinde bu hesap gösterilir; IBAN müşteriye tek tıkla SMS ya da e-postayla gönderilir.</small></div>
        <span class="ti-st ${ok?'ok':''}">${ok?'● Tamam':'○ Eksik'}</span></div>
      <div class="ix-sec"><div class="ix-st">Hesap bilgileri</div><div class="ix-form">
        <div><label>Banka adı</label><input id="bank_name" value="${escapeAttr(bk.bank_name||'')}" placeholder="örn. Ziraat Bankası" ${mgr?'':'disabled'}></div>
        <div><label>Hesap sahibi</label><input id="bank_holder" value="${escapeAttr(bk.bank_holder||'')}" placeholder="Ad Soyad / Ünvan" ${mgr?'':'disabled'}></div>
        <div style="grid-column:1/-1;"><label>IBAN</label><input id="bank_iban" value="${escapeAttr(fmtIban(bk.bank_iban||''))}" placeholder="TR00 0000 0000 0000 0000 0000 00" maxlength="32" style="font-family:monospace;letter-spacing:.04em;" ${mgr?'':'disabled'} ${actOn('input','formatIbanInput',['$this'])}></div>
      </div></div>
      ${mgr ? `<button class="ix-save" ${act('saveBankInfo')}>${ICON_SAVE}<span>Kaydet</span></button>` : '<p class="u-fs13 muted">Banka bilgisini yalnızca yönetici değiştirebilir.</p>'}`;
    el.appendChild(b); boxes.push(b); }
  loadMailTemplates();
  APP.mailLog = { days: 30, day: '', purpose: '', status: '', q: '', rows: [], open: null };
  loadMailLog();
  // Online kartla ödeme, Online Sipariş sekmesinin içinde.
  const onl = boxes.find(x => x.dataset.int === 'online');
  if(onl){ const d = document.createElement('div'); d.id = 'tiPay'; (onl.querySelector('#ooPayCol') || onl).appendChild(d); }
  if(!INT_TABS.some(t => t.id === APP.integrationsSubTab)) APP.integrationsSubTab = 'online';
  const INT_DESC = { online:'Kendi sipariş sayfanız ve kartla ödeme', google:'İşletme yorumlarını takip edin', sms:'Müşterilere SMS bildirimi', mail:'Kendi alan adınızdan e-posta', pay:'iyzico / PayTR ile kartla ödeme', invoice:'Faturada görünecek bilgiler',
    efatura:'Yazarkasa ve e-Fatura/e-Arşiv', marketplace:'Pazaryeri menü eşitleme', accounting:'Muhasebe yazılımına aktarım', bank:'Havale/EFT için IBAN' };
  const stOf = (id) => { const b = boxes.find(x => x.dataset.int === id); const t = b ? b.textContent : '';
    if(/paketinizde yok/i.test(t)) return ['lock','🔒 Eklenti'];
    const c = APP.config || {}, on = { online: !!(c.online_ordering && c.online_ordering.enabled), google: !!c.google_review_url,
      marketplace: !!(data.marketplace_enabled && (data.marketplace_getir_configured || data.marketplace_trendyol_configured || data.marketplace_yemeksepeti_configured)),
      invoice: !!(data.invoice_title && data.tax_number), bank: !!(c.bank && c.bank.bank_iban), efatura: !!(data.efatura_enabled && data.efatura_configured), accounting: !!(data.accounting_enabled && data.accounting_configured),
      sms: !!data.sms_enabled && (APP.intLive || {}).sms !== false, mail: !!(APP.intLive || {}).mail }[id];
    return on ? ['ok','Aktif'] : ['off','Kapalı']; };
  const bar = document.createElement('div');
  bar.className = 'int-groups';
  const GROUPS = [['🛒 Satış kanalları', ['online','marketplace','google']], ['💬 Müşteri iletişimi', ['sms','mail','bank']], ['🧾 Fatura & muhasebe', ['invoice','efatura','accounting']]];
  bar.innerHTML = GROUPS.map(([g, ids]) => `<div class="int-group"><div class="int-gt">${g}</div><div class="int-gl">${ids.map(id => { const t = INT_TABS.find(x => x.id === id); if(!t) return ''; const [k, l] = stOf(id);
    return `<button type="button" class="int-row ${APP.integrationsSubTab===id?'active':''} st-${k}" data-int-tab="${id}" ${act('setIntegrationsSubTab', id)}>
      <span class="int-ic">${t.ic}</span><span class="int-txt"><b>${t.label}</b><small>${INT_DESC[id]||''}</small></span><span class="int-st" title="${l}">${k==='lock' ? '🔒' : k==='ok' ? '● Aktif' : '○ Kapalı'}</span></button>`; }).join('')}</div></div>`).join('');
  el.insertBefore(bar, el.firstChild);
  // Ortak bağlantı altyapısı (bkz. integration-hub.js): ÖKC / e-Fatura ve Pazaryeri sekmelerinin başında.
  [['efatura','cxOkc','okc'],['marketplace','cxMp','marketplace']].forEach(([pane, id, kind]) => { const b = boxes.find(x => x.dataset.int === pane); if(!b || typeof renderConnectors !== 'function') return;
    const d = document.createElement('div'); d.id = id; d.className = 'cx-box'; const h = b.querySelector('h2'); h ? h.after(d) : b.prepend(d); renderConnectors(kind); });
  showIntegrationPane();
  renderTenantIntegrations(session);
}
function showIntegrationPane(){
  document.querySelectorAll('#settingsContent .int-pane').forEach(b => { b.style.display = b.dataset.int === APP.integrationsSubTab ? '' : 'none'; });
  document.querySelectorAll('#settingsContent [data-int-tab]').forEach(t => t.classList.toggle('active', t.dataset.intTab === APP.integrationsSubTab));
}
function setIntegrationsSubTab(t){ APP.integrationsSubTab = t; showIntegrationPane(); }
async function saveInvoiceSettings(){
  const session = getSession();
  const v = id => document.getElementById(id).value;
  const { error } = await sb.rpc('update_invoice_settings', { p_token: session.session_token,
    p_title: v('inv_title'), p_tax_number: v('inv_tax'), p_tax_office: v('inv_office'), p_address: v('inv_addr') });
  if(error){ alert(error.message); return; }
  showToast('Fatura bilgileri kaydedildi ✓');
}
/* Kilitli eklenti: abonelikteki havale akışının aynısı - IBAN'a gönderip
   "Ödemeyi Yaptım" bildirimi; platform yöneticisi onaylayınca eklenti açılır
   (bkz. submit_addon_transfer_notice / admin_review_bank_transfer_notice).
   Google Play politikası gereği native uygulamada gösterilmez. */
async function loadAddonPurchaseBox(el, addonId){
  if(!el || isNativeApp()) return;
  const session = getSession();
  const { data, error } = await sb.rpc('get_addon_purchase_info', { p_token: session.session_token, p_addon_id: addonId });
  if(error || !data || !data.addon || !(Number(data.addon.price) > 0)) return;
  const a = data.addon;
  if(data.pending){
    el.innerHTML = `<div class="add-row-panel" style="border-color:var(--accent);margin-top:12px;">
      <b>🏦 Ödeme bildiriminiz alındı</b>
      <p class="muted" style="text-align:left;margin:6px 0 0;">${money(data.pending.amount)} tutarındaki bildiriminiz ${new Date(data.pending.created_at).toLocaleString('tr-TR')} tarihinde iletildi. Onaylanınca eklenti otomatik açılacak.</p></div>`;
    return;
  }
  if(!data.is_manager){ return; }
  el.innerHTML = `<div class="u-mt12 add-row-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
      <b>🧩 ${escapeHtml(a.label)} eklentisini ekleyin</b>
      <span class="role-badge" style="color:var(--accent);border-color:var(--accent);">${money(a.price)} / ay</span>
    </div>
    ${data.iban ? `<p class="muted" style="text-align:left;margin:8px 0;font-size:13px;">Tutarı aşağıdaki hesaba havale/EFT ile gönderip <b>Ödemeyi Yaptım</b>'a basın. Açıklamaya işletme adınızı yazın.</p>
    <div style="background:var(--panel2);border-radius:10px;padding:10px 12px;font-size:13.5px;line-height:1.7;">
      ${data.bank_name ? `<div>Banka: <b>${escapeHtml(data.bank_name)}</b></div>` : ''}
      ${data.account_name ? `<div>Alıcı: <b>${escapeHtml(data.account_name)}</b></div>` : ''}
      <div style="overflow-wrap:anywhere;">IBAN: <b>${escapeHtml(data.iban)}</b> <a href="#" style="color:var(--accent);font-size:12px;" ${act('copyText', data.iban, 'IBAN kopyalandı ✓')}>Kopyala</a></div>
    </div>
    <div class="field-group" style="margin-top:10px;"><label>Not (opsiyonel)</label><input class="addon-note" placeholder="örn. gönderen adı / dekont no"></div>
    <button style="max-width:240px;" ${act('submitAddonTransfer', '$this', addonId)}>🏦 Ödemeyi Yaptım</button>`
    : '<p class="u-tl muted">Banka bilgileri henüz tanımlanmamış, lütfen bizimle iletişime geçin.</p>'}
  </div>`;
}
async function submitAddonTransfer(btn, addonId){
  const wrap = btn.closest('.addon-buy');
  const noteEl = wrap && wrap.querySelector('.addon-note');
  if(!await uiConfirm('Havale/EFT ödemesini yaptığınızı onaylıyor musunuz?')) return;
  btn.disabled = true;
  const session = getSession();
  const { error } = await sb.rpc('submit_addon_transfer_notice', { p_token: session.session_token, p_addon_id: addonId, p_note: noteEl ? (noteEl.value.trim()||null) : null });
  if(error){ btn.disabled = false; alert(error.message); return; }
  showToast('Ödeme bildiriminiz alındı ✓ Onaylanınca eklenti açılacak.');
  loadAddonPurchaseBox(wrap, addonId);
}

function fmtIban(v){ return String(v || '').replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim(); }
function formatIbanInput(el){ const pos = el.value.length; el.value = fmtIban(el.value); if(document.activeElement === el && pos >= el.value.length - 1) el.setSelectionRange(el.value.length, el.value.length); }
async function saveBankInfo(){
  const v = id => (document.getElementById(id) || {}).value || '';
  const iban = v('bank_iban').replace(/\s/g, '').toUpperCase();
  if(iban && !/^TR\d{24}$/.test(iban)){ showToast('IBAN TR ile başlamalı ve 26 karakter olmalı'); return; }
  const { data, error } = await sb.rpc('save_bank_info', { p_token: getSession().session_token, p_bank: v('bank_name'), p_holder: v('bank_holder'), p_iban: iban });
  if(error){ showToast(error.message); return; }
  if(APP.config) APP.config.bank = data;
  showToast('Banka bilgisi kaydedildi ✓');
}
