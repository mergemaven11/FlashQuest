import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ExperienceContext,
  type ExperiencePolicy,
  type ExperiencePreferences,
  type LearningMode,
  type MotionPreference,
  type TextScale,
} from "./experienceContext";

const EXPERIENCE_KEY = "flashquest-experience-preferences-v1";

const DEFAULT_PREFERENCES: ExperiencePreferences = {
  learningMode: "arcade",
  motionPreference: "system",
  textScale: "default",
  highContrast: false,
  captionsEnabled: true,
};

function readPreferences(): ExperiencePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(EXPERIENCE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<ExperiencePreferences>;
    const learningMode: LearningMode = ["arcade", "chill", "focus", "party"].includes(
      parsed.learningMode ?? ""
    )
      ? (parsed.learningMode as LearningMode)
      : DEFAULT_PREFERENCES.learningMode;
    const motionPreference: MotionPreference = parsed.motionPreference === "reduced"
      ? "reduced"
      : "system";
    const textScale: TextScale = parsed.textScale === "large" ? "large" : "default";
    return {
      learningMode,
      motionPreference,
      textScale,
      highContrast: parsed.highContrast === true,
      captionsEnabled: parsed.captionsEnabled !== false,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function persist(preferences: ExperiencePreferences) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(EXPERIENCE_KEY, JSON.stringify(preferences));
  }
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<ExperiencePreferences>(readPreferences);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setSystemReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const reducedMotion = preferences.motionPreference === "reduced" || systemReducedMotion;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.learningMode = preferences.learningMode;
    root.dataset.reducedMotion = String(reducedMotion);
    root.dataset.textScale = preferences.textScale;
    root.dataset.highContrast = String(preferences.highContrast);
    root.dataset.captions = String(preferences.captionsEnabled);
  }, [preferences, reducedMotion]);

  const update = useCallback((patch: Partial<ExperiencePreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      persist(next);
      return next;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    persist(DEFAULT_PREFERENCES);
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  const policy = useMemo<ExperiencePolicy>(
    () => ({
      allowOptionalTimers:
        preferences.learningMode === "arcade" || preferences.learningMode === "party",
      encourageHints: preferences.learningMode === "chill",
      minimizeVisualNoise: preferences.learningMode === "focus",
      partyPresentation: preferences.learningMode === "party",
      reducedMotion,
    }),
    [preferences.learningMode, reducedMotion]
  );

  const value = useMemo(
    () => ({
      preferences,
      policy,
      setLearningMode: (learningMode: LearningMode) => update({ learningMode }),
      setMotionPreference: (motionPreference: MotionPreference) => update({ motionPreference }),
      setTextScale: (textScale: TextScale) => update({ textScale }),
      setHighContrast: (highContrast: boolean) => update({ highContrast }),
      setCaptionsEnabled: (captionsEnabled: boolean) => update({ captionsEnabled }),
      resetPreferences,
    }),
    [preferences, policy, resetPreferences, update]
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}
