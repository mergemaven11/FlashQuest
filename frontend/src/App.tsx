import type { ReactNode } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { ExperienceProvider } from "./experience";
import { GameFeelProvider, SoundToggle } from "./gameFeel";
import Admin from "./pages/Admin";
import Arcade from "./pages/Arcade";
import Demo from "./pages/Demo";
import Landing from "./pages/Landing";
import Library from "./pages/Library";
import LibraryDeck from "./pages/LibraryDeck";
import Login from "./pages/Login";
import MyDecks from "./pages/MyDecks";
import Plans from "./pages/Plans";
import Preferences from "./pages/Preferences";
import Room from "./pages/Room";
import RoomInvite from "./pages/RoomInvite";
import Rooms from "./pages/Rooms";
import Signup from "./pages/Signup";
import Status from "./pages/Status";
import Study from "./pages/Study";
import VerifyEmail from "./pages/VerifyEmail";
import Welcome from "./pages/Welcome";

const DOCS_URL = "https://flashquest-docs.netlify.app/";

function RequireAccount({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="game-panel mx-auto max-w-lg p-8 text-center text-slate-400">Loading your quest…</div>;
  if (user) return children;

  const next = `${location.pathname}${location.search}`;
  return <Navigate to={`/signup?next=${encodeURIComponent(next)}`} replace />;
}

function Shell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navItems = user
    ? [
        { to: "/study", icon: "⚡", label: "Play" },
        { to: "/arcade", icon: "🎮", label: "Arcade" },
        { to: "/library", icon: "📚", label: "Library" },
        { to: "/rooms", icon: "👥", label: "Quest Rooms" },
        { to: "/deck-lab", icon: "🧪", label: "Deck Lab" },
        { to: "/decks", icon: "🗂️", label: "My Decks" },
        { to: "/status", icon: "🗺️", label: "Deck Map" },
      ]
    : [{ to: "/demo", icon: "⚡", label: "Try demo" }];

  return (
    <div className="game-shell min-h-screen text-slate-100">
      <div className="game-grid" aria-hidden="true" />

      <header className="relative z-20 border-b border-[#faa307]/10 bg-[#03071e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between sm:px-6">
          <NavLink to={user ? "/study" : "/"} className="group flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#faa307]/25 bg-[#6a040f]/55 text-2xl shadow-lg shadow-black/30 transition group-hover:-rotate-6 group-hover:scale-105">🧠</div>
            <div>
              <div className="flex items-center gap-2"><span className="text-lg font-black tracking-tight text-white">FlashQuest</span><span className="rounded-full border border-[#ffba08]/25 bg-[#ffba08]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#ffba08]">Quest Mode</span></div>
              <p className="text-xs font-medium text-slate-400">Any topic. One memory engine.</p>
            </div>
          </NavLink>

          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.035] p-1.5" aria-label="Primary navigation">
              {navItems.map((item) => (
                <NavLink key={`${item.to}-${item.label}`} to={item.to} className={({ isActive }) => ["flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition", isActive ? "bg-[#faa307] text-[#370617] shadow-lg shadow-black/20" : "text-slate-300 hover:bg-white/10 hover:text-white"].join(" ")}>
                  <span aria-hidden="true">{item.icon}</span><span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {user ? (
              <>
                <SoundToggle />
                <NavLink
                  to="/preferences"
                  aria-label="Settings"
                  title="Settings"
                  className={({ isActive }) => `game-button game-chip flex items-center gap-2 px-3 py-2 text-xs font-black ${isActive ? "text-[#ffba08]" : "text-slate-200"}`}
                >
                  <span aria-hidden="true">⚙️</span><span className="hidden xl:inline">Settings</span>
                </NavLink>
                <a href={DOCS_URL} target="_blank" rel="noreferrer" className="game-button hidden items-center gap-2 border border-[#faa307]/20 bg-[#370617]/55 px-3 py-2 text-sm text-[#ffba08] xl:flex">📖 Docs</a>
                <div className="flex items-center gap-2">
                  <span className="game-chip hidden px-3 py-2 text-xs font-bold text-slate-300 sm:inline">👋 {user.display_name}</span>
                  <button className="game-button border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white" onClick={() => void signOut()}>Sign out</button>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <NavLink className="game-button border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white" to="/login">Sign in</NavLink>
                <NavLink className="game-button bg-[#ffba08] px-3 py-2 text-xs font-black text-[#370617]" to="/signup">Create account</NavLink>
              </div>
            )}
          </div>
        </div>
      </header>

      <main key={location.pathname} className="game-page-enter relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/welcome" element={<RequireAccount><Welcome /></RequireAccount>} />
          <Route path="/study" element={<RequireAccount><Study /></RequireAccount>} />
          <Route path="/arcade" element={<RequireAccount><Arcade /></RequireAccount>} />
          <Route path="/library" element={<RequireAccount><Library /></RequireAccount>} />
          <Route path="/library/:slug" element={<RequireAccount><LibraryDeck /></RequireAccount>} />
          <Route path="/rooms" element={<RequireAccount><Rooms /></RequireAccount>} />
          <Route path="/rooms/invite" element={<RequireAccount><RoomInvite /></RequireAccount>} />
          <Route path="/rooms/:roomId" element={<RequireAccount><Room /></RequireAccount>} />
          <Route path="/deck-lab" element={<RequireAccount><Admin /></RequireAccount>} />
          <Route path="/admin" element={<Navigate to="/deck-lab" replace />} />
          <Route path="/decks" element={<RequireAccount><MyDecks /></RequireAccount>} />
          <Route path="/status" element={<RequireAccount><Status /></RequireAccount>} />
          <Route path="/preferences" element={<RequireAccount><Preferences /></RequireAccount>} />
          <Route path="/plans" element={<RequireAccount><Plans /></RequireAccount>} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="*" element={<div className="game-panel mx-auto max-w-lg p-8 text-center"><div className="text-5xl">🌀</div><h1 className="mt-4 text-2xl font-black text-white">Secret level not found</h1><p className="mt-2 text-slate-400">That route slipped into another dimension.</p><NavLink to={user ? "/study" : "/"} className="game-button mt-6 inline-flex bg-[#faa307] px-4 py-2 text-[#370617]">Back home</NavLink></div>} />
        </Routes>
      </main>

      <footer className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 pb-8 text-xs font-medium text-slate-500">
        <span>{user ? "Learn · play · create · study together" : "Try the memory loop. Create an account when you want the full experience."}</span>
        {user && <a className="transition hover:text-[#ffba08]" href={DOCS_URL} target="_blank" rel="noreferrer">Docs ↗</a>}
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ExperienceProvider>
      <GameFeelProvider>
        <BrowserRouter>
          <AuthProvider>
            <Shell />
          </AuthProvider>
        </BrowserRouter>
      </GameFeelProvider>
    </ExperienceProvider>
  );
}
