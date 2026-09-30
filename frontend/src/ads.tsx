import type { ReactNode } from "react";

type AdSlotProps = {
  placement: "study-footer" | "library-inline" | "landing-inline" | "room-sidebar";
  children?: ReactNode;
};

const copy: Record<AdSlotProps["placement"], { eyebrow: string; title: string; detail: string }> = {
  "study-footer": {
    eyebrow: "Sponsored · quiet placement",
    title: "Support FlashQuest without interrupting your study flow",
    detail: "Ads never appear between questions, inside answers, or as popups.",
  },
  "library-inline": {
    eyebrow: "Sponsored",
    title: "A small sponsor slot can live between library sections",
    detail: "No autoplay, no takeover, no forced click-through.",
  },
  "landing-inline": {
    eyebrow: "Supported by sponsors",
    title: "Free learning stays free",
    detail: "FlashQuest uses low-friction sponsor placements instead of blocking core study features.",
  },
  "room-sidebar": {
    eyebrow: "Sponsored",
    title: "Quiet sidebar placement",
    detail: "Quest activity stays untouched while sponsors support the free tier.",
  },
};

export function AdSlot({ placement, children }: AdSlotProps) {
  const item = copy[placement];

  return (
    <aside
      className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"
      aria-label="Sponsored content"
      data-ad-placement={placement}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{item.eyebrow}</p>
      {children ?? (
        <div className="mt-2 grid gap-1">
          <p className="text-sm font-black text-slate-200">{item.title}</p>
          <p className="text-xs leading-5 text-slate-500">{item.detail}</p>
        </div>
      )}
    </aside>
  );
}

export const adPolicy = {
  noInterstitials: true,
  noPopups: true,
  noAutoplay: true,
  noAdsBetweenQuestions: true,
  noAdsInsideAnswers: true,
  paidPlansAdFree: true,
} as const;
