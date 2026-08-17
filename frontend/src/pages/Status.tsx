import { useEffect, useMemo, useState } from "react";
import { apiBaseURL, checkApi, listAdminCards } from "../api";

export default function Status() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<
    { id: number; status: string; bin: number; created_at: string }[]
  >([]);

  const counts = useMemo(() => {
    const total = rows.length;
    const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
    const byBin = rows.reduce<Record<number, number>>((acc, row) => {
      acc[row.bin] = (acc[row.bin] ?? 0) + 1;
      return acc;
    }, {});
    const masteryPoints = rows.reduce((sum, row) => sum + Math.max(0, Math.min(11, row.bin)), 0);
    const maxMastery = total * 11;
    return {
      total,
      active: byStatus.active ?? 0,
      never: byStatus.never ?? 0,
      hard: byStatus.hard_to_remember ?? 0,
      byBin,
      mastery: maxMastery > 0 ? Math.round((masteryPoints / maxMastery) * 100) : 0,
    };
  }, [rows]);

  const refresh = async () => {
    try {
      setLoading(true);
      setErr(null);
      const ok = await checkApi();
      setConnected(ok);
      if (ok) {
        const adminRows = await listAdminCards();
        setRows(
          adminRows.map((row) => ({
            id: row.id,
            status: row.status,
            bin: row.bin,
            created_at: row.created_at,
          }))
        );
      } else {
        setRows([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load deck map");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
            <span>🗺️</span><span>Deck Map</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">See the whole learning world.</h1>
          <p className="mt-2 text-sm text-slate-400">Mastery distribution for players, runtime diagnostics for operators.</p>
        </div>
        <button
          className="game-button border border-cyan-300/20 bg-cyan-300/10 px-4 py-2.5 text-sm text-cyan-100 hover:bg-cyan-300/20"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Scanning…" : "↻ Refresh map"}
        </button>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="game-panel p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-300">Deck size</p>
          <strong className="mt-2 block text-3xl font-black text-white">🃏 {counts.total}</strong>
          <p className="mt-1 text-xs text-slate-400">cards in the world</p>
        </div>
        <div className="game-panel p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-300">Conquered</p>
          <strong className="mt-2 block text-3xl font-black text-white">🏆 {counts.never}</strong>
          <p className="mt-1 text-xs text-slate-400">terminal mastery cards</p>
        </div>
        <div className="game-panel p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-300">Training</p>
          <strong className="mt-2 block text-3xl font-black text-white">⚔️ {counts.active}</strong>
          <p className="mt-1 text-xs text-slate-400">active challenges</p>
        </div>
        <div className="game-panel p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">World mastery</p>
          <strong className="mt-2 block text-3xl font-black text-white">{counts.mastery}%</strong>
          <div className="xp-track mt-3"><div className="xp-fill" style={{ width: `${counts.mastery}%` }} /></div>
        </div>
      </section>

      <section className="game-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Runtime beacon</p>
            <h2 className="mt-1 text-xl font-black text-white">API connection</h2>
          </div>
          <span
            className={[
              "game-chip px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em]",
              connected === true
                ? "text-emerald-300"
                : connected === false
                ? "text-rose-300"
                : "text-slate-400",
            ].join(" ")}
          >
            {connected == null ? "● checking" : connected ? "● online" : "● offline"}
          </span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">API base URL</p>
            <p className="mt-2 break-all font-mono text-sm text-cyan-200">{apiBaseURL()}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Special states</p>
            <p className="mt-2 text-sm font-semibold text-slate-200">Hard to remember: {counts.hard}</p>
          </div>
        </div>
        {err && <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-200">{err}</p>}
      </section>

      <section className="game-panel p-5 sm:p-6">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-300">Mastery regions</p>
          <h2 className="mt-1 text-xl font-black text-white">12-level progression map</h2>
          <p className="mt-1 text-sm text-slate-400">Higher regions mean longer intervals before a card returns.</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => {
            const amount = counts.byBin[i] ?? 0;
            return (
              <div
                key={i}
                className={[
                  "rounded-2xl border p-4 transition",
                  amount > 0
                    ? "border-violet-300/25 bg-violet-400/10"
                    : "border-white/8 bg-white/[0.025]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-400">LV {i}</span>
                  <span className="text-lg">{i === 11 ? "👑" : i >= 8 ? "💎" : i >= 4 ? "🔥" : "✨"}</span>
                </div>
                <strong className="mt-3 block text-2xl font-black text-white">{amount}</strong>
                <p className="mt-1 text-[11px] font-medium text-slate-500">cards here</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["🐳", "Containers", "Docker Compose runs web, API, and PostgreSQL together."],
          ["🩺", "Health", "The status beacon calls the FastAPI /health endpoint."],
          ["⚙️", "Config", "VITE_API_URL controls which API environment the frontend targets."],
        ].map(([icon, title, copy]) => (
          <div key={title} className="game-panel p-5">
            <div className="text-2xl">{icon}</div>
            <h3 className="mt-3 font-black text-white">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-400">{copy}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
