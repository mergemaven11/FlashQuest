/** A vocabulary card with its text content. */
export type Card = {
  id: number;
  word: string;
  definition: string;
};

/** API response when requesting the next card to study. */
export type NextResponse =
  | { status: "ok"; card: Card }
  | { status: "temporarily_done" | "permanently_done" };

/** Result options sent to the API after a user answers. */
export type AnswerResult = "correct" | "wrong";
