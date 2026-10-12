package com.peyktan.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;

/**
 * Gelen sesli arama bildirimi: zil sesi + titreşim, kilit ekranında tam ekran,
 * "Kabul et" (uygulamayı açar, arama kendiliğinden bağlanır) ve "Reddet" butonları.
 * 40 sn sonra kendiliğinden kapanır (arayan tarafta arama 35 sn'de düşer).
 */
public class PeykCallNotifier extends BroadcastReceiver {
    static final String CHANNEL_ID = "peyk_calls_v1";
    static final int NOTIF_ID = 5150;
    static final String ACTION_DECLINE = "com.peyktan.app.CALL_DECLINE";
    static final String EXTRA_ACTION = "peyk_call_action";
    static final String EXTRA_FROM = "peyk_call_from";
    // Kabul ile açılınca web tarafı bu bilgiyle aramayı kendiliğinden açar (bkz. PeykRadioPlugin.consumePendingCall).
    static volatile String pendingAction = null, pendingFrom = null;
    static volatile long pendingAt = 0;

    static void show(Context ctx, String by, String fromId, String groupName) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Sesli aramalar", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Peyktan'dan gelen sesli aramalar");
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 800, 600, 800, 600, 800});
            ch.setSound(ring, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        String who = (by == null || by.isEmpty()) ? "Bir çalışma arkadaşınız" : by;
        String title = groupName != null && !groupName.isEmpty() ? "👥 " + groupName + " · grup araması" : "📞 " + who;
        String text = groupName != null && !groupName.isEmpty() ? who + " grup araması başlattı" : "Sesli arama geliyor…";

        Intent open = new Intent(ctx, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_ACTION, "open").putExtra(EXTRA_FROM, fromId);
        Intent accept = new Intent(ctx, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_ACTION, "accept").putExtra(EXTRA_FROM, fromId);
        Intent decline = new Intent(ctx, PeykCallNotifier.class).setAction(ACTION_DECLINE);
        int fl = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent piOpen = PendingIntent.getActivity(ctx, 51, open, fl);
        PendingIntent piAccept = PendingIntent.getActivity(ctx, 52, accept, fl);
        PendingIntent piDecline = PendingIntent.getBroadcast(ctx, 53, decline, fl);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_radio)
            .setContentTitle(title)
            .setContentText(text)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(true)
            .setTimeoutAfter(40000)
            .setSound(ring)
            .setVibrate(new long[]{0, 800, 600, 800, 600, 800})
            .setContentIntent(piOpen)
            .setFullScreenIntent(piOpen, true)
            .addAction(0, "✕ Reddet", piDecline)
            .addAction(0, "📞 Kabul et", piAccept);
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT; // kullanıcı dokunana kadar zil tekrar eder
        try { nm.notify(NOTIF_ID, n); } catch (SecurityException ignored) {}
    }

    static void cancel(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIF_ID);
    }

    /** MainActivity: arama bildiriminden açıldıysa bekleyen eylemi kaydeder ve bildirimi kapatır. */
    static void handleIntent(Context ctx, Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra(EXTRA_ACTION);
        if (action == null) return;
        pendingAction = action; pendingFrom = intent.getStringExtra(EXTRA_FROM); pendingAt = System.currentTimeMillis();
        intent.removeExtra(EXTRA_ACTION);
        cancel(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (ACTION_DECLINE.equals(intent.getAction())) cancel(ctx);
    }
}
