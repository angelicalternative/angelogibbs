(function () {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    const setOpen = (open) => {
      links.classList.toggle('open', open);
      toggle.innerHTML = open ? '&#10005;' : '&#9776;'; // X to close, hamburger to open
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Toggle menu');
    };
    toggle.addEventListener('click', () => setOpen(!links.classList.contains('open')));
    links.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => setOpen(false))
    );
  }

  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.te-nav-label').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      a.closest('.te-nav-item').classList.add('active');
    }
  });
})();
