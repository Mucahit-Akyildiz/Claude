/* Çeviri sözlüğü: "Türkçe|English|العربية|Русский|Deutsch" (bkz. i18n.js). Çekirdek metin yazılır; baştaki simge ve
   sondaki sayı/noktalama otomatik korunur ("🧾 Sipariş" için "Sipariş" yeterli). Yeni satır eklemek yeterlidir. */
(function(){
const L = `
Giriş Yap|Log In|تسجيل الدخول|Войти|Anmelden
Giriş Yapın|Log In|سجّل الدخول|Вход|Anmelden
İşletme kodu, kullanıcı adı ve şifrenizle giriş yapın|Log in with your business code, username and password|سجّل الدخول باستخدام رمز المنشأة واسم المستخدم وكلمة المرور|Войдите с кодом заведения, логином и паролем|Melden Sie sich mit Betriebscode, Benutzername und Passwort an
İşletme kodu (örn. test123)|Business code (e.g. test123)|رمز المنشأة (مثال: test123)|Код заведения (напр. test123)|Betriebscode (z. B. test123)
Kullanıcı adı|Username|اسم المستخدم|Имя пользователя|Benutzername
Şifre|Password|كلمة المرور|Пароль|Passwort
Beni hatırla|Remember me|تذكرني|Запомнить меня|Angemeldet bleiben
Şifremi Unuttum|Forgot password|نسيت كلمة المرور|Забыли пароль?|Passwort vergessen
Yeni işletme misiniz?|New business?|منشأة جديدة؟|Новое заведение?|Neuer Betrieb?
İşletme kodu, kullanıcı adı veya şifre hatalı|Business code, username or password is wrong|رمز المنشأة أو اسم المستخدم أو كلمة المرور غير صحيحة|Неверный код заведения, логин или пароль|Betriebscode, Benutzername oder Passwort ist falsch
Şirket Girişi|Company Login|دخول الشركة|Вход для компании|Unternehmens-Login
Girişe Dön|Back to login|العودة لتسجيل الدخول|Назад ко входу|Zurück zur Anmeldung
Sipariş Al|Take Order|أخذ الطلب|Принять заказ|Bestellung aufnehmen
Paket Servis|Delivery & Takeaway|التوصيل والسفري|Доставка и с собой|Lieferung & Abholung
Mutfak Ekranı|Kitchen Display|شاشة المطبخ|Экран кухни|Küchendisplay
Rezervasyonlar ve Bekleme Listesi|Reservations & Waitlist|الحجوزات وقائمة الانتظار|Бронирования и лист ожидания|Reservierungen & Warteliste
Müşteriler|Customers|العملاء|Клиенты|Kunden
Malzeme Siparişi Ver|Order Supplies|طلب المواد|Заказ продуктов|Waren bestellen
Bildirimler|Notifications|الإشعارات|Уведомления|Benachrichtigungen
Ödemeler|Payments|المدفوعات|Оплаты|Zahlungen
Mal Kabul|Goods Receipt|استلام البضائع|Приёмка товара|Wareneingang
Finansal Analiz|Financial Analysis|التحليل المالي|Финансовый анализ|Finanzanalyse
Mesajlar|Messages|الرسائل|Сообщения|Nachrichten
Peyk Bas-Konuş|Peyk Push-to-Talk|بيك اضغط وتحدث|Peyk Рация|Peyk Push-to-Talk
Ayarlar|Settings|الإعدادات|Настройки|Einstellungen
Cihaz Yazıcısı|Device Printer|طابعة الجهاز|Принтер устройства|Gerätedrucker
Yardım|Help|مساعدة|Помощь|Hilfe
Geri|Back|رجوع|Назад|Zurück
Kaydet|Save|حفظ|Сохранить|Speichern
Vazgeç|Cancel|إلغاء|Отмена|Abbrechen
İptal|Cancel|إلغاء|Отмена|Abbrechen
İptal Et|Cancel|إلغاء|Отменить|Stornieren
Kapat|Close|إغلاق|Закрыть|Schließen
Sil|Delete|حذف|Удалить|Löschen
Düzenle|Edit|تعديل|Изменить|Bearbeiten
Ekle|Add|إضافة|Добавить|Hinzufügen
Tamam|OK|موافق|ОК|OK
Onayla|Confirm|تأكيد|Подтвердить|Bestätigen
Reddet|Reject|رفض|Отклонить|Ablehnen
Gönder|Send|إرسال|Отправить|Senden
Ara|Search|بحث|Поиск|Suchen
Yükleniyor…|Loading…|جارٍ التحميل…|Загрузка…|Wird geladen…
Yenile|Refresh|تحديث|Обновить|Aktualisieren
Çıkış Yap|Log Out|تسجيل الخروج|Выйти|Abmelden
Çıkış|Log out|خروج|Выход|Abmelden
Sonra|Later|لاحقًا|Позже|Später
Şimdi değil|Not now|ليس الآن|Не сейчас|Nicht jetzt
Tümü|All|الكل|Все|Alle
Toplam|Total|المجموع|Итого|Gesamt
Ara Toplam|Subtotal|المجموع الفرعي|Промежуточный итог|Zwischensumme
Tutar|Amount|المبلغ|Сумма|Betrag
Miktar|Quantity|الكمية|Количество|Menge
Sebep|Reason|السبب|Причина|Grund
Not|Note|ملاحظة|Примечание|Notiz
Sipariş|Order|الطلب|Заказ|Bestellung
Müşteri|Customer|العميل|Клиент|Kunde
Masa|Table|طاولة|Стол|Tisch
Paket|Delivery|توصيل|Доставка|Lieferung
Gel-Al|Takeaway|سفري|С собой|Abholung
Kurye|Courier|المندوب|Курьер|Kurier
Kuryeler|Couriers|المندوبون|Курьеры|Kuriere
Sepet boş|Cart is empty|السلة فارغة|Корзина пуста|Warenkorb ist leer
Onayla ve Gönder|Confirm and Send|تأكيد وإرسال|Подтвердить и отправить|Bestätigen und senden
Masa Tara|Scan Table|مسح الطاولة|Сканировать стол|Tisch scannen
Kat Planı|Floor Plan|مخطط الطابق|План зала|Raumplan
Tüm masalar|All tables|كل الطاولات|Все столы|Alle Tische
Boş masa|Free tables|طاولات فارغة|Свободные столы|Freie Tische
Sipariş bekleniyor|Awaiting order|بانتظار الطلب|Ожидает заказа|Wartet auf Bestellung
Hazırlanıyor|Preparing|قيد التحضير|Готовится|In Zubereitung
Hazır · ödeme bekliyor|Ready · awaiting payment|جاهز · بانتظار الدفع|Готово · ждёт оплаты|Fertig · wartet auf Zahlung
Sipariş al|Take order|أخذ طلب|Принять заказ|Bestellung aufnehmen
Bu bölgede masa yok.|No tables in this area.|لا توجد طاولات في هذه المنطقة.|В этой зоне нет столов.|Keine Tische in diesem Bereich.
Kişi sayısı girilmedi|Guest count not entered|لم يُدخل عدد الأشخاص|Не указано число гостей|Personenzahl fehlt
Kişi sayısı|Guests|عدد الأشخاص|Гостей|Personen
Masa & Müşteri|Table & Customer|الطاولة والعميل|Стол и клиент|Tisch & Kunde
Müşteri & Teslimat|Customer & Delivery|العميل والتوصيل|Клиент и доставка|Kunde & Lieferung
Müşteri Adı|Customer Name|اسم العميل|Имя клиента|Kundenname
Telefon|Phone|الهاتف|Телефон|Telefon
E-posta|Email|البريد الإلكتروني|Эл. почта|E-Mail
Adres|Address|العنوان|Адрес|Adresse
Teslimat Adresi|Delivery Address|عنوان التوصيل|Адрес доставки|Lieferadresse
Sipariş Türü|Order Type|نوع الطلب|Тип заказа|Bestellart
Adrese teslim|Delivered to address|توصيل إلى العنوان|Доставка по адресу|Lieferung an Adresse
Müşteri gelip alır|Customer picks up|العميل يستلم بنفسه|Клиент заберёт сам|Kunde holt ab
Yaklaşık Teslim Süresi|Estimated Delivery Time|الوقت التقريبي للتوصيل|Примерное время доставки|Ungefähre Lieferzeit
Hemen|Now|فورًا|Сейчас|Sofort
Saat|Time|الساعة|Время|Uhrzeit
Diğer|Other|أخرى|Другое|Andere
Gönderilecek|To send|للإرسال|К отправке|Zu senden
Boşalt|Clear|إفراغ|Очистить|Leeren
Ürün ara…|Search products…|ابحث عن منتج…|Поиск товара…|Produkt suchen…
Sık satılanlar|Best sellers|الأكثر مبيعًا|Хиты продаж|Bestseller
Ekstralar|Extras|إضافات|Дополнения|Extras
Sipariş Etiketleri|Order Tags|وسوم الطلب|Метки заказа|Bestell-Tags
Personel|Staff|الموظفون|Персонал|Personal
Masayı Taşı / Birleştir|Move / Merge Table|نقل / دمج الطاولة|Перенести / объединить стол|Tisch verschieben / zusammenlegen
Yeni Paket Sipariş|New Delivery Order|طلب توصيل جديد|Новый заказ на доставку|Neue Lieferbestellung
Yeni sipariş|New order|طلب جديد|Новый заказ|Neue Bestellung
Ödemeye Geç|Go to Payment|الانتقال إلى الدفع|К оплате|Zur Zahlung
Hesabı Al|Take Payment|استلام الحساب|Принять оплату|Abrechnen
Nakit|Cash|نقدًا|Наличные|Bar
Kart|Card|بطاقة|Карта|Karte
Kredi Kartı|Credit Card|بطاقة ائتمان|Кредитная карта|Kreditkarte
Havale / EFT|Bank Transfer|تحويل بنكي|Банковский перевод|Überweisung
Kalanı Nakit|Rest in Cash|الباقي نقدًا|Остаток наличными|Rest bar
Kalanı Kart|Rest by Card|الباقي بالبطاقة|Остаток картой|Rest mit Karte
Bahşiş|Tip|إكرامية|Чаевые|Trinkgeld
İndirim|Discount|خصم|Скидка|Rabatt
Hediye Kartı|Gift Card|بطاقة هدية|Подарочная карта|Geschenkkarte
Ödeme Alındı|Payment Received|تم استلام الدفع|Оплата получена|Zahlung erhalten
Açık hesap|Open bill|حساب مفتوح|Открытый счёт|Offene Rechnung
Açık hesap yok|No open bills|لا توجد حسابات مفتوحة|Нет открытых счетов|Keine offenen Rechnungen
Tahsil edilecek toplam|Total to collect|المبلغ المطلوب تحصيله|Всего к оплате|Zu kassieren gesamt
Hazır · ödeme bekliyor|Ready · awaiting payment|جاهز · بانتظار الدفع|Готово · ждёт оплаты|Fertig · wartet auf Zahlung
Bekleyen sipariş yok|No pending orders|لا توجد طلبات معلّقة|Нет ожидающих заказов|Keine offenen Bestellungen
Hazır|Ready|جاهز|Готово|Fertig
Hepsi Hazır|All Ready|الكل جاهز|Всё готово|Alles fertig
Yeni 0–10 dk|New 0–10 min|جديد 0–10 د|Новый 0–10 мин|Neu 0–10 Min
Bekliyor 10–20 dk|Waiting 10–20 min|بانتظار 10–20 د|Ждёт 10–20 мин|Wartet 10–20 Min
Gecikti 20 dk +|Late 20 min +|متأخر +20 د|Опоздание 20+ мин|Verspätet 20+ Min
İstasyon seçin|Choose a station|اختر محطة|Выберите станцию|Station wählen
Mutfak|Kitchen|المطبخ|Кухня|Küche
Kuryeye Ver|Assign to Courier|تسليم للمندوب|Передать курьеру|An Kurier übergeben
Yola Çıkar|Dispatch|إرسال للتوصيل|Отправить|Losschicken
Teslim edildi|Delivered|تم التسليم|Доставлено|Zugestellt
Siparişi aldım|I picked up the order|استلمت الطلب|Я забрал заказ|Bestellung abgeholt
Konumumu paylaş|Share my location|مشاركة موقعي|Поделиться местоположением|Standort teilen
Hızlı Yönetim|Quick Actions|إدارة سريعة|Быстрые действия|Schnellaktionen
Hızlı Başla|Quick Start|بداية سريعة|Быстрый старт|Schnellstart
Bu haftaki vardiyalarım|My shifts this week|ورديّاتي هذا الأسبوع|Мои смены на этой неделе|Meine Schichten diese Woche
Vardiyam|My shift|ورديّتي|Моя смена|Meine Schicht
Vardiyaya Başla|Start Shift|بدء الوردية|Начать смену|Schicht beginnen
Vardiyayı Bitir|End Shift|إنهاء الوردية|Завершить смену|Schicht beenden
Önce vardiyanızı başlatın|Start your shift first|ابدأ ورديتك أولًا|Сначала начните смену|Starten Sie zuerst Ihre Schicht
Koyu|Dark|داكن|Тёмная|Dunkel
Açık|Light|فاتح|Светлая|Hell
Koyu tema|Dark theme|المظهر الداكن|Тёмная тема|Dunkles Design
Açık tema|Light theme|المظهر الفاتح|Светлая тема|Helles Design
Personel değiştir (PIN)|Switch staff (PIN)|تبديل الموظف (PIN)|Сменить сотрудника (PIN)|Mitarbeiter wechseln (PIN)
Personel değiştir|Switch staff|تبديل الموظف|Сменить сотрудника|Mitarbeiter wechseln
Hızlı geçiş PIN'imi belirle / değiştir|Set / change my quick-switch PIN|تعيين / تغيير رمز PIN للتبديل السريع|Задать / изменить PIN|Schnellwechsel-PIN festlegen / ändern
Yenile (son değişiklikleri getir)|Refresh (get latest changes)|تحديث (جلب آخر التغييرات)|Обновить (последние изменения)|Aktualisieren (neueste Änderungen)
Yeni şifrenizi belirleyin|Set your new password|عيّن كلمة مرورك الجديدة|Задайте новый пароль|Neues Passwort festlegen
Hızlı geçiş PIN'inizi belirleyin|Set your quick-switch PIN|عيّن رمز PIN للتبديل السريع|Задайте PIN для быстрого входа|Schnellwechsel-PIN festlegen
Yeni sürüm hazır — dokunarak yenileyin|New version ready — tap to reload|إصدار جديد جاهز — اضغط للتحديث|Новая версия готова — нажмите для обновления|Neue Version bereit — zum Neuladen tippen
Müşteri Sipariş İstekleri|Customer Order Requests|طلبات العملاء|Заказы от клиентов|Kundenbestellungen
Gün sonunu kapat|Close the day|إغلاق نهاية اليوم|Закрыть день|Tagesabschluss
Önce gün sonunu kapatın|Close the day first|أغلق نهاية اليوم أولًا|Сначала закройте день|Zuerst den Tag abschließen
Raporlar|Reports|التقارير|Отчёты|Berichte
Kullanıcılar|Users|المستخدمون|Пользователи|Benutzer
Ürünler|Products|المنتجات|Товары|Produkte
Hammaddeler|Ingredients|المواد الخام|Ингредиенты|Zutaten
Tedarikçiler|Suppliers|الموردون|Поставщики|Lieferanten
Stok|Stock|المخزون|Остаток|Bestand
Fiyat|Price|السعر|Цена|Preis
Maliyet|Cost|التكلفة|Себестоимость|Kosten
Bugün|Today|اليوم|Сегодня|Heute
Dün|Yesterday|أمس|Вчера|Gestern
Bu hafta|This week|هذا الأسبوع|Эта неделя|Diese Woche
Bu ay|This month|هذا الشهر|Этот месяц|Dieser Monat
Tarih Aralığı|Date Range|النطاق الزمني|Период|Zeitraum
Dışa aktar|Export|تصدير|Экспорт|Exportieren
İçe aktar|Import|استيراد|Импорт|Importieren
Tümünü seç|Select all|تحديد الكل|Выбрать все|Alle auswählen
Seçimi kaldır|Clear selection|إلغاء التحديد|Снять выделение|Auswahl aufheben
Şifreyi sıfırla|Reset password|إعادة تعيين كلمة المرور|Сбросить пароль|Passwort zurücksetzen
Dil / Language|Language|اللغة|Язык|Sprache
`;
const D = {};
L.trim().split('\n').forEach(r => { const p = r.split('|'); if(p.length >= 5) D[p[0].trim()] = { en: p[1], ar: p[2], ru: p[3], de: p[4] }; });
window.I18N_DICT = Object.assign(window.I18N_DICT || {}, D);
})();
