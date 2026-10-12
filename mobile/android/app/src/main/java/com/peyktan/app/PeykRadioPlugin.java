package com.peyktan.app;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS: Capacitor.Plugins.PeykRadio.start({ channel }) / stop() - bkz. app/js/radio.js */
@CapacitorPlugin(name = "PeykRadio")
public class PeykRadioPlugin extends Plugin {
    static boolean active = false;

    @PluginMethod
    public void start(PluginCall call) {
        Intent i = new Intent(getContext(), PeykRadioService.class);
        i.putExtra("channel", call.getString("channel", ""));
        i.putExtra("url", call.getString("url"));
        i.putExtra("key", call.getString("key"));
        i.putExtra("topic", call.getString("topic"));
        i.putExtra("user", call.getString("user"));
        i.putExtra("name", call.getString("name", ""));
        try {
            ContextCompat.startForegroundService(getContext(), i);
            active = true;
            // nativeAudio: sesi bu servis çalıyor; web tarafı ikinci kez çalmasın.
            com.getcapacitor.JSObject r = new com.getcapacitor.JSObject();
            r.put("nativeAudio", call.getString("topic") != null);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** Sesli arama bildiriminden açıldıysa bekleyen eylem ("accept" / "open") ve arayan; bir kez okunur. */
    @PluginMethod
    public void consumePendingCall(PluginCall call) {
        com.getcapacitor.JSObject r = new com.getcapacitor.JSObject();
        if (PeykCallNotifier.pendingAction != null && System.currentTimeMillis() - PeykCallNotifier.pendingAt < 60000) {
            r.put("action", PeykCallNotifier.pendingAction);
            r.put("from", PeykCallNotifier.pendingFrom);
        }
        PeykCallNotifier.pendingAction = null; PeykCallNotifier.pendingFrom = null;
        call.resolve(r);
    }

    @PluginMethod
    public void cancelCallNotification(PluginCall call) {
        PeykCallNotifier.cancel(getContext());
        call.resolve();
    }

    /* ---- Sesli arama ses çıkışı (bkz. PeykCallAudio) ---- */
    private com.getcapacitor.JSObject callAudioState() {
        com.getcapacitor.JSObject r = new com.getcapacitor.JSObject();
        r.put("route", PeykCallAudio.current(getContext()));
        r.put("routes", new com.getcapacitor.JSArray(PeykCallAudio.available(getContext())));
        return r;
    }
    @PluginMethod
    public void callAudioStart(PluginCall call) { PeykCallAudio.start(getContext(), call.getString("route", "auto")); call.resolve(callAudioState()); }
    @PluginMethod
    public void callAudioRoute(PluginCall call) { PeykCallAudio.setRoute(getContext(), call.getString("route", "earpiece")); call.resolve(callAudioState()); }
    @PluginMethod
    public void callAudioState(PluginCall call) { call.resolve(callAudioState()); }
    /* ---- Ek izinler: Bluetooth kulaklık (Android 12+) ve kilit ekranında tam ekran arama (Android 14+) ---- */
    @PluginMethod
    public void extraPermissionStatus(PluginCall call) {
        com.getcapacitor.JSObject r = new com.getcapacitor.JSObject();
        boolean bt = android.os.Build.VERSION.SDK_INT < 31 || ContextCompat.checkSelfPermission(getContext(), "android.permission.BLUETOOTH_CONNECT") == android.content.pm.PackageManager.PERMISSION_GRANTED;
        boolean fs = true;
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            android.app.NotificationManager nm = (android.app.NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            fs = nm == null || nm.canUseFullScreenIntent();
        }
        r.put("bluetooth", bt);
        r.put("fullScreen", fs);
        call.resolve(r);
    }
    @PluginMethod
    public void requestBluetooth(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT >= 31 && getActivity() != null)
            androidx.core.app.ActivityCompat.requestPermissions(getActivity(), new String[]{"android.permission.BLUETOOTH_CONNECT"}, 4711);
        call.resolve();
    }
    @PluginMethod
    public void openFullScreenSettings(PluginCall call) {
        try {
            Intent i = android.os.Build.VERSION.SDK_INT >= 34
                ? new Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, android.net.Uri.parse("package:" + getContext().getPackageName()))
                : new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }
    @PluginMethod
    public void callAudioStop(PluginCall call) { PeykCallAudio.stop(getContext()); call.resolve(); }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PeykRadioService.class));
        active = false;
        call.resolve();
    }
}
