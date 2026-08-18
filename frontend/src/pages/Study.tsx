import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiBaseURL,
  binLabel,
  getStudyNext,
  getStudyTopics,
  postStudyAnswer,
  type StudyTrack,
} from "../api";
import type { StudyNext, StudyTopicSummary } from "../types";

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

const trackCopy: Record<StudyTrack, { title: string; detail: string; icon: string }> = {
  mixed: { title: "All", detail: "Mix everything together", icon: "🎲" },
  concept: { title: "Concepts", detail: "Learn what things mean", icon: "📚" },
  lab: { title: "Labs", detail: "Pretend it broke. Figure out what to check", icon: "🔧" },
};

export default function Study() {
  const [data, setData] = useState<StudyNext | null>(null);
  const [topics, setTopics] = useState<StudyTopicSummary[]>([]);
  const [topic, setTopic] = useState("Platform Engineering");
  const [track, setTrack] = useState<StudyTrack>("mixed");
  const [showDef, setShowDef] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

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

  const loadTopics = useCallback(async () => {
    try {
      const rows = await getStudyTopics();
      setTopics(rows);
      if (rows.length > 0 && !rows.some((item) => item.topic === topic)) {
        setTopic(rows[0].topic);
      }
    } catch {
      // The study request below surfaces the actionable network error.
    }
  }, [topic]);

  const loadNext = useCallback(
    async (clearFeedback = true) => {
      setLoading(true);
      setErr(null);
      if (clearFeedback) setFeedback(null);
      try {
        const res = await getStudyNext(track, topic);
        setData(res);
        setShowDef(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load the next challenge");
      } finally {
        setLoading(false);
      }
    },
    [topic, track]
  );

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

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
            title: nextStreak >= 3 ? `🔥 ${nextStreak} hit combo!` : "✨ Nice work!",
            detail: `Card moved to mastery level ${response.to_bin}.`,
            xp: reward,
          });
        } else {
          setStreak(0);
          setFeedback({
            kind: "wrong",
            title: "💪 Good practice rep",
            detail: "FlashQuest’s will bring this one back sooner.",
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
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#ffba08]">
            <span>⚔️</span>
            <span>Memory Quest</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Learn it. <span className="text-[#faa307]">Remember it.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Pick a topic, answer one card at a time, and level up what sticks.
          </p>
        </div>
        <div className="game-chip flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-300">
          <span className="rounded-lg bg-white/10 px-2 py-1 text-white">Space</span> reveal
          <span className="rounded-lg bg-[#9d0208]/40 px-2 py-1 text-[#ffba08]">1</span> missed
          <span className="rounded-lg bg-[#faa307]/20 px-2 py-1 text-[#ffba08]">2</span> got it
        </div>
      </section>

      <section className="game-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffba08]">How to play</p>
            <h2 className="mt-1 text-xl font-black text-white">It works like a tiny memory game.</h2>
          </div>
          <span className="game-chip px-3 py-1.5 text-xs font-bold text-slate-300">No timer. No pressure.</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["1", "🎯", "Pick a topic", "Choose what you want to practice."],
            ["2", "👀", "Read the question", "Think of your answer first."],
            ["3", "✨", "Tap Reveal", "Now you can see the answer."],
            ["4", "✅", "Tell the truth", "Tap Missed it or Got it."],
            ["5", "⚡", "Keep going", "Cards come back until they stick."],
          ].map(([step, icon, title, detail]) => (
            <div key={step} className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{icon}</span>
                <span className="text-xs font-black text-[#f48c06]">STEP {step}</span>
              </div>
              <p className="mt-3 font-black text-white">{title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-[#faa307]/20 bg-[#faa307]/[0.07] p-4 text-sm text-slate-200">
          <strong className="text-[#ffba08]">🔧 Labs are pretend break/fix missions:</strong>{" "}
          imagine the system is broken, say what you would check first, then reveal the recovery path.
        </div>
      </section>

      <section className="game-panel grid gap-5 p-5 sm:p-6 lg:grid-cols-[0.9fr_1.4fr]">
        <div>
          <label htmlFor="topic" className="text-xs font-black uppercase tracking-[0.18em] text-[#ffba08]">
            1 · Choose a topic
          </label>
          <select
            id="topic"
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#03071e] px-4 py-3 font-bold text-white outline-none focus:border-[#faa307]/60"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            {topics.length === 0 && <option value={topic}>{topic}</option>}
            {topics.map((item) => (
              <option key={item.topic} value={item.topic}>
                {item.topic} · {item.total} cards
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">Add a new topic in Deck Lab and it will show up here.</p>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffba08]">2 · Choose how to practice</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(Object.keys(trackCopy) as StudyTrack[]).map((value) => {
              const option = trackCopy[value];
              const selected = value === track;
              return (
                <button
                  key={value}
                  className={[
                    "rounded-xl border p-3 text-left transition",
                    selected
                      ? "border-[#faa307]/70 bg-[#d00000]/20 shadow-lg shadow-[#6a040f]/20"
                      : "border-white/10 bg-black/15 hover:border-[#f48c06]/35 hover:bg-white/[0.04]",
                  ].join(" ")}
                  onClick={() => setTrack(value)}
                >
                  <span className="text-lg">{option.icon}</span>
                  <span className="ml-2 font-black text-white">{option.title}</span>
                  <span className="mt-1 block text-xs leading-4 text-slate-400">{option.detail}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="game-panel p-4">
          <p className="metric-label">Player level</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <strong className="text-3xl font-black text-white">Lv. {level}</strong>
            <span className="text-xs font-bold text-slate-400">{xpIntoLevel}/100 XP</span>
          </div>
          <div className="xp-track mt-3"><div className="xp-fill" style={{ width: `${xpIntoLevel}%` }} /></div>
        </div>
        <div className="game-panel p-4">
          <p className="metric-label">Combo</p>
          <strong className="mt-2 block text-3xl font-black text-white">{streak > 0 ? `🔥 ${streak}` : "—"}</strong>
          <p className="mt-1 text-xs text-slate-400">Best this session: {bestStreak}</p>
        </div>
        <div className="game-panel p-4">
          <p className="metric-label">Accuracy</p>
          <strong className="mt-2 block text-3xl font-black text-white">{answered ? `${accuracy}%` : "—"}</strong>
          <p className="mt-1 text-xs text-slate-400">{correct} correct · {answered} attempts</p>
        </div>
        <div className="game-panel p-4">
          <p className="metric-label">Session XP</p>
          <strong className="mt-2 block text-3xl font-black text-white">⚡ {sessionXP}</strong>
          <p className="mt-1 text-xs text-slate-400">Game stats stay in this browser session.</p>
        </div>
      </section>

      {feedback && (
        <div className="reward-pop flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#faa307]/30 bg-[#faa307]/10 px-5 py-4" role="status">
          <div>
            <p className="font-black text-white">{feedback.title}</p>
            <p className="mt-1 text-sm text-slate-300">{feedback.detail}</p>
          </div>
          <div className="rounded-xl bg-[#ffba08] px-3 py-2 text-sm font-black text-[#370617]">+{feedback.xp} XP</div>
        </div>
      )}

      {err && (
        <div className="game-panel border-[#d00000]/60 p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🛡️</span>
            <div className="min-w-0">
              <h2 className="font-black text-white">Quest interrupted</h2>
              <p className="mt-1 text-sm text-slate-300">{err}</p>
              <p className="mt-2 break-all text-xs text-slate-500">API: {apiBaseURL()}</p>
              <button className="game-button mt-4 bg-[#faa307] px-4 py-2 text-sm text-[#370617]" onClick={() => void loadNext()}>
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
          <div className="floaty text-6xl">🌙</div>
          <h2 className="mt-5 text-2xl font-black text-white">Checkpoint reached</h2>
          <p className="mx-auto mt-2 max-w-md text-slate-400">Nothing in this mode is due right now. Come back later or try another mode.</p>
          <button className="game-button mt-6 bg-[#faa307] px-5 py-3 text-[#370617]" onClick={() => void loadNext()}>
            Check again
          </button>
        </div>
      )}

      {data?.status === "permanently_done" && !err && (
        <div className="game-panel p-8 text-center sm:p-12">
          <div className="floaty text-7xl">🏆</div>
          <h2 className="mt-5 text-3xl font-black text-white">No active cards here yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-400">Try another topic or mode, or add cards in Deck Lab.</p>
        </div>
      )}

      {data?.status === "ok" && !err && (
        <>
          <article className="quest-card answer-pop p-6 sm:p-10">
            <div className="relative z-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <span className="game-chip px-3 py-1.5 text-xs font-black text-[#ffba08]">{data.card.kind === "lab" ? "🔧 LAB" : "📚 CONCEPT"}</span>
                  <span className="game-chip px-3 py-1.5 text-xs font-black text-slate-200">{data.card.domain}</span>
                  <span className="game-chip px-3 py-1.5 text-xs font-black text-[#faa307]">⭐ Mastery {data.card.bin}/11</span>
                  <span className="game-chip px-3 py-1.5 text-xs font-black text-slate-300">⏳ {binLabel(data.card.bin)}</span>
                </div>
                {data.card.is_builtin && <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Built-in demo</span>}
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <span>Card mastery</span><span>{mastery}%</span>
                </div>
                <div className="xp-track"><div className="xp-fill" style={{ width: `${mastery}%` }} /></div>
              </div>

              <div className="py-10 text-center sm:py-14">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#f48c06]">{data.card.kind === "lab" ? "Something broke" : "Your question"}</p>
                <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl">
                  {data.card.word}
                </h2>

                {!showDef ? (
                  <button className="game-button mt-10 bg-gradient-to-r from-[#dc2f02] via-[#f48c06] to-[#ffba08] px-7 py-3.5 text-base text-[#370617] shadow-xl shadow-black/30" onClick={() => setShowDef(true)}>
                    ✨ Reveal {data.card.kind === "lab" ? "fix path" : "answer"}
                  </button>
                ) : (
                  <div className="answer-pop mx-auto mt-9 max-w-2xl rounded-2xl border border-[#faa307]/30 bg-[#370617]/55 p-5 text-left sm:p-6">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffba08]">{data.card.kind === "lab" ? "Recovery path" : "Answer unlocked"}</p>
                    <p className="mt-3 text-lg font-semibold leading-8 text-slate-100">{data.card.definition}</p>
                  </div>
                )}
              </div>
            </div>
          </article>

          <div className="grid gap-3 sm:grid-cols-3">
            <button className="game-button border border-[#d00000]/40 bg-[#6a040f]/65 px-5 py-4 text-left text-white hover:bg-[#9d0208]/70" onClick={() => void answer("wrong")} disabled={loading}>
              <span className="block text-xs font-black uppercase tracking-[0.14em] text-[#ffba08]">1 · Missed it</span>
              <span className="mt-1 block text-sm font-semibold">Bring it back sooner</span>
            </button>
            <button className="game-button border border-[#faa307]/35 bg-[#e85d04]/20 px-5 py-4 text-left text-white hover:bg-[#e85d04]/30" onClick={() => void answer("correct")} disabled={loading}>
              <span className="block text-xs font-black uppercase tracking-[0.14em] text-[#ffba08]">2 · Got it</span>
              <span className="mt-1 block text-sm font-semibold">Advance mastery + combo</span>
            </button>
            <button className="game-button border border-white/10 bg-white/[0.05] px-5 py-4 text-left text-slate-200 hover:bg-white/10" onClick={() => void loadNext()} disabled={loading}>
              <span className="block text-xs font-black uppercase tracking-[0.14em] text-slate-400">Skip</span>
              <span className="mt-1 block text-sm font-semibold">Draw another card</span>
            </button>
          </div>

          <div className="game-panel overflow-hidden">
            <button className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left" onClick={() => setShowLegend((value) => !value)} aria-expanded={showLegend}>
              <div>
                <p className="font-black text-white">🗺️ What do mastery levels mean?</p>
                <p className="mt-1 text-xs text-slate-400">Cards you know well wait longer before they come back.</p>
              </div>
              <span className="text-sm font-black text-[#faa307]">{showLegend ? "Close" : "Show me"}</span>
            </button>
            {showLegend && (
              <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4 sm:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className={[
                    "rounded-xl border p-3",
                    i === data.card.bin ? "border-[#faa307]/55 bg-[#e85d04]/15" : "border-white/10 bg-white/[0.035]",
                  ].join(" ")}>
                    <p className="text-xs font-black text-white">Level {i}</p>
                    <p className="mt-1 text-xs text-slate-400">{binLabel(i)}</p>
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
