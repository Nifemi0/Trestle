(() => {
  const path = window.location.pathname.replace(/\.html$/, '') || '/';
  document.querySelectorAll('.nav a, .foot-links a').forEach((a) => {
    const href = (a.getAttribute('href') || '').replace(/\.html$/, '');
    if (href === path || (path === '/' && href === '/')) a.classList.add('active');
  });
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
})();
