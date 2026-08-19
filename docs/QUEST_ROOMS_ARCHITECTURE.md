# Quest Rooms architecture

Quest Rooms are **deck-linked study session containers**. Chat, card sharing, presence, and synchronized Arcade activities all live inside the same room boundary rather than becoming separate social systems.

## State boundaries

| State | Storage | Why |
| --- | --- | --- |
| Room identity, host, deck, visibility, status | PostgreSQL | Must survive deploys/restarts |
| Membership and roles | PostgreSQL | Permissions cannot depend on a socket being connected |
| Message/card/activity history | PostgreSQL | Reconnect/history must be durable |
| Presence and connection counts | Ephemeral realtime process | Heartbeats should not write to the database continuously |
| Shared Arcade runtime | Realtime host, with phase-safe snapshots | Uses the same activity contract as solo Arcade |

The first realtime implementation may keep presence and active room runtime in memory while FlashQuest runs a single realtime instance. Before horizontal scale, a shared pub/sub layer is required so participants connected to different instances receive the same events.

## Persistent models

### `StudyRoom`

A room references one existing deck. It never copies deck/card content into room tables.

- `host_user_id`
- `deck_id`
- `name`
- `visibility`: `public | private | invite_only`
- `status`: `open | closed`
- creation/update/close timestamps

### `RoomMember`

Membership is durable permission state, not connection state.

- one row per `(room_id, user_id)`
- `role`: `host | moderator | member`
- `status`: `active | left | removed`
- join/last-seen/removal timestamps

A reconnect or second browser tab does not create a second membership row.

### `RoomMessage`

Messages are durable history with room/user attribution.

- `kind`: `chat | card | system | activity`
- text body
- optional `card_id`
- creation/removal timestamps

Presence is intentionally absent from this model.

## Deck privacy rules

A room must never widen the discoverability of its backing deck.

- Official/public decks may back public, private, or invite-only rooms.
- Unlisted decks may back private or invite-only rooms, but **not public rooms**.
- Private decks may only be used by their owner and may not back public rooms.
- Server-side checks enforce these rules; the UI is not the security boundary.

There is intentionally no public room-discovery endpoint in the foundation. Broad public-room discovery remains blocked until moderation/reporting work is ready.

## Membership lifecycle

Verified accounts may create rooms. The creator becomes the persistent `host` member in the same transaction.

Authenticated accounts may join open public rooms. Generic join does not bypass private/invite-only membership. A member who voluntarily left a public room may rejoin; a member marked `removed` cannot self-rejoin.

Only the host closes a room in the foundation. Closed rooms preserve membership/history but reject new joins.

## Realtime authentication

Browser WebSocket APIs should not receive long-lived account bearer tokens in query strings.

The planned connection flow is:

1. Authenticated HTTP client requests `POST /rooms/{id}/ws-ticket`.
2. Server validates membership/access and returns a short-lived, one-use opaque ticket.
3. Browser opens `WS /rooms/{id}/ws?ticket=...`.
4. Server consumes the ticket and binds the socket to the resolved room member.

Tickets should expire in roughly 30–60 seconds and are capabilities for one connection attempt, not replacement login sessions.

## Presence and reconnects

Presence is an in-memory connection registry keyed by room/user connection ids.

- Multiple tabs may create multiple live connections for one member.
- The member remains online until the final live connection closes or expires.
- Heartbeats update ephemeral connection expiry.
- `RoomMember.last_seen_at` may be updated opportunistically, not on every ping.
- Reconnect loads persistent membership/history and the current phase-safe activity snapshot.

## Realtime event envelope

Quest Rooms will use one versioned envelope for chat, presence, and games. Planned event types include:

- `presence.joined`
- `presence.left`
- `message.created`
- `card.shared`
- `room.updated`
- `activity.started`
- `activity.state`
- `activity.completed`
- `error`

Every mutation is authorized server-side regardless of what controls the client displays.

## Shared Arcade contract

Room games do **not** get a second multiplayer game engine. Quest Rooms host the same `ActivityRuntime` used by solo Arcade and broadcast only `ActivityPublicState`.

Correct answer ids/maps stay server-internal until synchronized reveal. Room/team score remains separate from each learner's spaced-repetition mastery. Future mastery updates go through the dedicated per-card progress adapter rather than mutating bins from room UI state.

## Moderation launch gate

Before broad public-room discovery ships, the realtime/message layer must include at least:

- message length limits
- per-user/room rate limits
- host kick/remove hooks
- room close hooks
- permission-checked message/card posting
- report/block/ban support from the moderation workstream

This foundation intentionally ships persistence and permissions before public social discovery.
