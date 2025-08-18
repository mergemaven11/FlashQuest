/**
 * Minimal API client using axios with friendly errors + health check.
 * Base URL comes from Vite env (VITE_API_URL) or defaults to localhost.
 */

import axios from "axios";
import type {
  CardRead,
  CardAdminRead,
  StudyNext,
  CreateCardPayload,
} from "./types";

/** Resolve API base URL for diagnostics. */
export function apiBaseURL(): string {
  return import.meta.env.VITE_API_URL ?? "http://localhost:8080";
}

/** Axios instance with sane timeout and JSON defaults. */
export const api = axios.create({
  baseURL: apiBaseURL(),
  timeout: 12_000,
});

/** Convert Axios/Network errors to readable messages. */
function normalizeError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const code = err.code ?? "ERR_AXIOS";
    const msg =
      err.response?.data?.detail ??
      err.response?.statusText ??
      err.message ??
      "Network error";
    return new Error(`${code}: ${msg}`);
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
 * - postStudyAnswer(123, "correct")
 * - postStudyAnswer({ cardId: 123, result: "correct" })
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
