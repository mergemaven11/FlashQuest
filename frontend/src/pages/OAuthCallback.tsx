import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setAccessToken } from "../api";
import { useAuth } from "../auth";

export default function OAuthCallback() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = fragment.get("token");
    const next = fragment.get("next");
    const safeNext = next?.startsWith("/") ? next : null;
    if (!token) {
      setError("OAuth sign-in did not return a FlashQuest session.");
      return;
    }

    setAccessToken(token);
    window.history.replaceState({}, document.title, window.location.pathname);
    void refresh()
      .then(() => navigate(safeNext ?? "/welcome", { replace: true }))
      .catch(() => setError("FlashQuest could not finish signing you in."));
  }, [navigate, refresh]);

  return (
    <div className="mx-auto max-w-lg py-10">
      <div className="game-panel p-8 text-center">
        <img src="/flashquest-logo.svg" alt="FlashQuest" className="mx-auto h-20 w-20 rounded-3xl" />
        <p className="metric-label mt-5">Secure sign-in</p>
        <h1 className="mt-2 text-2xl font-black text-white">Finishing your FlashQuest login…</h1>
        {error && <p className="mt-4 rounded-xl border border-[#d00000]/40 bg-[#6a040f]/40 p-3 text-sm text-rose-200">{error}</p>}
      </div>
    </div>
  );
}
