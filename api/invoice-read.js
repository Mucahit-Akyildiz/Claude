// Mal Kabul: fatura / irsaliye fotoğrafı ya da PDF'i okunur, satırlar (ürün, miktar,
// birim, birim fiyat, KDV) yapılandırılmış JSON olarak döner. İstemci satırları
// hammaddelerle eşleştirir, kullanıcı onaylar. Oturum _session_check ile doğrulanır.
// Sağlayıcı sırası (anahtarlar yalnızca Vercel ortam değişkeninde):
//   1) Google Gemini ücretsiz kota (GEMINI_API_KEY, model GEMINI_MODEL)
//   2) Claude (ANTHROPIC_API_KEY, model CLAUDE_MODEL) - Gemini yoksa, kota dolduysa ya da okuyamazsa.
const Anthropic = require('@anthropic-ai/sdk').default;
const { createClient } = require('@supabase/supabase-js');

const MEDIA = { 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image', 'application/pdf': 'document' };
const MAX_B64 = 14 * 1024 * 1024; // ~10 MB dosya

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['supplier', 'invoice_no', 'date', 'prices_include_vat', 'lines'],
  properties: {
    supplier: { type: 'string', description: 'Satıcı firma adı, yoksa boş' },
    invoice_no: { type: 'string', description: 'Fatura / irsaliye numarası, yoksa boş' },
    date: { type: 'string', description: 'Belge tarihi YYYY-MM-DD, yoksa boş' },
    prices_include_vat: { type: 'boolean', description: 'unit_price değerleri KDV dahil mi' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantity', 'unit', 'unit_price', 'vat_rate', 'line_total'],
        properties: {
          name: { type: 'string', description: 'Belgede yazdığı haliyle ürün adı' },
          quantity: { type: 'number' },
          unit: { type: 'string', description: 'adet, kg, gram, lt, ml, koli, paket, kasa, çuval, bidon… belgede ne yazıyorsa' },
          unit_price: { type: 'number', description: '1 birimin fiyatı (TL); belgede yoksa line_total / quantity' },
          vat_rate: { type: 'number', description: 'KDV oranı yüzde (ör. 1, 10, 20); yoksa 0' },
          line_total: { type: 'number', description: 'Satır tutarı (TL), yoksa 0' },
        },
      },
    },
  },
};

const PROMPT = `Bu bir Türk restoranının tedarikçisinden gelen fatura, e-Arşiv, irsaliye ya da fiş görüntüsü.
Belgedeki her ürün satırını çıkar. Kurallar:
- Ürün adını belgede yazdığı gibi yaz (kısaltmaları açma).
- Miktarı ve birimi ayrı yaz. "5 KG" → quantity 5, unit "kg". "2 KOLİ (12'li)" → quantity 2, unit "koli (12'li)".
- unit_price: 1 birimin fiyatı. Türkçe sayı biçimine dikkat: "1.250,50" = 1250.50.
- prices_include_vat: birim fiyatlar KDV hariç yazılmışsa false (faturalarda genelde hariçtir), fişlerde genelde true.
- İskonto, kargo, ara toplam, genel toplam, KDV satırları ürün değildir; ekleme.
- Okunamayan bir değeri uydurma; emin olmadığın sayıyı 0 yaz.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST gerekli' }); return; }
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: 'Fatura okuma henüz etkin değil (sunucu anahtarı tanımlı değil).' }); return; }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { token, mime, data } = body;
  const kind = MEDIA[mime];
  if (!kind || typeof data !== 'string' || !data) { res.status(400).json({ error: 'Desteklenmeyen dosya. JPG, PNG, WEBP ya da PDF yükleyin.' }); return; }
  if (data.length > MAX_B64) { res.status(413).json({ error: 'Dosya çok büyük (en fazla ~10 MB).' }); return; }
  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error: sErr } = token ? await sb.rpc('_session_check', { p_token: String(token) }) : { error: true };
    if (sErr) { res.status(403).json({ error: 'Oturum geçersiz, yeniden giriş yapın.' }); return; }
  } catch (e) { res.status(500).json({ error: 'Oturum doğrulanamadı.' }); return; }

  // 1) Gemini ücretsiz kota
  if (process.env.GEMINI_API_KEY) {
    try {
      const out = await readWithGemini(mime, data);
      if (out && Array.isArray(out.lines)) { res.setHeader('Cache-Control', 'no-store'); res.status(200).json(Object.assign(out, { via: 'gemini' })); return; }
    } catch (e) { /* kota dolu / hata: Claude'a geç */ }
  }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: 'Okuma servisinin ücretsiz kotası doldu, biraz sonra tekrar deneyin.' }); return; }
  // 2) Claude
  const client = new Anthropic();
  const fileBlock = kind === 'image'
    ? { type: 'image', source: { type: 'base64', media_type: mime, data } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  try {
    const msg = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
    });
    if (msg.stop_reason === 'refusal') { res.status(422).json({ error: 'Belge okunamadı.' }); return; }
    const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    let out;
    try { out = JSON.parse(text); } catch (e) { res.status(502).json({ error: 'Belge okunamadı, daha net bir fotoğraf deneyin.' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(Object.assign(out, { via: 'claude' }));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) { res.status(429).json({ error: 'Çok sık deneme yapıldı, biraz sonra tekrar deneyin.' }); return; }
    if (e instanceof Anthropic.BadRequestError) { res.status(400).json({ error: 'Belge işlenemedi (dosya bozuk ya da çok büyük olabilir).' }); return; }
    if (e instanceof Anthropic.APIError) { res.status(502).json({ error: 'Okuma servisi şu an yanıt vermiyor (' + e.status + ').' }); return; }
    res.status(500).json({ error: 'Beklenmeyen hata.' });
  }
};

// Gemini REST (generateContent): görsel / PDF satır içi, yanıt JSON.
async function readWithGemini(mime, data) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 40000);
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data } }, { text: PROMPT + '\n\nYanıtı yalnızca şu JSON şemasına uyan tek bir JSON nesnesi olarak ver:\n' + JSON.stringify(SCHEMA) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
    if (!r.ok) throw new Error('gemini ' + r.status);
    const j = await r.json();
    const text = (((j.candidates || [])[0] || {}).content || {}).parts ? j.candidates[0].content.parts.map((p) => p.text || '').join('') : '';
    const out = JSON.parse(text);
    if (!out || !Array.isArray(out.lines)) throw new Error('gemini bad json');
    out.lines = out.lines.filter((l) => l && l.name).map((l) => ({ name: String(l.name), quantity: Number(l.quantity) || 0, unit: String(l.unit || ''), unit_price: Number(l.unit_price) || 0, vat_rate: Number(l.vat_rate) || 0, line_total: Number(l.line_total) || 0 }));
    return { supplier: String(out.supplier || ''), invoice_no: String(out.invoice_no || ''), date: String(out.date || ''), prices_include_vat: !!out.prices_include_vat, lines: out.lines };
  } finally { clearTimeout(t); }
}
