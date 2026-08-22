import { apiBaseURL } from "../api";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.2Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.4 14Z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 3.1 7.5l3.3 2.6C7.2 7.7 9.4 5.9 12 5.9Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
      <path d="M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2.2c-3.4.7-4.1-1.4-4.1-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.6-1.4-5.6-6.1 0-1.4.5-2.5 1.2-3.4-.1-.3-.5-1.6.1-3.4 0 0 1-.3 3.5 1.3A12 12 0 0 1 12 6.7c1.1 0 2.2.1 3.2.4 2.5-1.6 3.5-1.3 3.5-1.3.6 1.8.2 3.1.1 3.4.8.9 1.2 2 1.2 3.4 0 4.8-2.9 5.8-5.6 6.1.4.4.8 1.1.8 2.1v3.1c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}

export default function SocialAuthButtons({ next }: { next?: string | null }) {
  const suffix = next ? `?next=${encodeURIComponent(next)}` : "";
  const start = (provider: "google" | "github") => {
    window.location.assign(`${apiBaseURL()}/auth/${provider}/start${suffix}`);
  };

  return (
    <div className="grid gap-3">
      <button type="button" onClick={() => start("google")} className="game-button flex w-full items-center justify-center gap-3 border border-white/15 bg-white px-5 py-3 font-black text-slate-900 hover:bg-slate-100">
        <GoogleMark /> Continue with Google
      </button>
      <button type="button" onClick={() => start("github")} className="game-button flex w-full items-center justify-center gap-3 border border-white/15 bg-[#111827] px-5 py-3 font-black text-white hover:bg-[#1f2937]">
        <GitHubMark /> Continue with GitHub
      </button>
    </div>
  );
}
