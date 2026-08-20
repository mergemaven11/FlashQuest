import { useState } from "react";
import { Link } from "react-router-dom";

export default function Demo() {
  const [showHint, setShowHint] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="mx-auto max-w-2xl py-6 sm:py-10">
      <section className="quest-card p-6 sm:p-8">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="game-chip px-3 py-1 text-xs font-black text-[#ffba08]">⚡ 60-second demo</span>
            <span className="text-xs font-bold text-slate-500">No account needed</span>
          </div>

          <p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-[#f48c06]">Your question</p>
          <h1 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
            A Linux process is listening on a port, but another machine cannot reach it. What would you check first?
          </h1>

          {!revealed && (
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                className="game-button border border-[#faa307]/30 bg-[#faa307]/10 px-4 py-2 text-sm font-black text-[#ffba08]"
                onClick={() => setShowHint(true)}
              >
                💡 Hint
              </button>
              <button
                type="button"
                className="game-button bg-[#ffba08] px-4 py-2 text-sm font-black text-[#370617]"
                onClick={() => setRevealed(true)}
              >
                Reveal answer
              </button>
            </div>
          )}

          {showHint && !revealed && (
            <div className="mt-5 rounded-2xl border border-violet-400/25 bg-violet-400/[0.08] p-4 text-sm leading-6 text-violet-100">
              <b>Hint:</b> Separate “is the app listening?” from “can traffic reach it?” Think bind address, host firewall, and the network path.
            </div>
          )}

          {revealed && (
            <div className="mt-7 grid gap-4">
              <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.08] p-4">
                <p className="text-xs font-black uppercase tracking-[0.15em] text-cyan-300">TL;DR</p>
                <p className="mt-2 text-sm leading-6 text-cyan-50">Check the bind address, host firewall, and whether the port is reachable from the remote network.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-300">
                Confirm the process is listening on the expected interface (not only localhost), inspect firewall rules, then test the path with tools such as <code>ss</code>, <code>curl</code>, or <code>nc</code>. FlashQuest turns that recall loop into repeatable study, games, and collaborative practice after you create an account.
              </div>
              <div className="rounded-2xl border border-[#ffba08]/25 bg-[#ffba08]/[0.08] p-5 text-center">
                <div className="text-3xl">✨ +10 XP</div>
                <h2 className="mt-2 text-xl font-black text-white">That’s the loop.</h2>
                <p className="mt-2 text-sm text-slate-400">Create an account to save progress and unlock the full FlashQuest experience.</p>
                <Link className="game-button mt-5 inline-flex bg-[#ffba08] px-5 py-3 text-sm font-black text-[#370617]" to="/signup">
                  Create free account →
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <p className="mt-5 text-center text-sm text-slate-500">
        Already have an account? <Link className="font-bold text-[#faa307]" to="/login">Sign in</Link>
      </p>
    </div>
  );
}
