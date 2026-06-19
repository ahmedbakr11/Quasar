# Windows Release And Branching

## Purpose

Quasar V1 is intended to ship as a regular Windows desktop application. The user should install it, launch it like any other app, and have LiveKit and Luna run as managed local sidecars.

## Branch Policy

The current release work has been merged into `main`. Going forward:

- `main`: stable source that can be built into a release.
- Feature branches: ongoing development.
- Release branches: optional stabilization branches such as `release/v1.1` when a release needs dedicated QA.
- Tags: immutable release points, for example `v1.0.0`.

Recommended release flow:

1. Merge required feature work into `main`.
2. Create a release branch only if stabilization will take more than one focused pass.
3. Run release validation.
4. Merge the release branch back into `main`.
5. Tag the exact release commit.
6. Build installers from the tag.
7. Merge release fixes back into active development branches if any exist.

## Build Commands

From repo root:

```powershell
npm run luna:build
npm run release:v1
```

`npm run luna:build` builds and copies:

- `src-tauri/resources/bin/livekit-server.exe`
- `src-tauri/resources/bin/luna-agent.exe`

`npm run release:v1` runs the release pipeline:

- builds Luna sidecar
- runs lint
- builds frontend
- runs Rust checks
- runs Tauri bundling

## Build Is Not Installation

Building creates release artifacts under `src-tauri/target/release` and Tauri bundle output. Running the raw `.exe` from `target/release` is useful for smoke testing, but it is not the same as installing the app. Installation should use the Tauri-generated installer bundle from the release output.

## Reproduction

1. Clean generated output if needed.
2. Confirm `git status --short` has no accidental source changes.
3. Run `npm run release:v1`.
4. Install using the generated installer from `src-tauri/target/release/bundle`.
5. Launch from Start Menu or the installed shortcut.
6. Check `%APPDATA%/com.quasar.app/logs`.

## Future Implementation Rule

New release requirements should be added to `scripts/release-v1.ps1` or a versioned successor script. Avoid relying on manual copy steps unless they are documented in this folder and enforced by the release script.
