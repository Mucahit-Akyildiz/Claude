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
      sandbox: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(APP_URL);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
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
