// Site menu: one place to edit the navigation for every page.
// Edit MENU below to add, remove or rename items.
(function () {
  const BOOK_URL = 'https://calendly.com/camilazenu/creator-consciousness-discovery-call';
  const NEWSLETTER_EMBED = 'https://sanctuaryofthewild.substack.com/embed';
  // Account emails (confirm, reset password, invite) land on the homepage with a token in the URL hash.
  // Hand them to the Academy login page, which finishes the flow.
  if (/(confirmation|recovery|invite|email_change)_token=/.test(location.hash) && location.pathname !== '/academy/login') {
    location.replace('/academy/login' + location.hash);
    return;
  }
  const MENU = [
    { label: 'Book a call', href: BOOK_URL, book: true },
    { label: 'Home', href: '/' },
    { label: 'Events', href: '/events' },
    { label: 'Creator Consciousness', href: '/creator-consciousness' },
    { label: 'Creator Academy', href: '/creator-academy', tag: 'New' },
    {
      label: 'Offerings', children: [
        { label: 'Retreats: Tulum, Jan 27–31, 2027', href: 'https://www.vortexretreats.com/creator-consciousness/', external: true, note: 'Creator Immersion Retreat · opens the retreat site' },
        { label: '1:1 Coaching', href: '/offerings#coaching' },
        { label: 'Breathwork & Sound', href: '/offerings#breathwork' },
        { label: 'Brand Deals e-book', href: '/offerings#ebook' },
        { label: 'Shop', href: '/offerings#shop' },
        { label: 'All offerings', href: '/offerings' },
      ]
    },
    { label: 'About', href: '/about' },
    { label: 'Links', href: '/links' },
  ];

  function item(i) {
    if (i.children) {
      const subs = i.children.map(c =>
        `<li><a href="${c.href}"${c.external ? ' target="_blank" rel="noopener"' : ''}>${c.label}${c.external ? ' ↗' : ''}${c.note ? `<small>${c.note}</small>` : ''}</a></li>`).join('');
      return `<li><details><summary>${i.label}</summary><ul class="menu-sub">${subs}</ul></details></li>`;
    }
    if (i.book) return `<li><a href="${i.href}" data-book class="menu-book">${i.label} <span class="menu-tag">Free</span></a></li>`;
    return `<li><a href="${i.href}">${i.label}${i.tag ? `<span class="menu-tag">${i.tag}</span>` : ''}</a></li>`;
  }

  const drawer = document.createElement('div');
  drawer.className = 'menu-root';
  drawer.innerHTML = `
    <div class="menu-overlay" data-menu-close></div>
    <aside class="menu-drawer" role="dialog" aria-modal="true" aria-label="Site menu" id="site-menu">
      <button class="menu-close" type="button" aria-label="Close menu" data-menu-close>&times;</button>
      <div class="menu-brand">Camila Zenu</div>
      <ul class="menu-list">${MENU.map(item).join('')}</ul>
      <div class="menu-foot">
        <a href="${NEWSLETTER_EMBED.replace('/embed', '')}" target="_blank" rel="noopener">Newsletter: Writing from the in between</a><br>
        <a href="https://www.instagram.com/camilazenu" target="_blank" rel="noopener">Instagram</a> ·
        <a href="https://www.tiktok.com/@camilazenu" target="_blank" rel="noopener">TikTok</a> ·
        <a href="mailto:camila@camilazenu.com">Email</a>
      </div>
    </aside>`;
  document.body.appendChild(drawer);

  const btn = document.createElement('button');
  btn.className = 'menu-btn';
  btn.type = 'button';
  btn.setAttribute('aria-controls', 'site-menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span class="bars"><span></span></span><span>Menu</span>';

  // Put the button at the top-left of the existing nav bar.
  const navInner = document.querySelector('.nav-inner');
  if (navInner) {
    const logo = navInner.querySelector('.nav-logo');
    const left = document.createElement('div');
    left.className = 'nav-left';
    navInner.insertBefore(left, navInner.firstChild);
    left.appendChild(btn);
    if (logo) {
      if (logo.tagName !== 'A') {
        const a = document.createElement('a');
        a.className = logo.className; a.href = '/'; a.textContent = logo.textContent;
        logo.replaceWith(a); left.appendChild(a);
      } else { left.appendChild(logo); }
    }
  }

  const open = () => { document.body.classList.add('menu-open'); btn.setAttribute('aria-expanded', 'true'); };
  const close = () => { document.body.classList.remove('menu-open'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', open);
  document.querySelectorAll('[data-menu-close]').forEach(el => el.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));

  // ── Book a call: always in the top-right, opens Calendly over the page ──
  const navRight = document.querySelector('.nav-right');
  if (navRight && !navRight.querySelector('.nav-cta')) {
    const cta = document.createElement('a');
    cta.className = 'nav-cta'; cta.href = BOOK_URL; cta.target = '_blank'; cta.rel = 'noopener'; cta.textContent = 'Book a Call';
    navRight.appendChild(cta);
  }
  document.querySelectorAll('.nav-cta').forEach((a) => { if (/calendly\.com/.test(a.href)) a.setAttribute('data-book', ''); });

  let calendly;
  const loadCalendly = () => calendly ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://assets.calendly.com/assets/external/widget.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://assets.calendly.com/assets/external/widget.js';
    js.onload = () => resolve(window.Calendly); js.onerror = reject;
    document.head.appendChild(js);
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-book]');
    if (!a) return;
    e.preventDefault();
    close();
    const url = a.getAttribute('href') || BOOK_URL;
    loadCalendly().then((C) => C.initPopupWidget({ url })).catch(() => window.open(url, '_blank', 'noopener'));
  });

  // ── Newsletter invite: appears once after a few seconds, then stays quiet ──
  const NL_KEY = 'cz_newsletter';
  const remember = (days) => { try { localStorage.setItem(NL_KEY, String(Date.now() + days * 864e5)); } catch {} };
  const snoozed = () => { try { return Number(localStorage.getItem(NL_KEY) || 0) > Date.now(); } catch { return true; } };
  const skip = location.pathname.startsWith('/academy') || /(enrolled|welcome)=/.test(location.search);
  if (!skip && !snoozed()) {
    setTimeout(() => {
      if (document.body.classList.contains('menu-open') || document.querySelector('.calendly-overlay')) return;
      const nl = document.createElement('div');
      nl.className = 'nl-root';
      nl.innerHTML = `
        <div class="nl-overlay" data-nl-close></div>
        <div class="nl-card" role="dialog" aria-modal="true" aria-labelledby="nl-title">
          <button class="nl-x" type="button" aria-label="Close" data-nl-close>&times;</button>
          <div class="nl-kicker">Camila's letters</div>
          <h2 id="nl-title">Writing from the <em>in between</em></h2>
          <p>Stories of healing, breaking, becoming and remembering who we are. Plus first word on new cohorts, retreats and live calls.</p>
          <iframe src="${NEWSLETTER_EMBED}" title="Subscribe to Camila's newsletter" loading="lazy" scrolling="no"></iframe>
          <button class="nl-no" type="button" data-nl-close data-nl-days="14">Maybe later</button>
          <button class="nl-no" type="button" data-nl-close data-nl-days="365">I'm already subscribed</button>
        </div>`;
      document.body.appendChild(nl);
      requestAnimationFrame(() => nl.classList.add('on'));
      const shut = (days) => { remember(days); nl.classList.remove('on'); setTimeout(() => nl.remove(), 300); };
      nl.querySelectorAll('[data-nl-close]').forEach((el) => el.addEventListener('click', () => shut(Number(el.dataset.nlDays || 14))));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nl.isConnected) shut(14); });
    }, 6000);
  }
})();
