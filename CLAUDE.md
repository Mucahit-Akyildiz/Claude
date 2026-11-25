# Peyktan — Claude çalışma kuralları

Bu dosya her Claude Code oturumunun başında okunur. Proje özeti ve mimari için `README.md`,
yapılan geliştirmelerin ve kararların kaydı için `docs/GELISTIRME-GECMISI.md`.

## İletişim
- Kullanıcıyla **her zaman Türkçe** yazış.
- Kullanıcı teknik değil, işletme sahibi: kısa, sade, ne değişti / ne yapması gerekiyor biçiminde anlat.
- Sohbette asla veritabanı adresi, şifre, gizli anahtar, API anahtarı paylaşma; kullanıcıdan token isteme.

## Dallar ve yayın akışı
- Geliştirme dalı: `claude/friendly-goodall-rksmy6` (oturum farklı bir dal verirse onu kullan).
- Hedef (canlı) dal: `claude/restoran-app-definition-h5e5am` — buraya birleşen her şey Vercel ile **hemen canlıya** çıkar.
- Her değişiklik: commit → push → hedef dala PR → **squash merge** → dalı sıfırla:
  ```
  git fetch -q origin claude/restoran-app-definition-h5e5am && \
  git checkout -qB claude/friendly-goodall-rksmy6 origin/claude/restoran-app-definition-h5e5am && \
  git push -qf -u origin claude/friendly-goodall-rksmy6
  ```
- Dependabot PR'larını kullanıcıya sormadan birleştirme.
- Commit / PR metinlerine model adı yazma.

## Yayından önce (her seferinde)
1. `bash scripts/bump-version.sh` — sürümü artırır ve paketi üretir (`app/dist/app.bundle.js`).
2. `node scripts/check-version-sync.js`
3. `node scripts/check-inline-handlers.js` — HTML içinde satır içi JS yasak; olaylar `act()` / `actOn()` ile.
4. `timeout 240 env NODE_PATH=$(npm root -g) node tests/ui/smoke.cjs` — tüm testler geçmeli (şu an 37).
- Herkese açık sayfalar (`siparis/`, `rezervasyon/` …) pakete girmez; değişince kendi `index.html`'indeki `?v=` / `?m=` sorgu parametresini artır.
- Arayüz değişikliklerini Playwright ile ekran görüntüsü alıp kontrol et (tablet: 820×1180 / 1180×820, `hasTouch`).

## Veritabanı (Supabase)
- Proje: `chsdvwncmzosqyhwenga` (Frankfurt). Peyktan işletmesi: `a2a3197d-0a9c-471c-99b3-637252d13c0c`.
- Tüm erişim `SECURITY DEFINER` RPC + `_session_check(p_token, izin)`; `restaurant_id` her zaman oturumdan.
- Yeni fonksiyonlarda `revoke all … from public; grant execute … to anon, authenticated;`.
- Toplu çağrılar `bulk_call` ile; yeni fonksiyon toplu çağrılacaksa `bulk_call` izin listesine ekle.
- **Her DB değişikliğinden sonra** `supabase/migrations/20261031_travel_time.sql` sonuna tarihli bir not satırı ekle.
- Test: `DO` bloğu içinde yap, sonunda `raise exception 'RESULT …'` ile geri al. Test ile migration'ı aynı istekte çalıştırma.
- plpgsql hataları çalışma anında çıkar: sık çağrılan fonksiyonu (`_nav_badges`, `pay_order_items` …) değiştirdikten sonra hemen gerçek bir kullanıcıyla çağırıp doğrula.
- `replace()` ile fonksiyon yamalarken "değişti mi" kontrolünü uzunlukla değil `d = d0` ile yap (aynı uzunlukta değişiklikler olabilir).
- Tercih: silmek yerine güncelleme / yumuşak silme (arşiv).
- **Canlı kullanıcı verisini değiştirmeden ya da silmeden önce kullanıcıya sor.** Hız/performans ile ilgili canlı DB değişikliklerinden önce de sor.

## Kurallar
- **KVKK**: Telefon numaraları ekranda maskeli (`maskPhone`). Kampanya mesajları için açık onay konusu beklemede (bkz. geçmiş dosyası).
- Uzun `<select>` listeleri otomatik aranabilir seçiciye dönüşür (`ssEnhance`, 12+ seçenek). Kullanıcı "kullanışsız arama yardımı" istemiyor.
- Tablet ve Android uygulaması (Capacitor WebView) önemli: dokunmatikte otomatik odak, yeniden çizim ve `blob:` indirme sorunlarına dikkat.
- Sesli bildirim kuralları (`voice_policy`): kural yoksa herkese, cihaz ayarına göre; tüm rolleri içeren kural kaydedilmez.
- **Açık hesap = müşteri**: Açık hesaba atarken ve hareket taşırken kişi her zaman **Müşteriler'den** seçilir
  (`open_account_for_customer`): müşterinin açık hesabı varsa ona yazılır/birleşir, yoksa açılır; müşteri kayıtlı
  değilse önce Müşteriler'e eklenir. `open_accounts.customer_id` ile bağlıdır. Serbest ad ile ayrı hesap açılmaz.

## Arayüz tasarım kuralları (kullanıcının isteği — her ekran değişikliğinde uygula)
1. **Her işin tek bir yeri olur.** Aynı işi yapan iki düğme / iki ekran olmaz. Bir şey eklemeden önce aynı işi yapan başka yer var mı diye ara; varsa önce onu kaldır ya da birleştir.
2. **Bir kez yapılan kurulum (mutfak, bölge, rol… tanımlamak) tekrar eden öğelerin içine konmaz.** Her kategori / her satır / her kartın içine "ekle" düğmesi koyma. Tek yer: ekranın başı ya da ilgili "yönet" düğmesi. Eksikse ekranın en üstünde tek bir uyarı + tek bir ekle düğmesi.
3. **Ekranda sadece o ekranın asıl işi durur.** Nadir işler (Excel, PDF, sıralama, toplu düzenleme) "⋯ Diğer" menüsüne.
4. **Her düğmenin üzerinde ne yaptığı yazar.** Yalnız "+" ya da yalnız simge olan düğme yok. Teknik kavram (istasyon, menü…) kullanıcının dilinde ve kısa açıklamayla (mutfak, kategori…).
5. **Sayfa gibi olan şey sayfada açılır**; açılır pencere yalnızca kısa soru / tek kayıt düzenleme için. Açılır menüler dışarı tıklanınca kapanır.
6. **Düzeltmeden önce bütüne bak:** kullanıcının gösterdiği tek noktayı değil, aynı hatanın diğer ekranlardaki benzerlerini de bul ve birlikte düzelt.
7. Büyük arayüz değişiklikleri önce deneme dalında (`claude/arayuz-*`, Vercel önizleme) yapılır; kullanıcı "canlıya al" demeden canlı dala geçmez.
