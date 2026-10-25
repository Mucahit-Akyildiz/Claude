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
  const ln = e => /^Satır \d/.test(e) ? parseInt(e.slice(6), 10) : 1e9; errs = errs.slice().sort((a, b) => ln(a) - ln(b));
  alert(`${title}\n\n✓ ${ok} satır işlendi${errs.length ? `\n✗ ${errs.length} satır atlandı:\n\n` + errs.slice(0, 15).join('\n') + (errs.length > 15 ? `\n… ve ${errs.length - 15} satır daha` : '') : ''}`);
}

/* Limitler */
const AL_HEAD = ['Tür', 'Ad', 'Telefon', 'Dönem', 'Limit', 'Sipariş Etiketi', 'Aktif', 'Kalan', 'Bugün Harcanan'];
async function exportAllowancesExcel(){
  const list = await loadAllowances();
  await xlDownload('limitler-' + todayLocalDateStr() + '.xlsx', 'Limitler', AL_HEAD, list.map(a => [
    a.kind === 'person' ? 'Kişi' : 'Kullanıcı', a.name || '', a.phone || '', a.kind === 'person' ? 'Günlük' : a.period === 'monthly' ? 'Aylık' : 'Günlük',
    Number(a.limit_amount), a.flag_label || '', a.is_active ? 'Evet' : 'Hayır', Number(a.remaining), Number(a.used_today)]), [11, 26, 15, 10, 10, 18, 8, 10, 15]);
}
async function downloadAllowanceTemplate(){
  const flags = ((APP.config && APP.config.order_flags) || []).map(f => f.label);
  const u = ((APP.config && APP.config.users) || [])[0];
  await xlDownload('limit-sablonu.xlsx', 'Limitler', AL_HEAD.slice(0, 7), [
    ['Kişi', 'Ahmet Yılmaz', '05321234567', 'Günlük', 250, flags.find(f => /talebe|öğrenci/i.test(f)) || flags[0] || '', 'Evet'],
    ['Kullanıcı', u ? u.username : 'kullanici_adi', '', 'Aylık', 3000, flags.find(f => /personel/i.test(f)) || flags[0] || '', 'Evet']], [11, 26, 15, 10, 10, 18, 8]);
}
async function importAllowancesExcel(){
  const rows = await xlPickRows(); if(!rows) return;
  if(!rows.length){ alert('Dosyada satır bulunamadı'); return; }
  const list = await loadAllowances();
  const users = (APP.config && APP.config.users) || [];
  const flags = ((APP.config && APP.config.order_flags) || []).map(f => f.label);
  const errs = [], plan = []; let ok = 0;
  await withLoadingOverlay((async () => {
    rows.forEach((r, i) => {
      const line = 'Satır ' + (i + 2);
      const kind = /kullan/i.test(xlPick(r, 'Tür', 'Tur', 'Tip')) ? 'user' : 'person';
      const name = xlPick(r, 'Ad', 'Ad Soyad', 'İsim', 'Kullanıcı', 'Kullanıcı Adı');
      const lim = xlNum(xlPick(r, 'Limit', 'Günlük Limit', 'Tutar'));
      if(!name){ errs.push(line + ': ad boş'); return; }
      if(!isFinite(lim) || lim < 0){ errs.push(line + ` (${name}): limit geçersiz`); return; }
      let flag = xlPick(r, 'Sipariş Etiketi', 'Etiket');
      if(flag){ const m = flags.find(f => xlKey(f) === xlKey(flag)); if(!m){ errs.push(line + ` (${name}): "${flag}" etiketi yok`); return; } flag = m; }
      const period = /ay/i.test(xlPick(r, 'Dönem', 'Donem', 'Periyot')) ? 'monthly' : 'daily';
      const p = { kind, limit_amount: lim, flag_label: flag, period, is_active: xlBool(xlPick(r, 'Aktif', 'Durum'), true) };
      if(kind === 'user'){
        const u = users.find(x => xlKey(x.username) === xlKey(name));
        if(!u){ errs.push(line + `: "${name}" adlı kullanıcı yok`); return; }
        p.user_id = u.id; const ex = list.find(a => a.kind === 'user' && a.user_id === u.id); if(ex) p.id = ex.id;
      } else {
        p.name = name; p.phone = xlPick(r, 'Telefon', 'Tel', 'GSM'); const ex = list.find(a => a.kind === 'person' && xlKey(a.name) === xlKey(name)); if(ex) p.id = ex.id;
      }
      plan.push({ line, name, p });
    });
    (await bulkRpc('save_allowance', plan.map(x => ({ p_data: x.p })))).forEach((r, k) => { if(r.error) errs.push(plan[k].line + ` (${plan[k].name}): ${r.error.message}`); else ok++; });
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
  const errs = [], upd = [], add = []; let ok = 0;
  const session = getSession();
  await withLoadingOverlay((async () => {
    rows.forEach((r, i) => {
      const line = 'Satır ' + (i + 2);
      const username = xlPick(r, 'Kullanıcı Adı', 'Kullanıcı', 'Ad');
      if(!username){ errs.push(line + ': kullanıcı adı boş'); return; }
      const roleNames = xlPick(r, 'Roller', 'Rol').split(/[,;/]+/).map(x => x.trim()).filter(Boolean);
      const bad = roleNames.filter(n => !roles.some(ro => xlKey(ro.name) === xlKey(n)));
      if(bad.length){ errs.push(line + ` (${username}): rol bulunamadı: ${bad.join(', ')}`); return; }
      const roleIds = roleNames.map(n => roles.find(ro => xlKey(ro.name) === xlKey(n)).id);
      const password = xlPick(r, 'Şifre', 'Sifre', 'Parola');
      const ex = ((APP.config && APP.config.users) || []).find(u => xlKey(u.username) === xlKey(username));
      if(ex){
        const want = xlBool(xlPick(r, 'Aktif', 'Durum'), ex.is_active !== false);
        upd.push({ line, username, active: want !== (ex.is_active !== false) ? want : null, a: { p_user_id: ex.id, p_username: ex.username, p_password: password || null, p_role_ids: roleIds.length ? roleIds : (ex.role_ids || []) } });
      } else {
        if(!password){ errs.push(line + ` (${username}): yeni kullanıcı için şifre gerekli`); return; }
        if(!roleIds.length){ errs.push(line + ` (${username}): en az 1 rol gerekli`); return; }
        add.push({ line, username, a: { p_username: username, p_password: password, p_role_ids: roleIds } });
      }
    });
    const fail = (x, e) => errs.push(x.line + ` (${x.username}): ${e.message}`);
    const [ru, ra] = await Promise.all([bulkRpc('update_staff_user', upd.map(x => x.a)), bulkRpc('create_staff_user', add.map(x => x.a))]);
    ra.forEach((r, k) => r.error ? fail(add[k], r.error) : ok++);
    const toAct = upd.filter((x, k) => { if(ru[k].error){ fail(x, ru[k].error); return false; } if(x.active === null){ ok++; return false; } return true; });
    (await bulkRpc('set_staff_user_active', toAct.map(x => ({ p_user_id: x.a.p_user_id, p_active: x.active })))).forEach((r, k) => r.error ? fail(toAct[k], r.error) : ok++);
  })());
  xlReport('Kullanıcı içe aktarma tamamlandı', ok, errs);
  const { data } = await sb.rpc('get_restaurant_config', { p_token: session.session_token });
  if(data) APP.config = data;
  renderSettingsView(document.getElementById('main'), session);
}
/* Ürünler */
const PR_HEAD = ['Ürün Adı', 'Fiyat', 'Maliyet', 'Menü', 'İstasyon', 'KDV %', 'Stok', 'Satışta'];
async function exportProductsExcel(){
  const c = APP.config || {}, mn = (id) => ((c.menus || []).find(m => m.id === id) || {}).name || '', st = (id) => ((c.stations || []).find(x => x.id === id) || {}).name || '';
  await xlDownload('urunler-' + todayLocalDateStr() + '.xlsx', 'Ürünler', PR_HEAD, (c.products || []).filter(p => !p.parent_id).map(p => [p.name, Number(p.price) || 0, Number(p.cost) || 0, mn(p.menu_id), st(p.station_id),
    p.vat_rate == null ? '' : Number(p.vat_rate), p.stock == null ? '' : p.stock, p.available === false ? 'Hayır' : 'Evet']), [30, 10, 10, 18, 16, 8, 8, 8]);
}
async function downloadProductTemplate(){
  const c = APP.config || {}, m = (c.menus || [])[0], s = (c.stations || [])[0];
  await xlDownload('urun-sablonu.xlsx', 'Ürünler', PR_HEAD, [['Mercimek Çorbası', 90, 25, m ? m.name : 'Çorbalar', s ? s.name : '', 10, '', 'Evet'], ['Ayran', 30, 8, m ? m.name : 'İçecekler', s ? s.name : '', '', 100, 'Evet']], [30, 10, 10, 18, 16, 8, 8, 8]);
}
async function importProductsExcel(){
  const rows = await xlPickRows(); if(!rows) return;
  if(!rows.length){ alert('Dosyada satır bulunamadı'); return; }
  const c = APP.config || {}, session = getSession(), errs = [], plan = []; let ok = 0, nocost = 0;
  const find = (list, v) => (list || []).find(x => xlKey(x.name) === xlKey(v));
  await withLoadingOverlay((async () => {
    rows.forEach((r, i) => {
      const line = 'Satır ' + (i + 2), name = xlPick(r, 'Ürün Adı', 'Ürün', 'Ad');
      if(!name){ errs.push(line + ': ürün adı boş'); return; }
      const price = xlNum(xlPick(r, 'Fiyat', 'Satış Fiyatı')); if(!isFinite(price) || price < 0){ errs.push(line + ` (${name}): fiyat geçersiz`); return; }
      const costRaw = xlPick(r, 'Maliyet'), cost = costRaw === '' ? 0 : xlNum(costRaw); if(!isFinite(cost) || cost < 0){ errs.push(line + ` (${name}): maliyet geçersiz`); return; }
      const menuN = xlPick(r, 'Menü', 'Kategori'), stN = xlPick(r, 'İstasyon', 'Istasyon');
      const menu = menuN ? find(c.menus, menuN) : null; if(menuN && !menu){ errs.push(line + ` (${name}): "${menuN}" menüsü yok`); return; }
      const stn = stN ? find(c.stations, stN) : null; if(stN && !stn){ errs.push(line + ` (${name}): "${stN}" istasyonu yok`); return; }
      const stockRaw = xlPick(r, 'Stok'), stock = stockRaw === '' ? null : parseInt(xlNum(stockRaw), 10);
      const vatRaw = xlPick(r, 'KDV %', 'KDV');
      const ex = (c.products || []).find(p => !p.parent_id && xlKey(p.name) === xlKey(name));
      plan.push({ line, name, ex, menu, vatRaw, cost, a: { p_id: ex ? ex.id : null, p_name: name, p_price: price, p_cost: cost,
        p_station_id: stn ? stn.id : (menu && menu.station_id) || (ex && ex.station_id) || null, p_stock: stock, p_available: xlBool(xlPick(r, 'Satışta', 'Aktif'), ex ? ex.available !== false : true) } });
    });
    const res = await bulkRpc('upsert_product', plan.map(x => x.a)), menus = [], vats = [];
    plan.forEach((x, k) => {
      if(res[k].error){ errs.push(x.line + ` (${x.name}): ${res[k].error.message}`); return; }
      const pid = (x.ex && x.ex.id) || res[k].data; ok++; if(!(x.cost > 0)) nocost++;
      if(pid && x.menu && (!x.ex || x.ex.menu_id !== x.menu.id)) menus.push({ x, a: { p_product_id: pid, p_menu_id: x.menu.id } });
      if(pid && x.vatRaw !== '') vats.push({ x, a: { p_product_id: pid, p_rate: xlNum(x.vatRaw) } });
    });
    const [rm, rv] = await Promise.all([bulkRpc('set_product_menu', menus.map(m => m.a)), bulkRpc('set_product_vat', vats.map(v => v.a))]);
    rm.forEach((r, k) => { if(r.error) errs.push(menus[k].x.line + ` (${menus[k].x.name}): menü — ${r.error.message}`); });
    rv.forEach((r, k) => { if(r.error) errs.push(vats[k].x.line + ` (${vats[k].x.name}): KDV — ${r.error.message}`); });
  })());
  xlReport('Ürün içe aktarma tamamlandı', ok, errs.concat(nocost ? [`ℹ️ ${nocost} ürünün maliyeti boş — ayar açıksa satışa kapalı geldi`] : []));
  renderSettingsView(document.getElementById('main'), session);
}
/* Hammaddeler */
const IG_HEAD = ['Hammadde Adı', 'Birim', 'Stok', 'Fire %', 'Min Stok'];
const IG_UNITS = ['adet', 'gram', 'kg', 'ml', 'lt'];
async function exportIngredientsExcel(){
  await xlDownload('hammaddeler-' + todayLocalDateStr() + '.xlsx', 'Hammaddeler', IG_HEAD.concat(['Kullanıldığı ürün']),
    ((APP.config || {}).ingredients || []).map(i => [i.name, i.unit, Number(i.stock) || 0, Number(i.waste_pct) || 0, Number(i.min_stock) || '',
      ((APP.config.products || []).filter(p => (p.recipe || []).some(r => r.ingredient_id === i.id)).length)]), [28, 8, 10, 8, 10, 16]);
}
async function downloadIngredientTemplate(){
  await xlDownload('hammadde-sablonu.xlsx', 'Hammaddeler', IG_HEAD, [['Döner Eti', 'kg', 20, 10, 5], ['Lavaş', 'adet', 200, 0, 50]], [28, 8, 10, 8, 10]);
}
async function importIngredientsExcel(){
  const rows = await xlPickRows(); if(!rows) return;
  if(!rows.length){ alert('Dosyada satır bulunamadı'); return; }
  const session = getSession(), list = (APP.config || {}).ingredients || [], errs = [], plan = []; let ok = 0;
  await withLoadingOverlay((async () => {
    rows.forEach((r, i) => {
      const line = 'Satır ' + (i + 2), name = xlPick(r, 'Hammadde Adı', 'Hammadde', 'Ad');
      if(!name){ errs.push(line + ': hammadde adı boş'); return; }
      const ex = list.find(x => xlKey(x.name) === xlKey(name));
      let unit = xlPick(r, 'Birim').toLocaleLowerCase('tr').trim(); if(unit === 'litre') unit = 'lt'; if(unit === 'gr' || unit === 'g') unit = 'gram';
      if(!unit) unit = ex ? ex.unit : 'adet';
      if(!IG_UNITS.includes(unit)){ errs.push(line + ` (${name}): birim "${unit}" geçersiz (adet, gram, kg, ml, lt)`); return; }
      const num = (k, d) => { const v = xlPick(r, ...k); return v === '' ? d : xlNum(v); };
      const stock = num(['Stok'], ex ? Number(ex.stock) || 0 : 0), waste = num(['Fire %', 'Fire'], ex ? Number(ex.waste_pct) || 0 : 0), min = num(['Min Stok', 'Min'], ex ? Number(ex.min_stock) || 0 : 0);
      if(![stock, waste, min].every(isFinite) || waste < 0 || waste >= 100){ errs.push(line + ` (${name}): sayı geçersiz`); return; }
      plan.push({ line, name, ex, min, a: { p_id: ex ? ex.id : null, p_name: name, p_unit: unit, p_stock: stock, p_waste_pct: waste } });
    });
    const res = await bulkRpc('upsert_ingredient', plan.map(x => x.a)), mins = [];
    plan.forEach((x, k) => { if(res[k].error){ errs.push(x.line + ` (${x.name}): ${res[k].error.message}`); return; } ok++; const iid = (x.ex && x.ex.id) || res[k].data; if(iid) mins.push({ x, a: { p_id: iid, p_min: x.min || 0 } }); });
    (await bulkRpc('set_ingredient_min', mins.map(m => m.a))).forEach((r, k) => { if(r.error) errs.push(mins[k].x.line + ` (${mins[k].x.name}): min — ${r.error.message}`); });
  })());
  xlReport('Hammadde içe aktarma tamamlandı', ok, errs);
  renderSettingsView(document.getElementById('main'), session);
}
/* Ortak araç çubuğu: Dışa aktar · İçe aktar · Şablon */
function excelBarHtml(kind){
  const fn = kind === 'users' ? ['exportUsersExcel', 'importUsersExcel', 'downloadUserTemplate'] : kind === 'products' ? ['exportProductsExcel', 'importProductsExcel', 'downloadProductTemplate'] : kind === 'ingredients' ? ['exportIngredientsExcel', 'importIngredientsExcel', 'downloadIngredientTemplate'] : ['exportAllowancesExcel', 'importAllowancesExcel', 'downloadAllowanceTemplate'];
  return `<div class="xl-bar">
    <button type="button" class="xl-btn" ${act(fn[0])}><span>⬇️</span>Dışa aktar</button>
    <button type="button" class="xl-btn" ${act(fn[1])}><span>⬆️</span>İçe aktar</button>
    <button type="button" class="xl-link" ${act(fn[2])}>📄 Şablon indir</button>
  </div>`;
}
