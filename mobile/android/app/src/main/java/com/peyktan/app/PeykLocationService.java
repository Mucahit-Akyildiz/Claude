package com.peyktan.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONObject;

/**
 * Kurye konum servisi: teslimat sürerken telefonun konumunu (GPS + ağ) alır ve 15 sn'de bir
 * Supabase courier_ping RPC'sine gönderir. Bildirim çubuğunda "Konum paylaşılıyor" görünür;
 * dokununca kurye sayfası açılır. Teslim edilince (sunucu stop döner) ya da 12 saat sonra kendini kapatır.
 */
public class PeykLocationService extends Service implements LocationListener {
    static final String CHANNEL_ID = "peyk_location";
    static final int NOTIF_ID = 4712;
    static final long SEND_MS = 15_000;
    static volatile boolean active = false;
    static volatile String currentToken = null;

    private String url, key, token, title;
    private LocationManager lm;
    private PowerManager.WakeLock wakeLock;
    private Location last;
    private long lastSent = 0, startedAt = 0;
    private final OkHttpClient http = new OkHttpClient();
    private final android.os.Handler handler = new android.os.Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (System.currentTimeMillis() - startedAt > 12 * 3600_000L) { stopSelf(); return; }
            if (last != null && System.currentTimeMillis() - lastSent >= SEND_MS - 500) send(last);
            handler.postDelayed(this, SEND_MS);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        url = intent.getStringExtra("url"); key = intent.getStringExtra("key");
        token = intent.getStringExtra("token"); title = intent.getStringExtra("title");
        if (url == null || key == null || token == null) { stopSelf(); return START_NOT_STICKY; }
        createChannel();
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0;
        try {
            ServiceCompat.startForeground(this, NOTIF_ID, buildNotification("Konum alınıyor…"), type);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        currentToken = token; active = true; startedAt = System.currentTimeMillis();
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "peyktan:courier");
            wakeLock.acquire(12 * 3600_000L);
        } catch (Exception e) { }
        startUpdates();
        handler.removeCallbacks(tick);
        handler.postDelayed(tick, SEND_MS);
        return START_REDELIVER_INTENT;
    }

    @SuppressLint("MissingPermission")
    private void startUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopSelf();
            return;
        }
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) { stopSelf(); return; }
        try { lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000, 10, this, Looper.getMainLooper()); } catch (Exception e) { }
        try { lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10000, 25, this, Looper.getMainLooper()); } catch (Exception e) { }
        try {
            Location g = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            Location n = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            Location b = g != null ? g : n;
            if (b != null) onLocationChanged(b);
        } catch (Exception e) { }
    }

    @Override
    public void onLocationChanged(Location loc) {
        // Ağ konumu, daha yeni ve daha doğru bir GPS konumunu ezmesin.
        if (last != null && LocationManager.NETWORK_PROVIDER.equals(loc.getProvider()) && LocationManager.GPS_PROVIDER.equals(last.getProvider())
            && loc.getTime() - last.getTime() < 30_000 && loc.getAccuracy() > last.getAccuracy()) return;
        last = loc;
        if (System.currentTimeMillis() - lastSent >= SEND_MS) send(loc);
    }
    @Override public void onStatusChanged(String p, int s, Bundle b) { }
    @Override public void onProviderEnabled(String p) { }
    @Override public void onProviderDisabled(String p) { }

    private void send(final Location loc) {
        lastSent = System.currentTimeMillis();
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("p_courier", token);
                body.put("p_lat", loc.getLatitude());
                body.put("p_lng", loc.getLongitude());
                body.put("p_acc", (double) loc.getAccuracy());
                Request req = new Request.Builder()
                    .url(url + "/rest/v1/rpc/courier_ping")
                    .addHeader("apikey", key)
                    .addHeader("Authorization", "Bearer " + key)
                    .post(RequestBody.create(body.toString(), MediaType.parse("application/json")))
                    .build();
                try (Response res = http.newCall(req).execute()) {
                    String txt = res.body() != null ? res.body().string() : "";
                    if (res.isSuccessful()) {
                        JSONObject j = new JSONObject(txt);
                        if (j.optBoolean("stop", false)) { handler.post(this::stopSelf); return; }
                        String eta = j.isNull("eta_min") ? null : j.optString("eta_min");
                        updateNotification(eta != null ? "Adrese yaklaşık " + eta + " dk · konum paylaşılıyor" : "Konum paylaşılıyor");
                    } else if (res.code() == 400 && txt.contains("Teslimat bulunamad")) {
                        handler.post(this::stopSelf);
                    } else {
                        updateNotification("Konum gönderilemedi, tekrar denenecek");
                    }
                }
            } catch (Exception e) {
                updateNotification("İnternet yok, tekrar denenecek");
            }
        }).start();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Kurye konum paylaşımı", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Teslimat sırasında konum paylaşılırken görünür");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        open.putExtra("kurye_url", "https://www.peyktan.com/kurye/?t=" + token);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🛵 " + (title != null ? title : "Teslimat"))
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_stat_radio)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .build();
    }

    private void updateNotification(String text) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && active) nm.notify(NOTIF_ID, buildNotification(text));
        } catch (Exception e) { }
    }

    @Override
    public void onDestroy() {
        active = false; currentToken = null;
        handler.removeCallbacks(tick);
        try { if (lm != null) lm.removeUpdates(this); } catch (Exception e) { }
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception e) { }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
