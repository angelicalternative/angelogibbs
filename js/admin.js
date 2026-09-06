(function () {
  // SHA-256 of the admin password — not real security (this is a static
  // site with no server), just a deterrent against casual snooping.
  // To change the password: open a console anywhere and run
  //   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourNewPassword'))
  //     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
  // then paste the result below.
  const PASSWORD_HASH = '27808d3b1e09d545c01a59c523b5f759a8e34d83b70112a15f2f2f59cb4ae4fc';
  const SESSION_KEY = 'angelo_admin_unlocked';

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

  const publishBtn = document.getElementById('publishBtn');
  const publishProgress = document.getElementById('publishProgress');
  const publishSettingsBtn = document.getElementById('publishSettingsBtn');
  const publishSettings = document.getElementById('publishSettings');
  const ghToken = document.getElementById('ghToken');
  const ghRepo = document.getElementById('ghRepo');
  const ghBranch = document.getElementById('ghBranch');
  const ghTokenStatus = document.getElementById('ghTokenStatus');
  const ghSaveBtn = document.getElementById('ghSaveBtn');
  const ghForgetBtn = document.getElementById('ghForgetBtn');

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

  // ---------- Local draft storage ----------
  // IndexedDB, not localStorage: localStorage caps out around 5-10MB per
  // origin, which a handful of full-res photo uploads blows straight
  // through. When that write silently failed, later actions (including
  // Publish) could end up working from a stale previously-saved draft
  // instead of what was actually on screen. IndexedDB's quota is orders
  // of magnitude larger, so a personal photo gallery never gets close to it.
  const IDB_NAME = 'angelo_admin';
  const IDB_STORE = 'drafts';
  const IDB_KEY = 'draft_v1';

  function openDraftDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGetDraft() {
    const db = await openDraftDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSetDraft(value) {
    const db = await openDraftDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbClearDraft() {
    const db = await openDraftDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------- Data loading ----------
  async function loadProjects() {
    try {
      const draft = await idbGetDraft();
      if (draft) {
        projects = draft.projects || [];
        setStatus(`Local draft loaded (saved ${new Date(draft.savedAt).toLocaleString()})`);
        renderList();
        return;
      }
    } catch (e) {
      console.error('Could not read local draft', e);
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
    saveTimer = setTimeout(async () => {
      projects.forEach((p, i) => { p.order = i + 1; });
      try {
        await idbSetDraft({ projects, savedAt: Date.now() });
        setStatus(`Local draft saved ${new Date().toLocaleTimeString()}`);
      } catch (e) {
        console.error(e);
        setStatus('⚠ Could not save this change locally');
        alert(
          'Your local draft could not be saved just now, so this change only exists on ' +
          'screen right now and will be lost on reload.\n\n' +
          'Click "Download Backup" to keep a copy, or use "Publish to Live Site" — ' +
          'publishing reads directly from what\'s on screen, not from the local draft.'
        );
      }
    }, 300);
  }

  // ---------- Publish to GitHub ----------
  const GH_TOKEN_KEY = 'angelo_admin_gh_token';
  const GH_REPO_KEY = 'angelo_admin_gh_repo';
  const GH_BRANCH_KEY = 'angelo_admin_gh_branch';
  const DEFAULT_GH_REPO = 'angelicalternative/angelogibbs';
  const DEFAULT_GH_BRANCH = 'main';
  const GH_API = 'https://api.github.com';

  function loadGhConfig() {
    return {
      token: localStorage.getItem(GH_TOKEN_KEY) || '',
      repo: localStorage.getItem(GH_REPO_KEY) || DEFAULT_GH_REPO,
      branch: localStorage.getItem(GH_BRANCH_KEY) || DEFAULT_GH_BRANCH,
    };
  }

  function refreshGhSettingsPanel() {
    const cfg = loadGhConfig();
    ghRepo.value = cfg.repo;
    ghBranch.value = cfg.branch;
    ghToken.value = '';
    ghTokenStatus.textContent = cfg.token
      ? 'A token is currently saved for this browser.'
      : 'No token saved yet — publishing will not work until you add one.';
  }

  publishSettingsBtn.addEventListener('click', () => {
    refreshGhSettingsPanel();
    publishSettings.hidden = !publishSettings.hidden;
  });

  ghSaveBtn.addEventListener('click', () => {
    if (ghToken.value.trim()) localStorage.setItem(GH_TOKEN_KEY, ghToken.value.trim());
    localStorage.setItem(GH_REPO_KEY, ghRepo.value.trim() || DEFAULT_GH_REPO);
    localStorage.setItem(GH_BRANCH_KEY, ghBranch.value.trim() || DEFAULT_GH_BRANCH);
    refreshGhSettingsPanel();
    setStatus('Publish settings saved.');
  });

  ghForgetBtn.addEventListener('click', () => {
    localStorage.removeItem(GH_TOKEN_KEY);
    refreshGhSettingsPanel();
    setStatus('GitHub token removed from this browser.');
  });

  async function ghRequest(repo, path, options = {}) {
    const cfg = loadGhConfig();
    if (!cfg.token) throw new Error('No GitHub token saved. Open Publish Settings and add one first.');
    return fetch(`${GH_API}/repos/${repo}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {}),
      },
    });
  }

  async function getFileSha(repo, path, branch) {
    const res = await ghRequest(repo, `/contents/${path}?ref=${encodeURIComponent(branch)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Could not check existing file ${path} (${res.status})`);
    const json = await res.json();
    return json.sha;
  }

  async function putFile(repo, path, base64Content, message, branch) {
    const sha = await getFileSha(repo, path, branch);
    const body = { message, content: base64Content, branch };
    if (sha) body.sha = sha;
    const res = await ghRequest(repo, `/contents/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to save ${path}: ${err.message || res.status}`);
    }
    return res.json();
  }

  function isDataUrl(str) {
    return typeof str === 'string' && str.startsWith('data:');
  }

  function dataUrlParts(dataUrl) {
    const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
    return match ? { mime: match[1], base64: match[2] } : null;
  }

  function extensionForMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'jpg';
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function uploadDataUrlImage(repo, dataUrl, basePath, branch) {
    const parts = dataUrlParts(dataUrl);
    if (!parts) return dataUrl;
    const path = `${basePath}.${extensionForMime(parts.mime)}`;
    await putFile(repo, path, parts.base64, `Add image ${path}`, branch);
    return path;
  }

  publishBtn.addEventListener('click', async () => {
    const cfg = loadGhConfig();
    if (!cfg.token) {
      alert('Add a GitHub token in Publish Settings first.');
      refreshGhSettingsPanel();
      publishSettings.hidden = false;
      return;
    }
    const totalImages = projects.reduce((n, p) => {
      const galleryCount = (p.gallery || []).filter(isDataUrl).length;
      return n + (isDataUrl(p.image) ? 1 : 0) + galleryCount;
    }, 0);
    const titles = projects.map((p) => p.title || 'Untitled').join(', ');
    const summary =
      `Publish ${projects.length} project(s) to ${cfg.repo} (${cfg.branch})?\n\n` +
      `Projects: ${titles}\n` +
      `New images to upload: ${totalImages}\n\n` +
      `Check this matches what you see in the admin panel, then confirm.`;
    if (!confirm(summary)) return;

    publishBtn.disabled = true;
    publishProgress.hidden = false;
    publishProgress.textContent = 'Preparing…';

    try {
      const working = JSON.parse(JSON.stringify(projects));
      const totalImages = working.reduce((n, p) => {
        const galleryCount = (p.gallery || []).filter(isDataUrl).length;
        return n + (isDataUrl(p.image) ? 1 : 0) + galleryCount;
      }, 0);
      let uploaded = 0;

      for (const p of working) {
        const safeId = String(p.id || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '-');

        if (isDataUrl(p.image)) {
          uploaded++;
          publishProgress.textContent = `Uploading image ${uploaded} of ${totalImages}…`;
          p.image = await uploadDataUrlImage(cfg.repo, p.image, `images/uploads/${safeId}/cover`, cfg.branch);
        }

        if (Array.isArray(p.gallery)) {
          for (let i = 0; i < p.gallery.length; i++) {
            if (isDataUrl(p.gallery[i])) {
              uploaded++;
              publishProgress.textContent = `Uploading image ${uploaded} of ${totalImages}…`;
              p.gallery[i] = await uploadDataUrlImage(cfg.repo, p.gallery[i], `images/uploads/${safeId}/gallery-${i + 1}`, cfg.branch);
            }
          }
        }
      }

      working.forEach((p, i) => { p.order = i + 1; });
      publishProgress.textContent = 'Saving data/projects.json…';
      const json = JSON.stringify({ projects: working }, null, 2);
      await putFile(cfg.repo, 'data/projects.json', utf8ToBase64(json), 'Publish project updates from admin panel', cfg.branch);

      projects = working;
      try { await idbSetDraft({ projects, savedAt: Date.now() }); } catch (e) { console.error(e); }
      renderList();
      if (currentIndex !== -1) openEditor(currentIndex);
      setStatus(`Published to ${cfg.repo} (${cfg.branch}) at ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      console.error(e);
      alert(`Publish failed: ${e.message}`);
    } finally {
      publishBtn.disabled = false;
      publishProgress.hidden = true;
    }
  });

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

  discardDraftBtn.addEventListener('click', async () => {
    if (!confirm('Discard your local draft and reload the live data/projects.json?')) return;
    try { await idbClearDraft(); } catch (e) { console.error(e); }
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
