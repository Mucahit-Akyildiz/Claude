-- get_message_readers(p_token, p_message_id): mesajı gönderen, kimlerin gördüğünü (chat_reads) görür.
-- restaurants.billing_address / billing_city + update_billing_address(p_token, p_address, p_city);
-- get_restaurant_config.license'a billing_address / billing_city eklendi. Kart ödemesinde iyzico'ya bu adres gider.
alter table restaurants add column if not exists billing_address text, add column if not exists billing_city text;
-- (Fonksiyon gövdeleri canlıda; supabase/schema.sql otomatik dökümünde yer alır.)

-- Grup ve Genel sohbette her üye herhangi bir mesajın "Görenler" listesini görebilir;
-- birebir mesajda yalnızca gönderen görür (get_message_readers içindeki yetki kontrolü
-- canlıda pg_get_functiondef + replace ile güncellendi):
--   if m.sender_id <> s.user_id then
--     if m.group_id is not null then (üye değilse hata)
--     elsif m.recipient_id is not null then (hata) end if;
--   end if;
