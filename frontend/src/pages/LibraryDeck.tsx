import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { copyFeaturedDeck, getSharedDeck } from "../api";
import { useAuth } from "../auth";
import type { DeckRead } from "../types";

function difficultyIcon(value: string): string {
  if (value === "expert") return "👑";
  if (value === "advanced") return "🔥";
  if (value === "intermediate") return "⚔️";
  return "🌱";
}

export default function LibraryDeck() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deck, setDeck] = useState<DeckRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getSharedDeck(slug)
      .then((value) => {
        if (active) setDeck(value);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Could not load this deck");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  async function saveOfficialCopy() {
    if (!deck || !user || saving || !deck.is_official) return;
    setSaving(true);
    setError(null);
    try {
      const copy = await copyFeaturedDeck(deck.id);
      navigate(`/study?deck=${copy.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this deck");
    } finally {
      setSaving(false);
    }
  }

  async function shareDeck() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("Link copied!");
    } catch {
      setShareStatus("Copy the address from your browser to share this deck.");
    }
    window.setTimeout(() => setShareStatus(null), 2600);
  }

  if (loading) {
    return (
      <div className="grid gap-5" aria-label="Loading deck">
        <div className="game-panel min-h-72 animate-pulse p-8"><div className="h-4 w-32 rounded bg-white/10" /><div className="mt-8 h-10 max-w-xl rounded bg-white/10" /><div className="mt-5 h-24 max-w-3xl rounded bg-white/[0.06]" /></div>
      </div>
    );
  }

  if (!deck || error) {
    return (
      <section className="game-panel mx-auto max-w-2xl p-9 text-center">
        <div className="text-5xl">🗝️</div>
        <h1 className="mt-4 text-2xl font-black text-white">This deck isn’t available</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{error || "The share link may be wrong, expired, or private."}</p>
        <Link className="game-button mt-6 inline-flex bg-[#faa307] px-5 py-3 font-black text-[#370617]" to="/library">
          Back to Library
        </Link>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm font-black text-slate-400 transition hover:text-[#ffba08]" to="/library">← Library</Link>
        <button
          type="button"
          onClick={() => void shareDeck()}
          className="game-button game-chip px-4 py-2 text-xs font-black text-slate-200"
          data-game-sound="save"
        >
          🔗 {shareStatus || "Share deck"}
        </button>
      </div>

      <section className="quest-card p-6 sm:p-9 lg:p-11">
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1.35fr_.65fr] lg:items-start">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className={`game-chip px-3 py-1.5 text-xs font-black ${deck.is_official ? "text-[#ffba08]" : "text-cyan-200"}`}>
                {deck.is_official ? "⭐ FlashQuest Official" : "🧑‍🚀 Community Deck"}
              </span>
              {deck.visibility === "unlisted" && (
                <span className="game-chip px-3 py-1.5 text-xs font-black text-violet-200">🔗 Unlisted</span>
              )}
              <span className="game-chip px-3 py-1.5 text-xs font-black text-slate-300">
                {difficultyIcon(deck.difficulty)} {deck.difficulty}
              </span>
            </div>

            <p className="metric-label mt-7">{deck.subject}</p>
            <h1 className="mt-2 max-w-3xl text-4xl font-black leading-tight text-white sm:text-6xl">{deck.title}</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              {deck.description || "A FlashQuest study deck ready for a new learning run."}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {deck.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-300">#{tag}</span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={`/study?deck=${deck.id}`}
                className="game-button bg-[#ffba08] px-6 py-3 font-black text-[#370617]"
                data-game-sound="navigate"
              >
                ⚡ Start studying
              </Link>

              {deck.is_official && user?.is_verified ? (
                <button
                  type="button"
                  onClick={() => void saveOfficialCopy()}
                  disabled={saving}
                  className="game-button border border-cyan-300/25 bg-cyan-300/[0.08] px-6 py-3 font-black text-cyan-100"
                  data-game-sound="save"
                >
                  {saving ? "Saving…" : "📥 Save my own copy"}
                </button>
              ) : deck.is_official && !user ? (
                <Link className="game-button border border-white/10 bg-white/[0.04] px-6 py-3 font-black text-white" to="/login">
                  Sign in to save a copy
                </Link>
              ) : deck.is_official && user && !user.is_verified ? (
                <span className="game-chip px-4 py-3 text-sm font-bold text-slate-300">Verify your email to save copies</span>
              ) : (
                <span className="game-chip px-4 py-3 text-sm font-bold text-slate-400">🧬 Community remix controls are next</span>
              )}
            </div>
          </div>

          <aside className="game-panel grid gap-4 p-5">
            <div>
              <p className="metric-label">Cards</p>
              <strong className="mt-1 block text-3xl font-black text-white">{deck.card_count}</strong>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="metric-label">Creator</p>
              <p className="mt-1 font-black text-white">{deck.is_official ? "FlashQuest" : deck.creator_display_name || "Community creator"}</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="metric-label">Difficulty</p>
              <p className="mt-1 font-black capitalize text-white">{difficultyIcon(deck.difficulty)} {deck.difficulty}</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="metric-label">Study access</p>
              <p className="mt-1 text-sm font-bold text-slate-300">{deck.visibility === "unlisted" ? "Anyone with this link" : "Public Library"}</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="game-panel p-5">
          <div className="text-2xl">🧠</div>
          <h2 className="mt-3 font-black text-white">Memory engine ready</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Use hints, TL;DR answers, mastery levels, XP, and spaced repetition while you work through this deck.</p>
        </div>
        <div className="game-panel p-5">
          <div className="text-2xl">🎮</div>
          <h2 className="mt-3 font-black text-white">Game-ready foundation</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">This deck can plug into future FlashQuest Arcade activities and Quest Room challenges without changing its core cards.</p>
        </div>
        <div className="game-panel p-5">
          <div className="text-2xl">🛡️</div>
          <h2 className="mt-3 font-black text-white">Visibility respected</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Public decks appear in discovery. Unlisted decks work by share link. Private decks stay out of both.</p>
        </div>
      </section>
    </div>
  );
}
