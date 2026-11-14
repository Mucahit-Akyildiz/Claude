const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

// Masaüstü uygulaması, ayrı bir kopya değil - canlı web uygulamasını (Vercel'de
// yayınlanan) kendi penceresinde açıyor. Böylece index.html'de yapılan her
// güncelleme, uygulamayı yeniden paketlemeye gerek kalmadan otomatik olarak
// masaüstü kullanıcılarına da yansıyor. Bu kabuğun tek eklediği şey: preload.js
// üzerinden sunulan, işletim sisteminin kendi yazıcısına PENCERE AÇMADAN
// (silent:true) doğrudan basabilen bir köprü (window.electronAPI).
const APP_URL = process.env.PEYKTAN_APP_URL || 'https://www.peyktan.com/app/';
// Paketlenmiş (kurulmuş) uygulamada exe/dmg ikonu electron-builder'ın
// build/icon.ico|icns dosyasından geliyor; bu burada ayrıca "npm start" ile
// paketlenmemiş çalıştırıldığında pencere/taşıma çubuğu ikonunun de aynı
// logo olması için.
const ICON_PATH = path.join(__dirname, 'build', 'icon.png');

let mainWindow = null;

// nodeIntegration:false + contextIsolation:true zaten Node erisimini kapatiyor;
// buradaki navigasyon kisitlamasi ayrica bir savunma katmani - peyktan.com disina
// (orn. sayfa icinde bir yere tiklanip) yonlendirilmeye/yeni pencere acilmaya
// calisilirsa engellenir, tik olursa sistem tarayicisinda acilir.
const ALLOWED_ORIGIN = new URL(APP_URL).origin;
function isAllowedUrl(url) {
  try { return new URL(url).origin === ALLOWED_ORIGIN; } catch (e) { return false; }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Peyktan',
    icon: ICON_PATH,
    webPreferences: {
      preload: require('path').join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Pencere küçültülse de zamanlayıcılar yavaşlamasın: paylaşılan yazıcıya gelen fişler ve sipariş bildirimleri gecikmesin.
      backgroundThrottling: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedUrl(url)) require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.loadURL(APP_URL);
}

// Otomatik güncelleme (yalnız kurulu Windows uygulaması): yeni sürüm GitHub'daki "masaustu" sürümünden
// (latest.yml) arka planda indirilir; uygulama kapanınca kurulur ya da kullanıcı "Yeniden başlat" der.
// macOS'ta imzasız uygulama kendini güncelleyemediği için orada elle kurulum sürer.
let updateState = { status: 'idle', version: null };
function sendUpdateState() { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop-update', updateState); } catch (e) {} }
function setupAutoUpdate() {
  if (!app.isPackaged || process.platform !== 'win32') return null;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return null; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (i) => { updateState = { status: 'downloading', version: i && i.version }; sendUpdateState(); });
  autoUpdater.on('update-downloaded', (i) => { updateState = { status: 'ready', version: i && i.version }; sendUpdateState(); });
  autoUpdater.on('update-not-available', () => { updateState = { status: 'latest', version: app.getVersion() }; sendUpdateState(); });
  autoUpdater.on('error', (e) => { updateState = { status: 'error', version: null, error: String((e && e.message) || e).slice(0, 200) }; sendUpdateState(); });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 15000);
  setInterval(check, 6 * 60 * 60 * 1000);
  return { check, install: () => autoUpdater.quitAndInstall(false, true) };
}
let updater = null;
ipcMain.handle('desktop-version', () => app.getVersion());
ipcMain.handle('desktop-update-state', () => updateState);
ipcMain.handle('desktop-update-check', async () => { if (updater) await updater.check(); return updateState; });
ipcMain.handle('desktop-update-install', () => { if (updater && updateState.status === 'ready') { setImmediate(() => updater.install()); return true; } return false; });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  updater = setupAutoUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Bir bildirime (index.html'deki notifyDesktop() - Electron'un yerel
// Notification API'sini kullanarak isletim sisteminin kendi bildirim
// merkezinde/koseden cikan gercek bir bildirim gosterir) tiklandiginda,
// pencere simge durumundaysa veya arka plandaysa on plana getirilir.
ipcMain.handle('focus-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

// Bu bilgisayarda işletim sisteminin tanıdığı yazıcıların listesini döner
// (Yazıcı Ayarları'ndaki "İşletim Sistemi Yazıcısı" seçim listesi için).
ipcMain.handle('list-printers', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: !!p.isDefault }));
});

// O an #printArea içine render edilmiş fiş HTML'ini, hiçbir pencere/onay
// göstermeden doğrudan belirtilen (veya işletim sistemi varsayılanı) yazıcıya
// gönderir. Electron'un native yazdırma API'si bunu destekliyor - tarayıcıdaki
// gibi bir bayrağa (--kiosk-printing) veya WebUSB'ye ihtiyaç yok.
// Hızlı fiş: yalnız fişin HTML'i, gizli küçük bir pencerede basılır. Tüm uygulama sayfasını yazıcıya
// hazırlamak (silent-print) 3-5 sn sürüyordu; tek fişlik sayfa ~0.5 sn. Pencere bir kez açılıp tekrar kullanılır.
let ticketWin = null, ticketQueue = Promise.resolve();
function getTicketWin() {
  if (ticketWin && !ticketWin.isDestroyed()) return ticketWin;
  ticketWin = new BrowserWindow({ show: false, width: 400, height: 800, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  return ticketWin;
}
ipcMain.handle('silent-print-html', (event, { printerName, html } = {}) => {
  const job = ticketQueue.then(() => new Promise((resolve) => {
    try {
      const w = getTicketWin();
      w.webContents.once('did-finish-load', () => {
        w.webContents.print({ silent: true, printBackground: false, deviceName: printerName || undefined, margins: { marginType: 'none' } },
          (success, errorType) => resolve({ success, errorType: success ? null : errorType }));
      });
      w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html || ''))).catch((e) => resolve({ success: false, errorType: String(e && e.message || e) }));
    } catch (e) { resolve({ success: false, errorType: String(e && e.message || e) }); }
  }));
  ticketQueue = job.catch(() => {});
  return job;
});
ipcMain.handle('silent-print', async (event, { printerName } = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  return new Promise((resolve) => {
    win.webContents.print(
      {
        // printBackground:false - fis sadece siyah metin/cizgi iceriyor, arka
        // plan grafigi gerekmiyor. true yapilirsa sayfanin koyu tema arka
        // plani da (body arkasinda kalan kisim) yazicidan cikip fisi simsiyah
        // bastirabiliyordu.
        silent: true,
        printBackground: false,
        deviceName: printerName || undefined,
        margins: { marginType: 'none' },
      },
      (success, errorType) => resolve({ success, errorType: success ? null : errorType })
    );
  });
});
