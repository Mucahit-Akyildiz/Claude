// Vercel serverless function: dispatch-ready-pushes
// pg_cron (Supabase) iki ayri zamanlanmis is bu endpoint'i x-push-secret
// header'iyla cagirir, her biri body'deki 'mode' ile hangi bildirim turunu
// istedigini belirtir: (1) _cron_dispatch_ready_pushes (her dakika,
// mode:'ready_orders_only') - hazirlanmis ama henuz odenmemis/teslim
// edilmemis siparisleri bulup, o siparisi ALAN personelin
// (orders.created_by) kayitli push aboneliklerine tekrar tekrar hatirlatma
// gonderir; (2) _cron_dispatch_customer_requests (her 20 saniyede bir,
// mode:'customer_requests_only') - QR menuden gelen, henuz onaylanmamis
// musteri siparis isteklerini bulup, siparis alma yetkisi olan TUM
// personele, ONAYLANANA/REDDEDILENE KADAR TEKRAR TEKRAR (en fazla 20
// saniyede bir) push gonderir - boylece personel Siparis Al ekraninda
// olmasa, hatta uygulama/tarayici kapali olsa bile QR siparisini kacirmaz.
// Iki is ayri cron job/mode kullaniyor ki 20 saniyelik sik calisma hazir
// siparis hatirlatmasinin (kasitli olarak dakikada bir kalan) sikligini
// etkilemesin. VAPID anahtarlari ve sifreleme burada (web-push paketi),
// Postgres tarafinda degil - o yuzden gercek gonderim mantigi bu dosyada.
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const PUSH_DISPATCH_SECRET = process.env.PUSH_DISPATCH_SECRET;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:destek@peyktan.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// QR menuden gelen, henuz personel tarafindan onaylanmamis/reddedilmemis
// siparis isteklerini bulur ve siparis alma yetkisi ('order' izni ya da
// is_system rolu) olan personele push gonderir - bu is 20 saniyede bir
// calistigi icin, push_notified_at 18 saniyeden eskiyse (ya da hic yoksa)
// tekrar gonderilir; boylece onaylanana/reddedilene kadar (customer_order_
// requests.status pending oldugu surece) tekrar tekrar bildirim gider.
async function dispatchCustomerOrderRequests(supabase) {
  const { data: allPending, error: reqErr } = await supabase
    .from('customer_order_requests')
    .select('id, restaurant_id, customer_name, push_notified_at, restaurant_tables(name)')
    .eq('status', 'pending');
  if (reqErr) return { sent: 0, requests: 0 };
  const cutoff = Date.now() - 18000;
  const reqs = (allPending || []).filter((r) => !r.push_notified_at || new Date(r.push_notified_at).getTime() < cutoff);
  if (reqs.length === 0) return { sent: 0, requests: 0 };

  const byRestaurant = new Map();
  for (const r of reqs) {
    if (!byRestaurant.has(r.restaurant_id)) byRestaurant.set(r.restaurant_id, []);
    byRestaurant.get(r.restaurant_id).push(r);
  }

  let sent = 0;
  const notifiedIds = [];
  for (const [restaurantId, rows] of byRestaurant) {
    const { data: appUsers } = await supabase
      .from('app_users')
      .select('id, role_ids')
      .eq('restaurant_id', restaurantId);
    const { data: roles } = await supabase
      .from('roles')
      .select('id, is_system, permissions')
      .eq('restaurant_id', restaurantId);
    const orderRoleIds = new Set(
      (roles || []).filter((rl) => rl.is_system || (rl.permissions || []).includes('order')).map((rl) => rl.id)
    );
    const staffUserIds = (appUsers || [])
      .filter((u) => (u.role_ids || []).some((rid) => orderRoleIds.has(rid)))
      .map((u) => u.id);

    if (staffUserIds.length > 0) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('*')
        .in('user_id', staffUserIds);

      const labels = rows.map((r) => (r.restaurant_tables && r.restaurant_tables.name) || r.customer_name || 'Masa');
      const shown = labels.slice(0, 3).join(', ') + (labels.length > 3 ? ' ve ' + (labels.length - 3) + ' tane daha' : '');
      const payload = JSON.stringify({
        title: '📱 Onay bekleyen müşteri sipariş isteği',
        body: shown,
        url: '/app/',
        view: 'order',
        tag: 'customer-order-request',
      });

      await Promise.all((subs || []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (e) {
          if (e && (e.statusCode === 404 || e.statusCode === 410)) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }));
    }

    rows.forEach((r) => notifiedIds.push(r.id));
  }

  if (notifiedIds.length > 0) {
    await supabase.from('customer_order_requests').update({ push_notified_at: new Date().toISOString() }).in('id', notifiedIds);
  }

  return { sent, requests: notifiedIds.length };
}

// Mutfakta 15 dakikadan uzun suredir 'pending' kalmis (henuz hazir isaretlenmemis)
// urunleri bulur ve o restoranda 'kitchen' izni olan personelin push aboneliklerine
// bildirim gonderir - boylece mutfak ekranindan uzaklasilsa, sekme arka plana
// alinsa hatta tarayici kapali olsa bile gecikme fark edilir. Ayni urun icin
// spam olmamasi adina en fazla 4 dakikada bir tekrar bildirim gider
// (order_items.late_push_notified_at ile takip edilir).
async function dispatchLateKitchenItems(supabase) {
  const lateCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: lateItems, error } = await supabase
    .from('order_items')
    .select('id, name, added_at, late_push_notified_at, orders!inner(id, restaurant_id, status)')
    .eq('status', 'pending')
    .eq('orders.status', 'open')
    .lte('added_at', lateCutoff);
  if (error) return { sent: 0, items: 0 };

  const renotifyCutoff = Date.now() - 4 * 60 * 1000;
  const items = (lateItems || []).filter((it) => !it.late_push_notified_at || new Date(it.late_push_notified_at).getTime() < renotifyCutoff);
  if (items.length === 0) return { sent: 0, items: 0 };

  const byRestaurant = new Map();
  for (const it of items) {
    const rid = it.orders.restaurant_id;
    if (!byRestaurant.has(rid)) byRestaurant.set(rid, []);
    byRestaurant.get(rid).push(it);
  }

  let sent = 0;
  const notifiedIds = [];
  for (const [restaurantId, rows] of byRestaurant) {
    const { data: appUsers } = await supabase
      .from('app_users')
      .select('id, role_ids')
      .eq('restaurant_id', restaurantId);
    const { data: roles } = await supabase
      .from('roles')
      .select('id, is_system, permissions')
      .eq('restaurant_id', restaurantId);
    const kitchenRoleIds = new Set(
      (roles || []).filter((rl) => rl.is_system || (rl.permissions || []).includes('kitchen')).map((rl) => rl.id)
    );
    const staffUserIds = (appUsers || [])
      .filter((u) => (u.role_ids || []).some((rid) => kitchenRoleIds.has(rid)))
      .map((u) => u.id);

    if (staffUserIds.length > 0) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('*')
        .in('user_id', staffUserIds);

      const names = rows.map((r) => r.name).filter(Boolean);
      const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ' ve ' + (names.length - 3) + ' tane daha' : '');
      const payload = JSON.stringify({
        title: '⏰ Geciken sipariş',
        body: shown + ' 15 dakikayı geçti!',
        url: '/app/',
        view: 'kitchen',
        tag: 'late-kitchen-items',
      });

      await Promise.all((subs || []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (e) {
          if (e && (e.statusCode === 404 || e.statusCode === 410)) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }));
    }

    rows.forEach((r) => notifiedIds.push(r.id));
  }

  if (notifiedIds.length > 0) {
    await supabase.from('order_items').update({ late_push_notified_at: new Date().toISOString() }).in('id', notifiedIds);
  }

  return { sent, items: notifiedIds.length };
}

// Personelin Bildirim Ayarları ekranındaki "Test Bildirimi Gönder" butonuyla
// tetiklenir - cron/15 dk beklemeden, o an push aboneliği olan cihaza aninda
// bir test bildirimi gonderir. Diger dispatch fonksiyonlarinin aksine hatalari
// yutmaz, oldugu gibi dondurur - boylece "gonderildi ama gelmedi" durumunda
// gercek sebep (orn. abonelik gecersiz, VAPID hatasi) ekranda gorulebilir.
async function dispatchTestPush(supabase, userId) {
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);
  if (error) return { sent: 0, total: 0, error: error.message };
  if (!subs || subs.length === 0) return { sent: 0, total: 0, note: 'no subscriptions for this user' };

  const payload = JSON.stringify({
    title: '🔔 Test Bildirimi',
    body: 'Push bildirimleri bu cihazda çalışıyor!',
    url: '/app/',
    tag: 'test-push',
  });

  let sent = 0;
  const errors = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (e) {
      errors.push({ id: sub.id, statusCode: e && e.statusCode, message: e && e.message });
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
  return { sent, total: subs.length, errors: errors.length ? errors : undefined };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    const secret = req.headers['x-push-secret'];
    if (!PUSH_DISPATCH_SECRET || secret !== PUSH_DISPATCH_SECRET) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      res.status(200).json({ sent: 0, note: 'VAPID keys not configured' });
      return;
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const mode = (req.body && req.body.mode) || 'both';

    if (mode === 'test_push') {
      const userId = req.body && req.body.user_id;
      if (!userId) {
        res.status(400).json({ error: 'user_id required' });
        return;
      }
      const result = await dispatchTestPush(supabase, userId);
      res.status(200).json(result);
      return;
    }

    const doReadyOrders = mode === 'ready_orders_only' || mode === 'both';
    const doCustomerRequests = mode === 'customer_requests_only' || mode === 'both';
    const doLateKitchen = mode === 'late_kitchen_only' || mode === 'both';

    if (!doReadyOrders) {
      const custReqResult = doCustomerRequests ? await dispatchCustomerOrderRequests(supabase) : { sent: 0, requests: 0 };
      const lateKitchenResult = doLateKitchen ? await dispatchLateKitchenItems(supabase) : { sent: 0, items: 0 };
      res.status(200).json({ sent: 0, staff: 0, customer_requests: custReqResult, late_kitchen: lateKitchenResult });
      return;
    }

    // Hazir + odenmemis en az bir urunu olan, siparisi alan kisisi belli, hala acik siparisler.
    const { data: readyItems, error: itemsErr } = await supabase
      .from('order_items')
      .select('order_id, orders!inner(id, table_id, kind, customer_name, daily_number, created_by, status, restaurant_tables(name))')
      .eq('status', 'ready')
      .eq('paid', false)
      .eq('orders.status', 'open');

    if (itemsErr) {
      res.status(500).json({ error: itemsErr.message });
      return;
    }

    const ordersByStaff = new Map(); // created_by (user_id) -> [masa/paket etiketleri]
    const seenOrderIds = new Set();
    for (const row of (readyItems || [])) {
      const o = row.orders;
      if (!o || !o.created_by) continue;
      if (seenOrderIds.has(o.id)) continue;
      seenOrderIds.add(o.id);
      const label = o.kind === 'takeaway'
        ? ('📦 Paket' + (o.customer_name ? ' - ' + o.customer_name : ''))
        : ((o.restaurant_tables && o.restaurant_tables.name) ? o.restaurant_tables.name : 'Masa');
      if (!ordersByStaff.has(o.created_by)) ordersByStaff.set(o.created_by, []);
      ordersByStaff.get(o.created_by).push(label);
    }

    // ONEMLI: hazir siparis olmasa bile (ordersByStaff bos olsa bile) asagidaki
    // musteri siparis istegi kontrolu MUTLAKA calismali - erken bir "return"
    // burada bu ikinci kontrolu tamamen atlatan bir hataya yol acmisti (bkz.
    // git gecmisi): hazir bekleyen urun yoksa QR siparis bildirimleri hic
    // gonderilmiyordu. Bu yuzden iki kontrol de birbirinden bagimsiz calisip
    // sonunda TEK bir yanitta birlestiriliyor.
    let sent = 0;
    if (ordersByStaff.size > 0) {
      const userIds = [...ordersByStaff.keys()];
      const { data: subs, error: subsErr } = await supabase
        .from('push_subscriptions')
        .select('*')
        .in('user_id', userIds);
      if (subsErr) {
        res.status(500).json({ error: subsErr.message });
        return;
      }

      const staleIds = [];
      await Promise.all((subs || []).map(async (sub) => {
        const labels = ordersByStaff.get(sub.user_id) || [];
        if (labels.length === 0) return;
        const shown = labels.slice(0, 3).join(', ') + (labels.length > 3 ? ' ve ' + (labels.length - 3) + ' tane daha' : '');
        const payload = JSON.stringify({
          title: '🔔 Hazır sipariş bekliyor',
          body: shown,
          url: '/app/',
          view: 'order',
          tag: 'ready-orders',
        });
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (e) {
          // 404/410: abonelik artik gecerli degil (tarayici verisi silinmis,
          // bildirim izni geri alinmis vb.) - sessizce temizlenir.
          if (e && (e.statusCode === 404 || e.statusCode === 410)) {
            staleIds.push(sub.id);
          }
        }
      }));

      if (staleIds.length > 0) {
        await supabase.from('push_subscriptions').delete().in('id', staleIds);
      }
    }

    const custReqResult = doCustomerRequests ? await dispatchCustomerOrderRequests(supabase) : { sent: 0, requests: 0 };
    const lateKitchenResult = doLateKitchen ? await dispatchLateKitchenItems(supabase) : { sent: 0, items: 0 };

    res.status(200).json({ sent, staff: ordersByStaff.size, customer_requests: custReqResult, late_kitchen: lateKitchenResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
