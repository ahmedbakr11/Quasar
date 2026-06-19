# Google Workspace MCP

## Purpose

Google Workspace support lets Luna use Gmail, Calendar, and Tasks through MCP. The main/default implementation is currently the older local stdio `google-workspace-mcp` package because the official Google remote MCP endpoints are Developer Preview gated.

## Owned Files

- `Luna_Agent/agent.py`
- `src/pages/Settings.tsx`
- `src-tauri/src/commands/runtime.rs`
- `Luna_Agent/LOCAL_SETUP.md`
- `Google MCP Guide.md`

## Main Mode: Local Stdio MCP

Default environment:

```env
GOOGLE_WORKSPACE_MCP_ENABLED=0
GOOGLE_WORKSPACE_MCP_MODE=stdio
GOOGLE_WORKSPACE_MCP_COMMAND=uvx
GOOGLE_WORKSPACE_MCP_ARGS=["--from","google-workspace-mcp","google-workspace-worker","--transport","stdio"]
GOOGLE_WORKSPACE_MCP_TIMEOUT_SECONDS=30
GOOGLE_WORKSPACE_MCP_ALLOWED_TOOLS=
GOOGLE_WORKSPACE_ENABLED_CAPABILITIES=["gmail","calendar","tasks"]
```

Required credentials:

```env
GOOGLE_WORKSPACE_CLIENT_ID=
GOOGLE_WORKSPACE_CLIENT_SECRET=
GOOGLE_WORKSPACE_REFRESH_TOKEN=
```

## Required Local Tool

Install `uv`/`uvx`, then optionally preinstall the MCP package:

```powershell
winget install astral-sh.uv
uv tool install google-workspace-mcp
```

If not preinstalled, `uvx --from google-workspace-mcp ...` may download it on first run.

## Local MCP OAuth Scopes

The local package has historically used broad Gmail, Calendar, and Tasks scopes:

```text
openid
email
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/tasks
```

If Luna can see the MCP but Google actions fail, generate a new refresh token with these scopes.

## Remote Mode: Official Google MCP

Remote endpoints remain implemented but should not be the default until Google access is available:

- Gmail: `https://gmailmcp.googleapis.com/mcp/v1`
- Drive: `https://drivemcp.googleapis.com/mcp/v1`
- Calendar: `https://calendarmcp.googleapis.com/mcp/v1`
- Chat: `https://chatmcp.googleapis.com/mcp/v1`
- People: `https://people.googleapis.com/mcp/v1`

Remote mode uses:

```env
GOOGLE_WORKSPACE_MCP_MODE=remote
GOOGLE_WORKSPACE_ACCESS_TOKEN=
```

or OAuth client credentials plus refresh token.

Remote mode may connect but fail calls with permission errors unless the Google Workspace MCP Developer Preview is enabled for the project/account.

## Reproduction

1. Install `uv`.
2. Enable Gmail API, Calendar API, and Tasks API in Google Cloud.
3. Create OAuth credentials.
4. Generate a refresh token with local MCP scopes.
5. Open Quasar Settings > Quirks.
6. Enable Google Workspace MCP.
7. Keep mode as `Local stdio MCP`.
8. Save credentials and restart Luna.
9. Ask Luna: "List my Gmail labels."
10. Ask Luna: "Show my Google Tasks."

## Troubleshooting

- `MCP command not found in PATH: uvx`: install `uv` and restart Quasar.
- Permission errors: regenerate refresh token with the local scopes.
- No tools visible: confirm `GOOGLE_WORKSPACE_MCP_ENABLED=1` and restart Luna.
- Remote permission errors: likely Developer Preview gating, switch back to stdio.

## Future Implementation Rule

Keep both modes available, but do not make remote official MCP the default until the project can pass real tool calls, not only connection/authentication.
