/* CRM / Sadakat - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= CRM / SADAKAT ================= */
async function renderCrmView(main, session){
  if(!APP.config){ const { data } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token })); if(data) APP.config = data; }
  const { data, error } = await withLoadingOverlay(sb.rpc('list_customers', { p_token: session.session_token, p_search: APP.crmSearch||null }));
  const rows = error ? [] : (data||[]);
  APP.crmRows = rows;
  const loyalty = APP.config.loyalty || { enabled:false, spend_per_point:10, point_value:1, birthday_discount_percent:0 };
  main.innerHTML = `<h1>Müşteriler</h1>
    ${session.isManager ? `
    <div class="box" style="max-width:none;">
      <h2>Sadakat Programı</h2>
      <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin-bottom:10px;">
        <input type="checkbox" id="loy_enabled" ${loyalty.enabled?'checked':''} style="width:auto;margin:0;"> Sadakat puanları aktif
      </label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:420px;">
        <div class="field-group"><label>Kaç TL harcamada 1 puan</label><input id="loy_spend" type="number" min="1" step="0.01" value="${loyalty.spend_per_point}"></div>
        <div class="field-group"><label>1 puan kaç TL indirim</label><input id="loy_value" type="number" min="0" step="0.01" value="${loyalty.point_value}"></div>
      </div>
      <div class="field-group" style="margin-top:10px;max-width:220px;"><label>🎂 Doğum günü indirimi (%)</label><input id="loy_birthday_pct" type="number" min="0" max="100" step="1" value="${loyalty.birthday_discount_percent||0}"></div>
      <p class="muted" style="font-size:12px;margin:6px 0 0;">Müşterinin doğum günü kaydedilmişse, o gün ödeme alırken bu yüzde otomatik indirim olarak uygulanır (0 = kapalı).</p>
      <button style="margin-top:12px;max-width:220px;" onclick="saveLoyaltySettings()">Kaydet</button>
    </div>` : ''}
    <div class="box" style="max-width:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h2 style="margin:0;">Müşteri Listesi</h2>
        <input id="crmSearchInput" placeholder="İsim veya telefon ara..." style="max-width:260px;" value="${escapeHtml(APP.crmSearch||'')}" oninput="debouncedCrmSearch(this.value)">
      </div>
      <p class="muted" style="font-size:12px;margin:-4px 0 10px;">Harcama/ziyaret/doğum günü gibi detaylı analizler için <b>Finansal Analiz &gt; Müşteri Analizleri</b> sekmesine bakın.</p>
      <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>Ad</th><th>Telefon</th><th>Puan</th><th></th></tr></thead>
        <tbody>
        ${rows.map(c => `
          <tr>
            <td class="col-name">${escapeHtml(c.name)}</td>
            <td>${escapeHtml(c.phone||'-')}</td>
            <td>${c.points_balance}</td>
            <td>
              <button class="sbtn" onclick="editCustomer('${c.id}')">Düzenle</button>
              <button class="sbtn" style="background:var(--red);color:var(--btn-ink);" onclick="removeCustomer('${c.id}')">Sil</button>
            </td>
          </tr>`).join('')}
        ${rows.length===0?'<tr><td colspan="4" class="muted" style="text-align:center;">Müşteri yok.</td></tr>':''}
        </tbody>
      </table>
      </div>
      <div class="add-row-panel">
        <p id="crmFormTitle">Yeni Müşteri Ekle</p>
        <input type="hidden" id="crm_edit_id">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">
          <div class="field-group"><label>Ad Soyad</label><input id="crm_name" placeholder="örn. Ahmet Yılmaz"></div>
          <div class="field-group"><label>Telefon</label><input id="crm_phone" placeholder="05xx..."></div>
          <div class="field-group"><label>E-posta</label><input id="crm_email" placeholder="opsiyonel"></div>
          <div class="field-group"><label>🎂 Doğum Günü</label><input id="crm_birthday" type="date"></div>
        </div>
        <div class="field-group" style="margin-top:10px;"><label>Not</label><input id="crm_notes" placeholder="opsiyonel"></div>
        <button style="margin-top:12px;max-width:220px;" onclick="saveCrmCustomer()">Kaydet</button>
      </div>
    </div>`;
}
let CRM_SEARCH_TIMER = null;
function debouncedCrmSearch(v){
  APP.crmSearch = v;
  clearTimeout(CRM_SEARCH_TIMER);
  CRM_SEARCH_TIMER = setTimeout(async () => {
    await renderCrmView(document.getElementById('main'), getSession());
    const inp = document.getElementById('crmSearchInput');
    if(inp){ inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }, 350);
}
function editCustomer(id){
  const c = (APP.crmRows||[]).find(x => x.id===id); if(!c) return;
  document.getElementById('crm_edit_id').value = c.id;
  document.getElementById('crm_name').value = c.name;
  document.getElementById('crm_phone').value = c.phone||'';
  document.getElementById('crm_email').value = c.email||'';
  document.getElementById('crm_notes').value = c.notes||'';
  document.getElementById('crm_birthday').value = c.birthday||'';
  document.getElementById('crmFormTitle').textContent = 'Müşteriyi Düzenle';
}
async function saveCrmCustomer(){
  const session = getSession();
  const id = document.getElementById('crm_edit_id').value || null;
  const name = document.getElementById('crm_name').value.trim();
  const phone = document.getElementById('crm_phone').value.trim();
  const email = document.getElementById('crm_email').value.trim();
  const notes = document.getElementById('crm_notes').value.trim();
  const birthday = document.getElementById('crm_birthday').value || null;
  if(!name){ alert('Müşteri adı gerekli'); return; }
  const { error } = await sb.rpc('upsert_customer', { p_token: session.session_token, p_id: id, p_name: name, p_phone: phone||null, p_email: email||null, p_notes: notes||null, p_birthday: birthday });
  if(error){ alert(error.message); return; }
  renderCrmView(document.getElementById('main'), session);
  showToast(id ? 'Güncellendi ✓' : 'Müşteri eklendi ✓');
}
async function removeCustomer(id){
  if(!confirm('Bu müşteriyi silmek istediğinize emin misiniz?')) return;
  const session = getSession();
  const { error } = await sb.rpc('delete_customer', { p_token: session.session_token, p_id: id });
  if(error){ alert(error.message); return; }
  renderCrmView(document.getElementById('main'), session);
}
async function saveLoyaltySettings(){
  const session = getSession();
  const enabled = document.getElementById('loy_enabled').checked;
  const spend = parseFloat(document.getElementById('loy_spend').value);
  const value = parseFloat(document.getElementById('loy_value').value);
  const birthdayPct = parseFloat(document.getElementById('loy_birthday_pct').value)||0;
  if(!spend || spend<=0){ alert('Puan başına harcama tutarı 0\'dan büyük olmalı'); return; }
  if(birthdayPct<0 || birthdayPct>100){ alert('Doğum günü indirimi 0-100 arasında olmalı'); return; }
  const { error } = await sb.rpc('update_loyalty_settings', { p_token: session.session_token, p_enabled: enabled, p_spend_per_point: spend, p_point_value: value, p_birthday_discount_percent: birthdayPct });
  if(error){ alert(error.message); return; }
  APP.config.loyalty = { enabled, spend_per_point: spend, point_value: value, birthday_discount_percent: birthdayPct };
  showToast('Sadakat ayarları kaydedildi ✓');
}
