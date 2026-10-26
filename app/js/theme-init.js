  // Sayfa boyanmadan önce doğru temayı uygula (yanıp sönmeyi önler)
  (function(){
    try{
      var t = localStorage.getItem('rys_theme') || 'light';
      document.documentElement.setAttribute('data-theme', t);
    }catch(e){}
  })();
  // Mobil uygulama kabuğu: sınıf sayfa boyanmadan eklenir ki açılış logosu ilk karede doğru yerde olsun.
  (function(){
    try{ if(window.Capacitor && (Capacitor.isNativePlatform ? Capacitor.isNativePlatform() : true)) document.documentElement.classList.add('native-app'); }catch(e){}
  })();
