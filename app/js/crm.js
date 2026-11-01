/* CRM / Sadakat - app/index.html'den çıkarıldı. Klasik <script src>. */
/* ================= CRM / SADAKAT ================= */
async function renderCrmView(main, session){
  if(!APP.config){ const { data } = await withLoadingOverlay(sb.rpc('get_restaurant_config', { p_token: session.session_token })); if(data) APP.config = data; }
  const { data, error } = await withLoadingOverlay(sb.rpc('list_customers', { p_token: session.session_token, p_search: APP.crmSearch||null }));
  const rows = error ? [] : (data||[]);
  APP.crmRows = rows;
  const loyalty = (APP.config && APP.config.loyalty) || { enabled:false, spend_per_point:10, point_value:1, birthday_discount_percent:0 };
  const bdays = rows.filter(c => { const b = crmBirthdayInfo(c.birthday); return b && b.days <= 30; }).length;
  main.innerHTML = `<h1>Müşteriler</h1>
    ${statChips([['👥', rows.length, APP.crmSearch ? 'Aramada bulunan' : 'Kayıtlı müşteri', 'var(--c1)', 'all'], ['⭐', rows.reduce((x, c) => x + (Number(c.points_balance)||0), 0), 'Toplam puan', 'var(--c3)', 'pts'],
      ['🎂', bdays, '30 gün içinde doğum günü', 'var(--c2)', 'bday'], ['💎', rows.filter(c => crmTier(c).rank >= 2).length, (crmTiers()[1] ? crmTiers()[1].name : 'Altın') + ' ve üstü müşteri', 'var(--c4)', 'gold']], '', 'crm')}
    ${typeof crmBirthdayStripHtml === 'function' ? crmBirthdayStripHtml(rows) : ''}
    ${crmVisualsHtml(rows)}
    <div class="u-mwn box">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h2 class="u-m0">Müşteri Listesi</h2>
        <div class="crm-hbtns" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:1 1 auto;justify-content:flex-end;min-width:0;">
          <button type="button" class="fsheet-open" style="flex:0 0 auto;" ${act('newCustomer')}>+ Yeni Müşteri</button>
          ${canManage(session, 'crm') ? `<button type="button" class="ghost-btn" style="width:auto;flex:0 0 auto;white-space:nowrap;margin:0;" ${act('openWinback', 0)} title="Tüm müşterilere, son gelenlere ya da bir süredir gelmeyenlere SMS / e-posta">📣 Kampanya & Geri Kazanım</button>` : ''}
          <input id="crmSearchInput" type="search" name="crm-list-search" autocomplete="off" data-lpignore="true" placeholder="İsim veya telefon ara..." style="flex:0 1 260px;min-width:120px;width:auto;margin:0;" value="${escapeAttr(APP.crmSearch||'')}" ${actOn('input', 'debouncedCrmSearch', ['$value'])}>
          ${canManage(session, 'crm') ? `<button type="button" class="ghost-btn" style="width:auto;flex:0 0 auto;white-space:nowrap;margin:0;" ${act('openSheet','crmLoySheet')} title="Puan ve doğum günü indirimi ayarları">⭐ Sadakat${loyalty.enabled ? '' : ' (kapalı)'}</button>` : ''}
          <button type="button" class="ghost-btn" style="width:auto;flex:0 0 auto;white-space:nowrap;margin:0;" ${act('exportCustomersCsv')} title="Tüm müşterileri Excel (.xlsx) olarak indir">⬇️ Dışa aktar</button>
          ${canManage(session, 'crm') ? `<button type="button" class="ghost-btn" style="width:auto;flex:0 0 auto;white-space:nowrap;margin:0;" ${act('openCustomerImport')} title="Excel (.xlsx) veya CSV dosyasından müşteri yükle">⬆️ İçe aktar</button>
          <button type="button" class="xl-link" style="flex:0 0 auto;" ${act('downloadCustomerTemplate')}>📄 Şablon indir</button>` : ''}
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
            ${bd ? (bd.days === 0 ? `<span class="pchip bd-today-chip">🎂 Bugün doğum günü! 🎉</span>` : `<span class="pchip ${bd.soon?'warn':''}">🎂 ${bd.text}</span>`) : ''}
            ${custom ? `<span class="pchip" title="${escapeAttr(customerLoyaltySummary(c))}">⭐ Özel sadakat</span>` : ''}
          </div>
          ${c.notes ? `<div class="rv-note">📝 ${escapeHtml(c.notes)}</div>` : ''}
          <div class="pcard-acts"><button type="button" class="pc-btn pc-edit" style="margin-left:0;" ${act('editCustomer', c.id)}>✏️ Düzenle</button><button type="button" class="pc-btn rv-del" style="margin-left:auto;" ${act('removeCustomer', c.id)}>🗑 Sil</button></div>
        </div>`; }).join('')}</div>`
        : '<div class="empty-state"><div style="font-size:42px;">👥</div><p class="muted">Müşteri yok.</p></div>'}
    </div>
    ${sheetHtml('crmSheet', '👤', 'Yeni Müşteri', `<input type="hidden" id="crm_edit_id"><div id="crm_audit" class="crm-audit" hidden></div>
        <div class="fsheet-grid">
          <div class="field-group wide"><label>Ad Soyad</label><input id="crm_name" name="name" autocomplete="name" placeholder="örn. Ahmet Yılmaz"></div>
          <div class="field-group"><label>Telefon</label><input id="crm_phone" name="tel" type="tel" autocomplete="tel" placeholder="05xx..." inputmode="tel"></div>
          <div class="field-group"><label>E-posta</label><input id="crm_email" name="email" type="email" autocomplete="email" placeholder="opsiyonel" autocapitalize="none"></div>
          <div class="field-group"><label>🎂 Doğum Günü</label><input id="crm_birthday" type="date"></div>
          <div class="field-group"><label>Not</label><input id="crm_notes" placeholder="opsiyonel"></div>
          <div class="field-group wide"><label>📍 Adres</label><textarea id="crm_address" name="street-address" autocomplete="street-address" rows="2" placeholder="örn. Atatürk Cad. No:12 D:4 — paket siparişte otomatik dolar" style="resize:vertical;min-height:44px;"></textarea></div>
        </div>
        <details id="crmLoyaltyBox" style="margin-top:10px;border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:var(--panel);">
          <summary style="cursor:pointer;font-weight:700;font-size:13.5px;">⭐ Bu müşteriye özel sadakat ayarı <span class="u-fw4 muted">(boş bırakılan alan genel ayarı kullanır)</span></summary>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px;">
            <div class="field-group"><label>Kaç TL harcamada 1 puan</label><input id="crm_spp" type="number" min="0.01" step="0.01" placeholder="Genel: ${escapeAttr(String(loyalty.spend_per_point ?? ''))}"></div>
            <div class="field-group"><label>1 puan kaç TL indirim</label><input id="crm_pv" type="number" min="0" step="0.01" placeholder="Genel: ${escapeAttr(String(loyalty.point_value ?? ''))}"></div>
            <div class="field-group"><label>🎂 Doğum günü indirimi (%)</label><input id="crm_bdp" type="number" min="0" max="100" step="1" placeholder="Genel: ${escapeAttr(String(loyalty.birthday_discount_percent ?? 0))}"></div>
          </div>
        </details>
        <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','crmSheet')}>Vazgeç</button><button ${act('saveCrmCustomer')}>${ICON_SAVE}<span>Kaydet</span></button></div>`, 'var(--c1)')}
    ${canManage(session, 'crm') ? sheetHtml('crmLoySheet', '⭐', 'Sadakat Programı', `<label style="display:flex;align-items:center;gap:8px;font-weight:600;margin:0 0 14px;">
          <input type="checkbox" id="loy_enabled" ${loyalty.enabled?'checked':''} class="u-wa-m0"> Sadakat puanları aktif
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
/* Müşteri seviyeleri halka grafiği + en çok puanı olanlar (göz atınca okunur özet). */
/* Müşteri ekranı kayıt odaklı: bilgileri eksik müşteriler ve kayıt doluluğu. Seviye/puan analizi Finansal Analiz > Müşteri Yolculuğu'nda. */
function crmVisualsHtml(rows){
  if(!rows.length || APP.crmSearch) return '';
  const withPhone = rows.filter(c => c.phone).length, withMail = rows.filter(c => c.email).length, withBd = rows.filter(c => c.birthday).length;
  const ring = (v, l, c, i) => { const p = rows.length ? Math.round(v / rows.length * 100) : 0; return `<div class="gx-ring" style="--p:${p};--c:${c};--i:${i};"><div class="gx-ring-c"><b>%${p}</b></div><small>${l}</small><em>${v} / ${rows.length}</em></div>`; };
  const miss = rows.map(c => ({ c, m: [!c.phone && '📞 telefon', !c.birthday && '🎂 doğum günü', !c.email && '✉️ e-posta'].filter(Boolean) })).filter(x => x.m.length).sort((a, b) => b.m.length - a.m.length);
  const recent = rows.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5);
  return `<div class="ch-row crm-vis">
    <div class="fs-panel pa-sec" style="--t:var(--c2);"><h3><i>📇</i>Kayıt Doluluğu</h3><div class="gx-rings">${ring(withPhone, 'Telefon', '#22c55e', 0)}${ring(withMail, 'E-posta', 'var(--accent)', 1)}${ring(withBd, 'Doğum günü', '#ec4899', 2)}</div>
      <p class="fs-note">Doğum günü ve telefonu girilen müşterilere otomatik indirim ve SMS gönderilebilir.</p></div>
    <div class="fs-panel pa-sec" style="--t:#f59e0b;"><h3><i>✍️</i>Bilgisi Eksik Müşteriler <small class="muted">· ${miss.length}</small></h3>
      ${miss.length ? `<div class="crm-miss">${miss.slice(0, 6).map(x => `<button type="button" class="crm-miss-r" ${act('editCustomer', x.c.id)}><b>${escapeHtml(x.c.name || '')}</b><span>${x.m.map(t => `<em>${t}</em>`).join('')}</span><i>✏️</i></button>`).join('')}</div>` : '<p class="muted">Tüm müşterilerin bilgileri tam 👍</p>'}</div>
    <div class="fs-panel pa-sec" style="--t:var(--c1);"><h3><i>🆕</i>Son Eklenenler</h3>
      <div class="crm-miss">${recent.map(c => `<button type="button" class="crm-miss-r" ${act('editCustomer', c.id)}><b>${escapeHtml(c.name || '')}</b><span><em>${c.created_at ? new Date(c.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : ''}</em></span><i>✏️</i></button>`).join('')}</div>
      <p class="fs-note">Seviye ve puan analizleri: Finansal Analiz › Müşteri Yolculuğu.</p></div>
  </div>`;
}
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
  // Tarayıcının otomatik doldurması müşteri formu açıkken arama kutusunu da doldurabiliyor: form açıkken arama yapılmaz
  // (yoksa liste yeniden çizilip açık form kapanıyor, ekran kilitli kalıyordu).
  const sh = document.getElementById('crmSheet');
  if(sh && sh.classList.contains('open')){ const inp = document.getElementById('crmSearchInput'); if(inp) inp.value = APP.crmSearch || ''; return; }
  APP.crmSearch = v;
  clearTimeout(CRM_SEARCH_TIMER);
  CRM_SEARCH_TIMER = setTimeout(async () => {
    await renderCrmView(document.getElementById('main'), getSession());
    if(!document.querySelector('.fsheet.open')) document.body.classList.remove('fsheet-lock');
    const inp = document.getElementById('crmSearchInput');
    if(inp){ inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }, 350);
}
function newCustomer(){
  ['crm_edit_id','crm_name','crm_phone','crm_email','crm_notes','crm_birthday','crm_address','crm_spp','crm_pv','crm_bdp'].forEach(k => { const e = document.getElementById(k); if(e) e.value = ''; });
  const b = document.getElementById('crmLoyaltyBox'); if(b) b.open = false;
  document.getElementById('crmSheetTitle').textContent = 'Yeni Müşteri';
  { const a = document.getElementById('crm_audit'); if(a) a.hidden = true; }
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
  document.getElementById('crm_address').value = c.address||'';
  document.getElementById('crm_spp').value = c.spend_per_point ?? '';
  document.getElementById('crm_pv').value = c.point_value ?? '';
  document.getElementById('crm_bdp').value = c.birthday_discount_percent ?? '';
  document.getElementById('crmLoyaltyBox').open = (c.spend_per_point!=null || c.point_value!=null || c.birthday_discount_percent!=null);
  document.getElementById('crmSheetTitle').textContent = 'Müşteriyi Düzenle';
  // Kaydeden ve son değiştiren personel
  const au = document.getElementById('crm_audit'), d = (x) => x ? new Date(x).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  if(au){ au.innerHTML = `<span>🆕 Kaydeden: <b>${escapeHtml(c.created_by_name || 'bilinmiyor')}</b>${c.created_at ? ' · ' + d(c.created_at) : ''}</span>${c.info_updated_at ? `<span>✏️ Son değiştiren: <b>${escapeHtml(c.updated_by_name || 'bilinmiyor')}</b> · ${d(c.info_updated_at)}</span>` : ''}`; au.hidden = false; }
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
  APP.birthdays = null; // doğum günü listesi yeniden yüklensin
  const custId = id || savedId;
  if(custId){
    const addr = (document.getElementById('crm_address') || {}).value || '';
    const c0 = (APP.crmRows||[]).find(x => x.id===custId);
    if(addr.trim() !== ((c0 && c0.address) || '')){ const { error: ea } = await sb.rpc('set_customer_address', { p_token: session.session_token, p_id: custId, p_address: addr }); if(ea) alert('Müşteri kaydedildi ama adres kaydedilemedi: ' + ea.message); }
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
  if(typeof xlDownload === 'function') await xlDownload('musteriler-' + todayLocalDateStr() + '.xlsx', 'Müşteriler', rows[0], rows.slice(1), [24, 16, 26, 12, 24, 8, 8, 14, 12, 12]);
  else downloadCsv('musteriler-' + todayLocalDateStr() + '.csv', rows);
  showToast((data||[]).length + ' müşteri dışa aktarıldı ✓');
}
function downloadCustomerTemplate(){
  const head = CRM_CSV_COLS.map(c => c[1]), ex = [['Ahmet Yılmaz','0532 123 45 67','ahmet@ornek.com','15.04.1990','Cam kenarı sever','0'], ['Ayşe Demir','0555 987 65 43','','02.11.1988','','150']];
  if(typeof xlDownload === 'function') xlDownload('musteri-sablonu.xlsx', 'Müşteriler', head, ex, [24, 16, 26, 12, 24, 8]);
  else downloadCsv('musteri-sablonu.csv', [head, ...ex]);
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
    <h3 class="u-mb8">⬆️ Müşteri içe aktar</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 10px;">Excel dosyanızı (<b>.xlsx</b>) ya da CSV'yi doğrudan seçin. Sütunlar: <b>Ad Soyad</b> (zorunlu), Telefon, E-posta, Doğum Günü (GG.AA.YYYY), Not, Puan. <button type="button" ${act('downloadCustomerTemplate')} style="background:none;border:none;padding:0;margin:0;width:auto;color:var(--accent);text-decoration:underline;cursor:pointer;font:inherit;">Örnek şablonu indir</button></p>
    <input type="file" id="crmImportFile" accept=".xlsx,.xls,.csv,text/csv,text/plain" ${actOn('change', 'previewCustomerImport', ['$file'])} class="u-mb10">
    <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:0 0 10px;"><input type="checkbox" id="crmImportUpdate" checked class="u-wa-m0"> Telefonu eşleşen mevcut müşterileri güncelle</label>
    <div id="crmImportPreview" class="u-fs125 muted"></div>
    <div style="display:flex;gap:10px;margin-top:12px;">
      <button type="button" class="u-f1-m0 ghost-btn" ${act('removeEl', 'crmImportBg')}>Kapat</button>
      <button type="button" id="crmImportBtn" class="u-f1-m0" disabled ${act('runCustomerImport')}>İçe aktar</button>
    </div></div>`;
  document.body.appendChild(ov);
}
async function previewCustomerImport(file){
  const box = document.getElementById('crmImportPreview'), btn = document.getElementById('crmImportBtn');
  APP.crmImportRows = null; btn.disabled = true;
  if(!file) return;
  let rows;
  if(/\.xlsx?$/i.test(file.name)){
    try{ const X = await loadXlsx(); const wb = X.read(await file.arrayBuffer(), { type: 'array' });
      rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false }).filter(r => r.some(c => String(c).trim() !== '')); }
    catch(e){ box.innerHTML = '<span class="u-red">Excel dosyası okunamadı: ' + escapeHtml(e.message) + '</span>'; return; }
  } else rows = parseCsv(await file.text());
  if(rows.length < 2){ box.innerHTML = '<span class="u-red">Dosyada başlık satırı ve en az bir müşteri olmalı.</span>'; return; }
  const head = rows[0].map(h => String(h).trim().toLocaleLowerCase('tr'));
  const map = {};
  CRM_CSV_COLS.forEach(([key, , aliases]) => { const i = head.findIndex(h => aliases.includes(h)); if(i >= 0) map[key] = i; });
  if(map.name == null){ box.innerHTML = '<span class="u-red">"Ad Soyad" sütunu bulunamadı. Başlık satırını şablondaki gibi yapın.</span>'; return; }
  const data = rows.slice(1).map(r => {
    const o = {}; Object.keys(map).forEach(k => o[k] = String(r[map[k]] ?? '').trim());
    if(o.birthday) o.birthday = normalizeDateCell(o.birthday);
    if(o.points_balance) o.points_balance = o.points_balance.replace(',', '.');
    return o;
  });
  if(data.length > 5000){ box.innerHTML = '<span class="u-red">Tek seferde en fazla 5000 satır yüklenebilir (' + data.length + ').</span>'; return; }
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
function openPromoSheet(){
  // Kampanyalar Ayarlar > Abonelik, Hediye Kartı & Kampanya > Kampanya & Kuponlar altında.
  APP.settingsTab = 'billing'; APP.billingSubTab = 'promos'; goToView('settings');
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
    <div class="fsheet-bar" style="margin:0 0 12px;"><span class="u-fs13 muted">${APP.promos.length} kampanya</span><button type="button" class="fsheet-open" ${act('newPromo')}>+ Yeni Kampanya</button></div>
    ${APP.promos.length ? `<div class="pr-list">${APP.promos.map(p => `<div class="pr-card ${p.valid_now ? 'live' : ''} ${p.active ? '' : 'off'}">
        <div class="pr-top"><span class="pr-kind">${p.kind==='coupon' ? '🎟️' : '🎉'}</span><div class="pr-id"><b>${escapeHtml(p.name)}</b>${p.code ? `<code>${escapeHtml(p.code)}</code>` : '<small>Otomatik kampanya</small>'}</div>
          <span class="pr-st">${!p.active ? '⏸ Pasif' : p.valid_now ? '● Şu an geçerli' : '○ Zamanı değil'}</span></div>
        <div class="pr-desc">${descr(p)}${Number(p.total_discount) > 0 ? ' · toplam ' + money(p.total_discount) + ' indirim' : ''}</div>
        <div class="pr-acts"><button type="button" class="pc-btn pc-edit" style="margin-left:0;" ${act('editPromo', p.id)}>✏️ Düzenle</button>
          <button type="button" class="pc-btn" ${act('togglePromoActive', p.id)}>${p.active ? '⏸ Durdur' : '▶ Başlat'}</button>
          <button type="button" class="pc-btn rv-del" style="margin-left:auto;" ${act('removePromo', p.id)}>🗑</button></div>
      </div>`).join('')}</div>` : `<div class="empty-state rv-empty"><div class="om-empty-ic">🎟️</div><b>Henüz kampanya yok</b><p class="muted"><b>+ Yeni Kampanya</b> ile ilk kuponunuzu ya da happy hour kampanyanızı oluşturun.</p></div>`}
`;
  if(!document.getElementById('promoFormSheet')) document.body.insertAdjacentHTML('beforeend', sheetHtml('promoFormSheet', '🎟️', 'Yeni Kampanya', '<div id="promoFormBody"></div>', 'var(--c4)'));
  document.getElementById('promoFormSheetTitle').textContent = e.id ? 'Kampanyayı Düzenle' : 'Yeni Kampanya';
  document.getElementById('promoFormBody').innerHTML = `
    <div class="pr-form">
      
      <div class="rvf-chips"><button type="button" class="rvf-chip ${e.kind==='coupon'?'on':''}" ${act('setPromoKind','coupon')}>🎟️ Kupon kodu</button><button type="button" class="rvf-chip ${e.kind==='auto'?'on':''}" ${act('setPromoKind','auto')}>🎉 Otomatik (happy hour)</button></div>
      <div class="fsheet-grid" style="margin-top:10px;">
        <div class="field-group"><label>Kampanya adı</label><input id="pr_name" value="${val('name')}" placeholder="${e.kind==='coupon' ? 'örn. Hoş geldin indirimi' : 'örn. Happy Hour'}"></div>
        ${e.kind==='coupon' ? `<div class="field-group"><label>Kupon kodu</label><input id="pr_code" value="${val('code')}" placeholder="örn. HOSGELDIN10" style="text-transform:uppercase;"></div>` : '<div></div>'}
        <div class="field-group"><label>İndirim</label><div style="display:flex;gap:6px;"><input id="pr_value" type="number" min="0" step="0.01" value="${val('disc_value')}" class="u-f1"><select id="pr_type" style="width:70px;"><option value="percent" ${e.disc_type==='percent'?'selected':''}>%</option><option value="amount" ${e.disc_type==='amount'?'selected':''}>₺</option></select></div></div>
        <div class="field-group"><label>En az harcama (₺)</label><input id="pr_min" type="number" min="0" step="0.01" value="${Number(e.min_total)||''}" placeholder="yok"></div>
        <div class="field-group"><label>Başlangıç</label><input id="pr_start" type="date" value="${val('starts_on')}"></div>
        <div class="field-group"><label>Bitiş</label><input id="pr_end" type="date" value="${val('ends_on')}"></div>
        <div class="field-group"><label>Saat başlangıç</label><input id="pr_hfrom" type="time" value="${t5(e.hour_from)}"></div>
        <div class="field-group"><label>Saat bitiş</label><input id="pr_hto" type="time" value="${t5(e.hour_to)}"></div>
        <div class="field-group wide"><label>Günler (boş = her gün)</label><div class="rvf-chips" id="pr_days">${PROMO_DAYS.map((d, i) => `<button type="button" class="rvf-chip rvf-n ${(e.days||[]).includes(i+1)?'on':''}" data-d="${i+1}" ${act('togglePromoDay','$this')}>${d}</button>`).join('')}</div></div>
        <div class="field-group"><label>Kullanım limiti</label><input id="pr_max" type="number" min="1" step="1" value="${val('max_uses')}" placeholder="sınırsız"></div>
      </div>
      <div class="fsheet-foot"><button type="button" class="ghost-btn" ${act('closeSheet','promoFormSheet')}>Vazgeç</button><button ${act('savePromo')}>💾 ${e.id ? 'Güncelle' : 'Kampanyayı Kaydet'}</button></div>
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
async function newPromo(){ APP.promoEdit = null; await renderPromoBody(); openSheet('promoFormSheet'); }
async function editPromo(id){ const p = (APP.promos||[]).find(x => x.id === id); if(!p) return; APP.promoEdit = Object.assign({}, p, { days: p.days || [] }); await renderPromoBody(); openSheet('promoFormSheet'); }
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
  APP.promoEdit = null; closeSheet('promoFormSheet'); showToast('Kampanya kaydedildi ✓'); renderPromoBody();
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
// Finansal Analiz > Müşteri Değerlendirmeleri sekmesi (rapor izni olan roller görür).
async function renderReviewsReport(session){
  const el = document.getElementById('reportContent'); if(!el) return;
  APP.reviewDays = APP.reviewDays || 30;
  el.innerHTML = '<div class="u-mwn box"><h2>⭐ Müşteri Değerlendirmeleri</h2><div id="reviewsBody"><p class="muted">Yükleniyor…</p></div></div>';
  await renderReviewsBody();
}
function openReviewsSheet(){ APP.reportTab = 'reviews'; goToView('reports'); }
function setReviewDays(d){ APP.reviewDays = d; renderReviewsBody(); }
async function renderReviewsBody(){
  const body = document.getElementById('reviewsBody'); if(!body) return;
  const session = getSession();
  const { data, error } = await sb.rpc('list_reviews', { p_token: session.session_token, p_days: APP.reviewDays });
  if(error){ body.innerHTML = '<p class="muted">Yüklenemedi: ' + escapeHtml(error.message) + '</p>'; return; }
  const st = data.stats || {}, rows = data.rows || [], dist = st.dist || [0,0,0,0,0], max = Math.max(1, ...dist);
  const f = APP.reviewFilter || 'all', shown = f==='low' ? rows.filter(r => r.rating <= 3) : f==='high' ? rows.filter(r => r.rating >= 4) : f==='photo' ? rows.filter(r => r.photos > 0) : f==='cb' ? rows.filter(r => r.callback) : rows;
  const stars = (n) => '<span class="rvw-st">' + '★'.repeat(n) + '<i>' + '★'.repeat(5-n) + '</i></span>';
  body.innerHTML = `<div class="rvf-chips" style="margin-bottom:12px;">${[[7,'7 gün'],[30,'30 gün'],[90,'90 gün']].map(([d, l]) => `<button type="button" class="rvf-chip ${APP.reviewDays===d?'on':''}" ${act('setReviewDays', d)}>${l}</button>`).join('')}</div>
    <div class="rvw-sum">
      <div class="rvw-avg"><b>${st.n ? Number(st.avg).toLocaleString('tr-TR') : '—'}</b>${stars(Math.round(Number(st.avg)||0))}<small>${st.n||0} değerlendirme · ${st.sent||0} link</small></div>
      <div class="rvw-dist">${[5,4,3,2,1].map(n => `<div class="rvw-row"><span>${n}★</span><div class="rvw-bar"><i style="width:${dist[n-1]/max*100}%;"></i></div><b>${dist[n-1]}</b></div>`).join('')}</div>
    </div>
    <div class="rvf-chips" style="margin:12px 0;">${[['all','Tümü'],['low','😞 1-3 yıldız'],['high','🤩 4-5 yıldız'],['photo','📷 Fotoğraflı (' + (st.with_photo||0) + ')'],['cb','📞 Dönüş bekleyen (' + (st.callback||0) + ')']].map(([k, l]) => `<button type="button" class="rvf-chip ${f===k?'on':''}" ${act('setReviewFilter', k)}>${l}</button>`).join('')}</div>
    ${shown.length ? `<div class="rvw-list">${shown.map(r => `<div class="rvw-card ${r.rating <= 3 ? 'low' : ''} ${r.seen ? '' : 'new'}">
        <div class="rvw-top">${stars(r.rating)}<small>${new Date(r.rated_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}</small></div>
        ${r.comment ? `<p>“${escapeHtml(r.comment)}”</p>` : '<p class="muted">Yorum yazılmadı</p>'}
        ${r.photos ? `<div class="rvw-photos">${Array.from({ length: r.photos }, (_, i) => `<button type="button" class="rvw-ph" data-rv="${r.id}" data-i="${i}" ${act('openReviewPhoto', r.id, i)}></button>`).join('')}</div>` : ''}
        <div class="pcard-chips">${r.callback ? '<span class="pchip rvw-cb">📞 Geri dönüş istiyor</span>' : ''}${r.customer_name ? `<span class="pchip">👤 ${escapeHtml(r.customer_name)}</span>` : ''}${r.customer_phone ? `<span class="pchip">${phoneHtml(r.customer_phone)}</span>` : ''}${r.table_name ? `<span class="pchip">🪑 ${escapeHtml(r.table_name)}</span>` : ''}${r.staff ? `<span class="pchip">🧑‍🍳 ${escapeHtml(r.staff)}</span>` : ''}</div>
      </div>`).join('')}</div>` : `<div class="empty-state rv-empty"><div class="om-empty-ic">⭐</div><b>Henüz değerlendirme yok</b><p class="muted">Ödeme alındıktan sonra çıkan <b>⭐ Değerlendirme QR</b> ya da <b>📱 SMS ile iste</b> ile müşteriden puan isteyin.</p></div>`}`;
  loadReviewPhotos();
  if(rows.some(r => !r.seen)){ await sb.rpc('mark_reviews_seen', { p_token: session.session_token }); refreshNavBadges(); }
}
// Yorum fotoğrafları özel depoda: oturum anahtarı başlıkta gönderilerek alınır, küçük resim olarak gösterilir.
APP.reviewPhotoCache = APP.reviewPhotoCache || {};
async function reviewPhotoUrl(id, i){
  const key = id + ':' + i; if(APP.reviewPhotoCache[key]) return APP.reviewPhotoCache[key];
  const r = await fetch('/api/review-photo?id=' + encodeURIComponent(id) + '&i=' + i, { headers: { 'x-session-token': getSession().session_token } });
  if(!r.ok) return null;
  return (APP.reviewPhotoCache[key] = URL.createObjectURL(await r.blob()));
}
async function loadReviewPhotos(){
  for(const el of document.querySelectorAll('.rvw-ph[data-rv]')){
    const u = await reviewPhotoUrl(el.dataset.rv, Number(el.dataset.i));
    if(u && el.isConnected) el.style.backgroundImage = `url("${u}")`; else if(!u) el.classList.add('err');
  }
}
async function openReviewPhoto(id, i){
  const u = await reviewPhotoUrl(id, i); if(!u) return showToast('Fotoğraf açılamadı', 'error');
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'rvPhotoBg';
  bg.innerHTML = `<div class="rvw-big"><img src="${u}" alt="Müşteri fotoğrafı"><button type="button" class="ap-x" ${act('removeEl', 'rvPhotoBg')}>✕</button></div>`;
  document.body.appendChild(bg);
}
function setReviewFilter(k){ APP.reviewFilter = k; renderReviewsBody(); }

/* ---- Müşteri geri kazanım: X gündür gelmeyen müşterilere SMS / e-posta (get_winback / send_winback) ---- */
const WINBACK_DEFAULT = '{isletme}: {ad}, sizi özledik! Bu hafta gelişinizde %10 indirim sizi bekliyor. Kasada bu mesajı göstermeniz yeterli.';
const CAMPAIGN_DEFAULT = '{isletme}: Merhaba {ad}, bu hafta sonuna özel tüm menüde %15 indirim! Kasada bu mesajı göstermeniz yeterli.';
// Mod: 0 = tüm müşteriler, -1 = son 30 günde gelenler (kampanya); >0 = X gündür gelmeyenler (geri kazanım).
const wbIsCampaign = () => APP.wb && APP.wb.days <= 0;
async function openWinback(days){
  const prevMode = APP.wb ? APP.wb.days <= 0 : null;
  APP.wb = Object.assign({ days: 30, sel: {}, channel: 'sms' }, APP.wb || {}, days != null && days !== '' ? { days: Number(days), sel: {} } : {});
  if(prevMode !== null && prevMode !== (APP.wb.days <= 0)) APP.wb.textReset = true;
  const { data, error } = await withLoadingOverlay(sb.rpc('get_winback', { p_token: getSession().session_token, p_days: APP.wb.days }));
  if(error){ alert(error.message); return; }
  APP.wb.data = data || {}; drawWinback();
}
function drawWinback(){
  let bg = document.getElementById('wbBg');
  if(!bg){ bg = document.createElement('div'); bg.id = 'wbBg'; bg.className = 'modal-bg'; document.body.appendChild(bg); }
  const W = APP.wb, d = W.data, b = d.buckets || {}, rows = d.rows || [], selN = rows.filter(r => W.sel[r.id]).length;
  let prevText = (document.getElementById('wbText') || {}).value;
  if(W.textReset){ prevText = null; W.textReset = false; }
  const camp = W.days <= 0;
  const total = (b.active || 0) + (b.d30 || 0) + (b.d60 || 0) + (b.d90 || 0) || 1;
  const card = (k, days, label, n, col) => `<button type="button" class="wb-card ${W.days === days ? 'on' : ''}" style="--t:${col}" ${act('openWinback', days)}><small>${label}</small><b>${n || 0}</b><i style="width:${Math.round((n || 0) / total * 100)}%"></i></button>`;
  const ago = t => t ? Math.round((Date.now() - new Date(t)) / 864e5) + ' gün önce' : '—';
  bg.innerHTML = `<div class="box wb-modal"><div class="u-row-sb"><h2 class="u-m0">📣 Kampanya & Geri Kazanım</h2><span class="u-xclose" ${act('removeEl','wbBg')}>✕</span></div>
    <p class="muted" style="font-size:13px;text-align:left;">Kime göndereceğinizi seçin: <b>tüm müşteriler</b> ya da <b>son gelenler</b> (kampanya, yeni menü, duyuru) veya <b>bir süredir gelmeyenler</b> (geri kazanım). ${camp ? 'Aynı müşteriye 24 saat içinde ikinci mesaj gönderilmez.' : 'Geri kazanımda aynı müşteriye 14 gün içinde ikinci mesaj gönderilmez.'}</p>
    <div class="wb-cards">${card('all', 0, '👥 Tüm müşteriler', b.all, 'var(--accent)')}${card('a', -1, 'Son 30 günde geldi', b.active, 'var(--green,#22c55e)')}${card('3', 30, '30–60 gündür yok', b.d30, '#f59e0b')}${card('6', 60, '60–90 gündür yok', b.d60, '#f97316')}${card('9', 90, '90+ gündür yok', b.d90, 'var(--red,#ef4444)')}</div>
    <p class="wb-stat">📨 Son 90 günde <b>${d.contacted || 0}</b> müşteriye ulaşıldı, bunlardan <b>${d.returned || 0}</b> tanesi geri geldi${d.contacted ? ' (%' + Math.round((d.returned || 0) / d.contacted * 100) + ')' : ''}.</p>
    ${W.days != null ? `<div class="wb-listhead"><b>${W.days === 0 ? 'Tüm müşteriler · ' + rows.length : W.days < 0 ? 'Son 30 günde gelen ' + rows.length + ' müşteri' : W.days + '+ gündür gelmeyen ' + rows.length + ' müşteri'}</b><span><button type="button" class="ghost-btn" ${act('wbSelAll', true)}>Hepsini seç</button><button type="button" class="ghost-btn" ${act('wbSelAll', false)}>Seçimi kaldır</button></span></div>
    <div class="wb-list">${rows.map(r => `<label class="wb-row"><input type="checkbox" ${W.sel[r.id] ? 'checked' : ''} ${actOn('change','wbToggle',[r.id,'$checked'])}>
      <span class="wb-n"><b>${escapeHtml(r.name || '—')}</b><small>${r.phone ? escapeHtml(maskPhone(r.phone)) : ''}${r.has_email ? ' · ✉️' : ''}</small></span>
      <span class="wb-m"><small>Son geliş</small>${ago(r.last_visit_at)}</span><span class="wb-m"><small>${r.total_visits} ziyaret</small>${money(r.total_spent || 0)}</span>
      ${r.marketing_consent ? '<span class="pchip" title="Kampanya SMS onayı verdi">✅ Onaylı</span>' : ''}${r.last_contact ? `<span class="pchip" title="Son kampanya">📨 ${ago(r.last_contact)}</span>` : ''}</label>`).join('') || '<p class="muted">Bu aralıkta müşteri yok.</p>'}</div>
    <p class="muted u-fs12">Kampanya iznini reddeden müşteriler bu listede gösterilmez ve onlara mesaj gönderilmez. Kendi eklediğiniz müşteriler için kampanya onayını almak işletmenin sorumluluğundadır.</p>
    <div class="wb-compose"><label>Mesaj <small class="muted">({ad} = müşterinin adı, {isletme} = işletme adı)</small></label>
      ${camp && W.channel !== 'sms' ? `<input id="wbSubject" placeholder="E-posta konusu (örn. Hafta sonuna özel %15 indirim)" maxlength="120" value="${escapeAttr(W.subject || '')}" ${actOn('input','wbSubjectSet',['$value'])} style="margin:4px 0 8px;">` : ''}
      <textarea id="wbText" rows="3" maxlength="320">${escapeHtml(prevText != null ? prevText : (camp ? CAMPAIGN_DEFAULT : WINBACK_DEFAULT))}</textarea>
      <div class="wb-send"><div class="seg">${[['sms','📱 SMS'],['mail','✉️ E-posta'],['both','İkisi de']].map(([k, l]) => `<button type="button" class="${W.channel === k ? 'on' : ''}" ${act('wbChannel', k)}>${l}</button>`).join('')}</div>
        <button type="button" ${selN ? '' : 'disabled'} ${act('sendWinback')}>${selN} müşteriye gönder</button></div></div>`
    : '<p class="muted">Yukarıdan bir aralık seçin.</p>'}</div>`;
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
}
function wbToggle(id, on){ APP.wb.sel[id] = !!on; const t = document.getElementById('wbText'); const v = t && t.value; drawWinback(); if(v != null) document.getElementById('wbText').value = v; }
function wbSelAll(on){ (APP.wb.data.rows || []).forEach(r => { APP.wb.sel[r.id] = !!on; }); drawWinback(); }
function wbChannel(k){ APP.wb.channel = k; const t = document.getElementById('wbText'); const v = t && t.value; drawWinback(); if(v != null) document.getElementById('wbText').value = v; }
function wbSubjectSet(v){ APP.wb.subject = v; }
async function sendWinback(){
  const ids = (APP.wb.data.rows || []).filter(r => APP.wb.sel[r.id]).map(r => r.id), text = (document.getElementById('wbText') || {}).value || '';
  if(!ids.length) return;
  if(!await uiConfirm(ids.length + ' müşteriye ' + ({ sms:'SMS', mail:'e-posta', both:'SMS ve e-posta' }[APP.wb.channel]) + ' gönderilecek. Devam edilsin mi?')) return;
  const camp = wbIsCampaign();
  const { data, error } = await withLoadingOverlay(camp
    ? sb.rpc('send_campaign', { p_token: getSession().session_token, p_ids: ids, p_text: text, p_channel: APP.wb.channel, p_subject: APP.wb.subject || null })
    : sb.rpc('send_winback', { p_token: getSession().session_token, p_ids: ids, p_text: text, p_channel: APP.wb.channel }));
  if(error){ await uiAlert(error.message); return; }
  showToast(`Gönderildi ✓ ${data.sms} SMS, ${data.mail} e-posta${data.skipped ? ' · ' + data.skipped + ' müşteri son ' + (camp ? '24 saatte' : '14 günde') + ' zaten mesaj aldığı için atlandı' : ''}`);
  APP.wb.sel = {}; openWinback();
}
