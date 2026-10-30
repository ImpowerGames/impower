import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a body written with brace blocks", () => {
  test("well-formed source round-trips unchanged", () => {
    const source = `style button with
  cursor = pointer
  &.secondary { background-color = slate_50 }
  @hovered, @pressed {
    background-color = sky_50
  }
end

animation fade with
  keyframes {
    from { opacity = 0 }
    to { opacity = 1 }
  }
  timing = {
    duration = 0.4,
    easing = ease-in-out,
  }
end

morph blink with
  method = bend
  keyframes {
    { offset = 0; eyes { state = eyes.open } }
    { offset = 0.4; eyes { state = eyes.closed } }
  }
  clips {
    { between { eyelash-left }; targets { eyeball-white-left; pupil-left } }
  }
end
`;
    expect(formatSource(source)).toBe(source);
  });

  test("lines inside a block indent by its braces, and the lines after it keep their level", () => {
    const source = `animation fade with
      keyframes {
from { opacity = 0 }
          to {
   opacity = 1
        }
  }
  timing={duration=1;delay = 2,}
end
`;
    expect(formatSource(source)).toBe(`animation fade with
  keyframes {
    from { opacity = 0 }
    to {
      opacity = 1
    }
  }
  timing = { duration=1; delay = 2, }
end
`);
  });
});
