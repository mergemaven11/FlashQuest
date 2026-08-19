# Quest Room Arcade V1

This slice makes the first three shared FlashQuest Arcade activities playable inside an existing Quest Room.

## Included

- Multiple-Choice Blitz in room mode
- Match Quest in room mode
- Sort the Stack in room mode
- host-controlled start, synchronized reveal, next round, and end
- server-held pending submissions before reveal
- shared `ActivityRuntime` / `ActivityPublicState` contract with solo Arcade
- late-join/reconnect activity recovery through `room.snapshot`
- room scoreboard after synchronized reveal
- live chat and presence while an activity is running
- host-paced, no-forced-timer presentation

## Sort the Stack

Sort the Stack presents terms and definitions, then asks the learner to place each card into its correct learning-domain bucket. The card's domain is the answer for this activity, so it is intentionally absent from the pre-reveal item payload. A compatible deck needs at least four cards across at least two distinct domains.

The same Sort adapter runs in solo Arcade and Quest Rooms. Room submissions follow the same synchronized spoiler boundary as Blitz and Match Quest.

## Spoiler boundary

A participant submission is not scored into public state immediately. The realtime host stores the response privately until the host reveals the round. At reveal time, every pending response is scored through the same server-side adapter used by solo Arcade, and only then are answer-bearing fields and score changes broadcast.

## Current durability boundary

The room, membership, and chat history remain durable PostgreSQL state. Active room Arcade runtime and unrevealed submissions are intentionally single-process ephemeral state in this phase. Horizontal realtime scale requires shared pub/sub/state before multiple instances can safely host one synchronized activity.

## Still tracked in #23

- Boss Battle
- Debug Dungeon for compatible decks
- additional shared-game polish and room challenge variants
