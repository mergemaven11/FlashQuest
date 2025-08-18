/**
 * Shared DTOs that mirror the backend responses.
 * Keep these in sync with FastAPI response models.
 */

/** ISO8601 date string (e.g., "2025-08-18T12:34:56Z"). */
export type ISODate = string;

/** Read-only card view returned by API. */
export interface CardRead {
  id: number;
  word: string;
  definition: string;
  created_at: ISODate;
}

/** Admin view extends CardRead with study state. */
export interface CardAdminRead extends CardRead {
  bin: number;
  status: "active" | "never" | "hard_to_remember" | string;
}

/** Study-next response variants (discriminated by `status`). */
export type StudyNextOK = {
  status: "ok";
  card: {
    id: number;
    word: string;
    definition: string;
    bin: number;
    status: "active" | "never" | "hard_to_remember" | string;
  };
};
export type StudyNextTemporary = { status: "temporarily_done" };
export type StudyNextPermanent = { status: "permanently_done" };
export type StudyNext = StudyNextOK | StudyNextTemporary | StudyNextPermanent;

/** Payload for creating a new card. */
export interface CreateCardPayload {
  word: string;
  definition: string;
}

