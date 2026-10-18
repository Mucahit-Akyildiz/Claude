// Sesli bildirimler için doğal Türkçe ses: istemci kısa metni gönderir, MP3
// döner. Sağlayıcı: ELEVENLABS_API_KEY varsa ElevenLabs (çok dilli model),
// yoksa Azure Speech (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION, tr-TR
// Emel/Ahmet Neural). Anahtarlar yalnızca Vercel ortam değişkeninde. Anahtar yoksa
// 503 döner ve istemci cihazın kendi sesine düşer. Oturum _session_check ile
// doğrulanır; yanıtlar tarayıcıda önbelleğe alınır (aynı cümle tekrar ücretlenmez).
const { createClient } = require('@supabase/supabase-js');

const VOICES = { emel: 'tr-TR-EmelNeural', ahmet: 'tr-TR-AhmetNeural' };
// ElevenLabs hazır sesleri (istemcideki VOICE_CLOUD_LIST ile aynı anahtarlar).
const ELEVEN_VOICES = {
  sarah: 'EXAVITQu4vr4xnSDxMaL', rachel: '21m00Tcm4TlvDq8ikWAM', charlotte: 'XB0fDUnXU5powFXDhCwa', alice: 'Xb7hH8MSUJpSbSDYk0k2',
  matilda: 'XrExE9yKIg1WjnMlVkOX', lily: 'pFZP5JQG7iQjIQuC4Bku',
  adam: 'pNInz6obpgDQGcFmaJgB', antoni: 'ErXwobaYiN019PkySvjV', daniel: 'onwK4e9ZLuTAKqWW03F9', george: 'JBFqnCBsd6RMkjVDRZzb',
  brian: 'nPczCjzI2devNBz1zQrb', callum: 'N2lVS1w4EtoT3dr4eOWO',
};
// ElevenLabs hata gövdesinden anlaşılır Türkçe açıklama.
function elevenErr(status, body) {
  let d = {}; try { d = (JSON.parse(body) || {}).detail || {}; } catch (e) {}
  const code = d.status || d.code || '', msg = d.message || (typeof d === 'string' ? d : '');
  if (/missing_permissions/.test(code + msg)) return 'API anahtarında gerekli izin yok: ' + msg;
  if (/unusual_activity/.test(code)) return 'ElevenLabs ücretsiz planı bu sunucudan gelen istekleri engelledi (olağandışı etkinlik). Ücretli plana geçmek gerekiyor.';
  if (/quota_exceeded/.test(code)) return 'ElevenLabs aylık kredi kotası doldu.';
  if (/voice_not_found|paid_plan|library/i.test(code + msg)) return 'Bu ses mevcut planla kullanılamıyor: ' + msg;
  if (status === 401) return 'ElevenLabs anahtarı geçersiz ya da yetkisiz (' + (msg || code || 401) + ')';
  return 'ElevenLabs hatası ' + status + (msg ? ': ' + msg : '');
}
const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

module.exports = async function handler(req, res) {
  const eleven = process.env.ELEVENLABS_API_KEY;
  const key = eleven || process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION || 'westeurope';
  // Hesaptaki tüm sesler (hazır sesler + ElevenLabs'ta "My Voices"a eklenenler).
  // Anahtarda "Voices: Read" izni yoksa boş döner, istemci sabit listeyi kullanır.
  if (req.method === 'GET' && eleven && req.query && req.query.voices) {
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': eleven } });
      if (!r.ok) { const t = await r.text(); res.status(200).json({ voices: [], error: elevenErr(r.status, t) }); return; }
      const j = await r.json();
      const voices = (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name, gender: (v.labels || {}).gender || '', desc: (v.labels || {}).description || (v.labels || {}).descriptive || '', category: v.category || '' }));
      res.setHeader('Cache-Control', 'private, max-age=600');
      res.status(200).json({ voices });
    } catch (e) { res.status(200).json({ voices: [], error: 'Bağlantı hatası' }); }
    return;
  }
  if (req.method === 'GET') { res.status(200).json({ enabled: !!key, provider: eleven ? 'elevenlabs' : (key ? 'azure' : null) }); return; }
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
    if (eleven) {
      // Hazır sesler (ortam değişkeniyle değiştirilebilir): kadın / erkek.
      const vid = ELEVEN_VOICES[b.voice] || (/^[A-Za-z0-9]{16,32}$/.test(String(b.voice || '')) ? b.voice : null) || (b.voice === 'ahmet' ? (process.env.ELEVENLABS_VOICE_MALE || ELEVEN_VOICES.adam) : (process.env.ELEVENLABS_VOICE_FEMALE || ELEVEN_VOICES.sarah));
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_64`, {
        method: 'POST',
        headers: { 'xi-api-key': eleven, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', language_code: 'tr', voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: Math.min(1.2, Math.max(0.7, rate)) } }),
      });
      if (!r.ok) { const t = await r.text(); console.error('elevenlabs tts', r.status, t.slice(0, 300)); res.status(502).json({ error: elevenErr(r.status, t) }); return; }
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'private, max-age=2592000');
      res.status(200).send(Buffer.from(await r.arrayBuffer()));
      return;
    }
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
