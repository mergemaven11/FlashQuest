import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import Admin from "./pages/Admin";
import Study from "./pages/Study";
import Status from "./pages/Status";

const navItems = [
  { to: "/study", icon: "⚡", label: "Play" },
  { to: "/admin", icon: "🧪", label: "Deck Lab" },
  { to: "/status", icon: "🗺️", label: "Deck Map" },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="game-shell min-h-screen text-slate-100">
        <div className="game-grid" aria-hidden="true" />

        <header className="relative z-20 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <NavLink to="/study" className="group flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-300/30 bg-violet-500/20 text-2xl shadow-lg shadow-violet-950/40 transition group-hover:-rotate-6 group-hover:scale-105">
                🧠
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black tracking-tight text-white">FlashQuest’s</span>
                  <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">
                    Quest Mode
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-400">Level up what you remember.</p>
              </div>
            </NavLink>

            <nav className="flex gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5" aria-label="Primary navigation">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition",
                      isActive
                        ? "bg-white text-slate-950 shadow-lg shadow-black/20"
                        : "text-slate-300 hover:bg-white/10 hover:text-white",
                    ].join(" ")
                  }
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <Routes>
            <Route path="/" element={<Navigate to="/study" replace />} />
            <Route path="/study" element={<Study />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/status" element={<Status />} />
            <Route
              path="*"
              element={
                <div className="game-panel mx-auto max-w-lg p-8 text-center">
                  <div className="text-5xl">🌀</div>
                  <h1 className="mt-4 text-2xl font-black text-white">Secret level not found</h1>
                  <p className="mt-2 text-slate-400">That route slipped into another dimension.</p>
                  <NavLink
                    to="/study"
                    className="mt-6 inline-flex rounded-xl bg-violet-400 px-4 py-2 font-black text-violet-950 transition hover:bg-violet-300"
                  >
                    Return to the quest
                  </NavLink>
                </div>
              }
            />
          </Routes>
        </main>

        <footer className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 pb-8 text-xs font-medium text-slate-500">
          <span>12 mastery levels · spaced repetition engine</span>
          <span>FastAPI · React · PostgreSQL · Docker</span>
        </footer>
      </div>
    </BrowserRouter>
  );
}
