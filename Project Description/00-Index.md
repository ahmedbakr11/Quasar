# Quasar Project Description Index

This folder is the functional documentation map for Quasar. It was produced by scanning the project markdown files and the current implementation in `src`, `src-tauri`, `Luna_Agent`, and `scripts`.

## Source Documents Scanned

- `Project_Description.md`
- `Project_Context.md`
- `ROADMAP_V1.md`
- `RELEASE_V1.md`
- `Luna_Delegation_Architecture.md`
- `Luna_Agent/LOCAL_SETUP.md`
- `Google MCP Guide.md`
- `src-tauri/resources/bin/README.md`

## Functional Documents

- `01-Architecture.md`: application layout, ownership boundaries, and control flow.
- `02-Windows-Release-And-Branching.md`: release workflow, packaging, and branch policy.
- `03-Runtime-Sidecars-And-Logging.md`: LiveKit, Luna, logs, diagnostics, tray behavior, and shutdown.
- `04-Onboarding-Auth-And-Session.md`: first-run onboarding, login, remember-me, and generated runtime env.
- `05-Luna-Agent-And-LiveKit.md`: Luna worker, LiveKit connection, memory, and toolsets.
- `06-Quirks-And-Integration-Framework.md`: how to add future quirks and integrations.
- `07-Google-Workspace-MCP.md`: local Google Workspace MCP as the main path, plus gated remote MCP notes.
- `08-Outlook-Integration.md`: Microsoft Graph Outlook mail read/write integration.
- `09-Search-And-Web-Reading.md`: Luna web search and webpage reading behavior.
- `10-Tasks-Notes-And-Dashboard-Data.md`: SQLite-backed tasks, notes, dashboard refresh, and Luna data tools.
- `11-Delegation-And-Artifacts.md`: Luna delegation worker model and artifact storage.
- `12-Frontend-Shell-UX.md`: app shell, title bar, landing/onboarding UX, scrollbars, and navigation.
- `13-QA-And-Reproduction-Checklist.md`: commands and manual checks to reproduce a release.

## Documentation Rule

When a new capability is added, add or update the matching file in this folder. Each entry should document:

- Purpose.
- Files that own the behavior.
- Runtime configuration and environment keys.
- How to reproduce or test it.
- How future changes should be implemented safely.
