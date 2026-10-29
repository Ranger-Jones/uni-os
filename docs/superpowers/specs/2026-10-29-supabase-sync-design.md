# Sync between devices through the user's own Supabase project — design

Requested 2026-10-29. Decisions (asked and confirmed): sync everything except big files; end-to-end encryption with a
sync password; notes merged block by block; automatic sync. The local SQLite database stays the source of truth, so
UniOS keeps working offline.

## Remote side (user's Supabase project, created by the user)
- One table `public.unios_sync (user_id, entity, id, payload, deleted, updated_at, device_id, seq)`, primary key
  `(user_id, entity, id)`; `seq` is set from a sequence by a trigger on every insert/update (pull cursor). Row level
  security: a user only sees rows with `user_id = auth.uid()`.
- `payload` = base64 of AES-256-GCM(JSON of the local row). Entity name, id, timestamps are clear text, content never is.
- One private storage bucket `unios-files`; objects live under `<uid>/…`, encrypted the same way; storage RLS by folder.
- A meta row (`entity = '_meta'`) holds the scrypt salt and an encrypted check value, so a second device can verify the
  sync password. The setup SQL is shown in the app and run once by the user in the SQL editor.

## Local side
- Migration 5: `sync_outbox (entity, id, deleted, rev)`, `sync_known (entity, id, updated_at, base)` and
  `sync_state (key, value)`. Triggers on the 16 synced tables record every insert/update/delete in the outbox — also
  changes made by the MCP server process — unless `sync_state.applying = '1'` (while remote changes are applied).
- Synced tables: semesters, courses, course_sessions, events, pages, grade_components, assignments, files, decks, cards,
  chat_threads, chat_messages, course_links, tests, test_questions, test_attempts. Derived data (page links, search index)
  is rebuilt after applying. Per-device data (settings, API keys) is not synced.
- Sync round: pull (cursor with a small overlap; skip own device's rows and rows already known), apply in one transaction
  with deferred foreign keys, parents first; then push the outbox in size-limited batches; an outbox entry is removed only
  if it did not change meanwhile.
- Conflicts (row changed locally and remotely since the last sync): pages → three-way merge of top-level blocks against
  the last synced version (`sync_known.base`): a block changed on one side wins, changed on both → the newer row's block;
  other columns and all other tables → the newer `updated_at` wins. Deletes win over unchanged rows, edits win over deletes.
- Files ≤ 50 MB and not video/audio are uploaded as `file/<id>`; images in notes as `asset/<path>`; downloaded on the
  other device when missing. Bigger files stay local (metadata and extracted text still sync).
- Key: scrypt(password, salt) → 32-byte key, kept per device in the OS keychain (safeStorage) next to the Supabase session.

## App
- Settings → Sync: project URL + anon key, setup SQL (copy), sign up / sign in, sync password, status, sync now, turn off.
- Automatic: on start, ~5 s after local changes, every 5 minutes. Sidebar status line. Errors are shown, never lose data.

## Tests
Two in-memory databases synced through a fake remote: create/update/delete in both directions, FK order, cascades,
conflicts (rows, pages merged), MCP-style direct writes, encryption (wrong password rejected), files and assets, overlap
and idempotency.
