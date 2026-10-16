(() => {
  'use strict';
  const root = document.querySelector('[data-portfolio-root]');
  if (!root) return;
  const catalog = window.CJ_VIDEO_PORTFOLIO;
  const lang = () => document.body.classList.contains('lang-cn') ? 'cn' : 'en';
  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const pair = (value = {}) => typeof value === 'string' ? {en:value, cn:value} : value;
  const bi = value => { const p = pair(value); return `<span data-lang="en">${esc(p.en || p.cn || '')}</span><span data-lang="cn">${esc(p.cn || p.en || '')}</span>`; };
  const copy = value => { const p = pair(value); return p[lang()] || p.en || p.cn || ''; };
  const labels = {
    all:{en:'All work',cn:'全部作品'}, product:{en:'Product ads',cn:'带货／商品'},
    explainer:{en:'Explanations',cn:'介绍／科普'}, story:{en:'Stories',cn:'故事'},
    photos:{en:'Film stills',cn:'照片／剧照'}, watch:{en:'Watch film',cn:'播放作品'},
    open:{en:'Explore work',cn:'进入作品集'}, series:{en:'Watch the series',cn:'查看系列'},
    back:{en:'All collections',cn:'返回作品分类'}, close:{en:'Close',cn:'关闭'},
    previous:{en:'Previous episode',cn:'上一集'}, next:{en:'Next episode',cn:'下一集'},
    stillNote:{en:'Frames from the selected films.',cn:'以下是已选影片的封面剧照。'}
  };
  if (!catalog?.works?.length) {
    root.innerHTML = `<p>${bi({en:'This collection could not be loaded. Please reload the page.',cn:'作品集暂时未能载入，请重新整理页面。'})}</p><a href="ai-video.html#work">${bi(labels.back)}</a>`;
    return;
  }
  const index = items => new Map((items || []).map(item => [item.id, item]));
  const works = index(catalog.works), characters = index(catalog.characters), collections = index(catalog.collections), groups = index(catalog.groups);
  const duration = value => { const secs = Math.round(Number(value) || 0); return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2,'0')}`; };
  const image = (src, title, extra = '') => `<img src="${esc(src)}" alt="${esc(pair(title).en || '')}" data-alt-en="${esc(pair(title).en || '')}" data-alt-cn="${esc(pair(title).cn || pair(title).en || '')}" loading="lazy" decoding="async" ${extra}>`;
  const poster = work => work?.variants?.[0]?.poster || '';
  function workCard(work, episode = false) {
    const first = work.variants[0];
    return `<article class="portfolio-work" data-work-card data-work-type="${esc(work.type)}"><button class="portfolio-film" type="button" data-work-id="${esc(work.id)}"><span class="portfolio-film-art">${image(first.poster, work.title)}<span class="portfolio-film-time">${duration(first.duration)}</span><span class="portfolio-film-watch">${bi(labels.watch)}</span></span><span class="portfolio-film-copy"><span class="portfolio-film-meta">${bi(episode ? {en:'PIXEL Pet Care · English',cn:'PIXEL 知识局 · 英语'} : work.language)}</span><strong>${bi(work.title)}</strong><span class="portfolio-film-description">${bi(work.description)}</span><span class="portfolio-film-status">${bi(work.status)}</span>${work.variants.length > 1 ? `<span class="portfolio-formats">${bi({en:'Landscape + portrait editions',cn:'横屏＋竖屏版本'})}</span>` : ''}</span></button></article>`;
  }
  function updateLanguage() {
    document.querySelectorAll('[data-alt-en]').forEach(element => { element.alt = element.dataset[lang() === 'cn' ? 'altCn' : 'altEn'] || element.dataset.altEn; });
    document.querySelectorAll('[data-label-en]').forEach(element => { element.setAttribute('aria-label',element.dataset[lang() === 'cn' ? 'labelCn' : 'labelEn']); });
    if (viewTitle) document.title = `${copy(viewTitle)} | CJ Chan`;
    updatePlayerCopy();
  }
  const home = document.body.classList.contains('portfolio-home');
  let viewTitle = null;
  const episodeIds = collections.get('pixel-knowledge')?.workIds || [];
  let visibleWorkIds = [], activeCategory = 'all', mediaView = 'films';
  const unique = ids => [...new Set(ids)].filter(id => works.has(id));
  const characterWorks = character => unique([...(character.seriesIds || []).flatMap(id => collections.get(id)?.workIds || []),...(character.workIds || [])]);
  const filters = new Map();
  filters.set('all',{title:labels.all,description:{en:'Every selected film, ready to play. Choose a category to narrow the view.',cn:'所有已选影片直接展示，点击左侧分类即可筛选。'},workIds:catalog.works.map(work => work.id)});
  characters.forEach(character => filters.set(`character:${character.id}`,{...character,workIds:characterWorks(character)}));
  groups.forEach(group => filters.set(`category:${group.id}`,{...group,workIds:unique([...(group.workIds || []),...(group.characterIds || []).flatMap(id => filters.get(`character:${id}`)?.workIds || [])])}));
  collections.forEach(series => filters.set(`series:${series.id}`,series));
  function categoryButton(key, nested = false) {
    const filter = filters.get(key);
    return `<button type="button" class="portfolio-category${nested ? ' portfolio-category-child' : ''}" data-portfolio-category="${esc(key)}" aria-pressed="false"><span>${bi(filter.title)}</span><span class="portfolio-category-count">${filter.workIds.length}</span></button>`;
  }
  function routeCategory() {
    const query = new URLSearchParams(location.search);
    const selected = ['character','series','category'].filter(key => query.has(key));
    if (!selected.length) return 'all';
    if (selected.length !== 1) return null;
    const key = `${selected[0]}:${query.get(selected[0])}`;
    return filters.has(key) ? key : null;
  }
  function syncRoute(key) {
    const url = new URL(location.href);
    ['character','series','category'].forEach(name => url.searchParams.delete(name));
    if (key !== 'all') { const [name,id] = key.split(':'); url.searchParams.set(name,id); }
    if (home) url.hash = 'work';
    if (url.href !== location.href) history.pushState(null,'',url.pathname+url.search+url.hash);
  }
  function applyCategory(key, changeRoute = false) {
    const selected = filters.get(key);
    if (!selected) return;
    activeCategory = key; visibleWorkIds = selected.workIds;
    if (!home) viewTitle = selected.title;
    root.querySelectorAll('[data-portfolio-category]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.portfolioCategory === key)));
    root.querySelector('[data-results-title]').innerHTML = bi(selected.title);
    root.querySelector('[data-results-description]').innerHTML = bi(selected.description);
    root.querySelector('[data-results-count]').innerHTML = bi({en:`${visibleWorkIds.length} films`,cn:`${visibleWorkIds.length} 支影片`});
    root.querySelector('[data-knowledge-note]').hidden = key !== 'series:pixel-knowledge';
    root.querySelector('[data-history-note]').hidden = key !== 'series:honor';
    const allowed = new Set(visibleWorkIds);
    root.querySelectorAll('[data-work-card]').forEach(card => { card.hidden = !allowed.has(card.querySelector('[data-work-id]').dataset.workId); });
    root.querySelectorAll('[data-still-id]').forEach(still => { still.hidden = !allowed.has(still.dataset.stillId); });
    root.querySelector('[data-film-grid]').hidden = mediaView !== 'films';
    root.querySelector('[data-photo-panel]').hidden = mediaView !== 'photos';
    root.querySelectorAll('[data-media-view]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mediaView === mediaView)));
    if (changeRoute) {
      syncRoute(key);
      const results = root.querySelector('.portfolio-results');
      if (results.getBoundingClientRect().top < 96) results.scrollIntoView({block:'start',behavior:'instant'});
    }
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = `https://cj-chan.work${location.pathname}${location.search}`;
  }
  function renderUnavailable() {
    viewTitle = {en:'Collection not found',cn:'未找到这个作品集'};
    root.innerHTML = `<div class="portfolio-empty"><h1>${bi(viewTitle)}</h1><p>${bi({en:'Choose a character or series from the portfolio.',cn:'请从作品分类选择角色或系列。'})}</p><a class="button button-primary" href="ai-video.html#work">${bi(labels.back)}</a></div>`;
  }
  function renderBrowser() {
    const initial = routeCategory();
    if (!initial) { renderUnavailable(); return; }
    const titleTag = home ? 'h2' : 'h1';
    root.innerHTML = `<header class="portfolio-browser-heading"><p class="eyebrow">Portfolio</p><${titleTag}>${bi({en:'Films, all in one place.',cn:'影片，一起看。'})}</${titleTag}><p>${bi({en:'Browse the films below. Choose a character or series to filter.',cn:'点击分类筛选，直接播放你想看的作品。'})}</p></header><div class="portfolio-browser"><aside class="portfolio-sidebar" aria-label="Portfolio categories"><p class="portfolio-sidebar-label">${bi({en:'Browse by',cn:'作品分类'})}</p><div class="portfolio-category-list">${categoryButton('all')}<div class="portfolio-nav-section"><p>${bi({en:'Characters',cn:'角色'})}</p>${categoryButton('category:pets')}${['pixel','wangcai','xiaojin'].map(id => categoryButton(`character:${id}`,true)).join('')}${categoryButton('character:bobby')}${categoryButton('category:other')}</div><div class="portfolio-nav-section"><p>${bi({en:'Series',cn:'系列'})}</p>${categoryButton('series:pixel-knowledge')}${categoryButton('series:honor')}</div></div></aside><section class="portfolio-results" aria-labelledby="portfolio-results-title"><div class="portfolio-results-toolbar"><div><h2 id="portfolio-results-title" data-results-title></h2><p data-results-count aria-live="polite" aria-atomic="true"></p></div><div class="portfolio-view-toggle" role="group" aria-label="Media view"><button type="button" data-media-view="films" aria-pressed="true">${bi({en:'Videos',cn:'影片'})}</button><button type="button" data-media-view="photos" aria-pressed="false">${bi(labels.photos)}</button></div></div><p class="portfolio-results-description" data-results-description></p><p class="portfolio-browser-note" data-knowledge-note hidden>${bi({en:'Day 01–07 · Same presenter and voice. Each episode plays separately.',cn:'Day 01–07 · 同一女主角与声音，每集独立播放。'})}</p><p class="portfolio-browser-note" data-history-note hidden>${bi({en:'Historical advertising samples · October 2026. Offers belong to the original campaign.',cn:'历史广告样片 · 2026年10月。片中优惠属于当时活动。'})}</p><div class="portfolio-films" data-film-grid>${catalog.works.map(work => workCard(work,episodeIds.includes(work.id))).join('')}</div><section class="portfolio-stills" data-photo-panel hidden><p>${bi(labels.stillNote)}</p><div class="portfolio-stills-grid">${catalog.works.map(work => `<button type="button" class="portfolio-still" data-still-id="${esc(work.id)}">${image(poster(work),work.title)}<span>${bi(work.title)}</span></button>`).join('')}</div></section></section></div>`;
    applyCategory(initial);
  }
  renderBrowser();

  const player = document.querySelector('#collection-player');
  const video = player?.querySelector('video');
  const playerTitle = player?.querySelector('[data-player-title]');
  const playerMeta = player?.querySelector('[data-player-meta]');
  const variantControls = player?.querySelector('[data-player-variants]');
  const episodeControls = player?.querySelector('[data-player-episodes]');
  const photoDialog = document.querySelector('#collection-photo');
  let activeWork = null, activeVariant = 0, trigger = null, photoTrigger = null;
  function updatePlayerCopy() {
    if (!activeWork || !playerTitle) return;
    playerTitle.textContent = copy(activeWork.title);
    const selected = activeWork.variants[activeVariant];
    playerMeta.textContent = `${copy(activeWork.language)} · ${duration(selected.duration)} · ${copy(activeWork.status)}`;
  }
  function renderVariants() {
    if (!variantControls) return;
    variantControls.hidden = !activeWork || activeWork.variants.length < 2;
    variantControls.innerHTML = activeWork?.variants.length > 1 ? activeWork.variants.map((variant,i) => `<button type="button" data-variant-index="${i}" aria-pressed="${i === activeVariant}">${bi(variant.label)}</button>`).join('') : '';
  }
  function renderEpisodeControls() {
    if (!episodeControls) return;
    const position = activeWork ? episodeIds.indexOf(activeWork.id) : -1;
    episodeControls.hidden = position < 0;
    episodeControls.innerHTML = position < 0 ? '' : `<button type="button" data-episode-step="-1" ${position === 0 ? 'disabled' : ''}>${bi(labels.previous)}</button><span>${String(position+1).padStart(2,'0')} / 07</span><button type="button" data-episode-step="1" ${position === episodeIds.length-1 ? 'disabled' : ''}>${bi(labels.next)}</button>`;
  }
  function playVariant(index = 0) {
    if (!video || !activeWork) return;
    activeVariant = index;
    const selected = activeWork.variants[index];
    video.pause();
    video.poster = selected.poster;
    video.src = selected.src;
    video.load();
    updatePlayerCopy(); renderVariants(); renderEpisodeControls();
    const error = player.querySelector('[data-player-error]');
    if (error) error.hidden = true;
    video.play().catch(() => {});
  }
  function openWork(id, source) {
    if (!player || !video || !works.has(id)) return;
    activeWork = works.get(id); trigger = source;
    playVariant(0);
    if (!player.open) player.showModal();
    player.querySelector('[data-player-close]')?.focus();
  }
  function clearPlayback() {
    video?.pause(); video?.removeAttribute('src'); video?.removeAttribute('poster'); video?.load();
    activeWork = null;
  }
  function closePlayer() {
    clearPlayback();
    player?.close();
  }
  player?.addEventListener('cancel', clearPlayback);
  player?.addEventListener('close', () => {
    clearPlayback();
    if (trigger?.isConnected && !trigger.closest('[hidden]')) trigger.focus();
    else root.querySelector('[data-portfolio-category][aria-pressed="true"]')?.focus();
    trigger = null;
  });
  player?.querySelector('[data-player-close]')?.addEventListener('click', closePlayer);
  video?.addEventListener('error', () => { const error = player.querySelector('[data-player-error]'); if (error) error.hidden = false; });
  photoDialog?.querySelector('[data-photo-close]')?.addEventListener('click', () => photoDialog.close());
  photoDialog?.addEventListener('close', () => {
    photoDialog.querySelector('img')?.removeAttribute('src');
    if (photoTrigger?.isConnected && !photoTrigger.closest('[hidden]')) photoTrigger.focus();
    else root.querySelector('[data-portfolio-category][aria-pressed="true"]')?.focus();
    photoTrigger = null;
  });
  [player,photoDialog].filter(Boolean).forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      if (dialog === player) closePlayer(); else dialog.close();
    }
  }));
  document.addEventListener('click', event => {
    const film = event.target.closest('[data-work-id]');
    if (film) { openWork(film.dataset.workId,film); return; }
    const variant = event.target.closest('[data-variant-index]');
    if (variant && activeWork) { const i = Number(variant.dataset.variantIndex); playVariant(i); variantControls.querySelector(`[data-variant-index="${i}"]`)?.focus(); return; }
    const step = event.target.closest('[data-episode-step]');
    if (step && activeWork) {
      const next = episodeIds.indexOf(activeWork.id) + Number(step.dataset.episodeStep);
      if (next >= 0 && next < episodeIds.length) {
        activeWork = works.get(episodeIds[next]);
        trigger = root.querySelector(`[data-work-id="${activeWork.id}"]`) || trigger;
        playVariant(0);
        const nextFocus = episodeControls.querySelector(`[data-episode-step="${step.dataset.episodeStep}"]:not(:disabled)`) || episodeControls.querySelector('button:not(:disabled)') || player.querySelector('[data-player-close]');
        nextFocus?.focus();
      }
      return;
    }
    const still = event.target.closest('[data-still-id]');
    if (still && photoDialog) {
      const work = works.get(still.dataset.stillId), img = photoDialog.querySelector('img');
      photoTrigger = still; img.src = poster(work); img.dataset.altEn = pair(work.title).en; img.dataset.altCn = pair(work.title).cn; img.alt = copy(work.title);
      photoDialog.querySelector('figcaption').innerHTML = bi(work.title);
      photoDialog.showModal(); photoDialog.querySelector('[data-photo-close]')?.focus(); return;
    }
    const category = event.target.closest('[data-portfolio-category]');
    if (category) { applyCategory(category.dataset.portfolioCategory,true); updateLanguage(); return; }
    const view = event.target.closest('[data-media-view]');
    if (view) { mediaView = view.dataset.mediaView; applyCategory(activeCategory); }
  });
  window.addEventListener('popstate', () => {
    if (player?.open) closePlayer();
    if (photoDialog?.open) photoDialog.close();
    const key = routeCategory();
    if (!key || !root.querySelector('[data-portfolio-category]')) renderBrowser();
    else applyCategory(key);
    updateLanguage();
  });
  document.addEventListener('cj-language-change',updateLanguage);
  updateLanguage();
})();
