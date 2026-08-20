import { useState } from "react";
import { Link } from "react-router-dom";

const demoCards = [
  {
    question: "What is 1 + 1?",
    hint: "Start with one thing, then add one more.",
    answer: "2",
    detail: "One plus one equals two. The point here is the FlashQuest loop, not a difficult question.",
  },
  {
    question: "What kind of snack is commonly dunked in milk?",
    hint: "Think round, sweet, and often found in a cookie jar.",
    answer: "A cookie",
    detail: "Cookies are commonly dunked in milk. FlashQuest can use the same simple recall loop for any subject you choose later.",
  },
] as const;

export default function Demo() {
  const [cardIndex, setCardIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const card = demoCards[cardIndex];

  function nextCard() {
    setCardIndex((current) => (current + 1) % demoCards.length);
    setShowHint(false);
    setRevealed(false);
  }

  return (
    <div className="mx-auto max-w-2xl py-6 sm:py-10">
      <section className="quest-card p-6 sm:p-8">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="game-chip px-3 py-1 text-xs font-black text-[#ffba08]">⚡ Tiny demo</span>
            <span className="text-xs font-bold text-slate-500">No account needed</span>
          </div>

          <p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-[#f48c06]">Your question</p>
          <h1 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
            {card.question}
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
              <b>Hint:</b> {card.hint}
            </div>
          )}

          {revealed && (
            <div className="mt-7 grid gap-4">
              <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.08] p-4">
                <p className="text-xs font-black uppercase tracking-[0.15em] text-cyan-300">Answer</p>
                <p className="mt-2 text-xl font-black text-cyan-50">{card.answer}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-300">
                {card.detail}
              </div>
              <div className="rounded-2xl border border-[#ffba08]/25 bg-[#ffba08]/[0.08] p-5 text-center">
                <div className="text-3xl">✨ +10 XP</div>
                <h2 className="mt-2 text-xl font-black text-white">That’s the idea.</h2>
                <p className="mt-2 text-sm text-slate-400">Question. Hint if you want it. Reveal. Remember. Your account adds the bigger FlashQuest experience afterward.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <button type="button" className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white" onClick={nextCard}>
                    Try another easy one
                  </button>
                  <Link className="game-button bg-[#ffba08] px-5 py-3 text-sm font-black text-[#370617]" to="/signup">
                    Create free account →
                  </Link>
                </div>
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
