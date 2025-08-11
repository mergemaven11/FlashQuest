import { useEffect, useState } from "react";
import { api } from "../api";

/**
 * Admin screen: create cards and view status (bin, wrong_count, next_review_at).
 */
export default function Admin() {
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get("/cards/admin");
    setRows(data);
    setLoading(false);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim() || !definition.trim()) return;
    await api.post("/cards", { word, definition });
    setWord("");
    setDefinition("");
    await load();
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1>Admin</h1>

      <form onSubmit={create} style={{ display: "grid", gap: 8, maxWidth: 520, marginTop: 16 }}>
        <label>
          <div>Word</div>
          <input value={word} onChange={(e) => setWord(e.target.value)} required />
        </label>
        <label>
          <div>Definition</div>
          <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} required />
        </label>
        <button type="submit">Create Card</button>
      </form>

      <div style={{ marginTop: 24 }}>
        <h2>Cards</h2>
        {loading ? (
          <div>Loading…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>ID</th>
                  <th style={th}>Word</th>
                  <th style={th}>Definition</th>
                  <th style={th}>Bin</th>
                  <th style={th}>Wrong Count</th>
                  <th style={th}>Next Review</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{r.id}</td>
                    <td style={td}>{r.word}</td>
                    <td style={td}>{r.definition}</td>
                    <td style={td}>{r.bin}</td>
                    <td style={td}>{r.wrong_count}</td>
                    <td style={td}>{r.next_review_at ?? "—"}</td>
                    <td style={td}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 };
const td: React.CSSProperties = { borderBottom: "1px solid #eee", padding: 8 };
