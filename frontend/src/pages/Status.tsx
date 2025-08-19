// frontend/src/pages/Status.tsx
import { useEffect, useMemo, useState } from "react";
import { apiBaseURL, checkApi, listAdminCards } from "../api";

/**
 * Simple status page to show API base URL, connectivity, and card counts.
 * - Black/white theme to match Admin.
 * - Calculates counts by status on the client.
 */
export default function Status() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<
    { id: number; status: string; bin: number; created_at: string }[]
  >([]);

  // Aggregate counts derived from admin rows
  const counts = useMemo(() => {
    const total = rows.length;
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    const byBin = rows.reduce<Record<number, number>>((acc, r) => {
      acc[r.bin] = (acc[r.bin] ?? 0) + 1;
      return acc;
    }, {});
    return {
      total,
      active: byStatus["active"] ?? 0,
      never: byStatus["never"] ?? 0,
      hard: byStatus["hard_to_remember"] ?? 0,
      byBin,
    };
  }, [rows]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const ok = await checkApi();
        setConnected(ok);
        if (ok) {
          const adminRows = await listAdminCards();
          // keep minimal fields we use
          setRows(
            adminRows.map((r) => ({
              id: r.id,
              status: r.status,
              bin: r.bin,
              created_at: r.created_at,
            }))
          );
        } else {
          setRows([]);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load status");
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-2xl font-bold text-black">System Status</h1>

      {/* Connectivity */}
      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              API Base URL
            </dt>
            <dd className="mt-1 font-mono text-sm text-black">{apiBaseURL()}</dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Connectivity
            </dt>
            <dd className="mt-1">
              <span
                className={[
                  "rounded-full border px-2.5 py-1 text-xs font-medium",
                  connected == null
                    ? "border-black/20 text-neutral-600"
                    : "border-black text-black",
                ].join(" ")}
              >
                {connected == null ? "checking…" : connected ? "connected" : "offline"}
              </span>
            </dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Cards</dt>
            <dd className="mt-1 text-sm text-black">
              {loading && connected ? "loading…" : counts.total}
            </dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              By Status
            </dt>
            <dd className="mt-1 text-sm text-black">
              active: {counts.active} &middot; never: {counts.never} &middot; hard:
              {counts.hard}
            </dd>
          </div>
        </dl>

        {err && <p className="mt-4 text-sm text-neutral-700">Error: {err}</p>}
      </div>

      {/* Bin histogram (compact text, matches monochrome theme) */}
      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-black">Bin Distribution</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Higher bins show up less often (spaced repetition).
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-3 py-2"
            >
              <span className="text-xs font-medium text-neutral-600">Bin {i}</span>
              <span className="text-sm font-semibold text-black">
                {counts.byBin[i] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Helpful tips */}
      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-black">Tips</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>Ensure the API container is running and reachable.</li>
          <li>
            Set <code>VITE_API_URL</code> in <code>frontend/.env</code> if your API isn’t on{" "}
            <code>http://localhost:8080</code>.
          </li>
          <li>Run migrations and seed data before testing the UI.</li>
        </ul>
      </div>
    </div>
  );
}
