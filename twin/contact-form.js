(() => {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const endpoint = local ? 'http://localhost:8788' : (form.dataset.endpoint || 'https://contact.cj-chan.work');
  const cn = () => document.body.classList.contains('lang-cn');
  const text = {
    sending: ['Sending…', '发送中…'],
    ok: ['Thanks. Your message is in. Check your inbox for a confirmation.', '谢谢，已收到你的信息，确认邮件已发到你的邮箱。'],
    err: ['Could not send. Please email cjchan1105@gmail.com directly.', '发送失败，请直接发邮件到 cjchan1105@gmail.com。'],
  };
  const say = (key, cls) => { status.textContent = text[key][cn() ? 1 : 0]; status.className = `form-status ${cls || ''}`; };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    say('sending');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      say('ok', 'ok');
    } catch {
      say('err', 'err');
    } finally {
      button.disabled = false;
    }
  });
})();
