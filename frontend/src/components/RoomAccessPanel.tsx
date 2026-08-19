import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  addPrivateRoomMember,
  createRoomInvite,
  getRoomInvites,
  getRoomMembers,
  removeRoomMember,
  revokeRoomInvite,
  type RoomInviteRead,
  type RoomMemberRead,
  type RoomRead,
} from "../roomApi";

type Props = {
  room: RoomRead;
  currentUserId: number;
  onMembershipChanged?: () => void;
};

function expiresLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown expiry";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function RoomAccessPanel({
  room,
  currentUserId,
  onMembershipChanged,
}: Props) {
  const isHost = room.current_user_role === "host";
  const [members, setMembers] = useState<RoomMemberRead[]>([]);
  const [invites, setInvites] = useState<RoomInviteRead[]>([]);
  const [email, setEmail] = useState("");
  const [expiryHours, setExpiryHours] = useState(24);
  const [freshInviteUrl, setFreshInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const nextMembers = await getRoomMembers(room.id);
      setMembers(nextMembers);
      if (isHost && room.visibility === "invite_only") {
        setInvites(await getRoomInvites(room.id));
      } else {
        setInvites([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load room access controls");
    }
  }, [isHost, room.id, room.visibility]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addPrivateRoomMember(room.id, email.trim());
      setEmail("");
      await refresh();
      onMembershipChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add that member");
    } finally {
      setBusy(false);
    }
  }

  async function createInvite() {
    setBusy(true);
    setError(null);
    try {
      const issued = await createRoomInvite(room.id, expiryHours);
      const url = `${window.location.origin}/rooms/invite?token=${encodeURIComponent(issued.token)}`;
      setFreshInviteUrl(url);
      setInvites((current) => [issued, ...current.filter((item) => item.id !== issued.id)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create invite link");
    } finally {
      setBusy(false);
    }
  }

  async function copyFreshInvite() {
    if (!freshInviteUrl) return;
    try {
      await navigator.clipboard.writeText(freshInviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy the invite link on this device");
    }
  }

  async function revoke(inviteId: number) {
    setBusy(true);
    setError(null);
    try {
      const updated = await revokeRoomInvite(room.id, inviteId);
      setInvites((current) =>
        current.map((item) => (item.id === inviteId ? updated : item))
      );
      if (freshInviteUrl) setFreshInviteUrl(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke invite");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: number) {
    setBusy(true);
    setError(null);
    try {
      await removeRoomMember(room.id, userId);
      await refresh();
      onMembershipChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="game-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="metric-label">Room access</p>
          <h3 className="mt-1 text-lg font-black text-white">
            {room.visibility === "public"
              ? "Public membership"
              : room.visibility === "invite_only"
                ? "Invite-only membership"
                : "Private membership"}
          </h3>
        </div>
        <span className="game-chip px-2.5 py-1 text-xs font-black text-slate-300">
          {members.length} member{members.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-xs leading-5 text-rose-200">
          🛡️ {error}
        </p>
      )}

      {isHost && room.status === "open" && room.visibility === "invite_only" && (
        <div className="mt-4 rounded-2xl border border-[#faa307]/20 bg-[#faa307]/[0.05] p-4">
          <p className="text-sm font-black text-white">✉️ Share an expiring invite</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            The secret token is shown only when the invite is created. If you lose the link, create a new one.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              className="game-input max-w-44"
              aria-label="Invite lifetime"
              value={expiryHours}
              onChange={(event) => setExpiryHours(Number(event.target.value))}
            >
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createInvite()}
              className="game-button bg-[#ffba08] px-3 py-2 text-xs font-black text-[#370617]"
            >
              Create invite link
            </button>
          </div>
          {freshInviteUrl && (
            <div className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3">
              <p className="break-all text-xs leading-5 text-emerald-100">{freshInviteUrl}</p>
              <button
                type="button"
                onClick={() => void copyFreshInvite()}
                className="game-button mt-2 border border-emerald-300/20 px-3 py-1.5 text-xs font-black text-emerald-100"
              >
                {copied ? "✅ Copied" : "📋 Copy invite"}
              </button>
            </div>
          )}
          {invites.length > 0 && (
            <div className="mt-4 space-y-2">
              {invites.slice(0, 5).map((invite) => (
                <div key={invite.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                  <div className="min-w-0 text-xs">
                    <p className="font-black text-slate-200">
                      Invite #{invite.id} · {invite.active ? "active" : "inactive"}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      Expires {expiresLabel(invite.expires_at)} · {invite.use_count} use{invite.use_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  {invite.active && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void revoke(invite.id)}
                      className="game-button border border-rose-400/20 px-2.5 py-1.5 text-xs font-black text-rose-200"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isHost && room.status === "open" && room.visibility === "private" && (
        <form className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4" onSubmit={addMember}>
          <p className="text-sm font-black text-white">🔐 Add a verified account</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Private rooms do not accept generic links. The host explicitly admits an existing FlashQuest account.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="private-member-email" className="sr-only">Member email</label>
            <input
              id="private-member-email"
              className="game-input"
              type="email"
              autoComplete="off"
              placeholder="friend@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="game-button bg-[#ffba08] px-3 py-2 text-xs font-black text-[#370617]"
            >
              Add member
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-200">
                {member.user_id === currentUserId ? "You" : member.display_name ?? `Player #${member.user_id}`}
              </p>
              <p className="mt-0.5 text-xs capitalize text-slate-500">{member.role}</p>
            </div>
            {isHost && member.role !== "host" && room.status === "open" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeMember(member.user_id)}
                className="game-button border border-rose-400/20 px-2.5 py-1.5 text-xs font-black text-rose-200"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {room.visibility === "public" && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          🌐 Any signed-in learner with the shared room link/number can join while this room is open.
        </p>
      )}
    </section>
  );
}
