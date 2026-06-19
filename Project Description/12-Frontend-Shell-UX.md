# Frontend Shell UX

## Purpose

Quasar should feel like a modern desktop application, not a browser page. The shell owns window controls, navigation, first-run flow, and consistent app-wide interaction behavior.

## Owned Files

- `src/App.tsx`
- `src/index.css`
- `src/pages/Landing.tsx`
- `src/pages/Login.tsx`
- `src/pages/Register.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Settings.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/components/layout/SplashScreen.tsx`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/lib.rs`

## Shell Requirements

- Custom title bar with no visible "Quasar" text.
- Left-side back/forward buttons.
- Forward button disabled/greyed when unavailable.
- Window can be dragged reliably from the title bar.
- Double click should maximize/restore without disappearing.
- Close should minimize to tray unless quitting from tray.
- App should remain available from system tray.

## Splash Screen

When Quasar starts, show a transparent-background logo/splash experience with progress text such as:

- "Starting Quasar"
- "Loading modules"
- "Getting things ready"
- "Starting LiveKit"
- "Starting Luna"

Runtime startup events should update the frontend splash state.

## Scrollbars

Scrollbar behavior:

- Hidden by default.
- Appears only inside scrollable app content.
- Does not appear over the title bar.
- Does not shift page content when it appears.
- Appears on hover near the scroll area or while actively scrolling.

## First-Run Landing

If onboarding is incomplete, the app starts with a galaxy/stars themed landing screen and a single primary action:

```text
Let's reach the stars!
```

That action starts onboarding.

## Reproduction

1. Launch app from installed shortcut.
2. Confirm splash text progresses.
3. Confirm title bar drag works smoothly.
4. Confirm back/forward states are correct.
5. Confirm close sends app to tray.
6. Confirm tray can reopen and quit.
7. Confirm scrollbars do not shift content.
8. Clear app data and confirm first-run landing appears.

## Future Implementation Rule

UI changes should preserve desktop behavior first. Avoid page-level fixes that break app-shell drag regions, title bar hit testing, or tray lifecycle.
