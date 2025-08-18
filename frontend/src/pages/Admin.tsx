/**
 * Admin view:
 * - Create new cards
 * - List all cards with bin/status (joins user state on backend)
 * - Optional search across word/definition
 */

import { useEffect, useMemo, useState } from "react";
import { createCard, listAdminCards } from "../api";
import type { CardAdminRead } from "../types";

export default function Admin() {
  // Minimal search and create form state
  /**
 * Admin view: create new cards and list all with bin/status.
 * @remarks Search is case-insensitive on word/definition.
 */
  const [q, setQ] = useState("");
  const [list, setList] = useState<CardAdminRead[]>([]);
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Placeholder for computed filters/sorting (simple for now)
  const filtered = useMemo(() => list, [list]);

  /**
   * Fetch list from backend, optionally filtered by q.
   * Separating "refresh" lets us reuse for first load and manual search clicks.
   */
  async function refresh() {
    setErr(null);
    setLoading(true);
    try {
      const rows = await listAdminCards(q.trim() || undefined);
      setList(rows);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Create handler:
   * - requires non-empty word/definition
   * - clears inputs after success
   * - refreshes list
   */
  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!word.trim() || !definition.trim()) return;
    setErr(null);
    setLoading(true);
    try {
      await createCard({ word: word.trim(), definition: definition.trim() });
      setWord("");
      setDefinition("");
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create card");
    } finally {
      setLoading(false);
    }
  }

  // Initial list load
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Admin</h1>

      {err && <div className="border border-red-300 bg-red-50 p-2 mb-3">{err}</div>}

      {/* Create form */}
      <form onSubmit={onCreate} className="border rounded p-3 mb-4 flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-sm mb-1">Word</label>
          <input
            className="w-full border rounded px-2 py-1"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="abate"
          />
        </div>
        <div className="flex-[2]">
          <label className="block text-sm mb-1">Definition</label>
          <input
            className="w-full border rounded px-2 py-1"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="to become less intense or widespread"
          />
        </div>
        <button
          className="px-3 py-2 rounded bg-black text-white"
          type="submit"
          disabled={loading}
        >
          Add
        </button>
      </form>

      {/* Search + refresh */}
      <div className="flex gap-2 mb-3">
        <input
          className="border rounded px-2 py-1 flex-1"
          placeholder="Search (word/definition)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="px-3 py-2 rounded bg-gray-200" onClick={refresh} disabled={loading}>
          Search
        </button>
      </div>

      {loading && <div className="opacity-70 mb-2">Loading…</div>}

      {/* Results table */}
      <div className="overflow-auto border rounded">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2">ID</th>
              <th className="p-2">Word</th>
              <th className="p-2">Definition</th>
              <th className="p-2">Bin</th>
              <th className="p-2">Status</th>
              <th className="p-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">{c.id}</td>
                <td className="p-2">{c.word}</td>
                <td className="p-2">{c.definition}</td>
                <td className="p-2">{c.bin}</td>
                <td className="p-2">{c.status}</td>
                <td className="p-2">{new Date(c.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td className="p-2 text-gray-500" colSpan={6}>
                  No cards yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
