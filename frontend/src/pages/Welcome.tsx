import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

function welcomeKey(userId: number) {
  return `flashquest-welcome-seen:${userId}`;
}

export default function Welcome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;
  const signedInUser = user;

  function continueTo(path: string) {
    window.localStorage.setItem(welcomeKey(signedInUser.id), "1");
    navigate(path);
  }

  const choices = [
    ["⚡", "Play", "Start with a deck and build durable study progress.", "/study"],
    ["🎮", "Arcade", "Practice the same material through fast or untimed mini-games.", "/arcade"],
    ["📚", "Library", "Choose an Official deck or discover community-made material.", "/library"],
    ["👥", "Quest Rooms", "Study with other people through realtime chat and multiplayer rounds.", "/rooms"],
    ["🧪", "Create", "Build your own deck or remix something that already exists.", "/deck-lab"],
  ] as const;

  return (
    <div className="mx-auto max-w-4xl py-4 sm:py-8">
      <section className="game-panel p-6 sm:p-9">
        <p className="metric-label">🎉 Welcome Quest</p>
        <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">You’re in, {signedInUser.display_name}.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
          The public demo only showed the core memory loop. Your account unlocks the rest of FlashQuest. Pick what you want to explore first — there is no required order.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {choices.map(([icon, title, body, path]) => (
            <button
              key={title}
              type="button"
              onClick={() => continueTo(path)}
              className="game-button rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-left hover:border-[#faa307]/35 hover:bg-[#faa307]/[0.06]"
            >
              <div className="text-3xl" aria-hidden="true">{icon}</div>
              <h2 className="mt-3 text-lg font-black text-white">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">{body}</p>
            </button>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#faa307]/20 bg-[#faa307]/[0.06] p-4">
          <div>
            <p className="font-black text-white">⚙️ Settings is where the experience controls live.</p>
            <p className="mt-1 text-sm text-slate-400">Switch between Arcade, Chill, Focus, and Party, plus sound and accessibility preferences.</p>
          </div>
          <Link className="text-sm font-black text-[#ffba08] hover:text-white" to="/preferences" onClick={() => window.localStorage.setItem(welcomeKey(signedInUser.id), "1")}>Open Settings →</Link>
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <button type="button" className="game-button bg-[#ffba08] px-5 py-3 text-sm font-black text-[#370617]" onClick={() => continueTo("/study")}>
            Start studying →
          </button>
          <button type="button" className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white" onClick={() => continueTo("/library")}>
            Skip intro
          </button>
        </div>
      </section>
    </div>
  );
}
