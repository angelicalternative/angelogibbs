# Angelo Gibbs Site — Lightroom Publish Plugin

Publish photos straight from Lightroom Classic to angelogibbs.com. It uploads
through the same GitHub API the site's web admin panel uses, so it works with
the exact same GitHub token and repo — no server, no extra service.

## How it works

- Each **Publish Collection** you create maps to one project on the site.
  Name the collection exactly like the project's id in `data/projects.json`
  (e.g. `dama`, `unbound`) to publish into that project. A name that doesn't
  match any existing project creates a new one automatically.
- Within a collection, the **first photo becomes the project's cover image**,
  and the rest become its gallery, in the order they appear in the collection.
  Drag to reorder, then hit Publish again to push the new order live.
- Remove a photo from the collection and it's deleted from the site (and from
  the repo) the next time Lightroom syncs that removal — no separate cleanup
  step needed.
- Photos are automatically resized to 1600px on the long edge at 82% JPEG
  quality by default (matching the web admin panel's own resizing), so a
  full-resolution export doesn't bloat the site. You can change this in the
  normal Image Sizing / File Settings panels of the Publish dialog if you want.

## Install

1. Download this whole `AngeloGibbsPublish.lrplugin` folder to your computer
   (keep all the files together — don't rename or move individual files out
   of it).
2. In Lightroom Classic: **File → Plug-in Manager → Add** (bottom left) →
   select the `AngeloGibbsPublish.lrplugin` folder.
3. In the **Publish Services** panel (bottom left of the Library module),
   find **Angelo Gibbs Site** → click the **Set Up...** link next to it
   (or the `+` icon → choose it from the list if it's not there yet).

## Set up your GitHub token

The plugin needs the same kind of token the web admin panel uses:

1. Go to github.com → your profile picture → **Settings** → **Developer
   settings** → **Personal access tokens** → **Fine-grained tokens** →
   **Generate new token**.
2. **Repository access** → **Only select repositories** →
   `angelicalternative/angelogibbs`.
3. **Permissions** → **Repository permissions** → **Contents** →
   **Read and write**.
4. Generate it, copy the value (you only get to see it once).
5. In Lightroom's Publish Service setup dialog, paste it into the
   **GitHub token** field. Repository defaults to
   `angelicalternative/angelogibbs` and branch to `main` — leave those
   unless you know you need something else.

Save, and you're set up. From here, **create a Publish Collection** under
"Angelo Gibbs Site" named after the project you want to publish to, drag
photos in (arrange the cover shot first), and click **Publish**.

## A note on where the token lives

Same principle as the web admin panel: your token stays local — stored in
Lightroom's own plugin preferences on your computer, never written into any
file that gets committed to the repo or shown to site visitors.

## If something goes wrong

- **"GitHub token missing"** — open the Publish Service's settings again and
  make sure the token field actually has something in it, then Publish again.
- **A photo fails to upload** — Lightroom will mark it as needing republish;
  everything else in that batch still goes through. Try publishing again;
  if it keeps failing, double-check the token hasn't expired or been revoked.
- Images can take 30–60 seconds to actually appear live after publishing —
  that's GitHub Pages rebuilding the site, not a plugin issue.
