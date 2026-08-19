"""Contract tests for solo and Quest Room-hosted Arcade activities."""

import json

import pytest

from app.activities import (
    ActivityCard,
    ActivityEvent,
    ActivityMode,
    ActivityPhase,
    ActivityType,
    apply_activity_event,
    build_activity_runtime,
    public_activity_state,
)


def _cards(count: int = 8) -> list[ActivityCard]:
    return [
        ActivityCard(
            id=index,
            word=f"Prompt {index}",
            definition=f"Definition {index}",
            domain="Testing" if index < 5 else "Advanced Testing",
            kind="concept",
        )
        for index in range(1, count + 1)
    ]


def test_blitz_is_deterministic_for_same_deck_cards_and_seed():
    first = build_activity_runtime(
        activity_type=ActivityType.BLITZ,
        deck_id=42,
        cards=_cards(),
        seed=12345,
        round_count=5,
    )
    second = build_activity_runtime(
        activity_type=ActivityType.BLITZ,
        deck_id=42,
        cards=_cards(),
        seed=12345,
        round_count=5,
    )

    first_state = public_activity_state(first)
    second_state = public_activity_state(second)
    assert first_state.payload == second_state.payload
    assert first_state.card_ids == second_state.card_ids
    assert first_state.seed == second_state.seed == 12345


def test_blitz_prompt_state_does_not_leak_correct_choice_or_answer():
    runtime = build_activity_runtime(
        activity_type=ActivityType.BLITZ,
        deck_id=7,
        cards=_cards(),
        seed=44,
    )
    state = public_activity_state(runtime)
    serialized = json.dumps(state.model_dump())

    assert state.phase == ActivityPhase.PROMPT
    assert state.reveal is None
    assert "correct_choice_id" not in serialized
    assert '"answer"' not in serialized
    assert len(state.payload["choices"]) == 4


def test_reveal_event_exposes_answer_only_after_runtime_transition():
    runtime = build_activity_runtime(
        activity_type=ActivityType.BLITZ,
        deck_id=7,
        cards=_cards(),
        seed=44,
    )
    revealed = apply_activity_event(runtime, ActivityEvent(type="answer.revealed"))
    state = public_activity_state(revealed)

    assert state.phase == ActivityPhase.REVEAL
    assert state.reveal is not None
    assert state.reveal["correct_choice_id"].startswith("card-")
    assert state.reveal["answer"].startswith("Definition")


def test_round_completion_advances_then_completes_session():
    runtime = build_activity_runtime(
        activity_type=ActivityType.BLITZ,
        deck_id=9,
        cards=_cards(4),
        seed=9,
        round_count=2,
    )
    runtime = apply_activity_event(runtime, ActivityEvent(type="answer.revealed"))
    runtime = apply_activity_event(runtime, ActivityEvent(type="round.completed"))
    assert runtime.phase == ActivityPhase.PROMPT
    assert runtime.round_index == 1

    runtime = apply_activity_event(runtime, ActivityEvent(type="answer.revealed"))
    runtime = apply_activity_event(runtime, ActivityEvent(type="round.completed"))
    assert runtime.phase == ActivityPhase.COMPLETE
    assert public_activity_state(runtime).payload == {}


def test_same_blitz_adapter_runs_in_solo_and_room_mode():
    solo = build_activity_runtime(
        activity_type=ActivityType.BLITZ,
        deck_id=12,
        cards=_cards(),
        mode=ActivityMode.SOLO,
        seed=222,
    )
    room = build_activity_runtime(
        activity_type=ActivityType.BLITZ,
        deck_id=12,
        cards=_cards(),
        mode=ActivityMode.ROOM,
        seed=222,
    )

    solo_state = public_activity_state(solo)
    room_state = public_activity_state(room)
    assert solo.definition == room.definition
    assert solo_state.payload == room_state.payload
    assert solo_state.card_ids == room_state.card_ids
    assert solo_state.mode == ActivityMode.SOLO
    assert room_state.mode == ActivityMode.ROOM


def test_match_quest_uses_same_phase_safe_runtime_contract():
    runtime = build_activity_runtime(
        activity_type=ActivityType.MATCH,
        deck_id=88,
        cards=_cards(6),
        mode=ActivityMode.ROOM,
        seed=777,
        round_count=5,
    )
    state = public_activity_state(runtime)
    serialized = json.dumps(state.model_dump())

    assert state.definition.type == ActivityType.MATCH
    assert state.total_rounds == 1
    assert len(state.payload["prompts"]) == 5
    assert len(state.payload["choices"]) == 5
    assert "answer_map" not in serialized

    revealed = apply_activity_event(runtime, ActivityEvent(type="answer.revealed"))
    reveal_state = public_activity_state(revealed)
    assert reveal_state.reveal is not None
    assert len(reveal_state.reveal["answer_map"]) == 5


def test_sort_stack_hides_domain_answer_map_until_reveal():
    runtime = build_activity_runtime(
        activity_type=ActivityType.SORT,
        deck_id=91,
        cards=_cards(8),
        mode=ActivityMode.ROOM,
        seed=321,
        round_count=6,
    )
    state = public_activity_state(runtime)
    serialized = json.dumps(state.model_dump())

    assert state.definition.type == ActivityType.SORT
    assert state.total_rounds == 1
    assert len(state.payload["items"]) == 6
    assert len(state.payload["buckets"]) == 2
    assert state.payload["axis"] == "domain"
    assert state.reveal is None
    assert "answer_map" not in serialized
    # Domain is the answer in this activity, so it must not ride inside an item.
    assert all("domain" not in item for item in state.payload["items"])

    revealed = apply_activity_event(runtime, ActivityEvent(type="answer.revealed"))
    reveal_state = public_activity_state(revealed)
    assert reveal_state.reveal is not None
    assert len(reveal_state.reveal["answer_map"]) == 6


def test_sort_stack_scores_domain_placements_through_shared_runtime():
    runtime = build_activity_runtime(
        activity_type=ActivityType.SORT,
        deck_id=92,
        cards=_cards(8),
        mode=ActivityMode.SOLO,
        seed=654,
        round_count=6,
    )
    hidden = runtime.rounds[runtime.round_index].reveal["answer_map"]
    placements = dict(hidden)
    first_card_id = next(iter(placements))
    placements[first_card_id] = "Definitely Wrong"

    scored = apply_activity_event(
        runtime,
        ActivityEvent(
            type="response.submitted",
            participant_id="learner-1",
            payload={"placements": placements},
        ),
    )
    state = public_activity_state(scored)
    result = state.reveal["result"] if state.reveal else {}

    assert state.phase == ActivityPhase.RESULT
    assert result["correct_count"] == 5
    assert result["total"] == 6
    assert result["perfect"] is False
    assert result["points"] == 417
    assert state.participants[0].response == "5/6"
    assert state.participants[0].score == 417


def test_sort_stack_same_adapter_runs_in_solo_and_room_mode():
    solo = build_activity_runtime(
        activity_type=ActivityType.SORT,
        deck_id=93,
        cards=_cards(8),
        mode=ActivityMode.SOLO,
        seed=111,
        round_count=6,
    )
    room = build_activity_runtime(
        activity_type=ActivityType.SORT,
        deck_id=93,
        cards=_cards(8),
        mode=ActivityMode.ROOM,
        seed=111,
        round_count=6,
    )

    assert public_activity_state(solo).payload == public_activity_state(room).payload
    assert solo.definition == room.definition
    assert solo.mode == ActivityMode.SOLO
    assert room.mode == ActivityMode.ROOM


def test_sort_stack_rejects_single_domain_deck():
    cards = [
        ActivityCard(
            id=index,
            word=f"One domain {index}",
            definition=f"Definition {index}",
            domain="Only Domain",
            kind="concept",
        )
        for index in range(1, 6)
    ]
    with pytest.raises(ValueError, match="at least two distinct domains"):
        build_activity_runtime(
            activity_type=ActivityType.SORT,
            deck_id=94,
            cards=cards,
            seed=9,
        )


def test_activity_rejects_too_few_cards():
    with pytest.raises(ValueError, match="needs at least 4 unique cards"):
        build_activity_runtime(
            activity_type=ActivityType.BLITZ,
            deck_id=1,
            cards=_cards(3),
        )


def test_activity_deduplicates_cards_by_id_before_validation():
    repeated = _cards(4)
    repeated.append(repeated[0])
    runtime = build_activity_runtime(
        activity_type=ActivityType.BLITZ,
        deck_id=1,
        cards=repeated,
        seed=1,
    )
    assert len(runtime.card_ids) == 4


def test_invalid_transition_cannot_complete_hidden_round():
    runtime = build_activity_runtime(
        activity_type=ActivityType.BLITZ,
        deck_id=1,
        cards=_cards(),
        seed=1,
    )
    with pytest.raises(ValueError, match="requires a revealed round"):
        apply_activity_event(runtime, ActivityEvent(type="round.completed"))
