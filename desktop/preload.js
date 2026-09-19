const { contextBridge, ipcRenderer } = require('electron');

// index.html içindeki kod, bu köprünün varlığını kontrol ederek (window.electronAPI)
// masaüstü uygulamasında mı yoksa sıradan bir tarayıcıda/tablette mi çalıştığını
// anlıyor ve buna göre sessiz yazdırma yolunu kullanıp kullanmayacağına karar veriyor.
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  silentPrint: (printerName) => ipcRenderer.invoke('silent-print', { printerName }),
});
