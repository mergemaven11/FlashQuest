import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { copyFeaturedDeck, createDeck, deleteDeck, getFeaturedDecks, getMyDecks } from "../api";
import { useAuth } from "../auth";
import type { DeckRead } from "../types";

export default function MyDecks() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<DeckRead[]>([]);
  const [featured, setFeatured] = useState<DeckRead[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
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
  }

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true, state: { from: "/decks" } });
    if (user) void refresh();
  }, [user, authLoading]);

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
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Build a deck for any topic. Add normal concept cards, hands-on lab cards, or mix both.</p>
        </div>
        <div className="game-chip px-4 py-2 text-sm font-bold text-slate-300">👋 {user.display_name}</div>
      </section>

      {error && <div className="rounded-xl border border-[#d00000]/40 bg-[#6a040f]/40 p-4 text-sm text-rose-200">{error}</div>}

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
            {!loading && decks.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">You don’t have a custom deck yet. Make one on the left or copy the Platform Engineering starter deck below.</div>}
            {decks.map((deck) => (
              <article key={deck.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-white">{deck.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{deck.description || "Your custom FlashQuest deck."}</p>
                    <p className="mt-2 text-xs font-bold text-[#f48c06]">{deck.card_count} cards</p>
                  </div>
                  <div className="flex gap-2">
                    <Link className="game-button bg-[#faa307] px-3 py-2 text-xs font-black text-[#370617]" to={`/study?deck=${deck.id}`}>Play</Link>
                    <Link className="game-button border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-white" to={`/deck-lab?deck=${deck.id}`}>Edit</Link>
                    <button className="game-button border border-[#d00000]/40 bg-[#6a040f]/40 px-3 py-2 text-xs font-black text-rose-200" onClick={() => void onDelete(deck)}>Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="game-panel p-6">
        <p className="metric-label">Starter pack</p>
        <h2 className="mt-2 text-2xl font-black text-white">Want to remix Platform Engineering?</h2>
        <p className="mt-2 text-sm text-slate-400">The public demo stays protected, but you can copy all 216 cards into your account and customize your copy however you want.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {featured.map((deck) => (
            <article key={deck.id} className="rounded-2xl border border-[#faa307]/20 bg-[#faa307]/[0.06] p-5">
              <h3 className="text-lg font-black text-white">{deck.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{deck.description}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-[#ffba08]">{deck.card_count} cards</span>
                <button className="game-button bg-[#ffba08] px-4 py-2 text-xs font-black text-[#370617]" onClick={() => void onCopy(deck.id)} disabled={loading}>Copy to my decks</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
