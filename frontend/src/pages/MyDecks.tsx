import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  copyFeaturedDeck,
  createDeck,
  deleteDeck,
  getFeaturedDecks,
  getMyDecks,
  publishDeck,
  unpublishDeck,
} from "../api";
import { useAuth } from "../auth";
import type { DeckRead } from "../types";

type PublishPreview = {
  deck: DeckRead;
  visibility: "public" | "unlisted";
};

function visibilityChip(deck: DeckRead): { icon: string; label: string; className: string } {
  if (deck.visibility === "public") {
    return { icon: "🌎", label: "Public", className: "text-emerald-200" };
  }
  if (deck.visibility === "unlisted") {
    return { icon: "🔗", label: "Unlisted", className: "text-violet-200" };
  }
  return { icon: "🔒", label: "Private", className: "text-slate-300" };
}

export default function MyDecks() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<DeckRead[]>([]);
  const [featured, setFeatured] = useState<DeckRead[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishPreview, setPublishPreview] = useState<PublishPreview | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [mine, featuredRows] = await Promise.all([getMyDecks(), getFeaturedDecks()]);
      setDecks(mine);
      setFeatured(featuredRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load decks");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login", { replace: true, state: { from: "/decks" } });
      return;
    }
    if (user) void refresh();
  }, [user, authLoading, navigate, refresh]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const deck = await createDeck(title, description);
      setTitle("");
      setDescription("");
      navigate(`/deck-lab?deck=${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create deck");
    } finally {
      setLoading(false);
    }
  }

  async function onCopy(deckId: number) {
    setLoading(true);
    setError(null);
    try {
      const deck = await copyFeaturedDeck(deckId);
      navigate(`/deck-lab?deck=${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy featured deck");
    } finally {
      setLoading(false);
    }
  }

  async function confirmPublish() {
    if (!publishPreview) return;
    setLoading(true);
    setError(null);
    try {
      await publishDeck(publishPreview.deck.id, publishPreview.visibility);
      setPublishPreview(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish deck");
      setLoading(false);
    }
  }

  async function onUnpublish(deck: DeckRead) {
    if (!confirm(`Make “${deck.title}” private again? Existing public/share links will stop working.`)) return;
    setLoading(true);
    setError(null);
    try {
      await unpublishDeck(deck.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unpublish deck");
      setLoading(false);
    }
  }

  async function onDelete(deck: DeckRead) {
    if (!confirm(`Delete “${deck.title}” and all of its cards?`)) return;
    try {
      await deleteDeck(deck.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete deck");
    }
  }

  if (authLoading || !user) return <div className="game-panel p-8 text-slate-300">Loading your account…</div>;

  return (
    <div className="grid gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="metric-label">My decks</p>
          <h1 className="mt-2 text-4xl font-black text-white">Make your own quest.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Build privately first. When it is ready, publish it to the Library or share it with an unlisted link.</p>
        </div>
        <div className="game-chip px-4 py-2 text-sm font-bold text-slate-300">👋 {user.display_name}</div>
      </section>

      {error && <div className="rounded-xl border border-[#d00000]/40 bg-[#6a040f]/40 p-4 text-sm text-rose-200">{error}</div>}

      {publishPreview && (
        <section className="reward-pop game-panel border-[#faa307]/35 p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="metric-label">Publish preview</p>
              <h2 className="mt-2 text-2xl font-black text-white">{publishPreview.deck.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {publishPreview.visibility === "public"
                  ? "This deck will appear in public Library search and anyone can study or remix it."
                  : "This deck will stay out of Library search, but anyone with its share link can study or remix it."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                <span className="game-chip px-3 py-1.5 text-slate-300">📚 {publishPreview.deck.card_count} cards</span>
                <span className="game-chip px-3 py-1.5 text-slate-300">🏷️ {publishPreview.deck.subject}</span>
                <span className="game-chip px-3 py-1.5 capitalize text-slate-300">⚔️ {publishPreview.deck.difficulty}</span>
                <span className="game-chip px-3 py-1.5 text-slate-300">{publishPreview.visibility === "public" ? "🌎 Public" : "🔗 Unlisted"}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:flex-col">
              <button
                type="button"
                className="game-button bg-[#ffba08] px-5 py-3 text-sm font-black text-[#370617]"
                disabled={loading}
                data-game-sound="publish"
                onClick={() => void confirmPublish()}
              >
                {publishPreview.visibility === "public" ? "Publish to Library" : "Create share link"}
              </button>
              <button
                type="button"
                className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white"
                disabled={loading}
                onClick={() => setPublishPreview(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <form onSubmit={onCreate} className="game-panel p-6">
          <p className="metric-label">New deck</p>
          <h2 className="mt-2 text-2xl font-black text-white">What do you want to learn?</h2>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-sm font-bold text-slate-200">Deck name
              <input className="game-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AWS Solutions Architect" required />
            </label>
            <label className="grid gap-1.5 text-sm font-bold text-slate-200">What is this deck for?
              <textarea className="game-input min-h-24 resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Certification prep, interview questions, school notes…" />
            </label>
          </div>
          <button className="game-button mt-5 w-full bg-[#ffba08] px-5 py-3 font-black text-[#370617]" disabled={loading}>Create deck →</button>
        </form>

        <div className="game-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="metric-label">Your library</p>
              <h2 className="mt-2 text-2xl font-black text-white">{decks.length} custom {decks.length === 1 ? "deck" : "decks"}</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {!loading && decks.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">You don’t have a custom deck yet. Make one on the left or copy an Official starter deck below.</div>}
            {decks.map((deck) => {
              const visibility = visibilityChip(deck);
              return (
                <article key={deck.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-white">{deck.title}</h3>
                        <span className={`game-chip px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${visibility.className}`}>
                          {visibility.icon} {visibility.label}
                        </span>
                        {deck.source_deck_id && <span className="game-chip px-2.5 py-1 text-[10px] font-black text-cyan-200">🧬 Remix</span>}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{deck.description || "Your custom FlashQuest deck."}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-[#f48c06]">
                        <span>{deck.card_count} cards</span>
                        <span>{deck.subject}</span>
                        <span className="capitalize">{deck.difficulty}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link className="game-button bg-[#faa307] px-3 py-2 text-xs font-black text-[#370617]" to={`/study?deck=${deck.id}`}>Play</Link>
                      <Link className="game-button border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-white" to={`/deck-lab?deck=${deck.id}`}>Edit</Link>
                      {deck.visibility !== "private" && (
                        <Link className="game-button border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-2 text-xs font-black text-cyan-100" to={`/library/${encodeURIComponent(deck.slug)}`}>View share page</Link>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                    <p className="text-xs text-slate-500">
                      {deck.visibility === "public" && "Visible in Library search."}
                      {deck.visibility === "unlisted" && "Only people with the link can find this deck."}
                      {deck.visibility === "private" && "Only you can access this deck."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {deck.visibility === "private" ? (
                        <>
                          <button
                            type="button"
                            className="game-button border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-2 text-xs font-black text-emerald-100"
                            disabled={loading || deck.card_count < 1 || !user.is_verified}
                            data-game-sound="publish"
                            onClick={() => setPublishPreview({ deck, visibility: "public" })}
                          >
                            🌎 Publish
                          </button>
                          <button
                            type="button"
                            className="game-button border border-violet-300/20 bg-violet-300/[0.07] px-3 py-2 text-xs font-black text-violet-100"
                            disabled={loading || deck.card_count < 1 || !user.is_verified}
                            data-game-sound="publish"
                            onClick={() => setPublishPreview({ deck, visibility: "unlisted" })}
                          >
                            🔗 Share unlisted
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="game-button border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white"
                          disabled={loading}
                          onClick={() => void onUnpublish(deck)}
                        >
                          🔒 Make private
                        </button>
                      )}
                      <button className="game-button border border-[#d00000]/40 bg-[#6a040f]/40 px-3 py-2 text-xs font-black text-rose-200" onClick={() => void onDelete(deck)}>Delete</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="game-panel p-6">
        <p className="metric-label">Official starter packs</p>
        <h2 className="mt-2 text-2xl font-black text-white">Want a protected deck as your starting point?</h2>
        <p className="mt-2 text-sm text-slate-400">Official decks stay protected, but you can remix them into a private copy and customize every card.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {featured.map((deck) => (
            <article key={deck.id} className="rounded-2xl border border-[#faa307]/20 bg-[#faa307]/[0.06] p-5">
              <h3 className="text-lg font-black text-white">{deck.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{deck.description}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-[#ffba08]">{deck.card_count} cards</span>
                <button className="game-button bg-[#ffba08] px-4 py-2 text-xs font-black text-[#370617]" onClick={() => void onCopy(deck.id)} disabled={loading}>Remix to my decks</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
