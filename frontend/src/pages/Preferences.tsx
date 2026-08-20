import { Link } from "react-router-dom";
import { useExperience } from "../experienceContext";
import { useGameFeel } from "../gameFeelContext";
import type { LearningMode } from "../experienceContext";

const modes: Array<{
  value: LearningMode;
  icon: string;
  title: string;
  detail: string;
  note: string;
}> = [
  {
    value: "arcade",
    icon: "⚡",
    title: "Arcade",
    detail: "Lively feedback, combos, and optional timers when a game supports them.",
    note: "Best when you want pace and game energy.",
  },
  {
    value: "chill",
    icon: "🌿",
    title: "Chill",
    detail: "No optional timers. Hints are encouraged and the pressure stays low.",
    note: "Same learning progress, calmer presentation.",
  },
  {
    value: "focus",
    icon: "🧠",
    title: "Focus",
    detail: "Cuts decorative motion and background noise so the material stays central.",
    note: "Useful when you want fewer competing signals.",
  },
  {
    value: "party",
    icon: "👥",
    title: "Party",
    detail: "Room-friendly presentation for shared rounds, team feedback, and group play.",
    note: "The Quest Room layer will use this mode automatically where appropriate.",
  },
];

export default function Preferences() {
  const {
    preferences,
    policy,
    setLearningMode,
    setMotionPreference,
    setTextScale,
    setHighContrast,
    setCaptionsEnabled,
    resetPreferences,
  } = useExperience();
  const { soundEnabled, setSoundEnabled } = useGameFeel();

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <section>
        <p className="metric-label">⚙️ Settings</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">
          Learn your way <span className="ember-text">right now.</span>
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
          These are presentation preferences, not permanent learner labels. Switch whenever the subject, environment, or your mood changes — your decks and mastery stay the same.
        </p>
      </section>

      <section className="game-panel grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="metric-label">Plans & billing</p>
          <h2 className="mt-1 text-xl font-black text-white">Free now. Power tiers when you need more.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">See the planned Free, Pro, and Educator tiers. Checkout is not enabled yet.</p>
        </div>
        <Link className="game-button bg-[#ffba08] px-5 py-3 text-sm font-black text-[#370617]" to="/plans">
          View plans →
        </Link>
      </section>

      <section className="game-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="metric-label">Learning mode</p>
            <h2 className="mt-1 text-2xl font-black text-white">Choose the vibe, not an identity.</h2>
          </div>
          <span className="game-chip px-3 py-1.5 text-xs font-black capitalize text-[#ffba08]">
            Current · {preferences.learningMode}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {modes.map((mode) => {
            const active = preferences.learningMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                aria-pressed={active}
                className={`game-button min-h-40 border p-5 text-left ${
                  active
                    ? "border-[#faa307]/60 bg-[#faa307]/10"
                    : "border-white/10 bg-black/15 hover:border-[#faa307]/30"
                }`}
                onClick={() => setLearningMode(mode.value)}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-3xl" aria-hidden="true">{mode.icon}</span>
                  <span className={`text-xs font-black uppercase tracking-[0.14em] ${active ? "text-[#ffba08]" : "text-slate-500"}`}>
                    {active ? "Selected" : "Choose"}
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-black text-white">{mode.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{mode.detail}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{mode.note}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="game-panel p-5 sm:p-6">
          <p className="metric-label">Motion & visibility</p>
          <h2 className="mt-1 text-xl font-black text-white">Make the interface easier to follow.</h2>

          <div className="mt-5 grid gap-4">
            <label className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
              <span>
                <strong className="block text-sm font-black text-white">Reduce motion</strong>
                <span className="mt-1 block text-xs leading-5 text-slate-400">System follows your device setting. Reduced explicitly removes nonessential motion.</span>
              </span>
              <select
                className="game-input max-w-32"
                aria-label="Motion preference"
                value={preferences.motionPreference}
                onChange={(event) => setMotionPreference(event.target.value === "reduced" ? "reduced" : "system")}
              >
                <option value="system">System</option>
                <option value="reduced">Reduced</option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
              <span>
                <strong className="block text-sm font-black text-white">Larger text</strong>
                <span className="mt-1 block text-xs leading-5 text-slate-400">Increase the app-wide text scale while keeping layouts responsive.</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#faa307]"
                checked={preferences.textScale === "large"}
                onChange={(event) => setTextScale(event.target.checked ? "large" : "default")}
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
              <span>
                <strong className="block text-sm font-black text-white">Higher contrast</strong>
                <span className="mt-1 block text-xs leading-5 text-slate-400">Strengthen panel borders, text contrast, and control separation.</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#faa307]"
                checked={preferences.highContrast}
                onChange={(event) => setHighContrast(event.target.checked)}
              />
            </label>
          </div>
        </div>

        <div className="game-panel p-5 sm:p-6">
          <p className="metric-label">Audio & comprehension</p>
          <h2 className="mt-1 text-xl font-black text-white">Sound should help, never carry meaning alone.</h2>

          <div className="mt-5 grid gap-4">
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
              <span>
                <strong className="block text-sm font-black text-white">Game sounds</strong>
                <span className="mt-1 block text-xs leading-5 text-slate-400">Feedback sounds stay optional; every important state also has visible text/UI feedback.</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#faa307]"
                checked={soundEnabled}
                onChange={(event) => setSoundEnabled(event.target.checked)}
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
              <span>
                <strong className="block text-sm font-black text-white">Captions / text equivalents</strong>
                <span className="mt-1 block text-xs leading-5 text-slate-400">Keep text equivalents enabled for future narrated/audio activities and room cues.</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#faa307]"
                checked={preferences.captionsEnabled}
                onChange={(event) => setCaptionsEnabled(event.target.checked)}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="game-panel grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="metric-label">Effective activity policy</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-300">
            <span className="game-chip px-3 py-1.5">{policy.allowOptionalTimers ? "⏱️ Optional timers allowed" : "🌿 Optional timers off"}</span>
            <span className="game-chip px-3 py-1.5">{policy.encourageHints ? "💡 Hints encouraged" : "💡 Hints available by activity"}</span>
            <span className="game-chip px-3 py-1.5">{policy.minimizeVisualNoise ? "🧠 Minimal visual noise" : "✨ Standard visual layer"}</span>
            <span className="game-chip px-3 py-1.5">{policy.reducedMotion ? "🛑 Reduced motion" : "🎞️ System motion"}</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Activities consume this policy; changing it does not alter card answers, XP history, spaced-repetition bins, or deck ownership.</p>
        </div>
        <button
          type="button"
          className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white"
          onClick={resetPreferences}
        >
          Reset experience settings
        </button>
      </section>
    </div>
  );
}
