# Runtime Sidecars And Logging

## Purpose

The packaged app should manage LiveKit and Luna automatically. Users should not need to open separate terminals for normal use.

## Owned Files

- `src-tauri/src/commands/runtime.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/resources/bin/README.md`
- `scripts/build-luna-agent.ps1`
- `scripts/release-v1.ps1`

## Sidecars

Release sidecars:

- `livekit-server.exe`
- `luna-agent.exe`

Packaged path:

- `src-tauri/resources/bin/livekit-server.exe`
- `src-tauri/resources/bin/luna-agent.exe`

Developer override environment variables:

- `QUASAR_LIVEKIT_SERVER`: absolute path to LiveKit server binary.
- `QUASAR_LUNA_AGENT`: absolute path to Luna executable.
- `QUASAR_LUNA_WORKDIR`: working directory for Luna when using a fallback runtime.

## Runtime Behavior

- LiveKit binds to `127.0.0.1:7880`.
- LiveKit uses a generated config file in app data.
- LiveKit should not run in `--dev` mode for packaged release.
- Luna starts in worker/start mode.
- Runtime status is available through `get_runtime_status`.
- Luna and LiveKit can be restarted from Settings and tray actions.

## Logging

Logs are written under:

```text
%APPDATA%/com.quasar.app/logs
```

Expected files:

- `quasar.log`
- `livekit.log`
- `luna.log`

Sidecar stdout/stderr is captured separately. Logs rotate when large so the app does not grow unbounded.

## Shutdown Requirements

When Quasar exits, the runtime manager must stop Luna and LiveKit. Restart actions must kill or reuse the current process instead of spawning duplicate `luna-agent.exe` instances.

## Reproduction

1. Start Quasar.
2. Open Settings Runtime section.
3. Confirm LiveKit and Luna show running.
4. Restart Luna and check Task Manager has one Luna sidecar.
5. Exit Quasar from the tray.
6. Confirm `luna-agent.exe` and `livekit-server.exe` are gone.
7. Inspect `%APPDATA%/com.quasar.app/logs/luna.log` and `livekit.log`.

## Future Implementation Rule

Any new managed background process should be added to `RuntimeManager` with:

- process handle tracking
- log file capture
- restart action
- shutdown cleanup
- diagnostics output
