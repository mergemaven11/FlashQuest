import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { resendVerification, signup } from "../api";

export default function Signup() {
  const location = useLocation();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestedNext = new URLSearchParams(location.search).get("next");
  const safeNext = requestedNext?.startsWith("/") ? requestedNext : null;
  const joiningRooms = safeNext === "/rooms";
  const loginTarget = safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : "/login";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signup({ display_name: displayName, email, password });
      setSentTo(result.email);
      setMessage(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create account");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!sentTo) return;
    setLoading(true);
    setError(null);
    try {
      setMessage(await resendVerification(sentTo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend email");
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="game-panel p-7 text-center sm:p-10">
          <div className="text-6xl">📬</div>
          <p className="metric-label mt-5">Almost there</p>
          <h1 className="mt-2 text-3xl font-black text-white">Check your inbox!</h1>
          <p className="mt-3 text-slate-300">We sent a verification link to <b className="text-[#ffba08]">{sentTo}</b>.</p>
          <p className="mt-2 text-sm text-slate-500">
            {joiningRooms
              ? "Verify your email, then sign in and FlashQuest will send you to Quest Rooms."
              : "Verify your email to unlock private decks, durable progress, and Quest Rooms."}
          </p>
          {message && <p className="mt-5 rounded-xl border border-[#faa307]/20 bg-[#faa307]/10 p-3 text-sm text-[#ffba08]">{message}</p>}
          {error && <p className="mt-5 rounded-xl border border-[#d00000]/40 bg-[#6a040f]/40 p-3 text-sm text-rose-200">{error}</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className="game-button bg-[#ffba08] px-4 py-2 text-sm font-black text-[#370617]" onClick={() => void resend()} disabled={loading}>Resend email</button>
            <Link className="game-button border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-white" to={loginTarget}>Go to sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-6 sm:py-10">
      <form onSubmit={onSubmit} className="game-panel p-6 sm:p-8">
        <p className="metric-label">{joiningRooms ? "👥 Join Quest Rooms" : "Make your own deck"}</p>
        <h1 className="mt-2 text-3xl font-black text-white">Create your FlashQuest account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {joiningRooms
            ? "Create and verify an account to join persistent study chat, presence, and multiplayer Arcade with other learners."
            : "The public study demo is free to try. An account adds private decks, durable progress, publishing, and Quest Rooms."}
        </p>

        {joiningRooms && (
          <div className="mt-5 rounded-2xl border border-[#faa307]/25 bg-[#faa307]/[0.07] p-4 text-sm leading-6 text-slate-300">
            <b className="text-[#ffba08]">Why an account?</b> Quest Rooms keep membership, chat authorship, invites, moderation, and multiplayer state tied to real signed-in learners.
          </div>
        )}

        <div className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm font-bold text-slate-200">Name
            <input className="game-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" required />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-200">Email
            <input className="game-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-200">Password
            <input className="game-input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            <span className="text-xs font-normal text-slate-500">At least 8 characters.</span>
          </label>
        </div>

        {error && <p className="mt-4 rounded-xl border border-[#d00000]/40 bg-[#6a040f]/40 p-3 text-sm text-rose-200">{error}</p>}
        <button className="game-button mt-6 w-full bg-[#ffba08] px-5 py-3 font-black text-[#370617]" disabled={loading}>{loading ? "Creating account…" : joiningRooms ? "Create account for Quest Rooms →" : "Create account →"}</button>
        <p className="mt-5 text-center text-sm text-slate-500">Already verified? <Link className="font-bold text-[#faa307]" to={loginTarget}>Sign in</Link></p>
      </form>
    </div>
  );
}
