package com.peyktan.app;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONObject;

/**
 * Peyk Bas-Konuş yerel dinleyicisi: Supabase Realtime kanalına WebView'den bağımsız
 * bağlanır, gelen 8 kHz µ-law sesi AudioTrack ile çalar. Böylece ekran kapalıyken /
 * uygulama arka plandayken (WebView yavaşlatılsa bile) konuşmalar duyulur.
 * Söz hakkı kuralı web tarafıyla aynıdır: o an konuşan tek kişinin sesi çalınır.
 */
class PeykRadioReceiver {
    private static final int RATE = 8000;
    private final OkHttpClient http = new OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).build();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final LinkedBlockingQueue<short[]> queue = new LinkedBlockingQueue<>();
    private String url, key, topic, self;
    private WebSocket ws;
    private volatile boolean running = false;
    private int ref = 1, backoff = 1000;
    private Thread player;
    private String floorUser = null;
    private long floorAt = 0;
    private final Runnable heartbeat = new Runnable() {
        @Override public void run() {
            if (!running) return;
            send("phoenix", "heartbeat", new JSONObject());
            main.postDelayed(this, 25000);
        }
    };

    synchronized void start(String url, String key, String topic, String self) {
        boolean same = running && topic != null && topic.equals(this.topic);
        if (same) return;
        stop();
        if (url == null || key == null || topic == null) return;
        this.url = url; this.key = key; this.topic = topic; this.self = self;
        running = true;
        startPlayer();
        connect();
    }

    synchronized void stop() {
        running = false;
        main.removeCallbacksAndMessages(null);
        if (ws != null) { try { ws.close(1000, "bye"); } catch (Exception ignored) {} ws = null; }
        if (player != null) { player.interrupt(); player = null; }
        queue.clear();
    }

    private void connect() {
        if (!running) return;
        String wsUrl = url.replaceFirst("^http", "ws") + "/realtime/v1/websocket?apikey=" + key + "&vsn=1.0.0";
        ws = http.newWebSocket(new Request.Builder().url(wsUrl).build(), new WebSocketListener() {
            @Override public void onOpen(WebSocket s, Response r) {
                backoff = 1000;
                try {
                    JSONObject cfg = new JSONObject()
                        .put("broadcast", new JSONObject().put("self", false).put("ack", false))
                        .put("presence", new JSONObject().put("key", ""))
                        .put("private", false);
                    send("realtime:" + topic, "phx_join", new JSONObject().put("config", cfg));
                } catch (Exception ignored) {}
                main.removeCallbacks(heartbeat);
                main.postDelayed(heartbeat, 25000);
            }
            @Override public void onMessage(WebSocket s, String text) { handle(text); }
            @Override public void onClosed(WebSocket s, int code, String reason) { retry(); }
            @Override public void onFailure(WebSocket s, Throwable t, Response r) { retry(); }
        });
    }

    private void retry() {
        if (!running) return;
        main.removeCallbacks(heartbeat);
        main.postDelayed(this::connect, backoff);
        backoff = Math.min(backoff * 2, 15000);
    }

    private void send(String t, String event, JSONObject payload) {
        try {
            JSONObject m = new JSONObject().put("topic", t).put("event", event).put("payload", payload).put("ref", String.valueOf(ref++));
            if (ws != null) ws.send(m.toString());
        } catch (Exception ignored) {}
    }

    private void handle(String text) {
        try {
            JSONObject m = new JSONObject(text);
            if (!"broadcast".equals(m.optString("event"))) return;
            JSONObject outer = m.optJSONObject("payload"); if (outer == null) return;
            String ev = outer.optString("event");
            JSONObject p = outer.optJSONObject("payload"); if (p == null) return;
            String u = p.optString("u", "");
            if (u.isEmpty() || u.equals(self)) return;
            long now = System.currentTimeMillis();
            if (floorUser != null && now - floorAt > 2500) floorUser = null; // 'e' kaybolursa kilit açılır
            if ("e".equals(ev)) { if (u.equals(floorUser)) floorUser = null; return; }
            if (floorUser == null) floorUser = u;
            if (!u.equals(floorUser)) return; // söz başkasında
            floorAt = now;
            if ("a".equals(ev)) {
                byte[] b = Base64.decode(p.optString("d", ""), Base64.DEFAULT);
                short[] pcm = new short[b.length];
                for (int i = 0; i < b.length; i++) pcm[i] = ulaw(b[i]);
                queue.offer(pcm);
            }
        } catch (Exception ignored) {}
    }

    private static short ulaw(byte v) {
        int u = ~v & 0xFF;
        int sign = u & 0x80, exp = (u >> 4) & 7, man = u & 0x0F;
        int x = ((man << 3) + 0x84) << exp; x -= 0x84;
        return (short) (sign != 0 ? -x : x);
    }

    private void startPlayer() {
        player = new Thread(() -> {
            int min = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
            AudioTrack track = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(new AudioFormat.Builder().setSampleRate(RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
                .setBufferSizeInBytes(Math.max(min, RATE)) // ~0,5 sn tampon
                .setTransferMode(AudioTrack.MODE_STREAM).build();
            track.play();
            try {
                while (!Thread.currentThread().isInterrupted()) {
                    short[] pcm = queue.poll(1, TimeUnit.SECONDS);
                    if (pcm != null) track.write(pcm, 0, pcm.length);
                }
            } catch (InterruptedException ignored) {
            } finally {
                try { track.stop(); } catch (Exception ignored) {}
                track.release();
            }
        }, "peyk-radio-player");
        player.start();
    }
}
