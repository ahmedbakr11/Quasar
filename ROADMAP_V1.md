# Quasar V1 Roadmap

## V1 Definition

Quasar V1 is a desktop-first personal productivity app with Luna inside it.

The release should feel like one coherent local workspace where the user can manage tasks, capture notes, and ask Luna to help operate on that productivity data.

## V1 Status

- [x] App identity is Quasar, not Luna.
- [x] Core desktop stack exists: React, TypeScript, Vite, Tauri, SQLite.
- [x] Local auth/session system exists.
- [x] Task management exists.
- [x] Notes page exists.
- [x] Luna chat/voice page exists.
- [x] Luna can access task tools.
- [x] Luna can access note tools.
- [x] Luna has basic internet search/read tools.
- [ ] Dashboard feels like the actual productivity home.
- [ ] Settings and Luna setup are polished enough for first-time use.
- [ ] Manual QA has been completed end to end.
- [ ] README is project-specific and complete.
- [ ] Repo hygiene is cleaned before release.

## Must Finish For V1

### 1. Dashboard

- [ ] Show today's tasks.
- [ ] Show overdue tasks.
- [ ] Show pinned notes.
- [ ] Show quick actions for new task, new note, and open Luna.
- [ ] Show Luna connection/config status.
- [ ] Remove placeholder/dashboard-empty feeling.

### 2. Task Page

- [x] Improve checkbox visuals.
- [x] Add expandable task details.
- [x] Show task description in expanded view.
- [x] Show subtasks in expanded view.
- [x] Polish task creation modal.
- [ ] Manually test create task.
- [ ] Manually test edit/update task status.
- [ ] Manually test delete task.
- [ ] Manually test subtask toggle.
- [ ] Manually test drag/drop reorder.
- [ ] Manually test moving tasks across lists.
- [ ] Manually test card/list view persistence.
- [ ] Confirm tasks persist after app restart.
- [ ] Improve empty states if testing shows friction.

### 3. Notes Page

- [x] Add Notes route.
- [x] Add Keep-style quick note composer.
- [x] Add note search.
- [x] Add pinned notes section.
- [x] Add note colors.
- [x] Add labels.
- [x] Add edit modal.
- [x] Add archive/delete actions.
- [x] Persist notes in SQLite.
- [x] Add frontend notes store.
- [ ] Manually test create note.
- [ ] Manually test edit note.
- [ ] Manually test delete note.
- [ ] Manually test archive note.
- [ ] Manually test pin/unpin note.
- [ ] Manually test search by title/body/label.
- [ ] Confirm notes persist after app restart.
- [ ] Decide whether archived notes need a visible V1 archive view.

### 4. Luna

- [x] Luna chat/voice page exists.
- [x] Luna has task tools.
- [x] Luna has note tools.
- [x] Luna has internet search tools.
- [x] Luna has webpage reading tool.
- [x] Luna local setup docs exist.
- [ ] Test Luna agent startup from clean terminal.
- [ ] Test LiveKit connection from Quasar.
- [ ] Test text chat.
- [ ] Test voice interaction.
- [ ] Test Luna creating a task.
- [ ] Test Luna listing/updating tasks.
- [ ] Test Luna creating a note.
- [ ] Test Luna searching notes.
- [ ] Test Luna internet search.
- [ ] Test Luna reading a webpage.
- [ ] Improve user-facing error state when Luna config is missing.
- [ ] Improve user-facing error state when agent is offline.

### 5. Settings, Auth, And Profile

- [x] Local registration exists.
- [x] Login/logout exists.
- [x] Session persistence exists.
- [x] Profile page exists.
- [x] Settings page exists.
- [x] Luna/LiveKit config commands exist.
- [ ] Manually test register/login/logout.
- [ ] Manually test session restore after restart.
- [ ] Manually test profile update.
- [ ] Manually test saving/loading Luna config.
- [ ] Improve config validation messages.
- [ ] Make first-time Luna setup clearer.

### 6. Navigation And App Shell

- [x] Rename visible app shell title to Quasar.
- [x] Rename login/register/landing branding to Quasar.
- [x] Add Notes to nav dock.
- [x] Polish nav dock styling.
- [ ] Manually test all protected routes.
- [ ] Confirm nav dock behavior feels good during real use.
- [ ] Confirm window title and built app metadata are Quasar.

### 7. Documentation

- [x] Add V1 roadmap.
- [x] Document Luna internet search setup.
- [x] Document Luna local setup basics.
- [ ] Rewrite README from template into Quasar docs.
- [ ] Add frontend run/build instructions.
- [ ] Add Tauri run/build instructions.
- [ ] Add Luna agent setup instructions.
- [ ] Add environment variable reference.
- [ ] Add troubleshooting for LiveKit, SQLite, and internet search.
- [ ] Add manual QA checklist.
- [ ] Add known limitations.

### 8. Repo Hygiene

- [ ] Decide whether `Luna_Agent/memory.json` should be tracked.
- [ ] Ignore/remove `Luna_Agent/__pycache__/`.
- [ ] Confirm generated files are ignored.
- [ ] Check for accidental secrets in `.env` or docs.
- [ ] Review deleted/modified `README.md` state.
- [ ] Review untracked docs/assets before release.
- [ ] Run final `git status --short` and clean intentional scope.

### 9. Validation Gates

- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [x] `cargo check` passes.
- [x] `python -m py_compile Luna_Agent\agent.py` passes.
- [ ] `npx tauri dev` starts successfully.
- [ ] Full manual auth flow passes.
- [ ] Full manual task flow passes.
- [ ] Full manual notes flow passes.
- [ ] Full manual Luna flow passes.

## Optional If Time Allows For V1

- [x] Add Luna delegation MVP.
- [x] Save delegated markdown/text artifacts.
- [ ] Add better UI for generated artifacts.
- [ ] Add basic reminders/notifications.
- [ ] Add richer task editing after creation.
- [ ] Add visible archive view for notes.
- [ ] Add dashboard productivity summary.

## Push To V1.1

- [ ] Cloud sync.
- [ ] Multi-user collaboration.
- [ ] Calendar page.
- [ ] Full Google Workspace polish.
- [ ] Document/file analysis UI.
- [ ] Background jobs UI.
- [ ] Full artifact manager.
- [ ] Multi-provider model routing.
- [ ] Mobile app.
- [ ] Plugin/marketplace system.

## Release Cut Rule

V1 can be cut when these are true:

- [ ] Dashboard, Tasks, Notes, Settings, and Luna are usable without obvious dead ends.
- [ ] Core local data survives app restart.
- [ ] Luna can operate on tasks and notes in a real session.
- [ ] Lint, build, Rust check, and Python syntax checks pass.
- [ ] Manual QA checklist is complete.
- [ ] README explains how to run the whole project.
- [ ] Repo hygiene is clean enough that generated files and secrets are not shipped.
