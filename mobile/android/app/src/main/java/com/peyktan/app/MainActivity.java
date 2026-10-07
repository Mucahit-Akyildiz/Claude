package com.peyktan.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PeykRadioPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // Telsiz açıkken uygulama arka plana alınınca WebView duraklatılmasın:
    // canlı ses bağlantısı ve çalma devam etsin (servis süreci ayakta tutar).
    @Override
    public void onPause() {
        super.onPause();
        keepWebViewRunning();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewRunning();
    }

    private void keepWebViewRunning() {
        if (!PeykRadioPlugin.active || getBridge() == null) return;
        WebView wv = getBridge().getWebView();
        if (wv != null) { wv.onResume(); wv.resumeTimers(); }
    }
}
