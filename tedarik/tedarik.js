/* Tedarikçiye SMS / e-postayla gönderilen malzeme siparişi belgesi (oturumsuz, 60 gün). Yazdır / PDF olarak kaydet. */
const sb = window.supabase.createClient('https://dveybagnrgofxkqangvo.supabase.co', 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8');
const TOKEN = new URLSearchParams(location.search).get('t');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const d = (v) => v ? new Date(v + (String(v).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('tr-TR') : '';
function printDoc(){ window.print(); }
(async () => {
  const app = document.getElementById('app');
  if(!TOKEN || !/^[0-9a-f-]{36}$/i.test(TOKEN)){ app.innerHTML = '<h1>Geçersiz bağlantı</h1>'; return; }
  const { data, error } = await sb.rpc('get_public_po', { p_token: TOKEN });
  if(error || !data){ app.innerHTML = '<h1>Sipariş bulunamadı</h1><p class="muted">Bağlantının süresi dolmuş olabilir.</p>'; return; }
  document.title = 'Malzeme Siparişi · ' + (data.restaurant || '') + ' · ' + d(data.order_date);
  const fq = (n) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
  app.innerHTML = `<h1>Malzeme Siparişi</h1>
    <p class="m"><b>${esc(data.restaurant)}</b>${data.supplier ? ' → <b>' + esc(data.supplier) + '</b>' : ''}<br>Sipariş tarihi: ${d(data.order_date)}${data.expected_date ? ' · Teslim: <b>' + d(data.expected_date) + '</b>' : ''}${data.by ? ' · Hazırlayan: ' + esc(data.by) : ''}${data.phone ? '<br>İletişim: ' + esc(data.phone) : ''}</p>
    <table><thead><tr><th>#</th><th>Ürün</th><th class="r">Miktar</th></tr></thead><tbody>
    ${(data.items || []).map((i, k) => `<tr><td class="n">${k + 1}</td><td>${esc(i.name)}</td><td class="r"><b>${fq(i.qty)}</b> ${esc(i.unit || '')}</td></tr>`).join('')}
    </tbody></table>${data.notes ? `<p><b>Not:</b> ${esc(data.notes)}</p>` : ''}
    <div class="acts"><button ${act('printDoc')}>📄 PDF indir</button><button class="g" ${act('printDoc')}>🖨️ Yazdır</button></div>
    <p class="f">PDF için açılan pencerede hedef olarak “PDF olarak kaydet”i seçin. · Peyktan</p>`;
})();
