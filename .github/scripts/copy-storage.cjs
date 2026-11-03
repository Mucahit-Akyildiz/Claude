// Supabase depolama dosyalarını eski projeden yenisine kopyalar (db-migrate.yml, mode=full).
// Anahtarlar ortam değişkeninden okunur, loga yazılmaz.
const OLD = { url: process.env.OLD_URL.replace(/\/$/, ''), key: process.env.OLD_KEY };
const NEW = { url: process.env.NEW_URL.replace(/\/$/, ''), key: process.env.NEW_KEY };
const H = (p) => ({ Authorization: 'Bearer ' + p.key, apikey: p.key });
async function list(p, bucket, prefix){
  const r = await fetch(`${p.url}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { ...H(p), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000, offset: 0 }) });
  if(!r.ok) throw new Error('list ' + bucket + ' ' + r.status);
  const out = [];
  for(const it of await r.json()){
    const path = prefix ? prefix + '/' + it.name : it.name;
    if(it.id === null) out.push(...await list(p, bucket, path)); else out.push({ path, type: (it.metadata && it.metadata.mimetype) || 'application/octet-stream' });
  }
  return out;
}
(async () => {
  const br = await fetch(`${OLD.url}/storage/v1/bucket`, { headers: H(OLD) });
  const buckets = (await br.json()).map(b => b.id);
  let ok = 0, fail = 0;
  for(const b of buckets){
    const files = await list(OLD, b, '');
    for(const f of files){
      try{
        const d = await fetch(`${OLD.url}/storage/v1/object/${b}/${encodeURI(f.path)}`, { headers: H(OLD) });
        if(!d.ok) throw new Error('indir ' + d.status);
        const buf = Buffer.from(await d.arrayBuffer());
        const u = await fetch(`${NEW.url}/storage/v1/object/${b}/${encodeURI(f.path)}`, { method: 'POST', headers: { ...H(NEW), 'Content-Type': f.type, 'x-upsert': 'true' }, body: buf });
        if(!u.ok) throw new Error('yükle ' + u.status + ' ' + (await u.text()).slice(0, 120));
        ok++;
      }catch(e){ fail++; console.log('HATA', b + '/' + f.path, e.message); }
    }
    console.log(b + ': ' + files.length + ' dosya');
  }
  console.log('Kopyalanan: ' + ok + ', hatalı: ' + fail);
  if(fail) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });
