# Tenant Storage & Archive Mirroring (Overview)

This document explains how tenant (school) personal MongoDBs, archive mirrors, and the archive webhook flow work in this server.

Summary
- The server supports per-institution (tenant) MongoDB URIs for running (primary) school data storage.
- Institutions may also have one or more historical/archive MongoDB URIs; these are read-only archives used for historical queries.
- When a primary write happens for school data models, the server schedules a background task to upsert the document into each configured archive URI and emits a JSON webhook to a configured event URL.

Key configuration locations
- Site settings (Admin UI): `Site Settings` → Storage. Adds and manages multiple MongoDB URIs. The newest/active URI is used as primary.
- Site settings keys saved in DB: `settings.mongodbUris`, `settings.mongodbUrl` (legacy), `settings.allowPersonalMongo`, `settings.allowPersonalStorage`, `site_config.value.eventWebhookUrl` (or `webhookUrl`).
- Env variables:
  - `EVENT_WEBHOOK_URL` — fallback webhook URL for events
  - `TENANT_MONGO_MIRROR_ENABLED` — set `true` to enable primary→tenant mirror for `User`/`Institution` documents
  - `TENANT_MONGO_STRICT` — when `true` (default) throws when tenant storage is unavailable; set `false` to allow primary fallback

How fallback rules work
- If `billing.useEasySchoolStorage` is `false` the institution explicitly uses personal storage and the active personal Mongo URI will be used as primary read/write.
- If `useEasySchoolStorage` is `true` but billing does not allow school storage and `allowPersonalMongo` is true and a personal URI is configured, the server will use the personal Mongo as the primary (fallback mode).
- For reads: if the primary tenant Mongo connection is not available, the server will attempt to read from configured archive URIs (read-only) when appropriate. This enables viewing historical data even if primary is down.
- For writes: writes always go to the primary (running) DB. Archive URIs are never used for writes except by the archive mirroring background task, which upserts historical copies.

Archive mirroring and webhooks (A → B → C)
- A (primary write): when a primary write completes for a model included in `schoolDataModels` (e.g., `Student`, `Teacher`, `Fee`, etc.), the server schedules:
  - B (mirror to archive): upsert document into each configured `archiveMongoUris` (non-blocking; failures are logged)
  - C (emit webhook): POST a JSON payload `{ model, document, institutionId, timestamp }` to `eventWebhookUrl` (site config) or `EVENT_WEBHOOK_URL`.

Testing
- Admin UI: add a MongoDB URI in `Site Settings` → Storage and toggle `Allow personal MongoDB fallback` if needed.
- Test endpoint (requires `head` role):
  - POST `/api/dev/test-archive` with body `{ "webhookUrl": "https://webhook.site/xxxx", "checkArchives": true }`
  - This creates a test `SmsLog`, waits briefly, and optionally checks archive URIs for the mirrored doc and reports results.
- Example curl (replace token and URLs):
```
curl -X POST 'https://<server>/api/dev/test-archive' \
  -H "Authorization: Bearer <HEAD_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://webhook.site/xxxx","checkArchives":true}'
```

Security & operational notes
- Keep personal Mongo URIs secret; they are masked in the admin UI but stored in site settings. Do not paste these in public logs.
- Archive mirror tasks are fire-and-forget and will be logged on failure — they do not block the primary write.
- If you want stronger guarantees for archiving, consider adding a queued job processor (RabbitMQ/Redis queue) to reliably retry archive mirror operations.

Where to look in code
- Tenant storage and mirroring logic: `src/config/tenantStorage.ts`
- Site settings: `src/routes/siteSettings.ts`
- Dev test route: `src/routes/devTest.ts`
- Client settings UI: `school-clint/app/settings/page.tsx`

If you want, I can add a UI button to trigger a test webhook and show per-archive mirror status in the Admin Settings page.

--
Generated: automatic developer doc
