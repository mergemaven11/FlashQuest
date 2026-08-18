import { Link } from "react-router-dom";
import { useAuth } from "../auth";

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="grid gap-14 pb-10 pt-4 sm:pt-10">
      <section className="grid items-center gap-10 lg:grid-cols-[1.08fr_.92fr]">
        <div>
          <div className="game-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#ffba08]">
            ⚡ Featured deck · Platform Engineering
          </div>
          <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
            Learn it. Break it. <span className="ember-text">Fix it.</span> Remember it.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            FlashQuest’s turns study cards into a game loop. Start with 216 Platform Engineering challenges, then sign in and build decks for anything you want to learn.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="game-button bg-[#ffba08] px-5 py-3 text-sm font-black text-[#370617]" to="/study">
              🎮 Try the Platform demo
            </Link>
            <Link
              className="game-button border border-[#faa307]/40 bg-[#6a040f]/45 px-5 py-3 text-sm font-black text-[#ffba08]"
              to={user ? "/decks" : "/signup"}
            >
              ✨ Make your own deck
            </Link>
            <a
              className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-slate-200"
              href="https://flashquest-docs.netlify.app/"
              target="_blank"
              rel="noreferrer"
            >
              📖 Read the docs
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-5 text-sm text-slate-400">
            <span><b className="text-white">144</b> concepts</span>
            <span><b className="text-white">72</b> break/fix labs</span>
            <span><b className="text-white">12</b> domains</span>
            <span><b className="text-white">12</b> mastery levels</span>
          </div>
        </div>

        <div className="quest-card p-6 sm:p-8">
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-3">
              <span className="game-chip px-3 py-1 text-xs font-black text-[#ffba08]">🔧 BREAK/FIX LAB</span>
              <span className="text-xs font-bold text-slate-500">Kubernetes</span>
            </div>
            <p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-[#f48c06]">Your challenge</p>
            <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
              A Service has no traffic even though the Pods are Running. What do you check first?
            </h2>
            <div className="mt-7 rounded-2xl border border-[#faa307]/20 bg-[#faa307]/[0.07] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ffba08]">Think like the engineer</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Check Service selectors against Pod labels, inspect EndpointSlices, verify targetPort, then confirm readiness and network policy.
              </p>
            </div>
            <div className="mt-6 xp-track"><div className="xp-fill" style={{ width: "68%" }} /></div>
            <div className="mt-2 flex justify-between text-xs font-bold text-slate-500"><span>Mastery path</span><span>Level 7 / 11</span></div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["🧠", "Learn the idea", "Concept cards build the mental models behind Linux, networking, containers, Kubernetes, Terraform, databases, SRE, and more."],
          ["🛠️", "Practice the failure", "Lab cards drop you into realistic break/fix situations and make you explain what you would inspect, change, and verify."],
          ["🗂️", "Build anything", "Create an account, verify your email, and make your own private decks for certifications, school, coding, languages, interviews, or whatever comes next."],
        ].map(([icon, title, body]) => (
          <article key={title} className="game-panel p-6">
            <div className="text-3xl">{icon}</div>
            <h2 className="mt-4 text-xl font-black text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
          </article>
        ))}
      </section>

      <section className="game-panel p-6 sm:p-8">
        <div className="max-w-2xl">
          <p className="metric-label">Make your own deck</p>
          <h2 className="mt-2 text-3xl font-black text-white">Same game engine. Your topic.</h2>
          <p className="mt-3 text-slate-400">Sign up, verify your email, create a deck, add questions or labs, then study with XP, streaks, mastery, and spaced repetition.</p>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-4">
          {[
            ["1", "Sign up"],
            ["2", "Verify email"],
            ["3", "Build a deck"],
            ["4", "Play + remember"],
          ].map(([step, label]) => (
            <div key={step} className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <span className="text-xs font-black text-[#f48c06]">STEP {step}</span>
              <p className="mt-2 font-black text-white">{label}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
