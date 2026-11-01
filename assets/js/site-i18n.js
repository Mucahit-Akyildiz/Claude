/* Ana sayfa çevirileri (bkz. /app/js/i18n.js). "Türkçe|English|العربية|Русский|Deutsch" */
(function(){
const L = `
Neden Peyktan|Why Peyktan|لماذا Peyktan|Почему Peyktan|Warum Peyktan
Neden Peyktan?|Why Peyktan?|لماذا Peyktan؟|Почему Peyktan?|Warum Peyktan?
Özellikler|Features|المزايا|Возможности|Funktionen
Fiyatlar|Pricing|الأسعار|Цены|Preise
SSS|FAQ|الأسئلة الشائعة|Вопросы|FAQ
Eğitim|Tutorial|الشرح|Обучение|Anleitung
İndir|Download|تنزيل|Скачать|Download
Peyktan · Restoran Yönetim Sistemi|Peyktan · Restaurant Management System|Peyktan · نظام إدارة المطاعم|Peyktan · Система управления рестораном|Peyktan · Restaurant-Management-System
Restoranınızı|Run your restaurant|أدِر مطعمك|Управляйте рестораном|Führen Sie Ihr Restaurant
tek ekrandan|from one screen|من شاشة واحدة|с одного экрана|von einem Bildschirm
yönetin| | |  | 
Sipariş alma, mutfak ekranı, paket servis ve canlı kurye takibi, ödemeler, stok ve finansal analiz — hepsi tek bir sistemde. Kart bilgisi istemeden 7 gün boyunca ücretsiz deneyin.|Order taking, kitchen display, delivery with live courier tracking, payments, stock and financial analysis — all in one system. Try it free for 7 days, no card required.|أخذ الطلبات وشاشة المطبخ والتوصيل مع تتبع المندوب المباشر والمدفوعات والمخزون والتحليل المالي — كلها في نظام واحد. جرّبه مجانًا لمدة 7 أيام دون بطاقة.|Приём заказов, экран кухни, доставка с отслеживанием курьера, оплаты, склад и финансовая аналитика — всё в одной системе. 7 дней бесплатно, без карты.|Bestellaufnahme, Küchendisplay, Lieferung mit Live-Kurierverfolgung, Zahlungen, Lager und Finanzanalyse — alles in einem System. 7 Tage kostenlos testen, ohne Karte.
7 Günlük Ücretsiz Dene|Start 7-Day Free Trial|ابدأ تجربة مجانية لمدة 7 أيام|7 дней бесплатно|7 Tage kostenlos testen
Kredi kartı gerekmez · İstediğiniz zaman iptal edin|No credit card required · Cancel anytime|لا حاجة لبطاقة ائتمان · ألغِ في أي وقت|Карта не нужна · Отмена в любой момент|Keine Kreditkarte nötig · Jederzeit kündbar
Peyktan’ı farklı kılan özellikler|What makes Peyktan different|ما الذي يميز Peyktan|Чем отличается Peyktan|Was Peyktan besonders macht
Sadece adisyon değil; paketten maliyete, kuryeden tedarikçiye işletmenin tamamı.|Not just a POS: delivery, costing, couriers and suppliers — your whole business.|ليس مجرد نقطة بيع: التوصيل والتكلفة والمندوبين والموردين — عملك بالكامل.|Не просто касса: доставка, себестоимость, курьеры и поставщики — весь бизнес.|Nicht nur Kasse: Lieferung, Kalkulation, Kuriere und Lieferanten — Ihr ganzer Betrieb.
Canlı kurye takibi|Live courier tracking|تتبع المندوب المباشر|Отслеживание курьера|Live-Kurierverfolgung
Kurye yola çıkınca müşteri haritada canlı konumu ve tahmini varış süresini görür. Kurye uygulaması ekran kilitliyken de konum gönderir.|Once the courier leaves, the customer sees the live location and ETA on a map. The courier app keeps sending location even when the screen is locked.|عند انطلاق المندوب يرى العميل الموقع المباشر ووقت الوصول على الخريطة، ويواصل التطبيق الإرسال حتى مع قفل الشاشة.|Клиент видит курьера на карте и время прибытия. Приложение передаёт геопозицию даже при заблокированном экране.|Der Kunde sieht Live-Standort und Ankunftszeit auf der Karte; die Kurier-App sendet auch bei gesperrtem Bildschirm.
Trafiğe göre teslim süresi|Traffic-aware delivery time|وقت توصيل حسب حركة المرور|Время доставки с учётом пробок|Lieferzeit nach Verkehrslage
Adres girilince Google Haritalar ile gerçek yol süresi hesaplanır; trafik yoğunlaşırsa yola çıkış saati otomatik öne alınır ve uyarı gelir.|Real driving time is calculated with Google Maps; if traffic builds up, departure is moved earlier automatically and you get an alert.|يُحسب وقت القيادة الفعلي عبر خرائط Google، وإذا ازدحمت الطرق يُقدَّم وقت الانطلاق تلقائيًا مع تنبيه.|Реальное время в пути считается через Google Maps; при пробках выезд переносится раньше и приходит уведомление.|Die echte Fahrzeit wird mit Google Maps berechnet; bei Stau wird die Abfahrt automatisch vorgezogen.
Tüketime göre malzeme siparişi|Consumption-based purchasing|طلب المواد حسب الاستهلاك|Закупка по расходу|Einkauf nach Verbrauch
Satışlardan hammadde tüketimi hesaplanır, eksilecek malzemeler için sipariş taslağı hazırlanır. Tedarikçiye PDF, e-posta ve SMS ile tek tuşla gider.|Ingredient usage is calculated from sales and a purchase draft is prepared; send it to suppliers as PDF, email or SMS in one tap.|يُحسب استهلاك المواد من المبيعات ويُجهَّز طلب شراء يُرسل للمورد بنقرة عبر PDF أو البريد أو SMS.|Расход считается по продажам, черновик заказа отправляется поставщику в PDF, по почте или SMS.|Der Verbrauch wird aus Verkäufen berechnet; der Bestellentwurf geht per PDF, E-Mail oder SMS an den Lieferanten.
Gerçek maliyet ve başa baş|Real cost & break-even|التكلفة الفعلية ونقطة التعادل|Реальная себестоимость и безубыточность|Echte Kosten & Break-even
Mal kabuldeki alış fiyatlarıyla ürün maliyeti kendiliğinden güncellenir. Sabit giderlerle başa baş adedi, masa ve paket kârlılığı ayrı ayrı görünür.|Product cost updates from purchase prices; see break-even units and dine-in vs delivery profitability.|تتحدث تكلفة المنتج من أسعار الشراء، مع عرض نقطة التعادل وربحية الطاولة والتوصيل.|Себестоимость обновляется по закупочным ценам; видна точка безубыточности и прибыль зала и доставки.|Produktkosten aktualisieren sich aus Einkaufspreisen; Break-even und Rentabilität Tisch vs. Lieferung.
Masada "paket yap"|"Pack to go" at the table|"تغليف سفري" على الطاولة|«С собой» прямо со стола|„Einpacken" am Tisch
Masadaki yemeğin kalanı tek dokunuşla pakete dönüştürülür; kutu ve poşet stoktan düşer, paket maliyeti kârlılığa yansır.|Leftovers are packed with one tap; boxes and bags come off stock and packaging cost is reflected in profit.|تُغلَّف البقايا بنقرة واحدة؛ تُخصم العلب والأكياس من المخزون وتنعكس التكلفة على الربح.|Остатки упаковываются в одно касание; коробки списываются, стоимость упаковки учитывается.|Reste werden mit einem Tipp verpackt; Boxen gehen vom Bestand ab, Kosten fließen in den Gewinn.
Muhasebeye hazır|Accounting-ready|جاهز للمحاسبة|Готово для бухгалтерии|Buchhaltungsbereit
KDV oranına göre günlük satışlar, tahsilatlar ve alımlar Excel ile Logo, Mikro ve Paraşüt şablonlarında dışa aktarılır.|Daily sales by VAT rate, collections and purchases export to Excel and Logo, Mikro and Paraşüt templates.|تُصدَّر المبيعات حسب الضريبة والتحصيلات والمشتريات إلى Excel وقوالب Logo وMikro وParaşüt.|Продажи по ставкам НДС, оплаты и закупки выгружаются в Excel и шаблоны Logo, Mikro, Paraşüt.|Tagesumsätze nach MwSt., Einnahmen und Einkäufe als Excel sowie Logo-, Mikro- und Paraşüt-Vorlagen.
İşletmenizin ihtiyacı olan her şey|Everything your business needs|كل ما يحتاجه عملك|Всё, что нужно заведению|Alles, was Ihr Betrieb braucht
Küçük bir kafeden çok şubeli bir restorana kadar, aynı sistemle büyüyün.|From a small café to a multi-branch restaurant, grow with one system.|من مقهى صغير إلى مطعم متعدد الفروع، انمُ بنظام واحد.|От маленького кафе до сети ресторанов — одна система.|Vom kleinen Café bis zur Kette — ein System.
Sipariş Al|Order Taking|أخذ الطلبات|Приём заказов|Bestellaufnahme
Mutfak Ekranı|Kitchen Display|شاشة المطبخ|Экран кухни|Küchendisplay
Paket Servis|Delivery & Takeaway|التوصيل والسفري|Доставка и с собой|Lieferung & Abholung
Ödemeler|Payments|المدفوعات|Оплаты|Zahlungen
Finansal Analiz|Financial Analysis|التحليل المالي|Финансовый анализ|Finanzanalyse
Reçete & Stok|Recipes & Stock|الوصفات والمخزون|Рецепты и склад|Rezepte & Lager
Müşteriler & Sadakat|Customers & Loyalty|العملاء والولاء|Клиенты и лояльность|Kunden & Treue
Rezervasyon & Bekleme Listesi|Reservations & Waitlist|الحجوزات وقائمة الانتظار|Бронирование и лист ожидания|Reservierungen & Warteliste
QR Menü ile Sipariş|QR Menu Ordering|الطلب عبر قائمة QR|Заказ через QR-меню|Bestellen per QR-Menü
Bahşiş Yönetimi|Tip Management|إدارة الإكراميات|Учёт чаевых|Trinkgeldverwaltung
Tedarikçi & Satın Alma|Suppliers & Purchasing|الموردون والمشتريات|Поставщики и закупки|Lieferanten & Einkauf
Anlık Bildirimler|Instant Notifications|إشعارات فورية|Мгновенные уведомления|Sofortbenachrichtigungen
Hediye Kartları|Gift Cards|بطاقات الهدايا|Подарочные карты|Geschenkkarten
Görsel Kat Planı|Visual Floor Plan|مخطط الطابق المرئي|Визуальный план зала|Visueller Raumplan
Çok Dilli QR Menü|Multilingual QR Menu|قائمة QR متعددة اللغات|Многоязычное QR-меню|Mehrsprachiges QR-Menü
Google Yorumlarına Yönlendirme|Google Review Prompt|التوجيه لتقييمات Google|Отзывы в Google|Google-Bewertungen
Dışarıdan Online Sipariş|Online Ordering|الطلب عبر الإنترنت|Онлайн-заказы|Online-Bestellung
Fiş Tasarımı Özelleştirme|Custom Receipt Design|تخصيص تصميم الإيصال|Свой дизайн чека|Individuelles Belegdesign
Ekip İçi Mesajlaşma|Team Messaging|مراسلة الفريق|Чат команды|Team-Chat
Peyk Bas-Konuş (Telsiz)|Peyk Push-to-Talk (Walkie-talkie)|بيك اضغط وتحدث (لاسلكي)|Peyk рация|Peyk Push-to-Talk (Funk)
Masadan Garson Çağırma|Call Waiter from Table|استدعاء النادل من الطاولة|Вызов официанта со стола|Kellner vom Tisch rufen
Vardiya & Puantaj|Shifts & Timesheets|الورديات والدوام|Смены и табель|Schichten & Zeiterfassung
Canlı Çoklu Cihaz|Live Multi-device|تعدد الأجهزة المباشر|Синхронизация устройств|Live auf allen Geräten
Online Menü Düzeni|Online Menu Layout|تنسيق القائمة الإلكترونية|Оформление онлайн-меню|Online-Menü-Layout
Bekleme Listesinde Ön Sipariş|Pre-orders on the Waitlist|طلب مسبق في قائمة الانتظار|Предзаказ из листа ожидания|Vorbestellung auf der Warteliste
Rol Bazlı Yetkiler|Role-based Permissions|صلاحيات حسب الدور|Права по ролям|Rollenbasierte Rechte
Sesli ve Grup Araması|Voice & Group Calls|مكالمات صوتية وجماعية|Голосовые и групповые звонки|Sprach- & Gruppenanrufe
İnternetsiz Çalışma|Works Offline|العمل دون إنترنت|Работа без интернета|Offline-Betrieb
İzinli Uzaktan Destek|Permission-based Remote Support|دعم عن بُعد بإذن|Удалённая поддержка с разрешения|Fernsupport mit Freigabe
Menü Mühendisliği|Menu Engineering|هندسة القائمة|Инжиниринг меню|Menü-Engineering
Yoğunluk & Masa Haritası|Heatmap & Table Map|خريطة الازدحام والطاولات|Тепловая карта и столы|Heatmap & Tischplan
Garson & Müşteri Kartları|Waiter & Customer Cards|بطاقات النادل والعميل|Карточки официантов и клиентов|Kellner- & Kundenkarten
Gün Sonu (Z) Raporu|End-of-Day (Z) Report|تقرير نهاية اليوم (Z)|Z-отчёт|Tagesabschluss (Z-Bericht)
Stok Tahmini|Stock Forecast|توقع المخزون|Прогноз остатков|Bestandsprognose
İptal Takibi|Cancellation Tracking|تتبع الإلغاءات|Учёт отмен|Storno-Tracking
Rezervasyon Hatırlatma|Reservation Reminders|تذكير الحجوزات|Напоминания о брони|Reservierungserinnerungen
KVKK Uyumlu Görünüm|Privacy-friendly Display|عرض يحمي الخصوصية|Защита персональных данных|Datenschutzfreundliche Anzeige
Kendi Hesaplarınızla Entegrasyon|Bring Your Own Accounts|التكامل مع حساباتك|Интеграция со своими сервисами|Eigene Konten anbinden
Online Siparişte Kartla Ödeme|Card Payment for Online Orders|الدفع بالبطاقة للطلبات الإلكترونية|Оплата картой онлайн|Kartenzahlung bei Online-Bestellung
Limitli Hesaplar|Limited Accounts|حسابات محدودة|Лимитные счета|Limitkonten
Doğum Günü Uyarıları|Birthday Alerts|تنبيهات أعياد الميلاد|Напоминания о днях рождения|Geburtstagshinweise
Kurye Takibi|Courier Tracking|تتبع المندوب|Отслеживание курьера|Kurierverfolgung
Gün Sonu Kapanışı|Day Closing|إغلاق نهاية اليوم|Закрытие дня|Tagesabschluss
Rezervasyon Analizi|Reservation Analytics|تحليل الحجوزات|Аналитика бронирований|Reservierungsanalyse
Excel ile İçe / Dışa Aktarma|Excel Import / Export|استيراد / تصدير Excel|Импорт / экспорт Excel|Excel-Import / -Export
QR ile Masadan Hesap Ödeme|Pay at Table via QR|الدفع من الطاولة عبر QR|Оплата со стола по QR|Am Tisch per QR bezahlen
Müşteri Değerlendirmeleri|Customer Reviews|تقييمات العملاء|Отзывы клиентов|Kundenbewertungen
Haftalık Vardiya Planı|Weekly Shift Plan|جدول الورديات الأسبوعي|Недельный график смен|Wöchentlicher Schichtplan
Müşteri Geri Kazanım|Customer Win-back|استعادة العملاء|Возврат клиентов|Kundenrückgewinnung
Kampanya & Kupon|Campaigns & Coupons|الحملات والقسائم|Акции и купоны|Kampagnen & Gutscheine
Masa Birleştirme & Taşıma|Merge & Move Tables|دمج ونقل الطاولات|Объединение и перенос столов|Tische zusammenlegen & verschieben
Açık Hesap (Veresiye)|Open Accounts (Tab)|الحساب المفتوح (آجل)|Открытые счета (в долг)|Offene Rechnungen (Anschreiben)
Maliyet & Reçeteden Maliyet|Costing from Recipes|التكلفة من الوصفات|Себестоимость по рецептам|Kalkulation aus Rezepten
Kritik Stok & Tek Tık Satınalma|Low Stock & One-tap Purchasing|مخزون منخفض وشراء بنقرة|Мало на складе и закупка в один клик|Niedriger Bestand & Ein-Klick-Einkauf
Çok Şubeli Şirket Paneli|Multi-branch Company Panel|لوحة الشركة متعددة الفروع|Панель сети заведений|Filial-Dashboard
Yönetici Özet E-postaları|Manager Summary Emails|رسائل ملخص للمدير|Сводки для руководителя|Zusammenfassungen für die Leitung
Kurulum Rehberi|Setup Guide|دليل الإعداد|Мастер настройки|Einrichtungsassistent
Yedekleme & Geri Yükleme|Backup & Restore|النسخ الاحتياطي والاستعادة|Резервное копирование|Sicherung & Wiederherstellung
Yazar Kasa & Pazaryeri Altyapısı|Fiscal Printer & Marketplace Ready|جاهز لآلات الكاش والأسواق|Касса и маркетплейсы|Kassen- & Marktplatz-Anbindung
Fiyatlandırma|Pricing|الأسعار|Цены|Preise
Basit, şeffaf fiyatlar|Simple, transparent pricing|أسعار بسيطة وشفافة|Простые и прозрачные цены|Einfache, transparente Preise
Her paket 7 gün ücretsiz denemeyle başlar. Kredi kartı gerekmez.|Every plan starts with a 7-day free trial. No credit card required.|تبدأ كل باقة بتجربة مجانية لمدة 7 أيام. لا حاجة لبطاقة.|Каждый тариф — 7 дней бесплатно. Карта не нужна.|Jeder Tarif startet mit 7 Tagen gratis. Keine Kreditkarte.
Aylık|Monthly|شهري|Ежемесячно|Monatlich
Yıllık|Yearly|سنوي|Ежегодно|Jährlich
Tüm paketlerde standart|Included in every plan|متضمن في كل الباقات|Во всех тарифах|In jedem Tarif enthalten
Aşağıdaki özellikler her pakette bulunur; kartlarda yalnızca paketler arasındaki farklar listelenir.|These features are in every plan; the cards only list the differences.|هذه المزايا موجودة في كل باقة؛ تعرض البطاقات الفروق فقط.|Эти функции есть во всех тарифах; в карточках — только различия.|Diese Funktionen sind in jedem Tarif; die Karten zeigen nur Unterschiede.
Eklentiler ve Entegrasyonlar|Add-ons & Integrations|الإضافات والتكاملات|Дополнения и интеграции|Add-ons & Integrationen
Ek özellikleri paketinize ekleyin; SMS, e-posta, ödeme ve diğer entegrasyonları kendi hesaplarınızla yönetin.|Add extra features to your plan; manage SMS, email, payment and other integrations with your own accounts.|أضف مزايا لباقتك وأدِر SMS والبريد والدفع بحساباتك.|Добавляйте функции; SMS, почта и оплата — через ваши аккаунты.|Erweitern Sie Ihren Tarif; SMS, E-Mail und Zahlung mit eigenen Konten.
Sık Sorulan Sorular|Frequently Asked Questions|الأسئلة الشائعة|Частые вопросы|Häufige Fragen
Aklınıza takılanlar|Got questions?|لديك أسئلة؟|Остались вопросы?|Noch Fragen?
Ücretsiz deneme nasıl çalışır?|How does the free trial work?|كيف تعمل التجربة المجانية؟|Как работает пробный период?|Wie funktioniert die Testphase?
7 gün boyunca tüm özellikleri kredi kartı vermeden kullanırsınız. Süre bitince paket seçmezseniz hesabınız kendiliğinden durur, ücret alınmaz.|Use all features for 7 days without a card. If you don't pick a plan, the account simply pauses — no charge.|استخدم كل المزايا 7 أيام دون بطاقة. إن لم تختر باقة يتوقف الحساب تلقائيًا دون رسوم.|7 дней всех функций без карты. Без выбора тарифа аккаунт приостановится, без списаний.|7 Tage alle Funktionen ohne Karte. Ohne Tarifwahl pausiert das Konto — ohne Kosten.
Hangi cihazlarda çalışır?|Which devices does it run on?|على أي أجهزة يعمل؟|На каких устройствах работает?|Auf welchen Geräten läuft es?
Windows ve Mac masaüstü uygulaması, Android uygulaması ve iPhone/iPad için web uygulaması var. Tüm cihazlar aynı hesapla anlık senkron çalışır.|Windows and Mac desktop apps, an Android app and a web app for iPhone/iPad, all synced live on one account.|تطبيقات لويندوز وماك وأندرويد وتطبيق ويب لآيفون/آيباد، متزامنة على حساب واحد.|Приложения для Windows, Mac, Android и веб для iPhone/iPad, синхронно в одном аккаунте.|Desktop-Apps für Windows und Mac, Android-App und Web-App für iPhone/iPad, live synchron.
İnternet kesilirse ne olur?|What if the internet goes down?|ماذا لو انقطع الإنترنت؟|Что если пропадёт интернет?|Was, wenn das Internet ausfällt?
Sipariş almaya devam edersiniz; bağlantı gelince bekleyen işlemler kendiliğinden gönderilir.|You keep taking orders; pending actions are sent automatically when the connection returns.|تواصل أخذ الطلبات، وتُرسل العمليات المعلقة تلقائيًا عند عودة الاتصال.|Вы продолжаете принимать заказы; всё отправится при восстановлении связи.|Sie nehmen weiter Bestellungen auf; alles wird bei Verbindung automatisch gesendet.
Mevcut yazıcımı kullanabilir miyim?|Can I use my existing printer?|هل يمكنني استخدام طابعتي الحالية؟|Можно ли использовать мой принтер?|Kann ich meinen Drucker verwenden?
Evet. Termal fiş yazıcılarını istasyon bazında eşleştirir, fiş tasarımını kağıt genişliğine göre ayarlarsınız.|Yes. Map thermal receipt printers per station and adjust the receipt design to the paper width.|نعم. اربط الطابعات الحرارية بكل محطة واضبط التصميم حسب عرض الورق.|Да. Назначьте термопринтеры станциям и настройте чек под ширину ленты.|Ja. Ordnen Sie Thermodrucker den Stationen zu und passen Sie das Design an.
Verilerim güvende mi?|Is my data safe?|هل بياناتي آمنة؟|Мои данные в безопасности?|Sind meine Daten sicher?
Veriler şifreli bağlantıyla saklanır, telefon numaraları KVKK gereği maskeli görünür. İstediğiniz an tüm verinizin yedeğini indirebilirsiniz.|Data is stored over encrypted connections and phone numbers are masked. Download a full backup anytime.|تُحفظ البيانات عبر اتصال مشفّر وتُخفى أرقام الهواتف، ويمكنك تنزيل نسخة احتياطية في أي وقت.|Данные передаются в зашифрованном виде, телефоны скрыты; резервную копию можно скачать в любой момент.|Daten werden verschlüsselt übertragen, Telefonnummern maskiert; Backup jederzeit herunterladbar.
Paketimi sonradan değiştirebilir miyim?|Can I change my plan later?|هل يمكنني تغيير باقتي لاحقًا؟|Можно сменить тариф позже?|Kann ich den Tarif später ändern?
Evet, istediğiniz zaman üst pakete geçebilir, ek modül alabilir ya da aboneliğinizi iptal edebilirsiniz.|Yes, upgrade, add modules or cancel anytime.|نعم، يمكنك الترقية أو إضافة وحدات أو الإلغاء في أي وقت.|Да, в любой момент повысьте тариф, добавьте модули или отмените.|Ja, jederzeit upgraden, Module hinzufügen oder kündigen.
Eğitim Videosu|Tutorial Video|فيديو تعليمي|Обучающее видео|Anleitungsvideo
Peyktan nasıl kullanılır?|How to use Peyktan?|كيف تستخدم Peyktan؟|Как пользоваться Peyktan?|Wie nutzt man Peyktan?
Kurulumdan sipariş almaya, ödemeden raporlara kadar tüm özellikler adım adım anlatılıyor.|From setup to orders, payments and reports — every feature step by step.|من الإعداد إلى الطلبات والمدفوعات والتقارير — كل ميزة خطوة بخطوة.|От настройки до заказов, оплат и отчётов — шаг за шагом.|Von der Einrichtung bis zu Bestellungen, Zahlungen und Berichten — Schritt für Schritt.
Videoyu indirin|Download the video|تنزيل الفيديو|Скачать видео|Video herunterladen
Uygulamalar|Apps|التطبيقات|Приложения|Apps
Her cihazda Peyktan|Peyktan on every device|Peyktan على كل جهاز|Peyktan на любом устройстве|Peyktan auf jedem Gerät
Kasada bilgisayar, salonda telefon ya da tablet: hepsi aynı hesapla, anlık senkron çalışır.|A computer at the till, phones or tablets on the floor: all live-synced on one account.|حاسوب عند الكاشير وهواتف أو أجهزة لوحية في الصالة: كلها متزامنة على حساب واحد.|Компьютер на кассе, телефоны и планшеты в зале — всё синхронно в одном аккаунте.|Computer an der Kasse, Handys oder Tablets im Saal: alles live synchron.
Kasa ve mutfak bilgisayarları için masaüstü uygulaması. Windows 10 / 11.|Desktop app for till and kitchen computers. Windows 10 / 11.|تطبيق سطح مكتب لحواسيب الكاشير والمطبخ. Windows 10 / 11.|Приложение для кассы и кухни. Windows 10 / 11.|Desktop-App für Kassen- und Küchen-PCs. Windows 10 / 11.
Windows için indir|Download for Windows|تنزيل لويندوز|Скачать для Windows|Für Windows herunterladen
Mac bilgisayarlar için (Apple Silicon ve Intel).|For Mac computers (Apple Silicon and Intel).|لأجهزة ماك (Apple Silicon وIntel).|Для Mac (Apple Silicon и Intel).|Für Mac (Apple Silicon und Intel).
Mac için indir|Download for Mac|تنزيل لماك|Скачать для Mac|Für Mac herunterladen
Garson ve kurye telefonları, tabletler; bildirimler, arka planda Bas-Konuş ve kilit ekranında çalan sesli arama.|Waiter and courier phones, tablets; notifications, background push-to-talk and calls that ring on the lock screen.|هواتف النُدُل والمندوبين والأجهزة اللوحية؛ إشعارات واضغط وتحدث في الخلفية ومكالمات على شاشة القفل.|Телефоны официантов и курьеров, планшеты; уведомления, рация в фоне и звонки на экране блокировки.|Kellner- und Kurierhandys, Tablets; Benachrichtigungen, Push-to-Talk im Hintergrund und Anrufe auf dem Sperrbildschirm.
Google Play'den indir|Get it on Google Play|حمّله من Google Play|Скачать в Google Play|Bei Google Play laden
Web'den aç|Open on the web|افتح على الويب|Открыть в браузере|Im Web öffnen
Satın Al →|Buy →|شراء ←|Купить →|Kaufen →
© 2026 Peyktan. Tüm hakları saklıdır.|© 2026 Peyktan. All rights reserved.|© 2026 Peyktan. جميع الحقوق محفوظة.|© 2026 Peyktan. Все права защищены.|© 2026 Peyktan. Alle Rechte vorbehalten.
Gizlilik Politikası|Privacy Policy|سياسة الخصوصية|Политика конфиденциальности|Datenschutzerklärung
Hesap Silme|Account Deletion|حذف الحساب|Удаление аккаунта|Kontolöschung
Temayı değiştir|Change theme|تغيير المظهر|Сменить тему|Design wechseln
`;
const D = {};
L.trim().split('\n').forEach(r => { const p = r.split('|'); if(p.length >= 5) D[p[0].trim()] = { en: p[1], ar: p[2], ru: p[3], de: p[4] }; });
window.I18N_DICT = Object.assign(window.I18N_DICT || {}, D);
})();
function siteSetLang(v){ setAppLang(v); }
document.addEventListener('DOMContentLoaded', () => { const s = document.getElementById('siteLang'); if(s && typeof APP_LANG !== 'undefined') s.value = APP_LANG; });
