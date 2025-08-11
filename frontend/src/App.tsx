import { useEffect, useState } from "react";
import { api } from "./api";
import type { Card, NextResponse, AnswerResult } from "./types";

/**
 * Root application component for the Flashcards SPA.
 * - Loads the next card
 * - Reveals definition on click
 * - Submits "correct"/"wrong" and continues
 */
export default function App() {
  const [state, setState] = useState<NextResponse | null>(null);
  const [showDef, setShowDef] = useState(false);

  const loadNext = async () => {
    const { data } = await api.get<NextResponse>("/study/next");
    setState(data);
    setShowDef(false);
  };

  const answer = async (result: AnswerResult) => {
    if (state && "card" in state) {
      await api.post("/study/answer", null, {
        params: { card_id: state.card.id, result },
      });
      await loadNext();
    }
  };

  useEffect(() => {
    loadNext();
  }, []);

  if (!state) return <div style={{ padding: 16 }}>Loading…</div>;

  if (state.status === "temporarily_done")
    return (
      <div style={{ padding: 16 }}>
        <h2>You are temporarily done; please come back later to review more words.</h2>
        <button onClick={loadNext}>Check again</button>
      </div>
    );

  if (state.status === "permanently_done")
    return (
      <div style={{ padding: 16 }}>
        <h2>You have no more words to review; you are permanently done!</h2>
      </div>
    );

  const { card } = state as { status: "ok"; card: Card };

  return (
    <div style={{ padding: 16, maxWidth: 640 }}>
      <h1>Flashcards</h1>
      <div style={{ marginTop: 24, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
        <div><strong>Word:</strong> {card.word}</div>

        {showDef ? (
          <div style={{ marginTop: 12 }}>
            <strong>Definition:</strong> {card.definition}
          </div>
        ) : (
          <button style={{ marginTop: 12 }} onClick={() => setShowDef(true)}>
            Show definition
          </button>
        )}

        {showDef && (
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button onClick={() => answer("correct")}>I got it</button>
            <button onClick={() => answer("wrong")}>I did not get it</button>
          </div>
        )}
      </div>
    </div>
  );
}
