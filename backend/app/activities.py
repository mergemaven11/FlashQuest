"""Reusable FlashQuest Arcade activity runtime.

This module intentionally has no database or transport dependency. Deck/Card
persistence supplies learning content, an activity adapter transforms that
content into a deterministic runtime, and solo/Quest Room hosts consume the
same phase-safe public state.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass, replace
from enum import Enum
from typing import Any, Iterable

from pydantic import BaseModel, Field


class ActivityType(str, Enum):
    """Activity families supported by the shared runtime contract."""

    BLITZ = "blitz"
    MATCH = "match"
    SORT = "sort"
    ORDER = "order"
    RECALL = "recall"
    DEBUG = "debug"
    STORY = "story"
    BOSS = "boss"


class ActivityMode(str, Enum):
    """Where an activity runtime is being hosted."""

    SOLO = "solo"
    ROOM = "room"


class ActivityPhase(str, Enum):
    """Server/runtime-controlled activity lifecycle."""

    LOBBY = "lobby"
    PROMPT = "prompt"
    HINT = "hint"
    LOCKED = "locked"
    REVEAL = "reveal"
    RESULT = "result"
    COMPLETE = "complete"


class TimerPolicy(str, Enum):
    """Whether an activity requires time pressure."""

    NONE = "none"
    OPTIONAL = "optional"
    REQUIRED = "required"


class ActivityDefinition(BaseModel):
    """Stable capabilities and content requirements for one activity type."""

    id: str
    version: int = Field(default=1, ge=1)
    type: ActivityType
    title: str
    description: str
    min_cards: int = Field(ge=1)
    max_cards: int = Field(ge=1)
    compatible_kinds: tuple[str, ...] = ("concept", "lab")
    timer_policy: TimerPolicy = TimerPolicy.OPTIONAL
    supports_hints: bool = False
    supports_reveal: bool = True
    supports_teams: bool = False
    supports_late_join: bool = True
    score_rule: str = "correct-answer"


class ActivityCard(BaseModel):
    """Transport-neutral learning content consumed by activity adapters."""

    id: int
    word: str
    definition: str
    domain: str = "General"
    kind: str = "concept"


class ActivityParticipantState(BaseModel):
    """Per-participant game state; durable mastery remains outside this model."""

    participant_id: str
    score: int = 0
    streak: int = 0
    response: str | None = None
    confidence: int | None = Field(default=None, ge=1, le=5)
    round_complete: bool = False


class ActivityEvent(BaseModel):
    """Explicit activity transition/event suitable for local or room transport."""

    type: str
    participant_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class ActivityPublicState(BaseModel):
    """Phase-safe state that may be sent to a browser or room participant."""

    session_id: str
    definition: ActivityDefinition
    mode: ActivityMode
    phase: ActivityPhase
    deck_id: int
    card_ids: list[int]
    round_index: int
    total_rounds: int
    seed: int
    payload: dict[str, Any]
    reveal: dict[str, Any] | None = None
    participants: list[ActivityParticipantState] = Field(default_factory=list)


@dataclass(frozen=True)
class _ActivityRound:
    """Internal round data. Answer-bearing fields never serialize directly."""

    payload: dict[str, Any]
    reveal: dict[str, Any]


@dataclass(frozen=True)
class ActivityRuntime:
    """Internal runtime shared by solo and future room synchronization hosts."""

    session_id: str
    definition: ActivityDefinition
    mode: ActivityMode
    phase: ActivityPhase
    deck_id: int
    card_ids: tuple[int, ...]
    seed: int
    rounds: tuple[_ActivityRound, ...]
    round_index: int = 0
    participants: tuple[ActivityParticipantState, ...] = ()


BLITZ_DEFINITION = ActivityDefinition(
    id="multiple-choice-blitz",
    type=ActivityType.BLITZ,
    title="Multiple-Choice Blitz",
    description="Pick the best answer from shuffled deck-based choices.",
    min_cards=4,
    max_cards=20,
    timer_policy=TimerPolicy.OPTIONAL,
    supports_hints=False,
    supports_teams=True,
)

MATCH_DEFINITION = ActivityDefinition(
    id="match-quest",
    type=ActivityType.MATCH,
    title="Match Quest",
    description="Match prompts to their definitions from the same deck.",
    min_cards=3,
    max_cards=10,
    timer_policy=TimerPolicy.OPTIONAL,
    supports_hints=False,
    supports_teams=True,
)

ACTIVITY_DEFINITIONS: dict[ActivityType, ActivityDefinition] = {
    ActivityType.BLITZ: BLITZ_DEFINITION,
    ActivityType.MATCH: MATCH_DEFINITION,
}


def _stable_seed(deck_id: int, activity_type: ActivityType, card_ids: Iterable[int]) -> int:
    """Derive a reproducible seed when a caller does not supply one."""
    material = f"{deck_id}:{activity_type.value}:{','.join(str(value) for value in card_ids)}"
    digest = hashlib.blake2b(material.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big")


def _validate_cards(
    definition: ActivityDefinition, cards: Iterable[ActivityCard]
) -> list[ActivityCard]:
    """Normalize and validate content against an activity definition."""
    rows = list(cards)
    unique: dict[int, ActivityCard] = {card.id: card for card in rows}
    rows = list(unique.values())
    if len(rows) < definition.min_cards:
        raise ValueError(
            f"{definition.title} needs at least {definition.min_cards} unique cards"
        )
    if any(card.kind not in definition.compatible_kinds for card in rows):
        raise ValueError(f"{definition.title} received an incompatible card kind")
    return rows


def _session_id(
    deck_id: int, activity_type: ActivityType, seed: int, mode: ActivityMode
) -> str:
    """Create a compact deterministic runtime id useful for replay/debug tests."""
    material = f"{deck_id}:{activity_type.value}:{seed}:{mode.value}"
    return hashlib.blake2b(material.encode("utf-8"), digest_size=10).hexdigest()


def _build_blitz_rounds(
    cards: list[ActivityCard], rng: random.Random, round_count: int
) -> tuple[_ActivityRound, ...]:
    """Build deterministic multiple-choice rounds with phase-safe payloads."""
    order = cards[:]
    rng.shuffle(order)
    rounds: list[_ActivityRound] = []
    for target in order[:round_count]:
        distractor_pool = [card for card in cards if card.id != target.id]
        distractors = rng.sample(distractor_pool, k=min(3, len(distractor_pool)))
        options = [target, *distractors]
        rng.shuffle(options)
        choices = [
            {"id": f"card-{card.id}", "text": card.definition} for card in options
        ]
        rounds.append(
            _ActivityRound(
                payload={
                    "card_id": target.id,
                    "prompt": target.word,
                    "domain": target.domain,
                    "kind": target.kind,
                    "choices": choices,
                },
                reveal={
                    "card_id": target.id,
                    "correct_choice_id": f"card-{target.id}",
                    "answer": target.definition,
                },
            )
        )
    return tuple(rounds)


def _build_match_rounds(
    cards: list[ActivityCard], rng: random.Random, pair_count: int
) -> tuple[_ActivityRound, ...]:
    """Build one matching board per round without exposing its answer map early."""
    selected = cards[:]
    rng.shuffle(selected)
    selected = selected[:pair_count]
    prompts = [
        {
            "card_id": card.id,
            "prompt": card.word,
            "domain": card.domain,
            "kind": card.kind,
        }
        for card in selected
    ]
    choices = [
        {"id": f"card-{card.id}", "text": card.definition} for card in selected
    ]
    rng.shuffle(choices)
    answer_map = {str(card.id): f"card-{card.id}" for card in selected}
    return (
        _ActivityRound(
            payload={"prompts": prompts, "choices": choices},
            reveal={"answer_map": answer_map},
        ),
    )


def build_activity_runtime(
    *,
    activity_type: ActivityType,
    deck_id: int,
    cards: Iterable[ActivityCard],
    mode: ActivityMode = ActivityMode.SOLO,
    seed: int | None = None,
    round_count: int = 5,
) -> ActivityRuntime:
    """Build a deterministic solo or room-hosted runtime from the same content."""
    if activity_type not in ACTIVITY_DEFINITIONS:
        raise ValueError(f"No v1 adapter exists for activity type: {activity_type.value}")
    definition = ACTIVITY_DEFINITIONS[activity_type]
    rows = _validate_cards(definition, cards)
    rows = rows[: definition.max_cards]
    resolved_seed = seed if seed is not None else _stable_seed(
        deck_id, activity_type, [card.id for card in rows]
    )
    rng = random.Random(resolved_seed)

    if activity_type == ActivityType.BLITZ:
        rounds = _build_blitz_rounds(
            rows, rng, min(max(1, round_count), len(rows), definition.max_cards)
        )
    elif activity_type == ActivityType.MATCH:
        rounds = _build_match_rounds(
            rows, rng, min(max(definition.min_cards, round_count), len(rows))
        )
    else:  # pragma: no cover - guarded by the registry above
        raise ValueError(f"No adapter for activity type: {activity_type.value}")

    return ActivityRuntime(
        session_id=_session_id(deck_id, activity_type, resolved_seed, mode),
        definition=definition,
        mode=mode,
        phase=ActivityPhase.PROMPT,
        deck_id=deck_id,
        card_ids=tuple(card.id for card in rows),
        seed=resolved_seed,
        rounds=rounds,
    )


def public_activity_state(runtime: ActivityRuntime) -> ActivityPublicState:
    """Serialize only data safe for the runtime's current phase."""
    if runtime.phase == ActivityPhase.COMPLETE:
        payload: dict[str, Any] = {}
        reveal = None
    else:
        current = runtime.rounds[runtime.round_index]
        payload = current.payload
        reveal = current.reveal if runtime.phase in {
            ActivityPhase.REVEAL,
            ActivityPhase.RESULT,
        } else None

    return ActivityPublicState(
        session_id=runtime.session_id,
        definition=runtime.definition,
        mode=runtime.mode,
        phase=runtime.phase,
        deck_id=runtime.deck_id,
        card_ids=list(runtime.card_ids),
        round_index=runtime.round_index,
        total_rounds=len(runtime.rounds),
        seed=runtime.seed,
        payload=payload,
        reveal=reveal,
        participants=list(runtime.participants),
    )


def apply_activity_event(runtime: ActivityRuntime, event: ActivityEvent) -> ActivityRuntime:
    """Apply a minimal deterministic lifecycle transition used by solo/room hosts."""
    if event.type == "round.locked":
        return replace(runtime, phase=ActivityPhase.LOCKED)
    if event.type == "answer.revealed":
        if runtime.phase not in {ActivityPhase.PROMPT, ActivityPhase.LOCKED}:
            raise ValueError("answer.revealed is only valid during prompt/locked phases")
        return replace(runtime, phase=ActivityPhase.REVEAL)
    if event.type == "round.completed":
        if runtime.phase not in {ActivityPhase.REVEAL, ActivityPhase.RESULT}:
            raise ValueError("round.completed requires a revealed round")
        next_index = runtime.round_index + 1
        if next_index >= len(runtime.rounds):
            return replace(runtime, phase=ActivityPhase.COMPLETE)
        return replace(
            runtime,
            round_index=next_index,
            phase=ActivityPhase.PROMPT,
        )
    if event.type == "session.completed":
        return replace(runtime, phase=ActivityPhase.COMPLETE)
    raise ValueError(f"Unsupported activity event: {event.type}")
