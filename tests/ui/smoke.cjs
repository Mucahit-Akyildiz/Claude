// Arayüz duman testleri: uygulamayı gerçek tarayıcıda (Chromium) açar, Supabase'i
// tests/ui/fake-supabase.js ile taklit eder; ana ekranları ve kritik akışları gezer.
// Herhangi bir sayfa hatası (JS istisnası) ya da beklenen öğenin bulunmaması testi kırar.
// Çalıştırma: node tests/ui/smoke.cjs   (CI: .github/workflows/ci.yml > ui-tests)
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch(e) { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright')); }
const ROOT = path.resolve(__dirname, '../..');
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
const PUBLIC_FAKE = 'window.supabase={createClient:function(){return {rpc:async function(n){var d=window.__PUBLIC_RPC||{};return {data:d[n]||null,error:null};}};}};';
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.mp3':'audio/mpeg', '.jpg':'image/jpeg' };

function serve(){
  return new Promise(res => {
    const srv = http.createServer((req, out) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if(p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if(!f.startsWith(ROOT) || !fs.existsSync(f)){ out.writeHead(404); return out.end(); }
      let body = fs.readFileSync(f);
      // CDN betiklerinin bütünlük (integrity) kontrolü taklit betikle çakışmasın.
      if(f.endsWith('.html')) body = Buffer.from(body.toString().replace(/ integrity="[^"]*"/g, ''));
      out.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); out.end(body);
    }).listen(0, () => res(srv));
  });
}

const results = [];
async function check(name, fn){
  try { await fn(); results.push([name, true]); console.log('✓', name); }
  catch(e){ results.push([name, false, e.message]); console.log('✗', name, '—', e.message); }
}
const assert = (c, m) => { if(!c) throw new Error(m); };

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  for(const [vp, w, h] of [['masaüstü', 1366, 850], ['telefon', 390, 844]]){
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    // Playwright'ta son eklenen yönlendirme önce çalışır: önce dış istekleri kes, sonra taklit Supabase.
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await ctx.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\//, r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('staff_session', JSON.stringify({ session_token: '0', user_id: 'u1', restaurant_id: 'r1', isManager: true, restaurant_name: 'TEST', username: 'test',
        permissions: ['order','packages','payments','kitchen','reservations','crm','reports','purchasing','purchasing_reports','settings_users','settings_ingredients','printer_settings','settings_billing'] }));
    });
    await page.goto(base + '/app/'); await page.waitForTimeout(1500);
    const view = async (v, sel) => { await page.evaluate(x => goToView(x), v); await page.waitForSelector(sel, { timeout: 8000 }); };
    const T = (n) => `[${vp}] ${n}`;
    await check(T('uygulama açılıyor'), async () => { assert(await page.evaluate(() => typeof goToView === 'function'), 'goToView yok'); });
    await check(T('Sipariş Al ekranı'), () => view('order', '#zoneTabs'));
    await check(T('masa siparişi: ürün ekle'), async () => {
      await page.evaluate(() => openTableModal('t3')); await page.waitForSelector('.pp-card', { timeout: 8000 });
      await page.click('.pp-card >> nth=0'); await page.waitForTimeout(300);
      assert(!(await page.$eval('#confirmBtn', b => b.disabled)), 'ürün ekleyince Onayla butonu aktif olmalı');
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    });
    await check(T('ana sayfa hızlı yönetim + ürün uzun basma düzenleme'), async () => {
      await view('home', '.hq-card');
      await page.evaluate(() => openTableModal('t3')); await page.waitForSelector('.pp-card[data-pid]', { timeout: 8000 });
      await page.click('.pp-card[data-pid] >> nth=0', { button: 'right' }); await page.waitForSelector('#prodDrawer .pdrawer', { timeout: 3000 });
      await page.evaluate(() => closeProdDrawer()); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    });
    await check(T('Ödemeler ekranı + ödeme penceresi'), async () => {
      await view('payments', '#main');
      await page.evaluate(() => openPayModal('o1')); await page.waitForSelector('#payModalBg #payCashBtn', { timeout: 8000 });
      await page.evaluate(() => { togglePayOpt('disc'); }); await page.waitForSelector('#couponCode');
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      assert(!(await page.$('#payModalBg')), 'Esc ödeme penceresini kapatmalı');
    });
    await check(T('Paket Servis + kurye'), async () => {
      await view('packages', '#packageGrid .table-cell');
      await page.evaluate(() => openCourierSheet('o3')); await page.waitForSelector('#courierSheet.open #crChips', { timeout: 5000 });
      await page.evaluate(() => closeSheet());
    });
    await check(T('Mutfak ekranı'), () => view('kitchen', '#main *'));
    await check(T('Rezervasyonlar + yeni rezervasyon penceresi'), async () => {
      await view('reservations', '#resvContent .rv-card, #resvContent .rv-empty');
      await page.evaluate(() => openSheet('rvSheet')); await page.waitForSelector('#rvSheet.open #rvCustName', { timeout: 5000 }); await page.evaluate(() => closeSheet());
    });
    await check(T('Müşteriler + kampanyalar'), async () => {
      await view('crm', '.cu-grid, .empty-state');
      await page.evaluate(() => { document.getElementById('main').innerHTML = '<div id="tst"></div>'; renderPromosSettings(document.getElementById('tst')); }); await page.waitForSelector('#promoBody .fsheet-open', { timeout: 5000 });
      await page.evaluate(() => newPromo()); await page.waitForSelector('#promoFormSheet.open #pr_name', { timeout: 5000 }); await page.evaluate(() => closeSheet());
    });
    await check(T('Satınalma Siparişleri + kritik stok'), async () => {
      await view('purchasing', '.ls-banner');
      await page.evaluate(() => draftLowStockOrder()); await page.waitForSelector('#poSheet.open #poItemsWrap select', { timeout: 5000 }); await page.evaluate(() => closeSheet());
    });
    await check(T('Finansal Analiz: Gün Sonu ve Puantaj'), async () => {
      await page.evaluate(() => { APP.reportsUnlocked = true; }); await view('reports', '#reportContent');
      await page.evaluate(() => setReportTab('zreport')); await page.waitForSelector('#ccCounted', { timeout: 8000 });
      await page.evaluate(() => setReportTab('payroll')); await page.waitForSelector('.pr-tbl', { timeout: 8000 });
      await page.evaluate(() => setReportTab('reviews')); await page.waitForSelector('#reviewsBody .rvw-sum', { timeout: 8000 });
    });
    await check(T('Ayarlar: hammaddeler ve kullanıcılar'), async () => {
      await page.evaluate(() => { document.getElementById('main').innerHTML = '<div id="tst"></div>'; renderIngredientsSettings(document.getElementById('tst'), getSession()); });
      await page.waitForSelector('.ig-grid'); await page.evaluate(() => openSheet('ingSheet')); await page.waitForSelector('#ingSheet.open #ni_name'); await page.evaluate(() => closeSheet());
    });
    await check(T('çevrimdışı: sipariş kuyruğa alınır, bağlantı gelince gönderilir'), async () => {
      await view('order', '#zoneTabs');
      await ctx.setOffline(true); await page.waitForTimeout(200);
      await page.evaluate(() => openTableModal('t5')); await page.waitForSelector('.pp-card', { timeout: 8000 });
      await page.click('.pp-card >> nth=1'); await page.waitForTimeout(200);
      await page.click('#confirmBtn'); await page.waitForTimeout(800);
      const q = await page.evaluate(() => outboxAll().length);
      assert(q >= 1, 'çevrimdışı sipariş kuyruğa alınmadı (kuyruk: ' + q + ')');
      assert(await page.$('#offlineBar'), 'çevrimdışı uyarı şeridi görünmedi');
      await ctx.setOffline(false); await page.waitForTimeout(2500);
      const left = await page.evaluate(() => outboxAll().length);
      assert(left === 0, 'bağlantı gelince kuyruk boşalmadı (kalan: ' + left + ')');
      assert(await page.evaluate(() => (window.__RPC_CALLS || []).includes('submit_offline_order')), 'sipariş sunucuya gönderilmedi');
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    });
    await check(T('F1 kısayol listesi'), async () => { await page.keyboard.press('F1'); await page.waitForSelector('#scHelp.open'); await page.keyboard.press('Escape'); });
    await check(T('sayfa hatası yok'), async () => { assert(errors.length === 0, errors.slice(0, 3).join(' | ')); });
    await ctx.close();
  }
  // Herkese açık sayfalar
  for(const [pg, rpc, sel] of [['/rezervasyon/?r=X', { get_public_reservation_info: { name: 'Test', enabled: true } }, '#rzSend'],
                               ['/degerlendirme/?t=11111111-2222-3333-4444-555555555555', { get_public_review: { name: 'Test', rated: false } }, '.star'],
                               ['/takip/?t=11111111-2222-3333-4444-555555555555', { get_public_tracking: { restaurant: 'Test', status: 'on_the_way', created_at: new Date().toISOString(), items: 1 } }, '.steps']]){
    await check('herkese açık sayfa ' + pg.split('?')[0], async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      // Yanıtlar sayfaya veri olarak verilir (kod metni birleştirilmez); taklit betik sabittir.
      await ctx.addInitScript(data => { window.__PUBLIC_RPC = data; }, rpc);
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
      await ctx.route(/^https:\/\/cdn\.jsdelivr\.net\//, r => r.fulfill({ contentType: 'application/javascript', body: PUBLIC_FAKE }));
      const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
      await page.goto(base + pg); await page.waitForSelector(sel, { timeout: 8000 });
      assert(!errs.length, errs.join(' | ')); await ctx.close();
    });
  }
  await browser.close(); srv.close();
  const failed = results.filter(r => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} test geçti`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
