import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn({ email, password });
      const next = (location.state as { from?: string } | null)?.from ?? "/decks";
      navigate(next, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl py-6 sm:py-10">
      <form onSubmit={onSubmit} className="game-panel p-6 sm:p-8">
        <p className="metric-label">Welcome back</p>
        <h1 className="mt-2 text-3xl font-black text-white">Sign in to your decks</h1>
        <p className="mt-2 text-sm text-slate-400">Your custom decks and progress stay tied to your verified account.</p>
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
        <p className="mt-5 text-center text-sm text-slate-500">Need an account? <Link className="font-bold text-[#faa307]" to="/signup">Create one</Link></p>
      </form>
    </div>
  );
}
