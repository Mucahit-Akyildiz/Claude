  const sb = window.supabase.createClient('https://dveybagnrgofxkqangvo.supabase.co', 'sb_publishable_7gHhsaPYOzOddFnpjntPKw_S3Mgg3V8');
  const btn = document.getElementById('delBtn');
  const msg = document.getElementById('msg');
  function show(text, cls){ msg.className = 'msg ' + cls; msg.textContent = text; }
  btn.addEventListener('click', async () => {
    const code = document.getElementById('code').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const confirmCode = document.getElementById('confirm').value.trim();
    if(!code || !username || !password){ show('İşletme kodu, kullanıcı adı ve şifre gerekli.', 'err'); return; }
    if(!confirm('Hesabınız kalıcı olarak silinecek. Emin misiniz?')) return;
    btn.disabled = true; btn.textContent = 'Siliniyor...';
    const { data, error } = await sb.rpc('delete_account_with_credentials', {
      p_code: code, p_username: username, p_password: password, p_confirm_code: confirmCode || null
    });
    btn.disabled = false; btn.textContent = 'Hesabımı Kalıcı Olarak Sil';
    if(error){ show(error.message, 'err'); return; }
    if(!data || !data.ok){ show((data && data.error) || 'Silinemedi.', 'err'); return; }
    show(data.scope === 'restaurant'
      ? 'İşletmeniz ve tüm verileri kalıcı olarak silindi.'
      : 'Kullanıcı hesabınız kalıcı olarak silindi.', 'ok');
    document.querySelectorAll('input').forEach(i => { i.value = ''; });
  });
