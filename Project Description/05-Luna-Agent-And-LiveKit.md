# Luna Agent And LiveKit

## Purpose

Luna is the assistant sidecar. It connects to local LiveKit, speaks through Gemini Live, uses persistent memory, and exposes Quasar tools.

## Owned Files

- `Luna_Agent/agent.py`
- `Luna_Agent/memory.py`
- `Luna_Agent/LOCAL_SETUP.md`
- `src/pages/Luna.tsx`
- `src/components/luna/*`
- `src-tauri/src/commands/agent.rs`
- `src-tauri/src/commands/runtime.rs`

## LiveKit Connection

Packaged runtime uses:

- `LIVEKIT_URL=ws://127.0.0.1:7880`
- `LIVEKIT_API_KEY=quasar-local`
- generated `LIVEKIT_API_SECRET`
- `LIVEKIT_ROOM=luna-room`
- `AGENT_NAME=gemini_voice_agent`

The frontend requests a participant token from `generate_livekit_token`, then connects to the local room. Luna joins the same room as a worker.

## Luna Toolsets

Current Python toolsets in `Luna_Agent/agent.py`:

- `SystemTools`: local commands and file operations.
- `TaskTools`: view, add, edit, check subtasks, and delete tasks.
- `NoteTools`: view, add, edit, and delete notes.
- `WebSearchTools`: internet search and webpage reading.
- `OutlookTools`: Microsoft Graph mail read/write actions.
- `DelegationTools`: delegate heavier work to non-live Gemini and save artifacts.
- MCP toolsets: Google Workspace MCP servers when enabled.

## Memory

Memory is implemented in `Luna_Agent/memory.py`.

Installed memory path:

```text
%APPDATA%/com.quasar.app/memory.json
```

Environment keys:

- `AGENT_MEMORY_FILE`
- `AGENT_MEMORY_RECENT_ITEMS`
- `AGENT_MEMORY_SUMMARY_MAX_CHARS`
- `AGENT_MEMORY_DEBUG`

Settings exposes persistent core memory. Changes are loaded into Luna on the next Luna restart/session.

## Reproduction

1. Start Quasar.
2. Confirm local LiveKit is running.
3. Confirm Luna sidecar is running.
4. Open Luna page.
5. Send a text message.
6. Test a task prompt: "Create a task called test Luna task."
7. Test a note prompt: "Create a note called test Luna note."
8. Restart Luna.
9. Ask Luna about saved memory or prior stable facts.

## Future Implementation Rule

New Luna abilities should be added as small `llm.Toolset` classes or MCP servers. Keep tool names explicit, return structured text/JSON, and avoid mixing unrelated service logic into the LiveKit session startup code.
