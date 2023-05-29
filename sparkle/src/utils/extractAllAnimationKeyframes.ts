import getCssDurationMS from "../../../sparkle-style-transformer/src/utils/getCssDurationMS";

export const extractAllAnimationKeyframes = (
  ...sheets: CSSStyleSheet[]
): Record<
  string,
  {
    keyframes: Keyframe[];
    options?: KeyframeAnimationOptions;
  }
> => {
  const prop = "offset";
  const result: Record<
    string,
    {
      keyframes: Keyframe[];
      options?: KeyframeAnimationOptions;
    }
  > = {};
  for (let i = 0; i < sheets.length; i += 1) {
    const s = sheets[i];
    if (s?.cssRules) {
      for (let r = 0; r < s.cssRules.length; r += 1) {
        const rule = s.cssRules[r];
        if (rule instanceof CSSKeyframesRule) {
          if (rule.cssRules && !rule.cssText.startsWith("@-webkit-")) {
            const name = rule.name;
            result[name] ??= { keyframes: [] };
            const animation = result[name];
            if (animation) {
              for (let k = 0; k < rule.cssRules.length; k += 1) {
                const keyframeRule = rule.cssRules[k] as CSSKeyframeRule;
                const steps = (keyframeRule?.keyText || "")
                  .split(", ")
                  .map(
                    (v) => parseFloat(v) / (String(v).includes("%") ? 100 : 1)
                  );
                const cssArr = Object.entries(keyframeRule.style).filter(
                  (x) =>
                    x[1] != "" &&
                    !x[0].startsWith("webkit") &&
                    isNaN(parseInt(x[0]))
                ) as ["offset", "offset"][];
                steps.forEach((sk) => {
                  animation.keyframes.push(
                    Object.fromEntries([[prop, sk]].concat(cssArr))
                  );
                });
              } //get ordered frames and merge those with the same offset
              animation.keyframes = animation.keyframes
                .reduce((a, b) => {
                  let obj = a.filter((x) => x[prop] == b[prop])[0];
                  if (!obj) {
                    a.push(b);
                  } else {
                    for (let k in b) {
                      obj[k] = b[k];
                    }
                  } //bottom rules overwrite top ones like in CSS
                  return a;
                }, [] as Keyframe[])
                .sort((a, b) => (a[prop] as number) - (b[prop] as number));
            }
          }
        } else if (rule instanceof CSSStyleRule) {
          Array.from(rule.style).forEach((key) => {
            if (key.startsWith("--s-animation-")) {
              const value = rule.style.getPropertyValue(key);
              const [name, duration, easing, iterations, delay] = value
                .trim()
                .split(" ");
              if (name) {
                result[name] ??= { keyframes: [] };
                const animation = result[name];
                if (animation) {
                  if (!animation.options) {
                    animation.options = {};
                  }
                  if (duration) {
                    animation.options.duration = getCssDurationMS(duration, 0);
                  }
                  if (easing) {
                    animation.options.easing = easing;
                  }
                  if (iterations) {
                    animation.options.iterations =
                      iterations === "infinite" ? Infinity : Number(iterations);
                  }
                  if (delay) {
                    animation.options.delay = getCssDurationMS(delay, 0);
                  }
                }
              }
            }
          });
        }
      }
    }
  }
  return result;
};
