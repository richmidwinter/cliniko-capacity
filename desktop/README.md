# Cliniko Capacity — desktop (Electron)

Packages the dashboard as a native desktop app. The React UI (repo root) is the
**renderer**; Cliniko calls run in the Electron **main process** (Node, no CORS),
so there's no proxy server to host. The API key is entered in the app and kept in
that machine's local storage.

## Develop

```bash
npm install     # in this desktop/ folder (also installs the Electron binary)
npm run dev     # one command: starts the Vite renderer AND launches Electron
```

`npm run dev` builds main/preload, starts Vite on :5280, waits for it, then opens
the Electron window pointed at it — so renderer changes hot-reload. Changes to
`src/main.ts` / `src/preload.ts` need a restart (`Ctrl-C`, `npm run dev` again).

## What end users get

End users **don't run any of this**. They download an installer from the repo's
**Releases** page and install a normal app:

- **macOS**: `Cliniko Capacity.dmg` → drag to Applications → open.
- **Windows**: `Cliniko Capacity Setup.exe` → install → launch.

The renderer is bundled inside the app (no localhost, no Node, no terminal). They
enter their Cliniko key once, and it's stored only on their machine.

### First-launch note (unsigned builds)

These builds are **not code-signed yet**, so the OS warns on first launch:

- **macOS**: the app is ad-hoc signed (not notarized), so first launch shows
  "unidentified developer". Fix: **right-click the app → Open → Open**, once.
  If macOS still says the app is "damaged" (some download paths strip the
  signature), run:
  `xattr -cr "/Applications/Cliniko Capacity.app" && codesign --force --deep --sign - "/Applications/Cliniko Capacity.app"`.
  Note: macOS auto-update stays off until the app is signed + notarized.
- **Windows**: SmartScreen shows "unknown publisher" → **More info → Run anyway**.
  Windows auto-update still works.

Signing later removes these warnings (and enables macOS auto-update) with no code
changes — see `electron-builder.yml`.

## Package installers locally

```bash
npm run dist     # builds renderer + main, runs electron-builder → release/
```

## Auto-update via GitHub Releases

1. Set `owner`/`repo` in `electron-builder.yml` to your GitHub repo.
2. Bump `version` in `package.json`, commit, then push a tag:
   ```bash
   git tag v0.1.1 && git push --tags
   ```
3. The `.github/workflows/release.yml` workflow builds macOS/Windows installers
   and publishes them to a GitHub Release. Installed apps check that feed on
   launch and update in the background (`electron-updater`).

### Code signing (the one real prerequisite)
- **macOS**: auto-update requires the app to be **signed + notarized** (Apple
  Developer account). Fill in `mac.identity` in `electron-builder.yml` and the
  `CSC_*` / `APPLE_*` secrets in the workflow.
- **Windows**: updates work unsigned but show a SmartScreen warning; a code-signing
  certificate removes it.
