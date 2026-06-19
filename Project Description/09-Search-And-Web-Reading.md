# Search And Web Reading

## Purpose

Luna can search the web and read webpages directly from the Python agent. This supports lightweight research without requiring a browser UI.

## Owned Files

- `Luna_Agent/agent.py`
- `src/pages/Settings.tsx`
- `src-tauri/src/commands/runtime.rs`

## Environment Keys

```env
LUNA_SEARCH_PROVIDER=brave
LUNA_SEARCH_FRESHNESS=
LUNA_SEARCH_SAFESEARCH=moderate
LUNA_WEB_TIMEOUT_SECONDS=12
LUNA_WEB_MAX_BYTES=1500000
LUNA_WEB_USER_AGENT=Quasar-Luna/0.1
```

The project originally used a no-key DuckDuckGo HTML path. The current intended provider key is `brave` where configured, with fallback/error handling in Luna.

## Luna Tools

`WebSearchTools` includes:

- `internet_search`
- `read_webpage`

## Reproduction

1. Open Quasar Settings > Quirks.
2. Set search provider and optional tuning values.
3. Restart Luna.
4. Ask: "Search the web for LiveKit Agents documentation."
5. Ask: "Read this webpage and summarize it: <url>."
6. Check `luna.log` if search fails.

## Adding A Better Search Provider

1. Add provider-specific environment keys in `runtime.rs`.
2. Add settings fields in `Settings.tsx`.
3. Implement a provider method in `WebSearchTools`.
4. Normalize results into the existing title/link/snippet format.
5. Keep timeouts and max bytes bounded.
6. Document provider setup and rate limits here.

## Future Implementation Rule

Search tools should return citations/links and never hide network failures. If a provider requires a paid API key, Settings should show whether the key is set without revealing it.
