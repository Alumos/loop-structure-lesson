import { initialFrame, levels, simulate, type Snapshot } from "./engine";

// Persist learning decisions, not animation frames or mouse samples.
export function compactSnapshot(s: Snapshot): Snapshot {
  const out: Snapshot = { activity: s.activity };
  const keys: (keyof Snapshot)[] = s.activity.startsWith("l")
    ? ["plan", "prediction", "explanation", "result", "hint", "operator"]
    : s.activity.startsWith("q")
      ? ["answers", "note", "selectedStudent", "operator"]
      : s.activity === "challenge"
        ? ["challenge", "result", "explanation", "operator"]
        : ["selfReview", "explanation", "operator"];
  for (const key of keys) if (s[key] !== undefined) (out as any)[key] = s[key];
  return out;
}
export function restoreSnapshot(s: Snapshot): Snapshot {
  if (s.frame || !s.plan) return s;
  const l = levels.find((l) => l.id === s.activity);
  if (!l) return s;
  let frame = initialFrame(l);
  if (s.result) {
    try {
      const frames = simulate(l.id, s.plan).frames;
      frame = frames[frames.length - 1] || frame;
    } catch {
      /* Old invalid plans still show their recorded text. */
    }
  }
  return { ...s, frame, running: false };
}
export function keepHistory(
  kind: string,
  s: Snapshot,
  previous: Snapshot | null,
): boolean {
  if (kind === "edit")
    return s.activity.startsWith("l")
      ? JSON.stringify(s.plan) !== JSON.stringify(previous?.plan)
      : s.activity === "challenge" &&
          JSON.stringify(s.challenge) !== JSON.stringify(previous?.challenge);
  if (kind === "predict")
    return !!s.prediction && s.prediction !== previous?.prediction;
  return ["run", "result", "help"].includes(kind);
}
