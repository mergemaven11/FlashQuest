// frontend/src/pages/Admin.tsx
/**
 * Admin view:
 * - Create new cards
 * - List cards with bin/status (joins user state on backend)
 * - Client-side search across word/definition
 * - Reset all progress (per default user)
 * - Export current cards to CSV (ALL rows or VISIBLE/filtered)
 * - Import cards from CSV (word,definition) — at the very bottom
 * - Delete a single card (trashcan icon on far-left)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createCard, listAdminCards, adminReset, deleteCard } from "../api";
import type { CardAdminRead, CreateCardPayload } from "../types";

/** Row parsed from CSV. */
type CsvRow = { word: string; definition: string };

/**
 * Detect a likely CSV delimiter from the first line.
 * @param s Raw CSV text
 * @returns the detected delimiter character (default ",")
 */
function detectDelimiter(s: string): string {
  const firstLine = (s.split(/\r?\n/)[0] ?? "").replace(/^\uFEFF/, "");
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const c = (firstLine.match(new RegExp(`\\${d}`, "g")) || []).length;
    if (c > bestCount) {
      bestCount = c;
      best = d;
    }
  }
  return best;
}

/**
 * Parse CSV text into a grid of cells.
 * Handles quoted fields, escaped quotes, commas in quotes, mixed newlines, BOM.
 * @param text CSV content as a string
 * @param delimiter Optional forced delimiter; auto-detected when omitted
 */
function parseCSV(text: string, delimiter?: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const s0 = text.replace(/^\uFEFF/, "");
  const d = delimiter ?? detectDelimiter(s0);
  const s = s0.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i += 1;
          continue;
        }
      } else {
        cur += ch;
        i += 1;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === d) {
        row.push(cur);
        cur = "";
        i += 1;
        continue;
      }
      if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
    }
  }
  row.push(cur);
  rows.push(row);
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/**
 * Convert a cell grid into CsvRow objects.
 * Detects header (word/definition), falls back to first two columns.
 */
function gridToRows(grid: string[][]): CsvRow[] {
  if (grid.length === 0) return [];
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const hasHeader =
    header.includes("word") && header.includes("definition") && grid.length > 1;

  const rows = hasHeader ? grid.slice(1) : grid;
  let wordIdx = 0;
  let defIdx = 1;

  if (hasHeader) {
    wordIdx = header.indexOf("word");
    defIdx = header.indexOf("definition");
  }

  const out: CsvRow[] = [];
  for (const r of rows) {
    const word = (r[wordIdx] ?? "").trim();
    const definition = (r[defIdx] ?? "").trim();
    if (word && definition) out.push({ word, definition });
  }
  return out;
}

/**
 * Concurrency-limited async mapper.
 * @template T Input item type
 * @template R Result type
 * @param items Items to process
 * @param limit Max concurrency
 * @param worker Async worker function
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let active = 0;

  return new Promise((resolve, reject) => {
    const launch = () => {
      while (active < limit && next < items.length) {
        const i = next++;
        active++;
        worker(items[i], i)
          .then((res) => (results[i] = res))
          .catch(reject)
          .finally(() => {
            active--;
            if (next === items.length && active === 0) resolve(results);
            else launch();
          });
      }
    };
    launch();
  });
}

/**
 * Escape a value for safe CSV serialization.
 * @param v Any value
 */
function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Simple timestamp for filenames (YYYY-MM-DD-HH-MM-SS). */
function stamp(): string {
  return new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
}

/**
 * Download arbitrary rows as CSV with given columns.
 * Includes UTF-8 BOM for Excel.
 * @param filenameBase Base filename without extension
 * @param rows Array of row objects
 * @param columns Column keys to export (order respected)
 */
function downloadCsv(
  filenameBase: string,
  rows: Array<Record<string, unknown>>,
  columns: string[]
) {
  const header = columns.map(csvEscape).join(",");
  const body = rows
    .map((r) => columns.map((c) => csvEscape(r[c])).join(","))
    .join("\r\n");
  const csv = `\uFEFF${header}\r\n${body}\r\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}_${rows.length}_${stamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Admin() {
  // ===== Basic state =====
  const [q, setQ] = useState("");
  const [list, setList] = useState<CardAdminRead[]>([]);
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Track which rows are being deleted (per-row disabled/spinner)
  const [deleting, setDeleting] = useState<Set<number>>(new Set());

  // ===== CSV state (import section lives at the bottom) =====
  const [csvName, setCsvName] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [importing, setImporting] = useState(0); // 0 or progress percent
  const [importProgress, setImportProgress] = useState(0);
  const [importSummary, setImportSummary] = useState<{
    created: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // ===== Dropdown menu state for the Import/Export menu =====
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  /** Fetch the full list (no server-side filtering). */
  async function refreshAll() {
    setErr(null);
    setLoading(true);
    try {
      const rows = await listAdminCards();
      setList(rows);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }

  // Client-side filtering so imports/exports/resets see everything by default
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (c) =>
        c.word.toLowerCase().includes(s) ||
        c.definition.toLowerCase().includes(s)
    );
  }, [q, list]);

  // Initial load
  useEffect(() => {
    void refreshAll();
  }, []);

  /** Create a card, then refresh full list. */
  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!word.trim() || !definition.trim()) return;
    setErr(null);
    setLoading(true);
    try {
      await createCard({ word: word.trim(), definition: definition.trim() });
      setWord("");
      setDefinition("");
      setQ(""); // show new item even if user had a filter
      await refreshAll();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create card");
    } finally {
      setLoading(false);
    }
  }

  /** Confirm + reset progress; then hard refresh. */
  async function onResetProgress() {
    if (!confirm("Reset ALL progress for the default user? This cannot be undone.")) return;
    setLoading(true);
    setErr(null);
    try {
      await adminReset();
      setQ("");
      await refreshAll();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to reset progress");
    } finally {
      setLoading(false);
    }
  }

  /** Delete a card (red trashcan on far-left). */
  async function onDelete(id: number) {
    if (!confirm("Delete this card? This removes the card and its progress.")) return;
    setDeleting((s) => new Set(s).add(id));
    try {
      // Optimistic removal
      setList((prev) => prev.filter((c) => c.id !== id));
      await deleteCard(id);
      // If you prefer authoritative list, call: await refreshAll();
    } catch (e: any) {
      // Revert by reloading the list on failure
      await refreshAll();
      setErr(e?.message ?? "Failed to delete card");
    } finally {
      setDeleting((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  // ===== CSV import helpers (bottom section UI) =====

  /** Handle file selection and parse into CsvRow[] */
  async function onPickCsv(file: File) {
    try {
      setCsvError(null);
      setCsvName(file.name);
      const text = await file.text();
      const grid = parseCSV(text); // auto-detects delimiter + handles BOM
      let rows = gridToRows(grid);

      // Dedup within-file by word (case-insensitive)
      const seen = new Set<string>();
      rows = rows.filter((r) => {
        const k = r.word.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      setCsvRows(rows);
      setImportSummary(null);
      setImportProgress(0);
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : "Failed to parse CSV");
      setCsvRows([]);
      setCsvName(null);
    }
  }

  /** Begin importing parsed CSV rows using limited concurrency. */
  async function startImport() {
    if (csvRows.length === 0) return;
    setImporting(1);
    setImportSummary(null);
    setImportProgress(0);

    let created = 0;
    let failed = 0;
    const TOTAL = csvRows.length;
    let done = 0;

    try {
      await mapWithConcurrency<CreateCardPayload, void>(
        csvRows.map((r) => ({ word: r.word, definition: r.definition })),
        5,
        async (payload) => {
          try {
            await createCard(payload);
            created += 1;
          } catch {
            failed += 1;
          } finally {
            done += 1;
            setImportProgress(Math.round((done / TOTAL) * 100));
          }
        }
      );
      const skipped = 0;
      setImportSummary({ created, failed, skipped });
      setQ("");
      await refreshAll();
    } finally {
      setImporting(0);
    }
  }

  // ===== Export helpers =====
  function exportWordsDefsAll() {
    const rows = list.map((c) => ({ word: c.word, definition: c.definition }));
    downloadCsv("flashcards_export_words_defs_ALL", rows, ["word", "definition"]);
  }
  function exportWordsDefsVisible() {
    const rows = filtered.map((c) => ({ word: c.word, definition: c.definition }));
    downloadCsv("flashcards_export_words_defs_VISIBLE", rows, ["word", "definition"]);
  }
  function exportFullAll() {
    const rows = list.map((c) => ({
      id: c.id,
      word: c.word,
      definition: c.definition,
      bin: c.bin,
      status: c.status,
      created_at: c.created_at ?? "",
    }));
    downloadCsv(
      "flashcards_export_full_ALL",
      rows,
      ["id", "word", "definition", "bin", "status", "created_at"]
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      {/* Title */}
      <div className="flex items-end justify-between gap-2">
        <h1 className="text-2xl font-semibold">Admin</h1>
      </div>

      {err && <div className="border border-red-300 bg-red-50 p-2">{err}</div>}

      {/* Explainer card: what columns mean */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <h2 className="text-lg font-semibold text-black">What the columns mean</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm text-neutral-800 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-black">ID</dt>
            <dd>Internal numeric identifier for the card.</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Word</dt>
            <dd>The vocabulary term you’re learning.</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Definition</dt>
            <dd>Short explanation of the word.</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Bin</dt>
            <dd>Spaced-repetition level (0–11). Higher bins appear less often.</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Status</dt>
            <dd>
              <b>active</b> = in rotation; <b>hard_to_remember</b> = many wrong answers;{" "}
              <b>never</b> = maxed out at bin 11.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-black">Created</dt>
            <dd>When the card was added.</dd>
          </div>
        </dl>
      </div>

      {/* Create form */}
      <form onSubmit={onCreate} className="border rounded p-3 flex gap-2 items-end bg-white">
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
        <button className="px-3 py-2 rounded bg-black text-white" type="submit" disabled={loading}>
          Add
        </button>
      </form>

      {/* Search + counts */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex gap-2 flex-1">
          <input
            className="border rounded px-2 py-1 flex-1"
            placeholder="Search (word/definition)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="px-3 py-2 rounded bg-gray-200"
            onClick={() => setQ("")}
            disabled={loading || q === ""}
          >
            Clear
          </button>
        </div>
        <div className="text-sm text-neutral-700">
          Showing <b>{filtered.length}</b> of <b>{list.length}</b>
        </div>
      </div>

      {loading && <div className="opacity-70">Loading…</div>}

      {/* Results table */}
      <div className="overflow-auto border rounded">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 w-[36px]" title="Delete" aria-label="Delete column">{/* Trash */}</th>
              <th className="p-2">ID</th>
              <th className="p-2">Word</th>
              <th className="p-2">Definition</th>
              <th className="p-2">Bin</th>
              <th className="p-2">Status</th>
              <th className="p-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const isDeleting = deleting.has(c.id);
              return (
                <tr key={c.id} className="border-t align-top">
                  {/* Red trashcan on far-left */}
                  <td className="p-2">
                    <button
                      className="rounded p-1 hover:bg-red-50 transition disabled:opacity-50"
                      title="Delete card"
                      aria-label={`Delete ${c.word}`}
                      onClick={() => void onDelete(c.id)}
                      disabled={isDeleting}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className={`h-4 w-4 ${isDeleting ? "text-red-400" : "text-red-600 hover:text-red-700"}`}
                      >
                        <path d="M9 3a1 1 0 0 0-1 1v1H5.5a1 1 0 1 0 0 2H6v11a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h.5a1 1 0 1 0 0-2H16V4a1 1 0 0 0-1-1H9zm2 2h2v1h-2V5zM8 7h8v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V7zm2.75 3a.75.75 0 0 0-.75.75v6.5a.75.75 0 1 0 1.5 0v-6.5a.75.75 0 0 0-.75-.75zm4.5 0a.75.75 0 0 0-.75.75v6.5a.75.75 0 1 0 1.5 0v-6.5a.75.75 0 0 0-.75-.75z" />
                      </svg>
                    </button>
                  </td>

                  <td className="p-2">{c.id}</td>
                  <td className="p-2 font-medium text-black">{c.word}</td>
                  <td className="p-2 whitespace-pre-wrap break-words text-neutral-900">{c.definition}</td>
                  <td className="p-2">{c.bin}</td>
                  <td className="p-2">{c.status}</td>
                  <td className="p-2">
                    {c.created_at ? new Date(c.created_at).toLocaleString() : "—"}
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td className="p-2 text-gray-500" colSpan={7}>
                  No cards yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* === CSV Import (last section) === */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-black">Import from CSV</h2>

          <div className="flex gap-2 items-center">
            {/* Dropdown menu with exports + reset */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-lg border border-black/10 px-3 py-1 text-sm text-neutral-800 hover:bg-neutral-50 transition"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                Download template
                <span className="ml-1 align-middle">▾</span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-10 mt-1 w-64 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg"
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      exportWordsDefsAll();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    Export words+defs (ALL {list.length})
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      exportWordsDefsVisible();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-50"
                    disabled={filtered.length === 0}
                  >
                    Export words+defs (VISIBLE {filtered.length})
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      exportFullAll();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-50"
                    disabled={list.length === 0}
                  >
                    Export full (ALL {list.length})
                  </button>

                  <div className="my-1 h-px bg-neutral-200" />

                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onResetProgress();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Reset all progress
                  </button>
                </div>
              )}
            </div>

            {/* Choose file */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-black px-3 py-1 text-sm text-black hover:bg-black hover:text-white transition"
            >
              Choose file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickCsv(f);
              }}
            />
          </div>
        </div>

        <p className="mt-2 text-sm text-neutral-700">
          CSV should contain <code>word</code> and <code>definition</code> columns (header
          optional). Quotes, commas, and UTF-8 BOM are supported.
        </p>

        {csvError && <p className="mt-2 text-sm text-red-700">Error: {csvError}</p>}

        {csvRows.length > 0 && (
          <div className="mt-3 space-y-3">
            <div className="text-sm text-neutral-800">
              File: <b>{csvName}</b> — Parsed rows: <b>{csvRows.length}</b>
            </div>

            <div className="overflow-auto border rounded">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2">Word</th>
                    <th className="p-2">Definition</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((r, i) => (
                    <tr key={i} className="border-t align-top">
                      <td className="p-2 font-medium text-black">{r.word}</td>
                      <td className="p-2 whitespace-pre-wrap break-words text-neutral-900">
                        {r.definition}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={startImport}
                disabled={!!importing}
                className="rounded-xl border border-black bg-black px-4 py-2 text-white hover:bg-white hover:text-black transition"
              >
                {importing ? "Importing…" : "Import"}
              </button>
              {!!importing && (
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <div className="h-2 w-40 overflow-hidden rounded bg-neutral-200">
                    <div
                      className="h-2 bg-black transition-all"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                  <span>{importProgress}%</span>
                </div>
              )}
              {importSummary && (
                <div className="text-sm text-neutral-800">
                  Created: <b>{importSummary.created}</b>, Failed:{" "}
                  <b>{importSummary.failed}</b>, Skipped: <b>{importSummary.skipped}</b>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
