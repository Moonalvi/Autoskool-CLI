# MCP Plan

Autoskool CLI should expose an MCP server only after the same behavior exists in the CLI/core layer.

## Principle

MCP tools must not bypass CLI safety rules.

If a CLI action requires approval, the MCP tool should also require approval or create a queue item instead of sending.

## Planned Tools

- `autoskool_agent_context`
- `autoskool_queue_list`
- `autoskool_safety_status`

Future tools:

- `autoskool_auth_status`
- `autoskool_community_feed`
- `autoskool_post_opportunities`
- `autoskool_draft_comment`
- `autoskool_replies_check`
- `autoskool_draft_reply`

## Tool Output

MCP tools should return compact JSON with:

- stable IDs
- display text
- source links
- safety status
- next recommended operator action

## Prohibited Defaults

- no blind auto-commenting
- no raw cookie exposure
- no hidden retry loops on auth/challenge failures
- no mass member moderation
