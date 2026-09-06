(function () {
  const notFoundEl = document.getElementById('projectNotFound');
  const articleEl = document.getElementById('projectArticle');
  const heroEl = document.getElementById('projectHero');
  const tagEl = document.getElementById('projectTag');
  const titleEl = document.getElementById('projectTitle');
  const metaEl = document.getElementById('projectMeta');
  const descEl = document.getElementById('projectDesc');
  const galleryEl = document.getElementById('projectGallery');
  const nextEl = document.getElementById('projectNext');
  const nextTitleEl = document.getElementById('projectNextTitle');

  function escapeAttr(str) {
    return String(str ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function showNotFound() {
    notFoundEl.hidden = false;
    articleEl.hidden = true;
  }

  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    showNotFound();
    return;
  }

  window.ProjectsData.load()
    .then((projects) => {
      const index = projects.findIndex((p) => p.id === id);
      if (index === -1) {
        showNotFound();
        return;
      }
      const p = projects[index];

      document.title = `${p.title || 'Project'} — Angelo Gibbs`;

      if (p.image) {
        heroEl.style.backgroundImage = `url("${p.image}")`;
      } else {
        heroEl.style.backgroundImage = 'none';
        heroEl.style.background = p.gradient || '#0a0a0b';
      }

      tagEl.textContent = p.tag || (p.group === 'external' ? 'External' : 'Edition');
      titleEl.textContent = p.title || '';

      metaEl.innerHTML = '';
      if (p.year) {
        const yearEl = document.createElement('span');
        yearEl.className = 'project-year';
        yearEl.textContent = p.year;
        metaEl.appendChild(yearEl);
      }
      if (p.meta) {
        if (p.year) metaEl.appendChild(document.createTextNode(' · '));
        metaEl.appendChild(document.createTextNode(p.meta));
      }

      descEl.textContent = p.description || '';

      // The cover already has its own hero placement above, so the
      // gallery only needs the additional images, not a repeat of it.
      const images = (p.gallery || []).filter(Boolean);
      galleryEl.innerHTML = images.length
        ? images.map((src) => `<img src="${src}" alt="${escapeAttr(p.title || '')}" loading="lazy" />`).join('')
        : '';

      if (projects.length > 1) {
        const next = projects[(index + 1) % projects.length];
        nextEl.href = `project.html?id=${encodeURIComponent(next.id)}`;
        nextTitleEl.textContent = next.title || '';
        nextEl.hidden = false;
      }

      notFoundEl.hidden = true;
      articleEl.hidden = false;
    })
    .catch(() => { showNotFound(); });
})();
