# Delegation And Artifacts

## Purpose

Luna should stay responsive in realtime conversation while heavier tasks are delegated to worker logic. Delegation is the path for file analysis, writing, generated artifacts, and future multi-provider work.

## Owned Files

- `Luna_Agent/agent.py`
- `Luna_Delegation_Architecture.md`
- `src-tauri/src/commands/vault.rs`

## Current Capability

`DelegationTools` exposes `delegate_task`. It can call non-live Gemini and save generated outputs as artifacts.

Environment keys:

```env
LUNA_DELEGATION_OUTPUT_DIR=
LUNA_DELEGATION_INPUT_CHARS_PER_FILE=12000
LUNA_DELEGATION_MAX_OUTPUT_TOKENS=6000
```

Installed default output should point inside app data, not the source repository.

## Artifact Locations

Development-era docs mention `generated/`. Packaged release should prefer:

```text
%APPDATA%/com.quasar.app/Vault
```

or a similar app-data folder managed by `vault.rs`.

Current onboarding/runtime env also sets:

```env
AGENT_VAULT_PATH=%APPDATA%/com.quasar.app/Vault
```

## Recommended Architecture

- Luna realtime agent: user conversation, clarification, progress, final response.
- Delegation router: normalize request into a structured job.
- Worker: perform heavy work using Gemini non-live, local scripts, or future providers.
- Artifact store: save durable outputs and metadata.
- UI: expose generated artifacts through a vault page/section.

## Reproduction

1. Ensure `GOOGLE_API_KEY` is present.
2. Start Luna.
3. Ask: "Create a short markdown report about Quasar's release architecture."
4. Confirm Luna returns an artifact path.
5. Confirm the artifact exists in the configured output directory.
6. Confirm the artifact can be listed from Quasar's vault commands if wired into UI.

## Future Implementation Rule

Do not make long-running work block the realtime session permanently. The next mature version should add job records:

- `queued`
- `running`
- `needs_input`
- `completed`
- `failed`
- `cancelled`

Add tools:

- `check_job_status`
- `list_recent_jobs`
- `cancel_job`
- `open_artifact`
