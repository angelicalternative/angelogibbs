--[[----------------------------------------------------------------------
Minimal pure-Lua base64 encode/decode, written for Lua 5.1 (Lightroom's
scripting runtime -- no bitwise operators, no integer division). Lightroom
has no built-in base64 support, and GitHub's Contents API requires file
content to be base64-encoded on the way in and back out, so this is
needed to talk to it.

Verified against Python's base64 module: byte-for-byte identical output
across every single-byte value (0-255) and on a real ~740KB JPEG.
------------------------------------------------------------------------]]

local Base64 = {}

local chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local charAt = {}
for i = 1, #chars do charAt[i - 1] = chars:sub(i, i) end
local floor = math.floor

function Base64.encode(data)
  local len = #data
  local out = {}
  local outIdx = 1
  local i = 1
  while i + 2 <= len do
    local b1, b2, b3 = data:byte(i, i + 2)
    local n = b1 * 65536 + b2 * 256 + b3
    out[outIdx] = charAt[floor(n / 262144) % 64]
    out[outIdx + 1] = charAt[floor(n / 4096) % 64]
    out[outIdx + 2] = charAt[floor(n / 64) % 64]
    out[outIdx + 3] = charAt[n % 64]
    outIdx = outIdx + 4
    i = i + 3
  end
  local rem = len - i + 1
  if rem == 1 then
    local b1 = data:byte(i)
    local n = b1 * 65536
    out[outIdx] = charAt[floor(n / 262144) % 64]
    out[outIdx + 1] = charAt[floor(n / 4096) % 64]
    out[outIdx + 2] = '='
    out[outIdx + 3] = '='
  elseif rem == 2 then
    local b1, b2 = data:byte(i, i + 1)
    local n = b1 * 65536 + b2 * 256
    out[outIdx] = charAt[floor(n / 262144) % 64]
    out[outIdx + 1] = charAt[floor(n / 4096) % 64]
    out[outIdx + 2] = charAt[floor(n / 64) % 64]
    out[outIdx + 3] = '='
  end
  return table.concat(out)
end

function Base64.decode(data)
  data = string.gsub(data, '[^' .. chars .. '=]', '')
  return (data:gsub('.', function(x)
    if x == '=' then return '' end
    local r, f = '', (chars:find(x, 1, true) - 1)
    for bit = 6, 1, -1 do
      r = r .. (f % 2 ^ bit - f % 2 ^ (bit - 1) > 0 and '1' or '0')
    end
    return r
  end):gsub('%d%d%d?%d?%d?%d?%d?%d?', function(x)
    if #x ~= 8 then return '' end
    local c = 0
    for bit = 1, 8 do
      c = c + (x:sub(bit, bit) == '1' and 2 ^ (8 - bit) or 0)
    end
    return string.char(c)
  end))
end

return Base64
