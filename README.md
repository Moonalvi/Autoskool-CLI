# Autoskool CLI

Autoskool CLI is a local-first Skool operator toolkit for humans and AI agents.

The goal is to make Skool community operations scriptable without turning them into unsafe blind automation. The tool is designed for local install, manual operation, AI-assisted workflows, and eventually a small local dashboard plus MCP server.

## Current Status

This repo is an early public-safe implementation. It can authenticate through a dedicated local browser profile, list joined communities, read community info and feeds, extract owner/section/like/comment/media metadata when Skool exposes it, score/draft engagement opportunities, queue drafts locally, and send approved comments through a guarded queue flow.

Working today:

```powershell
npm test
npm run doctor
npm run start -- --help
npm run start -- agent-context
npm run start -- auth status
npm run start -- auth logout
npm run start -- community list
npm run start -- community feed --community <slug>
npm run start -- posts opportunities --community <slug> --json
npm run start -- replies check --reply <id> --post <id> --title "Post title" --author "Member" --text "Reply text"
npm run start -- queue add-demo
npm run start -- queue list
npm run start -- mcp tools
npm run start -- dashboard start
```

Human-friendly shortcuts are also available:

```powershell
npm start -- communities
npm start -- feed <community-slug> -n 10
npm start -- info <community-slug>
npm start -- login
npm start -- me
npm start -- q ls
```

## Why This Exists

Existing Skool automation tends to fall into two risky shapes:

- browser scripts that are useful but hard to operate safely
- generic API wrappers that expose actions without a human workflow

Autoskool CLI aims for the middle:

- CLI commands for humans
- JSON-friendly output for agents
- local state and audit history
- review queues before outbound actions
- conservative pacing for any live write
- clear install and recovery docs

## Planned Capabilities

- `auth` - dedicated browser profile login, session checks, auth refresh guidance
- `community` - inspect community feed, labels, members, and metadata
- `posts` - find useful posts, score opportunities, draft comments, queue approvals
- `replies` - detect replies, classify whether they need follow-up, draft responses
- `queue` - review, edit, approve, ignore, and send queued actions
- `mcp` - local MCP server so AI agents can use the same safe command surface
- `dashboard` - local SaaS-style operator console

## Safety Principles

- No live outbound action should be automatic by default.
- Human approval is required before comments or replies are posted.
- Auth cookies, browser profiles, SQLite state, logs, and `.env` files stay local.
- Shared-account use should pause on auth refresh or suspicious failures.
- Live posting should use human pacing, with a minimum 3 minute gap and randomized delay.
- Agents should prefer read, draft, and queue commands before send commands.

## Auth

Auth is local-only and uses a dedicated browser profile by default. The CLI never prints the raw `auth_token`.

```powershell
npm run start -- auth status
npm run start -- auth login
npm run start -- auth logout
```

Short form:

```powershell
npm start -- me
npm start -- login
npm start -- logout
```

`auth login` opens Skool in the dedicated profile and waits for you to complete login manually. The saved session metadata lives under the local Autoskool profile state folder and is ignored by git.

## Queue

The queue is SQLite-backed and local-only. Phase 2 includes demo queue commands so the workflow can be tested without touching Skool:

```powershell
npm run start -- queue add-demo
npm run start -- queue list
npm run start -- queue approve <id>
npm run start -- queue ignore <id>
npm run start -- queue send <id> --confirm
```

`queue send` requires an approved queue item, final `--confirm`, no active safety pause, and persisted Skool evidence. No bulk send command exists.

## Read-Only Community Access

Community commands use direct HTTP first and browser fallback for read recovery. They require local auth from `auth login`, but they do not write to Skool.

```powershell
npm run start -- community list --json
npm run start -- community info --community <slug> --json
npm run start -- community feed --community <slug> --limit 25 --json
npm run start -- community feed --community <slug> --limit 10 --include-media --json
```

Short form:

```powershell
npm start -- communities
npm start -- info <slug>
npm start -- feed <slug> -n 25
npm start -- feed <slug> -n 10 --media
```

`community list` opens the dedicated browser profile in headless read-only mode and reads the Skool home page data for the authenticated account. It reports visible joined communities with slug, display name, owner name/profile when available, group ID when available, pinned status, and source URL.

`community feed` reports each post with comment count, like count, and the Skool section label when available, such as `General Discussion`, `Support Needed`, or `Announcements`.

Leave off `--json` for a clean terminal view. Use `--json` when an AI agent, script, or downstream tool needs the full structured payload.

Use `--include-media` when you need full media details for each returned post. It fetches each limited post page and includes `attachmentIds` plus normalized `attachments` for images, multi-image/carousel-style posts, documents/files, Skool videos, and linked videos when Skool exposes them.

For Skool-hosted videos, `--include-media` resolves expiring HLS stream URLs when the authenticated account can access them. Use the returned `streamHeaders` with the `streamUrl`; the URL is not permanent and expires at `expiresAt`.

## Engagement Drafting

Engagement commands are queue-first. They can score, draft, and queue, but they do not send live comments by themselves.

```powershell
npm run start -- posts opportunities --community <slug> --json
npm run start -- posts draft --post <id> --title "Question title" --body "Post body"
npm run start -- posts queue --post <id> --group <groupId> --title "Post title" --draft "Draft text"
npm run start -- replies check --reply <id> --post <postId> --title "Post title" --author "Member" --text "Reply text"
npm run start -- replies queue --reply <id> --post <postId> --group <groupId> --title "Post title" --author "Member" --text "Reply text"
```

## MCP and Dashboard

The MCP layer exposes safe local tools. The dashboard is a local operator console backed by the same queue and safety services.

```powershell
npm run start -- mcp tools
npm run start -- mcp status
npm run start -- dashboard start --port 4320
```

## Development

Requirements:

- Node.js 20+
- npm

Run:

```powershell
npm install
npm test
npm run doctor
npm run start -- --help
```

For local CLI-style usage from this checkout:

```powershell
npm link
autoskool --help
autoskool communities
autoskool feed <slug> -n 10
```

## Setup Help for Non-Technical Users

If the setup feels too technical, you can use an AI coding assistant such as Claude Code, Codex, Cursor, Windsurf, or another AI IDE to help you install and run it locally.

A useful prompt:

```text
Please help me set up this local Node.js CLI project safely. Install dependencies, run the doctor/test commands, start auth login, and do not print or commit any cookies, tokens, .env files, browser profiles, SQLite files, logs, or local state.
```

Recommended first commands:

```powershell
npm install
npm run doctor
npm start -- login
npm start -- communities
```

## Risk Notice

Autoskool CLI is an unofficial local tool and is not affiliated with Skool. Any automation or scraping may carry account, platform, privacy, or terms-of-service risk. Use conservative pacing, review queued drafts manually, and avoid bulk or spam-like actions.
