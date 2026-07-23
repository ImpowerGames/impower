import type { Animation } from "../../../spark-engine/src/game/modules/ui/types/Animation";
import { getCssEquivalent } from "../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";

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
      for (let i = 0; i < keyframes.length; i++) {
        const max = keyframes.length - 1;
        const offset = max === 0 ? "to" : `${(i / max) * 100}%`;
        const engineKeyframe = keyframes[i];
        const domKeyframe: Record<string, any> = {};
        if (engineKeyframe) {
          for (const [k, v] of Object.entries(engineKeyframe)) {
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
