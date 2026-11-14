const { contextBridge, ipcRenderer } = require('electron');

// index.html içindeki kod, bu köprünün varlığını kontrol ederek (window.electronAPI)
// masaüstü uygulamasında mı yoksa sıradan bir tarayıcıda/tablette mi çalıştığını
// anlıyor ve buna göre sessiz yazdırma yolunu kullanıp kullanmayacağına karar veriyor.
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  silentPrint: (printerName) => ipcRenderer.invoke('silent-print', { printerName }),
  silentPrintHtml: (printerName, html) => ipcRenderer.invoke('silent-print-html', { printerName, html }),
  // Otomatik güncelleme (Windows): sürüm, durum, kontrol, yeniden başlatıp kurma.
  appVersion: () => ipcRenderer.invoke('desktop-version'),
  updateState: () => ipcRenderer.invoke('desktop-update-state'),
  checkUpdate: () => ipcRenderer.invoke('desktop-update-check'),
  installUpdate: () => ipcRenderer.invoke('desktop-update-install'),
  onUpdate: (cb) => ipcRenderer.on('desktop-update', (_e, st) => { try { cb(st); } catch (e) {} }),
  // Bir bildirime (Electron'un yerel Notification API'siyle gösterilen,
  // isletim sisteminin kendi bildirim merkezinde/koseden cikan gercek
  // bildirim) tiklandiginda pencere simge durumundaysa/arka plandaysa
  // one getirilsin diye - bkz. index.html'deki notifyDesktop().
  focusWindow: () => ipcRenderer.invoke('focus-window'),
});
