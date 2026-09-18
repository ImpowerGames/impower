import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

const BLINK = `morph blink with
  blend = morph
  method = bend
  fallback = fade

  layers:
    creases:
      fallback = scale

  keyframes:
    0%:
      eyes:
        state = eyes.open
      eyebrows:
        translate = 0 0
    33.333%:
      eyes:
        state = eyes.closed
      eyebrows:
        translate = 0 8px
    100%:
      eyes:
        state = eyes.open
      eyebrows:
        translate = 0 0

  timing:
    duration = 0.25
    easing = steps(3)
    iterations = infinite
    iteration_delay_min = 0.2
    iteration_delay_max = 6

  clips:
    -
      between:
        - eyelash-left
      targets:
        - eyeball-white-left
        - pupil-left
    - between:
        - eyelash-right
      targets:
        - pupil-right
end
`;

describe("formatting a morph block", () => {
  test("a valid example round-trips unchanged", () => {
    expect(formatSource(BLINK)).toBe(BLINK);
  });

  test("an inheriting morph round-trips unchanged", () => {
    const source = `morph slow as blink with
  timing:
    duration = 1
end
`;
    expect(formatSource(source)).toBe(source);
  });

  test("mis-indented nesting is normalized to two spaces per level", () => {
    expect(
      formatSource(`morph blink with
     method = match
     keyframes:
          from:
                eyes:
                      state = open
          to:
                eyes:
                      state = closed
end
`),
    ).toBe(`morph blink with
  method = match
  keyframes:
    from:
      eyes:
        state = open
    to:
      eyes:
        state = closed
end
`);
  });
});
