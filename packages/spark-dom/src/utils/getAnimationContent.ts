import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";
import type { Animation } from "../../../spark-engine/src/game/modules/ui/types/Animation";

export const getAnimationContent = (
  animations: Record<string, Animation>
): string => {
  let textContent = "";
  Object.entries(animations).forEach(([name, animation]) => {
    let animationContent = "";
    if (animation.keyframes) {
      for (let i = 0; i < animation.keyframes.length; i++) {
        const percentage = `${(i / (animation.keyframes.length - 1)) * 100}%`;
        const engineKeyframe = animation.keyframes[i];
        const domKeyframe: Record<string, any> = {};
        if (engineKeyframe) {
          for (const [k, v] of Object.entries(engineKeyframe)) {
            const [cssProp, cssValue] = getCSSPropertyKeyValue(k, v);
            domKeyframe[cssProp] = cssValue;
          }
        }
        const properties = Object.entries(domKeyframe)
          .map(([k, v]) => `${k}: ${v};`)
          .join(" ");
        animationContent += `${percentage} { ${properties} }`;
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
