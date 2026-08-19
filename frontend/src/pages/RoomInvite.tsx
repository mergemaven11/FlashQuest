import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth";
import { joinRoomByInvite } from "../roomApi";

const INVITE_SESSION_KEY = "flashquest-room-invite";

function initialInviteToken(search: string): string {
  const fromUrl = new URLSearchParams(search).get("token")?.trim() ?? "";
  if (fromUrl) return fromUrl;
  try {
    return window.sessionStorage.getItem(INVITE_SESSION_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export default function RoomInvite() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => initialInviteToken(location.search));
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get("token")?.trim() ?? "";
    if (!fromUrl) return;
    try {
      window.sessionStorage.setItem(INVITE_SESSION_KEY, fromUrl);
    } catch {
      // The in-memory state still carries this navigation's token.
    }
    navigate("/rooms/invite", { replace: true });
  }, [location.search, navigate]);

  useEffect(() => {
    if (!user || !token) return;
    let cancelled = false;
    setJoining(true);
    setError(null);
    void joinRoomByInvite(token)
      .then((room) => {
        if (cancelled) return;
        try {
          window.sessionStorage.removeItem(INVITE_SESSION_KEY);
        } catch {
          // No-op: joining already succeeded.
        }
        navigate(`/rooms/${room.id}`, { replace: true });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not use this invite");
          setJoining(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, navigate, token, user]);

  if (!token) {
    return (
      <section className="game-panel mx-auto max-w-xl p-8 text-center">
        <div className="text-5xl" aria-hidden="true">🧭</div>
        <h1 className="mt-4 text-2xl font-black text-white">Invite link missing</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Open the full Quest Room invite link your host shared with you.
        </p>
        <Link to="/rooms" className="game-button mt-6 inline-flex bg-[#faa307] px-5 py-3 font-black text-[#370617]">
          Quest Rooms
        </Link>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="quest-card mx-auto max-w-2xl p-8 text-center">
        <div className="relative z-10">
          <div className="text-5xl" aria-hidden="true">✉️</div>
          <p className="metric-label mt-4">Quest Room invite</p>
          <h1 className="mt-2 text-3xl font-black text-white">You’ve been invited to study.</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Sign in first. FlashQuest has temporarily kept this invite in this browser session and removed the secret token from the visible URL.
          </p>
          <Link
            to="/login"
            state={{ from: "/rooms/invite" }}
            className="game-button mt-6 inline-flex bg-[#ffba08] px-5 py-3 font-black text-[#370617]"
          >
            Sign in and join →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="game-panel mx-auto max-w-xl p-8 text-center">
      <div className="text-5xl" aria-hidden="true">{error ? "🛡️" : "🚪"}</div>
      <h1 className="mt-4 text-2xl font-black text-white">
        {error ? "Invite unavailable" : "Joining Quest Room…"}
      </h1>
      <p className={`mt-3 text-sm leading-6 ${error ? "text-rose-200" : "text-slate-400"}`}>
        {error ?? "Validating the invite and creating your room membership."}
      </p>
      {error && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="game-button bg-[#ffba08] px-4 py-2 font-black text-[#370617]"
            disabled={joining}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
          <Link to="/rooms" className="game-button border border-white/10 bg-white/[0.04] px-4 py-2 font-black text-white">
            Quest Rooms
          </Link>
        </div>
      )}
    </section>
  );
}
