# Local LiveKit + Agent + Frontend

## 1) Start LiveKit server locally

```powershell
livekit-server --dev
```

This runs on `ws://localhost:7880` with:

- API key: `devkey`
- API secret: `secret`

## 2) Start the Python agent

From repo root:

```powershell
python agent.py dev
```

The root `.env` is already configured for local LiveKit defaults.

### Google Workspace MCP (Gmail + Calendar + Tasks)

Luna can use Google Workspace tools through MCP when enabled in `.env`.

1. Install and configure the Google Workspace MCP server (local stdio mode):

```powershell
uv tool install google-workspace-mcp
```

2. In Google Cloud Console, create OAuth client credentials and enable:
- Gmail API
- Google Calendar API
- Google Tasks API

3. Add these values to `Luna_Agent/.env` (or your runtime environment):

```env
GOOGLE_WORKSPACE_MCP_ENABLED=1
GOOGLE_WORKSPACE_MCP_COMMAND=uvx
# Installed executable is `google-workspace-worker`, exposed via uvx --from.
GOOGLE_WORKSPACE_MCP_ARGS=["--from","google-workspace-mcp","google-workspace-worker","--transport","stdio"]
GOOGLE_WORKSPACE_MCP_TIMEOUT_SECONDS=30
# Leave empty to expose all workspace tools, including send/create/update/delete/modify.
GOOGLE_WORKSPACE_MCP_ALLOWED_TOOLS=

# OAuth credentials required by google-workspace-mcp package
GOOGLE_WORKSPACE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_WORKSPACE_CLIENT_SECRET=your_client_secret
# Long-lived OAuth credential (NOT the token URL)
GOOGLE_WORKSPACE_REFRESH_TOKEN=your_refresh_token

# Optional capability filter (JSON array). Example below enables only Gmail/Calendar/Tasks.
GOOGLE_WORKSPACE_ENABLED_CAPABILITIES=["gmail","calendar","tasks"]
```

`GOOGLE_WORKSPACE_REFRESH_TOKEN` means:
- It is a secret token value returned by Google after OAuth consent.
- It is not `https://oauth2.googleapis.com/token` (that URL is only the token endpoint).
- The MCP uses this refresh token to request short-lived access tokens automatically.

### Get refresh token (without running `agent.py`)

You can generate the refresh token directly using Google's OAuth endpoint and a one-time code exchange.

1. In Google Cloud Console, ensure OAuth client is a **Desktop app** and APIs are enabled.
2. Build this authorize URL (replace `YOUR_CLIENT_ID`):

```text
https://accounts.google.com/o/oauth2/v2/auth?client_id=227505827026-5gauurilip78uiquidhgk3rlig6jelnl.apps.googleusercontent.com&redirect_uri=http://localhost&response_type=code&scope=openid%20email%20https://www.googleapis.com/auth/gmail.modify%20https://www.googleapis.com/auth/calendar%20https://www.googleapis.com/auth/tasks&access_type=offline&prompt=consent
```

3. Open it in browser, sign in, approve scopes.
4. After consent, browser redirects to:
   - `http://localhost/?code=...`
5. Copy the `code` query value.
6. Exchange code for tokens from PowerShell (replace placeholders):

```powershell
$body = @{
  code = "PASTE_AUTH_CODE_HERE"
  client_id = "YOUR_CLIENT_ID"
  client_secret = "YOUR_CLIENT_SECRET"
  redirect_uri = "http://localhost"
  grant_type = "authorization_code"
}

Invoke-RestMethod -Method Post `
  -Uri "https://oauth2.googleapis.com/token" `
  -ContentType "application/x-www-form-urlencoded" `
  -Body $body
```

7. From response JSON, copy `refresh_token` into:
   - `GOOGLE_WORKSPACE_REFRESH_TOKEN=...`

Notes:
- If `refresh_token` is missing, repeat step 2 with `prompt=consent` and ensure you are using the same OAuth client.
- Keep refresh token private. Revoke/rotate from Google account security settings if exposed.

4. On first run, complete the OAuth consent flow prompted by the MCP server.

Notes:
- With `GOOGLE_WORKSPACE_MCP_ALLOWED_TOOLS` empty, Luna exposes full-access Gmail/Calendar/Tasks actions.
- To restrict capabilities, provide a comma-separated allowlist of tool names.

### Memory debug (optional)

To verify memory writes, enable debug logs for one run:

```powershell
$env:AGENT_MEMORY_DEBUG="1"
python agent.py console
```

Expected logs include lines like:

- `[memory] saved <N> recent turns to <absolute path>\memory.json`
- `[memory] turn completed: messages=<M>, summary_chars=<S>, recent=<R>`

To disable debug again in the current terminal:

```powershell
Remove-Item Env:AGENT_MEMORY_DEBUG
```

### Internet search tools

Luna includes two built-in internet tools:

- `internet_search`: searches the public web and returns titles, links, and snippets.
- `read_webpage`: fetches an HTTP/HTTPS page and returns readable text for summarization.

The first implementation uses DuckDuckGo's HTML endpoint through Python standard library HTTP calls, so no extra package or API key is required.

Optional tuning:

```env
LUNA_WEB_TIMEOUT_SECONDS=12
LUNA_WEB_MAX_BYTES=1500000
LUNA_WEB_USER_AGENT=Quasar-Luna/0.1 (+local personal assistant)
```

Notes:
- This depends on internet access from the machine running `agent.py`.
- Search result quality depends on DuckDuckGo's HTML response format.
- For production, replace this with a dedicated search API provider and rate-limit/error handling.

## 3) Start frontend + token server

```powershell
cd frontend
npm install
npm run dev:all
```

Open `http://localhost:5173`.

## 4) Connect and test

1. Keep room as `agent-room`.
2. Click `Connect`.
3. Enable speaker playback if browser prompts.
4. Speak to trigger your voice agent.
5. The visualizer grid reacts to agent state and audio.

## 5) Full-access verification prompts

After connecting, test high-impact actions explicitly:

1. Gmail send: "Send an email to <recipient> with subject <subject> and body <body>."
2. Calendar create/update/delete: "Create a meeting tomorrow at 10 AM", then update and remove it.
3. Tasks create/update/delete: "Create task X due tomorrow", then mark or edit and delete it.
