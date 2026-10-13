/* Page-local interactions. Shared language behaviour remains in site.js. */
(() => {
  const tabs = [...document.querySelectorAll('.interior-option[role="tab"]')];
  const tablist = document.querySelector('.interior-options');
  const compact = window.matchMedia('(max-width: 900px)');
  function setOrientation() {
    tablist?.setAttribute('aria-orientation', compact.matches ? 'horizontal' : 'vertical');
  }
  setOrientation();
  compact.addEventListener('change', setOrientation);
  function selectTab(tab, focus = false) {
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(item.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      let next = index;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[next], true);
    });
  });

  const dialog = document.getElementById('interior-lightbox');
  const image = dialog?.querySelector('[data-lightbox-image]');
  const caption = document.getElementById('interior-lightbox-caption');
  const closeButton = dialog?.querySelector('[data-lightbox-close]');
  const zoomButton = dialog?.querySelector('[data-lightbox-zoom]');
  const error = dialog?.querySelector('.interior-lightbox-error');
  const scrollArea = dialog?.querySelector('.interior-lightbox-scroll');
  let trigger = null;
  let savedScrollY = 0;
  let previousPadding = '';
  const isChinese = () => document.documentElement.lang === 'zh-Hans';

  function updateCaption() {
    if (!trigger || !caption || !image) return;
    caption.textContent = isChinese() ? trigger.dataset.captionCn : trigger.dataset.captionEn;
    image.alt = caption.textContent;
  }
  function updateZoomLabel() {
    if (!zoomButton) return;
    const zoomed = zoomButton.getAttribute('aria-pressed') === 'true';
    zoomButton.textContent = isChinese() ? (zoomed ? '适合窗口' : '放大细看') : (zoomed ? 'Fit image' : 'Zoom in');
  }
  function updateLanguage() {
    document.querySelectorAll('[data-label-en]').forEach((button) => {
      button.setAttribute('aria-label', isChinese() ? button.dataset.labelCn : button.dataset.labelEn);
      const thumbnail = button.querySelector('img');
      if (thumbnail) thumbnail.alt = isChinese() ? button.dataset.captionCn : button.dataset.captionEn;
    });
    document.querySelector('.language-toggle')?.setAttribute('aria-label', isChinese() ? 'Switch to English' : '切换至华语');
    document.querySelector('.site-nav')?.setAttribute('aria-label', isChinese() ? '主导航' : 'Main navigation');
    tablist?.setAttribute('aria-label', isChinese() ? '衣柜外观方案' : 'Wardrobe visual alternatives');
    scrollArea?.setAttribute('aria-label', isChinese() ? '图片查看。放大后可滚动查看完整细节。' : 'Image view. Zoom in, then scroll to inspect the detail.');
    updateZoomLabel();
    if (dialog?.open) updateCaption();
  }

  document.querySelectorAll('[data-preview-src]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!dialog || !image || typeof dialog.showModal !== 'function') {
        window.open(button.dataset.previewSrc, '_blank', 'noopener');
        return;
      }
      trigger = button;
      savedScrollY = window.scrollY;
      previousPadding = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.classList.add('lightbox-open');
      image.hidden = false;
      image.classList.remove('zoomed');
      if (error) error.hidden = true;
      zoomButton?.setAttribute('aria-pressed', 'false');
      updateZoomLabel();
      image.src = button.dataset.previewSrc;
      updateCaption();
      dialog.showModal();
      if (scrollArea) { scrollArea.scrollTop = 0; scrollArea.scrollLeft = 0; }
      closeButton?.focus();
    });
  });
  image?.addEventListener('error', () => {
    if (!dialog?.open) return;
    image.hidden = true;
    if (error) error.hidden = false;
  });
  zoomButton?.addEventListener('click', () => {
    const zoomed = zoomButton.getAttribute('aria-pressed') !== 'true';
    zoomButton.setAttribute('aria-pressed', String(zoomed));
    image?.classList.toggle('zoomed', zoomed);
    updateZoomLabel();
  });
  closeButton?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dialog.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), [tabindex="0"]')].filter((element) => element.getClientRects().length);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog?.addEventListener('close', () => {
    document.body.classList.remove('lightbox-open');
    document.body.style.paddingRight = previousPadding;
    if (image) image.removeAttribute('src');
    trigger?.focus({ preventScroll: true });
    const previousBehaviour = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo({ top: savedScrollY, behavior: 'auto' });
    document.documentElement.style.scrollBehavior = previousBehaviour;
    trigger = null;
  });
  document.addEventListener('cj-language-change', updateLanguage);
  updateLanguage();
})();
