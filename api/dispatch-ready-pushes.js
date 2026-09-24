// Vercel serverless function: dispatch-ready-pushes
// pg_cron (Supabase) her dakika bu endpoint'i x-push-secret header'iyla
// cagirir (bkz. _cron_dispatch_ready_pushes). Iki ayri bildirim turunu
// gonderir: (1) hazirlanmis ama henuz odenmemis/teslim edilmemis
// siparisleri bulup, o siparisi ALAN personelin (orders.created_by)
// kayitli push aboneliklerine tekrar tekrar (her calismada) hatirlatma
// gonderir; (2) QR menuden gelen, henuz onaylanmamis musteri siparis
// isteklerini bulup, siparis alma yetkisi olan TUM personele TEK SEFERLIK
// (push_notified_at ile isaretlenerek) bildirim gonderir - boylece
// personel Siparis Al ekraninda olmasa, hatta uygulama/tarayici kapali
// olsa bile QR siparisini kacirmaz. VAPID anahtarlari ve sifreleme burada
// (web-push paketi), Postgres tarafinda degil - o yuzden gercek gonderim
// mantigi bu dosyada.
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
// is_system rolu) olan personele TEK SEFERLIK push gonderir - hazir
// siparis hatirlatmasinin aksine burada tekrar tekrar gonderilmesi
// istenmiyor, bu yuzden push_notified_at ile isaretlenip bir daha
// secilmiyor (onaylanana/reddedilene kadar bile).
async function dispatchCustomerOrderRequests(supabase) {
  const { data: reqs, error: reqErr } = await supabase
    .from('customer_order_requests')
    .select('id, restaurant_id, customer_name, restaurant_tables(name)')
    .eq('status', 'pending')
    .is('push_notified_at', null);
  if (reqErr || !reqs || reqs.length === 0) return { sent: 0, requests: 0 };

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
        title: '📱 Yeni müşteri sipariş isteği',
        body: shown,
        url: '/app/',
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

    if (ordersByStaff.size === 0) {
      res.status(200).json({ sent: 0 });
      return;
    }

    const userIds = [...ordersByStaff.keys()];
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds);
    if (subsErr) {
      res.status(500).json({ error: subsErr.message });
      return;
    }

    let sent = 0;
    const staleIds = [];
    await Promise.all((subs || []).map(async (sub) => {
      const labels = ordersByStaff.get(sub.user_id) || [];
      if (labels.length === 0) return;
      const shown = labels.slice(0, 3).join(', ') + (labels.length > 3 ? ' ve ' + (labels.length - 3) + ' tane daha' : '');
      const payload = JSON.stringify({
        title: '🔔 Hazır sipariş bekliyor',
        body: shown,
        url: '/app/',
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

    const custReqResult = await dispatchCustomerOrderRequests(supabase);

    res.status(200).json({ sent, staff: ordersByStaff.size, customer_requests: custReqResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
