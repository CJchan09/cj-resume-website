(() => {
  // Short loops play only while on screen, to save data on mobile.
  const clips = document.querySelectorAll('video[data-autoplay]');
  if (!('IntersectionObserver' in window)) { clips.forEach((v) => v.play().catch(() => {})); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause(); });
  }, { threshold: 0.35 });
  clips.forEach((v) => io.observe(v));
})();
