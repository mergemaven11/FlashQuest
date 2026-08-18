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
import type { DeckRead, StudyNext } from "../types";

type Feedback = { kind: "correct" | "wrong"; title: string; detail: string; xp: number };

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
  const [track, setTrack] = useState<StudyTrack>("mixed");
  const [data, setData] = useState<StudyNext | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showMastery, setShowMastery] = useState(false);
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
  const selectedDeck = useMemo(() => decks.find((deck) => deck.id === deckId) ?? null, [decks, deckId]);

  const loadDecks = useCallback(async () => {
    try {
      const featured = await getFeaturedDecks();
      const mine = user ? await getMyDecks() : [];
      const all = [...featured, ...mine];
      setDecks(all);
      setDeckId((current) => {
        const wanted = requestedDeck ?? current;
        if (wanted && all.some((deck) => deck.id === wanted)) return wanted;
        return featured[0]?.id ?? mine[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load decks");
    }
  }, [user, requestedDeck]);

  const loadNext = useCallback(async (clearFeedback = true) => {
    if (!deckId) return;
    setLoading(true);
    setError(null);
    if (clearFeedback) setFeedback(null);
    try {
      const next = await getStudyNext(track, deckId);
      setData(next);
      setShowAnswer(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the next card");
    } finally {
      setLoading(false);
    }
  }, [deckId, track]);

  useEffect(() => { void loadDecks(); }, [loadDecks]);
  useEffect(() => { void loadNext(); }, [loadNext]);

  function chooseDeck(id: number) {
    setDeckId(id);
    setParams({ deck: String(id) }, { replace: true });
  }

  async function answer(result: "correct" | "wrong") {
    if (data?.status !== "ok" || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await postStudyAnswer(data.card.id, result);
      const nextStreak = result === "correct" ? streak + 1 : 0;
      const reward = result === "correct" ? 10 + response.to_bin * 2 + Math.min(nextStreak, 5) * 3 : 2;
      setAnswered((value) => value + 1);
      setXp((value) => value + reward);
      if (result === "correct") {
        setCorrect((value) => value + 1);
        setStreak(nextStreak);
        setBest((value) => Math.max(value, nextStreak));
        setFeedback({ kind: "correct", title: nextStreak >= 3 ? `🔥 ${nextStreak} hit combo!` : "✨ Nice recall!", detail: `Moved to mastery level ${response.to_bin}.`, xp: reward });
      } else {
        setStreak(0);
        setFeedback({ kind: "wrong", title: "💪 Good practice rep", detail: "This card will come back sooner so it can stick.", xp: reward });
      }
      await loadNext(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your answer");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (loading || data?.status !== "ok") return;
      if (event.key === " ") { event.preventDefault(); setShowAnswer(true); }
      if (event.key === "1") void answer("wrong");
      if (event.key === "2") void answer("correct");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, loading, streak, loadNext]);

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <section className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="metric-label">⚔️ Memory Quest</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white">Train your recall. <span className="ember-text">Level up.</span></h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Pick a deck, think before you reveal, then tell FlashQuest’s if you remembered it.</p>
        </div>
        <div className="game-chip flex gap-3 px-4 py-2 text-xs font-bold text-slate-300"><span>Space · reveal</span><span>1 · missed</span><span>2 · got it</span></div>
      </section>

      <section className="game-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="metric-label">How to play</p><h2 className="mt-1 text-xl font-black text-white">Five tiny steps.</h2></div><span className="game-chip px-3 py-1.5 text-xs font-bold text-slate-300">No timer · no pressure</span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["1", "🎯", "Pick a deck", "Choose what you want to learn."],
            ["2", "👀", "Read", "Try to answer in your head."],
            ["3", "✨", "Reveal", "Look at the real answer."],
            ["4", "✅", "Be honest", "Missed it or got it?"],
            ["5", "⚡", "Keep going", "FlashQuest brings weak cards back."],
          ].map(([step, icon, title, detail]) => <div key={step} className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="flex justify-between"><span className="text-2xl">{icon}</span><span className="text-xs font-black text-[#f48c06]">STEP {step}</span></div><p className="mt-3 font-black text-white">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p></div>)}
        </div>
        <p className="mt-4 rounded-2xl border border-[#faa307]/20 bg-[#faa307]/[0.07] p-4 text-sm text-slate-300"><b className="text-[#ffba08]">🔧 Lab card?</b> Pretend the thing is broken. Say what you would check first, then reveal the recovery path.</p>
      </section>

      <section className="game-panel grid gap-5 p-5 sm:p-6 lg:grid-cols-[.9fr_1.4fr]">
        <div><label className="metric-label" htmlFor="deck">Choose a deck</label><select id="deck" className="game-input mt-2" value={deckId ?? ""} onChange={(e) => chooseDeck(Number(e.target.value))}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.is_builtin ? "⭐ " : ""}{deck.title} · {deck.card_count}</option>)}</select><p className="mt-2 text-xs text-slate-500">⭐ is the public featured deck. Your private decks appear after sign in.</p></div>
        <div><p className="metric-label">Choose a mode</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{(Object.keys(trackCopy) as StudyTrack[]).map((value) => { const item = trackCopy[value]; const active = track === value; return <button key={value} className={`rounded-xl border p-3 text-left transition ${active ? "border-[#faa307]/70 bg-[#d00000]/20" : "border-white/10 bg-black/15 hover:border-[#f48c06]/40"}`} onClick={() => setTrack(value)}><span className="text-lg">{item.icon}</span><span className="ml-2 font-black text-white">{item.title}</span><span className="mt-1 block text-xs text-slate-400">{item.detail}</span></button>; })}</div></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="game-panel p-4"><p className="metric-label">Player level</p><div className="mt-2 flex items-end justify-between"><strong className="text-3xl font-black text-white">Lv. {level}</strong><span className="text-xs font-bold text-slate-400">{xp % 100}/100 XP</span></div><div className="xp-track mt-3"><div className="xp-fill" style={{ width: `${xp % 100}%` }} /></div></div>
        <div className="game-panel p-4"><p className="metric-label">Combo</p><strong className="mt-2 block text-3xl font-black text-white">{streak ? `🔥 ${streak}` : "—"}</strong><p className="mt-1 text-xs text-slate-400">Best: {best}</p></div>
        <div className="game-panel p-4"><p className="metric-label">Accuracy</p><strong className="mt-2 block text-3xl font-black text-white">{answered ? `${accuracy}%` : "—"}</strong><p className="mt-1 text-xs text-slate-400">{correct} correct · {answered} tries</p></div>
        <div className="game-panel p-4"><p className="metric-label">Session XP</p><strong className="mt-2 block text-3xl font-black text-white">⚡ {xp}</strong><p className="mt-1 text-xs text-slate-400">Game stats stay in this browser session.</p></div>
      </section>

      {feedback && <div className="reward-pop flex items-center justify-between gap-4 rounded-2xl border border-[#faa307]/30 bg-[#faa307]/10 px-5 py-4"><div><p className="font-black text-white">{feedback.title}</p><p className="mt-1 text-sm text-slate-300">{feedback.detail}</p></div><div className="rounded-xl bg-[#ffba08] px-3 py-2 text-sm font-black text-[#370617]">+{feedback.xp} XP</div></div>}
      {error && <div className="game-panel border-[#d00000]/60 p-5"><h2 className="font-black text-white">🛡️ Quest interrupted</h2><p className="mt-1 text-sm text-slate-300">{error}</p><p className="mt-2 break-all text-xs text-slate-500">API: {apiBaseURL()}</p><button className="game-button mt-4 bg-[#faa307] px-4 py-2 text-sm font-black text-[#370617]" onClick={() => void loadNext()}>Retry encounter</button></div>}

      {data?.status === "ok" && !error && (
        <>
          <article className="quest-card p-6 sm:p-10"><div className="relative z-10"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><span className="game-chip px-3 py-1.5 text-xs font-black text-[#ffba08]">{data.card.kind === "lab" ? "🔧 LAB" : "📚 CONCEPT"}</span><span className="game-chip px-3 py-1.5 text-xs font-black text-slate-300">{data.card.domain}</span><span className="game-chip px-3 py-1.5 text-xs font-black text-slate-300">⭐ Mastery {data.card.bin}/11</span></div><span className="text-xs font-bold text-slate-500">{selectedDeck?.title ?? data.deck.title}</span></div><div className="mt-5 xp-track"><div className="xp-fill" style={{ width: `${mastery}%` }} /></div><div className="py-10 text-center sm:py-14"><p className="metric-label">Your challenge</p><h2 className="mx-auto mt-4 max-w-3xl text-3xl font-black leading-tight text-white sm:text-5xl">{data.card.word}</h2>{!showAnswer ? <button className="game-button mt-9 bg-[#ffba08] px-6 py-3 font-black text-[#370617]" onClick={() => setShowAnswer(true)}>✨ Reveal answer</button> : <div className="answer-pop mx-auto mt-8 max-w-2xl rounded-2xl border border-[#faa307]/25 bg-[#faa307]/[0.07] p-5 text-left"><p className="metric-label">Answer unlocked</p><p className="mt-3 text-lg font-semibold leading-8 text-slate-100">{data.card.definition}</p></div>}</div></div></article>
          <div className="grid gap-3 sm:grid-cols-3"><button className="game-button border border-[#d00000]/40 bg-[#6a040f]/45 px-5 py-4 text-left text-rose-100" onClick={() => void answer("wrong")} disabled={loading}><b className="block text-sm">1 · Missed it</b><span className="mt-1 block text-xs text-rose-200/70">Bring it back sooner</span></button><button className="game-button border border-[#faa307]/40 bg-[#e85d04]/20 px-5 py-4 text-left text-[#ffba08]" onClick={() => void answer("correct")} disabled={loading}><b className="block text-sm">2 · Got it</b><span className="mt-1 block text-xs text-[#ffba08]/70">Advance mastery + combo</span></button><button className="game-button border border-white/10 bg-white/[0.04] px-5 py-4 text-left text-slate-200" onClick={() => void loadNext()} disabled={loading}><b className="block text-sm">Skip</b><span className="mt-1 block text-xs text-slate-500">Draw another card</span></button></div>
          <div className="game-panel overflow-hidden"><button className="flex w-full items-center justify-between px-5 py-4 text-left" onClick={() => setShowMastery((value) => !value)}><div><p className="font-black text-white">🗺️ Mastery map</p><p className="mt-1 text-xs text-slate-400">Higher levels wait longer before review.</p></div><span className="text-xs font-black text-[#faa307]">{showMastery ? "Close" : "Open"}</span></button>{showMastery && <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4 sm:grid-cols-4 lg:grid-cols-6">{Array.from({ length: 12 }, (_, index) => <div key={index} className={`rounded-xl border p-3 ${index === data.card.bin ? "border-[#faa307]/50 bg-[#d00000]/20" : "border-white/10 bg-black/10"}`}><p className="text-xs font-black text-white">Level {index}</p><p className="mt-1 text-xs text-slate-500">{binLabel(index)}</p></div>)}</div>}</div>
        </>
      )}

      {data?.status === "temporarily_done" && !error && <div className="game-panel p-9 text-center"><div className="text-5xl">🌙</div><h2 className="mt-4 text-2xl font-black text-white">Checkpoint reached</h2><p className="mt-2 text-sm text-slate-400">Nothing in this mode is due right now.</p><button className="game-button mt-5 bg-[#ffba08] px-5 py-3 font-black text-[#370617]" onClick={() => void loadNext()}>Check again</button></div>}
      {data?.status === "permanently_done" && !error && <div className="game-panel p-9 text-center"><div className="text-6xl">🏆</div><h2 className="mt-4 text-2xl font-black text-white">Deck conquered!</h2><p className="mt-2 text-sm text-slate-400">Everything in this mode has reached its terminal state.</p></div>}
    </div>
  );
}
