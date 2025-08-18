import { useEffect, useState, useCallback } from "react";
import { getStudyNext, postStudyAnswer, checkApi, apiBaseURL } from "../api";

/**
 * API response when requesting the next study card.
 */
export type Next =
  | {
      status: "ok";
      card: {
        id: number;
        word: string;
        definition: string;
        bin: number;
        status: string;
      };
    }
  | { status: "temporarily_done" }
  | { status: "permanently_done" };

/**
 * Study screen with:
 * - gradient header + helpful diagnostics
 * - skeleton while loading
 * - friendly error view w/ retry
 * - keyboard shortcuts (Space/1/2)
 */
export default function Study() {
  const [data, setData] = useState<Next | null>(null);
  const [showDef, setShowDef] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [apiOK, setApiOK] = useState<boolean | null>(null);

  /** Load the next card with graceful error handling. */
  const loadNext = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const ok = await checkApi();
      setApiOK(ok);
      const res = await getStudyNext();
      setData(res);
      setShowDef(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  const answer = useCallback(
    async (result: "correct" | "wrong") => {
      if (data?.status !== "ok") return;
      setLoading(true);
      setErr(null);
      try {
        await postStudyAnswer({ cardId: data.card.id, result });
        await loadNext();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to submit answer");
      } finally {
        setLoading(false);
      }
    },
    [data, loadNext]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!data) return;
      if (e.key === " ") {
        e.preventDefault();
        setShowDef((s) => s || true);
      } else if (e.key === "1") {
        void answer("wrong");
      } else if (e.key === "2") {
        void answer("correct");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, answer]);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      {/* Top notice with API diagnostics */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-emerald-600 p-[1px] shadow-lg">
        <div className="rounded-2xl bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-semibold text-slate-900">Study</h1>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">
                API: <code>{apiBaseURL()}</code>
              </span>
              <span
                className={[
                  "rounded-md px-2 py-1 text-white",
                  apiOK == null
                    ? "bg-slate-400"
                    : apiOK
                    ? "bg-emerald-600"
                    : "bg-rose-600",
                ].join(" ")}
              >
                {apiOK == null ? "checking…" : apiOK ? "connected" : "offline"}
              </span>
            </div>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Tips: ensure the API is running and <code>VITE_API_URL</code> points to it.
          </p>
        </div>
      </div>

      {/* Error view */}
      {err && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
          <h2 className="text-lg font-semibold text-rose-900">We hit a snag</h2>
          <p className="mt-1 text-rose-800">{err}</p>
          <div className="mt-4 flex gap-3">
            <button
              className="rounded-xl bg-rose-600 px-4 py-2 font-medium text-white hover:bg-rose-700"
              onClick={() => void loadNext()}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && !err && (
        <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-8">
          <div className="mb-4 h-5 w-24 rounded bg-slate-200" />
          <div className="mb-6 h-10 w-2/3 rounded bg-slate-200" />
          <div className="h-20 w-full rounded bg-slate-100" />
          <div className="mt-6 flex gap-3">
            <div className="h-9 w-32 rounded bg-slate-200" />
            <div className="h-9 w-32 rounded bg-slate-200" />
          </div>
        </div>
      )}

      {/* Primary states */}
      {data?.status === "temporarily_done" && !loading && !err && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-6">
          <h2 className="text-lg font-semibold text-indigo-900">You’re temporarily done</h2>
          <p className="mt-1 text-slate-600">Nothing due right now. Check back soon.</p>
          <button
            className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
            onClick={() => void loadNext()}
          >
            Refresh
          </button>
        </div>
      )}

      {data?.status === "permanently_done" && !loading && !err && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 text-center">
          <h2 className="text-xl font-semibold text-emerald-900">You’re permanently done 🎉</h2>
          <p className="mt-1 text-slate-600">
            All cards are either <b>never</b> or <b>hard to remember</b>.
          </p>
        </div>
      )}

      {data?.status === "ok" && !err && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-fuchsia-100/40 ring-1 ring-black/5">
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-1 text-xs font-semibold text-white shadow">
                Bin {data.card.bin}
              </span>
              <span
                className={[
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  data.card.status === "active" && "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
                  data.card.status === "never" && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
                  data.card.status === "hard_to_remember" &&
                    "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {data.card.status}
              </span>
            </div>

            <h2 className="mb-6 bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-4xl font-extrabold text-transparent">
              {data.card.word}
            </h2>

            {!showDef ? (
              <button
                className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                onClick={() => setShowDef(true)}
              >
                Show definition
              </button>
            ) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-lg text-slate-800">
                {data.card.definition}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex items-center rounded-xl bg-rose-600 px-4 py-2 font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
              onClick={() => void answer("wrong")}
              disabled={loading}
            >
              I didn’t get it
            </button>
            <button
              className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              onClick={() => void answer("correct")}
              disabled={loading}
            >
              I got it
            </button>
            <button
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
              onClick={() => void loadNext()}
              disabled={loading}
            >
              Skip / Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
