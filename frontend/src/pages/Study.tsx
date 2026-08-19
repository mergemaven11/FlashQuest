import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  apiBaseURL,
  binLabel,
  getFeaturedDecks,
  getMyDecks,
  getStudyNext,
  postStudyAnswer,
  type StudyTrack,
} from "../api";
import { useAuth } from "../auth";
import { studyHint, studyTldr } from "../studyText";
import type { DeckRead, StudyNext } from "../types";

type Feedback = {
  kind: "correct" | "wrong";
  title: string;
  detail: string;
  xp: number;
};

const trackCopy: Record<StudyTrack, { title: string; detail: string; icon: string }> = {
  mixed: { title: "All cards", detail: "Mix concepts and labs", icon: "🎲" },
  concept: { title: "Concepts", detail: "Learn what things mean", icon: "📚" },
  lab: { title: "Break/Fix Labs", detail: "Pretend it broke. Find the fix", icon: "🔧" },
};

function sessionNumber(key: string): number {
  const parsed = Number(window.sessionStorage.getItem(key) ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function Study() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestedDeck = Number(params.get("deck") || 0) || null;

  const [decks, setDecks] = useState<DeckRead[]>([]);
  const [deckId, setDeckId] = useState<number | null>(requestedDeck);
  const [deckLoading, setDeckLoading] = useState(true);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [track, setTrack] = useState<StudyTrack>("mixed");
  const [data, setData] = useState<StudyNext | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showFullAnswer, setShowFullAnswer] = useState(false);
  const [showMastery, setShowMastery] = useState(false);
  const [skippedCardIds, setSkippedCardIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [xp, setXp] = useState(() => sessionNumber("flashquest-xp"));
  const [streak, setStreak] = useState(() => sessionNumber("flashquest-streak"));
  const [best, setBest] = useState(() => sessionNumber("flashquest-best"));
  const [answered, setAnswered] = useState(() => sessionNumber("flashquest-answered"));
  const [correct, setCorrect] = useState(() => sessionNumber("flashquest-correct"));

  useEffect(() => {
    window.sessionStorage.setItem("flashquest-xp", String(xp));
    window.sessionStorage.setItem("flashquest-streak", String(streak));
    window.sessionStorage.setItem("flashquest-best", String(best));
    window.sessionStorage.setItem("flashquest-answered", String(answered));
    window.sessionStorage.setItem("flashquest-correct", String(correct));
  }, [xp, streak, best, answered, correct]);

  const level = Math.floor(xp / 100) + 1;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const mastery = data?.status === "ok" ? Math.round((data.card.bin / 11) * 100) : 0;
  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === deckId) ?? null,
    [decks, deckId]
  );
  const hasMultipleDecks = !deckLoading && !deckError && decks.length > 1;

  const loadDecks = useCallback(async () => {
    setDeckLoading(true);
    setDeckError(null);
    try {
      const featured = await getFeaturedDecks();
      const mine = user ? await getMyDecks().catch(() => [] as DeckRead[]) : [];
      const all = [...featured, ...mine];

      if (all.length === 0) {
        setDecks([]);
        setDeckId(null);
        setData(null);
        setDeckError("No study decks are available right now.");
        return;
      }

      setDecks(all);
      setDeckId((current) => {
        const wanted = requestedDeck ?? current;
        if (wanted && all.some((deck) => deck.id === wanted)) return wanted;
        return featured[0]?.id ?? mine[0]?.id ?? null;
      });
    } catch (e) {
      setDecks([]);
      setDeckId(null);
      setData(null);
      setDeckError(e instanceof Error ? e.message : "Could not load decks");
    } finally {
      setDeckLoading(false);
    }
  }, [user, requestedDeck]);

  const loadNext = useCallback(
    async (clearFeedback = true, excludeIds: number[] = []) => {
      if (!deckId || deckLoading || deckError) return;
      setLoading(true);
      setError(null);
      if (clearFeedback) setFeedback(null);
      try {
        const next = await getStudyNext(track, deckId, excludeIds);
        setData(next);
        setShowHint(false);
        setShowAnswer(false);
        setShowFullAnswer(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the next card");
      } finally {
        setLoading(false);
      }
    },
    [deckId, deckLoading, deckError, track]
  );

  useEffect(() => {
    void loadDecks();
  }, [loadDecks]);

  useEffect(() => {
    if (deckLoading || deckError || !deckId) return;
    setSkippedCardIds([]);
    void loadNext();
  }, [deckId, track, deckLoading, deckError, loadNext]);

  function chooseDeck(id: number) {
    setData(null);
    setDeckId(id);
    setParams({ deck: String(id) }, { replace: true });
  }

  const answer = useCallback(
    async (result: "correct" | "wrong") => {
      if (data?.status !== "ok" || loading) return;
      setLoading(true);
      setError(null);
      try {
        const response = await postStudyAnswer(data.card.id, result);
        const nextStreak = result === "correct" ? streak + 1 : 0;
        const reward =
          result === "correct"
            ? 10 + response.to_bin * 2 + Math.min(nextStreak, 5) * 3
            : 2;
        setAnswered((value) => value + 1);
        setXp((value) => value + reward);
        if (result === "correct") {
          setCorrect((value) => value + 1);
          setStreak(nextStreak);
          setBest((value) => Math.max(value, nextStreak));
          setFeedback({
            kind: "correct",
            title: nextStreak >= 3 ? `🔥 ${nextStreak} hit combo!` : "✨ Nice recall!",
            detail: `Moved to mastery level ${response.to_bin}.`,
            xp: reward,
          });
        } else {
          setStreak(0);
          setFeedback({
            kind: "wrong",
            title: "💪 Good practice rep",
            detail: "This card will come back sooner so it can stick.",
            xp: reward,
          });
        }
        await loadNext(false, skippedCardIds);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save your answer");
      } finally {
        setLoading(false);
      }
    },
    [data, loading, streak, loadNext, skippedCardIds]
  );

  const skipCard = useCallback(async () => {
    if (data?.status !== "ok" || loading) return;
    const currentId = data.card.id;
    const nextSkipped = [
      ...skippedCardIds.filter((cardId) => cardId !== currentId),
      currentId,
    ].slice(-60);
    setSkippedCardIds(nextSkipped);
    await loadNext(true, nextSkipped);
  }, [data, loading, skippedCardIds, loadNext]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (loading || data?.status !== "ok") return;

      if (event.key.toLowerCase() === "h") setShowHint(true);
      if (event.key === " ") {
        event.preventDefault();
        setShowAnswer(true);
      }
      if (event.key.toLowerCase() === "s") void skipCard();
      if (event.key === "1") void answer("wrong");
      if (event.key === "2") void answer("correct");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, loading, answer, skipCard]);

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <section className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="metric-label">⚔️ Memory Quest</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white">
            Train your recall. <span className="ember-text">Level up.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Think first, ask for a hint if you want one, reveal the short answer, then dig deeper.
          </p>
        </div>
        <div className="game-chip flex flex-wrap gap-3 px-4 py-2 text-xs font-bold text-slate-300">
          <span>H · hint</span>
          <span>Space · reveal</span>
          <span>S · skip</span>
          <span>1/2 · rate</span>
        </div>
      </section>

      <section className="game-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="metric-label">How to play</p>
            <h2 className="mt-1 text-xl font-black text-white">Six tiny steps.</h2>
          </div>
          <span className="game-chip px-3 py-1.5 text-xs font-bold text-slate-300">
            No timer · no pressure
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["1", "🎯", "Pick", "Choose what you want to learn."],
            ["2", "👀", "Think", "Try it in your head first."],
            ["3", "💡", "Hint", "Ask for a nudge if you need it."],
            ["4", "✨", "Reveal", "Get the TL;DR, then full answer."],
            ["5", "✅", "Rate", "Missed it or got it?"],
            ["6", "⚡", "Continue", "Weak cards come back sooner."],
          ].map(([step, icon, title, detail]) => (
            <div key={step} className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="flex justify-between">
                <span className="text-2xl">{icon}</span>
                <span className="text-xs font-black text-[#f48c06]">STEP {step}</span>
              </div>
              <p className="mt-3 font-black text-white">{title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-2xl border border-[#faa307]/20 bg-[#faa307]/[0.07] p-4 text-sm text-slate-300">
          <b className="text-[#ffba08]">🔧 Lab card?</b> Pretend the thing is broken. Say what you would inspect first, then reveal the recovery path.
        </p>
      </section>

      <section className="game-panel grid gap-5 p-5 sm:p-6 lg:grid-cols-[.9fr_1.4fr]">
        <div>
          <p className="metric-label">{hasMultipleDecks ? "Choose a deck" : "Featured deck"}</p>
          {deckLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-2 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-slate-400"
            >
              ⏳ Loading deck…
            </div>
          ) : deckError ? (
            <div
              role="alert"
              className="mt-2 rounded-xl border border-[#d00000]/45 bg-[#6a040f]/25 px-4 py-4"
            >
              <p className="font-black text-rose-100">🛡️ Couldn’t load the deck</p>
              <p className="mt-1 text-sm leading-6 text-rose-100/75">{deckError}</p>
              <button
                type="button"
                className="game-button mt-3 bg-[#ffba08] px-4 py-2 text-sm font-black text-[#370617]"
                onClick={() => void loadDecks()}
              >
                ↻ Retry deck load
              </button>
            </div>
          ) : hasMultipleDecks ? (
            <select
              id="deck"
              aria-label="Choose a deck"
              className="game-input mt-2"
              value={deckId ?? ""}
              onChange={(e) => chooseDeck(Number(e.target.value))}
            >
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.is_builtin ? "⭐ " : ""}{deck.title} · {deck.card_count}
                </option>
              ))}
            </select>
          ) : selectedDeck ? (
            <div className="mt-2 rounded-xl border border-[#faa307]/30 bg-[#faa307]/[0.08] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-black text-white">
                  {selectedDeck.is_builtin ? "⭐ " : ""}{selectedDeck.title}
                </span>
                <span className="text-xs font-bold text-[#ffba08]">
                  {selectedDeck.card_count} cards
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-2 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-slate-400">
              No deck selected.
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {user
              ? "Your private decks appear here beside the featured deck."
              : "Fresh demo progress starts with every new browser session. Sign in when you want durable progress."}
          </p>
        </div>
        <div>
          <p className="metric-label">Choose a mode</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(Object.keys(trackCopy) as StudyTrack[]).map((value) => {
              const item = trackCopy[value];
              const active = track === value;
              return (
                <button
                  key={value}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-[#faa307]/70 bg-[#d00000]/20"
                      : "border-white/10 bg-black/15 hover:border-[#f48c06]/40"
                  }`}
                  onClick={() => setTrack(value)}
                  disabled={deckLoading || Boolean(deckError) || !deckId}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="ml-2 font-black text-white">{item.title}</span>
                  <span className="mt-1 block text-xs text-slate-400">{item.detail}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="game-panel p-4">
          <p className="metric-label">Player level</p>
          <div className="mt-2 flex items-end justify-between">
            <strong className="text-3xl font-black text-white">Lv. {level}</strong>
            <span className="text-xs font-bold text-slate-400">{xp % 100}/100 XP</span>
          </div>
          <div className="xp-track mt-3"><div className="xp-fill" style={{ width: `${xp % 100}%` }} /></div>
        </div>
        <div className="game-panel p-4">
          <p className="metric-label">Combo</p>
          <strong className="mt-2 block text-3xl font-black text-white">{streak ? `🔥 ${streak}` : "—"}</strong>
          <p className="mt-1 text-xs text-slate-400">Best: {best}</p>
        </div>
        <div className="game-panel p-4">
          <p className="metric-label">Accuracy</p>
          <strong className="mt-2 block text-3xl font-black text-white">{answered ? `${accuracy}%` : "—"}</strong>
          <p className="mt-1 text-xs text-slate-400">{correct} correct · {answered} tries</p>
        </div>
        <div className="game-panel p-4">
          <p className="metric-label">Session XP</p>
          <strong className="mt-2 block text-3xl font-black text-white">⚡ {xp}</strong>
          <p className="mt-1 text-xs text-slate-400">Skipped this run: {skippedCardIds.length}</p>
        </div>
      </section>

      {feedback && (
        <div className="reward-pop flex items-center justify-between gap-4 rounded-2xl border border-[#faa307]/30 bg-[#faa307]/10 px-5 py-4">
          <div>
            <p className="font-black text-white">{feedback.title}</p>
            <p className="mt-1 text-sm text-slate-300">{feedback.detail}</p>
          </div>
          <div className="rounded-xl bg-[#ffba08] px-3 py-2 text-sm font-black text-[#370617]">
            +{feedback.xp} XP
          </div>
        </div>
      )}

      {error && (
        <div className="game-panel border-[#d00000]/60 p-5">
          <h2 className="font-black text-white">🛡️ Quest interrupted</h2>
          <p className="mt-1 text-sm text-slate-300">{error}</p>
          <p className="mt-2 break-all text-xs text-slate-500">API: {apiBaseURL()}</p>
          <button
            className="game-button mt-4 bg-[#faa307] px-4 py-2 text-sm font-black text-[#370617]"
            onClick={() => void loadNext(true, skippedCardIds)}
          >
            Retry encounter
          </button>
        </div>
      )}

      {data?.status === "ok" && !error && (
        <>
          <article className="quest-card p-6 sm:p-10">
            <div className="relative z-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <span className="game-chip px-3 py-1.5 text-xs font-black text-[#ffba08]">
                    {data.card.kind === "lab" ? "🔧 LAB" : "📚 CONCEPT"}
                  </span>
                  <span className="game-chip px-3 py-1.5 text-xs font-black text-slate-300">
                    {data.card.domain}
                  </span>
                  <span className="game-chip px-3 py-1.5 text-xs font-black text-slate-300">
                    ⭐ Mastery {data.card.bin}/11
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-500">
                  {selectedDeck?.title ?? data.deck.title}
                </span>
              </div>

              <div className="mt-5 xp-track">
                <div className="xp-fill" style={{ width: `${mastery}%` }} />
              </div>

              <div className="py-10 text-center sm:py-14">
                <p className="metric-label">Your challenge</p>
                <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-black leading-tight text-white sm:text-5xl">
                  {data.card.word}
                </h2>

                {!showAnswer && (
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <button
                      className="game-button border border-violet-400/30 bg-violet-400/10 px-5 py-3 font-black text-violet-100"
                      onClick={() => setShowHint(true)}
                    >
                      💡 {showHint ? "Hint shown" : "Give me a hint"}
                    </button>
                    <button
                      className="game-button bg-[#ffba08] px-6 py-3 font-black text-[#370617]"
                      onClick={() => setShowAnswer(true)}
                    >
                      ✨ Reveal answer
                    </button>
                  </div>
                )}

                {showHint && !showAnswer && (
                  <div className="mx-auto mt-5 max-w-2xl rounded-2xl border border-violet-400/30 bg-violet-400/[0.08] p-5 text-left">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">💡 Hint</p>
                    <p className="mt-3 text-base font-semibold leading-7 text-violet-50">
                      {studyHint(data.card.word, data.card.domain, data.card.kind)}
                    </p>
                  </div>
                )}

                {showAnswer && (
                  <div className="mx-auto mt-8 grid max-w-2xl gap-4 text-left">
                    <div className="answer-pop rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.08] p-5">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">⚡ TL;DR</p>
                      <p className="mt-3 text-lg font-black leading-8 text-cyan-50">
                        {studyTldr(data.card.definition)}
                      </p>
                    </div>

                    <button
                      className="game-button w-full border border-[#faa307]/30 bg-[#faa307]/[0.07] px-5 py-3 text-left font-black text-[#ffba08]"
                      onClick={() => setShowFullAnswer((value) => !value)}
                    >
                      {showFullAnswer ? "▾ Hide full answer" : "▸ Read full answer"}
                    </button>

                    {showFullAnswer && (
                      <div className="answer-pop rounded-2xl border border-[#faa307]/25 bg-[#faa307]/[0.07] p-5">
                        <p className="metric-label">Full answer</p>
                        <p className="mt-3 text-lg font-semibold leading-8 text-slate-100">
                          {data.card.definition}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </article>

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              className="game-button border border-[#d00000]/40 bg-[#6a040f]/45 px-5 py-4 text-left text-rose-100"
              onClick={() => void answer("wrong")}
              disabled={loading}
            >
              <b className="block text-sm">1 · Missed it</b>
              <span className="mt-1 block text-xs text-rose-200/70">Bring it back sooner</span>
            </button>
            <button
              className="game-button border border-[#faa307]/40 bg-[#e85d04]/20 px-5 py-4 text-left text-[#ffba08]"
              onClick={() => void answer("correct")}
              disabled={loading}
            >
              <b className="block text-sm">2 · Got it</b>
              <span className="mt-1 block text-xs text-[#ffba08]/70">Advance mastery + combo</span>
            </button>
            <button
              className="game-button border border-white/10 bg-white/[0.04] px-5 py-4 text-left text-slate-200"
              onClick={() => void skipCard()}
              disabled={loading}
            >
              <b className="block text-sm">S · Skip</b>
              <span className="mt-1 block text-xs text-slate-500">Draw a different eligible card</span>
            </button>
          </div>

          <div className="game-panel overflow-hidden">
            <button
              className="flex w-full items-center justify-between px-5 py-4 text-left"
              onClick={() => setShowMastery((value) => !value)}
            >
              <div>
                <p className="font-black text-white">🗺️ Mastery map</p>
                <p className="mt-1 text-xs text-slate-400">Higher levels wait longer before review.</p>
              </div>
              <span className="text-xs font-black text-[#faa307]">{showMastery ? "Close" : "Open"}</span>
            </button>
            {showMastery && (
              <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4 sm:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 12 }, (_, index) => (
                  <div
                    key={index}
                    className={`rounded-xl border p-3 ${
                      index === data.card.bin
                        ? "border-[#faa307]/50 bg-[#d00000]/20"
                        : "border-white/10 bg-black/10"
                    }`}
                  >
                    <p className="text-xs font-black text-white">Level {index}</p>
                    <p className="mt-1 text-xs text-slate-500">{binLabel(index)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {data?.status === "temporarily_done" && !error && (
        <div className="game-panel p-9 text-center">
          <div className="text-5xl">🌙</div>
          <h2 className="mt-4 text-2xl font-black text-white">Checkpoint reached</h2>
          <p className="mt-2 text-sm text-slate-400">Nothing in this mode is due right now.</p>
          <button
            className="game-button mt-5 bg-[#ffba08] px-5 py-3 font-black text-[#370617]"
            onClick={() => void loadNext(true, skippedCardIds)}
          >
            Check again
          </button>
        </div>
      )}

      {data?.status === "permanently_done" && !error && (
        <div className="game-panel p-9 text-center">
          <div className="text-6xl">🏆</div>
          <h2 className="mt-4 text-2xl font-black text-white">Deck conquered!</h2>
          <p className="mt-2 text-sm text-slate-400">Everything in this mode has reached its terminal state.</p>
        </div>
      )}
    </div>
  );
}