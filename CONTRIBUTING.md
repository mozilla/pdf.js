This repo is MuniCollab's forked copy of [mozilla/pdf.js](https://github.com/mozilla/pdf.js). We track upstream updates separately from our customizations. Please follow this workflow to contribute.

**TL;DR:** When making custom changes to this fork, start from a new feature branch off `master`. Use the `upstream-master` branch to track changes from the upstream repo. Tag the upstream version (e.g. `upstream-vX.Y.Z`) after syncing, and tag your own releases (e.g. `municollab-v1.0.0`) as you go.

## 🛠 One-Time Git Remote Setup
To contribute to this repo, you’ll need to make sure your remotes are configured properly:

### 1. Verify remotes

```bash
git remote -v
```

You should see:

```bash
origin    git@github.com:municollab/pdf.js.git (fetch)
origin    git@github.com:municollab/pdf.js.git (push)
upstream  git@github.com:mozilla/pdf.js.git (fetch)
```

> 🚫 If upstream appears under push, remove it with:

```bash
git remote set-url --push upstream no_push
```

This prevents accidental pushes to the upstream Mozilla repo.


## 🌿 Branch Overview

- `upstream-master`: Tracks the latest upstream from `mozilla/pdf.js`. Do not commit here.
- `master`: Our working branch with MuniCollab customizations. Use this as your base for new work.
- `feature_*`: Short-lived branches for in-progress changes. Branch off `master`.

---

## 👩‍💻 Developer Workflow (Feature Work)

### 1. Start work from latest `master`:

```bash
git checkout master
git pull origin master
git checkout -b feature_custom-change
```

> 💡 You can prefix feature branches with initials if helpful: `dg_feature_custom-change`

### 2. Commit your work and push

```bash
git push -u origin feature_custom-change
```

### 3. Open a PR in the Forked Repo `master`

When opening a PR from your feature branch, make sure you're targeting the `master` branch on our forked repo.

1. Go to https://github.com/municollab/pdf.js/pulls
2. Click **"New pull request"**
3. Use the dropdowns to select:
   - **Base repo**: `municollab/pdf.js`
   - **Base branch**: `master`
   - **Compare**: your feature branch (e.g., `feature/my-change`)

> ⚠️ If GitHub tries to open a PR against `mozilla/pdf.js` as the base repo, change the base repo **back to MuniCollab** using the dropdown. This ensures you are merging your work into the fork, not upstream.

> 🧹 **Please use “Squash and Merge”** to keep the commit history clean and linear. 

See [Tagging MuniCollab Releases Workflow](#tagging-municollab-releases-workflow) for recommended merging workflow.

---

## 🔁 Upstream Syncing Workflow (Maintainer)

This should be routinely executed. It is good practice to keep our fork synced with upstream changes.

### 1. Update `upstream-master` from upstream

```bash
git checkout upstream-master
git fetch upstream
git reset --hard upstream-master  # WARNING: overwrites local changes
```

### 2. Tag the upstream sync commit

```bash
git tag -a upstream-v5.4.0 -m "Synced with mozilla/pdf.js v5.4.0"  # use the actual version you synced from
git push origin upstream-master --force
git push origin upstream-v5.4.0
```

### 3. Rebase or merge `upstream-master` into `master`

```bash
git checkout master
git pull origin master
git rebase upstream-master   # or `git merge upstream-master`
```

---

## 🏷 Tagging MuniCollab Releases Workflow (Maintainer)
When ready to merge features into `master` (create a release), please use **“Squash and Merge”** to keep the commit history clean and linear. 

After merging our changes into `master`, tag the release:

```bash
git checkout master
git tag -a municollab-v1.1.0 -m "Release with new MuniCollab customizations"
git push origin municollab-v1.1.0
```

---

Let us know if you have questions about this workflow. Keeping a clear boundary between upstream and custom work helps us customize and maintain our forked repo effectively while staying up to date with the latest improvements from Mozilla.