import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import RoomAccessPanel from "../components/RoomAccessPanel";
import RoomArcadePanel, {
  type RoomActivitySnapshot,
} from "../components/RoomArcadePanel";
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
type ChannelKey = "general" | "questions" | "wins" | "resources";

const CHANNELS: Array<{ key: ChannelKey; label: string; icon: string; description: string }> = [
  { key: "general", label: "general", icon: "#", description: "Main room conversation" },
  { key: "questions", label: "questions", icon: "?", description: "Ask for help without losing the thread" },
  { key: "wins", label: "wins", icon: "★", description: "Drop study wins and streak moments" },
  { key: "resources", label: "resources", icon: "↗", description: "Keep useful links and references together" },
];

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

function roomActivityFrom(value: unknown): RoomActivitySnapshot | null {
  if (!value || typeof value !== "object") return null;
  if (!("state" in value) || !("submitted_user_ids" in value)) return null;
  const candidate = value as RoomActivitySnapshot;
  if (!candidate.state || !Array.isArray(candidate.submitted_user_ids)) return null;
  return candidate;
}

function channelPrefix(channel: ChannelKey): string {
  if (channel === "general") return "";
  return `[${channel}] `;
}

function displayMessageBody(body: string): { channel: ChannelKey; text: string } {
  for (const channel of CHANNELS) {
    if (channel.key === "general") continue;
    const prefix = `[${channel.key}] `;
    if (body.startsWith(prefix)) return { channel: channel.key, text: body.slice(prefix.length) };
  }
  return { channel: "general", text: body };
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
  const [activity, setActivity] = useState<RoomActivitySnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [draft, setDraft] = useState("");
  const [activeChannel, setActiveChannel] = useState<ChannelKey>("general");
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
        if (Array.isArray(nextMessages)) setMessages(nextMessages.filter(isMessage));
        setPresence(presenceFrom(event.payload.presence));
        setActivity(roomActivityFrom(event.payload.activity));
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

      if (
        event.type === "activity.started" ||
        event.type === "activity.state" ||
        event.type === "activity.completed"
      ) {
        const next = roomActivityFrom(event.payload.activity);
        setActivity(next);
        if (next?.state.phase === "complete") play("complete");
        else if (next?.state.phase === "reveal") play("reveal");
        else if (next?.state.phase === "prompt") play("roundStart");
        return;
      }

      if (event.type === "activity.submitted") {
        const submitted = event.payload.submitted_user_ids;
        if (!Array.isArray(submitted)) return;
        const userIds = submitted.filter((value): value is number => typeof value === "number");
        setActivity((current) =>
          current
            ? {
                ...current,
                submitted_user_ids: userIds,
                submitted_count: userIds.length,
              }
            : current
        );
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
        if (socketRef.current === socket) setError("Realtime connection hit a network error");
      };
      socket.onclose = (closeEvent) => {
        if (socketRef.current === socket) {
          socketRef.current = null;
          setConnection("offline");
          if (closeEvent.code === 4403) navigate("/rooms", { replace: true });
        }
      };
    } catch (cause) {
      setConnection("offline");
      setError(cause instanceof Error ? cause.message : "Could not connect to realtime room");
    }
  }, [handleRealtimeEvent, navigate, room, roomId, user]);

  useEffect(() => {
    if (room?.current_user_role && room.status === "open") void connectRealtime();
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

  function sendRoomEvent(type: string, payload: Record<string, unknown> = {}) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Reconnect to the room before sending realtime actions");
      return;
    }
    socket.send(JSON.stringify({ type, payload }));
  }

  function sendChat(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    sendRoomEvent("chat.send", { body: `${channelPrefix(activeChannel)}${body}` });
    setDraft("");
  }

  if (!room && busy) return <div className="game-panel p-8 text-center text-slate-300">Opening Quest Room…</div>;

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
  const connectionLabel = connection === "live" ? "Live" : connection === "connecting" ? "Connecting" : "Offline";
  const activeChannelMeta = CHANNELS.find((channel) => channel.key === activeChannel) ?? CHANNELS[0];
  const visibleMessages = messages.filter((message) => displayMessageBody(message.body).channel === activeChannel);

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
            <p className="mt-2 text-sm text-slate-400">Deck #{room.deck_id} · {room.member_count} member{room.member_count === 1 ? "" : "s"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {room.visibility === "public" && (
              <button type="button" onClick={() => void copyRoomLink()} className="game-button game-chip px-3 py-2 text-xs font-black text-slate-200">
                {copied ? "✅ Copied" : "🔗 Copy room link"}
              </button>
            )}
            <Link to={`/study?deck=${room.deck_id}`} className="game-button border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white">⚡ Study deck</Link>
            <Link to={`/arcade?deck=${room.deck_id}`} className="game-button border border-[#faa307]/25 bg-[#370617]/60 px-3 py-2 text-xs font-black text-[#ffba08]">🎮 Solo Arcade</Link>
          </div>
        </div>
      </section>

      {error && <section className="game-panel border-[#d00000]/50 p-4 text-sm text-rose-200">🛡️ {error}</section>}

      {!isMember && room.status === "open" && room.visibility === "public" && (
        <section className="game-panel p-7 text-center">
          <div className="text-4xl">🚪</div>
          <h2 className="mt-3 text-2xl font-black text-white">You found a public Quest Room</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">Join to receive live presence, chat, and room Arcade.</p>
          <button type="button" disabled={busy} onClick={() => void handleJoin()} className="game-button mt-5 bg-[#ffba08] px-5 py-3 font-black text-[#370617]">👋 Join room</button>
        </section>
      )}

      {isMember && (
        <>
          <RoomArcadePanel
            activity={activity}
            userId={user.id}
            isHost={isHost}
            presence={presence}
            connectionLive={connection === "live" && room.status === "open"}
            onSend={sendRoomEvent}
          />

          <section className="quest-room-workspace grid min-h-[650px] lg:grid-cols-[230px_minmax(0,1fr)_300px]">
            <aside className="quest-room-sidebar p-4 sm:p-5">
              <div className="border-b border-slate-200 pb-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Study session</p>
                <h2 className="mt-1 truncate text-lg font-black text-slate-900">{room.name}</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">Deck #{room.deck_id}</p>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between px-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Channels</span>
                  <span className="text-xs font-black text-slate-400">+</span>
                </div>
                <div className="space-y-1">
                  {CHANNELS.map((channel) => (
                    <button
                      key={channel.key}
                      type="button"
                      className={`quest-room-channel ${activeChannel === channel.key ? "is-active" : ""}`}
                      onClick={() => setActiveChannel(channel.key)}
                    >
                      <span className="w-4 text-center text-slate-400">{channel.icon}</span>
                      <span className="truncate">{channel.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 bg-white/75 p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Session tools</p>
                <Link to={`/study?deck=${room.deck_id}`} className="mt-3 block text-sm font-black text-slate-700 hover:text-slate-950">⚡ Focus study</Link>
                <Link to={`/arcade?deck=${room.deck_id}`} className="mt-2 block text-sm font-black text-slate-700 hover:text-slate-950">🎮 Start Arcade</Link>
                <button type="button" onClick={() => void copyRoomLink()} className="mt-2 block text-left text-sm font-black text-slate-700 hover:text-slate-950">🔗 Invite people</button>
              </div>
            </aside>

            <div className="quest-room-chat-surface flex min-h-[650px] flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-slate-400">{activeChannelMeta.icon}</span>
                    <h3 className="text-lg font-black text-slate-900">{activeChannelMeta.label}</h3>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">{activeChannelMeta.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-600">{connectionLabel}</span>
                  {room.status === "open" && connection === "offline" && (
                    <button type="button" className="text-xs font-black text-slate-700 underline" onClick={() => void connectRealtime()}>Reconnect</button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto py-2" aria-live="polite">
                {visibleMessages.length === 0 ? (
                  <div className="grid min-h-[360px] place-items-center px-6 text-center">
                    <div>
                      <div className="text-5xl grayscale opacity-35">📚</div>
                      <h4 className="mt-4 text-lg font-black text-slate-700">Start the #{activeChannelMeta.label} thread</h4>
                      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-400">Keep this channel focused so everyone can find the conversation later.</p>
                    </div>
                  </div>
                ) : (
                  visibleMessages.map((message) => {
                    const mine = message.user_id === user.id;
                    const parsed = displayMessageBody(message.body);
                    return (
                      <article key={message.id} className="quest-room-chat-message">
                        <div className="flex items-center gap-2 text-xs">
                          <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black ${mine ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}`}>
                            {(mine ? "Y" : message.author_display_name.slice(0, 1)).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <strong className="text-sm">{mine ? "You" : message.author_display_name}</strong>
                              <small>{messageTime(message.created_at)}</small>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{parsed.text}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              <form className="border-t border-slate-200 bg-white/95 p-4" onSubmit={sendChat}>
                <div className="flex gap-2">
                  <label htmlFor="room-chat" className="sr-only">Message room</label>
                  <input
                    id="room-chat"
                    className="quest-room-composer w-full px-4 py-3 text-sm"
                    maxLength={1000}
                    value={draft}
                    disabled={connection !== "live" || room.status !== "open"}
                    placeholder={connection === "live" ? `Message #${activeChannelMeta.label}` : "Reconnect to chat…"}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <button type="submit" disabled={!draft.trim() || connection !== "live" || room.status !== "open"} className="game-button bg-[#faa307] px-4 font-black text-[#370617]">Send</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-400">
                  <span>Enter to send</span><span>Session history stays with the room</span><span>Close session when the study block is over</span>
                </div>
              </form>
            </div>

            <aside className="grid content-start gap-4 border-l border-slate-200 bg-slate-50/90 p-4 sm:p-5">
              <section>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Online now</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-600 shadow-sm">{presence.length}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {presence.length === 0 ? (
                    <p className="text-sm text-slate-400">Presence is offline.</p>
                  ) : (
                    presence.map((person) => (
                      <div key={person.user_id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                        <span aria-hidden="true" className="text-emerald-500">●</span>
                        <span className="truncate">{person.user_id === user.id ? "You" : person.display_name}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <RoomAccessPanel room={room} currentUserId={user.id} onMembershipChanged={() => void loadRoom()} />

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Session controls</p>
                <p className="mt-2 text-sm text-slate-500">Role: <strong className="text-slate-800">{room.current_user_role}</strong></p>
                {isHost ? (
                  <button
                    type="button"
                    disabled={busy || room.status === "closed"}
                    onClick={() => void handleClose()}
                    className="game-button mt-4 w-full border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black text-rose-700"
                  >
                    End study session
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleLeave()}
                    className="game-button mt-4 w-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700"
                  >
                    Leave session
                  </button>
                )}
                <p className="mt-3 text-xs leading-5 text-slate-400">Ending a session locks new chat and Arcade activity but keeps the room history available as a study record.</p>
              </section>
            </aside>
          </section>
        </>
      )}

      {room.status === "closed" && (
        <section className="game-panel p-5 text-center text-slate-300">🔒 This study session has ended. The room history remains available, but realtime posting is off.</section>
      )}
    </div>
  );
}
