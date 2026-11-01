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
/* 2. parti: ayarlar, raporlar, CRM, rezervasyon, yazıcı, limitler, ortak metinler. */
(function(){
const L = `
Şifreyi göster/gizle|Show/hide password|إظهار/إخفاء كلمة المرور|Показать/скрыть пароль|Passwort ein-/ausblenden
Veri yok.|No data.|لا توجد بيانات.|Нет данных.|Keine Daten.
Ciro|Revenue|الإيرادات|Выручка|Umsatz
Yükleniyor...|Loading...|جارٍ التحميل...|Загрузка...|Wird geladen...
Listeyi filtrele|Filter list|تصفية القائمة|Фильтр списка|Liste filtern
Durum|Status|الحالة|Статус|Status
opsiyonel|optional|اختياري|необязательно|optional
Ürün|Product|المنتج|Товар|Produkt
Eklentiler|Add-ons|الإضافات|Дополнения|Add-ons
Aktif|Active|نشط|Активен|Aktiv
Pasif|Inactive|غير نشط|Неактивен|Inaktiv
Kopyala|Copy|نسخ|Копировать|Kopieren
Detay|Details|التفاصيل|Подробнее|Details
İşletme|Business|المنشأة|Заведение|Betrieb
Tarih|Date|التاريخ|Дата|Datum
Açıklama|Description|الوصف|Описание|Beschreibung
Kod|Code|الرمز|Код|Code
KDV|VAT|ضريبة القيمة المضافة|НДС|MwSt.
Fire|Waste|هدر|Потери|Verlust
Menü|Menu|القائمة|Меню|Menü
Sınırsız|Unlimited|غير محدود|Без ограничений|Unbegrenzt
Yeni şifre|New password|كلمة مرور جديدة|Новый пароль|Neues Passwort
Yeni şifre (tekrar)|New password (again)|كلمة المرور الجديدة (مرة أخرى)|Новый пароль (ещё раз)|Neues Passwort (wiederholen)
6 haneli kod|6-digit code|رمز من 6 أرقام|6-значный код|6-stelliger Code
Kaldır|Remove|إزالة|Убрать|Entfernen
Başlangıç|Start|البداية|Начало|Beginn
Bitiş|End|النهاية|Конец|Ende
ya da|or|أو|или|oder
veya|or|أو|или|oder
Bu tarihte veri yok.|No data for this date.|لا توجد بيانات لهذا التاريخ.|Нет данных за эту дату.|Keine Daten für dieses Datum.
Masaya Oturt|Seat at Table|إجلاس على طاولة|Посадить за стол|Platzieren
Reçete|Recipe|الوصفة|Рецепт|Rezept
Destek|Support|الدعم|Поддержка|Support
Kullanıcı Adı|Username|اسم المستخدم|Имя пользователя|Benutzername
Telefon (opsiyonel)|Phone (optional)|الهاتف (اختياري)|Телефон (необязательно)|Telefon (optional)
Güncelle|Update|تحديث|Обновить|Aktualisieren
Değiştir|Change|تغيير|Изменить|Ändern
Temizle|Clear|مسح|Очистить|Leeren
Dönem|Period|الفترة|Период|Zeitraum
puan|points|نقاط|баллов|Punkte
Ürün yok.|No products.|لا توجد منتجات.|Нет товаров.|Keine Produkte.
Bekleme Listesi|Waitlist|قائمة الانتظار|Лист ожидания|Warteliste
Kişi|Person|شخص|Человек|Person
Kayıt yok.|No records.|لا توجد سجلات.|Нет записей.|Keine Einträge.
Malzeme maliyeti|Ingredient cost|تكلفة المواد|Стоимость продуктов|Zutatenkosten
Malzeme|Ingredient|مادة|Продукт|Zutat
Adet|Qty|العدد|Кол-во|Anzahl
adet|pcs|قطعة|шт.|Stk.
Net kâr|Net profit|صافي الربح|Чистая прибыль|Nettogewinn
Brüt kâr|Gross profit|إجمالي الربح|Валовая прибыль|Bruttogewinn
İndir|Download|تنزيل|Скачать|Herunterladen
Yazıcılar|Printers|الطابعات|Принтеры|Drucker
Gönderildi|Sent|تم الإرسال|Отправлено|Gesendet
Linki Kopyala|Copy Link|نسخ الرابط|Копировать ссылку|Link kopieren
Talebi Geri Çek|Withdraw Request|سحب الطلب|Отозвать запрос|Anfrage zurückziehen
Not (opsiyonel)|Note (optional)|ملاحظة (اختياري)|Примечание (необязательно)|Notiz (optional)
Banka|Bank|البنك|Банк|Bank
Dinle|Listen|استماع|Слушать|Anhören
Varsayılan|Default|افتراضي|По умолчанию|Standard
İstasyon yok|No stations|لا توجد محطات|Нет станций|Keine Stationen
Ürün Adı|Product Name|اسم المنتج|Название товара|Produktname
Satışa Kapat|Stop Selling|إيقاف البيع|Снять с продажи|Verkauf stoppen
Satışa Aç|Start Selling|بدء البيع|Вернуть в продажу|Verkauf starten
Sipariş Ver|Place Order|إرسال الطلب|Заказать|Bestellen
Tekrar|Repeat|تكرار|Повтор|Wiederholen
Son|Last|الأخير|Последний|Letzte
SMS|SMS|رسالة SMS|SMS|SMS
Tür|Type|النوع|Тип|Typ
Mesaj|Message|الرسالة|Сообщение|Nachricht
Roller|Roles|الأدوار|Роли|Rollen
E-posta (opsiyonel)|Email (optional)|البريد الإلكتروني (اختياري)|Эл. почта (необязательно)|E-Mail (optional)
Kategori|Category|الفئة|Категория|Kategorie
Kapalı|Off|مغلق|Выкл.|Aus
Etkinleştir|Enable|تفعيل|Включить|Aktivieren
Yanıtla|Reply|رد|Ответить|Antworten
Etiket yok|No tag|بدون وسم|Без метки|Kein Tag
Limitli hesaplar|Limited accounts|حسابات محدودة|Лимитные счета|Limitkonten
Aktifleştir|Activate|تفعيل|Активировать|Aktivieren
Ad soyad|Full name|الاسم الكامل|Имя и фамилия|Vor- und Nachname
Ad Soyad|Full Name|الاسم الكامل|Имя и фамилия|Vor- und Nachname
Kullanıcı seç|Select users|اختر المستخدمين|Выбрать пользователей|Benutzer auswählen
Günlük|Daily|يومي|Ежедневно|Täglich
Aylık|Monthly|شهري|Ежемесячно|Monatlich
Kalan tutar|Remaining amount|المبلغ المتبقي|Остаток|Restbetrag
Devretmez|Does not carry over|لا يُرحَّل|Не переносится|Kein Übertrag
Devreder|Carries over|يُرحَّل|Переносится|Wird übertragen
Limit (₺)|Limit (₺)|الحد (₺)|Лимит (₺)|Limit (₺)
Sipariş etiketi|Order tag|وسم الطلب|Метка заказа|Bestell-Tag
Seç|Select|اختيار|Выбрать|Auswählen
Ara…|Search…|بحث…|Поиск…|Suchen…
Günlük Ciro|Daily Revenue|الإيرادات اليومية|Выручка за день|Tagesumsatz
Bu aralıkta satış yok.|No sales in this range.|لا توجد مبيعات في هذه الفترة.|Нет продаж за период.|Keine Verkäufe in diesem Zeitraum.
GÜN SONU RAPORU|END OF DAY REPORT|تقرير نهاية اليوم|ОТЧЁТ ЗА ДЕНЬ|TAGESABSCHLUSSBERICHT
hesap|bills|حسابات|счетов|Rechnungen
ort. hesap|avg. bill|متوسط الحساب|средний чек|Ø Rechnung
Detaylı kart için dokunun|Tap for details|اضغط للتفاصيل|Нажмите для подробностей|Für Details tippen
Ödeme Dağılımı|Payment Breakdown|توزيع المدفوعات|Структура оплат|Zahlungsaufteilung
Haftanın Günleri|Days of the Week|أيام الأسبوع|Дни недели|Wochentage
Satış|Sales|المبيعات|Продажи|Verkauf
Prim|Bonus|مكافأة|Премия|Prämie
Son 7 Gün|Last 7 Days|آخر 7 أيام|Последние 7 дней|Letzte 7 Tage
Son 10 Gün|Last 10 Days|آخر 10 أيام|Последние 10 дней|Letzte 10 Tage
Son 30 Gün|Last 30 Days|آخر 30 يومًا|Последние 30 дней|Letzte 30 Tage
Kod Gönder|Send Code|إرسال الرمز|Отправить код|Code senden
Bilgileri Düzenle|Edit Details|تعديل المعلومات|Изменить данные|Daten bearbeiten
Hesabımı Sil|Delete My Account|حذف حسابي|Удалить аккаунт|Mein Konto löschen
E-posta adresi|Email address|عنوان البريد الإلكتروني|Адрес эл. почты|E-Mail-Adresse
Bir daha gösterme|Don't show again|لا تظهر مرة أخرى|Больше не показывать|Nicht mehr anzeigen
Kampanya & Geri Kazanım|Campaigns & Win-back|الحملات واستعادة العملاء|Акции и возврат клиентов|Kampagnen & Rückgewinnung
Şablon indir|Download template|تنزيل القالب|Скачать шаблон|Vorlage herunterladen
Müşteri yok.|No customers.|لا يوجد عملاء.|Нет клиентов.|Keine Kunden.
Puan|Points|النقاط|Баллы|Punkte
Yeni Kampanya|New Campaign|حملة جديدة|Новая акция|Neue Kampagne
Kupon kodu|Coupon code|رمز القسيمة|Промокод|Gutscheincode
Değerlendirme QR|Review QR|رمز QR للتقييم|QR для отзыва|Bewertungs-QR
SMS ile iste|Request via SMS|طلب عبر SMS|Запросить по SMS|Per SMS anfragen
Hepsini seç|Select all|تحديد الكل|Выбрать все|Alle auswählen
İsim veya telefon ara...|Search name or phone...|ابحث بالاسم أو الهاتف...|Поиск по имени или телефону...|Name oder Telefon suchen...
Hesaplar|Accounts|الحسابات|Счета|Konten
Tahsilat Al|Collect Payment|تحصيل دفعة|Принять оплату|Zahlung einziehen
Bedelsiz|Free of charge|مجاني|Бесплатно|Kostenlos
Tümünü Kaydet|Save All|حفظ الكل|Сохранить всё|Alles speichern
Bu filtrede sipariş yok.|No orders for this filter.|لا توجد طلبات لهذا الفلتر.|Нет заказов по фильтру.|Keine Bestellungen für diesen Filter.
Sonuçlar|Results|النتائج|Результаты|Ergebnisse
Rezervasyonlar|Reservations|الحجوزات|Бронирования|Reservierungen
Rezervasyon|Reservation|حجز|Бронирование|Reservierung
Filtreyi kaldır|Clear filter|إزالة الفلتر|Сбросить фильтр|Filter entfernen
Net tüketim|Net consumption|صافي الاستهلاك|Чистый расход|Nettoverbrauch
Bu tarihte vardiya kaydı yok.|No shifts on this date.|لا توجد ورديات في هذا التاريخ.|Нет смен на эту дату.|Keine Schichten an diesem Datum.
Teslim Al|Receive|استلام|Принять|Annehmen
Ciro (KDV hariç)|Revenue (excl. VAT)|الإيرادات (بدون ضريبة)|Выручка (без НДС)|Umsatz (netto)
KDV hariç|excl. VAT|بدون ضريبة|без НДС|netto
bugün|today|اليوم|сегодня|heute
Geçen haftayı kopyala|Copy last week|نسخ الأسبوع الماضي|Скопировать прошлую неделю|Letzte Woche kopieren
İsraf Gir|Record Waste|تسجيل الهدر|Учесть потери|Verlust erfassen
Bölünmüş Ödeme|Split Payment|دفع مقسّم|Раздельная оплата|Geteilte Zahlung
Açık Hesaba At|Move to Open Account|نقل إلى حساب مفتوح|Перенести в открытый счёт|Auf offene Rechnung
Hesabı e-postayla gönder|Email the bill|إرسال الحساب بالبريد|Отправить счёт по почте|Rechnung per E-Mail senden
Sorgula|Look up|استعلام|Проверить|Abfragen
Maliyet & Giderler|Cost & Expenses|التكاليف والمصاريف|Себестоимость и расходы|Kosten & Ausgaben
Pasife Al|Deactivate|إلغاء التفعيل|Деактивировать|Deaktivieren
Test Bildirimi Gönder|Send Test Notification|إرسال إشعار تجريبي|Отправить тестовое уведомление|Testbenachrichtigung senden
Etkin|Enabled|مفعّل|Включено|Aktiviert
Mikrofon|Microphone|الميكروفون|Микрофон|Mikrofon
Kamera|Camera|الكاميرا|Камера|Kamera
Çevrimiçi|Online|متصل|В сети|Online
Fotoğraf|Photo|صورة|Фото|Foto
Ses|Sound|الصوت|Звук|Ton
Gönderiliyor|Sending|جارٍ الإرسال|Отправка|Wird gesendet
Bizi Değerlendirin|Rate Us|قيّمنا|Оцените нас|Bewerten Sie uns
Gittim|Left|غادرت|Ушёл|Gegangen
Vergi Dairesi|Tax Office|مكتب الضرائب|Налоговая инспекция|Finanzamt
İsraf Olarak Kaydet|Record as Waste|تسجيل كهدر|Записать в потери|Als Verlust erfassen
Ek not (opsiyonel)|Extra note (optional)|ملاحظة إضافية (اختياري)|Доп. примечание (необязательно)|Zusatznotiz (optional)
Paket yap|Pack to go|تغليف سفري|Упаковать с собой|Zum Mitnehmen einpacken
Uygula|Apply|تطبيق|Применить|Anwenden
Böl|Split|تقسيم|Разделить|Teilen
Hesap sahibi|Account holder|صاحب الحساب|Владелец счёта|Kontoinhaber
Havale alındı · Ödemeyi kapat|Transfer received · Close payment|تم استلام التحويل · إغلاق الدفع|Перевод получен · Закрыть оплату|Überweisung erhalten · Zahlung schließen
Normal|Normal|عادي|Обычный|Normal
İstasyon → Yazıcı Eşleştirme|Station → Printer Mapping|ربط المحطة بالطابعة|Станция → принтер|Station → Drucker-Zuordnung
Fiş Tasarımı|Receipt Design|تصميم الإيصال|Дизайн чека|Belegdesign
Bağlan|Connect|اتصال|Подключить|Verbinden
Masaüstü Uygulaması|Desktop App|تطبيق سطح المكتب|Приложение для ПК|Desktop-App
Kasa Fişi Yazdır|Print Receipt|طباعة الإيصال|Печать чека|Beleg drucken
Kasa Fişi Yazdır (fiyatlı)|Print Receipt (with prices)|طباعة الإيصال (بالأسعار)|Печать чека (с ценами)|Beleg drucken (mit Preisen)
Bildirim|Notification|إشعار|Уведомление|Benachrichtigung
Yazıcı bulunamadı|No printer found|لم يتم العثور على طابعة|Принтер не найден|Kein Drucker gefunden
Oturdu|Seated|جلس|Посажен|Platziert
Geçmiş|History|السجل|История|Verlauf
Bu tarihte kayıt yok.|No records on this date.|لا توجد سجلات في هذا التاريخ.|Нет записей на эту дату.|Keine Einträge an diesem Datum.
Sıraya Ekle|Add to Queue|إضافة إلى الطابور|Добавить в очередь|Zur Warteschlange
Bu filtrede ürün yok.|No products for this filter.|لا توجد منتجات لهذا الفلتر.|Нет товаров по фильтру.|Keine Produkte für diesen Filter.
Mevcut paket|Current plan|الباقة الحالية|Текущий тариф|Aktueller Tarif
Fatura Adresi|Billing Address|عنوان الفاتورة|Адрес для счёта|Rechnungsadresse
Giriş bilgilerini SMS ile gönder|Send login details via SMS|إرسال بيانات الدخول عبر SMS|Отправить данные входа по SMS|Zugangsdaten per SMS senden
Yukarı|Up|أعلى|Вверх|Nach oben
Aşağı|Down|أسفل|Вниз|Nach unten
Gönderilemedi|Could not be sent|تعذّر الإرسال|Не удалось отправить|Konnte nicht gesendet werden
Test et|Test|اختبار|Проверить|Testen
API anahtarı|API key|مفتاح API|API-ключ|API-Schlüssel
Birim|Unit|الوحدة|Ед. изм.|Einheit
Stok değeri|Stock value|قيمة المخزون|Стоимость остатков|Lagerwert
Maliyet geçmişi|Cost history|سجل التكلفة|История себестоимости|Kostenverlauf
Tamamla|Finish|إنهاء|Завершить|Fertigstellen
İleri|Next|التالي|Далее|Weiter
Menüler & İstasyonlar|Menus & Stations|القوائم والمحطات|Меню и станции|Menüs & Stationen
Bölgeler & Masalar|Areas & Tables|المناطق والطاولات|Зоны и столы|Bereiche & Tische
İstasyon|Station|المحطة|Станция|Station
Fiş|Receipt|الإيصال|Чек|Beleg
Fiyat (₺)|Price (₺)|السعر (₺)|Цена (₺)|Preis (₺)
Maliyet (₺)|Cost (₺)|التكلفة (₺)|Себестоимость (₺)|Kosten (₺)
Maliyet girilmedi|No cost entered|لم تُدخل التكلفة|Себестоимость не указана|Keine Kosten erfasst
katkı|contribution|المساهمة|маржа|Deckungsbeitrag
Roller (en fazla 2)|Roles (max. 2)|الأدوار (2 كحد أقصى)|Роли (макс. 2)|Rollen (max. 2)
Bitir|End|إنهاء|Завершить|Beenden
Rol Adı|Role Name|اسم الدور|Название роли|Rollenname
Alıcı|Recipient|المستلم|Получатель|Empfänger
Ödemeyi Yaptım|I Have Paid|لقد دفعت|Я оплатил|Ich habe bezahlt
Banka Ekle|Add Bank|إضافة بنك|Добавить банк|Bank hinzufügen
Sesli Bildirimler|Voice Notifications|الإشعارات الصوتية|Голосовые уведомления|Sprachbenachrichtigungen
Kullanıcılar & Vardiyalar|Users & Shifts|المستخدمون والورديات|Пользователи и смены|Benutzer & Schichten
Ürünler & Hammaddeler|Products & Ingredients|المنتجات والمواد الخام|Товары и ингредиенты|Produkte & Zutaten
Entegrasyonlar|Integrations|التكاملات|Интеграции|Integrationen
Bildirim Ayarları|Notification Settings|إعدادات الإشعارات|Настройки уведомлений|Benachrichtigungseinstellungen
Özet E-postaları|Summary Emails|رسائل الملخص|Сводные письма|Zusammenfassungs-E-Mails
Güvenlik|Security|الأمان|Безопасность|Sicherheit
Aktif Kullanıcılar|Active Users|المستخدمون النشطون|Активные пользователи|Aktive Benutzer
Vardiyalar|Shifts|الورديات|Смены|Schichten
Vardiya Planı|Shift Plan|جدول الورديات|График смен|Schichtplan
Limitler|Limits|الحدود|Лимиты|Limits
Abonelik, Hediye Kartı & Kampanya|Subscription, Gift Card & Campaigns|الاشتراك وبطاقات الهدايا والحملات|Подписка, подарочные карты и акции|Abo, Geschenkkarte & Kampagnen
Gün Sonu & Kapanışlar|End of Day & Closings|نهاية اليوم والإغلاقات|Конец дня и закрытия|Tagesabschluss & Abschlüsse
Personel Performansı|Staff Performance|أداء الموظفين|Эффективность персонала|Mitarbeiterleistung
Ürün Analizi|Product Analysis|تحليل المنتجات|Анализ товаров|Produktanalyse
Müşteri Analizleri|Customer Analytics|تحليلات العملاء|Аналитика клиентов|Kundenanalyse
İptal & İkram|Cancellations & Comps|الإلغاءات والضيافة|Отмены и угощения|Stornos & Gratis
Stok Tahmini|Stock Forecast|توقع المخزون|Прогноз остатков|Bestandsprognose
Muhasebe Aktarımı|Accounting Export|تصدير المحاسبة|Экспорт в бухгалтерию|Buchhaltungsexport
Gün Sonu (Z Raporu)|End of Day (Z Report)|نهاية اليوم (تقرير Z)|Конец дня (Z-отчёт)|Tagesabschluss (Z-Bericht)
Gün Sonu Kapanışları|Day Closings|إغلاقات نهاية اليوم|Закрытия дня|Tagesabschlüsse
Satışlar|Sales|المبيعات|Продажи|Verkäufe
Kârlılık|Profitability|الربحية|Рентабельность|Rentabilität
Tahsilatlar|Collections|التحصيلات|Поступления|Einnahmen
Siparişler & Fiyatlar|Orders & Prices|الطلبات والأسعار|Заказы и цены|Bestellungen & Preise
Firma ve iletişim|Company & contact|الشركة والتواصل|Компания и контакты|Firma & Kontakt
Tedarikçi bekleyen|Awaiting supplier|بانتظار المورد|Ждёт поставщика|Wartet auf Lieferant
Fiyat bekleyen|Awaiting price|بانتظار السعر|Ждёт цену|Wartet auf Preis
Teslim bekleyen|Awaiting delivery|بانتظار التسليم|Ждёт поставки|Wartet auf Lieferung
Tamamlanan|Completed|مكتمل|Завершено|Abgeschlossen
Teslim Alındı|Received|تم الاستلام|Получено|Erhalten
Tedarikçi seçin|Choose supplier|اختر المورد|Выберите поставщика|Lieferant wählen
Sipariş Tutarı|Order Amount|مبلغ الطلب|Сумма заказа|Bestellbetrag
Teslim Alınan|Received|المستلم|Получено|Erhalten
Hammadde ara…|Search ingredients…|ابحث عن مادة…|Поиск ингредиента…|Zutat suchen…
Yeni Hammadde|New Ingredient|مادة جديدة|Новый ингредиент|Neue Zutat
Stokları sıfırla|Reset stock|تصفير المخزون|Обнулить остатки|Bestand zurücksetzen
Kullanımda|In use|قيد الاستخدام|Используется|In Verwendung
Kullanılmıyor|Unused|غير مستخدم|Не используется|Nicht verwendet
Bitti|Out|نفد|Закончилось|Leer
Kritik|Low|منخفض|Мало|Niedrig
Kritik stok|Low stock|مخزون منخفض|Мало на складе|Niedriger Bestand
Stoğu biten|Out of stock|نفد المخزون|Нет в наличии|Ausverkauft
Tümünü seç|Select all|تحديد الكل|Выбрать все|Alle auswählen
Seçerek toplu işlem yapın|Select items for bulk actions|حدد لعمليات جماعية|Выберите для массовых действий|Für Sammelaktionen auswählen
Şifreyi sıfırla|Reset password|إعادة تعيين كلمة المرور|Сбросить пароль|Passwort zurücksetzen
Sadece sıfırla|Reset only|إعادة التعيين فقط|Только сбросить|Nur zurücksetzen
SMS ile gönder|Send via SMS|إرسال عبر SMS|Отправить по SMS|Per SMS senden
E-posta ile gönder|Send via email|إرسال بالبريد|Отправить по почте|Per E-Mail senden
Müşteri Analizi|Customer Analysis|تحليل العملاء|Анализ клиентов|Kundenanalyse
Ödeme Al|Take Payment|استلام الدفع|Принять оплату|Zahlung annehmen
Hesap|Bill|الحساب|Счёт|Rechnung
Kalan|Remaining|المتبقي|Остаток|Rest
Ödenen|Paid|المدفوع|Оплачено|Bezahlt
Yazdır|Print|طباعة|Печать|Drucken
Paylaş|Share|مشاركة|Поделиться|Teilen
Yeni|New|جديد|Новый|Neu
Gecikti|Late|متأخر|Опоздание|Verspätet
Süre geçti|Time exceeded|انتهى الوقت|Время вышло|Zeit überschritten
sipariş|orders|طلبات|заказов|Bestellungen
bekleyen ürün|pending items|عناصر معلّقة|ожидающих позиций|offene Artikel
ort. bekleme|avg. wait|متوسط الانتظار|ср. ожидание|Ø Wartezeit
geciken|late|متأخر|опаздывает|verspätet
En eski sipariş en başta · kartlar yerinde renk değiştirir|Oldest order first · cards change colour in place|الأقدم أولًا · تتغير ألوان البطاقات|Старые заказы первыми · карточки меняют цвет|Älteste zuerst · Karten wechseln die Farbe
`;
const D = {};
L.trim().split('\n').forEach(r => { const p = r.split('|'); if(p.length >= 5) D[p[0].trim()] = { en: p[1], ar: p[2], ru: p[3], de: p[4] }; });
window.I18N_DICT = Object.assign(window.I18N_DICT || {}, D);
})();
/* 3. parti: müşteri sayfaları (sipariş takibi, değerlendirme). */
(function(){
const L = `
Afiyet olsun!|Enjoy your meal!|بالهناء والشفاء!|Приятного аппетита!|Guten Appetit!
Bu değerlendirme linki bulunamadı.|This review link was not found.|لم يتم العثور على رابط التقييم هذا.|Ссылка на отзыв не найдена.|Dieser Bewertungslink wurde nicht gefunden.
Bu hesap için değerlendirmeniz alındı.|Your review for this bill has been received.|تم استلام تقييمك لهذا الحساب.|Ваш отзыв по этому счёту получен.|Ihre Bewertung für diese Rechnung wurde empfangen.
Bu sayfaya işletmenin gönderdiği değerlendirme linkiyle ulaşmalısınız.|Please open this page using the review link sent by the business.|يرجى فتح هذه الصفحة عبر رابط التقييم المرسل من المنشأة.|Откройте эту страницу по ссылке для отзыва от заведения.|Bitte öffnen Sie diese Seite über den Bewertungslink des Betriebs.
Bu sayfaya işletmenin gönderdiği takip linkiyle ulaşmalısınız.|Please open this page using the tracking link sent by the business.|يرجى فتح هذه الصفحة عبر رابط التتبع المرسل من المنشأة.|Откройте эту страницу по ссылке отслеживания от заведения.|Bitte öffnen Sie diese Seite über den Tracking-Link des Betriebs.
Fena değil 😐|Not bad 😐|لا بأس 😐|Неплохо 😐|Nicht schlecht 😐
Kötü 😕|Bad 😕|سيئ 😕|Плохо 😕|Schlecht 😕
Çok kötü 😞|Very bad 😞|سيئ جدًا 😞|Очень плохо 😞|Sehr schlecht 😞
İyi 🙂|Good 🙂|جيد 🙂|Хорошо 🙂|Gut 🙂
Mükemmel 🤩|Excellent 🤩|ممتاز 🤩|Отлично 🤩|Ausgezeichnet 🤩
Fotoğraflar yükleniyor...|Uploading photos...|جارٍ رفع الصور...|Загрузка фото...|Fotos werden hochgeladen...
Fotoğraf ekle|Add photo|إضافة صورة|Добавить фото|Foto hinzufügen
Geçersiz bağlantı|Invalid link|رابط غير صالح|Недействительная ссылка|Ungültiger Link
Gönderiliyor...|Sending...|جارٍ الإرسال...|Отправка...|Wird gesendet...
Kuryeye verilmek üzere|About to be handed to the courier|على وشك التسليم للمندوب|Скоро передадут курьеру|Wird an den Kurier übergeben
Kuryeniz yolda|Your courier is on the way|المندوب في الطريق|Курьер в пути|Ihr Kurier ist unterwegs
Lütfen daha sonra tekrar deneyin.|Please try again later.|يرجى المحاولة لاحقًا.|Попробуйте позже.|Bitte versuchen Sie es später erneut.
Lütfen biraz sonra tekrar deneyin.|Please try again shortly.|يرجى المحاولة بعد قليل.|Попробуйте чуть позже.|Bitte versuchen Sie es gleich erneut.
Mutfakta hazırlanıyor|Being prepared in the kitchen|قيد التحضير في المطبخ|Готовится на кухне|Wird in der Küche zubereitet
Neyi daha iyi yapabilirdik? (opsiyonel)|What could we do better? (optional)|ما الذي يمكننا تحسينه؟ (اختياري)|Что мы могли бы улучшить? (необязательно)|Was könnten wir besser machen? (optional)
Sayfa yüklenemedi|Page could not be loaded|تعذّر تحميل الصفحة|Не удалось загрузить страницу|Seite konnte nicht geladen werden
Sipariş alındı|Order received|تم استلام الطلب|Заказ принят|Bestellung eingegangen
Siparişiniz hazır|Your order is ready|طلبك جاهز|Ваш заказ готов|Ihre Bestellung ist fertig
Siparişiniz hazırlanıyor|Your order is being prepared|طلبك قيد التحضير|Ваш заказ готовится|Ihre Bestellung wird zubereitet
Siparişiniz yolda!|Your order is on the way!|طلبك في الطريق!|Ваш заказ в пути!|Ihre Bestellung ist unterwegs!
Size doğru geliyor|Heading to you|في طريقه إليك|Едет к вам|Auf dem Weg zu Ihnen
Telefon numarasını 05xx xxx xx xx biçiminde girin.|Enter the phone number as 05xx xxx xx xx.|أدخل رقم الهاتف بصيغة 05xx xxx xx xx.|Введите номер в формате 05xx xxx xx xx.|Telefonnummer im Format 05xx xxx xx xx eingeben.
Teslim edildi|Delivered|تم التسليم|Доставлено|Zugestellt
Teşekkürler!|Thank you!|شكرًا!|Спасибо!|Danke!
Teşekkürler|Thank you|شكرًا|Спасибо|Danke
Çok teşekkürler!|Thank you very much!|شكرًا جزيلًا!|Большое спасибо!|Vielen Dank!
Yorumunuz (opsiyonel)|Your comment (optional)|تعليقك (اختياري)|Ваш комментарий (необязательно)|Ihr Kommentar (optional)
Yıldızlara dokunun|Tap the stars|اضغط على النجوم|Нажмите на звёзды|Tippen Sie auf die Sterne
Deneyiminizi nasıl buldunuz? Görüşünüz bizim için çok değerli.|How was your experience? Your feedback means a lot to us.|كيف كانت تجربتك؟ رأيك مهم جدًا لنا.|Как вам у нас? Ваше мнение очень важно.|Wie war Ihr Erlebnis? Ihre Meinung ist uns wichtig.
Kampanya ve fırsatlardan SMS ile haberdar olmak istiyorum.|I'd like to hear about offers via SMS.|أرغب في تلقي العروض عبر SMS.|Хочу получать акции по SMS.|Ich möchte Angebote per SMS erhalten.
Sipariş bulunamadı|Order not found|لم يتم العثور على الطلب|Заказ не найден|Bestellung nicht gefunden
Takip linkinin süresi dolmuş olabilir.|The tracking link may have expired.|ربما انتهت صلاحية رابط التتبع.|Срок ссылки мог истечь.|Der Tracking-Link ist möglicherweise abgelaufen.
Varış süresi hesaplanıyor…|Calculating arrival time…|جارٍ حساب وقت الوصول…|Рассчитываем время прибытия…|Ankunftszeit wird berechnet…
Yüklenemedi|Could not load|تعذّر التحميل|Не удалось загрузить|Konnte nicht geladen werden
Google'da da paylaşır mısınız?|Would you also share it on Google?|هل تشاركه على Google أيضًا؟|Поделитесь и в Google?|Teilen Sie es auch auf Google?
Numaranızı bırakırsanız işletme yetkilisi sizi arayıp yaşadığınız sorunu dinlemek ister.|If you leave your number, a manager would like to call you to hear about the issue.|إذا تركت رقمك، سيتصل بك المسؤول للاستماع إلى مشكلتك.|Оставьте номер — администратор перезвонит и выслушает вас.|Wenn Sie Ihre Nummer hinterlassen, ruft Sie die Leitung zurück.
Numaranız görüşünüzle ilgili size dönüş yapmak için kullanılır; kampanya mesajı yalnızca yukarıdaki kutuyu işaretlerseniz gönderilir.|Your number is only used to get back to you; offers are sent only if you tick the box above.|يُستخدم رقمك للرد عليك فقط؛ لا تُرسل العروض إلا إذا حددت المربع أعلاه.|Номер нужен только для ответа; акции — только если отметите галочку выше.|Ihre Nummer dient nur der Rückmeldung; Angebote nur mit Häkchen oben.
`;
const D = {};
L.trim().split('\n').forEach(r => { const p = r.split('|'); if(p.length >= 5) D[p[0].trim()] = { en: p[1], ar: p[2], ru: p[3], de: p[4] }; });
window.I18N_DICT = Object.assign(window.I18N_DICT || {}, D);
})();
