import { api, apiBaseURL } from "./api";

export type RoomVisibility = "public" | "private" | "invite_only";
export type RoomRole = "host" | "moderator" | "member";

export interface RoomRead {
  id: number;
  host_user_id: number;
  deck_id: number;
  name: string;
  visibility: RoomVisibility;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  member_count: number;
  current_user_role: RoomRole | null;
}

export interface RoomMemberRead {
  id: number;
  room_id: number;
  user_id: number;
  role: RoomRole;
  status: "active" | "left" | "removed";
  joined_at: string;
  last_seen_at: string;
}

export interface RoomMessageRead {
  id: number;
  room_id: number;
  user_id: number;
  author_display_name: string;
  kind: "chat" | "card" | "system" | "activity";
  body: string;
  card_id: number | null;
  created_at: string;
}

export type PresenceUser = {
  user_id: number;
  display_name: string;
};

export type RoomRealtimeEvent = {
  schema: "quest-room.v1";
  room_id: number;
  type: string;
  server_timestamp: string;
  payload: Record<string, unknown>;
};

function normalizeRoomError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("Quest Room request failed");
}

export async function getMyRooms(): Promise<RoomRead[]> {
  try {
    const { data } = await api.get<RoomRead[]>("/rooms/mine");
    return data;
  } catch (error) {
    throw normalizeRoomError(error);
  }
}

export async function createRoom(payload: {
  deck_id: number;
  name: string;
  visibility: RoomVisibility;
}): Promise<RoomRead> {
  try {
    const { data } = await api.post<RoomRead>("/rooms", payload);
    return data;
  } catch (error) {
    throw normalizeRoomError(error);
  }
}

export async function getRoom(roomId: number): Promise<RoomRead> {
  try {
    const { data } = await api.get<RoomRead>(`/rooms/${roomId}`);
    return data;
  } catch (error) {
    throw normalizeRoomError(error);
  }
}

export async function joinRoom(roomId: number): Promise<RoomRead> {
  try {
    const { data } = await api.post<RoomRead>(`/rooms/${roomId}/join`);
    return data;
  } catch (error) {
    throw normalizeRoomError(error);
  }
}

export async function leaveRoom(roomId: number): Promise<RoomRead> {
  try {
    const { data } = await api.post<RoomRead>(`/rooms/${roomId}/leave`);
    return data;
  } catch (error) {
    throw normalizeRoomError(error);
  }
}

export async function closeRoom(roomId: number): Promise<RoomRead> {
  try {
    const { data } = await api.post<RoomRead>(`/rooms/${roomId}/close`);
    return data;
  } catch (error) {
    throw normalizeRoomError(error);
  }
}

export async function getRoomMembers(roomId: number): Promise<RoomMemberRead[]> {
  try {
    const { data } = await api.get<RoomMemberRead[]>(`/rooms/${roomId}/members`);
    return data;
  } catch (error) {
    throw normalizeRoomError(error);
  }
}

export async function getRoomMessages(roomId: number): Promise<RoomMessageRead[]> {
  try {
    const { data } = await api.get<RoomMessageRead[]>(`/rooms/${roomId}/messages`);
    return data;
  } catch (error) {
    throw normalizeRoomError(error);
  }
}

export async function getRoomWsTicket(
  roomId: number
): Promise<{ ticket: string; expires_in_seconds: number }> {
  try {
    const { data } = await api.post<{ ticket: string; expires_in_seconds: number }>(
      `/rooms/${roomId}/ws-ticket`
    );
    return data;
  } catch (error) {
    throw normalizeRoomError(error);
  }
}

export function roomWebSocketUrl(roomId: number, ticket: string): string {
  const base = new URL(apiBaseURL());
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `/rooms/${roomId}/ws`;
  base.search = new URLSearchParams({ ticket }).toString();
  return base.toString();
}
