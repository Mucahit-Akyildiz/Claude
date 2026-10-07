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
  ]},
  { cat: 'Sipariş ve Mutfak', icon: '🍽️', items: [
    { q: 'Masaya nasıl sipariş girerim?', view: 'order', a: `<b>Sipariş Al</b> → masaya dokunun → ürünlere dokunarak sepete ekleyin (not ekleyebilirsiniz) → <b>Onayla ve Gönder</b>. Ürünler ilgili istasyonun mutfak ekranına düşer. Masaya müşteri adı/telefonu yazarsanız (kayıtlı müşteriler listelenir) ödeme ekranında müşteri otomatik seçilir.` },
    { q: 'Masayı taşıma veya birleştirme', view: 'order', a: `Masa penceresinde <b>Masayı Taşı / Birleştir</b>'e basın ve hedef masayı seçin. Boş masaya taşınır; dolu masaya birleştirilir.` },
    { q: 'Paket (gel-al / teslimat) siparişi', view: 'packages', a: `<b>Paket Servis</b> → Yeni Paket Sipariş → müşteri adı/telefon (kayıtlı müşteriler önerilir), not, ürünler → Onayla ve Gönder.` },
    { q: 'Mutfak ekranı nasıl çalışır?', view: 'kitchen', a: `<b>Mutfak Ekranı</b>'nda istasyonu seçin. Yeni sipariş gelince zil çalar. Ürün hazır olunca <b>Hazır</b> (ya da kartın tamamı için <b>Hepsi Hazır</b>). 15 dakikayı geçen ürün kırmızı yanıp söner; siparişi alan kişiye ve mutfak yetkisi olanlara 15., 20., 25.… dakikalarda bildirim gider.` },
    { q: 'İsraf (zayi) kaydı', view: 'kitchen', a: `Mutfak ekranında <b>🔥 İsraf Gir</b> ile bozulan/atılan ürünü ve sebebini girin. Stoktan düşer ve <b>Finansal Analiz → İsraf</b>'ta maliyetiyle raporlanır.` },
  ]},
  { cat: 'Ödemeler', icon: '💳', items: [
    { q: 'Ödeme nasıl alınır?', view: 'payments', a: `<b>Ödemeler</b> → masa/paket kartına dokunun → ödenecek ürün ve adetleri seçin (kısmi ödeme mümkün) → indirim, bahşiş, müşteri (puan), hediye kartı ekleyin → <b>Nakit</b>, <b>Kredi Kartı</b>, <b>Hediye Kartı</b> ya da <b>Bölünmüş Ödeme</b>.` },
    { q: 'Ödeme düğmeleri neden kapalı?', view: 'payments', a: `Mutfağa giden ürünlerden biri henüz <b>Hazır</b> işaretlenmemişse ödeme alınamaz (kırmızı uyarıda hangi ürünler olduğu yazar). Mutfakta ürünleri hazır yapın, ödeme açılır.` },
    { q: 'Açık hesap (veresiye) nasıl kullanılır?', view: 'payments', a: `Ödeme penceresinde <b>📒 Açık Hesaba At</b> → mevcut hesabı seçin ya da ad/telefonla yeni hesap oluşturun → onaylayın. Masa kapanır, tutar hesaba borç yazılır. Bakiyeler ve tahsilat: <b>Finansal Analiz → 📒 Açık Hesaplar</b>.` },
    { q: 'Hesabı müşteriye e-postayla göndermek', view: 'payments', a: `Ödeme penceresinde <b>Hesabı e-postayla gönder</b>'i açın; ödemeden sonra e-posta adresi sorulur. Fatura bilgileri <b>Ayarlar → Abonelik</b> altındaki Fatura Bilgileri'nden düzenlenir.` },
    { q: 'Hediye kartı', view: 'settings', a: `<b>Ayarlar → Hediye Kartları</b>'ndan kart oluşturun. Ödemede kart kodunu <b>Sorgula</b> ile girip bakiyeden düşebilirsiniz.` },
  ]},
  { cat: 'Müşteriler ve Rezervasyon', icon: '👥', items: [
    { q: 'Sadakat puanı ve doğum günü indirimi', view: 'crm', a: `<b>Müşteriler</b> ekranının üstünden sadakat programını açın: kaç TL'de 1 puan, 1 puanın değeri ve doğum günü indirimi (%). Ödemede müşteri seçilince puan kazanılır/kullanılır; doğum gününde indirim otomatik uygulanır.` },
    { q: 'Rezervasyon ve bekleme listesi', view: 'reservations', a: `<b>Rezervasyonlar</b>'dan rezervasyon ekleyin; müşteri gelince "Oturdu" ile masaya alın (müşteri bilgisi masaya geçer). Bekleme listesinde sıradaki müşteriler için ön sipariş bile alınabilir.` },
  ]},
  { cat: 'QR Menü ve Online Sipariş', icon: '📱', items: [
    { q: 'QR menü nasıl kurulur?', view: 'settings', a: `<b>Ayarlar → Bölgeler & Masalar</b>'da masanın yanındaki ▦ simgesi o masanın QR kodunu açar; yazdırıp masaya koyun. Müşteri menüyü görür, paketinize göre sipariş isteği gönderebilir ve garson çağırabilir. İstekler <b>Sipariş Al</b>'da onaya düşer.` },
    { q: 'Online sipariş (gel-al / teslimat)', view: 'settings', a: `<b>Ayarlar → Entegrasyonlar</b>'dan online siparişi açın ve bağlantıyı paylaşın. Menü başlıklarını ve ürün fotoğraflarını oradan düzenleyebilirsiniz. Stok anlıktır: sepete eklenen ürün diğer müşterilerin ekranında hemen düşer.` },
  ]},
  { cat: 'Stok ve Tedarik', icon: '🚚', items: [
    { q: 'Stok ve reçete', view: 'settings', a: `Ürünün <b>Stok</b> alanı boşsa stok takibi yapılmaz. Reçete tanımlarsanız (Ayarlar → Ürünler → Reçete) satışta hammaddeler (Ayarlar → Hammaddeler) düşer; hammadde bitince ürün "Stok Yok" olur.` },
    { q: 'Satın alma ve tedarikçiler', view: 'purchasing', a: `<b>Tedarikçi & Satın Alma</b>'da tedarikçileri ekleyin, satın alma siparişi verin, onaylayın ve teslim alın; teslim alınan miktar hammadde stoğuna eklenir (kısmi teslim desteklenir).` },
  ]},
  { cat: 'Personel, Roller ve Mesajlar', icon: '🔐', items: [
    { q: 'Rol ve yetki nasıl verilir?', view: 'settings', a: `<b>Ayarlar → Roller</b>'de rol oluşturup hangi ekranlara erişeceğini seçin (Yönetim grubu: Roller, Abonelik, Finansal Analiz, Veri Sıfırlama vb.). <b>Ayarlar → Kullanıcılar</b>'da kullanıcıya en fazla 2 rol verin. Yönetici rolü yalnızca işletme sahibindedir ve sahibin hesabını kimse değiştiremez.` },
    { q: 'Kullanıcıyı silmek mi, pasife almak mı?', view: 'settings', a: `<b>Pasife Al</b>: giriş yapamaz, geçmişi (mesajlar, satışlar) korunur. <b>Sil</b>: kullanıcı ve mesaj geçmişi silinir; satış kayıtları kalır.` },
    { q: 'Mesajlaşma', view: 'messages', a: `<b>Mesajlar</b>'da Genel kanal, birebir ve grup sohbetleri var. Fotoğraf, tek görüntülemelik fotoğraf, sesli mesaj, dosya, alıntı ve emoji tepkisi gönderebilirsiniz. Mikrofon/kamera izni ilk açılışta sorulur.` },
  ]},
  { cat: 'Raporlar', icon: '📊', items: [
    { q: 'Finansal Analiz neleri gösterir?', view: 'reports', a: `Ciro, kâr, ödeme türleri, saatlik yoğunluk, kapatılan hesaplar (sipariş/hazır/ödeme saatleriyle), ürün ve personel istatistikleri, müşteri analizleri, bahşiş havuzu, israf, rezervasyon analizi ve açık hesaplar. Üstten tarih aralığı seçin. Bu bölüm ayrıca bir şifreyle korunur.` },
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
  main.innerHTML = `
    <h1>❓ Yardım</h1>
    <p class="muted" style="text-align:left;margin:-4px 0 14px;">Peyktan'ı kullanırken aklınıza takılanlar. Aradığınızı bulamazsanız en alttan bize ulaşın.</p>
    <input id="helpSearch" class="list-search" placeholder="🔍 Yardımda ara… (ör. açık hesap, bildirim, reçete)" value="${escapeAttr(APP.helpSearch||'')}" oninput="APP.helpSearch=this.value;drawHelpTopics()" style="max-width:520px;margin:0 0 14px;">
    <div id="helpTopics"></div>
    <div class="box" style="max-width:none;">
      <h2>💬 Destek</h2>
      <p class="muted" style="text-align:left;margin:0 0 10px;">Sorununuzu ekran görüntüsüyle birlikte yazarsanız en hızlı şekilde yardımcı oluruz.</p>
      <a href="mailto:destek@peyktan.com?subject=${encodeURIComponent('Peyktan destek - ' + (session.restaurant_name||''))}" style="display:inline-block;"><button type="button" style="width:auto;padding:10px 18px;">✉️ destek@peyktan.com</button></a>
    </div>`;
  drawHelpTopics();
}
function drawHelpTopics(){
  const box = document.getElementById('helpTopics'); if(!box) return;
  const q = String(APP.helpSearch||'').trim().toLocaleLowerCase('tr');
  const strip = (h) => h.replace(/<[^>]+>/g, ' ');
  const session = getSession();
  const html = HELP_TOPICS.map((c, ci) => {
    const items = c.items.map((it, ii) => ({ it, key: ci + '_' + ii }))
      .filter(({ it }) => !q || (it.q + ' ' + strip(it.a) + ' ' + c.cat).toLocaleLowerCase('tr').includes(q));
    if(!items.length) return '';
    return `<div class="box" style="max-width:none;padding-top:16px;padding-bottom:10px;">
      <h2 style="margin:0 0 6px;">${c.icon} ${escapeHtml(c.cat)}</h2>
      ${items.map(({ it, key }) => {
        const open = q ? true : !!APP.helpOpen[key];
        const item = it.view && NAV_ITEMS.find(n => n.view === it.view);
        const canGo = it.view && session && (it.view === 'home' || (item && navItemVisible(item, session)));
        return `<div style="border-top:1px solid var(--border);">
          <div onclick="APP.helpOpen['${key}']=!APP.helpOpen['${key}'];drawHelpTopics()" style="cursor:pointer;display:flex;justify-content:space-between;gap:10px;padding:12px 2px;font-weight:700;">
            <span>${escapeHtml(it.q)}</span><span class="muted">${open ? '−' : '+'}</span></div>
          ${open ? `<div class="help-answer" style="padding:0 2px 14px;line-height:1.6;font-size:14px;">${it.a}
            ${canGo ? `<div style="margin-top:8px;"><button type="button" class="sbtn" style="width:auto;" onclick="goToView('${it.view}')">➜ ${escapeHtml(item ? item.label : 'Ekrana git')}</button></div>` : ''}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
  box.innerHTML = html || '<p class="muted">Aramanızla eşleşen bir konu bulunamadı. Aşağıdan destek ekibine yazabilirsiniz.</p>';
}
