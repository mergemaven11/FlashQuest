import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../auth";
import { useGameFeel } from "../gameFeelContext";
import {
  closeRoom,
  getRoom,
  getRoomWsTicket,
  joinRoom,
  leaveRoom,
  roomWebSocketUrl,
  type PresenceUser,
  type RoomMessageRead,
  type RoomRead,
  type RoomRealtimeEvent,
} from "../roomApi";

type ConnectionState = "idle" | "connecting" | "live" | "offline";

function messageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function isMessage(value: unknown): value is RoomMessageRead {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "body" in value &&
      "author_display_name" in value
  );
}

function presenceFrom(value: unknown): PresenceUser[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is PresenceUser =>
      Boolean(
        item &&
          typeof item === "object" &&
          "user_id" in item &&
          "display_name" in item
      )
  );
}

export default function Room() {
  const { roomId: roomIdParam } = useParams();
  const roomId = Number(roomIdParam || 0);
  const { user } = useAuth();
  const { play } = useGameFeel();
  const navigate = useNavigate();
  const socketRef = useRef<WebSocket | null>(null);

  const [room, setRoom] = useState<RoomRead | null>(null);
  const [messages, setMessages] = useState<RoomMessageRead[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadRoom = useCallback(async () => {
    if (!user || !Number.isInteger(roomId) || roomId <= 0) return;
    setBusy(true);
    setError(null);
    try {
      setRoom(await getRoom(roomId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open this room");
    } finally {
      setBusy(false);
    }
  }, [roomId, user]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  const handleRealtimeEvent = useCallback(
    (event: RoomRealtimeEvent) => {
      if (event.type === "room.snapshot") {
        const nextMessages = event.payload.messages;
        if (Array.isArray(nextMessages)) {
          setMessages(nextMessages.filter(isMessage));
        }
        setPresence(presenceFrom(event.payload.presence));
        return;
      }

      if (event.type === "presence.joined" || event.type === "presence.left") {
        setPresence(presenceFrom(event.payload.presence));
        return;
      }

      if (event.type === "message.created") {
        const message = event.payload.message;
        if (!isMessage(message)) return;
        setMessages((current) =>
          current.some((existing) => existing.id === message.id)
            ? current
            : [...current, message]
        );
        if (message.user_id !== user?.id) play("success");
        return;
      }

      if (event.type === "error") {
        const message = event.payload.message;
        setError(typeof message === "string" ? message : "Quest Room realtime error");
      }
    },
    [play, user?.id]
  );

  const connectRealtime = useCallback(async () => {
    if (
      !user ||
      !room ||
      !room.current_user_role ||
      room.status !== "open" ||
      !Number.isInteger(roomId) ||
      roomId <= 0
    ) {
      return;
    }

    socketRef.current?.close();
    socketRef.current = null;
    setConnection("connecting");
    setError(null);

    try {
      const { ticket } = await getRoomWsTicket(roomId);
      const socket = new WebSocket(roomWebSocketUrl(roomId, ticket));
      socketRef.current = socket;

      socket.onopen = () => {
        if (socketRef.current === socket) setConnection("live");
      };
      socket.onmessage = (messageEvent) => {
        try {
          const parsed = JSON.parse(String(messageEvent.data)) as RoomRealtimeEvent;
          if (parsed?.schema === "quest-room.v1" && parsed.room_id === roomId) {
            handleRealtimeEvent(parsed);
          }
        } catch {
          setError("Received an unreadable realtime event");
        }
      };
      socket.onerror = () => {
        if (socketRef.current === socket) {
          setError("Realtime connection hit a network error");
        }
      };
      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
          setConnection("offline");
        }
      };
    } catch (cause) {
      setConnection("offline");
      setError(cause instanceof Error ? cause.message : "Could not connect to realtime room");
    }
  }, [handleRealtimeEvent, room, roomId, user]);

  useEffect(() => {
    if (room?.current_user_role && room.status === "open") {
      void connectRealtime();
    }
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connectRealtime, room?.current_user_role, room?.status]);

  if (!user) {
    return (
      <section className="game-panel mx-auto max-w-xl p-8 text-center">
        <div className="text-5xl">👥</div>
        <h1 className="mt-4 text-2xl font-black text-white">Sign in to enter a Quest Room</h1>
        <Link to="/login" className="game-button mt-6 inline-flex bg-[#faa307] px-5 py-3 font-black text-[#370617]">
          Sign in
        </Link>
      </section>
    );
  }

  async function handleJoin() {
    setBusy(true);
    setError(null);
    try {
      const joined = await joinRoom(roomId);
      setRoom(joined);
      play("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join room");
      play("miss");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setBusy(true);
    setError(null);
    try {
      await leaveRoom(roomId);
      socketRef.current?.close();
      play("reveal");
      navigate("/rooms");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not leave room");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    setBusy(true);
    setError(null);
    try {
      const closed = await closeRoom(roomId);
      socketRef.current?.close();
      setRoom(closed);
      setConnection("offline");
      play("complete");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not close room");
    } finally {
      setBusy(false);
    }
  }

  async function copyRoomLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      play("success");
    } catch {
      setError("Could not copy the room link on this device");
    }
  }

  function sendChat(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    const socket = socketRef.current;
    if (!body || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "chat.send", payload: { body } }));
    setDraft("");
  }

  if (!room && busy) {
    return <div className="game-panel p-8 text-center text-slate-300">Opening Quest Room…</div>;
  }

  if (!room) {
    return (
      <section className="game-panel mx-auto max-w-2xl p-8 text-center">
        <div className="text-5xl">🚪</div>
        <h1 className="mt-4 text-2xl font-black text-white">Room unavailable</h1>
        <p className="mt-3 text-slate-400">{error ?? "This room does not exist or is not visible to you."}</p>
        <Link to="/rooms" className="game-button mt-6 inline-flex bg-[#faa307] px-5 py-3 font-black text-[#370617]">
          Back to Quest Rooms
        </Link>
      </section>
    );
  }

  const isMember = Boolean(room.current_user_role);
  const isHost = room.current_user_role === "host";
  const connectionLabel =
    connection === "live"
      ? "🟢 Live"
      : connection === "connecting"
        ? "🟡 Connecting"
        : "⚪ Offline";

  return (
    <div className="grid gap-5">
      <section className="game-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="game-chip px-2.5 py-1 text-xs font-black text-[#ffba08]">👥 Quest Room #{room.id}</span>
              <span className="game-chip px-2.5 py-1 text-xs font-black text-slate-300">{room.visibility.replace("_", " ")}</span>
              <span className="game-chip px-2.5 py-1 text-xs font-black text-slate-300">{room.status}</span>
            </div>
            <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">{room.name}</h1>
            <p className="mt-2 text-sm text-slate-400">
              Deck #{room.deck_id} · {room.member_count} member{room.member_count === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyRoomLink()} className="game-button game-chip px-3 py-2 text-xs font-black text-slate-200">
              {copied ? "✅ Copied" : "🔗 Copy room link"}
            </button>
            <Link to={`/study?deck=${room.deck_id}`} className="game-button border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white">
              ⚡ Study deck
            </Link>
            <Link to={`/arcade?deck=${room.deck_id}`} className="game-button border border-[#faa307]/25 bg-[#370617]/60 px-3 py-2 text-xs font-black text-[#ffba08]">
              🎮 Arcade
            </Link>
          </div>
        </div>
      </section>

      {error && (
        <section className="game-panel border-[#d00000]/50 p-4 text-sm text-rose-200">
          🛡️ {error}
        </section>
      )}

      {!isMember && room.status === "open" && room.visibility === "public" && (
        <section className="game-panel p-7 text-center">
          <div className="text-4xl">🚪</div>
          <h2 className="mt-3 text-2xl font-black text-white">You found a public Quest Room</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">
            Join to receive live presence and chat. Membership is persistent; disconnecting your browser does not create or remove membership rows.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleJoin()}
            className="game-button mt-5 bg-[#ffba08] px-5 py-3 font-black text-[#370617]"
          >
            👋 Join room
          </button>
        </section>
      )}

      {isMember && (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="game-panel flex min-h-[520px] flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div>
                <p className="text-sm font-black text-white">💬 Room chat</p>
                <p className="mt-0.5 text-xs text-slate-500">Messages persist across reconnects.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="game-chip px-2.5 py-1 text-xs font-black text-slate-300">{connectionLabel}</span>
                {room.status === "open" && connection === "offline" && (
                  <button type="button" className="game-button px-2.5 py-1 text-xs font-black text-[#ffba08]" onClick={() => void connectRealtime()}>
                    Reconnect
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5" aria-live="polite">
              {messages.length === 0 ? (
                <div className="grid min-h-60 place-items-center text-center text-sm text-slate-500">
                  <div><div className="text-4xl">🌱</div><p className="mt-3">No messages yet. Somebody gets to be first.</p></div>
                </div>
              ) : (
                messages.map((message) => {
                  const mine = message.user_id === user.id;
                  return (
                    <article key={message.id} className={`max-w-[88%] rounded-2xl border p-3 ${mine ? "ml-auto border-[#faa307]/25 bg-[#faa307]/10" : "border-white/10 bg-black/20"}`}>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <strong className={mine ? "text-[#ffba08]" : "text-slate-200"}>{mine ? "You" : message.author_display_name}</strong>
                        <span className="text-slate-600">{messageTime(message.created_at)}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{message.body}</p>
                    </article>
                  );
                })
              )}
            </div>

            <form className="border-t border-white/10 p-3 sm:p-4" onSubmit={sendChat}>
              <div className="flex gap-2">
                <label htmlFor="room-chat" className="sr-only">Message room</label>
                <input
                  id="room-chat"
                  className="game-input"
                  maxLength={1000}
                  value={draft}
                  disabled={connection !== "live" || room.status !== "open"}
                  placeholder={connection === "live" ? "Message the room…" : "Reconnect to chat…"}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || connection !== "live" || room.status !== "open"}
                  className="game-button bg-[#faa307] px-4 font-black text-[#370617]"
                >
                  Send
                </button>
              </div>
            </form>
          </div>

          <aside className="grid content-start gap-4">
            <section className="game-panel p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="metric-label">Online now</p>
                <span className="game-chip px-2 py-0.5 text-xs font-black text-slate-300">{presence.length}</span>
              </div>
              <div className="mt-3 space-y-2">
                {presence.length === 0 ? (
                  <p className="text-sm text-slate-500">Presence is offline.</p>
                ) : (
                  presence.map((person) => (
                    <div key={person.user_id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-sm font-bold text-slate-200">
                      <span aria-hidden="true">🟢</span>
                      <span className="truncate">{person.user_id === user.id ? "You" : person.display_name}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="game-panel p-4">
              <p className="metric-label">Room controls</p>
              <p className="mt-2 text-sm text-slate-400">Role: <strong className="text-slate-200">{room.current_user_role}</strong></p>
              {isHost ? (
                <button
                  type="button"
                  disabled={busy || room.status === "closed"}
                  onClick={() => void handleClose()}
                  className="game-button mt-4 w-full border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm font-black text-rose-200"
                >
                  🔒 Close room
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleLeave()}
                  className="game-button mt-4 w-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-black text-slate-200"
                >
                  Leave room
                </button>
              )}
            </section>

            <p className="px-2 text-xs leading-5 text-slate-600">
              Presence is realtime process state; membership and messages stay durable in PostgreSQL.
            </p>
          </aside>
        </section>
      )}

      {room.status === "closed" && (
        <section className="game-panel p-5 text-center text-slate-300">
          🔒 This room is closed. Its membership and chat history remain durable, but realtime posting is off.
        </section>
      )}
    </div>
  );
}
