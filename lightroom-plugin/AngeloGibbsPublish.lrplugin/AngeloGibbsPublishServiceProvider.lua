--[[----------------------------------------------------------------------
Publish Service provider that publishes straight from Lightroom to the
angelogibbs.com repo on GitHub, via the same Contents API the site's web
admin panel uses.

Convention: name a Publish Collection exactly like the project's id in
data/projects.json (e.g. "dama", "unbound") and it publishes into that
project. A name that matches no existing project creates a minimal new
one (same defaults as the admin panel's "+ Add Project"). Within the
collection, the FIRST photo becomes the project's cover image and the
rest become its gallery, in the collection's order.
------------------------------------------------------------------------]]

local LrDialogs = import 'LrDialogs'
local LrFileUtils = import 'LrFileUtils'
local LrView = import 'LrView'
local LrHttp = import 'LrHttp'

local Support = require 'Support'
local GitHubApi = require 'GitHubApi'
local Json = require 'Json'
local Base64 = require 'Base64'

local DEFAULT_REPO = 'angelicalternative/angelogibbs'
local DEFAULT_BRANCH = 'main'
local PROJECTS_JSON_PATH = 'data/projects.json'

local exportServiceProvider = {}

exportServiceProvider.supportsIncrementalPublish = 'only'

exportServiceProvider.exportPresetFields = {
  { key = 'githubToken', default = '' },
  { key = 'githubRepo', default = DEFAULT_REPO },
  { key = 'githubBranch', default = DEFAULT_BRANCH },
  { key = 'LR_size_doConstrain', default = true },
  { key = 'LR_size_maxWidth', default = 1600 },
  { key = 'LR_size_maxHeight', default = 1600 },
  { key = 'LR_size_resolution', default = 72 },
  { key = 'LR_size_resolutionUnits', default = 'inch' },
  { key = 'LR_jpeg_quality', default = 0.82 },
}

-- Photos are always rendered to a temp location and deleted after upload.
exportServiceProvider.hideSections = { 'exportLocation' }
exportServiceProvider.allowFileFormats = { 'JPEG' }
exportServiceProvider.allowColorSpaces = { 'sRGB' }
exportServiceProvider.hidePrintResolution = true
exportServiceProvider.canExportVideo = false

exportServiceProvider.small_icon = nil

--------------------------------------------------------------------------------
-- Publish-collection behavior

function exportServiceProvider.getCollectionBehaviorInfo(publishSettings)
  return {
    defaultCollectionName = 'unsorted',
    defaultCollectionCanBeDeleted = false,
    canAddCollection = true,
    maxCollectionSetDepth = 0,
  }
end

exportServiceProvider.titleForPublishedCollection = 'Project'
exportServiceProvider.titleForPublishedCollection_standalone = 'Project'
exportServiceProvider.titleForGoToPublishedCollection = 'disable'
exportServiceProvider.titleForGoToPublishedPhoto = 'disable'
exportServiceProvider.supportsCustomSortOrder = true

--------------------------------------------------------------------------------
-- Settings dialog

function exportServiceProvider.sectionsForTopOfDialog(f, propertyTable)
  return {
    {
      title = 'Angelo Gibbs Site',
      synopsis = 'GitHub publish settings',

      f:row {
        spacing = f:control_spacing(),
        f:static_text {
          title = 'Repository',
          alignment = 'right',
          width = LrView.share 'agp_label_width',
        },
        f:edit_field {
          fill_horizontal = 1,
          value = LrView.bind 'githubRepo',
          placeholder_string = DEFAULT_REPO,
        },
      },

      f:row {
        spacing = f:control_spacing(),
        f:static_text {
          title = 'Branch',
          alignment = 'right',
          width = LrView.share 'agp_label_width',
        },
        f:edit_field {
          fill_horizontal = 1,
          value = LrView.bind 'githubBranch',
          placeholder_string = DEFAULT_BRANCH,
        },
      },

      f:row {
        spacing = f:control_spacing(),
        f:static_text {
          title = 'GitHub token',
          alignment = 'right',
          width = LrView.share 'agp_label_width',
        },
        f:password_field {
          fill_horizontal = 1,
          value = LrView.bind 'githubToken',
        },
      },

      f:row {
        f:static_text {
          title = 'Fine-grained personal access token, scoped to just this repo with '
            .. 'Contents: Read and write. Create one at github.com -> Settings -> '
            .. 'Developer settings -> Personal access tokens.',
          fill_horizontal = 1,
          width_in_chars = 60,
          height_in_lines = 2,
        },
      },

      f:row {
        f:static_text {
          title = 'Name each Publish Collection exactly like a project id in '
            .. 'data/projects.json (e.g. "dama"), or a new name to create one. '
            .. 'First photo in the collection = cover image; the rest = gallery, '
            .. 'in order.',
          fill_horizontal = 1,
          width_in_chars = 60,
          height_in_lines = 3,
        },
      },
    },
  }
end

--------------------------------------------------------------------------------
-- Publishing

local function githubSettings(exportSettings)
  local token = Support.trim(exportSettings.githubToken)
  local repo = Support.trim(exportSettings.githubRepo)
  local branch = Support.trim(exportSettings.githubBranch)
  if repo == '' then repo = DEFAULT_REPO end
  if branch == '' then branch = DEFAULT_BRANCH end
  return token, repo, branch
end

local function newRandomId()
  local ok, LrUUID = pcall(import, 'LrUUID')
  local uuidFn = nil
  if ok and LrUUID and LrUUID.generateUUID then
    uuidFn = LrUUID.generateUUID
  end
  return Support.randomId(uuidFn)
end

-- Loads data/projects.json, applies `mutate(projects)`, and writes it back
-- if `mutate` returns true. Centralizes the read-modify-write + error
-- handling so processRenderedPhotos and deletePhotosFromPublishedCollection
-- don't duplicate it.
local function updateProjectsJson(token, repo, branch, commitMessage, mutate)
  local content, sha, err = GitHubApi.getFile(token, repo, branch, PROJECTS_JSON_PATH)
  if err then
    return false, err
  end
  local ok, data = pcall(Json.decode, content or '{"projects":[]}')
  if not ok or not data or not data.projects then
    return false, 'Could not read/parse ' .. PROJECTS_JSON_PATH .. ' from GitHub.'
  end

  local shouldWrite = mutate(data.projects)
  if not shouldWrite then
    return true, nil
  end

  local newBody = Json.encode({ projects = data.projects })
  local writeOk, writeErr = GitHubApi.putFile(
    token, repo, branch, PROJECTS_JSON_PATH, Base64.encode(newBody), commitMessage, sha)
  if not writeOk then
    return false, writeErr
  end
  return true, nil
end

function exportServiceProvider.processRenderedPhotos(functionContext, exportContext)
  local exportSession = exportContext.exportSession
  local exportSettings = assert(exportContext.propertyTable)
  local nPhotos = exportSession:countRenditions()

  local progressScope = exportContext:configureProgress {
    title = nPhotos > 1
      and string.format('Publishing %d photos to Angelo Gibbs site', nPhotos)
      or 'Publishing photo to Angelo Gibbs site',
  }

  local token, repo, branch = githubSettings(exportSettings)
  if token == '' then
    LrDialogs.message(
      'GitHub token missing',
      'Open this Publish Service\'s settings (Publish Manager) and add your GitHub token before publishing.',
      'critical')
    progressScope:done()
    return
  end

  local publishedCollectionInfo = exportContext.publishedCollectionInfo
  local collectionName = publishedCollectionInfo.name
  local projectId = Support.sanitizeId(collectionName)

  local anyFailures = false
  local i = 0

  for _, rendition in exportContext:renditions { stopIfCanceled = true } do
    i = i + 1
    progressScope:setPortionComplete((i - 1) / nPhotos)

    if not rendition.wasSkipped then
      local success, pathOrMessage = rendition:waitForRender()
      progressScope:setPortionComplete((i - 0.5) / nPhotos)
      if progressScope:isCanceled() then break end

      if success then
        local remotePath = rendition.publishedPhotoId
        if not remotePath or remotePath == '' then
          remotePath = 'images/uploads/' .. projectId .. '/gallery-' .. newRandomId() .. '.jpg'
        end

        local okRead, bytes = pcall(LrFileUtils.readFile, pathOrMessage)
        LrFileUtils.delete(pathOrMessage)

        if okRead and bytes then
          local base64Content = Base64.encode(bytes)
          local uploadOk, uploadErr = GitHubApi.putFile(
            token, repo, branch, remotePath, base64Content,
            'Publish ' .. remotePath .. ' from Lightroom', nil)
          if uploadOk then
            rendition:recordPublishedPhotoId(remotePath)
          else
            anyFailures = true
            rendition:uploadFailed(uploadErr or 'Upload to GitHub failed')
          end
        else
          anyFailures = true
          rendition:uploadFailed('Could not read the rendered photo file')
        end
      end
    end
  end

  if progressScope:isCanceled() then
    progressScope:done()
    return
  end

  progressScope:setCaption('Updating data/projects.json...')

  -- Rebuild this project's cover/gallery from the collection's current,
  -- authoritative published-photo list -- not just what this run touched
  -- -- so unmodified earlier photos and their order are preserved too.
  local publishedPhotos = exportContext.publishedCollection:getPublishedPhotos()
  local orderedPaths = {}
  for _, pub in ipairs(publishedPhotos) do
    local remoteId = pub:getRemoteId()
    if remoteId and remoteId ~= '' then
      orderedPaths[#orderedPaths + 1] = remoteId
    end
  end

  local ok, err = updateProjectsJson(token, repo, branch, 'Publish project updates from Lightroom', function(projects)
    Support.applyGalleryUpdate(projects, projectId, collectionName, orderedPaths)
    return true
  end)

  if not ok then
    LrDialogs.message('Could not update ' .. PROJECTS_JSON_PATH, err, 'critical')
  elseif anyFailures then
    LrDialogs.message(
      'Published with some errors',
      'Some photos failed to upload. Check the Publish panel and try publishing again.',
      'warning')
  end

  progressScope:done()
end

--------------------------------------------------------------------------------
-- Deletion: keep the live site in sync immediately, not just at the next
-- publish, and clean up the now-orphaned file on GitHub.

function exportServiceProvider.deletePhotosFromPublishedCollection(publishSettings, arrayOfPhotoIds, deletedCallback, localCollectionId)
  local token, repo, branch = githubSettings(publishSettings)

  if token ~= '' and #arrayOfPhotoIds > 0 then
    updateProjectsJson(token, repo, branch, 'Remove images from Lightroom', function(projects)
      return Support.removePathsFromProjects(projects, arrayOfPhotoIds)
    end)

    for _, remotePath in ipairs(arrayOfPhotoIds) do
      local sha = GitHubApi.getFileSha(token, repo, branch, remotePath)
      if sha then
        GitHubApi.deleteFile(token, repo, branch, remotePath, sha, 'Remove image ' .. remotePath .. ' from Lightroom')
      end
    end
  end

  for _, photoId in ipairs(arrayOfPhotoIds) do
    deletedCallback(photoId)
  end
end

return exportServiceProvider
