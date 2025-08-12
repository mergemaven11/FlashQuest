/** A vocabulary card with its text content. */
export type Card = {
  id: number;
  word: string;
  definition: string;
};

/** Admin listing model with status fields. */
export type AdminCard = Card & {
  bin: number;
  wrong_count: number;
  next_review_at: string | null;
  status: "active" | "never" | "hard_to_remember";
};

/** API response when requesting the next card to study. */
export type NextResponse =
  | { status: "ok"; card: Card }
  | { status: "temporarily_done" | "permanently_done" };

/** Result options sent to the API after a user answers. */
export type AnswerResult = "correct" | "wrong";
