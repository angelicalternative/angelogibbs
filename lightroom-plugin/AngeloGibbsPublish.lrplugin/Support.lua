--[[----------------------------------------------------------------------
Small pure-logic helpers kept separate from the Lightroom SDK glue so they
can be tested directly with a plain Lua interpreter.
------------------------------------------------------------------------]]

local Support = {}

function Support.trim(s)
  if not s then return '' end
  return (s:gsub('^%s+', ''):gsub('%s+$', ''))
end

-- Mirrors the web admin panel's safeId sanitization exactly (js/admin.js:
-- `String(p.id || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '-')`)
-- so a Publish Collection named e.g. "dama" always lines up with the
-- project of the same id, the same way the admin panel would derive its
-- own images/uploads/<id>/ folder name.
function Support.sanitizeId(name)
  local id = Support.trim(name):lower()
  id = id:gsub('[^a-z0-9_%-]', '-')
  if id == '' then id = 'project' end
  return id
end

-- A permanent, collision-proof id for a newly uploaded gallery image's
-- filename (see the "gallery images overwriting each other" fix in the
-- web admin: filenames must never depend on position/order). Prefers
-- Lightroom's own UUID generator; falls back to a time+counter combo if
-- that's ever unavailable, since Lua 5.1's math.random is not reliably
-- usable for this (its usable range is platform-dependent and can be far
-- smaller than a full 32-bit id on some systems).
local fallbackCounter = 0
function Support.randomId(uuidFn)
  if uuidFn then
    local ok, uuid = pcall(uuidFn)
    if ok and uuid and #uuid > 0 then
      return (uuid:gsub('%-', '')):sub(1, 8):lower()
    end
  end
  fallbackCounter = fallbackCounter + 1
  return string.format('%x%x', os.time(), fallbackCounter)
end

-- Finds the project matching projectId in the given projects array (as
-- decoded from data/projects.json), creating a minimal new one (matching
-- the defaults the web admin's "+ Add Project" button uses) if none
-- exists yet, then sets its image/gallery from orderedPaths (first path
-- = cover, the rest = gallery, in order). Mutates `projects` in place and
-- returns the affected project table plus whether it was newly created.
function Support.applyGalleryUpdate(projects, projectId, collectionName, orderedPaths)
  local project
  for _, p in ipairs(projects) do
    if p.id == projectId then project = p; break end
  end

  local created = false
  if not project then
    project = {
      id = projectId,
      title = collectionName,
      year = tostring(os.date('%Y')),
      group = 'editions',
      meta = '',
      tag = '',
      description = '',
      image = '',
      gradient = '#151515',
      gallery = {},
      order = #projects + 1,
      featured = true,
    }
    table.insert(projects, project)
    created = true
  end

  project.image = orderedPaths[1] or ''
  local gallery = {}
  for idx = 2, #orderedPaths do
    gallery[#gallery + 1] = orderedPaths[idx]
  end
  project.gallery = gallery

  return project, created
end

-- Strips any path in removedPaths out of every project's image/gallery
-- fields (used when Lightroom reports photos removed from a published
-- collection), so a deletion is reflected on the live site immediately
-- rather than only at the next full publish. Mutates in place; returns
-- true if anything actually changed.
function Support.removePathsFromProjects(projects, removedPaths)
  local removedSet = {}
  for _, path in ipairs(removedPaths) do
    if path and path ~= '' then removedSet[path] = true end
  end

  local changed = false
  for _, project in ipairs(projects) do
    if project.image and project.image ~= '' and removedSet[project.image] then
      project.image = ''
      changed = true
    end
    if project.gallery then
      local kept = {}
      local anyRemoved = false
      for _, g in ipairs(project.gallery) do
        if removedSet[g] then
          anyRemoved = true
        else
          kept[#kept + 1] = g
        end
      end
      if anyRemoved then
        project.gallery = kept
        changed = true
      end
    end
  end
  return changed
end

return Support
