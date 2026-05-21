# Safety Model

Autoskool CLI is designed for careful community operations, not mass automation.

## Default Rule

No outbound Skool action should happen automatically by default.

Outbound actions include:

- comments
- replies
- post creation
- member approval/rejection/ban
- notification mark-read if it affects operator workflow

## Required Guards

- Human approval before send
- Local audit record for sent actions
- Duplicate prevention
- Minimum 3 minute gap before live comments/replies
- Random delay window for live actions
- Pause on auth refresh
- Pause on repeated auth or challenge failures

## Secrets and State

Never commit:

- `.env`
- cookies
- auth tokens
- browser profiles
- SQLite runtime databases
- raw community exports
- logs containing user/community data

Use `.env.example` and demo fixtures instead.

## Agent Behavior

Agents should:

- prefer read-only commands first
- draft and queue before sending
- explain what will be sent before requesting approval
- never bypass pacing or approval gates
- stop on auth/challenge failures instead of retrying aggressively

## Implemented Guards

- `auth status` reports only masked token metadata.
- `auth login` uses a dedicated browser profile.
- `queue add-demo`, `queue approve`, and `queue ignore` are local-only.
- `community info` and `community feed` are read-only.
- Skool transport uses HTTP first, browser fallback only for read recovery.
- `posts` and `replies` draft/queue commands do not send.
- `queue send` requires approved status plus final `--confirm`.
- `queue send` is blocked by active safety pauses.
- No bulk send command exists.
