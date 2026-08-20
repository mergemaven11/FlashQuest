import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getLibraryDecks, getMyDecks } from "../api";
import { useAuth } from "../auth";
import { useGameFeel } from "../gameFeelContext";
import {
  createRoom,
  getMyRooms,
  getRoom,
  joinRoom,
  type RoomRead,
  type RoomVisibility,
} from "../roomApi";
import type { DeckRead } from "../types";

const DEMO_EMAIL = "demo@flashquest.app";

function uniqueDecks(rows: DeckRead[]): DeckRead[] {
  const seen = new Set<number>();
  return rows.filter((deck) => {
    if (seen.has(deck.id)) return false;
    seen.add(deck.id);
    return true;
  });
}

function roomBadge(room: RoomRead): string {
  if (room.status === "closed") return "🔒 Closed";
  if (room.visibility === "public") return "🌐 Public by link";
  if (room.visibility === "invite_only") return "✉️ Invite only";
  return "🔐 Private";
}

export default function Rooms() {
  const { user } = useAuth();
  const { play } = useGameFeel();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomRead[]>([]);
  const [decks, setDecks] = useState<DeckRead[]>([]);
  const [name, setName] = useState("Study Crew");
  const [deckId, setDeckId] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<RoomVisibility>("private");
  const [joinId, setJoinId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDemo = user?.email.toLowerCase() === DEMO_EMAIL;
  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === deckId) ?? null,
    [deckId, decks]
  );
  const canPublic = Boolean(
    selectedDeck && (selectedDeck.is_official || selectedDeck.visibility === "public")
  );

  useEffect(() => {
    if (visibility === "public" && selectedDeck && !canPublic) {
      setVisibility("private");
    }
  }, [canPublic, selectedDeck, visibility]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [mine, library, owned] = await Promise.all([
          getMyRooms(),
          getLibraryDecks({ page_size: 50, sort: "featured" }),
          getMyDecks(),
        ]);
        if (cancelled) return;
        const availableDecks = uniqueDecks([...library.items, ...owned]);
        setRooms(mine);
        setDecks(availableDecks);
        setDeckId((current) => current ?? availableDecks[0]?.id ?? null);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load Quest Rooms");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return (
      <section className="game-panel mx-auto max-w-2xl p-8 text-center">
        <div className="text-5xl" aria-hidden="true">👥</div>
        <h1 className="mt-4 text-3xl font-black text-white">Join Quest Rooms</h1>
        <p className="mt-3 text-slate-400">
          Create a verified account to join persistent study chat, presence, invites, and multiplayer Arcade around a shared deck.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/signup?next=%2Frooms"
            className="game-button inline-flex bg-[#faa307] px-5 py-3 font-black text-[#370617]"
          >
            Create account for Rooms
          </Link>
          <Link
            to="/login?next=%2Frooms"
            className="game-button inline-flex border border-white/10 bg-white/[0.04] px-5 py-3 font-black text-white"
          >
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    if (!deckId || !name.trim() || isDemo) return;
    setLoading(true);
    setError(null);
    try {
      const room = await createRoom({
        deck_id: deckId,
        name,
        visibility,
      });
      play("success");
      navigate(`/rooms/${room.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create room");
      play("miss");
    } finally {
      setLoading(false);
    }
  }

  async function submitJoin(event: FormEvent) {
    event.preventDefault();
    if (isDemo) return;
    const roomId = Number(joinId);
    if (!Number.isInteger(roomId) || roomId <= 0) {
      setError("Enter a valid room number");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const room = await getRoom(roomId);
      if (!room.current_user_role) await joinRoom(roomId);
      play("success");
      navigate(`/rooms/${roomId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join that room");
      play("miss");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-7">
      <section>
        <p className="metric-label">👥 Quest Rooms</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">
          Study together. <span className="ember-text">Same deck, same room.</span>
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
          Rooms are deck-linked spaces for realtime chat, presence, persistent history, invites, moderation, and multiplayer Arcade. Learn solo when you want; bring in a crew when you don’t.
        </p>
      </section>

      {isDemo && (
        <section className="game-panel border-[#faa307]/35 bg-[#faa307]/[0.05] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="metric-label">🧪 Demo Explorer sandbox</p>
              <h2 className="mt-2 text-2xl font-black text-white">You’re inside the safe public demo account.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Open <b className="text-white">FlashQuest Demo Room</b> below to try persistent chat, presence, and multiplayer Arcade. This shared account cannot create decks or rooms, so the demo stays safe for everybody.
              </p>
            </div>
            <span className="game-chip px-3 py-2 text-xs font-black text-[#ffba08]">Sandboxed</span>
          </div>
        </section>
      )}

      {error && (
        <section className="game-panel border-[#d00000]/50 p-4 text-sm text-rose-200">
          🛡️ {error}
        </section>
      )}

      {!isDemo && (
        <section className="grid gap-5 lg:grid-cols-2">
          <form className="game-panel p-5 sm:p-6" onSubmit={submitCreate}>
            <p className="metric-label">Create a room</p>
            <h2 className="mt-2 text-2xl font-black text-white">Start a study crew</h2>

            <label className="mt-5 block text-sm font-black text-slate-200" htmlFor="room-name">
              Room name
            </label>
            <input
              id="room-name"
              className="game-input mt-2"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />

            <label className="mt-4 block text-sm font-black text-slate-200" htmlFor="room-deck">
              Deck
            </label>
            <select
              id="room-deck"
              className="game-input mt-2"
              value={deckId ?? ""}
              onChange={(event) => setDeckId(Number(event.target.value))}
            >
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.is_official ? "⭐ " : deck.visibility === "private" ? "🔒 " : "🧑‍🚀 "}
                  {deck.title} · {deck.card_count} cards
                </option>
              ))}
            </select>

            <label className="mt-4 block text-sm font-black text-slate-200" htmlFor="room-visibility">
              Room access
            </label>
            <select
              id="room-visibility"
              className="game-input mt-2"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as RoomVisibility)}
            >
              <option value="private">Private · host adds specific accounts</option>
              <option value="invite_only">Invite only · share an expiring secret link</option>
              <option value="public" disabled={!canPublic}>
                Public by link/ID · signed-in learners can join
              </option>
            </select>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {visibility === "private"
                ? "After creation, add verified FlashQuest accounts by email from the room's access controls."
                : visibility === "invite_only"
                  ? "After creation, generate a 24-hour, 3-day, or 7-day invite link. You can revoke it whenever you want."
                  : "Public rooms remain link/ID based until broad room discovery ships with moderation controls."}
            </p>
            {!canPublic && selectedDeck && (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                This deck is {selectedDeck.visibility}; FlashQuest will not widen it through a public room.
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !deckId || !name.trim()}
              className="game-button mt-5 bg-[#ffba08] px-5 py-3 font-black text-[#370617]"
            >
              {loading ? "Opening room…" : "👥 Create Quest Room"}
            </button>
          </form>

          <form className="game-panel p-5 sm:p-6" onSubmit={submitJoin}>
            <p className="metric-label">Join a public room</p>
            <h2 className="mt-2 text-2xl font-black text-white">Got a room number?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              This box is only for public rooms. Invite-only links go through their secret invite URL, and private rooms require the host to add your account first.
            </p>
            <label className="mt-5 block text-sm font-black text-slate-200" htmlFor="join-room-id">
              Public room number
            </label>
            <input
              id="join-room-id"
              className="game-input mt-2"
              inputMode="numeric"
              placeholder="42"
              value={joinId}
              onChange={(event) => setJoinId(event.target.value.replace(/[^0-9]/g, ""))}
            />
            <button
              type="submit"
              disabled={loading || !joinId}
              className="game-button mt-5 border border-[#faa307]/30 bg-[#370617]/70 px-5 py-3 font-black text-[#ffba08]"
            >
              🔗 Open public room
            </button>
          </form>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="metric-label">Your memberships</p>
            <h2 className="mt-1 text-2xl font-black text-white">My Quest Rooms</h2>
          </div>
          <span className="game-chip px-3 py-1.5 text-xs font-black text-slate-300">
            {rooms.length} room{rooms.length === 1 ? "" : "s"}
          </span>
        </div>

        {rooms.length === 0 ? (
          <div className="game-panel mt-4 p-7 text-center text-slate-400">
            {isDemo
              ? "The demo room is still being prepared. Refresh after the latest backend deploy finishes."
              : "No rooms yet. Create one above, join a public room, or open an invite link somebody shared with you."}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room) => (
              <Link
                key={room.id}
                to={`/rooms/${room.id}`}
                className="game-panel game-button block p-5 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="game-chip px-2.5 py-1 text-xs font-black text-[#ffba08]">
                    {roomBadge(room)}
                  </span>
                  <span className="text-xs font-black text-slate-500">#{room.id}</span>
                </div>
                <h3 className="mt-4 text-xl font-black text-white">{room.name}</h3>
                <p className="mt-2 text-sm text-slate-400">
                  {room.member_count} member{room.member_count === 1 ? "" : "s"} · {room.current_user_role}
                </p>
                <p className="mt-4 text-xs font-black text-[#faa307]">Enter room →</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
