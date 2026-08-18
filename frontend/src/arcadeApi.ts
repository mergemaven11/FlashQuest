import axios from "axios";

import { api } from "./api";
import type {
  ActivityEvent,
  ActivityPublicState,
  ActivityType,
} from "./activityTypes";

export interface ActivityStartPayload {
  deck_id: number;
  activity_type: ActivityType;
  round_count?: number;
  seed?: number;
}

function normalizeArcadeError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { detail?: unknown } | undefined;
    const detail = data?.detail ?? error.response?.statusText ?? error.message;
    return new Error(
      error.response?.status
        ? `HTTP ${error.response.status}: ${String(detail)}`
        : `Network: ${String(detail)}`
    );
  }
  return error instanceof Error ? error : new Error("Unknown Arcade error");
}

export async function startActivity(
  payload: ActivityStartPayload
): Promise<ActivityPublicState> {
  try {
    const { data } = await api.post<ActivityPublicState>("/activities/start", payload);
    return data;
  } catch (error) {
    throw normalizeArcadeError(error);
  }
}

export async function getActivityState(
  sessionId: string
): Promise<ActivityPublicState> {
  try {
    const { data } = await api.get<ActivityPublicState>(
      `/activities/${encodeURIComponent(sessionId)}`
    );
    return data;
  } catch (error) {
    throw normalizeArcadeError(error);
  }
}

export async function sendActivityEvent(
  sessionId: string,
  event: ActivityEvent
): Promise<ActivityPublicState> {
  try {
    const { data } = await api.post<ActivityPublicState>(
      `/activities/${encodeURIComponent(sessionId)}/events`,
      event
    );
    return data;
  } catch (error) {
    throw normalizeArcadeError(error);
  }
}
