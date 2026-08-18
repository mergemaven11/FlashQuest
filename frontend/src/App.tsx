import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { GameFeelProvider, SoundToggle } from "./gameFeel";
import Admin from "./pages/Admin";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import MyDecks from "./pages/MyDecks";
import Signup from "./pages/Signup";
import Status from "./pages/Status";
import Study from "./pages/Study";
import VerifyEmail from "./pages/VerifyEmail";

const DOCS_URL = "https://flashquest-docs.netlify.app/";

function Shell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navItems = [
    { to: "/study", icon: "⚡", label: "Play" },
    { to: "/deck-lab", icon: "🧪", label: "Deck Lab" },
    ...(user ? [{ to: "/decks", icon: "🗂️", label: "My Decks" }] : []),
    { to: "/status", icon: "🗺️", label: "Deck Map" },
  ];

  return (
    <div className="game-shell min-h-screen text-slate-100">
      <div className="game-grid" aria-hidden="true" />

      <header className="relative z-20 border-b border-[#faa307]/10 bg-[#03071e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between sm:px-6">
          <NavLink to="/" className="group flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#faa307]/25 bg-[#6a040f]/55 text-2xl shadow-lg shadow-black/30 transition group-hover:-rotate-6 group-hover:scale-105">🧠</div>
            <div>
              <div className="flex items-center gap-2"><span className="text-lg font-black tracking-tight text-white">FlashQuest’s</span><span className="rounded-full border border-[#ffba08]/25 bg-[#ffba08]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#ffba08]">Quest Mode</span></div>
              <p className="text-xs font-medium text-slate-400">Any topic. One memory engine.</p>
            </div>
          </NavLink>

          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.035] p-1.5" aria-label="Primary navigation">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => ["flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition", isActive ? "bg-[#faa307] text-[#370617] shadow-lg shadow-black/20" : "text-slate-300 hover:bg-white/10 hover:text-white"].join(" ")}>
                  <span aria-hidden="true">{item.icon}</span><span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <SoundToggle />
            <a href={DOCS_URL} target="_blank" rel="noreferrer" className="game-button flex items-center gap-2 border border-[#faa307]/20 bg-[#370617]/55 px-3 py-2 text-sm text-[#ffba08]">📖 Docs</a>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="game-chip hidden px-3 py-2 text-xs font-bold text-slate-300 sm:inline">👋 {user.display_name}</span>
                <button className="game-button border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white" onClick={() => void signOut()}>Sign out</button>
              </div>
            ) : (
              <div className="flex gap-2"><NavLink className="game-button border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white" to="/login">Sign in</NavLink><NavLink className="game-button bg-[#ffba08] px-3 py-2 text-xs font-black text-[#370617]" to="/signup">Make a deck</NavLink></div>
            )}
          </div>
        </div>
      </header>

      <main key={location.pathname} className="game-page-enter relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/study" element={<Study />} />
          <Route path="/deck-lab" element={<Admin />} />
          <Route path="/admin" element={<Navigate to="/deck-lab" replace />} />
          <Route path="/decks" element={<MyDecks />} />
          <Route path="/status" element={<Status />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="*" element={<div className="game-panel mx-auto max-w-lg p-8 text-center"><div className="text-5xl">🌀</div><h1 className="mt-4 text-2xl font-black text-white">Secret level not found</h1><p className="mt-2 text-slate-400">That route slipped into another dimension.</p><NavLink to="/" className="game-button mt-6 inline-flex bg-[#faa307] px-4 py-2 text-[#370617]">Back home</NavLink></div>} />
        </Routes>
      </main>

      <footer className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 pb-8 text-xs font-medium text-slate-500">
        <span>Featured Platform Engineering · make your own decks · 12 mastery levels</span>
        <a className="transition hover:text-[#ffba08]" href={DOCS_URL} target="_blank" rel="noreferrer">FastAPI · React · PostgreSQL · Docker · Docs ↗</a>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <GameFeelProvider>
      <BrowserRouter>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </BrowserRouter>
    </GameFeelProvider>
  );
}
