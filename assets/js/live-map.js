/* Canlı kurye haritası (Leaflet + OpenStreetMap). Müşteri takip sayfası, kurye sayfası ve uygulamadaki
   Kuryeler paneli ortak kullanır. LiveMap.create(el) → { set(points), destroy() }
   points: [{ id, lat, lng, kind: 'courier'|'dest'|'rest', label }] */
(function(){
  const ICONS = { courier: '🛵', dest: '🏠', rest: '🍽️' };
  function icon(kind, label){
    const html = '<div class="lm-pin lm-' + kind + '"><span>' + ICONS[kind] + '</span>' + (label ? '<b>' + String(label).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) + '</b>' : '') + '</div>';
    return L.divIcon({ html, className: 'lm-wrap', iconSize: [36, 36], iconAnchor: [18, 18] });
  }
  function create(el, opts){
    if(!window.L || !el) return null;
    const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: !(opts && opts.noWheel) });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    map.setView([41.01, 29.0], 11);
    const markers = {}; let fitted = false, userMoved = false;
    map.on('dragstart zoomstart', (e) => { if(e && e.originalEvent) userMoved = true; });
    map.on('mousedown touchstart', () => { userMoved = true; });
    function set(points){
      const seen = {};
      (points || []).filter(p => p && p.lat != null && p.lng != null).forEach(p => {
        const k = p.kind + ':' + (p.id || ''); seen[k] = 1;
        if(markers[k]){ markers[k].setLatLng([p.lat, p.lng]); markers[k].setIcon(icon(p.kind, p.label)); }
        else markers[k] = L.marker([p.lat, p.lng], { icon: icon(p.kind, p.label), zIndexOffset: p.kind === 'courier' ? 1000 : 0 }).addTo(map);
      });
      Object.keys(markers).forEach(k => { if(!seen[k]){ map.removeLayer(markers[k]); delete markers[k]; } });
      const ll = Object.values(markers).map(m => m.getLatLng());
      if(ll.length && (!fitted || !userMoved)){
        if(ll.length === 1) map.setView(ll[0], 15); else map.fitBounds(L.latLngBounds(ll), { padding: [40, 40], maxZoom: 16 });
        fitted = true;
      }
    }
    setTimeout(() => map.invalidateSize(), 60);
    return { set, map, refit(){ userMoved = false; fitted = false; }, destroy(){ try{ map.remove(); }catch(e){} } };
  }
  window.LiveMap = { create };
})();
