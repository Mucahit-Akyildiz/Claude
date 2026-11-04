// Uygulama JS dosyalarını tek dosyada birleştirip küçültür: app/dist/app.bundle.js.
// Sıra app/index.html'deki <!-- bundle:start --> … <!-- bundle:end --> arasındaki listeden okunur
// (liste HTML yorumu içinde durur; sayfa yalnızca paketi yükler). Global adlar korunur
// Üst düzey (global) adlar korunur (data-click="fonksiyonAdı" ile adından çağrılıyorlar); yerel değişkenler kısaltılır.
// Kullanım: node scripts/build-bundle.js — Vercel her yayında çalıştırır (vercel.json buildCommand); paket depoya kaydedilmez (.gitignore).
// Yerelde test için bump-version.sh de üretir.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let esbuild;
try{ esbuild = require('esbuild'); }catch(e){
  try{ esbuild = require(require.resolve('esbuild', { paths: [process.env.ESBUILD_PATH || '', path.join(root, 'node_modules')] })); }
  catch(e2){ esbuild = null; console.warn('esbuild bulunamadı: dosyalar küçültülmeden tek pakette birleştirilecek (sıkıştırmayı sunucu yapar).'); }
}
const html = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
const m = html.match(/<!-- bundle:start([\s\S]*?)bundle:end -->/);
if(!m){ console.error('index.html içinde bundle:start / bundle:end bulunamadı'); process.exit(1); }
const files = [...m[1].matchAll(/js\/[a-z0-9-]+\.js/g)].map(x => x[0]);
if(!files.length){ console.error('Paket listesi boş'); process.exit(1); }
// Her dosya ayrı bir satır bloğunda; dosyalar arasında ; ile ayrılır (önceki dosya ; olmadan bitse de güvenli).
let src = '', map = [];
for(const f of files){
  const code = fs.readFileSync(path.join(root, 'app', f), 'utf8');
  src += '\n;// ==== ' + f + ' ====\n' + code + '\n';
}
const out = !esbuild ? { code: src } : esbuild.transformSync(src, { loader: 'js', minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: true, sourcefile: 'app.bundle.src.js', target: 'es2019', legalComments: 'none' });
fs.mkdirSync(path.join(root, 'app/dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'app/dist/app.bundle.js'), out.code);
console.log('paket: ' + files.length + ' dosya, ' + Math.round(src.length / 1024) + ' KB → ' + Math.round(out.code.length / 1024) + ' KB');
