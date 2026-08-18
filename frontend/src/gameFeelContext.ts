import { createContext, useContext } from "react";

export type GameSound =
  | "tap"
  | "navigate"
  | "hint"
  | "reveal"
  | "success"
  | "miss"
  | "skip"
  | "save"
  | "publish"
  | "combo"
  | "levelUp"
  | "achievement"
  | "roomJoin"
  | "roundStart"
  | "roundEnd"
  | "complete";

export type GameFeelValue = {
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => void;
  play: (sound: GameSound) => void;
};

export const GameFeelContext = createContext<GameFeelValue | null>(null);

export function useGameFeel(): GameFeelValue {
  const value = useContext(GameFeelContext);
  if (!value) throw new Error("useGameFeel must be used inside GameFeelProvider");
  return value;
}
