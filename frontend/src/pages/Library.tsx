import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getLibraryDecks } from "../api";
import type {
  CardKind,
  DeckDifficulty,
  DeckPage,
  DeckRead,
  LibrarySort,
  LibrarySource,
} from "../types";

const difficultyOptions: Array<{ value: "" | DeckDifficulty; label: string }> = [
  { value: "", label: "Any difficulty" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];

const sourceOptions: Array<{ value: LibrarySource; label: string }> = [
  { value: "all", label: "Official + Community" },
  { value: "official", label: "Official only" },
  { value: "community", label: "Community only" },
];

const kindOptions: Array<{ value: "" | CardKind; label: string }> = [
  { value: "", label: "Concepts + Labs" },
  { value: "concept", label: "Concept decks" },
  { value: "lab", label: "Lab decks" },
];

const sortOptions: Array<{ value: LibrarySort; label: string }> = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "updated", label: "Recently updated" },
  { value: "title", label: "A–Z" },
];

function difficultyIcon(value: string): string {
  if (value === "expert") return "👑";
  if (value === "advanced") return "🔥";
  if (value === "intermediate") return "⚔️";
  return "🌱";
}

function DeckCard({ deck }: { deck: DeckRead }) {
  return (
    <article className="game-panel group flex min-h-full flex-col p-5 transition duration-200 hover:-translate-y-1 hover:border-[#faa307]/30 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <span
            className={`game-chip px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
              deck.is_official ? "text-[#ffba08]" : "text-cyan-200"
            }`}
          >
            {deck.is_official ? "⭐ Official" : "🧑‍🚀 Community"}
          </span>
          <span className="game-chip px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">
            {difficultyIcon(deck.difficulty)} {deck.difficulty}
          </span>
        </div>
        <span className="text-xs font-bold text-slate-500">{deck.card_count} cards</span>
      </div>

      <p className="metric-label mt-5">{deck.subject}</p>
      <h2 className="mt-2 text-2xl font-black leading-tight text-white">{deck.title}</h2>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">
        {deck.description || "A FlashQuest study deck ready for your next run."}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {deck.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="rounded-full bg-white/[0.045] px-2.5 py-1 text-[11px] font-bold text-slate-400">
            #{tag}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <p className="mb-3 text-xs text-slate-500">
          {deck.is_official
            ? "Curated by FlashQuest"
            : `By ${deck.creator_display_name || "a FlashQuest creator"}`}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            to={`/study?deck=${deck.id}`}
            className="game-button bg-[#ffba08] px-4 py-3 text-center text-sm font-black text-[#370617]"
            data-game-sound="navigate"
          >
            ⚡ Study now
          </Link>
          <Link
            to={`/library/${encodeURIComponent(deck.slug)}`}
            className="game-button border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-black text-white"
            data-game-sound="navigate"
          >
            View deck
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function Library() {
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState<DeckPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const current = useMemo(
    () => ({
      q: params.get("q") ?? "",
      subject: params.get("subject") ?? "",
      difficulty: (params.get("difficulty") ?? "") as "" | DeckDifficulty,
      source: (params.get("source") ?? "all") as LibrarySource,
      kind: (params.get("kind") ?? "") as "" | CardKind,
      sort: (params.get("sort") ?? "featured") as LibrarySort,
      page: Math.max(1, Number(params.get("page") || 1) || 1),
    }),
    [params]
  );

  const [query, setQuery] = useState(current.q);
  const [subject, setSubject] = useState(current.subject);

  useEffect(() => {
    setQuery(current.q);
    setSubject(current.subject);
  }, [current.q, current.subject]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await getLibraryDecks({
          q: current.q || undefined,
          subject: current.subject || undefined,
          difficulty: current.difficulty || undefined,
          source: current.source,
          kind: current.kind || undefined,
          sort: current.sort,
          page: current.page,
          page_size: 12,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the Library");
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchParams(values: Record<string, string | number | undefined>) {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => {
      if (value === undefined || value === "" || value === "all" || value === "featured") {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    });
    if (!("page" in values)) next.delete("page");
    setParams(next);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    patchParams({ q: query.trim(), subject: subject.trim(), page: undefined });
  }

  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;

  return (
    <div className="grid gap-6">
      <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
        <div>
          <p className="metric-label">📚 FlashQuest Library</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">
            Pick a subject. <span className="ember-text">Start a quest.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
            Explore FlashQuest Official decks and study packs shared by the community. Browse free, study instantly, and find the format that works for this topic today.
          </p>
        </div>
        <div className="game-panel grid grid-cols-2 gap-3 p-4 text-center">
          <div>
            <p className="metric-label">Public decks</p>
            <strong className="mt-1 block text-2xl font-black text-white">{result?.total ?? "—"}</strong>
          </div>
          <div>
            <p className="metric-label">Access</p>
            <strong className="mt-1 block text-2xl font-black text-white">Free</strong>
          </div>
        </div>
      </section>

      <form onSubmit={submitSearch} className="game-panel grid gap-4 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1.35fr_.8fr_auto]">
          <label className="grid gap-1.5 text-xs font-black text-slate-300">
            Search
            <input
              className="game-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Docker, algebra, accounting, networking…"
              maxLength={120}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-black text-slate-300">
            Subject
            <input
              className="game-input"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Any subject"
              maxLength={80}
            />
          </label>
          <button className="game-button self-end bg-[#faa307] px-5 py-3 font-black text-[#370617]" type="submit" data-game-sound="tap">
            🔎 Search
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1.5 text-xs font-black text-slate-300">
            Difficulty
            <select
              className="game-input"
              value={current.difficulty}
              onChange={(event) => patchParams({ difficulty: event.target.value })}
            >
              {difficultyOptions.map((option) => <option key={option.value || "any"} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-black text-slate-300">
            Creator
            <select
              className="game-input"
              value={current.source}
              onChange={(event) => patchParams({ source: event.target.value })}
            >
              {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-black text-slate-300">
            Card style
            <select
              className="game-input"
              value={current.kind}
              onChange={(event) => patchParams({ kind: event.target.value })}
            >
              {kindOptions.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-black text-slate-300">
            Sort
            <select
              className="game-input"
              value={current.sort}
              onChange={(event) => patchParams({ sort: event.target.value })}
            >
              {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </form>

      {error && (
        <section className="game-panel border-[#d00000]/50 p-6">
          <h2 className="font-black text-white">🛡️ Library quest interrupted</h2>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <button className="game-button mt-4 bg-[#faa307] px-4 py-2 text-sm font-black text-[#370617]" onClick={() => void load()}>
            Try again
          </button>
        </section>
      )}

      {loading && !result ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading Library">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="game-panel min-h-64 animate-pulse p-6"><div className="h-4 w-28 rounded bg-white/10" /><div className="mt-8 h-7 w-4/5 rounded bg-white/10" /><div className="mt-4 h-20 rounded bg-white/[0.06]" /></div>
          ))}
        </section>
      ) : result && result.items.length > 0 ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((deck) => <DeckCard key={deck.id} deck={deck} />)}
          </section>

          <nav className="game-panel flex flex-wrap items-center justify-between gap-3 p-4" aria-label="Library pages">
            <p className="text-xs font-bold text-slate-400">Page {current.page} of {pageCount} · {result.total} decks</p>
            <div className="flex gap-2">
              <button
                className="game-button border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-white"
                disabled={current.page <= 1 || loading}
                onClick={() => patchParams({ page: current.page - 1 })}
              >
                ← Previous
              </button>
              <button
                className="game-button border border-[#faa307]/30 bg-[#faa307]/10 px-4 py-2 text-sm font-black text-[#ffba08]"
                disabled={current.page >= pageCount || loading}
                onClick={() => patchParams({ page: current.page + 1 })}
              >
                Next →
              </button>
            </div>
          </nav>
        </>
      ) : !error ? (
        <section className="game-panel p-10 text-center">
          <div className="text-5xl">🧭</div>
          <h2 className="mt-4 text-2xl font-black text-white">No decks found on this path</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">Try another subject or clear a filter. The Library grows as Official packs and community creators publish new quests.</p>
          <button
            className="game-button mt-5 bg-[#faa307] px-5 py-3 font-black text-[#370617]"
            onClick={() => setParams(new URLSearchParams())}
          >
            Clear filters
          </button>
        </section>
      ) : null}
    </div>
  );
}
