--[[----------------------------------------------------------------------
Thin wrapper around the GitHub Contents API (repos/:owner/:repo/contents/:path),
mirroring the same GET-sha / PUT-with-sha / DELETE-with-sha logic used by
the site's own web admin panel (js/admin.js), so both paths behave the
same way and stay easy to reason about together.
------------------------------------------------------------------------]]

local LrHttp = import 'LrHttp'
local Json = require 'Json'
local Base64 = require 'Base64'

local GitHubApi = {}

local API_ROOT = 'https://api.github.com'

local function request(token, method, url, bodyTable)
  local headers = {
    { field = 'Authorization', value = 'Bearer ' .. token },
    { field = 'Accept', value = 'application/vnd.github+json' },
    { field = 'X-GitHub-Api-Version', value = '2022-11-28' },
    { field = 'User-Agent', value = 'AngeloGibbsLightroomPlugin' },
  }

  if method == 'GET' then
    local body, respHeaders = LrHttp.get(url, headers, 30)
    local status = respHeaders and respHeaders.status
    return status, body
  end

  local postBody = ''
  if bodyTable then
    headers[#headers + 1] = { field = 'Content-Type', value = 'application/json' }
    postBody = Json.encode(bodyTable)
  end
  local respBody, respHeaders = LrHttp.post(url, postBody, headers, method, 60)
  local status = respHeaders and respHeaders.status
  return status, respBody
end

-- Returns: content (decoded string) or nil, sha or nil, errorMessage or nil.
-- A file that doesn't exist yet is NOT an error: returns nil, nil, nil.
function GitHubApi.getFile(token, repo, branch, path)
  local url = API_ROOT .. '/repos/' .. repo .. '/contents/' .. path .. '?ref=' .. branch
  local status, body = request(token, 'GET', url, nil)
  if status == 404 then return nil, nil, nil end
  if status ~= 200 then
    return nil, nil, 'Could not fetch ' .. path .. ' (HTTP ' .. tostring(status) .. ')'
  end
  local ok, parsed = pcall(Json.decode, body)
  if not ok or not parsed then
    return nil, nil, 'Could not parse GitHub response for ' .. path
  end
  local content = parsed.content and Base64.decode(parsed.content) or ''
  return content, parsed.sha, nil
end

-- Returns: sha or nil, errorMessage or nil. Not existing is not an error.
function GitHubApi.getFileSha(token, repo, branch, path)
  local _, sha, err = GitHubApi.getFile(token, repo, branch, path)
  return sha, err
end

-- content must already be base64-encoded. Pass sha when updating an
-- existing file; omit (nil) when creating a new one.
function GitHubApi.putFile(token, repo, branch, path, base64Content, message, sha)
  local url = API_ROOT .. '/repos/' .. repo .. '/contents/' .. path
  local bodyTable = { message = message, content = base64Content, branch = branch }
  if sha then bodyTable.sha = sha end
  local status, body = request(token, 'PUT', url, bodyTable)
  if status ~= 200 and status ~= 201 then
    local ok, parsed = pcall(Json.decode, body or '')
    local msg = (ok and parsed and parsed.message) or ('HTTP ' .. tostring(status))
    return false, 'Failed to save ' .. path .. ': ' .. msg
  end
  return true, nil
end

function GitHubApi.deleteFile(token, repo, branch, path, sha, message)
  if not sha then return true, nil end -- nothing to delete
  local url = API_ROOT .. '/repos/' .. repo .. '/contents/' .. path
  local bodyTable = { message = message, sha = sha, branch = branch }
  local status, body = request(token, 'DELETE', url, bodyTable)
  if status ~= 200 then
    local ok, parsed = pcall(Json.decode, body or '')
    local msg = (ok and parsed and parsed.message) or ('HTTP ' .. tostring(status))
    return false, 'Failed to delete ' .. path .. ': ' .. msg
  end
  return true, nil
end

return GitHubApi
