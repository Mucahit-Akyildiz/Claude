package com.peyktan.app;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Capacitor'ün bildirim servisinin genişletilmiş hali: "sesli arama" veri mesajı gelince
 * (uygulama kapalı / ekran kilitli olsa bile) telefon araması gibi tam ekran çalan bir
 * arama bildirimi gösterir. Diğer tüm mesajlar eskisi gibi Capacitor'e iletilir.
 */
public class PeykMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        if ("call".equals(d.get("kind"))) {
            if (MainActivity.inForeground) return; // uygulama açık: arama ekranı uygulamada çalıyor
            PeykCallNotifier.show(this, d.get("by"), d.get("from_id"), d.get("group_name"));
            return;
        }
        if ("call_end".equals(d.get("kind"))) {
            PeykCallNotifier.cancel(this);
            return;
        }
        super.onMessageReceived(msg);
    }
}
