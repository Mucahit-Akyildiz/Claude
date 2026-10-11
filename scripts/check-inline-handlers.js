// Güvenlik politikasından 'unsafe-inline'ı kaldırma çalışması: satır içi olay kodu (onclick="..." vb.)
// sayacı. CLEAN listesindeki dosyalarda hiç olmamalı; diğerleri için kalan sayı raporlanır.
// Yeni kod act()/actOn() (app/js/utils.js) ile yazılmalı.
const fs = require('fs');
const CLEAN = ['app/js/radio.js', 'app/js/help.js', 'app/js/pos-escpos.js', 'app/js/pos-push.js'];
const FILES = fs.readdirSync('app/js').filter((f) => f.endsWith('.js')).map((f) => 'app/js/' + f)
  .concat(['app/index.html', 'index.html', 'siparis/index.html', 'menu/index.html']);
const RE = /\bon(click|change|input|submit|keydown|keyup|blur|focus|load|error|mouseover|mouseout|pointerdown|touchstart|dragstart|drop|dragover|paste)\s*=\s*["']/g;
let total = 0, bad = [];
for (const f of FILES) {
  const n = (fs.readFileSync(f, 'utf8').match(RE) || []).length;
  total += n;
  if (n && CLEAN.includes(f)) bad.push(f + ': ' + n);
  if (n) console.log(String(n).padStart(4), f);
}
console.log('Toplam kalan satır içi olay kodu:', total);
if (bad.length) { console.error('Temizlenmiş dosyalarda satır içi kod var (act() kullanın):\n' + bad.join('\n')); process.exit(1); }
