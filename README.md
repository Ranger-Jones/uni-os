# UniOS

A Notion-inspired desktop app for organizing university studies — semesters, courses, notes, assignments, timetable, files, grades and flashcards in one place, with an AI assistant (Claude or OpenAI) that can read and update all of it.

![icon](build/icon.png)

## Download

Get the latest version from [Releases](https://github.com/Ranger-Jones/uni-os/releases/latest):

| System | File |
|---|---|
| macOS (Apple Silicon, M1–M4) | `UniOS-<version>-arm64.dmg` |
| macOS (Intel) | `UniOS-<version>-x64.dmg` |
| Windows 10/11 | `UniOS-Setup-<version>-x64.exe` |
| Linux | `UniOS-<version>-x86_64.AppImage` or `UniOS-<version>-amd64.deb` |

The builds are not signed with a paid Apple/Microsoft certificate, so the first launch needs one extra click:
- **macOS:** open the app once, then *System Settings → Privacy & Security → Open Anyway*.
- **Windows:** in the SmartScreen dialog choose *More info → Run anyway*.
- **Linux (AppImage):** `chmod +x UniOS-*.AppImage`, then run it.

## Features

- **Courses & semesters**: ECTS, lecturer, colour-coded register tabs, weekly timetable
- **Notes**: Notion-style block editor (slash menu, checklists, tables, code, images) with **LaTeX formula blocks** (`/Formula`), nested pages, trash, drag & drop
- **Assignments, exams & calendar**: week/month calendar generated from your timetable, Today dashboard with overdue/upcoming work and exam countdown
- **Grades**: German scale (1.0–5.0), weighted components per course, ECTS-weighted GPA, “what do I need” forecast
- **Files**: drag in lecture PDFs; text is extracted and searchable; in-app preview
- **Flashcards**: FSRS spaced repetition, generate cards from a note page with the assistant
- **Search** everything with ⌘K
- **Assistant** (⌘J): chat with Claude (default `claude-opus-5-5`) or OpenAI models; it uses tools to look up your notes, files, deadlines and grades, and asks before changing anything
- **MCP server**: Claude Desktop / Claude Code can use the same tools — even when UniOS is closed

All data stays local: `~/UniOS/unios.db` (SQLite) plus `~/UniOS/files/`. Daily snapshots go to a backup folder of your choice (iCloud Drive works well — keep the live data folder local).

## Development

Requires Node 24 and pnpm.

```bash
pnpm install
pnpm dev          # run the app with hot reload
pnpm test         # unit + MCP tests (runs under Electron's Node)
pnpm typecheck
pnpm test:e2e     # Playwright smoke test against the built app
pnpm dist         # macOS DMGs (arm64 + x64, ad-hoc signed)
pnpm dist:win     # Windows installer (NSIS)
pnpm dist:linux   # Linux AppImage + .deb
```

Useful environment variables:

| Variable | Purpose |
|---|---|
| `UNIOS_USER_DATA` | Settings folder (default `~/Library/Application Support/UniOS`) |
| `UNIOS_DATA_DIR` | Default data folder for a fresh install |
| `UNIOS_FAKE_LLM=1` | Scripted offline assistant for UI work without API costs |


## Architecture

```
src/core      pure TypeScript: SQLite schema & migrations, repositories, domain logic
              (grades, schedule, FSRS, markdown), LLM tools, chat loop, MCP server
src/main      Electron main process: window, typed IPC router, settings, keychain secrets,
              LLM providers (Anthropic, OpenAI), backups, file protocol
src/preload   contextBridge (`window.bridge`)
src/renderer  React UI (TanStack Router/Query, Tailwind, BlockNote)
src/mcp       stdio MCP server entry (run with the app binary + ELECTRON_RUN_AS_NODE=1)
```

Design and plan: [`docs/superpowers/specs`](docs/superpowers/specs) and [`docs/superpowers/plans`](docs/superpowers/plans).

## Connecting Claude

Settings → *Connect Claude* adds UniOS to Claude Desktop (a backup of your config is kept) and shows the `claude mcp add …` command for Claude Code.
