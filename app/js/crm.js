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
      <button style="margin-top:12px;max-width:220px;" onclick="saveLoyaltySettings()">${ICON_SAVE}<span>Kaydet</span></button>
    </div>` : ''}
    <div class="box" style="max-width:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h2 style="margin:0;">Müşteri Listesi</h2>
        <input id="crmSearchInput" placeholder="İsim veya telefon ara..." style="max-width:260px;" value="${escapeAttr(APP.crmSearch||'')}" oninput="debouncedCrmSearch(this.value)">
      </div>
      <p class="muted" style="font-size:12px;margin:-4px 0 10px;">Harcama/ziyaret/doğum günü gibi detaylı analizler için <b>Finansal Analiz &gt; Müşteri Analizleri</b> sekmesine bakın.</p>
      <div class="settings-table-wrap">
      <table class="settings-table">
        <thead><tr><th>Ad</th><th>Telefon</th><th>Puan</th><th></th></tr></thead>
        <tbody>
        ${rows.map(c => `
          <tr>
            <td class="col-name">${escapeHtml(c.name)}${(c.spend_per_point!=null || c.point_value!=null || c.birthday_discount_percent!=null) ? ` <span class="role-badge" style="color:var(--accent);border-color:var(--accent);font-size:10.5px;" title="${escapeAttr(customerLoyaltySummary(c))}">⭐ Özel sadakat</span>` : ''}</td>
            <td>${escapeHtml(c.phone||'-')}</td>
            <td>${c.points_balance}</td>
            <td>
              <button class="sbtn" onclick="editCustomer('${c.id}')">Düzenle</button>
              <button type="button" class="act-btn act-delete" onclick="removeCustomer('${c.id}')">${ICON_TRASH}<span>Sil</span></button>
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
        <details id="crmLoyaltyBox" style="margin-top:12px;border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:var(--panel);">
          <summary style="cursor:pointer;font-weight:700;font-size:13.5px;">⭐ Bu müşteriye özel sadakat ayarı <span class="muted" style="font-weight:400;">(boş bırakılan alan genel ayarı kullanır)</span></summary>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px;">
            <div class="field-group"><label>Kaç TL harcamada 1 puan</label><input id="crm_spp" type="number" min="0.01" step="0.01" placeholder="Genel: ${escapeAttr(String(loyalty.spend_per_point ?? ''))}"></div>
            <div class="field-group"><label>1 puan kaç TL indirim</label><input id="crm_pv" type="number" min="0" step="0.01" placeholder="Genel: ${escapeAttr(String(loyalty.point_value ?? ''))}"></div>
            <div class="field-group"><label>🎂 Doğum günü indirimi (%)</label><input id="crm_bdp" type="number" min="0" max="100" step="1" placeholder="Genel: ${escapeAttr(String(loyalty.birthday_discount_percent ?? 0))}"></div>
          </div>
        </details>
        <button style="margin-top:12px;max-width:220px;" onclick="saveCrmCustomer()">${ICON_SAVE}<span>Kaydet</span></button>
      </div>
    </div>`;
}
function customerLoyaltySummary(c){
  const parts = [];
  if(c.spend_per_point!=null) parts.push(c.spend_per_point + ' TL = 1 puan');
  if(c.point_value!=null) parts.push('1 puan = ' + c.point_value + ' TL');
  if(c.birthday_discount_percent!=null) parts.push('doğum günü %' + c.birthday_discount_percent);
  return parts.join(' · ');
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
  document.getElementById('crm_spp').value = c.spend_per_point ?? '';
  document.getElementById('crm_pv').value = c.point_value ?? '';
  document.getElementById('crm_bdp').value = c.birthday_discount_percent ?? '';
  document.getElementById('crmLoyaltyBox').open = (c.spend_per_point!=null || c.point_value!=null || c.birthday_discount_percent!=null);
  document.getElementById('crmFormTitle').textContent = 'Müşteriyi Düzenle';
  document.getElementById('crm_name').scrollIntoView({ behavior:'smooth', block:'center' });
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
  const num = (elId) => { const v = document.getElementById(elId).value.trim(); return v==='' ? null : Number(v); };
  const spp = num('crm_spp'), pv = num('crm_pv'), bdp = num('crm_bdp');
  const { data: savedId, error } = await sb.rpc('upsert_customer', { p_token: session.session_token, p_id: id, p_name: name, p_phone: phone||null, p_email: email||null, p_notes: notes||null, p_birthday: birthday });
  if(error){ alert(error.message); return; }
  const custId = id || savedId;
  if(custId){
    const { error: e2 } = await sb.rpc('set_customer_loyalty', { p_token: session.session_token, p_id: custId, p_spend_per_point: spp, p_point_value: pv, p_birthday_discount_percent: bdp });
    if(e2){ alert('Müşteri kaydedildi ama özel sadakat ayarı kaydedilemedi: ' + e2.message); }
  }
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
