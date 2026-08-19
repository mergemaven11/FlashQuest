# Quest Room moderation

Quest Room moderation starts with explicit, reviewable controls rather than automatic punishment. The V1 separates **personal blocking**, **host room control**, and **platform review** so each action has a clear meaning.

## User reports

Active room members can report:

- the room itself,
- one durable chat message,
- one active room member.

A report stores immutable review context at submission time:

- room name,
- message body and author when reporting a message,
- target display name when reporting a user,
- reporter reason/details,
- creation and later review metadata.

This snapshot means a moderator can still understand the original report even if a message is later removed from normal room history.

Reports begin in `open` state. Configured moderators can mark them `reviewed`, `dismissed`, or `actioned`, with an optional review note. Each review transition creates an append-only `ModerationAudit` row.

## Moderator bootstrap

Moderator review endpoints are protected server-side by the comma-separated `MODERATOR_EMAILS` environment setting. There is intentionally no user-facing control that can grant moderator privileges.

The capability endpoint lets a signed-in frontend determine whether the current account is a configured moderator without exposing the configured email list.

## Blocking

A user block is **one-way personal visibility**, not a room ban.

- A learner may block another active learner only when they currently share a room.
- Blocks are idempotent and durable in PostgreSQL.
- The Room UI removes the blocked learner's retained messages from the blocker's current chat view and ignores future live chat from that user.
- Unblocking restores retained room history on the next history refresh immediately triggered by the UI.
- Blocking does not eject the other learner, change their role, or alter what other room members see.

This keeps a personal safety preference distinct from host moderation.

## Host removal

Host **Remove** remains the room-level ban mechanism.

- membership becomes `removed`,
- every live socket for that room/user is closed immediately,
- remaining participants receive updated presence,
- the removed account cannot self-rejoin a public room or use an invite to restore itself,
- private-room restoration requires a fresh explicit host decision.

Membership status plus removal/last-seen timestamps provide durable room-level history. Platform report-review actions use the separate moderation audit table.

## Realtime and privacy boundary

A block does not reveal hidden room ids or bypass room membership. Reporting requires active room membership, and message reports verify that the target message belongs to the named room.

Broad public-room discovery remains disabled until this moderation foundation is proven in production. Shared-link public rooms continue to use the same rate limits, host removal controls, reporting, and block behavior.
