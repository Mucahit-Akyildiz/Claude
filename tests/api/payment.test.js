// Ödeme API testleri (node --test tests/api). iyzico ve Supabase taklit edilir.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadHandler, makeRes } = require('./helpers');

const ENV = { IYZICO_BASE_URL: 'https://sandbox.test', IYZICO_API_KEY: 'k', IYZICO_SECRET_KEY: 's', VERCEL_ENV: undefined, APP_LOGIN_URL: '/' };

function mockFetch(result) {
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { json: async () => result }; };
  return calls;
}

// ---- payment-callback ----
function callbackDb({ payment = { restaurant_id: 'r1', package_id: 'paket2', status: 'pending', billing_cycle: 'monthly' }, outcome = 'ok', rpcError = null } = {}) {
  return (table, st) => {
    if (table === 'payments' && st.ops[0][0] === 'select') return { data: payment };
    if (table === 'rpc:complete_subscription_payment') return { data: outcome, error: rpcError };
    return { data: null, error: null };
  };
}

test('callback: token yoksa eksik', async () => {
  const { fn } = loadHandler('payment-callback.js', { handler: callbackDb(), env: ENV });
  const res = makeRes(); await fn({ method: 'POST', body: {}, query: {} }, res);
  assert.equal(res.redirectedTo, '/?odeme=eksik');
});

test('callback: ödeme kaydı yoksa bulunamadi', async () => {
  const { fn } = loadHandler('payment-callback.js', { handler: callbackDb({ payment: null }), env: ENV });
  const res = makeRes(); await fn({ method: 'POST', body: { token: 't' } }, res);
  assert.equal(res.redirectedTo, '/?odeme=bulunamadi');
});

test('callback: zaten başarılı ödeme iyzico\'ya tekrar sorulmaz', async () => {
  const fetchCalls = mockFetch({});
  const { fn } = loadHandler('payment-callback.js', { handler: callbackDb({ payment: { restaurant_id: 'r1', status: 'success' } }), env: ENV });
  const res = makeRes(); await fn({ method: 'POST', body: { token: 't' } }, res);
  assert.equal(res.redirectedTo, '/?odeme=basarili');
  assert.equal(fetchCalls.length, 0);
});

test('callback: iyzico başarısız derse abonelik uzatılmaz', async () => {
  mockFetch({ status: 'failure', paymentStatus: 'FAILURE' });
  const { fn, calls } = loadHandler('payment-callback.js', { handler: callbackDb(), env: ENV });
  const res = makeRes(); await fn({ method: 'POST', body: { token: 't' } }, res);
  assert.equal(res.redirectedTo, '/?odeme=basarisiz');
  assert.ok(!calls.some((c) => c.table === 'rpc:complete_subscription_payment'));
  assert.ok(calls.some((c) => c.table === 'payments' && c.ops[0][0] === 'update' && c.ops[0][1].status === 'failed'));
});

test('callback: başarılı ödeme tek işlemde tamamlanır (aylık 30 gün, iyzico tutarıyla)', async () => {
  mockFetch({ status: 'success', paymentStatus: 'SUCCESS', price: '499.99', paidPrice: '509.99' });
  const { fn, calls } = loadHandler('payment-callback.js', { handler: callbackDb(), env: ENV });
  const res = makeRes(); await fn({ method: 'POST', body: { token: 'tok1' } }, res);
  assert.equal(res.redirectedTo, '/?odeme=basarili');
  const rpc = calls.find((c) => c.table === 'rpc:complete_subscription_payment');
  assert.deepEqual(rpc.ops[0][1], { p_token: 'tok1', p_paid_price: 499.99, p_days: 30 });
  // Eski iki adımlı akış (önce success, sonra ayrı uzatma) artık kullanılmıyor.
  assert.ok(!calls.some((c) => c.table === 'rpc:extend_restaurant_subscription'));
});

test('callback: yıllık ödeme 365 gün uzatır', async () => {
  mockFetch({ status: 'success', paymentStatus: 'SUCCESS', price: '5499.99' });
  const { fn, calls } = loadHandler('payment-callback.js', {
    handler: callbackDb({ payment: { restaurant_id: 'r1', package_id: 'paket2', status: 'pending', billing_cycle: 'yearly' } }), env: ENV });
  const res = makeRes(); await fn({ method: 'POST', body: { token: 't' } }, res);
  assert.equal(calls.find((c) => c.table === 'rpc:complete_subscription_payment').ops[0][1].p_days, 365);
});

test('callback: tutar uyuşmazsa hata ve kayıt düşülür', async () => {
  mockFetch({ status: 'success', paymentStatus: 'SUCCESS', price: '1.00' });
  const { fn, calls } = loadHandler('payment-callback.js', { handler: callbackDb({ outcome: 'amount_mismatch' }), env: ENV });
  const res = makeRes(); await fn({ method: 'POST', body: { token: 't' } }, res);
  assert.equal(res.redirectedTo, '/?odeme=hata');
  assert.ok(calls.some((c) => c.table === 'payment_debug_log' && /complete_failed/.test(c.ops[0][1].context)));
});

test('callback: veritabanı hatasında başarılı denmez', async () => {
  mockFetch({ status: 'success', paymentStatus: 'SUCCESS', price: '499.99' });
  const { fn } = loadHandler('payment-callback.js', { handler: callbackDb({ outcome: null, rpcError: { message: 'boom' } }), env: ENV });
  const res = makeRes(); await fn({ method: 'POST', body: { token: 't' } }, res);
  assert.equal(res.redirectedTo, '/?odeme=hata');
});

test('callback: canlıda iyzico adresi yoksa test ortamına gitmez', async () => {
  const fetchCalls = mockFetch({});
  const { fn } = loadHandler('payment-callback.js', { handler: callbackDb(), env: { ...ENV, IYZICO_BASE_URL: undefined, VERCEL_ENV: 'production' } });
  const res = makeRes(); await fn({ method: 'POST', body: { token: 't' } }, res);
  assert.equal(res.redirectedTo, '/?odeme=hata');
  assert.equal(fetchCalls.length, 0);
});

// ---- payment-initialize ----
function initDb({ restaurant }) {
  return (table) => {
    if (table === 'staff_sessions') return { data: { restaurant_id: 'r1', user_id: 'u1' } };
    if (table === 'app_users') return { data: { role_ids: ['role1'] } };
    if (table === 'roles') return { data: [{ is_system: true }] };
    if (table === 'restaurants') return { data: restaurant };
    return { data: null, error: null };
  };
}

test('initialize: yalnızca POST', async () => {
  const { fn } = loadHandler('payment-initialize.js', { handler: initDb({}), env: ENV });
  const res = makeRes(); await fn({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('initialize: canlıda iyzico adresi yoksa 500', async () => {
  const { fn } = loadHandler('payment-initialize.js', { handler: initDb({}), env: { ...ENV, IYZICO_BASE_URL: undefined, VERCEL_ENV: 'production' } });
  const res = makeRes(); await fn({ method: 'POST', body: { p_token: 't' } }, res);
  assert.equal(res.statusCode, 500);
});

test('initialize: fatura adresi yoksa ödeme başlamaz', async () => {
  const fetchCalls = mockFetch({});
  const { fn } = loadHandler('payment-initialize.js', {
    handler: initDb({ restaurant: { id: 'r1', name: 'X', email: 'a@b.c', phone: '05551112233', package_id: 'paket2', billing_identity_number: '10000000146', billing_address: null, billing_city: null } }), env: ENV });
  const res = makeRes(); await fn({ method: 'POST', body: { p_token: 't' } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.errorMessage, /Fatura adresiniz eksik/);
  assert.equal(fetchCalls.length, 0);
});

test('initialize: T.C. kimlik yoksa ödeme başlamaz', async () => {
  const { fn } = loadHandler('payment-initialize.js', {
    handler: initDb({ restaurant: { id: 'r1', name: 'X', package_id: 'paket2', billing_identity_number: null } }), env: ENV });
  const res = makeRes(); await fn({ method: 'POST', body: { p_token: 't' } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.errorMessage, /Kimlik/);
});
