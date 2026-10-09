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
const { sendFcmNotification, getServiceAccount } = require('./_fcm');

const PUSH_DISPATCH_SECRET = process.env.PUSH_DISPATCH_SECRET;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:destek@peyktan.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// push_subscriptions hem web (VAPID/web-push) hem native Android (FCM) satirlari
// tutar - platform='android-fcm' olanlar icin _fcm.js uzerinden gonderilir,
// digerleri (platform='web') eskisi gibi web-push ile. FCM'de token artik
// gecersizse (invalidToken) statusCode'u 410'a esitliyoruz ki asagidaki 4
// cagri noktasindaki mevcut "e.statusCode === 404 || 410 ise sil" temizleme
// mantigi hic degismeden ikisinde de calissin.
// Uygulama simgesindeki sayi: kullanicinin bekleyen islerinin toplami
// (bkz. _badge_total). Ayni istekte ayni kullanici icin bir kez hesaplanir.
let SUPA_CLIENT = null;
let BADGE_CACHE = new Map();
async function badgeFor(userId) {
  if (!SUPA_CLIENT || !userId) return null;
  if (BADGE_CACHE.has(userId)) return BADGE_CACHE.get(userId);
  const p = SUPA_CLIENT.rpc('_badge_total', { p_user: userId }).then(({ data }) => (typeof data === 'number' ? data : null)).catch(() => null);
  BADGE_CACHE.set(userId, p);
  return p;
}
// Bildirim geçmişi (uygulamada Bildirimler ekranı): her kullanıcıya giden bildirim bir kez
// kaydedilir. Aynı bildirim (ör. dakikada bir tekrar eden hazır sipariş hatırlatması ya da
// aynı kullanıcının birden fazla cihazı) aynı saat içinde tek satır olur.
async function logNotification(sub, p) {
  if (!SUPA_CLIENT || !sub.user_id || !p || !p.title) return;
  const key = [p.tag || '', p.title, p.body || '', Math.floor(Date.now() / 3600000)].join('|').slice(0, 500);
  try {
    await SUPA_CLIENT.from('notification_log').upsert({
      user_id: sub.user_id, restaurant_id: sub.restaurant_id || null, title: String(p.title).slice(0, 200),
      body: p.body ? String(p.body).slice(0, 500) : null, view: p.view || null, tag: p.tag || null, dedupe_key: key,
    }, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
  } catch (e) { /* geçmiş kaydı bildirimi engellemesin */ }
}

async function sendToSub(sub, payloadObj) {
  logNotification(sub, payloadObj);
  const badge = await badgeFor(sub.user_id);
  if (badge != null) payloadObj = Object.assign({}, payloadObj, { badge });
  if (sub.platform === 'android-fcm') {
    try {
      await sendFcmNotification(sub.endpoint, Object.assign({}, payloadObj, { channel: sub.android_channel || 'default' }));
    } catch (e) {
      if (e.invalidToken) e.statusCode = 410;
      throw e;
    }
    return;
  }
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payloadObj)
  );
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
      const payload = {
        title: '📱 Onay bekleyen müşteri sipariş isteği',
        body: shown,
        url: '/app/',
        view: 'order',
        tag: 'customer-order-request',
      };

      await Promise.all((subs || []).map(async (sub) => {
        try {
          await sendToSub(sub, payload);
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
// bildirim 15. dakikada, sonra 20., 25. ... dakikalarda gider (her dakika kontrol edilir,
// order_items.late_push_milestone ile hangi kademenin bildirildigi takip edilir).
async function dispatchLateKitchenItems(supabase) {
  const lateCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: lateItems, error } = await supabase
    .from('order_items')
    .select('id, name, added_at, late_push_notified_at, late_push_milestone, orders!inner(id, restaurant_id, status)')
    .eq('status', 'pending')
    .eq('orders.status', 'open')
    .lte('added_at', lateCutoff);
  if (error) return { sent: 0, items: 0 };

  // Bildirim 15. dakikada, sonra her 5 dakikada bir (20., 25., 30. ...) gider: ürünün
  // "kademesi" = (geçen dk - 15) / 5. Bu iş her dakika çalışır; kademe ilerlediyse bildirilir.
  const now = Date.now();
  const milestoneOf = (it) => Math.floor(((now - new Date(it.added_at).getTime()) / 60000 - 15) / 5);
  const items = (lateItems || []).filter((it) => milestoneOf(it) > (it.late_push_milestone == null ? -1 : it.late_push_milestone));
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
      const maxMin = Math.max(...rows.map((r) => 15 + 5 * milestoneOf(r)));
      const payload = {
        title: '⏰ Geciken sipariş',
        body: shown + ' ' + maxMin + ' dakikayı geçti!',
        url: '/app/',
        view: 'kitchen',
        // Her hatırlatma ayrı bildirim olsun (aynı etiket öncekini sessizce değiştiriyordu).
        tag: 'late-kitchen-' + restaurantId + '-' + Math.floor(now / 60000),
      };

      await Promise.all((subs || []).map(async (sub) => {
        try {
          await sendToSub(sub, payload);
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
    // Kademe ürün bazında saklanır (aynı kademedeki ürünler tek güncellemeyle).
    const byMilestone = new Map();
    for (const it of items) {
      if (!notifiedIds.includes(it.id)) continue;
      const m = milestoneOf(it);
      if (!byMilestone.has(m)) byMilestone.set(m, []);
      byMilestone.get(m).push(it.id);
    }
    const ts = new Date().toISOString();
    await Promise.all([...byMilestone].map(([m, ids]) =>
      supabase.from('order_items').update({ late_push_notified_at: ts, late_push_milestone: m }).in('id', ids)));
  }

  return { sent, items: notifiedIds.length };
}

// Personelin Bildirim Ayarları ekranındaki "Test Bildirimi Gönder" butonuyla
// tetiklenir - cron/15 dk beklemeden, o an push aboneliği olan cihaza aninda
// bir test bildirimi gonderir. Diger dispatch fonksiyonlarinin aksine hatalari
// yutmaz, oldugu gibi dondurur - boylece "gonderildi ama gelmedi" durumunda
// gercek sebep (orn. abonelik gecersiz, VAPID hatasi) ekranda gorulebilir.
async function dispatchTestPush(supabase, userId, endpoint) {
  let query = supabase.from('push_subscriptions').select('*').eq('user_id', userId);
  // endpoint verilmişse (normal durum - client kendi abonelik uç noktasını/FCM
  // token'ını gönderir) sadece o cihaza gönderilir; aksi halde aynı kullanıcının
  // (örn. hem telefon hem tarayıcıda açık olan) TÜM cihazlarına giderdi, bu da
  // "telefondan test attım ama bildirim tarayıcıya geldi" yanılgısına yol açardı.
  if (endpoint) query = query.eq('endpoint', endpoint);
  const { data: subs, error } = await query;
  if (error) return { sent: 0, total: 0, error: error.message };
  if (!subs || subs.length === 0) return { sent: 0, total: 0, note: 'no subscriptions for this user' };

  const payload = {
    title: '🔔 Test Bildirimi',
    body: 'Push bildirimleri bu cihazda çalışıyor!',
    url: '/app/',
    tag: 'test-push',
  };

  let sent = 0;
  const errors = [];
  for (const sub of subs) {
    try {
      await sendToSub(sub, payload);
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

// Vardiya olayları (Postgres anında tetikler): 'request' -> personel
// "Vardiya Başlatma İste" dedi, onaylayabilen yöneticilere gider;
// 'approved' / 'rejected' / 'ended' -> yöneticinin kararı personelin kendisine.
async function sendToUsers(supabase, userIds, payload) {
  if (!userIds.length) return { sent: 0, total: 0 };
  const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', userIds);
  let sent = 0;
  await Promise.all((subs || []).map(async (sub) => {
    try { await sendToSub(sub, payload); sent++; } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await supabase.from('push_subscriptions').delete().eq('id', sub.id);
    }
  }));
  return { sent, total: (subs || []).length };
}
async function dispatchShiftEvent(supabase, shiftId, event) {
  const { data: shift } = await supabase
    .from('staff_shifts')
    .select('id, restaurant_id, user_id, status, app_users!staff_shifts_user_id_fkey(username)')
    .eq('id', shiftId)
    .maybeSingle();
  if (!shift) return { sent: 0, note: 'not found' };
  const name = (shift.app_users && shift.app_users.username) || 'Bir personel';
  if (event === 'request' || event === 'end_request') {
    if (event === 'request' && shift.status !== 'pending') return { sent: 0, note: 'not pending' };
    const { data: appUsers } = await supabase.from('app_users').select('id, role_ids').eq('restaurant_id', shift.restaurant_id);
    const { data: roles } = await supabase.from('roles').select('id, is_system, permissions').eq('restaurant_id', shift.restaurant_id);
    const mgrRoleIds = new Set((roles || []).filter((rl) => rl.is_system || (rl.permissions || []).includes('shifts')).map((rl) => rl.id));
    const mgrIds = (appUsers || []).filter((u) => u.id !== shift.user_id && (u.role_ids || []).some((rid) => mgrRoleIds.has(rid))).map((u) => u.id);
    return sendToUsers(supabase, mgrIds, event === 'request' ? {
      title: '🕒 Vardiya onayı bekleniyor',
      body: name + ' vardiyaya başlamak istiyor. Onaylamak için dokunun.',
      url: '/app/', view: 'settings', tag: 'shift-request-' + shift.id,
    } : {
      title: '🏁 Vardiya bitirme talebi',
      body: name + ' vardiyasını bitirmek istiyor. Onaylamak için dokunun.',
      url: '/app/', view: 'settings', tag: 'shift-request-' + shift.id,
    });
  }
  const msgs = {
    approved: ['✅ Vardiyanız başladı', 'Vardiya talebiniz onaylandı, iyi çalışmalar!'],
    rejected: ['❌ Vardiya talebi reddedildi', 'Vardiya başlatma talebiniz yönetici tarafından reddedildi.'],
    ended: ['⏹ Vardiyanız bitirildi', 'Vardiyanız yönetici tarafından sonlandırıldı.'],
    end_approved: ['✅ Vardiyanız bitti', 'Vardiya bitirme talebiniz onaylandı. İyi dinlenmeler!'],
    end_rejected: ['❌ Bitirme talebi reddedildi', 'Vardiyanız devam ediyor; bitirme talebiniz reddedildi.'],
  };
  if (!msgs[event]) return { sent: 0, note: 'unknown event' };
  return sendToUsers(supabase, [shift.user_id], { title: msgs[event][0], body: msgs[event][1], url: '/app/', tag: 'shift-' + shift.id });
}

// Uygulama ici mesaj: ozel mesaj aliciya, genel kanal mesaji gonderen haric
// isletmedeki tum aktif personele push olarak gider.
async function dispatchChatMessage(supabase, messageId) {
  const { data: msg } = await supabase
    .from('chat_messages')
    .select('id, restaurant_id, sender_id, recipient_id, group_id, body, attachment_kind, attachment_name, app_users!chat_messages_sender_id_fkey(username), chat_groups(name)')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) return { sent: 0, note: 'not found' };
  let ids;
  if (msg.group_id) {
    // Grup mesaji: gonderen haric grup uyeleri.
    const { data: members } = await supabase.from('chat_group_members').select('user_id').eq('group_id', msg.group_id);
    ids = (members || []).map((m) => m.user_id).filter((id) => id !== msg.sender_id);
  } else if (msg.recipient_id) ids = [msg.recipient_id];
  else {
    const { data: users } = await supabase.from('app_users').select('id, is_active').eq('restaurant_id', msg.restaurant_id);
    ids = (users || []).filter((u) => u.is_active !== false && u.id !== msg.sender_id).map((u) => u.id);
  }
  const from = (msg.app_users && msg.app_users.username) || 'Personel';
  const text = msg.body || (msg.attachment_kind === 'audio' ? '🎤 Sesli mesaj' : msg.attachment_kind === 'file' ? '📎 ' + (msg.attachment_name || 'Dosya') : '📷 Fotoğraf');
  const body = text.length > 140 ? text.slice(0, 137) + '...' : text;
  const where = msg.group_id ? ' · ' + ((msg.chat_groups && msg.chat_groups.name) || 'Grup') : (msg.recipient_id ? '' : ' (Genel)');
  return sendToUsers(supabase, ids, {
    title: '💬 ' + from + where, body, url: '/app/', view: 'messages',
    tag: 'chat-' + (msg.group_id ? 'g' + msg.group_id : msg.recipient_id ? msg.sender_id : 'all'),
  });
}

// Masaya oturtulmus ama hic siparis girilmemis masalar (bkz. _cron_idle_tables): siparis
// alma ('order') izni olan personele (Yonetici dahil) bildirim. Siparis bu arada girildiyse atlanir.
async function dispatchIdleTables(supabase, orderIds) {
  if (!orderIds.length) return { sent: 0 };
  const { data: orders } = await supabase.from('orders')
    .select('id, restaurant_id, status, customer_name, created_at, restaurant_tables(name)')
    .in('id', orderIds);
  let sent = 0;
  for (const o of orders || []) {
    if (o.status !== 'open') continue;
    const { count } = await supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', o.id);
    if (count) continue;
    const { data: appUsers } = await supabase.from('app_users').select('id, role_ids, is_active').eq('restaurant_id', o.restaurant_id);
    const { data: roles } = await supabase.from('roles').select('id, is_system, permissions').eq('restaurant_id', o.restaurant_id);
    const roleIds = new Set((roles || []).filter((rl) => rl.is_system || (rl.permissions || []).includes('order')).map((rl) => rl.id));
    const ids = (appUsers || []).filter((u) => u.is_active !== false && (u.role_ids || []).some((rid) => roleIds.has(rid))).map((u) => u.id);
    const mins = Math.max(1, Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000));
    const table = (o.restaurant_tables && o.restaurant_tables.name) || 'Bir masa';
    const r = await sendToUsers(supabase, ids, {
      title: '🍽️ ' + table + ': sipariş bekleniyor',
      body: (o.customer_name ? o.customer_name + ' ' : 'Müşteri ') + mins + ' dakikadır oturuyor, henüz sipariş girilmedi.',
      url: '/app/', view: 'order', tag: 'idle-table-' + o.id,
    });
    sent += (r && r.sent) || 0;
  }
  return { sent };
}

// Telsiz kanalina yeni eklenen uyelere bildirim. Sadece gercekten o kanalin
// uyesi olan kullanicilara gonderilir (govdedeki listeye korce guvenilmez).
async function dispatchRadioAdded(supabase, channelId, userIds, by) {
  const { data: ch } = await supabase.from('radio_channels').select('id, name').eq('id', channelId).maybeSingle();
  if (!ch) return { sent: 0, note: 'not found' };
  const { data: members } = await supabase.from('radio_channel_members').select('user_id').eq('channel_id', channelId);
  const want = new Set(Array.isArray(userIds) ? userIds : []);
  const ids = (members || []).map((m) => m.user_id).filter((id) => want.has(id));
  return sendToUsers(supabase, ids, {
    title: '📻 Telsiz kanalına eklendiniz',
    body: (by || 'Bir yönetici') + ' sizi ' + '"' + ch.name + '" kanalına ekledi. Bağlanmak için dokunun.',
    url: '/app/', view: 'radio', tag: 'radio-' + ch.id,
  });
}

// Masadaki QR menuden "Garson Cagir": siparis cagrisi 'order', odeme cagrisi
// 'payments' izni olan personele (Yonetici dahil) push olarak gider.
async function dispatchWaiterCall(supabase, callId) {
  const { data: call } = await supabase
    .from('waiter_calls')
    .select('id, restaurant_id, kind, status, restaurant_tables(name)')
    .eq('id', callId)
    .maybeSingle();
  if (!call || call.status !== 'pending') return { sent: 0, note: 'not pending' };
  const perm = call.kind === 'payment' ? 'payments' : 'order';
  const { data: appUsers } = await supabase.from('app_users').select('id, role_ids, is_active').eq('restaurant_id', call.restaurant_id);
  const { data: roles } = await supabase.from('roles').select('id, is_system, permissions').eq('restaurant_id', call.restaurant_id);
  const roleIds = new Set((roles || []).filter((rl) => rl.is_system || (rl.permissions || []).includes(perm)).map((rl) => rl.id));
  const ids = (appUsers || []).filter((u) => u.is_active !== false && (u.role_ids || []).some((rid) => roleIds.has(rid))).map((u) => u.id);
  const table = (call.restaurant_tables && call.restaurant_tables.name) || 'Bir masa';
  return sendToUsers(supabase, ids, call.kind === 'payment' ? {
    title: '💳 Hesap isteniyor', body: table + ' ödeme için garson çağırıyor.', url: '/app/', view: 'payments', tag: 'waiter-call-' + call.id,
  } : {
    title: '🙋 Garson çağrısı', body: table + ' sipariş vermek için garson çağırıyor.', url: '/app/', view: 'order', tag: 'waiter-call-' + call.id,
  });
}

// Gizli anahtar karsilastirmasi sabit surede yapilir (zamanlama saldirisi).
function safeEqual(a, b) {
  const crypto = require('crypto');
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

async function cleanupDeletedChatMedia(supabase) {
  const { data: rows } = await supabase.from('chat_messages').select('id, attachment')
    .not('deleted_at', 'is', null).like('attachment', 'storage:%').limit(50);
  if (!rows || !rows.length) return 0;
  await supabase.storage.from('chat-media').remove(rows.map((r) => r.attachment.slice(8)));
  await supabase.from('chat_messages').update({ attachment: null }).in('id', rows.map((r) => r.id));
  return rows.length;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    const secret = req.headers['x-push-secret'];
    if (!PUSH_DISPATCH_SECRET || !safeEqual(secret, PUSH_DISPATCH_SECRET)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if ((!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) && !getServiceAccount()) {
      res.status(200).json({ sent: 0, note: 'VAPID keys ve FCM servis hesabı yapılandırılmamış' });
      return;
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    SUPA_CLIENT = supabase; BADGE_CACHE = new Map();
    const mode = (req.body && req.body.mode) || 'both';

    if (mode === 'shift_event') {
      const shiftId = req.body && req.body.shift_id;
      if (!shiftId) { res.status(400).json({ error: 'shift_id required' }); return; }
      res.status(200).json(await dispatchShiftEvent(supabase, shiftId, req.body.event));
      return;
    }

    if (mode === 'chat_message') {
      const messageId = req.body && req.body.message_id;
      if (!messageId) { res.status(400).json({ error: 'message_id required' }); return; }
      res.status(200).json(await dispatchChatMessage(supabase, messageId));
      return;
    }

    if (mode === 'idle_tables') {
      const ids = Array.isArray(req.body && req.body.order_ids) ? req.body.order_ids.slice(0, 200) : [];
      res.status(200).json(await dispatchIdleTables(supabase, ids));
      return;
    }

    if (mode === 'radio_added') {
      const channelId = req.body && req.body.channel_id;
      if (!channelId) { res.status(400).json({ error: 'channel_id required' }); return; }
      res.status(200).json(await dispatchRadioAdded(supabase, channelId, req.body.user_ids, req.body.by));
      return;
    }

    if (mode === 'waiter_call') {
      const callId = req.body && req.body.call_id;
      if (!callId) { res.status(400).json({ error: 'call_id required' }); return; }
      res.status(200).json(await dispatchWaiterCall(supabase, callId));
      return;
    }

    if (mode === 'test_push') {
      const userId = req.body && req.body.user_id;
      if (!userId) {
        res.status(400).json({ error: 'user_id required' });
        return;
      }
      const endpoint = req.body && req.body.endpoint;
      const result = await dispatchTestPush(supabase, userId, endpoint);
      res.status(200).json(result);
      return;
    }

    // "Herkesten sil" ile silinen mesajların ekleri depodan da kaldırılır (5 dk'lık mutfak işiyle birlikte).
    if (mode === 'late_kitchen_only' || mode === 'both') {
      try { await cleanupDeletedChatMedia(supabase); } catch (e) { /* temizlik hatası bildirimleri engellemesin */ }
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
        const payload = {
          title: '🔔 Hazır sipariş bekliyor',
          body: shown,
          url: '/app/',
          view: 'order',
          tag: 'ready-orders',
        };
        try {
          await sendToSub(sub, payload);
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
