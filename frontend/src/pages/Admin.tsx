import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  adminReset,
  createCard,
  deleteCard,
  listAdminCards,
  updateCard,
} from "../api";
import type { CardAdminRead, CardKind, CreateCardPayload } from "../types";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function Admin() {
  const [cards, setCards] = useState<CardAdminRead[]>([]);
  const [q, setQ] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [demoPassword, setDemoPassword] = useState("");

  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [topic, setTopic] = useState("My Topic");
  const [domain, setDomain] = useState("General");
  const [kind, setKind] = useState<CardKind>("concept");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editDefinition, setEditDefinition] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editKind, setEditKind] = useState<CardKind>("concept");
  const createRef = useRef<HTMLDivElement | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      setCards(await listAdminCards());
    } catch (error) {
      setErr(errorMessage(error, "Could not load cards"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const topics = useMemo(
    () => Array.from(new Set(cards.map((card) => card.topic))).sort(),
    [cards]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return cards.filter((card) => {
      if (topicFilter !== "all" && card.topic !== topicFilter) return false;
      if (!query) return true;
      return [card.word, card.definition, card.topic, card.domain, card.kind]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [cards, q, topicFilter]);

  const builtInCount = cards.filter((card) => card.is_builtin).length;
  const customCount = cards.length - builtInCount;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!word.trim() || !definition.trim()) return;
    setLoading(true);
    setErr(null);
    setNotice(null);
    try {
      const payload: CreateCardPayload = {
        word: word.trim(),
        definition: definition.trim(),
        topic: topic.trim() || "My Topic",
        domain: domain.trim() || "General",
        kind,
      };
      await createCard(payload);
      setWord("");
      setDefinition("");
      setNotice("Card added. It is ready to study in Play.");
      await refresh();
    } catch (error) {
      setErr(errorMessage(error, "Could not create card"));
    } finally {
      setLoading(false);
    }
  }

  function startEdit(card: CardAdminRead) {
    if (card.is_builtin) return;
    setEditingId(card.id);
    setEditWord(card.word);
    setEditDefinition(card.definition);
    setEditTopic(card.topic);
    setEditDomain(card.domain);
    setEditKind(card.kind === "lab" ? "lab" : "concept");
    setErr(null);
  }

  async function saveEdit(cardId: number) {
    setLoading(true);
    setErr(null);
    setNotice(null);
    try {
      await updateCard(cardId, {
        word: editWord.trim(),
        definition: editDefinition.trim(),
        topic: editTopic.trim() || "My Topic",
        domain: editDomain.trim() || "General",
        kind: editKind,
      });
      setEditingId(null);
      setNotice("Custom card updated.");
      await refresh();
    } catch (error) {
      setErr(errorMessage(error, "Could not update card"));
    } finally {
      setLoading(false);
    }
  }

  function copyToCustom(card: CardAdminRead) {
    setWord(card.word.replace(/^LAB ·\s*/, ""));
    setDefinition(card.definition);
    setTopic(`My ${card.topic}`);
    setDomain(card.domain.replace(/ Labs$/, ""));
    setKind(card.kind === "lab" ? "lab" : "concept");
    setNotice("Copied into the new-card form. Change anything you want, then save it.");
    requestAnimationFrame(() => createRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function onDelete(card: CardAdminRead) {
    if (card.is_builtin && !demoPassword) {
      setErr("Built-in demo cards are protected. Enter the demo admin password first.");
      return;
    }
    const warning = card.is_builtin
      ? "Delete this protected built-in demo card? The admin password will be checked."
      : "Delete this custom card and its study progress?";
    if (!window.confirm(warning)) return;

    setLoading(true);
    setErr(null);
    try {
      await deleteCard(card.id, card.is_builtin ? demoPassword : undefined);
      setNotice(card.is_builtin ? "Built-in card deleted." : "Custom card deleted.");
      await refresh();
    } catch (error) {
      setErr(errorMessage(error, "Could not delete card"));
    } finally {
      setLoading(false);
    }
  }

  async function onResetProgress() {
    if (!demoPassword) {
      setErr("Enter the demo admin password before resetting shared demo progress.");
      return;
    }
    if (!window.confirm("Reset progress for every card in the shared demo?")) return;
    setLoading(true);
    setErr(null);
    try {
      await adminReset(demoPassword);
      setNotice("Shared demo progress reset to level 0.");
      await refresh();
    } catch (error) {
      setErr(errorMessage(error, "Could not reset progress"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffba08]">🧪 Deck Lab</p>
          <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Build your own study deck.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Platform Engineering is the demo pack. Add any topic you want and FlashQuest’s will use the same memory engine for it.
          </p>
        </div>
        <div className="flex gap-2 text-xs font-bold">
          <span className="game-chip px-3 py-2 text-slate-200">{cards.length} total</span>
          <span className="game-chip px-3 py-2 text-[#ffba08]">{builtInCount} built-in</span>
          <span className="game-chip px-3 py-2 text-[#faa307]">{customCount} custom</span>
        </div>
      </section>

      <section className="game-panel p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffba08]">How Deck Lab works</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["➕", "Make a card", "Type a question and answer."],
            ["🏷️", "Name the topic", "AWS, Spanish, math — anything."],
            ["📚", "Pick a type", "Concept = learn it. Lab = fix it."],
            ["⚡", "Go to Play", "Your new topic appears automatically."],
          ].map(([icon, title, detail]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <span className="text-2xl">{icon}</span>
              <p className="mt-3 font-black text-white">{title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      {err && <div className="rounded-2xl border border-[#d00000]/50 bg-[#6a040f]/55 p-4 text-sm font-semibold text-white">⚠️ {err}</div>}
      {notice && <div className="rounded-2xl border border-[#faa307]/30 bg-[#faa307]/10 p-4 text-sm font-semibold text-[#ffba08]">✨ {notice}</div>}

      <section ref={createRef} className="game-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffba08]">Create a custom card</p>
            <h2 className="mt-1 text-xl font-black text-white">What do you want to remember?</h2>
          </div>
          <span className="game-chip px-3 py-1.5 text-xs text-slate-400">Custom cards never need the demo password to delete.</span>
        </div>
        <form onSubmit={onCreate} className="mt-5 grid gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-200">
              Question
              <textarea className="deck-input min-h-28" value={word} onChange={(e) => setWord(e.target.value)} placeholder="What is a Kubernetes readiness probe?" required />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-200">
              Answer
              <textarea className="deck-input min-h-28" value={definition} onChange={(e) => setDefinition(e.target.value)} placeholder="It tells the platform when a workload is ready to receive traffic..." required />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-2 text-sm font-bold text-slate-200">
              Topic
              <input className="deck-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="My AWS Study" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-200">
              Domain
              <input className="deck-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Networking" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-200">
              Type
              <select className="deck-input" value={kind} onChange={(e) => setKind(e.target.value as CardKind)}>
                <option value="concept">📚 Concept</option>
                <option value="lab">🔧 Break/Fix Lab</option>
              </select>
            </label>
          </div>
          <div>
            <button className="game-button bg-gradient-to-r from-[#dc2f02] via-[#f48c06] to-[#ffba08] px-5 py-3 text-sm text-[#370617]" type="submit" disabled={loading}>
              ➕ Add card to FlashQuest’s
            </button>
          </div>
        </form>
      </section>

      <section className="game-panel p-5 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
          <input className="deck-input" placeholder="Search question, answer, topic, domain…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="deck-input" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
            <option value="all">All topics</option>
            {topics.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <p className="mt-3 text-xs text-slate-500">Showing {filtered.length} of {cards.length} cards.</p>
      </section>

      <section className="grid gap-3">
        {filtered.map((card) => {
          const editing = editingId === card.id;
          return (
            <article key={card.id} className="game-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="game-chip px-2.5 py-1 text-[11px] font-black text-[#ffba08]">{card.kind === "lab" ? "🔧 LAB" : "📚 CONCEPT"}</span>
                    <span className="game-chip px-2.5 py-1 text-[11px] font-bold text-slate-300">{card.topic}</span>
                    <span className="game-chip px-2.5 py-1 text-[11px] font-bold text-slate-400">{card.domain}</span>
                    {card.is_builtin && <span className="game-chip px-2.5 py-1 text-[11px] font-black text-[#faa307]">🔒 BUILT-IN</span>}
                    <span className="text-[11px] font-bold text-slate-600">Mastery {card.bin}/11 · {card.status}</span>
                  </div>

                  {editing ? (
                    <div className="mt-4 grid gap-3">
                      <textarea className="deck-input min-h-24" value={editWord} onChange={(e) => setEditWord(e.target.value)} />
                      <textarea className="deck-input min-h-28" value={editDefinition} onChange={(e) => setEditDefinition(e.target.value)} />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input className="deck-input" value={editTopic} onChange={(e) => setEditTopic(e.target.value)} />
                        <input className="deck-input" value={editDomain} onChange={(e) => setEditDomain(e.target.value)} />
                        <select className="deck-input" value={editKind} onChange={(e) => setEditKind(e.target.value as CardKind)}>
                          <option value="concept">Concept</option>
                          <option value="lab">Lab</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button className="game-button bg-[#faa307] px-4 py-2 text-sm text-[#370617]" onClick={() => void saveEdit(card.id)}>Save</button>
                        <button className="game-button border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-200" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2 className="mt-4 text-lg font-black leading-7 text-white">{card.word}</h2>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{card.definition}</p>
                    </>
                  )}
                </div>

                {!editing && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {card.is_builtin ? (
                      <button className="game-button border border-[#faa307]/25 bg-[#faa307]/10 px-3 py-2 text-xs text-[#ffba08]" onClick={() => copyToCustom(card)}>
                        ✨ Customize a copy
                      </button>
                    ) : (
                      <button className="game-button border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-slate-200" onClick={() => startEdit(card)}>
                        ✏️ Edit
                      </button>
                    )}
                    <button className="game-button border border-[#d00000]/35 bg-[#6a040f]/45 px-3 py-2 text-xs text-[#ffba08]" onClick={() => void onDelete(card)} disabled={loading}>
                      🗑️ Delete
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div className="game-panel p-8 text-center text-slate-400">No cards match this view.</div>
        )}
      </section>

      <section className="game-panel border-[#d00000]/25 p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffba08]">🔐 Demo admin controls</p>
        <h2 className="mt-1 text-xl font-black text-white">Protect the built-in demo.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Built-in Platform Engineering cards are read-only. The server-side password is required to delete one or reset the shared demo progress. The password is never saved in the browser.
        </p>
        <div className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row">
          <input
            className="deck-input flex-1"
            type="password"
            autoComplete="off"
            value={demoPassword}
            onChange={(e) => setDemoPassword(e.target.value)}
            placeholder="Demo admin password"
          />
          <button className="game-button border border-[#d00000]/40 bg-[#9d0208]/55 px-4 py-2 text-sm text-white" onClick={() => void onResetProgress()} disabled={loading}>
            Reset shared progress
          </button>
        </div>
      </section>
    </div>
  );
}
