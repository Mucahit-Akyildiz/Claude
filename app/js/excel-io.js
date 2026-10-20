/* ---- Excel içe/dışa aktarma (Limitler ve Kullanıcılar) ----
   SheetJS kendi sunucumuzdan ihtiyaç anında yüklenir (/assets/vendor/xlsx.full.min.js).
   .xlsx, .xls ve .csv okunur; dışa aktarma .xlsx. Başlıklar Türkçe, büyük/küçük harf ve boşluk duyarsız eşlenir. */
let XLSX_LOADING = null;
function loadXlsx(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(!XLSX_LOADING) XLSX_LOADING = new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = '/assets/vendor/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX); s.onerror = () => { XLSX_LOADING = null; fail(new Error('Excel modülü yüklenemedi')); };
    document.head.appendChild(s);
  });
  return XLSX_LOADING;
}
// Excel formül enjeksiyonuna karşı metin hücreleri =,+,-,@ ile başlamaz.
const xlSafe = (v) => typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
async function xlDownload(fileName, sheetName, header, rows, widths){
  const X = await loadXlsx();
  const ws = X.utils.aoa_to_sheet([header, ...rows.map(r => r.map(xlSafe))]);
  ws['!cols'] = (widths || header.map(() => 18)).map(w => ({ wch: w }));
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, sheetName);
  X.writeFile(wb, fileName);
}
const xlKey = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '');
// Dosya seç → satırları {başlıkAnahtarı: değer} olarak döndür.
function xlPickRows(){
  return new Promise((ok) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if(!f){ ok(null); return; }
      try{
        const X = await loadXlsx();
        const wb = X.read(await f.arrayBuffer(), { type: 'array' });
        const raw = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
        ok(raw.map(r => { const o = {}; Object.keys(r).forEach(k => { o[xlKey(k)] = String(r[k]).trim(); }); return o; }).filter(r => Object.values(r).some(Boolean)));
      }catch(e){ alert('Dosya okunamadı: ' + e.message); ok(null); }
    };
    inp.click();
  });
}
const xlPick = (r, ...keys) => { for(const k of keys){ const v = r[xlKey(k)]; if(v !== undefined && v !== '') return v; } return ''; };
const xlNum = (v) => { const n = Number(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isFinite(n) ? n : NaN; };
const xlBool = (v, def) => v === '' ? def : !/^(hayır|hayir|pasif|0|false|no|h)$/i.test(String(v).trim());
function xlReport(title, ok, errs){
  alert(`${title}\n\n✓ ${ok} satır işlendi${errs.length ? `\n✗ ${errs.length} satır atlandı:\n\n` + errs.slice(0, 15).join('\n') + (errs.length > 15 ? `\n… ve ${errs.length - 15} satır daha` : '') : ''}`);
}

/* Limitler */
const AL_HEAD = ['Tür', 'Ad', 'Dönem', 'Limit', 'Sipariş Etiketi', 'Aktif', 'Kalan', 'Bugün Harcanan'];
async function exportAllowancesExcel(){
  const list = await loadAllowances();
  await xlDownload('limitler-' + todayLocalDateStr() + '.xlsx', 'Limitler', AL_HEAD, list.map(a => [
    a.kind === 'person' ? 'Kişi' : 'Kullanıcı', a.name || '', a.kind === 'person' ? 'Günlük' : a.period === 'monthly' ? 'Aylık' : 'Günlük',
    Number(a.limit_amount), a.flag_label || '', a.is_active ? 'Evet' : 'Hayır', Number(a.remaining), Number(a.used_today)]), [11, 26, 10, 10, 18, 8, 10, 15]);
}
async function downloadAllowanceTemplate(){
  const flags = ((APP.config && APP.config.order_flags) || []).map(f => f.label);
  const u = ((APP.config && APP.config.users) || [])[0];
  await xlDownload('limit-sablonu.xlsx', 'Limitler', AL_HEAD.slice(0, 6), [
    ['Kişi', 'Ahmet Yılmaz', 'Günlük', 250, flags.find(f => /talebe|öğrenci/i.test(f)) || flags[0] || '', 'Evet'],
    ['Kullanıcı', u ? u.username : 'kullanici_adi', 'Aylık', 3000, flags.find(f => /personel/i.test(f)) || flags[0] || '', 'Evet']], [11, 26, 10, 10, 18, 8]);
}
async function importAllowancesExcel(){
  const rows = await xlPickRows(); if(!rows) return;
  if(!rows.length){ alert('Dosyada satır bulunamadı'); return; }
  const list = await loadAllowances();
  const users = (APP.config && APP.config.users) || [];
  const flags = ((APP.config && APP.config.order_flags) || []).map(f => f.label);
  const errs = []; let ok = 0;
  await withLoadingOverlay((async () => {
    for(const [i, r] of rows.entries()){
      const line = 'Satır ' + (i + 2);
      const kind = /kullan/i.test(xlPick(r, 'Tür', 'Tur', 'Tip')) ? 'user' : 'person';
      const name = xlPick(r, 'Ad', 'Ad Soyad', 'İsim', 'Kullanıcı', 'Kullanıcı Adı');
      const lim = xlNum(xlPick(r, 'Limit', 'Günlük Limit', 'Tutar'));
      if(!name){ errs.push(line + ': ad boş'); continue; }
      if(!isFinite(lim) || lim < 0){ errs.push(line + ` (${name}): limit geçersiz`); continue; }
      let flag = xlPick(r, 'Sipariş Etiketi', 'Etiket');
      if(flag){ const m = flags.find(f => xlKey(f) === xlKey(flag)); if(!m){ errs.push(line + ` (${name}): "${flag}" etiketi yok`); continue; } flag = m; }
      const period = /ay/i.test(xlPick(r, 'Dönem', 'Donem', 'Periyot')) ? 'monthly' : 'daily';
      const p = { kind, limit_amount: lim, flag_label: flag, period, is_active: xlBool(xlPick(r, 'Aktif', 'Durum'), true) };
      if(kind === 'user'){
        const u = users.find(x => xlKey(x.username) === xlKey(name));
        if(!u){ errs.push(line + `: "${name}" adlı kullanıcı yok`); continue; }
        p.user_id = u.id; const ex = list.find(a => a.kind === 'user' && a.user_id === u.id); if(ex) p.id = ex.id;
      } else {
        p.name = name; const ex = list.find(a => a.kind === 'person' && xlKey(a.name) === xlKey(name)); if(ex) p.id = ex.id;
      }
      const { error } = await sb.rpc('save_allowance', { p_token: getSession().session_token, p_data: p });
      if(error) errs.push(line + ` (${name}): ${error.message}`); else ok++;
    }
  })());
  xlReport('Limit içe aktarma tamamlandı', ok, errs);
  renderAllowancesSettings(document.getElementById('usersSubContent'));
}

/* Kullanıcılar */
async function exportUsersExcel(){
  const roles = (APP.config && APP.config.roles) || [];
  const users = (APP.config && APP.config.users) || [];
  await xlDownload('kullanicilar-' + todayLocalDateStr() + '.xlsx', 'Kullanıcılar', ['Kullanıcı Adı', 'Roller', 'Aktif', 'Şifre'],
    users.map(u => [u.username, roles.filter(r => (u.role_ids || []).includes(r.id)).map(r => r.name).join(', '), u.is_active === false ? 'Hayır' : 'Evet', '']), [22, 30, 8, 16]);
}
async function downloadUserTemplate(){
  const roles = ((APP.config && APP.config.roles) || []).map(r => r.name);
  await xlDownload('kullanici-sablonu.xlsx', 'Kullanıcılar', ['Kullanıcı Adı', 'Roller', 'Aktif', 'Şifre'],
    [['ayse', roles[0] || 'Garson', 'Evet', 'Sifre123'], ['mehmet', roles.slice(0, 2).join(', ') || 'Mutfak', 'Evet', 'Sifre456']], [22, 30, 8, 16]);
}
async function importUsersExcel(){
  const rows = await xlPickRows(); if(!rows) return;
  if(!rows.length){ alert('Dosyada satır bulunamadı'); return; }
  const roles = (APP.config && APP.config.roles) || [];
  const errs = []; let ok = 0;
  const session = getSession();
  await withLoadingOverlay((async () => {
    for(const [i, r] of rows.entries()){
      const line = 'Satır ' + (i + 2);
      const username = xlPick(r, 'Kullanıcı Adı', 'Kullanıcı', 'Ad');
      if(!username){ errs.push(line + ': kullanıcı adı boş'); continue; }
      const roleNames = xlPick(r, 'Roller', 'Rol').split(/[,;/]+/).map(x => x.trim()).filter(Boolean);
      const bad = roleNames.filter(n => !roles.some(ro => xlKey(ro.name) === xlKey(n)));
      if(bad.length){ errs.push(line + ` (${username}): rol bulunamadı: ${bad.join(', ')}`); continue; }
      const roleIds = roleNames.map(n => roles.find(ro => xlKey(ro.name) === xlKey(n)).id);
      const password = xlPick(r, 'Şifre', 'Sifre', 'Parola');
      const ex = ((APP.config && APP.config.users) || []).find(u => xlKey(u.username) === xlKey(username));
      let error;
      if(ex){
        ({ error } = await sb.rpc('update_staff_user', { p_token: session.session_token, p_user_id: ex.id, p_username: ex.username, p_password: password || null, p_role_ids: roleIds.length ? roleIds : (ex.role_ids || []) }));
        const want = xlBool(xlPick(r, 'Aktif', 'Durum'), ex.is_active !== false);
        if(!error && want !== (ex.is_active !== false)) ({ error } = await sb.rpc('set_staff_user_active', { p_token: session.session_token, p_user_id: ex.id, p_active: want }));
      } else {
        if(!password){ errs.push(line + ` (${username}): yeni kullanıcı için şifre gerekli`); continue; }
        if(!roleIds.length){ errs.push(line + ` (${username}): en az 1 rol gerekli`); continue; }
        ({ error } = await sb.rpc('create_staff_user', { p_token: session.session_token, p_username: username, p_password: password, p_role_ids: roleIds }));
      }
      if(error) errs.push(line + ` (${username}): ${error.message}`); else ok++;
    }
  })());
  xlReport('Kullanıcı içe aktarma tamamlandı', ok, errs);
  const { data } = await sb.rpc('get_restaurant_config', { p_token: session.session_token });
  if(data) APP.config = data;
  renderSettingsView(document.getElementById('main'), session);
}
/* Ortak araç çubuğu: Dışa aktar · İçe aktar · Şablon */
function excelBarHtml(kind){
  const fn = kind === 'users' ? ['exportUsersExcel', 'importUsersExcel', 'downloadUserTemplate'] : ['exportAllowancesExcel', 'importAllowancesExcel', 'downloadAllowanceTemplate'];
  return `<div class="xl-bar">
    <button type="button" class="xl-btn" ${act(fn[0])}><span>⬇️</span>Dışa aktar</button>
    <button type="button" class="xl-btn" ${act(fn[1])}><span>⬆️</span>İçe aktar</button>
    <button type="button" class="xl-link" ${act(fn[2])}>📄 Şablon indir</button>
  </div>`;
}
