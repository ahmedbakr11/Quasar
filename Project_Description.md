# Quasar Full Project Documentation

## 1. Executive Summary
Quasar is a desktop-first productivity and AI-assistant application built with React + TypeScript for the UI and Tauri (Rust) for secure local backend commands. It includes:
- User auth/session management
- Task management with lists, subtasks, drag/drop ordering, and color customization
- LiveKit-based Luna voice/chat assistant integration
- A standalone Python LiveKit agent runtime (`Luna_Agent`) with memory and optional Google Workspace MCP tools

## 2. Repository Layout
- `src/`: Frontend application (React + Zustand + Router)
- `src-tauri/`: Tauri backend (Rust commands + SQLite migrations)
- `Luna_Agent/`: Python voice agent service and memory logic
- `public/`: Static assets
- Root configs: Vite, TS, Tailwind, ESLint, PostCSS

## 3. Frontend Architecture
### 3.1 Entry and Routing
- `src/main.tsx`: mounts app with `BrowserRouter`
- `src/App.tsx`: route table, shell title bar, auth redirect guard, animated route transitions

Routes:
- Public: `/`, `/login`, `/register`
- Protected: `/dashboard`, `/profile`, `/luna`, `/settings`, `/tasks`

### 3.2 State Stores (Zustand)
- `src/store/authStore.ts`
  - Handles session token persistence in `localStorage` (`luna_session_token`)
  - Hydrates user from Tauri command `get_current_user`
  - Sign in/out flow via backend commands
- `src/store/agentStore.ts`
  - Loads/saves LiveKit/Luna config via Tauri commands
  - Tracks agent connection status
- `src/store/taskStore.ts`
  - Owns tasks/lists/view mode state
  - CRUD and mutation calls to Tauri backend
  - Normalizes optimistic in-memory updates with server responses

### 3.3 Key Pages
- `Landing.tsx`: marketing/landing shell
- `Login.tsx` / `Register.tsx`: auth forms
- `Dashboard.tsx`: primary app overview
- `Profile.tsx`: user-focused page
- `Settings.tsx`: profile + agent config management
- `Tasks.tsx`: kanban/list task system
- `Luna.tsx`: LiveKit session lifecycle and assistant UI host

### 3.4 Luna Frontend Components
- `src/components/luna/ChatPanel.tsx`: message input, image attachment, transcript rendering
- `src/components/luna/chatEnvelope.ts`: structured envelope format for image messages
- `src/components/luna/LunaConnected.tsx`, `LunaConnecting.tsx`, `LunaDisconnected.tsx`: connection-state views
- `src/components/agent-session-provider.tsx`: shares session context with child components

## 4. Tauri Backend (Rust)
### 4.1 Core Boot
- `src-tauri/src/lib.rs`
  - Initializes DB
  - Registers commands
  - Wires plugins (SQL + log in debug)

### 4.2 Database and Migrations
- `src-tauri/src/db/migrations.rs`
  - Creates tables:
    - `users`
    - `sessions`
    - `agent_config`
    - `task_lists`
    - `tasks`
    - `task_subtasks`

### 4.3 Command Modules
- `commands/auth.rs`
  - `register_user`, `login`, `logout`, `get_current_user`, `update_profile`
  - Password hashing via `bcrypt`
  - Session expiration validation
- `commands/agent.rs`
  - `save_agent_config`, `load_agent_config`
  - `generate_livekit_token`, `test_agent_connection`
  - JWT token generation with LiveKit claims
- `commands/tasks.rs`
  - `list_tasks`, `create_task`, `update_task`, `move_task`, `toggle_subtask`, `delete_task`, `set_list_color`
  - Server-side validation for task status/priority
  - Per-list position normalization to keep ordering stable

## 5. Luna Agent (Python)
### 5.1 Runtime
- `Luna_Agent/agent.py`
  - Loads `.env` from agent directory
  - Creates LiveKit AgentSession
  - Optional MCP tool server bootstrap via environment flags
  - Supports filesystem/system tools and task tools (DB-backed)

### 5.2 Memory
- `Luna_Agent/memory.py`
  - Memory state management
  - Chat context and instruction composition
- `Luna_Agent/memory.json`
  - Runtime memory persistence

### 5.3 Setup
- `Luna_Agent/LOCAL_SETUP.md`
  - Local execution and dependency setup notes
- `Luna_Agent/requirements.txt`
  - Python dependencies

## 6. Data and Control Flows
### 6.1 Authentication Flow
1. Frontend submits credentials
2. Tauri validates and creates session token
3. Token stored in frontend localStorage
4. Protected routes rely on token + hydrated user

### 6.2 Task Flow
1. `Tasks.tsx` loads task payload via `list_tasks`
2. Mutations call Tauri commands
3. Rust backend updates SQLite and returns normalized task model
4. Store updates UI from authoritative backend response

### 6.3 Luna Connection Flow
1. User opens `/luna`
2. Frontend fetches participant token through Tauri command path
3. LiveKit session starts with microphone track config
4. Chat messages and optional image envelopes are sent through session APIs

## 7. Security Posture
- Auth/session logic and secrets are handled in Tauri backend, not plain frontend JS
- LiveKit API secret is persisted locally in SQLite, not shipped to web APIs
- Session expiry validation is performed server-side in Rust commands
- Passwords are hashed before persistence

## 8. Performance and Reliability Notes
- Task ordering is normalized server-side to prevent drift after drag/drop
- UI uses memoization selectively (`useMemo`) for derived task views
- Build currently succeeds; bundle is large primarily because of rich chat/rendering dependencies

## 9. Known Technical Debt
- ESLint currently contains targeted exceptions for `react-refresh/only-export-components` in some shared UI helper files
- Bundle-size warnings from Vite remain and can be improved by deeper route/component-level lazy loading
- `README.md` is still mostly template-level and should eventually be replaced with this project-specific detail

## 10. Runbook
### Frontend
- `npm run dev`
- `npm run lint`
- `npm run build`

### Tauri app
- `npx tauri dev`

### Luna agent
- See `Luna_Agent/LOCAL_SETUP.md`

## 11. Summary of Safe Optimizations Applied in This Pass
- Fixed hook-order violations in auth/task pages
- Removed effect-driven connection-state churn in Luna page by deriving connection state from session + startup state
- Reduced effect/state churn in agent visualizer sequence generation by replacing one mutable sequence effect with memoized derivation
- Simplified Settings profile draft synchronization without effect-based immediate state writes

