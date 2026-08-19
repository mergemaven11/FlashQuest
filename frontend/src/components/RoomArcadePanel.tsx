import { useEffect, useMemo, useState } from "react";

import type { ActivityPublicState } from "../activityTypes";
import type { PresenceUser } from "../roomApi";

export type RoomActivitySnapshot = {
  state: ActivityPublicState;
  submitted_user_ids: number[];
  submitted_count: number;
};

type BlitzChoice = { id: string; text: string };
type BlitzPayload = {
  card_id: number;
  prompt: string;
  domain: string;
  kind: string;
  choices: BlitzChoice[];
};
type MatchPrompt = {
  card_id: number;
  prompt: string;
  domain: string;
  kind: string;
};
type MatchPayload = {
  prompts: MatchPrompt[];
  choices: BlitzChoice[];
};
type MatchMap = Record<string, string>;
type SortItem = { card_id: number; prompt: string; clue: string };
type SortPayload = { items: SortItem[]; buckets: string[]; axis: "domain" };
type SortMap = Record<string, string>;

type Props = {
  activity: RoomActivitySnapshot | null;
  userId: number;
  isHost: boolean;
  presence: PresenceUser[];
  connectionLive: boolean;
  onSend: (type: string, payload?: Record<string, unknown>) => void;
};

function blitzPayload(state: ActivityPublicState): BlitzPayload {
  return state.payload as unknown as BlitzPayload;
}

function matchPayload(state: ActivityPublicState): MatchPayload {
  return state.payload as unknown as MatchPayload;
}

function sortPayload(state: ActivityPublicState): SortPayload {
  return state.payload as unknown as SortPayload;
}

function displayName(userId: string, currentUserId: number, presence: PresenceUser[]): string {
  const numericId = Number(userId);
  if (numericId === currentUserId) return "You";
  return presence.find((person) => person.user_id === numericId)?.display_name ?? `Player #${userId}`;
}

function gameBadge(state: ActivityPublicState): string {
  if (state.definition.type === "blitz") return "⚡ BLITZ";
  if (state.definition.type === "match") return "🧩 MATCH QUEST";
  return "🗃️ SORT THE STACK";
}

function Scoreboard({
  state,
  userId,
  presence,
}: {
  state: ActivityPublicState;
  userId: number;
  presence: PresenceUser[];
}) {
  if (state.participants.length === 0) return null;
  const rows = [...state.participants].sort((a, b) => b.score - a.score);
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="metric-label">Room scoreboard</p>
        <span className="text-xs font-black text-slate-500">Arcade points only</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((participant, index) => (
          <div
            key={participant.participant_id}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
          >
            <span className="truncate text-sm font-bold text-slate-200">
              {index === 0 ? "🏆 " : ""}
              {displayName(participant.participant_id, userId, presence)}
            </span>
            <strong className="text-sm text-[#ffba08]">{participant.score}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RoomArcadePanel({
  activity,
  userId,
  isHost,
  presence,
  connectionLive,
  onSend,
}: Props) {
  const [matches, setMatches] = useState<MatchMap>({});
  const [placements, setPlacements] = useState<SortMap>({});
  const state = activity?.state ?? null;
  const submitted = activity?.submitted_user_ids.includes(userId) ?? false;

  useEffect(() => {
    setMatches({});
    setPlacements({});
  }, [state?.session_id, state?.round_index]);

  const presenceNames = useMemo(
    () => new Map(presence.map((person) => [person.user_id, person.display_name])),
    [presence]
  );

  function start(activityType: "blitz" | "match" | "sort") {
    onSend("activity.start", { activity_type: activityType, round_count: 5 });
  }

  if (!state || state.phase === "complete") {
    return (
      <section className="quest-card p-5 sm:p-6">
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="metric-label">🎮 Room Arcade</p>
            <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
              {state?.phase === "complete" ? "Quest cleared. Run it back?" : "Same room. Same question. Everybody plays."}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Blitz, Match Quest, and Sort the Stack use the same server-authoritative runtime as solo Arcade. Room rounds are host-paced and untimed by default.
            </p>
            {state?.phase === "complete" && (
              <Scoreboard state={state} userId={userId} presence={presence} />
            )}
          </div>
          {isHost ? (
            <div className="grid min-w-56 gap-2">
              <button
                type="button"
                disabled={!connectionLive}
                onClick={() => start("blitz")}
                className="game-button bg-[#ffba08] px-4 py-3 text-sm font-black text-[#370617]"
              >
                ⚡ Start Blitz
              </button>
              <button
                type="button"
                disabled={!connectionLive}
                onClick={() => start("match")}
                className="game-button border border-cyan-300/25 bg-cyan-300/[0.08] px-4 py-3 text-sm font-black text-cyan-100"
              >
                🧩 Start Match Quest
              </button>
              <button
                type="button"
                disabled={!connectionLive}
                onClick={() => start("sort")}
                className="game-button border border-violet-300/25 bg-violet-300/[0.08] px-4 py-3 text-sm font-black text-violet-100"
              >
                🗃️ Start Sort the Stack
              </button>
            </div>
          ) : (
            <div className="game-chip px-4 py-3 text-sm font-black text-slate-300">
              ⏳ Waiting for host
            </div>
          )}
        </div>
      </section>
    );
  }

  const revealed = state.phase === "reveal" || state.phase === "result";

  return (
    <section className="quest-card p-5 sm:p-6">
      <div className="relative z-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="game-chip px-2.5 py-1 text-xs font-black text-[#ffba08]">
                {gameBadge(state)}
              </span>
              <span className="game-chip px-2.5 py-1 text-xs font-black text-slate-300">
                Round {state.round_index + 1}/{state.total_rounds}
              </span>
              <span className="game-chip px-2.5 py-1 text-xs font-black text-slate-300">
                🌿 Host-paced · no timer
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-black text-white">{state.definition.title}</h2>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-white">{activity?.submitted_count ?? 0}</p>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">submitted</p>
          </div>
        </div>

        {state.definition.type === "blitz" ? (
          <BlitzRound
            state={state}
            submitted={submitted}
            connectionLive={connectionLive}
            onSubmit={(choiceId) => onSend("activity.submit", { choice_id: choiceId })}
          />
        ) : state.definition.type === "match" ? (
          <MatchRound
            state={state}
            matches={matches}
            submitted={submitted}
            connectionLive={connectionLive}
            onMatch={(cardId, choiceId) =>
              setMatches((current) => ({ ...current, [String(cardId)]: choiceId }))
            }
            onSubmit={() => onSend("activity.submit", { matches })}
          />
        ) : (
          <SortRound
            state={state}
            placements={placements}
            submitted={submitted}
            connectionLive={connectionLive}
            onPlace={(cardId, domain) =>
              setPlacements((current) => ({ ...current, [String(cardId)]: domain }))
            }
            onSubmit={() => onSend("activity.submit", { placements })}
          />
        )}

        {submitted && !revealed && (
          <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-3 text-sm font-bold text-emerald-100">
            ✅ Your answer is locked in locally. The room will not show whether it was right until the host reveals.
          </div>
        )}

        <Scoreboard state={state} userId={userId} presence={presence} />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="text-xs text-slate-500">
            {activity?.submitted_user_ids.length
              ? activity.submitted_user_ids
                  .map((id) => (id === userId ? "You" : presenceNames.get(id) ?? `Player #${id}`))
                  .join(" · ") + " ready"
              : "Nobody has submitted yet."}
          </div>
          {isHost ? (
            <div className="flex flex-wrap gap-2">
              {!revealed ? (
                <button
                  type="button"
                  disabled={!connectionLive}
                  onClick={() => onSend("activity.reveal")}
                  className="game-button bg-[#ffba08] px-4 py-2 text-sm font-black text-[#370617]"
                >
                  👀 Reveal together
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!connectionLive}
                  onClick={() => onSend("activity.next")}
                  className="game-button bg-[#ffba08] px-4 py-2 text-sm font-black text-[#370617]"
                >
                  Next round →
                </button>
              )}
              <button
                type="button"
                disabled={!connectionLive}
                onClick={() => onSend("activity.end")}
                className="game-button border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-slate-200"
              >
                End game
              </button>
            </div>
          ) : (
            <span className="game-chip px-3 py-2 text-xs font-black text-slate-300">
              {revealed ? "⏳ Host advances the round" : "⏳ Host controls reveal"}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function BlitzRound({
  state,
  submitted,
  connectionLive,
  onSubmit,
}: {
  state: ActivityPublicState;
  submitted: boolean;
  connectionLive: boolean;
  onSubmit: (choiceId: string) => void;
}) {
  const payload = blitzPayload(state);
  const correctChoice = String(state.reveal?.correct_choice_id ?? "");
  const revealed = state.phase === "reveal" || state.phase === "result";

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">{payload.domain}</span>
        <span className="text-xs font-black text-slate-500">Choose one</span>
      </div>
      <h3 className="mt-3 text-center text-3xl font-black leading-tight text-white sm:text-4xl">
        {payload.prompt}
      </h3>
      <div className="mx-auto mt-6 grid max-w-4xl gap-3 sm:grid-cols-2">
        {payload.choices.map((choice, index) => {
          const correct = revealed && choice.id === correctChoice;
          return (
            <button
              key={choice.id}
              type="button"
              disabled={!connectionLive || submitted || revealed}
              onClick={() => onSubmit(choice.id)}
              className={`game-button min-h-24 border p-4 text-left ${
                correct
                  ? "border-emerald-300/50 bg-emerald-300/[0.12] text-emerald-50"
                  : "border-white/10 bg-black/20 text-slate-100"
              }`}
            >
              <span className="text-xs font-black text-[#faa307]">{index + 1}</span>
              <span className="mt-2 block text-sm font-bold leading-6">{choice.text}</span>
              {correct && <span className="mt-2 block text-xs font-black text-emerald-200">✓ Correct answer</span>}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="answer-pop mx-auto mt-5 max-w-3xl rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.08] p-4 text-sm leading-6 text-cyan-50">
          <strong className="text-white">Synchronized reveal:</strong> {String(state.reveal?.answer ?? "")}
        </div>
      )}
    </div>
  );
}

function MatchRound({
  state,
  matches,
  submitted,
  connectionLive,
  onMatch,
  onSubmit,
}: {
  state: ActivityPublicState;
  matches: MatchMap;
  submitted: boolean;
  connectionLive: boolean;
  onMatch: (cardId: number, choiceId: string) => void;
  onSubmit: () => void;
}) {
  const payload = matchPayload(state);
  const answerMap = (state.reveal?.answer_map ?? {}) as Record<string, string>;
  const choiceText = new Map(payload.choices.map((choice) => [choice.id, choice.text]));
  const revealed = state.phase === "reveal" || state.phase === "result";
  const completeBoard = payload.prompts.every((prompt) => Boolean(matches[String(prompt.card_id)]));

  return (
    <div className="mt-6">
      <p className="text-sm leading-6 text-slate-400">
        Match each prompt with a definition. Native selects keep the room game usable with keyboard, touch, and screen readers — no drag-and-drop required.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {payload.prompts.map((prompt) => {
          const correctChoiceId = answerMap[String(prompt.card_id)];
          return (
            <label key={prompt.card_id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <span className="text-sm font-black text-white">{prompt.prompt}</span>
              <span className="mt-1 block text-xs text-slate-500">{prompt.domain}</span>
              {revealed ? (
                <span className="mt-3 block rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-2 text-sm text-emerald-100">
                  ✓ {choiceText.get(correctChoiceId) ?? "Correct match"}
                </span>
              ) : (
                <select
                  className="game-input mt-3"
                  aria-label={`Match for ${prompt.prompt}`}
                  value={matches[String(prompt.card_id)] ?? ""}
                  disabled={!connectionLive || submitted}
                  onChange={(event) => onMatch(prompt.card_id, event.target.value)}
                >
                  <option value="">Choose definition…</option>
                  {payload.choices.map((choice) => (
                    <option key={choice.id} value={choice.id}>{choice.text}</option>
                  ))}
                </select>
              )}
            </label>
          );
        })}
      </div>
      {!revealed && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={!connectionLive || submitted || !completeBoard}
            onClick={onSubmit}
            className="game-button bg-[#ffba08] px-5 py-3 font-black text-[#370617]"
          >
            🧩 Submit matches
          </button>
        </div>
      )}
    </div>
  );
}

function SortRound({
  state,
  placements,
  submitted,
  connectionLive,
  onPlace,
  onSubmit,
}: {
  state: ActivityPublicState;
  placements: SortMap;
  submitted: boolean;
  connectionLive: boolean;
  onPlace: (cardId: number, domain: string) => void;
  onSubmit: () => void;
}) {
  const payload = sortPayload(state);
  const answerMap = (state.reveal?.answer_map ?? {}) as Record<string, string>;
  const revealed = state.phase === "reveal" || state.phase === "result";
  const completeBoard = payload.items.every((item) => Boolean(placements[String(item.card_id)]));

  return (
    <div className="mt-6">
      <p className="text-sm leading-6 text-slate-400">
        Sort each card into its correct domain. The domain itself stays hidden until synchronized reveal; selects keep the game usable without drag-and-drop.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {payload.buckets.map((bucket) => (
          <span key={bucket} className="game-chip px-3 py-1.5 text-xs font-black text-cyan-100">📚 {bucket}</span>
        ))}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {payload.items.map((item) => {
          const correctDomain = answerMap[String(item.card_id)] ?? "";
          return (
            <label key={item.card_id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <span className="text-sm font-black text-white">{item.prompt}</span>
              <span className="mt-2 block text-sm leading-6 text-slate-400">{item.clue}</span>
              {revealed ? (
                <span className="mt-3 block rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-2 text-sm text-emerald-100">
                  ✓ {correctDomain || "Correct domain"}
                </span>
              ) : (
                <select
                  className="game-input mt-3"
                  aria-label={`Domain for ${item.prompt}`}
                  value={placements[String(item.card_id)] ?? ""}
                  disabled={!connectionLive || submitted}
                  onChange={(event) => onPlace(item.card_id, event.target.value)}
                >
                  <option value="">Choose domain…</option>
                  {payload.buckets.map((bucket) => (
                    <option key={bucket} value={bucket}>{bucket}</option>
                  ))}
                </select>
              )}
            </label>
          );
        })}
      </div>
      {!revealed && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={!connectionLive || submitted || !completeBoard}
            onClick={onSubmit}
            className="game-button bg-[#ffba08] px-5 py-3 font-black text-[#370617]"
          >
            🗃️ Submit stack
          </button>
        </div>
      )}
    </div>
  );
}
