export type ActivityType =
  | "blitz"
  | "match"
  | "sort"
  | "order"
  | "recall"
  | "debug"
  | "story"
  | "boss";

export type ActivityMode = "solo" | "room";
export type ActivityPhase =
  | "lobby"
  | "prompt"
  | "hint"
  | "locked"
  | "reveal"
  | "result"
  | "complete";
export type TimerPolicy = "none" | "optional" | "required";

export interface ActivityDefinition {
  id: string;
  version: number;
  type: ActivityType;
  title: string;
  description: string;
  min_cards: number;
  max_cards: number;
  compatible_kinds: string[];
  timer_policy: TimerPolicy;
  supports_hints: boolean;
  supports_reveal: boolean;
  supports_teams: boolean;
  supports_late_join: boolean;
  score_rule: string;
}

export interface ActivityParticipantState {
  participant_id: string;
  score: number;
  streak: number;
  response: string | null;
  confidence: number | null;
  round_complete: boolean;
}

export interface ActivityEvent {
  type: string;
  participant_id?: string | null;
  payload?: Record<string, unknown>;
}

export interface ActivityPublicState {
  session_id: string;
  definition: ActivityDefinition;
  mode: ActivityMode;
  phase: ActivityPhase;
  deck_id: number;
  card_ids: number[];
  round_index: number;
  total_rounds: number;
  seed: number;
  payload: Record<string, unknown>;
  reveal: Record<string, unknown> | null;
  participants: ActivityParticipantState[];
}

/**
 * The browser only consumes ActivityPublicState. Correct-answer fields belong in
 * `reveal` and should remain null until the runtime reaches a reveal/result phase.
 * Quest Rooms will synchronize this same shape instead of inventing a second
 * multiplayer game contract.
 */
export function isActivityRevealed(state: ActivityPublicState): boolean {
  return state.phase === "reveal" || state.phase === "result";
}
