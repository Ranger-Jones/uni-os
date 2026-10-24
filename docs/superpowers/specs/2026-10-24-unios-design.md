# UniOS — Design Spec

Date: 2026-10-24 · Status: approved in chat

## 1. Purpose

UniOS is a personal, Notion-inspired desktop app for organizing university studies. One user, one Mac. It replaces scattered notes, to-do lists, calendars and grade spreadsheets with a single place where semesters, courses, notes, assignments, schedule, files, grades and flashcards live together — and where an LLM (Claude or OpenAI) can read and work with that data.

### Success criteria
- All courses of a semester can be created, with weekly schedule, ECTS, and color, and are browsable via sidebar.
- Notes are written in a Notion-like block editor (slash menu, headings, checklists, code, tables, images, math) and nested as page trees per course.
- Assignments/deadlines/exams show up in a Today view and a calendar.
- Grades: weighted components per course, ECTS-weighted GPA (German scale 1.0–5.0), forecast ("what do I need for target X").
- PDFs/files can be attached to courses; their text is searchable and usable by the LLM.
- Flashcards with spaced repetition (FSRS), generatable from notes by the LLM.
- In-app chat (Claude + OpenAI, switchable) that can query and (with confirmation) modify app data via tools.
- MCP server so Claude Desktop / Claude Code can read and modify app data, even while the app is closed.
- Data is stored locally and backed up automatically.

### Non-goals (v1)
- Multi-user, accounts, cloud sync server, mobile/web clients.
- Remote MCP endpoint for ChatGPT (ChatGPT is supported through the in-app chat).
- Code signing / notarization / auto-update.
- Windows builds (architecture keeps them possible).
- Real-time collaborative editing.

## 2. Constraints & decisions

| Topic | Decision |
|---|---|
| Platform | macOS (Apple Silicon), UI language English |
| Stack | Electron + React 19 + TypeScript, electron-vite, Tailwind v4 |
| DB | SQLite via better-sqlite3 (WAL mode), Drizzle ORM, FTS5 for search |
| Editor | BlockNote (JSON document stored per page, plain text mirror for search/LLM) |
| Grades | German scale 1.0–5.0, ECTS-weighted, pass/fail modules excluded from GPA |
| LLM | Anthropic SDK + OpenAI SDK, user-provided API keys, encrypted via Electron `safeStorage` (macOS Keychain) |
| MCP | `@modelcontextprotocol/sdk`, stdio transport, run with the app's Electron binary via `ELECTRON_RUN_AS_NODE=1` (so the native better-sqlite3 build matches) |
| SRS | `ts-fsrs` |
| PDF text | `unpdf` |
| Data location | User-chosen data folder (default `~/UniOS`): `unios.db` + `files/`. Automatic daily snapshot (`VACUUM INTO`) to a configurable backup folder (can be iCloud Drive). The live DB should not be placed in iCloud — the app warns if it is. |

## 3. Architecture

```
UniOS/
  src/
    core/        pure TS, no Electron imports — shared by app main process and MCP server
      db/        schema.ts (Drizzle), migrations, openDb(path)
      repo/      one module per entity (semesters, courses, pages, assignments, events, grades, files, cards, chats, search)
      domain/    grades.ts (GPA, course grade, forecast), srs.ts (FSRS wrapper), schedule.ts (expand weekly sessions to occurrences), blocks.ts (BlockNote JSON ↔ plain text/markdown)
      tools/     LLM tool definitions: name, description, zod input schema, handler(ctx, input), `mutates` flag
    main/        Electron main: window, IPC router, settings, secrets, file storage, PDF extraction, LLM service, backups
    preload/     contextBridge exposing a typed `window.api`
    renderer/    React app (TanStack Router, TanStack Query, Zustand for UI state)
    mcp/         MCP server entry (stdio): opens DB from settings, registers core/tools
  tests/         vitest unit tests (core), playwright e2e smoke
```

### Boundaries
- **core** is the only place that touches the DB schema. Main process and MCP server both call `core/repo` and `core/tools`. Everything in core is testable with an in-memory SQLite DB.
- **IPC**: one generic channel `api:invoke(method, args)` mapped to an explicit router object in main. Types for `window.api` are derived from the router so renderer calls are type-checked end to end. Streaming (chat) uses a separate event channel.
- **Renderer** never sees API keys or file system paths beyond what it needs to display.

### Concurrency (app + MCP writing the same DB)
- SQLite WAL + `busy_timeout = 5000`.
- The app polls `PRAGMA data_version` every 2 s; on change it emits `db:changed` to the renderer, which invalidates TanStack Query caches. That way edits made by Claude via MCP appear live.

## 4. Data model

All tables have `id` (text, ULID-like via `crypto.randomUUID()`), `created_at`, `updated_at` (ISO strings). Soft-delete is not used; deleting is real but the daily backup covers mistakes. Note pages go to a trash first (`deleted_at`) because they are the most valuable content.

- **semesters**: name, start_date, end_date, sort_order.
- **courses**: semester_id, name, code, ects (real), color, icon (emoji), lecturer, location, grading_mode (`graded` | `pass_fail`), target_grade (nullable), archived (bool), notes_overview (text).
- **course_sessions** (weekly schedule): course_id, kind (`lecture`|`tutorial`|`lab`|`seminar`|`other`), weekday (1=Mon..7), start_time, end_time (HH:MM), location, start_date/end_date (nullable → semester bounds).
- **events** (one-off): course_id (nullable), title, kind (`exam`|`deadline`|`appointment`|`other`), starts_at, ends_at (nullable), all_day, location, description.
- **pages**: course_id (nullable → global pages), parent_id (nullable), title, icon, content (BlockNote JSON text), content_text (plain text), sort_order, deleted_at.
- **assignments**: course_id, title, description, due_at (nullable), status (`todo`|`in_progress`|`done`|`submitted`), priority (`low`|`medium`|`high`), grade_component_id (nullable).
- **grade_components**: course_id, name, weight (real, percent), grade (real nullable, 1.0–5.0), passed (bool nullable, for pass/fail components), date (nullable).
- **files**: course_id, name, stored_path (relative to data folder), mime, size, text (extracted, nullable), page_count.
- **decks**: course_id (nullable), name.
- **cards**: deck_id, front, back, source_page_id (nullable), FSRS fields (due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review).
- **chat_threads**: title, course_id (nullable scope), provider, model.
- **chat_messages**: thread_id, role, content (JSON — text + tool calls/results), created_at.
- **search_fts** (FTS5 virtual, contentless-ish with explicit maintenance in repos): entity_type, entity_id, course_id, title, body.

### Grade rules (German system)
- Course grade = Σ(weight·grade) / Σ(weight of graded components). Weights need not sum to 100 while incomplete; displayed as "provisional" until all graded components have grades.
- Grades are truncated to one decimal for display per common German practice (e.g. 1.34 → 1.3) — configurable later; v1: truncate.
- GPA = Σ(ects·course_grade) / Σ(ects) over courses with `grading_mode = graded` and a final grade.
- Passed if grade ≤ 4.0.
- Forecast: given target GPA T and remaining ECTS (courses without final grade), required average = (T·(E_done+E_rem) − Σ ects·grade) / E_rem. Per course: required grade on remaining components to reach target_grade. Results outside [1.0, 4.0] are flagged as "not reachable" / "already safe".

## 5. UI

- **Window**: macOS hidden-inset title bar, left sidebar (resizable), main content, optional right chat panel (⌘J).
- **Sidebar**: Search (⌘K), Today, Calendar, Grades, Flashcards, Chat; then current semester's courses (color dot + emoji), each expandable to its page tree; "Other semesters" collapsible; global Pages; Settings at bottom.
- **Today**: today's sessions & events, overdue/upcoming assignments (next 14 days), cards due, quick-add.
- **Calendar**: week view (default) and month view; weekly sessions expanded from course_sessions; events and assignment due dates overlaid; click-to-create event.
- **Course view**: header (emoji, name, code, ECTS, lecturer, color) + tabs: Overview (schedule, upcoming, grade summary, overview text), Notes (page tree + editor), Assignments (table/board grouped by status), Files, Grades, Cards.
- **Page view**: Notion-like — big title, emoji icon, BlockNote editor, breadcrumbs, autosave (debounced 500 ms), sub-pages.
- **Grades view**: per-semester table of courses with ECTS, components, course grade; overall GPA; ECTS progress; forecast panel.
- **Flashcards**: deck list with due counts; review session (show front → reveal → Again/Hard/Good/Easy); card editor; "Generate from page" (LLM).
- **Chat**: thread list, provider/model picker, scope picker (All / specific course), streaming responses with markdown, tool-call chips; mutating tool calls show an inline "Apply / Reject" confirmation card.
- **Settings**: data folder, backup folder & last backup, API keys (Anthropic, OpenAI), default models, MCP setup (shows ready-to-paste config for Claude Desktop and the `claude mcp add` command for Claude Code, with "Install into Claude Desktop config" button), theme (system/light/dark).
- **Command palette (⌘K)**: full-text search over pages, files, assignments, courses + actions (new page, new assignment, go to …).

Visual style: calm, Notion-like neutrals, Inter font, course colors as accents, light + dark mode.

## 6. LLM integration

### Tools (core/tools, shared by in-app chat and MCP)
Read: `list_semesters`, `list_courses`, `get_course` (incl. sessions, components, upcoming), `list_pages`, `read_page` (markdown), `search` (FTS), `list_assignments` (filters: course, status, due range), `list_events` (range), `get_schedule` (range, expanded), `get_grades` (GPA + per course), `grade_forecast`, `list_files`, `read_file_text` (paged), `list_decks`, `list_cards`.
Write (`mutates: true`): `create_page`, `append_to_page`, `update_page` (replace content from markdown), `create_assignment`, `update_assignment`, `create_event`, `set_component_grade`, `create_flashcards` (batch).

Markdown → BlockNote conversion happens in core (BlockNote's headless markdown parser where available in Node; fallback: simple markdown → blocks converter covering headings, paragraphs, lists, checklists, code, quotes).

### In-app chat
- Providers behind one interface `LlmProvider.stream({system, messages, tools}) → AsyncIterable<Delta>`; implementations for Anthropic (Messages API, tool use) and OpenAI (Responses/Chat Completions with function tools).
- System prompt includes: today's date, current semester and course list (compact), and the active scope.
- Agentic loop in main process: stream → on tool call: read tools execute immediately; mutating tools pause and ask the renderer for approval → result fed back → continue until final answer (max 10 steps).
- Default models: Claude `claude-sonnet-5-5` (selectable: opus-5-5, haiku-4-5), OpenAI default model configurable in settings (free-text with suggestions).
- Context actions: "Ask about this page", "Summarize page", "Generate flashcards from page", "Explain this PDF" pre-fill a chat with scope.

### MCP server
- Entry `out/mcp/index.js`, started by Claude Desktop as: command = `/Applications/UniOS.app/Contents/MacOS/UniOS` (or dev Electron path), env `ELECTRON_RUN_AS_NODE=1`, args = [path to mcp script]. Reads data folder from the app's settings file (`~/Library/Application Support/UniOS/settings.json`).
- Registers all core tools. Mutating tools execute directly (Claude Desktop has its own per-tool approval UI).
- Also exposes resources: `unios://courses`, `unios://page/{id}`.

## 7. Error handling
- IPC errors are serialized `{code, message}` and shown as toasts; never crash the renderer.
- DB open failure (locked, missing folder) → blocking screen with "choose data folder" and the error.
- LLM: missing key → inline prompt to settings; HTTP/rate-limit errors displayed in the chat bubble with retry.
- PDF extraction failures are non-fatal: file saved, `text` null, badge "no text".
- Backups: failure logged + shown in Settings; never blocks app use.

## 8. Testing
- **Unit (vitest, Node)**: grade calculations & forecast, FSRS wrapper, schedule expansion, blocks↔markdown, every repo against in-memory SQLite, every tool handler (input validation + effect), migrations apply cleanly.
- **MCP**: in-process client ↔ server test listing tools and calling a read + write tool.
- **E2E (Playwright + Electron)**: smoke — launch with temp data folder, create semester + course, create page and type text, create assignment, see it in Today.
- `pnpm typecheck`, `pnpm test`, `pnpm lint` must pass at the end of each phase.

Note: better-sqlite3 is compiled for Electron's ABI in the app; vitest runs on system Node, so tests use a separately built copy. Approach: tests run under Electron's Node (`ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs`) so one native build serves both.

## 9. Phases
1. Foundation: scaffold, core DB + migrations, semesters/courses CRUD, sidebar/layout, settings & data folder, theme.
2. Notes: BlockNote editor, page tree, trash, FTS search, ⌘K palette.
3. Assignments, course sessions, events, calendar, Today.
4. Grades: components, course grade, GPA, forecast, grades view.
5. Files: import (drag & drop), storage, PDF text extraction, viewer.
6. LLM: core tools, provider abstraction, in-app chat with approvals, MCP server + setup UI.
7. Flashcards: decks, FSRS review, LLM generation.
8. Packaging: electron-builder DMG, app icon, backups polish, e2e smoke.
