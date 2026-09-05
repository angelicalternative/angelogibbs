window.ProjectsData = (function () {
  async function load() {
    const res = await fetch('data/projects.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load projects data');
    const json = await res.json();
    return (json.projects || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return { load };
})();
