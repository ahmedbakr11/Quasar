# Outlook Integration

## Purpose

Outlook support lets Luna search, read, draft, send, and mark Microsoft Outlook mail through Microsoft Graph.

## Owned Files

- `Luna_Agent/agent.py`
- `src/pages/Settings.tsx`
- `src-tauri/src/commands/runtime.rs`

## Environment Keys

```env
OUTLOOK_ENABLED=0
OUTLOOK_TENANT_ID=common
OUTLOOK_CLIENT_ID=
OUTLOOK_CLIENT_SECRET=
OUTLOOK_REFRESH_TOKEN=
OUTLOOK_ACCESS_TOKEN=
OUTLOOK_SCOPES=offline_access Mail.Read Mail.ReadWrite Mail.Send
OUTLOOK_TIMEOUT_SECONDS=20
```

`OUTLOOK_ACCESS_TOKEN` can be used for short-term testing. `OUTLOOK_REFRESH_TOKEN` is the better installed-app path because Luna can refresh access tokens.

## Azure App Registration

Recommended for personal Microsoft accounts:

- Supported account types: personal Microsoft accounts, or any Entra tenant plus personal accounts if both work/school and personal users are needed.
- Platform: mobile and desktop application or public/native client style.
- Redirect URI used during manual testing: `http://localhost`.

Required delegated Microsoft Graph permissions:

- `Mail.Read`
- `Mail.ReadWrite`
- `Mail.Send`
- `offline_access`

Admin consent is usually not needed for personal accounts, but tenant policies can block permissions for work/school accounts.

## Luna Tools

`OutlookTools` currently includes:

- `outlook_search_mail`
- `outlook_read_mail`
- `outlook_create_draft`
- `outlook_send_mail`
- `outlook_mark_mail_read`

## Reproduction

1. Register the app in Azure.
2. Add redirect URI `http://localhost`.
3. Request the scopes listed above.
4. Complete OAuth and exchange the authorization code immediately.
5. Save client ID and refresh token in Settings > Quirks.
6. Enable Outlook.
7. Restart Luna.
8. Ask: "Search my Outlook inbox for the latest email from Microsoft."
9. Ask a safe write test: "Create a draft email to myself with subject Quasar test."

## Troubleshooting

- `invalid_grant`: the auth code expired, was already used, or the redirect URI/scope/client ID does not exactly match.
- `unauthorized`: refresh token is missing, expired, revoked, or lacks required scopes.
- Luna cannot see tools: confirm `OUTLOOK_ENABLED=1` and restart Luna.
- Personal account issues: use `common` tenant and a registration that supports personal Microsoft accounts.

## Future Implementation Rule

Add Outlook calendar or contacts as separate tool methods and scopes. Do not overload mail tools with calendar behavior.
