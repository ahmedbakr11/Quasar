# Quasar V1 Windows Release

## Branch Model

- `main` contains stable released source.
- `release/v1.0` contains V1 stabilization and packaging work.
- Future development continues on feature/dev branches and is merged after V1 is cut.
- The shipped installer should be built from an immutable tag such as `v1.0.0`.

## Runtime Mode

Packaged V1 does not use LiveKit `--dev` mode.

- LiveKit starts from a generated config in the Quasar app data directory.
- LiveKit binds to `127.0.0.1`.
- Quasar generates and stores a local LiveKit secret on first run.
- Luna starts in `start` mode.
- Developer builds can override sidecar paths with environment variables.

## Sidecars

Before a distributable installer build, place these files in `src-tauri/resources/bin`:

- `livekit-server.exe`
- `luna-agent.exe`

`luna-agent.exe` should be produced from `Luna_Agent/agent.py` with PyInstaller and include the dependencies from `Luna_Agent/requirements.txt`.

## Logs

Runtime logs are written under the Quasar app data directory:

- `logs/quasar.log`
- `logs/livekit.log`
- `logs/luna.log`

LiveKit and Luna stdout/stderr are captured separately. Sidecar logs rotate when they exceed 5 MB, keeping three rotations.

The Settings Runtime page and tray menu include log access and diagnostics actions.

## Build

```powershell
npm run release:v1
```

The script runs lint, frontend build, Rust check, and Tauri bundling. It warns if sidecar binaries are missing.
