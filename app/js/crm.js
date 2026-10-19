/* CRM / Sadakat - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= CRM / SADAKAT ================= */
async function renderCrmView(main, session){
  if(!APP.config){ const { data } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token })); if(data) APP.config = data; }
  const { data, error } = await withLoadingOverlay(sb.rpc('list_customers', { p_token: session.session_token, p_search: APP.crmSearch||null }));
  const rows = error ? [] : (data||[]);
  APP.crmRows = rows;
  const loyalty = APP.config.loyalty || { enabled:false, spend_per_point:10, point_value:1, birthday_discount_percent:0 };
  const bdays = rows.filter(c => { const b = crmBirthdayInfo(c.birthday); return b && b.days <= 30; }).length;
  main.innerHTML = `<h1>Müşteriler</h1>
    ${statChips([['👥', rows.length, APP.crmSearch ? 'Aramada bulunan' : 'Kayıtlı müşteri', 'var(--c1)', 'all'], ['⭐', rows.reduce((x, c) => x + (Number(c.points_balance)||0), 0), 'Toplam puan', 'var(--c3)', 'pts'],
      ['🎂', bdays, '30 gün içinde doğum günü', 'var(--c2)', 'bday'], ['💎', rows.filter(c => crmTier(c).rank >= 2).length, (crmTiers()[1] ? crmTiers()[1].name : 'Altın') + ' ve üstü müşteri', 'var(--c4)', 'gold']], '', 'crm')}
    <div class="box" style="max-width:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h2 style="margin:0;">Müşteri Listesi</h2>
        <div class="crm-hbtns" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:1 1 auto;justify-content:flex-end;min-width:0;">
          <button type="button" class="fsheet-open" style="flex:0 0 auto;" ${act('newCustomer')}>+ Yeni Müşteri</button>
          <input id="crmSearchInput" placeholder="İsim veya telefon ara..." style="flex:0 1 260px;min-width:120px;width:auto;margin:0;" value="${escapeAttr(APP.crmSearch||'')}" ${actOn('input', 'debouncedCrmSearch', ['$value'])}>
          <button type="button" class="ghost-btn" style="width:auto;flex:0 0 auto;white-space:nowrap;margin:0;" ${act('openReviewsSheet')} title="Müşteri değerlendirmeleri">⭐ Değerlendirmeler</button>
          ${canManage(session, 'crm') ? `<button type="button" class="ghost-btn" style="width:auto;flex:0 0 auto;white-space:nowrap;margin:0;" ${act('openPromoSheet')} title="Kupon kodları ve happy hour gibi otomatik kampanyalar">🎟️ Kampanyalar</button>` : ''}
          ${canManage(session, 'crm') ? `<button type="button" class="ghost-btn" style="width:auto;flex:0 0 auto;white-space:nowrap;margin:0;" ${act('openSheet','crmLoySheet')} title="Puan ve doğum günü indirimi ayarları">⭐ Sadakat${loyalty.enabled ? '' : ' (kapalı)'}</button>` : ''}
          <button type="button" class="ghost-btn" style="width:auto;flex:0 0 auto;white-space:nowrap;margin:0;" ${act('exportCustomersCsv')} title="Tüm müşterileri Excel'de açılabilen CSV olarak indir">⬇️ Dışa aktar</button>
          ${canManage(session, 'crm') ? `<button type="button" class="ghost-btn" style="width:auto;flex:0 0 auto;white-space:nowrap;margin:0;" ${act('openCustomerImport')} title="CSV dosyasından müşteri yükle">⬆️ İçe aktar</button>` : ''}
        </div>
      </div>
      <p class="muted" style="font-size:12px;margin:6px 0 10px;text-align:left;">Harcama/ziyaret/doğum günü gibi detaylı analizler için <b>Finansal Analiz &gt; Müşteri Analizleri</b> sekmesine bakın.</p>
      ${rows.length ? `<div class="cu-grid" data-cf-scope="crm">${rows.map((c, i) => { const bd = crmBirthdayInfo(c.birthday), custom = (c.spend_per_point!=null || c.point_value!=null || c.birthday_discount_percent!=null);
        const pts = Number(c.points_balance)||0, tr = crmTier(c), tier = [tr.icon, tr.name, tr.color];
        return `<div class="cu-card" data-cf-tags="${(Number(c.points_balance)||0) > 0 ? 'pts' : ''}${bd && bd.days <= 30 ? ' bday' : ''}${crmTier(c).rank >= 2 ? ' gold' : ''}" style="--i:${Math.min(i,12)};--tc:${tier[2]};">
          <div class="cu-top">${avatarHtml(c.name)}<div class="cu-id"><b>${escapeHtml(c.name)}</b><small>${c.phone ? phoneHtml(c.phone) : 'telefon yok'}</small></div><span class="cu-tier">${tier[0]} ${tier[1]}</span></div>
          <div class="cu-pts"><b>${pts}</b><span>puan</span>${loyalty.enabled && loyalty.point_value ? `<small>≈ ${money(pts * Number(c.point_value ?? loyalty.point_value))} indirim</small>` : ''}</div>
          <div class="pcard-chips">
            ${c.email ? `<span class="pchip">${emailHtml(c.email)}</span>` : ''}
            ${bd ? `<span class="pchip ${bd.soon?'warn':''}">🎂 ${bd.text}</span>` : ''}
            ${custom ? `<span class="pchip" title="${escapeAttr(customerLoyaltySummary(c))}">⭐ Özel sadakat</span>` : ''}
          </div>
          ${c.notes ? `<div class="rv-note">📝 ${escapeHtml(c.notes)}</div>` : ''}
          <div class="pcard-acts"><button type="button" class="pc-btn pc-edit" style="margin-left:0;" ${act('editCustomer', c.id)}>✏️ Düzenle</button><button type="button" class="pc-btn rv-del" style="margin-left:auto;" ${act('removeCustomer', c.id)}>🗑 Sil</button></div>
        </div>`; }).join('')}</div>`
        : '<div class="empty-state"><div style="font-size:42px;">👥</div><p class="muted">Müşteri yok.</p></div>'}
    </div>
    ${sheetHtml('crmSheet', '👤', 'Yeni Müşteri', `<input type="hidden" id="crm_edit_id">
        <div class="fsheet-grid">
          <div class="field-group wide"><label>Ad Soyad</label><input id="crm_name" placeholder="örn. Ahmet Yılmaz"></div>
          <div class="field-group"><label>Telefon</label><input id="crm_phone" placeholder="05xx..." inputmode="tel"></div>
          <div class="field-group"><label>E-posta</label><input id="crm_email" placeholder="opsiyonel" autocapitalize="none"></div>
          <div class="field-group"><label>🎂 Doğum Günü</label><input id="crm_birthday" type="date"></div>
          <div class="field-group"><label>Not</label><input id="crm_notes" placeholder="opsiyonel"></div>
        </div>
        <details id="crmLoyaltyBox" style="margin-top:10px;border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:var(--panel);">
          <summary style="cursor:pointer;font-weight:700;font-size:13.5px;">⭐ Bu müşteriye özel sadakat ayarı <span class="muted" style="font-weight:400;">(boş bırakılan alan genel ayarı kullanır)</span></summary>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px;">
            <div class="field-group"><label>Kaç TL harcamada 1 puan</label><input id="crm_spp" type="number" min="0.01" step="0.01" placeholder="Genel: ${escapeAttr(String(loyalty.spend_per_point ?? ''))}"></div>
            <div class="field-group"><label>1 puan kaç TL indirim</label><input id="crm_pv" type="number" min="0" step="0.01" placeholder="Genel: ${escapeAttr(String(loyalty.point_value ?? ''))}"></div>
            <div class="field-group"><label>🎂 Doğum günü indirimi (%)</label><input id="crm_bdp" type="number" min="0" max="100" step="1" placeholder="Genel: ${escapeAttr(String(loyalty.birthday_discount_percent ?? 0))}"></div>
          </div>
        </details>
        <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','crmSheet')}>Vazgeç</button><button ${act('saveCrmCustomer')}>${ICON_SAVE}<span>Kaydet</span></button></div>`, 'var(--c1)')}
    ${sheetHtml('reviewsSheet', '⭐', 'Müşteri Değerlendirmeleri', '<div id="reviewsBody"><p class="muted">Yükleniyor…</p></div>', 'var(--c3)')}
    ${canManage(session, 'crm') ? sheetHtml('promoSheet', '🎟️', 'Kampanya ve Kuponlar', '<div id="promoBody"><p class="muted">Yükleniyor…</p></div>', 'var(--c4)') : ''}
    ${canManage(session, 'crm') ? sheetHtml('crmLoySheet', '⭐', 'Sadakat Programı', `<label style="display:flex;align-items:center;gap:8px;font-weight:600;margin:0 0 14px;">
          <input type="checkbox" id="loy_enabled" ${loyalty.enabled?'checked':''} style="width:auto;margin:0;"> Sadakat puanları aktif
        </label>
        <div class="fsheet-grid">
          <div class="field-group"><label>Kaç TL harcamada 1 puan</label><input id="loy_spend" type="number" min="1" step="0.01" value="${loyalty.spend_per_point}"></div>
          <div class="field-group"><label>1 puan kaç TL indirim</label><input id="loy_value" type="number" min="0" step="0.01" value="${loyalty.point_value}"></div>
          <div class="field-group wide"><label>🎂 Doğum günü indirimi (%)</label><input id="loy_birthday_pct" type="number" min="0" max="100" step="1" value="${loyalty.birthday_discount_percent||0}"></div>
        </div>
        <p class="muted" style="font-size:12px;margin:10px 0 0;text-align:left;">Müşterinin doğum günü kaydedilmişse, o gün ödeme alırken bu yüzde otomatik indirim olarak uygulanır (0 = kapalı).</p>
        <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','crmLoySheet')}>Vazgeç</button><button ${act('saveLoyaltySettings')}>${ICON_SAVE}<span>Kaydet</span></button></div>
        <div class="tier-box">
          <div class="rvf-t">🏆 Sadakat seviyeleri</div>
          <p class="muted" style="font-size:12px;margin:0 0 10px;text-align:left;">Seviye, müşterinin <b>toplam kazandığı</b> puana göre belirlenir (puan harcanınca düşmez). <b>Çarpan</b>: o seviyedeki müşteri her harcamada kaç kat puan kazanır (örn. 1,5). <b>İndirim</b>: ödeme ekranında müşteri seçilince otomatik uygulanır.</p>
          <div id="tierRows">${tierRowsHtml()}</div>
          <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('addTierRow')}>+ Seviye ekle</button><button ${act('saveLoyaltyTiers')}>🏆 Seviyeleri Kaydet</button></div>
        </div>`, 'var(--c3)') : ''}`;
}
/* Sadakat seviyesi: yaşam boyu kazanılan puana göre (puan harcanınca seviye düşmez).
   Seviyeler Müşteriler > ⭐ Sadakat'tan düzenlenir; puan çarpanı sunucuda uygulanır. */
const TIER_COLORS = ['var(--c1)', 'var(--c3)', 'var(--c2)', 'var(--c4)', '#a855f7', '#ef4444'];
function crmTiers(){
  const t = (APP.config && APP.config.loyalty && APP.config.loyalty.tiers) || [{ name:'Gümüş', icon:'🥈', min:50, mult:1, disc:0 }, { name:'Altın', icon:'🥇', min:200, mult:1, disc:0 }, { name:'Elmas', icon:'💎', min:500, mult:1, disc:0 }];
  return t.slice().sort((a, b) => Number(a.min) - Number(b.min));
}
function crmTier(c){
  const lp = Number(c.lifetime_points != null ? c.lifetime_points : c.points_balance) || 0, ts = crmTiers();
  let idx = -1; ts.forEach((t, i) => { if(lp >= Number(t.min)) idx = i; });
  if(idx < 0) return { rank: 0, icon: '🌱', name: 'Yeni', color: '#94a3b8', mult: 1, disc: 0 };
  const t = ts[idx]; return { rank: idx + 1, icon: t.icon || '⭐', name: t.name, color: TIER_COLORS[idx % TIER_COLORS.length], mult: Number(t.mult) || 1, disc: Number(t.disc) || 0 };
}
function tierRowsHtml(){
  return crmTiers().map((t, i) => `<div class="tier-row" data-ti="${i}">
    <input class="ti-icon" value="${escapeAttr(t.icon||'⭐')}" maxlength="4" title="Simge">
    <input class="ti-name" value="${escapeAttr(t.name)}" placeholder="Seviye adı">
    <label>Puan ≥<input class="ti-min" type="number" min="0" step="1" value="${Number(t.min)}"></label>
    <label>Çarpan<input class="ti-mult" type="number" min="1" max="5" step="0.05" value="${Number(t.mult)||1}"></label>
    <label>İndirim %<input class="ti-disc" type="number" min="0" max="50" step="1" value="${Number(t.disc)||0}"></label>
    <button type="button" class="pc-btn rv-del" ${act('removeTierRow', '$this')}>✕</button></div>`).join('');
}
function addTierRow(){
  const box = document.getElementById('tierRows'); if(!box || box.children.length >= 6) return;
  box.insertAdjacentHTML('beforeend', `<div class="tier-row"><input class="ti-icon" value="⭐" maxlength="4"><input class="ti-name" placeholder="Seviye adı"><label>Puan ≥<input class="ti-min" type="number" min="0" step="1" value="1000"></label><label>Çarpan<input class="ti-mult" type="number" min="1" max="5" step="0.05" value="1"></label><label>İndirim %<input class="ti-disc" type="number" min="0" max="50" step="1" value="0"></label><button type="button" class="pc-btn rv-del" ${act('removeTierRow', '$this')}>✕</button></div>`);
}
function removeTierRow(btn){ const r = btn.closest('.tier-row'); if(r) r.remove(); }
async function saveLoyaltyTiers(){
  const tiers = [...document.querySelectorAll('#tierRows .tier-row')].map((r, i) => ({ key: 't' + i, icon: r.querySelector('.ti-icon').value.trim() || '⭐', name: r.querySelector('.ti-name').value.trim(),
    min: Number(r.querySelector('.ti-min').value) || 0, mult: Number(r.querySelector('.ti-mult').value) || 1, disc: Number(r.querySelector('.ti-disc').value) || 0 }));
  if(tiers.some(t => !t.name)){ alert('Seviye adı boş olamaz'); return; }
  const { error } = await sb.rpc('update_loyalty_tiers', { p_token: getSession().session_token, p_tiers: tiers });
  if(error){ alert(error.message); return; }
  APP.config.loyalty = Object.assign({}, APP.config.loyalty, { tiers });
  closeSheet('crmLoySheet');
  renderCrmView(document.getElementById('main'), getSession());
  showToast('Sadakat seviyeleri kaydedildi ✓');
}
function crmBirthdayInfo(b){
  if(!b) return null; const d = new Date(b+'T00:00'); if(isNaN(d)) return null;
  const now = new Date(), t = new Date(now.getFullYear(), now.getMonth(), now.getDate()); let n = new Date(t.getFullYear(), d.getMonth(), d.getDate()); if(n < t) n.setFullYear(n.getFullYear()+1);
  const days = Math.round((n - t)/86400000);
  return { days, soon: days <= 7, text: days===0 ? 'Bugün doğum günü!' : days<=30 ? days+' gün sonra' : d.toLocaleDateString('tr-TR',{day:'numeric',month:'long'}) };
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
function newCustomer(){
  ['crm_edit_id','crm_name','crm_phone','crm_email','crm_notes','crm_birthday','crm_spp','crm_pv','crm_bdp'].forEach(k => { const e = document.getElementById(k); if(e) e.value = ''; });
  const b = document.getElementById('crmLoyaltyBox'); if(b) b.open = false;
  document.getElementById('crmSheetTitle').textContent = 'Yeni Müşteri';
  openSheet('crmSheet');
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
  document.getElementById('crmSheetTitle').textContent = 'Müşteriyi Düzenle';
  openSheet('crmSheet');
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
  closeSheet('crmSheet');
  renderCrmView(document.getElementById('main'), session);
  showToast(id ? 'Güncellendi ✓' : 'Müşteri eklendi ✓');
}
async function removeCustomer(id){
  if(!await uiConfirm('Bu müşteriyi silmek istediğinize emin misiniz?')) return;
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
  closeSheet('crmLoySheet');
  renderCrmView(document.getElementById('main'), session);
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
    <p class="muted" style="font-size:12.5px;margin:0 0 10px;">Excel'de listenizi <b>Farklı Kaydet → CSV (UTF-8)</b> olarak kaydedip seçin. Sütunlar: <b>Ad Soyad</b> (zorunlu), Telefon, E-posta, Doğum Günü (GG.AA.YYYY), Not, Puan. <button type="button" ${act('downloadCustomerTemplate')} style="background:none;border:none;padding:0;margin:0;width:auto;color:var(--accent);text-decoration:underline;cursor:pointer;font:inherit;">Örnek şablonu indir</button></p>
    <input type="file" id="crmImportFile" accept=".csv,text/csv,text/plain" ${actOn('change', 'previewCustomerImport', ['$file'])} style="margin:0 0 10px;">
    <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:0 0 10px;"><input type="checkbox" id="crmImportUpdate" checked style="width:auto;margin:0;"> Telefonu eşleşen mevcut müşterileri güncelle</label>
    <div id="crmImportPreview" class="muted" style="font-size:12.5px;"></div>
    <div style="display:flex;gap:10px;margin-top:12px;">
      <button type="button" class="ghost-btn" style="flex:1;margin:0;" ${act('removeEl', 'crmImportBg')}>Kapat</button>
      <button type="button" id="crmImportBtn" style="flex:1;margin:0;" disabled ${act('runCustomerImport')}>İçe aktar</button>
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

/* ---- Kampanya ve kuponlar ----
   'coupon': ödeme ekranında kodla uygulanır. 'auto': belirlenen gün/saatte ödeme ekranında
   tek tıkla önerilir (örn. happy hour). Kullanımlar redeem_promotion ile sayılır. */
const PROMO_DAYS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
async function openPromoSheet(){
  openSheet('promoSheet');
  APP.promoEdit = null;
  await renderPromoBody();
}
async function renderPromoBody(){
  const body = document.getElementById('promoBody'); if(!body) return;
  const { data, error } = await sb.rpc('list_promotions', { p_token: getSession().session_token });
  if(error){ body.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  APP.promos = data || [];
  const e = APP.promoEdit || { kind:'coupon', disc_type:'percent', days:[] };
  const val = (k) => e[k] == null ? '' : escapeAttr(String(e[k]));
  const t5 = (v) => v ? String(v).slice(0,5) : '';
  const descr = (p) => [p.disc_type==='percent' ? '%' + Number(p.disc_value) : money(p.disc_value), p.min_total > 0 ? 'min ' + money(p.min_total) : '',
    p.days && p.days.length ? p.days.map(d => PROMO_DAYS[d-1]).join(',') : '', p.hour_from && p.hour_to ? t5(p.hour_from) + '–' + t5(p.hour_to) : '',
    p.ends_on ? '→ ' + fmtDateTr(p.ends_on) : '', p.max_uses ? p.used_count + '/' + p.max_uses + ' kullanım' : p.used_count + ' kullanım'].filter(Boolean).join(' · ');
  body.innerHTML = `
    ${APP.promos.length ? `<div class="pr-list">${APP.promos.map(p => `<div class="pr-card ${p.valid_now ? 'live' : ''} ${p.active ? '' : 'off'}">
        <div class="pr-top"><span class="pr-kind">${p.kind==='coupon' ? '🎟️' : '🎉'}</span><div class="pr-id"><b>${escapeHtml(p.name)}</b>${p.code ? `<code>${escapeHtml(p.code)}</code>` : '<small>Otomatik kampanya</small>'}</div>
          <span class="pr-st">${!p.active ? '⏸ Pasif' : p.valid_now ? '● Şu an geçerli' : '○ Zamanı değil'}</span></div>
        <div class="pr-desc">${descr(p)}${Number(p.total_discount) > 0 ? ' · toplam ' + money(p.total_discount) + ' indirim' : ''}</div>
        <div class="pr-acts"><button type="button" class="pc-btn pc-edit" style="margin-left:0;" ${act('editPromo', p.id)}>✏️ Düzenle</button>
          <button type="button" class="pc-btn" ${act('togglePromoActive', p.id)}>${p.active ? '⏸ Durdur' : '▶ Başlat'}</button>
          <button type="button" class="pc-btn rv-del" style="margin-left:auto;" ${act('removePromo', p.id)}>🗑</button></div>
      </div>`).join('')}</div>` : `<div class="empty-state rv-empty"><div class="om-empty-ic">🎟️</div><b>Henüz kampanya yok</b><p class="muted">Aşağıdan ilk kuponunuzu ya da happy hour kampanyanızı oluşturun.</p></div>`}
    <div class="pr-form">
      <div class="rvf-t">${e.id ? '✏️ Kampanyayı düzenle' : '➕ Yeni kampanya'}</div>
      <div class="rvf-chips"><button type="button" class="rvf-chip ${e.kind==='coupon'?'on':''}" ${act('setPromoKind','coupon')}>🎟️ Kupon kodu</button><button type="button" class="rvf-chip ${e.kind==='auto'?'on':''}" ${act('setPromoKind','auto')}>🎉 Otomatik (happy hour)</button></div>
      <div class="fsheet-grid" style="margin-top:10px;">
        <div class="field-group"><label>Kampanya adı</label><input id="pr_name" value="${val('name')}" placeholder="${e.kind==='coupon' ? 'örn. Hoş geldin indirimi' : 'örn. Happy Hour'}"></div>
        ${e.kind==='coupon' ? `<div class="field-group"><label>Kupon kodu</label><input id="pr_code" value="${val('code')}" placeholder="örn. HOSGELDIN10" style="text-transform:uppercase;"></div>` : '<div></div>'}
        <div class="field-group"><label>İndirim</label><div style="display:flex;gap:6px;"><input id="pr_value" type="number" min="0" step="0.01" value="${val('disc_value')}" style="flex:1;"><select id="pr_type" style="width:70px;"><option value="percent" ${e.disc_type==='percent'?'selected':''}>%</option><option value="amount" ${e.disc_type==='amount'?'selected':''}>₺</option></select></div></div>
        <div class="field-group"><label>En az harcama (₺)</label><input id="pr_min" type="number" min="0" step="0.01" value="${Number(e.min_total)||''}" placeholder="yok"></div>
        <div class="field-group"><label>Başlangıç</label><input id="pr_start" type="date" value="${val('starts_on')}"></div>
        <div class="field-group"><label>Bitiş</label><input id="pr_end" type="date" value="${val('ends_on')}"></div>
        <div class="field-group"><label>Saat başlangıç</label><input id="pr_hfrom" type="time" value="${t5(e.hour_from)}"></div>
        <div class="field-group"><label>Saat bitiş</label><input id="pr_hto" type="time" value="${t5(e.hour_to)}"></div>
        <div class="field-group wide"><label>Günler (boş = her gün)</label><div class="rvf-chips" id="pr_days">${PROMO_DAYS.map((d, i) => `<button type="button" class="rvf-chip rvf-n ${(e.days||[]).includes(i+1)?'on':''}" data-d="${i+1}" ${act('togglePromoDay','$this')}>${d}</button>`).join('')}</div></div>
        <div class="field-group"><label>Kullanım limiti</label><input id="pr_max" type="number" min="1" step="1" value="${val('max_uses')}" placeholder="sınırsız"></div>
      </div>
      <div class="fsheet-foot">${e.id ? `<button type="button" class="ghost-btn" ${act('newPromo')}>Vazgeç</button>` : ''}<button ${act('savePromo')}>💾 ${e.id ? 'Güncelle' : 'Kampanyayı Kaydet'}</button></div>
    </div>`;
}
function promoFormState(){
  const g = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  return Object.assign({}, APP.promoEdit || { kind:'coupon' }, { name: g('pr_name'), code: g('pr_code'), disc_value: g('pr_value'), disc_type: g('pr_type') || 'percent',
    min_total: g('pr_min'), starts_on: g('pr_start'), ends_on: g('pr_end'), hour_from: g('pr_hfrom'), hour_to: g('pr_hto'), max_uses: g('pr_max'),
    days: [...document.querySelectorAll('#pr_days .rvf-chip.on')].map(b => Number(b.dataset.d)) });
}
function setPromoKind(k){ APP.promoEdit = Object.assign(promoFormState(), { kind: k }); renderPromoBody(); }
function togglePromoDay(btn){ btn.classList.toggle('on'); }
function newPromo(){ APP.promoEdit = null; renderPromoBody(); }
function editPromo(id){ const p = (APP.promos||[]).find(x => x.id === id); if(!p) return; APP.promoEdit = Object.assign({}, p, { days: p.days || [] }); renderPromoBody().then(() => { const f = document.querySelector('.pr-form'); if(f) f.scrollIntoView({ behavior:'smooth', block:'start' }); }); }
async function savePromo(){
  const st = promoFormState();
  if(!st.name.trim()){ alert('Kampanya adı gerekli'); return; }
  if(st.kind === 'coupon' && !String(st.code||'').trim()){ alert('Kupon kodu gerekli'); return; }
  if(!(Number(st.disc_value) > 0)){ alert('İndirim değeri girin'); return; }
  if(st.kind === 'auto' && !st.hour_from && !(st.days||[]).length && !st.starts_on){ if(!await uiConfirm('Gün/saat seçmediniz: kampanya her ödemede önerilecek. Devam edilsin mi?')) return; }
  const payload = { id: st.id || '', name: st.name, kind: st.kind, code: st.code || '', disc_type: st.disc_type, disc_value: st.disc_value, min_total: st.min_total,
    starts_on: st.starts_on, ends_on: st.ends_on, hour_from: st.hour_from, hour_to: st.hour_to, max_uses: st.max_uses, days: st.days, active: st.active == null ? true : st.active };
  const { error } = await sb.rpc('upsert_promotion', { p_token: getSession().session_token, p_data: payload });
  if(error){ alert(error.message); return; }
  APP.promoEdit = null; showToast('Kampanya kaydedildi ✓'); renderPromoBody();
}
async function togglePromoActive(id){
  const p = (APP.promos||[]).find(x => x.id === id); if(!p) return;
  const { error } = await sb.rpc('upsert_promotion', { p_token: getSession().session_token, p_data: Object.assign({}, p, { active: !p.active, days: p.days || [] }) });
  if(error){ alert(error.message); return; }
  renderPromoBody();
}
async function removePromo(id){
  if(!await uiConfirm('Bu kampanya silinsin mi?')) return;
  const { error } = await sb.rpc('delete_promotion', { p_token: getSession().session_token, p_id: id });
  if(error){ alert(error.message); return; }
  renderPromoBody();
}

/* ---- Müşteri değerlendirmeleri ----
   Ödeme sonrası QR/SMS ile gönderilen linkten gelen puan ve yorumlar. Açılınca düşük puan rozeti temizlenir. */
async function openReviewsSheet(){ openSheet('reviewsSheet'); APP.reviewDays = APP.reviewDays || 30; await renderReviewsBody(); }
function setReviewDays(d){ APP.reviewDays = d; renderReviewsBody(); }
async function renderReviewsBody(){
  const body = document.getElementById('reviewsBody'); if(!body) return;
  const session = getSession();
  const { data, error } = await sb.rpc('list_reviews', { p_token: session.session_token, p_days: APP.reviewDays });
  if(error){ body.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  const st = data.stats || {}, rows = data.rows || [], dist = st.dist || [0,0,0,0,0], max = Math.max(1, ...dist);
  const f = APP.reviewFilter || 'all', shown = f==='low' ? rows.filter(r => r.rating <= 3) : f==='high' ? rows.filter(r => r.rating >= 4) : rows;
  const stars = (n) => '<span class="rvw-st">' + '★'.repeat(n) + '<i>' + '★'.repeat(5-n) + '</i></span>';
  body.innerHTML = `<div class="rvf-chips" style="margin-bottom:12px;">${[[7,'7 gün'],[30,'30 gün'],[90,'90 gün']].map(([d, l]) => `<button type="button" class="rvf-chip ${APP.reviewDays===d?'on':''}" ${act('setReviewDays', d)}>${l}</button>`).join('')}</div>
    <div class="rvw-sum">
      <div class="rvw-avg"><b>${st.n ? Number(st.avg).toLocaleString('tr-TR') : '—'}</b>${stars(Math.round(Number(st.avg)||0))}<small>${st.n||0} değerlendirme · ${st.sent||0} link</small></div>
      <div class="rvw-dist">${[5,4,3,2,1].map(n => `<div class="rvw-row"><span>${n}★</span><div class="rvw-bar"><i style="width:${dist[n-1]/max*100}%;"></i></div><b>${dist[n-1]}</b></div>`).join('')}</div>
    </div>
    <div class="rvf-chips" style="margin:12px 0;">${[['all','Tümü'],['low','😞 1-3 yıldız'],['high','🤩 4-5 yıldız']].map(([k, l]) => `<button type="button" class="rvf-chip ${f===k?'on':''}" ${act('setReviewFilter', k)}>${l}</button>`).join('')}</div>
    ${shown.length ? `<div class="rvw-list">${shown.map(r => `<div class="rvw-card ${r.rating <= 3 ? 'low' : ''} ${r.seen ? '' : 'new'}">
        <div class="rvw-top">${stars(r.rating)}<small>${new Date(r.rated_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}</small></div>
        ${r.comment ? `<p>“${escapeHtml(r.comment)}”</p>` : '<p class="muted">Yorum yazılmadı</p>'}
        <div class="pcard-chips">${r.customer_name ? `<span class="pchip">👤 ${escapeHtml(r.customer_name)}</span>` : ''}${r.customer_phone ? `<span class="pchip">${phoneHtml(r.customer_phone)}</span>` : ''}${r.table_name ? `<span class="pchip">🪑 ${escapeHtml(r.table_name)}</span>` : ''}${r.staff ? `<span class="pchip">🧑‍🍳 ${escapeHtml(r.staff)}</span>` : ''}</div>
      </div>`).join('')}</div>` : `<div class="empty-state rv-empty"><div class="om-empty-ic">⭐</div><b>Henüz değerlendirme yok</b><p class="muted">Ödeme alındıktan sonra çıkan <b>⭐ Değerlendirme QR</b> ya da <b>📱 SMS ile iste</b> ile müşteriden puan isteyin.</p></div>`}`;
  if(rows.some(r => !r.seen)){ await sb.rpc('mark_reviews_seen', { p_token: session.session_token }); refreshNavBadges(); }
}
function setReviewFilter(k){ APP.reviewFilter = k; renderReviewsBody(); }
