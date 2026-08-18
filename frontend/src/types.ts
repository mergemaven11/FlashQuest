/** Shared DTOs that mirror the FastAPI responses. */

export type ISODate = string;
export type CardKind = "concept" | "lab";
export type DeckDifficulty = "beginner" | "intermediate" | "advanced" | "expert";
export type DeckVisibility = "private" | "unlisted" | "public";

export interface UserRead {
  id: number;
  email: string;
  display_name: string;
  is_verified: boolean;
}

export interface DeckRead {
  id: number;
  owner_id: number | null;
  creator_display_name: string | null;
  title: string;
  slug: string;
  description: string;
  is_builtin: boolean;
  is_official: boolean;
  subject: string;
  difficulty: DeckDifficulty | string;
  visibility: DeckVisibility | string;
  tags: string[];
  published_at: ISODate | null;
  source_deck_id: number | null;
  card_count: number;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface CardRead {
  id: number;
  deck_id: number | null;
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
  deck: {
    id: number;
    title: string;
    is_builtin: boolean;
  };
  card: {
    id: number;
    deck_id: number | null;
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
  deck_id: number;
  word: string;
  definition: string;
  domain?: string;
  kind?: CardKind;
}

export interface UpdateCardPayload {
  word?: string;
  definition?: string;
  domain?: string;
  kind?: CardKind;
}

export interface SignupPayload {
  display_name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: UserRead;
}
