/* Yardım: uygulamanın tüm bölümleri için kısa kullanım rehberi + sık sorulanlar.
   Aranabilir; her konu açılır-kapanır. "Ekrana git" ile ilgili ekran açılır
   (kullanıcının yetkisi varsa). Klasik <script src>. */
const HELP_TOPICS = [
  { cat: 'Başlarken', icon: '🚀', items: [
    { q: 'Peyktan\'ı kurmak için hangi sırayı izlemeliyim?', view: 'settings', a: `
      <ol>
        <li><b>Ayarlar → İstasyonlar:</b> Mutfak bölümlerini ekleyin (Izgara, İçecek, Tatlı…). Siparişler bu istasyonlara göre mutfak ekranına ve yazıcıya düşer.</li>
        <li><b>Ayarlar → Bölgeler & Masalar:</b> Bölge (Salon, Bahçe…) ve masaları ekleyin. Toplu eklemek için <code>Masa 1-10</code> yazın.</li>
        <li><b>Ayarlar → Ürünler:</b> Ürünleri fiyat, maliyet ve istasyonuyla ekleyin. İsterseniz reçete (hammadde) tanımlayın.</li>
        <li><b>Ayarlar → Roller ve Kullanıcılar:</b> Personel için rol oluşturup kullanıcı ekleyin.</li>
        <li><b>Bildirimler:</b> Her cihazda bildirimleri açın.</li>
      </ol>` },
    { q: 'Personelim uygulamaya nasıl girer?', view: 'settings', a: `İşletme kodu + kullanıcı adı + şifre ile girer. Kullanıcıları <b>Ayarlar → Kullanıcılar</b>'dan siz oluşturursunuz; giriş ekranındaki işletme kodunu personelle paylaşın. Telefonda "Beni hatırla" seçilirse oturum açık kalır.` },
    { q: 'Vardiya nedir, zorunlu mu?', view: 'settings', a: `Personel çalışmaya başlarken sol menüdeki <b>Vardiyaya Başla</b> düğmesine basar. <b>Ayarlar → Vardiyalar</b>'da vardiyayı zorunlu yapabilir ve onaya bağlayabilirsiniz; zorunluyken vardiyası olmayan personel sipariş/ödeme alamaz. İşletme sahibi bundan muaftır.` },
    { q: 'Vardiya planı nasıl hazırlanır?', view: 'settings', a: `<b>Ayarlar → Kullanıcılar & Vardiyalar → Vardiya Planı</b>'nda haftalık tabloyu doldurun: hücreye dokunup saati seçin, <b>Geçen haftayı kopyala</b> ile tekrarlayın. Her personel kendi haftasını ana ekranında görür.` },
    { q: 'Ana ekran ve kurulum rehberi', view: 'home', a: `Girişte kişisel ana ekran açılır: yetkili olduğunuz bölümlerin kısayolları, günün özeti ve vardiyanız. <b>İşletmenizi kuralım</b> kartı kurulum adımlarını sırayla gösterir; altta henüz denemediğiniz özellikler için öneri kartları çıkar.` },
  ]},
  { cat: 'Sipariş ve Mutfak', icon: '🍽️', items: [
    { q: 'Masaya nasıl sipariş girerim?', view: 'order', a: `<b>Sipariş Al</b> → masaya dokunun → ürünlere dokunarak sepete ekleyin (not ekleyebilirsiniz) → <b>Onayla ve Gönder</b>. Ürünler ilgili istasyonun mutfak ekranına düşer. Masaya müşteri adı/telefonu yazarsanız (kayıtlı müşteriler listelenir) ödeme ekranında müşteri otomatik seçilir.` },
    { q: 'Masayı taşıma veya birleştirme', view: 'order', a: `Masa penceresinde <b>Masayı Taşı / Birleştir</b>'e basın ve hedef masayı seçin. Boş masaya taşınır; dolu masaya birleştirilir.` },
    { q: 'Paket (gel-al / teslimat) siparişi', view: 'packages', a: `<b>Paket Servis</b> → Yeni Paket Sipariş → müşteri adı/telefon (kayıtlı müşteriler önerilir), not, ürünler → Onayla ve Gönder.` },
    { q: 'Paket teslim / teslim alma saati', view: 'packages', a: `Paket siparişte <b>Adrese teslim</b> ya da <b>Gel-al</b> için saat seçin (hazır süreler veya saat girişi). Mutfak ekranında geri sayım görünür: 20 dk üstü yeşil, 10–20 dk sarı, 10 dk altı kırmızı. Süre yaklaşınca ve adrese teslim sipariş kuryeye verilmediyse bildirim gelir.` },
    { q: 'Rezervasyona ön sipariş', view: 'reservations', a: `Rezervasyon kartında <b>Sipariş Al</b> ile müşteri gelmeden siparişi girin. Müşteri oturtulunca sipariş ve kişi sayısı masaya geçer.` },
    { q: 'Mutfak ekranı nasıl çalışır?', view: 'kitchen', a: `<b>Mutfak Ekranı</b>'nda istasyonu seçin. Yeni sipariş gelince zil çalar. Ürün hazır olunca <b>Hazır</b> (ya da kartın tamamı için <b>Hepsi Hazır</b>). 15 dakikayı geçen ürün kırmızı yanıp söner; siparişi alan kişiye ve mutfak yetkisi olanlara 15., 20., 25.… dakikalarda bildirim gider.` },
    { q: 'İsraf (zayi) kaydı', view: 'kitchen', a: `Mutfak ekranında <b>🔥 İsraf Gir</b> ile bozulan/atılan ürünü ve sebebini girin. Stoktan düşer ve <b>Finansal Analiz → İsraf</b>'ta maliyetiyle raporlanır.` },
  ]},
  { cat: 'Ödemeler', icon: '💳', items: [
    { q: 'Ödeme nasıl alınır?', view: 'payments', a: `<b>Ödemeler</b> → masa/paket kartına dokunun → ödenecek ürün ve adetleri seçin (kısmi ödeme mümkün) → indirim, bahşiş, müşteri (puan), hediye kartı ekleyin → <b>Nakit</b>, <b>Kredi Kartı</b>, <b>Hediye Kartı</b> ya da <b>Bölünmüş Ödeme</b>.` },
    { q: 'Ödeme düğmeleri neden kapalı?', view: 'payments', a: `Mutfağa giden ürünlerden biri henüz <b>Hazır</b> işaretlenmemişse ödeme alınamaz (kırmızı uyarıda hangi ürünler olduğu yazar). Mutfakta ürünleri hazır yapın, ödeme açılır.` },
    { q: 'Açık hesap (veresiye) nasıl kullanılır?', view: 'payments', a: `Ödeme penceresinde <b>📒 Açık Hesaba At</b> → mevcut hesabı seçin ya da ad/telefonla yeni hesap oluşturun → onaylayın. Masa kapanır, tutar hesaba borç yazılır. Bakiyeler ve tahsilat: <b>Finansal Analiz → 📒 Açık Hesaplar</b>.` },
    { q: 'Hesabı müşteriye e-postayla göndermek', view: 'payments', a: `Ödeme penceresinde <b>Hesabı e-postayla gönder</b>'i açın; ödemeden sonra e-posta adresi sorulur. Fatura bilgileri <b>Ayarlar → Abonelik</b> altındaki Fatura Bilgileri'nden düzenlenir.` },
    { q: 'Hediye kartı', view: 'settings', a: `<b>Ayarlar → Hediye Kartları</b>'ndan kart oluşturun. Ödemede kart kodunu <b>Sorgula</b> ile girip bakiyeden düşebilirsiniz.` },
    { q: 'Gün sonu kapanışı', view: 'payments', a: `<b>Ödemeler → Gün Sonu</b> ile adım adım kasa sayımı girin; kasa farkı hesaplanır ve Z raporu basılır. Açık vardiyalar kendiliğinden kapanır, kapanış unutulursa ertesi gün hatırlatma gelir.` },
  ]},
  { cat: 'Müşteriler ve Rezervasyon', icon: '👥', items: [
    { q: 'Sadakat puanı ve doğum günü indirimi', view: 'crm', a: `<b>Müşteriler</b> ekranının üstünden sadakat programını açın: kaç TL'de 1 puan, 1 puanın değeri ve doğum günü indirimi (%). Ödemede müşteri seçilince puan kazanılır/kullanılır; doğum gününde indirim otomatik uygulanır.` },
    { q: 'Rezervasyon ve bekleme listesi', view: 'reservations', a: `<b>Rezervasyonlar</b>'dan rezervasyon ekleyin; müşteri gelince "Oturdu" ile masaya alın (müşteri bilgisi masaya geçer). Bekleme listesinde sıradaki müşteriler için ön sipariş bile alınabilir.` },
    { q: 'Müşteri değerlendirmeleri', view: 'reports', a: `Ödemeden sonra değerlendirme QR'ını gösterin veya SMS/e-postayla link gönderin. Müşteri yıldız, yorum ve fotoğraf ekler; düşük puanlarda ad/telefon alınır ve size bildirilir. Hepsini <b>Finansal Analiz → Değerlendirmeler</b>'de görürsünüz; yeni yorumlar rozetle işaretlenir.` },
    { q: 'Geri kazanım kampanyası', view: 'crm', a: `<b>Müşteriler → Geri kazan</b> uzun süredir gelmeyen müşterileri listeler; tek tıkla SMS veya e-postayla kampanya gönderin (yalnızca pazarlama izni verenlere).` },
  ]},
  { cat: 'QR Menü ve Online Sipariş', icon: '📱', items: [
    { q: 'QR menü nasıl kurulur?', view: 'settings', a: `<b>Ayarlar → Bölgeler & Masalar</b>'da masanın yanındaki ▦ simgesi o masanın QR kodunu açar; yazdırıp masaya koyun. Müşteri menüyü görür, paketinize göre sipariş isteği gönderebilir ve garson çağırabilir. İstekler <b>Sipariş Al</b>'da onaya düşer.` },
    { q: 'Online sipariş (gel-al / teslimat)', view: 'settings', a: `<b>Ayarlar → Entegrasyonlar</b>'dan online siparişi açın ve bağlantıyı paylaşın. Menü başlıklarını ve ürün fotoğraflarını oradan düzenleyebilirsiniz. Stok anlıktır: sepete eklenen ürün diğer müşterilerin ekranında hemen düşer.` },
    { q: 'Yazar kasa (ÖKC) ve pazaryeri bağlantısı', view: 'settings', a: `<b>Ayarlar → Entegrasyonlar</b>'da yazar kasa ve pazaryeri hesaplarınızı kendi API bilgilerinizle bağlayın. Pazaryeri siparişleri paket servis ekranına düşer; ödemeler yazar kasaya gönderilir.` },
    { q: 'Kendi SMS / e-posta / iyzico hesabım', view: 'settings', a: `<b>Ayarlar → Entegrasyonlar</b>'dan kendi hesaplarınızı bağlayın; mesajlar kendi adınızla gider. <b>Test maili</b> ile ayarı deneyin, gönderim geçmişini aynı ekrandan izleyin.` },
  ]},
  { cat: 'Stok ve Tedarik', icon: '🚚', items: [
    { q: 'Stok ve reçete', view: 'settings', a: `Ürünün <b>Stok</b> alanı boşsa stok takibi yapılmaz. Reçete tanımlarsanız (Ayarlar → Ürünler → Reçete) satışta hammaddeler (Ayarlar → Hammaddeler) düşer; hammadde bitince ürün "Stok Yok" olur.` },
    { q: 'Satın alma ve tedarikçiler', view: 'purchasing', a: `<b>Malzeme Siparişi Ver</b> menüsünde hammadde ve miktarı girip satınalma talebi oluşturun. Mal gelince <b>Mal Kabul</b> menüsünden teslim alın; teslim alınan miktar hammadde stoğuna eklenir (kısmi teslim desteklenir). Birim fiyat ve tedarikçi de bu menüden girilir; tedarikçisi ya da fiyatı girilmemiş siparişler orada sayaçla görünür.` },
  ]},
  { cat: 'Personel, Roller ve Mesajlar', icon: '🔐', items: [
    { q: 'Rol ve yetki nasıl verilir?', view: 'settings', a: `<b>Ayarlar → Roller</b>'de rol oluşturup hangi ekranlara erişeceğini seçin (Yönetim grubu: Roller, Abonelik, Finansal Analiz, Veri Sıfırlama, Destek Erişimi vb.; Veri Sıfırlama, Destek Erişimi ve Değişiklik Kaydı Ayarlar → Güvenlik altındadır). <b>Ayarlar → Kullanıcılar</b>'da kullanıcıya en fazla 2 rol verin. Yönetici rolü yalnızca işletme sahibindedir ve sahibin hesabını kimse değiştiremez.` },
    { q: 'Kullanıcıyı silmek mi, pasife almak mı?', view: 'settings', a: `<b>Pasife Al</b>: giriş yapamaz, geçmişi (mesajlar, satışlar) korunur. <b>Sil</b>: kullanıcı ve mesaj geçmişi silinir; satış kayıtları kalır.` },
    { q: 'Mesajlaşma', view: 'messages', a: `<b>Mesajlar</b>'da Genel kanal, birebir ve grup sohbetleri var. Fotoğraf, tek görüntülemelik fotoğraf, sesli mesaj, dosya, alıntı ve emoji tepkisi gönderebilirsiniz. Mikrofon/kamera izni ilk açılışta sorulur.` },
  ]},
  { cat: 'Raporlar', icon: '📊', items: [
    { q: 'Finansal Analiz neleri gösterir?', view: 'reports', a: `Ciro, kâr, ödeme türleri, saatlik yoğunluk, kapatılan hesaplar (sipariş/hazır/ödeme saatleriyle), ürün ve personel istatistikleri, müşteri analizleri, bahşiş havuzu, israf, rezervasyon analizi ve açık hesaplar. Üstten tarih aralığı seçin. Bu bölüm ayrıca bir şifreyle korunur.` },
    { q: 'Çok şubeli işletme', view: 'reports', a: `Şirket panelinde tüm şubelerin ciro, kâr ve sipariş sayısını tek ekranda görün, şubeleri karşılaştırın ve menüyü bir şubeden diğerine kopyalayın. Yöneticiye düzenli özet e-postaları gönderilebilir.` },
    { q: 'Yedekleme ve destek erişimi', view: 'settings', a: `<b>Ayarlar → Güvenlik</b>'te <b>Yedek indir</b> ile tüm verinizi tek dosyada saklayın. <b>Destek erişimi</b> ile Peyktan ekibine şifre paylaşmadan süreli izin verin; <b>Değişiklik kaydı</b> kim neyi ne zaman değiştirdi gösterir.` },
  ]},
  { cat: 'Sorun Giderme', icon: '🛠️', items: [
    { q: 'Bildirim gelmiyor', view: 'notificationSettings', a: `<ol>
        <li><b>Bildirimler → Bildirim Ayarları</b>'nda bildirimlerin açık olduğunu kontrol edin, <b>Test Bildirimi Gönder</b>'e basın.</li>
        <li>Telefonda Ayarlar → Uygulamalar → Peyktan → Bildirimler açık mı, "Peyktan Bildirimleri" kanalı sessizde mi bakın.</li>
        <li>Pil tasarrufunda Peyktan için "Kısıtlama yok" seçin (özellikle Xiaomi, Samsung, Huawei).</li>
        <li>Gönderilen tüm bildirimleri <b>Bildirimler → Geçmiş Bildirimler</b>'de görebilirsiniz.</li></ol>` },
    { q: 'Mikrofon veya kamera izni verilmedi', view: 'messages', a: `Bilgisayarda adres çubuğunun solundaki 🔒 simgesi → Mikrofon/Kamera → İzin ver, sonra sayfayı yenileyin. Telefonda Ayarlar → Uygulamalar → Peyktan → İzinler.` },
    { q: 'Ekran güncellenmiyor gibi', a: `Sol menüdeki <b>🔄 Yenile</b>'ye basın. Uygulama değişiklikleri kendiliğinden alır; internet bağlantısı koptuysa birkaç saniye içinde toparlanır.` },
    { q: 'Şifremi unuttum', a: `Giriş ekranında <b>Şifremi unuttum</b> → işletme kodu ve kullanıcı adı → işletmenin kayıtlı e-postasına gelen kodu girin. Personel şifresini işletme sahibi Ayarlar → Kullanıcılar'dan da değiştirebilir.` },
  ]},
];

function renderHelpView(main, session){
  APP.helpOpen = APP.helpOpen || {};
  if(APP.helpCat == null) APP.helpCat = 'video';
  // Diğer ayar/rapor ekranları gibi: solda bölümler (video, konu başlıkları, destek), sağda içerik.
  const nav = [['video', '🎬', 'Eğitim Videosu', 'Peyktan nasıl kullanılır? (9,5 dk)'],
    ...HELP_TOPICS.map((c, ci) => [String(ci), c.icon, c.cat, c.items.length + ' soru']),
    ['support', '💬', 'Destek', 'Bize ulaşın']];
  main.innerHTML = `
    <h1>❓ Yardım</h1>
    <div class="fsheet-bar" style="margin:-4px 0 14px;"><p class="muted" style="text-align:left;margin:0;">Peyktan'ı kullanırken aklınıza takılanlar. Aradığınızı bulamazsanız "Destek"ten bize ulaşın.</p><button type="button" class="u-wa-m0 ghost-btn" ${act('showShortcutHelp')}>⌨️ Klavye Kısayolları (F1)</button></div>
    <div class="set-layout">
      <nav class="tabs settings-tabs set-nav" id="helpNav">
        ${nav.map(([k, ic, l, d], i) => `<div class="tab set-item ${String(APP.helpCat)===k?'active on':''}" data-help="${k}" style="--i:${i};--sc:${RACE_COLORS[i % RACE_COLORS.length]};" ${act('setHelpCat', k)}><span class="set-ico">${ic}</span><span class="set-txt"><b>${escapeHtml(l)}</b><small>${escapeHtml(d)}</small></span></div>`).join('')}
      </nav>
      <div class="set-content" id="helpContent">
        <input id="helpSearch" class="list-search" placeholder="🔍 Tüm yardımda ara… (ör. açık hesap, bildirim, reçete)" value="${escapeAttr(APP.helpSearch||'')}" ${actOn('input', 'setHelpSearch', ['$value'])} style="max-width:none;margin:0 0 14px;">
        <div id="helpTopics"></div>
      </div>
    </div>`;
  drawHelpTopics();
}
function setHelpCat(k){
  APP.helpCat = k; APP.helpSearch = '';
  const inp = document.getElementById('helpSearch'); if(inp) inp.value = '';
  document.querySelectorAll('#helpNav [data-help]').forEach(t => { const on = t.dataset.help === String(k); t.classList.toggle('active', on); t.classList.toggle('on', on); });
  drawHelpTopics();
}
function drawHelpTopics(){
  const box = document.getElementById('helpTopics'); if(!box) return;
  const q = String(APP.helpSearch||'').trim().toLocaleLowerCase('tr');
  const strip = (h) => h.replace(/<[^>]+>/g, ' ');
  const session = getSession();
  if(!q && APP.helpCat === 'video'){
    box.innerHTML = `<div class="u-mwn box"><h2>🎬 Eğitim videosu · Peyktan nasıl kullanılır?</h2>
      <video controls preload="none" playsinline poster="/assets/video/peyktan-egitim-poster.jpg" style="width:100%;max-width:880px;display:block;border-radius:14px;background:#0f1416;aspect-ratio:16/9;">
        <source src="https://cdn.jsdelivr.net/gh/Mucahit-Akyildiz/Claude@71cc72d2ec1b1f83b01b7b66304b847dff675369/assets/video/peyktan-egitim.mp4" type="video/mp4"></video></div>`;
    return;
  }
  if(!q && APP.helpCat === 'support'){
    box.innerHTML = `<div class="u-mwn box"><h2>💬 Destek</h2>
      <p class="muted" style="text-align:left;margin:0 0 10px;">Sorununuzu ekran görüntüsüyle birlikte yazarsanız en hızlı şekilde yardımcı oluruz.</p>
      <a href="mailto:destek@peyktan.com?subject=${encodeURIComponent('Peyktan destek - ' + ((session && session.restaurant_name)||''))}" style="display:inline-block;"><button type="button" style="width:auto;padding:10px 18px;">✉️ destek@peyktan.com</button></a></div>`;
    return;
  }
  const html = HELP_TOPICS.map((c, ci) => {
    if(!q && String(ci) !== String(APP.helpCat)) return '';
    const items = c.items.map((it, ii) => ({ it, key: ci + '_' + ii }))
      .filter(({ it }) => !q || (it.q + ' ' + strip(it.a) + ' ' + c.cat).toLocaleLowerCase('tr').includes(q));
    if(!items.length) return '';
    return `<div class="box" style="max-width:none;padding-top:16px;padding-bottom:10px;">
      <h2 style="margin:0 0 6px;">${c.icon} ${escapeHtml(c.cat)}</h2>
      ${items.map(({ it, key }) => {
        const open = q ? true : !!APP.helpOpen[key];
        const item = it.view && NAV_ITEMS.find(n => n.view === it.view);
        const canGo = it.view && session && (it.view === 'home' || (item && navItemVisible(item, session)));
        return `<div class="help-q ${open ? 'open' : ''}">
          <div ${act('toggleHelpTopic', key)} class="help-q-h"><span>${escapeHtml(it.q)}</span><span class="help-q-ic">${open ? '−' : '+'}</span></div>
          ${open ? `<div class="help-answer">${it.a}
            ${canGo ? `<div style="margin-top:8px;"><button type="button" class="sbtn" style="width:auto;" ${act('goToView', it.view)}>➜ ${escapeHtml(item ? item.label : 'Ekrana git')}</button></div>` : ''}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
  box.innerHTML = html || '<p class="muted">Aramanızla eşleşen bir konu bulunamadı. Soldaki "Destek"ten bize yazabilirsiniz.</p>';
}

function setHelpSearch(v){ APP.helpSearch = v; drawHelpTopics(); }
function toggleHelpTopic(key){ APP.helpOpen[key] = !APP.helpOpen[key]; drawHelpTopics(); }
