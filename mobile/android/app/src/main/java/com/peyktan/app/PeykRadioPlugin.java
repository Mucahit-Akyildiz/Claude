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
    @PluginMethod
    public void callAudioStop(PluginCall call) { PeykCallAudio.stop(getContext()); call.resolve(); }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PeykRadioService.class));
        active = false;
        call.resolve();
    }
}
