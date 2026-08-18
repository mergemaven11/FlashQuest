// frontend/src/api.ts
import axios from "axios";
import type {
  CardAdminRead,
  CardRead,
  CreateCardPayload,
  StudyNext,
  StudyTopicSummary,
  UpdateCardPayload,
} from "./types";

export type StudyTrack = "mixed" | "concept" | "lab";

export const BIN_DELAYS: Record<number, number> = {
  0: 0,
  1: 5_000,
  2: 25_000,
  3: 2 * 60_000,
  4: 10 * 60_000,
  5: 60 * 60_000,
  6: 5 * 60 * 60_000,
  7: 24 * 60 * 60_000,
  8: 5 * 24 * 60 * 60_000,
  9: 25 * 24 * 60 * 60_000,
  10: 120 * 24 * 60 * 60_000,
  11: 0,
};

export function binLabel(bin: number): string {
  if (bin === 11) return "mastered";
  const ms = BIN_DELAYS[bin];
  if (ms == null) return "~1m";
  return formatDelay(ms);
}

export function formatDelay(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function apiBaseURL(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (typeof window !== "undefined" && window.location.hostname.endsWith("netlify.app")) {
    return "https://flashcards-tobias.fly.dev";
  }

  return "http://localhost:8080";
}

export const api = axios.create({
  baseURL: apiBaseURL(),
  timeout: 12_000,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  responseType: "json",
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (axios.isCancel?.(err)) return Promise.reject(err);
    console.error("API error:", {
      url: err?.config?.url,
      method: err?.config?.method,
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message,
    });
    return Promise.reject(err);
  }
);

function normalizeError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const responseData = err.response?.data as { detail?: unknown } | undefined;
    const detail = responseData?.detail ?? err.response?.statusText ?? err.message;
    return new Error(
      status ? `HTTP ${status}: ${String(detail)}` : `Network: ${String(detail)}`
    );
  }
  return err instanceof Error ? err : new Error("Unknown error");
}

export async function checkApi(): Promise<boolean> {
  try {
    const { data } = await api.get<{ ok: boolean }>("/health");
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

export async function getStudyTopics(): Promise<StudyTopicSummary[]> {
  try {
    const { data } = await api.get<StudyTopicSummary[]>("/study/topics");
    return data;
  } catch (e) {
    throw normalizeError(e);
  }
}

export async function getStudyNext(
  track: StudyTrack = "mixed",
  topic?: string
): Promise<StudyNext> {
  try {
    const { data } = await api.get<StudyNext>("/study/next", {
      params: { track, topic: topic || undefined },
    });
    return data;
  } catch (e) {
    throw normalizeError(e);
  }
}

export type AnswerResponse = { ok: boolean; to_bin: number; status: string };

export async function postStudyAnswer(
  cardId: number,
  result: "correct" | "wrong"
): Promise<AnswerResponse> {
  try {
    const { data } = await api.post<AnswerResponse>("/study/answer", null, {
      params: { card_id: cardId, result },
    });
    return data;
  } catch (e) {
    throw normalizeError(e);
  }
}

export async function createCard(payload: CreateCardPayload): Promise<CardRead> {
  try {
    const { data } = await api.post<CardRead>("/cards", payload);
    return data;
  } catch (e) {
    throw normalizeError(e);
  }
}

export async function updateCard(
  id: number,
  payload: UpdateCardPayload
): Promise<CardRead> {
  try {
    const { data } = await api.patch<CardRead>(`/cards/${id}`, payload);
    return data;
  } catch (e) {
    throw normalizeError(e);
  }
}

export async function listAdminCards(q?: string): Promise<CardAdminRead[]> {
  try {
    const { data } = await api.get<CardAdminRead[]>("/cards/admin", {
      params: q ? { q } : undefined,
    });
    return data;
  } catch (e) {
    throw normalizeError(e);
  }
}

export async function adminReset(password: string): Promise<{
  ok: boolean;
  inserted_usercards: number;
  deleted_reviews: number;
  updated_usercards: number;
}> {
  try {
    const { data } = await api.post("/cards/admin/reset", null, {
      headers: { "X-Demo-Admin-Password": password },
    });
    return data;
  } catch (e) {
    throw normalizeError(e);
  }
}

export async function deleteCard(id: number, password?: string): Promise<void> {
  try {
    await api.delete(`/cards/${id}`, {
      headers: password ? { "X-Demo-Admin-Password": password } : undefined,
    });
  } catch (e) {
    throw normalizeError(e);
  }
}
