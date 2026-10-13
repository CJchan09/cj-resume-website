(() => {
  'use strict';
  const root = document.documentElement;
  const languageKey = 'cj-site-language-v2';
  const supported = value => value === 'cn' || value === 'en';
  let language = 'en';
  try {
    const saved = sessionStorage.getItem(languageKey);
    if (supported(saved)) language = saved;
  } catch (_) { /* Language selection works without browser storage. */ }
  const requested = new URLSearchParams(location.search).get('lang');
  if (supported(requested)) language = requested;

  const features = {
    home: {
      title: { cn: '一点小计划，一位熟悉的伙伴。', en: 'A little plan. A familiar face.' },
      body: { cn: '猫咪房间旁，就是今天的习惯与待办。抚摸、喂食，或留一点时间给自己。', en: "See today's habits and tasks beside PIXEL's room. Pet the cat, share a snack or start a focus session." },
      alt: { cn: 'PIXEL 首页：猫咪房间、今日习惯、待办和专注入口', en: "PIXEL home screen with the cat's room, today's habits, tasks and a focus shortcut" }
    },
    plan: {
      title: { cn: '把习惯缩小到，今天做得到。', en: 'Make the next step small enough.' },
      body: { cn: '为习惯选好重复日、行动提示和最低行动；待办可设截止时间与提醒，再关联专注。', en: 'Choose repeat days, a cue and a minimum action for habits. Add due dates and reminders to to-dos, then link them to focus.' },
      alt: { cn: 'PIXEL 计划页：待办清单、完成勾选与新增待办表单', en: 'PIXEL plan screen with a to-do list, completion checkboxes and an add-task form' }
    },
    focus: {
      title: { cn: '不急，一次做一件事。', en: 'One thing, one bit of time.' },
      body: { cn: '自选时长，关联待办或习惯。可固定屏幕专心做事；工作需要可暂时离开，回来继续。放弃前，再确认一次。', en: 'Pick a duration and link a task or habit. Pin the screen to stay focused, leave for work when needed and continue on return. Confirm before abandoning a session.' },
      alt: { cn: 'PIXEL 0.3.1 专注页：25分钟倒计时、猫咪陪伴、暂停、固定屏幕与暂时离开按钮', en: 'PIXEL 0.3.1 focus screen with a 25-minute countdown, the cat, pause, screen pinning and temporary exit controls' }
    },
    journal: {
      title: { cn: '开心或难过，都可以留下。', en: 'Room for good days and hard ones.' },
      body: { cn: '先选心情，再添加感谢、小成功或自定义主题。调整段落顺序，慢慢写；草稿会保留，正式保存后可回看。', en: 'Choose a mood, then add gratitude, a small win or your own topic. Reorder sections and write at your pace. Drafts stay with you; saved entries can be revisited.' },
      alt: { cn: 'PIXEL 日记页：心情选择、多个主题段落、感谢与小成功内容', en: 'PIXEL journal screen with mood selection and separate gratitude and small-win sections' }
    }
  };
  let activeFeature = 'home';
  const tabs = Array.from(document.querySelectorAll('[data-feature]'));
  const image = document.getElementById('feature-image');
  const panel = document.getElementById('screen-panel');
  const title = document.getElementById('feature-title');
  const body = document.getElementById('feature-body');

  function updateFeature() {
    const feature = features[activeFeature];
    image.src = `assets/${activeFeature}.png?v=20261013`;
    image.alt = feature.alt[language];
    title.textContent = feature.title[language];
    body.textContent = feature.body[language];
    panel.setAttribute('aria-labelledby', `tab-${activeFeature}`);
    tabs.forEach(tab => {
      const selected = tab.dataset.feature === activeFeature;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
  }

  function setLanguage(next) {
    if (!supported(next)) return;
    language = next;
    root.dataset.language = next;
    root.lang = next === 'cn' ? 'zh-Hans' : 'en';
    document.title = next === 'cn' ? 'PIXEL — 把小习惯，养成好日常。| CJ Chan' : 'PIXEL — Small habits. A little company. | CJ Chan';
    document.querySelectorAll('[data-set-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.setLanguage === next));
    });
    document.querySelectorAll('[data-label-cn]').forEach(element => {
      element.setAttribute('aria-label', next === 'cn' ? element.dataset.labelCn : element.dataset.labelEn);
    });
    document.querySelectorAll('[data-alt-cn]').forEach(element => {
      element.alt = next === 'cn' ? element.dataset.altCn : element.dataset.altEn;
    });
    try { sessionStorage.setItem(languageKey, next); } catch (_) { /* Optional session preference only. */ }
    updateFeature();
  }
  document.querySelectorAll('[data-set-language]').forEach(button => {
    button.addEventListener('click', () => setLanguage(button.dataset.setLanguage));
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { activeFeature = tab.dataset.feature; updateFeature(); });
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      activeFeature = tabs[next].dataset.feature;
      updateFeature();
      tabs[next].focus();
    });
  });
  function revealLinkedFaq() {
    const target = document.getElementById(location.hash.slice(1));
    if (target?.tagName === 'DETAILS') target.open = true;
  }
  window.addEventListener('hashchange', revealLinkedFaq);
  revealLinkedFaq();
  setLanguage(language);
})();
