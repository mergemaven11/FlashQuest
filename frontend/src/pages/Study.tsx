/**
 * Study view:
 * - fetch next card
 * - reveal definition
 * - submit "correct"/"wrong"
 * - repeat until temporarily/permanently done
 */

import { useEffect, useState } from "react";
import { getStudyNext, postStudyAnswer } from "../api";
import type { StudyNext } from "../types";

export default function Study() {
  // Discriminated union: {status:"ok"|"temporarily_done"|"permanently_done", ...}
  /**
 * Study view: fetch next card → reveal → mark correct/wrong.
 * @remarks Implements the spec's selection + messaging flow.
 */
  const [state, setState] = useState<StudyNext | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /**
   * Load the next study item from the API.
   * Resets "revealed" state so we only show definition after user clicks.
   */
  async function loadNext() {
    setErr(null);
    setLoading(true);
    setRevealed(false);
    try {
      const data = await getStudyNext();
      setState(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load next card");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Submit user's answer and immediately fetch the next item.
   * @param result - "correct" or "wrong"
   */
  async function answer(result: "correct" | "wrong") {
    if (!state || state.status !== "ok") return;
    setLoading(true);
    setErr(null);
    try {
      await postStudyAnswer(state.card.id, result);
      await loadNext();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to submit answer");
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    void loadNext();
  }, []);

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Study</h1>

      {/* Errors bubble up here */}
      {err && <div className="border border-red-300 bg-red-50 p-2 mb-3">{err}</div>}

      {loading && <div className="opacity-70">Loading…</div>}

      {/* Main "OK" state: show word → reveal definition → answer buttons */}
      {!loading && state?.status === "ok" && (
        <div className="border rounded p-4">
          <div className="text-sm text-gray-500 mb-2">
            bin {state.card.bin} · status {state.card.status}
          </div>

          <div className="text-3xl font-bold mb-4">{state.card.word}</div>

          {!revealed ? (
            <button
              className="px-3 py-2 rounded bg-black text-white"
              onClick={() => setRevealed(true)}
            >
              Show definition
            </button>
          ) : (
            <>
              <div className="text-lg mb-4">{state.card.definition}</div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-2 rounded bg-green-600 text-white"
                  onClick={() => answer("correct")}
                  disabled={loading}
                >
                  I got it
                </button>
                <button
                  className="px-3 py-2 rounded bg-gray-200"
                  onClick={() => answer("wrong")}
                  disabled={loading}
                >
                  I did not
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Spec-required messages */}
      {!loading && state?.status === "temporarily_done" && (
        <div className="border rounded p-4 bg-yellow-50">
          You are temporarily done; please come back later to review more words.
          <div className="mt-3">
            <button className="px-3 py-2 rounded bg-black text-white" onClick={loadNext}>
              Check again
            </button>
          </div>
        </div>
      )}

      {!loading && state?.status === "permanently_done" && (
        <div className="border rounded p-4 bg-green-50">
          You have no more words to review; you are permanently done!
        </div>
      )}
    </div>
  );
}
