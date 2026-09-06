(function () {
  const grid = document.getElementById('projectsGrid');
  if (!grid) return;

  function escapeAttr(str) {
    return String(str ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  window.ProjectsData.load()
    .then((projects) => {
      if (!projects.length) {
        grid.innerHTML = '<p class="projects-empty">No projects yet.</p>';
        return;
      }
      grid.innerHTML = projects.map((p) => {
        const artStyle = p.image
          ? `background-image:url('${escapeAttr(p.image)}');background-size:cover;background-position:center;`
          : `background:${p.gradient || '#111'};`;
        return `
          <a href="project.html?id=${encodeURIComponent(p.id)}" class="project-card">
            <div class="project-art" style="${artStyle}"></div>
            <div class="project-info">
              <span class="project-tag">${p.tag || (p.group === 'external' ? 'External' : 'Edition')}</span>
              <h3>${p.title || 'Untitled'}</h3>
              <p class="meta">${p.year || ''}${p.meta ? ' · ' + p.meta : ''}</p>
            </div>
          </a>`;
      }).join('');
    })
    .catch(() => {
      grid.innerHTML = '<p class="projects-empty">Could not load projects.</p>';
    });
})();
