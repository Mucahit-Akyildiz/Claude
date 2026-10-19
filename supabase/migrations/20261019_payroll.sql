-- Puantaj & Prim: personele saatlik ücret ve prim oranı; Finansal Analiz > Puantaj & Prim raporu.
alter table public.app_users add column if not exists hourly_wage numeric, add column if not exists commission_pct numeric;
-- set_staff_pay(p_token, p_user_id, p_hourly_wage, p_commission_pct): 'reports' izni; prim %0-50.
-- get_payroll(p_token, p_date, p_date_to): kullanıcı başına çalışma saati (_shift_worked_seconds, onaylı vardiyalar),
--   vardiya sayısı, kendi aldığı hesapların cirosu/sayısı ve bahşiş.
