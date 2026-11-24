(() => {
  // No email gate: the whole guide is open. Visitors contact CJ only if they choose to (contact form at the bottom).

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
