import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  adminReset,
  copyFeaturedDeck,
  createCard,
  deleteCard,
  getFeaturedDecks,
  getMyDecks,
  listAdminCards,
  updateCard,
} from "../api";
import { useAuth } from "../auth";
import type { CardAdminRead, CardKind, DeckRead } from "../types";

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedDeckId = Number(params.get("deck") || 0) || null;

  const [decks, setDecks] = useState<DeckRead[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(requestedDeckId);
  const [cards, setCards] = useState<CardAdminRead[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [domain, setDomain] = useState("General");
  const [kind, setKind] = useState<CardKind>("concept");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editDefinition, setEditDefinition] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editKind, setEditKind] = useState<CardKind>("concept");

  const [demoPassword, setDemoPassword] = useState("");

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedDeckId) ?? null,
    [decks, selectedDeckId]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((card) =>
      [card.word, card.definition, card.domain, card.kind]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [cards, q]);

  async function loadDecks() {
    const featured = await getFeaturedDecks();
    const mine = user ? await getMyDecks() : [];
    const all = [...featured, ...mine];
    setDecks(all);
    setSelectedDeckId((current) => {
      if (requestedDeckId && all.some((deck) => deck.id === requestedDeckId)) return requestedDeckId;
      if (current && all.some((deck) => deck.id === current)) return current;
      return mine[0]?.id ?? featured[0]?.id ?? null;
    });
  }

  async function loadCards(deckId: number | null) {
    if (!deckId) {
      setCards([]);
      return;
    }
    setCards(await listAdminCards(undefined, deckId));
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      await loadDecks();
    } catch (e) {
      setError(message(e, "Could not load decks"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [user]);

  useEffect(() => {
    void loadCards(selectedDeckId).catch((e: unknown) => setError(message(e, "Could not load cards")));
  }, [selectedDeckId, user]);

  async function addCard(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedDeck || selectedDeck.is_builtin) return;
    setLoading(true);
    setError(null);
    try {
      await createCard({
        deck_id: selectedDeck.id,
        word,
        definition,
        domain,
        kind,
      });
      setWord("");
      setDefinition("");
      setDomain("General");
      setKind("concept");
      await loadCards(selectedDeck.id);
      await loadDecks();
    } catch (e) {
      setError(message(e, "Could not add card"));
    } finally {
      setLoading(false);
    }
  }

  function beginEdit(card: CardAdminRead) {
    setEditingId(card.id);
    setEditWord(card.word);
    setEditDefinition(card.definition);
    setEditDomain(card.domain);
    setEditKind(card.kind === "lab" ? "lab" : "concept");
  }

  async function saveEdit(cardId: number) {
    setLoading(true);
    setError(null);
    try {
      await updateCard(cardId, {
        word: editWord,
        definition: editDefinition,
        domain: editDomain,
        kind: editKind,
      });
      setEditingId(null);
      await loadCards(selectedDeckId);
    } catch (e) {
      setError(message(e, "Could not update card"));
    } finally {
      setLoading(false);
    }
  }

  async function removeCard(card: CardAdminRead) {
    if (!confirm(`Delete “${card.word}”?`)) return;
    setLoading(true);
    setError(null);
    try {
      await deleteCard(card.id, card.is_builtin ? demoPassword : undefined);
      await loadCards(selectedDeckId);
      await loadDecks();
    } catch (e) {
      setError(message(e, "Could not delete card"));
    } finally {
      setLoading(false);
    }
  }

  async function copyStarter() {
    if (!user || !selectedDeck?.is_builtin) {
      navigate("/signup");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const copy = await copyFeaturedDeck(selectedDeck.id);
      navigate(`/deck-lab?deck=${copy.id}`);
      await refresh();
    } catch (e) {
      setError(message(e, "Could not copy the starter deck"));
    } finally {
      setLoading(false);
    }
  }

  async function resetDemo() {
    if (!demoPassword) return;
    if (!confirm("Reset the public Platform Engineering demo progress?")) return;
    setLoading(true);
    setError(null);
    try {
      await adminReset(demoPassword);
      await loadCards(selectedDeckId);
    } catch (e) {
      setError(message(e, "Could not reset demo progress"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="metric-label">Deck Lab</p>
          <h1 className="mt-2 text-4xl font-black text-white">Build the cards you want to remember.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            The Platform Engineering starter deck is protected. Sign in to create your own decks, or copy the starter and remix all 216 cards.
          </p>
        </div>
        {user ? (
          <Link className="game-button bg-[#ffba08] px-4 py-2 text-sm font-black text-[#370617]" to="/decks">+ New deck</Link>
        ) : (
          <Link className="game-button bg-[#ffba08] px-4 py-2 text-sm font-black text-[#370617]" to="/signup">Sign up to create</Link>
        )}
      </section>

      {error && <div className="rounded-xl border border-[#d00000]/40 bg-[#6a040f]/40 p-4 text-sm text-rose-200">{error}</div>}

      <section className="game-panel grid gap-5 p-5 sm:p-6 lg:grid-cols-[.75fr_1.25fr]">
        <div>
          <label className="metric-label" htmlFor="deck-picker">Choose a deck</label>
          <select
            id="deck-picker"
            className="game-input mt-2"
            value={selectedDeckId ?? ""}
            onChange={(e) => setSelectedDeckId(Number(e.target.value))}
          >
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>{deck.is_builtin ? "⭐ " : ""}{deck.title} · {deck.card_count} cards</option>
            ))}
          </select>
          {selectedDeck?.is_builtin && (
            <div className="mt-4 rounded-2xl border border-[#faa307]/20 bg-[#faa307]/[0.06] p-4">
              <p className="font-black text-white">⭐ Featured starter deck</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Read-only for visitors. Copy it to your account to edit freely.</p>
              <button className="game-button mt-3 bg-[#ffba08] px-4 py-2 text-xs font-black text-[#370617]" onClick={() => void copyStarter()}>{user ? "Copy + customize" : "Sign up + copy"}</button>
            </div>
          )}
        </div>
        <div>
          <label className="metric-label" htmlFor="card-search">Find a card</label>
          <input id="card-search" className="game-input mt-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search question, answer, domain, or type…" />
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
            <span>{filtered.length} shown</span><span>•</span><span>{cards.length} total</span>
            {selectedDeck && <><span>•</span><span>{selectedDeck.title}</span></>}
          </div>
        </div>
      </section>

      {selectedDeck && !selectedDeck.is_builtin && user && (
        <form onSubmit={addCard} className="game-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="metric-label">Add a card</p><h2 className="mt-1 text-2xl font-black text-white">Concept or hands-on lab?</h2></div>
            <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
              {(["concept", "lab"] as CardKind[]).map((value) => (
                <button key={value} type="button" className={`rounded-lg px-3 py-2 text-xs font-black ${kind === value ? "bg-[#faa307] text-[#370617]" : "text-slate-400"}`} onClick={() => setKind(value)}>{value === "concept" ? "📚 Concept" : "🔧 Lab"}</button>
              ))}
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-bold text-slate-200">Question / challenge<textarea className="game-input min-h-28 resize-y" value={word} onChange={(e) => setWord(e.target.value)} required /></label>
            <label className="grid gap-1.5 text-sm font-bold text-slate-200">Answer / recovery path<textarea className="game-input min-h-28 resize-y" value={definition} onChange={(e) => setDefinition(e.target.value)} required /></label>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid min-w-56 flex-1 gap-1.5 text-sm font-bold text-slate-200">Domain / category<input className="game-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Networking, Chapter 4, Verbs…" /></label>
            <button className="game-button bg-[#ffba08] px-5 py-3 font-black text-[#370617]" disabled={loading}>Add to deck</button>
          </div>
        </form>
      )}

      <section className="grid gap-3">
        {filtered.map((card) => (
          <article key={card.id} className="game-panel p-5">
            {editingId === card.id ? (
              <div className="grid gap-3">
                <textarea className="game-input min-h-20" value={editWord} onChange={(e) => setEditWord(e.target.value)} />
                <textarea className="game-input min-h-24" value={editDefinition} onChange={(e) => setEditDefinition(e.target.value)} />
                <div className="flex flex-wrap gap-3">
                  <input className="game-input min-w-52 flex-1" value={editDomain} onChange={(e) => setEditDomain(e.target.value)} />
                  <select className="game-input max-w-40" value={editKind} onChange={(e) => setEditKind(e.target.value as CardKind)}><option value="concept">Concept</option><option value="lab">Lab</option></select>
                  <button className="game-button bg-[#ffba08] px-4 py-2 text-xs font-black text-[#370617]" onClick={() => void saveEdit(card.id)}>Save</button>
                  <button className="game-button border border-white/10 px-4 py-2 text-xs font-black text-white" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.12em]"><span className="game-chip px-2 py-1 text-[#ffba08]">{card.kind === "lab" ? "🔧 Lab" : "📚 Concept"}</span><span className="game-chip px-2 py-1 text-slate-400">{card.domain}</span><span className="game-chip px-2 py-1 text-slate-500">Mastery {card.bin}/11</span></div>
                  <h2 className="mt-3 text-lg font-black text-white">{card.word}</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">{card.definition}</p>
                </div>
                <div className="flex gap-2">
                  {!card.is_builtin && <button className="game-button border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white" onClick={() => beginEdit(card)}>Edit</button>}
                  <button className="game-button border border-[#d00000]/40 bg-[#6a040f]/40 px-3 py-2 text-xs font-black text-rose-200" onClick={() => void removeCard(card)}>{card.is_builtin ? "Admin delete" : "Delete"}</button>
                </div>
              </div>
            )}
          </article>
        ))}
        {!loading && filtered.length === 0 && <div className="game-panel p-8 text-center text-sm text-slate-400">No cards match this view yet.</div>}
      </section>

      {selectedDeck?.is_builtin && (
        <section className="game-panel border-[#9d0208]/40 p-5 sm:p-6">
          <p className="metric-label">Demo owner controls</p>
          <h2 className="mt-2 text-xl font-black text-white">Protected destructive actions</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Built-in Platform Engineering cards and the public demo reset require the server-side demo password. The password is never embedded in React.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <input className="game-input min-w-64 flex-1" type="password" value={demoPassword} onChange={(e) => setDemoPassword(e.target.value)} placeholder="Demo admin password" />
            <button className="game-button border border-[#d00000]/50 bg-[#6a040f]/50 px-4 py-2 text-sm font-black text-rose-200" onClick={() => void resetDemo()} disabled={!demoPassword || loading}>Reset demo progress</button>
          </div>
        </section>
      )}
    </div>
  );
}
