  (function(){
    var btn = document.getElementById('themeToggle');
    function getTheme(){
      try{ return localStorage.getItem('rys_theme') || 'light'; }catch(e){ return 'light'; }
    }
    function paint(t){
      btn.textContent = t === 'dark' ? '☀️' : '🌙';
    }
    function setTheme(t){
      document.documentElement.setAttribute('data-theme', t);
      try{ localStorage.setItem('rys_theme', t); }catch(e){}
      paint(t);
    }
    paint(getTheme());
    btn.addEventListener('click', function(){
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  })();

  const SUPABASE_URL = 'https://dveybagnrgofxkqangvo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  function money(n){ return (Math.round((n||0)*100)/100).toLocaleString('tr-TR',{minimumFractionDigits:0,maximumFractionDigits:2}); }
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
  // Özellik etiketleri artık burada elle tutulmuyor - platform admin
  // panelindeki "Tüm Özellikler" kataloğundan (feature_catalog) canlı
  // okunuyor (bkz. list_feature_labels), böylece admin yeni bir özellik
  // eklediğinde bu sayfa elle güncellenmeden otomatik senkron kalır.
  // Paketler de aynı şekilde admin panelinden eklenip/silinebildiği için
  // sabit değil - canlı okunup kart olarak render ediliyor (bkz. list_packages).
  let PRICING_PACKAGES = [];
  let PRICING_FEATURE_LABELS = {};
  let PRICING_BILLING_CYCLE = 'monthly';
  function setPricingBillingCycle(cycle){
    PRICING_BILLING_CYCLE = cycle;
    document.getElementById('billingToggleMonthly').className = 'btn ' + (cycle==='monthly' ? 'btn-primary' : 'btn-outline');
    document.getElementById('billingToggleYearly').className = 'btn ' + (cycle==='yearly' ? 'btn-primary' : 'btn-outline');
    renderPricingGrid();
    renderAddons();
    renderCart();
  }
  let PRICING_ADDONS = [];
  /* Sepet: bir paket + istenen eklentiler. "Satın Al" kayıt ekranına
     seçimle birlikte gider (/app/?signup=1&pkg=..&addons=..&cycle=..);
     kayıtta paket ve seçilen eklentiler hesaba tanımlanır, abonelik tutarı
     paket + eklentiler olarak hesaplanır. Eklenti seçilmezse sadece paketin
     özellikleri gelir. */
  const CART = { pkg: null, addons: new Set() };
  function selectCartPackage(id){
    CART.pkg = CART.pkg === id ? null : id;
    renderPricingGrid(); renderAddons(); renderCart();
  }
  function toggleCartAddon(id){
    if(CART.addons.has(id)) CART.addons.delete(id); else CART.addons.add(id);
    renderAddons(); renderCart();
  }
  function clearCart(){ CART.pkg = null; CART.addons.clear(); renderPricingGrid(); renderAddons(); renderCart(); }
  function cartTotals(){
    const yearly = PRICING_BILLING_CYCLE === 'yearly';
    const p = PRICING_PACKAGES.find(x => x.id === CART.pkg);
    const pkgPrice = !p ? 0 : (yearly ? (p.price_yearly!=null ? p.price_yearly : (p.price||0)*12) : (p.price||0));
    const included = new Set((p && p.included_addons) || []);
    const addons = PRICING_ADDONS.filter(a => CART.addons.has(a.id) && !included.has(a.id));
    const addonsPrice = addons.reduce((sum, a) => sum + (Number(a.price)||0), 0) * (yearly ? 12 : 1);
    return { p, addons, total: pkgPrice + addonsPrice, yearly };
  }
  function renderCart(){
    const bar = document.getElementById('cartBar');
    if(!bar) return;
    const has = CART.pkg || CART.addons.size;
    bar.classList.toggle('show', !!has);
    document.body.classList.toggle('has-cart', !!has);
    if(!has) return;
    const { p, addons, total, yearly } = cartTotals();
    const parts = [];
    if(p) parts.push(escapeHtml(p.name) + ' paketi');
    if(addons.length) parts.push(addons.length + ' eklenti');
    document.getElementById('cartSummary').innerHTML = p
      ? `🛒 ${parts.join(' + ')} · <b>${money(total)} ${yearly?'TL/yıl':'TL/ay'}</b><small>İlk 7 gün ücretsiz; deneme sonunda bu tutarla devam edersiniz.</small>`
      : `🛒 ${addons.length} eklenti seçildi<small>Satın almak için yukarıdan bir paket seçin.</small>`;
    document.getElementById('cartBuyBtn').disabled = !p;
  }
  function goToCheckout(){
    if(!CART.pkg) return;
    const q = new URLSearchParams({ signup: '1', pkg: CART.pkg, cycle: PRICING_BILLING_CYCLE });
    const inc = new Set((PRICING_PACKAGES.find(x => x.id === CART.pkg) || {}).included_addons || []);
    const paid = [...CART.addons].filter(id => !inc.has(id));
    if(paid.length) q.set('addons', paid.join(','));
    window.location.href = '/app/?' + q.toString();
  }
  // Eklentiler ayrı fiyatlandırılan ek özelliklerdir (platform admin >
  // Eklentiler). Fiyatı henüz girilmemiş (0) eklentide fiyat yerine
  // "Fiyat için iletişime geçin" gösterilir.
  function renderAddons(){
    const section = document.getElementById('addonsSection');
    const grid = document.getElementById('addonsGrid');
    if(!section || !grid) return;
    section.hidden = false;
    const yearly = PRICING_BILLING_CYCLE === 'yearly';
    grid.innerHTML = PRICING_ADDONS.map(a => {
      const price = Number(a.price)||0;
      const priceHtml = price > 0
        ? money(yearly ? price*12 : price)+' <small>'+(yearly?'TL/yıl':'TL/ay')+'</small>'
        : '<small>Fiyat için iletişime geçin</small>';
      const cartPkg = PRICING_PACKAGES.find(x => x.id === CART.pkg);
      if(cartPkg && (cartPkg.included_addons||[]).includes(a.id)){
        return `<div class="addon-card in-cart">
        <div class="top"><h4>${escapeHtml(a.label)}</h4><span class="price"><small>${escapeHtml(cartPkg.name)} paketine dahil</small></span></div>
        ${a.description ? `<p>${escapeHtml(a.description)}</p>` : ''}
        <button type="button" class="u-addbtn btn btn-primary add-btn" disabled>✓ Pakete dahil</button>
      </div>`;
      }
      const inCart = CART.addons.has(a.id);
      return `<div class="addon-card ${inCart?'in-cart':''}">
        <div class="top"><h4>${escapeHtml(a.label)}</h4><span class="price">${priceHtml}</span></div>
        ${a.description ? `<p>${escapeHtml(a.description)}</p>` : ''}
        <button type="button" class="u-addbtn btn ${inCart?'btn-primary':'btn-outline'} add-btn" ${act('toggleCartAddon', a.id)}>${inCart?'✓ Sepette':'+ Sepete Ekle'}</button>
      </div>`;
    }).join('') + OWN_ACCOUNT_ADDONS.map(a => `<div class="addon-card own-acc">
        <div class="top"><h4>${a.ic} ${escapeHtml(a.label)}</h4><span class="price"><small class="u-own-tag">${a.ready ? 'Ücretsiz' : 'Kendi hesabınızla'}</small></span></div>
        <p>${escapeHtml(a.description)}</p>
        <div class="u-own-note">${a.ready ? '🔑 Kendi API anahtarınızla bağlanır · tüm paketlerde' : '🔑 Kendi entegratör / platform hesabınızla bağlanır · ' + escapeHtml(a.note)}</div>
      </div>`).join('');
  }
  // Kendi hesabınızla bağlanan entegrasyonlar: işletme kendi firma hesabının API bilgilerini girer.
  // ready=false olanlarda bağlantı bilgileri kaydedilir, otomatik aktarım ayrıca devreye alınır.
  const OWN_ACCOUNT_ADDONS = [
    { ic: '📱', ready: true, label: 'SMS (kendi hesabınız)', description: 'NetGSM, İleti Merkezi, Verimor, VatanSMS veya HTTP API sunan herhangi bir firma; müşteri SMS\'leri kendi başlığınızla gider.' },
    { ic: '✉️', ready: true, label: 'E-posta (kendi alan adınız)', description: 'Resend, Brevo, SendGrid veya Postmark hesabınızla fiş, fatura ve rezervasyon e-postaları kendi adresinizden gider.' },
    { ic: '💳', ready: true, label: 'Online Ödeme (iyzico)', description: 'Online siparişte kartla ödeme; para doğrudan kendi iyzico hesabınıza geçer.' },
    { ic: '🧾', ready: false, note: 'otomatik kesim için bizimle iletişime geçin', label: 'e-Fatura / e-Arşiv', description: 'Foriba, İzibiz, Logo veya Nesbilgi gibi entegratörünüzün bilgilerini girin; ödeme sonrası belge kesimi.' },
    { ic: '🛍️', ready: false, note: 'platform onayı sonrası etkinleştirilir', label: 'Pazaryeri', description: 'Yemeksepeti, Trendyol Yemek ve Getir Yemek hesaplarınızı bağlayın, siparişleri tek ekrandan yönetin.' },
    { ic: '📊', ready: false, note: 'yazılım firması onayı sonrası etkinleştirilir', label: 'Muhasebe', description: 'Logo, Mikro veya Netsis hesabınızı bağlayın; satış ve KDV kırılımları aktarılsın.' },
  ];
  function renderPricingGrid(){
    const grid = document.getElementById('pricingGrid');
    if(!grid) return;
    const packages = PRICING_PACKAGES;
    if(packages.length===0){ grid.innerHTML = ''; return; }
    const yearly = PRICING_BILLING_CYCLE === 'yearly';
    // Kartlarda tüm özellikleri tek tek listelemek farkları gizliyordu. Tüm
    // paketlerde ortak olanlar ayrı "standart" bölümünde bir kez gösterilir;
    // her kart ya "önceki paketteki her şey, artı:" (önceki paketin tamamını
    // kapsıyorsa) ya da "standart özellikler, artı:" başlığıyla sadece
    // kendi eklediklerini listeler.
    const addonLabel = id => { const a = PRICING_ADDONS.find(x => x.id === id); return a && a.label; };
    const label = f => PRICING_FEATURE_LABELS[f] || addonLabel(f) || f;
    // Pakete bilinçli olarak dahil edilen eklentiler de (included_addons)
    // karttaki farklar arasında gösterilir.
    const featSets = packages.map(p => new Set([...(p.features||[]), ...(p.included_addons||[])]));
    const common = packages.length > 1
      ? [...featSets[0]].filter(f => featSets.every(fs => fs.has(f)))
      : [];
    const commonSet = new Set(common);
    grid.innerHTML = packages.map((p, i) => {
      const cur = featSets[i];
      const prev = i > 0 ? featSets[i-1] : null;
      const inheritsPrev = prev && [...prev].every(f => cur.has(f));
      const base = inheritsPrev ? prev : commonSet;
      const extras = [...cur].filter(f => !base.has(f));
      const inheritLine = inheritsPrev
        ? `<b>${escapeHtml(packages[i-1].name)}</b> paketindeki her şey, artı:`
        : (!common.length ? '' : (extras.length ? 'Tüm standart özellikler, artı:' : 'Tüm standart özellikler dahil (aşağıda listelenmiştir)'));
      // Yillik fiyat admin panelinden ayrica girilmemisse (indirim
      // opsiyonel), aylik fiyatin 12 kati otomatik kullanilir - backend'deki
      // (get_bank_transfer_status/payment-initialize.js) ayni fallback mantigi.
      const monthlyPrice = p.price || 0;
      const yearlyPrice = p.price_yearly!=null ? p.price_yearly : monthlyPrice*12;
      const displayPrice = yearly ? yearlyPrice : monthlyPrice;
      const hasDiscount = yearly && p.price_yearly!=null && p.price_yearly < monthlyPrice*12;
      const savings = hasDiscount ? (monthlyPrice*12 - p.price_yearly) : 0;
      return `
      <div class="price-card ${p.is_popular?'popular':''} ${CART.pkg===p.id?'in-cart':''}">
        ${p.is_popular ? '<span class="badge">EN ÇOK TERCİH EDİLEN</span>' : ''}
        <h3>${escapeHtml(p.name)}</h3>
        <div class="amount">${monthlyPrice ? money(displayPrice)+' <small>'+(yearly?'TL/yıl':'TL/ay')+'</small>' : '—'}</div>
        ${hasDiscount ? `<p class="u-saving desc">Yıllıkta ${money(savings)} TL tasarruf</p>` : ''}
        <p class="desc">${escapeHtml(p.description)}</p>
        <ul>
          <li><b>${p.max_users} kullanıcıya kadar</b></li>
          ${inheritLine ? `<li class="u-inherit inherit">${inheritLine}</li>` : ''}
          ${extras.map(f => `<li class="plus">${escapeHtml(label(f))}</li>`).join('')}
          ${(!extras.length && inheritsPrev) ? '<li class="inherit">Ek özellik yok</li>' : ''}
        </ul>
        <button type="button" class="u-full btn ${CART.pkg===p.id?'btn-primary':'btn-outline'}" ${act('selectCartPackage', p.id)}>${CART.pkg===p.id?'✓ Sepette':'Sepete Ekle'}</button>
      </div>`;
    }).join('');
    const commonSection = document.getElementById('commonSection');
    if(commonSection){
      commonSection.hidden = !common.length;
      document.getElementById('commonFeatures').innerHTML = common.map(f => `<span>✓ ${escapeHtml(label(f))}</span>`).join('');
    }
  }
  sb.rpc('list_addons').then(({data}) => { PRICING_ADDONS = data || []; renderAddons(); renderPricingGrid(); }).catch(()=>{});
  Promise.all([sb.rpc('list_packages'), sb.rpc('list_feature_labels')]).then(([{data}, {data: featureLabelsData}]) => {
    PRICING_PACKAGES = data || [];
    (featureLabelsData||[]).forEach(f => { PRICING_FEATURE_LABELS[f.id] = f.label; });
    setPricingBillingCycle('monthly');
  }).catch(()=>{
    const grid = document.getElementById('pricingGrid');
    if(grid) grid.innerHTML = '<p class="u-grid-msg">Fiyatlar şu anda yüklenemedi.</p>';
  });

/* Özellik kartları sekmelere bölünür; mobilde her sekmede ilk 4 kart, "Tümünü gör" ile hepsi. */
(function featTabs(){
  const grid = document.querySelector('#ozellikler .feat-grid'); if(!grid) return;
  const CATS = [
    ['🍽️ Sipariş & Mutfak', /Sipariş Al|Mutfak|Paket|QR Menü|Garson Çağır|Kat Planı|Online|Ön Sipariş|Birleştirme|Kurye|Bildirim/],
    ['💳 Ödeme & Kasa', /Ödeme|Bahşiş|Hediye|Gün Sonu|Kampanya|Açık Hesap|Limitli|Fiş|Yazar Kasa|Kartla/],
    ['👥 Müşteri & Pazarlama', /Müşteri|Rezervasyon|Yorum|Doğum|Geri Kazanım|Çok Dilli/],
    ['📦 Stok & Tedarik', /Stok|Reçete|Tedarik|Maliyet|Excel/],
    ['📊 Raporlar', /Finansal|Mühendisliği|Yoğunluk|Kartları|İptal|Analizi|Özet E-posta|Şirket Paneli/],
    ['🛡️ Ekip & Yönetim', /./]
  ];
  const cards = [...grid.querySelectorAll('.feat-card')];
  const groups = CATS.map(() => []);
  cards.forEach(c => { const t = (c.querySelector('h3') || {}).textContent || ''; groups[CATS.findIndex(x => x[1].test(t))].push(c); });
  const bar = document.createElement('div'); bar.className = 'feat-tabs'; bar.setAttribute('role', 'tablist');
  const more = document.createElement('button'); more.type = 'button'; more.className = 'btn btn-outline feat-more';
  let cur = 0, open = false;
  function show(i){
    cur = i; open = false;
    [...bar.children].forEach((b, j) => { b.classList.toggle('active', j === i); b.setAttribute('aria-selected', j === i); });
    cards.forEach(c => { c.hidden = true; c.classList.remove('feat-extra'); });
    groups[i].forEach((c, k) => { c.hidden = false; if(k >= 4) c.classList.add('feat-extra'); });
    grid.classList.remove('feat-open');
    more.hidden = groups[i].length <= 4; more.textContent = 'Tümünü gör (' + groups[i].length + ')';
  }
  CATS.forEach((c, i) => { if(!groups[i].length) return; const b = document.createElement('button'); b.type = 'button'; b.className = 'feat-tab'; b.setAttribute('role', 'tab');
    b.textContent = c[0] + ' · ' + groups[i].length; b.addEventListener('click', () => show(i)); bar.appendChild(b); });
  more.addEventListener('click', () => { open = !open; grid.classList.toggle('feat-open', open); more.textContent = open ? 'Daha az göster' : 'Tümünü gör (' + groups[cur].length + ')'; });
  grid.parentNode.insertBefore(bar, grid);
  grid.insertAdjacentElement('afterend', more);
  show(0);
})();
