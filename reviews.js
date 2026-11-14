// Share bar for each review: native share, share image (for Instagram), copy link, Facebook, LinkedIn, WhatsApp.
(() => {
  const enc = encodeURIComponent;
  const flash = (btn, en, cn) => {
    const old = btn.innerHTML;
    btn.innerHTML = `<span data-lang="en">${en}</span><span data-lang="cn">${cn}</span>`;
    setTimeout(() => { btn.innerHTML = old; }, 1800);
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {} t.remove(); return ok;
  };

  document.querySelectorAll('.review-share').forEach((bar) => {
    const url = bar.dataset.shareUrl;
    const text = bar.dataset.shareText || '';
    const image = bar.dataset.shareImage;
    const imageName = image ? image.split('/').pop() : 'review.jpg';

    const fb = bar.querySelector('[data-share="facebook"]');
    const li = bar.querySelector('[data-share="linkedin"]');
    const wa = bar.querySelector('[data-share="whatsapp"]');
    if (fb) fb.href = `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
    if (li) li.href = `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`;
    if (wa) wa.href = `https://wa.me/?text=${enc(text + ' ' + url)}`;

    const native = bar.querySelector('[data-share="native"]');
    if (native) {
      if (!navigator.share) native.hidden = true;
      native.addEventListener('click', async () => {
        try { await navigator.share({ title: document.title, text, url }); } catch {}
      });
    }

    bar.querySelector('[data-share="copy"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (await copy(url)) flash(btn, 'Link copied', '已复制链接');
    });

    bar.querySelector('[data-share="image"]')?.addEventListener('click', async () => {
      // On phones, share the image file directly (e.g. to Instagram); otherwise download it.
      try {
        const blob = await (await fetch(image)).blob();
        const file = new File([blob], imageName, { type: blob.type || 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: `${text} ${url}` });
          return;
        }
      } catch (err) { if (err && err.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = image; a.download = imageName;
      document.body.appendChild(a); a.click(); a.remove();
    });
  });
})();
