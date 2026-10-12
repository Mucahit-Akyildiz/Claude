// Güvenlik politikası (vercel.json) satır içi JavaScript'e izin vermez ('unsafe-inline' yok).
// Bu kontrol, sayfalara satır içi olay kodu (onclick="..." vb.) ya da src'siz <script>
// bloğu girmesini engeller. Yeni kod act()/actOn() (assets/js/act.js) ile yazılmalı.
const fs = require('fs');
const path = require('path');
const HTML = ['app/index.html', 'index.html', 'siparis/index.html', 'menu/index.html', 'hesap-silme/index.html', 'gizlilik/index.html'];
const JS_DIRS = ['app/js', 'assets/js', 'siparis', 'menu', 'hesap-silme'];
const FILES = JS_DIRS.flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => path.join(d, f))).concat(HTML);
const RE = /\bon(click|change|input|submit|keydown|keyup|blur|focus|load|error|mouseover|mouseout|pointerdown|touchstart|dragstart|drop|dragover|paste|dblclick|mousedown|mouseup|contextmenu)\s*=\s*["']/g;
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>/gi;
let bad = [];
for (const f of FILES) {
  const s = fs.readFileSync(f, 'utf8');
  const n = (s.match(RE) || []).length;
  if (n) bad.push(`${f}: ${n} satır içi olay kodu`);
  if (f.endsWith('.html')) {
    const k = (s.match(INLINE_SCRIPT) || []).length;
    if (k) bad.push(`${f}: ${k} src'siz <script> bloğu`);
  }
}
// Herkese açık sayfalarda satır içi stil de yasak (bu sayfalarda style-src 'unsafe-inline' yok, bkz. vercel.json).
const PUBLIC_STRICT = ['index.html', 'siparis/index.html', 'menu/index.html', 'gizlilik/index.html', 'hesap-silme/index.html',
  'assets/js/site.js', 'assets/js/act.js', 'assets/js/theme-init.js', 'siparis/siparis.js', 'menu/menu.js', 'hesap-silme/hesap-silme.js'];
for (const f of PUBLIC_STRICT) {
  const s = fs.readFileSync(f, 'utf8');
  const n = (s.match(/\sstyle\s*=\s*["']/g) || []).length + (s.match(/<style[\s>]/gi) || []).length;
  if (n) bad.push(`${f}: ${n} satır içi stil (class kullanın, CSS dosyasına taşıyın)`);
}
if (bad.length) { console.error('Güvenlik politikası satır içi JavaScript\'i engeller (act() kullanın, kodu .js dosyasına taşıyın):\n' + bad.join('\n')); process.exit(1); }
console.log(FILES.length + ' dosya kontrol edildi: satır içi JavaScript yok.');
