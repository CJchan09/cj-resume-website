(() => {
  const body = document.body;
  const KEY = 'cj-guide-unlocked-v1';
  const guide = body.dataset.guide || 'twin';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const remember = () => { try { const list = read(); if (!list.includes(guide)) localStorage.setItem(KEY, JSON.stringify([...list, guide])); } catch {} };
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);

  const unlock = (scroll) => {
    body.classList.remove('is-locked');
    body.classList.add('is-unlocked');
    if (scroll) document.querySelector('#guide')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Email link (?unlocked=1) or a previous signup on this device
  if (new URLSearchParams(location.search).get('unlocked') === '1' || read().includes(guide)) unlock(false);

  // Email gate
  const form = document.querySelector('[data-gate-form]');
  if (form) {
    const status = form.querySelector('.gate-status');
    const button = form.querySelector('button[type="submit"]');
    const endpoint = (local ? 'http://localhost:8788' : form.dataset.endpoint) + '/subscribe';
    const say = (msg, cls) => { status.textContent = msg; status.className = `gate-status ${cls || ''}`; };
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      button.disabled = true;
      say('Sending…');
      try {
        const data = Object.fromEntries(new FormData(form));
        data.guide = guide;
        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json.error || String(res.status));
        remember();
        form.reset();
        say('');
        unlock(true);
      } catch (err) {
        say(err.message && err.message.length < 120 && !/^\d+$/.test(err.message) ? err.message : 'Could not send right now. Please try again in a minute.', 'err');
      } finally {
        button.disabled = false;
      }
    });
  }

  // Copy prompt
  document.querySelectorAll('[data-copy-target]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = document.querySelector(btn.dataset.copyTarget);
      if (!target) return;
      try { await navigator.clipboard.writeText(target.textContent.trim()); btn.textContent = 'Copied'; }
      catch { const r = document.createRange(); r.selectNodeContents(target); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = 'Press Ctrl/Cmd+C'; }
      setTimeout(() => { btn.textContent = 'Copy prompt'; }, 2000);
    });
  });

  // Comparison clips: play only while visible (saves data on mobile), muted loop
  const clips = document.querySelectorAll('video[data-autoplay]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause(); });
    }, { threshold: 0.35 });
    clips.forEach((v) => io.observe(v));
  } else {
    clips.forEach((v) => v.play().catch(() => {}));
  }
})();
