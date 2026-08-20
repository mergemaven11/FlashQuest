import { Link } from "react-router-dom";
import { useAuth } from "../auth";

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="grid gap-10 pb-10 pt-4 sm:pt-10">
      <section className="grid items-center gap-10 lg:grid-cols-[1.08fr_.92fr]">
        <div>
          <div className="game-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#ffba08]">
            ⚡ Learn by doing
          </div>
          <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
            Turn what you need to remember into a <span className="ember-text">quest.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            FlashQuest helps you remember ideas by making you try, hint, reveal, and come back to the things you miss.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {user ? (
              <Link className="game-button bg-[#ffba08] px-5 py-3 text-sm font-black text-[#370617]" to="/study">⚡ Continue learning</Link>
            ) : (
              <>
                <Link className="game-button bg-[#ffba08] px-5 py-3 text-sm font-black text-[#370617]" to="/demo">Try the 60-second demo</Link>
                <Link className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white" to="/signup">Create free account</Link>
              </>
            )}
          </div>
          {!user && <p className="mt-4 text-sm text-slate-500">No account needed for the demo. The rest of FlashQuest unlocks after signup.</p>}
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
            <p className="mt-6 text-sm leading-6 text-slate-400">That’s all visitors need to understand. Once you create an account, FlashQuest shows you the rest as you explore.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
