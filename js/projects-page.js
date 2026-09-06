(function () {
  const section = document.getElementById('showcase');
  if (!section) return;

  const bg = section.querySelector('.showcase-bg');
  const list = document.getElementById('showcaseList');

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

  window.ProjectsData.load()
    .then((projects) => {
      const featured = projects.filter((p) => p.featured !== false);
      if (!featured.length) { section.hidden = true; return; }

      featured.forEach((project, i) => {
        const li = document.createElement('li');
        li.className = 'showcase-item';
        li.id = project.id;

        const a = document.createElement('a');
        a.href = `project.html?id=${encodeURIComponent(project.id)}`;
        a.innerHTML = `<span class="showcase-title">${project.title}</span><span class="showcase-year">${project.year || ''}</span>`;

        li.appendChild(a);
        li.addEventListener('mouseenter', () => setActiveBg(li, project));
        list.appendChild(li);

        if (i === 0) setActiveBg(li, project);
      });
    })
    .catch(() => { section.hidden = true; });
})();
