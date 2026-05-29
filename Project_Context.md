# Project Context

Last updated: 2026-05-29 (Africa/Cairo)
Repo: `D:\Projects\Quasar`

## Project Overview
- Desktop-first application using React + TypeScript + Vite + Tauri v2.
- Main frontend code is in `src/`.
- Backend shell logic is in Rust (`src-tauri/`).
- Separate Python voice agent code is in `Luna_Agent/` (LiveKit worker + Gemini realtime).

## Tech Stack & Architecture

### 1. Frontend & Shell
- **UI Framework**: React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Router.
- **Desktop Wrapper**: Tauri v2 (`src-tauri/`).
- **Drag-and-Drop Configuration**: Native file drop interception is disabled via `"dragDropEnabled": false` in [tauri.conf.json](file:///d:/Projects/Quasar/src-tauri/tauri.conf.json) to allow standard HTML5 drag-and-drop to function in the React webview.
- **Task Page Views**: Hardcoded to Card View (removed List View). Columns scale their heights independently (`items-start`).

### 2. Database (SQLite)
- Local SQLite database file `luna.db` stored in the user's AppData directory (`com.quasar.app/luna.db`).
- Contains tables: `users`, `sessions`, `tasks`, `task_subtasks`, `notes`, `agent_config`.
- Shared access:
  - **Tauri Backend**: Written in Rust, performs SQL queries for CRUD operations and exposes them as Tauri commands (e.g. `create_task` with optional due date, `update_task`).
  - **Luna Agent**: Written in Python, accesses the database directly using `sqlite3` to view/manipulate tasks and notes via Gemini tools.

### 3. Agent Service (Luna)
- LiveKit agent worker running on Python 3.10+ using `livekit-agents` and `livekit-plugins-google` (Gemini realtime API).
- Uses Google Gemini Multimodal Live API (`gemini-3.1-flash-live-preview`).
- Integrates Google Workspace Model Context Protocol (MCP) server for Gmail/Calendar/Tasks tools.
- Uses `ctx.add_shutdown_callback` to terminate all standard I/O-based MCP server subprocesses cleanly on participant disconnect, freeing the worker slot for re-connections.

---

## Run / Build Commands
- **Frontend dev**: `npm run dev` (starts the local Vite development server).
- **Frontend build**: `npm run build` (builds the static assets to `dist/`).
- **Lint**: `npm run lint` (runs ESLint).
- **Agent runner**: `python agent.py dev` or `python agent.py --dev` (starts the LiveKit agent worker).
- **Agent setup**: See [LOCAL_SETUP.md](file:///d:/Projects/Quasar/Luna_Agent/LOCAL_SETUP.md).

---

## Completed Milestones
1. **SQLite Backend**: Fully migrated tasks and notes storage to SQLite.
2. **Reordering Math**: Reordered tasks positioning logic inside [tasks.rs](file:///d:/Projects/Quasar/src-tauri/src/commands/tasks.rs) with clean normalization.
3. **Zustand Refresh**: Updated [taskStore.ts](file:///d:/Projects/Quasar/src/store/taskStore.ts) to reload data from SQLite via list commands upon drop/reorder.
4. **Drag-and-Drop Fix**: Resolved drag grabbing/interception issues on the Kanban board (via Tauri configuration and conditional React drop target handlers).
5. **Reconnection Persistence**: Ensured the LiveKit worker cleanly exits jobs and releases concurrency slots by terminating MCP child processes on room disconnection.
6. **Task Board Refinements**: Simplified card details, made due dates optional in the schema/UI, added task editing modal, decoupled column heights, and added column color context menus.

---

## TODO / Future Roadmap
1. Validate Google Workspace MCP tool execution end-to-end under varying network conditions.
2. Clean up template elements: rewrite `README.md` to document Quasar + Luna architecture, dev workflow, and database design.
3. Test edge cases in tasks (e.g., reordering in rapid succession, handling database read failures gracefully).
