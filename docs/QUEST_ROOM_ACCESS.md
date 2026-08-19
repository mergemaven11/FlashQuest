# Quest Room access modes

Quest Rooms use three intentionally different access models. The browser UI mirrors these rules, but the FastAPI permission layer is the security boundary.

## Public

Public rooms are open to any signed-in learner who has the shared room link or room number.

- `GET /rooms/{id}` may return an open public room summary before membership.
- `POST /rooms/{id}/join` creates or restores normal public membership.
- A host may remove a member; a removed member cannot self-rejoin.
- Broad public-room directory/discovery remains deferred until the moderation workstream is ready.

## Invite only

Invite-only rooms are hidden from non-members and use explicit high-entropy capabilities for admission.

- Generic room-id reads and joins return `404` to non-members.
- Only the host can issue invite links.
- Invite tokens expire after a host-selected lifetime of 1–168 hours; the UI offers 24 hours, 3 days, and 7 days.
- The raw token is returned exactly once when an invite is created.
- PostgreSQL stores only the SHA-256 token hash plus metadata.
- Host invite listings expose expiry, usage, and revocation state but never the raw token or token hash.
- A token can be reused by a study group until it expires or is revoked.
- Revoking an invite blocks future admissions immediately; it does not eject people who already became members.
- A member marked `removed` cannot use an otherwise-valid invite to restore themselves.

The browser invite route accepts `/rooms/invite?token=...`, stores the capability in `sessionStorage`, and immediately replaces the visible URL with `/rooms/invite`. This keeps the shareable link practical while reducing token exposure in browser history and screenshots. After sign-in, the stored capability is exchanged for durable room membership and then removed from session storage.

## Private

Private rooms do not use generic join links.

- Generic room-id reads and joins return `404` to non-members.
- The host explicitly adds an existing verified FlashQuest account by email.
- The admitted account receives normal durable room membership and can then open the room directly.
- An explicit host add may restore a previously removed account; this is treated as a new host decision rather than self-service re-entry.

## Member removal and live revocation

Membership is durable PostgreSQL state, but removal also has to affect an already-open WebSocket.

When a host removes a member:

1. The membership row becomes `removed`.
2. Every live socket for that room/user is detached and closed with code `4403`.
3. Remaining room participants receive updated presence.
4. The removed browser returns to the Rooms hub.
5. New WebSocket tickets, chat, Arcade mutations, room history, and hidden-room reads are denied until the host explicitly restores membership where allowed.

This prevents the common failure mode where a user is removed in the database but keeps receiving realtime room events until they manually disconnect.

## Invite lifecycle and auditing

`RoomInvite` stores:

- room id
- issuing host id
- token hash
- creation and expiration timestamps
- optional revocation timestamp
- use count
- last-used timestamp

The invite is an admission capability, not a login session. Account authentication is still required before the capability can create room membership.
