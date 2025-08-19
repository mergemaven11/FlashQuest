// frontend/src/pages/Study.tsx
import { useEffect, useState, useCallback } from "react";
import { getStudyNext, postStudyAnswer, binLabel } from "../api";
import type { StudyNext } from "../types";

/**
 * Study screen (black & white to match Admin).
 *
 * Features:
 * - Loading skeleton
 * - Friendly error with retry
 * - Keyboard shortcuts: Space (reveal), 1 (wrong), 2 (correct)
 * - Timer hint for the current bin (“Next in ~…") via api.binLabel
 * - Collapsible “How this works” info card
 * - Collapsible bin legend
 */
export default function Study() {
  const [data, setData] = useState<StudyNext | null>(null);
  const [showDef, setShowDef] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showInfo, setShowInfo] = useState(true); // default open once
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** Load the next card with graceful error handling. */
  const loadNext = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
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

  /**
   * Submit an answer and immediately fetch the next item.
   * @param result - "correct" or "wrong"
   */
  const answer = useCallback(
    async (result: "correct" | "wrong") => {
      if (data?.status !== "ok") return;
      setLoading(true);
      setErr(null);
      try {
        await postStudyAnswer(data.card.id, result);
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
        // Reveal definition
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
      {/* Header (black & white) */}
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold text-black">Study</h1>
        <p className="text-xs text-neutral-500">Space = reveal, 1 = wrong, 2 = correct</p>
      </div>

      {/* Info card: How this works */}
      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-black">How this works</h2>
          <button
            className="rounded-lg border border-black/10 px-3 py-1 text-sm text-neutral-800 hover:bg-neutral-50 transition"
            onClick={() => setShowInfo((s) => !s)}
            aria-expanded={showInfo}
            aria-controls="how-it-works"
          >
            {showInfo ? "Hide" : "Show"}
          </button>
        </div>
        {showInfo && (
          <div id="how-it-works" className="mt-3 text-sm text-neutral-800 space-y-2">
            <p>
              You’ll see a word. Press <b>Space</b> to reveal the definition, then mark your
              response:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <b>Got it (2)</b>: the card moves up to a higher <i>bin</i> and will reappear less
                often.
              </li>
              <li>
                <b>Didn’t get it (1)</b>: the card resets to <b>bin 1</b> and will reappear very
                soon.
              </li>
            </ul>
            <p>
              Each bin has an approximate delay (e.g. bin 1 ≈ <b>5s</b>, bin 7 ≈ <b>1d</b>).
              Reaching bin 11 marks the card as <b>never</b>. If you get a card wrong 10+ times,
              it’s marked <b>hard_to_remember</b> and hidden.
            </p>
            <p className="text-neutral-600">
              Selection priority: due cards first, then new cards. Use the legend below to see all
              bin delays.
            </p>
          </div>
        )}
      </div>

      {/* Error view */}
      {err && (
        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-lg font-semibold text-black">We hit a snag</h2>
          <p className="mt-1 text-neutral-700">{err}</p>
          <div className="mt-4 flex gap-3">
            <button
              className="rounded-xl border border-black bg-black px-4 py-2 font-medium text-white hover:bg-white hover:text-black transition"
              onClick={() => void loadNext()}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && !err && (
        <div className="animate-pulse rounded-2xl border border-black/10 bg-white p-8">
          <div className="mb-4 h-5 w-24 rounded bg-neutral-200" />
          <div className="mb-6 h-10 w-2/3 rounded bg-neutral-200" />
          <div className="h-20 w-full rounded bg-neutral-100" />
          <div className="mt-6 flex gap-3">
            <div className="h-9 w-32 rounded bg-neutral-200" />
            <div className="h-9 w-32 rounded bg-neutral-200" />
          </div>
        </div>
      )}

      {/* Primary states */}
      {data?.status === "temporarily_done" && !loading && !err && (
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <h2 className="text-lg font-semibold text-black">You’re temporarily done</h2>
          <p className="mt-1 text-neutral-600">Nothing due right now. Check back soon.</p>
          <button
            className="mt-4 rounded-xl border border-black bg-black px-4 py-2 font-medium text-white hover:bg-white hover:text-black transition"
            onClick={() => void loadNext()}
          >
            Refresh
          </button>
        </div>
      )}

      {data?.status === "permanently_done" && !loading && !err && (
        <div className="rounded-2xl border border-black/10 bg-white p-6 text-center">
          <h2 className="text-xl font-semibold text-black">You’re permanently done 🎉</h2>
          <p className="mt-1 text-neutral-600">
            All cards are either <b>never</b> or <b>hard to remember</b>.
          </p>
        </div>
      )}

      {data?.status === "ok" && !err && (
        <>
          <div className="rounded-2xl border border-black/10 bg-white p-8">
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-full border border-black px-3 py-1 text-xs font-semibold text-black">
                Bin {data.card.bin}
              </span>
              <span className="rounded-full border border-black px-2.5 py-1 text-xs font-medium text-black">
                {data.card.status}
              </span>
            </div>

            <h2 className="mb-4 text-4xl font-extrabold text-black">{data.card.word}</h2>

            {/* Timer hint for current bin */}
            <p className="mb-6 text-sm text-neutral-600">
              Next in{" "}
              <span className="font-medium text-black">~{binLabel(data.card.bin)}</span>
            </p>

            {!showDef ? (
              <button
                className="inline-flex items-center rounded-xl border border-black bg-black px-4 py-2 font-medium text-white hover:bg-white hover:text-black transition"
                onClick={() => setShowDef(true)}
              >
                Show definition
              </button>
            ) : (
              <p className="rounded-xl border border-black/10 bg-neutral-50 p-4 text-lg text-neutral-900">
                {data.card.definition}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex items-center rounded-xl border border-black px-4 py-2 font-medium text-black hover:bg-black hover:text-white transition"
              onClick={() => void answer("wrong")}
              disabled={loading}
            >
              I didn’t get it
            </button>
            <button
              className="inline-flex items-center rounded-xl border border-black bg-black px-4 py-2 font-medium text-white hover:bg-white hover:text-black transition"
              onClick={() => void answer("correct")}
              disabled={loading}
            >
              I got it
            </button>
            <button
              className="inline-flex items-center rounded-xl border border-black/10 bg-white px-4 py-2 font-medium text-neutral-800 hover:bg-neutral-50 transition"
              onClick={() => void loadNext()}
              disabled={loading}
            >
              Skip / Next
            </button>

            <button
              className="ml-auto inline-flex items-center rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50 transition"
              onClick={() => setShowLegend((s) => !s)}
              aria-expanded={showLegend}
            >
              {showLegend ? "Hide" : "Show"} bin legend
            </button>
          </div>

          {/* Collapsible bin legend */}
          {showLegend && (
            <div className="rounded-2xl border border-black/10 bg-white p-6">
              <h3 className="mb-3 text-sm font-semibold text-black">Spaced Repetition Bins</h3>
              <ul className="grid grid-cols-2 gap-2 text-sm text-neutral-800 sm:grid-cols-3">
                {Array.from({ length: 12 }, (_, i) => i).map((i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-black/10 bg-neutral-50 px-3 py-2"
                  >
                    <span className="font-medium text-black">Bin {i}</span>
                    <span className="text-neutral-700">{binLabel(i)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}