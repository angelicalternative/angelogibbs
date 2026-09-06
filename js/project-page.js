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

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  let lightboxImages = [];
  let lightboxIndex = 0;

  function openLightbox(images, index) {
    lightboxImages = images;
    lightboxIndex = index;
    lightboxImg.src = lightboxImages[lightboxIndex];
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  function showLightboxImage(delta) {
    lightboxIndex = (lightboxIndex + delta + lightboxImages.length) % lightboxImages.length;
    lightboxImg.src = lightboxImages[lightboxIndex];
  }

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', () => showLightboxImage(-1));
  lightboxNext.addEventListener('click', () => showLightboxImage(1));
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') showLightboxImage(-1);
    else if (e.key === 'ArrowRight') showLightboxImage(1);
  });

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
      galleryEl.querySelectorAll('img').forEach((img, i) => {
        img.addEventListener('click', () => openLightbox(images, i));
      });

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
