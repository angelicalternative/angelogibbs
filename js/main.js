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

  // Keep the "Projects" flyout list in sync with the real project data
  // instead of a hand-maintained list that goes stale the moment a
  // project is added, renamed, or removed via the admin panel.
  if (window.ProjectsData) {
    document.querySelectorAll('.te-nav-item').forEach((item) => {
      const label = item.querySelector('.te-nav-label');
      const sub = item.querySelector('.te-nav-sub');
      if (!label || !sub || label.getAttribute('href') !== 'projects.html') return;
      window.ProjectsData.load()
        .then((projects) => {
          sub.innerHTML = projects
            .map((p) => `<li><a href="project.html?id=${encodeURIComponent(p.id)}">${p.id}</a></li>`)
            .join('');
        })
        .catch(() => { /* leave the static fallback list in place */ });
    });
  }
})();
