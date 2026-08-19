import { api } from "./api";

export type ReportKind = "room" | "message" | "user";
export type ReportStatus = "open" | "reviewed" | "dismissed" | "actioned";

export interface ModerationReportRead {
  id: number;
  reporter_user_id: number;
  room_id: number;
  kind: ReportKind;
  message_id: number | null;
  target_user_id: number | null;
  reason: string;
  details: string;
  room_name_snapshot: string;
  message_body_snapshot: string | null;
  message_author_user_id: number | null;
  target_display_name_snapshot: string | null;
  status: ReportStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_user_id: number | null;
  review_note: string;
}

export interface BlockRead {
  user_id: number;
  display_name: string;
  created_at: string;
}

function moderationError(error: unknown): Error {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { detail?: unknown } } }).response;
    const detail = response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return new Error(detail);
  }
  if (error instanceof Error) return error;
  return new Error("Moderation request failed");
}

export async function reportRoomContent(
  roomId: number,
  payload: {
    kind: ReportKind;
    message_id?: number;
    target_user_id?: number;
    reason: string;
    details?: string;
  }
): Promise<ModerationReportRead> {
  try {
    const { data } = await api.post<ModerationReportRead>(
      `/moderation/rooms/${roomId}/reports`,
      payload
    );
    return data;
  } catch (error) {
    throw moderationError(error);
  }
}

export async function getBlockedUsers(): Promise<BlockRead[]> {
  try {
    const { data } = await api.get<BlockRead[]>("/moderation/blocks");
    return data;
  } catch (error) {
    throw moderationError(error);
  }
}

export async function blockUser(userId: number): Promise<BlockRead> {
  try {
    const { data } = await api.post<BlockRead>(`/moderation/blocks/${userId}`);
    return data;
  } catch (error) {
    throw moderationError(error);
  }
}

export async function unblockUser(userId: number): Promise<void> {
  try {
    await api.delete(`/moderation/blocks/${userId}`);
  } catch (error) {
    throw moderationError(error);
  }
}
