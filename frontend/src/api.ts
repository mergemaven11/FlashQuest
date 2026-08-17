// frontend/src/api.ts
/**
 * Minimal API client using axios with friendly errors + health check.
 * Base URL comes from Vite env, then a production-safe fallback, then localhost.
 *
 * Also exports spaced-repetition helpers to display bin timers in the UI.
 */

import axios from "axios";
import type {
  CardRead,
  CardAdminRead,
  StudyNext,
  CreateCardPayload,
} from "./types";

export type StudyTrack = "mixed" | "concept" | "lab";

/** Map of bin -> delay in milliseconds (must mirror backend schedule). */
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
  const d = Math.round(h / 24);
  return `${d}d`;
}

/** Resolve API base URL for diagnostics and production. */
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
      headers: err?.response?.headers,
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

export async function getStudyNext(track: StudyTrack = "mixed"): Promise<StudyNext> {
  try {
    const { data } = await api.get<StudyNext>("/study/next", {
      params: { track },
    });
    return data;
  } catch (e) {
    throw normalizeError(e);
  }
}

export type AnswerResponse = { ok: boolean; to_bin: number; status: string };

export function postStudyAnswer(
  cardId: number,
  result: "correct" | "wrong"
): Promise<AnswerResponse>;
export function postStudyAnswer(args: {
  cardId: number;
  result: "correct" | "wrong";
}): Promise<AnswerResponse>;
export async function postStudyAnswer(
  a:
    | number
    | {
        cardId: number;
        result: "correct" | "wrong";
      },
  b?: "correct" | "wrong"
): Promise<AnswerResponse> {
  try {
    const cardId = typeof a === "number" ? a : a.cardId;
    const result = typeof a === "number" ? (b as "correct" | "wrong") : a.result;
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

export async function adminReset(): Promise<{
  ok: boolean;
  inserted_usercards: number;
  deleted_reviews: number;
  updated_usercards: number;
}> {
  try {
    const { data } = await api.post("/cards/admin/reset");
    return data as {
      ok: boolean;
      inserted_usercards: number;
      deleted_reviews: number;
      updated_usercards: number;
    };
  } catch (e) {
    throw normalizeError(e);
  }
}

export async function deleteCard(id: number): Promise<void> {
  try {
    await api.delete(`/cards/${id}`);
  } catch (e) {
    throw normalizeError(e);
  }
}
