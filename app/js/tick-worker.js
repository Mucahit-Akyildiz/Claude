/* Arka plandaki sekmede tarayıcılar setInterval'i dakikalarca geciktirebiliyor; worker'daki
   zamanlayıcı bu kısıtlamaya takılmadığı için rozet/sesli bildirim kontrolü buradan tetiklenir. */
let t = null;
self.onmessage = (e) => {
  clearInterval(t);
  if(e.data && e.data.ms) t = setInterval(() => self.postMessage('tick'), e.data.ms);
};
