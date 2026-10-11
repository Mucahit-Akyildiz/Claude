// Ödeme API testleri için yardımcılar: Supabase istemcisi ve iyzico (fetch) taklit edilir,
// gerçek ağ/veritabanı kullanılmaz.
const path = require('path');
const Module = require('module');

// Zincirlenebilir sahte Supabase sorgusu: her çağrı kaydedilir, sonuç testin verdiği
// handler(table, state) fonksiyonundan gelir.
function makeSupabase(handler, calls) {
  function query(table) {
    const state = { table, ops: [] };
    const q = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          const r = Promise.resolve(handler(table, state));
          return r.then.bind(r);
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => { state.ops.push([prop]); calls.push(state); return Promise.resolve(handler(table, state)); };
        }
        return (...args) => { state.ops.push([prop, ...args]); if (state.ops.length === 1) calls.push(state); return q; };
      },
    });
    return q;
  }
  return {
    from: (t) => query(t),
    rpc: (fn, args) => { const st = { table: 'rpc:' + fn, ops: [['rpc', args]] }; calls.push(st); return Promise.resolve(handler('rpc:' + fn, st)); },
  };
}

// Handler'ı, @supabase/supabase-js yerine sahte istemciyle ve verilen ortam değişkenleriyle yükler.
function loadHandler(file, { handler, env = {} }) {
  const calls = [];
  const abs = path.resolve(__dirname, '../../api', file);
  Object.keys(require.cache).forEach((k) => { if (k.includes(path.sep + 'api' + path.sep)) delete require.cache[k]; });
  const saved = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '@supabase/supabase-js') return { createClient: () => makeSupabase(handler, calls) };
    return origLoad.call(this, request, parent, isMain);
  };
  let fn;
  try { fn = require(abs); } finally {
    Module._load = origLoad;
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  return { fn, calls };
}

function makeRes() {
  const res = { statusCode: 200, body: null, redirectedTo: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.end = () => res;
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.redirect = (code, url) => { res.statusCode = code; res.redirectedTo = url; return res; };
  return res;
}

module.exports = { loadHandler, makeRes };
