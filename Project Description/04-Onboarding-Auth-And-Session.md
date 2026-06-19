# Onboarding, Auth, And Session

## Purpose

First run should configure Luna and create the first local user. Later launches should go straight to the dashboard when the user selected remember-me.

## Owned Files

- `src/pages/Landing.tsx`
- `src/pages/Login.tsx`
- `src/pages/Register.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/store/authStore.ts`
- `src/lib/tauriCommands.ts`
- `src-tauri/src/commands/auth.rs`
- `src-tauri/src/commands/runtime.rs`

## First-Run Detection

The frontend calls `get_onboarding_status`. If onboarding has not been completed, the landing page should show the first-run experience with the galaxy/stars theme and the onboarding button.

## Onboarding Inputs

Current onboarding collects:

- Luna voice: `Puck`, `Aoede`, `Charon`, `Fenrir`, `Kore`, `Orus`, `Zephyr`, `Gacrux`
- Luna personality/persona text
- Google Gemini API key
- user name
- user email
- user password

## Generated Runtime Environment

Onboarding calls `complete_onboarding`, which creates the local user and calls `save_luna_onboarding_env`.

The generated `.env` lives in:

```text
%APPDATA%/com.quasar.app/.env
```

It includes defaults for:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_ROOM`
- `AGENT_NAME`
- `GOOGLE_API_KEY`
- `AGENT_MEMORY_FILE`
- Google Workspace MCP settings
- Outlook settings
- delegation output settings

## Remember Me

`src/store/authStore.ts` stores the session token depending on remember-me:

- remembered sessions persist across app restarts
- non-remembered sessions should be cleared when the browser/webview session ends

Login UI owns the checkbox state in `src/pages/Login.tsx`.

## Reproduction

1. Clear or move `%APPDATA%/com.quasar.app` for a clean install simulation.
2. Launch Quasar.
3. Confirm first-run landing appears.
4. Complete onboarding.
5. Confirm dashboard opens.
6. Close and reopen Quasar.
7. Confirm dashboard opens directly when remember-me was selected.
8. Log out.
9. Confirm login page appears.

## Future Implementation Rule

Do not add required onboarding fields unless `save_luna_onboarding_env`, Settings, and diagnostics are also updated. Every onboarding value should have a later Settings entry if the user may need to change it.
