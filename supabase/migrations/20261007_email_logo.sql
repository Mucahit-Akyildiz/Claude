-- Tüm e-postaların üstünde Peyktan logosu (https://www.peyktan.com/assets/images/logo-email.png).
-- Tek çıkış noktası _send_email'de eklenir: rezervasyon, bekleme listesi, abonelik, fiş, fatura vb.
-- Logo dosyası sitede yayında olduktan sonra uygulanmalı.
create or replace function public._send_email(p_to text, p_subject text, p_html text)
returns boolean language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare v_key text; v_from text; v_html text;
begin
  select value into v_key from platform_settings where key='resend_api_key';
  select value into v_from from platform_settings where key='resend_from_email';
  if v_key is null then return false; end if;
  v_html := case when coalesce(p_html,'') like '%logo-email.png%' then p_html else
    '<div style="text-align:center;padding:20px 0 4px;font-family:Arial,sans-serif;">'
    || '<a href="https://www.peyktan.com" style="text-decoration:none;color:#0e8fa3;">'
    || '<img src="https://www.peyktan.com/assets/images/logo-email.png" width="64" height="79" alt="Peyktan" style="display:block;margin:0 auto 6px;border:0;">'
    || '<span style="font-size:18px;font-weight:bold;letter-spacing:.5px;color:#0e8fa3;">Peyktan</span></a></div>'
    || coalesce(p_html,'') end;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization','Bearer '||v_key,'Content-Type','application/json'),
    body := jsonb_build_object('from', coalesce(v_from,'onboarding@resend.dev'), 'to', jsonb_build_array(p_to), 'subject', p_subject, 'html', v_html));
  return true;
end $function$;
