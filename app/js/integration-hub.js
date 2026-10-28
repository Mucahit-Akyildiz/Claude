// Ortak entegrasyon altyapısı (ÖKC / yazar kasa ve pazaryeri): işletme kendi sağlayıcısını ve anahtarlarını girer.
// Sunucu: tenant_connectors + integration_jobs (bkz. supabase/migrations/20261027_integration_hub.sql), işçi api/integration-worker.js,
// pazaryeri sipariş adresi api/marketplace-in.js. Marka modülleri api/_integrations altında; listede "Yakında" olanların modülü henüz yok.
const CX_PROVIDERS = {
  okc: [
    { id:'test', ic:'🧪', n:'Test (simülasyon)', d:'Cihazsız uçtan uca deneme', ready:true,
      fields:[{ k:'fail_rate', l:'Hata simülasyonu (0–1)', ph:'0', cfg:true }] },
    { id:'pavo', ic:'🟦', n:'PAVO', d:'Android ÖKC' }, { id:'hugin', ic:'🟥', n:'Hugin', d:'Tiger / Android' },
    { id:'beko', ic:'⬛', n:'Beko', d:'300TR / X30TR' }, { id:'ingenico', ic:'🟩', n:'Ingenico', d:'Move 5000F' }, { id:'token', ic:'🟪', n:'Token', d:'Android ÖKC' },
  ],
  marketplace: [
    { id:'test', ic:'🧪', n:'Test (simülasyon)', d:'Normalize sipariş biçimi', ready:true,
      fields:[{ k:'webhook_secret', l:'İmza anahtarı (isteğe bağlı)', secret:true }] },
    { id:'yemeksepeti', ic:'🩷', n:'Yemeksepeti', d:'Partner API' }, { id:'trendyol', ic:'🟧', n:'Trendyol Go', d:'Partner API' }, { id:'getir', ic:'🟣', n:'Getir', d:'Partner API' },
  ],
};
const CX_EVENT = { sale:'Fiş', test:'Bağlantı testi', order_status:'Durum bildirimi', order_in:'Gelen sipariş' };
const CX_STATUS = { done:['✅','Tamam'], pending:['⏳','Sırada'], processing:['⏳','İşleniyor'], failed:['❌','Başarısız'] };

async function renderConnectors(kind){
  const box = document.getElementById(kind === 'okc' ? 'cxOkc' : 'cxMp'); if(!box) return;
  const session = getSession();
  const { data, error } = await sb.rpc('list_connectors', { p_token: session.session_token });
  if(error){ box.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`; return; }
  APP.cx = APP.cx || {}; APP.cx.list = data || [];
  const mine = (data || []).filter(c => c.kind === kind);
  const sel = (APP.cx['sel_' + kind]) || (mine.find(c => c.enabled) || mine[0] || {}).provider || 'test';
  APP.cx['sel_' + kind] = sel;
  const prov = CX_PROVIDERS[kind].find(p => p.id === sel) || CX_PROVIDERS[kind][0];
  const c = mine.find(x => x.provider === sel) || { config:{}, enabled:false, mode:'test' };
  const tiles = CX_PROVIDERS[kind].map(p => { const cc = mine.find(x => x.provider === p.id);
    return `<button type="button" class="ix-tile cx-tile ${sel===p.id?'on':''} ${p.ready?'':'cx-soon'}" ${act('cxPick', kind, p.id)}><span>${p.ic}</span><b>${p.n}</b><small>${cc && cc.enabled ? '<span class="cx-on">● Etkin</span>' : p.ready ? p.d : 'Yakında'}</small></button>`; }).join('');
  const fields = (prov.fields || []).map(f => `<div><label>${f.l}</label><input id="cx_${kind}_${f.k}" ${f.secret ? `type="password" autocomplete="new-password" placeholder="${c.has_secret ? '•••••••• kayıtlı — değiştirmek için yazın' : ''}"` : `value="${escapeAttr((c.config || {})[f.k] ?? '')}" placeholder="${f.ph || ''}"`}></div>`).join('');
  const url = c.id && kind === 'marketplace' ? location.origin + '/api/marketplace-in?k=' + c.inbound_key : '';
  const stats = c.id ? `<div class="cx-stats">
      <button type="button" class="cx-stat" ${act('cxJobs', kind, 'done')}><b>${c.done_7d}</b><small>Başarılı (7 gün)</small></button>
      <button type="button" class="cx-stat" ${act('cxJobs', kind, 'pending')}><b>${c.pending}</b><small>Sırada</small></button>
      <button type="button" class="cx-stat ${c.failed ? 'cx-bad' : ''}" ${act('cxJobs', kind, 'failed')}><b>${c.failed}</b><small>Başarısız</small></button>
      <div class="cx-stat cx-last"><b>${c.last_ok_at ? new Date(c.last_ok_at).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}</b><small>Son başarılı</small></div>
    </div>${c.last_error ? `<p class="cx-err">⚠️ Son hata: ${escapeHtml(c.last_error)}</p>` : ''}` : '';
  box.innerHTML = `<div class="ix-sec"><div class="ix-st">🔌 ${kind === 'okc' ? 'Yazar kasa (ÖKC) bağlantısı' : 'Pazaryeri bağlantısı'}</div><div class="ix-tiles">${tiles}</div></div>
    ${prov.ready ? `<div class="ix-sec">
      <label class="cx-sw"><input type="checkbox" class="sw" id="cx_${kind}_en" ${c.enabled?'checked':''}> <b>Etkin</b> <span class="muted">${kind === 'okc' ? '— her kapanan hesap fiş olarak cihaza gönderilir' : '— gelen siparişler onay bekleyen sipariş olarak düşer'}</span></label>
      <div class="ix-form">
        <div><label>Ortam</label><select id="cx_${kind}_mode"><option value="test" ${c.mode!=='live'?'selected':''}>Test</option><option value="live" ${c.mode==='live'?'selected':''}>Canlı</option></select></div>
        ${fields}
      </div>
      ${url ? `<div class="cx-url"><label>Sipariş bildirim adresi (pazaryeri paneline girin)</label><div><input readonly value="${escapeAttr(url)}" id="cx_url"><button type="button" class="ghost-btn" ${act('cxCopyUrl')}>Kopyala</button></div></div>` : ''}
      <div class="cx-actions">
        <button type="button" ${act('cxSave', kind)}>Kaydet</button>
        ${c.id ? `<button type="button" class="ghost-btn" ${act('cxTest', kind)}>🔎 Bağlantıyı test et</button><button type="button" class="ghost-btn" ${act('cxRemove', kind)}>Kaldır</button>` : ''}
      </div></div>
      ${stats}<div id="cxJobs_${kind}"></div>`
    : `<p class="ix-note">ℹ️ <b>${prov.n}</b> modülü henüz hazır değil. Modül için bu markanın entegrasyon dokümanı ve test erişimi gerekiyor; hazır olduğunda burada kendi anahtarlarınızı girip etkinleştirebileceksiniz. Şimdilik <b>Test (simülasyon)</b> ile akışı deneyebilirsiniz.</p>`}`;
  if(c.id && APP.cx['jobs_' + kind]) cxJobs(kind, APP.cx['jobs_' + kind]);
}
function cxPick(kind, id){ APP.cx['sel_' + kind] = id; APP.cx['jobs_' + kind] = null; renderConnectors(kind); }
function cxCurrent(kind){ return (APP.cx.list || []).find(c => c.kind === kind && c.provider === APP.cx['sel_' + kind]); }
async function cxSave(kind){
  const prov = CX_PROVIDERS[kind].find(p => p.id === APP.cx['sel_' + kind]); if(!prov) return;
  const cfg = {}, sec = {};
  (prov.fields || []).forEach(f => { const v = (document.getElementById(`cx_${kind}_${f.k}`) || {}).value || ''; if(f.secret) sec[f.k] = v; else if(v !== '') cfg[f.k] = v; });
  const { error } = await sb.rpc('save_connector', { p_token: getSession().session_token, p_kind: kind, p_provider: prov.id,
    p_enabled: document.getElementById(`cx_${kind}_en`).checked, p_mode: document.getElementById(`cx_${kind}_mode`).value, p_config: cfg, p_secrets: sec });
  if(error) return showToast(error.message, 'error');
  showToast('Bağlantı kaydedildi'); renderConnectors(kind);
}
async function cxTest(kind){
  const c = cxCurrent(kind); if(!c) return;
  const { error } = await sb.rpc('test_connector', { p_token: getSession().session_token, p_id: c.id });
  if(error) return showToast(error.message, 'error');
  showToast('Test sıraya alındı, en geç 1 dakika içinde sonuçlanır'); APP.cx['jobs_' + kind] = 'all';
  setTimeout(() => renderConnectors(kind), 1500);
}
async function cxRemove(kind){
  const c = cxCurrent(kind); if(!c || !confirm('Bağlantı kapatılsın ve kayıtlı anahtarları silinsin mi?')) return;
  const { error } = await sb.rpc('remove_connector', { p_token: getSession().session_token, p_id: c.id });
  if(error) return showToast(error.message, 'error');
  renderConnectors(kind);
}
function cxCopyUrl(){ const i = document.getElementById('cx_url'); if(!i) return; try{ navigator.clipboard.writeText(i.value); showToast('Adres kopyalandı'); }catch(e){ i.select(); } }
async function cxJobs(kind, status){
  const c = cxCurrent(kind), el = document.getElementById('cxJobs_' + kind); if(!c || !el) return;
  APP.cx['jobs_' + kind] = status;
  const { data, error } = await sb.rpc('list_integration_jobs', { p_token: getSession().session_token, p_connector: c.id, p_status: status === 'all' ? null : (status === 'pending' ? null : status), p_limit: 50 });
  if(error){ el.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`; return; }
  const rows = (data || []).filter(j => status !== 'pending' || j.status === 'pending' || j.status === 'processing');
  el.innerHTML = `<div class="cx-jobs"><div class="cx-jh"><b>İş geçmişi</b> <span class="muted">${{ all:'Tümü', done:'Başarılı', pending:'Sırada', failed:'Başarısız' }[status] || ''}</span> <button type="button" class="ghost-btn" ${act('cxJobs', kind, 'all')}>Tümü</button></div>
    ${rows.length ? rows.map(j => { const [ic, st] = CX_STATUS[j.status] || ['•', j.status];
      return `<div class="cx-job"><span>${ic}</span><span><b>${CX_EVENT[j.event] || j.event}</b>${j.total ? ' · ' + money(j.total) : ''}<small>${new Date(j.created_at).toLocaleString('tr-TR')} · ${st}${j.attempts > 1 ? ' · ' + j.attempts + '. deneme' : ''}${j.result && j.result.ref ? ' · ' + escapeHtml(j.result.ref) : ''}${j.error ? ' · ' + escapeHtml(j.error) : ''}</small></span>${j.status === 'failed' ? `<button type="button" class="ghost-btn" ${act('cxRetry', kind, j.id)}>Yeniden dene</button>` : ''}</div>`; }).join('') : '<p class="muted">Kayıt yok.</p>'}</div>`;
}
async function cxRetry(kind, id){
  const { error } = await sb.rpc('retry_integration_job', { p_token: getSession().session_token, p_id: id });
  if(error) return showToast(error.message, 'error');
  showToast('Yeniden sıraya alındı'); renderConnectors(kind);
}
