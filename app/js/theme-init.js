  // Sayfa boyanmadan önce doğru temayı uygula (yanıp sönmeyi önler)
  (function(){
    try{
      var t = localStorage.getItem('rys_theme') || 'light';
      document.documentElement.setAttribute('data-theme', t);
    }catch(e){}
  })();
