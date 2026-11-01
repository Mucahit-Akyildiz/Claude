package com.peyktan.app;

import android.app.AlertDialog;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

public class MainActivity extends BridgeActivity {
    // Uygulama ekranda mı (gelen aramada uygulama kendi çalar; telefon bildirimi gösterilmez).
    static volatile boolean inForeground = false;
    // Play Store'da yeni sürüm varsa uygulama içinden güncelleme (Google Play In-App Updates).
    // "Esnek" akış: Google'ın penceresiyle kullanıcı onaylar, indirme arka planda sürer,
    // uygulama kullanılmaya devam eder; indirme bitince "Yeniden başlat" sorulur.
    private AppUpdateManager updateManager;
    private ActivityResultLauncher<IntentSenderRequest> updateLauncher;
    private boolean restartDialogShown = false;
    private final InstallStateUpdatedListener installListener = state -> {
        if (state.installStatus() == InstallStatus.DOWNLOADED) showRestartDialog();
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PeykRadioPlugin.class);
        registerPlugin(PeykLocationPlugin.class);
        super.onCreate(savedInstanceState);
        // Sesli bildirimler (doğal ses / cihaz sesi) dokunuş beklemeden çalabilsin.
        try { getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false); } catch (Exception e) { }
        // WebView şeffaf: sayfa çizilene kadar arkadaki pencere arka planı (açılış rengi + logo) görünür,
        // web açılış ekranı logoyu aynı yerde gösterdiği için boş/beyaz ara ekran olmaz.
        try { getBridge().getWebView().setBackgroundColor(0x00000000); } catch (Exception e) { }
        // Android 15+ kenardan kenara çizim: içerik durum/gezinme çubuğunun ve klavyenin altında kalmasın.
        try {
            // Klavye yüksekliği yalnız bir kez düşülsün: pencere klavyede kendini küçültmez (adjustNothing, manifest),
            // boşluğu aşağıdaki kenar boşluğu verir. İkisi birden olunca klavyenin üstünde siyah alan kalıyordu.
            androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            final android.view.View wv = getBridge().getWebView();
            androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(wv, (v, insets) -> {
                androidx.core.graphics.Insets b = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()
                    | androidx.core.view.WindowInsetsCompat.Type.displayCutout() | androidx.core.view.WindowInsetsCompat.Type.ime());
                android.view.ViewGroup.MarginLayoutParams lp = (android.view.ViewGroup.MarginLayoutParams) v.getLayoutParams();
                lp.setMargins(b.left, b.top, b.right, b.bottom);
                v.setLayoutParams(lp);
                return androidx.core.view.WindowInsetsCompat.CONSUMED;
            });
        } catch (Exception e) { }
        PeykCallNotifier.handleIntent(this, getIntent());
        openCourierPage(getIntent());
        updateLauncher = registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {});
        checkForUpdate();
    }

    private void checkForUpdate() {
        try {
            updateManager = AppUpdateManagerFactory.create(this);
            updateManager.registerListener(installListener);
            updateManager.getAppUpdateInfo().addOnSuccessListener(info -> {
                if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                        && info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
                    updateManager.startUpdateFlowForResult(info, updateLauncher,
                            AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build());
                }
            });
        } catch (Exception e) {
            // Play Store olmayan cihazda (ör. elle kurulan APK) sessizce geçilir.
            updateManager = null;
        }
    }

    private void showRestartDialog() {
        if (restartDialogShown || isFinishing()) return;
        restartDialogShown = true;
        new AlertDialog.Builder(this)
                .setTitle("Güncelleme hazır")
                .setMessage("Peyktan'ın yeni sürümü indirildi. Kurmak için uygulama yeniden başlatılacak.")
                .setPositiveButton("Yeniden başlat", (d, w) -> { if (updateManager != null) updateManager.completeUpdate(); })
                .setNegativeButton("Sonra", (d, w) -> restartDialogShown = false)
                .show();
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        PeykCallNotifier.handleIntent(this, intent);
        openCourierPage(intent);
    }

    // Kurye konum bildirimine dokunulunca kurye sayfası uygulama içinde açılır (konum eklentisi orada çalışır).
    private void openCourierPage(android.content.Intent intent) {
        String u = intent != null ? intent.getStringExtra("kurye_url") : null;
        if (u == null || !u.startsWith("https://www.peyktan.com/kurye/")) return;
        intent.removeExtra("kurye_url");
        try { getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(u)); } catch (Exception e) { }
    }

    @Override
    public void onResume() {
        super.onResume();
        inForeground = true;
        // İndirme uygulama arka plandayken bittiyse geri dönüşte sorulur.
        if (updateManager != null) {
            updateManager.getAppUpdateInfo().addOnSuccessListener(info -> {
                if (info.installStatus() == InstallStatus.DOWNLOADED) showRestartDialog();
            });
        }
    }

    @Override
    public void onDestroy() {
        if (updateManager != null) updateManager.unregisterListener(installListener);
        super.onDestroy();
    }

    // Telsiz açıkken uygulama arka plana alınınca WebView duraklatılmasın:
    // canlı ses bağlantısı ve çalma devam etsin (servis süreci ayakta tutar).
    @Override
    public void onPause() {
        super.onPause();
        inForeground = false;
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
