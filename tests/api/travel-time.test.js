// Google Maps yol süresi API testleri: platform anahtarında işletme kotası, kendi anahtarında kota yok.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadHandler, makeRes } = require('./helpers');

const ENV = { GOOGLE_MAPS_API_KEY: 'platform', PUSH_DISPATCH_SECRET: 'sec', SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'y' };
Object.assign(process.env, ENV); // handler ortam değişkenlerini çağrı anında okur
const target = (key) => ({ key, lat: 41, lng: 29, address: 'Ümraniye', buffer: 5, default: 10 });
function mockGoogle() {
  const calls = [];
  global.fetch = async (url) => { calls.push(url); return { json: async () => String(url).includes('geocode') ? { status: 'OK', results: [{ geometry: { location: { lat: 41.01, lng: 29.1 } }, formatted_address: 'x' }] } : { routes: [{ duration: '600s' }] } }; };
  return calls;
}
const req = (body) => ({ method: 'POST', headers: { 'x-push-secret': 'sec' }, body });

test('travel-time: platform anahtarında kota doluysa Google çağrılmaz, varsayılana düşer', async () => {
  const g = mockGoogle();
  const { fn, calls } = loadHandler('travel-time.js', { env: ENV, handler: (t) => t === 'rpc:_order_travel_target' ? { data: target(null) } : t === 'rpc:_maps_quota_take' ? { data: false } : { data: null } });
  const res = makeRes(); await fn(req({ order_id: 'o1' }), res);
  assert.equal(res.body.fallback, true); assert.equal(res.body.reason, 'QUOTA'); assert.equal(g.length, 0);
  assert.ok(calls.some(c => c.table === 'rpc:_maps_quota_take' && c.ops[0][1].p_n === 2));
});

test('travel-time: platform anahtarında kota varsa süre hesaplanır', async () => {
  const g = mockGoogle();
  const { fn } = loadHandler('travel-time.js', { env: ENV, handler: (t) => t === 'rpc:_order_travel_target' ? { data: target(null) } : t === 'rpc:_maps_quota_take' ? { data: true } : { data: null } });
  const res = makeRes(); await fn(req({ order_id: 'o1' }), res);
  assert.equal(res.body.ok, true); assert.equal(res.body.drive, 10); assert.equal(res.body.total, 15); assert.equal(g.length, 2);
});

test('travel-time: işletmenin kendi anahtarında kota sorulmaz', async () => {
  mockGoogle();
  const { fn, calls } = loadHandler('travel-time.js', { env: ENV, handler: (t) => t === 'rpc:_order_travel_target' ? { data: target('own') } : { data: null } });
  const res = makeRes(); await fn(req({ order_id: 'o1' }), res);
  assert.equal(res.body.ok, true); assert.ok(!calls.some(c => c.table === 'rpc:_maps_quota_take'));
});

test('travel-time: gizli anahtar olmadan sunucu çağrısı reddedilir', async () => {
  const { fn } = loadHandler('travel-time.js', { env: ENV, handler: () => ({ data: null }) });
  const res = makeRes(); await fn({ method: 'POST', headers: {}, body: { order_id: 'o1' } }, res);
  assert.equal(res.statusCode, 401);
});
