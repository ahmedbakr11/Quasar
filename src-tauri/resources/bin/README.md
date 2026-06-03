# Quasar Runtime Sidecars

Place release sidecar binaries here before building the Windows installer:

- `livekit-server.exe`
- `luna-agent.exe`

The packaged app starts LiveKit with a generated config file, not `--dev`, and starts Luna with `start` mode.

Developer overrides:

- `QUASAR_LIVEKIT_SERVER`: absolute path to a LiveKit server binary.
- `QUASAR_LUNA_AGENT`: absolute path to a Luna executable.
- `QUASAR_LUNA_WORKDIR`: working directory for Luna when using a Python fallback.
