import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  getLibraryDecks,
  getMyDecks,
} from "../api";
import {
  sendActivityEvent,
  startActivity,
} from "../arcadeApi";
import {
  shouldUseActivityTimer,
  type ActivityPublicState,
  type ActivityType,
} from "../activityTypes";
import { useAuth } from "../auth";
import { useExperience } from "../experienceContext";
import { useGameFeel } from "../gameFeelContext";
import type { DeckRead } from "../types";

type BlitzChoice = { id: string; text: string };
type BlitzPayload = {
  card_id: number;
  prompt: string;
  domain: string;
  kind: string;
  choices: BlitzChoice[];
};
type MatchPrompt = {
  card_id: number;
  prompt: string;
  domain: string;
  kind: string;
};
type MatchPayload = {
  prompts: MatchPrompt[];
  choices: BlitzChoice[];
};
type MatchMap = Record<string, string>;

type GameOption = {
  type: Extract<ActivityType, "blitz" | "match">;
  icon: string;
  title: string;
  detail: string;
  minCards: number;
};

const games: GameOption[] = [
  {
    type: "blitz",
    icon: "⚡",
    title: "Multiple-Choice Blitz",
    detail: "Five fast rounds. Pick the best answer and build a combo.",
    minCards: 4,
  },
  {
    type: "match",
    icon: "🧩",
    title: "Match Quest",
    detail: "Pair prompts with definitions using a keyboard- and touch-friendly board.",
    minCards: 3,
  },
];

function blitzPayload(state: ActivityPublicState): BlitzPayload {
  return state.payload as unknown as BlitzPayload;
}

function matchPayload(state: ActivityPublicState): MatchPayload {
  return state.payload as unknown as MatchPayload;
}

function participantScore(state: ActivityPublicState | null): number {
  return state?.participants[0]?.score ?? 0;
}

function resultRecord(state: ActivityPublicState): Record<string, unknown> {
  const reveal = state.reveal ?? {};
  const result = reveal.result;
  return typeof result === "object" && result !== null
    ? (result as Record<string, unknown>)
    : {};
}

function uniqueDecks(rows: DeckRead[]): DeckRead[] {
  const seen = new Set<number>();
  return rows.filter((deck) => {
    if (seen.has(deck.id)) return false;
    seen.add(deck.id);
    return true;
  });
}

export default function Arcade() {
  const { user } = useAuth();
  const { policy, preferences } = useExperience();
  const { play } = useGameFeel();
  const [params, setParams] = useSearchParams();

  const requestedDeck = Number(params.get("deck") || 0) || null;
  const requestedGame = params.get("game") === "match" ? "match" : "blitz";

  const [decks, setDecks] = useState<DeckRead[]>([]);
  const [deckId, setDeckId] = useState<number | null>(requestedDeck);
  const [gameType, setGameType] = useState<"blitz" | "match">(requestedGame);
  const [activity, setActivity] = useState<ActivityPublicState | null>(null);
  const [matches, setMatches] = useState<MatchMap>({});
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === deckId) ?? null,
    [decks, deckId]
  );
  const selectedGame = games.find((game) => game.type === gameType) ?? games[0];
  const canStart = Boolean(
    selectedDeck && selectedDeck.card_count >= selectedGame.minCards && !loading
  );

  const loadDecks = useCallback(async () => {
    setError(null);
    try {
      const publicPage = await getLibraryDecks({ page_size: 50, sort: "featured" });
      const mine = user ? await getMyDecks() : [];
      const all = uniqueDecks([...publicPage.items, ...mine]);
      setDecks(all);
      setDeckId((current) => {
        const wanted = requestedDeck ?? current;
        if (wanted && all.some((deck) => deck.id === wanted)) return wanted;
        return all[0]?.id ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Arcade decks");
    }
  }, [requestedDeck, user]);

  useEffect(() => {
    void loadDecks();
  }, [loadDecks]);

  useEffect(() => {
    if (!activity) return;
    const allowed = shouldUseActivityTimer(activity.definition, policy);
    if (!allowed) setTimerEnabled(false);
  }, [activity, policy]);

  useEffect(() => {
    setMatches({});
  }, [activity?.round_index, activity?.session_id]);

  const submitResponse = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!activity || !["prompt", "locked"].includes(activity.phase) || loading) return;
      setLoading(true);
      setError(null);
      try {
        const next = await sendActivityEvent(activity.session_id, {
          type: "response.submitted",
          payload,
        });
        setActivity(next);
        const result = resultRecord(next);
        const success =
          gameType === "blitz"
            ? result.correct === true
            : Number(result.correct_count ?? 0) === Number(result.total ?? -1);
        play(success ? "success" : "miss");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not submit Arcade response");
      } finally {
        setLoading(false);
      }
    },
    [activity, gameType, loading, play]
  );

  useEffect(() => {
    if (!activity || activity.phase !== "prompt" || !timerEnabled || loading) {
      setSecondsLeft(null);
      return;
    }
    const duration = gameType === "match" ? 45 : 20;
    let remaining = duration;
    let expired = false;
    setSecondsLeft(remaining);
    const timer = window.setInterval(() => {
      remaining -= 1;
      setSecondsLeft(Math.max(0, remaining));
      if (remaining > 0 || expired) return;
      expired = true;
      window.clearInterval(timer);
      if (gameType === "match") {
        void submitResponse({ matches });
      } else {
        void submitResponse({ choice_id: "" });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activity, gameType, loading, matches, submitResponse, timerEnabled]);

  useEffect(() => {
    if (!activity || activity.phase !== "prompt" || gameType !== "blitz") return;
    const choices = blitzPayload(activity).choices;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < choices.length) {
        event.preventDefault();
        void submitResponse({ choice_id: choices[index].id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activity, gameType, submitResponse]);

  async function beginGame() {
    if (!selectedDeck || !canStart) return;
    setLoading(true);
    setError(null);
    setMatches({});
    try {
      const next = await startActivity({
        deck_id: selectedDeck.id,
        activity_type: gameType,
        round_count: 5,
      });
      setActivity(next);
      setTimerEnabled(shouldUseActivityTimer(next.definition, policy));
      setParams({ deck: String(selectedDeck.id), game: gameType }, { replace: true });
      play("roundStart");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Arcade session");
    } finally {
      setLoading(false);
    }
  }

  async function revealWithoutScore() {
    if (!activity || loading) return;
    setLoading(true);
    setError(null);
    try {
      const next = await sendActivityEvent(activity.session_id, {
        type: "answer.revealed",
      });
      setActivity(next);
      play("reveal");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reveal this round");
    } finally {
      setLoading(false);
    }
  }

  async function nextRound() {
    if (!activity || loading) return;
    setLoading(true);
    setError(null);
    try {
      const next = await sendActivityEvent(activity.session_id, {
        type: "round.completed",
      });
      setActivity(next);
      setMatches({});
      if (next.phase === "complete") play("complete");
      else play("roundStart");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not continue Arcade session");
    } finally {
      setLoading(false);
    }
  }

  function resetGame(nextType?: "blitz" | "match") {
    const resolved = nextType ?? gameType;
    setActivity(null);
    setMatches({});
    setSecondsLeft(null);
    setGameType(resolved);
    if (deckId) setParams({ deck: String(deckId), game: resolved }, { replace: true });
  }

  const timerAllowed = activity
    ? shouldUseActivityTimer(activity.definition, policy)
    : policy.allowOptionalTimers;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <section className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="metric-label">🎮 FlashQuest Arcade</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Same deck. <span className="ember-text">Different game.</span>
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
            Play with any compatible Library or owned deck. Arcade points belong to this game run; your durable Study mastery stays separate in this first playable V1.
          </p>
        </div>
        <Link
          to="/preferences"
          className="game-button game-chip px-4 py-2 text-sm font-black text-slate-200"
        >
          🎚️ {preferences.learningMode} mode
        </Link>
      </section>

      {!activity && (
        <section className="game-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="metric-label">1 · Pick a deck</p>
            <select
              className="game-input mt-2"
              aria-label="Arcade deck"
              value={deckId ?? ""}
              onChange={(event) => setDeckId(Number(event.target.value))}
            >
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.is_official ? "⭐ " : deck.visibility === "private" ? "🔒 " : "🧑‍🚀 "}
                  {deck.title} · {deck.card_count}
                </option>
              ))}
            </select>
            {selectedDeck && (
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="flex flex-wrap gap-2 text-xs font-black">
                  <span className="game-chip px-2.5 py-1 text-[#ffba08]">{selectedDeck.is_official ? "⭐ Official" : "🧑‍🚀 Your/Community deck"}</span>
                  <span className="game-chip px-2.5 py-1 text-slate-300">{selectedDeck.subject}</span>
                  <span className="game-chip px-2.5 py-1 capitalize text-slate-300">{selectedDeck.difficulty}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-400">{selectedDeck.description}</p>
              </div>
            )}
          </div>

          <div>
            <p className="metric-label">2 · Pick a game</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {games.map((game) => {
                const active = gameType === game.type;
                const enoughCards = (selectedDeck?.card_count ?? 0) >= game.minCards;
                return (
                  <button
                    key={game.type}
                    type="button"
                    aria-pressed={active}
                    className={`game-button min-h-40 border p-5 text-left ${
                      active
                        ? "border-[#faa307]/60 bg-[#faa307]/10"
                        : "border-white/10 bg-black/15"
                    }`}
                    onClick={() => setGameType(game.type)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-3xl" aria-hidden="true">{game.icon}</span>
                      <span className={`text-xs font-black ${enoughCards ? "text-slate-500" : "text-rose-300"}`}>
                        {enoughCards ? `${game.minCards}+ cards` : `Needs ${game.minCards} cards`}
                      </span>
                    </div>
                    <h2 className="mt-4 text-xl font-black text-white">{game.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{game.detail}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/15 p-4">
              <div>
                <p className="text-sm font-black text-white">
                  {timerAllowed ? "⏱️ Optional timer available" : "🌿 Timer off in this mode"}
                </p>
                <p className="mt-1 text-xs text-slate-500">Arcade/Party allow optional timers. Chill/Focus keep the same game untimed.</p>
              </div>
              <button
                type="button"
                className="game-button bg-[#ffba08] px-5 py-3 font-black text-[#370617]"
                disabled={!canStart}
                onClick={() => void beginGame()}
                data-game-sound="roundStart"
              >
                {loading ? "Loading arena…" : `${selectedGame.icon} Start ${selectedGame.title}`}
              </button>
            </div>
          </div>
        </section>
      )}

      {error && (
        <section className="game-panel border-[#d00000]/50 p-5">
          <h2 className="font-black text-white">🛡️ Arcade interrupted</h2>
          <p className="mt-2 text-sm text-slate-300">{error}</p>
        </section>
      )}

      {activity && activity.phase !== "complete" && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="game-panel p-4">
              <p className="metric-label">Game</p>
              <strong className="mt-2 block text-xl font-black text-white">{activity.definition.title}</strong>
            </div>
            <div className="game-panel p-4">
              <p className="metric-label">Round</p>
              <strong className="mt-2 block text-2xl font-black text-white">{activity.round_index + 1}/{activity.total_rounds}</strong>
            </div>
            <div className="game-panel p-4">
              <p className="metric-label">Arcade score</p>
              <strong className="mt-2 block text-2xl font-black text-white">⚡ {participantScore(activity)}</strong>
            </div>
          </section>

          <section className="game-panel flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              <span className="game-chip px-3 py-1.5 text-xs font-black capitalize text-slate-300">🎚️ {preferences.learningMode}</span>
              {timerEnabled && secondsLeft !== null ? (
                <span className="game-chip px-3 py-1.5 text-xs font-black text-[#ffba08]" role="timer" aria-live="polite">⏱️ {secondsLeft}s</span>
              ) : (
                <span className="game-chip px-3 py-1.5 text-xs font-black text-slate-400">🌿 No timer</span>
              )}
            </div>
            {activity.definition.timer_policy === "optional" && timerAllowed && activity.phase === "prompt" && (
              <button
                type="button"
                className="game-button border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white"
                onClick={() => setTimerEnabled((value) => !value)}
              >
                {timerEnabled ? "Turn timer off" : "Turn timer on"}
              </button>
            )}
          </section>

          {gameType === "blitz" ? (
            <BlitzBoard
              state={activity}
              loading={loading}
              onAnswer={(choiceId) => void submitResponse({ choice_id: choiceId })}
              onReveal={() => void revealWithoutScore()}
              onNext={() => void nextRound()}
            />
          ) : (
            <MatchBoard
              state={activity}
              matches={matches}
              loading={loading}
              onMatch={(cardId, choiceId) =>
                setMatches((current) => ({ ...current, [String(cardId)]: choiceId }))
              }
              onSubmit={() => void submitResponse({ matches })}
              onReveal={() => void revealWithoutScore()}
              onNext={() => void nextRound()}
            />
          )}
        </>
      )}

      {activity?.phase === "complete" && (
        <section className="quest-card p-7 text-center sm:p-10">
          <div className="relative z-10">
            <div className="text-6xl" aria-hidden="true">🏆</div>
            <p className="metric-label mt-5">Run complete</p>
            <h2 className="mt-2 text-4xl font-black text-white">Arcade quest cleared!</h2>
            <p className="mt-4 text-5xl font-black text-[#ffba08]">⚡ {participantScore(activity)} pts</p>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400">
              These are game-session points. Your spaced-repetition mastery is still managed by Study in this V1, so a fast Arcade score cannot silently rewrite your durable learning history.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button
                className="game-button bg-[#ffba08] px-5 py-3 font-black text-[#370617]"
                onClick={() => resetGame()}
              >
                🔁 Play again
              </button>
              <button
                className="game-button border border-cyan-300/25 bg-cyan-300/[0.08] px-5 py-3 font-black text-cyan-100"
                onClick={() => resetGame(gameType === "blitz" ? "match" : "blitz")}
              >
                🎲 Switch game
              </button>
              {deckId && (
                <Link
                  to={`/study?deck=${deckId}`}
                  className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 font-black text-white"
                >
                  🧠 Study this deck
                </Link>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function BlitzBoard({
  state,
  loading,
  onAnswer,
  onReveal,
  onNext,
}: {
  state: ActivityPublicState;
  loading: boolean;
  onAnswer: (choiceId: string) => void;
  onReveal: () => void;
  onNext: () => void;
}) {
  const payload = blitzPayload(state);
  const result = resultRecord(state);
  const correctChoiceId = String(state.reveal?.correct_choice_id ?? "");
  const showResult = state.phase === "result" || state.phase === "reveal";

  return (
    <section className="quest-card p-5 sm:p-8">
      <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="game-chip px-3 py-1.5 text-xs font-black text-[#ffba08]">⚡ BLITZ</span>
          <span className="game-chip px-3 py-1.5 text-xs font-black text-slate-300">{payload.domain}</span>
        </div>
        <h2 className="mx-auto mt-8 max-w-4xl text-center text-3xl font-black leading-tight text-white sm:text-5xl">{payload.prompt}</h2>

        <div className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2">
          {payload.choices.map((choice, index) => {
            const correct = showResult && choice.id === correctChoiceId;
            return (
              <button
                key={choice.id}
                type="button"
                disabled={loading || showResult}
                onClick={() => onAnswer(choice.id)}
                className={`game-button min-h-28 border p-4 text-left ${
                  correct
                    ? "border-emerald-300/50 bg-emerald-300/[0.12] text-emerald-50"
                    : "border-white/10 bg-black/20 text-slate-100"
                }`}
              >
                <span className="text-xs font-black text-[#faa307]">{index + 1}</span>
                <span className="mt-2 block text-sm font-bold leading-6">{choice.text}</span>
                {correct && <span className="mt-2 block text-xs font-black text-emerald-200">✓ Correct answer</span>}
              </button>
            );
          })}
        </div>

        {showResult && (
          <div className="answer-pop mx-auto mt-6 max-w-3xl rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.08] p-5">
            {state.phase === "result" ? (
              <p className="text-sm font-black text-white">
                {result.correct === true ? "✨ Correct! +100 Arcade points" : "💪 Not quite — this one is worth another look."}
              </p>
            ) : (
              <p className="text-sm font-black text-white">👀 Answer revealed — no Arcade points awarded for this round.</p>
            )}
            <p className="mt-3 text-sm leading-6 text-cyan-50">{String(state.reveal?.answer ?? "")}</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!showResult ? (
            <button
              className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white"
              disabled={loading}
              onClick={onReveal}
            >
              👀 Reveal / skip round
            </button>
          ) : (
            <button
              className="game-button bg-[#ffba08] px-6 py-3 font-black text-[#370617]"
              disabled={loading}
              onClick={onNext}
            >
              Next round →
            </button>
          )}
        </div>
        {!showResult && <p className="mt-4 text-center text-xs text-slate-500">Keyboard: press 1–4 to answer.</p>}
      </div>
    </section>
  );
}

function MatchBoard({
  state,
  matches,
  loading,
  onMatch,
  onSubmit,
  onReveal,
  onNext,
}: {
  state: ActivityPublicState;
  matches: MatchMap;
  loading: boolean;
  onMatch: (cardId: number, choiceId: string) => void;
  onSubmit: () => void;
  onReveal: () => void;
  onNext: () => void;
}) {
  const payload = matchPayload(state);
  const result = resultRecord(state);
  const answerMap = (state.reveal?.answer_map ?? {}) as Record<string, string>;
  const showResult = state.phase === "result" || state.phase === "reveal";
  const completeBoard = payload.prompts.every((prompt) => Boolean(matches[String(prompt.card_id)]));
  const choiceText = new Map(payload.choices.map((choice) => [choice.id, choice.text]));

  return (
    <section className="quest-card p-5 sm:p-8">
      <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="game-chip px-3 py-1.5 text-xs font-black text-[#ffba08]">🧩 MATCH QUEST</span>
          <span className="game-chip px-3 py-1.5 text-xs font-black text-slate-300">{payload.prompts.length} pairs</span>
        </div>
        <h2 className="mt-6 text-2xl font-black text-white sm:text-3xl">Match each prompt to the best definition.</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">Native selects keep the board fully usable with keyboard, touch, switch controls, and screen-reader navigation — drag-and-drop is not required.</p>

        <div className="mt-6 grid gap-4">
          {payload.prompts.map((prompt, index) => {
            const selected = matches[String(prompt.card_id)] ?? "";
            const correctChoice = answerMap[String(prompt.card_id)] ?? "";
            const correct = showResult && selected === correctChoice;
            return (
              <div key={prompt.card_id} className="game-panel grid gap-3 p-4 lg:grid-cols-[1fr_1fr] lg:items-center">
                <div>
                  <p className="metric-label">Pair {index + 1} · {prompt.domain}</p>
                  <p className="mt-2 font-black leading-6 text-white">{prompt.prompt}</p>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-300" htmlFor={`match-${prompt.card_id}`}>Choose definition</label>
                  <select
                    id={`match-${prompt.card_id}`}
                    className="game-input mt-1.5"
                    disabled={loading || showResult}
                    value={selected}
                    onChange={(event) => onMatch(prompt.card_id, event.target.value)}
                  >
                    <option value="">Select a match…</option>
                    {payload.choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.text}</option>)}
                  </select>
                  {showResult && (
                    <div className="mt-2 text-xs leading-5">
                      <strong className={correct ? "text-emerald-200" : "text-rose-200"}>{correct ? "✓ Correct" : "✕ Not matched"}</strong>
                      <span className="ml-2 text-slate-400">Correct: {choiceText.get(correctChoice) ?? "—"}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {showResult && (
          <div className="answer-pop mt-5 rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.08] p-5">
            <p className="font-black text-white">
              {state.phase === "result"
                ? `🧩 ${Number(result.correct_count ?? 0)}/${Number(result.total ?? payload.prompts.length)} matched · +${Number(result.points ?? 0)} Arcade points`
                : "👀 Board revealed — no Arcade points awarded."}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!showResult ? (
            <>
              <button
                className="game-button bg-[#ffba08] px-6 py-3 font-black text-[#370617]"
                disabled={loading || !completeBoard}
                onClick={onSubmit}
              >
                Check my matches
              </button>
              <button
                className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white"
                disabled={loading}
                onClick={onReveal}
              >
                👀 Reveal board
              </button>
            </>
          ) : (
            <button
              className="game-button bg-[#ffba08] px-6 py-3 font-black text-[#370617]"
              disabled={loading}
              onClick={onNext}
            >
              Finish quest →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
