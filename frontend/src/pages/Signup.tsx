import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { resendVerification, signup } from "../api";
import { DEMO_ACCOUNT_EMAIL, useAuth } from "../auth";
import SocialAuthButtons from "../components/SocialAuthButtons";

const DEMO_PASSWORD = "QuestRoomDemo!";

export default function Signup() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

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
      const text = e instanceof Error ? e.message : "Could not create account";
      if (text.includes("HTTP 503") || text.includes("HTTP 409")) {
        setSentTo(email.trim().toLowerCase());
        setMessage("Your account may already exist. You can resend verification below, or use Google/GitHub instead.");
      } else {
        setError(text);
      }
    } finally {
      setLoading(false);
    }
  }

  async function enterDemoRoom() {
    setDemoLoading(true);
    setDemoError(null);
    try {
      await signIn({ email: DEMO_ACCOUNT_EMAIL, password: DEMO_PASSWORD });
      navigate("/rooms", { replace: true });
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : "Could not enter the demo room");
    } finally {
      setDemoLoading(false);
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
          <img src="/flashquest-logo.svg" alt="FlashQuest" className="mx-auto h-20 w-20 rounded-3xl" />
          <p className="metric-label mt-5">Almost there</p>
          <h1 className="mt-2 text-3xl font-black text-white">Finish your account</h1>
          <p className="mt-3 text-slate-300">Email account: <b className="text-[#ffba08]">{sentTo}</b></p>
          {message && <p className="mt-5 rounded-xl border border-[#faa307]/20 bg-[#faa307]/10 p-3 text-sm text-[#ffba08]">{message}</p>}
          {error && <p className="mt-5 rounded-xl border border-[#d00000]/40 bg-[#6a040f]/40 p-3 text-sm text-rose-200">{error}</p>}
          <div className="mt-6"><SocialAuthButtons next={safeNext} /></div>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button className="game-button bg-[#ffba08] px-4 py-2 text-sm font-black text-[#370617]" onClick={() => void resend()} disabled={loading}>Resend email</button>
            <Link className="game-button border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-white" to={loginTarget}>Go to sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-xl gap-5 py-6 sm:py-10">
      <form onSubmit={onSubmit} className="game-panel p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <img src="/flashquest-logo.svg" alt="FlashQuest" className="h-16 w-16 rounded-2xl" />
          <div>
            <p className="metric-label">{joiningRooms ? "Join Quest Rooms" : "Continue your quest"}</p>
            <h1 className="mt-1 text-3xl font-black text-white">Create your FlashQuest account</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">Sign up to save mastery, build private decks, play Arcade with your own material, and join persistent Quest Rooms.</p>
        <div className="mt-6"><SocialAuthButtons next={safeNext} /></div>
        <p className="mt-3 text-center text-xs text-slate-500">Google/GitHub accounts are verified by the provider — no FlashQuest verification email required.</p>
        <div className="my-6 flex items-center gap-3 text-xs font-black uppercase tracking-[0.15em] text-slate-500"><span className="h-px flex-1 bg-white/10" /><span>or use email</span><span className="h-px flex-1 bg-white/10" /></div>
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-bold text-slate-200">Name<input className="game-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" required /></label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-200">Email<input className="game-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-200">Password<input className="game-input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required /><span className="text-xs font-normal text-slate-500">At least 8 characters. Email signups still use verification.</span></label>
        </div>
        {error && <p className="mt-4 rounded-xl border border-[#d00000]/40 bg-[#6a040f]/40 p-3 text-sm text-rose-200">{error}</p>}
        <button className="game-button mt-6 w-full bg-[#ffba08] px-5 py-3 font-black text-[#370617]" disabled={loading}>{loading ? "Creating account…" : "Create with email →"}</button>
        <p className="mt-5 text-center text-sm text-slate-500">Already have an account? <Link className="font-bold text-[#faa307]" to={loginTarget}>Sign in</Link></p>
      </form>

      <section className="game-panel border-[#faa307]/25 p-5 sm:p-6">
        <p className="metric-label">Want to look around first?</p>
        <h2 className="mt-2 text-xl font-black text-white">Enter the Demo Room</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">See the signed-in room experience before creating an account.</p>
        {demoError && <p className="mt-4 rounded-xl border border-[#d00000]/40 bg-[#6a040f]/40 p-3 text-sm text-rose-200">{demoError}</p>}
        <button type="button" className="game-button mt-4 w-full border border-[#faa307]/35 bg-[#faa307]/10 px-5 py-3 font-black text-[#ffba08]" disabled={demoLoading} onClick={() => void enterDemoRoom()}>{demoLoading ? "Entering demo…" : "👥 Enter Demo Room"}</button>
      </section>
    </div>
  );
}
