package com.peyktan.app;

import android.Manifest;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Kurye konum paylaşımı. JS: Capacitor.Plugins.PeykLocation.start({ url, key, token, title }) / stop()
 * (bkz. kurye/kurye.js). Konum, ön plan servisi (PeykLocationService) tarafından ekran kilitliyken de
 * 15 sn'de bir Supabase courier_ping RPC'sine gönderilir; teslim edilince sunucu "stop" döner ve servis kapanır.
 */
@CapacitorPlugin(name = "PeykLocation", permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
})
public class PeykLocationPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "permCallback");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) startService(call);
        else call.reject("permission_denied");
    }

    private void startService(PluginCall call) {
        Intent i = new Intent(getContext(), PeykLocationService.class);
        i.putExtra("url", call.getString("url"));
        i.putExtra("key", call.getString("key"));
        i.putExtra("token", call.getString("token"));
        i.putExtra("title", call.getString("title", "Teslimat"));
        try {
            ContextCompat.startForegroundService(getContext(), i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PeykLocationService.class));
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        com.getcapacitor.JSObject r = new com.getcapacitor.JSObject();
        r.put("active", PeykLocationService.active);
        r.put("token", PeykLocationService.currentToken);
        call.resolve(r);
    }
}
