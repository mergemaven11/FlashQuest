# Arcade activity contract

FlashQuest Arcade treats a deck as **learning content** and an activity as a **runtime transformation of that content**. Games do not add game-specific columns to every `Deck` or `Card`, and Quest Rooms do not get a separate multiplayer game model.

## Why this boundary exists

The same Docker, math, accounting, law, Linux, community, or future deck should be usable in multiple study experiences. A deck remains the durable source of prompts and answers. The activity runtime chooses compatible cards, creates game-safe prompt payloads, controls reveal state, and emits results that can later be translated into per-user spaced-repetition updates.

```text
Deck + Cards
    │
    ▼
Activity adapter
    │
    ▼
ActivityRuntime
    ├── solo host
    └── Quest Room host (future realtime adapter)
              │
              ▼
      ActivityPublicState
```

## V1 runtime contract

`backend/app/activities.py` defines:

- `ActivityDefinition` — capabilities, card requirements, timer policy, and scoring identity.
- `ActivityRuntime` — internal deterministic runtime state. This object may contain answer-bearing round data and must not be serialized directly to clients.
- `ActivityPublicState` — the only phase-safe state intended for a browser or future room participant.
- `ActivityEvent` — explicit lifecycle transitions such as `round.locked`, `answer.revealed`, and `round.completed`.
- `ActivityParticipantState` — per-player score/streak/response state. It is intentionally separate from durable FlashQuest mastery.

The frontend mirror lives in `frontend/src/activityTypes.ts`.

## Phase safety

Correct-answer metadata is an internal runtime concern until reveal. Before a runtime reaches `reveal` or `result`, `ActivityPublicState.reveal` is `null`.

For Multiple-Choice Blitz, the prompt may contain the four possible answer texts because the learner needs to choose among them, but it does **not** contain the correct choice id or a separate answer field. For Match Quest, the prompt contains shuffled terms and definitions but not the answer mapping.

This matters for Quest Rooms: hiding an answer with CSS is not security. The room server must avoid sending answer-bearing payloads until the synchronized reveal transition.

## Determinism

Activities accept a session seed. The same deck content and seed produce the same shuffled activity state, which helps with:

- synchronized room rounds,
- reconnect debugging,
- reproducible tests,
- incident diagnosis when a generated round behaves unexpectedly.

If a caller does not supply a seed, FlashQuest derives one from the activity/deck/card identity.

## First adapters

### Multiple-Choice Blitz

- Minimum: 4 cards.
- A target prompt is paired with its correct definition and up to three distractors from compatible cards.
- Choices are shuffled deterministically.
- The correct choice id and answer appear only after reveal.

### Match Quest

- Minimum: 3 cards.
- Prompts and definitions are shuffled independently into one matching board.
- The term-to-definition answer map appears only after reveal.

Both adapters can be built in `solo` or `room` mode from the same definition/runtime code.

## Progress boundary

Activity scoring and durable learning progress are deliberately separate.

A later progress adapter can translate a participant result into a FlashQuest study result such as `correct` or `wrong`. A room's team score, aggregate percentage, or combo must never mutate another participant's spaced-repetition state.

## Accessibility and game feel

Activities should consume shared platform behavior rather than invent local alternatives:

- global sound/motion semantics from the game-feel system,
- reduced-motion behavior,
- keyboard operation,
- visible/text feedback that does not rely only on color or sound,
- optional/no-timer presentation where the activity definition permits it.

These concerns are tracked by the adaptable-mode/accessibility work and remain presentation choices; they do not change the learning content stored in a deck.

## What is intentionally not in V1

This contract does **not** add:

- database persistence for activity sessions,
- WebSocket transport,
- room membership/presence,
- matchmaking,
- leaderboards,
- a payment boundary,
- game-specific fields on every card.

Those features can build around the runtime after the contract is proven, rather than forcing the contract to depend on them first.
