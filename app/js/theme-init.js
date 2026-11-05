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
  // Emoji simgeleri her cihazda aynı (Noto Color Emoji) görünsün. Apple cihazlarda Safari bu yazı tipinin
  // renkli biçimini çizemediği için Apple'ın kendi emojileri kalır.
  (function(){
    try{
      var ua = navigator.userAgent || '', apple = /iPhone|iPad|iPod|Macintosh/.test(ua) && !/Chrome|CriOS|Edg|Firefox|FxiOS/.test(ua) || /iPhone|iPad|iPod/.test(ua);
      if(!apple) document.documentElement.classList.add('emoji-noto');
    }catch(e){}
  })();
