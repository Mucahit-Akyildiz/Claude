package com.peyktan.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

/**
 * Peyk Bas-Konuş ön plan servisi: telsiz kanalına bağlıyken uygulama arka plana
 * alınsa ya da ekran kilitlense bile işlemin (ve WebView'deki canlı ses
 * bağlantısının) Android tarafından durdurulmamasını sağlar. Bildirim
 * çubuğunda "Telsiz açık" bildirimi görünür; dokununca uygulama açılır.
 */
public class PeykRadioService extends Service {
    static final String CHANNEL_ID = "peyk_radio";
    static final int NOTIF_ID = 4711;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private final PeykRadioReceiver receiver = new PeykRadioReceiver();

    static final String ACTION_TALK = "com.peyktan.app.RADIO_TALK";
    static final String ACTION_STOP_TALK = "com.peyktan.app.RADIO_STOP_TALK";
    private static final long MAX_TALK_MS = 60_000; // açık kalan mikrofona karşı otomatik kesme
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable autoStop = () -> { receiver.stopTalk(); updateNotification(null); };
    private String channelName;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        // Bildirimdeki "Konuş" / "Bitir" butonları
        if (ACTION_TALK.equals(action)) {
            String err = receiver.startTalk();
            if (err == null) { handler.removeCallbacks(autoStop); handler.postDelayed(autoStop, MAX_TALK_MS); }
            updateNotification(err);
            return START_NOT_STICKY;
        }
        if (ACTION_STOP_TALK.equals(action)) {
            handler.removeCallbacks(autoStop);
            receiver.stopTalk();
            updateNotification(null);
            return START_NOT_STICKY;
        }
        channelName = intent != null ? intent.getStringExtra("channel") : null;
        createChannel();
        Notification n = buildNotification(null);
        int type = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            // Mikrofon tipi sadece izin verilmişse eklenir (yoksa Android 14+ servisi reddeder).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            }
        }
        try {
            ServiceCompat.startForeground(this, NOTIF_ID, n, type);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        acquireLocks();
        if (intent != null) {
            receiver.start(intent.getStringExtra("url"), intent.getStringExtra("key"),
                intent.getStringExtra("topic"), intent.getStringExtra("user"), intent.getStringExtra("name"));
        }
        return START_NOT_STICKY;
    }

    private Notification buildNotification(String error) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        boolean talking = receiver.isTalking();
        String text = error != null ? "⚠️ " + error
            : talking ? "🔴 Konuşuyorsunuz — bitince \"Bitir\"e basın"
            : (channelName == null || channelName.isEmpty() ? "Kanal dinleniyor" : channelName + " kanalı dinleniyor");
        Intent act = new Intent(this, PeykRadioService.class).setAction(talking ? ACTION_STOP_TALK : ACTION_TALK);
        PendingIntent actPi = PendingIntent.getService(this, talking ? 2 : 1, act, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_radio)
            .setContentTitle(talking ? "🎙️ Peyk Bas-Konuş — yayında" : "📻 Peyk Bas-Konuş açık")
            .setContentText(text)
            .setContentIntent(pi)
            .addAction(0, talking ? "⏹ Bitir" : "🎙️ Konuş", actPi)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // kilit ekranında da buton görünsün
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void updateNotification(String error) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID, buildNotification(error));
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Peyk Bas-Konuş", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Telsiz kanalına bağlıyken gösterilir");
            ch.setShowBadge(false);
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
    }

    private void acquireLocks() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "peyktan:radio");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(12 * 60 * 60 * 1000L);
        }
        if (wifiLock == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "peyktan:radio");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(autoStop);
        receiver.stop();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        wakeLock = null; wifiLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
