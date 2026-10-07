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

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String name = intent != null ? intent.getStringExtra("channel") : null;
        createChannel();
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_radio)
            .setContentTitle("📻 Peyk Bas-Konuş açık")
            .setContentText(name == null || name.isEmpty() ? "Kanal dinleniyor" : name + " kanalı dinleniyor")
            .setContentIntent(pi)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
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
        return START_NOT_STICKY;
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
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        wakeLock = null; wifiLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
