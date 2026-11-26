/* Mal Kabul · hızlı fiyat girişi
   Fiyatları tek tek yazmak yerine:
   1) Son fiyatlarla doldur: her malzemenin son alış fiyatı (aynı tedarikçi önce) kutulara gelir.
   2) Tedarikçinin fiyatları: tedarikçi sipariş bağlantısından fiyat girdiyse tek tuşla alınır.
   3) Faturayı okut: fotoğraf / PDF yapay zekayla okunur (api/review-photo?invoice=1 → api/_invoice-read.js).
   4) e-Fatura dosyası: GİB / entegratörden inen UBL-TR XML doğrudan okunur (internet gerekmez).
   3 ve 4'te satırlar siparişteki malzemelerle eşleştirilip onaya sunulur; eşleşen isimler hatırlanır. */
let FP_LAST = null, FP_ALIAS = null, FP_CUR = null;

async function fpLoadLast(){
  if(FP_LAST && Date.now() - FP_LAST.at < 5 * 60000) return FP_LAST;
  const { data } = await sb.rpc('get_last_purchase_prices', { p_token: getSession().session_token });
  FP_LAST = { at: Date.now(), rows: data || [] };
  return FP_LAST;
}
async function fpLoadAlias(){
  if(FP_ALIAS) return FP_ALIAS;
  try{ const { data } = await sb.rpc('list_purchase_aliases', { p_token: getSession().session_token }); FP_ALIAS = data || {}; }catch(e){ FP_ALIAS = {}; }
  return FP_ALIAS;
}
function fpLastFor(ingId, supId){
  const rows = ((FP_LAST && FP_LAST.rows) || []).filter(r => r.i === ingId);
  if(!rows.length) return null;
  const same = rows.find(r => supId && r.s === supId);
  if(same) return same;
  return rows.slice().sort((a, b) => String(b.d || '').localeCompare(String(a.d || '')))[0];
}
function fpPo(){ return (APP.procRows || []).find(x => x.id === FP_CUR); }
function fpEmptyItems(p){ return (p.items || []).filter(i => { const c = document.getElementById('podC-' + i.id); return c && String(c.value).trim() === ''; }); }

function fpBarHtml(p){
  if(!p || p.status === 'cancelled') return '';
  FP_CUR = p.id;
  const sp = (p.items || []).filter(i => Number(i.sp) >= 0 && i.sp != null && !(Number(i.unit_cost) > 0) && !i.free).length;
  return `<div class="fp-bar"><span class="fp-t">⚡ Fiyatları hızlı gir:</span>
    <button type="button" class="pc-btn" ${act('fpFillLast')} title="Boş fiyat kutularına her malzemenin son alış fiyatını yazar (önce aynı tedarikçi)">↺ Son fiyatlarla doldur</button>
    ${sp ? `<button type="button" class="pc-btn fp-sp" ${act('fpFillSupplier')} title="Tedarikçinin sipariş bağlantısından girdiği fiyatları alır">✅ Tedarikçinin fiyatlarını al (${sp})</button>` : ''}
    <button type="button" class="pc-btn" ${act('fpPick', 'photo')} title="Faturanın / irsaliyenin fotoğrafını çekin ya da PDF seçin">📷 Faturayı okut</button>
    <button type="button" class="pc-btn" ${act('fpPick', 'xml')} title="GİB portalından ya da entegratörünüzden indirdiğiniz e-Fatura XML dosyası">🧾 e-Fatura dosyası</button></div>`;
}
// Boş fiyat kutularına "son: 120 ₺" ipucu.
async function fpDecorate(p){
  try{ await fpLoadLast(); }catch(e){ return; }
  (p.items || []).forEach(i => {
    const c = document.getElementById('podC-' + i.id); if(!c || String(c.value).trim() !== '') return;
    const sp = i.sp != null && !(Number(i.unit_cost) > 0) ? Number(i.sp) : null;
    const l = fpLastFor(i.ingredient_id, p.supplier_id);
    const f = fpUnitF(i.id);
    if(sp != null) c.placeholder = 'tedarikçi: ' + fmtQty(unitRound(sp * f * 100) / 100);
    else if(l) c.placeholder = 'son: ' + fmtQty(unitRound(Number(l.c) * f * 100) / 100);
  });
}
function fpUnitF(itemId){ const us = document.getElementById('podU-' + itemId); return us ? (parseFloat(us.value) || 1) : 1; }
// Temel birim fiyatlarını kutulara yazar ve kaydeder. map: { itemId: ₺ / temel birim }
async function fpApply(map, label){
  const ids = Object.keys(map).filter(id => document.getElementById('podC-' + id) && map[id] != null && map[id] >= 0);
  if(!ids.length){ showToast('Doldurulacak fiyat bulunamadı'); return 0; }
  for(const id of ids){
    const c = document.getElementById('podC-' + id);
    c.value = String(unitRound(map[id] * fpUnitF(id) * 10000) / 10000);
    if(map[id] === 0) c.dataset.zeroOk = '1';
    podCostInput(id);
    clearTimeout(POD_SAVE_T[id]); await podCostSaveNow(id);
  }
  showToast('✓ ' + ids.length + ' kalemin fiyatı ' + label);
  return ids.length;
}
async function fpFillLast(){
  const p = fpPo(); if(!p) return;
  await withLoadingOverlay(fpLoadLast());
  const map = {};
  fpEmptyItems(p).forEach(i => { const l = fpLastFor(i.ingredient_id, p.supplier_id); if(l) map[i.id] = Number(l.c); });
  if(!Object.keys(map).length){ uiAlert('Boş fiyat kutusu olan malzemelerin daha önce fiyatlı bir alışı yok. İlk seferde fiyatı girin, sonrakilerde buradan gelir.', { title: 'Son fiyat yok', icon: 'ℹ️' }); return; }
  await fpApply(map, 'son alış fiyatıyla dolduruldu · değişen varsa üzerine yazın');
}
async function fpFillSupplier(){
  const p = fpPo(); if(!p) return;
  const map = {};
  (p.items || []).forEach(i => { if(i.sp != null && !(Number(i.unit_cost) > 0) && !i.free) map[i.id] = Number(i.sp); });
  await fpApply(map, 'tedarikçinin fiyatıyla kaydedildi');
}

/* ---- Dosyadan okuma ---- */
function fpPick(kind){
  const inp = document.createElement('input'); inp.type = 'file';
  inp.accept = kind === 'xml' ? '.xml,text/xml,application/xml' : 'image/*,application/pdf';
  if(kind !== 'xml') inp.setAttribute('capture', 'environment');
  inp.onchange = () => { const f = inp.files && inp.files[0]; if(f) fpReadFile(f, kind); };
  inp.click();
}
function fpB64(blob){ return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = no; r.readAsDataURL(blob); }); }
// Telefon fotoğrafı küçültülür (sunucu sınırı ve hız için); yazı okunur kalır.
function fpShrink(file){
  return new Promise((ok) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const m = 2200, k = Math.min(1, m / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      cv.toBlob(b => ok(b || file), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); ok(file); };
    img.src = url;
  });
}
async function fpReadFile(file, kind){
  try{
    if(kind === 'xml' || /\.xml$/i.test(file.name)){
      const doc = fpParseUbl(await file.text());
      if(!doc.lines.length){ uiAlert('Bu dosyada e-Fatura satırı bulunamadı. GİB / entegratörden indirilen .xml dosyasını seçin.', { title: 'Okunamadı', icon: '⚠️' }); return; }
      return fpReview(doc);
    }
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const blob = isPdf ? file : await fpShrink(file);
    if(blob.size > 3.2 * 1024 * 1024){ uiAlert('Dosya çok büyük (en fazla 3 MB). PDF ise sadece fatura sayfasını kaydedin.', { title: 'Dosya büyük', icon: '⚠️' }); return; }
    const data = await fpB64(blob);
    const r = await withLoadingOverlay(fetch('/api/review-photo?invoice=1', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getSession().session_token, mime: isPdf ? 'application/pdf' : 'image/jpeg', data }) }));
    const j = await r.json().catch(() => ({}));
    if(!r.ok){ uiAlert(j.error || 'Belge okunamadı.', { title: 'Fatura okunamadı', icon: '⚠️' }); return; }
    fpReview({ supplier: j.supplier, no: j.invoice_no, date: j.date, incl: !!j.prices_include_vat, lines: j.lines || [] });
  }catch(e){ uiAlert('Belge okunamadı: ' + (e && e.message || e), { title: 'Hata', icon: '⚠️' }); }
}
/* e-Fatura (UBL-TR) XML: cac:InvoiceLine satırları. Fiyatlar KDV hariçtir. */
const FP_UBL_UNIT = { KGM: 'kg', GRM: 'gram', LTR: 'lt', MLT: 'ml', C62: 'adet', NIU: 'adet', EA: 'adet', H87: 'adet', PR: 'çift', BX: 'koli', PA: 'paket', PK: 'paket', CS: 'kasa', BG: 'çuval', CT: 'koli', CA: 'kutu', TNE: 'ton' };
function fpParseUbl(text){
  const x = new DOMParser().parseFromString(text, 'application/xml');
  const kids = (el, n) => el ? [...el.children].filter(c => c.localName === n) : [];
  const one = (el, ...path) => { let cur = el; for(const n of path){ cur = kids(cur, n)[0]; if(!cur) return null; } return cur; };
  const num = (el) => el ? parseFloat(el.textContent) || 0 : 0;
  const root = x.documentElement;
  const lines = [...x.getElementsByTagNameNS('*', 'InvoiceLine')].concat([...x.getElementsByTagNameNS('*', 'DespatchLine')]).map(l => {
    const q = one(l, 'InvoicedQuantity') || one(l, 'DeliveredQuantity'), code = q ? q.getAttribute('unitCode') || '' : '';
    const qty = num(q), total = num(one(l, 'LineExtensionAmount'));
    const price = num(one(l, 'Price', 'PriceAmount')) || (qty ? total / qty : 0);
    const vat = num(one(l, 'TaxTotal', 'TaxSubtotal', 'Percent')) || num(one(l, 'TaxTotal', 'TaxSubtotal', 'TaxCategory', 'Percent'));
    return { name: (one(l, 'Item', 'Name') || {}).textContent || '', quantity: qty, unit: FP_UBL_UNIT[code] || code.toLowerCase(), unit_price: price, vat_rate: vat, line_total: total };
  }).filter(l => l.name);
  const sup = one(root, 'AccountingSupplierParty', 'Party', 'PartyName', 'Name') || one(root, 'DespatchSupplierParty', 'Party', 'PartyName', 'Name');
  return { supplier: sup ? sup.textContent : '', no: (one(root, 'ID') || {}).textContent || '', date: (one(root, 'IssueDate') || {}).textContent || '', incl: false, lines };
}

/* ---- Eşleştirme ---- */
const FP_STOP = new Set(['kg', 'gr', 'g', 'gram', 'lt', 'l', 'litre', 'ml', 'adet', 'ad', 'x', 'li', 'lı', 'lu', 'lü', 'koli', 'paket', 'pk', 'kasa', 'kutu', 'cuval', 'çuval', 'bidon', 'şişe', 'sise', 'kg.', 'tane', 've', 'ile']);
function fpKey(s){ return String(s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim(); }
function fpTok(s){ return fpKey(s).replace(/[^a-zçğıöşü\s]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !FP_STOP.has(t)); }
function fpScore(a, b){
  const A = fpTok(a), B = fpTok(b); if(!A.length || !B.length) return 0;
  let hit = 0; A.forEach(t => { if(B.some(u => u === t || (t.length > 3 && u.length > 3 && (u.startsWith(t) || t.startsWith(u))))) hit++; });
  return hit / Math.max(A.length, B.length) + (fpKey(a).includes(fpKey(b)) || fpKey(b).includes(fpKey(a)) ? 0.3 : 0);
}
function fpMatch(line, items, used){
  const a = (FP_ALIAS || {})[fpKey(line.name)];
  if(a){ const it = items.find(i => i.ingredient_id === a && !used.has(i.id)); if(it) return it; }
  let best = null, bs = 0.34;
  items.forEach(i => { if(used.has(i.id)) return; const s = fpScore(line.name, i.name); if(s > bs){ bs = s; best = i; } });
  return best;
}
// Fatura birimi → malzemenin temel biriminde kaç birim (fiyat buna bölünür, miktar bununla çarpılır).
function fpFactor(unit, ig){
  const u = fpKey(unit), base = fpKey(ig && ig.unit);
  const n = (u.match(/(\d+(?:[.,]\d+)?)\s*'?\s*(li|lı|lu|lü|adet|x)/) || [])[1];
  if(/koli|paket|kasa|kutu|çuval|cuval|bidon|kolı|pk|bx/.test(u)){
    if(n) return parseFloat(n.replace(',', '.'));
    const pk = typeof ingDefaultPack === 'function' ? ingDefaultPack(ig) : null; return pk ? pk.f : 1;
  }
  const isKg = /^kg|kilo/.test(u), isG = /^(gr|g|gram)\b/.test(u), isL = /^(lt|l|litre)\b/.test(u), isMl = /^ml/.test(u);
  if(base === 'gram' && isKg) return 1000; if(base === 'kg' && isG) return 0.001;
  if(base === 'ml' && isL) return 1000; if(base === 'lt' && isMl) return 0.001;
  return 1;
}

function fpReview(doc){
  const p = fpPo(); if(!p){ uiAlert('Önce bir siparişin detayını açın.'); return; }
  const items = (p.items || []).filter(i => !i.free), igOf = (i) => poIgOf(i);
  const used = new Set(), vatPref = (() => { try{ return localStorage.getItem('fp_vat'); }catch(e){ return null; } })();
  const addVat = vatPref == null ? !doc.incl : vatPref === '1' && !doc.incl;
  fpLoadAlias().then(() => {});
  const rows = doc.lines.map((l, k) => { const m = fpMatch(l, items, used); if(m) used.add(m.id); return { k, l, m }; });
  document.getElementById('fpRevBg')?.remove();
  const bg = document.createElement('div'); bg.id = 'fpRevBg'; bg.className = 'modal-bg';
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  APP.fpDoc = { doc, rows };
  const opts = (sel) => `<option value="">— eşleşme yok, atla —</option>` + items.map(i => `<option value="${i.id}" ${sel && sel.id === i.id ? 'selected' : ''}>${escapeHtml(i.name)}</option>`).join('');
  bg.innerHTML = `<div class="box fp-rev">
    <div class="u-row-sb"><h2 class="u-m0">🧾 Faturadan fiyatlar</h2><span class="u-xclose" ${act('removeEl', 'fpRevBg')}>✕</span></div>
    <p class="muted fp-meta">${escapeHtml([doc.supplier, doc.no && ('No ' + doc.no), doc.date].filter(Boolean).join(' · ') || 'Belge okundu')} · ${doc.lines.length} satır, ${rows.filter(r => r.m).length} tanesi siparişle eşleşti. Eşleşmeyenleri listeden seçin; bir kez seçtiğiniz isim sonra hatırlanır.</p>
    ${doc.incl ? '' : `<label class="fp-vat"><input type="checkbox" id="fpVat" ${addVat ? 'checked' : ''} ${actOn('change', 'fpRecalc', [])}> Fiyatlara KDV ekle <small class="muted">(faturadaki birim fiyatlar KDV hariç)</small></label>`}
    <div class="fp-rows">${rows.map(r => `<div class="fp-row" data-k="${r.k}">
      <div class="fp-src"><b>${escapeHtml(r.l.name)}</b><small>${fmtQty(r.l.quantity)} ${escapeHtml(r.l.unit || '')} × ${money(r.l.unit_price)}${r.l.vat_rate ? ' · KDV %' + fmtQty(r.l.vat_rate) : ''}</small></div>
      <span class="fp-arrow">→</span>
      <div class="fp-dst"><select class="fp-sel" ${actOn('change', 'fpRecalc', [])}>${opts(r.m)}</select><small class="fp-eq muted"></small></div></div>`).join('')}</div>
    ${p.status === 'ordered' || p.status === 'partial' ? `<label class="fp-vat"><input type="checkbox" id="fpQty" checked> Gelen miktarları da faturadaki gibi doldur</label>` : ''}
    <div class="fp-foot"><button type="button" class="ghost-btn" ${act('removeEl', 'fpRevBg')}>Vazgeç</button><button type="button" id="fpGo" ${act('fpCommit')}>✓ Fiyatları aktar</button></div></div>`;
  document.body.appendChild(bg);
  fpRecalc();
}
function fpRowCalc(r, itemId){
  const p = fpPo(), it = (p.items || []).find(i => i.id === itemId); if(!it) return null;
  const ig = poIgOf(it), f = fpFactor(r.l.unit, ig) || 1, vat = document.getElementById('fpVat'), addV = vat && vat.checked ? (Number(r.l.vat_rate) || 0) : 0;
  const unitPrice = Number(r.l.unit_price) || (Number(r.l.quantity) ? Number(r.l.line_total) / Number(r.l.quantity) : 0);
  return { it, ig, base: unitPrice * (1 + addV / 100) / f, qty: (Number(r.l.quantity) || 0) * f };
}
function fpRecalc(){
  const st = APP.fpDoc; if(!st) return; let n = 0;
  document.querySelectorAll('#fpRevBg .fp-row').forEach(el => {
    const r = st.rows[Number(el.dataset.k)], id = el.querySelector('.fp-sel').value, eq = el.querySelector('.fp-eq');
    const c = id ? fpRowCalc(r, id) : null; el.classList.toggle('off', !c);
    eq.textContent = c ? '= ' + money(c.base) + ' / ' + unitShort(c.ig.unit || c.it.unit || '') : '';
    if(c) n++;
  });
  const v = document.getElementById('fpVat'); if(v){ try{ localStorage.setItem('fp_vat', v.checked ? '1' : '0'); }catch(e){} }
  const b = document.getElementById('fpGo'); if(b) b.textContent = '✓ ' + n + ' fiyatı aktar';
}
async function fpCommit(){
  const st = APP.fpDoc; if(!st) return;
  const map = {}, alias = [], qtyOn = (document.getElementById('fpQty') || {}).checked;
  document.querySelectorAll('#fpRevBg .fp-row').forEach(el => {
    const r = st.rows[Number(el.dataset.k)], id = el.querySelector('.fp-sel').value; if(!id) return;
    const c = fpRowCalc(r, id); if(!c) return;
    map[id] = Math.round(c.base * 1e6) / 1e6;
    if(c.it.ingredient_id) alias.push({ k: fpKey(r.l.name), i: c.it.ingredient_id });
    if(qtyOn){ const q = document.querySelector('#poDetailBg .recv-qty-input[data-item-id="' + id + '"]');
      if(q){ const us = q.parentElement.querySelector('.recv-unit'), f = us ? (parseFloat(us.value) || 1) : 1; q.value = String(unitRound(c.qty / f)); } }
  });
  document.getElementById('fpRevBg')?.remove();
  if(alias.length){ sb.rpc('save_purchase_aliases', { p_token: getSession().session_token, p_items: alias }).then(() => { FP_ALIAS = null; }); }
  await fpApply(map, 'faturadan aktarıldı');
  if(qtyOn) showToast('Miktarlar da dolduruldu · kontrol edip "Teslim al" deyin');
}
