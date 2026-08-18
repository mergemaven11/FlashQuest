import type { CardKind } from "./types";

/**
 * Build a compact study summary without needing a second answer payload.
 * This is intentionally deterministic so the same card renders consistently.
 */
export function studyTldr(definition: string, maxWords = 16): string {
  const clean = definition.replace(/\s+/g, " ").trim();
  if (!clean) return "No summary available yet.";

  const clause = clean.split(/[;.!?](?:\s|$)/, 1)[0]?.trim() ?? clean;
  const words = clause.split(" ").filter(Boolean);
  if (words.length <= maxWords && clause.length >= 32) {
    return clause.endsWith(".") ? clause : `${clause}.`;
  }

  const sourceWords = clean.split(" ").filter(Boolean);
  if (sourceWords.length <= maxWords) return clean;
  return `${sourceWords.slice(0, maxWords).join(" ")}…`;
}

/**
 * Produce a non-spoiler coaching hint from prompt metadata only.
 * The answer text is deliberately not accepted by this function.
 */
export function studyHint(prompt: string, domain: string, kind: CardKind | string): string {
  const normalized = prompt.toLowerCase();

  if (kind === "lab") {
    return `Start with evidence in ${domain}: check the observable signal first, then logs, configuration, and dependencies before changing anything.`;
  }
  if (normalized.includes("difference between")) {
    return "Compare the two by purpose, behavior, and trade-offs. What does each one control or guarantee?";
  }
  if (normalized.includes("why")) {
    return "Think about the failure, cost, or trade-off this practice is trying to prevent.";
  }
  if (normalized.includes("what does") || normalized.includes("what is")) {
    return `Think about the job this ${domain} concept performs: what problem does it solve, expose, isolate, or control?`;
  }
  if (normalized.includes("how")) {
    return "Walk through the sequence from the first observable event to the final outcome.";
  }
  return `Anchor it to ${domain}: name the problem first, then the mechanism that solves it.`;
}
