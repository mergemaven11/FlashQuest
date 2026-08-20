import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

const DEMO_EMAIL = "demo@flashquest.app";
const DEMO_PASSWORD = "QuestRoomDemo!";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const stateNext = (location.state as { from?: string } | null)?.from;
  const queryNext = new URLSearchParams(location.search).get("next");
  const safeQueryNext = queryNext?.startsWith("/") ? queryNext : null;
  const next = stateNext ?? safeQueryNext ?? "/decks";

  async function loginWith(credentials: { email: string; password: string }, destination = next) {
    setLoading(true);
    setError(null);
    try {
      await signIn(credentials);
      navigate(destination, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await loginWith({ email, password });
  }

  return (
    <div className="mx-auto grid max-w-xl gap-5 py-6 sm:py-10">
      <section className="game-panel border-[#faa307]/30 p-5 sm:p-6">
        <p className="metric-label">👥 Quest Rooms demo</p>
        <h2 className="mt-2 text-2xl font-black text-white">Want to see the chat rooms right now?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Use the sandbox account below. It opens a private demo room with realtime chat and multiplayer Arcade, but it cannot create decks or new rooms.
        </p>
        <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm sm:grid-cols-2">
          <div><span className="text-slate-500">Demo email</span><p className="mt-1 font-black text-white">{DEMO_EMAIL}</p></div>
          <div><span className="text-slate-500">Password</span><p className="mt-1 font-black text-white">{DEMO_PASSWORD}</p></div>
        </div>
        <button
          type="button"
          className="game-button mt-4 w-full bg-[#ffba08] px-5 py-3 font-black text-[#370617]"
          disabled={loading}
          onClick={() => void loginWith({ email: DEMO_EMAIL, password: DEMO_PASSWORD }, "/rooms")}
        >
          {loading ? "Entering demo…" : "👥 Enter the Demo Room"}
        </button>
      </section>

      <form onSubmit={onSubmit} className="game-panel p-6 sm:p-8">
        <p className="metric-label">Welcome back</p>
        <h1 className="mt-2 text-3xl font-black text-white">Sign in to FlashQuest</h1>
        <p className="mt-2 text-sm text-slate-400">Your decks, progress, and Quest Room memberships stay tied to your verified account.</p>
        <div className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm font-bold text-slate-200">Email
            <input className="game-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-200">Password
            <input className="game-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
        </div>
        {error && <p className="mt-4 rounded-xl border border-[#d00000]/40 bg-[#6a040f]/40 p-3 text-sm text-rose-200">{error}</p>}
        <button className="game-button mt-6 w-full bg-[#ffba08] px-5 py-3 font-black text-[#370617]" disabled={loading}>{loading ? "Signing in…" : "Sign in →"}</button>
        <p className="mt-5 text-center text-sm text-slate-500">Need an account? <Link className="font-bold text-[#faa307]" to={`/signup${safeQueryNext ? `?next=${encodeURIComponent(safeQueryNext)}` : ""}`}>Create one</Link></p>
      </form>
    </div>
  );
}
