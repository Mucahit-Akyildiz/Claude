-- Zamanlanmış görev geçmişi ve HTTP yanıt kayıtları: 3 günden eskiler her gece temizlenir (tablo hiç küçülmüyordu).
create or replace function _cron_cleanup_history() returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $f$
begin
  delete from cron.job_run_details where end_time < now() - interval '3 days';
  delete from net._http_response where created < now() - interval '3 days';
end $f$;
revoke all on function _cron_cleanup_history() from public, anon, authenticated;
select cron.schedule('cleanup-cron-history', '27 2 * * *', 'select _cron_cleanup_history()');
select _cron_cleanup_history();
