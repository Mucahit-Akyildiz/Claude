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

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PeykRadioService.class));
        active = false;
        call.resolve();
    }
}
