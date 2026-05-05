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
