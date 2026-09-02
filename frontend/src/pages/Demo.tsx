import { useState } from "react";
import { Link } from "react-router-dom";

const demoCards = [
  {
    domain: "Data & Probability",
    question: "A dataset has values 4, 7, 9, 15, and 18. What is the range?",
    hint: "Range compares the largest value with the smallest value.",
    answer: "14",
    detail: "The range is max minus min: 18 - 4 = 14.",
  },
  {
    domain: "Cloud & Platform",
    question: "What problem does a Kubernetes readiness probe solve?",
    hint: "Think about whether a running container should receive traffic yet.",
    answer: "It tells Kubernetes whether a container is ready to receive traffic.",
    detail: "A pod can be running without being ready. Readiness probes keep unready pods out of Service endpoints until they can safely receive requests.",
  },
  {
    domain: "Networking",
    question: "What happens during a DNS lookup before your browser connects to a website?",
    hint: "The browser needs to turn a human-readable hostname into something routable.",
    answer: "The hostname is resolved to an IP address, usually through cached and recursive DNS lookups.",
    detail: "Once an address is resolved, the client can continue with the network connection to the destination.",
  },
] as const;

type Rating = "missed" | "got-it" | null;

export default function Demo() {
  const [cardIndex, setCardIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [rating, setRating] = useState<Rating>(null);
  const card = demoCards[cardIndex];

  function nextCard() {
    setCardIndex((current) => (current + 1) % demoCards.length);
    setShowHint(false);
    setRevealed(false);
    setTypedAnswer("");
    setRating(null);
  }

  return (
    <div className="mx-auto max-w-2xl py-6 sm:py-10">
      <section className="quest-card p-6 sm:p-8">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="game-chip px-3 py-1 text-xs font-black text-[#ffba08]">⚡ Tiny demo</span>
            <span className="text-xs font-bold text-slate-500">No account needed</span>
          </div>

          <p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-[#f48c06]">{card.domain}</p>
          <h1 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">{card.question}</h1>

          {!revealed && (
            <div className="mt-7 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-black text-white">Your answer</span>
                <textarea
                  className="game-input min-h-24 resize-y"
                  value={typedAnswer}
                  onChange={(event) => setTypedAnswer(event.target.value)}
                  placeholder="Commit to an answer before you reveal it…"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="game-button border border-[#faa307]/30 bg-[#faa307]/10 px-4 py-2 text-sm font-black text-[#ffba08]"
                  onClick={() => setShowHint(true)}
                >
                  💡 Hint
                </button>
                <button
                  type="button"
                  className="game-button bg-[#ffba08] px-4 py-2 text-sm font-black text-[#370617] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setRevealed(true)}
                  disabled={!typedAnswer.trim()}
                >
                  Reveal answer
                </button>
              </div>
            </div>
          )}

          {showHint && !revealed && (
            <div className="mt-5 rounded-2xl border border-violet-400/25 bg-violet-400/[0.08] p-4 text-sm leading-6 text-violet-100">
              <b>Hint:</b> {card.hint}
            </div>
          )}

          {revealed && (
            <div className="mt-7 grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">You answered</p>
                <p className="mt-2 text-base font-bold text-white">{typedAnswer}</p>
              </div>
              <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.08] p-4">
                <p className="text-xs font-black uppercase tracking-[0.15em] text-cyan-300">Reference answer</p>
                <p className="mt-2 text-xl font-black text-cyan-50">{card.answer}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-300">{card.detail}</div>

              {!rating ? (
                <div className="rounded-2xl border border-[#ffba08]/25 bg-[#ffba08]/[0.08] p-5 text-center">
                  <h2 className="text-xl font-black text-white">Did you get it?</h2>
                  <p className="mt-2 text-sm text-slate-400">Compare what you wrote with the reference answer, then rate your recall.</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button type="button" className="game-button border border-[#d00000]/45 bg-[#6a040f]/35 px-5 py-3 text-sm font-black text-rose-100" onClick={() => setRating("missed")}>
                      1 · Missed it
                    </button>
                    <button type="button" className="game-button border border-[#faa307]/45 bg-[#f48c06]/20 px-5 py-3 text-sm font-black text-[#ffba08]" onClick={() => setRating("got-it")}>
                      2 · Got it
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#ffba08]/25 bg-[#ffba08]/[0.08] p-5 text-center">
                  <div className="text-3xl">{rating === "got-it" ? "✨ +10 XP" : "💪 +2 XP"}</div>
                  <h2 className="mt-2 text-xl font-black text-white">{rating === "got-it" ? "Nice recall." : "Good practice rep."}</h2>
                  <p className="mt-2 text-sm text-slate-400">{rating === "got-it" ? "That card would advance in mastery." : "In the full app, this card would come back sooner."}</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <button type="button" className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white" onClick={nextCard}>
                      Try another question
                    </button>
                    <Link className="game-button bg-[#ffba08] px-5 py-3 text-sm font-black text-[#370617]" to="/signup">
                      Create free account →
                    </Link>
                  </div>
                </div>
              )}
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
