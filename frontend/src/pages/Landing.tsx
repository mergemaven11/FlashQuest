import { Link } from "react-router-dom";
import { useAuth } from "../auth";

const features = [
  {
    icon: "🧠",
    title: "Remember more, not just cram more",
    copy: "FlashQuest brings missed material back sooner and spaces out what you already know, so studying adapts to you.",
  },
  {
    icon: "🗂️",
    title: "Build decks for anything",
    copy: "Create private decks for school, certifications, languages, interviews, technical skills, or whatever you want to master.",
  },
  {
    icon: "🎮",
    title: "Turn review into play",
    copy: "Arcade modes, XP, streaks, and quick challenges make repetition feel less like a worksheet and more like a game loop.",
  },
  {
    icon: "👥",
    title: "Study together in Quest Rooms",
    copy: "Open focused study sessions with channels, realtime chat, presence, shared decks, and multiplayer Arcade when you want a crew.",
  },
  {
    icon: "📈",
    title: "See what is actually sticking",
    copy: "Mastery levels and review history make weak spots visible so you know what to revisit instead of guessing.",
  },
  {
    icon: "🔒",
    title: "Keep your learning yours",
    copy: "Your custom decks and progress stay attached to your account, while public starter content stays easy to explore.",
  },
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="grid gap-16 pb-14 pt-4 sm:pt-10">
      <section className="grid items-center gap-10 lg:grid-cols-[1.08fr_.92fr]">
        <div>
          <div className="game-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#ffba08]">
            ⚡ Learn by doing
          </div>
          <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
            Turn what you need to remember into a <span className="ember-text">quest.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            FlashQuest is a game-like study engine that helps you practice actively, revisit what you miss, track mastery, build your own decks, and study with other people when you want to.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {user ? (
              <Link className="game-button bg-[#ffba08] px-5 py-3 text-sm font-black text-[#370617]" to="/study">⚡ Continue learning</Link>
            ) : (
              <>
                <Link className="game-button bg-[#ffba08] px-5 py-3 text-sm font-black text-[#370617]" to="/signup">Create free account</Link>
                <Link className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white" to="/demo">Try the 60-second demo</Link>
              </>
            )}
          </div>
          {!user && (
            <div className="mt-5 grid max-w-2xl gap-2 text-sm text-slate-400 sm:grid-cols-3">
              <span>✓ Create private decks</span>
              <span>✓ Keep your progress</span>
              <span>✓ Join Quest Rooms</span>
            </div>
          )}
        </div>

        <div className="quest-card p-6 sm:p-8">
          <div className="relative z-10">
            <span className="game-chip px-3 py-1 text-xs font-black text-[#ffba08]">ONE MEMORY LOOP</span>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.18em] text-[#f48c06]">Question</p>
            <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">What would you check first?</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ["1", "Try it"],
                ["2", "Get a hint"],
                ["3", "Reveal + remember"],
              ].map(([step, label]) => (
                <div key={step} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <span className="text-xs font-black text-[#f48c06]">STEP {step}</span>
                  <p className="mt-2 font-black text-white">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-[#faa307]/20 bg-[#faa307]/[0.06] p-4 text-sm leading-6 text-slate-300">
              Miss it? FlashQuest brings it back sooner. Get it right consistently? It moves farther out. Your study queue changes with you.
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-3xl">
          <p className="metric-label">Why FlashQuest</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">More than flashcards. A whole learning loop.</h2>
          <p className="mt-3 text-base leading-7 text-slate-400">
            The point is not to stare at cards. The point is to make yourself retrieve, practice, compare, repeat, and eventually stop forgetting.
          </p>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="game-panel p-5 sm:p-6">
              <div className="text-2xl" aria-hidden="true">{feature.icon}</div>
              <h3 className="mt-4 text-xl font-black text-white">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <div className="game-panel p-6 sm:p-8">
          <p className="metric-label">Why make an account?</p>
          <h2 className="mt-2 text-3xl font-black text-white">The demo shows the loop. Your account makes it yours.</h2>
          <p className="mt-4 text-sm leading-7 text-slate-400">
            Signing up turns FlashQuest from a sample experience into your personal study system. Your decks, mastery, history, room memberships, and progress stay with you between sessions.
          </p>
          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            <span>🗂️ Build and manage your own private decks</span>
            <span>📈 Save mastery and review progress</span>
            <span>👥 Create and join collaborative Quest Rooms</span>
            <span>🎮 Use your own material in Arcade and study modes</span>
          </div>
        </div>

        <div className="quest-card p-6 sm:p-8">
          <div className="relative z-10">
            <p className="metric-label">A study flow you can actually keep using</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["01", "Pick a deck", "Start with a featured deck or one you created."],
                ["02", "Attempt first", "Answer from memory before you reveal anything."],
                ["03", "Review intelligently", "Missed cards return sooner; stronger cards wait longer."],
                ["04", "Play or study together", "Switch into Arcade or open a Quest Room with a crew."],
              ].map(([number, title, copy]) => (
                <div key={number} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <span className="text-xs font-black text-[#f48c06]">{number}</span>
                  <h3 className="mt-2 font-black text-white">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {!user && (
        <section className="game-panel border-[#faa307]/25 p-7 text-center sm:p-10">
          <p className="metric-label">Ready when you are</p>
          <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">Build a study system around what you actually want to learn.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            Start free, make your first deck, keep your progress, and invite people into a Quest Room when studying alone gets old.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link className="game-button bg-[#ffba08] px-6 py-3 font-black text-[#370617]" to="/signup">Create free account →</Link>
            <Link className="game-button border border-white/10 bg-white/[0.04] px-6 py-3 font-black text-white" to="/demo">Try demo first</Link>
          </div>
        </section>
      )}
    </div>
  );
}
