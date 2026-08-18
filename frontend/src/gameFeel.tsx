import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GameFeelContext, useGameFeel, type GameSound } from "./gameFeelContext";

type ToneStep = {
  frequency: number;
  offsetMs: number;
  durationMs: number;
  type: OscillatorType;
  gain: number;
};

const SOUND_KEY = "flashquest-sound-enabled";

const patterns: Record<GameSound, ToneStep[]> = {
  tap: [{ frequency: 330, offsetMs: 0, durationMs: 45, type: "sine", gain: 0.025 }],
  navigate: [{ frequency: 390, offsetMs: 0, durationMs: 55, type: "sine", gain: 0.025 }],
  hint: [
    { frequency: 520, offsetMs: 0, durationMs: 70, type: "sine", gain: 0.03 },
    { frequency: 660, offsetMs: 65, durationMs: 90, type: "sine", gain: 0.025 },
  ],
  reveal: [
    { frequency: 440, offsetMs: 0, durationMs: 55, type: "triangle", gain: 0.03 },
    { frequency: 620, offsetMs: 45, durationMs: 95, type: "triangle", gain: 0.028 },
  ],
  success: [
    { frequency: 523, offsetMs: 0, durationMs: 70, type: "sine", gain: 0.035 },
    { frequency: 659, offsetMs: 70, durationMs: 80, type: "sine", gain: 0.035 },
    { frequency: 784, offsetMs: 145, durationMs: 110, type: "sine", gain: 0.03 },
  ],
  miss: [
    { frequency: 250, offsetMs: 0, durationMs: 75, type: "triangle", gain: 0.03 },
    { frequency: 205, offsetMs: 65, durationMs: 95, type: "triangle", gain: 0.025 },
  ],
  skip: [{ frequency: 300, offsetMs: 0, durationMs: 65, type: "triangle", gain: 0.025 }],
  save: [
    { frequency: 440, offsetMs: 0, durationMs: 55, type: "sine", gain: 0.028 },
    { frequency: 587, offsetMs: 55, durationMs: 85, type: "sine", gain: 0.025 },
  ],
  publish: [
    { frequency: 392, offsetMs: 0, durationMs: 65, type: "sine", gain: 0.03 },
    { frequency: 523, offsetMs: 60, durationMs: 75, type: "sine", gain: 0.03 },
    { frequency: 659, offsetMs: 125, durationMs: 110, type: "sine", gain: 0.028 },
  ],
  combo: [
    { frequency: 523, offsetMs: 0, durationMs: 55, type: "square", gain: 0.018 },
    { frequency: 659, offsetMs: 50, durationMs: 55, type: "square", gain: 0.018 },
    { frequency: 784, offsetMs: 100, durationMs: 85, type: "square", gain: 0.016 },
  ],
  levelUp: [
    { frequency: 392, offsetMs: 0, durationMs: 65, type: "triangle", gain: 0.03 },
    { frequency: 523, offsetMs: 60, durationMs: 70, type: "triangle", gain: 0.03 },
    { frequency: 659, offsetMs: 125, durationMs: 80, type: "triangle", gain: 0.03 },
    { frequency: 784, offsetMs: 195, durationMs: 140, type: "triangle", gain: 0.027 },
  ],
  achievement: [
    { frequency: 659, offsetMs: 0, durationMs: 70, type: "sine", gain: 0.03 },
    { frequency: 784, offsetMs: 65, durationMs: 80, type: "sine", gain: 0.03 },
    { frequency: 988, offsetMs: 135, durationMs: 130, type: "sine", gain: 0.025 },
  ],
  roomJoin: [
    { frequency: 440, offsetMs: 0, durationMs: 60, type: "sine", gain: 0.025 },
    { frequency: 554, offsetMs: 55, durationMs: 90, type: "sine", gain: 0.023 },
  ],
  roundStart: [
    { frequency: 330, offsetMs: 0, durationMs: 55, type: "square", gain: 0.015 },
    { frequency: 440, offsetMs: 60, durationMs: 80, type: "square", gain: 0.015 },
  ],
  roundEnd: [
    { frequency: 440, offsetMs: 0, durationMs: 65, type: "triangle", gain: 0.025 },
    { frequency: 330, offsetMs: 60, durationMs: 90, type: "triangle", gain: 0.022 },
  ],
  complete: [
    { frequency: 523, offsetMs: 0, durationMs: 75, type: "sine", gain: 0.032 },
    { frequency: 659, offsetMs: 70, durationMs: 80, type: "sine", gain: 0.032 },
    { frequency: 784, offsetMs: 140, durationMs: 90, type: "sine", gain: 0.03 },
    { frequency: 1047, offsetMs: 220, durationMs: 180, type: "sine", gain: 0.026 },
  ],
};

function inferSound(element: HTMLElement): GameSound {
  const explicit = element.dataset.gameSound as GameSound | undefined;
  if (explicit && explicit in patterns) return explicit;

  const text = `${element.getAttribute("aria-label") ?? ""} ${element.textContent ?? ""}`.toLowerCase();
  if (text.includes("hint")) return "hint";
  if (text.includes("reveal")) return "reveal";
  if (text.includes("missed") || text.includes("wrong")) return "miss";
  if (text.includes("got it") || text.includes("correct")) return "success";
  if (text.includes("skip")) return "skip";
  if (text.includes("publish")) return "publish";
  if (text.includes("copy") || text.includes("save") || text.includes("create deck")) return "save";
  if (element.tagName === "A") return "navigate";
  return "tap";
}

function readInitialSoundPreference(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SOUND_KEY) !== "false";
}

export function GameFeelProvider({ children }: { children: ReactNode }) {
  const [soundEnabled, setSoundEnabledState] = useState(readInitialSoundPreference);
  const audioRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined" || !window.AudioContext) return null;
    if (!audioRef.current) audioRef.current = new window.AudioContext();
    return audioRef.current;
  }, []);

  const play = useCallback(
    (sound: GameSound) => {
      if (!soundEnabled) return;
      const context = getAudioContext();
      if (!context) return;

      if (context.state === "suspended") void context.resume();
      const base = context.currentTime + 0.005;
      for (const step of patterns[sound]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = base + step.offsetMs / 1000;
        const end = start + step.durationMs / 1000;

        oscillator.type = step.type;
        oscillator.frequency.setValueAtTime(step.frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(step.gain, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end + 0.01);
      }
    },
    [getAudioContext, soundEnabled]
  );

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setSoundEnabledState(enabled);
    if (typeof window !== "undefined") window.localStorage.setItem(SOUND_KEY, String(enabled));
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabledState((current) => {
      const next = !current;
      if (typeof window !== "undefined") window.localStorage.setItem(SOUND_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const interactive = target?.closest<HTMLElement>("[data-game-sound], button, a");
      if (!interactive || interactive.getAttribute("aria-disabled") === "true") return;
      if (interactive instanceof HTMLButtonElement && interactive.disabled) return;
      play(inferSound(interactive));
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [play]);

  const value = useMemo(
    () => ({ soundEnabled, setSoundEnabled, toggleSound, play }),
    [soundEnabled, setSoundEnabled, toggleSound, play]
  );

  return <GameFeelContext.Provider value={value}>{children}</GameFeelContext.Provider>;
}

export function SoundToggle() {
  const { soundEnabled, toggleSound } = useGameFeel();
  return (
    <button
      type="button"
      className="game-button game-chip flex items-center gap-2 px-3 py-2 text-xs font-black text-slate-200"
      aria-label={soundEnabled ? "Mute game sounds" : "Turn on game sounds"}
      aria-pressed={soundEnabled}
      title={soundEnabled ? "Mute FlashQuest sounds" : "Turn on FlashQuest sounds"}
      data-game-sound="tap"
      onClick={toggleSound}
    >
      <span aria-hidden="true">{soundEnabled ? "🔊" : "🔇"}</span>
      <span className="hidden xl:inline">{soundEnabled ? "Sound on" : "Sound off"}</span>
    </button>
  );
}
