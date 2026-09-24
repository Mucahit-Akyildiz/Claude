// Vercel serverless function: dispatch-ready-pushes
// pg_cron (Supabase) her dakika bu endpoint'i x-push-secret header'iyla
// cagirir (bkz. _cron_dispatch_ready_pushes). Hazirlanmis ama henuz
// odenmemis/teslim edilmemis siparisleri bulup, o siparisi ALAN personelin
// (orders.created_by) kayitli push aboneliklerine (push_subscriptions) Web
// Push ile bildirim gonderir - boylece uygulama/tarayici kapali olsa bile
// bildirim ulasir. VAPID anahtarlari ve sifreleme burada (web-push paketi),
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

    res.status(200).json({ sent, staff: ordersByStaff.size });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
