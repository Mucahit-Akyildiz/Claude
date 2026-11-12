# Peyktan — Geliştirme Geçmişi ve Kararlar

Uzun Claude sohbetlerinde yapılan geliştirmelerin kalıcı kaydı. Yeni bir oturum bu dosyayı okuyarak
neyin neden yapıldığını öğrenir. En yeni en üstte. Ayrıntılı DB notları: `supabase/migrations/20261031_travel_time.sql`.

## Bekleyen konular / hatırlatmalar
- **KVKK / İYS ticari ileti onayı** (hatırlatma kuruldu): (1) müşteri ekle/düzenle'de "Onay SMS'i gönder" (kodla onay,
  tarih/yöntem kaydı), (2) kampanya ve geri kazanım **yalnızca açık onaylı** müşterilere — şu an `send_campaign`
  `marketing_consent is not false` ile onaysızlara da gidiyor, (3) online sipariş/rezervasyon sayfalarına boş gelen onay
  kutusu, (4) KVKK aydınlatma metni linki, (5) ret/çıkış. İYS kaydı için kullanılan SMS firması sorulacak.
- **Test ortamı** (hatırlatma kuruldu, ek maliyet nedeniyle ertelendi): test.peyktan.com + ayrı Supabase test projesi;
  önce teste, onaydan sonra canlıya.
- PIN ile giriş: yalnız daha önce işletmeye giriş yapmış cihazlarda + deneme sınırı önerildi, cevap bekleniyor.
- Online sipariş açıklama metni (Gel-Al ipucu) yalnız Türkçe/İngilizce; diğer diller Türkçe gösteriyor.

## 2026-11 (v400 → v457)

### Sipariş, ödeme, mutfak
- **Hazırlanmadan ödeme**: hazır olmayan ürün varken onay sorulur; `pay_order_items_early` /
  `transfer_to_open_account_early` ile ödeme alınır, masa açık kalır; Ödemeler'de "✅ Ödeme alındı · masa açık" kartı ve
  **🔒 Masayı Kapat** (`close_paid_order`). Mekanizma: `peyk.allow_unready` oturum ayarı.
- **Çift mutfak fişi önleme**: `order_items.ticket_printed_at` + `claim_ticket_items`; sipariş veren cihaz, mutfak ekranı
  ve masaüstü "arka planda bas" basmadan önce sunucudan onay alır. "Sipariş verilince hemen yazdır" **varsayılan kapalı**.
- Sipariş penceresi **tablet düzeni** (601–1366 px): tam ekran, sağda masa & müşteri + sepet hep görünür, büyük düğmeler.
- **Günlük hazırlık** (döner şişi, dilim tatlı): `ingredients.prep_source_id/prep_default`, `ingredient_prep_log`;
  mutfakta başlıkta **🥙 Günlük Hazırlık** düğmesi + pencere (Hazırla / Gün sonu: kalsın / depoya dön / israf).
  Kart yalnız bağlı ürünlerin istasyonunda görünür. Fire **yalnız hazırlıkta** girilir; depo kaynağında fire kilitlenir.
- Yeni hammadde: önce tür sorulur (🏬 Depo / 🥙 Günlük hazırlık); hazırlıkta kaynak seçilince birim/fire/ad otomatik,
  kaynağı kullanan ürünler işaretli gelir, kaydedince kaynak reçeteden çıkarılır (stok iki kez düşmez). Aynı ad engellenir.
- Müşteri sipariş istekleri (QR/online) kart tasarımı; bekleme süresi renkli; telefon maskeli; tekrarlayan bildirim birikmez.
- Online sipariş: Gel-Al/Teslimat seçimi büyük ve yanıp sönen; **ileri saat en erken süresi işletme ayarı**
  (`restaurants.online_lead_min`, varsayılan 25 dk, Ayarlar › Entegrasyonlar › Online Sipariş).

### Bildirimler
- Yeni push türleri (Kime Gitsin'de rol seçilir): mutfağa yeni sipariş, masa siparişi 15 dk, misafir oturdu,
  rezervasyona 15 dk, yeni rezervasyon/bekleme, gel-al alış saati. Sunucu: `push_once` + `_cron_extra_pushes` →
  `api/dispatch-ready-pushes.js` `mode: 'extra'`.
- Sesli: masa siparişi verileli 15 dk (`orderwait`, sunucu `_order15`); ödemesi alınmış sipariş hazır olunca da
  "sipariş hazır" (`_readypaid`); paket teslim aşamaları 30 → **15** → geç kalıyor → geç kaldı, iki kaynak ortak aşama
  kaydı kullanır (ters sıra okunmaz).
- Sesli kural ekranı: kural yoksa anahtarlar açık görünür; rol kapatılınca kural başlar; tüm roller açıksa kural silinir.
  Kişisel sayfada **"Bu cihazda sesli bildirimler"** anahtarı. Sesli tür adları yalnız harf (`^[a-z]{2,20}$`).
- Kampanya mesajı: şablon kaydet/yükle/sil (`restaurants.campaign_templates`), `{ad}`, `{soyad}`, `{adsoyad}`, `{isletme}`.

### Hammadde, satınalma, raporlar
- **📋 Stok Sayımı** (isteğe bağlı, gün sonuna bağlı değil): Hammaddeler araç çubuğu ve Mutfak başlığında düğme. Personel
  (`stock_count` izni) sayar, **Onay Yetkisi** (`approvals`) olan onaylar; onayda stok sayım anındaki farka göre düzelir.
  ⭐ ile günlük sayım listesi. Yönetici onayı gereken yeni işlemler `approvals` iznine bağlanacak.
- Alış birimleri (koli/çuval), sipariş/teslim/fiyat alış biriminde; Mal Kabul detayında satır içi teslim alma, fiyat
  düzeltme/silme, "Eksiği kapat"; hammadde arşivi (geçmişi olan yumuşak silinir) + geri getirme.
- Excel içe/dışa aktarma + şablon: ürünler, hammaddeler, **reçeteler**, **menüler**.
- PDF: menü (fiyatlı/fiyatsız), reçeteler (maliyetli/fiyatsız), masa QR'ları **bölüm bölüm** A4.
- Müşteriler: toplu gruba ekle/çıkar, **"Grubu yok"** filtresi.

### Altyapı / platform
- Aranabilir seçici (`ssEnhance`): 12+ seçenekli her select; tablette otomatik odak yok, klavye/yenilemede kapanmaz,
  yeniden çizilen kutuya yeniden bağlanır; otomatik ekran yenilemesi seçici/pencere açıkken bekler.
- Açılır form pencereleri (`openSheet`) `<body>` altına taşınır (sayfa animasyonunda kaymasın).
- **Android'de dosya indirme**: WebView `blob:` kaydedemediği için uygulamada indirmeler yakalanır, `/api/file-share`
  ile özel `exports` deposuna yüklenip 10 dk'lık bağlantı telefonun tarayıcısında açılır (CSP nedeniyle blob
  `URL.createObjectURL` anında saklanır).
- CSP `<style>` engeli: iframe PDF/yazdırmada `adoptDocCss` + html2canvas `onclone`.
- `bulk_call`: dizi parametresinde JSON null → NULL.
