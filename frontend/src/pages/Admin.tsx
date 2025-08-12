import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { AdminCard } from "../types";

/**
 * Admin screen:
 * - Create new cards
 * - Search list
 * - Edit word/definition
 * - Delete a card
 */
export default function Admin() {
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminCard[]>([]);
  const [loading, setLoading] = useState(false);

  // edit state
  const [editing, setEditing] = useState<AdminCard | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editDef, setEditDef] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await api.get<AdminCard[]>("/cards/admin", {
      params: { q, limit: 100, offset: 0 },
    });
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

  const startEdit = (row: AdminCard) => {
    setEditing(row);
    setEditWord(row.word);
    setEditDef(row.definition);
  };

  const saveEdit = async () => {
    if (!editing) return;
    await api.put(`/cards/${editing.id}`, {
      word: editWord,
      definition: editDef,
    });
    setEditing(null);
    await load();
  };

  const remove = async (row: AdminCard) => {
    if (!confirm(`Delete card #${row.id} "${row.word}"? This cannot be undone.`)) return;
    await api.delete(`/cards/${row.id}`);
    await load();
  };

  const stats = useMemo(() => {
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    return byStatus;
  }, [rows]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []); // initial
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]); // debounce search

  return (
    <div style={{ padding: 16, maxWidth: 1100 }}>
      <h1>Admin</h1>

      {/* Create */}
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

      {/* Search & stats */}
      <div style={{ marginTop: 24, display: "flex", gap: 16, alignItems: "center" }}>
        <input
          placeholder="Search word/definition…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 320 }}
        />
        <button onClick={load}>Refresh</button>
        <span style={{ opacity: 0.7 }}>
          {loading ? "Loading…" : `Total: ${rows.length} | active: ${stats["active"] || 0}, never: ${stats["never"] || 0}, hard: ${stats["hard_to_remember"] || 0}`}
        </span>
      </div>

      {/* List */}
      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>ID</th>
              <th style={th}>Word</th>
              <th style={th}>Definition</th>
              <th style={th}>Bin</th>
              <th style={th}>Wrong</th>
              <th style={th}>Next</th>
              <th style={th}>Status</th>
              <th style={th}>Actions</th>
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
                <td style={td}>
                  <button onClick={() => startEdit(r)}>Edit</button>{" "}
                  <button onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td style={td} colSpan={8}>No cards yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Simple edit dialog */}
      {editing && (
        <div style={dialogWrap}>
          <div style={dialogBox}>
            <h3>Edit Card #{editing.id}</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <label>
                <div>Word</div>
                <input value={editWord} onChange={(e) => setEditWord(e.target.value)} />
              </label>
              <label>
                <div>Definition</div>
                <textarea value={editDef} onChange={(e) => setEditDef(e.target.value)} />
              </label>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)}>Cancel</button>
              <button onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 };
const td: React.CSSProperties = { borderBottom: "1px solid #eee", padding: 8 };

const dialogWrap: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const dialogBox: React.CSSProperties = {
  background: "#fff", padding: 16, borderRadius: 8, minWidth: 400,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};
