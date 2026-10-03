const body = document.body;
const nav = document.querySelector('.site-nav');
const langButton = document.querySelector('.language-toggle');
let currentLanguage = 'en';
try {
  const savedLanguage = sessionStorage.getItem('cj-site-language-v2');
  if (savedLanguage === 'en' || savedLanguage === 'cn') currentLanguage = savedLanguage;
} catch {}

function setLanguage(language) {
  currentLanguage = language;
  body.classList.toggle('lang-cn', language === 'cn');
  document.documentElement.lang = language === 'cn' ? 'zh-Hans' : 'en';
  if (langButton) langButton.textContent = language === 'en' ? '中文' : 'EN';
  try { sessionStorage.setItem('cj-site-language-v2', language); } catch {}
  document.dispatchEvent(new Event('cj-language-change'));
}

setLanguage(currentLanguage);
langButton?.addEventListener('click', () => setLanguage(currentLanguage === 'en' ? 'cn' : 'en'));

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('visible');
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.14, rootMargin: '0px 0px -5% 0px' });

document.querySelectorAll('.reveal').forEach((element, index) => {
  element.style.setProperty('--delay', `${Math.min(index % 4, 3) * 70}ms`);
  revealObserver.observe(element);
});

function handleScroll() {
  nav?.classList.toggle('scrolled', window.scrollY > 24);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const heroImage = document.querySelector('.hero-media img');
  if (heroImage && window.scrollY < window.innerHeight) {
    heroImage.style.transform = `scale(1) translateY(${window.scrollY * 0.055}px)`;
  }
}

window.addEventListener('scroll', handleScroll, { passive: true });
window.addEventListener('load', () => {
  body.classList.add('loaded');
  handleScroll();
});

const videoDialog = document.querySelector('#portfolio-player');
const portfolioVideo = document.querySelector('#portfolio-video');
const portfolioVideoTitle = document.querySelector('#portfolio-video-title');
const portfolioVideoType = document.querySelector('#portfolio-video-type');
let videoTrigger = null;

function updatePortfolioVideoCopy() {
  if (!videoTrigger) return;
  const suffix = currentLanguage === 'cn' ? 'Cn' : 'En';
  if (portfolioVideoTitle) portfolioVideoTitle.textContent = videoTrigger.dataset[`title${suffix}`] || '';
  if (portfolioVideoType) portfolioVideoType.textContent = videoTrigger.dataset[`type${suffix}`] || '';
}

function closePortfolioVideo() {
  if (!portfolioVideo) return;
  portfolioVideo.pause();
  portfolioVideo.removeAttribute('src');
  portfolioVideo.load();
  videoTrigger?.focus();
  videoTrigger = null;
}

document.querySelectorAll('[data-video-src]').forEach((card) => {
  card.addEventListener('click', () => {
    if (!videoDialog || !portfolioVideo) return;
    videoTrigger = card;
    portfolioVideo.src = card.dataset.videoSrc;
    portfolioVideo.poster = card.dataset.poster || '';
    updatePortfolioVideoCopy();
    videoDialog.showModal();
    portfolioVideo.play().catch(() => {});
  });
});

videoDialog?.addEventListener('close', closePortfolioVideo);
videoDialog?.querySelector('[data-video-close]')?.addEventListener('click', () => videoDialog.close());
document.addEventListener('cj-language-change', () => {
  if (videoDialog?.open) updatePortfolioVideoCopy();
});

const comparisonDialog = document.querySelector('#fullpage-comparison');

function loadComparisonCaptures() {
  comparisonDialog?.querySelectorAll('[data-comparison-src]').forEach((image) => {
    if (!image.getAttribute('src')) image.src = image.dataset.comparisonSrc;
  });
}

document.querySelectorAll('[data-comparison-open]').forEach((trigger) => {
  trigger.addEventListener('click', () => {
    if (!comparisonDialog) return;
    loadComparisonCaptures();
    comparisonDialog.showModal();
  });
});

comparisonDialog?.querySelector('[data-comparison-close]')?.addEventListener('click', () => comparisonDialog.close());

const productDialog = document.querySelector('#product-dialog');
const productImage = productDialog?.querySelector('[data-product-image]');
const productPlaceholder = productDialog?.querySelector('[data-product-placeholder]');
const productKind = productDialog?.querySelector('[data-product-kind]');
const productTitle = productDialog?.querySelector('[data-product-title]');
const productStatus = productDialog?.querySelector('[data-product-status]');
const productDescription = productDialog?.querySelector('[data-product-description]');
const productPrimary = productDialog?.querySelector('[data-product-primary]');
const productSecondary = productDialog?.querySelector('[data-product-secondary]');
let productTrigger = null;

const productCases = {
  cjpos: { image: 'photos/app-cjpos.webp', alt: 'CJPOS ordering and point-of-sale product visual', kind: ['Web app', '网页 App'], title: ['CJPOS', 'CJPOS'], status: ['Public demo · browser experience', '公开 Demo · 浏览器体验'], description: ['A focused ordering and point-of-sale flow for small food businesses. The public demo is available directly from the product site.', '为小型餐饮生意设计的点单与 POS 流程。可从产品网站直接进入公开 Demo。'], primary: ['Open CJPOS', '打开 CJPOS', 'https://pos.cj-chan.work/'], secondary: ['Discuss a similar app', '讨论类似 App', 'https://wa.me/60143886862?text=Hi%20CJ%2C%20I%20want%20to%20discuss%20a%20small%20app.'] },
  'pet-fantasy': { image: 'photos/app-pet-fantasy.webp', alt: 'Pet Fantasy Friend Animal Chess screen', kind: ['PWA', 'PWA'], title: ['Pet Fantasy Friend', 'Pet Fantasy Friend'], status: ['Public demo · browser experience', '公开 Demo · 浏览器体验'], description: ['A self-growth companion app with tasks, focus sessions, reflection and collectible fantasy creatures. The preview shows its embedded Animal Chess feature.', '结合任务、专注、反思与幻想伙伴收集的自我成长 App。预览画面为内置斗兽棋功能。'], primary: ['Open demo', '打开 Demo', 'https://cjchan09.github.io/pet-fantasy-friend/'], secondary: ['Discuss a similar app', '讨论类似 App', 'https://wa.me/60143886862?text=Hi%20CJ%2C%20I%20want%20to%20discuss%20a%20small%20app.'] },
  'beauty-training': { image: 'photos/app-beauty-training.webp', alt: 'Beauty Training Demo make-up lesson screen', kind: ['Android test build', 'Android 测试版'], title: ['Beauty Training Demo', 'Beauty Training Demo'], status: ['Verified V2.6.0 APK · landing domain in progress', '已核实 V2.6.0 APK · 落地页域名处理中'], description: ['A guided make-up practice demo with step-by-step learning screens. The Android V2.6.0 test APK is available; the branded landing page will be linked after its new domain and HTTPS are verified.', '提供逐步学习画面的化妆练习 Demo。Android V2.6.0 测试 APK 已可下载；新版品牌落地页会在新域名与 HTTPS 核实后加入。'], primary: ['Download Android test APK', '下载 Android 测试 APK', 'https://github.com/CJchan09/beauty-training-demo/releases/latest/download/Beauty_Training_Demo_2.6.0_Test.apk'], secondary: ['Request launch update', '索取发布更新', 'https://wa.me/60143886862?text=Hi%20CJ%2C%20I%20want%20the%20Beauty%20Training%20Demo%20launch%20update.'] },
  flowdesk: { image: 'photos/software-flowdesk.webp', alt: 'CJ Flowdesk customer follow-up workspace', kind: ['Local software', '本机软件'], title: ['CJ Flowdesk', 'CJ Flowdesk'], status: ['Working local product · request demo', '可运行本机产品 · 预约 Demo'], description: ['A local-first workspace for customer follow-up, next actions and supervised email drafts. It is not presented as a public download or automatic sending system.', '以本机为先的客户跟进工作台，集中显示下一步与受监督的邮件草稿。它不是公开下载包，也不会自动发送讯息。'], primary: ['Request a demo', '预约 Demo', 'https://wa.me/60143886862?text=Hi%20CJ%2C%20I%20want%20to%20request%20a%20CJ%20Flowdesk%20demo.'], secondary: ['Discuss a similar system', '讨论类似系统', 'https://wa.me/60143886862?text=Hi%20CJ%2C%20I%20want%20to%20discuss%20a%20small%20app.'] },
  'sme-builder': { image: 'photos/software-sme-builder.webp', alt: 'SME Landing Page Builder editor', kind: ['Local software', '本机软件'], title: ['SME Landing Page Builder', 'SME Landing Page Builder'], status: ['Working local product · request demo', '可运行本机产品 · 预约 Demo'], description: ['A constrained editor for building a clear one-page small-business website locally, with preview and export paths. It is not a public self-serve download yet.', '让小商家在本机建立清楚单页网站的受约束编辑器，包含预览与导出流程。目前不是公开自助下载包。'], primary: ['Request a demo', '预约 Demo', 'https://wa.me/60143886862?text=Hi%20CJ%2C%20I%20want%20to%20request%20an%20SME%20Landing%20Page%20Builder%20demo.'], secondary: ['Discuss a similar system', '讨论类似系统', 'https://wa.me/60143886862?text=Hi%20CJ%2C%20I%20want%20to%20discuss%20a%20small%20app.'] },
  storyboard: { image: '', alt: '', kind: ['Local software', '本机软件'], title: ['CJ Storyboard Workflow Studio', 'CJ Storyboard Workflow Studio'], status: ['Working local product · request demo', '可运行本机产品 · 预约 Demo'], description: ['A local production workspace that connects script, storyboard, assets, video planning and review. The card intentionally uses a labelled workspace schematic until an approved UI capture is added to the source archive.', '连接剧本、分镜、素材、视频规划与审片的本机制作工作台。在已批准 UI 截图进入来源归档前，此卡刻意使用已标示的工作台示意，而不伪装成产品截图。'], primary: ['Request a demo', '预约 Demo', 'https://wa.me/60143886862?text=Hi%20CJ%2C%20I%20want%20to%20request%20a%20CJ%20Storyboard%20Workflow%20Studio%20demo.'], secondary: ['Discuss a similar system', '讨论类似系统', 'https://wa.me/60143886862?text=Hi%20CJ%2C%20I%20want%20to%20discuss%20a%20small%20app.'] }
};

function setProductAction(element, action, index) {
  if (!element || !action) return;
  element.href = action[2];
  element.textContent = action[index];
}

document.querySelectorAll('[data-product-open]').forEach((trigger) => {
  trigger.addEventListener('click', () => {
    const product = productCases[trigger.dataset.productOpen];
    if (!product || !productDialog) return;
    const index = currentLanguage === 'cn' ? 1 : 0;
    productTrigger = trigger;
    if (productImage) {
      if (product.image) { productImage.src = product.image; productImage.alt = product.alt; productImage.hidden = false; productPlaceholder.hidden = true; }
      else { productImage.removeAttribute('src'); productImage.alt = ''; productImage.hidden = true; productPlaceholder.hidden = false; }
    }
    if (productKind) productKind.textContent = product.kind[index];
    if (productTitle) productTitle.textContent = product.title[index];
    if (productStatus) productStatus.textContent = product.status[index];
    if (productDescription) productDescription.textContent = product.description[index];
    setProductAction(productPrimary, product.primary, index);
    setProductAction(productSecondary, product.secondary, index);
    productDialog.showModal();
  });
});

productDialog?.querySelector('[data-product-close]')?.addEventListener('click', () => productDialog.close());
productDialog?.addEventListener('close', () => {
  if (productImage) productImage.removeAttribute('src');
  if (productPlaceholder) productPlaceholder.hidden = true;
  productTrigger?.focus();
  productTrigger = null;
});
