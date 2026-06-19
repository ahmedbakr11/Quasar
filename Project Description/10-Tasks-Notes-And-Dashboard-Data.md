# Tasks, Notes, And Dashboard Data

## Purpose

Tasks and notes are the core productivity data Luna and the user operate on. They are local-first and stored in SQLite.

## Owned Files

- `src/pages/Tasks.tsx`
- `src/pages/Notes.tsx`
- `src/pages/Dashboard.tsx`
- `src/store/taskStore.ts`
- `src/store/noteStore.ts`
- `src-tauri/src/commands/tasks.rs`
- `src-tauri/src/commands/notes.rs`
- `Luna_Agent/agent.py`

## Storage

The installed database lives in:

```text
%APPDATA%/com.quasar.app/luna.db
```

Main tables include:

- `users`
- `sessions`
- `task_lists`
- `tasks`
- `task_subtasks`
- `notes`
- `agent_config`

Task list status is unique per user. Task ordering is stored through per-list `position` values and normalized by Rust commands after drag/drop or moves.

The task page currently defaults to card view through `src/store/taskStore.ts`. Native Tauri file-drop interception is disabled with `"dragDropEnabled": false` in `src-tauri/tauri.conf.json` so React drag/drop interactions can work inside the webview.

## Frontend Pattern

React pages call Zustand stores. Stores call Tauri commands. Commands return authoritative models from SQLite.

Task commands:

- `list_tasks`
- `create_task`
- `update_task`
- `move_task`
- `toggle_subtask`
- `delete_task`
- `set_list_color`

Note commands:

- `list_notes`
- `create_note`
- `update_note`
- `delete_note`

## Luna Pattern

Luna accesses the same SQLite database directly through `TaskTools` and `NoteTools`. When Luna changes data, the UI must refresh immediately. The frontend stores should listen for or trigger reloads after assistant-side mutations where possible.

## Known UX Requirements

- Notes created by Luna should appear immediately in recent notes and the notes page.
- Tasks created or changed by Luna should appear immediately in dashboard and task views.
- Dashboard recent notes should start at the top of the panel.
- Dashboard should represent current data, not stale state from initial page load.

## Reproduction

1. Create a task manually.
2. Confirm it appears on Tasks and Dashboard.
3. Ask Luna to create a task.
4. Confirm it appears without page navigation.
5. Create a note manually.
6. Confirm it appears on Notes and Dashboard.
7. Ask Luna to create a note.
8. Confirm it appears without page navigation.
9. Restart Quasar and confirm tasks/notes persist.

## Future Implementation Rule

Any new data domain should have:

- SQLite migration
- Rust command module
- frontend store
- UI page or section
- Luna toolset if assistant access is expected
- refresh/event strategy so assistant-side mutations update the UI
