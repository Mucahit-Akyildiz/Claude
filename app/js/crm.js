/* CRM / Sadakat - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= CRM / SADAKAT ================= */
async function renderCrmView(main, session){
  if(!APP.config){ const { data } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token })); if(data) APP.config = data; }
  const { data, error } = await withLoadingOverlay(sb.rpc('list_customers', { p_token: session.session_token, p_search: APP.crmSearch||null }));
  const rows = error ? [] : (data||[]);
  APP.crmRows = rows;
  const loyalty = APP.config.loyalty || { enabled:false, spend_per_point:10, point_value:1, birthday_discount_percent:0 };
  main.innerHTML = `<h1>Müşteriler</h1>
    ${canManage(session, 'crm') ? `
    <div class="box" style="max-width:none;">
      <h2>Sadakat Programı</h2>
      <div style="${INLINE_ROW}">
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin:0 0 10px;flex:0 0 auto;">
          <input type="checkbox" id="loy_enabled" ${loyalty.enabled?'checked':''} style="width:auto;margin:0;"> Sadakat puanları aktif
        </label>
        <div class="field-group" style="${fgStyle(150)}"><label>Kaç TL harcamada 1 puan</label><input id="loy_spend" type="number" min="1" step="0.01" value="${loyalty.spend_per_point}" style="margin:0;"></div>
        <div class="field-group" style="${fgStyle(150)}"><label>1 puan kaç TL indirim</label><input id="loy_value" type="number" min="0" step="0.01" value="${loyalty.point_value}" style="margin:0;"></div>
        <div class="field-group" style="${fgStyle(150)}"><label>🎂 Doğum günü indirimi (%)</label><input id="loy_birthday_pct" type="number" min="0" max="100" step="1" value="${loyalty.birthday_discount_percent||0}" style="margin:0;"></div>
        <button style="${INLINE_BTN}" onclick="saveLoyaltySettings()">${ICON_SAVE}<span>Kaydet</span></button>
      </div>
      <p class="muted" style="font-size:12px;margin:8px 0 0;text-align:left;">Müşterinin doğum günü kaydedilmişse, o gün ödeme alırken bu yüzde otomatik indirim olarak uygulanır (0 = kapalı).</p>
    </div>` : ''}
    <div class="box" style="max-width:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h2 style="margin:0;">Müşteri Listesi</h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input id="crmSearchInput" placeholder="İsim veya telefon ara..." style="max-width:260px;margin:0;" value="${escapeAttr(APP.crmSearch||'')}" oninput="debouncedCrmSearch(this.value)">
          <button type="button" class="ghost-btn" style="width:auto;margin:0;" onclick="exportCustomersCsv()" title="Tüm müşterileri Excel'de açılabilen CSV olarak indir">⬇️ Dışa aktar</button>
          ${canManage(session, 'crm') ? `<button type="button" class="ghost-btn" style="width:auto;margin:0;" onclick="openCustomerImport()" title="CSV dosyasından müşteri yükle">⬆️ İçe aktar</button>` : ''}
        </div>
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
        <div style="${INLINE_ROW}">
          <div class="field-group" style="${fgStyle(170, 2)}"><label>Ad Soyad</label><input id="crm_name" placeholder="örn. Ahmet Yılmaz" style="margin:0;"></div>
          <div class="field-group" style="${fgStyle(130)}"><label>Telefon</label><input id="crm_phone" placeholder="05xx..." style="margin:0;"></div>
          <div class="field-group" style="${fgStyle(160)}"><label>E-posta</label><input id="crm_email" placeholder="opsiyonel" style="margin:0;"></div>
          <div class="field-group" style="${fgStyle(140)}"><label>🎂 Doğum Günü</label><input id="crm_birthday" type="date" style="margin:0;"></div>
          <div class="field-group" style="${fgStyle(160, 2)}"><label>Not</label><input id="crm_notes" placeholder="opsiyonel" style="margin:0;"></div>
          <button style="${INLINE_BTN}" onclick="saveCrmCustomer()">${ICON_SAVE}<span>Kaydet</span></button>
        </div>
        <details id="crmLoyaltyBox" style="margin-top:10px;border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:var(--panel);">
          <summary style="cursor:pointer;font-weight:700;font-size:13.5px;">⭐ Bu müşteriye özel sadakat ayarı <span class="muted" style="font-weight:400;">(boş bırakılan alan genel ayarı kullanır)</span></summary>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px;">
            <div class="field-group"><label>Kaç TL harcamada 1 puan</label><input id="crm_spp" type="number" min="0.01" step="0.01" placeholder="Genel: ${escapeAttr(String(loyalty.spend_per_point ?? ''))}"></div>
            <div class="field-group"><label>1 puan kaç TL indirim</label><input id="crm_pv" type="number" min="0" step="0.01" placeholder="Genel: ${escapeAttr(String(loyalty.point_value ?? ''))}"></div>
            <div class="field-group"><label>🎂 Doğum günü indirimi (%)</label><input id="crm_bdp" type="number" min="0" max="100" step="1" placeholder="Genel: ${escapeAttr(String(loyalty.birthday_discount_percent ?? 0))}"></div>
          </div>
        </details>
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

/* ---- Müşteri içe / dışa aktarma (CSV) ----
   Dışa aktarma: UTF-8 BOM + noktalı virgül ayraç, Türkçe Excel doğrudan açar.
   İçe aktarma: Excel'den "CSV (virgül/noktalı virgülle ayrılmış)" kaydedilen dosya;
   ayraç (; , sekme) ve başlıklar otomatik tanınır. Telefonu eşleşen müşteri güncellenir. */
const CRM_CSV_COLS = [
  ['name', 'Ad Soyad', ['ad soyad','ad','isim','adı','name','müşteri','müşteri adı','full name']],
  ['phone', 'Telefon', ['telefon','tel','gsm','cep','phone','mobile','telefon no']],
  ['email', 'E-posta', ['e-posta','eposta','email','e-mail','mail']],
  ['birthday', 'Doğum Günü', ['doğum günü','dogum gunu','doğum tarihi','birthday','birth date']],
  ['notes', 'Not', ['not','notlar','note','notes','açıklama']],
  ['points_balance', 'Puan', ['puan','puan bakiyesi','points','points_balance']],
];
function csvCell(v){
  if(v == null) return '';
  let t = String(v);
  if(/^[=+\-@\t\r]/.test(t)) t = "'" + t; // Excel formül enjeksiyonuna karşı
  return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function downloadCsv(filename, rows){
  const csv = '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function exportCustomersCsv(){
  const session = getSession();
  const { data, error } = await withLoadingOverlay(sb.rpc('export_customers', { p_token: session.session_token }));
  if(error){ alert(error.message); return; }
  const rows = [['Ad Soyad','Telefon','E-posta','Doğum Günü','Not','Puan','Ziyaret','Toplam Harcama','Son Ziyaret','Kayıt Tarihi']];
  (data||[]).forEach(c => rows.push([c.name, c.phone, c.email, c.birthday, c.notes, c.points_balance, c.total_visits,
    c.total_spent, c.last_visit_at ? String(c.last_visit_at).slice(0,10) : '', c.created_at ? String(c.created_at).slice(0,10) : '']));
  downloadCsv('musteriler-' + todayLocalDateStr() + '.csv', rows);
  showToast((data||[]).length + ' müşteri dışa aktarıldı ✓');
}
function downloadCustomerTemplate(){
  downloadCsv('musteri-sablonu.csv', [CRM_CSV_COLS.map(c => c[1]), ['Ahmet Yılmaz','0532 123 45 67','ahmet@ornek.com','15.04.1990','Cam kenarı sever','0']]);
}
function parseCsv(text){
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [';', ',', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for(let i = 0; i < text.length; i++){
    const ch = text[i];
    if(q){
      if(ch === '"'){ if(text[i+1] === '"'){ cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if(ch === '"') q = true;
    else if(ch === delim){ row.push(cell); cell = ''; }
    else if(ch === '\n' || ch === '\r'){ if(ch === '\r' && text[i+1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if(cell !== '' || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
// 15.04.1990 / 15/04/1990 / 1990-04-15 -> 1990-04-15 (tanınmazsa olduğu gibi; sunucu hatayı satırda bildirir)
function normalizeDateCell(v){
  v = String(v||'').trim(); if(!v) return '';
  let m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if(m) return m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
  m = v.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if(m) return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
  return v;
}
function openCustomerImport(){
  const ov = document.createElement('div'); ov.id = 'crmImportBg';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:110;padding:16px;';
  ov.onclick = (e) => { if(e.target===ov) ov.remove(); };
  ov.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:18px;max-width:560px;width:100%;max-height:88vh;overflow:auto;text-align:left;">
    <h3 style="margin:0 0 8px;">⬆️ Müşteri içe aktar</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 10px;">Excel'de listenizi <b>Farklı Kaydet → CSV (UTF-8)</b> olarak kaydedip seçin. Sütunlar: <b>Ad Soyad</b> (zorunlu), Telefon, E-posta, Doğum Günü (GG.AA.YYYY), Not, Puan. <a href="#" onclick="downloadCustomerTemplate();return false;">Örnek şablonu indir</a></p>
    <input type="file" id="crmImportFile" accept=".csv,text/csv,text/plain" onchange="previewCustomerImport(this.files[0])" style="margin:0 0 10px;">
    <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:0 0 10px;"><input type="checkbox" id="crmImportUpdate" checked style="width:auto;margin:0;"> Telefonu eşleşen mevcut müşterileri güncelle</label>
    <div id="crmImportPreview" class="muted" style="font-size:12.5px;"></div>
    <div style="display:flex;gap:10px;margin-top:12px;">
      <button type="button" class="ghost-btn" style="flex:1;margin:0;" onclick="document.getElementById('crmImportBg').remove()">Kapat</button>
      <button type="button" id="crmImportBtn" style="flex:1;margin:0;" disabled onclick="runCustomerImport()">İçe aktar</button>
    </div></div>`;
  document.body.appendChild(ov);
}
async function previewCustomerImport(file){
  const box = document.getElementById('crmImportPreview'), btn = document.getElementById('crmImportBtn');
  APP.crmImportRows = null; btn.disabled = true;
  if(!file) return;
  if(/\.xlsx?$/i.test(file.name)){ box.innerHTML = '<span style="color:var(--red);">Excel dosyasını önce <b>CSV (UTF-8)</b> olarak kaydedin.</span>'; return; }
  const rows = parseCsv(await file.text());
  if(rows.length < 2){ box.innerHTML = '<span style="color:var(--red);">Dosyada başlık satırı ve en az bir müşteri olmalı.</span>'; return; }
  const head = rows[0].map(h => String(h).trim().toLocaleLowerCase('tr'));
  const map = {};
  CRM_CSV_COLS.forEach(([key, , aliases]) => { const i = head.findIndex(h => aliases.includes(h)); if(i >= 0) map[key] = i; });
  if(map.name == null){ box.innerHTML = '<span style="color:var(--red);">"Ad Soyad" sütunu bulunamadı. Başlık satırını şablondaki gibi yapın.</span>'; return; }
  const data = rows.slice(1).map(r => {
    const o = {}; Object.keys(map).forEach(k => o[k] = String(r[map[k]] ?? '').trim());
    if(o.birthday) o.birthday = normalizeDateCell(o.birthday);
    if(o.points_balance) o.points_balance = o.points_balance.replace(',', '.');
    return o;
  });
  if(data.length > 5000){ box.innerHTML = '<span style="color:var(--red);">Tek seferde en fazla 5000 satır yüklenebilir (' + data.length + ').</span>'; return; }
  APP.crmImportRows = data; btn.disabled = false;
  const cols = CRM_CSV_COLS.filter(c => map[c[0]] != null);
  box.innerHTML = `<b>${data.length}</b> satır bulundu · tanınan sütunlar: ${cols.map(c => c[1]).join(', ')}
    <div class="settings-table-wrap" style="margin-top:8px;"><table class="settings-table"><thead><tr>${cols.map(c => '<th>' + c[1] + '</th>').join('')}</tr></thead>
    <tbody>${data.slice(0, 5).map(d => '<tr>' + cols.map(c => '<td>' + escapeHtml(d[c[0]] || '') + '</td>').join('') + '</tr>').join('')}</tbody></table></div>
    ${data.length > 5 ? '<div style="margin-top:4px;">… ve ' + (data.length - 5) + ' satır daha</div>' : ''}`;
}
async function runCustomerImport(){
  const rows = APP.crmImportRows; if(!rows || !rows.length) return;
  const session = getSession();
  const { data, error } = await withLoadingOverlay(sb.rpc('import_customers', { p_token: session.session_token, p_rows: rows,
    p_update_existing: document.getElementById('crmImportUpdate').checked }));
  if(error){ alert(error.message); return; }
  const box = document.getElementById('crmImportPreview');
  box.innerHTML = `<div style="color:var(--text);font-size:13.5px;">✅ <b>${data.inserted}</b> eklendi · 🔄 <b>${data.updated}</b> güncellendi`
    + (data.skipped ? ' · ⏭ <b>' + data.skipped + '</b> atlandı (mevcut)' : '') + (data.failed ? ' · ⚠️ <b>' + data.failed + '</b> hatalı' : '') + '</div>'
    + (data.errors && data.errors.length ? '<ul style="margin:6px 0 0;padding-left:18px;">' + data.errors.map(e => '<li>Satır ' + (e.row + 1) + ': ' + escapeHtml(e.error) + '</li>').join('') + '</ul>' : '');
  document.getElementById('crmImportBtn').disabled = true; APP.crmImportRows = null;
  renderCrmView(document.getElementById('main'), session);
}
