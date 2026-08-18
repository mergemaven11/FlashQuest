import { createContext, useContext } from "react";

export type LearningMode = "arcade" | "chill" | "focus" | "party";
export type MotionPreference = "system" | "reduced";
export type TextScale = "default" | "large";

export type ExperiencePreferences = {
  learningMode: LearningMode;
  motionPreference: MotionPreference;
  textScale: TextScale;
  highContrast: boolean;
  captionsEnabled: boolean;
};

export type ExperiencePolicy = {
  allowOptionalTimers: boolean;
  encourageHints: boolean;
  minimizeVisualNoise: boolean;
  partyPresentation: boolean;
  reducedMotion: boolean;
};

export type ExperienceValue = {
  preferences: ExperiencePreferences;
  policy: ExperiencePolicy;
  setLearningMode: (mode: LearningMode) => void;
  setMotionPreference: (preference: MotionPreference) => void;
  setTextScale: (scale: TextScale) => void;
  setHighContrast: (enabled: boolean) => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  resetPreferences: () => void;
};

export const ExperienceContext = createContext<ExperienceValue | null>(null);

export function useExperience(): ExperienceValue {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("useExperience must be used inside ExperienceProvider");
  return value;
}
