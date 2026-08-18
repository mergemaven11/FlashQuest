/** Shared DTOs that mirror the FastAPI responses. */

export type ISODate = string;
export type CardKind = "concept" | "lab";

export interface CardRead {
  id: number;
  word: string;
  definition: string;
  topic: string;
  domain: string;
  kind: CardKind | string;
  is_builtin: boolean;
  created_at: ISODate;
}

export interface CardAdminRead extends CardRead {
  bin: number;
  status: "active" | "never" | "hard_to_remember" | string;
}

export type StudyNextOK = {
  status: "ok";
  card: {
    id: number;
    word: string;
    definition: string;
    topic: string;
    domain: string;
    kind: CardKind | string;
    is_builtin: boolean;
    bin: number;
    status: "active" | "never" | "hard_to_remember" | string;
  };
};

export type StudyNextTemporary = { status: "temporarily_done" };
export type StudyNextPermanent = { status: "permanently_done" };
export type StudyNext = StudyNextOK | StudyNextTemporary | StudyNextPermanent;

export interface CreateCardPayload {
  word: string;
  definition: string;
  topic?: string;
  domain?: string;
  kind?: CardKind;
}

export interface UpdateCardPayload {
  word?: string;
  definition?: string;
  topic?: string;
  domain?: string;
  kind?: CardKind;
}

export interface StudyTopicSummary {
  topic: string;
  total: number;
  concepts: number;
  labs: number;
}
