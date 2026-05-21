# Roadmap

## Phase 0 - Public-Safe Scaffold

- Create clean repo
- Add `.gitignore`, `.env.example`, README, agent guide, CLI shell, and tests
- Verify no private AutoSkool state is copied

## Phase 1 - Local Runtime Foundation

- Add config loader
- Add local state directory resolver
- Add structured logger
- Add JSON output mode
- Add command error conventions for agents

## Phase 2 - Auth and Read-Only Skool Access

- Add dedicated browser profile flow
- Detect `auth_token` presence without printing it
- Add session doctor
- Add read-only community feed command
- Add browser fallback notes and recovery instructions

Implemented foundation:

- `auth login/status/logout`
- HTTP primary transport with buildId resolution
- browser fallback contract for read recovery
- `community list/info/feed`

## Phase 3 - Queue-First Engagement

- Score posts for comment opportunities
- Draft comments without sending
- Store queue items locally
- Add approve/edit/ignore commands
- Add send command that requires approval

## Phase 4 - Reply Monitoring

- Detect replies from notifications first
- Classify low-signal acknowledgements
- Draft follow-ups
- Queue follow-ups for manual review

## Phase 5 - MCP and Dashboard

- Expose safe tools over MCP
- Add local dashboard for queue review
- Add workspace/community profiles
- Add export/import for public-safe demo data

Implemented foundation:

- safe MCP-style tool registry and calls
- local dashboard HTTP server
- queue and safety APIs

Next hardening:

- full MCP stdio server compatibility
- richer dashboard UI actions
- notifications list
