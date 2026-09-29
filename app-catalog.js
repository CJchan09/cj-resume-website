(() => {
  'use strict';
  const root = document.documentElement;
  const search = document.querySelector('#app-search');
  const rows = [...document.querySelectorAll('.app-row')];
  const filters = [...document.querySelectorAll('[data-filter]')];
  const empty = document.querySelector('.empty-state');
  const count = document.querySelector('#result-count');
  let category = 'all';
  let language = 'cn';
  try { const saved = localStorage.getItem('cj-language'); if (saved === 'en' || saved === 'cn') language = saved; } catch {}
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase().trim();
  function filterApps() {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const row of rows) {
      const match = (category === 'all' || row.dataset.category === category) && terms.every(term => normalize(row.dataset.search).includes(term));
      row.hidden = !match;
      if (match) visible++;
    }
    empty.hidden = visible !== 0;
    count.textContent = language === 'cn' ? '显示 ' + visible + ' 个应用，共 ' + rows.length + ' 个。' : visible + ' of ' + rows.length + ' apps shown.';
  }
  function setLanguage(next) {
    language = next;
    root.dataset.language = next;
    root.lang = next === 'cn' ? 'zh-Hans' : 'en';
    document.querySelectorAll('[data-set-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.setLanguage === next)));
    document.querySelectorAll('[data-label-cn]').forEach(element => element.setAttribute('aria-label', next === 'cn' ? element.dataset.labelCn : element.dataset.labelEn));
    search.placeholder = next === 'cn' ? search.dataset.placeholderCn : search.dataset.placeholderEn;
    document.title = next === 'cn' ? '应用 | CJ Chan' : 'Apps | CJ Chan';
    try { localStorage.setItem('cj-language', next); } catch {}
    filterApps();
  }
  document.querySelectorAll('[data-set-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.setLanguage)));
  filters.forEach(button => button.addEventListener('click', () => {
    category = button.dataset.filter;
    filters.forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
    filterApps();
  }));
  search.addEventListener('input', filterApps);
  search.addEventListener('search', filterApps);
  document.querySelector('.reset-filters').addEventListener('click', () => {
    search.value = '';
    category = 'all';
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === 'all')));
    filterApps();
    search.focus();
  });
  setLanguage(language);
  document.querySelector('.catalog-controls').hidden = false;
})();
