(function () {
  const section = document.getElementById('showcase');
  if (!section) return;

  const bg = section.querySelector('.showcase-bg');
  const list = document.getElementById('showcaseList');

  const modal = document.getElementById('collageModal');
  const collageClose = document.getElementById('collageClose');
  const collageTag = document.getElementById('collageTag');
  const collageTitle = document.getElementById('collageTitle');
  const collageMeta = document.getElementById('collageMeta');
  const collageDesc = document.getElementById('collageDesc');
  const collageGrid = document.getElementById('collageGrid');

  function setActiveBg(li, project) {
    list.querySelectorAll('.showcase-item').forEach((el) => el.classList.remove('active'));
    li.classList.add('active');

    bg.style.opacity = 0;
    setTimeout(() => {
      if (project.image) {
        bg.style.background = '';
        bg.style.backgroundImage = `url("${project.image}")`;
        bg.style.backgroundSize = 'cover';
        bg.style.backgroundPosition = 'center';
      } else {
        bg.style.backgroundImage = 'none';
        bg.style.background = project.gradient || '#0a0a0b';
      }
      bg.style.opacity = 1;
    }, 220);
  }

  function openCollage(p) {
    collageTag.textContent = p.tag || '';
    collageTitle.textContent = p.title || '';
    collageMeta.textContent = [p.year, p.meta].filter(Boolean).join(' · ');
    collageDesc.textContent = p.description || '';

    const images = [p.image, ...(p.gallery || [])].filter(Boolean);
    collageGrid.innerHTML = images.length
      ? images.map((src) => `<img src="${src}" alt="${p.title || ''}" />`).join('')
      : '<p class="collage-empty">No images added for this project yet.</p>';

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeCollage() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  collageClose.addEventListener('click', closeCollage);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeCollage(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeCollage(); });

  window.ProjectsData.load()
    .then((projects) => {
      const featured = projects.filter((p) => p.featured !== false);
      if (!featured.length) { section.hidden = true; return; }

      featured.forEach((project, i) => {
        const li = document.createElement('li');
        li.className = 'showcase-item';
        li.id = project.id;

        const a = document.createElement('a');
        a.href = `#${project.id}`;
        a.innerHTML = `<span class="showcase-title">${project.title}</span><span class="showcase-year">${project.year || ''}</span>`;
        a.addEventListener('click', (e) => { e.preventDefault(); openCollage(project); });

        li.appendChild(a);
        li.addEventListener('mouseenter', () => setActiveBg(li, project));
        list.appendChild(li);

        if (i === 0) setActiveBg(li, project);
      });

      if (location.hash) {
        const target = document.getElementById(location.hash.slice(1));
        const match = featured.find((p) => p.id === location.hash.slice(1));
        if (target) target.scrollIntoView();
        if (match) openCollage(match);
      }
    })
    .catch(() => { section.hidden = true; });
})();
