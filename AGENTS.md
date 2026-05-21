# Agent Guide

This repo is intended to be operated by both humans and AI agents.

## Ground Rules

- Treat the project as public by default.
- Never commit cookies, tokens, browser profiles, SQLite runtime state, logs, or real user/community exports.
- Keep outbound Skool actions behind explicit approval gates.
- Prefer commands that read, draft, and queue before commands that send.
- Keep CLI output useful for both humans and agents: plain help for humans, JSON modes for automation.

## Local Commands

```powershell
npm test
npm run doctor
npm run start -- --help
npm run start -- agent-context
npm run start -- auth status
npm run start -- community feed --community <slug> --json
npm run start -- queue list
npm run start -- mcp tools
npm run start -- dashboard start
```

Human shortcut equivalents:

```powershell
npm start -- me
npm start -- communities
npm start -- feed <slug> -n 10
npm start -- q ls
```

## Product Direction

Autoskool CLI should become a local SaaS-style operator toolkit:

- installable CLI
- local dashboard
- local state store
- MCP server
- safe human approval queue
- reusable Skool data layer

## Architecture Bias

Use the existing AutoSkool workspace for workflow lessons, not for blind copying.
Use the upstream `skool-pp-cli` for command and data-surface inspiration, not as an unquestioned product shape.

The first real implementation slices should be:

1. public-safe config and local state layout
2. browser auth/session doctor
3. read-only community/feed commands
4. draft queue
5. approval-gated send path
6. MCP server over the same command/core layer
