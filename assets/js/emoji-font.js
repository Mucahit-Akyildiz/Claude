// Emoji simgeleri Apple dışı cihazlarda Noto Color Emoji ile aynı görünsün (uygulamadaki theme-init.js ile aynı kural).
// Apple cihazlarda Safari bu yazı tipinin renkli biçimini çizemediği için Apple'ın kendi emojileri kalır.
(function(){
  try{
    var ua = navigator.userAgent || '', apple = /iPhone|iPad|iPod|Macintosh/.test(ua) && !/Chrome|CriOS|Edg|Firefox|FxiOS/.test(ua) || /iPhone|iPad|iPod/.test(ua);
    if(!apple) document.documentElement.classList.add('emoji-noto');
  }catch(e){}
})();
