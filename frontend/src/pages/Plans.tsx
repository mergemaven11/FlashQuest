import { useState } from "react";
import { Link } from "react-router-dom";

type BillingCycle = "monthly" | "annual";

const plans = [
  {
    name: "Free",
    monthly: 0,
    annual: 0,
    badge: "Core learning",
    summary: "Everything you need to build a real study habit and use FlashQuest every day.",
    features: [
      "Official and community decks",
      "Durable study progress + mastery scheduling",
      "Answer-first recall and hints",
      "Solo Arcade games",
      "Create, remix, and publish decks",
      "Public Quest Rooms",
    ],
    featured: false,
  },
  {
    name: "Pro",
    monthly: 7.99,
    annual: 69,
    badge: "Most popular",
    summary: "For serious learners who want deeper insight, more privacy, and more control.",
    features: [
      "Everything in Free",
      "Advanced mastery + progress analytics",
      "Private and invite-only Quest Rooms",
      "Larger room capacity",
      "Premium study and Arcade workflows",
      "Priority access to new power features",
    ],
    featured: true,
  },
  {
    name: "Educator",
    monthly: 19.99,
    annual: 179,
    badge: "For instructors",
    summary: "For tutors, teachers, coaches, and study leaders running learning groups.",
    features: [
      "Everything in Pro",
      "Multiple learner cohorts",
      "Educator-facing learner progress views",
      "Expanded room and deck organization",
      "Assignments and classroom workflows",
      "Cohort-level learning analytics",
    ],
    featured: false,
  },
] as const;

function money(value: number) {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

export default function Plans() {
  const [billing, setBilling] = useState<BillingCycle>("annual");

  return (
    <div className="mx-auto grid max-w-6xl gap-7">
      <section className="text-center">
        <p className="metric-label">💳 FlashQuest pricing</p>
        <h1 className="mx-auto mt-2 max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl">
          Start free. <span className="ember-text">Upgrade when it earns it.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
          Core learning stays free. Paid plans unlock deeper analytics, private collaboration, and educator workflows — not basic studying.
        </p>

        <div className="mx-auto mt-6 inline-flex rounded-2xl border border-white/10 bg-black/20 p-1.5">
          <button
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-black transition ${billing === "monthly" ? "bg-[#faa307] text-[#370617]" : "text-slate-300"}`}
            onClick={() => setBilling("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-black transition ${billing === "annual" ? "bg-[#faa307] text-[#370617]" : "text-slate-300"}`}
            onClick={() => setBilling("annual")}
          >
            Annual · save up to 28%
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const annual = billing === "annual" && plan.annual > 0;
          const displayedPrice = plan.monthly === 0 ? "$0" : annual ? money(plan.annual) : money(plan.monthly);
          const cadence = plan.monthly === 0 ? "forever" : annual ? "/ year" : "/ month";

          return (
            <article
              key={plan.name}
              className={`game-panel relative flex h-full flex-col p-6 ${plan.featured ? "border-[#faa307]/55 bg-[#faa307]/[0.07] shadow-2xl shadow-[#370617]/30" : ""}`}
            >
              {plan.featured && (
                <span className="absolute right-5 top-5 rounded-full bg-[#ffba08] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#370617]">
                  Best value
                </span>
              )}
              <div>
                <p className="text-sm font-black uppercase tracking-[0.14em] text-[#ffba08]">{plan.badge}</p>
                <h2 className="mt-2 text-3xl font-black text-white">{plan.name}</h2>
              </div>

              <div className="mt-5 flex items-end gap-2">
                <span className="text-4xl font-black text-white">{displayedPrice}</span>
                <span className="pb-1 text-sm font-bold text-slate-500">{cadence}</span>
              </div>
              {annual && (
                <p className="mt-1 text-xs font-bold text-emerald-300">
                  About {money(plan.annual / 12)}/month billed annually
                </p>
              )}
              <p className="mt-4 text-sm leading-6 text-slate-400">{plan.summary}</p>

              <ul className="mt-5 grid flex-1 gap-3 text-sm text-slate-300">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="text-[#faa307]" aria-hidden="true">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                className={`game-button mt-6 w-full px-4 py-3 text-center text-sm font-black ${plan.featured ? "bg-[#ffba08] text-[#370617]" : "border border-white/10 bg-white/[0.04] text-white"}`}
                to="/signup"
              >
                {plan.name === "Free" ? "Start free" : `Choose ${plan.name}`}
              </Link>
            </article>
          );
        })}
      </div>

      <section className="game-panel grid gap-3 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="font-black text-white">Launch pricing is visible now; checkout comes after billing UAT.</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            No card is required for the Free plan. Pro and Educator prices are the intended launch tiers, but paid checkout stays disabled until entitlements, subscription state, cancellation, and webhook handling are tested end to end.
          </p>
        </div>
        <Link className="game-button bg-[#faa307] px-5 py-3 text-center font-black text-[#370617]" to="/demo">
          Try the demo →
        </Link>
      </section>
    </div>
  );
}
