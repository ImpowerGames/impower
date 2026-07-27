import type { Animation } from "../../../spark-engine/src/game/modules/ui/types/Animation";
import { getCssEquivalent } from "../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";

/** A keyframe's authored position along the animation, 0–1, or null when it
 *  wasn't given one. Anything outside that range (or not a number) is treated
 *  as unauthored rather than emitted as a broken selector. */
const readOffset = (keyframe: unknown): number | null => {
  const raw = (keyframe as { offset?: unknown })?.offset;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1
    ? n
    : null;
};

/** Resolve every keyframe's position, honouring authored `offset`s and spacing
 *  the rest evenly BETWEEN them — the same rule the Web Animations API uses, so
 *  the CSS a keyframe list compiles to matches what the engine's own
 *  `AnimationPlayer` does with the identical list.
 *
 *  Previously the position came from the array index alone, so an authored
 *  `offset` did nothing AND fell through to the declaration loop, emitting a
 *  literal `offset: 0.75` (a real CSS property — the motion-path shorthand)
 *  into the keyframe. */
const resolveOffsets = (keyframes: readonly unknown[]): number[] => {
  const max = keyframes.length - 1;
  if (max <= 0) {
    return [readOffset(keyframes[0]) ?? 1];
  }
  const authored = keyframes.map(readOffset);
  // The first and last keyframes anchor the range when left unauthored.
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
    // A single keyframe authored as `keyframes = { transform = ... }` compiles
    // to an object, not an array — and an object's `length` is `undefined`, so
    // the loop below used to run zero times and silently emit no `@keyframes`
    // (the animation then did nothing). Normalize a lone keyframe object into a
    // one-element array so it still produces a `to { … }` keyframe.
    const keyframes = Array.isArray(animation.keyframes)
      ? animation.keyframes
      : animation.keyframes
        ? [animation.keyframes]
        : [];
    if (keyframes.length) {
      const offsets = resolveOffsets(keyframes);
      const max = keyframes.length - 1;
      for (let i = 0; i < keyframes.length; i++) {
        // A lone keyframe still emits `to`, so it reads as the end state it is.
        const offset =
          max === 0 ? "to" : `${Number((offsets[i]! * 100).toFixed(4))}%`;
        const engineKeyframe = keyframes[i];
        const domKeyframe: Record<string, any> = {};
        if (engineKeyframe) {
          for (const [k, v] of Object.entries(engineKeyframe)) {
            // `offset` positions the keyframe — it is not a declaration inside
            // it. Emitting it would set the CSS motion-path shorthand.
            if (k === "offset") {
              continue;
            }
            const [cssProp, cssValue] = getCSSPropertyKeyValue(k, v);
            const cssEntries = getCssEquivalent(cssProp, cssValue);
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
