# CLI Spec

This is the initial intended command shape. Commands may change while the repo is young.

## Global Flags

- `--json` - machine-readable output
- `--profile <name>` - use a saved local profile
- `--community <slug>` - target Skool community
- `--yes` - confirm safe local-only operations, never bypass live outbound approval

## Current Commands

```powershell
autoskool help
autoskool version
autoskool doctor
autoskool agent-context
autoskool auth status
autoskool auth login
autoskool auth logout
autoskool community list --json
autoskool community info --community <slug> --json
autoskool community feed --community <slug> --limit 25 --json
autoskool community feed --community <slug> --limit 10 --include-media --json
autoskool queue list
autoskool queue add-demo
autoskool queue approve <id>
autoskool queue ignore <id>
autoskool queue send <id> --confirm
autoskool safety status
autoskool safety resume
autoskool posts opportunities --community <slug> --json
autoskool posts draft --post <id> --title <title> [--body <text>]
autoskool posts queue --post <id> --group <groupId> --title <title> --draft <text>
autoskool replies check --reply <id> --post <id> --title <title> --author <name> --text <text>
autoskool replies draft --reply <id> --post <id> --title <title> --author <name> --text <text>
autoskool replies queue --reply <id> --post <id> --group <groupId> --title <title> --author <name> --text <text>
autoskool mcp tools
autoskool mcp status
autoskool mcp call <tool>
autoskool dashboard start --port 4320
```

## Planned Commands

```powershell
autoskool notifications list --json
autoskool mcp start
```

## Exit Codes

- `0` success
- `1` runtime failure
- `2` usage error
- `3` auth/session required
- `4` approval required
- `5` safety pause active
