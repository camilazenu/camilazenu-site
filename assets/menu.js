// Site menu: one place to edit the navigation for every page.
// Edit MENU below to add, remove or rename items.
(function () {
  // Account emails (confirm, reset password, invite) land on the homepage with a token in the URL hash.
  // Hand them to the Academy login page, which finishes the flow.
  if (/(confirmation|recovery|invite|email_change)_token=/.test(location.hash) && location.pathname !== '/academy/login') {
    location.replace('/academy/login' + location.hash);
    return;
  }
  const MENU = [
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
        <a href="https://calendly.com/camilazenu/creator-consciousness-discovery-call" target="_blank" rel="noopener">Book a call with Camila</a><br>
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
})();
