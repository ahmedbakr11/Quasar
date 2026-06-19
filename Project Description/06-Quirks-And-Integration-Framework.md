# Quirks And Integration Framework

## Purpose

Quirks are optional Luna integrations that can be enabled, configured, and restarted from Quasar Settings without editing source `.env` files.

Examples:

- web search provider
- Google Workspace MCP
- Outlook mail
- future calendar, storage, browser, or provider integrations

## Owned Files

- `src/pages/Settings.tsx`
- `src-tauri/src/commands/runtime.rs`
- `Luna_Agent/agent.py`
- `src/lib/tauriCommands.ts`

## Current Pattern

1. Settings renders a Quirks section.
2. Settings loads config through `load_quirks_settings`.
3. User edits values.
4. Settings saves through `save_quirks_settings`.
5. Rust validates and writes values to `%APPDATA%/com.quasar.app/.env`.
6. User restarts Luna from Settings or tray.
7. Luna reads environment variables on startup and enables the tool.

## Adding A New Quirk

### 1. Define Environment Keys

Use a unique prefix:

```text
SERVICE_ENABLED
SERVICE_CLIENT_ID
SERVICE_CLIENT_SECRET
SERVICE_REFRESH_TOKEN
SERVICE_TIMEOUT_SECONDS
SERVICE_ALLOWED_TOOLS
```

Store secrets only in app-data `.env`, not frontend state longer than needed.

### 2. Extend Rust Settings Payload

In `src-tauri/src/commands/runtime.rs`:

- add fields to the quirks settings struct
- load defaults from `.env`
- validate user input
- write normalized env values
- compact or preserve secrets carefully
- add the integration to diagnostics without printing secret values

### 3. Extend Settings UI

In `src/pages/Settings.tsx`:

- add a section under Quirks
- show enable toggle
- show required fields
- show secret "set/preserve/clear" behavior where applicable
- explain restart requirement

### 4. Add Luna Tooling

In `Luna_Agent/agent.py`:

- add a small helper for auth/token refresh if needed
- add a `llm.Toolset` class
- return clear errors when disabled or unauthorized
- register the toolset only when enabled/configured

### 5. Add Documentation

Add or update a file in `Project Description` with:

- required external setup
- environment keys
- OAuth scopes
- test prompts
- troubleshooting

## Reproduction Template

1. Enable the quirk in Settings.
2. Save credentials/config.
3. Restart Luna.
4. Open `%APPDATA%/com.quasar.app/logs/luna.log`.
5. Confirm startup preflight shows enabled/configured without secrets.
6. Ask Luna to perform a low-risk read action.
7. Test one write action only after read works.

## Security Rule

Any quirk that can send email, delete files, modify calendars, or update external data should either require explicit user phrasing or add a confirmation step before destructive writes.
