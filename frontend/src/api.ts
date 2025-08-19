// frontend/src/api.ts
/**
 * Minimal API client using axios with friendly errors + health check.
 * Base URL comes from Vite env (VITE_API_URL) or defaults to localhost.
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

/** Map of bin -> delay in milliseconds (must mirror backend schedule). */
export const BIN_DELAYS: Record<number, number> = {
  0: 0, // new
  1: 5_000, // 5s
  2: 30_000, // 30s
  3: 5 * 60_000, // 5m
  4: 30 * 60_000, // 30m
  5: 2 * 60 * 60_000, // 2h
  6: 6 * 60 * 60_000, // 6h
  7: 24 * 60 * 60_000, // 1d
  8: 2 * 24 * 60 * 60_000, // 2d
  9: 4 * 24 * 60 * 60_000, // 4d
  10: 7 * 24 * 60 * 60_000, // 7d (~1w)
  11: 14 * 24 * 60 * 60_000, // 14d
};

/**
 * Human-friendly label for a bin’s delay (e.g., "5s", "30m", "2h", "1d").
 * Falls back to "~1m" if bin is unknown.
 */
export function binLabel(bin: number): string {
  const ms = BIN_DELAYS[bin];
  if (ms == null) return "~1m";
  return formatDelay(ms);
}

/** Format milliseconds into a short relative label (s/m/h/d). */
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

/** Resolve API base URL for diagnostics. */
export function apiBaseURL(): string {
  return import.meta.env.VITE_API_URL ?? "http://localhost:8080";
}

/** Axios instance with sane timeout and JSON defaults. */
export const api = axios.create({
  baseURL: apiBaseURL(),
  timeout: 12_000,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  responseType: "json",
});

/** Log useful info on API failures to help debug quickly in the console. */
api.interceptors.response.use(
  (r) => r,
  (err) => {
    // Avoid noisy logs for cancellations
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

/** Convert Axios/Network errors to readable messages for the UI. */
function normalizeError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const detail =
      (err.response?.data as any)?.detail ??
      err.response?.statusText ??
      err.message;
    return new Error(
      status ? `HTTP ${status}: ${String(detail)}` : `Network: ${String(detail)}`
    );
  }
  return err instanceof Error ? err : new Error("Unknown error");
}

/**
 * Check API health.
 * @returns `true` if `/health` responds `{ ok: true }`, otherwise `false`.
 */
export async function checkApi(): Promise<boolean> {
  try {
    const { data } = await api.get<{ ok: boolean }>("/health");
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

/**
 * Get the next study item or a status if none are due.
 * @returns Discriminated union with `status: "ok" | "temporarily_done" | "permanently_done"`.
 */
export async function getStudyNext(): Promise<StudyNext> {
  try {
    const { data } = await api.get<StudyNext>("/study/next");
    return data;
  } catch (e) {
    throw normalizeError(e);
  }
}

/** Response shape for /study/answer. */
export type AnswerResponse = { ok: boolean; to_bin: number; status: string };

/**
 * Submit an answer for a card.
 *
 * Overloads:
 * - `postStudyAnswer(123, "correct")`
 * - `postStudyAnswer({ cardId: 123, result: "correct" })`
 */
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

/**
 * Create a new card (word + definition).
 * @param payload - The card data.
 */
export async function createCard(payload: CreateCardPayload): Promise<CardRead> {
  try {
    const { data } = await api.post<CardRead>("/cards", payload);
    return data;
  } catch (e) {
    throw normalizeError(e);
  }
}

/**
 * List admin cards (with bin/status). Optional search query.
 * @param q - Case-insensitive match on word/definition.
 */
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

/**
 * Reset ALL progress for the default user on the backend.
 * - Ensures a UserCard exists for every Card
 * - Deletes all Review rows
 * - Resets bin/wrong_count/next_review_at/status on UserCard
 * @returns counts of affected rows
 */
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

/**
 * Delete a card by ID.
 * Also removes associated per-user progress/reviews if your backend cascades.
 * @throws Error with readable message when the API rejects the request.
 */
export async function deleteCard(id: number): Promise<void> {
  try {
    await api.delete(`/cards/${id}`);
  } catch (e) {
    throw normalizeError(e);
  }
}