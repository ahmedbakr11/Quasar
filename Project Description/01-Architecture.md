# Architecture

## Purpose

Quasar is a Windows desktop productivity application with an embedded AI assistant named Luna. The desktop shell is Tauri, the UI is React, the local backend is Rust, persistent app data is SQLite plus app-data files, and Luna runs as a Python LiveKit agent sidecar.

## Main Ownership Boundaries

- `src/`: React UI, routing, pages, Zustand stores, client command wrappers.
- `src-tauri/`: Rust desktop backend, app lifecycle, SQLite commands, runtime sidecar management, tray menu, logging, and local env generation.
- `Luna_Agent/`: Python LiveKit worker, Gemini Live integration, memory, task/note tools, MCP integrations, Outlook tools, web search, and delegation.
- `scripts/`: release and sidecar build automation.
- `src-tauri/resources/bin/`: packaged sidecar binaries used by the Windows build.
- `%APPDATA%/com.quasar.app`: installed runtime data, database, `.env`, memory, logs, generated LiveKit config, and vault outputs.

## Tech Stack

- React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Router.
- Tauri v2 with Rust commands and tray support.
- SQLite through `rusqlite` and `tauri-plugin-sql`.
- Python 3.10+ Luna agent using LiveKit Agents and Google Gemini Live.
- Local sidecar binaries for LiveKit and Luna in packaged builds.

## Routes

Public routes:

- `/`
- `/login`
- `/register`

Protected routes:

- `/dashboard`
- `/profile`
- `/luna`
- `/settings`
- `/tasks`
- `/notes`

## Runtime Flow

1. Tauri starts the desktop process and initializes the local app data directory.
2. Runtime manager ensures LiveKit local config and `.env` exist.
3. Runtime manager starts `livekit-server.exe` bound to `127.0.0.1`.
4. Runtime manager starts `luna-agent.exe` in normal worker mode, not `--dev`.
5. React reads runtime status through Tauri commands.
6. The Luna page requests a LiveKit participant token from Rust.
7. React connects to the local LiveKit room.
8. Luna joins the room as the agent and exposes toolsets.

## Data Flow

- UI commands go through Tauri `invoke` wrappers in `src/lib/tauriCommands.ts`.
- Rust commands validate sessions before reading or writing user data.
- SQLite stores users, sessions, tasks, notes, agent config, and release-era local state.
- Luna reads the same SQLite database directly for task/note tools.
- Luna memory lives in `%APPDATA%/com.quasar.app/memory.json`.
- Logs live in `%APPDATA%/com.quasar.app/logs`.

## Implementation Rule

Do not let frontend code own secrets or direct filesystem-side effects. If a feature needs local files, processes, tokens, or app-data persistence, add a Tauri command or runtime-manager method and call it from React.
