/**
 * Minimal API client using axios.
 * The base URL is taken from Vite env (VITE_API_URL) or defaults to localhost.
 */

import axios from "axios";
import type {
  CardRead,
  CardAdminRead,
  StudyNext,
  CreateCardPayload,
} from "./types";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export const api = axios.create({
  baseURL,
  timeout: 12_000, // keep requests snappy in UI :)
});

/**
 * Get the next study item or a status if none are due.
 * @returns Discriminated union with `status: "ok" | "temporarily_done" | "permanently_done"`.
 * @example
 * const next = await getStudyNext();
 * if (next.status === "ok") console.log(next.card.word);
 */
export async function getStudyNext(): Promise<StudyNext> {
  const { data } = await api.get<StudyNext>("/study/next");
  return data;
}

/**
 * Submit an answer for a card.
 * @param cardId - The card's ID.
 * @param result - "correct" or "wrong".
 * @returns Acknowledgement with target bin and resulting status.
 */
export async function postStudyAnswer(
  cardId: number,
  result: "correct" | "wrong"
) {
  const { data } = await api.post(`/study/answer`, null, {
    params: { card_id: cardId, result },
  });
  return data as { ok: boolean; to_bin: number; status: string };
}

/**
 * Create a new card (word + definition).
 * @param payload - The card data.
 */
export async function createCard(payload: CreateCardPayload): Promise<CardRead> {
  const { data } = await api.post<CardRead>("/cards", payload);
  return data;
}

/**
 * List admin cards (with bin/status). Optional search query.
 * @param q - Case-insensitive match on word/definition.
 */
export async function listAdminCards(q?: string): Promise<CardAdminRead[]> {
  const { data } = await api.get<CardAdminRead[]>("/cards/admin", {
    params: q ? { q } : undefined,
  });
  return data;
}
