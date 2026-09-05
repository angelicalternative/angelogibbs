(function () {
  // SHA-256 of the admin password — not real security (this is a static
  // site with no server), just a deterrent against casual snooping.
  // To change the password: open a console anywhere and run
  //   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourNewPassword'))
  //     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
  // then paste the result below.
  const PASSWORD_HASH = '27808d3b1e09d545c01a59c523b5f759a8e34d83b70112a15f2f2f59cb4ae4fc';
  const SESSION_KEY = 'angelo_admin_unlocked';
  const DRAFT_KEY = 'angelo_admin_draft_v1';

  const loginGate = document.getElementById('loginGate');
  const cmsPanel = document.getElementById('cmsPanel');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

  const listView = document.getElementById('listView');
  const projectGrid = document.getElementById('projectGrid');
  const statusText = document.getElementById('statusText');
  const addProjectBtn = document.getElementById('addProjectBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const importInput = document.getElementById('importInput');
  const discardDraftBtn = document.getElementById('discardDraftBtn');

  const editorView = document.getElementById('editorView');
  const editorStatus = document.getElementById('editorStatus');
  const backToListBtn = document.getElementById('backToListBtn');
  const editorDeleteBtn = document.getElementById('editorDeleteBtn');
  const editorThumb = document.getElementById('editorThumb');
  const editorImageFile = document.getElementById('editorImageFile');
  const editorImageUrl = document.getElementById('editorImageUrl');
  const fTitle = document.getElementById('fTitle');
  const fYear = document.getElementById('fYear');
  const fGroup = document.getElementById('fGroup');
  const fTag = document.getElementById('fTag');
  const fMeta = document.getElementById('fMeta');
  const fFeatured = document.getElementById('fFeatured');
  const fDescription = document.getElementById('fDescription');
  const galleryGrid = document.getElementById('galleryGrid');
  const galleryFileInput = document.getElementById('galleryFileInput');
  const galleryFolderInput = document.getElementById('galleryFolderInput');
  const galleryEmpty = document.getElementById('galleryEmpty');
  const galleryProgress = document.getElementById('galleryProgress');

  let projects = [];
  let currentIndex = -1;
  let saveTimer = null;
  let dragFromIndex = null;

  function escapeAttr(str) {
    return String(str ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Full Lightroom exports (or any raw camera JPEGs) are often 10-30MB
  // each and multiple megapixels wide — way more than a website needs,
  // and way more than the browser's local storage can hold across a
  // whole gallery. Downscale + recompress every uploaded image so a
  // full export folder doesn't blow past storage or bloat the site.
  const MAX_DIMENSION = 1600;
  const JPEG_QUALITY = 0.82;

  function resizeImageFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read ' + file.name)); };
      img.src = url;
    });
  }

  function isImageFile(file) {
    if (file.type) return file.type.startsWith('image/');
    return /\.(jpe?g|png|webp|gif|tiff?|heic|avif)$/i.test(file.name);
  }

  // ---------- Auth ----------
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('password').value;
    const hash = await sha256Hex(pw);
    if (hash === PASSWORD_HASH) {
      sessionStorage.setItem(SESSION_KEY, '1');
      unlock();
    } else {
      loginError.hidden = false;
    }
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  function unlock() {
    loginGate.hidden = true;
    cmsPanel.hidden = false;
    logoutBtn.hidden = false;
    loadProjects();
  }

  // ---------- Data loading ----------
  function loadProjects() {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        projects = parsed.projects || [];
        setStatus(`Local draft loaded (saved ${new Date(parsed.savedAt).toLocaleString()})`);
        renderList();
        return;
      } catch (e) { /* fall through to live data */ }
    }
    window.ProjectsData.load().then((live) => {
      projects = live;
      setStatus('Loaded live data/projects.json');
      renderList();
    });
  }

  function setStatus(msg) {
    statusText.textContent = msg;
    editorStatus.textContent = msg;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      projects.forEach((p, i) => { p.order = i + 1; });
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ projects, savedAt: Date.now() }));
        setStatus(`Local draft saved ${new Date().toLocaleTimeString()}`);
      } catch (e) {
        setStatus('⚠ Browser storage is full — could not save this change locally');
        alert(
          'Browser storage is full, so this change was NOT saved to your local draft ' +
          '(it\'s still visible on screen right now, but will be lost on reload).\n\n' +
          'Click "Download Backup" now to save what you have, then remove a few gallery ' +
          'images or projects to free up room before continuing.'
        );
      }
    }, 300);
  }

  // ---------- List view ----------
  function renderList() {
    projectGrid.innerHTML = projects.map((p, i) => cardHTML(p, i)).join('');
  }

  function cardHTML(p, i) {
    const thumbBg = p.image
      ? `background-image:url('${escapeAttr(p.image)}');`
      : `background:${p.gradient || '#111'};`;
    return `
      <div class="admin-card" data-index="${i}">
        ${p.featured !== false ? '<span class="admin-card-featured">Featured</span>' : ''}
        <div class="admin-card-thumb" style="${thumbBg}"></div>
        <div class="admin-card-body">
          <span class="admin-card-tag">${p.tag || (p.group === 'external' ? 'External' : 'Edition')}</span>
          <h3 class="admin-card-title">${p.title || 'Untitled'}</h3>
          <p class="admin-card-meta">${p.year || ''}${p.meta ? ' · ' + p.meta : ''}</p>
        </div>
        <div class="admin-card-actions">
          <button type="button" class="admin-icon-btn admin-move-up" title="Move up">&uarr;</button>
          <button type="button" class="admin-icon-btn admin-move-down" title="Move down">&darr;</button>
          <button type="button" class="admin-icon-btn admin-quick-delete" title="Delete">&times;</button>
        </div>
      </div>`;
  }

  projectGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.admin-card');
    if (!card) return;
    const i = Number(card.dataset.index);

    if (e.target.classList.contains('admin-move-up')) {
      if (i > 0) { [projects[i - 1], projects[i]] = [projects[i], projects[i - 1]]; renderList(); scheduleSave(); }
      return;
    }
    if (e.target.classList.contains('admin-move-down')) {
      if (i < projects.length - 1) { [projects[i + 1], projects[i]] = [projects[i], projects[i + 1]]; renderList(); scheduleSave(); }
      return;
    }
    if (e.target.classList.contains('admin-quick-delete')) {
      if (confirm(`Delete "${projects[i].title || 'this project'}"?`)) {
        projects.splice(i, 1);
        renderList();
        scheduleSave();
      }
      return;
    }
    openEditor(i);
  });

  addProjectBtn.addEventListener('click', () => {
    projects.push({
      id: 'p' + Date.now().toString(36),
      title: 'New Project',
      year: String(new Date().getFullYear()),
      group: 'editions',
      meta: '',
      tag: '',
      description: '',
      image: '',
      gradient: '#151515',
      gallery: [],
      order: projects.length + 1,
      featured: true,
    });
    scheduleSave();
    openEditor(projects.length - 1);
  });

  downloadBtn.addEventListener('click', () => {
    projects.forEach((p, i) => { p.order = i + 1; });
    const blob = new Blob([JSON.stringify({ projects }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `angelo-projects-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.projects)) throw new Error('bad shape');
        projects = parsed.projects;
        renderList();
        scheduleSave();
        setStatus('Imported backup file');
      } catch (e) {
        alert('That file doesn\'t look like a valid projects backup.');
      }
    };
    reader.readAsText(file);
    importInput.value = '';
  });

  discardDraftBtn.addEventListener('click', () => {
    if (!confirm('Discard your local draft and reload the live data/projects.json?')) return;
    localStorage.removeItem(DRAFT_KEY);
    loadProjects();
  });

  // ---------- Editor view ----------
  function openEditor(i) {
    currentIndex = i;
    const p = projects[i];
    if (!p.gallery) p.gallery = [];

    fTitle.value = p.title || '';
    fYear.value = p.year || '';
    fGroup.value = p.group === 'external' ? 'external' : 'editions';
    fTag.value = p.tag || '';
    fMeta.value = p.meta || '';
    fFeatured.checked = p.featured !== false;
    fDescription.value = p.description || '';
    editorImageUrl.value = p.image || '';
    paintThumb(p);
    renderGallery();

    listView.hidden = true;
    editorView.hidden = false;
    window.scrollTo(0, 0);
  }

  // ---------- Gallery (per-project collage) ----------
  function renderGallery() {
    const gallery = current().gallery || [];
    galleryEmpty.hidden = gallery.length > 0;
    galleryGrid.innerHTML = gallery.map((img, i) => `
      <div class="admin-gallery-item" draggable="true" data-gindex="${i}">
        <img src="${escapeAttr(img)}" alt="" />
        <button type="button" class="admin-gallery-remove" title="Remove">&times;</button>
        <button type="button" class="admin-gallery-cover" title="Use as preview image">Set Cover</button>
      </div>`).join('');
  }

  async function addFilesToGallery(fileList) {
    const files = [...fileList].filter(isImageFile);
    if (!files.length) {
      galleryProgress.hidden = true;
      return;
    }

    if (!current().gallery) current().gallery = [];
    galleryProgress.hidden = false;

    for (let i = 0; i < files.length; i++) {
      galleryProgress.textContent = `Processing ${i + 1} of ${files.length}: ${files[i].name}`;
      try {
        const dataUrl = await resizeImageFile(files[i]);
        current().gallery.push(dataUrl);
        renderGallery();
      } catch (e) {
        console.error(e);
      }
    }

    galleryProgress.hidden = true;
    scheduleSave();
  }

  galleryFileInput.addEventListener('change', () => {
    addFilesToGallery(galleryFileInput.files);
    galleryFileInput.value = '';
  });

  galleryFolderInput.addEventListener('change', () => {
    addFilesToGallery(galleryFolderInput.files);
    galleryFolderInput.value = '';
  });

  galleryGrid.addEventListener('click', (e) => {
    const item = e.target.closest('.admin-gallery-item');
    if (!item) return;
    const i = Number(item.dataset.gindex);

    if (e.target.classList.contains('admin-gallery-remove')) {
      current().gallery.splice(i, 1);
      renderGallery();
      scheduleSave();
    } else if (e.target.classList.contains('admin-gallery-cover')) {
      current().image = current().gallery[i];
      editorImageUrl.value = current().image;
      paintThumb(current());
      scheduleSave();
    }
  });

  galleryGrid.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.admin-gallery-item');
    if (!item) return;
    dragFromIndex = Number(item.dataset.gindex);
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  galleryGrid.addEventListener('dragend', (e) => {
    const item = e.target.closest('.admin-gallery-item');
    if (item) item.classList.remove('dragging');
    dragFromIndex = null;
  });

  galleryGrid.addEventListener('dragover', (e) => { e.preventDefault(); });

  galleryGrid.addEventListener('drop', (e) => {
    e.preventDefault();
    const item = e.target.closest('.admin-gallery-item');
    if (!item || dragFromIndex === null) return;
    const toIndex = Number(item.dataset.gindex);
    if (toIndex === dragFromIndex) return;
    const gallery = current().gallery;
    const [moved] = gallery.splice(dragFromIndex, 1);
    gallery.splice(toIndex, 0, moved);
    dragFromIndex = null;
    renderGallery();
    scheduleSave();
  });

  function closeEditor() {
    currentIndex = -1;
    editorView.hidden = true;
    listView.hidden = false;
    renderList();
  }

  function paintThumb(p) {
    // Clear the shorthand first — setting `background` after `background-image`
    // wipes the image back out, since `background` is a shorthand that
    // resets all of its longhands (including background-image) when set.
    if (p.image) {
      editorThumb.style.background = '';
      editorThumb.style.backgroundImage = `url('${p.image}')`;
    } else {
      editorThumb.style.backgroundImage = 'none';
      editorThumb.style.background = p.gradient || '#111';
    }
  }

  function current() { return projects[currentIndex]; }

  backToListBtn.addEventListener('click', closeEditor);

  editorDeleteBtn.addEventListener('click', () => {
    if (currentIndex === -1) return;
    if (!confirm(`Delete "${current().title || 'this project'}"?`)) return;
    projects.splice(currentIndex, 1);
    scheduleSave();
    closeEditor();
  });

  fTitle.addEventListener('input', () => { current().title = fTitle.value; scheduleSave(); });
  fYear.addEventListener('input', () => { current().year = fYear.value; scheduleSave(); });
  fTag.addEventListener('input', () => { current().tag = fTag.value; scheduleSave(); });
  fMeta.addEventListener('input', () => { current().meta = fMeta.value; scheduleSave(); });
  fDescription.addEventListener('input', () => { current().description = fDescription.value; scheduleSave(); });
  fGroup.addEventListener('change', () => { current().group = fGroup.value; scheduleSave(); });
  fFeatured.addEventListener('change', () => { current().featured = fFeatured.checked; scheduleSave(); });

  editorImageUrl.addEventListener('input', () => {
    current().image = editorImageUrl.value;
    paintThumb(current());
    scheduleSave();
  });

  editorImageFile.addEventListener('change', async () => {
    const file = editorImageFile.files[0];
    if (!file) return;
    const dataUrl = await resizeImageFile(file);
    current().image = dataUrl;
    editorImageUrl.value = dataUrl;
    paintThumb(current());
    scheduleSave();
    editorImageFile.value = '';
  });

  // ---------- Init ----------
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    unlock();
  }
})();
