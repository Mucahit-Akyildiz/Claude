package com.peyktan.app;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import java.util.ArrayList;
import java.util.List;

/**
 * Sesli arama sırasında ses çıkışı: telefon "iletişim moduna" alınır (varsayılan ahize;
 * kablolu/Bluetooth kulaklık bağlıysa ona yönlendirilebilir), görüşme bitince eski haline döner.
 * Rotalar: "earpiece" (ahize), "speaker" (hoparlör), "bluetooth", "wired" (kablolu kulaklık).
 */
class PeykCallAudio {
    private static int prevMode = AudioManager.MODE_NORMAL;
    private static boolean active = false;

    static AudioManager am(Context c) { return (AudioManager) c.getSystemService(Context.AUDIO_SERVICE); }

    static void start(Context c, String route) {
        AudioManager a = am(c); if (a == null) return;
        if (!active) { prevMode = a.getMode(); active = true; }
        try { a.setMode(AudioManager.MODE_IN_COMMUNICATION); } catch (Exception ignored) {}
        String r = route;
        if (r == null || r.isEmpty() || "auto".equals(r)) {
            List<String> av = available(c);
            r = av.contains("wired") ? "wired" : av.contains("bluetooth") ? "bluetooth" : "earpiece";
        }
        setRoute(c, r);
    }

    static void stop(Context c) {
        AudioManager a = am(c); if (a == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 31) a.clearCommunicationDevice();
            else { a.stopBluetoothSco(); a.setBluetoothScoOn(false); a.setSpeakerphoneOn(false); }
            a.setMode(prevMode);
        } catch (Exception ignored) {}
        active = false;
    }

    static List<String> available(Context c) {
        List<String> out = new ArrayList<>();
        out.add("earpiece"); out.add("speaker");
        AudioManager a = am(c); if (a == null) return out;
        AudioDeviceInfo[] devs = a.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
        for (AudioDeviceInfo d : devs) {
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || t == AudioDeviceInfo.TYPE_USB_HEADSET) { if (!out.contains("wired")) out.add("wired"); }
            if (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || (Build.VERSION.SDK_INT >= 31 && t == AudioDeviceInfo.TYPE_BLE_HEADSET)) { if (!out.contains("bluetooth")) out.add("bluetooth"); }
        }
        return out;
    }

    static boolean setRoute(Context c, String route) {
        AudioManager a = am(c); if (a == null) return false;
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                for (AudioDeviceInfo d : a.getAvailableCommunicationDevices()) {
                    int t = d.getType();
                    boolean match = ("earpiece".equals(route) && t == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE)
                        || ("speaker".equals(route) && t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
                        || ("bluetooth".equals(route) && (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || t == AudioDeviceInfo.TYPE_BLE_HEADSET))
                        || ("wired".equals(route) && (t == AudioDeviceInfo.TYPE_WIRED_HEADSET || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || t == AudioDeviceInfo.TYPE_USB_HEADSET));
                    if (match) return a.setCommunicationDevice(d);
                }
                return false;
            }
            // Android 11 ve altı
            if ("bluetooth".equals(route)) { a.setSpeakerphoneOn(false); a.startBluetoothSco(); a.setBluetoothScoOn(true); return true; }
            a.stopBluetoothSco(); a.setBluetoothScoOn(false);
            a.setSpeakerphoneOn("speaker".equals(route)); // ahize ve kablolu kulaklık: hoparlör kapalı (kulaklık takılıysa Android ona verir)
            return true;
        } catch (Exception e) { return false; }
    }

    static String current(Context c) {
        AudioManager a = am(c); if (a == null) return "earpiece";
        if (Build.VERSION.SDK_INT >= 31) {
            AudioDeviceInfo d = a.getCommunicationDevice();
            if (d == null) return "earpiece";
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return "speaker";
            if (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || t == AudioDeviceInfo.TYPE_BLE_HEADSET) return "bluetooth";
            if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || t == AudioDeviceInfo.TYPE_USB_HEADSET) return "wired";
            return "earpiece";
        }
        if (a.isBluetoothScoOn()) return "bluetooth";
        return a.isSpeakerphoneOn() ? "speaker" : "earpiece";
    }
}
