// Entegrasyon adaptör kayıt defteri. Her sağlayıcı bir modül:
//   { kind: 'okc' | 'marketplace', label, fields: [...ayar/sır alanları],
//     sendSale?(job, conn)          -> ÖKC: satışı cihaza/servise gönder, { ok, ref, retry?, error? }
//     test?(conn)                   -> bağlantıyı dene, { ok, error? }
//     parseInbound?(req, conn)      -> pazaryeri: gelen isteği doğrula, normalize siparişler döndür
//     orderStatus?(job, conn)       -> pazaryerine sipariş durumu bildir }
// Yeni marka eklemek = bu klasöre bir dosya + aşağıdaki listeye bir satır.
const test_okc = require('./test-okc');
const test_marketplace = require('./test-marketplace');

const ADAPTERS = { okc: { test: test_okc }, marketplace: { test: test_marketplace } };

function getAdapter(kind, provider) {
  return (ADAPTERS[kind] || {})[provider] || null;
}
module.exports = { getAdapter, ADAPTERS };
