import { useCallback, useEffect, useMemo, useState } from "react";
import { binLabel, getStudyNext, postStudyAnswer } from "../api";
import type { StudyNext } from "../types";

type Feedback = {
  kind: "correct" | "wrong";
  title: string;
  detail: string;
  xp: number;
};

const readSessionNumber = (key: string): number => {
  const value = window.sessionStorage.getItem(key);
  const parsed = value ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function Study() {
  const [data, setData] = useState<StudyNext | null>(null);
  const [showDef, setShowDef] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // These are intentionally session-local game stats. Study mastery itself comes from the API.
  const [sessionXP, setSessionXP] = useState(() => readSessionNumber("flashquest-xp"));
  const [streak, setStreak] = useState(() => readSessionNumber("flashquest-streak"));
  const [bestStreak, setBestStreak] = useState(() => readSessionNumber("flashquest-best"));
  const [answered, setAnswered] = useState(() => readSessionNumber("flashquest-answered"));
  const [correct, setCorrect] = useState(() => readSessionNumber("flashquest-correct"));

  useEffect(() => {
    window.sessionStorage.setItem("flashquest-xp", String(sessionXP));
    window.sessionStorage.setItem("flashquest-streak", String(streak));
    window.sessionStorage.setItem("flashquest-best", String(bestStreak));
    window.sessionStorage.setItem("flashquest-answered", String(answered));
    window.sessionStorage.setItem("flashquest-correct", String(correct));
  }, [sessionXP, streak, bestStreak, answered, correct]);

  const level = Math.floor(sessionXP / 100) + 1;
  const xpIntoLevel = sessionXP % 100;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  const loadNext = useCallback(async (clearFeedback = true) => {
    setLoading(true);
    setErr(null);
    if (clearFeedback) setFeedback(null);
    try {
      const res = await getStudyNext();
      setData(res);
      setShowDef(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load the next challenge");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  const answer = useCallback(
    async (result: "correct" | "wrong") => {
      if (data?.status !== "ok" || loading) return;
      setLoading(true);
      setErr(null);
      try {
        const response = await postStudyAnswer(data.card.id, result);
        const nextStreak = result === "correct" ? streak + 1 : 0;
        const reward =
          result === "correct"
            ? 10 + response.to_bin * 2 + Math.min(nextStreak, 5) * 3
            : 2;

        setAnswered((value) => value + 1);
        setSessionXP((value) => value + reward);

        if (result === "correct") {
          setCorrect((value) => value + 1);
          setStreak(nextStreak);
          setBestStreak((value) => Math.max(value, nextStreak));
          setFeedback({
            kind: "correct",
            title: nextStreak >= 3 ? `🔥 ${nextStreak} hit combo!` : "✨ Nice recall!",
            detail: `Card advanced to mastery level ${response.to_bin}.`,
            xp: reward,
          });
        } else {
          setStreak(0);
          setFeedback({
            kind: "wrong",
            title: "💪 Training rep logged",
            detail: "The card is coming back sooner so you can lock it in.",
            xp: reward,
          });
        }

        await loadNext(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to submit answer");
      } finally {
        setLoading(false);
      }
    },
    [data, loadNext, loading, streak]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!data || loading) return;
      if (e.key === " ") {
        e.preventDefault();
        setShowDef(true);
      } else if (e.key === "1") {
        void answer("wrong");
      } else if (e.key === "2") {
        void answer("correct");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, loading, answer]);

  const mastery = useMemo(() => {
    if (data?.status !== "ok") return 0;
    return Math.round((data.card.bin / 11) * 100);
  }, [data]);

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <section className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-violet-300">
            <span>⚔️</span>
            <span>Memory Quest</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Train your recall. <span className="text-cyan-300">Level up.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Reveal the answer, make the call, and push cards through all 12 mastery levels.
          </p>
        </div>
        <div className="game-chip flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-300">
          <span className="rounded-lg bg-white/10 px-2 py-1 text-white">Space</span> reveal
          <span className="rounded-lg bg-rose-400/15 px-2 py-1 text-rose-200">1</span> miss
          <span className="rounded-lg bg-emerald-400/15 px-2 py-1 text-emerald-200">2</span> got it
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="game-panel p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-300">Player level</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <strong className="text-3xl font-black text-white">Lv. {level}</strong>
            <span className="text-xs font-bold text-slate-400">{xpIntoLevel}/100 XP</span>
          </div>
          <div className="xp-track mt-3"><div className="xp-fill" style={{ width: `${xpIntoLevel}%` }} /></div>
        </div>
        <div className="game-panel p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-300">Combo</p>
          <strong className="mt-2 block text-3xl font-black text-white">{streak > 0 ? `🔥 ${streak}` : "—"}</strong>
          <p className="mt-1 text-xs font-medium text-slate-400">Best this session: {bestStreak}</p>
        </div>
        <div className="game-panel p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">Accuracy</p>
          <strong className="mt-2 block text-3xl font-black text-white">{answered ? `${accuracy}%` : "—"}</strong>
          <p className="mt-1 text-xs font-medium text-slate-400">{correct} correct · {answered} attempts</p>
        </div>
        <div className="game-panel p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-300">Session XP</p>
          <strong className="mt-2 block text-3xl font-black text-white">⚡ {sessionXP}</strong>
          <p className="mt-1 text-xs font-medium text-slate-400">Game stats stay in this browser session.</p>
        </div>
      </section>

      {feedback && (
        <div
          className={[
            "reward-pop flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4",
            feedback.kind === "correct"
              ? "border-emerald-300/20 bg-emerald-400/10"
              : "border-amber-300/20 bg-amber-300/10",
          ].join(" ")}
          role="status"
        >
          <div>
            <p className="font-black text-white">{feedback.title}</p>
            <p className="mt-1 text-sm text-slate-300">{feedback.detail}</p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-950">+{feedback.xp} XP</div>
        </div>
      )}

      {err && (
        <div className="game-panel border-rose-400/25 p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <h2 className="font-black text-white">Quest interrupted</h2>
              <p className="mt-1 text-sm text-slate-400">{err}</p>
              <button
                className="game-button mt-4 bg-rose-300 px-4 py-2 text-sm text-rose-950"
                onClick={() => void loadNext()}
              >
                Retry encounter
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && !data && !err && (
        <div className="quest-card animate-pulse p-8 sm:p-10">
          <div className="h-5 w-32 rounded bg-white/10" />
          <div className="mt-8 h-12 w-2/3 rounded bg-white/10" />
          <div className="mt-8 h-24 rounded-2xl bg-white/[0.06]" />
        </div>
      )}

      {data?.status === "temporarily_done" && !err && (
        <div className="game-panel p-8 text-center sm:p-10">
          <div className="floaty mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-cyan-300/10 text-5xl">🌙</div>
          <h2 className="mt-6 text-2xl font-black text-white">Checkpoint reached</h2>
          <p className="mx-auto mt-2 max-w-md text-slate-400">Nothing is due right now. Your memory engine is doing its thing.</p>
          <button className="game-button mt-6 bg-cyan-300 px-5 py-3 text-cyan-950" onClick={() => void loadNext()}>
            Check for new quests
          </button>
        </div>
      )}

      {data?.status === "permanently_done" && !err && (
        <div className="game-panel p-8 text-center sm:p-12">
          <div className="floaty text-7xl">🏆</div>
          <h2 className="mt-5 text-3xl font-black text-white">Deck conquered!</h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-400">Every card has reached its terminal study state. That is a completed run.</p>
        </div>
      )}

      {data?.status === "ok" && !err && (
        <>
          <article className="quest-card answer-pop p-6 sm:p-10">
            <div className="relative z-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <span className="game-chip px-3 py-1.5 text-xs font-black text-violet-200">⭐ Mastery {data.card.bin}/11</span>
                  <span className="game-chip px-3 py-1.5 text-xs font-black text-cyan-200">⏳ ~{binLabel(data.card.bin)}</span>
                </div>
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{data.card.status}</span>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <span>Card mastery</span><span>{mastery}%</span>
                </div>
                <div className="xp-track"><div className="xp-fill" style={{ width: `${mastery}%` }} /></div>
              </div>

              <div className="py-10 text-center sm:py-14">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-violet-300">Your challenge</p>
                <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">
                  {data.card.word}
                </h2>

                {!showDef ? (
                  <button
                    className="game-button mt-10 bg-gradient-to-r from-violet-300 to-cyan-300 px-7 py-3.5 text-base text-slate-950 shadow-xl shadow-violet-950/30"
                    onClick={() => setShowDef(true)}
                  >
                    ✨ Reveal answer
                  </button>
                ) : (
                  <div className="answer-pop mx-auto mt-9 max-w-2xl rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-5 text-left sm:p-6">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">Answer unlocked</p>
                    <p className="mt-3 text-xl font-semibold leading-8 text-slate-100">{data.card.definition}</p>
                  </div>
                )}
              </div>
            </div>
          </article>

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              className="game-button border border-rose-300/20 bg-rose-400/15 px-5 py-4 text-left text-rose-100 shadow-lg shadow-rose-950/20 hover:bg-rose-400/25"
              onClick={() => void answer("wrong")}
              disabled={loading}
            >
              <span className="block text-xs font-black uppercase tracking-[0.14em] text-rose-300">1 · Missed it</span>
              <span className="mt-1 block text-sm font-semibold">Bring it back sooner</span>
            </button>
            <button
              className="game-button border border-emerald-300/20 bg-emerald-400/15 px-5 py-4 text-left text-emerald-50 shadow-lg shadow-emerald-950/20 hover:bg-emerald-400/25"
              onClick={() => void answer("correct")}
              disabled={loading}
            >
              <span className="block text-xs font-black uppercase tracking-[0.14em] text-emerald-300">2 · Nailed it</span>
              <span className="mt-1 block text-sm font-semibold">Advance mastery + combo</span>
            </button>
            <button
              className="game-button border border-white/10 bg-white/[0.05] px-5 py-4 text-left text-slate-200 hover:bg-white/10"
              onClick={() => void loadNext()}
              disabled={loading}
            >
              <span className="block text-xs font-black uppercase tracking-[0.14em] text-slate-400">Skip</span>
              <span className="mt-1 block text-sm font-semibold">Draw another card</span>
            </button>
          </div>

          <div className="game-panel overflow-hidden">
            <button
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              onClick={() => setShowLegend((value) => !value)}
              aria-expanded={showLegend}
            >
              <div>
                <p className="font-black text-white">🗺️ Mastery map</p>
                <p className="mt-1 text-xs text-slate-400">See how the 12 spaced-repetition levels stretch out review time.</p>
              </div>
              <span className="text-sm font-black text-violet-300">{showLegend ? "Close" : "Open"}</span>
            </button>
            {showLegend && (
              <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4 sm:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 12 }, (_, i) => (
                  <div
                    key={i}
                    className={[
                      "rounded-xl border p-3",
                      i === data.card.bin
                        ? "border-violet-300/40 bg-violet-400/15"
                        : "border-white/10 bg-white/[0.035]",
                    ].join(" ")}
                  >
                    <p className="text-xs font-black text-white">Level {i}</p>
                    <p className="mt-1 text-xs font-medium text-slate-400">{binLabel(i)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
