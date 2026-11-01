// index.html ?vNNN, sw.js önbellek adı ve version.json aynı sürümde mi? (eski/yeni dosya karışmasını önler)
const fs = require('fs'), path = require('path'), r = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const vs = [...new Set((r('app/index.html').match(/\?v(\d+)/g) || []).map(x => x.slice(2)))];
const sw = (r('app/sw.js').match(/peyktan-shell-v(\d+)/) || [])[1];
let vj = null; try{ vj = String(JSON.parse(r('app/version.json')).v); }catch(e){}
if(vs.length !== 1 || vs[0] !== sw || vs[0] !== vj){ console.error('Sürüm uyuşmuyor: index=' + vs.join(',') + ' sw=' + sw + ' version.json=' + vj + ' → scripts/bump-version.sh çalıştırın'); process.exit(1); }
console.log('sürüm senkron: v' + sw);
