  (function(){
    try{
      var t = localStorage.getItem('rys_theme') || 'light';
      document.documentElement.setAttribute('data-theme', t);
    }catch(e){
      document.documentElement.setAttribute('data-theme', 'light');
    }
  })();
