const plans = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    badge: "Core learning",
    summary: "Everything needed to learn, build a deck, and study with the community.",
    features: [
      "Official decks and durable study progress",
      "Library browsing and community decks",
      "Solo Arcade games",
      "Create, remix, and publish decks",
      "Public Quest Rooms",
    ],
  },
  {
    name: "Pro",
    price: "$7.99",
    cadence: "/ month",
    badge: "Planned",
    summary: "Power features for learners who want deeper progress insight and more private control.",
    features: [
      "Everything in Free",
      "Advanced progress and mastery analytics",
      "More private and invite-only room capacity",
      "Larger Quest Rooms",
      "Priority access to future power workflows",
    ],
    featured: true,
  },
  {
    name: "Educator",
    price: "$19.99",
    cadence: "/ month",
    badge: "Planned",
    summary: "Teaching and cohort tools for instructors, tutors, and study-group leaders.",
    features: [
      "Everything in Pro",
      "Multiple learner groups and cohorts",
      "Educator-facing progress views",
      "Expanded room and deck organization",
      "Future assignment and classroom workflows",
    ],
  },
] as const;

export default function Plans() {
  return (
    <div className="mx-auto grid max-w-6xl gap-7">
      <section>
        <p className="metric-label">💳 Plans</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">
          Start free. <span className="ember-text">Upgrade when it earns it.</span>
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
          Core learning stays free. Paid tiers are reserved for power features, larger private collaboration, and educator workflows.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={`game-panel flex h-full flex-col p-6 ${plan.featured ? "border-[#faa307]/45 bg-[#faa307]/[0.055]" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.14em] text-[#ffba08]">{plan.badge}</p>
                <h2 className="mt-2 text-2xl font-black text-white">{plan.name}</h2>
              </div>
              {plan.name === "Free" && <span className="game-chip px-3 py-1 text-xs font-black text-slate-300">Current</span>}
            </div>

            <div className="mt-5 flex items-end gap-2">
              <span className="text-4xl font-black text-white">{plan.price}</span>
              <span className="pb-1 text-sm font-bold text-slate-500">{plan.cadence}</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">{plan.summary}</p>

            <ul className="mt-5 grid flex-1 gap-3 text-sm text-slate-300">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span className="text-[#faa307]" aria-hidden="true">✓</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              disabled
              className="game-button mt-6 w-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {plan.name === "Free" ? "Free plan active" : "Checkout coming soon"}
            </button>
          </article>
        ))}
      </div>

      <section className="game-panel p-5 sm:p-6">
        <p className="font-black text-white">Billing is not enabled yet.</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          These are planned launch prices, not an active subscription offer. FlashQuest will only enable checkout after plan entitlements and billing are wired and tested end to end.
        </p>
      </section>
    </div>
  );
}
