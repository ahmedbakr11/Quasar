# QA And Reproduction Checklist

## Purpose

This is the minimum checklist for reproducing a release and validating the major Quasar functions.

## Static Checks

Run from repo root:

```powershell
npm run lint
npm run build
cd src-tauri
cargo check
cd ..
Luna_Agent\.venv-release\Scripts\python.exe -m py_compile Luna_Agent\agent.py
```

If the release venv does not exist yet:

```powershell
npm run luna:build
```

## Development Run Commands

Frontend-only development:

```powershell
npm run dev
```

Tauri desktop development:

```powershell
npm run tauri:dev
```

Packaged-style release work should use the runtime sidecar flow instead of starting LiveKit manually in `--dev` mode.

## Release Build

```powershell
npm run release:v1
```

Expected:

- Luna sidecar built.
- LiveKit sidecar copied.
- frontend build succeeds.
- Rust check succeeds.
- Tauri bundle completes.

## Clean Install Simulation

1. Close Quasar.
2. Back up `%APPDATA%/com.quasar.app`.
3. Move or delete `%APPDATA%/com.quasar.app`.
4. Install the generated bundle.
5. Launch Quasar.
6. Complete onboarding.
7. Confirm generated `.env`, `luna.db`, `memory.json`, and `logs` exist.

## Auth Checks

- Register during onboarding.
- Restart with remember-me checked.
- Confirm dashboard opens directly.
- Log out.
- Confirm login page opens.
- Login with remember-me unchecked.
- Restart and confirm expected session behavior.

## Runtime Checks

- LiveKit starts without terminal windows.
- Luna starts without terminal windows.
- Closing app sends it to tray.
- Quitting from tray stops LiveKit and Luna.
- Restart Luna does not create duplicate processes.
- Logs are written to app data.

## Data Checks

- Create/edit/delete task.
- Toggle subtask.
- Move task between lists.
- Create/edit/delete note.
- Pin/unpin note.
- Search notes.
- Confirm dashboard reflects latest tasks and notes.
- Ask Luna to create a note and task; UI should update instantly.

## Luna Checks

- Connect text chat.
- Connect voice.
- Ask Luna to list tasks.
- Ask Luna to create a task.
- Ask Luna to create a note.
- Test memory after restart.
- Test web search.
- Test webpage reading.

## Quirks Checks

- Enable Outlook and test read action before write action.
- Enable Google Workspace local MCP and test Gmail labels or Tasks.
- Confirm disabled quirks do not load tools.
- Confirm failed quirks log actionable errors without leaking secrets.

## Release Acceptance

A release is acceptable when:

- static checks pass
- installer builds
- clean install onboarding works
- local runtime starts without terminals
- Luna connects
- tasks and notes persist
- quirks can be disabled safely
- logs and diagnostics make failures explainable
