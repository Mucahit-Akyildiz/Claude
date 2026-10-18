// Sesli bildirimler için doğal Türkçe ses: istemci kısa metni gönderir,
// Azure Speech (tr-TR Emel/Ahmet Neural) MP3 döner. Anahtar yalnızca Vercel
// ortam değişkeninde (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION). Anahtar yoksa
// 503 döner ve istemci cihazın kendi sesine düşer. Oturum _session_check ile
// doğrulanır; yanıtlar tarayıcıda önbelleğe alınır (aynı cümle tekrar ücretlenmez).
const { createClient } = require('@supabase/supabase-js');

const VOICES = { emel: 'tr-TR-EmelNeural', ahmet: 'tr-TR-AhmetNeural' };
const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

module.exports = async function handler(req, res) {
  const key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION || 'westeurope';
  if (req.method === 'GET') { res.status(200).json({ enabled: !!key }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  if (!key) { res.status(503).json({ error: 'TTS yapılandırılmamış' }); return; }
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const text = String(b.text || '').trim().slice(0, 300);
    const voice = VOICES[b.voice] || VOICES.emel;
    const rate = Math.min(1.5, Math.max(0.7, Number(b.rate) || 1));
    if (!text || !b.token) { res.status(400).json({ error: 'Eksik bilgi' }); return; }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error: sErr } = await supabase.rpc('_session_check', { p_token: b.token });
    if (sErr) { res.status(403).json({ error: 'Yetkisiz' }); return; }
    const ssml = `<speak version="1.0" xml:lang="tr-TR"><voice name="${voice}"><prosody rate="${Math.round((rate - 1) * 100)}%">${esc(text)}</prosody></voice></speak>`;
    const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'peyktan' },
      body: ssml,
    });
    if (!r.ok) { res.status(502).json({ error: 'Ses üretilemedi (' + r.status + ')' }); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=2592000');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
};
