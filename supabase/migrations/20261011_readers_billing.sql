-- get_message_readers(p_token, p_message_id): mesajı gönderen, kimlerin gördüğünü (chat_reads) görür.
-- restaurants.billing_address / billing_city + update_billing_address(p_token, p_address, p_city);
-- get_restaurant_config.license'a billing_address / billing_city eklendi. Kart ödemesinde iyzico'ya bu adres gider.
alter table restaurants add column if not exists billing_address text, add column if not exists billing_city text;
-- (Fonksiyon gövdeleri canlıda; supabase/schema.sql otomatik dökümünde yer alır.)
