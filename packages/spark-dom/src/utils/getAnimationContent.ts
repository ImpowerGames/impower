import type { Animation } from "../../../spark-engine/src/game/modules/ui/types/Animation";
import { getCssEquivalent } from "../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { getCssTokenValue } from "./getCssTokenValue";

const readOffset = (keyframe: unknown): number | null => {
  const raw = (keyframe as { offset?: unknown })?.offset;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1
    ? n
    : null;
};

const resolveOffsets = (keyframes: readonly unknown[]): number[] => {
  const max = keyframes.length - 1;
  if (max <= 0) {
    return [readOffset(keyframes[0]) ?? 1];
  }
  const authored = keyframes.map(readOffset);
  const resolved: (number | null)[] = [...authored];
  resolved[0] ??= 0;
  resolved[max] ??= 1;
  let anchor = 0;
  for (let i = 1; i <= max; i++) {
    if (resolved[i] == null) {
      continue;
    }
    const span = i - anchor;
    if (span > 1) {
      const from = resolved[anchor]!;
      const step = (resolved[i]! - from) / span;
      for (let j = anchor + 1; j < i; j++) {
        resolved[j] = from + step * (j - anchor);
      }
    }
    anchor = i;
  }
  return resolved as number[];
};

export const getAnimationContent = (
  animations: Record<string, Animation>,
): string => {
  let textContent = "";
  Object.entries(animations).forEach(([name, animation]) => {
    let animationContent = "";
    const keyframes = Array.isArray(animation.keyframes)
      ? animation.keyframes
      : animation.keyframes
        ? [animation.keyframes]
        : [];
    if (keyframes.length) {
      const offsets = resolveOffsets(keyframes);
      const max = keyframes.length - 1;
      for (let i = 0; i < keyframes.length; i++) {
        const offset =
          max === 0 ? "to" : `${Number((offsets[i]! * 100).toFixed(4))}%`;
        const engineKeyframe = keyframes[i];
        const domKeyframe: Record<string, any> = {};
        if (engineKeyframe) {
          for (const [k, v] of Object.entries(engineKeyframe)) {
            if (k === "offset") {
              continue;
            }
            const cssEntries = getCssEquivalent(k, getCssTokenValue(v));
            for (const [k, v] of cssEntries) {
              domKeyframe[k] = v;
            }
          }
        }
        const properties = Object.entries(domKeyframe)
          .map(([k, v]) => `${k}: ${v};`)
          .join(" ");
        animationContent += `${offset} { ${properties} }`;
        animationContent += "\n  ";
      }
    }
    if (animationContent) {
      textContent += `@keyframes ${name} {\n  ${animationContent.trimEnd()}\n}\n`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
